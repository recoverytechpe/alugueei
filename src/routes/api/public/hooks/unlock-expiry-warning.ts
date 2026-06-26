import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/unlock-expiry-warning")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const admin = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        // Unlocks paid, not yet warned, expiring within next 48h
        const horizon = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        const { data: unlocks, error } = await admin
          .from("property_unlocks")
          .select("id, user_id, property_id, expires_at")
          .eq("status", "paid")
          .is("warning_sent_at", null)
          .not("expires_at", "is", null)
          .lte("expires_at", horizon)
          .gt("expires_at", new Date().toISOString())
          .limit(200);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        let notified = 0;
        for (const u of unlocks ?? []) {
          await admin.rpc("notify_user", {
            _user_id: u.user_id,
            _kind: "payment",
            _title: "Desbloqueio expira em breve",
            _body: "Seu acesso aos contatos expira em menos de 48h. Renove para continuar.",
            _url: `/properties/${u.property_id}`,
          });
          await admin
            .from("property_unlocks")
            .update({ warning_sent_at: new Date().toISOString() })
            .eq("id", u.id);
          notified++;
        }

        return new Response(JSON.stringify({ ok: true, notified }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
