import type { ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  variant?: "plain" | "hero";
  showBack?: boolean;
  right?: ReactNode;
  children?: ReactNode;
}

/**
 * PageHeader — used at the top of authenticated screens.
 *
 * - `plain`: white background, dark title (default).
 * - `hero`: blue primary background with rounded bottom corners (owner dashboard style).
 */
export function PageHeader({
  title,
  subtitle,
  variant = "plain",
  showBack = false,
  right,
  children,
}: PageHeaderProps) {
  const router = useRouter();
  const hero = variant === "hero";

  return (
    <header
      className={cn(
        "px-4 pt-4",
        hero
          ? "bg-primary text-primary-foreground rounded-b-3xl pb-6"
          : "bg-background text-foreground pb-3",
      )}
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {showBack && (
            <button
              type="button"
              onClick={() => router.history.back()}
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full transition",
                hero
                  ? "bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground"
                  : "hover:bg-muted text-foreground",
              )}
              aria-label="Voltar"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          <div className="min-w-0">
            <h1
              className={cn(
                "truncate text-2xl font-bold leading-tight",
                hero && "text-primary-foreground",
              )}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className={cn(
                  "mt-0.5 truncate text-sm",
                  hero ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

/** Simple app-logo link used inside headers when needed. */
export function AppLogoLink() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground text-sm font-bold">
        A
      </span>
      <span className="text-base font-semibold tracking-tight">Alugueei</span>
    </Link>
  );
}
