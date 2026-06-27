import { useEffect } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Home, Building2, MessageCircle, Handshake, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import { BackButton } from "@/components/BackButton";
import { InstallPrompt } from "@/components/InstallPrompt";
import { cn } from "@/lib/utils";

function useOnboardingGate() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { needs: false };
      const { data: p } = await supabase
        .from("profiles")
        .select("onboarded_at, terms_accepted_at, privacy_accepted_at")
        .eq("id", u.user.id)
        .maybeSingle();
      return {
        needs: !p?.onboarded_at || !p?.terms_accepted_at || !p?.privacy_accepted_at,
      };
    },
    staleTime: 60_000,
  });
  useEffect(() => {
    if (data?.needs && !pathname.startsWith("/onboarding")) {
      navigate({ to: "/onboarding" });
    }
  }, [data?.needs, pathname, navigate]);
}



type NavItem = {
  to: "/dashboard" | "/properties" | "/chat" | "/negotiations" | "/profile";
  label: string;
  icon: typeof Home;
  matchPrefix: string;
  badgeKey?: "chat";
};

const NAV: NavItem[] = [
  { to: "/dashboard",    label: "Início",     icon: Home,          matchPrefix: "/dashboard" },
  { to: "/properties",   label: "Imóveis",    icon: Building2,     matchPrefix: "/properties" },
  { to: "/chat",         label: "Chat",       icon: MessageCircle, matchPrefix: "/chat",     badgeKey: "chat" },
  { to: "/negotiations", label: "Negócios",   icon: Handshake,     matchPrefix: "/negotiations" },
  { to: "/profile",      label: "Perfil",     icon: User,          matchPrefix: "/profile" },
];

function useUnreadChatCount() {
  return useQuery({
    queryKey: ["chat-unread-count"],
    queryFn: async (): Promise<number> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return 0;
      const { data: msgs } = await supabase
        .from("messages")
        .select("sender_id")
        .is("read_at", null);
      return (msgs ?? []).filter((m) => m.sender_id !== u.user!.id).length;
    },
    staleTime: 30_000,
  });
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: unread = 0 } = useUnreadChatCount();
  useOnboardingGate();


  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Sticky top bar — compact on mobile, expands on desktop */}
      <header
        className={cn(
          "sticky top-0 z-40 border-b bg-background/85 backdrop-blur",
          "supports-[backdrop-filter]:bg-background/70",
        )}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-center gap-1 min-w-0">
            <BackButton />
            <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">
                A
              </div>
              <span className="truncate text-base font-semibold tracking-tight">Alugueei</span>
            </Link>
          </div>
          <div className="flex items-center gap-1">

            <NotificationBell />
          </div>
        </div>
      </header>

      {/* Page content — pads bottom so tab bar never covers anything */}
      <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>

      {/* Bottom tab bar — mobile/tablet only */}
      <nav
        aria-label="Navegação principal"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden",
          "supports-[backdrop-filter]:bg-background/80",
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.matchPrefix);
            const Icon = item.icon;
            const showBadge = item.badgeKey === "chat" && unread > 0;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                    "touch-manipulation select-none active:scale-[0.96]",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "relative grid h-9 w-12 place-items-center rounded-full transition-colors",
                      active && "bg-primary/10",
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                    {showBadge && (
                      <span className="absolute -top-0.5 right-2 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </span>
                  <span className="leading-none">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <InstallPrompt />
    </div>
  );
}
