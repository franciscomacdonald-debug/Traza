"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./activacion.module.css";

type SetupStatus = {
  settings: boolean;
  aif_environmental: boolean;
  contractor_environmental: boolean;
  sectors: boolean;
  activities: boolean;
  environmental_matrix: boolean;
  rca_required: boolean;
  rca_configured: boolean | null;
  completed_steps: number;
  total_steps: number;
  completion_percentage: number;
};

type ProjectRow = {
  id: string;
  name: string;
  project_code: string | null;
  status: "draft" | "active" | "finished" | "archived";
};

const checklistLabels: Array<{
  key: keyof Pick<
    SetupStatus,
    | "settings"
    | "aif_environmental"
    | "contractor_environmental"
    | "sectors"
    | "activities"
    | "environmental_matrix"
  >;
  title: string;
  description: string;
}> = [
  {
    key: "settings",
    title: "Configuración general",
    description: "Datos básicos y configuración ambiental del proyecto",
  },
  {
    key: "aif_environmental",
    title: "Especialista Ambiental AIF",
    description: "Debe existir un integrante activo con este rol",
  },
  {
    key: "contractor_environmental",
    title: "Responsable Ambiental Contratista",
    description: "Debe existir un integrante activo con este rol",
  },
  {
    key: "sectors",
    title: "Sectores",
    description: "Debe existir al menos un sector activo",
  },
  {
    key: "activities",
    title: "Actividades",
    description: "Debe existir al menos una actividad activa",
  },
  {
    key: "environmental_matrix",
    title: "Matriz ambiental",
    description: "Debe existir al menos un requisito ambiental activo",
  },
];

export default function ActivacionProyectoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    if (!supabase) {
      setMessage("Falta configurar la conexión con Supabase.");
      setLoading(false);
      return;
    }

    const client = supabase!;

    const { data: sessionData } = await client.auth.getSession();

    if (!sessionData.session) {
      router.replace("/login");
      return;
    }

    const [{ data: projectData, error: projectError }, { data: setupData, error: setupError }] =
      await Promise.all([
        client
          .from("projects")
          .select("id, name, project_code, status")
          .eq("id", projectId)
          .single(),
        client.rpc("get_project_setup_status", {
          p_project_id: projectId,
        }),
      ]);

    if (projectError || setupError) {
      setMessage(projectError?.message || setupError?.message || "No fue posible cargar el estado del proyecto.");
      setLoading(false);
      return;
    }

    setProject(projectData as ProjectRow);
    setSetup(setupData as SetupStatus);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [projectId]);

  const allReady = useMemo(() => {
    if (!setup || !project) return false;

    const baseReady =
      setup.settings &&
      setup.aif_environmental &&
      setup.contractor_environmental &&
      setup.sectors &&
      setup.activities &&
      setup.environmental_matrix;

    const rcaReady = setup.rca_required ? setup.rca_configured === true : true;

    return baseReady && rcaReady && project.status === "draft";
  }, [setup, project]);

  async function handleActivate() {
    if (!supabase || !project) return;

    setMessage("");
    setSuccess("");
    setActivating(true);

    const { data, error } = await supabase.rpc("activate_traza_project", {
      p_project_id: project.id,
    });

    setActivating(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess(
      typeof data?.message === "string"
        ? data.message
        : "Proyecto activado correctamente."
    );

    await loadData();
  }

  if (loading) {
    return <main className={styles.loading}>Cargando estado de preparación...</main>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <button onClick={() => router.push("/")}>← Dashboard</button>
        <button onClick={() => router.push(`/configuracion/proyecto/${projectId}`)}>
          Configurar proyecto
        </button>
      </div>

      <section className={styles.hero}>
        <span className={styles.eyebrow}>Preparación y activación</span>
        <h1>{project?.name ?? "Proyecto TRAZA"}</h1>
        <p>
          {project?.project_code ? `Código ${project.project_code} · ` : ""}
          Estado actual: <strong>{project?.status ?? "—"}</strong>
        </p>
      </section>

      {setup && (
        <>
          <section className={styles.summaryCard}>
            <div>
              <span className={styles.summaryLabel}>Progreso de preparación</span>
              <strong>{setup.completion_percentage}%</strong>
              <small>
                {setup.completed_steps} de {setup.total_steps} requisitos completos
              </small>
            </div>

            <div className={styles.progress}>
              <i style={{ width: `${setup.completion_percentage}%` }} />
            </div>
          </section>

          <section className={styles.card}>
            <h2>Checklist de activación</h2>

            <div className={styles.checklist}>
              {checklistLabels.map((item) => {
                const ok = Boolean(setup[item.key]);

                return (
                  <div className={styles.checkItem} key={item.key}>
                    <span className={ok ? styles.ok : styles.pending}>
                      {ok ? "✓" : "!"}
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </div>
                    <b>{ok ? "Completo" : "Pendiente"}</b>
                  </div>
                );
              })}

              {setup.rca_required && (
                <div className={styles.checkItem}>
                  <span
                    className={
                      setup.rca_configured ? styles.ok : styles.pending
                    }
                  >
                    {setup.rca_configured ? "✓" : "!"}
                  </span>
                  <div>
                    <strong>Configuración RCA</strong>
                    <small>
                      El proyecto declara RCA y debe tener su configuración completa
                    </small>
                  </div>
                  <b>
                    {setup.rca_configured ? "Completo" : "Pendiente"}
                  </b>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {message && <div className={styles.error}>{message}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <section className={styles.activationCard}>
        <div>
          <span className={styles.eyebrow}>Paso final</span>
          <h2>Activar proyecto</h2>

          {project?.status !== "draft" ? (
            <p>
              Este proyecto ya no está en borrador. Estado actual:{" "}
              <strong>{project?.status}</strong>.
            </p>
          ) : allReady ? (
            <p>
              Todos los requisitos están completos. El proyecto puede ser activado.
            </p>
          ) : (
            <p>
              Completa los requisitos pendientes antes de activar el proyecto.
            </p>
          )}
        </div>

        <button
          onClick={handleActivate}
          disabled={!allReady || activating}
        >
          {activating ? "Activando..." : "Activar proyecto"}
        </button>
      </section>
    </main>
  );
}
