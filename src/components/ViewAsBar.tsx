import { Button } from "@/components/ui/button";
import { useViewAs, ALL_ROLES, type Role } from "@/lib/view-as";
import { Eye, X } from "lucide-react";

const LABEL: Record<Role, string> = {
  proprietario: "Proprietário",
  locatario: "Locatário",
  agente: "Agente",
};

export function ViewAsBar() {
  const { isAdmin, effectiveRole, override, setViewAs } = useViewAs();
  if (!isAdmin) return null;

  return (
    <div className="sticky top-0 z-50 w-full border-b bg-amber-50 dark:bg-amber-950/40">
      <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-2 text-sm">
        <Eye className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        <span className="text-amber-800 dark:text-amber-200 font-medium">
          Modo admin — visualizar como:
        </span>
        {ALL_ROLES.map((r) => (
          <Button
            key={r}
            size="sm"
            variant={effectiveRole === r ? "default" : "outline"}
            onClick={() => setViewAs(r)}
            className="h-7"
          >
            {LABEL[r]}
          </Button>
        ))}
        {override && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewAs(null)}
            className="h-7 text-amber-800 dark:text-amber-200"
          >
            <X className="h-3 w-3 mr-1" /> Voltar ao real
          </Button>
        )}
      </div>
    </div>
  );
}
