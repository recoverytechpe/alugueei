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
          <div className="flex gap-2">
            {!data.isOwner && (
              <Button size="sm" onClick={async () => {
                try {
                  const cid = await getOrCreateConversation({ propertyId: data.id, otherUserId: data.owner_id });
                  navigate({ to: "/chat/$id", params: { id: cid } });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro ao iniciar conversa");
                }
              }}>Conversar com proprietário</Button>
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
