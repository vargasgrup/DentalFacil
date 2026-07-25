"use client";

import {
  InputHTMLAttributes,
  ReactNode,
  forwardRef,
  useState,
} from "react";
import { Eye, EyeOff } from "lucide-react";

interface LoginFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  error?: boolean;
  revealPassword?: boolean;
}

/**
 * Premium login control — icon leading, tall hit target, soft border.
 * Scoped to auth; does not replace the shared app Input.
 */
export const LoginField = forwardRef<HTMLInputElement, LoginFieldProps>(
  (
    {
      icon,
      error,
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

    return (
      <div className="relative">
        {icon ? (
          <span
            className="pointer-events-none absolute inset-y-0 left-0 z-[1] flex w-11 items-center justify-center text-slate-400"
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
        <input
          ref={ref}
          {...props}
          type={inputType}
          className={[
            "login-field w-full rounded-[12px] border bg-white py-3.5 text-[0.9375rem] text-slate-800",
            "placeholder:text-slate-400 transition-[border-color,box-shadow,background-color] duration-200",
            "focus:outline-none focus:ring-2 focus:ring-[#55BBF9]/35",
            icon ? "pl-11" : "pl-4",
            showToggle ? "pr-11" : "pr-4",
            error
              ? "border-danger-400 focus:border-danger-500 focus:ring-danger-500/30"
              : "border-slate-200 hover:border-slate-300 focus:border-[#55BBF9]",
            className,
          ].join(" ")}
        />
        {showToggle ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
    );
  }
);
LoginField.displayName = "LoginField";
