import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/property-helpers";
import { ArrowLeft, ShieldCheck, Info, FileCheck2, Upload } from "lucide-react";
import { toast } from "sonner";

type GuaranteeType = "fiador" | "seguro_fianca" | "caucao" | "titulo_capitalizacao";
const GUARANTEE_LABEL: Record<GuaranteeType, string> = {
  fiador: "Fiador",
  seguro_fianca: "Seguro fiança",
  caucao: "Caução",
  titulo_capitalizacao: "Título de capitalização",
};

export const Route = createFileRoute("/_authenticated/preapprovals")({
  head: () => ({ meta: [{ title: "Minhas pré-aprovações | Plataforma de Aluguel" }] }),
  component: PreapprovalsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
});

function PreapprovalsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-preapproval"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: row } = await supabase
        .from("tenant_preapprovals")
        .select("*")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return { userId: u.user.id, preapproval: row };
    },
  });

  const [income, setIncome] = useState("");
  const [guarantee, setGuarantee] = useState<GuaranteeType | "">("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.preapproval) {
      setIncome(String(data.preapproval.monthly_income));
      setGuarantee(data.preapproval.guarantee_type as GuaranteeType);
    }
  }, [data?.preapproval]);

  const incomeNum = Number(income);
  const maxRent = incomeNum > 0 ? Math.floor(incomeNum / 3) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data?.userId) return;
    if (!incomeNum || incomeNum <= 0) return toast.error("Informe sua renda");
    if (!guarantee) return toast.error("Selecione a garantia");
    setBusy(true);
    const { error } = await supabase.from("tenant_preapprovals").upsert({
      user_id: data.userId,
      monthly_income: incomeNum,
      guarantee_type: guarantee,
      max_rent: maxRent,
      status: "approved",
    }, { onConflict: "user_id" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Pré-aprovação atualizada — até ${formatBRL(maxRent)}`);
    qc.invalidateQueries({ queryKey: ["my-preapproval"] });
    qc.invalidateQueries({ queryKey: ["preapproval"] });
  }

  async function revoke() {
    if (!data?.userId) return;
    if (!confirm("Tem certeza? Sua pré-aprovação será removida e suas próximas propostas não terão o selo.")) return;
    setBusy(true);
    const { error } = await supabase.from("tenant_preapprovals").delete().eq("user_id", data.userId);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Pré-aprovação revogada");
    setIncome("");
    setGuarantee("");
    qc.invalidateQueries({ queryKey: ["my-preapproval"] });
    qc.invalidateQueries({ queryKey: ["preapproval"] });
  }


  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-[440px] min-h-screen bg-background shadow-xl">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-5 py-4 flex items-center gap-3">
          <Link to="/dashboard" className="size-9 rounded-full bg-muted flex items-center justify-center hover:bg-accent" aria-label="Voltar">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-tight flex items-center gap-2">
              <ShieldCheck className="size-4 text-sky-600" />
              Minhas pré-aprovações
            </h1>
            <p className="text-xs text-muted-foreground">Gere e atualize seu selo de crédito</p>
          </div>
        </header>

        <main className="px-5 py-5 space-y-5">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : data?.preapproval ? (
            <Card className="border-sky-200 bg-sky-50/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="size-4 text-sky-600" /> Pré-aprovação ativa
                  </CardTitle>
                  <Badge variant="secondary" className="bg-sky-100 text-sky-800 border-sky-200 capitalize">
                    {data.preapproval.status}
                  </Badge>
                </div>
                <CardDescription>
                  Anexada automaticamente às suas propostas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Row label="Renda mensal" value={formatBRL(Number(data.preapproval.monthly_income))} />
                <Row label="Aluguel máximo" value={formatBRL(Number(data.preapproval.max_rent))} bold />
                <Row label="Garantia" value={GUARANTEE_LABEL[data.preapproval.guarantee_type as GuaranteeType] ?? "—"} />
                <div className="pt-2">
                  <Button type="button" variant="ghost" size="sm" onClick={revoke} disabled={busy}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2">
                    Revogar pré-aprovação
                  </Button>
                </div>
              </CardContent>
            </Card>

          ) : (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center space-y-2">
                <ShieldCheck className="size-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Você ainda não tem uma pré-aprovação. Crie agora para destacar suas propostas.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {data?.preapproval ? "Atualizar minha renda" : "Gerar pré-aprovação"}
              </CardTitle>
              <CardDescription>
                Usamos o critério padrão do mercado: aluguel até 1/3 da renda.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label htmlFor="income">Renda mensal bruta (R$)</Label>
                  <Input id="income" type="number" min={1} step="0.01"
                    value={income} onChange={(e) => setIncome(e.target.value)} required />
                </div>
                <div>
                  <Label>Tipo de garantia preferida</Label>
                  <Select value={guarantee} onValueChange={(v) => setGuarantee(v as GuaranteeType)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(GUARANTEE_LABEL) as GuaranteeType[]).map((g) => (
                        <SelectItem key={g} value={g}>{GUARANTEE_LABEL[g]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {incomeNum > 0 && (
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm flex items-start gap-2">
                    <Info className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <span>
                      Você ficará pré-aprovado para aluguéis até <strong>{formatBRL(maxRent)}</strong>.
                    </span>
                  </div>
                )}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "Salvando..." : data?.preapproval ? "Atualizar pré-aprovação" : "Gerar pré-aprovação"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {data?.userId && data.preapproval && (
            <DocsCard
              userId={data.userId}
              row={data.preapproval as unknown as Record<string, unknown>}
              onSaved={() => qc.invalidateQueries({ queryKey: ["my-preapproval"] })}
            />
          )}

          <p className="text-xs text-muted-foreground text-center">
            Seus dados financeiros ficam visíveis apenas para você e para o proprietário do imóvel ao enviar uma proposta.
          </p>
        </main>
      </div>
    </div>
  );
}

type DocKey = "rg" | "cpf" | "income";
const DOC_LABEL: Record<DocKey, string> = {
  rg: "RG (frente e verso)",
  cpf: "CPF",
  income: "Comprovante de renda",
};
const DOC_FIELD: Record<DocKey, "rg_doc_path" | "cpf_doc_path" | "income_proof_path"> = {
  rg: "rg_doc_path",
  cpf: "cpf_doc_path",
  income: "income_proof_path",
};

function DocsCard({ userId, row, onSaved }: {
  userId: string;
  row: Record<string, unknown> | null;
  onSaved: () => void;
}) {
  const paths = {
    rg: (row?.rg_doc_path as string | null) ?? null,
    cpf: (row?.cpf_doc_path as string | null) ?? null,
    income: (row?.income_proof_path as string | null) ?? null,
  };
  const allUploaded = Boolean(paths.rg && paths.cpf && paths.income);
  const [busy, setBusy] = useState<DocKey | null>(null);

  async function upload(kind: DocKey, file: File) {
    if (file.size > 8 * 1024 * 1024) return toast.error("Arquivo > 8MB");
    setBusy(kind);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `${userId}/${kind}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("lead-documents")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setBusy(null); return toast.error(upErr.message); }

    const willBeComplete =
      (kind === "rg" || paths.rg) &&
      (kind === "cpf" || paths.cpf) &&
      (kind === "income" || paths.income);
    const next = {
      rg_doc_path: kind === "rg" ? path : paths.rg,
      cpf_doc_path: kind === "cpf" ? path : paths.cpf,
      income_proof_path: kind === "income" ? path : paths.income,
      docs_uploaded_at: willBeComplete ? new Date().toISOString() : ((row?.docs_uploaded_at as string | null) ?? null),
    };

    const { error } = await supabase
      .from("tenant_preapprovals")
      .update(next)
      .eq("user_id", userId);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`${DOC_LABEL[kind]} enviado`);
    onSaved();
  }

  return (
    <Card className={allUploaded ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileCheck2 className={`size-4 ${allUploaded ? "text-emerald-600" : "text-amber-600"}`} />
          Documentação obrigatória
        </CardTitle>
        <CardDescription>
          Necessária para enviar propostas. Apenas você e o proprietário (ao receber sua proposta) veem.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(Object.keys(DOC_LABEL) as DocKey[]).map((k) => {
          const has = Boolean(paths[k]);
          return (
            <div key={k} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
              <div className="text-sm">
                <p className="font-medium">{DOC_LABEL[k]}</p>
                <p className="text-xs text-muted-foreground">
                  {has ? "Enviado ✓" : "Pendente"}
                </p>
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={busy !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(k, f);
                    e.target.value = "";
                  }}
                />
                <span className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent">
                  <Upload className="size-3.5" />
                  {busy === k ? "Enviando…" : has ? "Substituir" : "Enviar"}
                </span>
              </label>
            </div>
          );
        })}
        {!allUploaded && (
          <p className="text-xs text-amber-800">
            Suas propostas ficarão bloqueadas até os 3 documentos serem enviados.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
