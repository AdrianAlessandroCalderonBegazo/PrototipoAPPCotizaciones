import { Icono } from "../componentes/Icono";
import type { EntradaMenu } from "../modulos";

const QUE_TRAE: Partial<Record<EntradaMenu["clave"], string[]>> = {
  proyectos: ["Crear proyectos con nombre y presupuesto", "Estados activo, pausado (con causa) y finalizado, con historial", "Gastos que llegan desde la caja chica, con su comprobante", "Galería de fotos por proyecto"],
  contabilidad: ["Movimientos de la cuenta principal con saldo y flujo mensual", "Resumen de la caja chica (solo lectura)", "Enviar fondos a la caja chica en una sola operación", "Exportar a Excel y PDF"],
  cotizacion: ["Catálogo de productos migrado desde el Cotizador", "Importar CSV e imágenes", "Kits de venta editables", "Cotizaciones con IGV, PDF con el logo y envío por WhatsApp"],
  cotizador_ia: ["Cotizar por texto o por voz con IA local (qwen3:4b)", "Solo productos y precios reales de la base", "Historial compartido y contexto editable"],
  comparador: ["Proveedores y sus listas de precios (Excel/CSV)", "Historial de precios sin sobrescribir", "Equivalencias y tabla comparativa en soles"],
  facturacion: ["Boletas y facturas con IGV calculado en el servidor", "Extensión de Chrome que rellena SUNAT SOL", "Nunca emite sola: la emisión la haces tú"],
  asistente_ia: ["Consultas e informes sobre el ERP", "Solo con los datos que tu rol puede ver", "Los cálculos los hace el servidor"],
  activos: ["Panel con datos de Victron VRM", "Producción solar, baterías, consumo y alarmas", "Acceso directo al portal VRM"],
  inicio: ["Saldos, ingresos y egresos del mes", "Proyectos activos con su presupuesto", "Alertas y búsqueda global"],
};

/** Pantalla de un módulo que todavía no se construye (según el plan por fases). */
export function Pendiente({ modulo }: { modulo: EntradaMenu }) {
  const lista = QUE_TRAE[modulo.clave] ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="sobretitulo">Módulo · Fase {modulo.fase}</div>
        <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">{modulo.nombre}</h1>
      </div>
      <div className="tarjeta flex flex-col items-start gap-4 p-6 sm:flex-row">
        <span className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl" style={{ background: modulo.ia ? "var(--ai-soft)" : "var(--primary-soft)", color: modulo.ia ? "var(--ai)" : "var(--primary-ink)" }}>
          <Icono n={modulo.icono} t={30} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-bold">Este módulo se construye en la fase {modulo.fase}</div>
          <p className="mt-1 text-[13.5px] text-text-2">Ya tienes el acceso preparado según tu rol. Cuando esté listo aparecerá aquí, sin instalar nada.</p>
          {lista.length ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {lista.map((t) => (
                <li key={t} className="flex items-start gap-2 text-[13.5px]">
                  <Icono n="check_circle" t={18} className="mt-px text-primary" />
                  {t}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SinAcceso() {
  return (
    <div className="tarjeta flex items-center gap-4 p-6">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-warning-soft text-warning">
        <Icono n="lock" t={26} />
      </span>
      <div>
        <div className="text-[16px] font-bold">Tu rol no tiene acceso a esta sección</div>
        <div className="text-[13.5px] text-text-2">Si lo necesitas, pídele a un administrador que lo active en Configuración › Matriz de permisos.</div>
      </div>
    </div>
  );
}
