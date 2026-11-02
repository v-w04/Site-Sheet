/**
 * CancelacionesSite.gs - desde el 2-nov-2026 las ventas se cancelan en el SITE (Ventas General > Cancelar venta, con PIN),
 * no directo en Odoo: Odoo contesta "Estos registros estan restringidos" a la cancelacion por la sesion de tu usuario.
 * Este archivo:
 *  - pausa la cancelacion directa en Odoo (se reactiva con la propiedad CANCELAR_ODOO_DIRECTO = 1),
 *  - lista lo pendiente de cancelar para hacerlo en el site,
 *  - odooDiagnostico(): que SI puede leer/escribir tu usuario en Odoo (solo consulta permisos, no cambia nada),
 *  - siteDescubrirCancelar(): busca en la pagina del site como se llama su cancelacion (solo lee, no cancela nada).
 * Prefijo cs / CS_.
 */
var CS_ETAPA = 'CANCEL_SITE';
var CS_PROP_DIRECTO = 'CANCELAR_ODOO_DIRECTO';

/** true = la cancelacion directa en Odoo esta pausada (lo normal desde el 2-nov). */
function csDirectoPausado_() {
  try { return props_().getProperty(CS_PROP_DIRECTO) !== '1'; } catch (e) { return true; }
}

/** Ventas de la hoja Cancelaciones que siguen sin cancelar y sin marca de revision. [{orden, origen, estado}] */
function csPendientes_() {
  var h = getHoja_(CAN_HOJA);
  if (!h || h.getLastRow() < 2) return [];
  var m = canMapaHoja_(h).mapa, n = h.getLastRow() - 1, cOrd = null;
  Object.keys(m).forEach(function (k) { if (!cOrd && /^ORDEN DE COMPRA/.test(k)) cOrd = m[k]; });
  var cEst = m[normEnc_(CAN_ESTADO)];
  if (!cOrd) return [];
  var ord = h.getRange(2, cOrd, n, 1).getValues();
  var est = cEst ? h.getRange(2, cEst, n, 1).getValues() : [];
  var ori = canColVals_(h, m[normEnc_(CAN_ORIGEN)], n);
  var vistos = {}, out = [];
  for (var i = 0; i < n; i++) {
    var o = String(ord[i][0] || '').trim(), e = String((est[i] || [''])[0] || '');
    if (!o || vistos[o] || /^CANCELADO/.test(e)) continue;
    if (String(ori[i] || '').toUpperCase() === CAN_ORI_PRUEBA) continue;
    vistos[o] = true;
    out.push({ orden: o, origen: String(ori[i] || ''), estado: e });
  }
  return out;
}

/** Aviso de la corrida automatica cuando la cancelacion directa esta pausada: deja la lista en el Log. */
function csAvisarPausa_(objetivos) {
  var ords = {}, lista = [];
  (objetivos || []).forEach(function (x) { if (!ords[x.orden]) { ords[x.orden] = true; lista.push(x.orden); } });
  logInfo_(CAN_ETAPA, 'Cancelacion directa en Odoo PAUSADA (se cancela en el site): ' + lista.length + ' pendiente(s)' +
    (lista.length ? ': ' + lista.slice(0, 20).join(', ') + (lista.length > 20 ? ' ... y ' + (lista.length - 20) + ' mas' : '') : ''));
}

/** Popup cuando alguien usa un boton de cancelar directo en Odoo estando pausado. */
function csDialogoPausa_() {
  var p = [];
  try { p = csPendientes_(); } catch (e) {}
  dlgInfo_('Cancelaciones', 'La cancelacion directa en Odoo esta pausada: Odoo ya no la deja con tu usuario. Ahora se cancela en el site (Ventas General > Cancelar venta, con tu PIN).\n\n' +
    '• Pendientes en la hoja ahora: ' + p.length + '\n• Para verlos: menu Cancelaciones > 📋 Pendientes de cancelar en el site', 'aviso');
}

/** Menu: lista lo pendiente de cancelar para hacerlo en el site. */
function cancelacionesPendientesSite() {
  var p = csPendientes_();
  if (!p.length) { dlgInfo_('Pendientes de cancelar', 'No hay ventas pendientes en la hoja Cancelaciones.', 'ok'); return; }
  var ver = p.slice(0, 40).map(function (x) { return '• ' + x.orden + (x.origen ? ' (' + x.origen + ')' : '') + (x.estado ? ' · ' + x.estado : ''); }).join('\n');
  dlgInfo_('Pendientes de cancelar en el site', p.length + ' venta(s) por cancelar. En el site: Ventas General > buscar la venta > Cancelar venta (motivo, tu PIN, casilla).\n\n' + ver +
    (p.length > 40 ? '\n\n... y ' + (p.length - 40) + ' mas (estan en la hoja Cancelaciones).' : ''), 'aviso');
}

/* ---------------- diagnostico de permisos de Odoo (solo consulta) ---------------- */

var CS_MODELOS = [
  ['sale.order', 'Ventas'], ['sale.order.line', 'Lineas de venta'], ['stock.picking', 'Entregas (PICK/PACK/OUT)'],
  ['stock.move', 'Movimientos'], ['stock.quant', 'Existencias'], ['product.product', 'Productos (variantes)'],
  ['product.template', 'Productos (plantillas)'], ['res.partner', 'Clientes y contactos'],
  ['x_cancelacion_log', 'Cuadro Cancelar venta'], ['sale.order.cancel', 'Asistente de cancelacion']
];

/** SI / NO / N/D para una operacion (read, write, create, unlink) sobre un modelo. No cambia nada en Odoo. */
function csPermiso_(modelo, op) {
  var r;
  try { r = odooExecute_(modelo, 'check_access_rights', [op], { raise_exception: false }); return r === true ? 'SI' : (r === false ? 'NO' : 'N/D'); }
  catch (e) {
    try { r = odooExecute_(modelo, 'has_access', [op], {}); return r === true ? 'SI' : (r === false ? 'NO' : 'N/D'); } catch (e2) { return 'N/D'; }
  }
}

function csContar_(modelo) {
  try { var n = odooExecute_(modelo, 'search_count', [[]]); return typeof n === 'number' ? n : null; } catch (e) { return null; }
}

/** Menu: que puede hacer tu usuario en Odoo (permisos por modelo + cuantos registros ve). Solo consulta. */
function odooDiagnostico() {
  if (odooApagado_()) { dlgInfo_('Diagnostico de Odoo', 'Odoo esta apagado: no hay sesion. Guarda el correo y contraseña de Odoo en el menu Configuracion.', 'aviso'); return; }
  var info = {}, version = '';
  try { info = JSON.parse(PropertiesService.getScriptProperties().getProperty('ODOO_SESION_INFO') || '{}'); } catch (e) {}
  try { var ses = odsSesion_(); if (ses) { var v = odsPost_('/web/webclient/version_info', {}, ses); version = v.j && v.j.result ? String(v.j.result.server_version || '') : ''; } } catch (e) {}
  var lineas = [], filas = [];
  CS_MODELOS.forEach(function (mo) {
    var leer = csPermiso_(mo[0], 'read'), esc = csPermiso_(mo[0], 'write'), cre = csPermiso_(mo[0], 'create'), bor = csPermiso_(mo[0], 'unlink');
    var n = leer === 'SI' ? csContar_(mo[0]) : null;
    var t = mo[0] + ' (' + mo[1] + '): leer ' + leer + ' · escribir ' + esc + ' · crear ' + cre + ' · borrar ' + bor + (n !== null ? ' · ves ' + n + ' registros' : '');
    lineas.push('• ' + t); filas.push(t);
  });
  logInfo_(CS_ETAPA, 'Diagnostico de Odoo: usuario ' + (info.login || '?') + (version ? ', Odoo ' + version : ''), { permisos: filas });
  flushLog_();
  dlgInfo_('Diagnostico de Odoo', 'Usuario: ' + (info.nombre || '') + ' (' + (info.login || '?') + ')' + (version ? '\nOdoo ' + version : '') + '\n\n' + lineas.join('\n') +
    '\n\nOjo: SI/NO es el permiso general del modelo; ademas Odoo puede restringir registros concretos con reglas. N/D = el modelo no existe o no se pudo consultar.', 'ok');
}

/* ---------------- buscar en el site como se cancela una venta (solo lee) ---------------- */

function csFragmentos_(texto, origen, salida) {
  var re = /cancel/gi, m, ult = -1000;
  while ((m = re.exec(texto)) !== null && salida.frag.length < 14) {
    if (m.index - ult < 160) continue;
    var tr = texto.substring(Math.max(0, m.index - 120), Math.min(texto.length, m.index + 220)).replace(/\s+/g, ' ');
    if (/fetch\s*\(|\/api\/|url\s*:|method\s*:|POST|endpoint|JSON\.stringify|XMLHttp|\$\.(ajax|post)/i.test(tr)) { salida.frag.push({ en: origen, t: tr }); ult = m.index; }
  }
  var rr = /['"`](\/[A-Za-z0-9_\-\/\.\{\}\$:?=&]*cancel[A-Za-z0-9_\-\/\.\{\}\$:?=&]*)['"`]/gi, k;
  while ((k = rr.exec(texto)) !== null) { if (salida.rutas.indexOf(k[1]) < 0 && salida.rutas.length < 20) salida.rutas.push(k[1]); }
}

/** Menu: busca en la pagina Ventas General (y sus scripts) las rutas y datos de "Cancelar venta". No cancela nada. */
function siteDescubrirCancelar() {
  var salida = { rutas: [], frag: [], revisados: [] };
  try {
    var pg = fetchSitio_('/ventas-general', { crudo: true, silencioso: true }) || {};
    var html = String(pg.texto || '');
    salida.revisados.push('/ventas-general (HTTP ' + pg.codigo + ', ' + html.length + ' bytes)');
    csFragmentos_(html, '/ventas-general', salida);
    var re = /<script[^>]+src=["']([^"']+)["']/gi, m, n = 0;
    while ((m = re.exec(html)) !== null && n < 12) {
      var src = m[1];
      if (/^https?:/i.test(src) && src.indexOf(SITE) !== 0) continue;
      if (src.indexOf(SITE) === 0) src = src.substring(SITE.length);
      if (src.charAt(0) !== '/') src = '/' + src;
      n++;
      try { var js = fetchSitio_(src, { crudo: true, silencioso: true }) || {}; var tx = String(js.texto || ''); salida.revisados.push(src + ' (' + tx.length + ' bytes)'); csFragmentos_(tx, src, salida); } catch (e) {}
    }
  } catch (e) {
    logErr_(CS_ETAPA, 'No pude leer el site para buscar la cancelacion: ' + String(e.message || e).split('\n')[0]); flushLog_();
    dlgInfo_('Cancelacion del site', 'No pude leer la pagina del site: ' + String(e.message || e).split('\n')[0], 'error'); return;
  }
  logInfo_(CS_ETAPA, 'Cancelacion en el site: ' + salida.rutas.length + ' ruta(s) y ' + salida.frag.length + ' fragmento(s) encontrados', salida);
  flushLog_();
  dlgInfo_('Cancelacion del site', 'Revise ' + salida.revisados.length + ' archivo(s) del site.\n\n• Rutas con "cancel": ' + (salida.rutas.length ? salida.rutas.join(', ') : 'ninguna') +
    '\n• Fragmentos guardados en el Log: ' + salida.frag.length + '\n\nNo se cancelo nada.', salida.rutas.length || salida.frag.length ? 'ok' : 'aviso');
}
