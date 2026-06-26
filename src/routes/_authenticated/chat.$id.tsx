import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { maskContacts } from "@/lib/chat-helpers";

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
  const endRef = useRef<HTMLDivElement>(null);
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
    if (error) return toast.error(error.message);
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="max-w-3xl w-full mx-auto px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">{data.other?.full_name ?? "Usuário"}</h1>
            <p className="text-xs text-muted-foreground">
              {data.conv.properties?.title ?? "Imóvel"} ·{" "}
              <Link to="/properties/$id" params={{ id: data.conv.property_id }} className="underline">ver</Link>
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline"><Link to="/chat">Voltar</Link></Button>
            <Button size="sm" variant={unlocked ? "secondary" : "default"} onClick={toggleUnlock}>
              {unlocked ? "Ocultar contatos" : "Liberar contatos"}
            </Button>
          </div>
        </div>
        {!unlocked && (
          <div className="bg-muted text-xs text-muted-foreground px-6 py-2 text-center">
            Telefones e e-mails ficam ocultos. Libere os contatos após confirmar a visita ou aceitar a proposta.
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-3">
          {data.messages.length === 0 && (
            <p className="text-sm text-center text-muted-foreground">Sem mensagens. Diga olá!</p>
          )}
          {data.messages.map((m) => {
            const mine = m.sender_id === data.userId;
            const display = unlocked ? m.body : maskContacts(m.body);
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                  <p className="whitespace-pre-wrap break-words">{display}</p>
                  <p className={`text-[10px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="border-t">
        <form onSubmit={send} className="max-w-3xl mx-auto px-6 py-3 flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva uma mensagem"
            maxLength={2000}
            disabled={sending}
          />
          <Button type="submit" disabled={sending || !text.trim()}>Enviar</Button>
        </form>
      </footer>
    </div>
  );
}
