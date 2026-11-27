import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from "pdf-lib";

export type ReportSnapshot = {
  project?: { name?: string };
  inspection?: { title?: string | null; inspection_date?: string; status?: string; general_notes?: string | null; weather_notes?: string | null };
  findings?: Array<{ title?: string; description?: string; classification?: string; status?: string; corrective_action_requested?: string | null; closure_notes?: string | null }>;
  photos?: Array<{ description?: string | null; original_file_path?: string; captured_at?: string }>;
};
export type ApprovedInspectionReport = {
  id: string; project_id: string; title: string; status: string; report_type: string;
  report_number: string | null; version_number: number; executive_summary: string | null;
  conclusions: string | null; report_snapshot: ReportSnapshot | null;
};
export type ReportPhoto = { description: string; bytes: Uint8Array; mimeType: string };

const W = 595.28; const H = 841.89; const LEFT = 52; const RIGHT = 52;
const blue = rgb(0.09, 0.32, 0.48); const gray = rgb(0.37, 0.43, 0.48);
// pdf-lib StandardFonts admiten WinAnsi; evitamos caracteres fuera de esa codificación.
const safe = (s: unknown) => String(s ?? "").replace(/[\u2010-\u2015]/g, "-").replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"').replace(/\u2026/g, "...").replace(/\u2022/g, "-")
  .replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF]/g, "?");
const showDate = (s?: string) => !s ? "Sin fecha" : (s.length === 10 ? s.split("-").reverse().join("-") : new Date(s).toLocaleDateString("es-CL"));

export async function createInspectionReportPdf(report: ApprovedInspectionReport, photos: ReportPhoto[]) {
  if (report.status !== "approved" || report.report_type !== "inspection") throw new Error("Solo se puede generar un PDF oficial desde un informe de inspección aprobado.");
  if (!report.report_snapshot?.inspection) throw new Error("Falta el contenido congelado de la inspección.");
  const snapshot = report.report_snapshot;
  const expectedPhotos = Array.isArray(snapshot.photos) ? snapshot.photos.length : 0;
  if (photos.length !== expectedPhotos) throw new Error("No se recuperaron todas las fotografías del informe aprobado.");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(safe(report.title)); pdf.setAuthor("TRAZA"); pdf.setSubject(`Informe de inspección - versión ${report.version_number}`);
  let page: PDFPage = pdf.addPage([W, H]); let y = H - 62;
  const available = W - LEFT - RIGHT;
  function newPage() { page = pdf.addPage([W,H]); y = H - 62; }
  function ensure(height: number) { if (y - height < 64) newPage(); }
  function line(value: unknown, size=10, font: PDFFont=regular, color=rgb(0.15,0.22,0.27), indent=0) {
    const maxWidth = available-indent; const lineHeight = size*1.45;
    for (const paragraph of safe(value).split(/\r?\n/)) {
      let output = "";
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) { ensure(lineHeight); y -= lineHeight; continue; }
      const emit = (text: string) => { ensure(lineHeight); page.drawText(text,{x:LEFT+indent,y,size,font,color});y -= lineHeight; };
      for (const word of words) {
        let candidate = output ? `${output} ${word}` : word;
        if (font.widthOfTextAtSize(candidate,size) <= maxWidth) { output = candidate; continue; }
        if (output) { emit(output); output = ""; }
        // Divide también cadenas largas sin espacios.
        for (const char of word) {
          candidate = output + char;
          if (font.widthOfTextAtSize(candidate,size) > maxWidth && output) { emit(output); output=char; }
          else output=candidate;
        }
      }
      if (output) emit(output);
    }
  }
  function title(s:string) { y-=9; ensure(32); line(s,13,bold,blue); y-=5; }
  function body(s: unknown, fallback="Sin antecedentes registrados.") { line(s || fallback); y-=6; }
  line("TRAZA  |  GESTIÓN AMBIENTAL",12,bold,blue); y-=8;
  line(report.title,21,bold,blue); y-=10;
  line(`Informe ${report.report_number || report.id}  |  Versión ${report.version_number}`,10,bold);
  line("DOCUMENTO APROBADO - PENDIENTE DE EMISIÓN",9,bold,gray); y-=16;
  line(`Proyecto: ${snapshot.project?.name || report.project_id}`);
  line(`Inspección: ${snapshot.inspection.title || "Sin título"}`);
  line(`Fecha de inspección: ${showDate(snapshot.inspection.inspection_date)}`);
  line(`Estado de inspección al guardar: ${snapshot.inspection.status || "No informado"}`);
  title("1. Antecedentes y observaciones"); body(snapshot.inspection.general_notes);
  title("2. Condiciones meteorológicas"); body(snapshot.inspection.weather_notes);
  title("3. Resumen ejecutivo"); body(report.executive_summary);
  title("4. Hallazgos asociados");
  const findings = Array.isArray(snapshot.findings) ? snapshot.findings : [];
  if (!findings.length) body("No se registraron hallazgos asociados.");
  findings.forEach((f,i)=>{
    line(`${i+1}. ${f.title || "Hallazgo"}`,11,bold);
    body(`Clasificación: ${f.classification || "No indicada"}. Estado: ${f.status || "Sin estado"}.`);
    body(f.description);
    if (f.corrective_action_requested) body(`Medida solicitada: ${f.corrective_action_requested}`);
    if (f.closure_notes) body(`Observación de cierre: ${f.closure_notes}`);
  });
  title("5. Registro fotográfico");
  for (let i=0;i<photos.length;i++) {
    const ph = photos[i];
    let embedded: PDFImage;
    if (ph.mimeType === "image/png") embedded = await pdf.embedPng(ph.bytes);
    else embedded = await pdf.embedJpg(ph.bytes);
    const fit = Math.min(available/embedded.width, 310/embedded.height, 1);
    const height = embedded.height*fit;
    ensure(height+62);
    line(`Fotografía ${i+1}`,10,bold); y-=4;
    page.drawImage(embedded,{x:LEFT,y:y-height,width:embedded.width*fit,height});
    y -= height+10;
    body(ph.description || "Sin descripción");
  }
  if (!photos.length) body("No se registraron fotografías.");
  title("6. Conclusiones"); body(report.conclusions);
  const pages = pdf.getPages();
  pages.forEach((p,i)=>{
    p.drawLine({start:{x:LEFT,y:47},end:{x:W-RIGHT,y:47},thickness:.6,color:rgb(.8,.85,.89)});
    p.drawText(safe(`TRAZA | Informe ${report.report_number || report.id} | v${report.version_number}`),{x:LEFT,y:33,size:8,font:regular,color:gray});
    p.drawText(`${i+1} / ${pages.length}`,{x:W-RIGHT-30,y:33,size:8,font:regular,color:gray});
  });
  return pdf.save();
}
