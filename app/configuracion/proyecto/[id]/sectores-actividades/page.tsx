"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./sectores-actividades.module.css";

type Sector = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

type Activity = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

export default function SectoresActividadesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [loading, setLoading] = useState(true);
  const [savingSector, setSavingSector] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);

  const [sectors, setSectors] = useState<Sector[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  const [sectorName, setSectorName] = useState("");
  const [sectorDescription, setSectorDescription] = useState("");

  const [activityName, setActivityName] = useState("");
  const [activityDescription, setActivityDescription] = useState("");

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

    const [
      { data: sectorData, error: sectorError },
      { data: activityData, error: activityError },
    ] = await Promise.all([
      client
        .from("project_sectors")
        .select("id, name, description, active")
        .eq("project_id", projectId)
        .order("name", { ascending: true }),

      client
        .from("project_activities")
        .select("id, name, description, active")
        .eq("project_id", projectId)
        .order("name", { ascending: true }),
    ]);

    if (sectorError || activityError) {
      setMessage(
        sectorError?.message ||
          activityError?.message ||
          "No fue posible cargar sectores y actividades."
      );
      setLoading(false);
      return;
    }

    setSectors((sectorData ?? []) as Sector[]);
    setActivities((activityData ?? []) as Activity[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [projectId]);

  async function handleAddSector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess("");

    if (!supabase) return;

    if (!sectorName.trim()) {
      setMessage("Debes indicar el nombre del sector.");
      return;
    }

    setSavingSector(true);

    const { error } = await supabase.rpc("add_project_sector", {
      p_project_id: projectId,
      p_name: sectorName.trim(),
      p_description: sectorDescription.trim() || null,
    });

    setSavingSector(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess("Sector agregado correctamente.");
    setSectorName("");
    setSectorDescription("");
    await loadData();
  }

  async function handleAddActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess("");

    if (!supabase) return;

    if (!activityName.trim()) {
      setMessage("Debes indicar el nombre de la actividad.");
      return;
    }

    setSavingActivity(true);

    const { error } = await supabase.rpc("add_project_activity", {
      p_project_id: projectId,
      p_name: activityName.trim(),
      p_description: activityDescription.trim() || null,
    });

    setSavingActivity(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess("Actividad agregada correctamente.");
    setActivityName("");
    setActivityDescription("");
    await loadData();
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        Cargando sectores y actividades...
      </main>
    );
  }

  const activeSectors = sectors.filter((item) => item.active).length;
  const activeActivities = activities.filter((item) => item.active).length;

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <button onClick={() => router.push("/")}>← Dashboard</button>
        <button
          onClick={() =>
            router.push(`/configuracion/proyecto/${projectId}/activacion`)
          }
        >
          Preparación y activación
        </button>
      </div>

      <section className={styles.hero}>
        <span className={styles.eyebrow}>Configuración operativa</span>
        <h1>Sectores y actividades</h1>
        <p>
          Define la estructura básica del proyecto antes de su activación.
        </p>
      </section>

      <section className={styles.summary}>
        <article>
          <span>Sectores activos</span>
          <strong>{activeSectors}</strong>
          <small>
            {activeSectors > 0
              ? "Requisito de activación cumplido"
              : "Se requiere al menos uno"}
          </small>
        </article>

        <article>
          <span>Actividades activas</span>
          <strong>{activeActivities}</strong>
          <small>
            {activeActivities > 0
              ? "Requisito de activación cumplido"
              : "Se requiere al menos una"}
          </small>
        </article>
      </section>

      {message && <div className={styles.error}>{message}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2>Agregar sector</h2>

          <form className={styles.form} onSubmit={handleAddSector}>
            <label>
              Nombre
              <input
                value={sectorName}
                onChange={(e) => setSectorName(e.target.value)}
                placeholder="Ej. Estanque 190"
              />
            </label>

            <label>
              Descripción
              <textarea
                rows={4}
                value={sectorDescription}
                onChange={(e) => setSectorDescription(e.target.value)}
                placeholder="Descripción opcional del sector"
              />
            </label>

            <button type="submit" disabled={savingSector}>
              {savingSector ? "Agregando..." : "Agregar sector"}
            </button>
          </form>

          <div className={styles.list}>
            {sectors.length === 0 ? (
              <p className={styles.empty}>Aún no hay sectores registrados.</p>
            ) : (
              sectors.map((sector) => (
                <div className={styles.item} key={sector.id}>
                  <div>
                    <strong>{sector.name}</strong>
                    <small>{sector.description || "Sin descripción"}</small>
                  </div>
                  <span className={sector.active ? styles.active : styles.inactive}>
                    {sector.active ? "Activo" : "Inactivo"}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className={styles.card}>
          <h2>Agregar actividad</h2>

          <form className={styles.form} onSubmit={handleAddActivity}>
            <label>
              Nombre
              <input
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                placeholder="Ej. Instalación de tubería"
              />
            </label>

            <label>
              Descripción
              <textarea
                rows={4}
                value={activityDescription}
                onChange={(e) => setActivityDescription(e.target.value)}
                placeholder="Descripción opcional de la actividad"
              />
            </label>

            <button type="submit" disabled={savingActivity}>
              {savingActivity ? "Agregando..." : "Agregar actividad"}
            </button>
          </form>

          <div className={styles.list}>
            {activities.length === 0 ? (
              <p className={styles.empty}>Aún no hay actividades registradas.</p>
            ) : (
              activities.map((activity) => (
                <div className={styles.item} key={activity.id}>
                  <div>
                    <strong>{activity.name}</strong>
                    <small>{activity.description || "Sin descripción"}</small>
                  </div>
                  <span className={activity.active ? styles.active : styles.inactive}>
                    {activity.active ? "Activa" : "Inactiva"}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
