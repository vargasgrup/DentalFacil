"use client";

import { InputHTMLAttributes, ReactNode, forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
  success?: boolean;
  /** Mostrar icono ojo para revelar contraseña (default: true si type=password) */
  revealPassword?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      trailing,
      success,
      className = "",
      type = "text",
      revealPassword,
      ...props
    },
    ref
  ) => {
    const [visible, setVisible] = useState(false);
    const isPassword = type === "password";
    const showToggle = isPassword && (revealPassword ?? true);
    const inputType = showToggle && visible ? "text" : type;
    const rightPad = showToggle || trailing ? "pr-10" : "";

    return (
      <label className="block">
        {label && (
          <span className="mb-1 block text-label text-slate-700">{label}</span>
        )}
        <div className="relative">
          <input
            ref={ref}
            {...props}
            type={inputType}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm transition-smooth focus:outline-none focus:ring-1 ${
              error
                ? "border-danger-500 focus:border-danger-500 focus:ring-danger-500"
                : success
                  ? "border-success-600 focus:border-success-600 focus:ring-success-600"
                  : "border-slate-300 focus:border-brand-600 focus:ring-brand-600"
            } ${rightPad} ${className}`}
          />
          {showToggle ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setVisible((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition-smooth hover:text-slate-700"
              aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
              title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          ) : trailing ? (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-help tabular-nums text-slate-500">
              {trailing}
            </span>
          ) : null}
        </div>
        {error ? (
          <span className="mt-1 block text-help text-danger-600">{error}</span>
        ) : hint ? (
          <span className="mt-1 block text-help text-slate-500">{hint}</span>
        ) : null}
      </label>
    );
  }
);
Input.displayName = "Input";
