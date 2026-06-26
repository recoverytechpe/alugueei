import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

/**
 * GET /api/public/cities
 * Lista cidades distintas de imóveis disponíveis, com ordenação e paginação.
 *
 * Query params:
 *  - q?: string         busca parcial (ilike) na cidade
 *  - state?: string     filtro por UF (ex.: "SP")
 *  - sort?: "name" | "count"   default "name"
 *  - order?: "asc" | "desc"    default "asc"
 *  - page?: number      default 1 (>=1)
 *  - pageSize?: number  default 50 (1..200)
 *
 * Response: { data: { city, state, count }[], page, pageSize, total, totalPages }
 */

const QuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  state: z.string().trim().length(2).optional(),
  sort: z.enum(["name", "count"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export const Route = createFileRoute("/api/public/cities")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: JSON_HEADERS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return jsonResponse({ error: "Invalid query params", details: parsed.error.flatten() }, 400);
        }
        const { q, state, sort, order, page, pageSize } = parsed.data;

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return jsonResponse({ error: "Server misconfigured" }, 500);
        }

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        // Busca apenas as colunas necessárias com o filtro de status (PostgREST não suporta DISTINCT;
        // agregamos em memória, o que é seguro para este dataset).
        let query = supabase.from("properties").select("city, state").eq("status", "available");
        if (state) query = query.eq("state", state.toUpperCase());
        if (q) query = query.ilike("city", `%${q}%`);

        const { data: rows, error } = await query;
        if (error) return jsonResponse({ error: error.message }, 500);

        const map = new Map<string, { city: string; state: string; count: number }>();
        for (const r of rows ?? []) {
          const city = (r.city ?? "").trim();
          const uf = (r.state ?? "").trim().toUpperCase();
          if (!city) continue;
          const key = `${city}|${uf}`;
          const existing = map.get(key);
          if (existing) existing.count += 1;
          else map.set(key, { city, state: uf, count: 1 });
        }

        const all = Array.from(map.values());
        const dir = order === "asc" ? 1 : -1;
        all.sort((a, b) => {
          if (sort === "count") {
            const diff = a.count - b.count;
            return diff !== 0 ? diff * dir : a.city.localeCompare(b.city, "pt-BR") * dir;
          }
          return a.city.localeCompare(b.city, "pt-BR") * dir;
        });

        const total = all.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const start = (page - 1) * pageSize;
        const data = all.slice(start, start + pageSize);

        return jsonResponse({ data, page, pageSize, total, totalPages });
      },
    },
  },
});
