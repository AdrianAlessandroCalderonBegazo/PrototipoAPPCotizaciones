/**
 * Gasto físico (efectivo, con su foto del recibo) o venta / ingreso (efectivo o digital). También corrige un movimiento
 * ya registrado. La categoría «Depósito a cuenta principal» saca el dinero de la caja y lo suma a la cuenta principal del ERP.
 */
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { C, t } from "../../theme";
import { AmountField, BottomBar, Cuerpo, DateField, ErrorText, FieldLabel, Header, OptionGrid, PrimaryButton, Screen, TextField } from "../../components/ui";
import { FotosGuardadas, FotosNuevas, Franja } from "../../components/icr";
import { SelectorProyecto } from "../../components/SelectorProyecto";
import { ANCHO } from "../../lib/layout";
import { today } from "../../lib/format";
import { leerComprobante } from "../../lib/ocr";
import * as icr from "../../lib/icr/api";
import { leerMonto, soles } from "../../lib/icr/dinero";
import { elegirFoto, FotoError } from "../../lib/icr/foto";
import { nuevoId } from "../../lib/icr/ids";
import { COMPROBANTES, COMPROBANTE_LABEL, MEDIO_LABEL, type Comprobante, type Medio, type Mov, type Resumen } from "../../lib/icr/tipos";

export type ModoForm = "gasto" | "venta";

export function MovForm({ modo, mov, opciones, onCerrar, onListo, topInset, bottomInset }: {
  modo: ModoForm;
  /** Si viene, se corrige este movimiento en lugar de registrar uno nuevo. */
  mov?: Mov;
  opciones: Pick<Resumen, "categorias" | "subcategorias" | "categoria_deposito">;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
  topInset: number;
  bottomInset: number;
}) {
  const venta = modo === "venta";
  const soloTexto = mov && (mov.origen === "FONDO" || mov.origen === "DEPOSITO");
  const captura = mov?.origen === "CAPTURA";
  const cats = (venta ? opciones.categorias.INGRESO : opciones.categorias.EGRESO).filter((c) => !mov || c !== opciones.categoria_deposito);
  const idRef = useRef(nuevoId()); // el mismo id en cada reintento: el servidor no duplica
  const [f, setF] = useState({
    categoria: mov?.categoria ?? (venta ? "Venta" : ""),
    subcategoria: mov?.subcategoria ?? "",
    descripcion: mov?.descripcion ?? "",
    monto: mov?.monto ?? "",
    fecha: mov?.fecha ?? today(),
    persona: mov?.persona ?? "",
    medio: (mov?.medio ?? (venta ? "" : "EFECTIVO")) as Medio | "",
    comprobante: (mov?.comprobante ?? "") as Comprobante | "",
    proyecto_id: mov?.proyecto_id ?? null,
  });
  const [fotos, setFotos] = useState<string[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [intento, setIntento] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deposito = !venta && f.categoria === opciones.categoria_deposito;
  const subs = opciones.subcategorias[f.categoria] ?? [];
  const monto = leerMonto(String(f.monto));
  const faltan = useMemo(() => {
    const e: Record<string, string> = {};
    if (!f.categoria) e.categoria = "Elige una categoría.";
    if (subs.length && !f.subcategoria) e.subcategoria = "Elige una subcategoría.";
    if (!f.descripcion.trim()) e.descripcion = "Escribe qué fue.";
    if (!monto) e.monto = "Escribe un monto mayor a 0 (hasta 2 decimales).";
    if (!f.medio) e.medio = "Elige si fue en efectivo o digital.";
    if (f.fecha > today()) e.fecha = "La fecha no puede ser futura.";
    return e;
  }, [f, monto, subs.length]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const agregarFoto = async (o: "camara" | "galeria") => {
    setError(null);
    try {
      const uri = await elegirFoto(o);
      if (!uri) return;
      setFotos((x) => [...x, uri]);
      if (venta || mov || fotos.length) return;
      // primera foto de un gasto nuevo: se lee el recibo y se llenan los campos vacíos
      setLeyendo(true);
      try {
        const r = await leerComprobante(uri);
        setF((x) => ({
          ...x,
          monto: x.monto || (r.monto && leerMonto(r.monto) ? r.monto : ""),
          fecha: r.fecha && r.fecha <= today() ? r.fecha : x.fecha,
          persona: x.persona || r.persona,
          descripcion: x.descripcion || r.desc,
          categoria: x.categoria || (r.categoria && cats.includes(r.categoria) ? r.categoria : ""),
          subcategoria: x.subcategoria || r.subcategoria || "",
        }));
      } catch {
        // si no se puede leer, se llena a mano
      } finally {
        setLeyendo(false);
      }
    } catch (e) {
      setError(e instanceof FotoError ? e.message : "No se pudo abrir la foto.");
    }
  };

  const guardar = async () => {
    setIntento(true);
    if (Object.keys(faltan).length) return;
    setEnviando(true);
    setError(null);
    try {
      let id = mov?.id;
      let aviso: string | null = null;
      if (mov) {
        await icr.editar(mov.id, soloTexto ? { descripcion: f.descripcion } : {
          descripcion: f.descripcion, monto: monto!, fecha: f.fecha, categoria: f.categoria, subcategoria: f.subcategoria || null, persona: f.persona || null,
          ...(captura || mov.origen === "VENTA" || mov.origen === "AJUSTE" ? {} : { comprobante: (f.comprobante || null) as Comprobante | null, proyecto_id: f.proyecto_id }),
          ...(captura ? {} : { medio: f.medio as Medio }),
        });
      } else {
        const r = await icr.registrar({
          id: idRef.current, origen: venta ? "VENTA" : "GASTO", medio: f.medio as Medio, fecha: f.fecha, monto: monto!, descripcion: f.descripcion, categoria: f.categoria,
          subcategoria: f.subcategoria || null, persona: f.persona || null, comprobante: venta ? null : (f.comprobante || null) as Comprobante | null,
          proyecto_id: venta || deposito ? null : f.proyecto_id,
        });
        id = r.mov.id;
        aviso = r.aviso;
      }
      const fallidas: number[] = [];
      for (let i = 0; i < fotos.length; i++) {
        try {
          await icr.subirFoto(id!, fotos[i]);
        } catch {
          fallidas.push(i);
        }
      }
      if (fallidas.length) {
        // el movimiento ya quedó registrado: solo faltan fotos; se queda en la pantalla para reintentarlas
        setFotos((x) => x.filter((_, i) => fallidas.includes(i)));
        setError(`Se registró, pero ${fallidas.length === 1 ? "una foto no se pudo subir" : `${fallidas.length} fotos no se pudieron subir`}. Pulsa de nuevo para reintentar.`);
        return;
      }
      onListo(mov ? "Corrección guardada." : `${venta ? "Ingreso" : deposito ? "Depósito" : "Gasto"} de ${soles(monto)} registrado.${deposito ? " Ya está en la cuenta principal del ERP." : ""}${aviso ? ` ${aviso}` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  };

  const titulo = mov ? "Corregir movimiento" : venta ? "Venta / ingreso" : "Gasto físico";
  const sub = mov ? "Queda en el historial de cambios, con el antes y el después." : venta ? "Entra a la caja: en efectivo o digital (Yape / transferencia)." : "Sale del efectivo de la caja. Toma la foto del recibo.";
  const e = (k: string) => (intento ? faltan[k] : undefined);
  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Header kicker="CAJA ICR" title={titulo} sub={sub} onBack={onCerrar} topInset={topInset} tone={venta ? "teal" : "ink"} />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Cuerpo ancho={ANCHO.formulario - 40} style={{ gap: 18 }}>
            {soloTexto ? <Franja texto={mov!.origen === "FONDO" ? "Un fondo enviado desde el ERP solo se corrige en el ERP: aquí puedes cambiar la descripción." : "Un depósito a la cuenta principal no se corrige: anúlalo y regístralo de nuevo. Aquí puedes cambiar la descripción."} /> : null}
            {!soloTexto ? (
              <View>
                <FieldLabel>Categoría</FieldLabel>
                <OptionGrid options={cats} value={f.categoria} onPick={(c) => setF((x) => ({ ...x, categoria: c, subcategoria: "", ...(c === opciones.categoria_deposito ? { proyecto_id: null } : {}) }))} columns={venta ? 3 : 2} height={44} fontSize={12.5} />
                <ErrorText>{e("categoria")}</ErrorText>
              </View>
            ) : null}
            {deposito ? <Franja tono="alerta" texto="Este dinero sale de la Caja ICR y entra a la cuenta principal del ERP (en la misma operación). Si te equivocas, anúlalo desde el Historial: se anula en los dos lados." /> : null}
            {!soloTexto && subs.length ? (
              <View>
                <FieldLabel>Subcategoría</FieldLabel>
                <OptionGrid options={subs} value={f.subcategoria} onPick={(s) => set("subcategoria", s)} columns={3} height={42} fontSize={12.5} />
                <ErrorText>{e("subcategoria")}</ErrorText>
              </View>
            ) : null}
            {!soloTexto && (venta || deposito) && !captura ? (
              <View>
                <FieldLabel>{venta ? "¿Cómo entró?" : "¿De qué saldo sale?"}</FieldLabel>
                <OptionGrid options={["EFECTIVO", "DIGITAL"] as Medio[]} value={f.medio} onPick={(m) => set("medio", m)} columns={2} height={46} fontSize={13} labels={{ EFECTIVO: MEDIO_LABEL.EFECTIVO, DIGITAL: "Digital (Yape / transf.)" }} />
                <ErrorText>{e("medio")}</ErrorText>
              </View>
            ) : null}
            <View>
              <FieldLabel>Descripción</FieldLabel>
              <TextField value={f.descripcion} onChangeText={(v) => set("descripcion", v)} placeholder={venta ? "Ej. Venta de 2 paneles 550 W" : deposito ? "Ej. Depósito en BCP agencia Mercaderes" : "Ej. Taxi a la obra de Characato"} maxLength={300} />
              <ErrorText>{e("descripcion")}</ErrorText>
            </View>
            {!soloTexto ? (
              <>
                <View>
                  <FieldLabel>Monto</FieldLabel>
                  <AmountField value={String(f.monto)} onChangeText={(v) => set("monto", v)} accent={venta ? C.teal : C.navy} />
                  <ErrorText>{e("monto")}</ErrorText>
                </View>
                <View>
                  <FieldLabel>Fecha</FieldLabel>
                  <DateField value={f.fecha} onChange={(v) => set("fecha", v)} />
                  <ErrorText>{e("fecha")}</ErrorText>
                </View>
                <View>
                  <FieldLabel optional>{venta ? "Cliente o quién recibió" : "Quién gastó"}</FieldLabel>
                  <TextField value={f.persona} onChangeText={(v) => set("persona", v)} placeholder={venta ? "Ej. Bodega San Martín" : "Ej. Luis"} maxLength={120} />
                </View>
              </>
            ) : null}
            {!soloTexto && !venta && !deposito && !captura && mov?.origen !== "AJUSTE" ? (
              <>
                <View>
                  <FieldLabel optional>Comprobante</FieldLabel>
                  <OptionGrid options={COMPROBANTES} value={f.comprobante} onPick={(c) => set("comprobante", f.comprobante === c ? "" : c)} columns={4} height={42} fontSize={12} labels={COMPROBANTE_LABEL} />
                </View>
                <View>
                  <FieldLabel optional>Proyecto</FieldLabel>
                  <SelectorProyecto value={f.proyecto_id} nombreActual={mov?.proyecto} onPick={(p) => set("proyecto_id", f.proyecto_id === p.id ? null : p.id)} />
                </View>
              </>
            ) : null}
            {!soloTexto || mov ? (
              <View>
                <FieldLabel optional={venta || deposito}>{venta ? "Foto" : "Foto del recibo"}</FieldLabel>
                {mov?.adjuntos.length ? <View style={{ marginBottom: 12 }}><FotosGuardadas ids={mov.adjuntos} /></View> : null}
                <FotosNuevas uris={fotos} onAgregar={(o) => void agregarFoto(o)} onQuitar={(i) => setFotos((x) => x.filter((_, j) => j !== i))} ocupado={leyendo || enviando} texto={mov ? "Puedes agregar más fotos." : "Aún no hay fotos."} />
                {leyendo ? <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8 }}><ActivityIndicator color={C.teal} /><Text style={t(12, 600, C.muted)}>Leyendo el recibo…</Text></View> : null}
              </View>
            ) : null}
            {error ? <Franja tono="error" texto={error} /> : null}
          </Cuerpo>
        </ScrollView>
        <BottomBar bottomInset={bottomInset}>
          {enviando ? <ActivityIndicator color={C.teal} style={{ height: 54 }} /> : <PrimaryButton label={mov ? "GUARDAR CORRECCIÓN" : venta ? "REGISTRAR INGRESO" : deposito ? "REGISTRAR DEPÓSITO" : "REGISTRAR GASTO"} onPress={() => void guardar()} />}
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}
