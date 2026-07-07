import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSignedPhotoUrls } from "@/lib/property-helpers";
import { toast } from "sonner";
import {
  Wallet, Users, Clock, RefreshCw, CheckCircle2,
  Award, TrendingUp, ShieldCheck, Star, ChevronRight, BadgeCheck, Calendar,
  Home, Settings, FileText, AlertTriangle, Search, Heart, MessageSquare,
  Plus, Building2, Handshake, MapPin, ArrowUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { ExportReports } from "@/components/ExportReports";
import { UnreadChatBadge } from "@/components/UnreadChatBadge";
import { useViewAs } from "@/lib/view-as";
import { CITY_PROMPTED_KEY, markPrompted, shouldOpenWelcome } from "@/lib/tenant-city-prefs";

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
        .select("id, full_name, avatar_url, user_type, preferred_city")
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold truncate">
              {role === "proprietario" ? "Painel do Proprietário"
                : role === "agente" ? "Painel do Agente"
                : "Painel do Locatário"}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{me.profile?.full_name ?? me.email}</p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isAdmin && (
              <Select
                value={viewAs.override ?? "__real__"}
                onValueChange={(v) => viewAs.setViewAs(v === "__real__" ? null : (v as Role))}
              >
                <SelectTrigger className="h-8 w-[150px] text-xs bg-amber-50 dark:bg-amber-950/40 border-amber-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__real__">Admin (real)</SelectItem>
                  <SelectItem value="proprietario">Ver como Proprietário</SelectItem>
                  <SelectItem value="locatario">Ver como Locatário</SelectItem>
                  <SelectItem value="agente">Ver como Agente</SelectItem>
                </SelectContent>
              </Select>
            )}
            <NotificationBell />
            <Button variant="outline" size="sm" onClick={signOut}>Sair</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">





        {isAdmin ? (
          <>
            {/* Admins keep all three panels mounted so switching modes is instant (no remount/refetch). */}
            <div hidden={role !== "proprietario"}>
              <OwnerDashboard userId={me.userId} fullName={me.profile?.full_name ?? me.email ?? "Proprietário"} avatarUrl={me.profile?.avatar_url ?? null} />
            </div>
            <div hidden={role !== "agente"}>
              <AgentDashboard userId={me.userId} fullName={me.profile?.full_name ?? me.email ?? "Agente"} avatarUrl={me.profile?.avatar_url ?? null} />
            </div>
            <div hidden={role !== "locatario"}>
              <TenantDashboard userId={me.userId} fullName={me.profile?.full_name ?? me.email ?? "Locatário"} avatarUrl={me.profile?.avatar_url ?? null} />
            </div>
          </>
        ) : (
          <>
            {role === "proprietario" && <OwnerDashboard userId={me.userId} fullName={me.profile?.full_name ?? me.email ?? "Proprietário"} avatarUrl={me.profile?.avatar_url ?? null} />}
            {role === "agente" && <AgentDashboard userId={me.userId} fullName={me.profile?.full_name ?? me.email ?? "Agente"} avatarUrl={me.profile?.avatar_url ?? null} />}
            {role === "locatario" && <TenantDashboard userId={me.userId} fullName={me.profile?.full_name ?? me.email ?? "Locatário"} avatarUrl={me.profile?.avatar_url ?? null} />}
          </>
        )}

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
    <Card className="min-w-0">
      <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2 space-y-1">
        <CardDescription className="text-xs sm:text-sm leading-tight">{label}</CardDescription>
        <CardTitle className="text-xl sm:text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="p-4 sm:p-6 pt-0 text-[11px] sm:text-xs text-muted-foreground leading-snug">{hint}</CardContent>}
    </Card>
  );
}

function brl(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------- Shared persona dashboard primitives ----------

function PersonaHero({
  role, name, avatarUrl, subtitle, primaryCta,
}: {
  role: string;
  name: string;
  avatarUrl: string | null;
  subtitle?: string;
  primaryCta?: { label: string; to: string; params?: Record<string, string> };
}) {
  return (
    <div className="rounded-2xl border bg-gradient-to-br from-card via-card to-muted/40 p-5 sm:p-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-primary/10 overflow-hidden ring-2 ring-background shadow flex-shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-xl font-semibold">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">{role}</p>
          <h2 className="text-xl sm:text-2xl font-bold leading-tight truncate">{name}</h2>
          {subtitle && <p className="text-sm text-muted-foreground truncate mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {primaryCta && (
        <Button asChild size="sm" className="shrink-0 hidden sm:inline-flex">
          <Link to={primaryCta.to} params={primaryCta.params as never}>{primaryCta.label}</Link>
        </Button>
      )}
    </div>
  );
}

function KpiTile({
  icon: Icon, label, value, hint, tone = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "primary" | "success" | "warning";
}) {
  const toneCls =
    tone === "success" ? "bg-success/10 text-success"
    : tone === "warning" ? "bg-warning/20 text-warning-foreground"
    : "bg-primary/10 text-primary";
  return (
    <Card className="min-w-0">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${toneCls}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
          <p className="text-xl font-bold leading-tight truncate">{value}</p>
          {hint && <p className="text-[11px] text-muted-foreground truncate">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

type AttentionItem = {
  id: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  tone: "urgent" | "info" | "success";
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
  cta: string;
};

function AttentionSection({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-5 flex items-center gap-3 text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          Tudo em dia. Nada urgente no momento.
        </CardContent>
      </Card>
    );
  }
  const toneCls: Record<AttentionItem["tone"], string> = {
    urgent: "border-l-warning bg-warning/5",
    info: "border-l-primary bg-primary/5",
    success: "border-l-success bg-success/5",
  };
  const iconCls: Record<AttentionItem["tone"], string> = {
    urgent: "bg-warning/20 text-warning-foreground",
    info: "bg-primary/15 text-primary",
    success: "bg-success/15 text-success",
  };
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card key={it.id} className={`border-l-4 ${toneCls[it.tone]}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${iconCls[it.tone]}`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm leading-tight">{it.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{it.detail}</p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link to={it.to} params={it.params as never} search={it.search as never}>
                  {it.cta} <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function QuickActions({ items }: { items: Array<{ icon: LucideIcon; label: string; to: string; params?: Record<string, string>; search?: Record<string, string> }> }) {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Button
            key={it.label}
            asChild
            variant="outline"
            className="h-auto py-4 flex-col gap-2 hover:border-primary hover:bg-primary/5"
          >
            <Link to={it.to} params={it.params as never} search={it.search as never}>
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium">{it.label}</span>
            </Link>
          </Button>
        );
      })}
    </div>
  );
}

function SectionHeader({ title, hint, actionLabel, actionTo }: { title: string; hint?: string; actionLabel?: string; actionTo?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h3 className="text-lg sm:text-xl font-bold leading-tight">{title}</h3>
        {hint && <p className="text-xs sm:text-sm text-muted-foreground">{hint}</p>}
      </div>
      {actionLabel && actionTo && (
        <Link to={actionTo} className="text-sm text-primary font-medium hover:underline inline-flex items-center gap-1 shrink-0">
          {actionLabel} <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}


function OwnerDashboard({ userId, fullName, avatarUrl }: { userId: string; fullName: string; avatarUrl: string | null }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["owner-dash", userId],
    queryFn: async () => {
      const [props, proposals, contracts, visits] = await Promise.all([
        supabase.from("properties").select("id, title, city, state, street, number, bedrooms, bathrooms, area_m2, rent_value, status, created_at").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("proposals").select("id, status, rent_offer, term_months, start_date, created_at, tenant_preapproval_income, tenant_preapproval_max_rent, tenant_preapproval_guarantee, property_id, property:properties(id,title,city,neighborhood)").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("rental_contracts").select("id, status, rent_value, start_date, term_months, created_at, property_id, tenant_id, agent_id, property:properties(title), tenant:profiles!rental_contracts_tenant_id_fkey(full_name)").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("visits").select("id, status, scheduled_at, notes, property:properties(title)").eq("owner_id", userId).order("scheduled_at", { ascending: true }),
      ]);

      const propIds = (props.data ?? []).map((p) => p.id);
      const metrics: Record<string, { favorites: number; proposals: number; conversations: number }> = {};
      for (const id of propIds) metrics[id] = { favorites: 0, proposals: 0, conversations: 0 };
      if (propIds.length > 0) {
        const [favs, propAgg, convs] = await Promise.all([
          supabase.from("favorites").select("property_id").in("property_id", propIds),
          supabase.from("proposals").select("property_id").in("property_id", propIds),
          supabase.from("conversations").select("property_id").in("property_id", propIds),
        ]);
        for (const r of favs.data ?? []) if (metrics[r.property_id]) metrics[r.property_id].favorites++;
        for (const r of propAgg.data ?? []) if (metrics[r.property_id]) metrics[r.property_id].proposals++;
        for (const r of convs.data ?? []) if (r.property_id && metrics[r.property_id]) metrics[r.property_id].conversations++;
      }

      return {
        properties: props.data ?? [],
        proposals: proposals.data ?? [],
        contracts: contracts.data ?? [],
        visits: visits.data ?? [],
        metrics,
      };
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  async function togglePause(id: string, current: string | null) {
    const next = current === "inactive" ? "available" : "inactive";
    const { error } = await supabase.from("properties").update({ status: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(next === "inactive" ? "Imóvel pausado" : "Imóvel reativado");
    qc.invalidateQueries({ queryKey: ["owner-dash", userId] });
  }

  async function renewContract(c: { property_id: string; tenant_id: string; agent_id: string | null; rent_value: number; term_months: number; start_date: string }) {
    const prevStart = new Date(c.start_date);
    const newStart = new Date(prevStart.getFullYear(), prevStart.getMonth() + c.term_months, prevStart.getDate());
    if (!confirm(`Renovar contrato por mais ${c.term_months} meses a partir de ${newStart.toLocaleDateString("pt-BR")}?`)) return;
    const { error } = await supabase.from("rental_contracts").insert({
      property_id: c.property_id,
      owner_id: userId,
      tenant_id: c.tenant_id,
      agent_id: c.agent_id,
      status: "active",
      rent_value: c.rent_value,
      term_months: c.term_months,
      start_date: newStart.toISOString().slice(0, 10),
      contract_text: `RENOVAÇÃO DE CONTRATO\n\nValor mensal: R$ ${Number(c.rent_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\nPrazo: ${c.term_months} meses\nInício: ${newStart.toLocaleDateString("pt-BR")}\n\nAs partes confirmam a renovação nas mesmas condições do contrato anterior, salvo reajustes legais aplicáveis.`,
    });
    if (error) return toast.error(error.message);
    toast.success("Contrato renovado");
    qc.invalidateQueries({ queryKey: ["owner-dash", userId] });
  }



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

  const activeContracts = data.contracts.filter((c) => c.status === "active" || c.status === "closed");
  const now = new Date();

  // Derived state ------------------------------------------------------------
  const pendingProposals = data.proposals.filter(
    (p) => p.status === "pending" || p.status === "negotiating" || p.status === "countered",
  );
  const visitsToday = data.visits.filter((v) => {
    if (!v.scheduled_at) return false;
    const d = new Date(v.scheduled_at);
    return d.toDateString() === now.toDateString();
  });
  const visitsNext7 = data.visits.filter((v) => {
    if (!v.scheduled_at) return false;
    const d = new Date(v.scheduled_at);
    const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  });
  const expiringContracts = activeContracts.filter((c) => {
    if (!c.start_date || !c.term_months) return false;
    const start = new Date(c.start_date);
    const end = new Date(start.getFullYear(), start.getMonth() + c.term_months, start.getDate());
    const diff = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 30;
  });
  const rentedCount = data.properties.filter((p) => p.status === "rented").length;
  const occupancy = data.properties.length > 0 ? Math.round((rentedCount / data.properties.length) * 100) : 0;
  const mrr = activeContracts.reduce((s, c) => s + Number(c.rent_value ?? 0), 0);

  const attention: AttentionItem[] = [];
  if (pendingProposals.length > 0) attention.push({
    id: "prop", icon: AlertTriangle, tone: "urgent",
    title: `${pendingProposals.length} proposta${pendingProposals.length === 1 ? "" : "s"} aguardando`,
    detail: "Responda para não perder o locatário.",
    to: "/negotiations", cta: "Analisar propostas",
  });
  if (visitsToday.length > 0) attention.push({
    id: "vis", icon: Calendar, tone: "info",
    title: `${visitsToday.length} visita${visitsToday.length === 1 ? "" : "s"} hoje`,
    detail: "Confirme presença e prepare o imóvel.",
    to: "/negotiations", cta: "Ver agenda",
  });
  if (expiringContracts.length > 0) attention.push({
    id: "exp", icon: RefreshCw, tone: "urgent",
    title: `${expiringContracts.length} contrato${expiringContracts.length === 1 ? "" : "s"} vencendo`,
    detail: "Renove antes do fim para manter a ocupação.",
    to: "/contracts", cta: "Renovar contratos",
  });

  const propStatusDot = (s: string | null) => {
    if (s === "rented") return { cls: "bg-success", text: "text-success", label: "Ocupado" };
    if (s === "available") return { cls: "bg-warning", text: "text-warning-foreground", label: "Disponível" };
    return { cls: "bg-muted-foreground", text: "text-muted-foreground", label: s ?? "—" };
  };
  const visitStatusPill = (s: string) => {
    if (s === "confirmed") return { cls: "bg-primary/15 text-primary", label: "Confirmada" };
    if (s === "done") return { cls: "bg-success/15 text-success", label: "Realizada" };
    if (s === "canceled") return { cls: "bg-muted text-muted-foreground", label: "Cancelada" };
    return { cls: "bg-warning/20 text-warning-foreground", label: "Agendada" };
  };

  return (
    <div className="space-y-6">
      <PersonaHero
        role="Proprietário"
        name={fullName}
        avatarUrl={avatarUrl}
        subtitle={`${data.properties.length} imóve${data.properties.length === 1 ? "l" : "is"} · ${activeContracts.length} contrato${activeContracts.length === 1 ? "" : "s"} ativo${activeContracts.length === 1 ? "" : "s"}`}
        primaryCta={{ label: "Cadastrar imóvel", to: "/properties/new" }}
      />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Precisa da sua atenção</h3>
        <AttentionSection items={attention} />
      </section>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KpiTile icon={Home} label="Imóveis publicados" value={data.properties.length} hint={`${rentedCount} ocupados`} />
        <KpiTile icon={TrendingUp} label="Ocupação" value={`${occupancy}%`} tone="success" hint={`${rentedCount}/${data.properties.length}`} />
        <KpiTile icon={Wallet} label="Receita mensal" value={brl(mrr)} tone="success" hint={`${activeContracts.length} contrato${activeContracts.length === 1 ? "" : "s"}`} />
        <KpiTile icon={MessageSquare} label="Propostas abertas" value={pendingProposals.length} tone={pendingProposals.length > 0 ? "warning" : "primary"} hint="Aguardando resposta" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: proposals pipeline */}
        <div className="space-y-3">
          <SectionHeader title="Propostas em aberto" hint="Ordenadas por urgência" actionLabel="Ver todas" actionTo="/negotiations" />
          <OwnerProposals proposals={data.proposals} />
        </div>

        {/* Right: agenda + contracts */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Próximas visitas (7 dias)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {visitsNext7.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma visita agendada.</p>
              ) : visitsNext7.slice(0, 4).map((v) => {
                const pill = visitStatusPill(v.status);
                const prop = (v as unknown as { property: { title: string } | null }).property;
                const when = v.scheduled_at ? new Date(v.scheduled_at) : null;
                return (
                  <div key={v.id} className="flex items-center gap-3 pb-3 border-b last:border-b-0 last:pb-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{prop?.title ?? "Imóvel"}</p>
                      <p className="text-xs text-muted-foreground">
                        {when ? when.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—"}
                        {when ? ` · ${when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                      </p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${pill.cls}`}>
                      {pill.label}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Contratos ativos
              </CardTitle>
              <Link to="/contracts" className="text-xs text-primary hover:underline">Ver todos</Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeContracts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem contratos ativos.</p>
              ) : activeContracts.slice(0, 3).map((c) => {
                const prop = (c as unknown as { property: { title: string } | null }).property;
                const tenant = (c as unknown as { tenant: { full_name: string } | null }).tenant;
                return (
                  <div key={c.id} className="flex items-center gap-3 pb-3 border-b last:border-b-0 last:pb-0">
                    <Link to="/contracts/$id" params={{ id: c.id }} className="flex flex-1 items-center gap-3 min-w-0 hover:opacity-80">
                      <div className="h-9 w-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-success" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{prop?.title ?? "Imóvel"}</p>
                        <p className="text-xs text-muted-foreground truncate">{tenant?.full_name ?? "—"} · {brl(Number(c.rent_value))}</p>
                      </div>
                    </Link>
                    {(c.status === "closed" || c.status === "active") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={() => renewContract({
                          property_id: (c as unknown as { property_id: string }).property_id,
                          tenant_id: (c as unknown as { tenant_id: string }).tenant_id,
                          agent_id: (c as unknown as { agent_id: string | null }).agent_id,
                          rent_value: Number(c.rent_value),
                          term_months: Number(c.term_months),
                          start_date: c.start_date as unknown as string,
                        })}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Properties compact list */}
      <section className="space-y-3">
        <SectionHeader title="Meus imóveis" hint="Desempenho e status" actionLabel="Gerenciar todos" actionTo="/properties" />
        {data.properties.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Home className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium">Você ainda não cadastrou imóveis</p>
              <Button asChild size="sm">
                <Link to="/properties/new"><Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro imóvel</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.properties.slice(0, 4).map((p) => {
              const dot = propStatusDot(p.status);
              const m = data.metrics[p.id] ?? { favorites: 0, proposals: 0, conversations: 0 };
              const isPaused = p.status === "inactive";
              return (
                <Card key={p.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-14 w-14 rounded-lg bg-gradient-to-br from-primary/10 to-primary/20 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{p.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[p.city, p.state].filter(Boolean).join("/")} · {brl(Number(p.rent_value))}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className={`inline-flex items-center gap-1 font-medium ${dot.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${dot.cls}`} />
                            {isPaused ? "Pausado" : dot.label}
                          </span>
                          <span>· ❤ {m.favorites}</span>
                          <span>· 📩 {m.proposals}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <Link to="/properties/$id" params={{ id: p.id }}>Gerenciar</Link>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => togglePause(p.id, p.status)}>
                        {isPaused ? "Reativar" : "Pausar"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <QuickActions items={[
        { icon: Plus, label: "Novo imóvel", to: "/properties/new" },
        { icon: Wallet, label: "Financeiro", to: "/financials" },
        { icon: MessageSquare, label: "Conversas", to: "/chat" },
        { icon: FileText, label: "Contratos", to: "/contracts" },
      ]} />
    </div>
  );
}


type OwnerProposal = {
  id: string;
  status: string | null;
  rent_offer: number;
  term_months: number | null;
  start_date: string | null;
  created_at: string;
  tenant_preapproval_income: number | null;
  tenant_preapproval_max_rent: number | null;
  tenant_preapproval_guarantee: string | null;
  property: { id: string; title: string; city: string | null; neighborhood: string | null } | null;
};

type ProposalSort = "preapproved" | "highest" | "lowest" | "newest";
type ProposalFilter = "all" | "pending" | "preapproved";

function OwnerProposals({ proposals }: { proposals: unknown[] }) {
  const list = proposals as OwnerProposal[];
  const [sort, setSort] = useState<ProposalSort>("preapproved");
  const [filter, setFilter] = useState<ProposalFilter>("all");

  const visible = useMemo(() => {
    const filtered = list.filter((p) => {
      if (filter === "pending") return p.status === "pending" || p.status === "negotiating" || p.status === "countered";
      if (filter === "preapproved") return p.tenant_preapproval_max_rent != null;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "highest") return Number(b.rent_offer) - Number(a.rent_offer);
      if (sort === "lowest") return Number(a.rent_offer) - Number(b.rent_offer);
      if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      // preapproved first, then by value desc
      const pa = a.tenant_preapproval_max_rent != null ? 1 : 0;
      const pb = b.tenant_preapproval_max_rent != null ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return Number(b.rent_offer) - Number(a.rent_offer);
    });
    return sorted.slice(0, 5);
  }, [list, sort, filter]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-xl font-bold">Propostas recebidas</h3>
        <Link to="/negotiations" className="text-sm text-primary font-medium hover:underline inline-flex items-center gap-1">
          Ver todas <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {list.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filter} onValueChange={(v) => setFilter(v as ProposalFilter)}>
            <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as propostas</SelectItem>
              <SelectItem value="pending">Apenas pendentes</SelectItem>
              <SelectItem value="preapproved">Apenas pré-aprovados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as ProposalSort)}>
            <SelectTrigger className="h-8 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="preapproved">Pré-aprovados primeiro</SelectItem>
              <SelectItem value="highest">Maior valor</SelectItem>
              <SelectItem value="lowest">Menor valor</SelectItem>
              <SelectItem value="newest">Mais recentes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {visible.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          {list.length === 0 ? "Nenhuma proposta recebida ainda." : "Nenhuma proposta corresponde ao filtro."}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {visible.map((p: OwnerProposal) => {
            const preapproved = p.tenant_preapproval_max_rent != null;
            const status = mapProposalStatus(p.status);
            return (
              <Card
                key={p.id}
                className={`overflow-hidden hover:shadow-md transition-shadow ${preapproved ? "ring-1 ring-sky-200" : ""}`}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-primary/10 to-primary/20 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate">{p.property?.title ?? "Imóvel"}</p>
                        {preapproved && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-800 border border-sky-200 px-2 py-0.5 text-[10px] font-medium">
                            <ShieldCheck className="h-3 w-3" /> Pré-aprovado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {[p.property?.neighborhood, p.property?.city].filter(Boolean).join(", ") || "—"}
                      </p>
                      <p className="text-sm mt-1">
                        <strong>{brl(p.rent_offer)}</strong>
                        <span className="text-muted-foreground"> /mês · {p.term_months ?? "—"} meses</span>
                      </p>
                    </div>
                    <StatusPill status={status} />
                  </div>
                  {preapproved && (
                    <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                      <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        Locatário <strong>pré-aprovado</strong> até {brl(Number(p.tenant_preapproval_max_rent))}
                        {p.tenant_preapproval_income ? ` · renda ${brl(Number(p.tenant_preapproval_income))}` : ""}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
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
    "Pendente": { cls: "bg-warning/20 text-warning-foreground", Icon: Clock },
    "Em Progresso": { cls: "bg-primary/15 text-primary", Icon: RefreshCw },
    "Concluído": { cls: "bg-success/15 text-success", Icon: CheckCircle2 },
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
      const [proposals, contracts, ratingRpc, visibilityRpc, myProps] = await Promise.all([
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
        supabase.from("properties").select("id, title, city, state, status").eq("owner_id", userId).order("created_at", { ascending: false }),
      ]);
      return {
        proposals: proposals.data ?? [],
        contracts: contracts.data ?? [],
        rating: ratingRpc.data?.[0] ?? { avg_stars: 0, total_ratings: 0 },
        visibility: visibilityRpc.data?.[0] ?? { closed_deals: 0, visibility_score: 0 },
        myProperties: myProps.data ?? [],
      };
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
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

  // Funnel counts (últimos 30 dias)
  const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentProposals = data.proposals.filter((p) => new Date(p.created_at) >= thirtyAgo);
  const funnel = {
    leads: recentProposals.length,
    negotiating: recentProposals.filter((p) => p.status === "negotiating" || p.status === "countered").length,
    accepted: recentProposals.filter((p) => p.status === "accepted").length,
    closed: data.contracts.filter((c) => c.status === "closed" && new Date(c.created_at) >= thirtyAgo).length,
  };
  const pendingLeads = data.proposals.filter(
    (p) => p.status === "pending" || p.status === "negotiating" || p.status === "countered",
  );

  const attention: AttentionItem[] = [];
  if (pendingLeads.length > 0) attention.push({
    id: "leads", icon: AlertTriangle, tone: "urgent",
    title: `${pendingLeads.length} lead${pendingLeads.length === 1 ? "" : "s"} aguardando`,
    detail: "Acompanhe as negociações em andamento.",
    to: "/negotiations", search: { focus: "proposals", status: "pending" }, cta: "Acompanhar leads",
  });
  if (data.myProperties.length === 0) attention.push({
    id: "affil", icon: Handshake, tone: "info",
    title: "Amplie seu portfólio",
    detail: "Solicite afiliação para intermediar mais imóveis.",
    to: "/affiliations", search: { tab: "agent" }, cta: "Solicitar afiliação",
  });

  return (
    <div className="space-y-6">
      <PersonaHero
        role="Agente / Finder"
        name={fullName}
        avatarUrl={avatarUrl}
        subtitle={`${reputationLabel} · ${avgStars.toFixed(1)} ★ · ${closedDeals} fechamentos`}
        primaryCta={{ label: "Nova afiliação", to: "/affiliations" }}
      />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Precisa da sua atenção</h3>
        <AttentionSection items={attention} />
      </section>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KpiTile icon={Wallet} label="Ganhos do mês" value={brl(earningsMonth)} tone="success" hint="Comissões liberadas" />
        <KpiTile icon={Users} label="Leads ativos" value={activeLeads} tone={activeLeads > 0 ? "warning" : "primary"} hint="Em negociação" />
        <KpiTile icon={CheckCircle2} label="Fechamentos" value={closedDeals} tone="success" hint="Total histórico" />
        <KpiTile icon={Star} label="Reputação" value={avgStars.toFixed(1)} hint={`${totalRatings} avaliações`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Funnel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Funil de negociações (30 dias)
            </CardTitle>
            <CardDescription className="text-xs">Do primeiro contato ao contrato fechado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {([
              { label: "Leads recebidos", value: funnel.leads, tone: "bg-primary/15 text-primary" },
              { label: "Em negociação", value: funnel.negotiating, tone: "bg-warning/20 text-warning-foreground" },
              { label: "Propostas aceitas", value: funnel.accepted, tone: "bg-primary/25 text-primary" },
              { label: "Contratos fechados", value: funnel.closed, tone: "bg-success/15 text-success" },
            ] as const).map((stage, i) => {
              const pct = funnel.leads > 0 ? Math.round((stage.value / funnel.leads) * 100) : 0;
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{stage.label}</span>
                    <span className="text-muted-foreground text-xs">
                      <strong className="text-foreground">{stage.value}</strong> · {pct}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${stage.tone.split(" ")[0]} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {funnel.leads === 0 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                Sem leads nos últimos 30 dias. Solicite novas afiliações para ampliar seu alcance.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent referrals */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Handshake className="h-4 w-4 text-primary" /> Indicações recentes
            </CardTitle>
            <Link to="/negotiations" className="text-xs text-primary hover:underline">Ver todas</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.proposals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem indicações ainda.</p>
            ) : data.proposals.slice(0, 4).map((p) => {
              const status = mapProposalStatus(p.status);
              const prop = (p as unknown as { property: { title: string; city: string | null } | null }).property;
              return (
                <div key={p.id} className="flex items-center gap-2 pb-2 border-b last:border-b-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{prop?.title ?? "Imóvel"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {prop?.city ?? "—"} · {brl(Number(p.rent_offer))}
                    </p>
                  </div>
                  <StatusPill status={status} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Reputação compacta */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Reputação
          </CardTitle>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={async () => {
                const url = `${window.location.origin}/agents/${userId}`;
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success("Link do seu perfil público copiado!");
                } catch {
                  window.open(url, "_blank");
                }
              }}
            >
              Compartilhar perfil
            </button>
            <Link to="/profile" className="text-xs text-primary hover:underline">Ver perfil</Link>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-3xl font-bold leading-none">{avgStars.toFixed(1)}</p>
              <div className="mt-1"><Stars value={avgStars} /></div>
              <p className="text-[11px] text-muted-foreground mt-1">{totalRatings} avaliações</p>
            </div>
          </div>
          <ReputationRow Icon={Users} label="Indicações concluídas" value={`${closedDeals}`} />
          <ReputationRow Icon={TrendingUp} label="Score de visibilidade" value={Number(data.visibility.visibility_score ?? 0).toFixed(1)} />
        </CardContent>
      </Card>

      <QuickActions items={[
        { icon: Handshake, label: "Afiliações", to: "/affiliations", search: { tab: "agent" } },
        { icon: Users, label: "Leads", to: "/leads" },
        { icon: Search, label: "Buscar imóveis", to: "/properties" },
        { icon: TrendingUp, label: "Propostas", to: "/negotiations", search: { focus: "proposals" } },
        { icon: MapPin, label: "Visitas", to: "/negotiations", search: { focus: "visits" } },
        { icon: MessageSquare, label: "Conversas", to: "/chat" },
        { icon: FileText, label: "Contratos", to: "/contracts" },
        { icon: Wallet, label: "Minhas comissões", to: "/financials", search: { tab: "agent" } },
      ]} />

    </div>
  );
}


function ReputationRow({ Icon, label, value }: { Icon: typeof Award; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-sm text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

function TenantDashboard({ userId, fullName, avatarUrl }: { userId: string; fullName: string; avatarUrl: string | null }) {
  const [selectedCity, setSelectedCity] = useTenantCity("tenant_preferred_city", userId);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeChoice, setWelcomeChoice] = useState<string>("");



  const { data, isLoading } = useQuery({
    queryKey: ["tenant-dash", userId],
    queryFn: async () => {
      const [proposals, contracts, visits] = await Promise.all([
        supabase.from("proposals").select("id, status, rent_offer, created_at").eq("tenant_id", userId).order("created_at", { ascending: false }),
        supabase.from("rental_contracts").select("id, status, rent_value, start_date, term_months, created_at").eq("tenant_id", userId).order("created_at", { ascending: false }),
        supabase.from("visits").select("id, status, scheduled_at").eq("tenant_id", userId),
      ]);
      return {
        proposals: proposals.data ?? [],
        contracts: contracts.data ?? [],
        visits: visits.data ?? [],
      };
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const { data: cities, isLoading: loadingCities } = useQuery({
    queryKey: ["tenant-cities"],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("properties")
        .select("city, state")
        .eq("status", "available")
        .not("city", "is", null);
      const seen = new Set<string>();
      const list: { city: string; state: string | null }[] = [];
      for (const r of rows ?? []) {
        const key = `${r.city}|${r.state ?? ""}`;
        if (!seen.has(key) && r.city) {
          seen.add(key);
          list.push({ city: r.city, state: r.state });
        }
      }
      return list.sort((a, b) => a.city.localeCompare(b.city));
    },
    staleTime: 5 * 60_000,
  });

  // Popup de boas-vindas — abre na primeira visita se ainda não houver cidade salva
  // nem o flag de "já perguntei". Decisão fica persistente em localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prompted = window.localStorage.getItem(CITY_PROMPTED_KEY);
    if (shouldOpenWelcome({ selectedCity, prompted, citiesCount: cities?.length ?? 0 })) {
      setWelcomeChoice(cities![0].city);
      setWelcomeOpen(true);
    }
  }, [cities, selectedCity]);

  function closeWelcome(save: boolean) {
    if (save && welcomeChoice) setSelectedCity(welcomeChoice);
    if (typeof window !== "undefined") {
      markPrompted(window.localStorage);
    }
    setWelcomeOpen(false);
  }


  const { data: regional, isLoading: loadingRegional } = useQuery({
    queryKey: ["tenant-regional", selectedCity],
    enabled: !!selectedCity,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("properties")
        .select("id,title,city,state,neighborhood,bedrooms,bathrooms,area_m2,rent_value,property_photos(storage_path,position)")
        .eq("status", "available")
        .eq("city", selectedCity as string)
        .order("created_at", { ascending: false })
        .limit(12);
      const firstPaths = (rows ?? [])
        .map((p) => (p.property_photos ?? []).slice().sort((a, b) => a.position - b.position)[0]?.storage_path)
        .filter((s): s is string => !!s);
      const urls = await getSignedPhotoUrls(firstPaths);
      return (rows ?? []).map((p) => {
        const path = (p.property_photos ?? []).slice().sort((a, b) => a.position - b.position)[0]?.storage_path;
        return { ...p, cover: path ? urls[path] : null };
      });
    },
    staleTime: 60_000,
  });

  useRealtimeNotifications({
    enabled: true,
    channelName: `tenant-dash-${userId}`,
    invalidateKeys: [["tenant-dash", userId]],
    subscriptions: [
      { table: "proposals", filter: `tenant_id=eq.${userId}`, onEvent: (p) => {
        if (p.eventType === "UPDATE" && p.new.status !== p.old.status) toast.info(`Sua proposta: ${String(p.new.status)}`);
      } },
      { table: "visits", filter: `tenant_id=eq.${userId}`, onEvent: (p) => {
        if (p.eventType === "UPDATE" && p.new.status === "confirmed") toast.success("Visita confirmada");
      } },
      { table: "rental_contracts", filter: `tenant_id=eq.${userId}`, onEvent: (p) => {
        if (p.eventType === "INSERT") toast.success("Contrato disponível para assinatura");
        else if (p.eventType === "UPDATE" && p.new.status === "closed") toast.success("Contrato fechado");
      } },
    ],
  });

  if (isLoading || !data) return <Skeleton className="h-40 w-full" />;

  const activeContracts = data.contracts.filter((c) => c.status === "active" || c.status === "closed");
  const activeContract = activeContracts[0] ?? null;
  const isRenting = activeContract != null;

  const now = new Date();
  const upcomingVisits = data.visits.filter((v) => {
    if (!v.scheduled_at) return false;
    const d = new Date(v.scheduled_at);
    return d.getTime() >= now.getTime() && v.status !== "canceled";
  });
  const acceptedProposals = data.proposals.filter((p) => p.status === "accepted");
  const pendingProposals = data.proposals.filter(
    (p) => p.status === "pending" || p.status === "negotiating" || p.status === "countered",
  );

  const attention: AttentionItem[] = [];
  if (isRenting) {
    const nextDue = new Date(now.getFullYear(), now.getMonth() + 1, 5);
    attention.push({
      id: "rent", icon: Wallet, tone: "info",
      title: `Próximo aluguel · ${brl(Number(activeContract!.rent_value))}`,
      detail: `Vencimento em ${nextDue.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}.`,
      to: "/contracts/$id", params: { id: activeContract!.id }, cta: "Abrir contrato",
    });
  } else {
    if (acceptedProposals.length > 0) attention.push({
      id: "acc", icon: CheckCircle2, tone: "success",
      title: "Proposta aceita!",
      detail: "Aguardando geração do contrato para assinatura.",
      to: "/negotiations", cta: "Ver detalhes",
    });
    if (upcomingVisits.length > 0) attention.push({
      id: "vis", icon: Calendar, tone: "info",
      title: `${upcomingVisits.length} visita${upcomingVisits.length === 1 ? "" : "s"} agendada${upcomingVisits.length === 1 ? "" : "s"}`,
      detail: "Prepare suas perguntas antes de ir.",
      to: "/negotiations", cta: "Ver agenda",
    });
    if (pendingProposals.length > 0) attention.push({
      id: "prop", icon: Clock, tone: "info",
      title: `${pendingProposals.length} proposta${pendingProposals.length === 1 ? "" : "s"} em negociação`,
      detail: "Acompanhe as respostas dos proprietários.",
      to: "/negotiations", cta: "Acompanhar",
    });
  }

  return (
    <div className="space-y-6">
      <PersonaHero
        role={isRenting ? "Locatário · Contrato ativo" : "Locatário"}
        name={fullName}
        avatarUrl={avatarUrl}
        subtitle={isRenting
          ? `Aluguel mensal ${brl(Number(activeContract!.rent_value))}`
          : "Vamos encontrar o lar perfeito para você"}
        primaryCta={isRenting
          ? { label: "Meu contrato", to: "/contracts/$id", params: { id: activeContract!.id } }
          : { label: "Buscar imóveis", to: "/properties" }}
      />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Precisa da sua atenção</h3>
        <AttentionSection items={attention} />
      </section>

      {isRenting ? (
        <>
          {/* KPIs do inquilino atual */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <KpiTile icon={Home} label="Aluguel mensal" value={brl(Number(activeContract!.rent_value))} tone="primary" />
            <KpiTile icon={Calendar} label="Início do contrato" value={activeContract!.start_date ? new Date(activeContract!.start_date as unknown as string).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "—"} />
            <KpiTile icon={CheckCircle2} label="Status" value={activeContract!.status === "closed" ? "Assinado" : "Ativo"} tone="success" />
            <KpiTile icon={FileText} label="Contratos" value={data.contracts.length} hint={`${data.contracts.filter((c) => c.status === "closed").length} concluídos`} />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Meu contrato ativo
              </CardTitle>
              <CardDescription className="text-xs">
                Todas as informações e pagamentos do seu aluguel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full">
                <Link to="/contracts/$id" params={{ id: activeContract!.id }}>
                  Abrir contrato completo <ChevronRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/chat">
                    <MessageSquare className="h-4 w-4 mr-1.5" /> Falar com proprietário
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/financials">
                    <Wallet className="h-4 w-4 mr-1.5" /> Meus pagamentos
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <QuickActions items={[
            { icon: FileText, label: "Contrato", to: "/contracts/$id", params: { id: activeContract!.id } },
            { icon: Wallet, label: "Pagamentos", to: "/financials" },
            { icon: MessageSquare, label: "Conversas", to: "/chat" },
            { icon: Building2, label: "Contratos anteriores", to: "/contracts" },
          ]} />
        </>
      ) : (
        <>
          {/* KPIs do buscador */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <KpiTile icon={Heart} label="Favoritos" value={pendingProposals.length > 0 ? "—" : "—"} hint="Salvos para depois" />
            <KpiTile icon={MessageSquare} label="Minhas propostas" value={data.proposals.length} tone={pendingProposals.length > 0 ? "warning" : "primary"} hint={`${pendingProposals.length} em aberto`} />
            <KpiTile icon={Calendar} label="Visitas agendadas" value={upcomingVisits.length} hint="Imóveis para conhecer" />
            <KpiTile icon={ShieldCheck} label="Pré-aprovações" value={acceptedProposals.length} tone="success" hint="Você tem prioridade" />
          </div>

          {/* Localidade preferida */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> Sua localidade preferida
              </CardTitle>
              <CardDescription className="text-xs">
                Priorizamos imóveis verificados na cidade que você escolher.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCities ? (
                <Skeleton className="h-11 w-full" />
              ) : (cities ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma cidade disponível ainda.</p>
              ) : (
                <Select value={selectedCity ?? ""} onValueChange={(v) => setSelectedCity(v)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Selecione uma cidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {(cities ?? []).map((c) => (
                      <SelectItem key={`${c.city}-${c.state ?? ""}`} value={c.city}>
                        {c.city}{c.state ? ` · ${c.state}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {/* Imóveis na região */}
          <section className="space-y-3">
            <SectionHeader
              title={selectedCity ? `Oportunidades em ${selectedCity}` : "Oportunidades para você"}
              hint={selectedCity ? "Verificados e prontos para negociação." : "Escolha uma cidade acima para começarmos."}
              actionLabel="Ver todos"
              actionTo="/properties"
            />

            {!selectedCity ? (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center space-y-3">
                  <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Search className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium">Escolha uma cidade acima para vermos imóveis próximos.</p>
                </CardContent>
              </Card>
            ) : loadingRegional ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-2xl overflow-hidden bg-card border">
                    <Skeleton className="aspect-[16/10] w-full rounded-none" />
                    <div className="p-4 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (regional ?? []).length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center space-y-3">
                  <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <Home className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Nenhum imóvel disponível em {selectedCity}</p>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/properties">Ver todos os imóveis</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(regional ?? []).slice(0, 6).map((p) => (
                  <Link
                    key={p.id}
                    to="/properties/$id"
                    params={{ id: p.id }}
                    className="group rounded-2xl overflow-hidden bg-card border hover:shadow-lg hover:border-primary/40 transition"
                  >
                    <div className="aspect-[16/10] bg-muted relative overflow-hidden">
                      {p.cover ? (
                        <img src={p.cover} alt={p.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Sem foto</div>
                      )}
                      <div className="absolute top-3 right-3 bg-background/95 backdrop-blur px-2.5 py-1 rounded-full text-xs font-semibold shadow">
                        {brl(Number(p.rent_value))}
                        <span className="text-muted-foreground font-normal"> /mês</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-2">
                      <h4 className="font-semibold leading-tight line-clamp-1">{p.title}</h4>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {[p.neighborhood, p.city, p.state].filter(Boolean).join(", ")}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                        <span>{p.bedrooms ?? 0} quartos</span>
                        <span>·</span>
                        <span>{p.bathrooms ?? 0} banh.</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <Badge variant="secondary" className="gap-1 bg-success/10 text-success hover:bg-success/10 border-success/30">
                          <BadgeCheck className="h-3.5 w-3.5" /> Verificado
                        </Badge>
                        <span className="text-xs font-semibold text-primary inline-flex items-center gap-1 group-hover:underline">
                          Quero alugar <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <QuickActions items={[
            { icon: Search, label: "Buscar imóveis", to: "/properties" },
            { icon: Heart, label: "Favoritos", to: "/favorites" },
            { icon: ShieldCheck, label: "Pré-aprovação", to: "/preapprovals" },
            { icon: MessageSquare, label: "Conversas", to: "/chat" },
          ]} />
        </>
      )}

      <Dialog open={welcomeOpen} onOpenChange={(o) => { if (!o) closeWelcome(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bem-vindo! Onde você procura imóveis?</DialogTitle>
            <DialogDescription>
              Escolha sua localidade preferida para vermos imóveis verificados próximos de você.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Cidade</label>
            <Select value={welcomeChoice} onValueChange={setWelcomeChoice}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Selecione uma cidade" />
              </SelectTrigger>
              <SelectContent>
                {(cities ?? []).map((c) => (
                  <SelectItem key={`${c.city}-${c.state ?? ""}`} value={c.city}>
                    {c.city}{c.state ? ` · ${c.state}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => closeWelcome(false)}>Agora não</Button>
            <Button onClick={() => closeWelcome(true)} disabled={!welcomeChoice}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



function useTenantCity(storageKey: string, userId?: string) {
  const [value, setValue] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(storageKey);
  });

  // Hydrate from backend on mount: backend wins if it has a value and local
  // doesn't (or differs) — so a new device picks up the saved preference.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("preferred_city")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled || error) return;
      const remote = (data?.preferred_city ?? null) as string | null;
      if (remote && remote !== value) {
        setValue(remote);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(storageKey, remote);
        }
      } else if (!remote && value) {
        // Local has a value but backend doesn't — push local up so it follows the user.
        await supabase.from("profiles").update({ preferred_city: value }).eq("id", userId);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const update = (v: string | null) => {
    setValue(v);
    if (typeof window !== "undefined") {
      if (v) window.localStorage.setItem(storageKey, v);
      else window.localStorage.removeItem(storageKey);
    }
    if (userId) {
      void supabase.from("profiles").update({ preferred_city: v }).eq("id", userId);
    }
  };
  return [value, update] as const;
}

