"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [message, setMessage] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/");
      }
    });
  }, [router]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setInfo("");

    if (!supabase) {
      setMessage("Falta configurar la conexión con Supabase.");
      return;
    }

    if (!email.trim() || !password) {
      setMessage("Ingresa tu correo y contraseña.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setMessage("No fue posible iniciar sesión. Revisa tu correo y contraseña.");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function handleRecovery() {
    setMessage("");
    setInfo("");

    if (!supabase) {
      setMessage("Falta configurar la conexión con Supabase.");
      return;
    }

    if (!email.trim()) {
      setMessage("Escribe primero tu correo electrónico.");
      return;
    }

    setRecovering(true);

    const redirectTo = `${window.location.origin}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    setRecovering(false);

    if (error) {
      setMessage("No fue posible enviar el correo de recuperación.");
      return;
    }

    setInfo("Te enviamos un correo para crear una nueva contraseña.");
  }

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>T</div>
          <div>
            <strong>TRAZA</strong>
            <span>Gestión y trazabilidad de proyectos</span>
          </div>
        </div>

        <div className={styles.brandCopy}>
          <span className={styles.eyebrow}>TRAZA v1</span>
          <h1>Control, evidencia y trazabilidad en un solo lugar.</h1>
          <p>
            Plataforma para proyectos de construcción e infraestructura,
            comenzando por la gestión de Medio Ambiente.
          </p>
        </div>

        <div className={styles.brandFooter}>
          <span>Proyecto → área → control → responsable → evidencia → estado → auditoría</span>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formBox}>
          <div className={styles.mobileBrand}>
            <div className={styles.brandMark}>T</div>
            <strong>TRAZA</strong>
          </div>

          <span className={styles.eyebrow}>Acceso a plataforma</span>
          <h2>Iniciar sesión</h2>
          <p className={styles.subtitle}>
            Ingresa con la cuenta asociada a tu proyecto.
          </p>

          <form onSubmit={handleLogin} className={styles.form}>
            <label>
              Correo electrónico
              <input
                type="email"
                autoComplete="email"
                placeholder="nombre@empresa.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label>
              Contraseña
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {message && <div className={styles.message}>{message}</div>}
            {info && (
              <div style={{
                border: "1px solid #cfe8d6",
                background: "#f3fbf5",
                color: "#2f6b3a",
                borderRadius: 10,
                padding: "11px 12px",
                fontSize: 13
              }}>
                {info}
              </div>
            )}

            <button type="submit" disabled={loading}>
              {loading ? "Ingresando..." : "Ingresar a TRAZA"}
            </button>

            <button
              type="button"
              onClick={handleRecovery}
              disabled={recovering}
              style={{
                background: "white",
                color: "#1f6feb",
                border: "1px solid #d7e1eb"
              }}
            >
              {recovering ? "Enviando..." : "¿Olvidaste tu contraseña?"}
            </button>
          </form>

          <p className={styles.help}>
            El acceso depende de la cuenta registrada y de los permisos definidos en Supabase.
          </p>
        </div>
      </section>
    </main>
  );
}
