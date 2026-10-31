import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { C, card, kicker, t } from "../theme";
import { Cuerpo, TealGradient } from "../components/ui";
import { ANCHO } from "../lib/layout";
import { iaJson, piezasDeTexto, preguntar, type Bloque, type Conversacion, type EstadoIa, type MensajeIa } from "../lib/ia";

/** Preguntas de un toque (las más usadas). */
const FRECUENTES = [
  "¿Cuánto se gastó esta semana?",
  "¿Qué gastos de caja chica no tienen recibo este mes?",
  "¿Cuál es el saldo de las cajas?",
  "¿Cuánto se gastó en movilidad este mes en Moquegua?",
  "¿Cómo va la caja diaria y el Yape este mes?",
];

type Vivo = { pregunta: string; texto: string; consultando: string[] };

/** Preguntar: consultas sobre la caja diaria y la caja chica. La IA solo lee; los totales los calcula el servidor. */
export function Preguntar({ topInset }: { topInset: number; bottomInset: number }) {
  const [estado, setEstado] = useState<EstadoIa | null>(null);
  const [conv, setConv] = useState<(Conversacion & { mensajes: MensajeIa[] }) | null>(null);
  const [lista, setLista] = useState<Conversacion[]>([]);
  const [verLista, setVerLista] = useState(false);
  const [vivo, setVivo] = useState<Vivo | null>(null);
  const [lento, setLento] = useState(false);
  const [texto, setTexto] = useState("");
  const [porVoz, setPorVoz] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const revisar = useCallback(() => void iaJson<EstadoIa>("GET", "/estado").then(setEstado).catch((e) => setEstado({ disponible: false, motivo: "sin_conexion", detalle: e.message, modelo: "" })), []);
  const cargarLista = useCallback(() => void iaJson<Conversacion[]>("GET", "/finanzas/conversaciones").then(setLista).catch(() => null), []);
  useEffect(() => {
    revisar();
    cargarLista();
  }, [revisar, cargarLista]);
  useEffect(() => {
    const id = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [conv?.mensajes.length, vivo?.texto, vivo?.consultando.length]);

  const abrir = async (id: number) => {
    setVerLista(false);
    setConv(await iaJson<Conversacion & { mensajes: MensajeIa[] }>("GET", `/finanzas/conversaciones/${id}`).catch(() => null));
  };
  const enviar = async (pregunta: string, voz = false) => {
    const q = pregunta.trim();
    if (!q || vivo) return;
    setTexto("");
    setPorVoz(false);
    setVivo({ pregunta: q, texto: "", consultando: [] });
    setLento(false);
    const reloj = setTimeout(() => setLento(true), 12_000);
    let id = conv?.id ?? null;
    await preguntar({ conversacion_id: conv?.id ?? null, texto: q, por_voz: voz }, (e) => {
      if (e.tipo === "conversacion") id = e.id;
      if (e.tipo === "texto") {
        clearTimeout(reloj);
        setVivo((v) => (v ? { ...v, texto: v.texto + e.t } : v));
      }
      if (e.tipo === "borrar") setVivo((v) => (v ? { ...v, texto: "" } : v)); // era un borrador del modelo
      if (e.tipo === "herramienta" && e.fuente) setVivo((v) => (v && !v.consultando.includes(e.fuente!) ? { ...v, consultando: [...v.consultando, e.fuente!] } : v));
    });
    clearTimeout(reloj);
    setLento(false);
    if (id) await abrir(id);
    setVivo(null);
    cargarLista();
  };

  const sinIa = estado && !estado.disponible;
  const mensajes = conv?.mensajes ?? [];
  return (
    <View style={{ flex: 1 }}>
      <TealGradient ancho={ANCHO.lista} style={{ paddingTop: 18 + topInset, paddingHorizontal: 20, paddingBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={kicker("rgba(255,255,255,.9)", 11)}>PREGUNTAR</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <BotonClaro label="Mis consultas" onPress={() => setVerLista(!verLista)} />
            <BotonClaro label="Nueva" onPress={() => (setConv(null), setVerLista(false))} />
          </View>
        </View>
        <Text style={t(24, 800, C.white, { letterSpacing: -0.5, marginTop: 12 })}>Consulta tus cajas</Text>
        <Text style={t(12, 400, "rgba(255,255,255,.88)", { marginTop: 2 })}>La IA solo lee: no registra ni cambia nada. Verifica las cifras importantes.</Text>
      </TealGradient>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        <Cuerpo ancho={ANCHO.lista} style={{ padding: 16, gap: 12 }}>
          {sinIa ? (
            <View style={[card(14), { padding: 14, gap: 8, backgroundColor: C.stripeA }]}>
              <Text style={t(13, 800)}>La IA no está disponible ahora.</Text>
              <Text style={t(12, 400, C.muted)}>{estado?.motivo === "no_instalada" ? "Todavía no se instaló en el servidor." : estado?.detalle} Las preguntas frecuentes igual se responden al instante (sin IA).</Text>
              <Pressable onPress={revisar}><Text style={t(12, 800, C.teal)}>COMPROBAR DE NUEVO</Text></Pressable>
            </View>
          ) : null}

          {verLista ? (
            <View style={[card(14), { overflow: "hidden" }]}>
              <Text style={[kicker(C.ink, 11), { padding: 14, paddingBottom: 6 }]}>MIS CONSULTAS</Text>
              {lista.length ? lista.map((c) => (
                <Pressable key={c.id} onPress={() => void abrir(c.id)} style={{ paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line }}>
                  <Text style={t(13, 700)} numberOfLines={1}>{c.titulo}</Text>
                  <Text style={t(11, 400, C.muted)}>{c.actualizado_en.slice(0, 16).replace("T", " ").replace(/^(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1")} · {c.n_mensajes} mensajes</Text>
                </Pressable>
              )) : <Text style={t(12, 400, C.muted, { padding: 14 })}>Todavía no hiciste consultas.</Text>}
            </View>
          ) : null}

          {!conv && !vivo && !verLista ? (
            <View style={{ gap: 8 }}>
              <Text style={kicker(C.ink, 11)}>PREGUNTAS FRECUENTES · AL INSTANTE</Text>
              {FRECUENTES.map((f) => (
                <Pressable key={f} disabled={!!vivo} onPress={() => void enviar(f)} style={({ pressed }) => [card(12), { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: pressed ? C.tint : C.card }]}>
                  <Text style={t(13, 600, C.ink)}>{f}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {mensajes.map((m) =>
            m.rol === "usuario" ? <Burbuja key={m.id} texto={m.texto} voz={m.por_voz} />
              : m.rol === "error" ? (
                <View key={m.id} style={[card(12), { padding: 12, borderColor: C.red }]}><Text style={t(12.5, 600, C.red)}>No se pudo responder: {m.texto}</Text></View>
              ) : <Respuesta key={m.id} m={m} />,
          )}
          {vivo ? (
            <>
              <Burbuja texto={vivo.pregunta} voz={false} />
              {vivo.texto ? <TextoIa texto={vivo.texto} /> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator color={C.teal} size="small" />
                <Text style={t(12.5, 700, C.teal)}>Pensando…{vivo.consultando.length ? ` consultando ${vivo.consultando.join(", ")}` : ""}</Text>
              </View>
              {lento ? <Text style={t(11.5, 600, "#9A6700")}>El servidor responde lento. Puedes seguir esperando.</Text> : null}
            </>
          ) : null}
        </Cuerpo>
      </ScrollView>

      <Cuerpo ancho={ANCHO.lista} style={{ paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.card }}>
        {porVoz ? <Text style={t(11.5, 600, C.teal, { marginBottom: 6 })}>Transcripción lista: revísala y corrige antes de enviar.</Text> : null}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            editable
            multiline
            placeholder="Ej. ¿Cuánto se gastó en movilidad esta semana?"
            placeholderTextColor={C.placeholder}
            onKeyPress={(e) => {
              const ev = e.nativeEvent as { key: string; shiftKey?: boolean };
              if (Platform.OS === "web" && ev.key === "Enter" && !ev.shiftKey) {
                (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                void enviar(texto, porVoz);
              }
            }}
            style={[t(14, 500), { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.card }]}
          />
          <Microfono deshabilitado={false} base={texto} onTexto={(x) => (setTexto(x), setPorVoz(true))} />
          <Pressable onPress={() => void enviar(texto, porVoz)} disabled={!texto.trim() || !!vivo} accessibilityLabel="Enviar"
            style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.teal, alignItems: "center", justifyContent: "center", opacity: !texto.trim() || vivo ? 0.4 : 1 }}>
            <Text style={t(20, 800, C.white)}>↑</Text>
          </Pressable>
        </View>
      </Cuerpo>
    </View>
  );
}

function BotonClaro({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "rgba(255,255,255,.18)" }}>
      <Text style={t(11.5, 800, C.white)}>{label}</Text>
    </Pressable>
  );
}

function Burbuja({ texto, voz }: { texto: string; voz: boolean }) {
  return (
    <View style={{ alignSelf: "flex-end", maxWidth: "88%", backgroundColor: C.teal, borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10 }}>
      <Text style={t(13.5, 500, C.white)}>{voz ? "🎤 " : ""}{texto}</Text>
    </View>
  );
}

function TextoIa({ texto }: { texto: string }) {
  return (
    <View style={[card(16), { borderTopLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10, gap: 4 }]}>
      {piezasDeTexto(texto).map((p, i) => (
        <Text key={i} style={t(13.5, 500, C.ink, { lineHeight: 20 })}>
          {p.lista ? "•  " : ""}
          {p.partes.map((x, j) => <Text key={j} style={x.negrita ? t(13.5, 800) : undefined}>{x.t}</Text>)}
        </Text>
      ))}
    </View>
  );
}

function Respuesta({ m }: { m: MensajeIa }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {m.datos?.rapida ? (
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: C.tint }}><Text style={t(10.5, 800, C.teal)}>⚡ RESPUESTA DIRECTA · SIN IA</Text></View>
        ) : (
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "#EFE9FF" }}><Text style={t(10.5, 800, "#6D4BD8")}>✦ GENERADO POR IA</Text></View>
        )}
        {m.duracion_ms ? <Text style={t(10.5, 400, C.muted)}>{(m.duracion_ms / 1000).toFixed(1)} s</Text> : null}
      </View>
      {m.texto ? <TextoIa texto={m.texto} /> : null}
      {(m.datos?.bloques ?? []).map((b, i) => <BloqueVista key={i} b={b} />)}
      {m.datos?.fuentes?.length ? <Text style={t(11, 600, C.muted)}>Fuentes: {m.datos.fuentes.join(" · ")}</Text> : null}
    </View>
  );
}

function BloqueVista({ b }: { b: Bloque }) {
  if (b.tipo === "kpis")
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {b.items.map((k) => (
          <View key={k.l} style={[card(12), { padding: 10, flexGrow: 1, flexBasis: "45%" }]}>
            <Text style={t(10.5, 600, C.muted)}>{k.l}</Text>
            <Text style={t(15.5, 800, k.c === "peligro" ? C.red : k.c === "primario" ? C.teal : C.ink, { marginTop: 2 })}>{k.v}</Text>
          </View>
        ))}
      </View>
    );
  if (b.tipo === "grafico") {
    const max = Math.max(1, ...b.barras.map((x) => x.v));
    return (
      <View style={[card(12), { padding: 12, gap: 8 }]}>
        <Text style={t(12, 800)}>{b.titulo}</Text>
        {b.barras.map((x, i) => (
          <View key={i} style={{ gap: 3 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={t(11.5, 600, C.soft)} numberOfLines={1}>{x.l}</Text>
              <Text style={t(11.5, 800)}>{x.texto}</Text>
            </View>
            <View style={{ height: 7, borderRadius: 4, backgroundColor: C.stripeA, overflow: "hidden" }}>
              <View style={{ height: 7, width: `${Math.max(2, (x.v / max) * 100)}%`, backgroundColor: x.v === max ? "#6D4BD8" : C.teal, borderRadius: 4 }} />
            </View>
          </View>
        ))}
      </View>
    );
  }
  const ancho = (j: number) => (j === 1 ? 180 : 104);
  return (
    <View style={[card(12), { overflow: "hidden" }]}>
      <Text style={[t(12, 800), { padding: 10, paddingBottom: 6 }]}>{b.titulo}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ minWidth: "100%" }}>
          <View style={{ flexDirection: "row", paddingHorizontal: 10, paddingBottom: 6 }}>
            {b.columnas.map((c, j) => <Text key={c.l} style={[kicker(C.muted, 9.5), { width: ancho(j), paddingHorizontal: 6, textAlign: c.a === "right" ? "right" : "left" }]}>{c.l.toUpperCase()}</Text>)}
          </View>
          {b.filas.map((f, i) => (
            <View key={i} style={{ flexDirection: "row", paddingHorizontal: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.line }}>
              {f.map((v, j) => <Text key={j} style={[t(12, j === 0 ? 700 : 500), { width: ancho(j), paddingHorizontal: 6, textAlign: b.columnas[j]?.a === "right" ? "right" : "left" }]} numberOfLines={2}>{v}</Text>)}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** Dictado por voz del navegador (Chrome/Edge, también en Android). En la app nativa no aparece. */
type Reconocedor = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
function Microfono({ deshabilitado, base, onTexto }: { deshabilitado: boolean; base: string; onTexto: (t: string) => void }) {
  const [grabando, setGrabando] = useState(false);
  const rec = useRef<Reconocedor | null>(null);
  const R = Platform.OS === "web" && typeof window !== "undefined" ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : null;
  if (!R) return null;
  const alternar = () => {
    if (grabando) return rec.current?.stop();
    const r: Reconocedor = new R();
    r.lang = "es-PE";
    r.continuous = true;
    r.interimResults = true;
    let finales = "";
    r.onresult = (e) => {
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finales += `${e.results[i][0].transcript} `;
        else parcial += e.results[i][0].transcript;
      }
      onTexto(`${base ? `${base} ` : ""}${finales}${parcial}`.trimStart());
    };
    r.onend = () => setGrabando(false);
    r.onerror = () => setGrabando(false);
    rec.current = r;
    setGrabando(true);
    r.start();
  };
  return (
    <Pressable onPress={alternar} disabled={deshabilitado} accessibilityLabel={grabando ? "Detener" : "Dictar por voz"}
      style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: grabando ? C.red : C.border, alignItems: "center", justifyContent: "center", backgroundColor: grabando ? "#FDECEC" : C.card }}>
      <Text style={t(16, 800, grabando ? C.red : C.soft)}>{grabando ? "■" : "🎤"}</Text>
    </Pressable>
  );
}
