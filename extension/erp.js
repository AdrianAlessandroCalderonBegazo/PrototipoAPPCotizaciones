// ICR Autollenado SUNAT · puente con la página del ERP. La página habla con window.postMessage (nunca por la URL):
//   { origen: 'icr-erp', tipo: 'ping' }                    → { origen: 'icr-ext', tipo: 'pong', version }
//   { origen: 'icr-erp', tipo: 'llenar', comprobante: {…} } → abre SUNAT con los datos → { origen: 'icr-ext', tipo: 'abierto' | 'error', mensaje? }
(() => {
  const VERSION = chrome.runtime.getManifest().version;
  const responder = (m) => window.postMessage({ origen: 'icr-ext', ...m }, window.location.origin);

  /** Solo pasan los campos que la extensión usa, con tamaños razonables. */
  function limpiar(c) {
    if (!c || typeof c !== 'object') return null;
    const t = (v, max = 500) => (v === null || v === undefined ? null : String(v).slice(0, max));
    if (!['factura', 'boleta'].includes(c.tipo)) return null;
    const items = Array.isArray(c.items) ? c.items.slice(0, 200) : [];
    return {
      id: Number(c.id) || null,
      tipo: c.tipo,
      moneda: c.moneda === 'USD' ? 'USD' : 'PEN',
      cliente_tipo_doc: t(c.cliente_tipo_doc, 3),
      cliente_doc: t(c.cliente_doc, 11),
      cliente_nombre: t(c.cliente_nombre, 255),
      cliente_direccion: t(c.cliente_direccion, 255),
      forma_pago: c.forma_pago === 'credito' ? 'credito' : 'contado',
      cuotas: (Array.isArray(c.cuotas) ? c.cuotas.slice(0, 24) : []).map((q) => ({ fecha: t(q.fecha, 10), monto: t(q.monto, 20) })),
      observacion: t(c.observacion, 500),
      items: items.map((i) => ({ descripcion: t(i.descripcion), unidad: t(i.unidad, 3), cantidad: t(i.cantidad, 20), valor_unitario: t(i.valor_unitario, 20), valor_venta: t(i.valor_venta, 20), igv: t(i.igv, 20), importe: t(i.importe, 20) })),
      totales: { op_gravada: t(c.totales?.op_gravada, 20), igv: t(c.totales?.igv, 20), total: t(c.totales?.total, 20) },
      emisor: { ruc: t(c.emisor?.ruc, 11), nombre: t(c.emisor?.nombre, 255) },
    };
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const m = e.data;
    if (!m || m.origen !== 'icr-erp') return;
    if (m.tipo === 'ping') return responder({ tipo: 'pong', version: VERSION });
    if (m.tipo === 'llenar') {
      const comprobante = limpiar(m.comprobante);
      if (!comprobante) return responder({ tipo: 'error', mensaje: 'Los datos del comprobante no son válidos.' });
      chrome.runtime.sendMessage({ tipo: 'llenar', comprobante }).then(
        (r) => responder(r?.ok ? { tipo: 'abierto' } : { tipo: 'error', mensaje: r?.error ?? 'No se pudo abrir SUNAT.' }),
        () => responder({ tipo: 'error', mensaje: 'La extensión no respondió. Recarga la página e intenta de nuevo.' }),
      );
    }
  });
  // Aviso temprano para que la página sepa que la extensión está instalada.
  document.documentElement.dataset.icrSunat = VERSION;
})();
