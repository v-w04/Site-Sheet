/**
 * ============================================================
 *  Cancelar en WALMART (API de Marketplace Mexico) las ventas marcadas en la hoja Cancelaciones
 * ============================================================
 *
 *  Cancelar en el site/Odoo NO cancela en Walmart. Aqui, con la casilla CANCELAR EN WALMART de la hoja Cancelaciones,
 *  se cancela la orden en Walmart por su API oficial:
 *     POST https://marketplace.walmartapis.com/v3/token                          (client_credentials)
 *     GET  https://marketplace.walmartapis.com/v3/orders/{purchaseOrderId}       (ver las lineas y su estado)
 *     POST https://marketplace.walmartapis.com/v3/orders/{purchaseOrderId}/cancel
 *  Headers: WM_MARKET=mx, WM_SEC.ACCESS_TOKEN, WM_QOS.CORRELATION_ID, WM_SVC.NAME, WM_GLOBAL_VERSION=3.1.
 *  purchaseOrderId = ORDEN DE COMPRA# de la hoja. Motivo (MX): SELLER_REJECTION.
 *
 *  Seguridad:
 *   - Client ID y Client Secret SOLO en Script Properties (menu "Guardar credenciales Walmart (API)"); nunca en hoja ni Log.
 *   - "Probar" solo LEE la orden (no cancela nada): sirve para comprobar credenciales y que el numero es el correcto.
 *   - Cancelar pide confirmacion con la lista y no se deshace. Maximo WMC_TOPE por corrida.
 *   - Cancelar una orden en Walmart puede contar en las metricas del vendedor: cancela solo lo que quieras cancelar.
 *   - La estructura del cuerpo de /cancel sigue la API de Walmart; la primera cancelacion real conviene probarla con UNA orden.
 */

var WMC_ETAPA = 'CANCEL_WM';
var WMC_CHECK = 'CANCELAR EN WALMART';
var WMC_YA = 'CANCELADA EN WALMART';   // casilla SOLO de referencia: la marcas tu cuando ya cancelaste en Seller Center. Ningun codigo la lee ni la escribe (no es CANCELAR EN WALMART, que si cancela por API)
var WMC_ESTADO = 'ESTADO WALMART';
var WMC_FECHA = 'FECHA WALMART';
var WMC_URL = 'https://marketplace.walmartapis.com';
var WMC_MOTIVO = 'SELLER_REJECTION';
var WMC_TOPE = 10;
var WMC_PROP_ID = 'WALMART_API_CLIENT_ID';
var WMC_PROP_SECRET = 'WALMART_API_CLIENT_SECRET';
var WMC_CANCELABLES = { created: 1, acknowledged: 1 };

function wmcCred_() {
  var id = '', sec = '';
  try { id = String(props_().getProperty(WMC_PROP_ID) || '').trim(); sec = String(props_().getProperty(WMC_PROP_SECRET) || '').trim(); } catch (e) {}
  return id && sec ? { id: id, secret: sec } : null;
}

function wmcBase_(extra) {
  var h = { 'WM_MARKET': 'mx', 'WM_QOS.CORRELATION_ID': Utilities.getUuid(), 'WM_SVC.NAME': 'Walmart Marketplace', 'Accept': 'application/json' };
  Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
  return h;
}

function wmcToken_() {
  var cache = CacheService.getScriptCache(), t = cache.get('WMC_TOKEN');
  if (t) return t;
  var c = wmcCred_();
  if (!c) throw canErr_('Faltan las credenciales de la API de Walmart: menu Pedidos y casos > Cancelaciones > Configurar > Guardar credenciales Walmart (API).');
  var r = UrlFetchApp.fetch(WMC_URL + '/v3/token', {
    method: 'post', muteHttpExceptions: true, payload: { grant_type: 'client_credentials' },
    headers: wmcBase_({ 'Authorization': 'Basic ' + Utilities.base64Encode(c.id + ':' + c.secret) })
  });
  var code = r.getResponseCode(), j = null;
  try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (code !== 200 || !j || !j.access_token) throw canErr_('Walmart no dio el token (HTTP ' + code + '). Revisa Client ID y Client Secret.');
  cache.put('WMC_TOKEN', j.access_token, Math.max(60, (Number(j.expires_in) || 900) - 120));
  return j.access_token;
}

/** Llamada a la API con el token. Devuelve { code, json, texto }. */
function wmcLlamar_(metodo, ruta, cuerpo) {
  var opt = { method: metodo, muteHttpExceptions: true, headers: wmcBase_({ 'WM_SEC.ACCESS_TOKEN': wmcToken_(), 'WM_GLOBAL_VERSION': '3.1' }) };
  if (cuerpo) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(cuerpo); }
  var r = UrlFetchApp.fetch(WMC_URL + ruta, opt), txt = r.getContentText(), j = null;
  try { j = JSON.parse(txt); } catch (e) {}
  return { code: r.getResponseCode(), json: j, texto: txt };
}

/** Lineas de la orden: [{ n, estado, cant }] (estado en minusculas). Acepta las formas con y sin envoltorio. */
function wmcLineas_(j) {
  if (!j) return [];
  var o = j.order || (j.list && j.list.elements && j.list.elements.order && j.list.elements.order[0]) || j;
  var ls = o && o.orderLines && o.orderLines.orderLine;
  if (!ls) return [];
  if (!Array.isArray(ls)) ls = [ls];
  return ls.map(function (l) {
    var st = l.orderLineStatuses && l.orderLineStatuses.orderLineStatus;
    if (st && !Array.isArray(st)) st = [st];
    var s0 = (st && st[0]) || {};
    var q = (s0.statusQuantity && s0.statusQuantity.amount) || (l.orderLineQuantity && l.orderLineQuantity.amount) || '1';
    return { n: String(l.lineNumber), estado: String(s0.status || '').toLowerCase(), cant: String(q) };
  });
}

/** Cuerpo del POST /cancel para las lineas cancelables. */
function wmcCuerpo_(lineas) {
  return { orderCancellation: { orderLines: { orderLine: lineas.map(function (l) {
    return { lineNumber: l.n, orderLineStatuses: { orderLineStatus: [{ status: 'Cancelled', cancellationReason: WMC_MOTIVO, statusQuantity: { unitOfMeasurement: 'EACH', amount: l.cant } }] } };
  }) } } };
}

/** Lee la orden. Devuelve { ok, lineas, texto }. */
function wmcLeer_(po) {
  var r = wmcLlamar_('get', '/v3/orders/' + encodeURIComponent(po), null);
  if (r.code === 404) return { ok: false, texto: 'Walmart no encuentra la orden ' + po };
  if (r.code !== 200) return { ok: false, texto: 'HTTP ' + r.code + ' ' + String(r.texto).replace(/\s+/g, ' ').slice(0, 140) };
  var ls = wmcLineas_(r.json);
  if (!ls.length) return { ok: false, texto: 'La respuesta de Walmart no trae lineas' };
  return { ok: true, lineas: ls };
}

/** Cancela las lineas cancelables de la orden. Devuelve { ok, ya, texto }. */
function wmcCancelar_(po) {
  var l = wmcLeer_(po);
  if (!l.ok) return { ok: false, texto: l.texto };
  var cancelables = l.lineas.filter(function (x) { return WMC_CANCELABLES[x.estado]; });
  if (!cancelables.length) {
    var ya = l.lineas.every(function (x) { return x.estado === 'cancelled'; });
    return { ok: ya, ya: ya, texto: ya ? 'Walmart ya la tenia cancelada' : 'Sin lineas cancelables (estado: ' + l.lineas.map(function (x) { return x.estado; }).join(', ') + ')' };
  }
  var r = wmcLlamar_('post', '/v3/orders/' + encodeURIComponent(po) + '/cancel', wmcCuerpo_(cancelables));
  if (r.code !== 200) return { ok: false, texto: 'HTTP ' + r.code + ' ' + String(r.texto).replace(/\s+/g, ' ').slice(0, 160) };
  return { ok: true, texto: cancelables.length + ' linea(s) canceladas en Walmart' };
}

/* ---------------- hoja ---------------- */

function wmcFormato_(h) {
  var m = canMapaHoja_(h).mapa, c = m[normEnc_(WMC_CHECK)], n = h.getLastRow() - 1;
  // casilla de referencia CANCELADA EN WALMART: se crea al final si falta (la mueves donde quieras) y solo se le ponen casillas
  try {
    if (m[normEnc_(WMC_YA)] === undefined) { canAsegurarColumnas_(h, [WMC_YA]); m = canMapaHoja_(h).mapa; }
    var cy = m[normEnc_(WMC_YA)];
    if (cy && n >= 1) { var ry = h.getRange(2, cy, n, 1); ry.insertCheckboxes(); ry.setHorizontalAlignment('center'); }
  } catch (ey) { logWarn_(WMC_ETAPA, 'No se pudo poner la casilla ' + WMC_YA + ': ' + String(ey.message).split('\n')[0]); }
  if (!c || n < 1) return;
  var rc = h.getRange(2, c, n, 1);
  rc.insertCheckboxes(); rc.setHorizontalAlignment('center');
  var cf = m[normEnc_(WMC_FECHA)];
  if (cf) h.getRange(2, cf, n, 1).setNumberFormat('dd/mm/yyyy hh:mm');
}

function wmcAsegurar_(h) {
  canAsegurarColumnas_(h, [WMC_CHECK, WMC_ESTADO, WMC_FECHA]);
  wmcFormato_(h);
  return canMapaHoja_(h).mapa;
}

/** Filas marcadas y no canceladas: [{ fila, orden }]. */
function wmcMarcadas_(h) {
  var m = wmcAsegurar_(h), n = h.getLastRow() - 1, out = [];
  if (n < 1) return out;
  var cC = m[normEnc_(WMC_CHECK)], cE = m[normEnc_(WMC_ESTADO)], cO = canColOrden_(m);
  var ch = canColVals_(h, cC, n), es = canColVals_(h, cE, n), od = canColVals_(h, cO, n);
  for (var i = 0; i < n; i++) {
    var o = canTextoOrden_(od[i]);
    if (ch[i] === true && o && !/^CANCELADO/i.test(String(es[i] || ''))) out.push({ fila: i + 2, orden: o });
  }
  return out;
}

function wmcAnotar_(h, fila, texto) {
  var m = canMapaHoja_(h).mapa;
  h.getRange(fila, m[normEnc_(WMC_ESTADO)]).setNumberFormat('0').setValue(texto);
  if (/^CANCELADO/i.test(texto)) h.getRange(fila, m[normEnc_(WMC_FECHA)]).setValue(new Date());
}

/* ---------------- menu ---------------- */

function cancelacionesWalmartCredenciales() {
  var ui = SpreadsheetApp.getUi();
  var id = pedir_(ui, 'Client ID de Walmart', 'Client ID de la API de Marketplace Mexico (se guarda solo en las propiedades del script; nunca en una hoja ni en el Log).');
  if (!id) return;
  var sec = pedir_(ui, 'Client Secret de Walmart', 'Client Secret de esa misma credencial (se guarda solo en las propiedades del script).');
  if (!sec) return;
  props_().setProperty(WMC_PROP_ID, id);
  props_().setProperty(WMC_PROP_SECRET, sec);
  try { CacheService.getScriptCache().remove('WMC_TOKEN'); } catch (e) {}
  logInfo_(WMC_ETAPA, 'Credenciales de la API de Walmart guardadas');
  flushLog_();
  dlgInfo_('Walmart (API)', 'Credenciales guardadas.\n\nSiguiente paso: marca CANCELAR EN WALMART en una fila y usa "Probar cancelacion en Walmart (solo lee)".', 'ok');
}

function cancelacionesWalmartProbar() {
  var h = getHoja_(CAN_HOJA), filas = wmcMarcadas_(h);
  if (!filas.length) { dlgInfo_('Walmart (API)', 'No hay filas marcadas en CANCELAR EN WALMART.', 'aviso'); return; }
  var lineas = [];
  try {
    filas.slice(0, WMC_TOPE).forEach(function (f) {
      var l = wmcLeer_(f.orden);
      var t = l.ok ? 'PRUEBA: ' + l.lineas.map(function (x) { return 'linea ' + x.n + ' ' + x.estado + ' x' + x.cant; }).join(' · ') : 'PRUEBA: ' + l.texto;
      wmcAnotar_(h, f.fila, t);
      lineas.push(f.orden + ' → ' + t);
    });
  } catch (e) {
    dlgInfo_('Walmart (API)', String(e.message || e).split('\n')[0], 'error'); return;
  }
  logInfo_(WMC_ETAPA, 'Prueba de lectura en Walmart: ' + lineas.length + ' orden(es)');
  flushLog_();
  dlgInfo_('Walmart (API) · prueba, no se cancelo nada', lineas.join('\n'), 'ok');
}

function cancelacionesWalmartCancelar() {
  var ui = SpreadsheetApp.getUi();
  var h = getHoja_(CAN_HOJA), filas = wmcMarcadas_(h);
  if (!filas.length) { dlgInfo_('Walmart (API)', 'No hay filas marcadas en CANCELAR EN WALMART.', 'aviso'); return; }
  if (filas.length > WMC_TOPE) { dlgInfo_('Walmart (API)', 'Hay ' + filas.length + ' marcadas; el maximo por corrida es ' + WMC_TOPE + '. Deja marcadas solo ' + WMC_TOPE + ' y vuelve a correrlo.', 'aviso'); return; }
  var r = ui.alert('Cancelar en WALMART', 'Se van a cancelar en Walmart ' + filas.length + ' orden(es):\n\n' + filas.map(function (f) { return f.orden; }).join('\n') + '\n\nNo se deshace. ¿Cancelar?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  var ok = [], mal = [];
  try {
    filas.forEach(function (f) {
      var c = wmcCancelar_(f.orden);
      if (c.ok) { wmcAnotar_(h, f.fila, 'CANCELADO EN WALMART' + (c.ya ? ' (ya lo estaba)' : '')); ok.push(f.orden); }
      else { wmcAnotar_(h, f.fila, 'ERROR: ' + c.texto); mal.push(f.orden + ' (' + c.texto + ')'); }
    });
  } catch (e) {
    mal.push(String(e.message || e).split('\n')[0]);
  }
  if (ok.length) logOk_(WMC_ETAPA, 'Canceladas en Walmart por API: ' + ok.join(', '));
  if (mal.length) logWarn_(WMC_ETAPA, 'No se pudieron cancelar en Walmart: ' + mal.join(' | '));
  flushLog_();
  dlgInfo_('Walmart (API)', (ok.length ? 'Canceladas en Walmart: ' + ok.length + '\n' + ok.join('\n') : 'No se cancelo ninguna.') + (mal.length ? '\n\nCon problema:\n' + mal.join('\n') : ''), mal.length ? 'aviso' : 'ok');
}
