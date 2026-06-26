import { useState } from "react";
import { jsPDF } from "jspdf";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Dataset = "contracts" | "payments" | "visits";

const datasets: Record<Dataset, { label: string; table: string; columns: string[] }> = {
  contracts: {
    label: "Contratos",
    table: "rental_contracts",
    columns: ["id", "status", "payment_status", "rent_value", "deposit_value", "start_date", "term_months", "created_at"],
  },
  payments: {
    label: "Pagamentos",
    table: "payments",
    columns: ["id", "contract_id", "kind", "amount", "status", "provider", "provider_payment_id", "created_at"],
  },
  visits: {
    label: "Visitas",
    table: "visits",
    columns: ["id", "property_id", "scheduled_at", "status", "created_at"],
  },
};

function toCsv(rows: Array<Record<string, unknown>>, cols: string[]): string {
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

function download(filename: string, content: string | Blob, mime = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportReports() {
  const [dataset, setDataset] = useState<Dataset>("contracts");
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);

  async function fetchRows() {
    const d = datasets[dataset];
    const { data, error } = await supabase
      .from(d.table as never)
      .select(d.columns.join(","))
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return (data ?? []) as unknown as Array<Record<string, unknown>>;
  }

  async function exportCsv() {
    setBusy("csv");
    try {
      const rows = await fetchRows();
      if (rows.length === 0) {
        toast.info("Sem dados para exportar.");
        return;
      }
      const csv = toCsv(rows, datasets[dataset].columns);
      download(`${dataset}-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
      toast.success(`${rows.length} registro(s) exportado(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar");
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf() {
    setBusy("pdf");
    try {
      const rows = await fetchRows();
      if (rows.length === 0) {
        toast.info("Sem dados para exportar.");
        return;
      }
      const d = datasets[dataset];
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
      const margin = 32;
      const pageH = doc.internal.pageSize.getHeight();
      const pageW = doc.internal.pageSize.getWidth();
      let y = margin;
      doc.setFont("helvetica", "bold").setFontSize(14);
      doc.text(`Relatório · ${d.label}`, margin, y);
      y += 16;
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(120);
      doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} · ${rows.length} registros`, margin, y);
      y += 18;

      const colCount = d.columns.length;
      const colWidth = (pageW - margin * 2) / colCount;
      doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(8);
      d.columns.forEach((c, i) => doc.text(c, margin + i * colWidth, y));
      y += 12;
      doc.setFont("helvetica", "normal");
      for (const row of rows) {
        if (y > pageH - margin) { doc.addPage(); y = margin; }
        d.columns.forEach((c, i) => {
          const raw = row[c];
          const txt = raw === null || raw === undefined ? "" : String(raw);
          doc.text(txt.slice(0, Math.floor(colWidth / 4)), margin + i * colWidth, y);
        });
        y += 11;
      }
      doc.save(`${dataset}-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success(`PDF gerado com ${rows.length} registro(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="size-4" /> Exportar relatórios
        </CardTitle>
        <CardDescription>
          Baixe seus contratos, pagamentos ou visitas em CSV (planilha) ou PDF.
          Apenas os registros que você pode visualizar serão exportados.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <Select value={dataset} onValueChange={(v) => setDataset(v as Dataset)}>
          <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(datasets) as Dataset[]).map((k) => (
              <SelectItem key={k} value={k}>{datasets[k].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={busy !== null}>
            {busy === "csv"
              ? <Loader2 className="size-4 mr-2 animate-spin" />
              : <FileSpreadsheet className="size-4 mr-2" />}
            CSV
          </Button>
          <Button variant="outline" onClick={exportPdf} disabled={busy !== null}>
            {busy === "pdf"
              ? <Loader2 className="size-4 mr-2 animate-spin" />
              : <FileText className="size-4 mr-2" />}
            PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
