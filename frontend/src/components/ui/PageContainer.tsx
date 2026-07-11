import { HTMLAttributes, ReactNode } from "react";

type PageWidth = "full" | "wide" | "default" | "narrow";

const widths: Record<PageWidth, string> = {
  /** ~1280px — dashboards, agenda, pacientes, caja */
  full: "max-w-7xl",
  wide: "max-w-6xl",
  /** ~896px — configuración */
  default: "max-w-4xl",
  /** ~800px — reportes */
  narrow: "max-w-[50rem]",
};

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  width?: PageWidth;
}

/**
 * Centers module content horizontally and caps width so wide screens
 * don't leave a left-stuck column with empty space on the right.
 */
export function PageContainer({
  children,
  width = "full",
  className = "",
  ...props
}: PageContainerProps) {
  return (
    <div
      className={`mx-auto w-full ${widths[width]} space-y-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
