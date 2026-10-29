import { Link } from "react-router-dom";
import { api } from "../api";
import { Icono } from "../componentes/Icono";
import { enlaceApp } from "../enlaces";
import { hoyLima, fecha } from "../formato";
import { FASE_ACTUAL, puede } from "../modulos";
import { useSesion } from "../sesion";
import { useDatos } from "../usarDatos";
import { dinero } from "../dinero";
import type { CajaChicaErp, Proyecto, ResumenConta } from "../tipos";
import { BarraAvance, colorAvance, pctTexto } from "./proyectos/comun";

type Resumen = {
  requerimientos: Record<string, number>;
  urgentes: number;
  herramientas: Record<string, number>;
  cotizaciones: { total: number; este_mes: number; monto_mes: number | string };
};

const FASES: [number, string][] = [
  [1, "Base: roles, permisos, auditoría y Configuración"],
  [2, "Proyectos y Contabilidad (envío de fondos, gastos de proyecto desde la caja chica)"],
  [3, "Cotización: catálogo, kits, PDF y WhatsApp"],
  [4, "Inicio completo y búsqueda global"],
  [5, "Facturación SUNAT con extensión de Chrome"],
  [6, "IA: Cotizador IA y Asistente IA"],
  [7, "IA en la app de Finanzas"],
  [8, "Comparador de proveedores"],
  [9, "Activos y control (Victron) y Almacén"],
  [10, "Cierre: pruebas, seguridad y respaldos"],
];

const saludo = () => {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Lima", hour: "numeric", hour12: false }));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
};

const diaSemana = () => new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima", weekday: "long" });

function Indicador({ etiqueta, valor, detalle, icono, a }: { etiqueta: string; valor: string; detalle?: string; icono: string; a?: string }) {
  const cuerpo = (
    <div className="tarjeta flex h-full flex-col gap-1.5 p-4 transition-colors hover:border-primary-line">
      <div className="flex items-center justify-between text-[12.5px] font-semibold text-text-2">
        {etiqueta}
        <Icono n={icono} t={19} className="text-text-3" />
      </div>
      <div className="num text-[26px] font-extrabold tracking-tight">{valor}</div>
      {detalle ? <div className="text-[12px] text-text-3">{detalle}</div> : null}
    </div>
  );
  return a ? <Link to={a}>{cuerpo}</Link> : cuerpo;
}

const soles = (v: number | string) => `S/ ${Number(v).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Inicio() {
  const { usuario } = useSesion();
  const verLogistica = puede(usuario, "logistica") || puede(usuario, "almacen");
  const verCotizaciones = puede(usuario, "cotizacion");
  const { datos, error } = useDatos(() => (verLogistica || verCotizaciones ? api<Resumen>("GET", "/resumen") : Promise.resolve(null)), [verLogistica, verCotizaciones]);
  const verConta = puede(usuario, "contabilidad");
  const verProy = puede(usuario, "proyectos");
  const conta = useDatos(() => (verConta ? Promise.all([api<ResumenConta>("GET", "/contabilidad/resumen"), api<CajaChicaErp>("GET", "/contabilidad/caja-chica")]) : Promise.resolve(null)), [verConta]);
  const proy = useDatos(() => (verProy ? api<{ proyectos: Proyecto[] }>("GET", "/proyectos", { consulta: { estado: "activo" } }) : Promise.resolve(null)), [verProy]);
  const nombre = usuario?.nombre.split(" ")[0] ?? "";
  const apps = [
    { sub: "cotizador" as const, nombre: "Logística", texto: "Requerimientos de materiales y salidas de herramientas", icono: "local_shipping", ver: puede(usuario, "logistica") },
    { sub: "finanzas" as const, nombre: "Finanzas", texto: "Caja diaria y caja chica", icono: "savings", ver: puede(usuario, "caja_chica") },
  ].filter((a) => a.ver);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="sobretitulo">
          Inicio · {diaSemana()} {fecha(hoyLima())}
        </div>
        <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">
          {saludo()}, {nombre}
        </h1>
      </div>

      {conta.datos ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Link to="/contabilidad" className="flex flex-col gap-1.5 rounded-[18px] p-5 font-normal text-white no-underline" style={{ background: "linear-gradient(120deg, var(--navy-a), var(--navy-b))" }}>
            <div className="text-[12.5px] font-bold opacity-90">{conta.datos[0].cuenta ? `Cuenta principal · ${conta.datos[0].cuenta.nombre}` : "Cuenta principal"}</div>
            <div className="num text-[28px] font-extrabold">{conta.datos[0].cuenta ? dinero(conta.datos[0].cuenta.saldo, conta.datos[0].cuenta.moneda) : "Sin dato"}</div>
            <div className="num text-[12px] opacity-80">Este mes: ingresos {dinero(conta.datos[0].kpis.ingresos_mes)} · egresos {dinero(conta.datos[0].kpis.egresos_mes)}</div>
          </Link>
          <Link to="/contabilidad" className="tarjeta flex flex-col gap-1.5 p-5 font-normal text-text no-underline hover:border-primary-line">
            <div className="flex items-center justify-between text-[12.5px] font-semibold text-text-2">Caja chica<Icono n="savings" t={19} className="text-text-3" /></div>
            <div className="num text-[28px] font-extrabold">{conta.datos[1].disponible ? dinero(conta.datos[1].saldo_total) : "Sin dato"}</div>
            {conta.datos[1].disponible ? <div className="flex flex-wrap gap-x-4 text-[12.5px] text-text-2">{conta.datos[1].saldos.map((x) => <span key={x.ciudad}>{x.nombre} <b className="num">{dinero(x.saldo)}</b></span>)}</div> : null}
          </Link>
        </div>
      ) : null}
      {proy.datos?.proyectos.length ? (
        <section className="tarjeta p-5">
          <div className="mb-3 flex items-center justify-between"><div className="titulo-seccion">Proyectos activos <span className="font-medium text-text-3">· {proy.datos.proyectos.length}</span></div><Link to="/proyectos" className="text-[13px]">Ver todos</Link></div>
          <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {proy.datos.proyectos.slice(0, 6).map((p) => (
              <Link key={p.id} to={`/proyectos/${p.id}`} className="flex flex-col gap-1.5 rounded-lg p-1 font-normal text-text no-underline hover:bg-surface-2">
                <div className="flex items-center justify-between gap-2 text-[13.5px]"><span className="truncate font-semibold">{p.nombre}</span><b className="num text-[12.5px]" style={{ color: colorAvance(p.porcentaje) }}>{pctTexto(p.porcentaje)}</b></div>
                <BarraAvance pct={p.porcentaje} />
                <div className="num text-[12px] text-text-3">{dinero(p.gastado)} de {dinero(p.presupuesto)}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {error ? <div className="text-[13px] text-danger">{error}</div> : null}
      {datos ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {verLogistica ? (
            <>
              <Indicador etiqueta="Requerimientos por aprobar" valor={String(datos.requerimientos.pendiente ?? 0)} detalle={datos.urgentes ? `${datos.urgentes} urgentes sin entregar` : "Ninguno urgente"} icono="pending_actions" a="/almacen" />
              <Indicador etiqueta="Por alistar o entregar" valor={String((datos.requerimientos.aprobado ?? 0) + (datos.requerimientos.listo ?? 0))} detalle={`${datos.requerimientos.listo ?? 0} listos para entregar`} icono="inventory_2" a="/almacen" />
              <Indicador etiqueta="Herramientas fuera" valor={String(datos.herramientas.pendiente ?? 0)} detalle={`${datos.herramientas.registrado ?? 0} salidas por confirmar`} icono="construction" a="/almacen" />
            </>
          ) : null}
          {verCotizaciones ? <Indicador etiqueta="Cotizaciones del mes" valor={String(datos.cotizaciones.este_mes)} detalle={`${soles(datos.cotizaciones.monto_mes)} cotizado este mes`} icono="request_quote" /> : null}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section className="tarjeta p-5">
          <div className="titulo-seccion">Plan del ERP</div>
          <p className="mt-1 text-[13px] text-text-2">Se construye por fases. Cada fase se aprueba antes de empezar.</p>
          <ol className="mt-4 flex flex-col gap-1">
            {FASES.map(([n, t]) => {
              const hecha = n <= FASE_ACTUAL;
              return (
                <li key={n} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-[13.5px]">
                  <span className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg text-[12px] font-extrabold ${hecha ? "bg-success-soft text-success" : n === FASE_ACTUAL + 1 ? "bg-primary-soft text-primary-ink" : "bg-surface-2 text-text-3"}`}>
                    {hecha ? <Icono n="check" t={17} /> : n}
                  </span>
                  <span className={hecha ? "font-semibold" : "text-text-2"}>{t}</span>
                  {n === FASE_ACTUAL + 1 ? <span className="ml-auto whitespace-nowrap text-[11.5px] font-bold text-primary-ink">Siguiente</span> : null}
                </li>
              );
            })}
          </ol>
        </section>
        <section className="flex flex-col gap-3">
          {apps.length ? <div className="titulo-seccion">Apps de trabajo</div> : null}
          {apps.map((a) => {
            const url = enlaceApp(a.sub);
            return (
              <a key={a.sub} href={url ?? undefined} target="_blank" rel="noreferrer" className={`tarjeta flex items-center gap-4 p-4 no-underline hover:border-primary-line ${url ? "" : "pointer-events-none opacity-70"}`}>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary-ink">
                  <Icono n={a.icono} t={24} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-bold text-text">{a.nombre}</span>
                  <span className="block text-[12.5px] font-medium text-text-2">{a.texto}</span>
                </span>
                <Icono n="open_in_new" className="text-text-3" />
              </a>
            );
          })}
          {puede(usuario, "configuracion") ? (
            <Link to="/configuracion" className="tarjeta flex items-center gap-4 p-4 no-underline hover:border-primary-line">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-text-2">
                <Icono n="settings" t={24} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold text-text">Configuración</span>
                <span className="block text-[12.5px] font-medium text-text-2">Usuarios, permisos, datos de la empresa e integraciones</span>
              </span>
              <Icono n="chevron_right" className="text-text-3" />
            </Link>
          ) : null}
        </section>
      </div>
    </div>
  );
}
