import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls, formatBRL } from "@/lib/property-helpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, MapPin, BedDouble, Bath } from "lucide-react";

export const Route = createFileRoute("/_authenticated/favorites")({
  head: () => ({ meta: [{ title: "Meus favoritos | Plataforma de Aluguel" }] }),
  component: FavoritesPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
});

function FavoritesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["favorites-page"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data: rows } = await supabase
        .from("favorites")
        .select("property_id, created_at, properties(id,title,city,neighborhood,rent_value,bedrooms,bathrooms,property_photos(storage_path,position))")
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false });
      const list = (rows ?? [])
        .map((r) => (r as unknown as { properties: any }).properties)
        .filter(Boolean);
      const paths = list.flatMap((p: any) =>
        (p.property_photos ?? []).slice().sort((a: any, b: any) => a.position - b.position).slice(0, 1).map((ph: any) => ph.storage_path)
      );
      const urls = await getSignedPhotoUrls(paths);
      return list.map((p: any) => {
        const cover = (p.property_photos ?? []).slice().sort((a: any, b: any) => a.position - b.position)[0];
        return { ...p, cover: cover ? urls[cover.storage_path] : undefined };
      });
    },
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center gap-2">
        <Heart className="size-5 fill-rose-500 text-rose-500" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight truncate">Meus favoritos</h1>
          <p className="text-xs text-muted-foreground">Imóveis que você salvou</p>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : !data || data.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <Heart className="size-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Você ainda não favoritou nenhum imóvel.
            </p>
            <Button asChild size="sm">
              <Link to="/properties">Explorar imóveis</Link>
            </Button>
          </Card>
        ) : (
          data.map((p: any) => (
            <Link key={p.id} to="/properties/$id" params={{ id: p.id }} className="block active:scale-[0.99] transition-transform">
              <Card className="overflow-hidden flex hover:shadow-md transition">
                <div className="w-28 aspect-square bg-muted shrink-0">
                  {p.cover && <img src={p.cover} alt={p.title} className="w-full h-full object-cover" loading="lazy" />}
                </div>
                <div className="flex-1 p-3 min-w-0">
                  <p className="text-sm font-semibold truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                    <MapPin className="size-3 shrink-0" />
                    {[p.neighborhood, p.city].filter(Boolean).join(", ")}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><BedDouble className="size-3" /> {p.bedrooms}</span>
                    <span className="flex items-center gap-1"><Bath className="size-3" /> {p.bathrooms}</span>
                  </div>
                  <p className="text-sm font-bold text-primary mt-1">
                    {formatBRL(p.rent_value)}<span className="text-[10px] font-normal text-muted-foreground">/mês</span>
                  </p>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
