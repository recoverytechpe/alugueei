import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { maskContacts } from "@/lib/chat-helpers";
import { ChevronLeft, MoreVertical, ShieldCheck, Camera, Send, CheckCheck, Check, Home as HomeIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat/$id")({
  head: () => ({ meta: [{ title: "Conversa | Plataforma de Aluguel" }] }),
  component: ChatThread,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Conversa não encontrada</div>,
});

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

function ChatThread() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["conversation", id],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { data: conv, error } = await supabase
        .from("conversations")
        .select("*, properties(id, title, owner_id)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!conv) return null;
      const otherId = conv.initiator_id === u.user.id ? conv.recipient_id : conv.initiator_id;
      const { data: prof } = await supabase
        .from("profiles_public" as never)
        .select("id, full_name")
        .eq("id", otherId)
        .maybeSingle();
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });
      return {
        userId: u.user.id,
        conv,
        other: prof as { id: string; full_name: string } | null,
        messages: (msgs ?? []) as Message[],
      };
    },
  });

  // Realtime subscription for this conversation
  useEffect(() => {
    const channel = supabase
      .channel(`conv-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["conversation", id] })
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["conversation", id] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, qc]);

  // Auto-scroll + mark unread incoming as read
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    if (!data) return;
    const unreadIds = data.messages
      .filter((m) => m.sender_id !== data.userId && !m.read_at)
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds).then();
    }
  }, [data]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !data) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      conversation_id: id,
      sender_id: data.userId,
      body: body.slice(0, 2000),
    });
    setSending(false);
    if (error) {
      if (/bloque/i.test(error.message)) {
        return toast.error("Não é possível enviar mensagens", {
          description: "Existe um bloqueio entre você e este usuário.",
        });
      }
      return toast.error(error.message);
    }
    setText("");
    qc.invalidateQueries({ queryKey: ["conversation", id] });
  }

  async function toggleUnlock() {
    if (!data) return;
    const { error } = await supabase
      .from("conversations")
      .update({ contacts_unlocked: !data.conv.contacts_unlocked })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(data.conv.contacts_unlocked ? "Contatos ocultados" : "Contatos liberados");
    qc.invalidateQueries({ queryKey: ["conversation", id] });
  }

  if (isLoading || !data) {
    return <div className="p-8 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full max-w-2xl" /></div>;
  }
  if (!data.conv) return <div className="p-8">Conversa não encontrada.</div>;

  const unlocked = data.conv.contacts_unlocked;

  // Group messages by day
  const groups: Array<{ day: string; items: Message[] }> = [];
  for (const m of data.messages) {
    const day = new Date(m.created_at).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(m);
    else groups.push({ day, items: [m] });
  }
  const dayLabel = (d: string) => {
    const date = new Date(d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yest = new Date(today); yest.setDate(yest.getDate() - 1);
    const cmp = new Date(date); cmp.setHours(0, 0, 0, 0);
    if (cmp.getTime() === today.getTime()) return "Hoje";
    if (cmp.getTime() === yest.getTime()) return "Ontem";
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  };

  return (
    <div className="bg-background flex flex-col min-h-[calc(100dvh-4rem)]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="max-w-3xl w-full mx-auto px-3 py-2.5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/chat" })}
            className="h-10 w-10 -ml-2 rounded-full hover:bg-muted flex items-center justify-center flex-shrink-0 active:scale-95 transition"
            aria-label="Voltar"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <Link
            to="/properties/$id"
            params={{ id: data.conv.property_id }}
            className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden"
          >
            <HomeIcon className="h-5 w-5 text-primary" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold truncate">{data.conv.properties?.title ?? "Imóvel"}</h1>
            <p className="text-xs text-muted-foreground truncate">{data.other?.full_name ?? "Usuário"}</p>
          </div>
          <Button
            size="sm"
            variant={unlocked ? "secondary" : "ghost"}
            onClick={toggleUnlock}
            className="hidden sm:inline-flex"
          >
            {unlocked ? "Ocultar contatos" : "Liberar contatos"}
          </Button>
          <button
            type="button"
            className="h-10 w-10 rounded-full hover:bg-muted flex items-center justify-center flex-shrink-0 sm:hidden"
            aria-label="Mais opções"
            onClick={toggleUnlock}
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 bg-background pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto px-3 py-3 space-y-3">
          {/* Security banner */}
          <div className="flex items-start gap-3 rounded-2xl bg-primary/5 border border-primary/15 px-3 py-2.5">
            <ShieldCheck className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.8} />
            <p className="text-xs text-foreground leading-snug">
              Mantenha a comunicação dentro da plataforma para sua segurança.
              {!unlocked && " Telefones e e-mails são ocultados até a liberação."}
            </p>
          </div>

          {data.messages.length === 0 && (
            <p className="text-sm text-center text-muted-foreground py-8">Sem mensagens. Diga olá!</p>
          )}

          {groups.map((g) => (
            <div key={g.day} className="space-y-2">
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium">{dayLabel(g.day)}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {g.items.map((m, idx) => {
                const mine = m.sender_id === data.userId;
                const display = unlocked ? m.body : maskContacts(m.body);
                const time = new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const prev = g.items[idx - 1];
                const showAvatar = !mine && (!prev || prev.sender_id !== m.sender_id);
                return (
                  <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                    {!mine && (
                      <div className={`h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-semibold flex-shrink-0 ${showAvatar ? "" : "invisible"}`}>
                        {(data.other?.full_name ?? "U").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                        mine
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{display}</p>
                      <div className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${mine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        <span>{time}</span>
                        {mine && (m.read_at
                          ? <CheckCheck className="h-3.5 w-3.5" />
                          : <Check className="h-3.5 w-3.5" />)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </main>

      {/* Composer — fixo acima da bottom tab */}
      <footer
        className="fixed inset-x-0 z-20 border-t bg-background/95 backdrop-blur"
        style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        <form onSubmit={send} className="max-w-3xl mx-auto px-3 py-2 flex items-end gap-2">
          <button
            type="button"
            className="h-10 w-10 rounded-full border border-primary/30 text-primary hover:bg-primary/5 flex items-center justify-center flex-shrink-0"
            aria-label="Anexar foto"
            onClick={() => toast.info("Anexos em breve")}
          >
            <Camera className="h-5 w-5" />
          </button>
          <div className="flex-1 rounded-2xl border bg-background px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary/30">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 128) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(e as unknown as React.FormEvent);
                }
              }}
              placeholder="Mensagem"
              maxLength={2000}
              disabled={sending}
              rows={1}
              className="w-full resize-none bg-transparent text-[16px] outline-none placeholder:text-muted-foreground max-h-32 py-1"
            />
          </div>
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="h-10 w-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95"
            aria-label="Enviar"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </footer>
    </div>
  );
}
