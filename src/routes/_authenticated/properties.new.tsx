import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ChevronLeft,
  Home as HomeIcon,
  MapPin,
  Ruler,
  Wallet,
  Camera,
  Check,
  X,
  ImagePlus,
  Building2,
  Loader2,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/properties/new")({
  head: () => ({ meta: [{ title: "Cadastrar imóvel | Plataforma de Aluguel" }] }),
  component: NewProperty,
});

const schema = z.object({
  title: z.string().trim().min(3, "Título muito curto").max(120),
  description: z.string().trim().max(2000).optional().default(""),
  property_type: z.enum(["casa", "apartamento"]),
  cep: z.string().trim().min(8, "CEP inválido").max(10),
  street: z.string().trim().min(2, "Informe a rua").max(160),
  number: z.string().trim().min(1, "Informe o número").max(20),
  complement: z.string().trim().max(80).optional().default(""),
  neighborhood: z.string().trim().max(80).optional().default(""),
  city: z.string().trim().min(2, "Informe a cidade").max(80),
  state: z.string().trim().min(2, "UF").max(2),
  bedrooms: z.coerce.number().int().min(0).max(20),
  bathrooms: z.coerce.number().int().min(0).max(20),
  parking_spots: z.coerce.number().int().min(0).max(20),
  area_m2: z.coerce.number().min(0).max(100000),
  rent_value: z.coerce.number().min(1, "Informe o aluguel").max(10_000_000),
  condo_value: z.coerce.number().min(0).max(10_000_000),
  iptu_value: z.coerce.number().min(0).max(10_000_000),
});

type FormState = {
  title: string;
  description: string;
  property_type: "casa" | "apartamento";
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  bedrooms: string;
  bathrooms: string;
  parking_spots: string;
  area_m2: string;
  rent_value: string;
  condo_value: string;
  iptu_value: string;
};

const initial: FormState = {
  title: "",
  description: "",
  property_type: "apartamento",
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  bedrooms: "0",
  bathrooms: "0",
  parking_spots: "0",
  area_m2: "0",
  rent_value: "",
  condo_value: "0",
  iptu_value: "0",
};

const STEPS = [
  { key: "info", label: "Tipo", icon: HomeIcon },
  { key: "addr", label: "Endereço", icon: MapPin },
  { key: "feat", label: "Detalhes", icon: Ruler },
  { key: "photos", label: "Fotos", icon: Camera },
] as const;

function NewProperty() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [isAgent, setIsAgent] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initial);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  async function lookupCep(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) throw new Error("CEP não encontrado");
      const j = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (j.erro) {
        toast.error("CEP não encontrado");
        return;
      }
      setForm((s) => ({
        ...s,
        street: j.logradouro || s.street,
        neighborhood: j.bairro || s.neighborhood,
        city: j.localidade || s.city,
        state: (j.uf || s.state).toUpperCase().slice(0, 2),
      }));
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível buscar o CEP");
    } finally {
      setCepLoading(false);
    }
  }

  function reorderPhoto(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setPhotos((p) => {
      const arr = [...p];
      const [m] = arr.splice(from, 1);
      arr.splice(to, 0, m);
      return arr;
    });
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      const rs = roles?.map((r) => r.role) ?? [];
      setAuthorized(rs.includes("proprietario") || rs.includes("agente"));
      setIsAgent(rs.includes("agente"));
    })();
  }, []);


  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const canNext = useMemo(() => {
    if (step === 0) return form.title.trim().length >= 3;
    if (step === 1)
      return (
        form.cep.trim().length >= 8 &&
        form.street.trim().length >= 2 &&
        form.number.trim().length >= 1 &&
        form.city.trim().length >= 2 &&
        form.state.trim().length === 2
      );
    if (step === 2) return Number(form.rent_value) > 0;
    return true;
  }, [step, form]);

  if (authorized === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border bg-card p-8 text-center shadow-sm">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Apenas usuários com perfil de Proprietário ou Agente podem cadastrar imóveis.
          </p>

          <Button asChild className="mt-5">
            <Link to="/dashboard">Voltar ao painel</Link>
          </Button>
        </div>
      </div>
    );
  }

  async function submit() {
    const parsed = schema.safeParse(form);
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
        .insert({
          ...parsed.data,
          owner_id: u.user.id,
          listed_by_agent_id: isAgent ? u.user.id : null,
        })
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

  function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPhotos((p) => [...p, ...Array.from(files)].slice(0, 10));
  }
  function removePhoto(idx: number) {
    setPhotos((p) => p.filter((_, i) => i !== idx));
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            to="/properties"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Imóveis
          </Link>
          <h1 className="text-base font-semibold">Cadastrar imóvel</h1>
          <div className="w-16" />
        </div>
        <Stepper step={step} />
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 pb-32">
        {step === 0 && (
          <Section icon={HomeIcon} title="Sobre o imóvel" desc="Comece pelo essencial.">
            <div className="grid gap-2 sm:grid-cols-2">
              <TypeCard
                active={form.property_type === "apartamento"}
                onClick={() => update("property_type", "apartamento")}
                icon={Building2}
                label="Apartamento"
              />
              <TypeCard
                active={form.property_type === "casa"}
                onClick={() => update("property_type", "casa")}
                icon={HomeIcon}
                label="Casa"
              />
            </div>
            <Field
              label="Título do anúncio"
              value={form.title}
              onChange={(v) => update("title", v)}
              placeholder="Ex: Apartamento 2 quartos com varanda"
            />
            <div className="space-y-1.5">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                rows={5}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Conte sobre o imóvel, vizinhança, diferenciais..."
                className="resize-none rounded-2xl"
              />
            </div>
          </Section>
        )}

        {step === 1 && (
          <Section icon={MapPin} title="Endereço" desc="Onde fica o imóvel.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="f-cep">CEP</Label>
                <div className="relative">
                  <Input
                    id="f-cep"
                    value={form.cep}
                    onChange={(e) => update("cep", e.target.value)}
                    onBlur={(e) => lookupCep(e.target.value)}
                    placeholder="00000-000"
                    inputMode="numeric"
                    className="rounded-xl pr-9"
                  />
                  {cepLoading && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Preenchemos o endereço automaticamente.</p>
              </div>
              <Field label="UF" value={form.state} onChange={(v) => update("state", v.toUpperCase().slice(0, 2))} placeholder="SP" />
              <div className="sm:col-span-2">
                <Field label="Rua / Avenida" value={form.street} onChange={(v) => update("street", v)} />
              </div>
              <Field label="Número" value={form.number} onChange={(v) => update("number", v)} />
              <Field label="Complemento" value={form.complement} onChange={(v) => update("complement", v)} />
              <Field label="Bairro" value={form.neighborhood} onChange={(v) => update("neighborhood", v)} />
              <Field label="Cidade" value={form.city} onChange={(v) => update("city", v)} />
            </div>
          </Section>
        )}

        {step === 2 && (
          <>
            <Section icon={Ruler} title="Características" desc="Quartos, banheiros e área.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Counter label="Quartos" value={form.bedrooms} onChange={(v) => update("bedrooms", v)} />
                <Counter label="Banheiros" value={form.bathrooms} onChange={(v) => update("bathrooms", v)} />
                <Counter label="Vagas" value={form.parking_spots} onChange={(v) => update("parking_spots", v)} />
                <Field
                  label="Área (m²)"
                  type="number"
                  value={form.area_m2}
                  onChange={(v) => update("area_m2", v)}
                />
              </div>
            </Section>
            <Section icon={Wallet} title="Valores" desc="Em reais (R$).">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Aluguel" type="number" value={form.rent_value} onChange={(v) => update("rent_value", v)} />
                <Field label="Condomínio" type="number" value={form.condo_value} onChange={(v) => update("condo_value", v)} />
                <Field label="IPTU" type="number" value={form.iptu_value} onChange={(v) => update("iptu_value", v)} />
              </div>
            </Section>
          </>
        )}

        {step === 3 && (
          <Section icon={Camera} title="Fotos" desc="Até 10 imagens. A primeira será a capa.">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center transition hover:border-primary/50 hover:bg-muted/50">
              <ImagePlus className="mb-2 h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">Toque para adicionar fotos</span>
              <span className="mt-1 text-xs text-muted-foreground">PNG, JPG até 10MB cada</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            {previews.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground">Arraste para reordenar. A primeira foto é a capa.</p>
                <div className="grid grid-cols-3 gap-2">
                  {previews.map((src, i) => (
                    <div
                      key={src}
                      draggable
                      onDragStart={() => setDragIdx(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIdx !== null) reorderPhoto(dragIdx, i);
                        setDragIdx(null);
                      }}
                      onDragEnd={() => setDragIdx(null)}
                      className={cn(
                        "group relative aspect-square cursor-grab overflow-hidden rounded-xl border bg-muted active:cursor-grabbing",
                        i === 0 && "ring-2 ring-primary",
                        dragIdx === i && "opacity-50",
                      )}
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
                      {i === 0 && (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                          Capa
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 transition group-hover:opacity-100">
                        <GripVertical className="h-3.5 w-3.5 text-white" />
                        <span className="text-[10px] font-medium text-white">{i + 1}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute right-1.5 top-1.5 rounded-full bg-background/90 p-1 text-foreground opacity-0 transition group-hover:opacity-100"
                        aria-label="Remover foto"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="rounded-2xl border bg-card p-4">
              <h3 className="text-sm font-semibold">Resumo</h3>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <SummaryRow label="Título" value={form.title || "—"} />
                <SummaryRow label="Tipo" value={form.property_type === "casa" ? "Casa" : "Apartamento"} />
                <SummaryRow
                  label="Endereço"
                  value={[form.street, form.number].filter(Boolean).join(", ") || "—"}
                />
                <SummaryRow label="Cidade" value={[form.city, form.state].filter(Boolean).join("/") || "—"} />
                <SummaryRow
                  label="Quartos / Banh. / Vagas"
                  value={`${form.bedrooms} / ${form.bathrooms} / ${form.parking_spots}`}
                />
                <SummaryRow label="Aluguel" value={form.rent_value ? `R$ ${form.rent_value}` : "—"} />
              </dl>
            </div>
          </Section>
        )}
      </main>

      <footer
        className="fixed inset-x-0 z-10 border-t bg-background/95 backdrop-blur"
        style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
            className="h-11"
          >
            Voltar
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={!canNext}
              className="min-w-32 h-11 flex-1 sm:flex-none"
            >
              Continuar
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={submitting} className="min-w-32 h-11 flex-1 sm:flex-none">
              {submitting ? "Publicando..." : "Publicar imóvel"}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 pb-4">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = i < step;
        const active = i === step;
        return (
          <div key={s.key} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary bg-primary/10 text-primary",
                !done && !active && "border-border bg-background text-muted-foreground",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </div>
            <span
              className={cn(
                "hidden text-xs sm:inline",
                active ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={cn("h-px flex-1", done ? "bg-primary" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof HomeIcon;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-3xl border bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function TypeCard({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof HomeIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-4 text-left transition",
        active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted/50",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <span className="font-medium">{label}</span>
      {active && <Check className="ml-auto h-4 w-4 text-primary" />}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const id = `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const isNumeric = type === "number";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        inputMode={isNumeric ? "decimal" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl h-11"
      />
    </div>
  );
}

function Counter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const n = Number(value) || 0;
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-background px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(String(Math.max(0, n - 1)))}
          className="flex h-8 w-8 items-center justify-center rounded-full border text-lg hover:bg-muted"
          aria-label={`Diminuir ${label}`}
        >
          −
        </button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums">{n}</span>
        <button
          type="button"
          onClick={() => onChange(String(Math.min(20, n + 1)))}
          className="flex h-8 w-8 items-center justify-center rounded-full border text-lg hover:bg-muted"
          aria-label={`Aumentar ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
