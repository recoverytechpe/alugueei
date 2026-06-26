import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useViewAs, ALL_ROLES, type Role } from "@/lib/view-as";
import { Eye, RotateCcw } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

const LABEL: Record<Role, string> = {
  proprietario: "Proprietário",
  locatario: "Locatário",
  agente: "Agente",
};

const REAL_VALUE = "__real__";

export function ViewAsBar() {
  const { isAdmin, effectiveRole, realRole, override, setViewAs } = useViewAs();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!isAdmin) return null;

  const value = override ?? REAL_VALUE;

  function handleChange(v: string) {
    setViewAs(v === REAL_VALUE ? null : (v as Role));
    if (pathname !== "/dashboard") navigate({ to: "/dashboard" });
  }

  return (
    <div className="sticky top-0 z-50 w-full border-b bg-amber-50 dark:bg-amber-950/40">
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
          <Eye className="h-4 w-4" />
          <span className="font-medium">Modo admin</span>
        </div>

        <Select
          value={value}
          onValueChange={(v) => setViewAs(v === REAL_VALUE ? null : (v as Role))}
        >
          <SelectTrigger className="h-8 w-[220px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={REAL_VALUE}>
              Real ({LABEL[realRole]})
            </SelectItem>
            {ALL_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                Visualizar como {LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-amber-700 dark:text-amber-300">
          Exibindo: <strong>{LABEL[effectiveRole]}</strong>
        </span>

        {override && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewAs(null)}
            className="h-7 ml-auto text-amber-800 dark:text-amber-200"
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Voltar ao real
          </Button>
        )}
      </div>
    </div>
  );
}
