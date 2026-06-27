import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls, formatBRL } from "@/lib/property-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose,
} from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, SlidersHorizontal, Search as SearchIcon, MapPin, BedDouble, Bath, Ruler,
} from "lucide-react";

const schema = z.object({
  q: fallback(z.string(), "").default(""),
  city: fallback(z.string(), "").default(""),
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

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Busca avançada de imóveis | Plataforma de Aluguel" },
      { name: "description", content: "Filtre por cidade, tipo, quartos, banheiros, vagas, preço e área." },
    ],
    links: [{ rel: "canonical", href: "https://alugueei.lovable.app/search" }],
  }),
  validateSearch: zodValidator(schema),
  component: SearchPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
});

function SearchPage() {
  const f = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const update = (patch: Partial<z.infer<typeof schema>>) =>
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }) as never });

  const { data, isLoading } = useQuery({
    queryKey: ["public-search", f],
    queryFn: async () => {
      let q = supabase
        .from("properties")
        .select("id,title,city,state,neighborhood,property_type,bedrooms,bathrooms,area_m2,rent_value,property_photos(storage_path,position)")
        .eq("status", "available")
        .limit(60);
      if (f.sort === "newest") q = q.order("created_at", { ascending: false });
      if (f.sort === "price_asc") q = q.order("rent_value", { ascending: true });
      if (f.sort === "price_desc") q = q.order("rent_value", { ascending: false });
      if (f.sort === "area_desc") q = q.order("area_m2", { ascending: false });
      if (f.city.trim()) q = q.ilike("city", `%${f.city.trim()}%`);
      if (f.type !== "all") q = q.eq("property_type", f.type);
      if (f.bedrooms !== "any") q = q.gte("bedrooms", Number(f.bedrooms));
      if (f.bathrooms !== "any") q = q.gte("bathrooms", Number(f.bathrooms));
      if (f.parking !== "any") q = q.gte("parking_spots", Number(f.parking));
      if (f.min && !Number.isNaN(+f.min)) q = q.gte("rent_value", +f.min);
      if (f.max && !Number.isNaN(+f.max)) q = q.lte("rent_value", +f.max);
      if (f.minArea && !Number.isNaN(+f.minArea)) q = q.gte("area_m2", +f.minArea);
      if (f.maxArea && !Number.isNaN(+f.maxArea)) q = q.lte("area_m2", +f.maxArea);
      const { data: rows, error } = await q;
      if (error) throw error;
      const paths = (rows ?? [])
        .map((p) => (p.property_photos ?? []).slice().sort((a, b) => a.position - b.position)[0]?.storage_path)
        .filter((s): s is string => !!s);
      const urls = await getSignedPhotoUrls(paths);
      return (rows ?? []).map((p) => {
        const path = (p.property_photos ?? []).slice().sort((a, b) => a.position - b.position)[0]?.storage_path;
        return { ...p, cover: path ? urls[path] : null };
      });
    },
  });

  const filtered = useMemo(() => {
    const term = f.q.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((p) =>
      [p.title, p.city, p.neighborhood, p.state].filter(Boolean).some((s) => String(s).toLowerCase().includes(term)),
    );
  }, [data, f.q]);

  const activeCount =
    (f.city ? 1 : 0) + (f.type !== "all" ? 1 : 0) + (f.bedrooms !== "any" ? 1 : 0) +
    (f.bathrooms !== "any" ? 1 : 0) + (f.parking !== "any" ? 1 : 0) +
    (f.min ? 1 : 0) + (f.max ? 1 : 0) + (f.minArea ? 1 : 0) + (f.maxArea ? 1 : 0);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-4 md:py-8 space-y-4">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/"><ArrowLeft className="size-4 mr-1" /> Início</Link>
          </Button>
          <h1 className="text-xl md:text-2xl font-bold">Busca avançada</h1>
        </div>

        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={f.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Buscar por título, bairro, cidade…"
            className="pl-9 h-11"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 gap-1.5">
                <SlidersHorizontal className="size-4" /> Filtros
                {activeCount > 0 && (
                  <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                    {activeCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[88dvh] rounded-t-2xl p-0 flex flex-col">
              <SheetHeader className="px-5 pt-5 pb-3 border-b">
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-5 py-4 grid gap-4 sm:grid-cols-2">
                <Field label="Cidade">
                  <Input value={f.city} onChange={(e) => update({ city: e.target.value })} placeholder="São Paulo" />
                </Field>
                <Field label="Tipo">
                  <Select value={f.type} onValueChange={(v) => update({ type: v as "all" | "casa" | "apartamento" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="casa">Casa</SelectItem>
                      <SelectItem value="apartamento">Apartamento</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Quartos (mín.)">
                  <MinSelect value={f.bedrooms} onChange={(v) => update({ bedrooms: v })} options={[1, 2, 3, 4]} />
                </Field>
                <Field label="Banheiros (mín.)">
                  <MinSelect value={f.bathrooms} onChange={(v) => update({ bathrooms: v })} options={[1, 2, 3]} />
                </Field>
                <Field label="Vagas (mín.)">
                  <MinSelect value={f.parking} onChange={(v) => update({ parking: v })} options={[0, 1, 2, 3]} />
                </Field>
                <Field label="Aluguel mín. (R$)">
                  <Input type="number" inputMode="numeric" value={f.min} onChange={(e) => update({ min: e.target.value })} placeholder="1000" />
                </Field>
                <Field label="Aluguel máx. (R$)">
                  <Input type="number" inputMode="numeric" value={f.max} onChange={(e) => update({ max: e.target.value })} placeholder="5000" />
                </Field>
                <Field label="Área mín. (m²)">
                  <Input type="number" inputMode="numeric" value={f.minArea} onChange={(e) => update({ minArea: e.target.value })} placeholder="40" />
                </Field>
                <Field label="Área máx. (m²)">
                  <Input type="number" inputMode="numeric" value={f.maxArea} onChange={(e) => update({ maxArea: e.target.value })} placeholder="120" />
                </Field>
              </div>
              <SheetFooter className="px-5 py-3 border-t flex-row gap-2 sm:flex-row" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
                <Button variant="ghost" className="flex-1" onClick={() => navigate({ search: () => ({}) as never })}>
                  Limpar
                </Button>
                <SheetClose asChild>
                  <Button className="flex-1">Ver {filtered.length} imóveis</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Select value={f.sort} onValueChange={(v) => update({ sort: v as typeof f.sort })}>
            <SelectTrigger className="h-10 w-auto gap-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Mais recentes</SelectItem>
              <SelectItem value="price_asc">Menor preço</SelectItem>
              <SelectItem value="price_desc">Maior preço</SelectItem>
              <SelectItem value="area_desc">Maior área</SelectItem>
            </SelectContent>
          </Select>

          <p className="text-xs text-muted-foreground ml-auto">
            {isLoading ? "Buscando…" : `${filtered.length} resultado(s)`}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)
          ) : filtered.length === 0 ? (
            <Card className="col-span-full p-10 text-center text-sm text-muted-foreground">
              Nenhum imóvel encontrado com esses filtros.
            </Card>
          ) : (
            filtered.map((p) => (
              <Link
                key={p.id}
                to="/properties/$id"
                params={{ id: p.id }}
                className="block group rounded-2xl overflow-hidden bg-card border shadow-sm hover:shadow-md hover:border-primary/40 transition"
              >
                <div className="aspect-[16/10] bg-muted relative">
                  {p.cover ? (
                    <img src={p.cover} alt={p.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.02] transition" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Sem foto</div>
                  )}
                  <Badge className="absolute top-3 right-3 bg-background text-foreground hover:bg-background">
                    {formatBRL(p.rent_value)} /mês
                  </Badge>
                </div>
                <div className="p-4 space-y-1.5">
                  <h3 className="font-semibold leading-tight line-clamp-1">{p.title}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {[p.neighborhood, p.city, p.state].filter(Boolean).join(", ")}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                    <span className="flex items-center gap-1"><BedDouble className="size-3.5" /> {p.bedrooms}</span>
                    <span className="flex items-center gap-1"><Bath className="size-3.5" /> {p.bathrooms}</span>
                    <span className="flex items-center gap-1"><Ruler className="size-3.5" /> {Number(p.area_m2)} m²</span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function MinSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: number[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="any">Qualquer</SelectItem>
        {options.map((n) => <SelectItem key={n} value={String(n)}>{n}+</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
