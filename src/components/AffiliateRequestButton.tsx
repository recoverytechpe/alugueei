import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Handshake } from "lucide-react";

type Props = {
  propertyId: string;
  agentId: string;
  ownerId: string;
};

/**
 * CTA for agents to request affiliation with a published property.
 * Only renders for users with the "agente" role who are not the owner.
 */
export function AffiliateRequestButton({ propertyId, agentId, ownerId }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ownerPct, setOwnerPct] = useState("30");
  const [tenantPct, setTenantPct] = useState("20");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["affiliation", propertyId, agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_affiliations")
        .select("id, status, expires_at")
        .eq("property_id", propertyId)
        .eq("agent_id", agentId)
        .in("status", ["pending", "approved"])
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (agentId === ownerId) return null;

  if (existing?.status === "approved") {
    return (
      <Button size="sm" variant="secondary" disabled className="gap-1.5">
        <Handshake className="size-4" /> Afiliado
      </Button>
    );
  }
  if (existing?.status === "pending") {
    return (
      <Button size="sm" variant="outline" disabled className="gap-1.5">
        <Handshake className="size-4" /> Solicitação pendente
      </Button>
    );
  }

  async function submit() {
    setSaving(true);
    const { error } = await supabase.from("property_affiliations").insert({
      property_id: propertyId,
      agent_id: agentId,
      owner_commission_pct: Number(ownerPct) || 0,
      tenant_commission_pct: Number(tenantPct) || 0,
      message: message.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Solicitação enviada ao proprietário");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["affiliation", propertyId, agentId] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={isLoading}>
          <Handshake className="size-4" /> Solicitar afiliação
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar afiliação ao imóvel</DialogTitle>
          <DialogDescription>
            Proponha sua comissão. O proprietário recebe a solicitação e decide se aprova.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="owner-pct">% paga pelo dono</Label>
              <Input
                id="owner-pct" type="number" min={0} max={100} step="0.5"
                value={ownerPct} onChange={(e) => setOwnerPct(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tenant-pct">% paga pelo inquilino</Label>
              <Input
                id="tenant-pct" type="number" min={0} max={100} step="0.5"
                value={tenantPct} onChange={(e) => setTenantPct(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aff-msg">Mensagem (opcional)</Label>
            <Textarea
              id="aff-msg" rows={3} maxLength={500}
              placeholder="Apresente-se e explique como pretende divulgar o imóvel."
              value={message} onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A afiliação tem validade de 90 dias após aprovação e expira automaticamente
            se o imóvel for alugado.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Enviando..." : "Enviar solicitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
