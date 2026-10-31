import { useState } from "react";
import { api, ErrorApi } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Icono } from "../../componentes/Icono";
import { Modal } from "../../componentes/Modal";
import { dinero, esNegativo, leerMonto, restar, sumarMontos } from "../../dinero";
import { fecha, fechaHora, hoyLima, texto } from "../../formato";
import { useSesion } from "../../sesion";
import type { Cuenta, MedioCaja, MovimientoCuenta, ResumenConta, SaldosCajaIcr } from "../../tipos";
import { useDatos } from "../../usarDatos";

const Error = ({ m }: { m: string | null }) => (m ? <div className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{m}</div> : null);
const mensaje = (e: unknown, def: string) => (e instanceof ErrorApi || e instanceof globalThis.Error ? e.message : def);
// Categorías que pone el sistema solo (envíos a la Caja ICR y depósitos que llegan desde ella): no se eligen a mano.
const AUTOMATICAS = ["Envío a Caja ICR", "Depósito desde Caja ICR", "Envío a caja chica"];

// ---------------------------------------------------------------------------------------------
// Nuevo movimiento de la cuenta
// ---------------------------------------------------------------------------------------------

export function NuevoMovimiento({ cuentas, cuentaId, categorias, onCerrar, onHecho }: { cuentas: Cuenta[]; cuentaId: number; categorias: ResumenConta["categorias"]; onCerrar: () => void; onHecho: () => void }) {
  const avisar = useAvisos();
  const proyectos = useDatos(() => api<{ id: number; codigo: string; nombre: string }[]>("GET", "/proyectos/activos"));
  const [f, setF] = useState({ cuenta_id: cuentaId, tipo: "egreso" as "ingreso" | "egreso", fecha: hoyLima(), monto: "", concepto: "", categoria: "", proyecto_id: "", documento: "", contraparte: "" });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cuenta = cuentas.find((c) => c.id === Number(f.cuenta_id));
  const monto = leerMonto(f.monto);
  const guardar = async () => {
    if (!monto) return setError("Escribe un monto mayor a 0 (hasta 2 decimales).");
    if (!f.concepto.trim()) return setError("Escribe el concepto.");
    setGuardando(true);
    setError(null);
    try {
      await api("POST", "/contabilidad/movimientos", { cuerpo: { ...f, monto, categoria: f.categoria || null, proyecto_id: f.tipo === "egreso" && f.proyecto_id ? Number(f.proyecto_id) : null } });
      avisar(f.tipo === "ingreso" ? "Ingreso registrado" : "Egreso registrado", `${dinero(monto, cuenta?.moneda)} · ${f.concepto}`);
      onHecho();
      onCerrar();
    } catch (e) {
      setError(mensaje(e, "No se pudo registrar."));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal titulo="Nuevo movimiento" icono="add_card" ancho={560} onCerrar={onCerrar} pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Registrar"}</button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="flex gap-1.5 sm:col-span-2">
          {(["ingreso", "egreso"] as const).map((t) => (
            <button key={t} onClick={() => setF({ ...f, tipo: t, categoria: "", proyecto_id: "" })} className={`btn h-10 flex-1 ${f.tipo === t ? (t === "ingreso" ? "bg-success-soft text-success" : "bg-danger-soft text-danger") : "border border-border text-text-2"}`}>
              <Icono n={t === "ingreso" ? "south_west" : "north_east"} t={18} />{t === "ingreso" ? "Ingreso" : "Egreso"}
            </button>
          ))}
        </div>
        <label className="sm:col-span-2">
          <span className="etiqueta">Cuenta</span>
          <select className="campo" value={f.cuenta_id} onChange={(e) => setF({ ...f, cuenta_id: Number(e.target.value) })}>
            {cuentas.filter((c) => c.activa).map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
          </select>
        </label>
        <label><span className="etiqueta">Fecha</span><input className="campo" type="date" max={hoyLima()} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></label>
        <label>
          <span className="etiqueta">Monto ({cuenta?.moneda === "USD" ? "US$" : "S/"})</span>
          <input className="campo num" inputMode="decimal" placeholder="0.00" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} />
        </label>
        <label className="sm:col-span-2"><span className="etiqueta">Concepto</span><input className="campo" placeholder={f.tipo === "ingreso" ? "Ej. Cobro 2.ª armada · Lácteos del Sur" : "Ej. Pago de inversores · Proveedor"} value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} /></label>
        <label>
          <span className="etiqueta">Categoría</span>
          <select className="campo" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
            <option value="">Sin categoría</option>
            {categorias[f.tipo].filter((c) => !AUTOMATICAS.includes(c)).map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        {f.tipo === "egreso" ? (
          <label>
            <span className="etiqueta">Proyecto (opcional)</span>
            <select className="campo" value={f.proyecto_id} onChange={(e) => setF({ ...f, proyecto_id: e.target.value })} disabled={cuenta?.moneda !== "PEN"}>
              <option value="">Ninguno</option>
              {(proyectos.datos ?? []).map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
            </select>
          </label>
        ) : <div />}
        <label><span className="etiqueta">Documento (opcional)</span><input className="campo" placeholder="Ej. F001-000123" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} /></label>
        <label><span className="etiqueta">{f.tipo === "ingreso" ? "Cliente / origen" : "Proveedor / destino"} (opcional)</span><input className="campo" value={f.contraparte} onChange={(e) => setF({ ...f, contraparte: e.target.value })} /></label>
        <div className="sm:col-span-2"><Error m={error} /></div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Detalle de un movimiento (y anular)
// ---------------------------------------------------------------------------------------------

export function DetalleMovimiento({ m, moneda, puedeAnular, onCerrar, onHecho }: { m: MovimientoCuenta; moneda: "PEN" | "USD"; puedeAnular: boolean; onCerrar: () => void; onHecho: () => void }) {
  const avisar = useAvisos();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const anular = async () => {
    try {
      await api("POST", `/contabilidad/movimientos/${m.id}/anular`, { cuerpo: { motivo } });
      avisar("Movimiento anulado", "Quedó en la auditoría con su motivo.");
      onHecho();
      onCerrar();
    } catch (e) {
      setError(mensaje(e, "No se pudo anular."));
    }
  };
  const filas: [string, string][] = [
    ["Fecha", fecha(m.fecha)], ["Tipo", m.tipo === "ingreso" ? "Ingreso" : "Egreso"], ["Categoría", texto(m.categoria)],
    ["Proyecto", m.proyecto_nombre ? `${m.proyecto_codigo} · ${m.proyecto_nombre}` : "Ninguno"], ["Documento", texto(m.documento)], ["Contraparte", texto(m.contraparte)],
    ["Saldo después", m.saldo ? dinero(m.saldo, moneda) : "Sin dato"], ["Registrado por", `${texto(m.registrado_por)} · ${fechaHora(m.creado_en)}`],
  ];
  if (m.anulado) filas.push(["Anulado", `${texto(m.anulado_motivo)} · ${texto(m.anulado_por)} · ${fechaHora(m.anulado_en)}`]);
  return (
    <Modal titulo={m.concepto} icono={m.tipo === "ingreso" ? "south_west" : "north_east"} onCerrar={onCerrar}
      pie={puedeAnular && !m.anulado && (m.source === "erp" || m.source === "envio_caja_icr") ? (anulando ? <><button className="btn-secundario" onClick={() => setAnulando(false)}>Volver</button><button className="btn-peligro" disabled={!motivo.trim()} onClick={anular}>Anular movimiento</button></> : <button className="btn-secundario text-danger" onClick={() => setAnulando(true)}>Anular…</button>) : undefined}>
      <div className="num mb-3 text-[26px] font-extrabold" style={{ color: m.anulado ? "var(--text-3)" : m.tipo === "ingreso" ? "var(--success)" : "var(--danger)", textDecoration: m.anulado ? "line-through" : undefined }}>
        {m.tipo === "ingreso" ? "+" : "−"}{dinero(m.monto, moneda)}
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        {filas.map(([a, b]) => <div key={a} className="flex justify-between gap-3 border-b border-border px-3 py-2 text-[13px] last:border-0"><span className="text-text-3">{a}</span><b className="text-right">{b}</b></div>)}
      </div>
      {m.source === "envio_caja_chica" ? <p className="mt-3 text-[12.5px] text-text-3">Este egreso es un envío a la caja chica anterior: no se puede anular desde el ERP.</p> : null}
      {m.source === "envio_caja_icr" ? <p className="mt-3 text-[12.5px] text-text-3">Envío a la Caja ICR: si lo anulas, el dinero también sale de la caja (se anulan juntos).</p> : null}
      {m.source === "deposito_caja_icr" ? <p className="mt-3 text-[12.5px] text-text-3">Este ingreso es un depósito registrado en la Caja ICR (app de Finanzas). Se anula allí y aquí se anula solo.</p> : null}
      {anulando ? (
        <label className="mt-3 block"><span className="etiqueta">¿Por qué se anula? (queda en la auditoría)</span><input className="campo" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Registrado dos veces" /></label>
      ) : null}
      <div className="mt-3"><Error m={error} /></div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Cuentas de la empresa
// ---------------------------------------------------------------------------------------------

type FormCuenta = { id?: number; nombre: string; banco: string; numero: string; cci: string; moneda: "PEN" | "USD"; principal: boolean; activa: boolean; saldo_inicial: string; saldo_inicial_fecha: string };
const VACIA: FormCuenta = { nombre: "", banco: "", numero: "", cci: "", moneda: "PEN", principal: true, activa: true, saldo_inicial: "", saldo_inicial_fecha: "" };

export function Cuentas({ cuentas, editar, onCerrar, onHecho }: { cuentas: Cuenta[]; editar: boolean; onCerrar: () => void; onHecho: () => void }) {
  const avisar = useAvisos();
  const [f, setF] = useState<FormCuenta | null>(cuentas.length ? null : VACIA);
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    if (!f) return;
    const si = f.saldo_inicial.trim();
    const neg = si.startsWith("-");
    const valor = si === "" ? null : si.replace("-", "") === "0" ? "0" : leerMonto(si.replace("-", ""));
    if (si !== "" && valor === null) return setError("El saldo inicial no es un monto válido.");
    if (si !== "" && !f.saldo_inicial_fecha) return setError("Indica la fecha del saldo inicial (el saldo al empezar ese día).");
    const cuerpo = { ...f, saldo_inicial: valor === null ? null : `${neg ? "-" : ""}${valor}`, saldo_inicial_fecha: valor === null ? null : f.saldo_inicial_fecha };
    try {
      if (f.id) await api("PUT", `/contabilidad/cuentas/${f.id}`, { cuerpo });
      else await api("POST", "/contabilidad/cuentas", { cuerpo });
      avisar(f.id ? "Cuenta actualizada" : "Cuenta creada", f.nombre);
      setF(null);
      setError(null);
      onHecho();
    } catch (e) {
      setError(mensaje(e, "No se pudo guardar."));
    }
  };
  return (
    <Modal titulo="Cuentas de la empresa" icono="account_balance" ancho={640} onCerrar={onCerrar}
      pie={f ? <><button className="btn-secundario" onClick={() => (cuentas.length ? setF(null) : onCerrar())}>Cancelar</button><button className="btn-primario" onClick={guardar}>Guardar cuenta</button></> : editar ? <button className="btn-primario" onClick={() => setF({ ...VACIA, principal: !cuentas.some((c) => c.principal && c.moneda === "PEN") })}><Icono n="add" t={18} />Nueva cuenta</button> : undefined}>
      {f ? (
        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="etiqueta">Nombre</span><input className="campo" autoFocus placeholder="Ej. BCP Cta. cte. S/" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></label>
          <label><span className="etiqueta">Banco</span><input className="campo" placeholder="Ej. BCP" value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })} /></label>
          <label>
            <span className="etiqueta">Moneda</span>
            <select className="campo" value={f.moneda} disabled={!!f.id} onChange={(e) => setF({ ...f, moneda: e.target.value as "PEN" | "USD" })}><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></select>
          </label>
          <label><span className="etiqueta">N.º de cuenta</span><input className="campo num" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} /></label>
          <label><span className="etiqueta">CCI</span><input className="campo num" value={f.cci} onChange={(e) => setF({ ...f, cci: e.target.value })} /></label>
          <div className="rounded-xl border border-border bg-surface-2 p-3 sm:col-span-2">
            <div className="mb-2 text-[13px] font-bold">Saldo inicial</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="etiqueta">Monto (vacío = Sin dato)</span><input className="campo num" inputMode="decimal" placeholder="Ej. 384215.60" value={f.saldo_inicial} onChange={(e) => setF({ ...f, saldo_inicial: e.target.value })} /></label>
              <label><span className="etiqueta">Al empezar el día</span><input className="campo" type="date" max={hoyLima()} value={f.saldo_inicial_fecha} onChange={(e) => setF({ ...f, saldo_inicial_fecha: e.target.value })} /></label>
            </div>
            <p className="mt-2 text-[12px] text-text-3">El saldo se calcula con este monto más los movimientos desde esa fecha. Sin saldo inicial, el saldo se muestra «Sin dato».</p>
          </div>
          <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" className="h-4 w-4" checked={f.principal} onChange={(e) => setF({ ...f, principal: e.target.checked })} />Cuenta principal en {f.moneda === "PEN" ? "soles" : "dólares"}</label>
          {f.id ? <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" className="h-4 w-4" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} />Activa</label> : null}
          <div className="sm:col-span-2"><Error m={error} /></div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {cuentas.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary-ink"><Icono n="account_balance" t={20} /></span>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{c.nombre} {c.principal ? <span className="ml-1 rounded-md bg-primary-soft px-1.5 py-0.5 text-[11px] font-bold text-primary-ink">Principal</span> : null}{!c.activa ? <span className="ml-1 rounded-md bg-neutral-soft px-1.5 py-0.5 text-[11px] font-bold text-neutral">Desactivada</span> : null}</div>
                <div className="text-[12.5px] text-text-3">{[c.banco, c.numero].filter(Boolean).join(" · ") || "Sin dato"} · saldo inicial {c.saldo_inicial ? `${dinero(c.saldo_inicial, c.moneda)} al ${fecha(c.saldo_inicial_fecha)}` : "Sin dato"}</div>
              </div>
              <b className="num">{dinero(c.saldo, c.moneda)}</b>
              {editar ? <button className="btn-secundario h-9" onClick={() => setF({ id: c.id, nombre: c.nombre, banco: c.banco ?? "", numero: c.numero ?? "", cci: c.cci ?? "", moneda: c.moneda, principal: c.principal, activa: c.activa, saldo_inicial: c.saldo_inicial ?? "", saldo_inicial_fecha: c.saldo_inicial_fecha ?? "" })}>Editar</button> : null}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Enviar fondos a la Caja ICR (2 pasos): sale de la cuenta y entra al saldo en efectivo o digital de la caja
// ---------------------------------------------------------------------------------------------

const MEDIOS: [MedioCaja, string, string, string][] = [
  ["EFECTIVO", "Efectivo", "payments", "Para gastos físicos"],
  ["DIGITAL", "Digital", "smartphone", "Yape / transferencias"],
];

export function EnviarFondos({ cuentas, saldos, onCerrar, onHecho }: { cuentas: Cuenta[]; saldos: SaldosCajaIcr | null; onCerrar: () => void; onHecho: () => void }) {
  const { usuario } = useSesion();
  const avisar = useAvisos();
  const enSoles = cuentas.filter((c) => c.moneda === "PEN" && c.activa);
  const [cuentaId, setCuentaId] = useState(enSoles.find((c) => c.principal)?.id ?? enSoles[0]?.id);
  const [medio, setMedio] = useState<MedioCaja | null>(null);
  const [montoTxt, setMontoTxt] = useState("");
  const [concepto, setConcepto] = useState("");
  const [paso, setPaso] = useState(1);
  const [intento, setIntento] = useState(false);
  const [negativo, setNegativo] = useState<{ mensaje: string } | null>(null);
  const [autorizo, setAutorizo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cuenta = enSoles.find((c) => c.id === cuentaId);
  const monto = leerMonto(montoTxt);
  const saldoMedio = medio && saldos ? saldos[medio === "EFECTIVO" ? "efectivo" : "digital"] : null;
  const nombreMedio = MEDIOS.find((x) => x[0] === medio)?.[1].toLowerCase();
  const cuentaDespues = cuenta?.saldo && monto ? restar(cuenta.saldo, monto) : null;
  const cajaDespues = saldoMedio && monto ? sumarMontos(saldoMedio, monto) : null;
  const esAdmin = usuario?.rol === "admin";

  if (!enSoles.length) {
    return <Modal titulo="Enviar fondos a Caja ICR" icono="savings" onCerrar={onCerrar}><p className="text-[13.5px] text-text-2">Primero crea una cuenta en soles (botón «Cuentas»).</p></Modal>;
  }

  const siguiente = async () => {
    if (paso === 1) {
      setIntento(true);
      if (!medio || !monto || !concepto.trim()) return;
      setPaso(2);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await api("POST", "/contabilidad/envios", { cuerpo: { cuenta_id: cuentaId, medio, monto, concepto, autorizar_negativo: negativo && autorizo ? true : undefined } });
      avisar("Fondos enviados", `${dinero(monto)} al saldo ${nombreMedio} de la Caja ICR. Ya se ve en la app de Finanzas.`);
      onHecho();
      onCerrar();
    } catch (e) {
      const d = e instanceof ErrorApi ? e : null;
      if (d?.estado === 409 && /negativo|saldo/i.test(d.message)) setNegativo({ mensaje: d.message });
      else setError(mensaje(e, "No se pudo enviar."));
    } finally {
      setEnviando(false);
    }
  };

  const resumen: [string, string, boolean?][] = [
    ["Desde", cuenta?.nombre ?? "Sin dato"],
    ["Saldo de la cuenta", cuenta?.saldo ? `${dinero(cuenta.saldo)} → ${cuentaDespues ? dinero(cuentaDespues) : "—"}` : "Sin dato", !!cuentaDespues && esNegativo(cuentaDespues)],
    ["Va a", medio ? `Caja ICR · ${nombreMedio}` : "Elige efectivo o digital"],
    ["Saldo de la caja", saldoMedio ? `${dinero(saldoMedio)} → ${cajaDespues ? dinero(cajaDespues) : "—"}` : "—"],
    ["Monto", monto ? dinero(monto) : "—"],
  ];
  if (paso === 2) resumen.push(["Concepto", concepto]);

  return (
    <Modal titulo="Enviar fondos a Caja ICR" icono="savings" ancho={540} onCerrar={onCerrar}
      pie={<><button className="btn-secundario" onClick={() => (paso === 1 ? onCerrar() : (setPaso(1), setNegativo(null), setAutorizo(false)))}>{paso === 1 ? "Cancelar" : "Atrás"}</button><button className="btn-primario" disabled={enviando || (paso === 2 && !!negativo && !(esAdmin && autorizo))} onClick={siguiente}>{paso === 1 ? "Revisar" : enviando ? "Enviando…" : "Confirmar envío"}</button></>}>
      <div className="mb-3 text-[12.5px] font-semibold text-text-3">Paso {paso} de 2 · {paso === 1 ? "Datos del envío" : "Confirmar"}</div>
      <div className="flex flex-col gap-4">
        {paso === 1 ? (
          <>
            {enSoles.length > 1 ? (
              <label><span className="etiqueta">Desde la cuenta</span>
                <select className="campo" value={cuentaId} onChange={(e) => setCuentaId(Number(e.target.value))}>{enSoles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
              </label>
            ) : null}
            <div>
              <span className="etiqueta">¿A qué saldo de la Caja ICR?</span>
              <div className="grid grid-cols-2 gap-2">
                {MEDIOS.map(([k, l, i, sub]) => (
                  <button key={k} onClick={() => setMedio(k)} className={`rounded-xl border p-3 text-left ${medio === k ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-2"}`}>
                    <div className="flex items-center gap-1.5 font-bold"><Icono n={i} t={18} />{l}</div>
                    <div className="text-[12px] text-text-3">{sub}</div>
                    <div className="num text-[12.5px] text-text-3">Saldo {saldos ? dinero(saldos[k === "EFECTIVO" ? "efectivo" : "digital"]) : "Sin dato"}</div>
                  </button>
                ))}
              </div>
              {intento && !medio ? <span className="mt-1 block text-[12px] font-semibold text-danger">Elige si el dinero va al efectivo o al saldo digital.</span> : null}
            </div>
            <label>
              <span className="etiqueta">Monto</span>
              <div className="relative"><span className="pointer-events-none absolute left-3 top-2.5 font-bold text-text-3">S/</span><input className="campo num pl-9" inputMode="decimal" placeholder="0.00" value={montoTxt} onChange={(e) => setMontoTxt(e.target.value)} /></div>
              {intento && !monto ? <span className="mt-1 block text-[12px] font-semibold text-danger">Ingresa un monto mayor a 0.</span> : null}
              <div className="mt-2 flex flex-wrap gap-1.5">{["500", "1000", "2000", "5000"].map((p) => <button key={p} onClick={() => setMontoTxt(p)} className="h-8 rounded-lg border border-border px-2.5 text-[12.5px] font-semibold text-text-2 hover:bg-surface-2">{dinero(p)}</button>)}</div>
            </label>
            <label>
              <span className="etiqueta">Concepto</span>
              <input className="campo" placeholder="Ej. Reposición para gastos de obra – semana 44" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
              {intento && !concepto.trim() ? <span className="mt-1 block text-[12px] font-semibold text-danger">Indica para qué es el envío.</span> : null}
            </label>
          </>
        ) : null}
        <div className="rounded-xl border border-border bg-surface-2 p-3 text-[13px]">
          <div className="mb-1.5 font-bold">{paso === 1 ? "Así quedará" : "Resumen del envío"}</div>
          {resumen.map(([a, b, rojo]) => <div key={a} className="flex justify-between gap-3 py-0.5"><span className="text-text-3">{a}</span><b className="num text-right" style={{ color: rojo ? "var(--danger)" : undefined }}>{b}</b></div>)}
        </div>
        {paso === 2 ? <div className="flex gap-2 rounded-xl bg-primary-soft px-3 py-2.5 text-[12.5px] text-primary-ink"><Icono n="info" t={18} />La caja recibe el monto al instante (se ve en la app de Finanzas). Si te equivocas, anula el egreso en Movimientos: sale de la caja también.</div> : null}
        {negativo ? (
          <div className="flex flex-col gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
            <div className="flex gap-2 font-semibold"><Icono n="warning" t={18} />{negativo.mensaje}</div>
            {esAdmin ? (
              <label className="flex items-start gap-2 text-text"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={autorizo} onChange={(e) => setAutorizo(e.target.checked)} />Como Administrador, autorizo este envío aunque la cuenta quede en negativo (queda en la auditoría).</label>
            ) : <div className="text-text-2">Pídele a un Administrador que lo confirme.</div>}
          </div>
        ) : null}
        <Error m={error} />
      </div>
    </Modal>
  );
}
