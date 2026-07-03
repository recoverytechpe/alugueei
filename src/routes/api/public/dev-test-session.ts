import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * POST /api/public/dev-test-session
 * Endpoint interno para a suíte Playwright: dado um user_id conhecido de
 * persona de teste (Marina/Carlos/Rafael/lucas) e o CRON_SECRET, redefine a
 * senha para um valor fixo e retorna o email correspondente para que o teste
 * possa fazer signInWithPassword.
 *
 * Body: { user_id: string, password: string }
 * Header: x-cron-secret: <CRON_SECRET>
 */

const BodySchema = z.object({
  user_id: z.string().regex(/^[0-9a-f-]{36}$/i, "invalid id"),
  password: z.string().min(8).max(72),
});

const ALLOWED_IDS = new Set<string>([
  "11111111-1111-1111-1111-111111111111", // Carlos
  "22222222-2222-2222-2222-222222222222", // Marina
  "33333333-3333-3333-3333-333333333333", // Rafael
  "2f46e8ed-bbb7-4291-b8a3-aff7fe9f520e", // lucas
]);

const HEADERS = { "Content-Type": "application/json" };

export const Route = createFileRoute("/api/public/dev-test-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Hard-disable in production. This is a test-only helper.
        if (process.env.NODE_ENV === "production") {
          return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: HEADERS });
        }
        // Require CRON_SECRET (timing-safe compare) — do not rely on Host header alone.
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
          return new Response(JSON.stringify({ error: "server misconfigured" }), { status: 500, headers: HEADERS });
        }
        const provided = request.headers.get("x-cron-secret") ?? "";
        const { timingSafeEqual } = await import("crypto");
        const a = Buffer.from(provided);
        const b = Buffer.from(cronSecret);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: HEADERS });
        }
        // Defense-in-depth: still require localhost host.
        const host = request.headers.get("host") ?? "";
        if (!/^localhost(:\d+)?$/i.test(host) && !/^127\.0\.0\.1(:\d+)?$/.test(host)) {
          return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: HEADERS });
        }
        const rawText = await request.text();
        let raw: unknown = {};
        try { raw = JSON.parse(rawText); } catch { /* keep {} */ }
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "invalid body", rawText, issues: parsed.error.flatten() }), { status: 400, headers: HEADERS });
        }
        const { user_id, password } = parsed.data;
        if (!ALLOWED_IDS.has(user_id)) {
          return new Response(JSON.stringify({ error: "user not allowed" }), { status: 403, headers: HEADERS });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: userRes, error: getErr } = await supabaseAdmin.auth.admin.getUserById(user_id);
        if (getErr || !userRes.user?.email) {
          return new Response(JSON.stringify({ error: getErr?.message ?? "user not found" }), { status: 404, headers: HEADERS });
        }
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password });
        if (updErr) {
          return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: HEADERS });
        }
        return new Response(JSON.stringify({ email: userRes.user.email }), { status: 200, headers: HEADERS });
      },
    },
  },
});
