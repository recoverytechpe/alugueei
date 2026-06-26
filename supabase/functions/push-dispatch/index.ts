// Push dispatcher: called by Postgres triggers via pg_net.
// Validates a shared secret, loads user's subscriptions, sends Web Push via VAPID.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@example.com";
const SHARED = Deno.env.get("PUSH_DISPATCH_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (req.headers.get("x-push-secret") !== SHARED) {
    return new Response("Unauthorized", { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  if (!payload?.user_id || !payload?.title) {
    return new Response("Bad request", { status: 400 });
  }

  const { data: subs, error } = await supa
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", payload.user_id);
  if (error) return new Response(error.message, { status: 500 });

  const body = JSON.stringify({
    title: String(payload.title),
    body: String(payload.body ?? ""),
    url: String(payload.url ?? "/"),
  });

  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      );
      sent++;
    } catch (e: unknown) {
      const err = e as { statusCode?: number };
      if (err.statusCode === 404 || err.statusCode === 410) {
        // expired/invalid subscription — clean up
        await supa.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  return new Response(JSON.stringify({ sent, total: subs?.length ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
