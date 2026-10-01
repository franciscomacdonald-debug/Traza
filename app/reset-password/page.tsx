"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./reset-password.module.css";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("Verificando enlace de recuperación...");

  useEffect(() => {
    const client = supabase;

    if (!client) {
      setMessage("Falta configurar la conexión con Supabase.");
      return;
    }

    let mounted = true;

    async function checkSession() {
      const { data, error } = await client.auth.getSession();

      if (!mounted) return;

      if (error) {
        setMessage("No fue posible validar el enlace de recuperación.");
        return;
      }

      if (!data.session) {
        setMessage(
          "El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo."
        );
        return;
      }

      setReady(true);
      setMessage("");
    }

    checkSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
        setMessage("");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const client = supabase;

    if (!client) {
      setMessage("Falta configurar la conexión con Supabase.");
      return;
    }

    if (password.length < 8) {
      setMessage("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    const { error } = await client.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      setMessage("No fue posible actualizar la contraseña. Intenta nuevamente.");
      return;
    }

    setSuccess(true);
    setMessage("");
  }

  async function goToLogin() {
    const client = supabase;

    if (client) {
      await client.auth.signOut();
    }

    router.replace("/login");
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>T</div>
          <div>
            <strong>TRAZA</strong>
            <span>Recuperación de acceso</span>
          </div>
        </div>

        {!success ? (
          <>
            <span className={styles.eyebrow}>Seguridad de cuenta</span>
            <h1>Nueva contraseña</h1>
            <p className={styles.subtitle}>
              Define una nueva contraseña para volver a ingresar a TRAZA.
            </p>

            {message && <div className={styles.message}>{message}</div>}

            {ready && (
              <form onSubmit={handleSubmit} className={styles.form}>
                <label>
                  Nueva contraseña
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>

                <label>
                  Confirmar contraseña
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repite la contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </label>

                <button type="submit" disabled={loading}>
                  {loading ? "Actualizando..." : "Guardar nueva contraseña"}
                </button>
              </form>
            )}

            {!ready && (
              <button className={styles.secondary} onClick={goToLogin}>
                Volver al inicio de sesión
              </button>
            )}
          </>
        ) : (
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✓</div>
            <h1>Contraseña actualizada</h1>
            <p>Tu nueva contraseña quedó guardada correctamente.</p>
            <button onClick={goToLogin}>Volver a iniciar sesión</button>
          </div>
        )}
      </section>
    </main>
  );
}
