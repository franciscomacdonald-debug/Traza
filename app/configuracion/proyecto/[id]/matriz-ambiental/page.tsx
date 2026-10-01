"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./matriz-ambiental.module.css";

type Requirement = {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  requirement_type:
    | "mandatory"
    | "contractual"
    | "commitment"
    | "technical_control"
    | "good_practice";
  status: "draft" | "active" | "under_review" | "inactive" | "archived";
  inspection_instruction: string | null;
  expected_evidence: string | null;
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
  can_generate_finding: boolean;
  mandatory_basis: boolean;
};

const typeOptions = [
  { value: "mandatory", label: "Obligatorio" },
  { value: "contractual", label: "Contractual" },
  { value: "commitment", label: "Compromiso" },
  { value: "technical_control", label: "Control técnico" },
  { value: "good_practice", label: "Buena práctica" },
];

const statusOptions = [
  { value: "draft", label: "Borrador" },
  { value: "active", label: "Activo" },
];

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

function labelForType(value: Requirement["requirement_type"]) {
  return typeOptions.find((item) => item.value === value)?.label ?? value;
}

function labelForFrequency(value: Requirement["frequency"]) {
  if (!value) return "Sin frecuencia";
  return frequencyOptions.find((item) => item.value === value)?.label ?? value;
}

export default function MatrizAmbientalPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requirementType, setRequirementType] =
    useState<Requirement["requirement_type"]>("technical_control");
  const [status, setStatus] =
    useState<"draft" | "active">("active");
  const [inspectionInstruction, setInspectionInstruction] = useState("");
  const [expectedEvidence, setExpectedEvidence] = useState("");
  const [frequency, setFrequency] = useState("");
  const [frequencyDays, setFrequencyDays] = useState("");
  const [canGenerateFinding, setCanGenerateFinding] = useState(true);
  const [mandatoryBasis, setMandatoryBasis] = useState(false);

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

    const { data, error } = await client
      .from("environmental_requirements")
      .select(
        "id, code, title, description, requirement_type, status, inspection_instruction, expected_evidence, frequency, frequency_days, can_generate_finding, mandatory_basis"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setRequirements((data ?? []) as Requirement[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [projectId]);

  const activeCount = useMemo(
    () => requirements.filter((item) => item.status === "active").length,
    [requirements]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess("");

    if (!supabase) return;

    if (!title.trim()) {
      setMessage("Debes indicar el título del requisito.");
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

    setSaving(true);

    const { error } = await supabase.rpc("add_environmental_requirement", {
      p_project_id: projectId,
      p_code: code.trim() || null,
      p_title: title.trim(),
      p_description: description.trim() || null,
      p_requirement_type: requirementType,
      p_status: status,
      p_inspection_instruction: inspectionInstruction.trim() || null,
      p_expected_evidence: expectedEvidence.trim() || null,
      p_frequency: frequency || null,
      p_frequency_days: parsedFrequencyDays,
      p_can_generate_finding: canGenerateFinding,
      p_mandatory_basis: mandatoryBasis,
    });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess("Requisito ambiental agregado correctamente.");
    setCode("");
    setTitle("");
    setDescription("");
    setRequirementType("technical_control");
    setStatus("active");
    setInspectionInstruction("");
    setExpectedEvidence("");
    setFrequency("");
    setFrequencyDays("");
    setCanGenerateFinding(true);
    setMandatoryBasis(false);

    await loadData();
  }

  if (loading) {
    return <main className={styles.loading}>Cargando matriz ambiental...</main>;
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
        <h1>Matriz ambiental</h1>
        <p>
          Registra requisitos, instrucciones de inspección, evidencia esperada
          y frecuencia de control.
        </p>
      </section>

      <section className={styles.summary}>
        <article>
          <span>Requisitos totales</span>
          <strong>{requirements.length}</strong>
        </article>

        <article>
          <span>Requisitos activos</span>
          <strong>{activeCount}</strong>
          <small>
            {activeCount > 0
              ? "Requisito de activación cumplido"
              : "Se requiere al menos uno"}
          </small>
        </article>
      </section>

      {message && <div className={styles.error}>{message}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2>Nuevo requisito</h2>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.twoCols}>
              <label>
                Código
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Ej. MA-001"
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
                  {statusOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Título
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Manejo de residuos peligrosos"
              />
            </label>

            <label>
              Descripción
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción general del requisito"
              />
            </label>

            <label>
              Tipo de requisito
              <select
                value={requirementType}
                onChange={(e) =>
                  setRequirementType(
                    e.target.value as Requirement["requirement_type"]
                  )
                }
              >
                {typeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Instrucción de inspección
              <textarea
                rows={3}
                value={inspectionInstruction}
                onChange={(e) => setInspectionInstruction(e.target.value)}
                placeholder="Qué debe revisar el inspector"
              />
            </label>

            <label>
              Evidencia esperada
              <textarea
                rows={3}
                value={expectedEvidence}
                onChange={(e) => setExpectedEvidence(e.target.value)}
                placeholder="Fotografías, certificados, registros, etc."
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

            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={canGenerateFinding}
                onChange={(e) => setCanGenerateFinding(e.target.checked)}
              />
              Puede generar hallazgo
            </label>

            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={mandatoryBasis}
                onChange={(e) => setMandatoryBasis(e.target.checked)}
              />
              Tiene fundamento obligatorio
            </label>

            <button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Agregar requisito"}
            </button>
          </form>
        </article>

        <article className={styles.card}>
          <h2>Requisitos registrados</h2>

          <div className={styles.list}>
            {requirements.length === 0 ? (
              <p className={styles.empty}>
                Aún no hay requisitos ambientales registrados.
              </p>
            ) : (
              requirements.map((item) => (
                <div className={styles.item} key={item.id}>
                  <div className={styles.itemHeader}>
                    <div>
                      <strong>
                        {item.code ? `${item.code} · ` : ""}
                        {item.title}
                      </strong>
                      <span>{labelForType(item.requirement_type)}</span>
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

                  <p>{item.description || "Sin descripción"}</p>

                  <div className={styles.meta}>
                    <span>{labelForFrequency(item.frequency)}</span>
                    {item.frequency_days && (
                      <span>Cada {item.frequency_days} días</span>
                    )}
                    {item.can_generate_finding && (
                      <span>Puede generar hallazgo</span>
                    )}
                    {item.mandatory_basis && (
                      <span>Fundamento obligatorio</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
