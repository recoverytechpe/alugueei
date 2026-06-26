import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/properties/new")({
  head: () => ({ meta: [{ title: "Cadastrar imóvel | Plataforma de Aluguel" }] }),
  component: NewProperty,
});

const schema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional().default(""),
  property_type: z.enum(["casa", "apartamento"]),
  cep: z.string().trim().min(8).max(10),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(80).optional(),
  neighborhood: z.string().trim().max(80).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(2),
  bedrooms: z.coerce.number().int().min(0).max(20),
  bathrooms: z.coerce.number().int().min(0).max(20),
  parking_spots: z.coerce.number().int().min(0).max(20),
  area_m2: z.coerce.number().min(0).max(100000),
  rent_value: z.coerce.number().min(1).max(10_000_000),
  condo_value: z.coerce.number().min(0).max(10_000_000),
  iptu_value: z.coerce.number().min(0).max(10_000_000),
});

function NewProperty() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      setAuthorized(!!roles?.some((r) => r.role === "proprietario"));
    })();
  }, []);

  if (authorized === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Apenas usuários com perfil de Proprietário podem cadastrar imóveis.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link to="/dashboard">Voltar</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd.entries());
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada");

      const { data: inserted, error: insErr } = await supabase
        .from("properties")
        .insert({ ...parsed.data, owner_id: u.user.id })
        .select("id")
        .single();
      if (insErr || !inserted) throw insErr ?? new Error("Falha ao criar imóvel");

      if (photos.length > 0) {
        const uploads = photos.map(async (file, idx) => {
          const ext = file.name.split(".").pop() ?? "jpg";
          const path = `${u.user!.id}/${inserted.id}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("property-photos")
            .upload(path, file, { cacheControl: "3600", upsert: false });
          if (upErr) throw upErr;
          return { property_id: inserted.id, storage_path: path, position: idx };
        });
        const records = await Promise.all(uploads);
        const { error: phErr } = await supabase.from("property_photos").insert(records);
        if (phErr) throw phErr;
      }

      toast.success("Imóvel cadastrado!");
      navigate({ to: "/properties/$id", params: { id: inserted.id } });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/properties" className="text-sm text-muted-foreground hover:text-foreground">← Imóveis</Link>
          <h1 className="text-lg font-semibold">Cadastrar imóvel</h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Informações</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Título" name="title" required />
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select name="property_type" defaultValue="apartamento">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="apartamento">Apartamento</SelectItem>
                    <SelectItem value="casa">Casa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Descrição</Label>
                <Textarea id="description" name="description" rows={4} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Endereço</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="CEP" name="cep" required />
              <Field label="Rua" name="street" required />
              <Field label="Número" name="number" required />
              <Field label="Complemento" name="complement" />
              <Field label="Bairro" name="neighborhood" />
              <Field label="Cidade" name="city" required />
              <Field label="UF" name="state" required maxLength={2} placeholder="SP" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Características</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Quartos" name="bedrooms" type="number" defaultValue="0" />
              <Field label="Banheiros" name="bathrooms" type="number" defaultValue="0" />
              <Field label="Vagas" name="parking_spots" type="number" defaultValue="0" />
              <Field label="Área (m²)" name="area_m2" type="number" step="0.01" defaultValue="0" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Valores (R$)</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Field label="Aluguel" name="rent_value" type="number" step="0.01" required />
              <Field label="Condomínio" name="condo_value" type="number" step="0.01" defaultValue="0" />
              <Field label="IPTU" name="iptu_value" type="number" step="0.01" defaultValue="0" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fotos</CardTitle>
              <CardDescription>Selecione uma ou mais imagens</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
              />
              {photos.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">{photos.length} arquivo(s) selecionado(s)</p>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" asChild><Link to="/properties">Cancelar</Link></Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Salvando..." : "Cadastrar imóvel"}</Button>
          </div>
        </form>
      </main>
    </div>
  );
}

type FieldProps = {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  step?: string;
  maxLength?: number;
};

function Field({ label, name, type = "text", ...rest }: FieldProps) {
  const id = `f-${name}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type={type} {...rest} />
    </div>
  );
}
