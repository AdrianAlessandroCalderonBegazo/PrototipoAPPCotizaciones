// ICR Autollenado SUNAT · en las páginas de SUNAT (todos los marcos). Rellena los campos que encuentra según selectores.js y,
// en el marco principal, muestra un panel con los pasos, los botones de relleno y los datos para copiar.
// Reglas: nunca pulsa «Emitir» (ni ningún botón de la lista «prohibidos»), nunca lee ni escribe campos de clave.
(() => {
  if (window.__icrSunat) return;
  window.__icrSunat = true;
  const CFG = typeof ICR_SELECTORES !== 'undefined' ? ICR_SELECTORES : null;
  const esPrincipal = window.top === window;

  // ---------------------------------------------------------------------------------------------
  // Buscar y rellenar campos
  // ---------------------------------------------------------------------------------------------
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[:*()]/g, ' ').replace(/\s+/g, ' ').trim();
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const usable = (el) => visible(el) && !el.disabled && !el.readOnly && el.type !== 'password' && el.type !== 'hidden';
  const CONTROLES = 'input:not([type=hidden]):not([type=password]):not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]), select, textarea';

  function coincide(texto, etiqueta) {
    const t = norm(texto);
    const e = norm(etiqueta);
    if (!t || t.length > e.length + 14) return false;
    return t === e || (e.length >= 6 && t.startsWith(e));
  }

  function controlJunto(el) {
    if (el.htmlFor) {
      const c = document.getElementById(el.htmlFor);
      if (c && usable(c)) return c;
    }
    // misma fila de tabla, luego hermanos y padres cercanos
    const fila = el.closest('tr');
    const zonas = [];
    if (fila) zonas.push(fila);
    let p = el.parentElement;
    for (let i = 0; i < 3 && p; i++, p = p.parentElement) zonas.push(p);
    for (const z of zonas) {
      const lista = [...z.querySelectorAll(CONTROLES)].filter(usable);
      // el primero que esté DESPUÉS de la etiqueta en el documento
      const despues = lista.find((c) => el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (despues) return despues;
    }
    return null;
  }

  function buscar(campo) {
    for (const css of campo.css ?? []) {
      const el = [...document.querySelectorAll(css)].find(campo.tipo === 'radio' ? visible : usable);
      if (el) return el;
    }
    if (campo.tipo === 'radio') return null; // los radios se buscan por su texto, en asignar()
    if (campo.etiquetas?.length) {
      const candidatos = document.querySelectorAll('label, td, th, span, div, b, strong, p, legend, dt');
      for (const etiqueta of campo.etiquetas) {
        for (const el of candidatos) {
          if (el.children.length > 2 || !visible(el)) continue;
          const propio = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ') || el.textContent;
          if (!coincide(propio, etiqueta)) continue;
          const c = controlJunto(el);
          if (c && (campo.tipo !== 'select' || c.tagName === 'SELECT' || c.getAttribute('role') === 'combobox')) return c;
        }
      }
    }
    for (const clave of campo.claves ?? []) {
      const k = norm(clave).replace(/\s/g, '');
      const el = [...document.querySelectorAll(CONTROLES)].find((c) => usable(c) && [c.id, c.name, c.placeholder, c.getAttribute('aria-label')].some((a) => norm(a).replace(/\s/g, '').includes(k)));
      if (el) return el;
    }
    return null;
  }

  function escribir(el, valor) {
    el.focus();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
    for (const ev of ['input', 'change']) el.dispatchEvent(new Event(ev, { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function clicSeguro(el) {
    const texto = `${el.textContent ?? ''} ${el.value ?? ''} ${el.getAttribute?.('aria-label') ?? ''}`;
    if (CFG.prohibidos.test(texto)) return false; // jamás
    el.click();
    return true;
  }

  /** Devuelve 'ok' | 'revisar' | 'no_encontrado' | 'sin_dato'. */
  function asignar(campo, valor) {
    if (valor === null || valor === undefined || valor === '') return 'sin_dato';
    if (campo.tipo === 'radio') {
      const patron = campo.opciones?.[valor];
      if (!patron) return 'sin_dato';
      const radios = [...document.querySelectorAll('input[type=radio]')].filter(visible);
      for (const r of radios) {
        const etiqueta = (r.id && document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.textContent) || r.parentElement?.textContent || r.value;
        if (patron.test(norm(etiqueta))) {
          if (!r.checked) clicSeguro(r);
          return r.checked ? 'ok' : 'revisar';
        }
      }
      return 'no_encontrado';
    }
    const el = buscar(campo);
    if (!el) return 'no_encontrado';
    if (campo.solo_si_vacio && el.value && el.value.trim()) return 'ok'; // SUNAT ya lo completó (p. ej. razón social del RUC)
    if (el.tagName === 'SELECT') {
      const patron = campo.opciones?.[valor];
      const op = [...el.options].find((o) => (patron ? patron.test(o.textContent.trim()) || patron.test(o.value) : norm(o.textContent) === norm(valor)));
      if (!op) return 'revisar';
      el.value = op.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    }
    if (campo.tipo === 'select') {
      // lista «inteligente» (combobox): se escribe el texto y se deja para revisar
      escribir(el, String(valor));
      return 'revisar';
    }
    escribir(el, String(valor));
    return el.value === String(valor) ? 'ok' : 'revisar';
  }

  const ETIQUETA = {
    tipo_doc: 'Tipo de documento', doc: 'RUC / DNI del cliente', nombre: 'Nombre o razón social', direccion: 'Dirección', moneda: 'Moneda',
    forma_pago: 'Forma de pago', observacion: 'Observación', bien_servicio: 'Bien o servicio', cantidad: 'Cantidad', unidad: 'Unidad de medida',
    descripcion: 'Descripción', valor_unitario: 'Valor unitario (sin IGV)',
  };

  function valoresDe(c, que, n) {
    if (que === 'item') {
      const it = c.items[n] ?? {};
      return { bien_servicio: it.unidad === 'ZZ' ? 'servicio' : 'bien', cantidad: it.cantidad, unidad: it.unidad, descripcion: it.descripcion, valor_unitario: it.valor_unitario };
    }
    return {
      tipo_doc: c.tipo === 'boleta' ? (c.cliente_tipo_doc ?? 'NINGUNO') : null,
      doc: c.cliente_doc, nombre: c.cliente_nombre, direccion: c.cliente_direccion,
      moneda: c.moneda, forma_pago: c.forma_pago, observacion: c.observacion,
    };
  }

  function rellenar(c, que, n) {
    if (!CFG) return [];
    const grupos = que === 'item' ? ['item'] : ['cliente', 'comprobante'];
    const v = valoresDe(c, que, n);
    const out = [];
    for (const g of grupos) {
      for (const campo of CFG.pantallas[g]) {
        if (campo.dato === 'tipo_doc' && c.tipo !== 'boleta') continue;
        const estado = asignar(campo, v[campo.dato]);
        if (estado === 'sin_dato') continue;
        out.push({ dato: campo.dato, etiqueta: ETIQUETA[campo.dato] ?? campo.dato, estado, opcional: !!campo.opcional });
      }
    }
    return out;
  }

  chrome.runtime.onMessage.addListener((m) => {
    if (m?.tipo === 'rellenar-marco') {
      const resultado = rellenar(m.comprobante, m.que, m.item ?? 0);
      chrome.runtime.sendMessage({ tipo: 'resultado-marco', resultado });
    }
    if (m?.tipo === 'resultado-para-panel' && esPrincipal) panel?.recibir(m.resultado);
  });

  // ---------------------------------------------------------------------------------------------
  // Panel (solo en el marco principal)
  // ---------------------------------------------------------------------------------------------
  let panel = null;
  if (!esPrincipal) return;

  const dinero = (m, mon) => `${mon === 'USD' ? 'US$' : 'S/'} ${Number(m ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

  chrome.runtime.sendMessage({ tipo: 'pendiente' }).then((r) => {
    const p = r?.pendiente;
    if (!p) return;
    panel = crearPanel(p.comprobante);
  }).catch(() => null);

  function crearPanel(c) {
    const host = document.createElement('div');
    host.id = 'icr-autollenado';
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
    const raiz = host.attachShadow({ mode: 'open' });
    raiz.innerHTML = `<style>
      *{box-sizing:border-box;font-family:Manrope,Segoe UI,Arial,sans-serif}
      .p{width:360px;max-height:80vh;display:flex;flex-direction:column;background:#fff;color:#0e2233;border:1px solid #d6e0e8;border-radius:16px;box-shadow:0 12px 40px rgba(14,34,51,.25);overflow:hidden;font-size:13px}
      .c{display:flex;align-items:center;gap:8px;padding:12px 14px;background:linear-gradient(120deg,#0e2a47,#163d63);color:#fff}
      .c b{flex:1;font-size:13.5px}.c button{background:transparent;border:0;color:#fff;cursor:pointer;font-size:16px}
      .s{padding:12px 14px;overflow:auto;display:flex;flex-direction:column;gap:10px}
      .aviso{background:#fff4e0;color:#8a5300;border-radius:10px;padding:8px 10px;font-weight:600}
      .btn{display:flex;align-items:center;justify-content:center;gap:6px;height:36px;border-radius:10px;border:1px solid #1b6f8a;background:#1b6f8a;color:#fff;font-weight:700;cursor:pointer;width:100%}
      .btn.s2{background:#fff;color:#1b6f8a}.btn:disabled{opacity:.5;cursor:default}
      .fila{display:flex;align-items:center;gap:8px}.fila .btn{width:auto;flex:1}.fila .btn.s2{flex:0 0 40px}
      ol{margin:0;padding-left:18px;color:#3b5163;line-height:1.45}
      .r div{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eef2f5}
      .ok{color:#14804a;font-weight:700}.rev{color:#8a5300;font-weight:700}.no{color:#c0392b;font-weight:700}
      details summary{cursor:pointer;font-weight:700;color:#1b6f8a}
      .d{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #eef2f5}.d span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .d small{color:#6b7f90;display:block}.d button{border:1px solid #d6e0e8;background:#f5f8fa;border-radius:7px;padding:2px 7px;cursor:pointer;font-size:12px}
      .t{display:flex;justify-content:space-between}.t b{font-variant-numeric:tabular-nums}
      .min .s{display:none}
    </style>
    <div class="p">
      <div class="c"><b>ICR · ${c.tipo === 'factura' ? 'Factura' : 'Boleta'} para ${esc(c.cliente_nombre ?? 'cliente sin nombre')}</b><button data-a="min" title="Minimizar">–</button></div>
      <div class="s">
        <div class="aviso">La extensión nunca pulsa «Emitir». Al final revisa la vista previa de SUNAT y emite tú.</div>
        <ol>
          <li>Inicia sesión con tu clave SOL (la extensión no la ve ni la guarda).</li>
          <li>Entra a Comprobantes de pago › SEE - SOL › ${c.tipo === 'factura' ? 'Factura' : 'Boleta de venta'} › Emitir.</li>
          <li>En la pantalla de datos del cliente pulsa <b>Rellenar cliente y pago</b>.</li>
          <li>Por cada ítem: pulsa «Agregar» en SUNAT y luego <b>Rellenar ítem</b>.</li>
          <li>Compara los totales con los de abajo y emite en SUNAT.</li>
          <li>Vuelve al ERP y marca el comprobante como emitido con el número que dio SUNAT.</li>
        </ol>
        <button class="btn" data-a="cliente">Rellenar cliente y pago</button>
        <div class="fila"><button class="btn s2" data-a="ant">‹</button><button class="btn" data-a="item">Rellenar ítem <span data-n>1</span> de ${c.items.length}</button><button class="btn s2" data-a="sig">›</button></div>
        <div class="r" data-r></div>
        <div class="t"><span>Op. gravada</span><b>${dinero(c.totales.op_gravada, c.moneda)}</b></div>
        <div class="t"><span>IGV 18%</span><b>${dinero(c.totales.igv, c.moneda)}</b></div>
        <div class="t"><span><b>Total</b></span><b>${dinero(c.totales.total, c.moneda)}</b></div>
        <details><summary>Datos para copiar</summary><div data-copiar></div></details>
        <button class="btn s2" data-a="fin">Terminé · borrar datos de la extensión</button>
      </div>
    </div>`;
    document.documentElement.appendChild(host);
    const $ = (s) => raiz.querySelector(s);
    let n = 0;
    let acumulado = [];
    let reloj = null;

    const copiables = [
      [c.cliente_tipo_doc ?? 'Documento', c.cliente_doc], ['Cliente', c.cliente_nombre], ['Dirección', c.cliente_direccion],
      ...c.items.flatMap((it, i) => [[`Ítem ${i + 1} · descripción`, it.descripcion], [`Ítem ${i + 1} · cantidad`, it.cantidad], [`Ítem ${i + 1} · valor unitario`, it.valor_unitario]]),
      ...c.cuotas.flatMap((q, i) => [[`Cuota ${i + 1} · monto`, q.monto], [`Cuota ${i + 1} · vence`, q.fecha?.split('-').reverse().join('/')]]),
      ['Observación', c.observacion],
    ].filter(([, v]) => v);
    $('[data-copiar]').innerHTML = copiables.map(([l, v], i) => `<div class="d"><span><small>${esc(l)}</small>${esc(v)}</span><button data-c="${i}">Copiar</button></div>`).join('');
    $('[data-copiar]').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-c]');
      if (!b) return;
      await navigator.clipboard.writeText(String(copiables[Number(b.dataset.c)][1])).catch(() => null);
      b.textContent = 'Copiado';
      setTimeout(() => (b.textContent = 'Copiar'), 1200);
    });

    function pintar() {
      // Junta lo que dijeron todos los marcos: si alguno lo rellenó, cuenta como hecho.
      const mejor = {};
      const peso = { ok: 3, revisar: 2, no_encontrado: 1 };
      for (const r of acumulado) if (!mejor[r.dato] || peso[r.estado] > peso[mejor[r.dato].estado]) mejor[r.dato] = r;
      const filas = Object.values(mejor).filter((r) => !(r.opcional && r.estado === 'no_encontrado'));
      const texto = { ok: ['ok', 'Listo'], revisar: ['rev', 'Revisa'], no_encontrado: ['no', 'No lo encontré · cópialo'] };
      $('[data-r]').innerHTML = filas.length
        ? filas.map((r) => `<div><span>${esc(r.etiqueta)}</span><span class="${texto[r.estado][0]}">${texto[r.estado][1]}</span></div>`).join('')
        : '<div><span>No encontré campos en esta pantalla. ¿Ya estás en el formulario de emisión?</span></div>';
    }
    function pedir(que) {
      acumulado = [];
      $('[data-r]').innerHTML = '<div><span>Rellenando…</span></div>';
      chrome.runtime.sendMessage({ tipo: 'rellenar', que, item: n }).then((r) => {
        if (r?.error) $('[data-r]').innerHTML = `<div><span class="no">${esc(r.error)}</span></div>`;
      });
      clearTimeout(reloj);
      reloj = setTimeout(pintar, 1200);
    }
    const ponerN = (v) => {
      n = Math.max(0, Math.min(c.items.length - 1, v));
      $('[data-n]').textContent = String(n + 1);
    };
    raiz.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'min') $('.p').classList.toggle('min');
      if (a === 'cliente') pedir('cliente');
      if (a === 'item') pedir('item');
      if (a === 'ant') ponerN(n - 1);
      if (a === 'sig') ponerN(n + 1);
      if (a === 'fin') chrome.runtime.sendMessage({ tipo: 'terminar' }).then(() => host.remove());
    });
    return {
      recibir(resultado) {
        acumulado.push(...(resultado ?? []));
        clearTimeout(reloj);
        reloj = setTimeout(pintar, 300);
      },
    };
  }
})();
