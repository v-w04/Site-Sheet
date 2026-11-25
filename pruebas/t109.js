// t109: lista del Buzon (25-nov-2026): bzmParsear_ / bzmRecibir_ con texto REAL de la pantalla de Seller Center. Hoja simulada.
const fs = require('fs'), vm = require('vm');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };
const ctx = { console, JSON, Date, Object, Array, String, Number, Math, isNaN, isFinite, RegExp }; vm.createContext(ctx);
ctx.normEnc_ = x => String(x == null ? '' : x).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const logs = []; ctx.logOk_ = (e, m) => logs.push('OK ' + m); ctx.logWarn_ = (e, m) => logs.push('WARN ' + m); ctx.logErr_ = (e, m) => logs.push('ERR ' + m); ctx.flushLog_ = () => {};
let auth = null; ctx.csAutorizar_ = p => auth;
ctx.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
ctx.Utilities = { formatDate: (d, tz, f) => f === 'yyyy-MM-dd' ? '2026-11-25' : '2026-11-25 11:30' };
function hoja(enc) { const h = { enc: enc.slice(), filas: [], widths: {} };
  h.getLastRow = () => h.filas.length + 1; h.getLastColumn = () => h.enc.length;
  h.getRange = (r, c, nr, nc) => { nr = nr || 1; nc = nc || 1; return {
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const row = h.filas[r - 2 + i]; return row && row[c - 1 + j] !== undefined ? row[c - 1 + j] : ''; })),
    setValue: x => { const k = r - 2; h.filas[k] = h.filas[k] || []; h.filas[k][c - 1] = x; } }; };
  h.getColumnWidth = () => 30; h.setColumnWidth = (c, w) => { h.widths[c] = w; }; return h; }
let libro = {};
ctx.peHojaAsegurar_ = (n, enc) => { if (!libro[n]) libro[n] = hoja(enc); return libro[n]; };
ctx.ubicarColumnas_ = (h, enc) => { const col = {}; enc.forEach(e => { let i = h.enc.map(x => ctx.normEnc_(x)).indexOf(ctx.normEnc_(e)); if (i < 0) { h.enc.push(e); i = h.enc.length - 1; } col[ctx.normEnc_(e)] = i + 1; }); return { col }; };
ctx.escrCol_ = (m, e) => m.col[ctx.normEnc_(e)] || 0;
ctx.peAgregar_ = (h, enc, filas) => { const m = ctx.ubicarColumnas_(h, enc); filas.forEach(x => { const row = []; enc.forEach(e => { row[m.col[ctx.normEnc_(e)] - 1] = x[e] === undefined ? '' : String(x[e]).replace(/^'/, ''); }); h.filas.push(row); }); };
vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/BuzonMensajes.gs', 'utf8'), ctx);
const R = c => vm.runInContext(c, ctx);
const PAG = `Buzón
Ajustes de plantillas para mensajes
warning:
1 recientes mensaje requieren tu atención inmediata.
Mensajes
Mensaje nuevo
Tipo
Estado
ARTURO MACHORRO IGNACIO
Hoy
Mensaje de cliente en Walmart.com.mx: No ha llegado y ya pasó la fecha estimada, 600000137379202
Nº de pedido: 600000137379202
Se requiere una respuesta
47 horas
Marcelo Campillo
Hoy
Mensaje de cliente en Walmart.com.mx: No ha llegado y ya pasó la fecha estimada, 600000140819239
Nº de pedido: 600000140819239
eric alvarez
Hoy
Mensaje de cliente en Walmart.com.mx: No he recibido mi factura, 600000140169217
Nº de pedido: 600000140169217
Sanjuana Ruvalcaba trancoso
Ayer
Mensaje de cliente en Walmart.com.mx: No ha llegado y ya pasó la fecha estimada, 600000129718497
Nº de pedido: 600000129718497
Sanjuana Ruvalcaba trancoso
Ayer
Mensaje de cliente en Walmart.com.mx: No ha llegado y ya pasó la fecha estimada, 600000129718497
Nº de pedido: 600000129718497
Se requiere una respuesta
Atrasado
Ana karen Salgado Avelino
11/22/2026
Mensaje de cliente en Walmart.com.mx: Llegó incompleto, 600000141284752
Nº de pedido: 600000141284752
Joel Adan Maya Peres
12/29/2024
Mensaje de cliente en Walmart.com.mx: Quiero hacer válida mi garantía, 600000133637891
Nº de pedido: 600000133637891
Se requiere una respuesta
1-25 of 3031
Seleccionar y ver correos electrónicos de clientes`;
ctx.PAG = PAG;
const P = R('bzmParsear_(PAG, "2026-11-25")');
t(P.length === 6, 'reconoce 6 mensajes distintos (el repetido se junta): ' + P.length);
t(P[0].cliente === 'ARTURO MACHORRO IGNACIO' && P[0].pendiente && P[0].horas === 47 && P[0].fecha === '2026-11-25' && P[0].tipo === 'LLEGADA' && P[0].pedido === '600000137379202', 'el de hoy: pendiente, 47 h, llegada');
t(P[0].asunto === 'No ha llegado y ya pasó la fecha estimada', 'asunto sin el pedido pegado al final');
t(!P[1].pendiente && P[2].tipo === 'FACTURA' && !P[2].pendiente, 'sin marca = no pendiente; factura');
t(P[3].fecha === '2026-11-24' && P[3].pendiente && P[3].atrasado, 'Ayer -> 24-nov; el repetido hereda la marca de pendiente + Atrasado');
t(P[4].fecha === '2026-11-22' && P[4].tipo === 'INCOMPLETO', 'fecha MM/DD/YYYY y tipo incompleto');
t(P[5].fecha === '2024-12-29' && P[5].tipo === 'GARANTIA' && P[5].pendiente, 'garantia antigua pendiente');
t(R('bzmTipo_("Tengo dudas sobre cómo usar el artículo")') === 'USO' && R('bzmTipo_("algo raro")') === 'OTRO', 'tipos USO y OTRO');
t(R('bzmFecha_("Ayer","2026-03-01")') === '2026-02-28' && R('bzmFecha_("Ayer","")') === '', 'Ayer cruza de mes; sin hoy no inventa');
t(R('bzmParsear_("", "2026-11-25")').length === 0 && R('bzmParsear_("texto cualquiera", "2026-11-25")').length === 0, 'texto sin mensajes: lista vacia');
// sugerencias
t(JSON.stringify(R('bzmSugerencias_([{tipo:"LLEGADA",plantilla:2},{tipo:"LLEGADA",plantilla:2},{tipo:"LLEGADA",plantilla:2},{tipo:"FACTURA",plantilla:5}])')) === '{"LLEGADA":2}', 'sugiere solo con 3+ usos (factura con 1 uso: no)');
t(JSON.stringify(R('bzmSugerencias_([{tipo:"A",plantilla:1},{tipo:"A",plantilla:1},{tipo:"A",plantilla:1},{tipo:"A",plantilla:2},{tipo:"A",plantilla:2}])')) === '{}', '3 de 5 (60%) no alcanza el 70%');
// recibir
auth = { ok: false, error: 'no_autorizado' };
t(R('bzmRecibir_({texto:PAG})').error === 'no_autorizado' && !libro['Buzon Mensajes'], 'sin clave no escribe');
auth = null;
t(R('bzmRecibir_({texto:"nada"})').leidos === 0 && !libro['Buzon Mensajes'], 'texto sin mensajes: no crea hoja');
t(R('bzmRecibir_({texto:"Buzón Mensaje de algo muy distinto "+"x".repeat(400)})').error === 'formato' && logs.some(l => /^WARN.*formato/.test(l)), 'pantalla que cambio: avisa en el Log y no escribe');
let r = R('bzmRecibir_({texto:PAG})'); const H = () => libro['Buzon Mensajes'];
t(r.ok && r.nuevos === 3 && r.pendientes === 3 && H().filas.length === 3, 'primera vez: guarda solo los 3 que piden respuesta');
const F = () => H().filas.map(f => f[H().enc.indexOf('PEDIDO')] + ':' + f[0]);
t(H().filas[0][0] === 'PENDIENTE' && H().filas[0][1] === '47 h' && H().filas[1][1] === 'ATRASADO' && H().filas[0][2] === '2026-11-25', 'estado, limite y fecha escritos');
t(H().filas[0][6] === '600000137379202' && H().filas[0][4] === 'LLEGADA', 'pedido como texto y tipo');
t(logs.some(l => /^WARN Buzon: 3 mensaje/.test(l) && /1 urgente/.test(l)), 'Log WARN con urgentes (el atrasado; el de 47 h no cuenta): ' + logs.join(' / '));
// segunda lectura igual: nada nuevo, no duplica
const antes = logs.length; r = R('bzmRecibir_({texto:PAG})');
t(r.nuevos === 0 && r.resueltos === 0 && H().filas.length === 3 && logs.length === antes, 'misma lectura: no duplica ni repite el Log');
// ella anota plantillas 3 veces para LLEGADA y llega uno nuevo -> se sugiere
const iPl = H().enc.indexOf('PLANTILLA'), iSu = H().enc.indexOf('SUGERIDA'), iTi = H().enc.indexOf('TIPO');
for (let k = 0; k < 3; k++) H().filas.push(['RESUELTO', '', '2026-11-1' + k, 'X' + k, 'LLEGADA', 'a', '9' + k, 4, '', '', '']);
const PAG2 = PAG + '\nNuevo Cliente\nHoy\nMensaje de cliente en Walmart.com.mx: No ha llegado y ya pasó la fecha estimada, 600000999999999\nNº de pedido: 600000999999999\nSe requiere una respuesta\n20 horas\n';
ctx.PAG2 = PAG2; r = R('bzmRecibir_({texto:PAG2})');
const nuevo = H().filas[H().filas.length - 1];
t(r.nuevos === 1 && String(nuevo[iSu]) === '4' && nuevo[iPl] === '', 'sugiere la 4 (la que ella uso 3 veces en LLEGADA) y deja PLANTILLA vacia para que ella decida');
// Walmart ya no marca el de hoy (lo contestaron): pasa a RESUELTO
const PAG3 = PAG2.replace('Se requiere una respuesta\n47 horas', '');
ctx.PAG3 = PAG3; r = R('bzmRecibir_({texto:PAG3})');
t(r.resueltos === 1 && H().filas[0][0] === 'RESUELTO' && H().filas[0][1] === '', 'si aparece sin la marca: RESUELTO');
// vuelve a pedir respuesta: otra vez PENDIENTE
r = R('bzmRecibir_({texto:PAG2})');
t(H().filas[0][0] === 'PENDIENTE', 'si vuelve a pedir respuesta: PENDIENTE otra vez');
t(H().widths[6] === 300, 'formato solo en sus columnas');
console.log('t109 ok ' + ok + (bad ? ' FALLAS ' + bad : '')); process.exit(bad ? 1 : 0);
