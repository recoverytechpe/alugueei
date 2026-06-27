import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, X, Share } from "lucide-react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "install-prompt-dismissed-at";
const DISMISS_DAYS = 14;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    nav.standalone === true
  );
}

function recentlyDismissed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const ageMs = Date.now() - Number(v);
    return ageMs < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Install prompt. Only renders inside authenticated areas (mounted in AppShell).
 * Hides forever once the app is installed (standalone display-mode or appinstalled event).
 * Dismissal is remembered for 14 days.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone() || recentlyDismissed()) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setHidden(false);
    };
    const onInstalled = () => {
      setDeferred(null);
      setHidden(true);
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        /* noop */
      }
    };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari has no beforeinstallprompt — show manual hint.
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos && !isStandalone()) {
      setShowIosHint(true);
      setHidden(false);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* noop */
    }
    setHidden(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      setHidden(true);
    } else {
      dismiss();
    }
    setDeferred(null);
  };

  return (
    <div
      className="fixed inset-x-0 z-50 px-4 pointer-events-none"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 80px)" }}
    >
      <Card className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 p-3 shadow-lg">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">
          A
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium leading-tight">Instalar o Alugueei</p>
          <p className="text-muted-foreground text-xs leading-snug">
            {showIosHint ? (
              <>
                Toque em <Share className="inline size-3.5 align-text-bottom" /> e
                depois em "Adicionar à Tela de Início".
              </>
            ) : (
              "Acesso rápido, em tela cheia, igual a um app."
            )}
          </p>
        </div>
        {deferred && (
          <Button size="sm" onClick={install} className="gap-1">
            <Download className="size-4" /> Instalar
          </Button>
        )}
        <button
          onClick={dismiss}
          aria-label="Dispensar"
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      </Card>
    </div>
  );
}
