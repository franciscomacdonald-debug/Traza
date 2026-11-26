"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./ObligationDocuments.module.css";
import ObligationDashboard from "./ObligationDashboard";

type Obligation = { id: string; title: string; description: string | null; status: string; due_date: string | null };
type Source = { id: string; title: string; reference_code: string | null; source_scope: string };
type Link = { id: string; obligation_id: string; source_id: string; notes: string | null };
type Evidence = { id: string; obligation_id: string; file_path: string | null; description: string | null; uploaded_by: string | null; created_at: string };
type EvidenceReview = { id: string; evidence_id: string; decision: "approved" | "observed"; comments: string | null; reviewed_by: string; reviewed_at: string };
type ObligationEvaluation = { id: string; obligation_id: string; evaluation_result: "in_progress" | "completed" | "not_accredited"; justification: string; evaluated_by: string; evaluated_at: string };
type EvidenceResponse = { id: string; review_id: string; new_evidence_id: string | null; response_text: string; responded_by: string; responded_at: string };
type Version = { id: string; source_id: string; version_label: string; status: string; file_path: string | null; external_reference: string | null };
const BUCKET = "traza-documents";
const statusLabel: Record<string, string> = { pending: "Pendiente", upcoming: "Próxima", in_progress: "En curso", completed: "Cumplida", overdue: "Vencida", not_applicable: "No aplica", cancelled: "Cancelada" };

export default function ObligationDocuments({ projectId, accessLevel }: { projectId: string; accessLevel: AccessLevel }) {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [reviews, setReviews] = useState<EvidenceReview[]>([]);
  const [responses, setResponses] = useState<EvidenceResponse[]>([]);
  const [evaluations, setEvaluations] = useState<ObligationEvaluation[]>([]);
  const [evaluationOpen, setEvaluationOpen] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<"in_progress" | "completed" | "not_accredited">("in_progress");
  const [evaluationJustification, setEvaluationJustification] = useState("");
  const [evaluationSaving, setEvaluationSaving] = useState(false);
  const [responseReviewId, setResponseReviewId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [responseEvidenceId, setResponseEvidenceId] = useState("");
  const [responseSaving, setResponseSaving] = useState(false);
  const [reviewEvidenceId, setReviewEvidenceId] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"approved" | "observed">("approved");
  const [reviewComments, setReviewComments] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [sourceToAdd, setSourceToAdd] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canEdit = accessLevel === "edit" || accessLevel === "admin";
  const canReview = accessLevel === "approve" || accessLevel === "admin";

  const load = useCallback(async () => {
    if (!supabase) { setError("Falta configurar Supabase."); setLoading(false); return; }
    setLoading(true);
    setError("");
    const [ob, docs, joined] = await Promise.all([
      supabase.from("environmental_obligations").select("id,title,description,status,due_date").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("environmental_sources").select("id,title,reference_code,source_scope").or(`project_id.eq.${projectId},and(source_scope.eq.central,project_id.is.null)`).order("title"),
      supabase.from("environmental_obligation_documents").select("id,obligation_id,source_id,notes").eq("project_id", projectId),
    ]);
    if (ob.error || docs.error || joined.error) {
      setError(ob.error?.message || docs.error?.message || joined.error?.message || "No se pudieron cargar las obligaciones.");
      setLoading(false);
      return;
    }
    const obligationRows = (ob.data ?? []) as Obligation[];
    const sourceRows = (docs.data ?? []) as Source[];
    setObligations(obligationRows);
    setSources(sourceRows);
    setLinks((joined.data ?? []) as Link[]);
    setSelected(previous => obligationRows.some(o => o.id === previous) ? previous : obligationRows[0]?.id ?? "");
    if (obligationRows.length) {
      const evaluationQuery = await supabase.from("environmental_obligation_evaluations")
        .select("id,obligation_id,evaluation_result,justification,evaluated_by,evaluated_at")
        .in("obligation_id", obligationRows.map(o => o.id))
        .order("evaluated_at", { ascending: false });
      if (evaluationQuery.error) setError(evaluationQuery.error.message);
      setEvaluations((evaluationQuery.data ?? []) as ObligationEvaluation[]);
      const res = await supabase.from("obligation_evidence")
        .select("id,obligation_id,file_path,description,uploaded_by,created_at")
        .in("obligation_id", obligationRows.map(o => o.id))
        .order("created_at", { ascending: false });
      if (res.error) setError(res.error.message);
      const evidenceRows = (res.data ?? []) as Evidence[];
      setEvidences(evidenceRows);
      if (evidenceRows.length) {
        const reviewResult = await supabase.from("obligation_evidence_reviews")
          .select("id,evidence_id,decision,comments,reviewed_by,reviewed_at")
          .in("evidence_id", evidenceRows.map(e => e.id))
          .order("reviewed_at", { ascending: false });
        if (reviewResult.error) setError(reviewResult.error.message);
        const reviewRows = (reviewResult.data ?? []) as EvidenceReview[];
        setReviews(reviewRows);
        if (reviewRows.length) {
          const responseResult = await supabase.from("obligation_evidence_responses")
            .select("id,review_id,new_evidence_id,response_text,responded_by,responded_at")
            .in("review_id", reviewRows.map(r => r.id))
            .order("responded_at", { ascending: false });
          if (responseResult.error) setError(responseResult.error.message);
          setResponses((responseResult.data ?? []) as EvidenceResponse[]);
        } else setResponses([]);
      } else { setReviews([]); setResponses([]); }
    } else { setEvidences([]); setReviews([]); setResponses([]); setEvaluations([]); }
    if (sourceRows.length) {
      const revisionResult = await supabase.from("environmental_source_versions")
        .select("id,source_id,version_label,status,file_path,external_reference")
        .in("source_id", sourceRows.map(s => s.id)).eq("status", "active");
      if (revisionResult.error) setError(revisionResult.error.message);
      setVersions((revisionResult.data ?? []) as Version[]);
    } else setVersions([]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSourceToAdd(""); setEvaluationOpen(false); setEvaluationJustification(""); }, [selected]);

  async function addLink() {
    if (!supabase || !canEdit || !selected || !sourceToAdd || saving) return;
    setSaving(true); setError(""); setMessage("");
    const { error: insertError } = await supabase.from("environmental_obligation_documents")
      .insert({ project_id: projectId, obligation_id: selected, source_id: sourceToAdd });
    if (insertError) setError(`No se pudo vincular: ${insertError.message}`);
    else { setMessage("Documento vinculado correctamente."); setSourceToAdd(""); await load(); }
    setSaving(false);
  }

  async function removeLink(link: Link) {
    if (!supabase || !canEdit || saving) return;
    if (!window.confirm("¿Desvincular este documento? El PDF y sus versiones no se eliminarán.")) return;
    setSaving(true); setError(""); setMessage("");
    const { error: deleteError } = await supabase.from("environmental_obligation_documents")
      .delete().eq("id", link.id).eq("project_id", projectId);
    if (deleteError) setError(`No se pudo desvincular: ${deleteError.message}`);
    else { setMessage("Vínculo eliminado. El documento original se conserva."); await load(); }
    setSaving(false);
  }

  async function openPdf(version: Version) {
    if (!supabase || !version.file_path) return;
    setError("");
    const { data, error: urlError } = await supabase.storage.from(BUCKET).createSignedUrl(version.file_path, 60);
    if (urlError || !data?.signedUrl) { setError(urlError?.message || "No se pudo abrir el PDF."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const chosen = obligations.find(o => o.id === selected);
  const chosenEvidences = evidences.filter(e => e.obligation_id === selected);
  const MAX_BYTES = 10 * 1024 * 1024;
  const acceptedMime: Record<string, string> = {
    "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png"
  };

  async function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !canEdit || !selected || !evidenceFile || uploading) return;
    setError(""); setMessage("");
    const extension = acceptedMime[evidenceFile.type];
    if (!extension) { setError("Solo se permiten archivos PDF, JPG o PNG."); return; }
    if (evidenceFile.size === 0 || evidenceFile.size > MAX_BYTES) {
      setError("El archivo debe tener contenido y pesar como máximo 10 MB."); return;
    }
    setUploading(true);
    // Se usa un nombre único y no se permite sobrescribir archivos.
    const objectPath = `${projectId}/evidencias/${selected}/${crypto.randomUUID()}.${extension}`;
    try {
      const { error: uploadError } = await supabase.storage.from(BUCKET)
        .upload(objectPath, evidenceFile, { contentType: evidenceFile.type, upsert: false });
      if (uploadError) throw new Error(`No se pudo subir el archivo: ${uploadError.message}`);
      const { error: rpcError } = await supabase.rpc("register_obligation_evidence", {
        p_obligation_id: selected,
        p_file_path: objectPath,
        p_description: evidenceDescription.trim() || null
      });
      if (rpcError) throw new Error(`El archivo se subió, pero no se pudo registrar la evidencia: ${rpcError.message}. Comunica este error al administrador para revisar el archivo sin registrar.`);
      setEvidenceFile(null);
      setEvidenceDescription("");
      const fileInput = document.getElementById("traza-evidence-file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      setMessage("Evidencia registrada correctamente.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error durante la carga.");
    } finally {
      setUploading(false);
    }
  }

  async function openEvidence(evidence: Evidence, download: boolean) {
    if (!supabase || !evidence.file_path) return;
    setError("");
    const filename = evidence.file_path.split("/").at(-1) || "evidencia";
    const { data, error: urlError } = await supabase.storage.from(BUCKET).createSignedUrl(
      evidence.file_path, 60, download ? { download: filename } : undefined
    );
    if (urlError || !data?.signedUrl) {
      setError(urlError?.message || "No se pudo obtener el archivo."); return;
    }
    // Se abre una URL temporal privada, nunca un enlace público permanente.
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !canReview || !reviewEvidenceId || reviewSaving) return;
    if (reviewDecision === "observed" && !reviewComments.trim()) {
      setError("Para observar una evidencia debes escribir el motivo."); return;
    }
    setReviewSaving(true); setError(""); setMessage("");
    try {
      const { error: reviewError } = await supabase.rpc("review_obligation_evidence", {
        p_evidence_id: reviewEvidenceId,
        p_decision: reviewDecision,
        p_comments: reviewComments.trim() || null
      });
      if (reviewError) throw new Error(reviewError.message);
      setMessage(reviewDecision === "approved" ? "Revisión aprobada y registrada." : "Observación registrada.");
      setReviewEvidenceId(null); setReviewComments(""); setReviewDecision("approved");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la revisión.");
    } finally { setReviewSaving(false); }
  }

  async function submitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !canEdit || !responseReviewId || responseSaving || !responseText.trim()) return;
    setResponseSaving(true); setError(""); setMessage("");
    try {
      const { error: responseError } = await supabase.rpc("respond_obligation_evidence_review", {
        p_review_id: responseReviewId,
        p_response_text: responseText.trim(),
        p_new_evidence_id: responseEvidenceId || null
      });
      if (responseError) throw new Error(responseError.message);
      setMessage("Respuesta registrada. La asesoría debe revisar la subsanación.");
      setResponseReviewId(null); setResponseText(""); setResponseEvidenceId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la respuesta.");
    } finally { setResponseSaving(false); }
  }

  async function submitEvaluation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !canReview || !selected || evaluationSaving || !evaluationJustification.trim()) return;
    setEvaluationSaving(true); setError(""); setMessage("");
    try {
      const { error: evaluationError } = await supabase.rpc("evaluate_environmental_obligation", {
        p_obligation_id: selected,
        p_result: evaluationResult,
        p_justification: evaluationJustification.trim()
      });
      if (evaluationError) throw new Error(evaluationError.message);
      setEvaluationOpen(false);
      setEvaluationJustification("");
      setEvaluationResult("in_progress");
      await load();
      setMessage("Evaluación formal registrada correctamente. Se conserva el historial.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la evaluación.");
    } finally { setEvaluationSaving(false); }
  }

  const linked = links.filter(l => l.obligation_id === selected);
  const eligible = sources.filter(s => !linked.some(l => l.source_id === s.id));

  return <div className={styles.container}>
    <div className={styles.header}><div><h2>Obligaciones ambientales</h2><p>Consulta el respaldo documental y su versión vigente.</p></div><button type="button" onClick={() => void load()} disabled={loading || saving}>Actualizar</button></div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {message && <div className={styles.message} role="status">{message}</div>}
    {loading ? <p>Cargando obligaciones…</p> : obligations.length === 0 ? <p>Aún no existen obligaciones ambientales en este proyecto.</p> : <>
      <ObligationDashboard obligations={obligations} onSelect={setSelected} selectedId={selected} />
      <label className={styles.selectLabel} htmlFor="obligation-select">Seleccionar obligación</label>
      <select id="obligation-select" value={selected} onChange={e => setSelected(e.target.value)} className={styles.select}>
        {obligations.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
      </select>
      {chosen && <article className={styles.card}><div className={styles.cardHead}><h3>{chosen.title}</h3><span className={styles.badge}>{statusLabel[chosen.status] || chosen.status}</span></div><p>{chosen.description || "Sin descripción."}</p><h4>Documentos asociados</h4>
        {linked.length === 0 ? <p className={styles.muted}>Esta obligación aún no tiene documentos vinculados.</p> : linked.map(link => {
          const source = sources.find(s => s.id === link.source_id);
          const version = versions.find(v => v.source_id === link.source_id);
          return <div className={styles.document} key={link.id}><div className={styles.documentText}>
            <strong>{source?.title || "Documento no disponible"}</strong>
            <span>{source?.reference_code || "Sin código"} · {version ? `Versión vigente: ${version.version_label}` : "Sin versión vigente"}</span>
            {link.notes && <small>{link.notes}</small>}
          </div><div className={styles.actions}>
            {version?.file_path && <button type="button" onClick={() => void openPdf(version)}>Ver PDF</button>}
            {version?.external_reference && !version.file_path && <a href={version.external_reference} target="_blank" rel="noopener noreferrer">Referencia</a>}
            {canEdit && <button type="button" className={styles.danger} disabled={saving} onClick={() => void removeLink(link)}>Desvincular</button>}
          </div></div>;
        })}
        <section className={styles.evaluationSection} aria-label="Evaluación formal de cumplimiento">
          <div className={styles.evaluationHeading}>
            <div>
              <h4>Evaluación formal de cumplimiento</h4>
              <p className={styles.muted}>Una evidencia aprobada no acredita automáticamente toda la obligación. La asesoría debe registrar una evaluación fundamentada.</p>
            </div>
            {canReview && chosen.status !== "cancelled" && chosen.status !== "not_applicable" &&
              <button type="button" className={styles.evaluateButton} disabled={evaluationSaving}
                onClick={() => { setEvaluationOpen(!evaluationOpen); setEvaluationJustification(""); setEvaluationResult("in_progress"); setError(""); }}>
                {evaluationOpen ? "Cerrar evaluación" : "Evaluar cumplimiento"}
              </button>}
          </div>
          {canReview && evaluationOpen && <form className={styles.evaluationForm} onSubmit={event => void submitEvaluation(event)}>
            <label htmlFor="traza-evaluation-result">Resultado de la evaluación</label>
            <select id="traza-evaluation-result" value={evaluationResult} disabled={evaluationSaving}
              onChange={event => setEvaluationResult(event.target.value as "in_progress" | "completed" | "not_accredited")}>
              <option value="in_progress">En proceso</option>
              <option value="completed">Cumplida</option>
              <option value="not_accredited">No acreditada</option>
            </select>
            <label htmlFor="traza-evaluation-justification">Justificación de la asesoría (obligatoria)</label>
            <textarea id="traza-evaluation-justification" rows={4} required maxLength={4000}
              placeholder="Fundamenta el resultado e indica las evidencias revisadas"
              value={evaluationJustification} disabled={evaluationSaving}
              onChange={event => setEvaluationJustification(event.target.value)} />
            <small>Para declarar «Cumplida», Supabase exige al menos una evidencia cuya última revisión esté aprobada. Debes verificar todos los respaldos necesarios.</small>
            <div className={styles.reviewButtons}>
              <button type="submit" disabled={evaluationSaving || !evaluationJustification.trim()}>
                {evaluationSaving ? "Registrando…" : "Registrar evaluación"}
              </button>
              <button type="button" disabled={evaluationSaving} onClick={() => setEvaluationOpen(false)}>Cancelar</button>
            </div>
          </form>}
          <h5>Historial de evaluaciones</h5>
          {evaluations.filter(e => e.obligation_id === selected).length === 0
            ? <p className={styles.muted}>Todavía no se han registrado evaluaciones formales.</p>
            : <div className={styles.evaluationHistory}>
                {evaluations.filter(e => e.obligation_id === selected).map(e => <div key={e.id} className={styles.evaluationEntry}>
                  <strong>{e.evaluation_result === "completed" ? "Cumplida" : e.evaluation_result === "in_progress" ? "En proceso" : "No acreditada"}</strong>
                  <span>{new Date(e.evaluated_at).toLocaleString("es-CL")} · Evaluador: {e.evaluated_by}</span>
                  <p>{e.justification}</p>
                </div>)}
              </div>}
        </section>
        <section className={styles.evidences} aria-label="Evidencias de cumplimiento">
          <h4>Evidencias de cumplimiento</h4>
          <p className={styles.muted}>Fotografías y certificados asociados a esta obligación. Cargar una evidencia no marca la obligación como cumplida ni supone su aprobación.</p>
          {chosenEvidences.length === 0 ? <p className={styles.muted}>Todavía no se han registrado evidencias.</p> : chosenEvidences.map(e => (
            <div className={styles.document} key={e.id}>
              <div className={styles.documentText}>
                <strong>{e.description || e.file_path?.split("/").at(-1) || "Evidencia"}</strong>
                <span>{new Date(e.created_at).toLocaleString("es-CL")} · Registro de evidencia</span>
              </div>
              <div className={styles.actions}>
                {e.file_path && <>
                  <button type="button" onClick={() => void openEvidence(e, false)}>Ver</button>
                  <button type="button" onClick={() => void openEvidence(e, true)}>Descargar</button>
                </>}
                {canReview && <button type="button" disabled={reviewSaving}
                  onClick={() => { setReviewEvidenceId(e.id); setReviewDecision("approved"); setReviewComments(""); setError(""); }}>
                  Revisar evidencia
                </button>}
              </div>
              <div className={styles.reviewHistory}>
                {(() => {
                  const history = reviews.filter(r => r.evidence_id === e.id);
                  if (!history.length) return <span className={styles.pendingReview}>Sin revisión de asesoría</span>;
                  return <>
                    <span className={history[0].decision === "approved" ? styles.approvedReview : styles.observedReview}>
                      {history[0].decision === "approved" ? "Última revisión: Aprobada" : "Última revisión: Observada"}
                    </span>
                    {history.map(r => <div key={r.id} className={styles.reviewEntry}>
                      <strong>{r.decision === "approved" ? "Aprobada" : "Observada"}</strong>
                      {" · "}{new Date(r.reviewed_at).toLocaleString("es-CL")}
                      {" · Revisor: "}{r.reviewed_by}
                      {r.comments && <div>{r.comments}</div>}
                      {responses.filter(reply => reply.review_id === r.id).map(reply => (
                        <div key={reply.id} className={styles.responseEntry}>
                          <strong>Respuesta registrada</strong>
                          <span>{new Date(reply.responded_at).toLocaleString("es-CL")} · Usuario: {reply.responded_by}</span>
                          <div>{reply.response_text}</div>
                          {reply.new_evidence_id && <small>Evidencia nueva asociada: {chosenEvidences.find(item => item.id === reply.new_evidence_id)?.description || reply.new_evidence_id}</small>}
                        </div>
                      ))}
                      {canEdit && r.decision === "observed" && <button type="button" className={styles.responseToggle}
                        disabled={responseSaving}
                        onClick={() => { setResponseReviewId(r.id === responseReviewId ? null : r.id); setResponseText(""); setResponseEvidenceId(""); setError(""); }}>
                        {responseReviewId === r.id ? "Cerrar respuesta" : "Responder observación"}
                      </button>}
                      {canEdit && responseReviewId === r.id && r.decision === "observed" &&
                        <form className={styles.responseForm} onSubmit={event => void submitResponse(event)}>
                          <label htmlFor={`response-text-${r.id}`}>Respuesta a la observación</label>
                          <textarea id={`response-text-${r.id}`} value={responseText} rows={3} maxLength={3000} required
                            placeholder="Indica la medida correctiva realizada y los antecedentes que la respaldan"
                            disabled={responseSaving} onChange={event => setResponseText(event.target.value)} />
                          <label htmlFor={`response-evidence-${r.id}`}>Nueva evidencia de la misma obligación (opcional)</label>
                          <select id={`response-evidence-${r.id}`} value={responseEvidenceId} disabled={responseSaving}
                            onChange={event => setResponseEvidenceId(event.target.value)}>
                            <option value="">Sin evidencia nueva asociada</option>
                            {chosenEvidences.filter(item => item.id !== r.evidence_id).map(item =>
                              <option key={item.id} value={item.id}>{item.description || item.file_path?.split("/").at(-1) || item.id}</option>)}
                          </select>
                          <small>Si necesitas adjuntar un nuevo archivo, súbelo primero en «Agregar evidencia» y luego selecciónalo aquí.</small>
                          <div className={styles.reviewButtons}>
                            <button type="submit" disabled={responseSaving || !responseText.trim()}>{responseSaving ? "Guardando…" : "Registrar respuesta"}</button>
                            <button type="button" disabled={responseSaving} onClick={() => setResponseReviewId(null)}>Cancelar</button>
                          </div>
                        </form>}
                    </div>)}
                  </>;
                })()}
              </div>
              {canReview && reviewEvidenceId === e.id && <form className={styles.reviewForm}
                onSubmit={event => void submitReview(event)}>
                <strong>Revisión por la asesoría</strong>
                <label htmlFor={`decision-${e.id}`}>Resultado de la revisión</label>
                <select id={`decision-${e.id}`} value={reviewDecision} disabled={reviewSaving}
                  onChange={event => setReviewDecision(event.target.value as "approved" | "observed")}>
                  <option value="approved">Aprobar evidencia</option>
                  <option value="observed">Observar evidencia</option>
                </select>
                <label htmlFor={`comments-${e.id}`}>Observaciones {reviewDecision === "observed" ? "(obligatorias)" : "(opcionales)"}</label>
                <textarea id={`comments-${e.id}`} value={reviewComments}
                  onChange={event => setReviewComments(event.target.value)}
                  rows={3} maxLength={2000} disabled={reviewSaving}
                  required={reviewDecision === "observed"}
                  placeholder="Indica el fundamento de la revisión" />
                <div className={styles.reviewButtons}>
                  <button type="submit" disabled={reviewSaving || (reviewDecision === "observed" && !reviewComments.trim())}>
                    {reviewSaving ? "Guardando…" : "Registrar revisión"}
                  </button>
                  <button type="button" disabled={reviewSaving} onClick={() => setReviewEvidenceId(null)}>Cancelar</button>
                </div>
                <small>La revisión queda en el historial. No cambia automáticamente el estado de la obligación.</small>
              </form>}
            </div>
          ))}
          {canEdit && <form onSubmit={e => void uploadEvidence(e)} className={styles.evidenceForm}>
            <h4>Agregar evidencia</h4>
            <label htmlFor="traza-evidence-file">Archivo PDF, JPG o PNG (máx. 10 MB)</label>
            <input id="traza-evidence-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required
              onChange={e => setEvidenceFile(e.target.files?.[0] || null)} disabled={uploading} />
            <label htmlFor="traza-evidence-description">Descripción</label>
            <textarea id="traza-evidence-description" value={evidenceDescription}
              onChange={e => setEvidenceDescription(e.target.value)} maxLength={1000} rows={3}
              placeholder="Ej.: Certificado de disposición final de residuos, noviembre 2026" disabled={uploading} />
            <button type="submit" disabled={uploading || !evidenceFile}>{uploading ? "Subiendo evidencia…" : "Subir evidencia"}</button>
          </form>}
        </section>
        {canEdit && <div className={styles.add}><label htmlFor="doc-add">Vincular otro documento</label><div className={styles.addRow}>
          <select id="doc-add" className={styles.select} value={sourceToAdd} onChange={e => setSourceToAdd(e.target.value)}>
            <option value="">Selecciona un documento</option>
            {eligible.map(s => <option key={s.id} value={s.id}>{s.title}{s.reference_code ? ` (${s.reference_code})` : ""}</option>)}
          </select><button type="button" disabled={!sourceToAdd || saving} onClick={() => void addLink()}>{saving ? "Guardando…" : "Vincular"}</button>
        </div></div>}
      </article>}
    </>}
  </div>;
}
