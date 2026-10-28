# ICR Finanzas 2 — para probarla junto a la versión 1

> Integración en este repositorio: la app está en `finanzas/app2/`, las reglas de la API en `finanzas/api/src/fin.ts` (rutas `/v2`) y la migración en `finanzas/db/migrations-fin/`.

Una app **nueva y aparte** (`app2/`) publicada en **`finanza.icrenergy.tech`** para compararla con la versión 1 (`app/`, en `finanzas.icrenergy.tech`), que queda intacta. En este despliegue las dos versiones usan **bases de datos separadas** (Finanzas 1 en `cotizador`, Finanzas 2 en `finanzas2`, que se crea sola), **fotos separadas** y **servicios separados**; solo comparten los **usuarios y las sesiones** de la plataforma (el mismo usuario y clave del Cotizador).

## Qué cambia respecto a la versión 1

| Versión 1 | Versión 2 |
|---|---|
| Caja diaria + Caja chica (dos módulos casi iguales, copiados de la planilla de papel) | **Un solo libro de movimientos** sobre **cuentas**: bancos, el Yape de cada encargado, efectivo |
| Un formulario por cada pago | **Subir capturas** de Yape y BCP (varias a la vez): se leen solas y se confirman juntas |
| El gasto se anota a quien se le pagó | Se anota **a quién se pagó** y **para quién fue** (un menú de S/ 20 para dos personas = S/ 10 y S/ 10) |
| Sin control de personas | **Libreta** de trabajadores, practicantes (con monto de menú), planilla y proveedores; reporte de **gasto por persona y por practicante** |
| Sin cuadre | **Cuadre** del Yape contra su saldo real; **aviso de reposición** al bajar del umbral (S/ 40 u otro por cuenta) por Telegram automático o WhatsApp con un toque |
| Menús uno por uno | **Menú del día**: se marca a quiénes y se registra todo junto |
| Planilla de papel | Reportes en Excel (libro, resumen por cuenta, por categoría, por persona, practicantes, cuadres) y CSV |

La captura: Yape («¡Yapeaste!») y BCP («Operación exitosa») se reconocen solas. De cada una salen el monto, a quién, la fecha y hora, el mensaje y el número de operación; de la del BCP también la cuenta de la que salió (por sus últimos 4 dígitos). El **mensaje** del pago ayuda: «Menú Hernán y Cristian» → Viáticos · Menú, repartido entre ellos; «gasolina» → Movilidad · Combustible; «pax aqp mlq» → Pasaje AQP MOQ. Un pago a otra cuenta propia (el del BCP a «Diego A Lazo J») se propone como **traspaso** al Yape de Diego. El número de operación evita registrar dos veces lo mismo. Todo se lee **en el dispositivo**; las imágenes no salen a ningún servicio externo.

## Desplegar (en este servidor)

Está todo en `servidor/docker-compose.yml` y `servidor/Caddyfile`; la guía paso a paso es `servidor/DESPLIEGUE.md` (sección «Finanzas 2»). En resumen:

1. **DNS**: registro A `finanza` → IP del VPS.
2. `docker compose up -d --build` en `servidor/`: levanta `finanzas2-api` (el mismo código de API que Finanzas 1, en `MODO=fin`: solo rutas `/v2`), que **crea la base `finanzas2`** y aplica `db/migrations-fin/001_fin.sql`. Finanzas 1 no se toca.
3. `./scripts/actualizar_finanzas2.sh /root/finanzas2_web.zip` publica la app (el zip se arma con `npm run build:web` en `app2/` o con el flujo «Build finanzas 2» de GitHub Actions).
4. **Quién entra**: usuarios con rol **Administrador, Finanzas o Encargado** (los mismos de Finanzas 1; `FINANZAS_ROLES` lo cambia). Quién crea o cambia cuentas: **admin y finanzas** (`FIN_ROLES_CONFIG`).
5. **Aviso por Telegram** (opcional): `TELEGRAM_BOT_TOKEN` en el `.env` del servidor.
6. **Primer uso** (con un administrador o un usuario Finanzas): Libreta › Cuentas: crear *Cta. cte. 2000*, *Cta. cte. 7074* (con sus últimos 4 dígitos), *Yape Diego*, *Yape Milagros* (con titular, saldo inicial y umbral 40); Libreta › Personas: cargar al equipo (lo más cómodo: ir agregándolos al registrar las primeras capturas). Cada encargado marca «Es mi cuenta» en la suya.

**Respaldo**: `servidor/scripts/respaldo.sh` ahora también guarda la base `finanzas2` y sus fotos (`finanzas2_*.sql.gz`, `fotos_finanzas2_*.tar.gz`).

**Revertir la prueba**: parar `finanzas2-api` y borrar la base (`DROP DATABASE finanzas2`) no afecta a Finanzas 1.

**Importante para comparar:** la versión 2 **no escribe en el ERP** (ver `docs/API-V2.md`), para no duplicar movimientos en Contabilidad mientras la 1 sigue reflejándose. Los datos de cada versión son independientes (bases separadas): durante la prueba hay que registrar en las dos lo que se quiera comparar. Finanzas 2 sigue funcionando **sin internet** (guarda en el dispositivo y sincroniza); Finanzas 1 es una app en línea.

## Qué se comprobó y qué no

**Probado:** 44 pruebas de la app nueva, 50 de la API (versiones 1 y 2), tipos sin errores. Las pruebas de la API corren contra Postgres de verdad (PGlite) y cubren saldos (incluida una comparación con movimientos aleatorios entre la app y la vista SQL), traspasos, duplicados, borrados, fotos, cuadre, permisos y el aviso de reposición (una vez por bajada, se rearma, reintenta si Telegram falla). La sincronización sin conexión se probó con dos «teléfonos», señal cortada, respuestas perdidas, la misma captura desde dos teléfonos y el paso de los días; y se verificó con pruebas de mutación que esos tests detectan fallos reales. En un Chromium real, con **las 6 capturas que enviaste**: las seis se leyeron bien (11, 8, 20, 30, 38 y 100 soles, nombres, fechas, cuentas del BCP, el menú con sus dos beneficiarios y los S/ 100 de gasolina como traspaso), en unos 8 segundos las seis; se registraron, se detectaron las repetidas, se hizo el menú del día, el cuadre, el aviso de reposición, el candado de fechas antiguas, el Excel y trabajar sin internet recargando la página.

**No probado / límites:**
- La lectura se afinó con **esas 6 capturas**. Otras variantes (Plin, capturas recortadas, otro banco, Yape de empresa) pueden leerse peor: por eso siempre hay un paso de revisión, y conviene mandarme más ejemplos.
- **Telegram** nunca se probó contra Telegram real (no hay token aquí); sí con un servicio simulado. Usa el botón «Enviar mensaje de prueba».
- **Docker**: sin servicio de Docker en el entorno de desarrollo; `npm run build:web`, la API con una base Postgres real y el Caddyfile (validado y probado con Caddy) sí se probaron.
- El Excel se verificó leyéndolo de vuelta (hojas, fórmulas, formatos) pero **no se abrió en Excel**.
- No hay «compartir directo a la app» desde el teléfono (se elige de la galería, en Android y en iPhone). Tampoco conciliación con el extracto del banco.
- No se probó en un teléfono físico.
- El aviso automático solo sale por **Telegram**; WhatsApp es un botón que abre el chat con el mensaje listo (enviarlo solo exigiría la API de pago de WhatsApp Business).
- Ventana libre de 2 días: registrar o corregir hoy, ayer y antes de ayer no pide código; más atrás sí (`1234` por defecto). Es un freno, no seguridad real (ver `docs/API.md`).

## Qué sigue si la prueba convence
Reflejo en el ERP, roles reales en el servidor, historial de cambios (auditoría), conciliación con el extracto del BCP y el envío directo de capturas desde el teléfono.
