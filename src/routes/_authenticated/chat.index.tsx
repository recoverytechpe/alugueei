import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({ meta: [{ title: "Conversas | Plataforma de Aluguel" }] }),
  component: ChatList,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
});

type Row = {
  id: string;
  property_id: string;
  initiator_id: string;
  recipient_id: string;
  contacts_unlocked: boolean;
  last_message_at: string | null;
  properties: { id: string; title: string } | null;
};

function ChatList() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { data: rows, error } = await supabase
        .from("conversations")
        .select("id, property_id, initiator_id, recipient_id, contacts_unlocked, last_message_at, properties(id, title)")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;

      const conversations = (rows ?? []) as unknown as Row[];
      const otherIds = Array.from(new Set(conversations.map((c) => (c.initiator_id === u.user!.id ? c.recipient_id : c.initiator_id))));

      const profilesMap: Record<string, string> = {};
      if (otherIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles_public" as never)
          .select("id, full_name")
          .in("id", otherIds);
        for (const p of (profs ?? []) as Array<{ id: string; full_name: string }>) {
          profilesMap[p.id] = p.full_name;
        }
      }

      // unread counts
      const ids = conversations.map((c) => c.id);
      const unread: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("conversation_id, sender_id, read_at")
          .in("conversation_id", ids)
          .is("read_at", null);
        for (const m of msgs ?? []) {
          if (m.sender_id !== u.user.id) unread[m.conversation_id] = (unread[m.conversation_id] ?? 0) + 1;
        }
      }

      return { userId: u.user.id, conversations, profilesMap, unread };
    },
  });

  // Realtime: refetch on new messages
  useEffect(() => {
    const channel = supabase
      .channel("conversations-list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  if (isLoading || !data) {
    return <div className="p-8 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full max-w-2xl" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Conversas</h1>
          <Button asChild variant="outline"><Link to="/dashboard">Voltar</Link></Button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-3">
        {data.conversations.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma conversa ainda. Inicie uma a partir de um imóvel.</p>
        )}
        {data.conversations.map((c) => {
          const otherId = c.initiator_id === data.userId ? c.recipient_id : c.initiator_id;
          const unread = data.unread[c.id] ?? 0;
          return (
            <Link key={c.id} to="/chat/$id" params={{ id: c.id }} className="block">
              <Card className="hover:bg-accent transition">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{data.profilesMap[otherId] ?? "Usuário"}</CardTitle>
                    <CardDescription>
                      {c.properties?.title ?? "Imóvel"} · {c.last_message_at ? new Date(c.last_message_at).toLocaleString("pt-BR") : "sem mensagens"}
                    </CardDescription>
                  </div>
                  {unread > 0 && (
                    <span className="bg-primary text-primary-foreground rounded-full text-xs px-2 py-0.5">{unread}</span>
                  )}
                </CardHeader>
                {c.contacts_unlocked && (
                  <CardContent className="text-xs text-muted-foreground">Contatos liberados</CardContent>
                )}
              </Card>
            </Link>
          );
        })}
      </main>
    </div>
  );
}
