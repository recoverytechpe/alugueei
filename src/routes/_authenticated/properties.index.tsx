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
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose } from "@/components/ui/sheet";
import { PropertyCard } from "@/components/ui/property-card";
import { Scale, BookmarkPlus, Bookmark, X, History, Trash2, SlidersHorizontal, Plus, Users, Search, Bell } from "lucide-react";
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
  unlocked: fallback(z.enum(["all", "mine"]), "all").default("all"),
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
  const navigate = useNavigate({ from: "/_authenticated/properties/" });
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
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }) as never });
  }

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (f.city !== "all") n++;
    if (f.neighborhood !== "all") n++;
    if (f.type !== "all") n++;
    if (f.bedrooms !== "any") n++;
    if (f.bathrooms !== "any") n++;
    if (f.parking !== "any") n++;
    if (f.min) n++;
    if (f.max) n++;
    if (f.minArea) n++;
    if (f.maxArea) n++;
    if (f.unlocked !== "all") n++;
    return n;
  }, [f]);
  const hasFilters = activeFilterCount > 0;

  const { data, isLoading } = useQuery({
    queryKey: ["properties", f],
    queryFn: async () => {
      let unlockedIds: string[] | null = null;
      if (f.unlocked === "mine") {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return [];
        const nowIso = new Date().toISOString();
        const { data: rows } = await supabase
          .from("property_unlocks")
          .select("property_id, expires_at")
          .eq("user_id", u.user.id)
          .eq("status", "paid");
        unlockedIds = (rows ?? [])
          .filter((r) => !r.expires_at || r.expires_at > nowIso)
          .map((r) => r.property_id);
        if (unlockedIds.length === 0) return [];
      }

      let q = supabase
        .from("properties")
        .select("id,title,city,state,neighborhood,property_type,bedrooms,bathrooms,parking_spots,area_m2,rent_value,status,created_at,property_photos(storage_path,position)")
        .eq("status", "available")
        .limit(60);

      if (unlockedIds) q = q.in("id", unlockedIds);

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

      const ids = (rows ?? []).map((p) => p.id);
      const interestMap: Record<string, number> = {};
      if (ids.length > 0) {
        const { getPropertyInterestCounts } = await import("@/lib/protected-rpcs.functions");
        const counts = await getPropertyInterestCounts({ data: { propertyIds: ids } });
        for (const c of counts) interestMap[c.property_id] = c.interested_count;
      }

      return (rows ?? []).map((p) => {
        const photos = (p.property_photos ?? []).slice().sort((a, b) => a.position - b.position);
        const path = photos[0]?.storage_path;
        return { ...p, cover: path ? urls[path] : null, interested_count: interestMap[p.id] ?? 0 };
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
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full px-4 pt-6 pb-4 space-y-4">

        {/* Hero */}
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight leading-tight">
            Encontre seu próximo<br />
            <span className="text-primary">lar perfeito</span>
          </h1>
          <button
            type="button"
            className="grid size-10 shrink-0 place-items-center rounded-full text-foreground hover:bg-muted"
            aria-label="Notificações"
          >
            <Bell className="size-5" />
            <span className="sr-only">Notificações</span>
          </button>
        </div>

        <p className="text-xs text-muted-foreground -mt-2">
          {isLoading ? "Buscando…" : `${data?.length ?? 0} resultado(s)`}
          {isOwner && (
            <> · <Link to="/properties/new" className="text-primary font-semibold inline-flex items-center gap-1"><Plus className="size-3" />Cadastrar imóvel</Link></>
          )}
        </p>


        {/* Toolbar: Filters (sheet) + Sort + Saved searches */}
        <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5 h-10">
                <SlidersHorizontal className="size-4" />
                Filtros
                {activeFilterCount > 0 && (
                  <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="h-[88dvh] rounded-t-2xl p-0 flex flex-col"
            >
              <SheetHeader className="px-5 pt-5 pb-3 border-b">
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-5 py-4 grid gap-4 sm:grid-cols-2">
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
                  <Select value={f.neighborhood} onValueChange={(v) => update({ neighborhood: v })} disabled={!neighborhoodOptions.length}>
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
                  <Label>Acesso</Label>
                  <Select value={f.unlocked} onValueChange={(v) => update({ unlocked: v as "all" | "mine" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os imóveis</SelectItem>
                      <SelectItem value="mine">Só desbloqueados</SelectItem>
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
                  <Input id="f-min" type="number" inputMode="numeric" value={f.min} onChange={(e) => update({ min: e.target.value })} placeholder="1000" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-max">Aluguel máx. (R$)</Label>
                  <Input id="f-max" type="number" inputMode="numeric" value={f.max} onChange={(e) => update({ max: e.target.value })} placeholder="5000" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-amin">Área mín. (m²)</Label>
                  <Input id="f-amin" type="number" inputMode="numeric" value={f.minArea} onChange={(e) => update({ minArea: e.target.value })} placeholder="40" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-amax">Área máx. (m²)</Label>
                  <Input id="f-amax" type="number" inputMode="numeric" value={f.maxArea} onChange={(e) => update({ maxArea: e.target.value })} placeholder="120" />
                </div>
              </div>
              <SheetFooter className="px-5 py-3 border-t flex-row gap-2 sm:flex-row" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
                <Button variant="ghost" className="flex-1" onClick={clearFilters} disabled={!hasFilters}>
                  Limpar
                </Button>
                <SheetClose asChild>
                  <Button className="flex-1">Ver {data?.length ?? 0} imóveis</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Select value={f.sort} onValueChange={(v) => update({ sort: v as typeof f.sort })}>
            <SelectTrigger className="h-10 w-auto shrink-0 gap-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Mais recentes</SelectItem>
              <SelectItem value="price_asc">Menor preço</SelectItem>
              <SelectItem value="price_desc">Maior preço</SelectItem>
              <SelectItem value="area_desc">Maior área</SelectItem>
            </SelectContent>
          </Select>

          <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="shrink-0 h-10 gap-1.5" disabled={!hasFilters}>
                <BookmarkPlus className="size-4" /><span className="hidden sm:inline">Salvar</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Salvar esta busca</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="save-name">Nome</Label>
                <Input id="save-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Ex.: 2qts em Pinheiros até 4k" autoFocus />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancelar</Button>
                <Button onClick={handleSaveSearch}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="shrink-0 h-10 gap-1.5">
                <Bookmark className="size-4" />
                <span className="hidden sm:inline">Salvas</span>
                <span className="text-xs text-muted-foreground">({saved.length})</span>
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

          {hasFilters && (
            <Button size="sm" variant="ghost" className="shrink-0 h-10" onClick={clearFilters}>
              <X className="size-4 mr-1" />Limpar
            </Button>
          )}
        </div>

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
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
          </div>
        ) : empty ? (
          <div className="py-16 text-center text-muted-foreground">Nenhum imóvel encontrado.</div>
        ) : (
          <div className="space-y-3">
            {data!.map((p) => {
              const inCompare = compareIds.includes(p.id);
              return (
                <div key={p.id} className="relative">
                  <div onClick={() => handleOpenCard(p)}>
                    <PropertyCard
                      property={{
                        id: p.id,
                        title: p.title,
                        city: p.city,
                        neighborhood: p.neighborhood,
                        rent_value: Number(p.rent_value),
                        bedrooms: p.bedrooms,
                        bathrooms: p.bathrooms,
                        area: p.area_m2 != null ? Number(p.area_m2) : null,
                        cover: p.cover ?? `https://picsum.photos/seed/${p.id}/800/600`,
                        verified: true,
                      }}
                    />
                  </div>

                  {p.interested_count > 0 && (
                    <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full bg-background/95 backdrop-blur px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm">
                      <Users className="size-3" />
                      {p.interested_count}
                    </div>
                  )}
                  <label className="mt-1.5 ml-2 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                    <Checkbox checked={inCompare} onCheckedChange={() => onToggleCompare(p.id)} />
                    <span>Comparar</span>
                  </label>
                </div>
              );
            })}
          </div>

        )}
      </main>

      {compareIds.length > 0 && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-40 bg-foreground text-background rounded-full shadow-lg px-4 py-2 flex items-center gap-3"
          style={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
        >
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
