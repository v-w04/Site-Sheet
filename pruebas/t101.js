// t101: la extension se recupera SOLA cuando la pagina de Guias no puede leer Walmart (25-nov-2026, v1.10.4).
// Reabre una pestana propia de Seller Center, recarga Guias y vuelve a leer (hasta 2 veces). Si Seller pide login/2FA, lo dice claro.
// Chrome simulado; nada real.
process.env.TZ = 'America/Mexico_City';
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };
const dir = path.join(__dirname, '..', 'extension-cookie');
const bgSrc = fs.readFileSync(path.join(dir, 'background.js'), 'utf8'), gaSrc = fs.readFileSync(path.join(dir, 'autoguias.js'), 'utf8');
const GUIAS = 'https://electronicsmexico.site/walmart/guias', SELLER = 'https://seller.walmart.com/orders/manage-orders';
const bien = { ok: true, modo: 'real', comprados: [], saltados: {}, sinMedidas: [], grandes: [], resultados: { ok: 1, pend: 0, mal: 0 }, error: '', vistos: [], intentados: [] };
const mal = (extra) => Object.assign({ ok: false, modo: 'real', comprados: [], saltados: {}, sinMedidas: [], grandes: [], resultados: {}, error: 'sin_sesion_de_walmart', detalle: 'No pude leer los pedidos Failed to fetch', vistos: [], intentados: [] }, extra || {});

function mundo(opt) {
  const store = Object.assign({ url: 'https://script.google.com/macros/s/ABC/exec', clave: 'k'.repeat(40), gaActivo: true, gaModo: 'real', gaPruebaOk: true }, opt.store || {});
  const log = { sheet: [], exec: [], reload: [], remove: [], creadas: [], winRemove: [] };
  const noop = () => {}; const ev = { addListener: noop, removeListener: noop };
  const corridas = (opt.corridas || [bien]).slice();
  const chrome = {
    storage: { local: { get: async keys => { const o = {}; (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in store) o[k] = store[k]; }); return o; }, set: async o => { Object.assign(store, o); } } },
    runtime: { onInstalled: ev, onStartup: ev, onMessage: ev, getPlatformInfo: async () => ({}), getManifest: () => ({ version: '1.10.4' }) },
    alarms: { create: noop, onAlarm: ev }, idle: { setDetectionInterval: noop, onStateChanged: ev },
    action: { setBadgeText: noop, setBadgeBackgroundColor: noop, setTitle: noop }, cookies: { get: async () => null, onChanged: ev },
    windows: { getAll: async () => [{ id: 1 }], create: async () => ({ id: 2, tabs: [{ id: 9 }] }), remove: async id => { log.winRemove.push(id); } },
    tabs: {
      create: async o => { log.creadas.push(o.url); return { id: /seller\.walmart\.com/.test(o.url) ? 9 : 7, url: o.url }; },
      get: async id => ({ id, status: 'complete', url: id === 9 ? (opt.sellerUrl || SELLER) : (log.reload.length && opt.guiasTrasRecarga ? opt.guiasTrasRecarga : GUIAS) }),
      reload: async id => { log.reload.push(id); }, remove: async id => { log.remove.push(id); }, query: async () => [], onUpdated: ev },
    scripting: { executeScript: async o => { log.exec.push(o); const n = o.func && o.func.name; if (n === 'gaMarcarListos') return [{ result: { ok: true, marcados: [], fallos: [], sinGuia: [] } }]; return [{ result: corridas.length > 1 ? corridas.shift() : corridas[0] }]; } }
  };
  const c = { console, chrome, importScripts: noop, setTimeout: f => { Promise.resolve().then(f); return 0; }, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, URL, JSON, Date, Promise, Math, Array, Object, String, Number, Set, RegExp, Error,
    fetch: async (u, o) => { const b = JSON.parse(o.body); log.sheet.push(b); const r = b.accion === 'guias_lista' ? { ok: true, retener: [], enviar: [], forzados: [], conflictos: [], umbralPct: 3, maxPiezas: 5, grandesListos: [] } : { ok: true };
      return { status: 200, text: async () => JSON.stringify(r), json: async () => r }; },
    crypto: { subtle: { digest: async () => new ArrayBuffer(8) } }, TextEncoder };
  vm.createContext(c); vm.runInContext(gaSrc, c); c.gaEnPagina = vm.runInContext('gaEnPagina', c); c.gaMarcarListos = vm.runInContext('gaMarcarListos', c);
  vm.runInContext(bgSrc, c);
  return { c, store, log };
}
const corre = (w, f, p) => vm.runInContext('gaCiclo', w.c)(f, p);
const estadoGA = (w) => (w.store.estadoGA || {});
const reporte = (w) => (w.log.sheet.find(x => x.accion === 'guias_reporte') || { corrida: {} }).corrida;

(async () => {
  // 1) todo bien a la primera: no abre Seller Center ni recarga nada
  let w = mundo({ corridas: [bien] }); await corre(w, true, false);
  t(w.log.exec.length === 1 && w.log.reload.length === 0 && !w.log.creadas.some(u => /seller/.test(u)), 'sin error: una sola lectura, no abre Seller Center ni recarga');

  // 2) falla la lectura de Walmart y el reintento funciona: se recupera solo
  w = mundo({ corridas: [mal(), bien] }); await corre(w, true, false);
  t(w.log.exec.length === 2, '2 lecturas (la que fallo + el reintento): ' + w.log.exec.length);
  t(w.log.creadas.filter(u => /seller\.walmart\.com/.test(u)).length === 1, 'abrio UNA pestana propia de Seller Center');
  t(w.log.reload.join() === '7', 'recargo la pestana de Guias (7)');
  t(reporte(w).error === '', 'el reporte al Sheet no lleva error cuando se recupero: ' + reporte(w).error);
  t(/se recupero solo/.test(estadoGA(w).texto || '') && estadoGA(w).ok === true, 'el popup dice que se recupero solo: ' + (estadoGA(w).texto || ''));
  t(w.log.winRemove.length === 0 && w.log.remove.includes(9) && w.log.remove.includes(7), 'cerro su pestana de Seller Center (9) y la de Guias (7)');

  // 3) Seller Center pide login/2FA: no se puede seguir solo, no reintenta y lo dice claro
  w = mundo({ corridas: [mal(), bien], sellerUrl: 'https://seller.walmart.com/login?redirect=/orders' }); await corre(w, true, false);
  t(w.log.exec.length === 1, 'con login pedido no hace otra lectura');
  t(/pide iniciar sesion/.test(reporte(w).error) && /^sin_sesion_de_walmart/.test(reporte(w).error), 'el Sheet recibe el motivo: ' + reporte(w).error);
  t(estadoGA(w).ok === false && /pide iniciar sesion/.test(estadoGA(w).texto || ''), 'el popup dice que hay que entrar a Seller Center: ' + (estadoGA(w).texto || ''));
  t(w.log.remove.includes(9), 'cierra la pestana de Seller que abrio');
  // y un sitio externo (SSO) tambien cuenta como login
  w = mundo({ corridas: [mal(), bien], sellerUrl: 'https://login.walmart.com/authorize?x=1' }); await corre(w, true, false);
  t(w.log.exec.length === 1 && /pide iniciar sesion/.test(reporte(w).error), 'redireccion a otro host (SSO) tambien se toma como sesion perdida');

  // 4) sigue fallando: 1 lectura + 2 reintentos y se rinde con el motivo
  w = mundo({ corridas: [mal()] }); await corre(w, true, false);
  t(w.log.exec.length === 3, 'maximo 2 reintentos (3 lecturas): ' + w.log.exec.length);
  t(/tras 2 reintento/.test(reporte(w).error) && /Failed to fetch/.test(reporte(w).error), 'el error lleva lo que dijo la pagina y los reintentos: ' + reporte(w).error);
  t(w.log.reload.length === 2, 'recargo Guias 2 veces');
  t(w.log.creadas.filter(u => /seller\.walmart\.com/.test(u)).length === 2, 'cada reintento abre su pestana propia');
  t(w.log.remove.filter(i => i === 9).length === 2, 'las 2 pestanas de Seller se cierran al final');

  // 5) otros errores NO se reintentan (no son de sesion)
  w = mundo({ corridas: [mal({ error: 'odoo_no_contesto', detalle: '' })] }); await corre(w, true, false);
  t(w.log.exec.length === 1 && !w.log.creadas.some(u => /seller/.test(u)), 'odoo_no_contesto no abre Seller ni reintenta');
  w = mundo({ corridas: [mal({ error: 'la_pagina_no_termino_de_cargar', detalle: '' })] }); await corre(w, true, false);
  t(w.log.exec.length === 1, 'la_pagina_no_termino_de_cargar tampoco se reintenta aqui');

  // 6) falta la extension de Guias Walmart (WMExt): tambien se reintenta (recarga la pagina)
  w = mundo({ corridas: [mal({ error: 'falta_la_extension_de_guias', detalle: '' }), bien] }); await corre(w, true, false);
  t(w.log.exec.length === 2 && w.log.reload.length === 1, 'falta_la_extension_de_guias: recarga y vuelve a leer');

  // 7) al recargar Guias el site pide sesion: no sigue
  w = mundo({ corridas: [mal(), bien], guiasTrasRecarga: 'https://electronicsmexico.site/login' }); await corre(w, true, false);
  t(w.log.exec.length === 1 && /^sin_sesion_site/.test(reporte(w).error) && /pidio sesion/.test(reporte(w).error), 'si el site pide login al recargar, lo reporta: ' + reporte(w).error);

  // 8) una lectura que ya empezo a comprar (error distinto) nunca se repite: los pedidos ya comprados no se vuelven a tocar
  w = mundo({ corridas: [Object.assign(mal({ error: 'la_pagina_no_respondio', detalle: '' }), { comprados: ['609132000000001'] })] }); await corre(w, true, false);
  t(w.log.exec.length === 1, 'la_pagina_no_respondio (pudo estar comprando) NO se reintenta');

  // 9) gaEnPagina deja dicho el texto real de la pagina cuando Walmart no se lee
  const ctx = vm.createContext({ console, setTimeout: f => { Promise.resolve().then(f); return 0; }, Date, Promise, Math, Array, Object, String, Number, Set, RegExp, Error, JSON });
  const el = (txt) => ({ textContent: txt });
  ctx.document = { getElementById: id => id === 'wg-sub' ? el('No pude leer Walmart') : id === 'wg-body' ? el('No pude leer los pedidos Walmart contesto 401 (sesion) Casi siempre es la sesión de Walmart. Abre seller.walmart.com en otra pestaña') : null, querySelector: () => null };
  ctx.WG = { corriendo: false }; ctx.wgProcesar = function () {};
  vm.runInContext(gaSrc, ctx);
  const lista = { retener: [], enviar: [], umbralPct: 3, esperaMin: 30, maxPiezas: 5, lecturaMin: 5 };
  const R = await vm.runInContext('gaEnPagina', ctx)(lista, { modo: 'real', esperaMs: 5000 });
  t(R.error === 'sin_sesion_de_walmart' && /401/.test(R.detalle || '') && !/Casi siempre/.test(R.detalle || ''), 'gaEnPagina guarda el texto real sin el consejo generico: ' + JSON.stringify(R.detalle));

  t(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).version === '1.10.4', 'extension 1.10.4');
  console.log(bad ? ('FALLAN ' + bad + ' (ok ' + ok + ')') : ('t101 ok ' + ok)); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FALLA excepcion', e && e.stack || e); process.exit(1); });
