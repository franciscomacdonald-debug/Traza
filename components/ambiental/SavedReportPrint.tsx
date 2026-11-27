"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type SnapshotFinding = {
  title?: string;
  description?: string;
  classification?: string;
  status?: string;
  corrective_action_requested?: string | null;
  closure_notes?: string | null;
};
type SnapshotPhoto = {
  description?: string | null;
  original_file_path?: string;
  captured_at?: string;
};
type Snapshot = {
  project?: { name?: string };
  inspection?: {
    title?: string | null;
    inspection_date?: string;
    status?: string;
    general_notes?: string | null;
    weather_notes?: string | null;
  };
  findings?: SnapshotFinding[];
  photos?: SnapshotPhoto[];
};
type StoredReport = {
  id: string;
  title: string;
  status: string;
  report_number: string | null;
  version_number: number;
  executive_summary: string | null;
  conclusions: string | null;
  report_snapshot: Snapshot | null;
};

const esc = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character] ?? character));
const plain = (value: unknown, fallback = "Sin antecedentes registrados.") => esc(value || fallback);
const labelDate = (value?: string) => {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleDateString("es-CL");
};

export default function SavedReportPrint({ projectId, reportId }: { projectId: string; reportId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function prepare() {
    if (!supabase || busy) return;
    // Open synchronously on a user click to avoid the browser's popup blocker.
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("El navegador bloqueó la ventana. Permite ventanas emergentes para TRAZA.");
      return;
    }
    popup.document.write("<!doctype html><html lang='es'><head><meta charset='utf-8'><title>Preparando informe...</title></head><body><p>Preparando la copia guardada del informe…</p></body></html>");
    popup.document.close();
    setBusy(true);
    setError("");
    try {
      const { data, error: queryError } = await supabase.from("environmental_reports")
        .select("id,title,status,report_number,version_number,executive_summary,conclusions,report_snapshot")
        .eq("project_id", projectId).eq("id", reportId).eq("report_type", "inspection").single();
      if (queryError || !data) throw new Error(queryError?.message || "No se encontró el informe guardado.");
      const report = data as StoredReport;
      const snapshot = report.report_snapshot;
      if (!snapshot?.inspection) throw new Error("El informe no tiene una copia de inspección válida.");
      const findings = Array.isArray(snapshot.findings) ? snapshot.findings : [];
      const photos = Array.isArray(snapshot.photos) ? snapshot.photos : [];

      const photoMarkup = await Promise.all(photos.map(async (photo, index) => {
        if (!photo.original_file_path) return `<p>Fotografía ${index + 1}: sin ruta guardada.</p>`;
        const { data: signed, error: signError } = await supabase!.storage.from("traza-documents")
          .createSignedUrl(photo.original_file_path, 600);
        if (signError || !signed?.signedUrl) {
          return `<p>Fotografía ${index + 1}: no se pudo acceder al archivo privado.</p>`;
        }
        return `<figure><img src="${esc(signed.signedUrl)}" alt="Fotografía ${index + 1}"><figcaption>Fotografía ${index + 1}. ${plain(photo.description, "Sin descripción")}. ${labelDate(photo.captured_at)}</figcaption></figure>`;
      }));

      const findingMarkup = findings.map((finding, index) => `<section class="finding"><h3>${index + 1}. ${plain(finding.title, "Hallazgo")}</h3>
        <p><b>Clasificación:</b> ${plain(finding.classification, "—")} &nbsp; <b>Estado:</b> ${plain(finding.status, "—")}</p>
        <p>${plain(finding.description)}</p>
        ${finding.corrective_action_requested ? `<p><b>Medida solicitada:</b> ${esc(finding.corrective_action_requested)}</p>` : ""}
        ${finding.closure_notes ? `<p><b>Observación de cierre:</b> ${esc(finding.closure_notes)}</p>` : ""}</section>`).join("");

      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(report.title)} - v${report.version_number}</title><style>
        @page{size:A4;margin:18mm 16mm}*{box-sizing:border-box}body{font:12px/1.6 Arial,Helvetica,sans-serif;color:#213547;margin:0}header{border-bottom:3px solid #17618b;padding-bottom:12px;margin-bottom:20px}h1{font-size:23px;line-height:1.2;margin:12px 0}h2{font-size:15px;color:#17486c;margin:23px 0 8px;border-bottom:1px solid #d8e4ec;padding-bottom:5px}h3{font-size:12px;margin:10px 0 4px}p{white-space:pre-wrap;overflow-wrap:anywhere}small,.muted{color:#596c7c}.tag{font-size:10px;font-weight:bold;color:#8c3e09;letter-spacing:.04em}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #d8e4ec;text-align:left;padding:7px;vertical-align:top}th{width:28%;background:#f2f6fa}.finding{border:1px solid #e2e9ef;padding:10px;margin:8px 0;break-inside:avoid}figure{margin:12px 0 20px;break-inside:avoid}figure img{max-width:100%;max-height:145mm;object-fit:contain}figcaption{font-size:10px;color:#596c7c;margin-top:5px}.toolbar{position:sticky;top:0;background:#f2f6fa;border-bottom:1px solid #d8e4ec;padding:10px;margin:-0px 0 15px;display:flex;align-items:center;gap:12px}.toolbar button{background:#17618b;color:#fff;border:0;border-radius:6px;padding:10px 14px;cursor:pointer}.footer{border-top:1px solid #d8e4ec;margin-top:24px;padding-top:8px;color:#596c7c;font-size:10px}@media print{.toolbar{display:none}header{margin-top:0}a{color:inherit}}
      </style></head><body>
        <div class="toolbar"><button onclick="window.print()">Imprimir / Guardar como PDF</button><span>Esta copia se genera desde el informe guardado. No reemplaza el PDF de emisión oficial.</span></div>
        <header><strong>TRAZA · Gestión ambiental</strong><div class="tag">COPIA PARA REVISIÓN / IMPRESIÓN · NO CONSTITUYE EMISIÓN OFICIAL</div>
        <h1>${esc(report.title)}</h1><p class="muted">${report.report_number ? `Informe N.º ${esc(report.report_number)} · ` : ""}Versión ${report.version_number} · Estado registrado: ${esc(report.status)}</p></header>
        <table><tbody><tr><th>Proyecto</th><td>${plain(snapshot.project?.name, "No identificado")}</td></tr>
        <tr><th>Inspección</th><td>${plain(snapshot.inspection.title, "Sin título")}</td></tr>
        <tr><th>Fecha de inspección</th><td>${labelDate(snapshot.inspection.inspection_date)}</td></tr>
        <tr><th>Estado inspección al guardar</th><td>${plain(snapshot.inspection.status, "—")}</td></tr></tbody></table>
        <h2>1. Antecedentes y observaciones</h2><p>${plain(snapshot.inspection.general_notes)}</p>
        <h2>2. Condiciones meteorológicas</h2><p>${plain(snapshot.inspection.weather_notes)}</p>
        <h2>3. Resumen ejecutivo</h2><p>${plain(report.executive_summary, "Pendiente de completar")}</p>
        <h2>4. Hallazgos asociados (${findings.length})</h2>${findingMarkup || "<p>No se registran hallazgos asociados.</p>"}
        <h2>5. Registro fotográfico (${photos.length})</h2>${photoMarkup.join("") || "<p>No se registran fotografías.</p>"}
        <h2>6. Conclusiones</h2><p>${plain(report.conclusions, "Pendiente de completar")}</p>
        <div class="footer">TRAZA · Copia generada desde los antecedentes guardados. La emisión formal se realiza por separado y requiere aprobación.</div>
      </body></html>`;
      if (popup.closed) throw new Error("Se cerró la ventana de impresión.");
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible preparar el informe para impresión.");
      if (!popup.closed) popup.close();
    } finally {
      setBusy(false);
    }
  }

  return <div style={{ display: "grid", gap: 5 }}>
    <button type="button" disabled={busy} onClick={() => void prepare()} style={{ cursor: "pointer", padding: "9px 12px", borderRadius: 8, background: "#fff", border: "1px solid #b5c9d9", color: "#17486c", fontWeight: 650, justifySelf: "start" }}>
      {busy ? "Preparando documento…" : "Preparar PDF desde informe guardado"}
    </button>
    {error && <small style={{ color: "#a62b2b" }} role="alert">{error}</small>}
    <small style={{ color: "#60768b" }}>Se abre una copia imprimible; en el navegador selecciona «Guardar como PDF». No registra emisión oficial.</small>
  </div>;
}
