import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Reason =
  | "spam"
  | "fraud"
  | "inappropriate"
  | "duplicate"
  | "wrong_info"
  | "harassment"
  | "other";

const REASONS: { value: Reason; label: string }[] = [
  { value: "fraud", label: "Suspeita de fraude / golpe" },
  { value: "inappropriate", label: "Conteúdo inadequado / ofensivo" },
  { value: "spam", label: "Spam" },
  { value: "duplicate", label: "Anúncio duplicado" },
  { value: "wrong_info", label: "Informações incorretas" },
  { value: "harassment", label: "Assédio / abuso" },
  { value: "other", label: "Outro motivo" },
];

const schema = z.object({
  reason: z.enum([
    "spam",
    "fraud",
    "inappropriate",
    "duplicate",
    "wrong_info",
    "harassment",
    "other",
  ]),
  details: z.string().trim().max(1000, "Máx. 1000 caracteres").optional(),
});

type Props = {
  targetType: "property" | "user";
  targetId: string;
  trigger?: React.ReactNode;
  label?: string;
};

export function ReportDialog({ targetType, targetId, trigger, label = "Reportar" }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | "">("");
  const [details, setDetails] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse({ reason, details: details || undefined });
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Faça login para denunciar.");
      if (targetType === "user" && targetId === u.user.id) {
        throw new Error("Você não pode denunciar a si mesmo.");
      }
      const { error } = await supabase.from("reports").insert({
        reporter_id: u.user.id,
        target_type: targetType,
        target_id: targetId,
        reason: parsed.reason,
        details: parsed.details ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Denúncia enviada. Nossa equipe irá analisar.");
      setOpen(false);
      setReason("");
      setDetails("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <Flag className="size-4 mr-1.5" />
            {label}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Reportar {targetType === "property" ? "imóvel" : "usuário"}
          </DialogTitle>
          <DialogDescription>
            Use este formulário para reportar conteúdo que viola nossas regras.
            Denúncias falsas podem resultar em suspensão.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo *</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
              <SelectTrigger id="reason">
                <SelectValue placeholder="Selecione um motivo" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="details">Detalhes (opcional)</Label>
            <Textarea
              id="details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Descreva o que aconteceu..."
            />
            <p className="text-xs text-muted-foreground text-right">
              {details.length}/1000
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={!reason || submit.isPending}
          >
            {submit.isPending ? "Enviando..." : "Enviar denúncia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
