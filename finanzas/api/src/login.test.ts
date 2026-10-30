import { test } from "node:test";
import assert from "node:assert/strict";
import { loginHttp } from "./login";

// La IP de quien entra viaja a la API principal: así los intentos fallidos se limitan por persona y no por servidor.
test("loginHttp reenvía la IP de quien entra a la API principal", async () => {
  const vistas: (string | null)[] = [];
  const falso = (async (_url: string, init?: RequestInit) => {
    vistas.push(new Headers(init?.headers).get("x-forwarded-for"));
    return new Response(JSON.stringify({ token: "t", usuario: { usuario: "ana", nombre: "Ana", rol: "contabilidad" } }), { status: 200 });
  }) as typeof fetch;
  const l = loginHttp("http://api:3000", falso);
  await l.entrar("ana", "clave", "203.0.113.7");
  await l.entrar("ana", "clave");
  assert.deepEqual(vistas, ["203.0.113.7", null]);
});
