// ICR Autollenado SUNAT · service worker. Guarda el comprobante pendiente en memoria de la sesión del navegador
// (chrome.storage.session: se borra al cerrar el navegador), abre SUNAT y reparte los pedidos de relleno a los marcos de la pestaña.
// Nunca guarda claves: la persona inicia sesión en SUNAT por su cuenta.
const URL_SOL = 'https://e-menu.sunat.gob.pe/cl-ti-itmenu/MenuInternet.htm';
const VIGENCIA_MS = 3 * 60 * 60 * 1000; // el comprobante pendiente vale 3 horas

async function pendiente() {
  const { pendiente: p } = await chrome.storage.session.get('pendiente');
  if (!p) return null;
  if (Date.now() - p.recibido > VIGENCIA_MS) {
    await chrome.storage.session.remove('pendiente');
    return null;
  }
  return p;
}

chrome.runtime.onMessage.addListener((m, remitente, responder) => {
  (async () => {
    if (m?.tipo === 'llenar') {
      // Solo lo acepta del content script del ERP (los dominios del manifiesto).
      await chrome.storage.session.set({ pendiente: { comprobante: m.comprobante, recibido: Date.now(), desde: remitente.origin ?? null } });
      const urlSol = (await chrome.storage.local.get('url_sol')).url_sol || URL_SOL; // solo para pruebas internas
      const tab = await chrome.tabs.create({ url: urlSol, index: (remitente.tab?.index ?? 0) + 1 });
      await chrome.storage.session.set({ pestana: tab.id });
      return { ok: true };
    }
    if (m?.tipo === 'pendiente') return { pendiente: await pendiente() };
    if (m?.tipo === 'terminar') {
      await chrome.storage.session.remove(['pendiente', 'pestana']);
      return { ok: true };
    }
    if (m?.tipo === 'rellenar' && remitente.tab?.id !== undefined) {
      // Del panel (marco principal) a todos los marcos de la misma pestaña: cada marco rellena lo que encuentre.
      const p = await pendiente();
      if (!p) return { error: 'No hay un comprobante pendiente. Vuelve al ERP y pulsa «Abrir en SUNAT».' };
      // Sin frameId llega a todos los marcos; cada uno rellena lo suyo y avisa con «resultado-marco».
      await chrome.tabs.sendMessage(remitente.tab.id, { tipo: 'rellenar-marco', que: m.que, item: m.item, comprobante: p.comprobante }).catch(() => null);
      return { ok: true };
    }
    if (m?.tipo === 'resultado-marco') {
      // Un marco avisa lo que hizo; se le pasa al panel (marco principal).
      if (remitente.tab?.id !== undefined) await chrome.tabs.sendMessage(remitente.tab.id, { tipo: 'resultado-para-panel', resultado: m.resultado }, { frameId: 0 }).catch(() => null);
      return { ok: true };
    }
    return { error: 'Pedido desconocido.' };
  })().then(responder, (e) => responder({ error: String(e?.message ?? e) }));
  return true;
});
