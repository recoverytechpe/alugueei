import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | Plataforma de Aluguel" }] }),
  component: Dashboard,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Não encontrado</div>,
});

type Role = "proprietario" | "locatario" | "agente";

const ROLE_META: Record<Role, { title: string; description: string; actions: string[] }> = {
  proprietario: {
    title: "Painel do Proprietário",
    description: "Gerencie seus imóveis, contratos e recebimentos.",
    actions: ["Cadastrar imóvel", "Ver contratos", "Acompanhar pagamentos"],
  },
  locatario: {
    title: "Painel do Locatário",
    description: "Encontre imóveis, acompanhe propostas e contratos.",
    actions: ["Buscar imóveis", "Minhas propostas", "Meus contratos"],
  },
  agente: {
    title: "Painel do Agente",
    description: "Capte imóveis e acompanhe suas comissões.",
    actions: ["Cadastrar imóvel captado", "Minhas captações", "Comissões"],
  },
};

function Dashboard() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sem sessão");
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userData.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userData.user.id),
      ]);
      return {
        email: userData.user.email,
        profile,
        role: (roles?.[0]?.role ?? "locatario") as Role,
      };
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/auth" });
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background p-8 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full max-w-2xl" />
      </div>
    );
  }

  const meta = ROLE_META[data.role];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{meta.title}</h1>
            <p className="text-sm text-muted-foreground">
              {data.profile?.full_name ?? data.email}
            </p>
          </div>
          <Button variant="outline" onClick={signOut}>Sair</Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Bem-vindo</CardTitle>
            <CardDescription>{meta.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild><Link to="/properties">Ver imóveis</Link></Button>
            {data.role === "proprietario" && (
              <Button asChild variant="outline"><Link to="/properties/new">Cadastrar imóvel</Link></Button>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {meta.actions.map((label) => (
            <Card key={label} className="opacity-70">
              <CardHeader>
                <CardTitle className="text-base">{label}</CardTitle>
                <CardDescription>Em breve</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
