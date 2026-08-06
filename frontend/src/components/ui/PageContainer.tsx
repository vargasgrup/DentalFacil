import { HTMLAttributes, ReactNode } from "react";

type PageWidth = "full" | "wide" | "default" | "narrow";

/** scroll = page body scrolls (default). split = shell-like: pin chrome, own scroll region. */
type PageLayout = "scroll" | "split";

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
  /**
   * - scroll (default): this container is the vertical scrollport under topbar.
   * - split: fills main height; pin headers/tabs with shrink-0 and put
   *   overflow-y-auto on an inner region (ficha clínica).
   */
  layout?: PageLayout;
}

/**
 * Centers module content horizontally and caps width so wide screens
 * don't leave a left-stuck column with empty space on the right.
 *
 * Scroll lives here (not on AppShell `main`) so pages can pin secondary
 * chrome outside the scrollport — same contract as the topbar.
 */
export function PageContainer({
  children,
  width = "full",
  layout = "scroll",
  className = "",
  ...props
}: PageContainerProps) {
  if (layout === "split") {
    return (
      <div
        className={`mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden ${widths[width]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={`app-page-scroll mx-auto min-h-0 w-full flex-1 overflow-y-auto overscroll-contain ${widths[width]} space-y-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
