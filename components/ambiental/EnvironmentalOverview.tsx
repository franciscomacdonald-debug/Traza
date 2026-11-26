"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./EnvironmentalOverview.module.css";

type Obligation = { id: string; title: string; status: string; due_date: string | null; created_at: string };
type Finding = { id: string; title: string; status: string; created_at: string };
type Inspection = { id: string; status: string; inspection_date: string | null; created_at: string };
type Permit = { id: string; status: string; valid_until: string | null; created_at: string };
type Alert = { id: string; title: string; status: string; priority: string; created_at: string };
type Closure = { id: string; period_month: string; status: string };
type Snapshot = { obligations: Obligation[]; findings: Finding[]; inspections: Inspection[]; permits: Permit[]; alerts: Alert[]; closure: Closure | null };

type Item = { key: string; label: string; date: string; title: string };

function localDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Santiago" }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function niceDay(value: string | null): string {
  if (!value) return "Sin fecha";
  const part = value.slice(0, 10).split("-");
  return part.length === 3 ? `${part[2]}/${part[1]}/${part[0]}` : value;
}
function formatPeriod(value: string): string {
  return new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value.slice(0, 10) + "T12:00:00Z"));
}

export default function EnvironmentalOverview({ projectId, unreadAlertCount, criticalAlertCount, onOpenNotifications, onOpenObligations }: {
  projectId: string;
  unreadAlertCount: number;
  criticalAlertCount: number;
  onOpenNotifications: () => void;
  onOpenObligations: () => void;
}) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!supabase || !projectId) { setData(null); setLoading(false); return; }
    setLoading(true);
    setError("");
    const client = supabase;
    const [obligations, findings, inspections, permits, alerts, closure] = await Promise.all([
      client.from("environmental_obligations").select("id,title,status,due_date,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1000),
      client.from("findings").select("id,title,status,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1000),
      client.from("inspections").select("id,status,inspection_date,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1000),
      client.from("environmental_permits").select("id,status,valid_until,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1000),
      client.from("project_alerts").select("id,title,status,priority,created_at").eq("project_id", projectId).in("status", ["unread", "read"]).order("created_at", { ascending: false }).limit(1000),
      client.from("monthly_closures").select("id,period_month,status").eq("project_id", projectId).order("period_month", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const anyError = [obligations.error, findings.error, inspections.error, permits.error, alerts.error, closure.error].find(Boolean);
    if (anyError) {
      setError(anyError.message);
      setData(null);
    } else {
      setData({
        obligations: (obligations.data ?? []) as Obligation[],
        findings: (findings.data ?? []) as Finding[],
        inspections: (inspections.data ?? []) as Inspection[],
        permits: (permits.data ?? []) as Permit[],
        alerts: (alerts.data ?? []) as Alert[],
        closure: (closure.data ?? null) as Closure | null,
      });
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const today = localDay(new Date());
  const monthStart = today.slice(0, 7) + "-01";
  const nextWeek = localDay(new Date(Date.now() + 7 * 86400000));
  const stats = useMemo(() => {
    if (!data) return null;
    const activeObligations = data.obligations.filter(o => !["cancelled", "not_applicable"].includes(o.status));
    const completed = activeObligations.filter(o => o.status === "completed").length;
    const overdue = activeObligations.filter(o => o.status !== "completed" && (o.status === "overdue" || (!!o.due_date && o.due_date < today))).length;
    const upcoming = activeObligations.filter(o => o.status !== "completed" && o.due_date && o.due_date >= today && o.due_date <= nextWeek).length;
    const openFindings = data.findings.filter(f => !["closed", "cancelled"].includes(f.status)).length;
    const validPermits = data.permits.filter(p => p.status === "valid" && (!p.valid_until || p.valid_until >= today)).length;
    const expiringPermits = data.permits.filter(p => p.status === "valid" && p.valid_until && p.valid_until >= today && p.valid_until <= nextWeek).length;
    return {
      completed, overdue, upcoming, openFindings, validPermits, expiringPermits,
      monthInspections: data.inspections.filter(i => i.inspection_date && i.inspection_date >= monthStart && i.inspection_date <= today).length,
      percent: activeObligations.length ? Math.round(completed * 100 / activeObligations.length) : null,
    };
  }, [data, today, nextWeek, monthStart]);

  const activity = useMemo<Item[]>(() => {
    if (!data) return [];
    return [
      ...data.obligations.map(o => ({ key: `o-${o.id}`, label: "Obligación", title: o.title, date: o.created_at })),
      ...data.findings.map(f => ({ key: `f-${f.id}`, label: "Hallazgo", title: f.title, date: f.created_at })),
      ...data.inspections.map(i => ({ key: `i-${i.id}`, label: "Inspección", title: `Inspección · ${i.status}`, date: i.created_at })),
      ...data.permits.map(p => ({ key: `p-${p.id}`, label: "Permiso", title: `Permiso · ${p.status}`, date: p.created_at })),
      ...data.alerts.map(a => ({ key: `a-${a.id}`, label: "Alerta", title: a.title, date: a.created_at })),
    ].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [data]);

  if (loading && !data) return <section className={styles.loading}>Cargando indicadores reales del proyecto…</section>;
  if (error) return <section className={styles.error} role="alert">No se pudieron cargar todos los indicadores: {error} <button type="button" onClick={() => void refresh()}>Reintentar</button></section>;
  if (!data || !stats) return <section className={styles.loading}>Sin información disponible.</section>;

  const cards = [
    { name: "Alertas sin leer", value: unreadAlertCount, detail: `${criticalAlertCount} críticas · lectura personal` },
    { name: "Inspecciones", value: data.inspections.length, detail: `${stats.monthInspections} con fecha este mes` },
    { name: "Hallazgos abiertos", value: stats.openFindings, detail: `${data.findings.length} hallazgos totales` },
    { name: "Obligaciones", value: data.obligations.length, detail: `${stats.completed} cumplidas · ${stats.overdue} vencidas` },
    { name: "Permisos vigentes", value: stats.validPermits, detail: `${stats.expiringPermits} próximos a vencer` },
    { name: "Alertas activas", value: data.alerts.length, detail: "Avisos del proyecto, leídos o no" },
  ];

  return <section className={styles.root}>
    <div className={styles.heading}>
      <div><h2>Resumen ambiental del proyecto</h2><p>Información consultada directamente desde Supabase</p></div>
      <button type="button" className={styles.secondary} onClick={() => void refresh()} disabled={loading}>{loading ? "Actualizando…" : "Actualizar datos"}</button>
    </div>
    <div className={styles.cards}>
      {cards.map(c => <article key={c.name} className={styles.card}>
        <span className={styles.cardLabel}>{c.name}</span>
        <strong className={styles.cardValue}>{c.value}</strong>
        <span className={styles.cardDetail}>{c.detail}</span>
      </article>)}
    </div>
    <div className={styles.progressCard}>
      <div className={styles.progressTop}><strong>Cumplimiento de obligaciones</strong><strong>{stats.percent === null ? "Sin obligaciones aplicables" : `${stats.percent} %`}</strong></div>
      <div className={styles.track}><div className={styles.fill} style={{ width: `${stats.percent ?? 0}%` }} /></div>
      <div className={styles.small}>Próximas a vencer (7 días): {stats.upcoming} · Vencidas: {stats.overdue}</div>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onOpenObligations}>Ver obligaciones</button>
        <button type="button" className={styles.secondary} onClick={onOpenNotifications}>Ver notificaciones</button>
      </div>
    </div>
    <div className={styles.bottom}>
      <article className={styles.panel}>
        <h3>Actividad reciente registrada</h3>
        {activity.length === 0 ? <p className={styles.empty}>Todavía no hay registros de actividad en estas categorías.</p> :
          <ul className={styles.activity}>{activity.map(item => <li key={item.key}>
            <div><span className={styles.kind}>{item.label}</span><strong>{item.title}</strong></div>
            <time dateTime={item.date}>{niceDay(item.date)}</time>
          </li>)}</ul>}
      </article>
      <article className={styles.panel}>
        <h3>Último cierre mensual</h3>
        {data.closure ? <div className={styles.closure}>
          <strong>{formatPeriod(data.closure.period_month)}</strong>
          <span>Estado: {data.closure.status.replaceAll("_", " ")}</span>
        </div> : <p className={styles.empty}>Sin cierres mensuales registrados.</p>}
        <p className={styles.note}>Los datos de prueba se incluyen en los indicadores. La actividad muestra registros recientes, no un historial de todas las ediciones.</p>
      </article>
    </div>
  </section>;
}
