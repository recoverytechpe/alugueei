import { queryOptions } from "@tanstack/react-query";

export type CityItem = { city: string; state: string; count: number };
export type NeighborhoodItem = { neighborhood: string; city: string; state: string; count: number };

export type CitiesParams = {
  q?: string;
  state?: string;
  sort?: "name" | "count";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type NeighborhoodsParams = CitiesParams & { city: string };

type Paginated<T> = { data: T[]; page: number; pageSize: number; total: number; totalPages: number };

function buildQS(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function fetchJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

export const citiesQueryOptions = (params: CitiesParams = {}) =>
  queryOptions({
    queryKey: ["api", "public", "cities", params] as const,
    queryFn: ({ signal }) =>
      fetchJSON<Paginated<CityItem>>(`/api/public/cities${buildQS(params)}`, signal),
    staleTime: 5 * 60_000,
  });

export const neighborhoodsQueryOptions = (params: NeighborhoodsParams) =>
  queryOptions({
    queryKey: ["api", "public", "neighborhoods", params] as const,
    queryFn: ({ signal }) =>
      fetchJSON<Paginated<NeighborhoodItem>>(`/api/public/neighborhoods${buildQS(params)}`, signal),
    staleTime: 5 * 60_000,
    enabled: !!params.city,
  });
