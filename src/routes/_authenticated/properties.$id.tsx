import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls, formatBRL } from "@/lib/property-helpers";
import { getOrCreateConversation } from "@/lib/chat-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/properties/$id")({
  head: () => ({ meta: [{ title: "Detalhes do imóvel | Plataforma de Aluguel" }] }),
  component: PropertyDetail,
  errorComponent: ({ error }) => <div className="p-8 text-center text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8 text-center">Imóvel não encontrado.</div>,
});

function PropertyDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activePhoto, setActivePhoto] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: row, error } = await supabase
        .from("properties")
        .select("*, property_photos(storage_path,position)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!row) return null;
      const photos = (row.property_photos ?? []).slice().sort((a, b) => a.position - b.position);
      const urls = await getSignedPhotoUrls(photos.map((p) => p.storage_path));
      let userRole: string | undefined;
      if (userData.user) {
        const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", userData.user.id);
        userRole = r?.[0]?.role;
      }
      return {
        ...row,
        userId: userData.user?.id ?? null,
        userRole,
        isOwner: userData.user?.id === row.owner_id,
        photoUrls: photos.map((p) => urls[p.storage_path]).filter(Boolean),
      };
    },
  });

  async function handleDelete() {
    if (!data || !confirm("Remover este imóvel?")) return;
    const { error } = await supabase.from("properties").delete().eq("id", data.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Imóvel removido");
    qc.invalidateQueries({ queryKey: ["properties"] });
    navigate({ to: "/properties" });
  }

  if (isLoading) {
    return <div className="p-8 max-w-4xl mx-auto space-y-4"><Skeleton className="h-96 w-full" /><Skeleton className="h-40 w-full" /></div>;
  }
  if (!data) return <div className="p-8 text-center">Imóvel não encontrado.</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/properties" className="text-sm text-muted-foreground hover:text-foreground">← Voltar</Link>
          <div className="flex gap-2 flex-wrap">
            {!data.isOwner && (
              <Button size="sm" variant="outline" onClick={async () => {
                try {
                  const cid = await getOrCreateConversation({ propertyId: data.id, otherUserId: data.owner_id });
                  navigate({ to: "/chat/$id", params: { id: cid } });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro ao iniciar conversa");
                }
              }}>Conversar</Button>
            )}
            {!data.isOwner && (data.userRole === "locatario" || data.userRole === "agente") && (
              <VisitDialog propertyId={data.id} ownerId={data.owner_id} userId={data.userId!} userRole={data.userRole} />
            )}
            {!data.isOwner && data.userRole === "locatario" && (
              <ProposalDialog propertyId={data.id} ownerId={data.owner_id} userId={data.userId!} rentSuggestion={Number(data.rent_value)} />
            )}
            {data.isOwner && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>Remover</Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        <div className="space-y-2">
          {data.photoUrls.length > 0 ? (
            <>
              <div className="aspect-[16/10] rounded-lg overflow-hidden bg-muted">
                <img src={data.photoUrls[activePhoto]} alt={data.title} className="w-full h-full object-cover" />
              </div>
              {data.photoUrls.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {data.photoUrls.map((u, i) => (
                    <button key={i} onClick={() => setActivePhoto(i)} className={`shrink-0 w-20 h-16 rounded overflow-hidden border-2 ${i === activePhoto ? "border-primary" : "border-transparent"}`}>
                      <img src={u} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="aspect-[16/10] rounded-lg bg-muted flex items-center justify-center text-muted-foreground">Sem fotos</div>
          )}
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{data.title}</h1>
            <p className="text-muted-foreground">
              {[data.street, data.number, data.neighborhood, data.city, data.state].filter(Boolean).join(", ")} · CEP {data.cep}
            </p>
          </div>
          <div className="text-right">
            <Badge variant="secondary" className="capitalize">{data.property_type}</Badge>
            <div className="text-2xl font-bold mt-1">{formatBRL(data.rent_value)}</div>
            <div className="text-xs text-muted-foreground">/ mês</div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Quartos" value={String(data.bedrooms)} />
          <Stat label="Banheiros" value={String(data.bathrooms)} />
          <Stat label="Vagas" value={String(data.parking_spots)} />
          <Stat label="Área" value={`${Number(data.area_m2)} m²`} />
        </div>

        {data.description && (
          <Card>
            <CardHeader><CardTitle className="text-base">Descrição</CardTitle></CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm">{data.description}</CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Valores mensais</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Aluguel" value={formatBRL(data.rent_value)} />
            <Row label="Condomínio" value={formatBRL(data.condo_value)} />
            <Row label="IPTU" value={formatBRL(data.iptu_value)} />
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>Total estimado</span>
              <span>{formatBRL(Number(data.rent_value) + Number(data.condo_value) + Number(data.iptu_value))}</span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </CardContent></Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}

function VisitDialog({ propertyId, ownerId, userId, userRole }: { propertyId: string; ownerId: string; userId: string; userRole: string }) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!when) return toast.error("Selecione data e hora");
    setBusy(true);
    const payload = userRole === "agente"
      ? { property_id: propertyId, owner_id: ownerId, tenant_id: userId, agent_id: userId, scheduled_at: new Date(when).toISOString(), notes }
      : { property_id: propertyId, owner_id: ownerId, tenant_id: userId, scheduled_at: new Date(when).toISOString(), notes };
    const { error } = await supabase.from("visits").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Visita solicitada");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">Agendar visita</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar visita</DialogTitle>
          <DialogDescription>Proponha um horário. O proprietário precisa confirmar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="when">Data e hora</Label>
            <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Enviando..." : "Solicitar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProposalDialog({ propertyId, ownerId, userId, rentSuggestion }: { propertyId: string; ownerId: string; userId: string; rentSuggestion: number }) {
  const [open, setOpen] = useState(false);
  const [rent, setRent] = useState(String(rentSuggestion));
  const [term, setTerm] = useState("12");
  const [start, setStart] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const rentN = Number(rent);
    const termN = Number(term);
    if (!rentN || rentN <= 0) return toast.error("Valor inválido");
    if (!termN || termN < 1) return toast.error("Prazo inválido");
    if (!start) return toast.error("Informe a data de início");
    setBusy(true);
    const { error } = await supabase.from("proposals").insert({
      property_id: propertyId, owner_id: ownerId, tenant_id: userId,
      rent_offer: rentN, term_months: termN, start_date: start, message: msg,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Proposta enviada");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="default">Enviar proposta</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Proposta de aluguel</DialogTitle>
          <DialogDescription>O proprietário poderá aceitar ou recusar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rent">Aluguel (R$)</Label>
              <Input id="rent" type="number" min={1} step="0.01" value={rent} onChange={(e) => setRent(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="term">Prazo (meses)</Label>
              <Input id="term" type="number" min={1} max={120} value={term} onChange={(e) => setTerm(e.target.value)} required />
            </div>
          </div>
          <div>
            <Label htmlFor="start">Início</Label>
            <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="msg">Mensagem</Label>
            <Textarea id="msg" rows={3} maxLength={1000} value={msg} onChange={(e) => setMsg(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Enviando..." : "Enviar proposta"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
