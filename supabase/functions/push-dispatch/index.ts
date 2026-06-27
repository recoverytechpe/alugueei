// Push dispatcher: called by Postgres triggers via pg_net.
// Validates a shared secret, loads user's subscriptions, sends Web Push via VAPID.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@example.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

// Fetch the shared secret from the database (set via ALTER DATABASE ... SET app.push_dispatch_secret).
// Cached for the lifetime of the warm worker. Service-role-only RPC.
let cachedSecret: string | null = null;
async function getSharedSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const { data, error } = await supa.rpc("get_push_dispatch_secret");
  if (error || !data) throw new Error("push secret unavailable");
  cachedSecret = String(data);
  return cachedSecret;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let shared: string;
  try {
    shared = await getSharedSecret();
  } catch {
    return new Response("Server misconfigured", { status: 500 });
  }
  const provided = req.headers.get("x-push-secret") ?? "";
  if (!timingSafeEqualStr(provided, shared)) {
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
