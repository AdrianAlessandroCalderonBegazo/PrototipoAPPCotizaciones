import type { CSSProperties } from "react";

/** Ícono de Material Symbols Rounded (como en el diseño). */
export function Icono({ n, t = 20, relleno = false, className = "", style }: { n: string; t?: number; relleno?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span aria-hidden className={`icono ${className}`} style={{ fontSize: t, fontVariationSettings: `'FILL' ${relleno ? 1 : 0}`, ...style }}>
      {n}
    </span>
  );
}
