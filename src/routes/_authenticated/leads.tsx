import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, MapPin, Users, Send, Search } from "lucide-react";
import { toast } from "sonner";

type Lead = {
  id: string;
  initials: string;
  city: string | null;
  income_bucket: string;
  guarantee_type: string;
  created_at: string;
};

const GUARANTEE_LABEL: Record<string, string> = {
  fiador: "Fiador",
  seguro_fianca: "Seguro fiança",
  caucao: "Caução",
  titulo_capitalizacao: "Título de capitalização",
};

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads pré-aprovados | Plataforma de Aluguel" }] }),
  component: LeadsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
});

function LeadsPage() {
  const [cityInput, setCityInput] = useState("");
  const [city, setCity] = useState("");
  const [contacted, setContacted] = useState<Record<string, boolean>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["preapproval-leads", city],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_preapproval_leads" as never, {
        _city: city || null,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Lead[];
    },
  });

  async function signal(leadId: string) {
    const { error } = await supabase.rpc("agent_signal_interest" as never, {
      _lead_id: leadId,
    } as never);
    if (error) {
      toast.error(error.message);
      return;
    }
    setContacted((s) => ({ ...s, [leadId]: true }));
    toast.success("Interesse enviado. O inquilino recebeu uma notificação com seu perfil.");
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard"><ArrowLeft className="size-4 mr-1" /> Voltar</Link>
        </Button>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Users className="size-6" /> Leads pré-aprovados
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prospectar inquilinos</CardTitle>
          <CardDescription>
            Inquilinos que solicitaram pré-aprovação e aceitaram ser encontrados por agentes.
            Identidade e contato só são compartilhados após a resposta deles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setCity(cityInput.trim());
              refetch();
            }}
          >
            <Input
              placeholder="Filtrar por cidade (ex: São Paulo)"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
            />
            <Button type="submit"><Search className="size-4 mr-1" /> Buscar</Button>
            {city && (
              <Button type="button" variant="ghost" onClick={() => { setCityInput(""); setCity(""); }}>
                Limpar
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : (data ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum lead disponível{city ? ` em "${city}"` : ""} agora.
            Volte em breve — pré-aprovações novas aparecem aqui automaticamente.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {(data ?? []).map((l) => {
            const done = contacted[l.id];
            return (
              <Card key={l.id}>
                <CardContent className="p-4 flex flex-wrap items-center gap-4">
                  <div className="size-12 rounded-full bg-primary/10 text-primary font-semibold grid place-items-center">
                    {l.initials || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">Inquilino pré-aprovado</p>
                      <Badge variant="secondary">{l.income_bucket}</Badge>
                      <Badge variant="outline">{GUARANTEE_LABEL[l.guarantee_type] ?? l.guarantee_type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="size-3" /> {l.city ?? "Cidade não informada"} · há{" "}
                      {Math.max(1, Math.round((Date.now() - new Date(l.created_at).getTime()) / 86400000))}d
                    </p>
                  </div>
                  <Button size="sm" onClick={() => signal(l.id)} disabled={done}>
                    <Send className="size-4 mr-1" /> {done ? "Enviado" : "Manifestar interesse"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
