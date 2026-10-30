import assert from "node:assert/strict";
import { test } from "node:test";
import { leerEventos, piezasDeTexto } from "./ia";

test("leerEventos: junta eventos que llegan partidos, ignora latidos y deja el resto", () => {
  const a = leerEventos('data: {"tipo":"texto","t":"Ho"}\n\n: esperando\n\ndata: {"tipo":"texto",');
  assert.deepEqual(a.eventos, [{ tipo: "texto", t: "Ho" }]);
  const b = leerEventos(`${a.resto}"t":"la"}\n\ndata: {"tipo":"fin"`);
  assert.deepEqual(b.eventos, [{ tipo: "texto", t: "la" }]);
  assert.equal(b.resto, 'data: {"tipo":"fin"');
  assert.deepEqual(leerEventos("data: {roto}\n\n").eventos, []);
});

test("piezasDeTexto: negritas y listas sin HTML", () => {
  const p = piezasDeTexto("Se gastó **S/ 129.50**.\n- Taxi\n2. Almuerzo\n<b>no</b>");
  assert.deepEqual(p[0].partes, [{ t: "Se gastó ", negrita: false }, { t: "S/ 129.50", negrita: true }, { t: ".", negrita: false }]);
  assert.equal(p[1].lista, true);
  assert.equal(p[2].partes[0].t, "Almuerzo");
  assert.equal(p[3].partes[0].t, "<b>no</b>"); // se muestra como texto, no se interpreta
});
