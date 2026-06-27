import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/property-helpers";
import { toast } from "sonner";
import { ArrowLeft, DollarSign, TrendingUp, Users, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/financials")({
  head: () => ({ meta: [{ title: "Painel financeiro | Plataforma de Aluguel" }] }),
  component: FinancialsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
});

type Row = {
  id: string;
  status: string;
  owner_id: string;
  agent_id: string | null;
  rent_value: number | null;
  agent_commission_pct: number;
  agent_commission_paid_at: string | null;
  properties: { title: string } | null;
  payments: { amount: number; status: string; kind: string; created_at: string }[];
};

function FinancialsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["financials"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { data: contracts, error } = await supabase
        .from("rental_contracts")
        .select(
          "id, status, owner_id, agent_id, rent_value, agent_commission_pct, agent_commission_paid_at, properties(title), payments(amount, status, kind, created_at)",
        )
        .eq("owner_id", u.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (contracts ?? []) as unknown as Row[];
    },
  });

  const totals = useMemo(() => {
    const all = data ?? [];
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    let received = 0;
    let pending = 0;
    let commissionOwed = 0;
    let commissionPaid = 0;

    for (const c of all) {
      for (const p of c.payments ?? []) {
        const amt = Number(p.amount) || 0;
        const dt = new Date(p.created_at);
        if (p.status === "approved" || p.status === "paid") {
          if (dt >= monthStart) received += amt;
        } else if (p.status === "pending") {
          pending += amt;
        }
      }
      if (c.agent_id) {
        const rent = Number(c.rent_value) || 0;
        const pct = Number(c.agent_commission_pct) || 0;
        const com = (rent * pct) / 100;
        if (c.agent_commission_paid_at) commissionPaid += com;
        else commissionOwed += com;
      }
    }
    return { received, pending, commissionOwed, commissionPaid };
  }, [data]);

  async function markPaid(contractId: string) {
    const { markAgentCommissionPaid } = await import("@/lib/protected-rpcs.functions");
    const result = await markAgentCommissionPaid({ data: { contractId } });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Comissão marcada como paga.");
    qc.invalidateQueries({ queryKey: ["financials"] });
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard"><ArrowLeft className="size-4 mr-1" /> Voltar</Link>
        </Button>
        <h1 className="text-2xl font-semibold">Painel financeiro</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<DollarSign className="size-4" />} label="Recebido (mês)" value={formatBRL(totals.received)} />
        <StatCard icon={<TrendingUp className="size-4" />} label="A receber" value={formatBRL(totals.pending)} />
        <StatCard icon={<Users className="size-4" />} label="Comissão a pagar" value={formatBRL(totals.commissionOwed)} />
        <StatCard icon={<CheckCircle2 className="size-4" />} label="Comissão paga" value={formatBRL(totals.commissionPaid)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comissões do agente por contrato</CardTitle>
          <CardDescription>
            Calculado como {`rent × %`} configurado no contrato (padrão 5%).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (data ?? []).filter((c) => c.agent_id).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum contrato com agente vinculado.</p>
          ) : (
            (data ?? [])
              .filter((c) => c.agent_id)
              .map((c) => {
                const rent = Number(c.rent_value) || 0;
                const pct = Number(c.agent_commission_pct) || 0;
                const com = (rent * pct) / 100;
                const paid = !!c.agent_commission_paid_at;
                return (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.properties?.title ?? "Imóvel"}</p>
                      <p className="text-xs text-muted-foreground">
                        Aluguel {formatBRL(rent)} · {pct}% = <strong>{formatBRL(com)}</strong>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {paid ? (
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          Paga
                        </Badge>
                      ) : (
                        <Button size="sm" onClick={() => markPaid(c.id)}>
                          Marcar como paga
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recebíveis por contrato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem contratos.</p>
          ) : (
            (data ?? []).map((c) => {
              const received = (c.payments ?? [])
                .filter((p) => p.status === "approved" || p.status === "paid")
                .reduce((s, p) => s + (Number(p.amount) || 0), 0);
              const pending = (c.payments ?? [])
                .filter((p) => p.status === "pending")
                .reduce((s, p) => s + (Number(p.amount) || 0), 0);
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.properties?.title ?? "Imóvel"}</p>
                    <p className="text-xs text-muted-foreground">Status: {c.status}</p>
                  </div>
                  <div className="text-right text-sm">
                    <div>Recebido: <strong>{formatBRL(received)}</strong></div>
                    <div className="text-muted-foreground">Pendente: {formatBRL(pending)}</div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
