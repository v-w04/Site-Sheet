/**
 * ============================================================
 *  Salud — resumen de que procesos automaticos corren bien
 * ============================================================
 *
 * Lee la hoja Log y arma la hoja "Salud": una fila por proceso (etapa del Log) con cada cuanto corre, cuando salio bien
 * la ultima vez, el ultimo error y un estado. Nadie la configura: el ritmo de cada proceso se mide del propio Log
 * (mediana del tiempo entre sus corridas buenas), asi que un proceso nuevo entra solo.
 *
 *   ✅ corre a su ritmo y no tiene errores recientes
 *   ⚠️ se atraso (lleva mas de 3 veces su ritmo, minimo 90 min, sin salir bien) o hubo errores pero ya volvio a salir bien
 *   ❌ el ultimo error es mas nuevo que la ultima corrida buena (o nunca ha salido bien)
 *
 * Se actualiza sola cada hora (la dispara la corrida de inventario) y desde el menu.
 */
var SALUD = {
  hoja: 'Salud',
  enc: ['PROCESO', 'CADA (aprox)', 'ULTIMA BUENA', 'HACE', 'ULTIMO ERROR', 'ESTADO', 'DETALLE'],
  // Etapas que son eventos puntuales (no corren solas): no se vigilan
  ignorar: ['POPUP', 'COLUMNAS', 'ENVIO', 'WFS', 'AVISO', 'TRIGGER', 'SALUD', 'SOLICITUD', 'TRASLADO', 'LOGIN', 'NOTA'],
  minAtrasoMin: 90,
  ventanaErrorH: 3
};

function saludMin_(n) {
  if (n == null) return '';
  if (n < 90) return Math.round(n) + ' min';
  if (n < 48 * 60) return (n / 60).toFixed(1).replace(/\.0$/, '') + ' h';
  return (n / 1440).toFixed(1).replace(/\.0$/, '') + ' d';
}

function saludHora_(v) {
  if (v instanceof Date) return v.getTime();
  var s = String(v || '').trim();
  if (!s) return null;
  try { return Utilities.parseDate(s, TZ, 'yyyy-MM-dd HH:mm:ss').getTime(); } catch (e) { return null; }
}

/** Funcion pura: eventos [[ms, nivel, etapa, mensaje]] y "ahora" (ms) -> filas de la hoja. Se prueba aparte. */
function saludCalcular_(eventos, ahora) {
  var por = {};
  eventos.forEach(function (e) {
    var et = String(e[2] || '').trim();   // col-fija: fila en memoria / columna propia de esta hoja
    if (!et || SALUD.ignorar.indexOf(et) >= 0 || e[0] == null) return;   // col-fija: fila en memoria / columna propia de esta hoja
    var x = por[et] = por[et] || { buenas: [], errores: [], warns: 0 };
    var nv = String(e[1]);   // col-fija: fila en memoria / columna propia de esta hoja
    if (nv === 'OK' || nv === 'FINISH') x.buenas.push(e[0]);   // col-fija: fila en memoria / columna propia de esta hoja
    else if (nv === 'ERROR') x.errores.push({ t: e[0], m: String(e[3] || '') });   // col-fija: fila en memoria / columna propia de esta hoja
    else if (nv === 'WARN') x.warns++;
  });
  var filas = [];
  Object.keys(por).forEach(function (et) {
    var x = por[et];
    if (!x.buenas.length && !x.errores.length) return;
    x.buenas.sort(function (a, b) { return a - b; });
    var ultB = x.buenas.length ? x.buenas[x.buenas.length - 1] : null;
    var ultE = x.errores.length ? x.errores.reduce(function (a, b) { return b.t > a.t ? b : a; }) : null;
    // Ritmo: mediana de los huecos entre corridas buenas que no sean de la misma corrida (>10 min)
    var huecos = [], ult = null;
    x.buenas.forEach(function (t) { if (ult != null && t - ult > 10 * 60000) huecos.push((t - ult) / 60000); if (ult == null || t - ult > 10 * 60000) ult = t; });
    huecos.sort(function (a, b) { return a - b; });
    var cada = huecos.length >= 2 ? huecos[Math.floor(huecos.length / 2)] : null;
    var haceB = ultB != null ? (ahora - ultB) / 60000 : null;
    var estado = '✅', det = '';
    var errReciente = ultE && (ahora - ultE.t) / 3600000 <= SALUD.ventanaErrorH;
    if (ultB == null) { estado = '❌'; det = 'Nunca ha salido bien en lo que guarda el Log. ' + (ultE ? ultE.m : ''); }
    else if (errReciente && ultE.t >= ultB) { estado = '❌'; det = ultE.m; }
    else if (cada != null && haceB > Math.max(3 * cada, SALUD.minAtrasoMin)) { estado = '⚠️'; det = 'Se atrasó: debería correr cada ~' + saludMin_(cada) + ' y lleva ' + saludMin_(haceB) + '.'; }
    else if (errReciente) { estado = '⚠️'; det = 'Hubo error hace ' + saludMin_((ahora - ultE.t) / 60000) + ' pero ya volvió a salir bien: ' + ultE.m; }
    else if (ultE) det = 'Último error hace ' + saludMin_((ahora - ultE.t) / 60000) + '.';
    filas.push([et, cada != null ? saludMin_(cada) : '—', ultB != null ? new Date(ultB) : '', haceB != null ? saludMin_(haceB) : '', ultE ? new Date(ultE.t) : '', estado, det.replace(/\s+/g, ' ').slice(0, 220)]);
  });
  var orden = { '❌': 0, '⚠️': 1, '✅': 2 };
  filas.sort(function (a, b) { return orden[a[5]] - orden[b[5]] || (a[0] < b[0] ? -1 : 1); });
  return filas;
}

function saludActualizar_() {
  var ss = SpreadsheetApp.getActive(), log = ss.getSheetByName('Log');
  if (!log || log.getLastRow() < 2) return null;
  var v = log.getRange(2, 1, log.getLastRow() - 1, 4).getValues();   // col-fija: fila en memoria / columna propia de esta hoja
  var ev = v.map(function (r) { return [saludHora_(r[0]), r[1], r[2], r[3]]; });   // col-fija: fila en memoria / columna propia de esta hoja
  var filas = saludCalcular_(ev, Date.now());
  var h = ss.getSheetByName(SALUD.hoja);
  if (!h) {
    h = ss.insertSheet(SALUD.hoja);
    h.getRange(1, 1, 1, SALUD.enc.length).setValues([SALUD.enc]).setBackground('#E37400').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
    h.setFrozenRows(1);
    [190, 110, 150, 80, 150, 70, 520].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  }
  reescribirHoja_(h, SALUD.enc, filas, { vacioOk: true });
  if (filas.length) {
    h.getRange(2, 3, filas.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');   // col-fija: fila en memoria / columna propia de esta hoja
    h.getRange(2, 5, filas.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');   // col-fija: fila en memoria / columna propia de esta hoja
    h.getRange(2, 6, filas.length, 1).setHorizontalAlignment('center');   // col-fija: fila en memoria / columna propia de esta hoja
  }
  var mal = filas.filter(function (f) { return f[5] === '❌'; }), atr = filas.filter(function (f) { return f[5] === '⚠️'; });   // col-fija: fila en memoria / columna propia de esta hoja
  var resumen = filas.length - mal.length - atr.length + ' bien' + (atr.length ? ' · ' + atr.length + ' con aviso (' + atr.map(function (f) { return f[0]; }).join(', ') + ')' : '') +   // col-fija: fila en memoria / columna propia de esta hoja
    (mal.length ? ' · ' + mal.length + ' con ERROR (' + mal.map(function (f) { return f[0]; }).join(', ') + ')' : '');   // col-fija: fila en memoria / columna propia de esta hoja
  if (mal.length) logWarn_('SALUD', 'Salud: ' + resumen); else logOk_('SALUD', 'Salud: ' + resumen);
  return { filas: filas, resumen: resumen, hoja: h };
}

/** La llama la corrida de inventario (cada 15 min): solo actua una vez por hora y nunca la interrumpe. */
function saludProgramado_() {
  try {
    if (new Date().getMinutes() >= 15) return;
    flushLog_();
    saludActualizar_();
  } catch (e) { console.log('Salud: ' + e.message); }
}

/** Menu: actualiza y muestra. */
function saludMenu() {
  var r = saludActualizar_();
  flushLog_();
  if (!r) { dlgInfo_('🩺 Salud del Sheet', 'Todavía no hay Log para revisar.', 'aviso'); return; }
  SpreadsheetApp.getActive().setActiveSheet(r.hoja);
  var mal = r.filas.filter(function (f) { return f[5] !== '✅'; });   // col-fija: fila en memoria / columna propia de esta hoja
  dlgInfo_('🩺 Salud del Sheet', r.resumen + '\n\n' + (mal.length ? mal.slice(0, 8).map(function (f) { return '• ' + f[5] + ' ' + f[0] + ': ' + f[6]; }).join('\n') : 'Todo corre a su ritmo y sin errores recientes.') + '\n\nDetalle por proceso en la hoja Salud.', mal.length ? 'aviso' : 'ok');   // col-fija: fila en memoria / columna propia de esta hoja
}
