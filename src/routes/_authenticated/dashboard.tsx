import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Wallet, Users, Clock, RefreshCw, CheckCircle2,
  Award, TrendingUp, ShieldCheck, Star, ChevronRight, BadgeCheck, Calendar,
  Home, Settings, Bell, FileText,
} from "lucide-react";
import { PushToggle } from "@/components/PushToggle";
import { useViewAs } from "@/lib/view-as";

/**
 * Subscribes to realtime postgres_changes for the given table+filter and
 * invalidates the supplied query key whenever a change arrives. Optionally
 * surfaces a toast for notable events (INSERT or status changes).
 */
function useRealtimeNotifications(opts: {
  enabled: boolean;
  channelName: string;
  subscriptions: Array<{
    table: "proposals" | "visits" | "rental_contracts";
    filter: string;
    onEvent?: (payload: {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => void;
  }>;
  invalidateKeys: ReadonlyArray<readonly unknown[]>;
}) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!opts.enabled) return;
    const channel = supabase.channel(opts.channelName);
    for (const sub of opts.subscriptions) {
      (channel.on as unknown as (
        type: string,
        config: Record<string, unknown>,
        cb: (p: { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Record<string, unknown>; old: Record<string, unknown> }) => void,
      ) => void)(
        "postgres_changes",
        { event: "*", schema: "public", table: sub.table, filter: sub.filter },
        (payload: {
          eventType: "INSERT" | "UPDATE" | "DELETE";
          new: Record<string, unknown>;
          old: Record<string, unknown>;
        }) => {
          sub.onEvent?.(payload);
          for (const key of opts.invalidateKeys) {
            qc.invalidateQueries({ queryKey: key as unknown[] });
          }
        }
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, opts.channelName]);
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | Plataforma de Aluguel" }] }),
  component: Dashboard,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Não encontrado</div>,
});

type Role = "proprietario" | "locatario" | "agente";

function Dashboard() {
  const navigate = useNavigate();
  const viewAs = useViewAs();

  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sem sessão");
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userData.user.id)
        .maybeSingle();
      return {
        userId: userData.user.id,
        email: userData.user.email,
        profile,
      };
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/auth" });
  }

  if (isLoading || !me) {
    return (
      <div className="min-h-screen bg-background p-8 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full max-w-2xl" />
      </div>
    );
  }

  const role = viewAs.effectiveRole;
  const isAdmin = viewAs.isAdmin;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">
              {role === "proprietario" ? "Painel do Proprietário"
                : role === "agente" ? "Painel do Agente"
                : "Painel do Locatário"}
            </h1>
            <p className="text-sm text-muted-foreground">{me.profile?.full_name ?? me.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <PushToggle />
            <Button variant="outline" onClick={signOut}>Sair</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Ações rápidas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild><Link to="/properties">Ver imóveis</Link></Button>
            {(role === "proprietario" || role === "agente") && (
              <Button asChild variant="outline"><Link to="/properties/new">Cadastrar imóvel</Link></Button>
            )}
            <Button asChild variant="outline"><Link to="/profile">Meu perfil</Link></Button>
            <Button asChild variant="outline"><Link to="/contracts">Contratos</Link></Button>
            <Button asChild variant="outline"><Link to="/chat">Conversas</Link></Button>
            <Button asChild variant="outline"><Link to="/negotiations">Negociações</Link></Button>
            {isAdmin && (
              <Button asChild variant="secondary"><Link to="/admin">Moderação</Link></Button>
            )}
          </CardContent>
        </Card>

        {role === "proprietario" && <OwnerDashboard userId={me.userId} fullName={me.profile?.full_name ?? me.email ?? "Proprietário"} avatarUrl={me.profile?.avatar_url ?? null} />}
        {role === "agente" && <AgentDashboard userId={me.userId} fullName={me.profile?.full_name ?? me.email ?? "Agente"} avatarUrl={me.profile?.avatar_url ?? null} />}
        {role === "locatario" && <TenantDashboard userId={me.userId} />}

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Benefícios exclusivos da plataforma</CardTitle>
            <CardDescription>
              Seguro fiança, garantia de recebimento e proteção em caso de inadimplência
              estão disponíveis <strong>somente para transações concluídas integralmente
              pela plataforma</strong>.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

function brl(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function OwnerDashboard({ userId, fullName, avatarUrl }: { userId: string; fullName: string; avatarUrl: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["owner-dash", userId],
    queryFn: async () => {
      const [props, proposals, contracts, visits] = await Promise.all([
        supabase.from("properties").select("id, title, city, state, street, number, bedrooms, bathrooms, area_m2, rent_value, status, created_at").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("proposals").select("id, status, rent_offer, created_at").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("rental_contracts").select("id, status, rent_value, start_date, term_months, created_at, property:properties(title), tenant:profiles!rental_contracts_tenant_id_fkey(full_name)").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("visits").select("id, status, scheduled_at, notes, property:properties(title)").eq("owner_id", userId).order("scheduled_at", { ascending: true }),
      ]);
      return {
        properties: props.data ?? [],
        proposals: proposals.data ?? [],
        contracts: contracts.data ?? [],
        visits: visits.data ?? [],
      };
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });


  useRealtimeNotifications({
    enabled: true,
    channelName: `owner-dash-${userId}`,
    invalidateKeys: [["owner-dash", userId]],
    subscriptions: [
      { table: "proposals", filter: `owner_id=eq.${userId}`, onEvent: (p) => {
        if (p.eventType === "INSERT") toast.info("Nova proposta recebida");
        else if (p.eventType === "UPDATE" && p.new.status !== p.old.status) toast.info(`Proposta: ${String(p.new.status)}`);
      } },
      { table: "visits", filter: `owner_id=eq.${userId}`, onEvent: (p) => {
        if (p.eventType === "UPDATE" && p.new.status === "confirmed") toast.success("Visita confirmada");
        else if (p.eventType === "INSERT") toast.info("Nova visita agendada");
      } },
      { table: "rental_contracts", filter: `owner_id=eq.${userId}`, onEvent: (p) => {
        if (p.eventType === "UPDATE" && p.new.status !== p.old.status) toast.success(`Contrato: ${String(p.new.status)}`);
        else if (p.eventType === "INSERT") toast.success("Novo contrato gerado");
      } },
    ],
  });

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  // Next rent due: based on active/closed contracts, first day of next month
  const activeContracts = data.contracts.filter((c) => c.status === "active" || c.status === "closed");
  const now = new Date();
  const nextRent = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextRentLabel = nextRent.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  const upcomingPayments = activeContracts.length;

  const contractStatusPill = (s: string) => {
    if (s === "closed") return { cls: "bg-emerald-100 text-emerald-700", label: "Assinado" };
    if (s === "active") return { cls: "bg-blue-100 text-blue-700", label: "Em assinatura" };
    return { cls: "bg-amber-100 text-amber-700", label: "Pendente" };
  };
  const visitStatusPill = (s: string) => {
    if (s === "confirmed") return { cls: "bg-blue-100 text-blue-700", label: "Confirmada" };
    if (s === "done") return { cls: "bg-emerald-100 text-emerald-700", label: "Realizada" };
    if (s === "canceled") return { cls: "bg-muted text-muted-foreground", label: "Cancelada" };
    return { cls: "bg-amber-100 text-amber-700", label: "Agendada" };
  };
  const propStatusDot = (s: string | null) => {
    if (s === "rented") return { cls: "bg-emerald-500", text: "text-emerald-600", label: "Ocupado" };
    if (s === "available") return { cls: "bg-amber-500", text: "text-amber-600", label: "Disponível" };
    return { cls: "bg-muted-foreground", text: "text-muted-foreground", label: s ?? "—" };
  };

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="relative -mx-6 -mt-8 mb-2 bg-gradient-to-br from-blue-600 to-blue-700 px-6 pt-8 pb-16 text-white">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white/15 flex items-center justify-center">
              <Home className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold leading-tight">Proprietário</h2>
              <p className="text-sm text-white/80">{fullName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="relative h-10 w-10 rounded-full bg-white/15 flex items-center justify-center" aria-label="Notificações">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500" />
            </button>
            <div className="h-12 w-12 rounded-full bg-white overflow-hidden ring-2 ring-white/30">
              {avatarUrl ? (
                <img src={avatarUrl} alt={fullName} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold">
                  {fullName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards overlap hero */}
      <div className="grid gap-4 sm:grid-cols-2 -mt-16 relative z-10">
        <Card className="shadow-md">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Home className="h-7 w-7 text-blue-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Meus imóveis</p>
              <p className="text-3xl font-bold text-blue-700 leading-tight">{data.properties.length}</p>
              <p className="text-xs text-muted-foreground">Total cadastrado</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Calendar className="h-7 w-7 text-blue-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Próximo aluguel</p>
              <p className="text-3xl font-bold text-blue-700 leading-tight capitalize">{nextRentLabel}</p>
              <p className="text-xs text-muted-foreground">{upcomingPayments} pagamento{upcomingPayments === 1 ? "" : "s"} a receber</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Properties list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">Meus imóveis</h3>
          <Link to="/properties" className="text-sm text-primary font-medium hover:underline inline-flex items-center gap-1">
            Ver todos <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {data.properties.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhum imóvel cadastrado.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {data.properties.slice(0, 5).map((p) => {
              const dot = propStatusDot(p.status);
              return (
                <Card key={p.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-3 flex flex-col sm:flex-row gap-3">
                    <div className="h-24 sm:h-20 sm:w-28 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{p.title}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {[p.street, p.number].filter(Boolean).join(", ")}{p.city ? ` · ${p.city}/${p.state ?? ""}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.bedrooms ?? 0} quartos · {p.bathrooms ?? 0} banh. · {p.area_m2 ?? 0} m²
                      </p>
                      <div className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${dot.text}`}>
                        <span className={`h-2 w-2 rounded-full ${dot.cls}`} />
                        {dot.label}
                      </div>
                    </div>
                    <div className="flex sm:flex-col gap-2 sm:w-40">
                      <Button asChild size="sm" className="flex-1">
                        <Link to="/properties/$id" params={{ id: p.id }}>
                          <Settings className="h-4 w-4 mr-1.5" />
                          Gerenciar
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <Link to="/negotiations">
                          <Users className="h-4 w-4 mr-1.5" />
                          Leads
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent contracts + Inspections */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Contratos recentes</CardTitle>
            <Link to="/contracts" className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1">
              Ver todos <ChevronRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.contracts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contrato ainda.</p>
            ) : data.contracts.slice(0, 3).map((c) => {
              const pill = contractStatusPill(c.status);
              const prop = (c as unknown as { property: { title: string } | null }).property;
              const tenant = (c as unknown as { tenant: { full_name: string } | null }).tenant;
              const start = c.start_date ? new Date(c.start_date) : null;
              const end = start && c.term_months ? new Date(start.getFullYear(), start.getMonth() + c.term_months, start.getDate()) : null;
              const fmt = (d: Date | null) => d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
              return (
                <Link key={c.id} to="/contracts/$id" params={{ id: c.id }} className="flex items-center gap-3 pb-3 border-b last:border-b-0 last:pb-0 hover:bg-muted/30 -mx-1 px-1 rounded">
                  <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{prop?.title ?? "Imóvel"}</p>
                    <p className="text-xs text-muted-foreground truncate">{tenant?.full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{fmt(start)} – {fmt(end)}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${pill.cls}`}>
                    {pill.label}
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Vistorias</CardTitle>
            <Link to="/negotiations" className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1">
              Ver todas <ChevronRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.visits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma vistoria agendada.</p>
            ) : data.visits.slice(0, 3).map((v) => {
              const pill = visitStatusPill(v.status);
              const prop = (v as unknown as { property: { title: string } | null }).property;
              const when = v.scheduled_at ? new Date(v.scheduled_at) : null;
              return (
                <div key={v.id} className="flex items-center gap-3 pb-3 border-b last:border-b-0 last:pb-0">
                  <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Calendar className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{prop?.title ?? "Imóvel"}</p>
                    <p className="text-xs text-muted-foreground truncate">{v.notes ?? "Vistoria"}</p>
                    <p className="text-xs text-muted-foreground">
                      {when ? when.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      {when ? ` · ${when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${pill.cls}`}>
                    {pill.label}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type ReferralStatus = "Pendente" | "Em Progresso" | "Concluído";

function mapProposalStatus(s: string | null | undefined): ReferralStatus {
  if (s === "accepted" || s === "closed") return "Concluído";
  if (s === "negotiating" || s === "countered") return "Em Progresso";
  return "Pendente";
}

function StatusPill({ status }: { status: ReferralStatus }) {
  const map: Record<ReferralStatus, { cls: string; Icon: typeof Clock }> = {
    "Pendente": { cls: "bg-amber-100 text-amber-700", Icon: Clock },
    "Em Progresso": { cls: "bg-blue-100 text-blue-700", Icon: RefreshCw },
    "Concluído": { cls: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2 },
  };
  const { cls, Icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {status}
    </span>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = value >= i + 1;
        const half = !filled && value >= i + 0.5;
        return (
          <Star
            key={i}
            className={`h-5 w-5 ${filled || half ? "fill-amber-400 text-amber-400" : "text-amber-300"}`}
            strokeWidth={1.5}
          />
        );
      })}
    </div>
  );
}

function AgentDashboard({ userId, fullName, avatarUrl }: { userId: string; fullName: string; avatarUrl: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["agent-dash", userId],
    queryFn: async () => {
      const [proposals, contracts, ratingRpc, visibilityRpc] = await Promise.all([
        supabase
          .from("proposals")
          .select("id, status, rent_offer, created_at, property:properties(id, title, address_neighborhood, address_number, city)")
          .eq("agent_id", userId)
          .order("created_at", { ascending: false }),
        supabase.from("rental_contracts").select("id, status, rent_value, created_at").eq("agent_id", userId).order("created_at", { ascending: false }),
        supabase.rpc("get_agent_rating", { _agent_id: userId }),
        (supabase.rpc as unknown as (n: string, a: Record<string, string>) => Promise<{ data: Array<{ closed_deals: number; visibility_score: number }> | null }>)(
          "get_agent_visibility",
          { _agent_id: userId }
        ),
      ]);
      return {
        proposals: proposals.data ?? [],
        contracts: contracts.data ?? [],
        rating: ratingRpc.data?.[0] ?? { avg_stars: 0, total_ratings: 0 },
        visibility: visibilityRpc.data?.[0] ?? { closed_deals: 0, visibility_score: 0 },
      };
    },
  });

  useRealtimeNotifications({
    enabled: true,
    channelName: `agent-dash-${userId}`,
    invalidateKeys: [["agent-dash", userId]],
    subscriptions: [
      {
        table: "proposals",
        filter: `agent_id=eq.${userId}`,
        onEvent: (p) => {
          if (p.eventType === "UPDATE" && p.new.status !== p.old.status)
            toast.info(`Proposta: ${String(p.new.status)}`);
        },
      },
      {
        table: "rental_contracts",
        filter: `agent_id=eq.${userId}`,
        onEvent: (p) => {
          if (p.eventType === "INSERT") toast.success("Novo contrato — comissão pendente");
          else if (p.eventType === "UPDATE" && p.new.status === "closed")
            toast.success("Contrato fechado — comissão liberada");
        },
      },
    ],
  });

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const commissionRate = 0.5;
  const now = new Date();
  const earningsMonth = data.contracts
    .filter((c) => {
      if (c.status !== "closed") return false;
      const d = new Date(c.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, c) => s + Number(c.rent_value ?? 0) * commissionRate, 0);

  const activeLeads = data.proposals.filter(
    (p) => p.status === "pending" || p.status === "negotiating" || p.status === "countered",
  ).length;

  const avgStars = Number(data.rating.avg_stars ?? 0);
  const totalRatings = Number(data.rating.total_ratings ?? 0);
  const closedDeals = Number(data.visibility.closed_deals ?? 0);
  const reputationLabel =
    avgStars >= 4.5 ? "Excelente" : avgStars >= 3.5 ? "Muito Bom" : avgStars >= 2.5 ? "Bom" : "Em construção";

  return (
    <div className="space-y-6">
      {/* Welcome / identity */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Bem-vindo de volta,</p>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-bold tracking-tight">{fullName}</h2>
            <BadgeCheck className="h-6 w-6 text-blue-600 fill-blue-100" />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Finder · Ajudando pessoas a encontrar o lar perfeito
          </p>
        </div>
        <div className="h-16 w-16 rounded-full bg-muted overflow-hidden flex-shrink-0 ring-2 ring-background shadow">
          {avatarUrl ? (
            <img src={avatarUrl} alt={fullName} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-semibold">
              {fullName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Earnings + leads hero card */}
      <Card className="border-0 bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg">
        <CardContent className="p-6 grid grid-cols-2 gap-4 divide-x divide-white/20">
          <div className="flex items-center gap-4 pr-4">
            <div className="h-14 w-14 rounded-full bg-white/15 flex items-center justify-center">
              <Wallet className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-white/80">Ganhos este mês</p>
              <p className="text-2xl font-bold leading-tight">{brl(earningsMonth)}</p>
              <p className="text-xs text-emerald-200 mt-1">Comissões liberadas</p>
            </div>
          </div>
          <div className="flex items-center gap-4 pl-4">
            <div className="h-14 w-14 rounded-full bg-white/15 flex items-center justify-center">
              <Users className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-white/80">Leads ativos</p>
              <p className="text-2xl font-bold leading-tight">{activeLeads}</p>
              <Link to="/negotiations" className="text-xs text-white/90 mt-1 inline-flex items-center gap-1 hover:underline">
                Ver todos <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Referrals list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">Minhas indicações</h3>
          <Link to="/negotiations" className="text-sm text-primary font-medium hover:underline">Ver todas</Link>
        </div>
        {data.proposals.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Sem indicações ainda.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {data.proposals.slice(0, 5).map((p) => {
              const status = mapProposalStatus(p.status);
              const prop = (p as unknown as { property: { id: string; title: string; address_neighborhood: string | null; address_number: string | null; city: string | null } | null }).property;
              const dateStr = new Date(p.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
              return (
                <Card key={p.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="h-16 w-16 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{prop?.title ?? "Imóvel"}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {[prop?.address_neighborhood, prop?.city].filter(Boolean).join(", ") || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Indicado em {dateStr}
                      </p>
                    </div>
                    <StatusPill status={status} />
                    <ChevronRight className="h-5 w-5 text-muted-foreground hidden sm:block" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Reputation */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">Reputação</h3>
          <Link to="/profile" className="text-sm text-primary font-medium hover:underline">Ver detalhes</Link>
        </div>
        <Card>
          <CardContent className="p-6 grid gap-6 md:grid-cols-2 md:divide-x">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full bg-blue-50 flex items-center justify-center">
                <ShieldCheck className="h-10 w-10 text-blue-600" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-semibold text-lg">{reputationLabel}</p>
                <p className="text-4xl font-bold leading-none mt-1">{avgStars.toFixed(1)}</p>
                <div className="mt-2"><Stars value={avgStars} /></div>
                <p className="text-xs text-muted-foreground mt-2">Baseado em {totalRatings} avaliações</p>
              </div>
            </div>
            <div className="space-y-3 md:pl-6">
              <ReputationRow Icon={Award} label="Confiança dos clientes" value={`${totalRatings} avaliações`} />
              <ReputationRow Icon={Users} label="Indicações de sucesso" value={`${closedDeals} concluídas`} />
              <ReputationRow Icon={TrendingUp} label="Score de visibilidade" value={Number(data.visibility.visibility_score ?? 0).toFixed(1)} />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ReputationRow({ Icon, label, value }: { Icon: typeof Award; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-blue-600" />
      </div>
      <div>
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-sm text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

function TenantDashboard({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tenant-dash", userId],
    queryFn: async () => {
      const [proposals, contracts, visits] = await Promise.all([
        supabase.from("proposals").select("id, status, rent_offer, created_at").eq("tenant_id", userId).order("created_at", { ascending: false }),
        supabase.from("rental_contracts").select("id, status, rent_value, created_at").eq("tenant_id", userId).order("created_at", { ascending: false }),
        supabase.from("visits").select("id, status, scheduled_at").eq("tenant_id", userId),
      ]);
      return {
        proposals: proposals.data ?? [],
        contracts: contracts.data ?? [],
        visits: visits.data ?? [],
      };
    },
  });

  useRealtimeNotifications({
    enabled: true,
    channelName: `tenant-dash-${userId}`,
    invalidateKeys: [["tenant-dash", userId]],
    subscriptions: [
      {
        table: "proposals",
        filter: `tenant_id=eq.${userId}`,
        onEvent: (p) => {
          if (p.eventType === "UPDATE" && p.new.status !== p.old.status)
            toast.info(`Sua proposta: ${String(p.new.status)}`);
        },
      },
      {
        table: "visits",
        filter: `tenant_id=eq.${userId}`,
        onEvent: (p) => {
          if (p.eventType === "UPDATE" && p.new.status === "confirmed")
            toast.success("Visita confirmada");
        },
      },
      {
        table: "rental_contracts",
        filter: `tenant_id=eq.${userId}`,
        onEvent: (p) => {
          if (p.eventType === "INSERT") toast.success("Contrato disponível para assinatura");
          else if (p.eventType === "UPDATE" && p.new.status === "closed")
            toast.success("Contrato fechado");
        },
      },
    ],
  });

  if (isLoading || !data) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="Propostas enviadas" value={data.proposals.length} />
        <Stat label="Visitas agendadas" value={data.visits.length} />
        <Stat label="Contratos ativos" value={data.contracts.filter((c) => c.status === "active" || c.status === "closed").length} />
        <Stat label="Contratos fechados" value={data.contracts.filter((c) => c.status === "closed").length} />
      </div>
    </div>
  );
}
