/**
 * RecoleccionMensaje.gs · Mensaje de recoleccion para WhatsApp (24-nov-2026).
 * La extension lo pide con la accion rec_mensaje {clave} -> {ok, texto}, lo guarda y ella lo copia (y lo retoca ahi mismo).
 * Sale solo de datos del Sheet: Recoleccion Historial (ultima solicitud enviada) y la fila AUTO de pendientes de recoger de la hoja Reporte.
 * Sin bloque "Real de hoy" (ella lo quito el 24-nov). Formato FIJO acordado: no cambiarlo sin que ella lo pida.
 */

var RM_DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var RM_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Pura. d = {ts, para (Date), parcel, bigitem, vinos, estafeta, pend:{dias:[{n,d,m}], atrasados, ordenes:[]}, tel, seller, cuenta, dir, cp, ref, hoy (Date)} */
function recMensajeArmar_(d) {
  var f = function (x) { return RM_DIAS[x.getDay()] + ' ' + x.getDate() + ' ' + RM_MESES[x.getMonth()]; };
  var hora = function (x) { var h = x.getHours(), m = x.getMinutes(); return ('0' + (h % 12 || 12)).slice(-2) + ':' + ('0' + m).slice(-2) + (h < 12 ? 'am' : 'pm'); };
  var mismoDia = d.ts && d.hoy && d.ts.getFullYear() === d.hoy.getFullYear() && d.ts.getMonth() === d.hoy.getMonth() && d.ts.getDate() === d.hoy.getDate();
  var L = [];
  L.push('Hola, buen día @~recolecciones mkp locales', '');
  L.push('✅ Recolección solicitada');
  L.push((mismoDia ? 'Hoy ' : '') + f(d.ts) + ', ' + hora(d.ts));
  L.push('Recolección para: ' + f(d.para), '');
  L.push('📦 Paquetes: Flota Dedicada PARCEL ' + d.parcel + ' · Flota Dedicada BIG ITEM ' + d.bigitem + ' · Vinos ' + d.vinos + ' · Estafeta ' + d.estafeta, '');
  if (d.pend && d.pend.dias && d.pend.dias.length) {
    var tok = [], acum = 0, atr = d.pend.atrasados || 0, ord = (d.pend.ordenes || []);
    d.pend.dias.forEach(function (x) {
      var t = x.n + ' del ' + x.d + '/' + RM_MESES[x.m - 1];
      if (acum < atr) { t = x.n + ' atrasado' + (x.n === 1 ? '' : 's') + ' del ' + x.d + '/' + RM_MESES[x.m - 1] + (ord.length ? ' · orden' + (ord.length === 1 ? '' : 'es') + ' ' + ord.join(', ') : ''); ord = []; }
      acum += x.n; tok.push(t);
    });
    L.push('⚠️ Pendientes de recoger: ' + tok.join(' · '), '');
  }
  L.push('🏢 Cuenta ' + d.cuenta + ' · Seller ID ' + d.seller);
  L.push('Contacto: ' + d.cuenta + ' · ' + d.tel, '');
  L.push('📍 ' + d.dir + ', CP ' + d.cp + ', Referencia: ' + d.ref + ', Horario: 12pm a 3pm', '');
  L.push('Saludos');
  return L.join('\n');
}

/** Pura. Lee de la hoja Reporte los paquetes pendientes de recoger: {pend}. filas = [{pregunta, respuesta, accion}] */
function recMensajeDeReporte_(filas) {
  var out = { pend: null };
  (filas || []).forEach(function (r) {
    var q = String(r.pregunta || ''), a = String(r.respuesta || '');
    if (/paquetes pendientes de recoger/i.test(q)) {
      var dias = [], re = /(\d+) del (\d+)\/(\d+)/g, x;
      while ((x = re.exec(a)) !== null) dias.push({ n: +x[1], d: +x[2], m: +x[3] });
      var at = a.match(/(\d+) atrasados?/i), od = String(r.accion || '').match(/[Óo]rdenes?:\s*([0-9,\s]+)/);
      out.pend = { dias: dias, atrasados: at ? +at[1] : 0, ordenes: od ? od[1].split(/[,\s]+/).filter(function (s) { return /^\d{9,}$/.test(s); }) : [] };
    }
  });
  return out;
}

/** Junta los datos del Sheet y devuelve {ok, texto}. */
function recMensajeCrear_() {
  var h = getHoja_(REC_HOJA_HIST);
  if (!h || h.getLastRow() < 2) return { ok: false, error: 'sin_historial' };
  var c = colsHoja_(h, ['Fecha y hora', 'Acción', 'Recolección del', 'Resultado', 'Flota Dedicada PARCEL', 'Flota Dedicada BIG ITEM', 'Flota Dedicada Vinos', 'Estafeta PARCEL', 'Estafeta BIG ITEM']);
  var d = h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues(), ult = null;
  d.forEach(function (r) {
    var t = r[c['Fecha y hora']];
    if (!(t instanceof Date) || !/^✅/.test(String(r[c['Resultado']] || '')) || !(r[c['Recolección del']] instanceof Date)) return;
    if (!ult || t.getTime() > ult[c['Fecha y hora']].getTime()) ult = r;
  });
  if (!ult) return { ok: false, error: 'sin_solicitud_enviada' };
  var rep = { pend: null };
  try {
    var hr = getHoja_('Reporte');
    if (hr && hr.getLastRow() > 1) {
      var cr = colsHoja_(hr, ['PREGUNTA', 'RESPUESTA'], ['ACCION']);
      var fr = hr.getRange(2, 1, hr.getLastRow() - 1, hr.getLastColumn()).getValues().map(function (r) { return { pregunta: r[cr.PREGUNTA], respuesta: r[cr.RESPUESTA], accion: cr.ACCION >= 0 ? r[cr.ACCION] : '' }; });
      rep = recMensajeDeReporte_(fr);
    }
  } catch (e) { /* sin Reporte: el mensaje sale sin esas lineas */ }
  var num = function (k) { return Number(ult[c[k]]) || 0; };
  var texto = recMensajeArmar_({
    ts: ult[c['Fecha y hora']], para: ult[c['Recolección del']], hoy: new Date(),
    parcel: num('Flota Dedicada PARCEL'), bigitem: num('Flota Dedicada BIG ITEM'), vinos: num('Flota Dedicada Vinos'),
    estafeta: num('Estafeta PARCEL') + num('Estafeta BIG ITEM'),
    pend: rep.pend,
    tel: REC_RESP.TELEFONO, seller: REC_RESP.SELLER_ID, cuenta: REC_RESP.CUENTA, dir: REC_RESP.DIRECCION, cp: REC_RESP.CP, ref: REC_RESP.REFERENCIA
  });
  return { ok: true, texto: texto };
}

/** Accion rec_mensaje: la extension pide el texto del mensaje de recoleccion (solo con la clave de la extension). */
function recMensajeEntregar_(p) {
  var err = csAutorizar_(p); if (err) return err;
  try { return recMensajeCrear_(); }
  catch (e) { return { ok: false, error: 'armar: ' + String(e && e.message ? e.message : e).slice(0, 120) }; }
}
