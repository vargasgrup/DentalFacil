"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { BrandLogo } from "@/components/BrandLogo";

export default function LoginPage() {
  const { needsSetup, loading, login, setup } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div style={styles.loadingWrapper}>
        <div style={styles.spinner} />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (needsSetup) {
        await setup(nombre, email, password);
      } else {
        await login(email, password);
      }
      router.replace("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Credenciales incorrectas";
      setError(msg || "Credenciales incorrectas");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoWrapper}>
          <BrandLogo variant="login" priority />
        </div>

        <p style={styles.brandTagline}>
          SISTEMA INTEGRAL DE GESTIÓN CLÍNICA ODONTOLÓGICA
        </p>

        <p style={styles.description}>
          {needsSetup
            ? "Crea tu cuenta administrador para comenzar."
            : "Accede con tu correo y contraseña al panel de M&D Odontología Especializada."}
        </p>

        <form onSubmit={handleSubmit} style={styles.form} autoComplete="off">
          {needsSetup && (
            <div style={styles.fieldGroup}>
              <input
                id="login-nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre completo*"
                required
                autoComplete="off"
                style={styles.input}
                onFocus={(e) => Object.assign(e.target.style, styles.inputFocus)}
                onBlur={(e) => Object.assign(e.target.style, styles.input)}
              />
            </div>
          )}

          <div style={styles.fieldGroup}>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Correo electrónico*"
              required
              autoComplete="off"
              autoFocus
              style={styles.input}
              onFocus={(e) => Object.assign(e.target.style, styles.inputFocus)}
              onBlur={(e) => Object.assign(e.target.style, styles.input)}
            />
          </div>

          <div style={{ ...styles.fieldGroup, position: "relative" }}>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña*"
              required
              autoComplete="new-password"
              style={{ ...styles.input, paddingRight: "2.8rem" }}
              onFocus={(e) =>
                Object.assign(e.target.style, {
                  ...styles.inputFocus,
                  paddingRight: "2.8rem",
                })
              }
              onBlur={(e) =>
                Object.assign(e.target.style, {
                  ...styles.input,
                  paddingRight: "2.8rem",
                })
              }
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={styles.eyeBtn}
              tabIndex={-1}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          {!needsSetup && (
            <div style={styles.forgotWrapper}>
              <button
                type="button"
                style={styles.forgotLink}
                onClick={() =>
                  alert(
                    "Contacta al administrador del sistema para restablecer tu contraseña."
                  )
                }
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          {error && (
            <div style={styles.errorBox}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <button
            id="login-submit"
            type="submit"
            disabled={busy}
            style={
              busy
                ? { ...styles.submitBtn, ...styles.submitBtnDisabled }
                : styles.submitBtn
            }
          >
            {busy ? (
              <span style={styles.btnContent}>
                <span style={styles.btnSpinner} />
                Procesando...
              </span>
            ) : needsSetup ? (
              "Crear cuenta"
            ) : (
              "Iniciar sesión"
            )}
          </button>
        </form>
      </div>

      <footer style={styles.footer}>
        <p>© 2026 M&D Odontología Especializada · Todos los derechos reservados.</p>
        <button
          type="button"
          style={styles.footerLink}
          onClick={() =>
            alert(
              "M&D Odontología Especializada v1.0.0 — Sistema de Gestión Clínica Odontológica"
            )
          }
        >
          Acerca de
        </button>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#f0f2f5",
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    padding: "1rem",
  },
  card: {
    width: "100%",
    maxWidth: "440px",
    background: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
    padding: "2rem 2rem 2rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  logoWrapper: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    marginBottom: "0.85rem",
    borderRadius: "10px",
    overflow: "hidden",
    background: "transparent",
  },
  brandTagline: {
    fontSize: "0.62rem",
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "#64748b",
    textTransform: "uppercase",
    textAlign: "center",
    margin: 0,
  },
  description: {
    fontSize: "0.875rem",
    color: "#475569",
    textAlign: "center",
    margin: "0.75rem 0 1.5rem",
    lineHeight: 1.5,
  },
  form: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "0.875rem",
  },
  fieldGroup: {
    width: "100%",
  },
  input: {
    width: "100%",
    padding: "0.7rem 0.875rem",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    fontSize: "0.875rem",
    color: "#1e293b",
    background: "#fff",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    boxSizing: "border-box",
  } as React.CSSProperties,
  inputFocus: {
    width: "100%",
    padding: "0.7rem 0.875rem",
    border: "1px solid #3b82f6",
    borderRadius: "8px",
    fontSize: "0.875rem",
    color: "#1e293b",
    background: "#fff",
    outline: "none",
    boxShadow: "0 0 0 3px rgba(59,130,246,0.12)",
    boxSizing: "border-box",
  } as React.CSSProperties,
  eyeBtn: {
    position: "absolute",
    right: "0.75rem",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "0.25rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  forgotWrapper: {
    textAlign: "right",
    marginTop: "-0.25rem",
  },
  forgotLink: {
    background: "none",
    border: "none",
    color: "#3b82f6",
    fontSize: "0.82rem",
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.6rem 0.875rem",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "6px",
    color: "#dc2626",
    fontSize: "0.8rem",
  },
  submitBtn: {
    width: "100%",
    padding: "0.78rem",
    background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.2s, transform 0.1s",
    marginTop: "0.25rem",
    letterSpacing: "0.01em",
  },
  submitBtnDisabled: {
    opacity: 0.65,
    cursor: "not-allowed",
  },
  btnContent: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
  },
  btnSpinner: {
    width: "14px",
    height: "14px",
    border: "2px solid rgba(255,255,255,0.4)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    display: "inline-block",
  },
  footer: {
    marginTop: "1.5rem",
    textAlign: "center",
    color: "#94a3b8",
    fontSize: "0.78rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.25rem",
  },
  footerLink: {
    background: "none",
    border: "none",
    color: "#3b82f6",
    fontSize: "0.78rem",
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  loadingWrapper: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f0f2f5",
  },
  spinner: {
    width: "36px",
    height: "36px",
    border: "3px solid #e2e8f0",
    borderTopColor: "#3b82f6",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
};
