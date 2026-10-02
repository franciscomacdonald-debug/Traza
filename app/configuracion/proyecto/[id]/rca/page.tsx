"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./rca.module.css";

type ProjectRca = {
  id: string;
  project_id: string;
  has_rca: boolean;
  source_id: string | null;
  rca_number: string | null;
  rca_date: string | null;
  notes: string | null;
};

type Commitment = {
  id: string;
  project_id: string;
  project_rca_id: string;
  code: string | null;
  environmental_component: string | null;
  project_phase: string | null;
  title: string;
  requirement_text: string;
  verification_method: string | null;
  expected_evidence: string | null;
  responsible_description: string | null;
  frequency:
    | "continuous"
    | "daily"
    | "weekly"
    | "monthly"
    | "quarterly"
    | "annual"
    | "before_activity"
    | "during_activity"
    | "after_activity"
    | "event_based"
    | "one_time"
    | "custom"
    | null;
  frequency_days: number | null;
  next_due_date: string | null;
  status: "draft" | "active" | "under_review" | "inactive" | "archived";
};

const frequencyOptions = [
  { value: "", label: "Sin frecuencia definida" },
  { value: "continuous", label: "Continua" },
  { value: "daily", label: "Diaria" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensual" },
  { value: "quarterly", label: "Trimestral" },
  { value: "annual", label: "Anual" },
  { value: "before_activity", label: "Antes de la actividad" },
  { value: "during_activity", label: "Durante la actividad" },
  { value: "after_activity", label: "Después de la actividad" },
  { value: "event_based", label: "Por evento" },
  { value: "one_time", label: "Una vez" },
  { value: "custom", label: "Personalizada" },
];

function frequencyLabel(value: Commitment["frequency"]) {
  if (!value) return "Sin frecuencia";
  return frequencyOptions.find((item) => item.value === value)?.label ?? value;
}

export default function RcaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [loading, setLoading] = useState(true);
  const [savingRca, setSavingRca] = useState(false);
  const [savingCommitment, setSavingCommitment] = useState(false);

  const [rca, setRca] = useState<ProjectRca | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);

  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [hasRca, setHasRca] = useState(true);
  const [rcaNumber, setRcaNumber] = useState("");
  const [rcaDate, setRcaDate] = useState("");
  const [rcaNotes, setRcaNotes] = useState("");

  const [code, setCode] = useState("");
  const [environmentalComponent, setEnvironmentalComponent] = useState("");
  const [projectPhase, setProjectPhase] = useState("");
  const [title, setTitle] = useState("");
  const [requirementText, setRequirementText] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("");
  const [expectedEvidence, setExpectedEvidence] = useState("");
  const [responsibleDescription, setResponsibleDescription] = useState("");
  const [frequency, setFrequency] = useState("");
  const [frequencyDays, setFrequencyDays] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [status, setStatus] = useState<"draft" | "active">("active");

  const activeCommitments = useMemo(
    () => commitments.filter((item) => item.status === "active").length,
    [commitments]
  );

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

    const [{ data: rcaData, error: rcaError }, { data: commitmentData, error: commitmentError }] =
      await Promise.all([
        client
          .from("project_rca")
          .select("id, project_id, has_rca, source_id, rca_number, rca_date, notes")
          .eq("project_id", projectId)
          .maybeSingle(),
        client
          .from("rca_commitments")
          .select(
            "id, project_id, project_rca_id, code, environmental_component, project_phase, title, requirement_text, verification_method, expected_evidence, responsible_description, frequency, frequency_days, next_due_date, status"
          )
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
      ]);

    if (rcaError) {
      setMessage(rcaError.message);
      setLoading(false);
      return;
    }

    if (commitmentError) {
      setMessage(commitmentError.message);
      setLoading(false);
      return;
    }

    const loadedRca = (rcaData ?? null) as ProjectRca | null;
    setRca(loadedRca);
    setCommitments((commitmentData ?? []) as Commitment[]);

    if (loadedRca) {
      setHasRca(loadedRca.has_rca);
      setRcaNumber(loadedRca.rca_number ?? "");
      setRcaDate(loadedRca.rca_date ?? "");
      setRcaNotes(loadedRca.notes ?? "");
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [projectId]);

  async function saveRca(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess("");

    if (!supabase) return;

    setSavingRca(true);

    const { error } = await supabase.rpc("configure_project_rca", {
      p_project_id: projectId,
      p_has_rca: hasRca,
      p_rca_number: hasRca ? rcaNumber.trim() || null : null,
      p_rca_date: hasRca ? rcaDate || null : null,
      p_notes: rcaNotes.trim() || null,
      p_source_id: null,
    });

    setSavingRca(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess("Configuración RCA guardada correctamente.");
    await loadData();
  }

  async function addCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess("");

    if (!supabase) return;

    if (!rca?.has_rca) {
      setMessage("Primero debes guardar la configuración indicando que el proyecto tiene RCA.");
      return;
    }

    if (!title.trim() || !requirementText.trim()) {
      setMessage("Debes completar el título y el texto del compromiso.");
      return;
    }

    const parsedFrequencyDays =
      frequencyDays.trim() === "" ? null : Number(frequencyDays);

    if (
      parsedFrequencyDays !== null &&
      (!Number.isInteger(parsedFrequencyDays) || parsedFrequencyDays <= 0)
    ) {
      setMessage("Los días de frecuencia deben ser un entero mayor que cero.");
      return;
    }

    setSavingCommitment(true);

    const { error } = await supabase.rpc("add_rca_commitment", {
      p_project_id: projectId,
      p_code: code.trim() || null,
      p_environmental_component: environmentalComponent.trim() || null,
      p_project_phase: projectPhase.trim() || null,
      p_title: title.trim(),
      p_requirement_text: requirementText.trim(),
      p_verification_method: verificationMethod.trim() || null,
      p_expected_evidence: expectedEvidence.trim() || null,
      p_responsible_description: responsibleDescription.trim() || null,
      p_frequency: frequency || null,
      p_frequency_days: parsedFrequencyDays,
      p_next_due_date: nextDueDate || null,
      p_status: status,
    });

    setSavingCommitment(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess("Compromiso RCA agregado correctamente.");

    setCode("");
    setEnvironmentalComponent("");
    setProjectPhase("");
    setTitle("");
    setRequirementText("");
    setVerificationMethod("");
    setExpectedEvidence("");
    setResponsibleDescription("");
    setFrequency("");
    setFrequencyDays("");
    setNextDueDate("");
    setStatus("active");

    await loadData();
  }

  if (loading) {
    return <main className={styles.loading}>Cargando RCA...</main>;
  }

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
        <span className={styles.eyebrow}>Cumplimiento ambiental</span>
        <h1>RCA y compromisos</h1>
        <p>
          Configura la Resolución de Calificación Ambiental del proyecto y registra
          sus compromisos de seguimiento.
        </p>
      </section>

      <section className={styles.summary}>
        <article>
          <span>RCA configurada</span>
          <strong>{rca?.has_rca ? "Sí" : "No"}</strong>
          <small>
            {rca?.has_rca
              ? rca.rca_number || "Sin número informado"
              : "No registrada como aplicable"}
          </small>
        </article>

        <article>
          <span>Compromisos</span>
          <strong>{commitments.length}</strong>
          <small>{activeCommitments} activos</small>
        </article>
      </section>

      {message && <div className={styles.error}>{message}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <section className={styles.card}>
        <h2>Configuración RCA</h2>

        <form className={styles.form} onSubmit={saveRca}>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={hasRca}
              onChange={(e) => setHasRca(e.target.checked)}
            />
            Este proyecto tiene RCA
          </label>

          {hasRca && (
            <div className={styles.twoCols}>
              <label>
                Número RCA
                <input
                  value={rcaNumber}
                  onChange={(e) => setRcaNumber(e.target.value)}
                  placeholder="Ej. RCA N° 123/2026"
                />
              </label>

              <label>
                Fecha RCA
                <input
                  type="date"
                  value={rcaDate}
                  onChange={(e) => setRcaDate(e.target.value)}
                />
              </label>
            </div>
          )}

          <label>
            Notas
            <textarea
              rows={3}
              value={rcaNotes}
              onChange={(e) => setRcaNotes(e.target.value)}
              placeholder="Antecedentes o comentarios relevantes"
            />
          </label>

          <button type="submit" disabled={savingRca}>
            {savingRca ? "Guardando..." : "Guardar RCA"}
          </button>
        </form>
      </section>

      {rca?.has_rca && (
        <section className={styles.grid}>
          <article className={styles.card}>
            <h2>Nuevo compromiso RCA</h2>

            <form className={styles.form} onSubmit={addCommitment}>
              <div className={styles.twoCols}>
                <label>
                  Código
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Ej. RCA-001"
                  />
                </label>

                <label>
                  Estado inicial
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as "draft" | "active")
                    }
                  >
                    <option value="active">Activo</option>
                    <option value="draft">Borrador</option>
                  </select>
                </label>
              </div>

              <div className={styles.twoCols}>
                <label>
                  Componente ambiental
                  <input
                    value={environmentalComponent}
                    onChange={(e) => setEnvironmentalComponent(e.target.value)}
                    placeholder="Ej. Ruido, agua, residuos"
                  />
                </label>

                <label>
                  Fase del proyecto
                  <input
                    value={projectPhase}
                    onChange={(e) => setProjectPhase(e.target.value)}
                    placeholder="Ej. Construcción"
                  />
                </label>
              </div>

              <label>
                Título
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Nombre breve del compromiso"
                />
              </label>

              <label>
                Texto del compromiso
                <textarea
                  rows={4}
                  value={requirementText}
                  onChange={(e) => setRequirementText(e.target.value)}
                  placeholder="Describe la obligación o compromiso establecido en la RCA"
                />
              </label>

              <label>
                Método de verificación
                <textarea
                  rows={3}
                  value={verificationMethod}
                  onChange={(e) => setVerificationMethod(e.target.value)}
                  placeholder="Cómo se verificará su cumplimiento"
                />
              </label>

              <label>
                Evidencia esperada
                <textarea
                  rows={3}
                  value={expectedEvidence}
                  onChange={(e) => setExpectedEvidence(e.target.value)}
                  placeholder="Fotografías, certificados, registros, informes, etc."
                />
              </label>

              <label>
                Responsable
                <input
                  value={responsibleDescription}
                  onChange={(e) => setResponsibleDescription(e.target.value)}
                  placeholder="Ej. Encargado Ambiental del Contratista"
                />
              </label>

              <div className={styles.twoCols}>
                <label>
                  Frecuencia
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                  >
                    {frequencyOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Días de frecuencia
                  <input
                    type="number"
                    min="1"
                    value={frequencyDays}
                    onChange={(e) => setFrequencyDays(e.target.value)}
                    placeholder="Opcional"
                  />
                </label>
              </div>

              <label>
                Próximo vencimiento
                <input
                  type="date"
                  value={nextDueDate}
                  onChange={(e) => setNextDueDate(e.target.value)}
                />
              </label>

              <button type="submit" disabled={savingCommitment}>
                {savingCommitment ? "Guardando..." : "Agregar compromiso"}
              </button>
            </form>
          </article>

          <article className={styles.card}>
            <h2>Compromisos registrados</h2>

            <div className={styles.list}>
              {commitments.length === 0 ? (
                <p className={styles.empty}>
                  Aún no hay compromisos RCA registrados.
                </p>
              ) : (
                commitments.map((item) => (
                  <div className={styles.item} key={item.id}>
                    <div className={styles.itemHeader}>
                      <div>
                        <strong>
                          {item.code ? `${item.code} · ` : ""}
                          {item.title}
                        </strong>
                        <span>
                          {[item.environmental_component, item.project_phase]
                            .filter(Boolean)
                            .join(" · ") || "Sin clasificación"}
                        </span>
                      </div>

                      <b
                        className={
                          item.status === "active"
                            ? styles.active
                            : styles.draft
                        }
                      >
                        {item.status === "active" ? "Activo" : "Borrador"}
                      </b>
                    </div>

                    <p>{item.requirement_text}</p>

                    <div className={styles.meta}>
                      <span>{frequencyLabel(item.frequency)}</span>
                      {item.frequency_days && (
                        <span>Cada {item.frequency_days} días</span>
                      )}
                      {item.next_due_date && (
                        <span>Vence {item.next_due_date}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
