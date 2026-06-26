import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Plataforma de Aluguel" },
      { name: "description", content: "Conectamos Proprietários, Locatários e Agentes de Localização em uma única plataforma." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Plataforma de Aluguel
        </h1>
        <p className="text-lg text-muted-foreground">
          Intermediação simples entre Proprietários, Locatários e Agentes de Localização.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Entrar ou Cadastrar</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/dashboard">Ir para o painel</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
