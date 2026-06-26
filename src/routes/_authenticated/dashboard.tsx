import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

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

  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sem sessão");
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userData.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userData.user.id),
      ]);
      const all = (roles ?? []).map((r) => r.role as string);
      return {
        userId: userData.user.id,
        email: userData.user.email,
        profile,
        role: (all.find((r) => r !== "admin") ?? "locatario") as Role,
        isAdmin: all.includes("admin"),
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">
              {me.role === "proprietario" ? "Painel do Proprietário"
                : me.role === "agente" ? "Painel do Agente"
                : "Painel do Locatário"}
            </h1>
            <p className="text-sm text-muted-foreground">{me.profile?.full_name ?? me.email}</p>
          </div>
          <Button variant="outline" onClick={signOut}>Sair</Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Ações rápidas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild><Link to="/properties">Ver imóveis</Link></Button>
            {(me.role === "proprietario" || me.role === "agente") && (
              <Button asChild variant="outline"><Link to="/properties/new">Cadastrar imóvel</Link></Button>
            )}
            <Button asChild variant="outline"><Link to="/profile">Meu perfil</Link></Button>
            <Button asChild variant="outline"><Link to="/contracts">Contratos</Link></Button>
            <Button asChild variant="outline"><Link to="/chat">Conversas</Link></Button>
            <Button asChild variant="outline"><Link to="/negotiations">Negociações</Link></Button>
            {me.isAdmin && (
              <Button asChild variant="secondary"><Link to="/admin">Moderação</Link></Button>
            )}
          </CardContent>
        </Card>

        {me.role === "proprietario" && <OwnerDashboard userId={me.userId} />}
        {me.role === "agente" && <AgentDashboard userId={me.userId} />}
        {me.role === "locatario" && <TenantDashboard userId={me.userId} />}

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

function OwnerDashboard({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["owner-dash", userId],
    queryFn: async () => {
      const [props, proposals, contracts, visits] = await Promise.all([
        supabase.from("properties").select("id, title, city, rent_value, created_at").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("proposals").select("id, status, rent_offer, created_at").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("rental_contracts").select("id, status, rent_value, created_at").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("visits").select("id, status, scheduled_at").eq("owner_id", userId),
      ]);
      return {
        properties: props.data ?? [],
        proposals: proposals.data ?? [],
        contracts: contracts.data ?? [],
        visits: visits.data ?? [],
      };
    },
  });

  if (isLoading || !data) return <Skeleton className="h-40 w-full" />;

  const activeContracts = data.contracts.filter((c) => c.status === "active" || c.status === "closed");
  const monthlyIncome = activeContracts
    .filter((c) => c.status === "closed")
    .reduce((sum, c) => sum + Number(c.rent_value ?? 0), 0);
  const pendingProposals = data.proposals.filter((p) => p.status === "pending" || p.status === "negotiating").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="Imóveis anunciados" value={data.properties.length} />
        <Stat label="Propostas pendentes" value={pendingProposals} />
        <Stat label="Contratos ativos" value={activeContracts.length} />
        <Stat label="Renda mensal estimada" value={brl(monthlyIncome)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Meus imóveis</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum imóvel cadastrado.</p>
            ) : data.properties.slice(0, 5).map((p) => (
              <Link key={p.id} to="/properties/$id" params={{ id: p.id }} className="flex items-center justify-between text-sm border-b pb-2 last:border-b-0 hover:text-primary">
                <span className="truncate">{p.title} · {p.city}</span>
                <span>{brl(Number(p.rent_value))}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Vistorias e visitas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.visits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma visita agendada.</p>
            ) : data.visits.slice(0, 5).map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-b-0">
                <span>{v.scheduled_at ? new Date(v.scheduled_at).toLocaleString("pt-BR") : "—"}</span>
                <Badge variant="outline">{v.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AgentDashboard({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["agent-dash", userId],
    queryFn: async () => {
      const [proposals, contracts, ratingRpc, visibilityRpc] = await Promise.all([
        supabase.from("proposals").select("id, status, rent_offer, created_at").eq("agent_id", userId).order("created_at", { ascending: false }),
        supabase.from("rental_contracts").select("id, status, rent_value, created_at").eq("agent_id", userId).order("created_at", { ascending: false }),
        supabase.rpc("get_agent_rating", { _agent_id: userId }),
        // visibility may not be in types yet; cast
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

  if (isLoading || !data) return <Skeleton className="h-40 w-full" />;

  const closedContracts = data.contracts.filter((c) => c.status === "closed");
  const commissionRate = 0.5; // 50% of first month's rent
  const commissionsPending = data.contracts
    .filter((c) => c.status === "active")
    .reduce((sum, c) => sum + Number(c.rent_value ?? 0) * commissionRate, 0);
  const commissionsReceived = closedContracts
    .reduce((sum, c) => sum + Number(c.rent_value ?? 0) * commissionRate, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="Negócios fechados" value={Number(data.visibility.closed_deals ?? 0)} />
        <Stat
          label="Reputação"
          value={`${Number(data.rating.avg_stars ?? 0).toFixed(1)} ★`}
          hint={`${data.rating.total_ratings} avaliações`}
        />
        <Stat label="Comissões pendentes" value={brl(commissionsPending)} hint="50% do 1º aluguel" />
        <Stat label="Comissões recebidas" value={brl(commissionsReceived)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score de visibilidade</CardTitle>
          <CardDescription>
            Quanto mais transações fechadas e avaliações positivas <strong>dentro da plataforma</strong>,
            maior sua posição nos resultados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{Number(data.visibility.visibility_score ?? 0).toFixed(1)}</div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Negociações em andamento</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.proposals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma proposta.</p>
            ) : data.proposals.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-b-0">
                <span>{brl(Number(p.rent_offer))}</span>
                <Badge variant="outline">{p.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Contratos</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.contracts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem contratos ainda.</p>
            ) : data.contracts.slice(0, 5).map((c) => (
              <Link key={c.id} to="/contracts/$id" params={{ id: c.id }} className="flex items-center justify-between text-sm border-b pb-2 last:border-b-0 hover:text-primary">
                <span>{brl(Number(c.rent_value))}</span>
                <Badge variant={c.status === "closed" ? "default" : "outline"}>{c.status}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
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
