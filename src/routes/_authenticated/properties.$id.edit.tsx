import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/properties/$id/edit")({
  head: () => ({ meta: [{ title: "Editar imóvel | Plataforma de Aluguel" }] }),
  component: EditProperty,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Imóvel não encontrado.</div>,
});

const schema = z.object({
  title: z.string().trim().min(3, "Título muito curto").max(120),
  description: z.string().trim().max(2000).optional().default(""),
  property_type: z.enum(["casa", "apartamento"]),
  cep: z.string().trim().min(8, "CEP inválido").max(10),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(80).optional().default(""),
  neighborhood: z.string().trim().max(80).optional().default(""),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(2),
  bedrooms: z.coerce.number().int().min(0).max(20),
  bathrooms: z.coerce.number().int().min(0).max(20),
  parking_spots: z.coerce.number().int().min(0).max(20),
  area_m2: z.coerce.number().min(0).max(100000),
  rent_value: z.coerce.number().min(1, "Informe o aluguel").max(10_000_000),
  condo_value: z.coerce.number().min(0).max(10_000_000),
  iptu_value: z.coerce.number().min(0).max(10_000_000),
  status: z.enum(["available", "rented", "inactive"]),
});

type Form = z.input<typeof schema>;

function EditProperty() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: row, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !row) {
        toast.error("Imóvel não encontrado");
        navigate({ to: "/properties" });
        return;
      }
      const ok = u.user?.id === row.owner_id;
      setAuthorized(ok);
      if (!ok) {
        setLoading(false);
        return;
      }
      setForm({
        title: row.title ?? "",
        description: row.description ?? "",
        property_type: (row.property_type as "casa" | "apartamento") ?? "apartamento",
        cep: row.cep ?? "",
        street: row.street ?? "",
        number: row.number ?? "",
        complement: row.complement ?? "",
        neighborhood: row.neighborhood ?? "",
        city: row.city ?? "",
        state: row.state ?? "",
        bedrooms: row.bedrooms ?? 0,
        bathrooms: row.bathrooms ?? 0,
        parking_spots: row.parking_spots ?? 0,
        area_m2: Number(row.area_m2 ?? 0),
        rent_value: Number(row.rent_value ?? 0),
        condo_value: Number(row.condo_value ?? 0),
        iptu_value: Number(row.iptu_value ?? 0),
        status: (row.status as "available" | "rented" | "inactive") ?? "available",
      });
      setLoading(false);
    })();
  }, [id, navigate]);

  function update<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((s) => (s ? { ...s, [k]: v } : s));
  }

  async function save() {
    if (!form) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("properties")
      .update(parsed.data)
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Imóvel atualizado!");
    navigate({ to: "/properties/$id", params: { id } });
  }

  if (loading) {
    return (
      <div className="min-h-screen p-6 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full max-w-3xl" />
      </div>
    );
  }

  if (!authorized || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Apenas o cadastrante deste imóvel pode editá-lo.
          </p>
          <Button asChild className="mt-5">
            <Link to="/properties/$id" params={{ id }}>Voltar ao imóvel</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
          <Link
            to="/properties/$id"
            params={{ id }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Imóvel
          </Link>
          <h1 className="text-base font-semibold">Editar imóvel</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8 pb-32 space-y-6">
        <Section title="Informações principais">
          <Field label="Título" value={form.title} onChange={(v) => update("title", v)} />
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              rows={4}
              value={form.description ?? ""}
              onChange={(e) => update("description", e.target.value)}
              className="resize-none rounded-xl"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.property_type}
                onValueChange={(v) => update("property_type", v as "casa" | "apartamento")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="apartamento">Apartamento</SelectItem>
                  <SelectItem value="casa">Casa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => update("status", v as Form["status"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponível</SelectItem>
                  <SelectItem value="inactive">Pausado</SelectItem>
                  <SelectItem value="rented">Alugado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        <Section title="Endereço">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CEP" value={form.cep} onChange={(v) => update("cep", v)} />
            <Field label="UF" value={form.state} onChange={(v) => update("state", v.toUpperCase().slice(0, 2))} />
            <div className="sm:col-span-2">
              <Field label="Rua / Avenida" value={form.street} onChange={(v) => update("street", v)} />
            </div>
            <Field label="Número" value={form.number} onChange={(v) => update("number", v)} />
            <Field label="Complemento" value={form.complement ?? ""} onChange={(v) => update("complement", v)} />
            <Field label="Bairro" value={form.neighborhood ?? ""} onChange={(v) => update("neighborhood", v)} />
            <Field label="Cidade" value={form.city} onChange={(v) => update("city", v)} />
          </div>
        </Section>

        <Section title="Características">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field type="number" label="Quartos" value={String(form.bedrooms)} onChange={(v) => update("bedrooms", Number(v))} />
            <Field type="number" label="Banheiros" value={String(form.bathrooms)} onChange={(v) => update("bathrooms", Number(v))} />
            <Field type="number" label="Vagas" value={String(form.parking_spots)} onChange={(v) => update("parking_spots", Number(v))} />
            <Field type="number" label="Área (m²)" value={String(form.area_m2)} onChange={(v) => update("area_m2", Number(v))} />
          </div>
        </Section>

        <Section title="Valores (R$)">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field type="number" label="Aluguel" value={String(form.rent_value)} onChange={(v) => update("rent_value", Number(v))} />
            <Field type="number" label="Condomínio" value={String(form.condo_value)} onChange={(v) => update("condo_value", Number(v))} />
            <Field type="number" label="IPTU" value={String(form.iptu_value)} onChange={(v) => update("iptu_value", Number(v))} />
          </div>
        </Section>
      </main>

      <div
        className="fixed inset-x-0 z-30 border-t bg-background/95 backdrop-blur px-4 py-3"
        style={{ bottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto max-w-3xl flex items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link to="/properties/$id" params={{ id }}>Cancelar</Link>
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-6 space-y-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label, value, onChange, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="rounded-xl" />
    </div>
  );
}
