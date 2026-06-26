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
import { ArrowLeft, Heart, Share2, BedDouble, Bath, Car, MapPin, MessageCircle, ChevronDown, ChevronUp, BadgeCheck } from "lucide-react";

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
  const [aboutOpen, setAboutOpen] = useState(false);
  const [contacting, setContacting] = useState(false);

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

  const cover = data.photoUrls[activePhoto];
  const description = data.description ?? "";
  const longDescription = description.length > 220;
  const shownDescription = aboutOpen || !longDescription ? description : description.slice(0, 220).trimEnd() + "…";

  async function contactAgent() {
    try {
      setContacting(true);
      const cid = await getOrCreateConversation({ propertyId: data!.id, otherUserId: data!.owner_id });
      navigate({ to: "/chat/$id", params: { id: cid } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar conversa");
    } finally {
      setContacting(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-[440px] min-h-screen bg-background shadow-xl pb-28 relative">
        {/* Gallery */}
        <section className="relative">
          <div className="aspect-[4/3] bg-muted overflow-hidden">
            {cover ? (
              <img src={cover} alt={data.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">Sem fotos</div>
            )}
          </div>

          {/* Floating header */}
          <div className="absolute top-0 inset-x-0 px-4 pt-4 flex items-center justify-between">
            <Link
              to="/properties"
              className="size-10 rounded-full bg-background/90 backdrop-blur flex items-center justify-center shadow hover:bg-background"
              aria-label="Voltar"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <p className="text-xs font-medium bg-background/90 backdrop-blur px-3 py-1.5 rounded-full shadow">
              Detalhes do imóvel
            </p>
            <div className="flex gap-2">
              <button
                className="size-10 rounded-full bg-background/90 backdrop-blur flex items-center justify-center shadow hover:bg-background"
                aria-label="Favoritar"
              >
                <Heart className="size-4" />
              </button>
              <button
                className="size-10 rounded-full bg-background/90 backdrop-blur flex items-center justify-center shadow hover:bg-background"
                aria-label="Compartilhar"
              >
                <Share2 className="size-4" />
              </button>
            </div>
          </div>

          {/* Thumbnails */}
          {data.photoUrls.length > 1 && (
            <div className="absolute bottom-3 inset-x-0 px-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {data.photoUrls.map((u, i) => (
                <button
                  key={i}
                  onClick={() => setActivePhoto(i)}
                  className={`shrink-0 w-14 h-10 rounded-md overflow-hidden border-2 ${
                    i === activePhoto ? "border-background ring-2 ring-primary" : "border-background/60"
                  }`}
                >
                  <img src={u} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>

        <main className="px-5 pt-5 space-y-5">
          {/* Title + price */}
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold leading-tight">{data.title}</h1>
              <Badge variant="secondary" className="capitalize shrink-0">{data.property_type}</Badge>
            </div>
            <p className="text-lg font-semibold text-primary">
              {formatBRL(data.rent_value)}
              <span className="text-xs font-normal text-muted-foreground"> /mês</span>
            </p>
          </div>

          {/* Quick stats row */}
          <div className="flex items-center gap-5 text-sm">
            <span className="flex items-center gap-1.5"><BedDouble className="size-4 text-muted-foreground" /> {data.bedrooms} Quartos</span>
            <span className="flex items-center gap-1.5"><Bath className="size-4 text-muted-foreground" /> {data.bathrooms} Banheiros</span>
            <span className="flex items-center gap-1.5"><Car className="size-4 text-muted-foreground" /> {data.parking_spots} Vaga{data.parking_spots === 1 ? "" : "s"}</span>
          </div>

          {/* Address */}
          <p className="text-sm text-muted-foreground flex items-start gap-2">
            <MapPin className="size-4 mt-0.5 shrink-0" />
            <span>
              {[data.street, data.number, data.neighborhood, data.city, data.state]
                .filter(Boolean)
                .join(", ")} · CEP {data.cep}
            </span>
          </p>

          <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200">
            <BadgeCheck className="size-3.5" /> Imóvel verificado pela plataforma
          </Badge>

          {/* About */}
          {description && (
            <div className="space-y-2">
              <h2 className="text-base font-semibold">Sobre este imóvel</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {shownDescription}
              </p>
              {longDescription && (
                <button
                  onClick={() => setAboutOpen((v) => !v)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {aboutOpen ? "Ver menos" : "Ver mais"}
                  {aboutOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
              )}
            </div>
          )}

          {/* Pricing breakdown */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Valores mensais</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="Aluguel" value={formatBRL(data.rent_value)} />
              <Row label="Condomínio" value={formatBRL(data.condo_value)} />
              <Row label="IPTU" value={formatBRL(data.iptu_value)} />
              <div className="border-t pt-2 mt-1 flex justify-between font-semibold">
                <span>Total estimado</span>
                <span>{formatBRL(Number(data.rent_value) + Number(data.condo_value) + Number(data.iptu_value))}</span>
              </div>
            </CardContent>
          </Card>

          {/* Secondary actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {!data.isOwner && (data.userRole === "locatario" || data.userRole === "agente") && (
              <VisitDialog propertyId={data.id} ownerId={data.owner_id} userId={data.userId!} userRole={data.userRole} />
            )}
            {!data.isOwner && data.userRole === "locatario" && (
              <ProposalDialog propertyId={data.id} ownerId={data.owner_id} userId={data.userId!} rentSuggestion={Number(data.rent_value)} />
            )}
            {data.isOwner && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>Remover imóvel</Button>
            )}
          </div>
        </main>

        {/* Sticky CTA */}
        {!data.isOwner && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[440px] bg-background/95 backdrop-blur border-t px-5 py-3 z-10">
            <Button
              size="lg"
              className="w-full h-12 rounded-2xl text-base font-semibold"
              onClick={contactAgent}
              disabled={contacting}
            >
              <MessageCircle className="size-5" />
              {contacting ? "Abrindo conversa..." : "Falar com o agente"}
            </Button>
          </div>
        )}
      </div>
    </div>
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
    const payload: {
      property_id: string; owner_id: string; tenant_id: string; agent_id: string | null;
      scheduled_at: string; notes: string;
    } = {
      property_id: propertyId, owner_id: ownerId, tenant_id: userId,
      agent_id: userRole === "agente" ? userId : null,
      scheduled_at: new Date(when).toISOString(), notes,
    };
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
