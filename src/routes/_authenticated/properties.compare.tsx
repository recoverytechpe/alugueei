import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls, formatBRL } from "@/lib/property-helpers";
import { getCompareIds, toggleCompare, clearCompare } from "@/lib/property-prefs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, X, Check, Minus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/properties/compare")({
  head: () => ({ meta: [{ title: "Comparar imóveis | Plataforma de Aluguel" }] }),
  component: ComparePage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
});

function ComparePage() {
  const [ids, setIds] = useState<string[]>(() => getCompareIds());

  const { data, isLoading } = useQuery({
    queryKey: ["compare", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("properties")
        .select("id,title,city,state,neighborhood,property_type,bedrooms,bathrooms,parking_spots,area_m2,rent_value,condo_value,iptu_value,description,property_photos(storage_path,position)")
        .in("id", ids);
      if (error) throw error;
      const firstPhotos = (rows ?? []).map((p) => {
        const photos = (p.property_photos ?? []).slice().sort((a, b) => a.position - b.position);
        return photos[0]?.storage_path;
      }).filter((s): s is string => !!s);
      const urls = await getSignedPhotoUrls(firstPhotos);
      const indexed = new Map<string, typeof rows[number] & { cover: string | null }>();
      for (const r of rows ?? []) {
        const photos = (r.property_photos ?? []).slice().sort((a, b) => a.position - b.position);
        const path = photos[0]?.storage_path;
        indexed.set(r.id, { ...r, cover: path ? urls[path] : null });
      }
      // preserve user-selected order
      return ids.map((id) => indexed.get(id)).filter(Boolean) as Array<typeof rows[number] & { cover: string | null }>;
    },
  });

  useEffect(() => { setIds(getCompareIds()); }, []);

  function remove(id: string) {
    toggleCompare(id);
    setIds(getCompareIds());
  }

  function clearAll() {
    clearCompare();
    setIds([]);
  }

  const totals = (data ?? []).map((p) => Number(p.rent_value) + Number(p.condo_value ?? 0) + Number(p.iptu_value ?? 0));
  const minTotal = totals.length ? Math.min(...totals) : 0;
  const maxArea = (data ?? []).reduce((m, p) => Math.max(m, Number(p.area_m2)), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/properties"><ArrowLeft className="size-4 mr-1" />Voltar</Link>
          </Button>
          <h1 className="text-lg font-semibold">Comparar imóveis</h1>
          {ids.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={clearAll}>Limpar todos</Button>
          ) : <div className="w-24" />}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
        {ids.length === 0 ? (
          <EmptyState />
        ) : isLoading || !data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ids.map((id) => <Skeleton key={id} className="h-96" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr>
                  <th className="text-left text-xs uppercase text-muted-foreground p-2 align-top w-32">Atributo</th>
                  {data.map((p) => (
                    <th key={p.id} className="p-2 align-top text-left">
                      <div className="space-y-2">
                        <div className="aspect-[4/3] bg-muted rounded-lg overflow-hidden relative">
                          {p.cover && <img src={p.cover} alt={p.title} className="w-full h-full object-cover" />}
                          <button
                            onClick={() => remove(p.id)}
                            className="absolute top-2 right-2 size-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background"
                            aria-label="Remover">
                            <X className="size-4" />
                          </button>
                        </div>
                        <Link to="/properties/$id" params={{ id: p.id }} className="block text-sm font-semibold hover:underline line-clamp-2">
                          {p.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">{[p.neighborhood, p.city, p.state].filter(Boolean).join(" · ")}</p>
                        <Badge variant="secondary" className="capitalize">{p.property_type}</Badge>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                <Row label="Aluguel">
                  {data.map((p) => {
                    const v = Number(p.rent_value);
                    return <Cell key={p.id} bold={v === Math.min(...data.map((d) => Number(d.rent_value)))}>{formatBRL(v)}</Cell>;
                  })}
                </Row>
                <Row label="Condomínio">{data.map((p) => <Cell key={p.id}>{formatBRL(Number(p.condo_value ?? 0))}</Cell>)}</Row>
                <Row label="IPTU">{data.map((p) => <Cell key={p.id}>{formatBRL(Number(p.iptu_value ?? 0))}</Cell>)}</Row>
                <Row label="Total mensal">
                  {data.map((p, i) => {
                    const t = totals[i];
                    return <Cell key={p.id} bold={t === minTotal}>{formatBRL(t)}</Cell>;
                  })}
                </Row>
                <Row label="Área">
                  {data.map((p) => {
                    const a = Number(p.area_m2);
                    return <Cell key={p.id} bold={a === maxArea}>{a} m²</Cell>;
                  })}
                </Row>
                <Row label="Quartos">{data.map((p) => <Cell key={p.id}>{p.bedrooms}</Cell>)}</Row>
                <Row label="Banheiros">{data.map((p) => <Cell key={p.id}>{p.bathrooms}</Cell>)}</Row>
                <Row label="Vagas">{data.map((p) => <Cell key={p.id}>{p.parking_spots}</Cell>)}</Row>
                <Row label="Descrição">
                  {data.map((p) => (
                    <td key={p.id} className="p-3 align-top border-t text-xs text-muted-foreground max-w-xs">
                      <p className="line-clamp-6 whitespace-pre-wrap">{p.description || "—"}</p>
                    </td>
                  ))}
                </Row>
              </tbody>
              <tfoot>
                <tr>
                  <td className="p-2"></td>
                  {data.map((p) => (
                    <td key={p.id} className="p-2">
                      <Button asChild size="sm" className="w-full">
                        <Link to="/properties/$id" params={{ id: p.id }}>Ver detalhes</Link>
                      </Button>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
            <p className="mt-4 text-xs text-muted-foreground flex items-center gap-2">
              <Check className="size-3.5" /> Em negrito: melhor valor da linha.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <th className="text-left p-3 border-t font-medium text-muted-foreground align-top w-32">{label}</th>
      {children}
    </tr>
  );
}
function Cell({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return <td className={`p-3 border-t align-top ${bold ? "font-semibold" : ""}`}>{children}</td>;
}

function EmptyState() {
  return (
    <div className="py-20 text-center space-y-3">
      <Minus className="size-8 mx-auto text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Nenhum imóvel selecionado para comparar.</p>
      <Button asChild><Link to="/properties">Ir para a busca</Link></Button>
    </div>
  );
}
