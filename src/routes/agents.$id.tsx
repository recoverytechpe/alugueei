import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Award, CheckCircle2, ArrowLeft } from "lucide-react";
import { getSignedAvatarUrl } from "@/lib/profile-helpers";

type PublicAgent = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  member_since: string;
  avg_stars: number;
  total_ratings: number;
  closed_deals: number;
  ratings: { stars: number; comment: string | null; created_at: string }[];
};

const agentQuery = (id: string) =>
  queryOptions({
    queryKey: ["public-agent", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_agent_profile" as never, {
        _agent_id: id,
      } as never);
      if (error) throw error;
      if (!data) throw notFound();
      const agent = data as unknown as PublicAgent;
      const avatar = await getSignedAvatarUrl(agent.avatar_url);
      return { agent, avatar };
    },
  });

export const Route = createFileRoute("/agents/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(agentQuery(params.id)),
  head: ({ loaderData }) => {
    const a = (loaderData as { agent?: PublicAgent } | undefined)?.agent;
    const name = a?.full_name ?? "Agente imobiliário";
    const desc = a
      ? `${name} · ${a.closed_deals} fechamento(s) · ${a.avg_stars.toFixed(1)}★ (${a.total_ratings} avaliações)`
      : "Perfil público de agente imobiliário";
    return {
      meta: [
        { title: `${name} · Agente imobiliário` },
        { name: "description", content: desc },
        { property: "og:title", content: `${name} · Agente imobiliário` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: PublicAgentPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center text-center p-8">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Agente não encontrado</h1>
        <p className="text-muted-foreground mb-4">Este perfil não existe ou não é um agente.</p>
        <Button asChild variant="outline"><Link to="/">Voltar ao início</Link></Button>
      </div>
    </div>
  ),
});

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value.toFixed(1)} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-4 w-4 ${n <= Math.round(value) ? "fill-primary text-primary" : "text-muted-foreground"}`}
        />
      ))}
    </div>
  );
}

function PublicAgentPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(agentQuery(id));
  const { agent, avatar } = data;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link to="/"><ArrowLeft className="size-4 mr-1" /> Início</Link>
          </Button>
          <h1 className="text-sm text-muted-foreground">Perfil público</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <Avatar className="h-20 w-20">
              {avatar && <AvatarImage src={avatar} alt={agent.full_name} />}
              <AvatarFallback>{agent.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="truncate">{agent.full_name}</CardTitle>
              <CardDescription>Agente imobiliário</CardDescription>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Stars value={Number(agent.avg_stars)} />
                <span className="text-sm text-muted-foreground">
                  {Number(agent.avg_stars).toFixed(1)} ({agent.total_ratings}{" "}
                  {agent.total_ratings === 1 ? "avaliação" : "avaliações"})
                </span>
              </div>
            </div>
          </CardHeader>
          {agent.bio && (
            <CardContent>
              <p className="text-sm whitespace-pre-line">{agent.bio}</p>
            </CardContent>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Award className="size-4" /> Contratos intermediados
              </div>
              <div className="text-2xl font-semibold mt-1">{agent.closed_deals}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <CheckCircle2 className="size-4" /> Reputação
              </div>
              <div className="text-2xl font-semibold mt-1">
                {Number(agent.avg_stars).toFixed(1)}
                <span className="text-sm text-muted-foreground font-normal"> / 5</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avaliações recentes</CardTitle>
            <CardDescription>Feedback de proprietários e locatários após aluguéis fechados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {agent.ratings.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda sem avaliações públicas.</p>
            ) : (
              agent.ratings.map((r, i) => (
                <div key={i} className="border rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <Stars value={r.stars} />
                    <Badge variant="outline" className="text-xs">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </Badge>
                  </div>
                  {r.comment && <p className="text-sm mt-2 whitespace-pre-line">{r.comment}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground pt-4">
          <Link to="/auth" className="underline">Entrar</Link> para contratar este agente ou solicitar afiliação.
        </div>
      </main>
    </div>
  );
}
