"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./ObligationAlerts.module.css";

type Obligation = { id: string; title: string; description: string | null; status: string; due_date: string | null };
type Alert = { id: string; alert_type: string; priority: string; status: string; title: string; message: string | null; due_date: string | null; related_entity_id: string | null; created_at: string };

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(day: string, count: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + count);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dateLabel(day: string | null): string { return day ? day.split("-").reverse().join("/") : "Sin fecha"; }

export default function ObligationAlerts({ projectId, obligations, onSelect }: {
  projectId: string;
  obligations: Obligation[];
  onSelect: (id: string) => void;
}) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const today = localToday();
  const sevenDays = addDays(today, 7);

  const due = useMemo(() => obligations.filter(o => o.due_date && o.due_date >= today && o.due_date <= sevenDays && !["completed", "cancelled", "not_applicable"].includes(o.status)), [obligations, today, sevenDays]);
  const overdue = useMemo(() => obligations.filter(o => !["completed", "cancelled", "not_applicable"].includes(o.status) && (o.status === "overdue" || Boolean(o.due_date && o.due_date < today))), [obligations, today]);

  const loadAlerts = useCallback(async () => {
    if (!supabase) { setError("No se pudo conectar con Supabase."); return; }
    setLoading(true);
    setError("");
    const { data, error: requestError } = await supabase.from("project_alerts")
      .select("id,alert_type,priority,status,title,message,due_date,related_entity_id,created_at")
      .eq("project_id", projectId)
      .in("alert_type", ["obligation_due", "obligation_overdue"])
      .in("status", ["unread", "read"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (requestError) setError(`No se pudieron consultar las alertas: ${requestError.message}`);
    else setAlerts((data ?? []) as Alert[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void loadAlerts(); }, [loadAlerts]);

  async function refreshAlerts() {
    if (!supabase || refreshing) return;
    setRefreshing(true);
    setNotice("");
    setError("");
    try {
      const { error: requestError } = await supabase.rpc("refresh_obligation_alerts", { p_project_id: projectId });
      if (requestError) throw requestError;
      await loadAlerts();
      setNotice("Alertas actualizadas correctamente.");
    } catch (e) { setError(e instanceof Error ? e.message : "No fue posible actualizar las alertas."); }
    finally { setRefreshing(false); }
  }

  function selectObligation(id: string) {
    onSelect(id);
    document.getElementById("obligation-select")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return <section className={styles.panel} aria-label="Alertas y vencimientos de obligaciones">
    <header className={styles.header}>
      <div><h3>Alertas y próximos vencimientos</h3><p>Vencimientos calculados desde las obligaciones; alertas guardadas en Supabase.</p></div>
      <button type="button" className={styles.refresh} onClick={() => void refreshAlerts()} disabled={refreshing || loading}>
        {refreshing ? "Actualizando…" : "Actualizar alertas"}
      </button>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.metrics}>
      <div className={styles.metric}><span>Próximas a vencer (7 días)</span><strong>{due.length}</strong></div>
      <div className={styles.metric}><span>Vencidas</span><strong>{overdue.length}</strong></div>
      <div className={styles.metric}><span>Alertas activas registradas</span><strong>{alerts.length}</strong></div>
    </div>
    {due.length === 0 && overdue.length === 0 ? <p className={styles.empty}>No hay obligaciones pendientes con vencimiento dentro de los próximos 7 días ni vencidas.</p> :
      <div className={styles.list}>
        {overdue.map(o => <button key={`overdue-${o.id}`} type="button" className={styles.item} onClick={() => selectObligation(o.id)}><span><b className={styles.critical}>Vencida</b> · {o.title}</span><small>Vencimiento: {dateLabel(o.due_date)}</small></button>)}
        {due.map(o => <button key={`due-${o.id}`} type="button" className={styles.item} onClick={() => selectObligation(o.id)}><span><b className={styles.warning}>Por vencer</b> · {o.title}</span><small>Vencimiento: {dateLabel(o.due_date)}</small></button>)}
      </div>}
    <details className={styles.details}>
      <summary>Alertas activas almacenadas ({alerts.length})</summary>
      {alerts.length === 0 ? <p className={styles.empty}>No hay alertas activas registradas en Supabase.</p> :
        <div className={styles.list}>{alerts.map(a => <div className={styles.saved} key={a.id}>
          <div><strong>{a.title}</strong><small>{a.message || "Sin descripción"} · {dateLabel(a.due_date)}</small></div>
          {a.related_entity_id && obligations.some(o => o.id === a.related_entity_id) && <button type="button" onClick={() => selectObligation(a.related_entity_id!)}>Abrir obligación</button>}
        </div>)}</div>}
    </details>
    <p className={styles.disclaimer}>El recuento de vencimientos se calcula con las fechas del proyecto. «Actualizar alertas» ejecuta la función existente para generar o resolver avisos; no cambia el estado de las obligaciones.</p>
  </section>;
}
