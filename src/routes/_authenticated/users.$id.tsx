import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Star } from "lucide-react";
import { getSignedAvatarUrl, ROLE_LABEL } from "@/lib/profile-helpers";
import { ReportDialog } from "@/components/ReportDialog";

export const Route = createFileRoute("/_authenticated/users/$id")({
  head: ({ params }) => ({ meta: [{ title: `Perfil ${params.id.slice(0, 8)} | Plataforma de Aluguel` }] }),
  component: PublicProfile,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Usuário não encontrado</div>,
});

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value.toFixed(1)} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-4 w-4 ${n <= Math.round(value) ? "fill-primary text-primary" : "text-muted-foreground"}`} />
      ))}
    </div>
  );
}

function PublicProfile() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["public-profile", id],
    queryFn: async () => {
      const [{ data: profile }, { data: roles }, { data: rating }, { data: ratings }] = await Promise.all([
        supabase.from("profiles_public" as never).select("*").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id),
        supabase.rpc("get_agent_rating", { _agent_id: id }),
        supabase.from("agent_ratings").select("id, stars, comment, created_at, rater_id").eq("agent_id", id).order("created_at", { ascending: false }).limit(20),
      ]);
      const p = profile as { id: string; full_name: string; avatar_url: string | null; bio: string | null } | null;
      const avatar = await getSignedAvatarUrl(p?.avatar_url);
      const agg = Array.isArray(rating) ? rating[0] : rating;
      return {
        profile: p,
        avatar,
        role: roles?.[0]?.role,
        avg: Number(agg?.avg_stars ?? 0),
        total: Number(agg?.total_ratings ?? 0),
        ratings: ratings ?? [],
      };
    },
  });

  if (isLoading || !data) {
    return <div className="p-8 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full max-w-2xl" /></div>;
  }
  if (!data.profile) {
    return <div className="p-8 text-center text-muted-foreground">Usuário não encontrado.</div>;
  }

  const isAgent = data.role === "agente";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Perfil público</h1>
          <Button asChild variant="outline"><Link to="/dashboard">Voltar</Link></Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <Avatar className="h-20 w-20">
              {data.avatar && <AvatarImage src={data.avatar} alt={data.profile.full_name} />}
              <AvatarFallback>{data.profile.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle>{data.profile.full_name}</CardTitle>
              <CardDescription>{ROLE_LABEL[data.role ?? ""] ?? "Usuário"}</CardDescription>
              {isAgent && (
                <div className="mt-2 flex items-center gap-2">
                  <Stars value={data.avg} />
                  <span className="text-sm text-muted-foreground">
                    {data.avg.toFixed(1)} ({data.total} {data.total === 1 ? "avaliação" : "avaliações"})
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
          {data.profile.bio && (
            <CardContent><p className="text-sm whitespace-pre-line">{data.profile.bio}</p></CardContent>
          )}
        </Card>

        {isAgent && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Avaliações recentes</CardTitle>
              <CardDescription>Feedback de proprietários e locatários após aluguéis fechados.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.ratings.length === 0 && (
                <p className="text-sm text-muted-foreground">Ainda sem avaliações.</p>
              )}
              {data.ratings.map((r) => (
                <div key={r.id} className="border rounded-md p-3">
                  <Stars value={r.stars} />
                  {r.comment && <p className="text-sm mt-2 whitespace-pre-line">{r.comment}</p>}
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
