import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { ShieldCheck, MessageSquareReply, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";


type NegSearch = { focus?: "visits" | "proposals"; status?: string };

export const Route = createFileRoute("/_authenticated/negotiations")({
  head: () => ({ meta: [{ title: "Negociações | Plataforma de Aluguel" }] }),
  validateSearch: (raw: Record<string, unknown>): NegSearch => {
    const focus = raw.focus === "visits" || raw.focus === "proposals" ? raw.focus : undefined;
    const status = typeof raw.status === "string" ? raw.status : undefined;
    return { focus, status };
  },
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
  const navigate = useNavigate();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
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
    if (error) { toast.error(error.message); return; }
    if (status !== "accepted") {
      toast.success("Proposta atualizada");
      await qc.invalidateQueries({ queryKey: ["negotiations"] });
      return;
    }

    setAcceptingId(id);
    const loadingToast = toast.loading("Gerando contrato…");
    try {
      let contractId: string | null = null;
      for (let i = 0; i < 8; i++) {
        const { data: c } = await supabase
          .from("rental_contracts")
          .select("id")
          .eq("proposal_id", id)
          .maybeSingle();
        if (c?.id) { contractId = c.id; break; }
        await new Promise((r) => setTimeout(r, 500));
      }
      await qc.invalidateQueries({ queryKey: ["negotiations"] });
      toast.dismiss(loadingToast);
      if (contractId) {
        navigate({ to: "/contracts/$id", params: { id: contractId } });
      } else {
        toast.warning("Proposta aceita, mas o contrato ainda não apareceu.", {
          action: { label: "Ver contratos", onClick: () => navigate({ to: "/contracts" }) },
        });
      }
    } finally {
      setAcceptingId(null);
    }
  }

  if (isLoading || !data) {
    return <div className="p-8 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full max-w-2xl" /></div>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">Negociações</h1>
        <p className="text-xs text-muted-foreground">Visitas, propostas e contrapropostas</p>
      </div>
      <VisitsSection visits={data.visits} userId={data.userId} setVisitStatus={setVisitStatus} />
      <ProposalsSection
        proposals={data.proposals}
        counters={data.counters}
        userId={data.userId}
        setProposalStatus={setProposalStatus}
        acceptingId={acceptingId}
      />
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
  counters,
  userId,
  setProposalStatus,
  acceptingId,
}: {
  proposals: Proposal[];
  counters: Counter[];
  userId: string;
  setProposalStatus: (id: string, status: "accepted" | "rejected" | "withdrawn") => Promise<void>;
  acceptingId: string | null;
}) {
  const countersByProposal = useMemo(() => {
    const map = new Map<string, Counter[]>();
    for (const c of counters) {
      const arr = map.get(c.proposal_id) ?? [];
      arr.push(c);
      map.set(c.proposal_id, arr);
    }
    return map;
  }, [counters]);
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
        <ProposalCard
          key={p.id}
          proposal={p}
          counters={countersByProposal.get(p.id) ?? []}
          userId={userId}
          setProposalStatus={setProposalStatus}
          isAccepting={acceptingId === p.id}
          anyAccepting={acceptingId !== null}
        />
      ))}
    </section>
  );
}

function ProposalCard({
  proposal: p,
  counters,
  userId,
  setProposalStatus,
  isAccepting,
  anyAccepting,
}: {
  proposal: Proposal;
  counters: Counter[];
  userId: string;
  setProposalStatus: (id: string, status: "accepted" | "rejected" | "withdrawn") => Promise<void>;
  isAccepting: boolean;
  anyAccepting: boolean;
}) {
  const isParticipant = userId === p.owner_id || userId === p.tenant_id;
  const lastCounter = counters[counters.length - 1];
  const canCounter =
    p.status === "pending" &&
    isParticipant &&
    (!lastCounter || (lastCounter.status === "pending" && lastCounter.author_id !== userId));
  const [showForm, setShowForm] = useState(false);

  async function acceptCounter(c: Counter) {
    const { error: e1 } = await supabase
      .from("proposals")
      .update({
        rent_offer: c.rent_offer,
        term_months: c.term_months,
        start_date: c.start_date,
        status: "accepted",
      })
      .eq("id", p.id);
    if (e1) { toast.error(e1.message); return; }
    await supabase.from("proposal_counters").update({ status: "superseded" }).eq("proposal_id", p.id).eq("status", "pending");
    await supabase.from("proposal_counters").update({ status: "accepted" }).eq("id", c.id);
    toast.success("Contraproposta aceita — contrato gerado");
  }

  async function rejectCounter(c: Counter) {
    const { error } = await supabase.from("proposal_counters").update({ status: "rejected" }).eq("id", c.id);
    if (error) toast.error(error.message); else toast.success("Contraproposta recusada");
  }

  return (
    <Card>
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

      {counters.length > 0 && (
        <CardContent className="pt-0 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Histórico de contrapropostas</p>
          {counters.map((c) => {
            const mine = c.author_id === userId;
            return (
              <div key={c.id} className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {mine ? "Você" : c.author_id === p.owner_id ? "Proprietário" : "Locatário"}
                    {" · "}{formatBRL(c.rent_offer)}/mês · {c.term_months} meses
                  </span>
                  <Badge variant="outline" className="capitalize text-xs">{c.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Início {new Date(c.start_date).toLocaleDateString("pt-BR")} · {new Date(c.created_at).toLocaleString("pt-BR")}
                </p>
                {c.message && <p className="text-sm whitespace-pre-wrap">{c.message}</p>}
                {c.status === "pending" && !mine && p.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => acceptCounter(c)}>Aceitar contra</Button>
                    <Button size="sm" variant="outline" onClick={() => rejectCounter(c)}>Recusar</Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      )}

      {showForm && canCounter && (
        <CardContent className="pt-0">
          <CounterForm proposal={p} userId={userId} onDone={() => setShowForm(false)} />
        </CardContent>
      )}

      <CardContent className="flex gap-2 flex-wrap">
        {p.status === "pending" && userId === p.owner_id && (
          <>
            <Button size="sm" disabled={anyAccepting} onClick={() => setProposalStatus(p.id, "accepted")}>
              {isAccepting ? (<><Loader2 className="size-4 mr-1 animate-spin" />Gerando contrato…</>) : "Aceitar"}
            </Button>
            <Button size="sm" variant="outline" disabled={anyAccepting} onClick={() => setProposalStatus(p.id, "rejected")}>Recusar</Button>
          </>
        )}
        {p.status === "pending" && userId === p.tenant_id && (
          <Button size="sm" variant="ghost" disabled={anyAccepting} onClick={() => setProposalStatus(p.id, "withdrawn")}>Retirar</Button>
        )}
        {canCounter && (
          <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)}>
            <MessageSquareReply className="size-4 mr-1" />
            {showForm ? "Cancelar" : "Contrapropor"}
          </Button>
        )}
        {p.status === "accepted" && (
          <Button asChild size="sm" variant="outline"><Link to="/contracts">Ver contrato</Link></Button>
        )}
      </CardContent>
    </Card>
  );
}

function CounterForm({ proposal, userId, onDone }: { proposal: Proposal; userId: string; onDone: () => void }) {
  const [rent, setRent] = useState(String(proposal.rent_offer));
  const [term, setTerm] = useState(String(proposal.term_months));
  const [start, setStart] = useState(proposal.start_date);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const r = Number(rent);
    const t = Number(term);
    if (!r || r <= 0) { toast.error("Valor inválido"); return; }
    if (!t || t <= 0) { toast.error("Prazo inválido"); return; }
    if (!start) { toast.error("Data inválida"); return; }
    setSaving(true);
    await supabase
      .from("proposal_counters")
      .update({ status: "superseded" })
      .eq("proposal_id", proposal.id)
      .eq("status", "pending");
    const { error } = await supabase.from("proposal_counters").insert({
      proposal_id: proposal.id,
      author_id: userId,
      rent_offer: r,
      term_months: t,
      start_date: start,
      message,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Contraproposta enviada"); onDone(); }
  }

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Aluguel (R$)</Label>
          <Input type="number" min="1" value={rent} onChange={(e) => setRent(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Prazo (meses)</Label>
          <Input type="number" min="1" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Início</Label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Mensagem (opcional)</Label>
        <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Justifique sua contraproposta" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Enviando…" : "Enviar contraproposta"}</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancelar</Button>
      </div>
    </div>
  );
}

