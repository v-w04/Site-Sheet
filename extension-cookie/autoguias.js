// Guias automaticas (v1.5.5). Se carga con importScripts desde background.js.
//
// gaEnPagina corre DENTRO de https://electronicsmexico.site/walmart/guias (mundo MAIN, con executeScript) y usa las funciones
// y candados de la propia pagina: wgProcesar() pide DOS clics (armar y confirmar), el servidor relee Odoo ("autorizar"),
// la pagina no deja comprar sin medidas ni sin venta en Odoo. Aqui solo se decide QUE casillas quedan marcadas y se dan los 2 clics.
//
// NO cancela nada en Walmart. Solo compra guias y marca enviado, que es lo que ya hacia la pagina con una persona.
// SIN referencias a variables de fuera: executeScript serializa la funcion tal cual.
// Falla cerrado: ante cualquier duda (Odoo no contesto, precios no cargaron, lista del Sheet vacia por error) no se compra nada.

async function gaEnPagina(lista, opts) {
  const esp = ms => new Promise(r => setTimeout(r, ms));
  const R = { ok: false, modo: opts.modo === 'real' ? 'real' : 'prueba', comprados: [], intentados: [], saltados: {}, sinMedidas: [], canceladasSinFila: [], fallos: [], rellenadas: [], vistos: [], resultados: { ok: 0, pend: 0, mal: 0 }, error: '', total: 0 };
  const salta = (motivo, po) => { (R.saltados[motivo] = R.saltados[motivo] || []).push(String(po)); };
  const sub = () => String((document.getElementById('wg-sub') || {}).textContent || '');
  const nota = () => String((document.getElementById('wg-nota') || {}).textContent || '');
  try {
    if (!lista || !Array.isArray(lista.retener) || !Array.isArray(lista.enviar)) { R.error = 'lista_del_sheet_invalida'; return R; }
    const retener = new Set(lista.retener.map(String)), enviar = new Set(lista.enviar.map(String)), forzados = new Set((lista.forzados || []).map(String));
    const yaIntentadas = new Set((opts.yaIntentadas || []).map(String));
    const umbral = Number(lista.umbralPct) / 100;
    if (!(umbral > 0)) { R.error = 'sin_umbral_de_precio'; return R; }
    // ESPERA: un pedido no se compra hasta que lleve esperaMin minutos visto por la extension (da tiempo a que llegue su cancelacion).
    const esperaMs = Number(lista.esperaMin) * 60000;
    if (!(esperaMs >= 600000)) { R.error = 'sin_espera_minima_del_sheet'; return R; }
    // El Sheet debe haber leido los correos del cliente hace poco: si no, no hay informacion fresca y no se compra nada.
    if (!(Number(lista.lecturaMin) >= 0) || Number(lista.lecturaMin) > 45) { R.error = 'el_sheet_no_ha_leido_correos_del_cliente_hace_poco'; return R; }
    const vistas = opts.vistas || {}, ahoraMs = Date.now();

    // 1) esperar a que la pagina termine de cargar su lista (ella misma la pide al abrir)
    const t0 = Date.now();
    let estables = 0, reintentoExt = false;
    while (Date.now() - t0 < (opts.esperaMs || 150000)) {
      if (typeof WG === 'object' && WG && typeof wgProcesar === 'function' && document.getElementById('wg-body')) {
        const s = sub();
        if (/Falta la extensi/.test(s) && window.WMExt && !reintentoExt) { reintentoExt = true; try { wgCargar(); } catch (e) {} await esp(1500); continue; }
        const cargando = /Consultando Walmart/.test(s) || !s;
        const hayContenido = !!document.querySelector('.wg-row') || /No hay pedidos|No pude leer|Falta la extensi/.test((document.getElementById('wg-body') || {}).textContent || '');
        if (!cargando && hayContenido && !WG.corriendo) { if (++estables >= 2) break; } else estables = 0;
      }
      await esp(1000);
    }
    if (estables < 2) { R.error = 'la_pagina_no_termino_de_cargar'; return R; }
    const s0 = sub();
    if (/Falta la extensi/.test(s0)) { R.error = 'falta_la_extension_de_guias'; return R; }
    if (/No pude leer Walmart/.test(s0)) { R.error = 'sin_sesion_de_walmart'; return R; }
    if (!WG.puede) { R.error = 'sin_permiso_en_la_pagina'; return R; }
    R.total = (WG.pedidos || []).length;
    if (!R.total) { R.ok = true; return R; }
    if (!WG.odooOk) { R.error = 'odoo_no_contesto'; return R; }
    if (!WG.precioOk) { R.error = 'precios_no_cargaron'; return R; }

    // 2) decidir pedido por pedido
    const perdida = po => {
      const pr = (WG.precios || {})[po];
      if (!pr || !Array.isArray(pr.lineas) || !pr.lineas.length) return null;
      let m = 0;
      for (const l of pr.lineas) { if (!(l.minimo > 0)) return null; if (l.diferencia > 0) m = Math.max(m, l.diferencia / l.minimo); }
      return m;
    };
    const aprobadas = [];
    const filas = Array.from(document.querySelectorAll('.wg-row'));
    for (const row of filas) {
      const p = (WG.pedidos || [])[parseInt(row.getAttribute('data-i'), 10)];
      const ck = row.querySelector('.wg-ck');
      if (!p || !ck || p.yaTieneGuia || row.classList.contains('ya')) continue;
      const po = String(p.po || '');
      if (!po) continue;
      if (row.classList.contains('canc-ok') && !retener.has(po) && !enviar.has(po)) R.canceladasSinFila.push(po);   // cancelada en Odoo/site y el Sheet no la conoce: se reporta para anotarla
      R.vistos.push(po);
      if (retener.has(po)) { salta('retenido por el Sheet (precio erroneo, sobreventa o todavia sin quedar en Odoo)', po); continue; }
      if (ck.disabled) { salta(wgOdooBloq(po) ? 'sin venta en Odoo' : 'apartado por la pagina', po); continue; }
      if (!(WG.odooEst || {})[po]) { salta('sin estado de Odoo (no se envia sin saber su estatus)', po); continue; }
      const dims = Array.from(row.querySelectorAll('.wg-dim'));
      // Caja recordada: solo si Odoo NO tiene la medida, las 4 casillas estan vacias, el pedido es de UNA pieza y esa caja la tecleo una persona antes para ese mismo SKU.
      if (dims.length === 4 && dims.every(d => !String(d.value).trim()) && !(((WG.medidas || {})[p.sku] || {}).ok)) {
        const cj = (opts.cajas || {})[String(p.sku || '')], prc = (WG.precios || {})[po];
        const unaPieza = !!prc && Array.isArray(prc.lineas) && prc.lineas.length === 1 && Number(prc.lineas[0].cantidad) === 1;
        if (cj && unaPieza && ['L', 'W', 'H', 'KG'].every(k => parseInt(cj[k], 10) > 0)) {
          dims.forEach(d => { d.value = String(parseInt(cj[d.getAttribute('data-k')], 10)); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })); });
          R.rellenadas.push({ po, sku: String(p.sku || '') });
        }
      }
      if (dims.length < 4 || dims.some(d => !(parseInt(d.value, 10) > 0))) { R.sinMedidas.push({ po, sku: String(p.sku || ''), producto: String(p.producto || '') }); salta('sin medidas', po); continue; }
      if (yaIntentadas.has(po)) { salta('ya se intento hoy (no se repite)', po); continue; }
      const cancOdoo = row.classList.contains('canc-ok');
      if (cancOdoo && !enviar.has(po)) { salta('cancelada en Odoo pero sin permiso del Sheet (el Sheet no la valida)', po); continue; }
      if (forzados.has(po) && cancOdoo) { salta('ya esta cancelada en Odoo (un precio erroneo con ENVIAR no se manda)', po); continue; }
      if (enviar.has(po) && !forzados.has(po) && !cancOdoo) { salta('el Sheet dice cancelada pero Odoo no (no coinciden)', po); continue; }
      const t0v = Number(vistas[po]);
      if (!(t0v > 0)) { salta('recien llegado: espera ' + Math.round(esperaMs / 60000) + ' min antes de comprar su guia (por si el cliente se arrepiente)', po); continue; }
      if (ahoraMs - t0v < esperaMs) { salta('en espera de ' + Math.round(esperaMs / 60000) + ' min (por si el cliente se arrepiente)', po); continue; }
      const est = wgEstadoPrecio(po);
      if (est === 'bajo') {
        const pe = perdida(po);
        const finito = pe !== null && Math.round(pe * 1e6) / 1e6 <= umbral;
        if (!finito && !forzados.has(po)) { salta('bajo el minimo de precio', po); continue; }
      } else if (est !== 'ok') { salta('sin precio de referencia o no se pudo verificar', po); continue; }
      aprobadas.push(po);
    }
    const quedan = aprobadas.slice();   // sin tope por corrida (decision del dueño)

    // 3) dejar marcadas SOLO esas (lo demas, desmarcado). La pagina deshabilita lo prohibido: eso no se toca.
    const set = new Set(quedan);
    filas.forEach(row => {
      const ck = row.querySelector('.wg-ck');
      if (!ck || ck.disabled) return;
      const p = (WG.pedidos || [])[parseInt(row.getAttribute('data-i'), 10)];
      ck.checked = !!p && set.has(String(p.po));
    });
    wgMarcarPintar(); wgDesarmar();
    const sel = wgSeleccion().map(String).sort();
    if (sel.join('|') !== quedan.slice().sort().join('|')) { R.error = 'la_seleccion_no_coincide'; return R; }
    R.comprados = quedan.slice();
    if (R.modo !== 'real') { R.ok = true; return R; }
    if (!quedan.length) { R.comprados = []; R.ok = true; return R; }

    // 4) los dos clics de la pagina (armar y confirmar). Si el primero no arma, la pagina dijo que no: no se insiste.
    await wgProcesar();
    if (!WG.armado) { R.comprados = []; R.error = 'la_pagina_no_dejo_armar: ' + nota().slice(0, 150); return R; }
    await wgProcesar();
    const fin = Date.now() + (opts.compraMs || 600000);
    while (WG.corriendo && Date.now() < fin) await esp(1000);
    if (WG.corriendo) { R.error = 'la_compra_sigue_en_curso_al_cerrar'; }
    const cuenta = () => {
      const res = (WG.ultimoRes || []);
      R.resultados = { ok: res.filter(r => r.ok).length, pend: res.filter(r => !r.ok && r.guiaPagadaSinEnviar).length, mal: res.filter(r => !r.ok && !r.guiaPagadaSinEnviar).length };
      R.intentados = res.map(r => String(r.purchaseOrderId));
      R.fallos = res.filter(r => !r.ok).map(r => ({ po: String(r.purchaseOrderId), pagada: !!r.guiaPagadaSinEnviar, error: String(r.error || r.nota || '').slice(0, 140) }));
      R.comprados = res.filter(r => r.ok || r.guiaPagadaSinEnviar).map(r => String(r.purchaseOrderId));
    };
    cuenta();
    if (!(WG.ultimoRes || []).length && /No compr/.test(nota())) { R.comprados = []; R.error = nota().slice(0, 180); return R; }
    // guia pagada sin marcar: el reintento SOLO marca, nunca compra (lo dice la propia pagina)
    for (let i = 0; i < 2 && R.resultados.pend > 0 && typeof wgReintentarMarcar === 'function'; i++) {
      await esp(4000);
      try { await wgReintentarMarcar(); } catch (e) {}
      const f2 = Date.now() + 120000;
      while (WG.corriendo && Date.now() < f2) await esp(1000);
      cuenta();
    }
    R.ok = !R.error;
    return R;
  } catch (e) {
    R.error = String((e && e.message) || e).slice(0, 180);
    return R;
  }
}
