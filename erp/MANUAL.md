# Manual de uso · ICR ERP, Logística y Finanzas

Guía corta para cada rol. Direcciones:

| App | Dirección | Para qué |
|---|---|---|
| **ICR ERP** | `https://erp.icrenergy.tech` | La app central: proyectos, contabilidad, cotizaciones, facturación, almacén, activos, proveedores, IA |
| **Logística** | `https://cotizador.icrenergy.tech` | En el celular: requerimientos de materiales y salidas de herramientas |
| **Finanzas** | `https://finanzas.icrenergy.tech` | La **Caja ICR**: gastos, capturas de Yape, ventas, historial, «Preguntar» y reportes |
| Vista general | `https://app.icrenergy.tech` | Usuarios (versión simple) y la clave de edición de Logística |

Todas usan **el mismo usuario y clave**. Lo que cada persona ve depende de su **rol** (Administrador, Ventas, Contabilidad, Técnico) y de la
**matriz de permisos** que maneja el Administrador (ERP › Configuración › Matriz de permisos). Lo de abajo es lo que trae cada rol de fábrica.

## Para todos

- **Entrar:** usuario y clave. Tras 10 intentos fallidos seguidos hay que esperar 15 minutos.
- **La sesión dura 30 días** en cada equipo. Para salir: tu nombre (arriba a la derecha) › Cerrar sesión. Hazlo en equipos que no son tuyos.
- **Cambiar tu clave:** tu nombre › Cambiar clave (mínimo 6 caracteres). Al cambiarla, **se cierran tus sesiones en los otros equipos**.
- **Buscar cualquier cosa:** `Ctrl + K` (proyectos, cotizaciones, productos, comprobantes…).
- **La campana** avisa lo que necesita atención: presupuestos al límite, stock bajo, garantías por vencer, la Caja ICR en negativo, comprobantes sin terminar, etc.
- **«Sin dato»** significa que esa información no se registró: el sistema nunca la inventa.
- **Modo oscuro:** el botón de la luna, arriba.
- **Asistente IA y «Preguntar»:** las consultas frecuentes se responden al instante («Respuesta directa · sin IA»); las preguntas más abiertas las
  responde la IA y pueden tardar unos segundos.
- Nada de dinero, estados ni movimientos se borra: se **anula** con un motivo y queda en el historial (y en la auditoría).

## Administrador

Ve y hace todo. Además:

1. **Configuración › Usuarios:** crear personas, darles un rol, cambiar su clave o desactivarlas (al desactivar, se cierran sus sesiones).
2. **Matriz de permisos:** para cada rol y módulo elige *Ninguno*, *Lectura* (solo ver) o *Completo* (ver y registrar). Se aplica al instante.
3. **Datos de la empresa** (RUC, logo, cuentas bancarias del PDF), **Parámetros** (tipo de cambio — actualízalo seguido —, avisos de presupuesto,
   vigencia de precios), **Numeración** de cotizaciones, **Integraciones** (botón «Probar» en cada una) e **Inteligencia artificial**.
4. **Auditoría:** quién cambió qué y cuándo.
5. **Seguridad:** si Inicio muestra «todavía usa una clave de ejemplo» o «la clave de edición sigue siendo 1234», cámbialas
   (la de edición, en la vista general `app.` › Usuarios › «Cambiar clave de edición»).
6. **Respaldos:** se hacen solos cada noche en el servidor. Una vez al mes pide que se corra `./scripts/probar_respaldo.sh` (ver DESPLIEGUE.md).

## Ventas

| Módulo | Qué puede |
|---|---|
| Cotización | Todo: catálogo, kits, cotizaciones, PDF, WhatsApp |
| Cotizador IA | Pedir una cotización en palabras («sistema de 5 kW con baterías para…»); la IA propone y **tú la guardas** |
| Comparador de proveedores | Todo: buscar precios, cargar listas, marcar «es / no es el mismo producto» |
| Facturación SUNAT | Preparar y emitir comprobantes |
| Asistente IA | Preguntar por datos que su rol puede ver |
| Proyectos, Almacén, Activos | Solo consultar |

**Hacer una cotización:** Cotización › Nueva → cliente → agrega productos o kits → revisa descuentos (los precios ya incluyen IGV) → Guardar →
PDF o WhatsApp. Cuando el cliente responde, marca *Aceptada* o *Rechazada*.

**Cotización guiada (al instante, sin IA):** Cotizador IA › «Cotización guiada» → tipo (On-Grid, híbrido o aislado), consumo del recibo
(kWh al mes) o potencia (kW) y, si lleva baterías, los kWh o las horas de respaldo → Calcular. Elige paneles, inversor y baterías del catálogo
(primero los **preferidos** de Cotizador IA › Contexto) con 5.5 h de sol. También funciona si lo escribes claro en el chat («híbrido de 10 kW para
900 kWh/mes»). Luego «Abrir en Cotización» y completa estructura e instalación.

**Comparar precios:** Comparador › Buscador → escribe el modelo (ej. «MultiPlus-II 48/3000»). Arriba sale la **mejor opción** (mismo producto,
precio vigente, en soles con IGV y envío). Haz clic en una fila para ver de qué lista o página salió el precio.

**Cargar una lista de proveedor:** Comparador › Cargar lista → proveedor, fecha, archivo (Excel, CSV o PDF) y **si los precios incluyen IGV** →
revisa las columnas → revisa nuevos / cambios / errores → Guardar. Los precios anteriores no se borran (quedan en el historial).

**Emitir una factura o boleta:** Facturación SUNAT › Emitir comprobante (o «Facturar» en una cotización aceptada) → revisa cliente e ítems →
«Abrir SUNAT»: la extensión de Chrome rellena el portal SOL → **tú revisas y pulsas Emitir en SUNAT** → vuelves al ERP y registras el número
que dio SUNAT. La extensión se instala una vez: Facturación › «Instalar extensión».

## Contabilidad

| Módulo | Qué puede |
|---|---|
| Contabilidad | Todo: cuentas, ingresos y egresos (compras, sueldos…), anular, enviar fondos a la Caja ICR, Excel/PDF |
| Proyectos | Todo: crear, presupuesto, estado, fotos |
| Facturación SUNAT | Preparar y emitir comprobantes |
| Finanzas (app) | Todo en la Caja ICR |
| Asistente IA | Preguntar por finanzas, proyectos, etc. |
| Cotización, Comparador, Almacén, Activos | Solo consultar |

**Registrar un movimiento:** Contabilidad › Movimientos › Nuevo → ingreso o egreso, monto, categoría, proyecto (si es gasto de obra) → Guardar.
Un error se corrige con **Anular** (pide motivo) y registrando el correcto.

**Enviar dinero a la Caja ICR:** Contabilidad › «Enviar fondos a Caja ICR» → elige **Efectivo** o **Digital**, monto y motivo. Sale de la
cuenta principal y entra a la caja en una sola operación. Si te equivocas, anula ese egreso en Movimientos: sale de la caja también.

**La cuenta principal solo se mueve desde el ERP** (compras de productos, pago de sueldos, etc.). Lo único que llega solo es el
«Depósito desde Caja ICR», cuando alguien deposita el efectivo de la caja en el banco (se anula desde la app de Finanzas).

**Caja ICR (app Finanzas):** una sola caja con dos saldos, **efectivo** y **digital** (Yape / transferencias). No hay ciudades ni cierre del día.
- **Gasto físico**: categoría, descripción, monto y la **foto del recibo** (la app lee el recibo y llena lo que pueda).
- **Gasto digital**: «Elegir capturas» → elige **varias capturas de Yape o del BCP a la vez** → revisa cada una (monto, fecha, categoría) →
  Registrar. Si una captura ya estaba registrada (mismo n.º de operación), la app avisa y no la duplica.
- **Venta / ingreso**: en efectivo o digital.
- **Depósito a cuenta principal**: en Gasto físico, elige esa categoría: el monto sale de la caja y entra a la cuenta principal del ERP.
- **Historial**: toca un movimiento para ver sus fotos, **corregirlo**, agregar una foto o **anularlo** (pide el motivo).
- **Preguntar**: por ejemplo «¿cuánto se gastó esta semana?» o «¿cuánto se pagó por Yape este mes?».
- **Reportes**: elige el período y descarga el **Excel**.
- **Administrador**: «Ajustar saldo» para poner el saldo inicial de efectivo y de digital, o para cuadrar con lo contado.

## Técnico

| Módulo | Qué puede |
|---|---|
| Logística (app) | Todo: requerimientos, aprobar, alistar, salidas y devoluciones de herramientas |
| Almacén | Todo: artículos, entradas, salidas, ajustes, kardex |
| Activos y control | Todo: sistemas instalados, equipos, portal VRM |
| Proyectos | Solo consultar |

**Pedir materiales (app Logística):** Nuevo requerimiento → obra → marca los materiales y cantidades → Enviar. Almacén lo aprueba y lo alista.

**Registrar lo que sale del almacén:** ERP › Almacén › Requerimientos de materiales › **Registrar salida** en el requerimiento → revisa que
cada material tenga su artículo y la cantidad → Registrar. El stock baja solo. Si algo no alcanza, el sistema avisa y **no descuenta nada**.

**Cuando llega material:** Almacén › Registrar movimiento › **Entrada** → artículo(s) y cantidad, proveedor y guía o factura → Registrar.

**Conteo físico:** Almacén › Registrar movimiento › **Ajuste (conteo)** → escribe lo que contaste y el motivo. El sistema guarda la diferencia.

**Ver la historia de un artículo:** clic en el artículo (kardex): cada entrada y salida, quién la hizo y el stock después.

**Registrar un sistema instalado:** Activos y control › Nuevo sistema → cliente, ubicación, fecha, proyecto y la **dirección de VRM** (abre la
instalación en VRM y copia la dirección del navegador) → + Agregar equipo (marca, modelo, **n.° de serie**, garantía). En la pestaña
**Victron VRM** se ve el portal dentro del ERP con tu sesión de VRM; si no se muestra, usa «Abrir en pestaña nueva».

## Si algo falla

- «La sesión venció»: vuelve a entrar.
- «Tu rol no permite…»: pídele al Administrador el permiso en la matriz.
- La IA no responde: el Administrador revisa Configuración › Integraciones › Ollama (botón Probar).
- Cualquier otro error: anota qué estabas haciendo y la hora, y avisa al Administrador (la auditoría guarda los cambios).
