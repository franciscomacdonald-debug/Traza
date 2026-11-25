"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./configuracion.module.css";

type CreatedProject = {
  id: string;
  name: string;
  project_code: string | null;
  status: string;
};

export default function ConfiguracionPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [message, setMessage] = useState("");
  const [createdProject, setCreatedProject] = useState<CreatedProject | null>(null);

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    const client = supabase!;

    client.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }

      setCheckingSession(false);
    });
  }, [router]);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setCreatedProject(null);

    if (!supabase) {
      setMessage("Falta configurar la conexión con Supabase.");
      return;
    }

    const projectName = name.trim();
    const projectCode = code.trim();

    if (!projectName) {
      setMessage("Debes indicar el nombre del proyecto.");
      return;
    }

    setLoading(true);

    const { data: projectId, error: rpcError } = await supabase.rpc(
      "create_traza_project",
      {
        p_name: projectName,
        p_code: projectCode || null,
      }
    );

    if (rpcError) {
      setLoading(false);
      setMessage(rpcError.message);
      return;
    }

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("id, name, project_code, status")
      .eq("id", projectId)
      .single();

    setLoading(false);

    if (projectError) {
      setMessage("El proyecto fue creado, pero no fue posible cargar sus datos.");
      return;
    }

    setCreatedProject(projectData as CreatedProject);
    setName("");
    setCode("");
  }

  if (checkingSession) {
    return <main className={styles.loading}>Verificando sesión de TRAZA...</main>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <button onClick={() => router.push("/")}>← Volver al Dashboard</button>
        <span>TRAZA v1</span>
      </div>

      <section className={styles.hero}>
        <span className={styles.eyebrow}>Configuración</span>
        <h1>Crear proyecto</h1>
        <p>
          Crea el proyecto en estado borrador. Después podrás completar su
          configuración ambiental y activarlo.
        </p>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2>Datos iniciales</h2>

          <form className={styles.form} onSubmit={handleCreateProject}>
            <label>
              Nombre del proyecto
              <input
                type="text"
                placeholder="Ej. Cuncumén Etapa 3"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label>
              Código del proyecto
              <input
                type="text"
                placeholder="Ej. AIF-CSRC-03"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>

            {message && <div className={styles.error}>{message}</div>}

            <button type="submit" disabled={loading}>
              {loading ? "Creando proyecto..." : "Crear proyecto"}
            </button>
          </form>
        </article>

        <article className={styles.card}>
          <h2>Flujo de alta</h2>

          <div className={styles.steps}>
            <div>
              <span>1</span>
              <div>
                <strong>Crear</strong>
                <small>Nombre, código y responsable inicial</small>
              </div>
            </div>

            <div>
              <span>2</span>
              <div>
                <strong>Configurar</strong>
                <small>Contrato, ubicación, RCA e informes</small>
              </div>
            </div>

            <div>
              <span>3</span>
              <div>
                <strong>Activar</strong>
                <small>Habilitar gestión oficial del proyecto</small>
              </div>
            </div>
          </div>
        </article>
      </section>

      {createdProject && (
        <section className={styles.successCard}>
          <div className={styles.successIcon}>✓</div>
          <div>
            <span>Proyecto creado correctamente</span>
            <h2>{createdProject.name}</h2>
            <p>
              Código: <strong>{createdProject.project_code || "Sin código"}</strong>
              {" · "}
              Estado: <strong>{createdProject.status}</strong>
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
