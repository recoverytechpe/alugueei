import { useEffect } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Home, Building2, MessageCircle, Handshake, User, Heart, Users, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InstallPrompt } from "@/components/InstallPrompt";
import { useViewAs } from "@/lib/view-as";
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
  to: "/dashboard" | "/properties" | "/chat" | "/negotiations" | "/profile" | "/favorites" | "/leads" | "/preapprovals" | "/affiliations";
  label: string;
  icon: typeof Home;
  matchPrefix: string;
  badgeKey?: "chat";
};

const HOME: NavItem = { to: "/dashboard", label: "Início", icon: Home, matchPrefix: "/dashboard" };
const PROPERTIES: NavItem = { to: "/properties", label: "Imóveis", icon: Building2, matchPrefix: "/properties" };
const CHAT: NavItem = { to: "/chat", label: "Chat", icon: MessageCircle, matchPrefix: "/chat", badgeKey: "chat" };
const PROFILE: NavItem = { to: "/profile", label: "Perfil", icon: User, matchPrefix: "/profile" };

const NAV_BY_ROLE: Record<"proprietario" | "locatario" | "agente", NavItem[]> = {
  proprietario: [HOME, PROPERTIES, CHAT, { to: "/negotiations", label: "Negócios", icon: Handshake, matchPrefix: "/negotiations" }, PROFILE],
  locatario:    [HOME, PROPERTIES, CHAT, { to: "/favorites", label: "Favoritos", icon: Heart, matchPrefix: "/favorites" }, PROFILE],
  agente:       [HOME, PROPERTIES, CHAT, { to: "/leads", label: "Leads", icon: Users, matchPrefix: "/leads" }, PROFILE],
};


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
  const { effectiveRole } = useViewAs();
  useOnboardingGate();

  const nav = NAV_BY_ROLE[effectiveRole] ?? NAV_BY_ROLE.locatario;

  return (
    <div className="min-h-[100dvh] bg-surface-muted flex justify-center">
      {/* App-shaped container: mobile-first, centered on desktop */}
      <div className="relative flex min-h-[100dvh] w-full max-w-[440px] flex-col bg-background shadow-[0_0_40px_rgba(0,0,0,0.04)]">
        <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">
          <Outlet />
        </main>

        {/* Bottom tab bar */}
        <nav
          aria-label="Navegação principal"
          className="fixed bottom-0 left-1/2 z-40 w-full max-w-[440px] -translate-x-1/2 border-t border-border bg-background/95 backdrop-blur"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="grid grid-cols-5">
            {nav.map((item) => {
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
                        "relative grid h-9 w-14 place-items-center rounded-full transition-colors",
                        active && "bg-primary/10",
                      )}
                    >
                      <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                      {showBadge && (
                        <span className="absolute -top-0.5 right-3 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
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
    </div>
  );
}
