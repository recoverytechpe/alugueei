import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Star } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contracts/")({
  head: () => ({ meta: [{ title: "Meus contratos | Plataforma de Aluguel" }] }),
  component: ContractsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
});

type Contract = {
  id: string;
  status: string;
  owner_id: string;
  tenant_id: string;
  agent_id: string | null;
  created_at: string;
  properties: { id: string; title: string } | null;
};

function ContractsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-contracts"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { data: contracts, error } = await supabase
        .from("rental_contracts")
        .select("id, status, owner_id, tenant_id, agent_id, created_at, properties(id, title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { data: ratings } = await supabase
        .from("agent_ratings")
        .select("contract_id, stars, comment")
        .eq("rater_id", u.user.id);
      const ratingsByContract: Record<string, { stars: number; comment: string }> = {};
      for (const r of ratings ?? []) ratingsByContract[r.contract_id] = { stars: r.stars, comment: r.comment };

      const { data: tRatings } = await supabase
        .from("tenant_ratings" as never)
        .select("contract_id, stars, comment")
        .eq("rater_id", u.user.id);
      const tenantRatingsByContract: Record<string, { stars: number; comment: string }> = {};
      for (const r of (tRatings ?? []) as Array<{ contract_id: string; stars: number; comment: string }>) {
        tenantRatingsByContract[r.contract_id] = { stars: r.stars, comment: r.comment };
      }

      return { userId: u.user.id, contracts: (contracts ?? []) as unknown as Contract[], ratingsByContract, tenantRatingsByContract };
    },
  });


  if (isLoading || !data) {
    return <div className="p-8 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full max-w-2xl" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Meus contratos</h1>
          <Button asChild variant="outline"><Link to="/dashboard">Voltar</Link></Button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {data.contracts.length === 0 && (
          <p className="text-sm text-muted-foreground">Você ainda não tem contratos.</p>
        )}
        {data.contracts.map((c) => (
          <ContractCard
            key={c.id}
            contract={c}
            userId={data.userId}
            existing={data.ratingsByContract[c.id]}
            existingTenantRating={data.tenantRatingsByContract[c.id]}
            onSaved={() => qc.invalidateQueries({ queryKey: ["my-contracts"] })}
          />
        ))}

      </main>
    </div>
  );
}

function ContractCard({
  contract, userId, existing, existingTenantRating, onSaved,
}: {
  contract: Contract;
  userId: string;
  existing?: { stars: number; comment: string };
  existingTenantRating?: { stars: number; comment: string };
  onSaved: () => void;
}) {

  const canRate =
    contract.status === "closed" &&
    contract.agent_id &&
    (userId === contract.owner_id || userId === contract.tenant_id);

  const [stars, setStars] = useState(existing?.stars ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (stars < 1 || stars > 5) return toast.error("Selecione de 1 a 5 estrelas");
    if (!contract.agent_id) return;
    setSaving(true);
    const { error } = await supabase.from("agent_ratings").upsert(
      {
        contract_id: contract.id,
        agent_id: contract.agent_id,
        rater_id: userId,
        stars,
        comment: comment.trim().slice(0, 1000),
      },
      { onConflict: "contract_id,rater_id" }
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(existing ? "Avaliação atualizada" : "Avaliação enviada");
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{contract.properties?.title ?? "Imóvel"}</CardTitle>
        <CardDescription>
          Status: {contract.status} · {new Date(contract.created_at).toLocaleDateString("pt-BR")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          <Button asChild size="sm" variant="outline">
            <Link to="/contracts/$id" params={{ id: contract.id }}>Abrir contrato</Link>
          </Button>
          {contract.agent_id && (
            <Button asChild size="sm" variant="ghost">
              <Link to="/users/$id" params={{ id: contract.agent_id }}>Perfil do agente</Link>
            </Button>
          )}
        </div>
        {canRate ? (
          <form onSubmit={submit} className="space-y-3 border-t pt-3">
            <div>
              <p className="text-sm font-medium mb-1">
                {existing ? "Atualizar avaliação do agente" : "Avaliar o agente"}
              </p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStars(n)}
                    aria-label={`${n} estrelas`}
                    className="p-1"
                  >
                    <Star className={`h-6 w-6 ${n <= stars ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              rows={3}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comente sua experiência (opcional)"
            />
            <Button type="submit" disabled={saving}>{saving ? "Enviando..." : "Enviar avaliação"}</Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            {contract.status === "closed"
              ? "Avaliação disponível apenas para proprietário e locatário."
              : "Avaliação liberada após o contrato ser fechado."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
