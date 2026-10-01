"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type Metric = {
  title: string;
  value: string;
  detail: string;
  tone: "blue" | "green" | "amber" | "red" | "gray";
};

const metrics: Metric[] = [
  { title: "Alertas", value: "6", detail: "2 críticas", tone: "red" },
  { title: "Hallazgos", value: "3", detail: "2 en gestión", tone: "amber" },
  { title: "Inspecciones", value: "12", detail: "este mes", tone: "blue" },
  { title: "Obligaciones", value: "4", detail: "2 próximas", tone: "amber" },
  { title: "Permisos", value: "8", detail: "1 próximo a vencer", tone: "amber" },
  { title: "Cierre mensual", value: "Septiembre", detail: "En revisión", tone: "blue" },
];

const nav = [
  ["Dashboard", "▣"],
  ["Alertas", "⚠"],
  ["Inspecciones", "▤"],
  ["Hallazgos", "●"],
  ["Requisitos", "✓"],
  ["Obligaciones", "✓"],
  ["Permisos", "▣"],
  ["Residuos", "♻"],
  ["Cierre mensual", "▤"],
  ["Informes", "▤"],
  ["Configuración", "⚙"],
];

export default function Home() {
  const router = useRouter();
  const [project, setProject] = useState("Cuncumén Etapa 3");
  const [area, setArea] = useState("Medio Ambiente");
  const [active, setActive] = useState("Dashboard");
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setUser(data.session.user);
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setUser(session.user);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const statusText = useMemo(
    () => "3 hallazgos abiertos · 2 obligaciones próximas · 1 permiso próximo a vencer",
    []
  );

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (checkingSession) {
    return (
      <main style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f4f7fb",
        color: "#102a43",
        fontFamily: "Arial, Helvetica, sans-serif"
      }}>
        Verificando sesión de TRAZA...
      </main>
    );
  }

  if (!supabase) {
    return (
      <main style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f4f7fb",
        color: "#102a43",
        fontFamily: "Arial, Helvetica, sans-serif"
      }}>
        Falta configurar la conexión con Supabase.
      </main>
    );
  }

  const userLabel =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    "Usuario TRAZA";

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>T</div>
          <div>
            <strong>TRAZA</strong>
            <span>Gestión de proyectos</span>
          </div>
        </div>

        <nav className={styles.nav}>
          {nav.map(([label, icon]) => (
            <button
              key={label}
              className={`${styles.navItem} ${active === label ? styles.navActive : ""}`}
              onClick={() => setActive(label)}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <span>TRAZA v1</span>
          <small>Área inicial: Medio Ambiente</small>
        </div>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Proyecto activo</span>
            <h1>{active}</h1>
          </div>

          <div className={styles.userBox}>
            <button className={styles.bell}>🔔</button>
            <div>
              <strong>{userLabel}</strong>
              <span>{user?.email ?? "Cuenta autenticada"}</span>
            </div>
            <button
              onClick={handleLogout}
              style={{
                border: "1px solid #d9e2ec",
                background: "white",
                color: "#486581",
                padding: "9px 12px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Salir
            </button>
          </div>
        </header>

        <section className={styles.filters}>
          <label>
            Proyecto
            <select value={project} onChange={(e) => setProject(e.target.value)}>
              <option>Cuncumén Etapa 3</option>
              <option>Proyecto de demostración</option>
            </select>
          </label>

          <label>
            Área
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              <option>Medio Ambiente</option>
              <option disabled>Prevención de Riesgos</option>
              <option disabled>Calidad</option>
              <option disabled>Terreno</option>
              <option disabled>Laboratorio</option>
            </select>
          </label>
        </section>

        <section className={styles.statusPanel}>
          <div>
            <span className={styles.statusLabel}>Estado ambiental del proyecto</span>
            <div className={styles.statusTitle}>
              <span className={styles.statusDot} />
              ATENCIÓN
            </div>
            <p>{statusText}</p>
          </div>
          <button className={styles.primaryButton}>Ver alertas</button>
        </section>

        <section className={styles.metrics}>
          {metrics.map((metric) => (
            <article key={metric.title} className={styles.metricCard}>
              <div className={`${styles.tone} ${styles[metric.tone]}`} />
              <span>{metric.title}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </section>

        <section className={styles.lowerGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Seguimiento</span>
                <h2>Actividad reciente</h2>
              </div>
              <button>Ver todo</button>
            </div>

            <div className={styles.activity}>
              <div><span className={styles.ok}>✓</span><p><strong>Inspección ambiental completada</strong><small>Registro actualizado</small></p><time>Hoy</time></div>
              <div><span className={styles.warn}>!</span><p><strong>Hallazgo N°024 actualizado</strong><small>En gestión por contratista</small></p><time>Hoy</time></div>
              <div><span className={styles.info}>↗</span><p><strong>Evidencia incorporada</strong><small>Fotografía asociada a inspección</small></p><time>Ayer</time></div>
              <div><span className={styles.warn}>!</span><p><strong>Permiso próximo a vencer</strong><small>Revisión requerida</small></p><time>2 días</time></div>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Período actual</span>
                <h2>Cierre mensual</h2>
              </div>
            </div>

            <div className={styles.closureBox}>
              <span>Septiembre 2026</span>
              <strong>En revisión</strong>
              <div className={styles.progress}><i /></div>
              <small>La información mostrada en esta versión es de demostración.</small>
            </div>
          </article>
        </section>

        <footer className={styles.note}>
          TRAZA v1 — Plataforma de gestión y trazabilidad.
        </footer>
      </section>
    </main>
  );
}
