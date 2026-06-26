import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/property-helpers";
import { ShieldCheck, MessageSquareReply } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";


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
  created_at: string;
  properties: PropertyRef;
  tenant_preapproval_income: number | null;
  tenant_preapproval_max_rent: number | null;
  tenant_preapproval_guarantee: string | null;
};
type Counter = {
  id: string; proposal_id: string; author_id: string;
  rent_offer: number; term_months: number; start_date: string;
  message: string; status: string; created_at: string;
};


function NegotiationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["negotiations"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const [{ data: visits }, { data: proposals }, { data: counters }] = await Promise.all([
        supabase.from("visits").select("*, properties(id,title)").order("scheduled_at", { ascending: false }),
        supabase.from("proposals").select("*, properties(id,title)").order("created_at", { ascending: false }),
        supabase.from("proposal_counters").select("*").order("created_at", { ascending: true }),
      ]);
      return {
        userId: u.user.id,
        visits: (visits ?? []) as unknown as Visit[],
        proposals: (proposals ?? []) as unknown as Proposal[],
        counters: (counters ?? []) as unknown as Counter[],
      };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("negotiations")
      .on("postgres_changes", { event: "*", schema: "public", table: "visits" }, () => qc.invalidateQueries({ queryKey: ["negotiations"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "proposals" }, () => qc.invalidateQueries({ queryKey: ["negotiations"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "proposal_counters" }, () => qc.invalidateQueries({ queryKey: ["negotiations"] }))
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
        <VisitsSection visits={data.visits} userId={data.userId} setVisitStatus={setVisitStatus} />
        <ProposalsSection
          proposals={data.proposals}
          counters={data.counters}
          userId={data.userId}
          setProposalStatus={setProposalStatus}
        />
      </main>
    </div>
  );
}

type VisitFilter = "all" | "requested" | "confirmed" | "done" | "cancelled";

function VisitsSection({
  visits,
  userId,
  setVisitStatus,
}: {
  visits: Visit[];
  userId: string;
  setVisitStatus: (id: string, status: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<VisitFilter>("all");
  const counts = useMemo(() => ({
    all: visits.length,
    requested: visits.filter((v) => v.status === "requested").length,
    confirmed: visits.filter((v) => v.status === "confirmed").length,
    done: visits.filter((v) => v.status === "done").length,
    cancelled: visits.filter((v) => v.status === "cancelled").length,
  }), [visits]);
  const visible = useMemo(
    () => filter === "all" ? visits : visits.filter((v) => v.status === filter),
    [visits, filter],
  );

  const tabs: { key: VisitFilter; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "requested", label: "Solicitadas" },
    { key: "confirmed", label: "Confirmadas" },
    { key: "done", label: "Realizadas" },
    { key: "cancelled", label: "Canceladas" },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Visitas</h2>
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
      {visible.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma visita.</p>}
      {visible.map((v) => (
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
            {userId === v.owner_id && v.status === "requested" && (
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
  );
}

type ProposalFilter = "all" | "pending" | "accepted" | "rejected";
type ProposalSort = "date_desc" | "date_asc" | "value_desc" | "value_asc";

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
  const [sort, setSort] = useState<ProposalSort>("date_desc");
  const counts = useMemo(() => ({
    all: proposals.length,
    pending: proposals.filter((p) => p.status === "pending").length,
    accepted: proposals.filter((p) => p.status === "accepted").length,
    rejected: proposals.filter((p) => p.status === "rejected" || p.status === "withdrawn").length,
  }), [proposals]);
  const visible = useMemo(() => {
    let list = proposals;
    if (filter === "rejected") list = list.filter((p) => p.status === "rejected" || p.status === "withdrawn");
    else if (filter !== "all") list = list.filter((p) => p.status === filter);
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "date_asc": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "value_desc": return Number(b.rent_offer) - Number(a.rent_offer);
        case "value_asc": return Number(a.rent_offer) - Number(b.rent_offer);
        case "date_desc":
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return sorted;
  }, [proposals, filter, sort]);

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
        <div className="flex items-center gap-2 flex-wrap">
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
          <Select value={sort} onValueChange={(v) => setSort(v as ProposalSort)}>
            <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Mais recentes</SelectItem>
              <SelectItem value="date_asc">Mais antigas</SelectItem>
              <SelectItem value="value_desc">Maior valor</SelectItem>
              <SelectItem value="value_asc">Menor valor</SelectItem>
            </SelectContent>
          </Select>
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
                      {userId === p.tenant_id ? "Sua pré-aprovação anexada" : "Locatário pré-aprovado"}
                      {" "}até <strong>{formatBRL(Number(p.tenant_preapproval_max_rent))}</strong>
                      {p.tenant_preapproval_income && userId !== p.tenant_id
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
