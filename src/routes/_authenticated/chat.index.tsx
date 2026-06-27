import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Archive, ArchiveRestore, Ban, ShieldOff } from "lucide-react";
import { toast } from "sonner";

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
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const me = u.user.id;
      const { data: rows, error } = await supabase
        .from("conversations")
        .select("id, property_id, initiator_id, recipient_id, contacts_unlocked, last_message_at, properties(id, title)")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      const conversations = (rows ?? []) as unknown as Row[];

      const otherIds = Array.from(new Set(conversations.map((c) => (c.initiator_id === me ? c.recipient_id : c.initiator_id))));
      const profilesMap: Record<string, string> = {};
      if (otherIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles_public" as never)
          .select("id, full_name")
          .in("id", otherIds);
        for (const p of (profs ?? []) as Array<{ id: string; full_name: string }>) profilesMap[p.id] = p.full_name;
      }

      const ids = conversations.map((c) => c.id);
      const unread: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: msgs } = await supabase
          .from("messages").select("conversation_id, sender_id, read_at")
          .in("conversation_id", ids).is("read_at", null);
        for (const m of msgs ?? []) if (m.sender_id !== me) unread[m.conversation_id] = (unread[m.conversation_id] ?? 0) + 1;
      }

      const { data: arch } = await supabase
        .from("conversation_archives" as never).select("conversation_id").eq("user_id", me);
      const archived = new Set((arch ?? []).map((a: { conversation_id: string }) => a.conversation_id));

      const { data: blk } = await supabase
        .from("user_blocks" as never).select("blocked_id").eq("blocker_id", me);
      const blocked = new Set((blk ?? []).map((b: { blocked_id: string }) => b.blocked_id));

      return { userId: me, conversations, profilesMap, unread, archived, blocked };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("conversations-list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  async function toggleArchive(convId: string, archived: boolean) {
    if (archived) {
      await supabase.from("conversation_archives" as never).delete().eq("conversation_id", convId).eq("user_id", data!.userId);
      toast.success("Conversa restaurada");
    } else {
      await supabase.from("conversation_archives" as never).insert({ conversation_id: convId, user_id: data!.userId } as never);
      toast.success("Conversa arquivada");
    }
    qc.invalidateQueries({ queryKey: ["conversations"] });
  }

  async function toggleBlock(otherId: string, isBlocked: boolean) {
    if (isBlocked) {
      await supabase.from("user_blocks" as never).delete().eq("blocker_id", data!.userId).eq("blocked_id", otherId);
      toast.success("Usuário desbloqueado");
    } else {
      if (!confirm("Bloquear este usuário? Ele não poderá mais te enviar mensagens.")) return;
      await supabase.from("user_blocks" as never).insert({ blocker_id: data!.userId, blocked_id: otherId } as never);
      toast.success("Usuário bloqueado");
    }
    qc.invalidateQueries({ queryKey: ["conversations"] });
  }

  if (isLoading || !data) {
    return <div className="p-8 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full max-w-2xl" /></div>;
  }

  const active = data.conversations.filter((c) => !data.archived.has(c.id));
  const archivedRows = data.conversations.filter((c) => data.archived.has(c.id));

  const renderRow = (c: Row) => {
    const otherId = c.initiator_id === data.userId ? c.recipient_id : c.initiator_id;
    const unread = data.unread[c.id] ?? 0;
    const isArchived = data.archived.has(c.id);
    const isBlocked = data.blocked.has(otherId);

    return (
      <Card key={c.id} className={isBlocked ? "opacity-60" : ""}>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <Link to="/chat/$id" params={{ id: c.id }} className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{data.profilesMap[otherId] ?? "Usuário"}</CardTitle>
            <CardDescription className="truncate">
              {c.properties?.title ?? "Imóvel"} · {c.last_message_at ? new Date(c.last_message_at).toLocaleString("pt-BR") : "sem mensagens"}
            </CardDescription>
          </Link>
          {unread > 0 && <span className="bg-primary text-primary-foreground rounded-full text-xs px-2 py-0.5">{unread}</span>}
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap pt-0">
          <Button size="sm" variant="outline" onClick={() => toggleArchive(c.id, isArchived)}>
            {isArchived ? <><ArchiveRestore className="size-4 mr-1.5" /> Desarquivar</> : <><Archive className="size-4 mr-1.5" /> Arquivar</>}
          </Button>
          <Button size="sm" variant={isBlocked ? "outline" : "ghost"} onClick={() => toggleBlock(otherId, isBlocked)}>
            {isBlocked ? <><ShieldOff className="size-4 mr-1.5" /> Desbloquear</> : <><Ban className="size-4 mr-1.5" /> Bloquear</>}
          </Button>
          {c.contacts_unlocked && <span className="text-xs text-muted-foreground self-center">Contatos liberados</span>}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Conversas</h1>
          <Button asChild variant="outline"><Link to="/dashboard">Voltar</Link></Button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">Ativas ({active.length})</TabsTrigger>
            <TabsTrigger value="archived">Arquivadas ({archivedRows.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="space-y-3 mt-4">
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma conversa ativa.</p>
            ) : active.map(renderRow)}
          </TabsContent>
          <TabsContent value="archived" className="space-y-3 mt-4">
            {archivedRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma conversa arquivada.</p>
            ) : archivedRows.map(renderRow)}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
