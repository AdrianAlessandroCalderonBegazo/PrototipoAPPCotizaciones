import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { C, card, kicker, t } from "../theme";
import { AvisoSync, Seccion } from "../components/fin";
import { Chip, DateField, PrimaryButton, SecondaryButton, TealGradient } from "../components/ui";
import { apiJson, logout, type Session } from "../lib/api";
import { fdate, isoDate, money, pad, today } from "../lib/format";
import { bloqueo, store } from "../lib/fin/runtime";
import { cuentasActivas, pendientes, type State } from "../lib/fin/store";
import type { EstadoSync, Snapshot } from "../lib/fin/sync";
import { cargarReporte, nombreArchivo, nombreCuentas, periodoTexto, totalesReporte, type FuenteDatos, type Reporte, type ReporteOpciones } from "../lib/reportes/model";
import { PRESETS, errorDeRango, rangoPreset, type Preset } from "../lib/reportes/periodo";
import { descargar } from "../lib/reportes/descarga";

type Formato = "xlsx" | "csv";
const MIME: Record<Formato, string> = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv;charset=utf-8" };

/** Pide al servidor lo que el reporte necesita (la misma ruta que usa la sincronización, con el rango pedido). */
const servidor: FuenteDatos = { snapshot: (desde, hasta) => apiJson<Snapshot>("GET", `/v2/snapshot?desde=${desde}&hasta=${hasta}`) };

/** ISO (UTC) -> "22 oct 2026 14:05" en la hora del dispositivo. */
const horaLocal = (iso: string) => {
  const d = new Date(iso);
  return `${fdate(isoDate(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const estadoTexto = (e: EstadoSync) =>
  e.fase === "sin-conexion" ? "Sin conexión" : e.fase === "sesion-vencida" ? "Sesión vencida" : e.fase === "sincronizando" ? "Sincronizando…" : e.ultimoOk ? `Sincronizado ${horaLocal(e.ultimoOk)}` : "Sin sincronizar todavía";

/** Reportes: elegir período y cuentas, ver un resumen y exportar a Excel o CSV. Más la cuenta de la persona. */
export function Reportes({ caja, estado, session, onSalio, topInset, bottomInset }: { caja: State; estado: EstadoSync; session: Session; onSalio: () => void; topInset: number; bottomInset: number }) {
  const [preset, setPreset] = useState<Preset>("mes");
  const [otro, setOtro] = useState(() => ({ desde: today(), hasta: today() }));
  const [cuentaIds, setCuentaIds] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState<Formato | null>(null);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState("");
  const [saliendo, setSaliendo] = useState(false);

  const { desde, hasta } = preset === "otro" ? otro : rangoPreset(preset, today());
  const errRango = errorDeRango(desde, hasta);
  const opciones = useMemo<ReporteOpciones>(() => ({ desde, hasta, cuentaIds }), [desde, hasta, cuentaIds]);
  const usuario = session.nombre || session.email;
  const cuentas = cuentasActivas(caja);

  // Vista previa: se rearma sola al cambiar las opciones (con una pausa corta; las respuestas viejas se descartan).
  const [vista, setVista] = useState<{ cargando: boolean; reporte?: Reporte; error?: string }>({ cargando: false });
  const ultima = useRef(0);
  useEffect(() => {
    setHecho("");
    if (errRango) return setVista({ cargando: false });
    const n = ++ultima.current;
    setVista((v) => ({ ...v, cargando: true, error: undefined }));
    const espera = setTimeout(() => {
      cargarReporte({ ...opciones, usuario }, servidor, store.get())
        .then((reporte) => n === ultima.current && setVista({ cargando: false, reporte }))
        .catch((e) => n === ultima.current && setVista({ cargando: false, error: e?.message || "No se pudo consultar los datos." }));
    }, 350);
    return () => clearTimeout(espera);
  }, [opciones, errRango, usuario]);

  const exportar = async (formato: Formato) => {
    setError("");
    setHecho("");
    setOcupado(formato);
    try {
      // siempre con datos frescos, no con la vista previa de hace un rato
      const r = await cargarReporte({ ...opciones, usuario }, servidor, store.get());
      const bytes = formato === "xlsx" ? await (await import("../lib/reportes/xlsx")).generarXlsx(r) : (await import("../lib/reportes/csv")).generarCsv(r);
      const nombre = `${nombreArchivo(r)}.${formato}`;
      descargar(bytes, nombre, MIME[formato]);
      setHecho(r.desdeLocal ? `${nombre} descargado, pero sin conexión: solo incluye lo guardado en este dispositivo.` : `${nombre} descargado.`);
    } catch (e) {
      setError((e as Error)?.message || "No se pudo generar el archivo.");
    } finally {
      setOcupado(null);
    }
  };

  const pend = pendientes(caja);
  const salir = async () => {
    await logout();
    bloqueo.bloquear();
    await store.reiniciar();
    onSalio();
  };

  const r = vista.reporte;
  const tot = r ? totalesReporte(r) : null;
  const bloqueado = !!errRango || !!ocupado;
  const alternar = (id: string) => setCuentaIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <TealGradient style={{ paddingTop: 18 + topInset, paddingHorizontal: 20, paddingBottom: 26 }}>
          <Text style={kicker("rgba(255,255,255,.9)", 11)}>REPORTES</Text>
          <Text style={t(26, 800, C.white, { letterSpacing: -0.5, marginTop: 6 })}>Exportar</Text>
          <Text style={t(12, 400, "rgba(255,255,255,.88)", { marginTop: 2 })}>Libro, resumen por cuenta, gasto por persona y practicantes, en Excel o CSV</Text>
        </TealGradient>
        <AvisoSync estado={estado} caja={caja} />

        <View style={{ padding: 16, gap: 22 }}>
          <Seccion titulo="PERÍODO" derecha={<Text style={t(11.5, 600, C.muted)}>{errRango ? "" : periodoTexto(desde, hasta)}</Text>}>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {PRESETS.map((p) => (
                <Chip key={p.id} label={p.label} active={preset === p.id} onPress={() => setPreset(p.id)} />
              ))}
            </View>
            {preset === "otro" ? (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={kicker(C.muted, 10)}>DESDE</Text>
                  <View style={{ marginTop: 6 }}>
                    <DateField value={otro.desde} onChange={(v) => setOtro((o) => ({ ...o, desde: v }))} />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={kicker(C.muted, 10)}>HASTA</Text>
                  <View style={{ marginTop: 6 }}>
                    <DateField value={otro.hasta} onChange={(v) => setOtro((o) => ({ ...o, hasta: v }))} />
                  </View>
                </View>
              </View>
            ) : null}
            {errRango ? <Text style={t(12, 600, C.red)}>{errRango}</Text> : null}
          </Seccion>

          <Seccion titulo="CUENTAS">
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Chip label="Todas" active={!cuentaIds.length} onPress={() => setCuentaIds([])} />
              {cuentas.map((c) => (
                <Chip key={c.id} label={c.nombre} active={cuentaIds.includes(c.id)} onPress={() => alternar(c.id)} />
              ))}
            </View>
          </Seccion>

          <Seccion titulo="RESUMEN">
            <View style={[card(14), { padding: 14, gap: 8, minHeight: 92 }]}>
              {errRango ? (
                <Text style={t(12.5, 400, C.muted)}>Completa el período para ver el resumen.</Text>
              ) : vista.error ? (
                <Text style={t(12.5, 600, C.red)}>{vista.error}</Text>
              ) : !r || tot === null ? (
                <Text style={t(12.5, 400, C.muted)}>Consultando…</Text>
              ) : (
                <>
                  <Text style={t(12, 600, C.muted)}>
                    {nombreCuentas(r)} · {periodoTexto(r.desde, r.hasta)}
                    {vista.cargando ? " · actualizando…" : ""}
                  </Text>
                  <Linea k={`${tot.movimientos} ${tot.movimientos === 1 ? "movimiento" : "movimientos"}`} v="" />
                  <Linea k="Ingresos" v={money(tot.ingresos)} color={C.teal} />
                  <Linea k="Egresos" v={money(tot.egresos)} color={C.red} />
                  <Linea k="Traspasos entre cuentas" v={money(tot.traspasos)} />
                  {r.practicantes.length ? <Linea k={`Gasto en practicantes (${r.practicantes.length})`} v={money(r.practicantes.reduce((a, g) => a + g.total, 0))} /> : null}
                  {r.desdeLocal ? <Text style={t(12, 600, C.red)}>Sin conexión: se usa lo guardado en este dispositivo; puede faltar lo que registró otra persona o lo más antiguo.</Text> : null}
                </>
              )}
            </View>
          </Seccion>

          <View style={{ gap: 10 }}>
            <PrimaryButton label={ocupado === "xlsx" ? "GENERANDO EXCEL…" : "DESCARGAR EXCEL (.XLSX)"} onPress={() => !bloqueado && void exportar("xlsx")} />
            <SecondaryButton label={ocupado === "csv" ? "Generando CSV…" : "Descargar CSV (solo el libro)"} onPress={() => !bloqueado && void exportar("csv")} />
            {error ? <Text style={t(12.5, 600, C.red)} accessibilityRole="alert">{error}</Text> : null}
            {hecho ? <Text style={t(12.5, 600, C.teal)} accessibilityRole="alert">{hecho}</Text> : null}
          </View>

          <Seccion titulo="CUENTA">
            <View style={[card(14), { padding: 14, gap: 4 }]}>
              <Text style={t(14, 800)}>{session.nombre || session.email}</Text>
              {session.nombre ? <Text style={t(12, 400, C.muted)}>{session.email}</Text> : null}
              <Text style={t(12, 400, C.muted, { marginTop: 4 })}>{estadoTexto(estado)}</Text>
            </View>
            {saliendo ? (
              <View style={[card(14), { padding: 14, gap: 10, borderColor: C.red }]}>
                <Text style={t(13, 700, C.red)}>
                  {pend ? `Tienes ${pend} ${pend === 1 ? "cambio" : "cambios"} sin enviar. Si sales ahora se pierden.` : "Se borrarán los datos guardados en este dispositivo (siguen en el servidor)."}
                </Text>
                <SecondaryButton label="Salir" danger onPress={() => void salir()} />
                <Pressable onPress={() => setSaliendo(false)} hitSlop={8} style={{ alignItems: "center", paddingVertical: 4 }}>
                  <Text style={t(13, 700, C.teal)}>Cancelar</Text>
                </Pressable>
              </View>
            ) : (
              <SecondaryButton label="Cerrar sesión" danger onPress={() => setSaliendo(true)} />
            )}
          </Seccion>
          <View style={{ height: bottomInset }} />
        </View>
      </ScrollView>
    </View>
  );
}

function Linea({ k, v, color = C.ink }: { k: string; v: string; color?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
      <Text style={t(12.5, 600, C.soft, { flex: 1 })}>{k}</Text>
      {v ? <Text style={t(13, 800, color, { fontVariant: ["tabular-nums"] })}>{v}</Text> : null}
    </View>
  );
}
