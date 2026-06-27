import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getSignedAvatarUrl, ROLE_LABEL } from "@/lib/profile-helpers";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Meu perfil | Plataforma de Aluguel" }] }),
  component: ProfilePage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
});

const schema = z.object({
  full_name: z.string().trim().min(2, "Nome muito curto").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  cpf_cnpj: z.string().trim().max(40).optional().or(z.literal("")),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
});

function ProfilePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, avatar_url, bio, user_type, preferred_city, onboarded_at")
          .eq("id", u.user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      const avatar = await getSignedAvatarUrl(profile?.avatar_url);
      return { userId: u.user.id, email: u.user.email, profile, role: roles?.[0]?.role, avatar };
    },
  });

  const { data: unlocks } = useQuery({
    queryKey: ["me", "unlocks"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data } = await supabase
        .from("property_unlocks")
        .select("id, status, amount_cents, paid_at, expires_at, created_at, property_id, properties(title, city, state)")
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const [form, setForm] = useState({ full_name: "", phone: "", cpf_cnpj: "", bio: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (data?.profile) {
      setForm({
        full_name: data.profile.full_name ?? "",
        phone: "",
        cpf_cnpj: "",
        bio: (data.profile as { bio?: string }).bio ?? "",
      });
    }
  }, [data?.profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || null,
      cpf_cnpj: parsed.data.cpf_cnpj || null,
      bio: parsed.data.bio || null,
    }).eq("id", data.userId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
    qc.invalidateQueries({ queryKey: ["me"] });
  }

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !data) return;
    if (file.size > 3 * 1024 * 1024) return toast.error("Imagem deve ter até 3MB");
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${data.userId}/avatar-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (up.error) { setUploading(false); return toast.error(up.error.message); }
    const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", data.userId);
    setUploading(false);
    if (error) return toast.error(error.message);
    toast.success("Foto atualizada");
    qc.invalidateQueries({ queryKey: ["me"] });
  }

  if (isLoading || !data) {
    return <div className="p-8 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full max-w-2xl" /></div>;
  }

  return (
    <div className="bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Meu perfil</h1>
        <Button asChild variant="outline" size="sm">
          <Link to="/users/$id" params={{ id: data.userId }}>Ver perfil público</Link>
        </Button>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Foto e identidade</CardTitle>
            <CardDescription>
              {ROLE_LABEL[data.role ?? ""] ?? "Usuário"} · {data.email}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              {data.avatar && <AvatarImage src={data.avatar} alt={form.full_name} />}
              <AvatarFallback>{form.full_name.slice(0, 2).toUpperCase() || "?"}</AvatarFallback>
            </Avatar>
            <div>
              <Input type="file" accept="image/*" onChange={onAvatar} disabled={uploading} />
              <p className="text-xs text-muted-foreground mt-1">PNG ou JPG, até 3MB.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Dados</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Nome completo</Label>
                <Input id="full_name" autoComplete="name" autoCapitalize="words" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
                  <Input id="cpf_cnpj" inputMode="numeric" value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bio">Bio pública</Label>
                <Textarea id="bio" rows={4} maxLength={500} value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="Conte um pouco sobre você. Aparece no seu perfil público." />
              </div>
              <Button type="submit" disabled={saving} className="w-full sm:w-auto h-11">{saving ? "Salvando..." : "Salvar"}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Histórico de desbloqueios</CardTitle>
            <CardDescription>Imóveis cujos contatos você liberou.</CardDescription>
          </CardHeader>
          <CardContent>
            {!unlocks || unlocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Você ainda não desbloqueou nenhum imóvel.</p>
            ) : (
              <ul className="divide-y">
                {unlocks.map((u) => {
                  const p = u.properties as { title?: string; city?: string; state?: string } | null;
                  const expired = u.expires_at && new Date(u.expires_at) < new Date();
                  const label =
                    u.status === "refunded" ? "Reembolsado"
                    : u.status === "paid" && expired ? "Expirado"
                    : u.status === "paid" ? "Ativo"
                    : u.status === "pending" ? "Pendente"
                    : u.status;
                  return (
                    <li key={u.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <Link
                          to="/properties/$id"
                          params={{ id: u.property_id }}
                          className="font-medium truncate block hover:underline"
                        >
                          {p?.title ?? "Imóvel"}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {p?.city}{p?.state ? `/${p.state}` : ""} ·{" "}
                          {u.paid_at ? `Pago em ${new Date(u.paid_at).toLocaleDateString("pt-BR")}` : `Criado em ${new Date(u.created_at).toLocaleDateString("pt-BR")}`}
                          {u.expires_at && u.status === "paid" && !expired ? ` · expira ${new Date(u.expires_at).toLocaleDateString("pt-BR")}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium">R$ {(u.amount_cents / 100).toFixed(2).replace(".", ",")}</p>
                        <p className={`text-xs ${u.status === "paid" && !expired ? "text-emerald-600" : "text-muted-foreground"}`}>{label}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
