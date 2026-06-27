import { useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const TOP_LEVEL = new Set<string>([
  "/",
  "/dashboard",
  "/properties",
  "/chat",
  "/negotiations",
  "/profile",
  "/auth",
]);

export function BackButton() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const normalized = pathname.replace(/\/$/, "") || "/";

  if (TOP_LEVEL.has(normalized)) return null;

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: "/dashboard" });
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={goBack}
      aria-label="Voltar"
      title="Voltar"
      className="h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      <span className="hidden sm:inline text-sm">Voltar</span>
    </Button>
  );
}
