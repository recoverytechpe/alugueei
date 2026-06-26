import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls, formatBRL } from "@/lib/property-helpers";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  MapPin,
  BedDouble,
  Bath,
  Ruler,
  BadgeCheck,
  Home as HomeIcon,
  MessageSquare,
  User,
  SlidersHorizontal,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Encontre seu próximo lar | Plataforma de Aluguel" },
      {
        name: "description",
        content:
          "Busque imóveis verificados para alugar com filtros por preço, tipo e localização.",
      },
    ],
  }),
  component: Home,
});

type Filters = { q: string; maxPrice: string; type: string; city: string };

function Home() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>({
    q: "",
    maxPrice: "any",
    type: "all",
    city: "all",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["home-properties"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("properties")
        .select(
          "id,title,city,state,neighborhood,property_type,bedrooms,bathrooms,area_m2,rent_value,property_photos(storage_path,position)",
        )
        .eq("status", "available")
        .order("created_at", { ascending: false })
        .limit(24);
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

  const cities = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((p) => p.city && set.add(p.city));
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return (data ?? []).filter((p) => {
      if (filters.type !== "all" && p.property_type !== filters.type) return false;
      if (filters.city !== "all" && p.city !== filters.city) return false;
      if (filters.maxPrice !== "any" && Number(p.rent_value) > Number(filters.maxPrice)) return false;
      if (
        q &&
        ![p.title, p.city, p.neighborhood, p.state]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }, [data, filters]);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Mobile uses a centered 440px frame; desktop expands to a full container. */}
      <div className="mx-auto w-full max-w-[440px] md:max-w-6xl min-h-screen bg-background shadow-xl md:shadow-none pb-24 md:pb-12 relative">
        {/* Hero */}
        <section className="px-6 md:px-10 pt-10 md:pt-16 pb-6 md:pb-10 bg-gradient-to-br from-primary/95 to-primary text-primary-foreground rounded-b-3xl md:rounded-b-[2rem]">
          <p className="text-sm/none opacity-80">Olá,</p>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mt-1 md:max-w-2xl">
            Encontre seu próximo<br className="md:hidden" /> lar perfeito
          </h1>

          {/* Search bar */}
          <div className="mt-6 md:mt-8 relative md:max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Buscar por local, imóvel ou palavra-chave"
              className="pl-10 h-12 md:h-14 rounded-2xl bg-background text-foreground border-0 shadow-md"
            />
          </div>

          {/* Filter pills */}
          <div className="mt-3 md:mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 md:flex-wrap md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FilterPill icon={<SlidersHorizontal className="size-3.5" />} label="Preço">
              <Select
                value={filters.maxPrice}
                onValueChange={(v) => setFilters({ ...filters, maxPrice: v })}
              >
                <SelectTrigger className="border-0 h-7 px-2 bg-transparent text-foreground text-xs shadow-none focus:ring-0">
                  <SelectValue placeholder="Preço" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer</SelectItem>
                  <SelectItem value="1500">Até R$ 1.500</SelectItem>
                  <SelectItem value="3000">Até R$ 3.000</SelectItem>
                  <SelectItem value="5000">Até R$ 5.000</SelectItem>
                  <SelectItem value="10000">Até R$ 10.000</SelectItem>
                </SelectContent>
              </Select>
            </FilterPill>

            <FilterPill icon={<HomeIcon className="size-3.5" />} label="Tipo">
              <Select
                value={filters.type}
                onValueChange={(v) => setFilters({ ...filters, type: v })}
              >
                <SelectTrigger className="border-0 h-7 px-2 bg-transparent text-foreground text-xs shadow-none focus:ring-0">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="casa">Casa</SelectItem>
                  <SelectItem value="apartamento">Apartamento</SelectItem>
                </SelectContent>
              </Select>
            </FilterPill>

            <FilterPill icon={<MapPin className="size-3.5" />} label="Local">
              <Select
                value={filters.city}
                onValueChange={(v) => setFilters({ ...filters, city: v })}
              >
                <SelectTrigger className="border-0 h-7 px-2 bg-transparent text-foreground text-xs shadow-none focus:ring-0">
                  <SelectValue placeholder="Cidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {cities.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterPill>
          </div>
        </section>

        {/* Featured */}
        <section className="px-6 md:px-10 pt-6 md:pt-10">
          <div className="flex items-center justify-between mb-3 md:mb-6">
            <h2 className="text-lg md:text-2xl font-semibold">Imóveis em destaque</h2>
            <Link to="/properties" className="text-xs md:text-sm font-medium text-primary hover:underline">
              Ver todos
            </Link>
          </div>

          <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6">

            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full rounded-2xl" />
              ))
            ) : filtered.length === 0 ? (
              <EmptyState />
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate({ to: "/properties/$id", params: { id: p.id } })}
                  className="w-full text-left block group"
                >
                  <article className="rounded-2xl overflow-hidden bg-card border shadow-sm group-hover:shadow-md group-hover:border-primary/40 transition">
                    <div className="aspect-[16/10] bg-muted relative overflow-hidden">
                      {p.cover ? (
                        <img
                          src={p.cover}
                          alt={p.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                          Sem foto
                        </div>
                      )}
                      <div className="absolute top-3 right-3 bg-background/95 backdrop-blur px-2.5 py-1 rounded-full text-xs font-semibold shadow">
                        {formatBRL(p.rent_value)}
                        <span className="text-muted-foreground font-normal"> /mês</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-2">
                      <h3 className="font-semibold leading-tight line-clamp-1">{p.title}</h3>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="size-3.5" />
                        {[p.neighborhood, p.city, p.state].filter(Boolean).join(", ")}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                        <span className="flex items-center gap-1">
                          <BedDouble className="size-3.5" /> {p.bedrooms} quartos
                        </span>
                        <span className="flex items-center gap-1">
                          <Bath className="size-3.5" /> {p.bathrooms} banh.
                        </span>
                        <span className="flex items-center gap-1">
                          <Ruler className="size-3.5" /> {Number(p.area_m2)} m²
                        </span>
                      </div>
                      <Badge
                        variant="secondary"
                        className="mt-2 gap-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                      >
                        <BadgeCheck className="size-3.5" /> Imóvel verificado
                      </Badge>
                    </div>
                  </article>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[440px] border-t bg-background/95 backdrop-blur z-10">
          <div className="grid grid-cols-4 px-2 py-2">
            <NavItem icon={<HomeIcon className="size-5" />} label="Início" to="/" active />
            <NavItem icon={<Search className="size-5" />} label="Buscar" to="/properties" />
            <NavItem icon={<MessageSquare className="size-5" />} label="Mensagens" to="/chat" />
            <NavItem icon={<User className="size-5" />} label="Perfil" to="/profile" />
          </div>
        </nav>
      </div>
    </div>
  );
}

function FilterPill({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0 bg-background rounded-full pl-3 pr-1 flex items-center gap-1.5 text-foreground shadow-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs font-medium sr-only">{label}</span>
      {children}
    </div>
  );
}

function NavItem({
  icon,
  label,
  to,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  to: "/" | "/properties" | "/chat" | "/profile";
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center gap-0.5 py-1 text-[11px] font-medium ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
      Nenhum imóvel encontrado com esses filtros.
    </div>
  );
}
