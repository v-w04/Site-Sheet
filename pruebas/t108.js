// t108: plantillas del Buzon numeradas (25-nov-2026): bzpLimpiar_ / bzpRecibir_. Hoja y propiedades simulados.
const fs = require('fs'), vm = require('vm');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };
const ctx = { console, JSON, Date, Object, Array, String, Number, Math, isNaN, isFinite, RegExp }; vm.createContext(ctx);
ctx.normEnc_ = x => String(x == null ? '' : x).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const logs = []; ctx.logOk_ = (e, m) => logs.push('OK ' + m); ctx.logErr_ = (e, m) => logs.push('ERR ' + m); ctx.flushLog_ = () => {};
let auth = null; ctx.csAutorizar_ = p => auth;
ctx.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
function hoja(enc) { const h = { enc: enc.slice(), filas: [], widths: {}, wrap: 0 };
  h.getLastRow = () => h.filas.length + 1; h.getLastColumn = () => h.enc.length;
  h.getRange = (r, c, nr, nc) => { nr = nr || 1; nc = nc || 1; return {
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const row = h.filas[r - 2 + i]; return row && row[c - 1 + j] !== undefined ? row[c - 1 + j] : ''; })),
    setValue: x => { const k = r - 2; h.filas[k] = h.filas[k] || []; h.filas[k][c - 1] = x; }, setWrap: () => { h.wrap++; } }; };
  h.getColumnWidth = () => 30; h.setColumnWidth = (c, w) => { h.widths[c] = w; }; return h; }
let libro = {};
ctx.peHojaAsegurar_ = (n, enc) => { if (!libro[n]) libro[n] = hoja(enc); return libro[n]; };
ctx.ubicarColumnas_ = (h, enc) => { const col = {}; enc.forEach(e => { let i = h.enc.map(x => ctx.normEnc_(x)).indexOf(ctx.normEnc_(e)); if (i < 0) { h.enc.push(e); i = h.enc.length - 1; } col[ctx.normEnc_(e)] = i + 1; }); return { col }; };
ctx.escrCol_ = (m, e) => m.col[ctx.normEnc_(e)] || 0;
ctx.peAgregar_ = (h, enc, filas) => { const m = ctx.ubicarColumnas_(h, enc); filas.forEach(x => { const row = []; enc.forEach(e => { row[m.col[ctx.normEnc_(e)] - 1] = x[e] === undefined ? '' : x[e]; }); h.filas.push(row); }); };
vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/BuzonPlantillas.gs', 'utf8'), ctx);
const R = c => vm.runInContext(c, ctx);
ctx.A = [{ id: 'AAA111', nombre: 'Rastreo', texto: 'Hola, su pedido va en camino' }, { id: 'BBB222', nombre: ' Devolución  1 ', texto: 'Para devolver...' }, { id: 'AAA111', nombre: 'dup', texto: 'x' }, { id: '', nombre: 'sin id' }, null, { id: 'CCC333', nombre: '' }];
const L = R('bzpLimpiar_(A)');
t(L.length === 2 && L[1].nombre === 'Devolución 1', 'limpia: sin repetidos, sin id/nombre vacio');
t(R('bzpLimpiar_("x")').length === 0, 'no es lista: nada');
auth = { ok: false, error: 'no_autorizado' };
t(R('bzpRecibir_({plantillas:A})').error === 'no_autorizado' && !libro['Plantillas Buzon'], 'sin clave no escribe');
auth = null;
t(R('bzpRecibir_({plantillas:[]})').recibidas === 0, 'lista vacia: no toca nada');
let r = R('bzpRecibir_({plantillas:A})'); const H = () => libro['Plantillas Buzon'];
t(r.ok && r.nuevas === 2 && H().filas.length === 2, 'primera vez: 2 nuevas');
t(H().filas[0][0] === 1 && H().filas[1][0] === 2 && H().filas[0][3] === 'AAA111', 'numeradas 1 y 2 en orden de llegada');
ctx.B = [{ id: 'DDD444', nombre: 'Demora', texto: 'Hay demora' }, { id: 'BBB222', nombre: 'Devolución 1', texto: 'Para devolver, nuevo texto' }, { id: 'AAA111', nombre: 'Rastreo', texto: 'Hola, su pedido va en camino' }];
r = R('bzpRecibir_({plantillas:B})');
t(r.nuevas === 1 && r.cambiadas === 1 && H().filas.length === 3, 'segunda vez: 1 nueva, 1 cambiada, sin duplicar');
t(H().filas[2][0] === 3 && H().filas[2][3] === 'DDD444', 'la nueva toma el siguiente numero (3)');
t(H().filas[1][0] === 2 && H().filas[1][2] === 'Para devolver, nuevo texto', 'la cambiada conserva su numero y actualiza el texto');
// si Walmart quita una, la fila se queda con su numero
ctx.C = [{ id: 'DDD444', nombre: 'Demora', texto: 'Hay demora' }];
r = R('bzpRecibir_({plantillas:C})');
t(r.nuevas === 0 && r.cambiadas === 0 && H().filas.length === 3 && H().filas[0][0] === 1, 'una plantilla que Walmart ya no manda se queda con su numero');
t(r.ok && H().widths[3] === 560 && H().wrap > 0, 'formato solo en sus columnas');
console.log('t108 ok ' + ok + (bad ? ' FALLAS ' + bad : '')); process.exit(bad ? 1 : 0);
