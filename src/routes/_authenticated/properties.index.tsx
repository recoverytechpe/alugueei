import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls, formatBRL } from "@/lib/property-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({
    meta: [
      { title: "Imóveis disponíveis | Plataforma de Aluguel" },
      { name: "description", content: "Busque imóveis para alugar com filtros por cidade, tipo, quartos e preço." },
    ],
  }),
  component: PropertiesList,
});

type Filters = { city: string; neighborhood: string; type: string; bedrooms: string; max: string };

function PropertiesList() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>({ city: "all", neighborhood: "all", type: "all", bedrooms: "any", max: "" });
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      setIsOwner(!!roles?.some((r) => r.role === "proprietario"));
    });
  }, []);

  // Carrega a lista de cidades/bairros disponíveis (apenas imóveis disponíveis)
  const { data: locations } = useQuery({
    queryKey: ["properties-locations"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("properties")
        .select("city, neighborhood")
        .eq("status", "available");
      if (error) throw error;
      const map = new Map<string, Set<string>>();
      for (const r of rows ?? []) {
        const city = (r.city ?? "").trim();
        if (!city) continue;
        if (!map.has(city)) map.set(city, new Set());
        const n = (r.neighborhood ?? "").trim();
        if (n) map.get(city)!.add(n);
      }
      return Array.from(map.entries())
        .map(([city, set]) => ({ city, neighborhoods: Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR")) }))
        .sort((a, b) => a.city.localeCompare(b.city, "pt-BR"));
    },
    staleTime: 5 * 60_000,
  });

  const neighborhoodOptions = useMemo(() => {
    if (!locations) return [];
    if (filters.city === "all") {
      const all = new Set<string>();
      for (const l of locations) l.neighborhoods.forEach((n) => all.add(n));
      return Array.from(all).sort((a, b) => a.localeCompare(b, "pt-BR"));
    }
    return locations.find((l) => l.city === filters.city)?.neighborhoods ?? [];
  }, [locations, filters.city]);

  const { data, isLoading } = useQuery({
    queryKey: ["properties", filters],
    queryFn: async () => {
      let q = supabase
        .from("properties")
        .select("id,title,city,state,neighborhood,property_type,bedrooms,bathrooms,parking_spots,area_m2,rent_value,status,property_photos(storage_path,position)")
        .eq("status", "available")
        .order("created_at", { ascending: false })
        .limit(60);

      if (filters.city !== "all") q = q.eq("city", filters.city);
      if (filters.neighborhood !== "all") q = q.eq("neighborhood", filters.neighborhood);

      if (filters.type !== "all") q = q.eq("property_type", filters.type as "casa" | "apartamento");
      if (filters.bedrooms !== "any") q = q.gte("bedrooms", Number(filters.bedrooms));
      if (filters.max && !Number.isNaN(Number(filters.max))) q = q.lte("rent_value", Number(filters.max));

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← Dashboard</Link>
          <h1 className="text-lg font-semibold">Imóveis disponíveis</h1>
          {isOwner ? (
            <Button asChild size="sm"><Link to="/properties/new">Cadastrar imóvel</Link></Button>
          ) : <div className="w-32" />}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Select
                value={filters.city}
                onValueChange={(v) => setFilters({ ...filters, city: v, neighborhood: "all" })}
              >
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {locations?.map((l) => (
                    <SelectItem key={l.city} value={l.city}>{l.city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bairro</Label>
              <Select
                value={filters.neighborhood}
                onValueChange={(v) => setFilters({ ...filters, neighborhood: v })}
                disabled={!neighborhoodOptions.length}
              >
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {neighborhoodOptions.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
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
              <Select value={filters.bedrooms} onValueChange={(v) => setFilters({ ...filters, bedrooms: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer</SelectItem>
                  {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}+</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-max">Aluguel máx. (R$)</Label>
              <Input id="f-max" type="number" inputMode="numeric" value={filters.max} onChange={(e) => setFilters({ ...filters, max: e.target.value })} placeholder="5000" />
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
          </div>
        ) : empty ? (
          <div className="py-16 text-center text-muted-foreground">Nenhum imóvel encontrado.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data!.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate({ to: "/properties/$id", params: { id: p.id } })}
                className="text-left"
              >
                <Card className="overflow-hidden hover:border-primary transition-colors h-full">
                  <div className="aspect-[4/3] bg-muted overflow-hidden">
                    {p.cover ? (
                      <img src={p.cover} alt={p.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Sem foto</div>
                    )}
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
                </Card>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
