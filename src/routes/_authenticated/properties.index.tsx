import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls, formatBRL } from "@/lib/property-helpers";
import { citiesQueryOptions, neighborhoodsQueryOptions } from "@/lib/locations-api";
import {
  getRecents, getCompareIds, toggleCompare, clearCompare,
  getSavedSearches, saveSearch, deleteSavedSearch, pushRecent,
  type SavedSearch,
} from "@/lib/property-prefs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Scale, BookmarkPlus, Bookmark, X, History, Trash2 } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({
  city: fallback(z.string(), "all").default("all"),
  neighborhood: fallback(z.string(), "all").default("all"),
  type: fallback(z.enum(["all", "casa", "apartamento"]), "all").default("all"),
  bedrooms: fallback(z.string(), "any").default("any"),
  bathrooms: fallback(z.string(), "any").default("any"),
  parking: fallback(z.string(), "any").default("any"),
  min: fallback(z.string(), "").default(""),
  max: fallback(z.string(), "").default(""),
  minArea: fallback(z.string(), "").default(""),
  maxArea: fallback(z.string(), "").default(""),
  sort: fallback(z.enum(["newest", "price_asc", "price_desc", "area_desc"]), "newest").default("newest"),
});

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({
    meta: [
      { title: "Imóveis disponíveis | Plataforma de Aluguel" },
      { name: "description", content: "Busque imóveis para alugar com filtros por cidade, tipo, quartos e preço." },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  loader: ({ context }) => context.queryClient.ensureQueryData(citiesQueryOptions({ pageSize: 200 })),
  component: PropertiesList,
});

function PropertiesList() {
  const navigate = useNavigate({ from: "/properties" });
  const f = Route.useSearch();
  const [isOwner, setIsOwner] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [recents, setRecents] = useState(() => getRecents());
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  useEffect(() => {
    setCompareIds(getCompareIds());
    setSaved(getSavedSearches());
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      setIsOwner(!!roles?.some((r) => r.role === "proprietario"));
    });
  }, []);

  const { data: citiesResp } = useSuspenseQuery(citiesQueryOptions({ pageSize: 200 }));
  const cities = citiesResp.data;

  const { data: neighborhoodsResp } = useQuery(
    neighborhoodsQueryOptions({ city: f.city === "all" ? "" : f.city, pageSize: 200 }),
  );
  const neighborhoodOptions = neighborhoodsResp?.data.map((n) => n.neighborhood) ?? [];

  function update(patch: Partial<z.infer<typeof searchSchema>>) {
    navigate({ search: (prev) => ({ ...prev, ...patch }) });
  }

  const hasFilters = useMemo(
    () => f.city !== "all" || f.neighborhood !== "all" || f.type !== "all"
      || f.bedrooms !== "any" || f.bathrooms !== "any" || f.parking !== "any"
      || !!f.min || !!f.max || !!f.minArea || !!f.maxArea,
    [f],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["properties", f],
    queryFn: async () => {
      let q = supabase
        .from("properties")
        .select("id,title,city,state,neighborhood,property_type,bedrooms,bathrooms,parking_spots,area_m2,rent_value,status,created_at,property_photos(storage_path,position)")
        .eq("status", "available")
        .limit(60);

      if (f.sort === "newest") q = q.order("created_at", { ascending: false });
      if (f.sort === "price_asc") q = q.order("rent_value", { ascending: true });
      if (f.sort === "price_desc") q = q.order("rent_value", { ascending: false });
      if (f.sort === "area_desc") q = q.order("area_m2", { ascending: false });

      if (f.city !== "all") q = q.eq("city", f.city);
      if (f.neighborhood !== "all") q = q.eq("neighborhood", f.neighborhood);
      if (f.type !== "all") q = q.eq("property_type", f.type);
      if (f.bedrooms !== "any") q = q.gte("bedrooms", Number(f.bedrooms));
      if (f.bathrooms !== "any") q = q.gte("bathrooms", Number(f.bathrooms));
      if (f.parking !== "any") q = q.gte("parking_spots", Number(f.parking));
      if (f.min && !Number.isNaN(Number(f.min))) q = q.gte("rent_value", Number(f.min));
      if (f.max && !Number.isNaN(Number(f.max))) q = q.lte("rent_value", Number(f.max));
      if (f.minArea && !Number.isNaN(Number(f.minArea))) q = q.gte("area_m2", Number(f.minArea));
      if (f.maxArea && !Number.isNaN(Number(f.maxArea))) q = q.lte("area_m2", Number(f.maxArea));

      const { data: rows, error } = await q;
      if (error) throw error;

      const firstPhotos = (rows ?? [])
        .map((p) => {
          const photos = (p.property_photos ?? []).slice().sort((a, b) => a.position - b.position);
          return photos[0]?.storage_path;
        })
        .filter((s): s is string => !!s);

      const urls = await getSignedPhotoUrls(firstPhotos);
      return (rows ?? []).map((p) => {
        const photos = (p.property_photos ?? []).slice().sort((a, b) => a.position - b.position);
        const path = photos[0]?.storage_path;
        return { ...p, cover: path ? urls[path] : null };
      });
    },
  });

  const empty = !isLoading && (data?.length ?? 0) === 0;

  function onToggleCompare(id: string) {
    const r = toggleCompare(id);
    if (r.full) toast.error("Você pode comparar no máximo 3 imóveis.");
    setCompareIds(r.ids);
  }

  function handleOpenCard(p: { id: string; title: string; city: string | null; neighborhood: string | null; rent_value: number; property_type: string; cover: string | null }) {
    pushRecent({
      id: p.id, title: p.title, city: p.city, neighborhood: p.neighborhood,
      rent_value: Number(p.rent_value), property_type: p.property_type, cover: p.cover,
    });
    setRecents(getRecents());
    navigate({ to: "/properties/$id", params: { id: p.id } });
  }

  function clearFilters() {
    navigate({ search: () => ({}) as never });
  }

  function applySaved(s: SavedSearch) {
    navigate({ search: () => s.search as never });
    toast.success(`Busca "${s.name}" aplicada`);
  }

  function removeSaved(id: string) {
    deleteSavedSearch(id);
    setSaved(getSavedSearches());
  }

  function handleSaveSearch() {
    if (!saveName.trim()) return toast.error("Dê um nome para a busca");
    const item = saveSearch(saveName, f as Record<string, unknown>);
    setSaved([item, ...saved.filter((s) => s.id !== item.id)]);
    setSaveName("");
    setSaveOpen(false);
    toast.success("Busca salva");
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-4 flex items-center justify-between gap-3">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground shrink-0">← Dashboard</Link>
          <h1 className="text-lg md:text-xl font-semibold truncate">Imóveis disponíveis</h1>
          {isOwner ? (
            <Button asChild size="sm"><Link to="/properties/new">Cadastrar imóvel</Link></Button>
          ) : <div className="w-32" />}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10 space-y-6">

        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Filtros</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {hasFilters && (
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  <X className="size-4 mr-1" />Limpar
                </Button>
              )}
              <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={!hasFilters}>
                    <BookmarkPlus className="size-4 mr-1" />Salvar busca
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Salvar esta busca</DialogTitle></DialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="save-name">Nome</Label>
                    <Input id="save-name" value={saveName} onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Ex.: 2qts em Pinheiros até 4k" autoFocus />
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSaveSearch}>Salvar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Bookmark className="size-4 mr-1" />Minhas buscas ({saved.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Buscas salvas</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {saved.length === 0 && (
                    <div className="px-2 py-3 text-xs text-muted-foreground">Nenhuma busca salva ainda.</div>
                  )}
                  {saved.map((s) => (
                    <div key={s.id} className="flex items-center gap-1 px-1">
                      <DropdownMenuItem className="flex-1 cursor-pointer" onSelect={() => applySaved(s)}>
                        {s.name}
                      </DropdownMenuItem>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                        onClick={(e) => { e.stopPropagation(); removeSaved(s.id); }}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4 lg:grid-cols-6">
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Select value={f.city} onValueChange={(v) => update({ city: v, neighborhood: "all" })}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {cities.map((l) => (
                    <SelectItem key={`${l.city}|${l.state}`} value={l.city}>{l.city}{l.state ? ` · ${l.state}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bairro</Label>
              <Select value={f.neighborhood} onValueChange={(v) => update({ neighborhood: v })}
                disabled={!neighborhoodOptions.length}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {neighborhoodOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={f.type} onValueChange={(v) => update({ type: v as "all" | "casa" | "apartamento" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="casa">Casa</SelectItem>
                  <SelectItem value="apartamento">Apartamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quartos (mín.)</Label>
              <Select value={f.bedrooms} onValueChange={(v) => update({ bedrooms: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer</SelectItem>
                  {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}+</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Banheiros (mín.)</Label>
              <Select value={f.bathrooms} onValueChange={(v) => update({ bathrooms: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer</SelectItem>
                  {[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n}+</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vagas (mín.)</Label>
              <Select value={f.parking} onValueChange={(v) => update({ parking: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer</SelectItem>
                  {[0, 1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n}+</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-min">Aluguel mín. (R$)</Label>
              <Input id="f-min" type="number" inputMode="numeric" value={f.min}
                onChange={(e) => update({ min: e.target.value })} placeholder="1000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-max">Aluguel máx. (R$)</Label>
              <Input id="f-max" type="number" inputMode="numeric" value={f.max}
                onChange={(e) => update({ max: e.target.value })} placeholder="5000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-amin">Área mín. (m²)</Label>
              <Input id="f-amin" type="number" inputMode="numeric" value={f.minArea}
                onChange={(e) => update({ minArea: e.target.value })} placeholder="40" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-amax">Área máx. (m²)</Label>
              <Input id="f-amax" type="number" inputMode="numeric" value={f.maxArea}
                onChange={(e) => update({ maxArea: e.target.value })} placeholder="120" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Ordenar por</Label>
              <Select value={f.sort} onValueChange={(v) => update({ sort: v as typeof f.sort })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Mais recentes</SelectItem>
                  <SelectItem value="price_asc">Menor preço</SelectItem>
                  <SelectItem value="price_desc">Maior preço</SelectItem>
                  <SelectItem value="area_desc">Maior área</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {!hasFilters && recents.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <History className="size-4" />
              <span className="font-medium">Vistos recentemente</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {recents.map((r) => (
                <Link key={r.id} to="/properties/$id" params={{ id: r.id }}
                  className="shrink-0 w-44 rounded-lg border bg-card overflow-hidden hover:border-primary transition-colors">
                  <div className="aspect-[4/3] bg-muted overflow-hidden">
                    {r.cover ? (
                      <img src={r.cover} alt={r.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : <div className="w-full h-full bg-muted" />}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium line-clamp-1">{r.title}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{[r.neighborhood, r.city].filter(Boolean).join(" · ")}</p>
                    <p className="text-xs font-semibold mt-0.5">{formatBRL(r.rent_value)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
          </div>
        ) : empty ? (
          <div className="py-16 text-center text-muted-foreground">Nenhum imóvel encontrado.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data!.map((p) => {
              const inCompare = compareIds.includes(p.id);
              return (
                <Card key={p.id} className="overflow-hidden hover:border-primary transition-colors h-full flex flex-col">
                  <button onClick={() => handleOpenCard(p)} className="text-left">
                    <div className="aspect-[4/3] bg-muted overflow-hidden relative">
                      <img
                        src={p.cover ?? `https://picsum.photos/seed/${p.id}/800/600`}
                        alt={p.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.src = `https://picsum.photos/seed/${p.id}/800/600`; }}
                      />
                    </div>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-tight line-clamp-1">{p.title}</h3>
                        <Badge variant="secondary" className="capitalize">{p.property_type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {[p.neighborhood, p.city, p.state].filter(Boolean).join(" · ")}
                      </p>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>{p.bedrooms} qtos</span>
                        <span>{p.bathrooms} ban.</span>
                        <span>{p.parking_spots} vagas</span>
                        <span>{Number(p.area_m2)} m²</span>
                      </div>
                      <div className="pt-1 font-semibold">{formatBRL(p.rent_value)}<span className="text-xs font-normal text-muted-foreground"> / mês</span></div>
                    </CardContent>
                  </button>
                  <div className="px-4 pb-3 mt-auto">
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                      <Checkbox checked={inCompare} onCheckedChange={() => onToggleCompare(p.id)} />
                      <span>Comparar</span>
                    </label>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {compareIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-foreground text-background rounded-full shadow-lg px-4 py-2 flex items-center gap-3">
          <Scale className="size-4" />
          <span className="text-sm font-medium">{compareIds.length} para comparar</span>
          <Button asChild size="sm" variant="secondary" disabled={compareIds.length < 2}>
            <Link to="/properties/compare">Comparar</Link>
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-background hover:text-background hover:bg-background/20"
            onClick={() => { clearCompare(); setCompareIds([]); }}>
            <X className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
