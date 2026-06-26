import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

/**
 * GET /api/public/neighborhoods
 * Lista bairros distintos de imóveis disponíveis para uma cidade, com ordenação e paginação.
 *
 * Query params:
 *  - city: string        OBRIGATÓRIO — cidade exata
 *  - state?: string      UF (ex.: "SP")
 *  - q?: string          busca parcial (ilike) no bairro
 *  - sort?: "name" | "count"   default "name"
 *  - order?: "asc" | "desc"    default "asc"
 *  - page?: number       default 1 (>=1)
 *  - pageSize?: number   default 50 (1..200)
 *
 * Response: { data: { neighborhood, city, state, count }[], page, pageSize, total, totalPages }
 */

const QuerySchema = z.object({
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().length(2).optional(),
  q: z.string().trim().max(120).optional(),
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

export const Route = createFileRoute("/api/public/neighborhoods")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: JSON_HEADERS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return jsonResponse({ error: "Invalid query params", details: parsed.error.flatten() }, 400);
        }
        const { city, state, q, sort, order, page, pageSize } = parsed.data;

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return jsonResponse({ error: "Server misconfigured" }, 500);
        }

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        let query = supabase
          .from("properties")
          .select("neighborhood, city, state")
          .eq("status", "available")
          .eq("city", city);
        if (state) query = query.eq("state", state.toUpperCase());
        if (q) query = query.ilike("neighborhood", `%${q}%`);

        const { data: rows, error } = await query;
        if (error) return jsonResponse({ error: error.message }, 500);

        const map = new Map<string, { neighborhood: string; city: string; state: string; count: number }>();
        for (const r of rows ?? []) {
          const neighborhood = (r.neighborhood ?? "").trim();
          if (!neighborhood) continue;
          const uf = (r.state ?? "").trim().toUpperCase();
          const key = `${neighborhood}|${uf}`;
          const existing = map.get(key);
          if (existing) existing.count += 1;
          else map.set(key, { neighborhood, city, state: uf, count: 1 });
        }

        const all = Array.from(map.values());
        const dir = order === "asc" ? 1 : -1;
        all.sort((a, b) => {
          if (sort === "count") {
            const diff = a.count - b.count;
            return diff !== 0 ? diff * dir : a.neighborhood.localeCompare(b.neighborhood, "pt-BR") * dir;
          }
          return a.neighborhood.localeCompare(b.neighborhood, "pt-BR") * dir;
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
