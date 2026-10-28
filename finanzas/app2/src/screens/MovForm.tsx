import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from "react-native";
import { C, card, kicker, t } from "../theme";
import { FotosBloque, Seccion, type FotoItem } from "../components/fin";
import { AmountField, BottomBar, Chip, DateField, ErrorText, FieldLabel, Header, OptionGrid, PrimaryButton, Screen, SecondaryButton, TextField } from "../components/ui";
import { horaActual, money, today } from "../lib/format";
import { buscarPersona, norm } from "../lib/fin/captura";
import { buscarDuplicado, repartir, validarMov } from "../lib/fin/calc";
import { CATEGORIAS_EGRESO, CATEGORIAS_INGRESO, SUBCATEGORIAS } from "../lib/fin/categorias";
import { elegirFoto, FotoError } from "../lib/fin/foto";
import { borrarFoto } from "../lib/fin/fotos";
import { nuevoId } from "../lib/fin/ids";
import { cuentasActivas, type NuevoMov, type State } from "../lib/fin/store";
import { TIPO_MOV_LABEL, TIPOS_MOV, type Mov, type TipoMov } from "../lib/fin/types";
import type { FotoGuardada } from "../lib/fin/fotos";

export type ValoresMov = Partial<Omit<NuevoMov, "id">>;

/**
 * Formulario de un movimiento: ingreso, egreso o traspaso. Sirve para registrar a mano, corregir uno ya registrado
 * (`mov`) y revisar un borrador que salió de una captura (`inicial`). No guarda por sí mismo: avisa con `onGuardar`.
 */
export function MovForm({ caja, mov, inicial, fotoInicial, titulo, aviso, onGuardar, onEliminar, onClose, topInset, bottomInset }: {
  caja: State;
  mov?: Mov;
  inicial?: ValoresMov;
  /** Foto de la captura de la que viene el borrador (ya guardada en el dispositivo). */
  fotoInicial?: FotoGuardada | null;
  titulo?: string;
  /** Avisos del lector de capturas ("No pude leer el monto"). */
  aviso?: string[];
  onGuardar: (m: NuevoMov, fotos: FotoItem[]) => void;
  onEliminar?: () => void;
  onClose: () => void;
  topInset: number;
  bottomInset: number;
}) {
  const cuentas = cuentasActivas(caja);
  const base = mov ?? inicial ?? {};
  const [tipo, setTipo] = useState<TipoMov>(base.tipo ?? "EGRESO");
  const [cuentaId, setCuentaId] = useState(base.cuenta_id ?? (caja.miCuentaId || cuentas[0]?.id || ""));
  const [destinoId, setDestinoId] = useState(base.destino_id ?? "");
  const [monto, setMonto] = useState(base.monto ? String(base.monto) : "");
  const [fecha, setFecha] = useState(base.fecha ?? today());
  const [hora] = useState(base.hora ?? horaActual());
  const [categoria, setCategoria] = useState(base.categoria ?? "");
  const [subcategoria, setSubcategoria] = useState(base.subcategoria ?? "");
  const [concepto, setConcepto] = useState(base.concepto ?? "");
  const [pagadoA, setPagadoA] = useState(base.pagado_a ?? "");
  const [pagadoAId, setPagadoAId] = useState(base.pagado_a_id ?? "");
  const [paraIds, setParaIds] = useState<string[]>((base.para ?? []).map((p) => p.persona_id));
  const [paraMontos, setParaMontos] = useState<Record<string, number>>(Object.fromEntries((base.para ?? []).map((p) => [p.persona_id, p.monto])));
  const [buscarPara, setBuscarPara] = useState("");
  const [nro, setNro] = useState(base.nro_operacion ?? "");
  const [fotos, setFotos] = useState<FotoItem[]>(() => [...(mov?.adjuntos ?? []).map((a) => ({ id: a.id, adj: a })), ...(fotoInicial ? [{ id: nuevoId(), nueva: fotoInicial }] : [])]);
  const [errFoto, setErrFoto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [borrando, setBorrando] = useState(false);

  const n = parseFloat(monto.replace(/,/g, "")) || 0;
  const color = tipo === "INGRESO" ? C.teal : tipo === "EGRESO" ? C.red : C.navy;
  const categorias = tipo === "INGRESO" ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO;
  const subs = SUBCATEGORIAS[categoria] ?? [];
  const equipo = useMemo(() => caja.personas.filter((p) => p.activa && p.tipo !== "PROVEEDOR"), [caja.personas]);
  const porId = useMemo(() => new Map(caja.personas.map((p) => [p.id, p])), [caja.personas]);

  // reparto en partes iguales entre los elegidos (los montos que ya traía un movimiento se respetan hasta que se toca la lista)
  const para = useMemo(() => {
    const iguales = repartir(n, paraIds);
    return paraIds.map((id, i) => ({ persona_id: id, monto: paraMontos[id] !== undefined && paraIds.length === Object.keys(paraMontos).length ? paraMontos[id] : iguales[i].monto }));
  }, [n, paraIds, paraMontos]);

  const sugerencias = useMemo(() => {
    const q = norm(pagadoA);
    if (q.length < 2 || pagadoAId) return [];
    return caja.personas.filter((p) => p.activa && (norm(p.nombre).includes(q) || p.alias.some((a) => norm(a).includes(q)))).slice(0, 5);
  }, [pagadoA, pagadoAId, caja.personas]);
  const paraSug = useMemo(() => {
    const q = norm(buscarPara);
    return equipo.filter((p) => !paraIds.includes(p.id) && (!q || norm(p.nombre).includes(q))).slice(0, 8);
  }, [buscarPara, equipo, paraIds]);

  const dup = nro.trim() ? buscarDuplicado(caja.movs, nro, mov?.id) : undefined;
  const planilla = tipo === "EGRESO" && categoria === "Viáticos" && subcategoria === "Menú" ? para.map((p) => porId.get(p.persona_id)).filter((p) => p?.tipo === "PLANILLA") : [];

  const elegirTipo = (v: TipoMov) => {
    setTipo(v);
    setCategoria("");
    setSubcategoria("");
    setErr({});
  };
  const quitarPara = (id: string) => {
    setParaIds((p) => p.filter((x) => x !== id));
    setParaMontos({});
  };
  const agregarPara = (id: string) => {
    setParaIds((p) => [...p, id]);
    setParaMontos({});
    setBuscarPara("");
  };

  const agregarFoto = async (origen: "camara" | "galeria") => {
    setErrFoto(null);
    setOcupado(true);
    try {
      const r = await elegirFoto(origen);
      if (r) setFotos((p) => [...p, { id: nuevoId(), nueva: r.guardada }]);
    } catch (x) {
      setErrFoto(x instanceof FotoError ? x.message : "No se pudo agregar la foto.");
    } finally {
      setOcupado(false);
    }
  };
  const cancelar = () => {
    for (const f of fotos) if (f.nueva && f.nueva.key !== fotoInicial?.key) void borrarFoto(f.nueva.key);
    onClose();
  };

  const guardar = () => {
    const reconocida = pagadoAId || (pagadoA.trim() ? buscarPersona(pagadoA, caja.personas)?.id ?? "" : "");
    const m: NuevoMov = {
      id: mov?.id ?? nuevoId(),
      tipo, fecha, hora, cuenta_id: cuentaId, destino_id: tipo === "TRASPASO" ? destinoId : "", monto: n,
      categoria: tipo === "TRASPASO" ? "" : categoria, subcategoria: tipo === "TRASPASO" ? "" : subcategoria, concepto: concepto.trim(),
      pagado_a: pagadoA.trim(), pagado_a_id: reconocida,
      para: tipo === "EGRESO" ? para : [], nro_operacion: nro.trim(), origen: mov?.origen ?? (fotoInicial ? "CAPTURA" : "MANUAL"),
    };
    const e = validarMov(m, caja.cuentas);
    if (dup) (e as Record<string, string>).nro = "Esta operación ya está registrada";
    setErr(e as Record<string, string>);
    if (Object.keys(e).length) return;
    onGuardar(m, fotos);
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <Header kicker={mov ? "EDITAR MOVIMIENTO" : "NUEVO MOVIMIENTO"} title={titulo ?? (mov ? "Corregir movimiento" : "Registrar movimiento")} sub={mov ? "Los saldos se recalculan solos" : "Revisa los datos antes de guardar"} onBack={cancelar} topInset={topInset} tone={tipo === "INGRESO" ? "teal" : "ink"} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 24, gap: 18 }} keyboardShouldPersistTaps="handled">
          {aviso?.length ? (
            <View style={{ backgroundColor: "#FFF4D6", borderRadius: 14, padding: 12, gap: 4 }}>
              {aviso.map((a) => (
                <Text key={a} style={t(12, 700, C.ink, { lineHeight: 17 })}>• {a}</Text>
              ))}
            </View>
          ) : null}

          <View>
            <FieldLabel>TIPO</FieldLabel>
            <OptionGrid options={TIPOS_MOV} value={tipo} onPick={elegirTipo} columns={3} height={44} fontSize={13} labels={TIPO_MOV_LABEL} />
          </View>

          <View>
            <FieldLabel>{tipo === "INGRESO" ? "ENTRA A LA CUENTA" : tipo === "TRASPASO" ? "SALE DE" : "SALE DE LA CUENTA"}</FieldLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {cuentas.map((c) => (
                <Chip key={c.id} label={c.nombre} active={cuentaId === c.id} onPress={() => setCuentaId(c.id)} />
              ))}
              {!cuentas.length ? <Text style={t(12, 600, C.red)}>Primero crea una cuenta en Libreta › Cuentas.</Text> : null}
            </View>
            <ErrorText>{err.cuenta}</ErrorText>
          </View>

          {tipo === "TRASPASO" ? (
            <View>
              <FieldLabel>LLEGA A</FieldLabel>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {cuentas.filter((c) => c.id !== cuentaId).map((c) => (
                  <Chip key={c.id} label={c.nombre} active={destinoId === c.id} onPress={() => setDestinoId(c.id)} />
                ))}
              </View>
              <ErrorText>{err.destino}</ErrorText>
            </View>
          ) : null}

          <View>
            <FieldLabel>MONTO</FieldLabel>
            <AmountField value={monto} onChangeText={(v) => (setMonto(v.replace(/[^\d.]/g, "")), setParaMontos({}))} accent={color} />
            <ErrorText>{err.monto}</ErrorText>
          </View>

          <View>
            <FieldLabel>FECHA</FieldLabel>
            <DateField value={fecha} onChange={setFecha} />
            <ErrorText>{err.fecha}</ErrorText>
          </View>

          {tipo !== "TRASPASO" ? (
            <View>
              <FieldLabel>CATEGORÍA</FieldLabel>
              <OptionGrid options={categorias} value={categoria} onPick={(v) => (setCategoria(v), setSubcategoria(""))} columns={tipo === "INGRESO" ? 3 : 2} height={44} fontSize={12.5} />
              <ErrorText>{err.categoria}</ErrorText>
              {subs.length ? (
                <View style={{ marginTop: 12 }}>
                  <FieldLabel optional={categoria !== "Gastos fijos"}>TIPO</FieldLabel>
                  <OptionGrid options={subs} value={subcategoria} onPick={(v) => setSubcategoria(subcategoria === v && categoria !== "Gastos fijos" ? "" : v)} columns={3} height={42} fontSize={12.5} />
                  <ErrorText>{err.subcategoria}</ErrorText>
                </View>
              ) : null}
            </View>
          ) : null}

          {tipo !== "TRASPASO" ? (
            <View>
              <FieldLabel optional>{tipo === "INGRESO" ? "DE QUIÉN" : "A QUIÉN SE PAGÓ"}</FieldLabel>
              <TextField value={pagadoA} onChangeText={(v) => (setPagadoA(v), setPagadoAId(""))} placeholder="Nombre tal como sale en la captura" accessibilityLabel="A quién se pagó" />
              {pagadoAId ? <Text style={t(11.5, 700, C.teal, { marginTop: 6 })}>✓ En la libreta: {porId.get(pagadoAId)?.nombre}</Text> : null}
              {sugerencias.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {sugerencias.map((p) => (
                    <Pressable key={p.id} onPress={() => (setPagadoA(p.nombre), setPagadoAId(p.id))} style={{ paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card }}>
                      <Text style={t(11.5, 700)}>{p.nombre}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {tipo === "EGRESO" ? (
            <View>
              <FieldLabel optional>PARA QUIÉN FUE</FieldLabel>
              {para.length ? (
                <View style={[card(14), { overflow: "hidden", marginBottom: 10 }]}>
                  {para.map((p, i) => (
                    <View key={p.persona_id} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 11, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: C.stripeA }}>
                      <Text style={t(13, 700, C.ink, { flex: 1 })} numberOfLines={1}>{porId.get(p.persona_id)?.nombre ?? "—"}</Text>
                      <Text style={t(13, 800, C.red, { fontVariant: ["tabular-nums"] })}>{money(p.monto)}</Text>
                      <Pressable onPress={() => quitarPara(p.persona_id)} hitSlop={8} accessibilityLabel="Quitar persona">
                        <Text style={t(16, 800, C.muted)}>×</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
              <TextField value={buscarPara} onChangeText={setBuscarPara} placeholder="Buscar en la libreta (trabajador o practicante)" accessibilityLabel="Buscar persona" />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {paraSug.map((p) => (
                  <Pressable key={p.id} onPress={() => agregarPara(p.id)} style={{ paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card }}>
                    <Text style={t(11.5, 700)}>+ {p.nombre}</Text>
                  </Pressable>
                ))}
                {!equipo.length ? <Text style={t(11.5, 400, C.muted)}>La libreta está vacía: agrégalos en Libreta › Personas.</Text> : null}
              </View>
              <Text style={t(11, 400, C.muted, { marginTop: 8, lineHeight: 15 })}>Si lo pagas directo a una persona del equipo (un pasaje, por ejemplo), no hace falta: se le carga a ella. Con varias personas el monto se reparte en partes iguales.</Text>
              <ErrorText>{err.para}</ErrorText>
              {planilla.length ? <Text style={t(12, 700, C.red, { marginTop: 6 })}>{planilla.map((p) => p!.nombre).join(", ")} está en planilla: no recibe menú.</Text> : null}
            </View>
          ) : null}

          <View>
            <FieldLabel optional>CONCEPTO</FieldLabel>
            <TextField value={concepto} onChangeText={setConcepto} placeholder="Ej. Menú, Pasaje AQP MOQ, gasolina" accessibilityLabel="Concepto" />
          </View>

          <View>
            <FieldLabel optional>N° DE OPERACIÓN</FieldLabel>
            <TextField value={nro} onChangeText={(v) => setNro(v.replace(/\s/g, ""))} placeholder="Lo que dice la captura (evita registrar dos veces lo mismo)" keyboardType="number-pad" accessibilityLabel="Número de operación" />
            {dup ? <Text style={t(12, 700, C.red, { marginTop: 6 })}>Ya está registrada: {dup.concepto || dup.pagado_a || "otro movimiento"} del {dup.fecha}.</Text> : null}
            <ErrorText>{err.nro}</ErrorText>
          </View>

          <Seccion titulo="FOTOS DEL COMPROBANTE">
            <FotosBloque items={fotos} onAgregar={(o) => void agregarFoto(o)} onQuitar={(id) => setFotos((p) => p.filter((f) => f.id !== id))} error={errFoto} ocupado={ocupado} />
          </Seccion>

          {onEliminar ? (
            borrando ? (
              <View style={{ gap: 10 }}>
                <Text style={t(12.5, 600, C.ink, { lineHeight: 18 })}>¿Eliminar este movimiento? Los saldos se recalculan.</Text>
                <SecondaryButton label="Sí, eliminar" onPress={onEliminar} danger />
                <SecondaryButton label="No, conservar" onPress={() => setBorrando(false)} />
              </View>
            ) : (
              <SecondaryButton label="Eliminar movimiento" onPress={() => setBorrando(true)} danger />
            )
          ) : null}
        </ScrollView>
        <BottomBar bottomInset={bottomInset}>
          <Text style={kicker(C.muted, 10)}>{n > 0 ? `${TIPO_MOV_LABEL[tipo].toUpperCase()} · ${money(n)}` : " "}</Text>
          <PrimaryButton label={mov ? "GUARDAR CAMBIOS" : "GUARDAR MOVIMIENTO"} onPress={guardar} />
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}
