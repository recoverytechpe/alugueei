import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Building2, User, Briefcase, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const TERMS_VERSION = "2026-06-27";
const PRIVACY_VERSION = "2026-06-27";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Complete seu cadastro | Alugueei" }] }),
  component: OnboardingWizard,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Não encontrado</div>,
});

type UserType = "locador" | "locatario" | "agente";

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Informe seu nome completo").max(120),
  phone: z
    .string()
    .trim()
    .min(8, "Telefone inválido")
    .max(20, "Telefone muito longo")
    .regex(/^[0-9()+\-\s]+$/, "Use apenas números, espaços, +, -, ( e )"),
  cpf_cnpj: z
    .string()
    .trim()
    .min(11, "CPF/CNPJ inválido")
    .max(20, "CPF/CNPJ muito longo"),
  bio: z.string().trim().max(400, "Bio muito longa (máx. 400)").optional(),
});

function OnboardingWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile-onboarding"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada");
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, bio, user_type, onboarded_at")
        .eq("id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      return { uid: u.user.id, profile: data };
    },
  });

  const [step, setStep] = useState(1);
  const [userType, setUserType] = useState<UserType | null>(
    (profile?.profile?.user_type as UserType | null) ?? null,
  );
  const [form, setForm] = useState({
    full_name: profile?.profile?.full_name ?? "",
    phone: "",
    cpf_cnpj: "",
    bio: profile?.profile?.bio ?? "",
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

  useEffect(() => {
    const loadedProfile = profile?.profile;
    if (!loadedProfile) return;
    setUserType((current) => current ?? (loadedProfile.user_type as UserType | null));
    setForm((current) => ({
      ...current,
      full_name: current.full_name || loadedProfile.full_name || "",
      bio: current.bio || loadedProfile.bio || "",
    }));
  }, [profile?.profile]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profile?.uid) throw new Error("Sessão expirada");
      if (!userType) throw new Error("Selecione o tipo de usuário");
      if (!acceptTerms || !acceptPrivacy) {
        throw new Error("Você precisa aceitar os Termos e a Política de Privacidade");
      }
      const parsed = profileSchema.parse(form);
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: parsed.full_name,
          phone: parsed.phone,
          cpf_cnpj: parsed.cpf_cnpj,
          bio: parsed.bio ?? null,
          user_type: userType,
          onboarded_at: now,
          terms_accepted_at: now,
          terms_version: TERMS_VERSION,
          privacy_accepted_at: now,
          privacy_version: PRIVACY_VERSION,
        })
        .eq("id", profile.uid);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cadastro concluído!");
      qc.invalidateQueries({ queryKey: ["my-profile-onboarding"] });
      qc.invalidateQueries({ queryKey: ["onboarding-status"] });
      navigate({ to: "/dashboard" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Complete seu cadastro</h1>
        <p className="text-sm text-muted-foreground">
          Etapa {step} de {totalSteps}
        </p>
        <Progress value={progress} className="h-2" />
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Como você vai usar a plataforma?</CardTitle>
            <CardDescription>Isso personaliza sua experiência.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                { id: "locatario", label: "Quero alugar um imóvel", icon: User },
                { id: "locador", label: "Quero anunciar meu imóvel", icon: Building2 },
                { id: "agente", label: "Sou agente / corretor", icon: Briefcase },
              ] as { id: UserType; label: string; icon: typeof User }[]
            ).map((opt) => {
              const Icon = opt.icon;
              const active = userType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setUserType(opt.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border p-4 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <Icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
                  <span className="font-medium">{opt.label}</span>
                </button>
              );
            })}
            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(2)} disabled={!userType}>
                Continuar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Seus dados</CardTitle>
            <CardDescription>Usaremos para gerar contratos e contato entre as partes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nome completo *</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                maxLength={120}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone (WhatsApp) *</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 99999-9999"
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf_cnpj">CPF/CNPJ *</Label>
                <Input
                  id="cpf_cnpj"
                  value={form.cpf_cnpj}
                  onChange={(e) => setForm((f) => ({ ...f, cpf_cnpj: e.target.value }))}
                  maxLength={20}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Sobre você (opcional)</Label>
              <Textarea
                id="bio"
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                maxLength={400}
                rows={3}
              />
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button onClick={() => setStep(3)}>
                Continuar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              Termos e Privacidade
            </CardTitle>
            <CardDescription>
              Para usar a plataforma, você precisa aceitar nossos termos e a política de privacidade (LGPD).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={acceptTerms}
                  onCheckedChange={(v) => setAcceptTerms(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-relaxed">
                  Li e aceito os{" "}
                  <Link to="/terms" target="_blank" className="underline text-primary">
                    Termos de Uso
                  </Link>{" "}
                  (versão {TERMS_VERSION}).
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={acceptPrivacy}
                  onCheckedChange={(v) => setAcceptPrivacy(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-relaxed">
                  Li e concordo com a{" "}
                  <Link to="/privacy" target="_blank" className="underline text-primary">
                    Política de Privacidade
                  </Link>{" "}
                  e autorizo o tratamento dos meus dados pessoais conforme a LGPD (versão {PRIVACY_VERSION}).
                </span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Você pode revogar o consentimento a qualquer momento solicitando a exclusão da conta em
              privacidade@alugueei.com.br.
            </p>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Voltar
              </Button>
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending || !acceptTerms || !acceptPrivacy}
              >
                {save.isPending ? "Salvando..." : "Aceitar e concluir"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
