import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Moderação | Plataforma de Aluguel" }] }),
  component: AdminPanel,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Não encontrado</div>,
});

function AdminPanel() {
  const qc = useQueryClient();

  const { data: isAdmin, isLoading: checkingRole } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin" as never)
        .maybeSingle();
      return Boolean(data);
    },
  });

  const { data: alerts, isLoading: loadingAlerts } = useQuery({
    queryKey: ["mod-alerts"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase as never as {
        from: (t: string) => {
          select: (q: string) => {
            order: (c: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: ModAlert[] | null; error: Error | null }>;
            };
          };
        };
      })
        .from("moderation_alerts")
        .select("id, conversation_id, message_id, sender_id, reason, excerpt, severity, status, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contracts } = useQuery({
    queryKey: ["admin-contracts"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rental_contracts")
        .select("id, status, rent_value, created_at, property_id")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: proposals } = useQuery({
    queryKey: ["admin-proposals"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("id, status, rent_offer, created_at, property_id")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: reports, isLoading: loadingReports } = useQuery({
    queryKey: ["admin-reports"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, reporter_id, target_type, target_id, reason, details, status, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateReport = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "reviewing" | "resolved" | "dismissed" }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("reports")
        .update({
          status,
          resolved_at: new Date().toISOString(),
          resolved_by: u.user?.id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Denúncia atualizada");
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("moderation_alerts_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "moderation_alerts" }, () => {
        qc.invalidateQueries({ queryKey: ["mod-alerts"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, qc]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "reviewed" | "dismissed" }) => {
      const { error } = await (supabase as never as {
        from: (t: string) => {
          update: (v: { status: string }) => {
            eq: (c: string, v: string) => Promise<{ error: Error | null }>;
          };
        };
      })
        .from("moderation_alerts")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alerta atualizado");
      qc.invalidateQueries({ queryKey: ["mod-alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (checkingRole) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Skeleton className="h-10 w-64" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background p-8 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">Acesso restrito</h1>
        <p className="text-muted-foreground">
          Este painel é exclusivo para administradores da plataforma.
        </p>
        <Button asChild variant="outline"><Link to="/dashboard">Voltar</Link></Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Painel de Moderação</h1>
          <Button asChild variant="outline"><Link to="/dashboard">Dashboard</Link></Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-3">Alertas anti-bypass</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Mensagens do chat que mencionam contatos externos ou pagamentos fora da plataforma.
          </p>
          {loadingAlerts ? (
            <Skeleton className="h-32 w-full" />
          ) : !alerts || alerts.length === 0 ? (
            <Card><CardContent className="py-6 text-sm text-muted-foreground">Nenhum alerta no momento.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {alerts.map((a) => (
                <Card key={a.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Badge variant={a.severity === "high" ? "destructive" : "secondary"}>
                          {a.severity}
                        </Badge>
                        <Badge variant="outline">{a.status}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      {a.status === "open" && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: a.id, status: "reviewed" })}>
                            Marcar revisado
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ id: a.id, status: "dismissed" })}>
                            Descartar
                          </Button>
                        </div>
                      )}
                    </div>
                    <CardTitle className="text-sm font-medium pt-1">{a.reason}</CardTitle>
                    <CardDescription className="text-xs">
                      Conversa: {a.conversation_id?.slice(0, 8)} · Remetente: {a.sender_id.slice(0, 8)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm bg-muted/40 p-3 rounded">&ldquo;{a.excerpt}&rdquo;</p>
                    {a.conversation_id && (
                      <Link to="/chat/$id" params={{ id: a.conversation_id }} className="text-xs text-primary hover:underline mt-2 inline-block">
                        Abrir conversa →
                      </Link>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Denúncias de usuários</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Reportes feitos por usuários sobre imóveis ou perfis.
          </p>
          {loadingReports ? (
            <Skeleton className="h-32 w-full" />
          ) : !reports || reports.length === 0 ? (
            <Card><CardContent className="py-6 text-sm text-muted-foreground">Nenhuma denúncia.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <Card key={r.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Badge variant={r.status === "pending" ? "destructive" : "outline"}>{r.status}</Badge>
                        <Badge variant="secondary">{r.target_type === "property" ? "imóvel" : "usuário"}</Badge>
                        <Badge variant="outline">{r.reason}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      {(r.status === "pending" || r.status === "reviewing") && (
                        <div className="flex gap-2">
                          {r.status === "pending" && (
                            <Button size="sm" variant="outline" onClick={() => updateReport.mutate({ id: r.id, status: "reviewing" })}>
                              Em análise
                            </Button>
                          )}
                          <Button size="sm" variant="default" onClick={() => updateReport.mutate({ id: r.id, status: "resolved" })}>
                            Resolver
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => updateReport.mutate({ id: r.id, status: "dismissed" })}>
                            Descartar
                          </Button>
                        </div>
                      )}
                    </div>
                    <CardDescription className="text-xs pt-1">
                      Alvo: {r.target_id.slice(0, 8)} · Denunciante: {r.reporter_id.slice(0, 8)}
                      {r.target_type === "property" && (
                        <> · <Link to="/properties/$id" params={{ id: r.target_id }} className="text-primary hover:underline">abrir imóvel</Link></>
                      )}
                      {r.target_type === "user" && (
                        <> · <Link to="/users/$id" params={{ id: r.target_id }} className="text-primary hover:underline">abrir perfil</Link></>
                      )}
                    </CardDescription>
                  </CardHeader>
                  {r.details && (
                    <CardContent>
                      <p className="text-sm bg-muted/40 p-3 rounded whitespace-pre-line">{r.details}</p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="text-xl font-semibold mb-3">Negociações recentes</h2>
            <Card>
              <CardContent className="py-4 space-y-2">
                {!proposals || proposals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem propostas.</p>
                ) : (
                  proposals.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-b-0">
                      <span>R$ {Number(p.rent_offer).toFixed(2)}</span>
                      <Badge variant="outline">{p.status}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contratos recentes</h2>
            <Card>
              <CardContent className="py-4 space-y-2">
                {!contracts || contracts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem contratos.</p>
                ) : (
                  contracts.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-b-0">
                      <span>R$ {Number(c.rent_value).toFixed(2)}</span>
                      <Badge variant={c.status === "closed" ? "default" : "outline"}>{c.status}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}

type ModAlert = {
  id: string;
  conversation_id: string | null;
  message_id: string | null;
  sender_id: string;
  reason: string;
  excerpt: string;
  severity: string;
  status: string;
  created_at: string;
};
