"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { pacienteFichaPath } from "@/lib/pacienteRoutes";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  patientId: string;
  children: ReactNode;
};

/**
 * Native anchor (full page load) to a patient ficha.
 * Avoid Next `<Link>` soft-nav: static export only prebuilds `pacientes/_`.
 */
export function PacienteFichaLink({
  patientId,
  children,
  ...rest
}: Props) {
  return (
    <a href={pacienteFichaPath(patientId)} {...rest}>
      {children}
    </a>
  );
}
