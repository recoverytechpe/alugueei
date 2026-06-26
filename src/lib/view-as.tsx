import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "proprietario" | "locatario" | "agente";
export const ALL_ROLES: Role[] = ["proprietario", "locatario", "agente"];
const STORAGE_KEY = "admin_view_as";

type Ctx = {
  userId: string | null;
  realRole: Role;
  isAdmin: boolean;
  effectiveRole: Role;
  override: Role | null;
  setViewAs: (role: Role | null) => void;
  isLoading: boolean;
};

const ViewAsContext = createContext<Ctx | null>(null);

function readOverride(): Role | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v && (ALL_ROLES as string[]).includes(v) ? (v as Role) : null;
}

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<Role | null>(() => readOverride());

  // Cross-tab sync
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setOverride(readOverride());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["view-as-roles"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { userId: null as string | null, roles: [] as string[] };
      const { data: rows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id);
      return {
        userId: u.user.id,
        roles: (rows ?? []).map((r) => r.role as string),
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const setViewAs = useCallback((role: Role | null) => {
    if (typeof window === "undefined") return;
    if (role) window.localStorage.setItem(STORAGE_KEY, role);
    else window.localStorage.removeItem(STORAGE_KEY);
    // Mark the role swap as a non-urgent update so the click stays snappy
    // and React can interrupt the heavy panel re-render.
    startTransition(() => setOverride(role));
  }, []);


  const value = useMemo<Ctx>(() => {
    const roles = data?.roles ?? [];
    const isAdmin = roles.includes("admin");
    const realRole = (roles.find((r) => r !== "admin") ?? "locatario") as Role;
    const effectiveRole = isAdmin && override ? override : realRole;
    return {
      userId: data?.userId ?? null,
      realRole,
      isAdmin,
      effectiveRole,
      override: isAdmin ? override : null,
      setViewAs,
      isLoading,
    };
  }, [data, override, setViewAs, isLoading]);

  return <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>;
}

export function useViewAs(): Ctx {
  const ctx = useContext(ViewAsContext);
  if (!ctx) throw new Error("useViewAs must be used within <ViewAsProvider>");
  return ctx;
}
