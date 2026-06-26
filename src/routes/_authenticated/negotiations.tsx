import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/property-helpers";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/negotiations")({
  head: () => ({ meta: [{ title: "Negociações | Plataforma de Aluguel" }] }),
  component: NegotiationsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
});

type PropertyRef = { id: string; title: string } | null;

type Visit = {
  id: string; property_id: string; owner_id: string; tenant_id: string; agent_id: string | null;
  scheduled_at: string; status: string; notes: string | null; properties: PropertyRef;
};
type Proposal = {
  id: string; property_id: string; owner_id: string; tenant_id: string; agent_id: string | null;
  rent_offer: number; term_months: number; start_date: string; message: string; status: string;
  properties: PropertyRef;
  tenant_preapproval_income: number | null;
  tenant_preapproval_max_rent: number | null;
  tenant_preapproval_guarantee: string | null;
};


function NegotiationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["negotiations"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const [{ data: visits }, { data: proposals }] = await Promise.all([
        supabase.from("visits").select("*, properties(id,title)").order("scheduled_at", { ascending: false }),
        supabase.from("proposals").select("*, properties(id,title)").order("created_at", { ascending: false }),
      ]);
      return {
        userId: u.user.id,
        visits: (visits ?? []) as unknown as Visit[],
        proposals: (proposals ?? []) as unknown as Proposal[],
      };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("negotiations")
      .on("postgres_changes", { event: "*", schema: "public", table: "visits" }, () => qc.invalidateQueries({ queryKey: ["negotiations"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "proposals" }, () => qc.invalidateQueries({ queryKey: ["negotiations"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  async function setVisitStatus(id: string, status: string) {
    const { error } = await supabase.from("visits").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Visita atualizada");
  }

  async function setProposalStatus(id: string, status: "accepted" | "rejected" | "withdrawn") {
    const { error } = await supabase.from("proposals").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success(status === "accepted" ? "Proposta aceita — contrato gerado" : "Proposta atualizada");
  }

  if (isLoading || !data) {
    return <div className="p-8 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full max-w-2xl" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Negociações</h1>
          <Button asChild variant="outline"><Link to="/dashboard">Voltar</Link></Button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Visitas</h2>
          {data.visits.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma visita.</p>}
          {data.visits.map((v) => (
            <Card key={v.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{v.properties?.title ?? "Imóvel"}</CardTitle>
                  <CardDescription>{new Date(v.scheduled_at).toLocaleString("pt-BR")}</CardDescription>
                </div>
                <Badge variant="secondary" className="capitalize">{v.status}</Badge>
              </CardHeader>
              {v.notes && <CardContent className="text-sm">{v.notes}</CardContent>}
              <CardContent className="flex gap-2 flex-wrap">
                {data.userId === v.owner_id && v.status === "requested" && (
                  <Button size="sm" onClick={() => setVisitStatus(v.id, "confirmed")}>Confirmar</Button>
                )}
                {v.status !== "done" && v.status !== "cancelled" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setVisitStatus(v.id, "done")}>Marcar realizada</Button>
                    <Button size="sm" variant="ghost" onClick={() => setVisitStatus(v.id, "cancelled")}>Cancelar</Button>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </section>

        <ProposalsSection
          proposals={data.proposals}
          userId={data.userId}
          setProposalStatus={setProposalStatus}
        />
      </main>
    </div>
  );
}

type ProposalFilter = "all" | "pending" | "accepted" | "rejected";

function ProposalsSection({
  proposals,
  userId,
  setProposalStatus,
}: {
  proposals: Proposal[];
  userId: string;
  setProposalStatus: (id: string, status: "accepted" | "rejected" | "withdrawn") => Promise<void>;
}) {
  const [filter, setFilter] = useState<ProposalFilter>("all");
  const counts = useMemo(() => ({
    all: proposals.length,
    pending: proposals.filter((p) => p.status === "pending").length,
    accepted: proposals.filter((p) => p.status === "accepted").length,
    rejected: proposals.filter((p) => p.status === "rejected" || p.status === "withdrawn").length,
  }), [proposals]);
  const visible = useMemo(() => {
    if (filter === "all") return proposals;
    if (filter === "rejected") return proposals.filter((p) => p.status === "rejected" || p.status === "withdrawn");
    return proposals.filter((p) => p.status === filter);
  }, [proposals, filter]);

  const tabs: { key: ProposalFilter; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "pending", label: "Pendentes" },
    { key: "accepted", label: "Aceitas" },
    { key: "rejected", label: "Recusadas" },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Propostas</h2>
        <div className="flex gap-1 flex-wrap">
          {tabs.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={filter === t.key ? "default" : "outline"}
              onClick={() => setFilter(t.key)}
            >
              {t.label} <span className="ml-1 text-xs opacity-70">({counts[t.key]})</span>
            </Button>
          ))}
        </div>
      </div>
      {visible.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma proposta.</p>}
      {visible.map((p) => (
            <Card key={p.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{p.properties?.title ?? "Imóvel"}</CardTitle>
                  <CardDescription>
                    {formatBRL(p.rent_offer)} / mês · {p.term_months} meses · início {new Date(p.start_date).toLocaleDateString("pt-BR")}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="capitalize">{p.status}</Badge>
              </CardHeader>
              {p.message && <CardContent className="text-sm whitespace-pre-wrap">{p.message}</CardContent>}
              {p.tenant_preapproval_max_rent != null && (
                <CardContent className="pt-0">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                    <ShieldCheck className="size-4 shrink-0" />
                    <span>
                      {data.userId === p.tenant_id ? "Sua pré-aprovação anexada" : "Locatário pré-aprovado"}
                      {" "}até <strong>{formatBRL(Number(p.tenant_preapproval_max_rent))}</strong>
                      {p.tenant_preapproval_income && data.userId !== p.tenant_id
                        ? ` · renda ${formatBRL(Number(p.tenant_preapproval_income))}`
                        : ""}
                    </span>
                  </div>
                </CardContent>
              )}

              <CardContent className="flex gap-2 flex-wrap">

                {p.status === "pending" && userId === p.owner_id && (
                  <>
                    <Button size="sm" onClick={() => setProposalStatus(p.id, "accepted")}>Aceitar</Button>
                    <Button size="sm" variant="outline" onClick={() => setProposalStatus(p.id, "rejected")}>Recusar</Button>
                  </>
                )}
                {p.status === "pending" && userId === p.tenant_id && (
                  <Button size="sm" variant="ghost" onClick={() => setProposalStatus(p.id, "withdrawn")}>Retirar</Button>
                )}
                {p.status === "accepted" && (
                  <Button asChild size="sm" variant="outline"><Link to="/contracts">Ver contrato</Link></Button>
                )}
              </CardContent>
            </Card>
          ))}
    </section>
  );
}
