// Simple offline request queue with auto-sync on reconnect.
// Persists serialized fetch requests to localStorage and replays them
// when the browser regains connectivity AND the user has a valid session.

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "offline-queue:v1";

export type QueuedRequest = {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  createdAt: number;
  label?: string;
};

function read(): QueuedRequest[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function write(items: QueuedRequest[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function getQueue(): QueuedRequest[] {
  return read();
}

export function enqueueRequest(
  input: Omit<QueuedRequest, "id" | "createdAt"> & { createdAt?: number },
): QueuedRequest {
  const item: QueuedRequest = {
    id: crypto.randomUUID(),
    createdAt: input.createdAt ?? Date.now(),
    url: input.url,
    method: input.method,
    headers: input.headers,
    body: input.body,
    label: input.label,
  };
  const items = read();
  items.push(item);
  write(items);
  return item;
}

let flushing = false;

export async function flushQueue(): Promise<{ ok: number; failed: number; skipped?: boolean }> {
  if (typeof window === "undefined") return { ok: 0, failed: 0 };
  if (flushing) return { ok: 0, failed: 0 };
  if (!navigator.onLine) return { ok: 0, failed: 0 };

  // Gate on a valid Supabase session — queued mutations almost always need auth.
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: 0, failed: 0, skipped: true };

  flushing = true;
  let ok = 0;
  let failed = 0;
  try {
    const items = read();
    const remaining: QueuedRequest[] = [];
    for (const item of items) {
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body,
        });
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          // 4xx is non-retryable; drop it
          ok += 1;
        } else {
          remaining.push(item);
          failed += 1;
        }
      } catch {
        remaining.push(item);
        failed += 1;
      }
    }
    write(remaining);
  } finally {
    flushing = false;
  }
  return { ok, failed };
}

/**
 * fetch wrapper: if offline (or fetch throws a network error),
 * enqueue the request for later replay and return a 202 synthetic response.
 */
export async function queuedFetch(
  input: string,
  init: RequestInit = {},
  opts: { label?: string } = {},
): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((v, k) => (headers[k] = v));
  const body = typeof init.body === "string" ? init.body : undefined;

  const queueIt = () => {
    enqueueRequest({ url: input, method, headers, body, label: opts.label });
    return new Response(JSON.stringify({ queued: true }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  };

  if (typeof navigator !== "undefined" && !navigator.onLine && method !== "GET") {
    return queueIt();
  }
  try {
    return await fetch(input, init);
  } catch (err) {
    if (method !== "GET") return queueIt();
    throw err;
  }
}

let installed = false;

export function installOfflineQueue() {
  if (typeof window === "undefined" || installed) return;
  installed = true;

  const tryFlush = async () => {
    const pending = read().length;
    if (!pending) return;
    const { ok, failed, skipped } = await flushQueue();
    if (skipped) return; // not signed in yet — wait for SIGNED_IN
    if (ok > 0) toast.success(`Sincronizado: ${ok} ação(ões) enviadas.`);
    if (failed > 0) toast.error(`${failed} ação(ões) ainda pendentes.`);
  };

  window.addEventListener("online", () => {
    void tryFlush();
  });

  // Replay once the user signs in (or session is restored from storage).
  supabase.auth.onAuthStateChange((event, session) => {
    if (!session) return;
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
      void tryFlush();
    }
  });
}
