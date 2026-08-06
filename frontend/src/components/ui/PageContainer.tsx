import { HTMLAttributes, ReactNode } from "react";

type PageWidth = "full" | "wide" | "default" | "narrow";

const widths: Record<PageWidth, string> = {
  /** Lista / dashboard / agenda / caja — tope ultrawide */
  full: "max-w-5xl xl:max-w-7xl 2xl:max-w-[90rem] min-[1921px]:max-w-[100rem]",
  wide: "max-w-6xl min-[1921px]:max-w-7xl",
  /** Configuración */
  default: "max-w-4xl",
  /** Reportes */
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
