import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Archive, ArchiveRestore, Ban, ShieldOff, MessageCircle } from "lucide-react";
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

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: sameYear ? undefined : "2-digit" });
}

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
      const preview: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: msgs } = await supabase
          .from("messages").select("conversation_id, sender_id, read_at, body, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false });
        for (const m of msgs ?? []) {
          if (m.sender_id !== me && !m.read_at) unread[m.conversation_id] = (unread[m.conversation_id] ?? 0) + 1;
          if (!preview[m.conversation_id]) preview[m.conversation_id] = (m.body as string) ?? "";
        }
      }

      const { data: arch } = await supabase
        .from("conversation_archives" as never).select("conversation_id").eq("user_id", me);
      const archived = new Set((arch ?? []).map((a: { conversation_id: string }) => a.conversation_id));

      const { data: blk } = await supabase
        .from("user_blocks" as never).select("blocked_id").eq("blocker_id", me);
      const blocked = new Set((blk ?? []).map((b: { blocked_id: string }) => b.blocked_id));

      return { userId: me, conversations, profilesMap, unread, preview, archived, blocked };
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
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-4 space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    );
  }

  const active = data.conversations.filter((c) => !data.archived.has(c.id));
  const archivedRows = data.conversations.filter((c) => data.archived.has(c.id));

  const renderRow = (c: Row) => {
    const otherId = c.initiator_id === data.userId ? c.recipient_id : c.initiator_id;
    const name = data.profilesMap[otherId] ?? "Usuário";
    const unread = data.unread[c.id] ?? 0;
    const isArchived = data.archived.has(c.id);
    const isBlocked = data.blocked.has(otherId);
    const initials = name.split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

    return (
      <div
        key={c.id}
        className={`group relative rounded-2xl bg-card shadow-[var(--shadow-card)] hover:shadow-md transition-shadow ${isBlocked ? "opacity-60" : ""}`}
      >
        <Link to="/chat/$id" params={{ id: c.id }} className="flex items-center gap-3 p-3 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
              {initials || "?"}
            </div>
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold px-1.5 flex items-center justify-center">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className={`text-sm truncate ${unread > 0 ? "font-bold text-foreground" : "font-semibold text-foreground"}`}>{name}</p>
              <span className="text-[11px] text-muted-foreground flex-shrink-0">{timeAgo(c.last_message_at)}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{c.properties?.title ?? "Imóvel"}</p>
            <p className={`text-xs truncate mt-0.5 ${unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {data.preview[c.id] || "Sem mensagens ainda"}
            </p>
          </div>
        </Link>
        <div className="flex gap-1 px-3 pb-2">
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => toggleArchive(c.id, isArchived)}>
            {isArchived ? <><ArchiveRestore className="size-3.5 mr-1" /> Desarquivar</> : <><Archive className="size-3.5 mr-1" /> Arquivar</>}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => toggleBlock(otherId, isBlocked)}>
            {isBlocked ? <><ShieldOff className="size-3.5 mr-1" /> Desbloquear</> : <><Ban className="size-3.5 mr-1" /> Bloquear</>}
          </Button>
          {c.contacts_unlocked && <span className="text-[10px] text-primary self-center ml-auto font-medium">Contatos liberados</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center gap-2">
        <MessageCircle className="size-5 text-primary" />
        <h1 className="text-xl font-bold leading-tight">Conversas</h1>
      </div>

      <Tabs defaultValue="active">
        <TabsList className="w-full grid grid-cols-2 bg-surface-muted h-11 rounded-full p-1">
          <TabsTrigger value="active" className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-[var(--shadow-card)]">Ativas ({active.length})</TabsTrigger>
          <TabsTrigger value="archived" className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-[var(--shadow-card)]">Arquivadas ({archivedRows.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="space-y-2.5 mt-4">
          {active.length === 0 ? (
            <div className="rounded-2xl bg-card p-8 text-center space-y-2 shadow-[var(--shadow-card)]">
              <MessageCircle className="size-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma conversa ativa.</p>
            </div>
          ) : active.map(renderRow)}
        </TabsContent>
        <TabsContent value="archived" className="space-y-2.5 mt-4">
          {archivedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma conversa arquivada.</p>
          ) : archivedRows.map(renderRow)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
