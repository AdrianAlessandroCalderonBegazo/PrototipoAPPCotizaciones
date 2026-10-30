# ICR Autollenado SUNAT (extensión de Chrome / Edge)

Rellena el portal **SUNAT Operaciones en Línea (SOL)** con la boleta o factura preparada en **ICR ERP › Facturación SUNAT**.

- **Nunca pulsa «Emitir»**: la emisión la haces tú después de revisar.
- **Nunca ve ni guarda tu clave SOL**: inicias sesión tú mismo.
- Los datos llegan desde el ERP por mensajes de la página (no por la dirección web) y se guardan solo en la memoria del
  navegador (se borran al cerrarlo o al pulsar «Terminé»).

## Instalar (una vez por navegador)

1. En el ERP, Facturación SUNAT › «Instalar extensión» descarga `icr-autollenado-sunat.zip`. Descomprímelo en una carpeta que no vayas a borrar.
2. Abre `chrome://extensions` (en Edge: `edge://extensions`) y activa **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** y elige la carpeta.
4. Fija el ícono (pieza de rompecabezas › chincheta) y vuelve al ERP: debe decir «Extensión conectada».

## Si SUNAT cambia su página

Todo lo que depende del portal está en **`selectores.js`**: el texto que se ve junto a cada campo («Número de RUC», «Cantidad»,
«Valor unitario»…), palabras del id/name del campo y, si se calibra, selectores CSS exactos. Si un campo sale «No lo encontré»
en el panel, se copia con su botón «Copiar» y se avisa para ajustar ese archivo.

## Archivos

| Archivo | Qué hace |
|---|---|
| `manifest.json` | Manifest V3; solo pide permiso de `storage`. Dominios: `erp.icrenergy.tech` (y `localhost` para pruebas) y `*.sunat.gob.pe`. |
| `erp.js` | Puente con la página del ERP (`window.postMessage`): responde «ping» y recibe el comprobante. |
| `fondo.js` | Guarda el comprobante pendiente (3 horas como máximo), abre SUNAT y reparte los pedidos de relleno a los marcos. |
| `sunat.js` | Busca y rellena los campos en cada marco; en la página principal muestra el panel con pasos, botones y datos para copiar. |
| `selectores.js` | Configuración del portal SOL. |

Si el ERP usa otro dominio, cámbialo en `manifest.json` (primer bloque de `content_scripts`).
