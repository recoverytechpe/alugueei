import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { pushRecent } from "@/lib/property-prefs";

import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls, formatBRL } from "@/lib/property-helpers";
import { getOrCreateConversation } from "@/lib/chat-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, Heart, Share2, BedDouble, Bath, Car, MapPin, MessageCircle,
  ChevronDown, ChevronUp, BadgeCheck, Calculator, ShieldCheck, FileCheck2,
  Link as LinkIcon, MessageSquare, Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UnlockGate, useUnlockStatus, isUnlocked } from "@/components/UnlockGate";

type GuaranteeType = "fiador" | "seguro_fianca" | "caucao" | "titulo_capitalizacao";
const GUARANTEE_LABEL: Record<GuaranteeType, string> = {
  fiador: "Fiador",
  seguro_fianca: "Seguro fiança",
  caucao: "Caução",
  titulo_capitalizacao: "Título de capitalização",
};

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

  const userId = data?.userId ?? null;
  const isTenant = data?.userRole === "locatario";
  const { data: unlockRow } = useUnlockStatus(data?.id ?? "", userId);
  const unlocked = Boolean(data?.isOwner) || isUnlocked(unlockRow);

  function requireUnlock(): boolean {
    if (unlocked) return true;
    toast.error("Desbloqueie o imóvel para continuar (R$ 29,90)");
    document.getElementById("unlock-gate")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  // Track in recents (localStorage) on load
  useEffect(() => {
    if (!data) return;
    const cover = data.photoUrls[0] ?? null;
    pushRecent({
      id: data.id,
      title: data.title,
      city: data.city ?? null,
      neighborhood: data.neighborhood ?? null,
      rent_value: Number(data.rent_value),
      property_type: data.property_type,
      cover,
    });
  }, [data]);


  // Favorite
  const { data: isFav } = useQuery({
    queryKey: ["favorite", id, userId],
    queryFn: async () => {
      if (!userId) return false;
      const { data: r } = await supabase
        .from("favorites").select("id").eq("user_id", userId).eq("property_id", id).maybeSingle();
      return Boolean(r);
    },
    enabled: !!userId,
  });
  const favMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (!userId) throw new Error("Faça login");
      if (next) {
        const { error } = await supabase.from("favorites").insert({ user_id: userId, property_id: id });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase.from("favorites")
          .delete().eq("user_id", userId).eq("property_id", id);
        if (error) throw error;
      }
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ["favorite", id, userId] });
      const prev = qc.getQueryData(["favorite", id, userId]);
      qc.setQueryData(["favorite", id, userId], next);
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      qc.setQueryData(["favorite", id, userId], ctx?.prev);
      toast.error("Não foi possível atualizar favorito");
    },
    onSuccess: (_d, next) => toast.success(next ? "Adicionado aos favoritos" : "Removido dos favoritos"),
  });

  // Pre-approval (tenant only)
  const { data: preapproval } = useQuery({
    queryKey: ["preapproval", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data: r } = await supabase
        .from("tenant_preapprovals").select("*").eq("user_id", userId).maybeSingle();
      return r;
    },
    enabled: !!userId && isTenant,
  });

  // Similar properties
  const { data: similar } = useQuery({
    queryKey: ["similar", id, data?.city, data?.neighborhood, data?.rent_value],
    queryFn: async () => {
      if (!data) return [];
      const rent = Number(data.rent_value);
      const { data: rows } = await supabase
        .from("properties")
        .select("id,title,city,neighborhood,rent_value,bedrooms,bathrooms,property_photos(storage_path,position)")
        .eq("city", data.city)
        .neq("id", id)
        .gte("rent_value", rent * 0.7)
        .lte("rent_value", rent * 1.3)
        .limit(6);
      const all = rows ?? [];
      const paths = all.flatMap((r) =>
        (r.property_photos ?? []).slice().sort((a, b) => a.position - b.position).slice(0, 1).map((p) => p.storage_path)
      );
      const urls = await getSignedPhotoUrls(paths);
      return all.map((r) => {
        const cover = (r.property_photos ?? []).slice().sort((a, b) => a.position - b.position)[0];
        return { ...r, cover: cover ? urls[cover.storage_path] : undefined };
      });
    },
    enabled: !!data,
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

  const rent = Number(data.rent_value);
  const condo = Number(data.condo_value);
  const iptu = Number(data.iptu_value);
  const preapproved = preapproval?.status === "approved" && Number(preapproval.max_rent) >= rent;

  async function contactAgent() {
    if (!requireUnlock()) return;
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

  function shareUrl(): string {
    return typeof window === "undefined" ? "" : `${window.location.origin}/properties/${data!.id}`;
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      toast.success("Link copiado");
    } catch { toast.error("Não foi possível copiar"); }
  }
  function shareWhatsApp() {
    const text = encodeURIComponent(`Olha esse imóvel: ${data!.title} - ${shareUrl()}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
  }
  function shareEmail() {
    const subject = encodeURIComponent(`Imóvel: ${data!.title}`);
    const body = encodeURIComponent(`Achei este imóvel na plataforma:\n\n${data!.title}\n${shareUrl()}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
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

          <div className="absolute top-0 inset-x-0 px-4 pt-4 flex items-center justify-between">
            <Link to="/properties" className="size-10 rounded-full bg-background/90 backdrop-blur flex items-center justify-center shadow hover:bg-background" aria-label="Voltar">
              <ArrowLeft className="size-4" />
            </Link>
            <p className="text-xs font-medium bg-background/90 backdrop-blur px-3 py-1.5 rounded-full shadow">Detalhes do imóvel</p>
            <div className="flex gap-2">
              <button
                onClick={() => userId ? favMutation.mutate(!isFav) : toast.error("Faça login")}
                className="size-10 rounded-full bg-background/90 backdrop-blur flex items-center justify-center shadow hover:bg-background"
                aria-label={isFav ? "Remover dos favoritos" : "Favoritar"}
                aria-pressed={!!isFav}
              >
                <Heart className={cn("size-4", isFav && "fill-rose-500 text-rose-500")} />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="size-10 rounded-full bg-background/90 backdrop-blur flex items-center justify-center shadow hover:bg-background" aria-label="Compartilhar">
                    <Share2 className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={shareWhatsApp}><MessageSquare className="size-4" /> WhatsApp</DropdownMenuItem>
                  <DropdownMenuItem onClick={shareEmail}><Mail className="size-4" /> E-mail</DropdownMenuItem>
                  <DropdownMenuItem onClick={copyLink}><LinkIcon className="size-4" /> Copiar link</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {data.photoUrls.length > 1 && (
            <div className="absolute bottom-3 inset-x-0 px-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {data.photoUrls.map((u, i) => (
                <button key={i} onClick={() => setActivePhoto(i)}
                  className={`shrink-0 w-14 h-10 rounded-md overflow-hidden border-2 ${i === activePhoto ? "border-background ring-2 ring-primary" : "border-background/60"}`}>
                  <img src={u} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>

        <main className="px-5 pt-5 space-y-5">
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold leading-tight">{data.title}</h1>
              <Badge variant="secondary" className="capitalize shrink-0">{data.property_type}</Badge>
            </div>
            <p className="text-lg font-semibold text-primary">
              {formatBRL(rent)}
              <span className="text-xs font-normal text-muted-foreground"> /mês</span>
            </p>
          </div>

          <div className="flex items-center gap-5 text-sm">
            <span className="flex items-center gap-1.5"><BedDouble className="size-4 text-muted-foreground" /> {data.bedrooms} Quartos</span>
            <span className="flex items-center gap-1.5"><Bath className="size-4 text-muted-foreground" /> {data.bathrooms} Banheiros</span>
            <span className="flex items-center gap-1.5"><Car className="size-4 text-muted-foreground" /> {data.parking_spots} Vaga{data.parking_spots === 1 ? "" : "s"}</span>
          </div>

          <UnlockGate
            propertyId={data.id}
            userId={userId}
            isOwner={data.isOwner}
            neighborhood={data.neighborhood ?? null}
            city={data.city ?? null}
            state={data.state ?? null}
            cep={data.cep ?? null}
            full={[data.street, data.number, data.neighborhood, data.city, data.state].filter(Boolean).join(", ")}
          />

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200">
              <BadgeCheck className="size-3.5" /> Imóvel verificado
            </Badge>
            {preapproved && (
              <Badge variant="secondary" className="gap-1 bg-sky-50 text-sky-700 hover:bg-sky-50 border-sky-200">
                <ShieldCheck className="size-3.5" /> Você está pré-aprovado
              </Badge>
            )}
          </div>

          {description && (
            <div className="space-y-2">
              <h2 className="text-base font-semibold">Sobre este imóvel</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{shownDescription}</p>
              {longDescription && (
                <button onClick={() => setAboutOpen((v) => !v)} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  {aboutOpen ? "Ver menos" : "Ver mais"}
                  {aboutOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
              )}
            </div>
          )}

          {/* Tenant action grid */}
          {!data.isOwner && isTenant && (
            <div className="space-y-2">
              <h2 className="text-base font-semibold">Antes de decidir</h2>
              <div className="grid grid-cols-3 gap-2">
                <SimulatorDialog rent={rent} condo={condo} iptu={iptu} />
                <QualifyDialog rent={rent} />
                <PreapprovalDialog userId={userId!} existing={preapproval ?? null} onSaved={() => qc.invalidateQueries({ queryKey: ["preapproval", userId] })} />
              </div>
            </div>
          )}

          {/* Pricing breakdown */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Valores mensais</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="Aluguel" value={formatBRL(rent)} />
              <Row label="Condomínio" value={formatBRL(condo)} />
              <Row label="IPTU" value={formatBRL(iptu)} />
              <div className="border-t pt-2 mt-1 flex justify-between font-semibold">
                <span>Total estimado</span>
                <span>{formatBRL(rent + condo + iptu)}</span>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2 pt-1">
            {!data.isOwner && (isTenant || data.userRole === "agente") && (
              <VisitDialog propertyId={data.id} ownerId={data.owner_id} userId={userId!} userRole={data.userRole!} />
            )}
            {!data.isOwner && isTenant && (
              <ProposalDialog propertyId={data.id} ownerId={data.owner_id} userId={userId!} rentSuggestion={rent} preapproval={preapproval ?? null} />
            )}

            {data.isOwner && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>Remover imóvel</Button>
            )}
          </div>

          {/* Similar properties */}
          {similar && similar.length > 0 && (
            <div className="space-y-2 pt-2">
              <h2 className="text-base font-semibold">Imóveis similares na região</h2>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {similar.map((p) => (
                  <Link key={p.id} to="/properties/$id" params={{ id: p.id }}
                    className="shrink-0 w-44 rounded-xl border bg-card overflow-hidden hover:shadow-md transition">
                    <div className="aspect-[4/3] bg-muted">
                      {p.cover && <img src={p.cover} alt={p.title} className="w-full h-full object-cover" />}
                    </div>
                    <div className="p-2.5 space-y-0.5">
                      <p className="text-xs text-muted-foreground truncate">{p.neighborhood ?? p.city}</p>
                      <p className="text-sm font-semibold truncate">{p.title}</p>
                      <p className="text-sm font-bold text-primary">{formatBRL(p.rent_value)}<span className="text-[10px] font-normal text-muted-foreground">/mês</span></p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </main>

        {!data.isOwner && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[440px] bg-background/95 backdrop-blur border-t px-5 py-3 z-10">
            <Button size="lg" className="w-full h-12 rounded-2xl text-base font-semibold" onClick={contactAgent} disabled={contacting}>
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

/* ---------------- Tenant action dialogs ---------------- */


function SimulatorDialog({ rent, condo, iptu }: { rent: number; condo: number; iptu: number }) {
  const [open, setOpen] = useState(false);
  const [insurance, setInsurance] = useState(Math.round(rent * 0.08));
  const [serviceFee] = useState(Math.round(rent * 0.05));
  const monthly = rent + condo + iptu + insurance + serviceFee;
  const moveIn = rent + insurance + serviceFee; // 1º mês + caução simbólica
  const caucao = rent * 3;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card hover:bg-accent transition text-center">
          <span className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Calculator className="size-4" /></span>
          <span className="text-xs font-medium leading-tight">Simular custo</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Simulador de custo total</DialogTitle>
          <DialogDescription>Estimativa baseada nos valores do anúncio.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Row label="Aluguel" value={formatBRL(rent)} />
          <Row label="Condomínio" value={formatBRL(condo)} />
          <Row label="IPTU" value={formatBRL(iptu)} />
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ins" className="text-muted-foreground">Seguro fiança (mês)</Label>
            <Input id="ins" type="number" min={0} className="w-28 h-8" value={insurance} onChange={(e) => setInsurance(Number(e.target.value) || 0)} />
          </div>
          <Row label="Taxa da plataforma" value={formatBRL(serviceFee)} />
          <div className="border-t pt-2 flex justify-between font-semibold">
            <span>Total mensal</span><span>{formatBRL(monthly)}</span>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 space-y-1">
            <p className="font-medium">Para entrar no imóvel</p>
            <Row label="1º aluguel + taxas" value={formatBRL(moveIn)} />
            <Row label="Caução (se aplicável, 3x aluguel)" value={formatBRL(caucao)} />
          </div>
        </div>
        <DialogFooter><Button onClick={() => setOpen(false)}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QualifyDialog({ rent }: { rent: number }) {
  const [open, setOpen] = useState(false);
  const [income, setIncome] = useState("");
  const [guarantee, setGuarantee] = useState<GuaranteeType | "">("");
  const result = useMemo(() => {
    const inc = Number(income);
    if (!inc || !guarantee) return null;
    const ratio = rent / inc;
    const incomeOk = ratio <= 1 / 3;
    return {
      incomeOk,
      ratio,
      guaranteeOk: true,
      msg: incomeOk
        ? "Você atende ao critério de renda (aluguel ≤ 1/3 da renda)."
        : `Sua renda precisa ser ao menos ${formatBRL(rent * 3)} para este aluguel.`,
    };
  }, [income, guarantee, rent]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card hover:bg-accent transition text-center">
          <span className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center"><FileCheck2 className="size-4" /></span>
          <span className="text-xs font-medium leading-tight">Eu me qualifico?</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verificar qualificação</DialogTitle>
          <DialogDescription>Checagem rápida com base nos critérios usuais do mercado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="inc">Renda mensal bruta</Label>
            <Input id="inc" type="number" min={0} step="0.01" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="R$" />
          </div>
          <div>
            <Label>Tipo de garantia</Label>
            <Select value={guarantee} onValueChange={(v) => setGuarantee(v as GuaranteeType)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {(Object.keys(GUARANTEE_LABEL) as GuaranteeType[]).map((g) => (
                  <SelectItem key={g} value={g}>{GUARANTEE_LABEL[g]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {result && (
            <div className={cn(
              "rounded-lg p-3 text-sm border",
              result.incomeOk ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"
            )}>
              {result.msg}
            </div>
          )}
        </div>
        <DialogFooter><Button onClick={() => setOpen(false)}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreapprovalDialog({
  userId, existing, onSaved,
}: {
  userId: string;
  existing: { monthly_income: number; guarantee_type: GuaranteeType; max_rent: number; status: string } | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [income, setIncome] = useState(existing ? String(existing.monthly_income) : "");
  const [guarantee, setGuarantee] = useState<GuaranteeType | "">(existing?.guarantee_type ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const inc = Number(income);
    if (!inc || inc <= 0) return toast.error("Informe sua renda");
    if (!guarantee) return toast.error("Selecione a garantia");
    setBusy(true);
    const maxRent = Math.floor(inc / 3);
    const { error } = await supabase.from("tenant_preapprovals").upsert({
      user_id: userId,
      monthly_income: inc,
      guarantee_type: guarantee,
      max_rent: maxRent,
      status: "approved",
    }, { onConflict: "user_id" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Pré-aprovado para aluguéis até ${formatBRL(maxRent)}`);
    onSaved();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card hover:bg-accent transition text-center">
          <span className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center"><ShieldCheck className="size-4" /></span>
          <span className="text-xs font-medium leading-tight">{existing ? "Pré-aprovação" : "Pré-aprovar-me"}</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pré-aprovação de crédito</DialogTitle>
          <DialogDescription>Gere um selo de pré-aprovação para anexar às suas propostas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="pa-inc">Renda mensal bruta (R$)</Label>
            <Input id="pa-inc" type="number" min={1} step="0.01" value={income} onChange={(e) => setIncome(e.target.value)} required />
          </div>
          <div>
            <Label>Tipo de garantia preferida</Label>
            <Select value={guarantee} onValueChange={(v) => setGuarantee(v as GuaranteeType)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {(Object.keys(GUARANTEE_LABEL) as GuaranteeType[]).map((g) => (
                  <SelectItem key={g} value={g}>{GUARANTEE_LABEL[g]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {existing && (
            <p className="text-xs text-muted-foreground">
              Atualmente pré-aprovado para aluguéis até <strong>{formatBRL(existing.max_rent)}</strong>.
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Gerar pré-aprovação"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Existing dialogs ---------------- */

function VisitDialog({ propertyId, ownerId, userId, userRole }: { propertyId: string; ownerId: string; userId: string; userRole: string }) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!when) return toast.error("Selecione data e hora");
    setBusy(true);
    const payload = {
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

function ProposalDialog({ propertyId, ownerId, userId, rentSuggestion, preapproval }: {
  propertyId: string; ownerId: string; userId: string; rentSuggestion: number;
  preapproval: { monthly_income: number; guarantee_type: GuaranteeType; max_rent: number; status: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [rent, setRent] = useState(String(rentSuggestion));
  const [term, setTerm] = useState("12");
  const [start, setStart] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const attachPreapproval = preapproval?.status === "approved";

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
      ...(attachPreapproval && preapproval ? {
        tenant_preapproval_income: preapproval.monthly_income,
        tenant_preapproval_max_rent: preapproval.max_rent,
        tenant_preapproval_guarantee: preapproval.guarantee_type,
      } : {}),
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
          {attachPreapproval && preapproval && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 flex items-start gap-2">
              <ShieldCheck className="size-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Sua pré-aprovação será anexada</p>
                <p className="text-xs">Até {formatBRL(preapproval.max_rent)} · Garantia: {GUARANTEE_LABEL[preapproval.guarantee_type]}</p>
              </div>
            </div>
          )}
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

