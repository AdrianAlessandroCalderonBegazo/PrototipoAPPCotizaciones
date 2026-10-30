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
| VRM en iframe | Decisión del dueño (Fase 9): la API de VRM no funcionó, así que VRM va **solo embebido (iframe)** con la sesión de cada persona, más el botón «Abrir en pestaña nueva» por si VRM bloquea la vista embebida. Sin panel propio ni token de VRM. |
| Scraping de proveedores | Solo donde `robots.txt` lo permita, con límites de frecuencia y cola de tareas; preferir listas Excel/CSV y APIs. |
| Almacén | Adelantado a la Fase 1 en modo consulta (requerimientos y salidas de Logística). El inventario se agregó en la Fase 9. |

## 4. Plan por fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Revisión del código y la base, este documento, `CLAUDE.md`. | ✅ |
| 1 | **Base**: 4 roles, matriz de permisos validada en el servidor (API principal, Logística, Finanzas 1 y 2), `audit_log`, Configuración (usuarios y roles, matriz, datos de la empresa con logo, parámetros y tipo de cambio, numeración de cotizaciones, integraciones con prueba de conexión, auditoría), layout del diseño (menú lateral por permisos, barra superior con TC, modo oscuro, Ctrl+K), Inicio básico con datos reales, Almacén de consulta. Publicado en `erp.icrenergy.tech`. | ✅ |
| 2 | **Proyectos y Contabilidad**: proyectos (nombre + presupuesto; activo / pausado con causa / finalizado; historial; fotos), cuenta principal (movimientos, saldo, flujo mensual, por categoría y proyecto, Excel/PDF), caja chica de solo lectura en el ERP, **enviar fondos a caja chica** (una transacción: egreso en la cuenta principal + ingreso en caja chica; saldo negativo solo con confirmación del Administrador; auditado). En Finanzas 1: categoría «Gasto de proyecto» con la lista de proyectos activos. | ✅ |
| 3 | **Cotización**: catálogo desde los productos actuales (se agregan marca, modelo, moneda, características, imágenes), importación CSV (mapear → vista previa → confirmar), imágenes por código, kits editables, cotizaciones (IGV 18 %, descuentos, estados), PDF en el servidor con el branding, WhatsApp sin API. **Se quita la cotización de Logística.** | ✅ |
| 4 | **Inicio completo** (endpoint de resumen único) y **búsqueda global** Ctrl+K sobre datos. Notificaciones internas. | ✅ |
| 5 | **Facturación SUNAT**: formulario (boleta/factura, DNI/RUC validados, IGV en el servidor), estados, extensión de Chrome. | ✅ |
| 6 | **IA**: Ollama + embeddings, streaming, health check; Cotizador IA y Asistente IA con herramientas de solo lectura. | ✅ |
| 7 | **IA en Finanzas 1**: consultas sobre gastos (solo lectura, respetando permisos). El OCR actual se mantiene. | ✅ |
| 8 | **Comparador de proveedores**: proveedores, listas, historial de precios append-only, equivalencias, buscador y tabla comparativa. | ✅ |
| 9 | **Activos y control** (sistemas instalados, equipos y garantías, portal Victron VRM embebido) y **Almacén** con inventario y kardex. | ✅ |
| 10 | **Cierre**: pruebas finales, revisión de seguridad, respaldos y documentación. | ✅ |

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

## 4f. Cómo quedó la Fase 6 (IA)

- **Regla del dueño:** la IA **solo lee**. Ningún dato del negocio cambia por la IA: lo que propone (una cotización) lo revisa y guarda una
  persona («Abrir en Cotización» lleva la propuesta al editor; se guarda con «Crear borrador»).
- **Servidor**: contenedor `ollama` en el docker-compose, sin puertos publicados (solo lo llama la API por la red interna). Modelos: `qwen3:4b`
  (chat) y `bge-m3` (búsqueda por significado, multilingüe), descargados con `servidor/scripts/instalar_ia.sh`. Límite de memoria 9 GB (el VPS
  tiene 16 GB). El modelo se cambia en ERP › Configuración › Inteligencia artificial (`servidor/api/src/ia/config.js`).
- **Búsqueda de productos** (`ia/indice.js`): por palabras + por significado (vectores en `ia_embeddings`, en memoria; sin pgvector). Se
  actualiza sola al cambiar el catálogo y al arrancar la API.
- **Herramientas** (`ia/herramientas.js`), todas de solo lectura y con los permisos de quien pregunta (las que no puede usar ni se le muestran
  al modelo, y si las pide igual, el servidor se niega): catálogo, kits, propuesta de cotización; finanzas del mes, movimientos, proyectos,
  gastos de un proyecto, cotizaciones, comprobantes, caja chica y requerimientos. **Los totales los calcula el servidor**; las tablas,
  indicadores y gráficos los arma el servidor (el modelo solo resume).
- **Cotizador IA**: precios siempre del catálogo (USD → S/ con el TC de Configuración); lo que no está en el catálogo o los servicios quedan
  «Sin dato» para que una persona ponga el precio. Contexto editable (reglas y notas de la empresa, vacías por defecto) y bloques que se pueden
  apagar. Historial compartido con autor y fecha; eliminar consultas (borrado lógico + auditoría).
- **Asistente IA**: historial privado de cada persona (las respuestas dependen de sus permisos). Respuestas con indicadores, gráficos, tablas y
  fuentes; exportar a PDF (ventana de impresión). Consultas frecuentes.
- **Streaming** (`text/event-stream`), estados: pensando (con lo que está consultando), lento, error con reintentar, modelo no disponible.
- **Voz**: dictado del navegador (Web Speech API, Chrome/Edge); la transcripción se puede corregir antes de enviar. No se instaló Whisper en el
  VPS (se puede agregar después si hace falta).
- **Pendiente:** la búsqueda en documentos (RAG de archivos) del Asistente queda para cuando el ERP guarde documentos; la calidad real de las
  respuestas se verá con `qwen3:4b` en el VPS (se probó con un Ollama simulado: `servidor/api/test/ollama_falso.js`).

## 4g. Cómo quedó la Fase 7 (IA en Finanzas 1)

- Nueva pestaña **Preguntar** en la app de Finanzas (celular y computadora): preguntas frecuentes de un toque, dictado por voz del navegador,
  respuesta mientras se escribe, indicadores, barras por categoría, tablas y fuentes; «Mis consultas» (historial privado de cada persona).
- **La usan todos los que entran a la caja** (permiso `caja_chica` en lectura o completo; decisión del dueño: son ~3 personas y todas la necesitan).
- La responde la API principal (`/api/ia/finanzas`, misma sesión; Caddy la expone también en `finanzas.`). Herramientas de **solo lectura**
  (`ia/herramientas.js`): gastos de caja chica (período, ciudad, categoría, persona, sin foto del recibo), caja diaria (efectivo, transferencias,
  Yape, gastos por categoría, saldos al cierre), saldos actuales y gastos de un proyecto desde las cajas (más presupuesto si la persona ve
  Proyectos). Períodos: hoy, ayer, semana (desde el lunes), semana anterior, mes, mes anterior o fechas exactas (`rangoDe`).
- La lectura de recibos con la cámara (OCR) **no cambió**.
- **Sin duplicados al reintentar:** cada fila y gasto lleva un id creado en el teléfono y el servidor lo guarda con «insertar o actualizar»;
  enviar a caja chica reintentado no se duplica (pruebas en `finanzas/api/src/api.test.ts` y `fin.sync.test.ts`). Finanzas 1 es una app en línea:
  sin internet no acepta cambios nuevos (decisión ya tomada), así que no hace falta una cola sin conexión.

## 4h. Cómo quedó la Fase 8 (Comparador de proveedores)

- Menú Comercial › **Comparador de proveedores**, 4 pestañas: **Buscador**, **Proveedores**, **Cargar lista**, **Historial de precios**.
  Permiso `comparador`: Ventas completo, Contabilidad lectura, Técnico ninguno (editable en Configuración).
- **Proveedores**: datos (RUC validado, contacto, moneda habitual, costo de envío: vacío = «Sin dato», 0 = incluido) y sus **páginas web**.
- **Listas** (Excel .xlsx, CSV o PDF con texto): el archivo se lee **en el navegador** (`erp/web/src/paginas/comparador/lector.ts`; el PDF con
  pdfjs-dist, columnas por la fila de títulos). Pasos: proveedor, fecha, moneda y **si incluye IGV (obligatorio)** → columnas (se recuerdan por
  proveedor; los títulos de sección como «CARGADORES» pasan a categoría) → revisión (nuevos, cambiaron, sin cambios, repetidos, errores, «Sin dato»)
  → confirmar. Probado con la lista real de Electronic Siblings (PDF, 183 filas sin errores) y el Excel de ejemplo.
- **Historial «solo agregar»**: `proveedor_precios` tiene un disparador que impide cambiar o borrar precios; cada precio guarda origen
  (archivo · fila o dirección web), fecha de la lista, cuándo se obtuvo y el **tipo de cambio usado**.
- **Páginas web** (`servidor/api/src/comparador_web.js`): tiendas WooCommerce, Shopify o páginas con datos de producto (JSON-LD), detección
  automática; respeta robots.txt, espera entre páginas (1,5 s), máximo 400 páginas por lectura, solo direcciones públicas. Se leen solas cada N días
  (revisión cada 30 min) o con «Leer ahora»; cada lectura queda en un registro con su error si falla. Tienda Solar y Dartel: falta poner su dirección.
- **Buscador**: compara en **soles con IGV** (US$ × tipo de cambio de Configuración), costo total = precio + envío conocido («+» si es «Sin dato»).
  Primero el mismo producto («exacta», por modelo/código normalizados) y luego alternativas; la **mejor opción** es la exacta vigente más barata.
  Una persona puede marcar «es el mismo» / «no es el mismo» y se respeta siempre (`proveedor_equivalencias`). Precio desactualizado = más viejo
  que la vigencia de precios de Configuración.
- **Historial de precios**: gráfico mensual por proveedor (colores fijos validados para daltonismo, también en modo oscuro) y tabla con el origen.
- El **Asistente IA** puede consultar estos precios (herramienta `precios_proveedores`, solo lectura).
- Rutas: `servidor/api/src/rutas_f8.js`; lógica: `comparador.js`; migración `009_comparador.sql`; pruebas `test/f8.test.js` y `erp/web/src/comparador.test.ts`.

## 4i. Cómo quedó la Fase 9 (Almacén y Activos y control)

- **Almacén** (Operación › Almacén), pestañas **Inventario**, **Movimientos**, **Requerimientos de materiales** y **Salidas de herramientas**
  (estas dos siguen siendo consulta de lo que se registra en Logística).
  - Artículos con código, categoría, unidad, ubicación y **stock mínimo** (vacío = sin aviso). Se crean a mano o «Desde el catálogo» de Cotización.
  - **Movimientos**: entrada (proveedor, guía/factura, costo unitario opcional), salida (proyecto y/o requerimiento) y **ajuste por conteo**
    (la persona escribe lo que contó; nota obligatoria). Varios artículos a la vez, **todo o nada**. El stock **nunca queda negativo**.
  - **Kardex solo-agregar**: `almacen_movimientos` tiene un disparador que impide cambiar o borrar; un error se corrige con **Anular**
    (movimiento contrario con motivo; el original queda).
  - **Salida desde un requerimiento** de Logística: propone sus materiales con el artículo del mismo nombre; lo que no coincide lo elige la
    persona. Si el requerimiento ya tuvo salida, pide confirmar antes de registrar otra. Logística no cambia.
  - Alerta en Inicio y campana: artículos en o bajo su mínimo. El Asistente IA consulta el stock (`stock_almacen`, solo lectura).
- **Activos y control** (Operación › Activos y control), pestañas **Sistemas instalados** y **Victron VRM**.
  - Sistemas (cliente/sitio, ubicación, fecha de instalación, proyecto, **dirección de la instalación en VRM**) y sus **equipos** (tipo, marca,
    modelo, n.° de serie, cantidad, **garantía hasta**). Aviso en Inicio de garantías que vencen en 60 días.
  - **VRM embebido** (decisión del dueño: la API no funcionó): iframe del portal oficial con la sesión de cada persona y «Abrir en pestaña nueva».
    Solo se aceptan direcciones `https://vrm.victronenergy.com/…`. No hay token ni datos de VRM en el servidor.
- Permisos: el **Técnico** pasa a «completo» en Almacén y Activos (registra movimientos y equipos; antes «lectura» y «completo» hacían lo mismo
  aquí). Ventas y Contabilidad: lectura. Editable en Configuración.
- Rutas: `servidor/api/src/rutas_f9.js`; lógica: `almacen.js`, `activos.js`; migración `010_almacen_activos.sql`; pruebas `test/f9.test.js`.

## 4j. Cómo quedó la Fase 10 (cierre)

- **Pruebas finales**: API 113, ERP 24, API de Finanzas 76, Finanzas 1 y 2 (todas pasan). **Ensayo del despliegue** con los mismos contenedores
  (Docker Compose): base desde cero con las 10 migraciones, los 5 servicios sanos, Caddy validado y sirviendo cada subdominio, respaldo,
  `probar_respaldo.sh` y `restaurar.sh` de punta a punta.
- **Seguridad** (revisión y arreglos):
  - Límite de intentos de ingreso **por persona**: la API confía solo en los saltos internos (`trust proxy` = loopback y redes privadas) y
    Finanzas reenvía la IP real; antes, 10 claves malas en Finanzas bloqueaban a todos los usuarios de Finanzas por 15 minutos.
  - Cambiar la clave propia **cierra las demás sesiones** (al cambiarla el administrador o desactivar a alguien, ya se cerraban todas).
  - Aviso en Inicio del administrador si un administrador usa una **clave de ejemplo** o si la **clave de edición** sigue en 1234.
  - Cabeceras contra *clickjacking* en todos los subdominios (`frame-ancestors 'self'`, `X-Frame-Options`).
  - `react-router-dom` 6.30.6 (corrige avisos de redirección abierta). Lo que queda en `npm audit`: `exceljs → uuid` (moderado, la función
    afectada no se usa) y herramientas de compilación de Expo (no van en la web publicada).
  - Ya estaban: claves con bcrypt, sesiones de 30 días que se pueden cerrar, permisos validados en el servidor, base y Ollama sin puertos públicos,
    archivos privados de SUNAT solo con sesión, secretos solo en `.env`, auditoría de cambios.
- **Respaldos**: `probar_respaldo.sh` (nuevo), `restaurar.sh` (detiene las 3 APIs, copia previa, también Finanzas 2), `restaurar_fotos.sh` (Finanzas 2).
- **Manual por rol**: `erp/MANUAL.md`. Guía rápida de despliegue: `servidor/DESPLIEGUE.md` § 0.

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
