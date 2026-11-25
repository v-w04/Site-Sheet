// t100: GuiasGrandes.gs (24-nov): pedidos con MUCHAS PIEZAS de un mismo producto. La guia NO sale sola: hoja "Guias grandes", casilla GUIAS LISTAS,
// aviso rojo, y la extension marca enviado SOLO cuando ella da la casilla. Hoja simulada y chrome simulado; nada real.
process.env.TZ = 'America/Mexico_City';
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };

// ---------------- hoja simulada ----------------
function nuevaHoja(nombre) {
  const s = { nombre, rows: [], maxR: 1000, maxC: 26, fmt: {}, chk: {}, frozen: 0 };
  const val = (r, c) => (s.rows[r - 1] || [])[c - 1];
  s.getName = () => nombre;
  s.getLastRow = () => { let l = 0; s.rows.forEach((r, i) => { if (r && r.some(x => x !== undefined && x !== '' && x !== null)) l = i + 1; }); return l; };
  s.getLastColumn = () => { let l = 0; s.rows.forEach(r => { (r || []).forEach((x, j) => { if (x !== undefined && x !== '' && x !== null) l = Math.max(l, j + 1); }); }); return l; };
  s.getMaxRows = () => s.maxR; s.getMaxColumns = () => s.maxC;
  s.insertRowsBefore = (n, k) => { s.rows.splice(n - 1, 0, ...Array.from({ length: k }, () => [])); s.maxR += k; };
  s.insertRowsAfter = (n, k) => { s.maxR += k; };
  s.insertColumnsAfter = (n, k) => { s.maxC += k; };
  s.deleteRows = (n, k) => { s.rows.splice(n - 1, k); s.maxR -= k; };
  s.deleteColumns = (n, k) => { s.rows.forEach(r => r && r.splice(n - 1, k)); s.maxC -= k; };
  s.setFrozenRows = n => { s.frozen = n; };
  s.insertColumnEn = (pos) => { s.rows.forEach(r => r && r.splice(pos - 1, 0, 'X')); s.maxC++; };   // lo hace "ella" en la prueba
  s.getRange = (r, c, nr = 1, nc = 1) => {
    const o = {
      getValues: () => { const a = []; for (let i = 0; i < nr; i++) { const x = []; for (let j = 0; j < nc; j++) { const v = val(r + i, c + j); x.push(v === undefined ? '' : v); } a.push(x); } return a; },
      setValue: v => { (s.rows[r - 1] = s.rows[r - 1] || [])[c - 1] = v; return o; },
      setValues: vv => { vv.forEach((row, i) => row.forEach((v, j) => { (s.rows[r - 1 + i] = s.rows[r - 1 + i] || [])[c - 1 + j] = v; })); return o; },
      setNumberFormat: f => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) s.fmt[(r + i) + ',' + (c + j)] = f; return o; },
      insertCheckboxes: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) s.chk[(r + i) + ',' + (c + j)] = true; return o; },
      setHorizontalAlignment: () => o, setFontWeight: () => o, copyTo: () => o
    };
    return o;
  };
  return s;
}
const hojas = {};
const libro = { getSheetByName: n => hojas[n] || null, insertSheet: n => (hojas[n] = nuevaHoja(n)) };
const logs = [], alertas = {}, props = {};
const ctx = { console, JSON, Date, Object, Array, String, Number, Math, isNaN, RegExp, Error, Set, TZ: 'America/Mexico_City',
  SpreadsheetApp: { getActive: () => libro, flush: () => {}, CopyPasteType: { PASTE_FORMAT: 1, PASTE_DATA_VALIDATION: 2 } },
  Utilities: { formatDate: (d, tz, f) => { const z = n => (n < 10 ? '0' : '') + n; return f === 'dd/MM HH:mm' ? z(d.getDate()) + '/' + z(d.getMonth() + 1) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) : d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); } },
  logOk_: (e, m) => logs.push(['OK', e, m]), logWarn_: (e, m) => logs.push(['WARN', e, m]), logErr_: (e, m) => logs.push(['ERR', e, m]), logInfo_: () => {}, flushLog_: () => {},
  props_: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }),
  extAlertaFija_: (k, x) => { alertas[k] = x; }, extAlertaFijaQuitar_: k => { delete alertas[k]; },
  csAutorizar_: p => (p && p.clave === 'bien' ? null : { ok: false, error: 'no_autorizado' }) };
vm.createContext(ctx);
['Columnas.gs', 'Escritura.gs', 'GuiasGrandes.gs'].forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', f), 'utf8'), ctx));
const G = ctx;

// ---------------- puras ----------------
const PO1 = '609132000000001', PO2 = '609132000000002', PO3 = '609132000000003';
let l = G.ggLimpiar_([{ po: PO1, sku: 'TV-1', producto: 'Pantalla', piezas: 10 }, { po: PO1, piezas: 10 }, { po: PO2, piezas: 5 }, { po: 'abc', piezas: 9 }, { po: PO3, piezas: 6 }, { po: '123', piezas: 9 }], 5, { [PO3]: true });
t(l.length === 1 && l[0].po === PO1 && l[0].sku === 'TV-1', 'ggLimpiar_: solo MAS de 5, pedido valido, sin repetidos ni los que ya estan: ' + JSON.stringify(l));
t(G.ggLimpiar_(null, 5, {}).length === 0, 'ggLimpiar_ con null');
t(G.ggSiguiente_('POR HACER', true, 10).estado === 'POR ENVIAR' && G.ggSiguiente_('POR ENVIAR', false, 10).estado === 'POR HACER' && G.ggSiguiente_('POR HACER', false, 10) === null && G.ggSiguiente_('POR ENVIAR', true, 10) === null, 'ggSiguiente_: casilla mueve entre POR HACER y POR ENVIAR');
t(G.ggSiguiente_('ENVIADO', false, 10) === null && G.ggSiguiente_('ENVIADO', true, 10) === null, 'ggSiguiente_: ENVIADO ya no se mueve');
t(G.ggSiguiente_('', false, 10).estado === 'POR HACER', 'ggSiguiente_: fila sin estado queda POR HACER');
t(/10 piezas: varias guias/.test(G.ggQueHacer_('POR HACER', 10)) && /GUIAS LISTAS/.test(G.ggQueHacer_('POR HACER', 10)), 'texto de QUE HACER');
t(G.GG_MAX_PIEZAS === 5, 'el limite es 5 (mas de 5 de un mismo producto)');

// ---------------- hoja: detectar ----------------
const antes = Object.keys(hojas).length;
t(G.ggRecibir_([]).length === 0 && Object.keys(hojas).length === antes, 'sin pedidos grandes: no crea la hoja');
let ag = G.ggRecibir_([{ po: PO1, sku: 'TV-1', producto: 'Pantalla 55', piezas: 10 }, { po: PO2, sku: 'TV-2', producto: 'Pantalla 43', piezas: 6 }, { po: PO3, sku: 'X', producto: 'x', piezas: 4 }]);
const h = hojas['Guias grandes'];
t(ag.join() === PO1 + ',' + PO2 && !!h, 'agrega los 2 de mas de 5 piezas y crea la hoja: ' + ag);
const enc = h.rows[0];
t(['ESTADO', 'ORDEN DE COMPRA', 'SKU', 'PRODUCTO', 'PIEZAS', 'DETECTADO', 'QUE HACER', 'GUIAS LISTAS', 'NOTAS'].every(e => enc.indexOf(e) >= 0), 'encabezados: los del script y los dos tuyos: ' + enc);
t(h.getMaxRows() < 20 && h.getMaxColumns() === 9 && h.frozen === 1, 'hoja nueva sin filas ni columnas de sobra y con encabezado fijo: ' + h.getMaxRows() + 'x' + h.getMaxColumns());
const col = e => enc.indexOf(e);
t(h.rows[1][col('ORDEN DE COMPRA')] === PO1 && h.rows[2][col('ORDEN DE COMPRA')] === PO2 && h.rows[1][col('ESTADO')] === 'POR HACER' && h.rows[1][col('PIEZAS')] === 10, 'filas con orden, estado y piezas');
t(h.fmt['2,' + (col('ORDEN DE COMPRA') + 1)] === '@' && h.chk['2,' + (col('GUIAS LISTAS') + 1)] === true && h.rows[1][col('GUIAS LISTAS')] === false, 'la orden va como texto y la casilla es casilla de verdad (sin marcar)');
t(logs.some(x => x[0] === 'WARN' && x[1] === 'GUIAS_GRANDES' && x[2].indexOf(PO1) >= 0 && /NO sale sola/.test(x[2])), 'queda en el Log con aviso');
t(/2 pedido\(s\) con MUCHAS PIEZAS/.test(alertas['gg-pendientes'] || ''), 'aviso rojo en la extension: ' + alertas['gg-pendientes']);
// el mismo pedido otra vez: no se duplica; uno nuevo entra ARRIBA
ag = G.ggRecibir_([{ po: PO1, sku: 'TV-1', producto: 'P', piezas: 10 }]);
t(ag.length === 0 && h.getLastRow() === 3, 'el mismo pedido no se duplica');
ag = G.ggRecibir_([{ po: PO3, sku: 'TV-3', producto: 'Pantalla 65', piezas: 8 }]);
t(ag.join() === PO3 && h.rows[1][col('ORDEN DE COMPRA')] === PO3 && h.rows[2][col('ORDEN DE COMPRA')] === PO1, 'el nuevo entra arriba y empuja a los anteriores');

// ---------------- casilla -> estado -> extension ----------------
let rs = G.ggSincronizar_();
t(rs.porHacer === 3 && rs.porEnviar === 0 && G.ggListosPorEnviar_().length === 0, 'sin casillas: nada se manda a la extension');
const fila = po => h.rows.findIndex((r, i) => i > 0 && r[col('ORDEN DE COMPRA')] === po);
h.rows[fila(PO1)][col('GUIAS LISTAS')] = true;                   // ella marca la casilla
rs = G.ggSincronizar_();
t(h.rows[fila(PO1)][col('ESTADO')] === 'POR ENVIAR' && /siguiente ronda/.test(h.rows[fila(PO1)][col('QUE HACER')]), 'casilla marcada: ESTADO POR ENVIAR y QUE HACER cambia');
t(G.ggListosPorEnviar_().join() === PO1, 'viaja a la extension solo el marcado: ' + G.ggListosPorEnviar_());
t(/2 pedido\(s\)/.test(alertas['gg-pendientes'] || ''), 'el aviso rojo cuenta los que faltan (2)');
h.rows[fila(PO1)][col('GUIAS LISTAS')] = false;
G.ggSincronizar_();
t(h.rows[fila(PO1)][col('ESTADO')] === 'POR HACER' && G.ggListosPorEnviar_().length === 0, 'si la desmarca, vuelve a POR HACER y ya no viaja');
h.rows[fila(PO1)][col('GUIAS LISTAS')] = true;

// ---------------- resultado de la extension ----------------
t(G.ggRecibirResultado_({ clave: 'mal', modo: 'real', marcados: [PO1] }).ok === false && h.rows[fila(PO1)][col('ESTADO')] !== 'ENVIADO', 'sin clave del Web App: no pasa nada');
G.ggSincronizar_();
let r = G.ggRecibirResultado_({ clave: 'bien', modo: 'prueba', marcarian: [PO1] });
t(r.ok && h.rows[fila(PO1)][col('ESTADO')] === 'POR ENVIAR' && logs.some(x => /PRUEBA \(no marca nada\)/.test(x[2])), 'PRUEBA: solo lo anota en el Log, no cambia la hoja');
r = G.ggRecibirResultado_({ clave: 'bien', modo: 'real', fallos: [{ po: PO1, error: 'Walmart no acepto' }] });
t(h.rows[fila(PO1)][col('ESTADO')] === 'POR ENVIAR' && /Walmart no acepto/.test(h.rows[fila(PO1)][col('QUE HACER')]) && /No se pudo marcar enviado/.test(alertas['gg-fallo'] || ''), 'fallo: sigue POR ENVIAR, lo dice en QUE HACER y avisa en rojo');
G.ggSincronizar_();
t(/Walmart no acepto/.test(h.rows[fila(PO1)][col('QUE HACER')]), 'la siguiente sincronizacion no borra el motivo del fallo');
r = G.ggRecibirResultado_({ clave: 'bien', modo: 'real', sinGuia: [PO1] });
t(/todavia no ve las guias/.test(h.rows[fila(PO1)][col('QUE HACER')]) && h.rows[fila(PO1)][col('ESTADO')] === 'POR ENVIAR', 'si la pagina aun no ve las guias: lo dice y espera');
r = G.ggRecibirResultado_({ clave: 'bien', modo: 'real', marcados: [PO1] });
t(h.rows[fila(PO1)][col('ESTADO')] === 'ENVIADO' && /marcado como enviado/.test(h.rows[fila(PO1)][col('QUE HACER')]) && !alertas['gg-fallo'], 'marcado: ENVIADO y se quita el aviso de fallo');
h.rows[fila(PO1)][col('GUIAS LISTAS')] = false; G.ggSincronizar_();
t(h.rows[fila(PO1)][col('ESTADO')] === 'ENVIADO' && G.ggListosPorEnviar_().length === 0, 'ENVIADO se queda aunque quite la casilla y ya no viaja');
const rsm = G.ggResumen_();
t(rsm.enviados === 1 && rsm.porHacer === 2 && rsm.porEnviar === 0, 'resumen para el Reporte: ' + JSON.stringify(rsm));
// ella marca las otras dos: se apaga el aviso rojo
h.rows[fila(PO2)][col('GUIAS LISTAS')] = true; h.rows[fila(PO3)][col('GUIAS LISTAS')] = true;
G.ggSincronizar_();
t(!alertas['gg-pendientes'], 'sin pendientes por hacer: se quita el aviso rojo');

// ---------------- ella mueve columnas: el script sigue encontrando todo por encabezado ----------------
h.insertColumnEn(2);
const enc2 = h.rows[0], c2 = e => enc2.indexOf(e);
h.rows[fila(PO3)][c2('GUIAS LISTAS')] = false;
rs = G.ggSincronizar_();
t(h.rows[fila(PO3)][c2('ESTADO')] === 'POR HACER' && G.ggLeer_(h).length === 3, 'con una columna nueva en medio sigue leyendo y escribiendo por encabezado');
ag = G.ggRecibir_([{ po: '609132000000009', sku: 'TV-9', producto: 'P', piezas: 7 }]);
t(ag.length === 1 && h.rows[1][c2('ORDEN DE COMPRA')] === '609132000000009' && !h.rows[1][1], 'fila nueva respeta la columna ajena (queda vacia)');

// ---------------- integracion con GuiasAuto.gs y el Web App ----------------
const src = n => fs.readFileSync(path.join(__dirname, '..', 'apps-script', n), 'utf8');
t(/guias_grandes_resultado'\) return json_\(ggRecibirResultado_/.test(src('WebAPI.gs')), 'ruta guias_grandes_resultado en el Web App');
t(/maxPiezas: GG_MAX_PIEZAS, grandesListos: ggListosPorEnviar_\(\)/.test(src('GuiasAuto.gs')) && /ggRecibir_\(c\.grandes\)/.test(src('GuiasAuto.gs')), 'guias_lista manda maxPiezas y grandesListos; guias_reporte recibe grandes');
t(/\['Guias grandes',\s+'WALMART'/.test(src('Organizar.gs')) && /'Cancelada en camino', 'Guias grandes'\]/.test(src('Organizar.gs')), 'registrada en Organizar (indice) y como hoja que ella llena');
t(/ggResumen_\(\)/.test(src('Reporte.gs')), 'el Reporte la cuenta');

// ---------------- extension: background.js ----------------
const dir = path.join(__dirname, '..', 'extension-cookie');
const bgSrc = fs.readFileSync(path.join(dir, 'background.js'), 'utf8'), gaSrc = fs.readFileSync(path.join(dir, 'autoguias.js'), 'utf8');
function mundo(opt) {
  const store = Object.assign({ url: 'https://script.google.com/macros/s/ABC/exec', clave: 'k'.repeat(40), gaActivo: true, gaModo: 'real', gaPruebaOk: true }, opt.store || {});
  const log = { sheet: [], exec: [] };
  const noop = () => {}; const ev = { addListener: noop, removeListener: noop };
  const principal = { ok: true, modo: 'real', comprados: [], saltados: {}, sinMedidas: [], grandes: [{ po: PO1, sku: 'TV-1', producto: 'P', piezas: 10 }], resultados: { ok: 0, pend: 0, mal: 0 }, error: '', vistos: [PO1], intentados: [] };
  const chrome = {
    storage: { local: { get: async keys => { const o = {}; (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in store) o[k] = store[k]; }); return o; }, set: async o => { Object.assign(store, o); } } },
    runtime: { onInstalled: ev, onStartup: ev, onMessage: ev, getPlatformInfo: async () => ({}), getManifest: () => ({ version: '1.10.5' }) },
    alarms: { create: noop, onAlarm: ev }, idle: { setDetectionInterval: noop, onStateChanged: ev },
    action: { setBadgeText: noop, setBadgeBackgroundColor: noop, setTitle: noop }, cookies: { get: async () => null, onChanged: ev },
    tabs: { create: async o => ({ id: 7, url: o.url }), get: async () => ({ id: 7, status: 'complete', url: 'https://electronicsmexico.site/walmart/guias' }), remove: async () => {}, query: async () => [], onUpdated: ev },
    scripting: { executeScript: async o => { log.exec.push(o); const n = o.func && o.func.name; if (n === 'gaMarcarListos') return [{ result: opt.marcar || { ok: true, modo: o.args[1].modo, marcados: [PO1], marcarian: [], sinGuia: [], fallos: [], error: '' } }]; return [{ result: opt.principal || principal }]; } }
  };
  const c = { console, chrome, importScripts: noop, setTimeout: f => { f(); return 0; }, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, URL, JSON, Date, Promise, Math, Array, Object, String, Number, Set, RegExp, Error,
    fetch: async (u, o) => { const b = JSON.parse(o.body); log.sheet.push(b); const r = b.accion === 'guias_lista' ? (opt.lista || { ok: true, retener: [], enviar: [], forzados: [], conflictos: [], umbralPct: 3, maxPiezas: 5, grandesListos: [] }) : { ok: true };
      return { status: 200, text: async () => JSON.stringify(r), json: async () => r }; },
    crypto: { subtle: { digest: async () => new ArrayBuffer(8) } }, TextEncoder };
  vm.createContext(c); vm.runInContext(gaSrc, c); c.gaEnPagina = vm.runInContext('gaEnPagina', c); c.gaMarcarListos = vm.runInContext('gaMarcarListos', c);
  vm.runInContext(bgSrc, c);
  return { c, store, log };
}
(async () => {
  const corre = (w, f, p) => vm.runInContext('gaCiclo', w.c)(f, p);
  // sin listos: el reporte lleva grandes y NO se llama a gaMarcarListos
  let w = mundo({}); await corre(w, true, false);
  const rep = w.log.sheet.find(x => x.accion === 'guias_reporte');
  t(rep && rep.corrida.grandes.length === 1 && rep.corrida.grandes[0].po === PO1 && rep.corrida.grandes[0].piezas === 10, 'el reporte al Sheet lleva los pedidos con muchas piezas');
  t(w.log.exec.length === 1 && !w.log.sheet.some(x => x.accion === 'guias_grandes_resultado'), 'sin pedidos marcados LISTOS no corre el marcado ni avisa');
  // con listos: segundo executeScript y aviso al Sheet
  w = mundo({ lista: { ok: true, retener: [], enviar: [], forzados: [], conflictos: [], umbralPct: 3, maxPiezas: 5, grandesListos: [PO1] } }); await corre(w, true, false);
  t(w.log.exec.length === 2 && w.log.exec[1].func.name === 'gaMarcarListos' && w.log.exec[1].args[0].join() === PO1 && w.log.exec[1].args[1].modo === 'real', 'con pedidos LISTOS corre gaMarcarListos en modo real');
  let gr = w.log.sheet.find(x => x.accion === 'guias_grandes_resultado');
  t(gr && gr.marcados.join() === PO1 && gr.modo === 'real', 'avisa al Sheet cuales marco: ' + JSON.stringify(gr));
  // el boton del popup (prueba) nunca marca de verdad
  w = mundo({ lista: { ok: true, retener: [], enviar: [], forzados: [], conflictos: [], umbralPct: 3, maxPiezas: 5, grandesListos: [PO1] } }); await corre(w, true, true);
  t(w.log.exec[1].args[1].modo === 'prueba', 'con el boton (prueba) el marcado tambien va en prueba');
  // si la compra de guias fallo (error), no se intenta marcar
  w = mundo({ lista: { ok: true, retener: [], enviar: [], forzados: [], conflictos: [], umbralPct: 3, maxPiezas: 5, grandesListos: [PO1] }, principal: { ok: false, modo: 'real', comprados: [], saltados: {}, sinMedidas: [], grandes: [], resultados: {}, error: 'odoo_no_contesto', vistos: [] } });
  await corre(w, true, false);
  t(w.log.exec.length === 1, 'si la pagina fallo (error), no intenta marcar');
  // 3 intentos al dia por pedido
  w = mundo({ lista: { ok: true, retener: [], enviar: [], forzados: [], conflictos: [], umbralPct: 3, maxPiezas: 5, grandesListos: [PO1] }, marcar: { ok: true, modo: 'real', marcados: [], marcarian: [], sinGuia: [], fallos: [{ po: PO1, error: 'x' }], error: '' } });
  await corre(w, true, false); await corre(w, true, false); await corre(w, true, false); await corre(w, true, false);
  const llamadasMarcar = w.log.exec.filter(e => e.func.name === 'gaMarcarListos').length;
  t(llamadasMarcar === 3, 'maximo 3 intentos al dia por pedido: ' + llamadasMarcar);
  // manifest
  t(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).version === '1.10.5', 'extension 1.10.5 (t100)');
  t(!/\btope\b/i.test(gaSrc.replace(/\/\/.*$/gm, '')), 'autoguias.js sigue sin logica de tope por corrida');
  console.log(bad ? ('FALLAN ' + bad + ' (ok ' + ok + ')') : ('t100 ok ' + ok)); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FALLA excepcion', e && e.stack || e); process.exit(1); });
