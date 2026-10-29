// Colores del sistema de diseño ICR ERP: todos salen de variables CSS (src/index.css), así el modo oscuro es solo
// cambiar data-theme en <html>.
const v = (n) => `var(--${n})`;
const nombres = [
  "bg", "surface", "surface-2", "track", "border", "border-strong", "text", "text-2", "text-3",
  "primary", "primary-btn", "primary-ink", "primary-soft", "primary-line", "navy", "solar", "solar-soft",
  "success", "success-soft", "warning", "warning-soft", "danger", "danger-soft", "neutral", "neutral-soft",
  "ai", "ai-soft", "ai-line",
];

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: Object.fromEntries(nombres.map((n) => [n, v(n)])),
      fontFamily: { sans: ["Manrope", "system-ui", "sans-serif"], mono: ["JetBrains Mono", "ui-monospace", "monospace"] },
      boxShadow: { menu: "var(--shadow)" },
      borderRadius: { xl2: "18px" },
    },
  },
  plugins: [],
};
