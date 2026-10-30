// ICR Autollenado SUNAT · CONFIGURACIÓN DEL PORTAL SOL (lo único que hay que tocar si SUNAT cambia su página).
// Cada campo se busca así, en orden:
//   1. «css»: selectores CSS exactos (vacíos hasta calibrarlos con el portal real; si uno funciona, se usa ese).
//   2. «etiquetas»: el texto que se ve al lado del campo en SUNAT (sin importar mayúsculas, tildes ni «:»).
//   3. «claves»: palabras que pueden aparecer en el id, name, placeholder o aria-label del campo.
// Para las listas desplegables, «opciones» dice qué opción elegir según el dato del ERP (expresiones regulares).
// La extensión NUNCA hace clic en botones cuyo texto coincida con «prohibidos».
var ICR_SELECTORES = {
  version: '2026-10-30 (sin calibrar con el portal real)',
  prohibidos: /emitir|firmar|enviar|generar\s+(el\s+)?comprobante|grabar\s+comprobante/i,
  pantallas: {
    cliente: [
      { dato: 'tipo_doc', tipo: 'select', etiquetas: ['tipo de documento', 'tipo de doc', 'tipo documento'], claves: ['tipodoc', 'tipodocumento'],
        opciones: { DNI: /d\.?n\.?i|identidad/i, RUC: /r\.?u\.?c|contribuyente/i, NINGUNO: /sin documento|varios|no domiciliado/i }, css: [] },
      { dato: 'doc', tipo: 'texto', etiquetas: ['numero de ruc', 'ruc del cliente', 'ruc del adquirente', 'numero de documento', 'nro. de documento', 'nro documento', 'documento de identidad', 'ruc'],
        claves: ['numruc', 'ruccliente', 'numdoc', 'nrodoc', 'numerodocumento'], css: [] },
      { dato: 'nombre', tipo: 'texto', etiquetas: ['apellidos y nombres', 'nombres y apellidos', 'razon social', 'denominacion', 'nombre del cliente', 'nombre'],
        claves: ['razonsocial', 'nombrecliente', 'desnombre'], solo_si_vacio: true, css: [] },
      { dato: 'direccion', tipo: 'texto', etiquetas: ['direccion del cliente', 'direccion'], claves: ['direccion'], solo_si_vacio: true, opcional: true, css: [] },
    ],
    comprobante: [
      { dato: 'moneda', tipo: 'select', etiquetas: ['tipo de moneda', 'moneda'], claves: ['moneda'], opciones: { PEN: /sol/i, USD: /d[oó]lar|us\$|usd/i }, css: [] },
      { dato: 'forma_pago', tipo: 'select', etiquetas: ['forma de pago', 'tipo de pago', 'condicion de pago'], claves: ['formapago', 'tipopago'],
        opciones: { contado: /contado/i, credito: /cr[eé]dito/i }, opcional: true, css: [] },
      { dato: 'observacion', tipo: 'texto', etiquetas: ['observacion', 'observaciones', 'informacion adicional'], claves: ['observacion'], opcional: true, css: [] },
    ],
    item: [
      { dato: 'bien_servicio', tipo: 'radio', opciones: { bien: /^bien(es)?$/i, servicio: /^servicios?$/i }, opcional: true, css: [] },
      { dato: 'cantidad', tipo: 'texto', etiquetas: ['cantidad'], claves: ['cantidad', 'cant'], css: [] },
      { dato: 'unidad', tipo: 'select', etiquetas: ['unidad de medida', 'unidad'], claves: ['unidadmedida', 'unidad'],
        opciones: { NIU: /unidad|^niu|bienes/i, ZZ: /servicio|^zz/i, MTR: /^metro|mtr/i }, css: [] },
      { dato: 'descripcion', tipo: 'texto', etiquetas: ['descripcion', 'descripcion del bien o servicio'], claves: ['descripcion', 'desitem'], css: [] },
      { dato: 'valor_unitario', tipo: 'texto', etiquetas: ['valor unitario', 'valor unit', 'precio unitario sin igv', 'valor unitario (sin igv)'], claves: ['valorunitario', 'valunitario', 'mtovalorunitario'], css: [] },
    ],
  },
};
