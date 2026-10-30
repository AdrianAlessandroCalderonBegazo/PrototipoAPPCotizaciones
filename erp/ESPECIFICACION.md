# ICR ERP — Especificación adaptada a lo que ya existe

Versión del prompt original (`ERP_ICR.zip` + especificación + la idea principal), ajustada al sistema que ya funciona en el VPS
(`icrenergy.tech`). Donde algo del prompt original cambia, se explica por qué. **Cada fase se presenta con su plan y se espera
aprobación antes de empezar.**

## 1. Lo que ya existe (Fase 0 · revisión)

| Pieza | Dónde | Qué es |
|---|---|---|
| Base de datos | Postgres 16 en Docker (`db`), base `cotizador` | Usuarios, sesiones, productos (≈800), cotizaciones, requerimientos, salidas de herramientas, listas, maletas, caja diaria y caja chica (Finanzas 1). |
| API principal | `servidor/api` (Node + Express, JS) | Login y sesiones, catálogo, cotizaciones, requerimientos, herramientas, bitácora. **Es el backend compartido del ERP.** |
| Logística (antes Cotizador) | Flutter → `cotizador.icrenergy.tech` (PWA) y APK | Checklist de cotización + PDF, requerimientos de materiales y salidas de herramientas. |
| Finanzas 1 | `finanzas/app` (Expo web) + `finanzas/api` (Node TS) → `finanzas.icrenergy.tech` | Caja diaria y caja chica, cierre del día, auditoría, alertas, reportes, OCR de comprobantes. Misma base `cotizador`. |
| Finanzas 2 (prueba) | `finanzas/app2` + misma API en modo `fin` → `finanza.icrenergy.tech` | Libro único por cuentas (bancos, Yape), base propia `finanzas2`. Se decidirá cuál queda. |
| Portal | `servidor/portal` → `app.icrenergy.tech` | Vista general en tablas + pestaña Finanzas + usuarios. |
| Proxy | Caddy (`servidor/Caddyfile`) | HTTPS de todos los subdominios. **Incluye los bloques de Relay al final: no se borran nunca.** |

## 2. Decisiones de stack (ajustes al prompt original)

1. **Un solo backend compartido = la API principal existente** (`servidor/api`, Express). El prompt pedía Node **TypeScript + ORM**;
   reescribir la API que ya usan Logística y Finanzas sería riesgoso y no aporta. Los módulos nuevos se agregan como rutas nuevas en la misma
   API. **Migraciones en SQL plano** (`servidor/db/migraciones/NNN_nombre.sql`, se aplican solas al arrancar, una sola vez y en orden) en lugar de ORM.
2. **Finanzas mantiene su API propia** (`finanzas/api`, TypeScript), en la misma base y con los mismos usuarios y sesiones. El ERP lee la caja chica
   desde la base (solo lectura) y la PWA de Finanzas consulta al ERP lo que necesite (proyectos activos).
3. **Frontend del ERP**: `erp/web`, React 18 + TypeScript + Vite + Tailwind, con los tokens del sistema de diseño (variables CSS, modo oscuro,
   Manrope, Material Symbols Rounded). Se publica como archivos estáticos en `erp.icrenergy.tech`; Caddy envía `/api` y `/uploads` a la API (mismo origen, sin CORS).
4. **Roles**: Administrador, Ventas, Contabilidad y Técnico, **los mismos en el ERP, Logística, Finanzas 1 y Finanzas 2**. Los roles anteriores se
   migraron solos: admin → Administrador, vendedor → Ventas, finanzas → Contabilidad, empleado/encargado/almacén → Técnico.
5. **Permisos**: matriz rol × módulo con tres niveles (sin acceso / solo lectura / completo), tabla `rol_permisos`, editable solo por el Administrador
   en Configuración. **El servidor la comprueba en cada pedido** (la pantalla solo oculta botones). El Administrador siempre tiene acceso completo.
   Acciones especiales que no dependen de la matriz: reabrir un día cerrado de caja, cambiar saldos iniciales, crear cuentas en Finanzas 2,
   cambiar la matriz y crear o cambiar administradores → solo Administrador.
6. **Auditoría**: tabla `audit_log` (usuario, rol, acción, entidad, antes/después en JSON, fecha, IP), solo se agrega. Finanzas mantiene además su
   propio historial detallado (`caja_auditoria`).
7. **Dinero**: columnas `NUMERIC` en Postgres, siempre con moneda (`PEN`/`USD`) y, al convertir, el tipo de cambio usado. **Riesgo detectado:** la API
   principal convierte hoy los `NUMERIC` a número de coma flotante al leerlos (`servidor/api/src/db.js`). Para no romper Logística, el código nuevo
   de dinero (Fase 2 en adelante) lee los montos como texto (`::text`) y calcula en céntimos enteros; el tipo de cambio se guarda como texto con 4 decimales.
8. **Origen de los datos**: columna `source` (`caja_chica`, `logistica`, `sunat`, `ia`, `lista_proveedor`, `web`) en las tablas nuevas que reciben
   datos importados; alimenta las etiquetas de origen del diseño.
9. **Nunca se inventan datos**: lo desconocido es `null` en la base y «Sin dato» en pantalla.
10. **Secretos** (claves, `VRM_TOKEN`, `TELEGRAM_BOT_TOKEN`) solo en el `.env` del VPS; nunca en el código, la base ni el chat.

## 3. Ajustes y riesgos del prompt original

| Tema | Ajuste propuesto |
|---|---|
| Quitar la cotización de Logística | Se hace **en la Fase 3**, cuando la Cotización del ERP ya funcione (si se quita antes, nadie podría cotizar). |
| Cambios en la PWA de Finanzas | Se hacen en **Finanzas 1** (decisión del usuario). Finanzas 2 sigue de prueba sin cambios funcionales. |
| IA `qwen3:4b` en el VPS | Necesita ~4–5 GB de RAM libres y responde lento en CPU. Antes de la Fase 6 se revisa la RAM/CPU del VPS; Ollama solo en la red interna de Docker (nunca expuesto). La IA no calcula montos ni inventa precios: usa herramientas de solo lectura y el servidor hace las cuentas. |
| Voz | Primero la **Web Speech API** del navegador (gratis, sin carga en el VPS); whisper en el servidor solo si la calidad no alcanza. |
| «Darle acceso completo a la IA a todos los archivos» | La IA ve **solo lo que el rol de quien pregunta puede ver** (como pide la especificación). Así un técnico no puede leer la contabilidad preguntándole a la IA. |
| Extensión SUNAT | Proyecto aparte `extension/` (Chrome MV3). Rellena hasta la revisión final y **nunca pulsa «Emitir»**. Los selectores del portal en un solo archivo de configuración porque SUNAT cambia su web. |
| VRM en iframe | VRM probablemente bloquea iframes (`X-Frame-Options`). Se verifica en la Fase 9; si lo bloquea, botón «Abrir VRM en pestaña nueva» + panel propio con la API oficial. |
| Scraping de proveedores | Solo donde `robots.txt` lo permita, con límites de frecuencia y cola de tareas; preferir listas Excel/CSV y APIs. |
| Almacén | Adelantado a la Fase 1 en modo consulta («En construcción» + requerimientos y salidas de Logística con filtros). El inventario queda para después. |

## 4. Plan por fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Revisión del código y la base, este documento, `CLAUDE.md`. | ✅ |
| 1 | **Base**: 4 roles, matriz de permisos validada en el servidor (API principal, Logística, Finanzas 1 y 2), `audit_log`, Configuración (usuarios y roles, matriz, datos de la empresa con logo, parámetros y tipo de cambio, numeración de cotizaciones, integraciones con prueba de conexión, auditoría), layout del diseño (menú lateral por permisos, barra superior con TC, modo oscuro, Ctrl+K), Inicio básico con datos reales, Almacén de consulta. Publicado en `erp.icrenergy.tech`. | ✅ |
| 2 | **Proyectos y Contabilidad**: proyectos (nombre + presupuesto; activo / pausado con causa / finalizado; historial; fotos), cuenta principal (movimientos, saldo, flujo mensual, por categoría y proyecto, Excel/PDF), caja chica de solo lectura en el ERP, **enviar fondos a caja chica** (una transacción: egreso en la cuenta principal + ingreso en caja chica; saldo negativo solo con confirmación del Administrador; auditado). En Finanzas 1: categoría «Gasto de proyecto» con la lista de proyectos activos. | ✅ |
| 3 | **Cotización**: catálogo desde los productos actuales (se agregan marca, modelo, moneda, características, imágenes), importación CSV (mapear → vista previa → confirmar), imágenes por código, kits editables, cotizaciones (IGV 18 %, descuentos, estados), PDF en el servidor con el branding, WhatsApp sin API. **Se quita la cotización de Logística.** | ✅ |
| 4 | **Inicio completo** (endpoint de resumen único) y **búsqueda global** Ctrl+K sobre datos. Notificaciones internas. | ✅ |
| 5 | **Facturación SUNAT**: formulario (boleta/factura, DNI/RUC validados, IGV en el servidor), estados, extensión de Chrome. | ✅ |
| 6 | **IA** (siguiente): Ollama + embeddings, streaming, health check; Cotizador IA y Asistente IA con herramientas de solo lectura. | |
| 7 | **IA en Finanzas 1**: consultas sobre gastos (solo lectura, respetando permisos). El OCR actual se mantiene. | |
| 8 | **Comparador de proveedores**: proveedores, listas, historial de precios append-only, equivalencias, buscador y tabla comparativa. | |
| 9 | **Activos y control** (Victron VRM con caché) y Almacén ampliado. | |
| 10 | **Cierre**: pruebas finales, revisión de seguridad, respaldos y documentación. | |

## 4b. Cómo quedó la Fase 2

- **Proyectos** (`servidor/api/src/proyectos.js`): código correlativo `PRY-001`; crear pide solo nombre y presupuesto; el resto (cliente, RUC/DNI, tipo de
  sistema, marca, ubicación, responsable, notas) se completa en el detalle. Estados con historial (`proyecto_estados`); pausar exige causa (lista del
  diseño + detalle); **finalizado es definitivo** (solo lectura: sin gastos, fotos ni cambios). Fotos en `/uploads` (subida múltiple; se «quitan» sin borrar el archivo).
- **Gasto de un proyecto** = egresos de la cuenta principal asignados al proyecto + gastos de **caja chica** y salidas de **caja diaria** de Finanzas 1 con
  la categoría «Gasto de proyecto». Finanzas solo deja elegir proyectos **activos**; un gasto que ya tenía proyecto se puede corregir aunque el proyecto
  se pause después. Los proyectos por ahora son en soles.
- **Cuenta principal** (`servidor/api/src/contabilidad.js`): las cuentas se crean en el ERP (soles y/o dólares; una principal por moneda). El saldo es
  `saldo inicial (al empezar su fecha) + movimientos desde esa fecha`; sin saldo inicial se muestra «Sin dato». Contabilidad **registra** ingresos y
  egresos de la cuenta (interpretación del prompt: el ERP es donde se guardan los movimientos de la cuenta grande; lo único que el ERP escribe en la
  caja chica es el envío de fondos). Un movimiento nunca se borra: se **anula con motivo** (auditado). Categorías fijas en el código (`CATEGORIAS`).
- **Enviar fondos a caja chica**: una sola transacción crea el egreso en la cuenta (soles), un movimiento `FONDO` (origen `ERP`) en `caja_chica_mov`, su
  entrada en el historial de Finanzas (`caja_auditoria`), el registro en `envios_caja_chica` y la auditoría del ERP. Si la cuenta quedaría en negativo o
  su saldo no se conoce, solo un Administrador lo confirma (marcando la casilla). El envío no se anula desde el ERP.
- **Finanzas 1**: migración `005_proyectos_fondos.sql` (tipo `FONDO`, origen `ERP`, `proyecto_id` + `proyecto_nombre` en gastos y filas). Regla del
  saldo de caja chica: el egreso resta, lo demás suma. El FONDO se ve en la app como «Fondos de la cuenta principal» y no se edita ni se borra allí.
- **Dinero**: los montos nuevos viajan como texto («1234.50») y se suman en céntimos (`servidor/api/src/dinero.js`, `erp/web/src/dinero.ts`).
- **Fotos de recibos en el ERP**: `erp.` reenvía `/api-caja` a la API de Finanzas (misma sesión); quien no tiene acceso a caja chica ve el aviso.

**Caja diaria vs. cuenta principal (respondido por el dueño):** las columnas «Cta. cte.» de la caja diaria de Finanzas 1 son una cuenta de **Yape**;
la caja diaria lleva el registro del efectivo y del Yape. **No es la cuenta principal.** Cuando el efectivo se deposita en el banco, ese depósito se
registra en el ERP (Contabilidad › Nuevo movimiento › ingreso, categoría «Depósito de caja diaria (efectivo)»).

## 4c. Cómo quedó la Fase 3 (Cotización)

- **Precios con IGV**: los precios del catálogo ya incluyen IGV (como en la lista actual). Total = Σ (cantidad × precio − descuento de línea) − descuento
  comercial; valor de venta = total ÷ 1.18 (redondeo al céntimo); IGV = total − valor de venta. La misma cuenta en el servidor (`cotizar.js`) y en
  pantalla (`erp/web/src/paginas/cotizacion/calculo.ts`); manda la del servidor.
- **Catálogo** (`catalogo.js`): migración `004_cotizacion.sql` agrega marca, modelo, moneda (PEN/USD), características, origen y fecha de precio. El
  **código** del ERP se toma de la «referencia interna» actual cuando es única; si no, queda «Sin código» hasta que alguien lo ponga. Los productos en
  dólares se pasan a soles con el tipo de cambio de Configuración (si no hay TC, no se pueden cotizar).
- **Importar CSV**: archivo → mapear columnas → vista previa (nuevos / actualizados / sin cambios / con errores, variación de precio y kits afectados)
  → confirmar. El código es la llave. Las cotizaciones ya hechas guardan sus precios.
- **Imágenes**: carga masiva por nombre de archivo = código del producto (o una por una en el detalle).
- **Kits** (`kits.js`): lista de productos del catálogo + líneas libres (instalación, etc.). Una línea sin precio propio usa el precio del catálogo
  (si sube el producto, sube el kit). Variante = copia para modificar. **Los kits reales los enviará el usuario en zips para importarlos.**
- **Cotizaciones** (`ventas.js`): número con la numeración de Configuración (mismo correlativo que Logística). Estados: borrador → enviada →
  aceptada / rechazada (con motivo). Solo se edita en borrador o enviada. Las cotizaciones antiguas de Logística se ven en la lista (origen «Logística»).
- **PDF** en el servidor (`pdf.js`, pdfkit + Manrope) con los datos de la empresa (precargados: INVERSIONES ICR S.R.L., RUC 20605309489).
- **WhatsApp sin API**: en computadora descarga el PDF y abre WhatsApp Web con el número y el mensaje (el PDF se adjunta a mano); en celular usa
  «Compartir» con el PDF adjunto.
- **Logística**: se quitaron la pestaña Cotización y sus pantallas (productos, voz, chat, historial). Quedan Inicio, requerimientos y herramientas.

## 4d. Cómo quedó la Fase 4 (Inicio, búsqueda, notificaciones)

- **Inicio** (`GET /api/inicio`, `servidor/api/src/inicio.js`): un solo pedido arma todo según los permisos del rol: cuenta principal y caja chica,
  ingresos / egresos / flujo neto del mes contra el mes anterior, proyectos activos (ordenados por % gastado) y pausados (causa y desde cuándo),
  cotizaciones del mes, resumen de almacén y alertas. Accesos rápidos: Nuevo proyecto, Nueva cotización, Enviar fondos (según permisos).
- **Alertas** (calculadas al vuelo, no se guardan): presupuesto en aviso / límite, caja chica en negativo, gastos sin foto del recibo, cuenta sin saldo
  inicial o en negativo, cotizaciones enviadas por vencer o vencidas, tipo de cambio sin dato o viejo, requerimientos urgentes o por aprobar.
- **Campana** (`GET /api/notificaciones`, `POST /api/notificaciones/leidas`): las mismas alertas; «leída» se guarda por persona
  (`005_notificaciones.sql`). Si la situación cambia (por ejemplo, el proyecto pasa del aviso al límite), vuelve a salir como nueva.
- **Búsqueda Ctrl+K** (`GET /api/buscar?q=`): proyectos, cotizaciones, productos, movimientos de la cuenta y requerimientos, sin importar tildes ni
  mayúsculas, solo en los módulos que el rol puede ver; además lleva a cualquier módulo o sección de Configuración.
- No se muestran datos de Victron ni de SUNAT en el Inicio hasta que esas fases estén hechas (nunca datos de ejemplo).

## 4e. Cómo quedó la Fase 5 (Facturación SUNAT)

- **El ERP prepara, SUNAT emite**: el comprobante (boleta o factura) se arma en el ERP, la extensión de Chrome rellena el portal **SOL** y la persona
  revisa y pulsa «Emitir» en SUNAT. **El número lo asigna SUNAT** (en SOL: series E001 para facturas y EB01 para boletas); se registra al «marcar
  emitido». No hay correlativo propio. Migración `006_facturacion.sql`; lógica en `servidor/api/src/facturacion.js`, rutas en `rutas_f5.js`.
- **Ítems con valor unitario sin IGV** (como lo pide SOL, hasta 4 decimales): valor de venta = cantidad × valor unitario; IGV 18 % por línea;
  total = op. gravada + IGV. Misma cuenta en `erp/web/src/paginas/facturacion/calculo.ts`.
- **Desde una cotización** (botón «Facturar» en una cotización aceptada, o «Importar desde cotización»): una línea con el sistema (para hitos o
  adelantos, con %) o cada ítem; los precios con IGV se pasan a valor sin IGV y se avisa si quedan céntimos de diferencia por redondeo.
- **Validaciones** (en pantalla y otra vez en el servidor antes de abrir SUNAT): factura con RUC válido (dígito verificador) y razón social; boleta
  con DNI o RUC válido, obligatorio desde S/ 700; ítems completos; a crédito, cuotas que suman el total y vencen después de hoy.
- **Estados**: borrador (se edita o elimina) → enviado a SUNAT (vuelve a borrador si SUNAT lo rechazó) → emitido (número + fecha; se adjuntan el PDF
  y el XML de SUNAT, que se guardan en una carpeta privada y se descargan solo con sesión) → anulado (con motivo; en SUNAT se presenta la baja o la
  nota de crédito). Todo queda en la auditoría.
- **Consulta de RUC/DNI**: opcional con un proveedor externo (`CONSULTA_DOC_TOKEN`; por defecto decolecta.com). Sin token, el ERP propone el nombre
  y la dirección de comprobantes o cotizaciones anteriores con ese documento; si no hay, se escribe a mano. Nunca se inventa.
- **Extensión** (`extension/`, Manifest V3, solo permiso `storage`): recibe el comprobante por `window.postMessage` (nunca por la URL), lo guarda en
  la memoria de la sesión del navegador (máx. 3 horas), abre SOL y muestra un panel con los pasos, «Rellenar cliente y pago», «Rellenar ítem N»
  y los datos con botón «Copiar». Busca los campos por el texto que se ve junto a ellos; todo lo del portal está en `extension/selectores.js`.
  **Nunca pulsa «Emitir»** (lista de botones prohibidos) ni toca campos de clave. El ERP la ofrece para descargar (`/icr-autollenado-sunat.zip`) y
  detecta si está instalada. **Pendiente:** calibrarla con el portal SOL real (se probó con una página que imita el formulario).
- No se maneja todavía: detracción, percepción, exportación, anticipos ni notas de crédito/débito (se hacen directo en SUNAT).

## 5. Migración de datos

- **Usuarios y roles**: hecho en la Fase 1 (`002_erp_base.sql`), sin perder usuarios ni sesiones.
- **Productos → Cotización (Fase 3)**: la tabla `productos` ya está en la misma base; se le agregan columnas (marca, modelo, moneda, características,
  `source`). Los ≈800 productos y las cotizaciones existentes se conservan; la numeración del ERP usa el mismo correlativo que Logística (nunca hacia atrás).
- **Kits (Fase 3)**: no existen hoy; se crean desde el ERP (sin datos inventados).
- **Caja chica → Proyectos (Fase 2)**: los gastos nuevos llevan `proyecto_id`; los anteriores quedan sin proyecto («Sin dato»).
- **Cuenta principal (Fase 2)**: empieza vacía con el saldo inicial que indique Contabilidad.

## 6. Matriz de permisos inicial (editable en Configuración)

| Módulo | Ventas | Contabilidad | Técnico |
|---|---|---|---|
| Inicio | lectura | lectura | lectura |
| Proyectos | lectura | completo | lectura |
| Almacén | lectura | lectura | lectura |
| Activos y control | lectura | lectura | lectura |
| Cotización | completo | lectura | — |
| Cotizador IA | completo | — | — |
| Comparador | completo | lectura | — |
| Contabilidad | — | completo | — |
| Facturación SUNAT | completo | completo | — |
| Asistente IA | completo | completo | — |
| Configuración | — | — | — |
| PWA Logística | lectura | lectura | completo |
| PWA Finanzas (caja chica) | — | completo | — |

(La tabla real vive en `servidor/db/migraciones/002_erp_base.sql`; esta copia es solo de referencia.)
