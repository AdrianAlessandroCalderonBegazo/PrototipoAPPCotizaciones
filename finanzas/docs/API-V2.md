# API de ICR Finanzas 2 (libro único sobre varias cuentas)

Rutas bajo `/v2`. En este despliegue las sirve un servicio propio (`MODO=fin`, `finanzas2-api`) con su **propia base de datos** (`finanzas2`) y sus propias fotos; no comparte tablas con ICR Finanzas 1. La sesión (`Authorization: Bearer`) es la de la plataforma y el servidor exige un rol con acceso a Finanzas (`403 SIN_ACCESO` si no). Convenciones (formato de respuesta, sesión con `Authorization: Bearer`, UUID generados por el cliente, escrituras idempotentes, importes ≥ 0, fechas `AAAA-MM-DD`) iguales a las de [API.md](API.md). Tablas: `db/migrations-fin/001_fin.sql`. Los nombres de campo coinciden con `app2/src/lib/fin/types.ts`.

## Modelo

- **Cuenta** (`fin_cuenta`): banco, Yape o efectivo. Los Yape de Diego y Milagros son los fondos de gastos menores. Campos: `nombre, tipo (BANCO|YAPE|EFECTIVO), titular, referencia (últimos 4 dígitos del banco), saldo_inicial, umbral, aviso_whatsapp, aviso_telegram, activa, orden`.
- **Persona** (`fin_persona`): libreta de trabajadores, practicantes y proveedores. `tipo` ∈ `OBRA, PRACTICANTE, PLANILLA, PROVEEDOR, OTRO`; `alias` = nombres como salen en las capturas; `menu_monto` = menú diario.
- **Movimiento** (`fin_mov`): `INGRESO` y `EGRESO` afectan a `cuenta_id`; `TRASPASO` mueve de `cuenta_id` a `destino_id` y **no es ingreso ni gasto** (no cambia el total de la empresa). `para` reparte un gasto entre personas (un menú de S/ 20 para dos = 10 + 10). `nro_operacion` es el número de la operación del banco/Yape.
- **Cuadre** (`fin_cuadre`): saldo real contra el calculado, con historial.
- **Saldo** de una cuenta = saldo inicial + ingresos − egresos − traspasos que salen + traspasos que llegan (vista `v_fin_saldo`). La app calcula lo mismo en `app2/src/lib/fin/calc.ts`; una prueba (`api/src/fin.test.ts`) comprueba que ambos coinciden con movimientos aleatorios.

## Rutas

| Método y ruta | Qué hace |
|---|---|
| `GET /v2/snapshot?desde=&hasta=` | Todo en una llamada: `cuentas` (con `saldo_base` = saldo al empezar `desde`), `personas`, `movs` del rango (con `para` y `adjuntos`) y `cuadres`. Lo usan la sincronización y los reportes. |
| `PUT /v2/cuentas/:id` | Crea o cambia una cuenta. Solo `admin` y `finanzas` (variable `FIN_ROLES_CONFIG`). |
| `POST /v2/cuentas/:id/aviso-prueba` | Manda un mensaje de prueba al Telegram de la cuenta (para comprobar el bot y el chat). |
| `PUT /v2/personas/:id` | Crea o cambia una persona (cualquiera con acceso a Finanzas). |
| `PUT /v2/mov/:id` | Crea o corrige un movimiento. Cuerpo abajo. |
| `DELETE /v2/mov/:id` | Elimina (marca `deleted_at`); idempotente. Libera su `nro_operacion`. |
| `POST /v2/cuadres` | `{id, cuenta_id, fecha, saldo_real, nota}`: el servidor pone `saldo_sistema` y `diferencia`; reenviar no duplica. |
| `PUT/GET/DELETE /v2/adjuntos/:id` | Fotos de comprobantes (`?mov_id=` al subir; JPG, PNG o WebP, máx. 10 MB). |

### Cuerpo de `PUT /v2/mov/:id`

```json
{ "tipo": "EGRESO", "fecha": "2026-10-27", "hora": "13:35", "cuenta_id": "uuid", "destino_id": null,
  "monto": 20, "categoria": "Viáticos", "subcategoria": "Menú", "concepto": "Menú",
  "pagado_a": "Aurea Val*", "pagado_a_id": null,
  "para": [{ "persona_id": "uuid", "monto": 10 }, { "persona_id": "uuid", "monto": 10 }],
  "nro_operacion": "15961088", "origen": "CAPTURA", "creado": "2026-10-27T18:35:00Z" }
```

Reglas: monto > 0; la cuenta existe; traspaso con `destino_id` distinto de `cuenta_id` (y solo el traspaso lo lleva); ingreso o egreso con categoría válida (egresos: Equipos, Movilidad, Material, Oficina, Fletes, Viáticos, Proveedores, Gastos fijos; ingresos: Venta, Obra / Proyecto, Otro; `Gastos fijos` exige tipo: Sueldos, Alquiler o Servicios); el reparto no supera el monto ni repite personas; `hora` vacía o `HH:MM` válida.

### Errores

`400 DATOS_INVALIDOS` · `401 NO_AUTORIZADO` · `403 SIN_PERMISO` · `404 CUENTA_NO_ENCONTRADA / DUENO_NO_ENCONTRADO / ADJUNTO_NO_ENCONTRADO` · `409 OPERACION_DUPLICADA` (el mismo número de operación ya está en esa cuenta) · `409 MOV_ELIMINADO` · `413 FOTO_MUY_GRANDE` · `415 TIPO_NO_PERMITIDO` · `502 TELEGRAM_FALLO`. La app trata un `4xx` como definitivo (lo marca «no se guardó» con el mensaje) y un error de red o `5xx` como temporal (reintenta).

## Aviso de reposición

Cada cuenta puede tener un `umbral`. Cuando un movimiento deja el saldo **bajo el umbral**, el servidor manda **una sola vez** un mensaje por Telegram (`aviso_telegram` = chat) con el saldo, lo gastado desde la última entrada de dinero, el monto sugerido a reponer y el detalle. Se rearma cuando el saldo vuelve a estar sobre el umbral. Si Telegram falla, el movimiento se guarda igual y el aviso se reintenta en el siguiente. Sin `TELEGRAM_BOT_TOKEN` no se manda nada (la app igual lo muestra en pantalla y permite enviarlo por WhatsApp con un toque).

Configurar el bot: crearlo con @BotFather (da el token → `TELEGRAM_BOT_TOKEN`), que la persona que repone le escriba `/start`, y obtener su número de chat (`https://api.telegram.org/bot<TOKEN>/getUpdates`) → campo «Chat de Telegram» de la cuenta; el botón «Enviar mensaje de prueba» lo comprueba.

## Pendiente a propósito

- **Reflejo en el ERP**: la versión 2 **no** escribe en el ERP todavía. Es deliberado: mientras las dos versiones se comparan en paralelo, reflejar ambas duplicaría los movimientos en Contabilidad. Las reglas ya estaban definidas para la 1 (`docs/API.md`): ingresos y egresos reales sí, traspasos no; `categoriaErp()` en `app2/src/lib/fin/categorias.ts` ya traduce las categorías a los valores del ERP.
- **Candado de días antiguos**: hoy es del lado de la app (ventana libre de 2 días; más atrás pide el código). Igual que en la versión 1, no es seguridad real: el servidor acepta cualquier fecha. Ver «Corregir días anteriores» en `API.md`.
