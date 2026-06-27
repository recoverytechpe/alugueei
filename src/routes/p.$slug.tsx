import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BedDouble, Bath, Car, MapPin, Ruler, ArrowLeft } from "lucide-react";
import { formatBRL } from "@/lib/property-helpers";

const SITE = "https://alugueei.lovable.app";

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("properties_public")
      .select(
        "id, slug, title, description, property_type, neighborhood, city, state, bedrooms, bathrooms, parking_spots, area_m2, rent_value, condo_value, iptu_value",
      )
      .eq("slug", params.slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return data;
  },
  head: ({ params, loaderData }) => {
    const p = loaderData;
    if (!p) return { meta: [{ title: "Imóvel | Alugueei" }] };
    const title = p.title ?? "Imóvel";
    const desc = `${p.bedrooms ?? "?"} quartos · ${p.bathrooms ?? "?"} banheiros · ${p.neighborhood ?? ""}, ${p.city ?? ""}. ${formatBRL(p.rent_value)}/mês.`;
    const url = `${SITE}/p/${params.slug}`;
    return {
      meta: [
        { title: `${title} | Alugueei` },
        { name: "description", content: desc.slice(0, 160) },
        { property: "og:title", content: title },
        { property: "og:description", content: desc.slice(0, 160) },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        { property: "twitter:card", content: "summary_large_image" },
        { property: "twitter:title", content: title },
        { property: "twitter:description", content: desc.slice(0, 160) },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: title,
            description: p.description,
            offers: {
              "@type": "Offer",
              price: Number(p.rent_value),
              priceCurrency: "BRL",
              availability: "https://schema.org/InStock",
              url,
            },
          }),
        },
      ],
    };
  },
  component: PublicProperty,
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-8 text-center">
      <p className="text-destructive">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-8 text-center space-y-3">
      <h1 className="text-2xl font-semibold">Imóvel não encontrado</h1>
      <p className="text-muted-foreground">Este anúncio pode ter sido removido ou desativado.</p>
      <Button asChild>
        <Link to="/">Voltar ao início</Link>
      </Button>
    </div>
  ),
});

function PublicProperty() {
  const p = Route.useLoaderData();
  const { slug } = Route.useParams();

  const { data: photos } = useQuery({
    queryKey: ["public-photos", p.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_photos_public")
        .select("storage_path, position")
        .eq("property_id", p.id as string)
        .order("position", { ascending: true });
      const paths = (data ?? []).map((d) => d.storage_path as string);
      if (paths.length === 0) return [] as string[];
      const { data: signed } = await supabase.storage
        .from("property-photos")
        .createSignedUrls(paths, 60 * 60);
      return (signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[];
    },
  });

  const cover = photos?.[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-30 bg-background/85 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">
              A
            </div>
            <span className="font-semibold tracking-tight">Alugueei</span>
          </Link>
          <Button asChild size="sm">
            <Link to="/auth">Entrar</Link>
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Início
        </Link>

        <div className="grid gap-2 sm:grid-cols-4">
          <div className="sm:col-span-3 aspect-[4/3] rounded-xl overflow-hidden bg-muted">
            {cover ? (
              <img
                src={cover}
                alt={p.title ?? ""}
                className="size-full object-cover"
                loading="eager"
              />
            ) : (
              <Skeleton className="size-full" />
            )}
          </div>
          <div className="grid gap-2 sm:grid-rows-3">
            {(photos ?? []).slice(1, 4).map((url, i) => (
              <div key={i} className="rounded-xl overflow-hidden bg-muted aspect-[4/3] sm:aspect-auto">
                <img src={url} alt="" className="size-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{p.title}</h1>
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <MapPin className="size-4" />
            <span>
              {p.neighborhood}, {p.city} — {p.state}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.property_type && <Badge variant="secondary">{String(p.property_type)}</Badge>}
            {p.bedrooms != null && (
              <Badge variant="outline" className="gap-1">
                <BedDouble className="size-3.5" /> {p.bedrooms} quartos
              </Badge>
            )}
            {p.bathrooms != null && (
              <Badge variant="outline" className="gap-1">
                <Bath className="size-3.5" /> {p.bathrooms} banh.
              </Badge>
            )}
            {p.parking_spots != null && (
              <Badge variant="outline" className="gap-1">
                <Car className="size-3.5" /> {p.parking_spots} vagas
              </Badge>
            )}
            {p.area_m2 != null && (
              <Badge variant="outline" className="gap-1">
                <Ruler className="size-3.5" /> {Number(p.area_m2)} m²
              </Badge>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="py-5 grid sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Aluguel</p>
              <p className="text-xl font-semibold">{formatBRL(p.rent_value)}</p>
            </div>
            {p.condo_value != null && Number(p.condo_value) > 0 && (
              <div>
                <p className="text-xs uppercase text-muted-foreground">Condomínio</p>
                <p className="text-xl font-semibold">{formatBRL(p.condo_value)}</p>
              </div>
            )}
            {p.iptu_value != null && Number(p.iptu_value) > 0 && (
              <div>
                <p className="text-xs uppercase text-muted-foreground">IPTU</p>
                <p className="text-xl font-semibold">{formatBRL(p.iptu_value)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {p.description && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Descrição</h2>
            <p className="text-sm whitespace-pre-line text-muted-foreground">{p.description}</p>
          </section>
        )}

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">Interessado neste imóvel?</h3>
              <p className="text-sm text-muted-foreground">
                Entre para conversar com o proprietário, agendar visita e enviar proposta.
              </p>
            </div>
            <Button asChild size="lg">
              <Link to="/auth" search={{ next: `/p/${slug}` } as never}>
                Entrar para continuar
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>

      <footer className="border-t mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 text-xs text-muted-foreground flex flex-wrap gap-4 justify-between">
          <span>© Alugueei</span>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-foreground">Termos</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
