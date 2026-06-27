import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { getOrCreateConversation } from "@/lib/chat-helpers";
import { Handshake, Check, X, MessageCircle, Clock, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/affiliations")({
  head: () => ({ meta: [{ title: "Afiliações | Plataforma de Aluguel" }] }),
  component: AffiliationsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Página não encontrada</div>,
});

type AffiliationStatus = "pending" | "approved" | "rejected" | "revoked" | "expired" | "completed";

type Affiliation = {
  id: string;
  property_id: string;
  agent_id: string;
  status: AffiliationStatus;
  owner_commission_pct: number;
  tenant_commission_pct: number;
  can_edit_listing: boolean;
  message: string | null;
  rejected_reason: string | null;
  requested_at: string;
  approved_at: string | null;
  expires_at: string | null;
};

function statusBadge(status: AffiliationStatus) {
  const map: Record<AffiliationStatus, { label: string; cls: string }> = {
    pending: { label: "Pendente", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    approved: { label: "Aprovada", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    rejected: { label: "Recusada", cls: "bg-rose-50 text-rose-700 border-rose-200" },
    revoked: { label: "Cancelada", cls: "bg-muted text-muted-foreground" },
    expired: { label: "Expirada", cls: "bg-muted text-muted-foreground" },
    completed: { label: "Concluída", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  };
  const m = map[status];
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
}

function AffiliationsPage() {
  const { data: ctx } = useQuery({
    queryKey: ["affiliations-ctx"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { data: roles } = await supabase
        .from("user_roles").select("role").eq("user_id", u.user.id);
      const isAgent = (roles ?? []).some((r) => r.role === "agente");
      return { userId: u.user.id, isAgent };
    },
  });

  if (!ctx) return <div className="p-6"><Skeleton className="h-64 w-full max-w-2xl" /></div>;

  const defaultTab = ctx.isAgent ? "agent" : "owner";

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 space-y-4">
      <header className="flex items-center gap-2">
        <Handshake className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">Afiliações</h1>
      </header>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 w-full max-w-sm">
          {ctx.isAgent && <TabsTrigger value="agent">Minhas afiliações</TabsTrigger>}
          <TabsTrigger value="owner">Pedidos recebidos</TabsTrigger>
        </TabsList>

        {ctx.isAgent && (
          <TabsContent value="agent">
            <AgentView userId={ctx.userId} />
          </TabsContent>
        )}

        <TabsContent value="owner">
          <OwnerView userId={ctx.userId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Agent view ---------------- */

function AgentView({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["affiliations-agent", userId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("property_affiliations")
        .select("*, properties(id, title, city, neighborhood, rent_value, status)")
        .eq("agent_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return rows ?? [];
    },
  });

  async function cancel(id: string) {
    if (!confirm("Cancelar esta solicitação?")) return;
    const { error } = await supabase
      .from("property_affiliations")
      .update({ status: "revoked" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Solicitação cancelada");
    qc.invalidateQueries({ queryKey: ["affiliations-agent", userId] });
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground text-sm">
          Você ainda não solicitou afiliação a nenhum imóvel.
          Acesse a página de um imóvel publicado e clique em <strong>Solicitar afiliação</strong>.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((a) => {
        const p = a.properties as { id: string; title: string; city: string; neighborhood: string | null; rent_value: number; status: string } | null;
        return (
          <Card key={a.id}>
            <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="min-w-0">
                <CardTitle className="text-base truncate">{p?.title ?? "Imóvel"}</CardTitle>
                <p className="text-xs text-muted-foreground">{p?.neighborhood ? `${p.neighborhood} · ` : ""}{p?.city}</p>
              </div>
              {statusBadge(a.status as AffiliationStatus)}
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                <span>Dono paga: <strong className="text-foreground">{a.owner_commission_pct}%</strong></span>
                <span>Inquilino paga: <strong className="text-foreground">{a.tenant_commission_pct}%</strong></span>
                {a.can_edit_listing && <span className="text-emerald-700">Permissão para editar</span>}
              </div>
              {a.expires_at && a.status === "approved" && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3" /> Expira em {new Date(a.expires_at).toLocaleDateString("pt-BR")}
                </p>
              )}
              {a.rejected_reason && a.status === "rejected" && (
                <p className="text-xs text-rose-700">Motivo: {a.rejected_reason}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {p && (
                  <Link to="/properties/$id" params={{ id: p.id }}>
                    <Button size="sm" variant="outline">Ver imóvel</Button>
                  </Link>
                )}
                {a.status === "pending" && (
                  <Button size="sm" variant="ghost" onClick={() => cancel(a.id)}>Cancelar</Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------------- Owner view ---------------- */

function OwnerView({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [reviewing, setReviewing] = useState<Affiliation | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["affiliations-owner", userId],
    queryFn: async () => {
      // First fetch user's properties
      const { data: props } = await supabase
        .from("properties").select("id, title, city, neighborhood").eq("owner_id", userId);
      const propIds = (props ?? []).map((p) => p.id);
      if (propIds.length === 0) return { rows: [], propsMap: {} as Record<string, { title: string; city: string; neighborhood: string | null }> };

      const { data: rows, error } = await supabase
        .from("property_affiliations")
        .select("*")
        .in("property_id", propIds)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Load agent profile names from public view
      const agentIds = Array.from(new Set((rows ?? []).map((r) => r.agent_id)));
      const { data: profs } = agentIds.length
        ? await supabase.from("profiles_public" as never).select("id, full_name").in("id", agentIds)
        : { data: [] as Array<{ id: string; full_name: string }> };
      const profsMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name]));

      // Load agent visibility / rating
      const ratings: Record<string, { stars: number; total: number; deals: number }> = {};
      for (const aid of agentIds) {
        const { data: v } = await supabase.rpc("get_agent_visibility", { _agent_id: aid });
        const row = Array.isArray(v) ? v[0] : v;
        if (row) ratings[aid] = { stars: Number(row.avg_stars ?? 0), total: Number(row.total_ratings ?? 0), deals: Number(row.closed_deals ?? 0) };
      }

      const propsMap = Object.fromEntries((props ?? []).map((p) => [p.id, p]));
      return { rows: rows ?? [], propsMap, profsMap, ratings };
    },
  });

  async function reject(id: string) {
    const reason = prompt("Motivo da recusa (opcional):") ?? "";
    const { error } = await supabase
      .from("property_affiliations")
      .update({ status: "rejected", rejected_reason: reason || null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Solicitação recusada");
    qc.invalidateQueries({ queryKey: ["affiliations-owner", userId] });
  }

  async function chatWith(agentId: string, propertyId: string) {
    try {
      const cid = await getOrCreateConversation({ propertyId, otherUserId: agentId });
      // Liberar contatos automaticamente entre dono e agente afiliado
      await supabase.from("conversations").update({ contacts_unlocked: true }).eq("id", cid);
      navigate({ to: "/chat/$id", params: { id: cid } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao abrir chat");
    }
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data || data.rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground text-sm">
          Nenhum pedido de afiliação recebido nos seus imóveis.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {data.rows.map((a) => {
          const prop = data.propsMap[a.property_id];
          const agentName = data.profsMap?.[a.agent_id] ?? "Agente";
          const rating = data.ratings?.[a.agent_id];
          return (
            <Card key={a.id}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{agentName}</CardTitle>
                  <p className="text-xs text-muted-foreground truncate">
                    {prop?.title ?? "Imóvel"} · {prop?.neighborhood ? `${prop.neighborhood}, ` : ""}{prop?.city}
                  </p>
                </div>
                {statusBadge(a.status as AffiliationStatus)}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {rating && (
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>⭐ {rating.stars.toFixed(1)} ({rating.total})</span>
                    <span>{rating.deals} negócios fechados</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span>Dono paga: <strong className="text-foreground">{a.owner_commission_pct}%</strong></span>
                  <span>Inquilino paga: <strong className="text-foreground">{a.tenant_commission_pct}%</strong></span>
                </div>
                {a.message && (
                  <p className="text-sm bg-muted/50 rounded-lg p-2.5 whitespace-pre-wrap">{a.message}</p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {a.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => setReviewing(a as Affiliation)} className="gap-1.5">
                        <Check className="size-4" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => reject(a.id)} className="gap-1.5">
                        <X className="size-4" /> Recusar
                      </Button>
                    </>
                  )}
                  {a.status === "approved" && (
                    <Button size="sm" variant="outline" className="gap-1.5"
                      onClick={() => chatWith(a.agent_id, a.property_id)}>
                      <MessageCircle className="size-4" /> Conversar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {reviewing && (
        <ApproveDialog
          affiliation={reviewing}
          onClose={() => setReviewing(null)}
          onDone={async (approved) => {
            const aff = reviewing;
            setReviewing(null);
            qc.invalidateQueries({ queryKey: ["affiliations-owner", userId] });
            if (approved) {
              await chatWith(aff.agent_id, aff.property_id);
            }
          }}
        />
      )}
    </>
  );
}

function ApproveDialog({ affiliation, onClose, onDone }: {
  affiliation: Affiliation;
  onClose: () => void;
  onDone: (approved: boolean) => Promise<void> | void;
}) {
  const [ownerPct, setOwnerPct] = useState(String(affiliation.owner_commission_pct));
  const [tenantPct, setTenantPct] = useState(String(affiliation.tenant_commission_pct));
  const [canEdit, setCanEdit] = useState(affiliation.can_edit_listing);
  const [phase, setPhase] = useState<"idle" | "approving" | "opening">("idle");

  const busy = phase !== "idle";

  async function approve() {
    setPhase("approving");
    const { error } = await supabase
      .from("property_affiliations")
      .update({
        status: "approved",
        owner_commission_pct: Number(ownerPct) || 0,
        tenant_commission_pct: Number(tenantPct) || 0,
        can_edit_listing: canEdit,
      })
      .eq("id", affiliation.id);

    if (error) {
      setPhase("idle");
      toast.error("Não foi possível aprovar", { description: error.message });
      return;
    }

    toast.success("Afiliação aprovada", { description: "Abrindo o chat com o agente..." });
    setPhase("opening");
    try {
      await onDone(true);
    } catch (e) {
      toast.error("Aprovada, mas houve um erro ao abrir o chat", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
      setPhase("idle");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprovar afiliação</DialogTitle>
          <DialogDescription>
            Ajuste a comissão e as permissões antes de aprovar. Validade automática de 90 dias.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="own">% paga pelo dono</Label>
              <Input id="own" type="number" min={0} max={100} step="0.5" disabled={busy}
                value={ownerPct} onChange={(e) => setOwnerPct(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ten">% paga pelo inquilino</Label>
              <Input id="ten" type="number" min={0} max={100} step="0.5" disabled={busy}
                value={tenantPct} onChange={(e) => setTenantPct(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="edit-perm" className="text-sm">Permitir editar anúncio</Label>
              <p className="text-xs text-muted-foreground">Agente poderá ajustar fotos e descrição.</p>
            </div>
            <Switch id="edit-perm" checked={canEdit} onCheckedChange={setCanEdit} disabled={busy} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={approve} disabled={busy} className="gap-2">
            {phase === "approving" && <Loader2 className="size-4 animate-spin" />}
            {phase === "opening" && <MessageCircle className="size-4 animate-pulse" />}
            {phase === "idle" && "Aprovar"}
            {phase === "approving" && "Aprovando..."}
            {phase === "opening" && "Abrindo chat..."}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
