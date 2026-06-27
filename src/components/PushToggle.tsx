import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { enablePush, disablePush, getPushStatus } from "@/lib/push";

export function PushToggle() {
  const [status, setStatus] = useState<"granted" | "denied" | "default" | "unsupported" | "loading">(
    "loading",
  );

  useEffect(() => {
    getPushStatus().then(setStatus);
  }, []);

  if (status === "unsupported") return null;

  async function turnOn() {
    setStatus("loading");
    const r = await enablePush();
    if (r.ok) {
      toast.success("Notificações ativadas");
      setStatus("granted");
    } else {
      toast.error(r.reason ?? "Falha ao ativar");
      setStatus(await getPushStatus());
    }
  }

  async function turnOff() {
    setStatus("loading");
    await disablePush();
    toast.message("Notificações desativadas neste dispositivo");
    setStatus(await getPushStatus());
  }

  if (status === "granted") {
    return (
      <Button variant="outline" size="sm" onClick={turnOff} aria-label="Desativar notificações" title="Desativar notificações">
        <BellOff className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Desativar notificações</span>
      </Button>
    );
  }
  const label = status === "denied" ? "Notificações bloqueadas" : "Ativar notificações";
  return (
    <Button variant="outline" size="sm" onClick={turnOn} disabled={status === "loading"} aria-label={label} title={label}>
      <Bell className="h-4 w-4 sm:mr-2" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
