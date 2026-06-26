import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { Download, CreditCard, CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";
import { createMpPreference } from "@/lib/payments.functions";

export const Route = createFileRoute("/_authenticated/contracts/$id")({
  head: () => ({ meta: [{ title: "Contrato | Plataforma de Aluguel" }] }),
  component: ContractDetail,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Contrato não encontrado</div>,
});

type Signature = { id: string; signer_id: string; signer_role: string; signature_text: string; signed_at: string };
type Payment = {
  id: string;
  amount: number;
  kind: string;
  status: string;
  provider: string;
  provider_payment_id: string | null;
  preference_id: string | null;
  created_at: string;
};

function ContractDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [signatureText, setSignatureText] = useState("");
  const [signing, setSigning] = useState(false);
  const [paying, setPaying] = useState(false);
  const createPreference = useServerFn(createMpPreference);

  // Feedback do retorno do Mercado Pago via querystring (?payment=success|failure|pending)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get("payment");
    if (!p) return;
    if (p === "success") toast.success("Pagamento aprovado! Atualizando status...");
    else if (p === "pending") toast.info("Pagamento pendente de confirmação.");
    else if (p === "failure") toast.error("Pagamento não foi concluído.");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["contract", id],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { data: contract } = await supabase
        .from("rental_contracts")
        .select("*, properties(id,title)")
        .eq("id", id)
        .maybeSingle();
      const { data: sigs } = await supabase
        .from("contract_signatures")
        .select("*")
        .eq("contract_id", id);
      const { data: pays } = await supabase
        .from("payments")
        .select("*")
        .eq("contract_id", id)
        .order("created_at", { ascending: false });
      return {
        userId: u.user.id,
        contract,
        signatures: (sigs ?? []) as Signature[],
        payments: (pays ?? []) as Payment[],
      };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`contract-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contract_signatures", filter: `contract_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["contract", id] }))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rental_contracts", filter: `id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["contract", id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `contract_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["contract", id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  if (isLoading || !data) {
    return <div className="p-8 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full max-w-2xl" /></div>;
  }
  if (!data.contract) return <div className="p-8">Contrato não encontrado.</div>;

  const c = data.contract;
  const role: "owner" | "tenant" | "agent" | null =
    data.userId === c.owner_id ? "owner" :
    data.userId === c.tenant_id ? "tenant" :
    data.userId === c.agent_id ? "agent" : null;
  const mySig = data.signatures.find((s) => s.signer_id === data.userId);
  const required = 2 + (c.agent_id ? 1 : 0);

  async function sign() {
    if (!role) return;
    const text = signatureText.trim();
    if (text.length < 2) return toast.error("Digite seu nome completo para assinar");
    setSigning(true);
    const { error } = await supabase.from("contract_signatures").insert({
      contract_id: id, signer_id: data!.userId, signer_role: role, signature_text: text,
    });
    setSigning(false);
    if (error) return toast.error(error.message);
    toast.success("Assinatura registrada");
    setSignatureText("");
    qc.invalidateQueries({ queryKey: ["contract", id] });
  }

  async function payDepositAndFirstRent() {
    setPaying(true);
    try {
      const result = await createPreference({ data: { contractId: id } });
      if (result.ok) {
        window.location.href = result.initPoint;
      } else if (result.reason === "not_configured") {
        toast.info("Pagamentos via Mercado Pago ainda serão configurados.", {
          description: "A integração está pronta — falta apenas conectar a chave de API.",
        });
      } else {
        toast.error(result.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar pagamento");
    } finally {
      setPaying(false);
    }
  }

  function downloadPdf() {
    if (!data?.contract) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    const width = doc.internal.pageSize.getWidth() - margin * 2;
    const pageH = doc.internal.pageSize.getHeight();
    let y = margin;

    doc.setFont("helvetica", "bold").setFontSize(16);
    doc.text("Contrato de Locação", margin, y);
    y += 20;
    doc.setFont("helvetica", "normal").setFontSize(10);
    doc.text(`Imóvel: ${c.properties?.title ?? "—"}`, margin, y); y += 14;
    doc.text(`Status: ${c.status}`, margin, y); y += 14;
    doc.text(`Contrato ID: ${c.id}`, margin, y); y += 20;

    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.text("Termos", margin, y); y += 16;
    doc.setFont("helvetica", "normal").setFontSize(10);
    const lines = doc.splitTextToSize(c.contract_text ?? "", width);
    for (const line of lines) {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 13;
    }

    y += 10;
    if (y > pageH - margin - 60) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.text("Assinaturas eletrônicas", margin, y); y += 16;
    doc.setFont("helvetica", "normal").setFontSize(10);
    if (data.signatures.length === 0) {
      doc.text("Nenhuma assinatura registrada.", margin, y); y += 14;
    }
    for (const s of data.signatures) {
      if (y > pageH - margin - 40) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "bold");
      doc.text(`${s.signer_role.toUpperCase()}`, margin, y); y += 13;
      doc.setFont("helvetica", "normal");
      doc.text(`"${s.signature_text}"`, margin, y); y += 13;
      doc.text(`Assinado em ${new Date(s.signed_at).toLocaleString("pt-BR")}`, margin, y); y += 13;
      doc.text(`Hash: ${s.id}`, margin, y); y += 18;
    }

    doc.save(`contrato-${c.id.slice(0, 8)}.pdf`);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Contrato</h1>
            <p className="text-xs text-muted-foreground">{c.properties?.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={c.status === "closed" ? "default" : "secondary"} className="capitalize">{c.status}</Badge>
            <Button variant="outline" size="sm" onClick={downloadPdf}>
              <Download className="size-4 mr-1" /> PDF
            </Button>
            <Button asChild variant="outline" size="sm"><Link to="/contracts">Voltar</Link></Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Termos</CardTitle></CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{c.contract_text}</pre>
          </CardContent>
        </Card>

        <PaymentCard
          contract={c}
          isTenant={role === "tenant"}
          paying={paying}
          onPay={payDepositAndFirstRent}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assinaturas</CardTitle>
            <CardDescription>{data.signatures.length} de {required} partes assinaram</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.signatures.map((s) => (
              <div key={s.id} className="border rounded-md p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium capitalize">{s.signer_role}</span>
                  <span className="text-xs text-muted-foreground">{new Date(s.signed_at).toLocaleString("pt-BR")}</span>
                </div>
                <p className="italic mt-1">"{s.signature_text}"</p>
              </div>
            ))}
            {role && !mySig && c.status !== "cancelled" && (
              <div className="border-t pt-3 space-y-2">
                <Label htmlFor="sig">Assinar como {role}</Label>
                <Input id="sig" value={signatureText} onChange={(e) => setSignatureText(e.target.value)}
                  placeholder="Digite seu nome completo" maxLength={200} />
                <Button onClick={sign} disabled={signing}>{signing ? "Assinando..." : "Assinar contrato"}</Button>
              </div>
            )}
            {mySig && <p className="text-xs text-muted-foreground">Você já assinou este contrato.</p>}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

type ContractRow = {
  id: string;
  rent_value: number | null;
  deposit_value: number | null;
  payment_status: string;
  paid_at: string | null;
  payment_id: string | null;
  status: string;
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function PaymentCard({
  contract,
  isTenant,
  paying,
  onPay,
}: {
  contract: ContractRow;
  isTenant: boolean;
  paying: boolean;
  onPay: () => void;
}) {
  const rent = Number(contract.rent_value ?? 0);
  const deposit = Number(contract.deposit_value ?? rent);
  const total = rent + deposit;
  const status = contract.payment_status ?? "pending";

  const statusMeta: Record<string, { label: string; icon: typeof Clock; tone: string }> = {
    pending: { label: "Aguardando pagamento", icon: Clock, tone: "bg-muted text-muted-foreground" },
    processing: { label: "Processando", icon: Loader2, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    paid: { label: "Pago", icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    failed: { label: "Falhou", icon: AlertCircle, tone: "bg-destructive/10 text-destructive" },
    refunded: { label: "Reembolsado", icon: AlertCircle, tone: "bg-muted text-muted-foreground" },
  };
  const meta = statusMeta[status] ?? statusMeta.pending;
  const Icon = meta.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="size-4" /> Pagamento
            </CardTitle>
            <CardDescription>Caução + 1º aluguel via Mercado Pago</CardDescription>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.tone}`}>
            <Icon className={`size-3.5 ${status === "processing" ? "animate-spin" : ""}`} />
            {meta.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Caução</div>
            <div className="font-semibold mt-1">{brl(deposit)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">1º aluguel</div>
            <div className="font-semibold mt-1">{brl(rent)}</div>
          </div>
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="font-semibold mt-1 text-primary">{brl(total)}</div>
          </div>
        </div>

        {status === "paid" && contract.paid_at && (
          <p className="text-xs text-muted-foreground">
            Pago em {new Date(contract.paid_at).toLocaleString("pt-BR")}
            {contract.payment_id ? ` · ID ${contract.payment_id}` : ""}
          </p>
        )}

        {isTenant && status !== "paid" && contract.status !== "cancelled" && (
          <Button onClick={onPay} disabled={paying || rent <= 0} className="w-full sm:w-auto">
            {paying ? (
              <><Loader2 className="size-4 mr-2 animate-spin" /> Redirecionando...</>
            ) : (
              <><CreditCard className="size-4 mr-2" /> Pagar {brl(total)}</>
            )}
          </Button>
        )}
        {!isTenant && status !== "paid" && (
          <p className="text-xs text-muted-foreground">Apenas o inquilino pode iniciar o pagamento.</p>
        )}
        {rent <= 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Defina o valor do aluguel no contrato para habilitar o pagamento.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
