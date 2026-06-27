// Guarded service-worker registration for offline app-shell caching.
// Runs only in production browser contexts. Coexists with /sw.js (push worker)
// by using a distinct filename: /app-sw.js.

const APP_SW_URL = "/app-sw.js";

function isPreviewHost(host: string): boolean {
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
}

async function unregisterAppSw() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) {
    const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
    if (url.endsWith(APP_SW_URL)) {
      await r.unregister();
    }
  }
}

export async function registerAppServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const inIframe = window.self !== window.top;
  const host = window.location.hostname;
  const killSwitch = new URLSearchParams(window.location.search).get("sw") === "off";

  if (
    !import.meta.env.PROD ||
    inIframe ||
    isPreviewHost(host) ||
    killSwitch
  ) {
    await unregisterAppSw().catch(() => {});
    return;
  }

  try {
    await navigator.serviceWorker.register(APP_SW_URL, { scope: "/" });
  } catch (err) {
    console.warn("[app-sw] registration failed", err);
  }
}
