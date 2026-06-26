import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Lock, MapPin, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { createUnlockCheckout } from "@/lib/unlock-payments.functions";

export interface UnlockGateProps {
  propertyId: string;
  userId: string | null;
  isOwner: boolean;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  full: string;
  cep: string | null;
}

const UNLOCK_PRICE_CENTS = 2990;

export function useUnlockStatus(propertyId: string, userId: string | null) {
  return useQuery({
    queryKey: ["unlock", propertyId, userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("property_unlocks")
        .select("*")
        .eq("user_id", userId)
        .eq("property_id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function isUnlocked(row: { status: string; expires_at: string | null } | null | undefined) {
  if (!row) return false;
  if (row.status !== "paid") return false;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return false;
  return true;
}

function formatCountdown(expiresAt: string | null): { label: string; urgent: boolean } | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const totalHours = Math.floor(ms / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const label = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return { label, urgent: totalHours < 72 };
}

export function UnlockGate(props: UnlockGateProps) {
  const { propertyId, userId, isOwner, neighborhood, city, state, full, cep } = props;
  const { data: row } = useUnlockStatus(propertyId, userId);
  const unlocked = isOwner || isUnlocked(row);

  if (unlocked) {
    const countdown = !isOwner ? formatCountdown(row?.expires_at ?? null) : null;
    const urgent = countdown?.urgent ?? false;
    return (
      <p className="text-sm text-muted-foreground flex items-start gap-2 flex-wrap">
        <MapPin className="size-4 mt-0.5 shrink-0" />
        <span>
          {full}
          {cep ? ` · CEP ${cep}` : ""}
          {!isOwner && (
            <span className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border ${urgent ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
              <ShieldCheck className="size-3" />
              Desbloqueado{countdown ? ` · expira em ${countdown.label}` : ""}
            </span>
          )}
        </span>
      </p>
    );
  }

  const approx = [neighborhood, city, state].filter(Boolean).join(", ");
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-3 space-y-2">
      <p className="text-sm flex items-start gap-2">
        <MapPin className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
        <span>
          <span className="font-medium">{approx || "Localização aproximada"}</span>
          <span className="block text-xs text-muted-foreground">
            Endereço exato, chat, proposta e reserva ficam disponíveis após o desbloqueio.
          </span>
        </span>
      </p>
      <UnlockDialog propertyId={propertyId} userId={userId} existing={row ?? null} />
    </div>
  );
}

function UnlockDialog({
  propertyId,
  userId,
  existing,
}: {
  propertyId: string;
  userId: string | null;
  existing: { id: string; status: string; terms_accepted_at: string | null; lgpd_accepted_at?: string | null } | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState(Boolean(existing?.terms_accepted_at));
  const [lgpd, setLgpd] = useState(Boolean(existing?.lgpd_accepted_at));
  const [loading, setLoading] = useState(false);
  const checkout = useServerFn(createUnlockCheckout);

  async function handleUnlock() {
    if (!userId) { toast.error("Faça login"); return; }
    if (!terms) { toast.error("Aceite os termos para continuar"); return; }
    if (!lgpd) { toast.error("Aceite a política de privacidade (LGPD)"); return; }
    setLoading(true);
    try {
      const result = await checkout({
        data: { propertyId, termsAccepted: terms, lgpdAccepted: lgpd },
      });
      if (!result.ok) {
        if (result.reason === "not_configured") {
          toast.error("Pagamentos Mercado Pago ainda não foram configurados.");
        } else {
          toast.error(result.message);
        }
        return;
      }
      qc.invalidateQueries({ queryKey: ["unlock", propertyId, userId] });
      setOpen(false);
      toast.success("Redirecionando para o Mercado Pago…");
      window.location.href = result.initPoint;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao iniciar pagamento";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Lock className="size-4" />
          Desbloquear imóvel · R$ {(UNLOCK_PRICE_CENTS / 100).toFixed(2).replace(".", ",")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desbloquear este imóvel</DialogTitle>
          <DialogDescription>
            Taxa única de seriedade. Válido por 30 dias e libera endereço exato, chat com o anunciante,
            envio de proposta e reserva.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            <p><strong>Termos de uso resumidos:</strong></p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Toda negociação deve ocorrer dentro da plataforma.</li>
              <li>Fechar contrato fora da plataforma sujeita à multa de 1 aluguel.</li>
              <li>Taxa de R$ 29,90 não é reembolsável após o desbloqueio.</li>
              <li>Compartilhar o endereço fora do app é proibido.</li>
            </ul>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={terms} onCheckedChange={(v) => setTerms(v === true)} />
            <span className="text-sm">Li e aceito os termos de uso e a política anti-bypass.</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={lgpd} onCheckedChange={(v) => setLgpd(v === true)} />
            <span className="text-sm">
              Autorizo o tratamento dos meus dados pessoais para esta negociação,
              conforme a <strong>LGPD</strong> (Lei 13.709/2018).
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleUnlock} disabled={loading || !terms || !lgpd}>
            {loading ? "Processando…" : "Confirmar desbloqueio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
