/**
 * CancelacionesSite.gs - desde el 2-nov-2026 las ventas se cancelan en el SITE (Ventas General > Cancelar venta, con PIN),
 * no directo en Odoo: Odoo contesta "Estos registros estan restringidos" a la cancelacion por la sesion de tu usuario.
 * Este archivo:
 *  - pausa la cancelacion directa en Odoo (se reactiva con la propiedad CANCELAR_ODOO_DIRECTO = 1),
 *  - lista lo pendiente de cancelar para hacerlo en el site,
 *  - odooDiagnostico(): que SI puede leer/escribir tu usuario en Odoo (solo consulta permisos, no cambia nada),
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
  var cEst = m[normEnc_(CAN_ESTADO)], cChk = m[normEnc_(CAN_CHECK)];
  if (!cOrd) return [];
  var ord = h.getRange(2, cOrd, n, 1).getValues();
  var est = cEst ? h.getRange(2, cEst, n, 1).getValues() : [];
  var chk = cChk ? h.getRange(2, cChk, n, 1).getValues() : null;
  var ori = canColVals_(h, m[normEnc_(CAN_ORIGEN)], n);
  var vistos = {}, out = [];
  for (var i = 0; i < n; i++) {
    var o = String(ord[i][0] || '').trim(), e = String((est[i] || [''])[0] || '');
    if (!o || vistos[o] || /^CANCELADO/.test(e)) continue;
    if (!chk || chk[i][0] !== true) continue;     // sin casilla marcada no esta pendiente: espera la decision de la persona
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
  dlgInfo_('Cancelaciones', 'Cancelar directo en Odoo está pausado: se cancela en el site (Ventas General > Cancelar venta, con tu PIN).\n\n' +
    'Pendientes: ' + p.length + ' (📋 Pendientes de cancelar en el site)', 'aviso');
}

/** Menu: lista lo pendiente de cancelar para hacerlo en el site. */
function cancelacionesPendientesSite() {
  var p = csPendientes_();
  if (!p.length) { dlgInfo_('Pendientes de cancelar', 'Ninguna pendiente.', 'ok'); return; }
  var ver = p.slice(0, 40).map(function (x) { return '• ' + x.orden + (x.origen ? ' (' + x.origen + ')' : '') + (x.estado ? ' · ' + x.estado : ''); }).join('\n');
  dlgInfo_('Pendientes de cancelar en el site', p.length + ' por cancelar (site: Ventas General > Cancelar venta).\n\n' + ver +
    (p.length > 40 ? '\n... y ' + (p.length - 40) + ' más en la hoja Cancelaciones.' : ''), 'aviso');
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
  if (odooApagado_()) { dlgInfo_('Diagnostico de Odoo', 'Sin sesión de Odoo: guarda correo y contraseña en Configuración.', 'aviso'); return; }
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
    '\n\nSI/NO = permiso general (Odoo puede limitar registros). N/D = no se pudo consultar.', 'ok');
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

/* ---------------- cancelar en el site desde la extension de Chrome ---------------- */
// La extension (con Chrome y una pestaña del site abiertos) pide aqui lo pendiente, cancela en el site con el
// navegador (su sesion) y avisa el resultado. El PIN sale de ODOO_CANCELA_PIN: no se escribe en ningun lado.

var CS_PROP_INTENTOS = 'CS_INTENTOS';   // {orden: 'yyyy-MM-dd|n'}: maximo 2 entregas por pedido y dia
var CS_PROP_PINMALO  = 'CS_PIN_MALO';   // PIN que el site rechazo: no se vuelve a mandar ese mismo PIN
var CS_MAX_CICLO     = 10;

/** Misma verificacion de clave que la cookie de Odoo (con bloqueo por intentos). Devuelve null si pasa. */
function csAutorizar_(p) {
  var cache = CacheService.getScriptCache();
  if (Number(cache.get('EXT_FALLOS') || 0) >= EXT_MAX_FALLOS) return { ok: false, error: 'bloqueado_espera_10_min' };
  var clave = props_().getProperty(EXT_PROP_CLAVE);
  if (!clave) return { ok: false, error: 'sin_clave_genera_en_el_menu' };
  if (!igualesSeguro_(String(p.clave || ''), clave)) {
    var n = Number(cache.get('EXT_FALLOS') || 0) + 1;
    cache.put('EXT_FALLOS', String(n), EXT_BLOQUEO_SEG);
    logWarn_(CS_ETAPA, 'Clave incorrecta al pedir cancelaciones (intento ' + n + ' de ' + EXT_MAX_FALLOS + ')'); flushLog_();
    return { ok: false, error: 'no_autorizado' };
  }
  cache.remove('EXT_FALLOS');
  return null;
}

/** Pendientes que la extension puede cancelar ahora: sin ERROR/OJO/PRUEBA y con menos de 2 entregas hoy. */
function csParaExtension_() {
  var h = getHoja_(CAN_HOJA);
  if (!h || h.getLastRow() < 2) return [];
  var m = canMapaHoja_(h).mapa, n = h.getLastRow() - 1, cOrd = null;
  Object.keys(m).forEach(function (k) { if (!cOrd && /^ORDEN DE COMPRA/.test(k)) cOrd = m[k]; });
  var cEst = m[normEnc_(CAN_ESTADO)], cNot = m[normEnc_(CAN_NOTA)], cChk = m[normEnc_(CAN_CHECK)];
  if (!cOrd || !cEst) return [];
  if (!cChk) { try { avisoLogDia_('CS_SIN_CASILLA', 'ERROR', CS_ETAPA, 'Cancelaciones no tiene la columna CANCELAR EN ODOO: no se cancela nada. Corre Formato de cancelaciones.'); flushLog_(); } catch (e0) {} return []; }
  var ord = h.getRange(2, cOrd, n, 1).getValues(), est = h.getRange(2, cEst, n, 1).getValues();
  var chk = h.getRange(2, cChk, n, 1).getValues();
  var not = cNot ? h.getRange(2, cNot, n, 1).getValues() : [];
  var ori = canColVals_(h, m[normEnc_(CAN_ORIGEN)], n);
  var bloq = {};
  for (var b = 0; b < n; b++) {
    var ob = String(ord[b][0] || '').trim(), eb = String(est[b][0] || ''), tb = String((not[b] || [''])[0] || '');
    if (ob && (/^(OJO|ERROR|NO ENCONTRADA)/.test(eb) || /^(NO CANCELAR|ERROR|OJO)/i.test(tb))) bloq[ob] = true;
    if (ob && String(ori[b] || '').toUpperCase() === CAN_ORI_PRUEBA) bloq[ob] = true;
  }
  var inte = {}; try { inte = JSON.parse(props_().getProperty(CS_PROP_INTENTOS) || '{}'); } catch (e) {}
  var hoy = hoy_(), out = [], vistos = {};
  for (var i = 0; i < n; i++) {
    var o = String(ord[i][0] || '').trim(), e = String(est[i][0] || '');
    if (!o || vistos[o] || bloq[o] || /^CANCELADO/.test(e)) continue;
    if (chk[i][0] !== true) continue;             // casilla CANCELAR EN ODOO sin marcar: espera la decision de la persona
    vistos[o] = true;
    var pa = String(inte[o] || '').split('|');
    if (pa[0] === hoy && Number(pa[1] || 0) >= 2) continue;
    out.push(o);
    if (out.length >= CS_MAX_CICLO) break;
  }
  return out;
}

/**
 * Una sola vez (Script Property CAN_CASILLAS_V2): la casilla CANCELAR EN ODOO ahora MANDA (la extension solo cancela filas marcadas).
 * Para que no se detenga nada de lo que ya estaba en camino: se marcan las ya canceladas, las que vienen de correo, sobreventa
 * y manuales, y las de precio erroneo que pierden mas de 5% (por la nota). Las de precio erroneo de 5% o menos quedan como estan.
 */
function canCasillasV2_() {
  if (props_().getProperty('CAN_CASILLAS_V2') === '1') return 0;
  var h = getHoja_(CAN_HOJA);
  if (!h || h.getLastRow() < 2) { props_().setProperty('CAN_CASILLAS_V2', '1'); return 0; }
  var m = canMapaHoja_(h).mapa, n = h.getLastRow() - 1, cOrd = null;
  Object.keys(m).forEach(function (k) { if (!cOrd && /^ORDEN DE COMPRA/.test(k)) cOrd = m[k]; });
  var cEst = m[normEnc_(CAN_ESTADO)], cNot = m[normEnc_(CAN_NOTA)], cChk = m[normEnc_(CAN_CHECK)];
  if (!cOrd || !cChk) return 0;
  var ord = h.getRange(2, cOrd, n, 1).getValues(), chk = h.getRange(2, cChk, n, 1).getValues();
  var est = cEst ? h.getRange(2, cEst, n, 1).getValues() : [], not = cNot ? h.getRange(2, cNot, n, 1).getValues() : [];
  var ori = canColVals_(h, m[normEnc_(CAN_ORIGEN)], n);
  var cambios = 0;
  for (var i = 0; i < n; i++) {
    if (!String(ord[i][0] || '').trim() || chk[i][0] === true) continue;
    var e = String((est[i] || [''])[0] || ''), o = String(ori[i] || '').toUpperCase(), nt = String((not[i] || [''])[0] || '');
    var marcar = false;
    if (/^CANCELADO/.test(e)) marcar = true;
    else if (o === CAN_ORI_PRUEBA) marcar = false;
    else if (o === CAN_ORI_PRECIO) { var mm = /\(([\d.]+)% abajo\)/.exec(nt); marcar = !!mm && Number(mm[1]) > 5; }
    else marcar = true;     // correo, sobreventa, manual o sin origen: ya iban a cancelarse
    if (marcar) { chk[i][0] = true; cambios++; }
  }
  if (cambios) h.getRange(2, cChk, n, 1).setValues(chk);
  props_().setProperty('CAN_CASILLAS_V2', '1');
  logInfo_(CS_ETAPA, 'Casillas CANCELAR EN ODOO: ' + cambios + ' fila(s) marcadas (canceladas y las que se cancelan solas). Desde ahora la extension solo cancela filas marcadas.');
  flushLog_();
  return cambios;
}

/** Accion cancel_pendientes: entrega el PIN y la lista (solo con la clave de la extension). */
function csEntregarPendientes_(p) {
  var err = csAutorizar_(p); if (err) return err;
  if (!csDirectoPausado_()) return { ok: true, ordenes: [], nota: 'cancelacion_directa_activa' };
  var pin = props_().getProperty(CAN_PROP_PIN);
  if (!pin) { avisoLogDia_('CS_SIN_PIN', 'WARN', CS_ETAPA, 'Hay cancelaciones por hacer en el site pero falta guardar el PIN (menu Pedidos y casos > Cancelaciones > Configurar > Guardar PIN)'); flushLog_(); return { ok: false, error: 'sin_pin' }; }
  if (props_().getProperty(CS_PROP_PINMALO) === pin) return { ok: false, error: 'pin_rechazado_guarda_otro' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: true, ordenes: [], nota: 'ocupado' };
  try {
    try { canCasillasV2_(); } catch (e0) { logWarn_(CS_ETAPA, 'No pude marcar las casillas de Cancelaciones: ' + String(e0.message || e0).split('\n')[0]); }
    var ords = csParaExtension_();
    if (!ords.length) return { ok: true, ordenes: [] };
    var inte = {}; try { inte = JSON.parse(props_().getProperty(CS_PROP_INTENTOS) || '{}'); } catch (e) {}
    var hoy = hoy_(), nuevo = {};
    Object.keys(inte).forEach(function (k) { if (String(inte[k]).split('|')[0] === hoy) nuevo[k] = inte[k]; });
    ords.forEach(function (o) { var pa = String(nuevo[o] || '').split('|'); nuevo[o] = hoy + '|' + ((pa[0] === hoy ? Number(pa[1] || 0) : 0) + 1); });
    props_().setProperty(CS_PROP_INTENTOS, JSON.stringify(nuevo));
    logInfo_(CS_ETAPA, 'Extension: ' + ords.length + ' venta(s) por cancelar en el site: ' + ords.join(', ')); flushLog_();
    return { ok: true, ordenes: ords, pin: pin };
  } finally { lock.releaseLock(); }
}

/** Accion cancel_resultado: la extension avisa lo que paso con una venta. p = {orden, ok, razon, error, http, noEncontrada} */
function csRecibirResultado_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var orden = String(p.orden || '').replace(/[^0-9A-Za-z-]/g, '');
  if (!orden) return { ok: false, error: 'sin_orden' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'ocupado' };
  try {
    var persona = props_().getProperty(CAN_PROP_PERSONA) || CAN_PERSONA_DEFECTO;
    var h = getHoja_(CAN_HOJA), m = canMapaHoja_(h).mapa, n = Math.max(h.getLastRow() - 1, 0), cOrd = null;
    Object.keys(m).forEach(function (k) { if (!cOrd && /^ORDEN DE COMPRA/.test(k)) cOrd = m[k]; });
    var cEst = m[normEnc_(CAN_ESTADO)], cNot = m[normEnc_(CAN_NOTA)], cPor = m[normEnc_(CAN_POR)], cFec = m[normEnc_(CAN_FECHA_ODOO)], cChk = m[normEnc_(CAN_CHECK)];
    var filas = [];
    if (cOrd && n) { var ov = h.getRange(2, cOrd, n, 1).getValues(); for (var i = 0; i < n; i++) if (String(ov[i][0] || '').trim() === orden) filas.push(i + 2); }
    var avisos = [p.aviso, p.avisoCanal].filter(function (x) { return x && !/sigue\s+activa/i.test(String(x)); }).join(' | ').slice(0, 400);   // el aviso generico del site "sigue ACTIVA en Walmart" no aplica: la cancelacion la pide Walmart y se hace en el site
    var ya = !p.ok && /ya\s+(esta\s+)?cancelad/i.test(String(p.error || ''));
    function poner(f, est, nota) {
      if (cEst) h.getRange(f, cEst).setValue(est);
      if (cNot) h.getRange(f, cNot).setValue(nota);
    }
    if (p.ok || ya) {
      filas.forEach(function (f) {
        poner(f, 'CANCELADO EN SITE', ya ? 'El site ya la tenia cancelada' : ('Cancelada en el site por la extension' + (avisos ? ' · ' + avisos : '')));
        if (cPor) h.getRange(f, cPor).setValue(persona);
        if (cFec) h.getRange(f, cFec).setValue(ahora_());
        if (cChk) h.getRange(f, cChk).setValue(true);     // cancelada: casilla CANCELAR EN ODOO marcada
      });
      if (avisos) logWarn_(CS_ETAPA, 'Cancelada en el site: ' + orden + ' · AVISO: ' + avisos, { orden: orden, filas: filas.length });
      else logOk_(CS_ETAPA, 'Cancelada en el site: ' + orden + (ya ? ' (ya estaba cancelada)' : ''), { orden: orden, filas: filas.length });
    } else if (p.razon === 'pin_malo') {
      props_().setProperty(CS_PROP_PINMALO, props_().getProperty(CAN_PROP_PIN) || '');
      logErr_(CS_ETAPA, 'El site rechazo el PIN guardado: se detienen las cancelaciones. Guarda el PIN correcto (menu Pedidos y casos > Cancelaciones > Configurar > Guardar PIN). Venta: ' + orden);
    } else if (p.noEncontrada) {
      filas.forEach(function (f) { if (cNot) h.getRange(f, cNot).setValue('No esta en el site (Ventas General); se reintenta'); });
      logWarn_(CS_ETAPA, 'No encontre la venta en el site: ' + orden);
    } else {
      var txt = String(p.error || p.razon || ('HTTP ' + (p.http || '?'))).slice(0, 200);
      filas.forEach(function (f) { poner(f, 'ERROR: no se cancelo en el site', txt); });
      logWarn_(CS_ETAPA, 'El site no cancelo ' + orden + ': ' + txt, { orden: orden, http: p.http, razon: p.razon });
    }
    flushLog_();
    return { ok: true };
  } finally { lock.releaseLock(); }
}
