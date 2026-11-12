/**
 * ============================================================
 *  Pedidos en riesgo por falta de embarque (correo de Walmart Marketplace)
 * ============================================================
 *
 *  Walmart manda "Pedidos en riesgo por falta de embarque" con una tabla (orden de compra, pedido, SKU, fechas, total).
 *  Cada hora, en la misma cuenta que lee Cancelaciones, se leen esos correos y cada orden queda UNA vez en la hoja
 *  "Pedidos en riesgo" (nunca se borra). Se cruza con Ventas Walmart (estatus, guia) y con Cancelaciones / Odoo para decir
 *  si ya se envio, si falta la guia, si ya se cancelo o si se vencio. El Sheet solo LEE: no cancela ni cambia nada en Walmart.
 *
 *  SITUACION y ACCION se recalculan en cada corrida. EN CORREO = SI si la orden sale en el correo mas reciente.
 *  No guarda nombres ni direcciones de clientes.
 * ============================================================
 */

var PRI_HOJA = 'Pedidos en riesgo', PR_ETAPA = 'RIESGO';
var PR_ENC = ['ORDEN DE COMPRA', 'PEDIDO', 'SKU', 'TOTAL', 'FECHA PEDIDO', 'ENVIO ESTIMADO', 'PRIMER AVISO', 'ULTIMO AVISO', 'AVISOS',
              'EN CORREO', 'ESTATUS WALMART', 'ESTATUS SELLER CENTER', 'GUIA', 'ODOO', 'CASO', 'SITUACION', 'ACCION'];
var PR_Q = 'subject:"Pedidos en riesgo por falta de embarque"';
var PR_DIAS_PRIMERA = 60, PR_DIAS_NORMAL = 10;
var PR_COLOR = { 'ENVIADA SIN GUIA': '#f4cccc', 'VENCIDA SIN ENVIAR': '#f4cccc', 'CANCELADA EN ODOO': '#fce5cd', 'CON GUIA, FALTA MARCAR EMBARCADO': '#fff2cc',
                 'POR ENVIAR': '#fff2cc', 'NO ESTA EN VENTAS': '#fff2cc', 'ENVIADA CON GUIA': '#d9ead3', 'CANCELADA EN WALMART': '#d9d9d9',
                 'SIN GUIA: CASO ABIERTO': '#cfe2f3', 'SIN GUIA: WALMART PIDE INFO': '#f4cccc', 'SIN GUIA: WALMART RESPONDIO': '#fff2cc', 'SIN GUIA: CASO RESUELTO': '#d9ead3' };
var PR_PASIVAS = ['ENVIADA CON GUIA', 'CANCELADA EN WALMART', 'POR ENVIAR', 'SIN GUIA: CASO ABIERTO'];   // no piden accion hoy

/* ---------------- piezas puras (se prueban sin Google) ---------------- */

/** Texto plano de una celda HTML. */
function prTexto_(h) {
  return String(h === null || h === undefined ? '' : h).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
    .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/** Encabezado sin acentos, espacios ni signos: 'Fecha estimad a de envío' -> 'fechaestimadadeenvio'. */
function prNorm_(s) {
  var t = String(s === null || s === undefined ? '' : s).toLowerCase();
  try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
  return t.replace(/[^a-z0-9]/g, '');
}

/** Orden de compra / pedido: solo digitos y guiones, sin espacios ('6091301892 55859' -> '609130189255859'). */
function prId_(s) { return String(s === null || s === undefined ? '' : s).replace(/\s+/g, ''); }
function prDigitos_(s) { return String(s === null || s === undefined ? '' : s).replace(/\D/g, ''); }
/** Pedido sin el sufijo de linea del correo ('600000131318758-1-1' -> '600000131318758'): asi lo ven Seller Center y Casos Walmart. */
function prPedidoBase_(s) { return String(s === null || s === undefined ? '' : s).replace(/\s+/g, '').split('-')[0].replace(/\D/g, ''); }

/** '2026-10-27T16:15:32 ....' -> Date (solo el dia, sin zona horaria); '' si no trae fecha. */
function prFecha_(s) {
  var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(s === null || s === undefined ? '' : s));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
}

function prNum_(s) {
  var n = parseFloat(String(s === null || s === undefined ? '' : s).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? '' : n;
}

/** Posicion de cada campo segun el ENCABEZADO de la tabla del correo (la tabla puede cambiar de orden). */
function prMapaEnc_(celdas) {
  var n = celdas.map(prNorm_);
  if (!n.some(function (x) { return x.indexOf('ordendecompra') >= 0; })) return null;
  var buscar = function (re) { for (var i = 0; i < n.length; i++) if (re.test(n[i])) return i; return -1; };
  var m = { orden: buscar(/ordendecompra/), pedido: buscar(/^pedido/), sku: buscar(/^sku/), fPedido: buscar(/fechadelpedido/),
            envio: buscar(/fechaestimad.*envio/), entrega: buscar(/fechaestimad.*entrega/), total: buscar(/^total/) };
  return m.orden >= 0 && m.pedido >= 0 ? m : null;
}

/** Filas de la tabla del correo (HTML): [{orden, pedido, sku, fechaPedido, envioEst, total}]. */
function prParsearHtml_(html) {
  var out = [], mapa = null, re = /<tr[^>]*>([\s\S]*?)<\/tr>/gi, m;
  var s = String(html || '');
  while ((m = re.exec(s))) {
    var celdas = [], rc = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, c;
    while ((c = rc.exec(m[1]))) celdas.push(prTexto_(c[1]));
    var enc = prMapaEnc_(celdas);
    if (enc) { mapa = enc; continue; }
    if (!mapa) continue;
    var orden = prId_(celdas[mapa.orden]);
    if (!/^\d{12,}$/.test(orden)) continue;
    var at = function (i) { return i >= 0 && i < celdas.length ? celdas[i] : ''; };
    out.push({ orden: orden, pedido: prId_(at(mapa.pedido)), sku: at(mapa.sku), fechaPedido: prFecha_(at(mapa.fPedido)), envioEst: prFecha_(at(mapa.envio)), total: prNum_(at(mapa.total)) });
  }
  return out;
}

/** Plan B si el correo no trae tabla: orden de compra seguida del pedido con guiones. */
function prParsearTexto_(txt) {
  var out = [], re = /(\d{12,})\s+(\d{12,}-\d+-\d+)/g, m, vistos = {};
  var s = String(txt || '');
  while ((m = re.exec(s))) {
    if (vistos[m[1]]) continue;
    vistos[m[1]] = true;
    out.push({ orden: m[1], pedido: m[2], sku: '', fechaPedido: '', envioEst: '', total: '' });
  }
  return out;
}

/**
 * Une lo leido en los correos con lo que ya estaba. existentes: { orden: {primero, ultimo, avisos} }
 * lecturas: [{fecha: Date, filas: [...]}] (cualquier orden). Devuelve { orden: {datos, primero, ultimo, avisos, ultimoCorreo} }
 * y la fecha del correo mas reciente.
 */
function prUnir_(lecturas) {
  var por = {}, ultimaFecha = null;
  lecturas.forEach(function (l) {
    var t = l.fecha instanceof Date ? l.fecha.getTime() : 0;
    if (ultimaFecha === null || t > ultimaFecha) ultimaFecha = t;
    var vistoAqui = {};
    (l.filas || []).forEach(function (f) {
      if (vistoAqui[f.orden]) return;
      vistoAqui[f.orden] = true;
      var o = por[f.orden];
      if (!o) { por[f.orden] = { datos: f, primero: t, ultimo: t, avisos: 1 }; return; }
      o.avisos++;
      if (t < o.primero) o.primero = t;
      if (t >= o.ultimo) { o.ultimo = t; o.datos = f; }
    });
  });
  return { por: por, ultimaFecha: ultimaFecha };
}

/**
 * SITUACION y ACCION de una orden. v = { enVentas, estatus, guia (bool), odooCancelada (bool), envioEst (Date|''), hoy (Date) }
 */
function prSituacion_(v) {
  var est = String(v.estatus || '').toLowerCase();
  var enviada = /shipped|delivered/.test(est);
  if (/cancel/.test(est)) return { sit: 'CANCELADA EN WALMART', accion: '' };
  if (!v.enVentas) return { sit: 'NO ESTA EN VENTAS', accion: 'Buscarla en Seller Center' };
  if (enviada && !v.guia) return prSinGuia_(v);
  if (v.odooCancelada) return enviada
    ? { sit: 'CANCELADA EN ODOO', accion: 'Walmart dice Enviado con guía: ya salió, revisar' }
    : { sit: 'CANCELADA EN ODOO', accion: 'Cancelar en Walmart' };
  if (enviada) return { sit: 'ENVIADA CON GUIA', accion: '' };
  if (v.guia) return { sit: 'CON GUIA, FALTA MARCAR EMBARCADO', accion: 'Marcar embarcado en Seller Center' };
  if (v.envioEst instanceof Date && v.hoy instanceof Date && v.envioEst.getTime() < v.hoy.getTime()) return { sit: 'VENCIDA SIN ENVIAR', accion: 'Enviar hoy o cancelar' };
  var f = v.envioEst instanceof Date ? v.envioEst.getDate() + '/' + (v.envioEst.getMonth() + 1) : '';
  return { sit: 'POR ENVIAR', accion: f ? 'Embarcar antes del ' + f : 'Embarcar' };
}

/** Walmart dice Enviado pero no hay guia: se sigue el caso (hoja Casos Walmart). v.caso = {estado, folio} o nada. sinGuia:true = el Sheet debe tener un caso. */
function prSinGuia_(v) {
  var c = v.caso, est = c ? String(c.estado || '').toUpperCase() : '', fol = c && c.folio ? ' (caso ' + c.folio + ')' : '';
  var nota = v.odooCancelada ? ' · ya cancelada en Odoo' : '';
  if (!c || est === 'POR ABRIR') return { sit: 'ENVIADA SIN GUIA', accion: 'Abrir caso: no se generó la guía' + nota, sinGuia: true };
  if (/PIDE INFO/.test(est)) return { sit: 'SIN GUIA: WALMART PIDE INFO', accion: 'Responder a Walmart en el caso' + fol + nota, sinGuia: true };
  if (/RESPUESTA WALMART/.test(est)) return { sit: 'SIN GUIA: WALMART RESPONDIO', accion: 'Leer la respuesta de Walmart' + fol + ' y decidir' + nota, sinGuia: true };
  if (/RESUELTO|CERRADO/.test(est)) return { sit: 'SIN GUIA: CASO RESUELTO', accion: 'Revisar si ya salió con guía' + fol + nota, sinGuia: true };
  return { sit: 'SIN GUIA: CASO ABIERTO', accion: 'Esperar respuesta de Walmart' + fol + nota, sinGuia: true };
}

/* ---------------- lectura de hojas ---------------- */

/** { orden: {estatus, guia, odoo} } desde Ventas Walmart (por FOLIO y ORDEN ID). */
function prIndiceVentas_() {
  var idx = {}, t = peTabla_(VH_HOJA);
  if (!t) return idx;
  var iF = peCol_(t, ['FOLIO']), iO = peCol_(t, ['ORDEN ID']), iE = peCol_(t, ['ESTATUS']), iT = peCol_(t, ['TRACKING']),
      iG = peCol_(t, ['ENVIO GUIA']), iD = peCol_(t, ['ODOO ESTADO']), iS = peCol_(t, ['SKU']);
  t.filas.forEach(function (f) {
    var o = { estatus: iE < 0 ? '' : String(f[iE] || ''), guia: (iT >= 0 && String(f[iT] || '').trim() !== '') || (iG >= 0 && String(f[iG] || '').trim() !== ''),
              odoo: iD < 0 ? '' : String(f[iD] || '').toLowerCase(), sku: iS < 0 ? '' : String(f[iS] || '') };
    [iF, iO].forEach(function (i) { if (i < 0) return; var k = prDigitos_(f[i]); if (k && !idx[k]) idx[k] = o; });
  });
  return idx;
}

/** { orden: true } de lo que Cancelaciones ya marco como cancelado (Odoo o site). */
function prCanceladasCancelaciones_() {
  var m = {}, t = peTabla_(CAN_HOJA);
  if (!t) return m;
  var iO = peCol_(t, ['ORDEN DE COMPRA#']), iE = peCol_(t, ['ESTADO ODOO']);
  if (iO < 0 || iE < 0) return m;
  t.filas.forEach(function (f) { if (/^CANCELADO/.test(String(f[iE] || ''))) { var k = prDigitos_(f[iO]); if (k) m[k] = true; } });
  return m;
}

/* ---------------- hoja y correo ---------------- */

function prFormatoRiesgo_(h) {
  var m = ubicarColumnas_(h, PR_ENC, 1), cS = escrCol_(m, 'SITUACION'), filas = Math.max(h.getMaxRows() - 1, 1);
  if (!cS) return;
  var rango = h.getRange(2, cS, filas, 1), nombres = Object.keys(PR_COLOR);
  var propia = function (r) {
    var rs = r.getRanges(), cond = r.getBooleanCondition(), vals = cond ? cond.getCriteriaValues() : [];
    return rs.length === 1 && rs[0].getColumn() === cS && vals.length === 1 && nombres.indexOf(String(vals[0])) >= 0;
  };
  var reglas = h.getConditionalFormatRules().filter(function (r) { return !propia(r); });
  nombres.forEach(function (n) { reglas.push(SpreadsheetApp.newConditionalFormatRule().setRanges([rango]).whenTextEqualTo(n).setBackground(PR_COLOR[n]).build()); });
  h.setConditionalFormatRules(reglas);
}

/** Lee los correos, agrega lo nuevo y actualiza avisos. Devuelve { correos, ordenes, nuevas, cambios }. */
function prLeerCorreos_() {
  var primera = vdProp_('PR_INI') !== '1', dias = primera ? PR_DIAS_PRIMERA : PR_DIAS_NORMAL;
  var hilos = GmailApp.search(PR_Q + ' newer_than:' + dias + 'd', 0, 100), lect = [], correos = 0;
  hilos.forEach(function (th) {
    th.getMessages().forEach(function (m) {
      var asunto = String(m.getSubject() || '');
      if (!/pedidos en riesgo por falta de embarque/i.test(asunto)) return;
      correos++;
      var filas = prParsearHtml_(m.getBody());
      if (!filas.length) filas = prParsearTexto_(m.getPlainBody());
      lect.push({ fecha: m.getDate(), filas: filas });
    });
  });
  vdSetProp_('PR_INI', '1');
  var r = { correos: correos, ordenes: 0, nuevas: 0, cambios: 0 };
  if (!lect.length) { avisoDia_('pr-sin-correo', 'INFO', PR_ETAPA, 'Pedidos en riesgo: sin correos en los ultimos ' + dias + ' dias'); return r; }
  var u = prUnir_(lect), claves = Object.keys(u.por);
  r.ordenes = claves.length;
  var h = peHojaAsegurar_(PRI_HOJA, PR_ENC), t = peTabla_(PRI_HOJA), m = ubicarColumnas_(h, PR_ENC, 1);
  var pos = function (e) { return t ? peCol_(t, [e]) : -1; };
  var iO = pos('ORDEN DE COMPRA'), existentes = {};
  if (t && iO >= 0) t.filas.forEach(function (f, i) { var k = prDigitos_(f[iO]); if (k) existentes[k] = { i: i, f: f }; });
  var d = function (ms) { return ms ? new Date(ms) : ''; };
  var nuevas = [];
  claves.forEach(function (k) {
    var o = u.por[k], x = existentes[k], dt = o.datos;
    if (!x) {
      nuevas.push({ 'ORDEN DE COMPRA': "'" + k, 'PEDIDO': dt.pedido, 'SKU': dt.sku, 'TOTAL': dt.total, 'FECHA PEDIDO': dt.fechaPedido, 'ENVIO ESTIMADO': dt.envioEst,
                    'PRIMER AVISO': d(o.primero), 'ULTIMO AVISO': d(o.ultimo), 'AVISOS': o.avisos });
      return;
    }
    var fila = x.i + 2, cambio = false;
    var poner = function (e, v) { var c = escrCol_(m, e); if (!c) return; h.getRange(fila, c).setValue(v); cambio = true; };
    var ult = x.f[pos('ULTIMO AVISO')], pri = x.f[pos('PRIMER AVISO')], av = Number(x.f[pos('AVISOS')]) || 0;
    if (!(ult instanceof Date) || o.ultimo > ult.getTime() + 1000) poner('ULTIMO AVISO', d(o.ultimo));
    if (!(pri instanceof Date) || o.primero < pri.getTime() - 1000) poner('PRIMER AVISO', d(o.primero));
    if (o.avisos > av) poner('AVISOS', o.avisos);
    if (cambio) r.cambios++;
  });
  if (nuevas.length) {
    peAgregar_(h, PR_ENC, nuevas); r.nuevas = nuevas.length;
    try { prFormatoRiesgo_(h); } catch (e) { logWarn_(PR_ETAPA, 'No se pudieron poner los colores: ' + String(e.message).split('\n')[0]); }
  }
  r.ultimaFecha = u.ultimaFecha;
  return r;
}

/** Recalcula EN CORREO, ESTATUS WALMART, GUIA, ODOO, SITUACION y ACCION de todas las filas. Devuelve conteo por situacion. */
function prCruzar_(ultimaFecha) {
  var h = vdLibro_().getSheetByName(PRI_HOJA);
  if (!h || h.getLastRow() < 2) return { total: 0, vigentes: 0, por: {} };
  var t = peTabla_(PRI_HOJA), m = ubicarColumnas_(h, PR_ENC, 1), n = t.filas.length;
  var ix = function (e) { return peCol_(t, [e]); };
  var iO = ix('ORDEN DE COMPRA'), iU = ix('ULTIMO AVISO'), iE = ix('ENVIO ESTIMADO'), iP = ix('PEDIDO'), iS = ix('SKU');
  var ventas = prIndiceVentas_(), canc = prCanceladasCancelaciones_(), hoy = prFecha_(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')), ahoraMs = Date.now();
  var sc = {}, casos = {}, abrir = [];
  try { sc = scIndice_(); } catch (e1) { logWarn_(PR_ETAPA, 'No se pudo leer la hoja Seller Center: ' + String(e1.message).split('\n')[0]); }
  try { casos = cawEstadoPorPedido_(); } catch (e2) { logWarn_(PR_ETAPA, 'No se pudo leer Casos Walmart: ' + String(e2.message).split('\n')[0]); }
  var ref = ultimaFecha || 0;
  if (!ref) t.filas.forEach(function (f) { var u = f[iU]; if (u instanceof Date && u.getTime() > ref) ref = u.getTime(); });
  var sal = { 'EN CORREO': [], 'ESTATUS WALMART': [], 'ESTATUS SELLER CENTER': [], 'GUIA': [], 'ODOO': [], 'CASO': [], 'SITUACION': [], 'ACCION': [] }, por = {}, vigentes = 0, firma = [];
  t.filas.forEach(function (f, fi) {
    var k = prDigitos_(f[iO]), ped = iP < 0 ? '' : prPedidoBase_(f[iP]), v = ventas[k], u = f[iU], scx = sc[k] || (ped && sc[ped]) || null, caso = (ped && casos[ped]) || null;
    var enCorreo = u instanceof Date && ref && u.getTime() >= ref - 60000;
    var odooCanc = (v && /cancel/.test(v.odoo)) || !!canc[k];
    var el = scElegir_(scx, v ? v.estatus : '', ahoraMs);
    var s = prSituacion_({ enVentas: !!v, estatus: el.estatus, guia: !!(v && v.guia), odooCancelada: odooCanc, envioEst: f[iE] instanceof Date ? f[iE] : '', hoy: hoy, caso: caso });
    var reciente = enCorreo || (u instanceof Date && hoy instanceof Date && hoy.getTime() - u.getTime() <= 14 * 86400000);
    if (s.sinGuia && !caso && reciente && ped) abrir.push({ pedido: ped, sku: iS < 0 ? '' : f[iS], fi: fi });
    sal['EN CORREO'].push([enCorreo ? 'SI' : 'NO']);
    sal['ESTATUS WALMART'].push([v ? v.estatus : '']);
    sal['ESTATUS SELLER CENTER'].push([el.etiqueta]);
    sal['CASO'].push([caso ? (caso.folio ? caso.estado + ' ' + caso.folio : caso.estado) : '']);
    sal['GUIA'].push([v ? (v.guia ? 'SI' : 'NO') : '']);
    sal['ODOO'].push([odooCanc ? 'CANCELADA' : (v ? 'ACTIVA' : '')]);
    sal['SITUACION'].push([s.sit]);
    sal['ACCION'].push([s.accion]);
    if (enCorreo) { vigentes++; por[s.sit] = (por[s.sit] || 0) + 1; firma.push(k + ':' + s.sit); }
  });
  var nCasos = 0;
  if (abrir.length) {
    try {
      nCasos = cawAbrirSinGuia_(abrir);
      if (nCasos) abrir.forEach(function (x) { sal['CASO'][x.fi] = ['POR ABRIR']; });
    } catch (e3) { logWarn_(PR_ETAPA, 'No se pudieron abrir casos por pedido sin guia: ' + String(e3.message).split('\n')[0]); }
  }
  Object.keys(sal).forEach(function (e) {
    var c = escrCol_(m, e); if (!c) return;
    var actual = h.getRange(2, c, n, 1).getValues(), cambio = false;
    for (var i = 0; i < n; i++) if (String(actual[i][0]) !== String(sal[e][i][0])) { cambio = true; break; }
    if (cambio) h.getRange(2, c, n, 1).setValues(sal[e]);
  });
  return { total: n, vigentes: vigentes, por: por, casosNuevos: nCasos, firma: firma.sort().join('|') };
}

function prResumenTexto_(c) {
  var partes = Object.keys(c.por).sort().map(function (s) { return c.por[s] + ' ' + s.toLowerCase(); });
  return c.vigentes + ' en el ultimo correo' + (partes.length ? ' (' + partes.join(', ') + ')' : '');
}

/** Corrida de cada hora (la llama Cancelaciones): lee correos y cruza. Solo escribe al Log si algo cambio. */
/** UNA vez: quita de la hoja Promociones las 16 columnas que Pedidos en riesgo le escribio por error (nombre PR_HOJA repetido, 12-nov).
 *  Solo toca columnas con esos encabezados que esten a la DERECHA de ACTUALIZADO (lo ultimo de Promociones); nada mas. */
var PR_JUNK_PROMOS = ['ORDEN DE COMPRA', 'PEDIDO', 'TOTAL', 'FECHA PEDIDO', 'ENVIO ESTIMADO', 'PRIMER AVISO', 'ULTIMO AVISO', 'AVISOS', 'EN CORREO',
                      'ESTATUS WALMART', 'ESTATUS SELLER CENTER', 'GUIA', 'ODOO', 'CASO', 'SITUACION', 'ACCION'];
function prLimpiarPromociones_() {
  try {
    if (vdProp_('PR_LIMPIO_PROMOS')) return 0;
    var h = vdLibro_().getSheetByName('Promociones');
    if (!h) { vdSetProp_('PR_LIMPIO_PROMOS', '1'); return 0; }
    var enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(function (x) { return prNorm_(x); });
    var corte = enc.indexOf(prNorm_('ACTUALIZADO'));
    if (corte < 0) return 0;                                    // no se reconoce la hoja: no se toca
    var malas = [];
    enc.forEach(function (e, i) { if (i > corte && PR_JUNK_PROMOS.map(prNorm_).indexOf(e) >= 0) malas.push(i + 1); });
    malas.sort(function (a, b) { return b - a; }).forEach(function (c) { h.deleteColumn(c); });
    vdSetProp_('PR_LIMPIO_PROMOS', '1');
    if (malas.length) logOk_(PR_ETAPA, 'Promociones: quite ' + malas.length + ' columnas que Pedidos en riesgo le habia escrito por error');
    return malas.length;
  } catch (e) { logWarn_(PR_ETAPA, 'No pude limpiar Promociones: ' + String(e.message).split('\n')[0]); return 0; }
}

function prCorrida_() {
  prLimpiarPromociones_();
  var r = prLeerCorreos_();
  if (!r.ordenes && !r.correos) return r;
  var c = prCruzar_(r.ultimaFecha);
  var firma = sha256_(c.firma || '');
  var cambio = r.nuevas || firma !== vdProp_('PR_FIRMA');
  vdSetProp_('PR_FIRMA', firma);
  var accionables = 0;
  Object.keys(c.por).forEach(function (k) { if (PR_PASIVAS.indexOf(k) < 0 && k !== 'NO ESTA EN VENTAS') accionables += c.por[k]; });
  if (cambio) {
    var msg = 'Pedidos en riesgo: ' + prResumenTexto_(c) + ' · nuevas ' + r.nuevas;
    if (accionables) logWarn_(PR_ETAPA, msg, c.por); else logOk_(PR_ETAPA, msg, c.por);
  }
  r.cruce = c;
  return r;
}

/** Menu: revisar ya. */
function pedidosRiesgoRevisar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(90000)) { dlgInfo_('Pedidos en riesgo', 'Otra corrida tiene el candado. Espera un minuto y vuelve a darle.', 'aviso'); return; }
  try {
    prLimpiarPromociones_();
    var r = prLeerCorreos_();
    if (!r.correos) {
      logWarn_(PR_ETAPA, 'Pedidos en riesgo: no encontre correos de Walmart en esta cuenta');
      flushLog_();
      dlgInfo_('Pedidos en riesgo', 'No encontre correos "Pedidos en riesgo por falta de embarque" en esta cuenta.', 'aviso');
      return;
    }
    var c = prCruzar_(r.ultimaFecha);
    vdSetProp_('PR_FIRMA', sha256_(c.firma || ''));
    var h = vdLibro_().getSheetByName(PRI_HOJA);
    logOk_(PR_ETAPA, 'Pedidos en riesgo revisados: ' + prResumenTexto_(c) + ' · nuevas ' + r.nuevas, c.por);
    flushLog_();
    if (h) h.activate();
    dlgInfo_('Pedidos en riesgo', 'Correos leidos: ' + r.correos + '\nOrdenes distintas: ' + r.ordenes + ' (nuevas: ' + r.nuevas + ')\nEn el ultimo correo: ' + prResumenTexto_(c), 'ok');
  } catch (e) {
    logErr_(PR_ETAPA, 'No se pudo revisar Pedidos en riesgo: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    dlgInfo_('Pedidos en riesgo', 'Fallo: ' + String(e.message).split('\n')[0], 'error');
  } finally { lock.releaseLock(); }
}
