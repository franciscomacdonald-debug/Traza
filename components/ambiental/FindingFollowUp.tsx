"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./FindingFollowUp.module.css";

type Finding = { id: string; project_id: string; status: string; title: string; origin: string; closed_at: string | null; closure_notes: string | null };
type Response = { id: string; response_text: string; requests_closure: boolean; responded_by: string; created_at: string };
type Action = "start" | "respond" | "request_closure" | "approve" | "reopen";
const names: Record<string,string> = { pending:"Pendiente", in_management:"En gestión", responded:"Respondido", closure_requested:"Cierre solicitado", closed:"Cerrado", overdue:"Vencido", cancelled:"Anulado" };

export default function FindingFollowUp({ findingId, projectId, accessLevel, onUpdated }: { findingId:string; projectId:string; accessLevel:AccessLevel; onUpdated:()=>void }) {
  const [finding,setFinding] = useState<Finding|null>(null);
  const [responses,setResponses] = useState<Response[]>([]);
  const [canAif,setCanAif] = useState(false);
  const [canContractor,setCanContractor] = useState(false);
  const [note,setNote] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");
  const editable = ["edit","approve","admin"].includes(accessLevel);
  const refresh = useCallback(async () => {
    if(!supabase) return;
    const [a,b] = await Promise.all([
      supabase.from("findings").select("id,project_id,status,title,origin,closed_at,closure_notes").eq("id",findingId).eq("project_id",projectId).maybeSingle(),
      supabase.from("finding_responses").select("id,response_text,requests_closure,responded_by,created_at").eq("finding_id",findingId).order("created_at",{ascending:true}).limit(200)
    ]);
    if(a.error || b.error) { setError(a.error?.message || b.error?.message || "Error de consulta"); return; }
    setFinding((a.data as Finding|null) ?? null); setResponses((b.data ?? []) as Response[]);
  },[findingId,projectId]);
  useEffect(() => {
    let active=true;
    setFinding(null); setResponses([]); setNote(""); setError(""); setSuccess(""); setCanAif(false); setCanContractor(false);
    void refresh();
    void (async()=>{
      if(!supabase) return;
      const {data:auth}=await supabase.auth.getUser();
      if(!auth.user) return;
      const r=await supabase.from("project_members").select("role").eq("project_id",projectId).eq("user_id",auth.user.id).eq("status","active");
      if(!active) return;
      if(r.error) {setError(r.error.message);return;}
      setCanAif((r.data??[]).some(x=>x.role==="aif_environmental"));
      setCanContractor((r.data??[]).some(x=>x.role==="contractor_environmental"));
    })();
    return()=>{active=false;};
  },[projectId,findingId,refresh]);
  async function act(action:Action) {
    if(!supabase || busy || !finding) return;
    if(action!=="start" && !note.trim()) {setError("Debes escribir el detalle de la gestión o decisión.");return;}
    setBusy(true); setError(""); setSuccess("");
    const result=await supabase.rpc("traza_manage_finding", {p_finding_id:findingId,p_action:action,p_note:note.trim()});
    if(result.error) setError(result.error.message);
    else {setSuccess("Gestión registrada correctamente.");setNote("");await refresh();onUpdated();}
    setBusy(false);
  }
  const status=finding?.status;
  return <section className={styles.panel} aria-label="Seguimiento del hallazgo">
    <div className={styles.header}><strong className={styles.title}>Seguimiento y cierre</strong><span className={styles.hint}>Estado: {names[status??""]||status||"Cargando..."}</span><button type="button" className={styles.button} onClick={()=>void refresh()} disabled={busy}>Actualizar</button></div>
    {finding?.closure_notes && <p className={styles.hint}>Observación de cierre: {finding.closure_notes}</p>}
    <div className={styles.history}><strong>Historial de respuestas ({responses.length})</strong>{responses.length===0?<span className={styles.hint}>Todavía no existen respuestas.</span>:responses.map(r=><div key={r.id} className={styles.entry}><small>{new Date(r.created_at).toLocaleString("es-CL")}{r.requests_closure?" · Solicitud de cierre":""}</small><div>{r.response_text}</div></div>)}</div>
    {editable && (canAif || canContractor) && status!=="closed" && status!=="cancelled" && <div className={styles.form}>
      <label>Descripción de gestión o decisión<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Describe las acciones, respuesta o verificación realizada..." maxLength={5000}/></label>
      <div className={styles.actions}>
        {canContractor && (status==="pending"||status==="overdue") && <button type="button" disabled={busy} className={styles.button} onClick={()=>void act("start")}>Iniciar gestión</button>}
        {canContractor && ["pending","in_management","responded","overdue"].includes(status??"") && <button type="button" disabled={busy} className={`${styles.button} ${styles.primary}`} onClick={()=>void act("respond")}>Registrar respuesta</button>}
        {canContractor && status==="responded" && <button type="button" disabled={busy} className={styles.button} onClick={()=>void act("request_closure")}>Solicitar cierre</button>}
        {canAif && status==="closure_requested" && <><button type="button" disabled={busy} className={`${styles.button} ${styles.primary}`} onClick={()=>void act("approve")}>Aprobar cierre (AIF)</button><button type="button" disabled={busy} className={styles.button} onClick={()=>void act("reopen")}>Devolver a gestión (AIF)</button></>}
      </div>
    </div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}{success && <p role="status" className={styles.success}>{success}</p>}
  </section>;
}
