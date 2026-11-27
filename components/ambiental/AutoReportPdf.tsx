"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { createInspectionReportPdf, type ApprovedInspectionReport, type ReportPhoto } from "@/lib/create-inspection-report-pdf";
import styles from "./AutoReportPdf.module.css";

const BUCKET = "traza-documents";
const MAX_BYTES = 20 * 1024 * 1024;
type Props = { projectId: string; reportId: string; onIssued: () => void };

/** Convierte imágenes WEBP a JPEG para incorporarlas a pdf-lib sin plugins. */
async function webpToJpeg(blob: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar una fotografía WEBP.");
    context.fillStyle = "white";
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(bitmap,0,0);
    const jpeg = await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("No se pudo convertir la imagen.")),"image/jpeg",.88));
    return new Uint8Array(await jpeg.arrayBuffer());
  } finally { bitmap.close(); }
}

export default function AutoReportPdf({ projectId, reportId, onIssued }: Props) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");
  async function generateAndIssue() {
    if (!supabase || busy) return;
    setError(""); setSuccess("");
    if (!window.confirm("¿Generar y emitir el PDF oficial desde la versión APROBADA del informe? Esta acción no se puede deshacer desde esta pantalla.")) return;
    setBusy(true);
    try {
      const { data, error: queryError } = await supabase.from("environmental_reports")
        .select("id,project_id,report_type,title,status,report_number,version_number,executive_summary,conclusions,report_snapshot")
        .eq("id",reportId).eq("project_id",projectId).eq("report_type","inspection").single();
      if (queryError || !data) throw new Error(queryError?.message || "No se encontró el informe guardado.");
      const report = data as ApprovedInspectionReport;
      if (report.status !== "approved") throw new Error("Solo puedes emitir informes aprobados.");
      if (!report.report_snapshot?.inspection) throw new Error("La versión aprobada no tiene una inspección guardada.");
      const photoRefs = report.report_snapshot.photos ?? [];
      const photos: ReportPhoto[] = [];
      for (const [index,photo] of photoRefs.entries()) {
        if (!photo.original_file_path) throw new Error(`La fotografía ${index+1} no tiene una ruta de archivo guardada.`);
        const { data: file, error: downloadError } = await supabase.storage.from(BUCKET).download(photo.original_file_path);
        if (downloadError || !file) throw new Error(`No se pudo recuperar la fotografía ${index+1}: ${downloadError?.message || "Sin acceso"}`);
        const mime = file.type.toLowerCase();
        let bytes: Uint8Array; let outputMime: string;
        if (mime === "image/png" || photo.original_file_path.toLowerCase().endsWith(".png")) {
          bytes = new Uint8Array(await file.arrayBuffer()); outputMime = "image/png";
        } else if (mime === "image/jpeg" || /\.jpe?g$/i.test(photo.original_file_path)) {
          bytes = new Uint8Array(await file.arrayBuffer()); outputMime = "image/jpeg";
        } else if (mime === "image/webp" || photo.original_file_path.toLowerCase().endsWith(".webp")) {
          bytes = await webpToJpeg(file); outputMime = "image/jpeg";
        } else throw new Error(`La fotografía ${index+1} tiene un formato no compatible.`);
        photos.push({description:photo.description || `Fotografía ${index+1}`,bytes,mimeType:outputMime});
      }
      const pdf = await createInspectionReportPdf(report, photos);
      if (pdf.byteLength === 0 || pdf.byteLength > MAX_BYTES) throw new Error("El PDF supera el máximo permitido de 20 MB. Reduce la resolución de las fotografías.");
      const path = `${projectId}/ambiental/reportes/${reportId}/${crypto.randomUUID()}.pdf`;
      const fileBlob = new Blob([new Uint8Array(pdf)],{type:"application/pdf"});
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path,fileBlob,{
        contentType:"application/pdf",upsert:false,cacheControl:"3600"
      });
      if (uploadError) throw new Error(`No se pudo subir el PDF: ${uploadError.message}`);
      const { error: rpcError } = await supabase.rpc("traza_issue_verified_environmental_report",{p_report_id:reportId,p_file_path:path});
      if (rpcError) throw new Error(`El PDF fue almacenado, pero NO se emitió: ${rpcError.message}. Ruta para recuperación: ${path}`);
      setSuccess("PDF generado, almacenado y emitido oficialmente. Puedes descargarlo desde el listado de informes.");
      onIssued();
    } catch(cause) { setError(cause instanceof Error ? cause.message : "No se pudo generar el PDF."); }
    finally { setBusy(false); }
  }
  return <section className={styles.wrap} aria-label="Generación automática del PDF oficial">
    <h4>Generar y emitir automáticamente</h4>
    <p>Utiliza exclusivamente la copia aprobada del informe y sus fotografías. Si falta una evidencia o falla el almacenamiento, el informe no se marca como emitido.</p>
    <button type="button" disabled={busy} onClick={()=>void generateAndIssue()}>{busy?"Generando PDF y verificando…":"Generar y emitir PDF oficial"}</button>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {success && <p className={styles.success} role="status">{success}</p>}
  </section>;
}
