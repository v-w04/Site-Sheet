/**
 * ============================================================
 *  Cancelar en WALMART (Seller Center) + site/Odoo, con la logica de la dueña (19-nov-2026)
 * ============================================================
 *
 *  DECISION DE LA DUEÑA (19-nov, 11:16): esto REEMPLAZA la regla del 15-nov ("el codigo jamas cancela en Walmart"), solo para
 *  ventas con ORIGEN = PRECIO ERRONEO y solo en estas DOS condiciones (de ahi en fuera NADA se cancela en Walmart):
 *    1) pierde MAS de CANP_AUTO_PCT (7%): la fila entra con la casilla CANCELAR EN ODOO marcada;
 *    2) pierde de 3% a 7% y TU marcas la casilla CANCELAR EN ODOO (la leemos en la siguiente vuelta).
 *  Orden (siempre los dos lados, ambos confirmados):
 *    a) Walmart PRIMERO (la extension lo hace en Seller Center con tu sesion y VERIFICA que quedo "Canceled");
 *    b) solo cuando CANCELADA EN WALMART queda marcada, el site/Odoo la cancela (CancelacionesSite.gs la deja esperar).
 *    Si Walmart falla: NO se cancela en Odoo, la fila queda "🔴 Cancelar a mano en Walmart", NOTA ODOO empieza con "ERROR WALMART"
 *    y sale una alerta roja. Cuando tu la cancelas a mano y marcas CANCELADA EN WALMART, el site/Odoo sigue solo.
 *  Candados: solo filas recientes (CWA_MAX_DIAS), maximo CWA_MAX_CICLO por vuelta, una falla detiene la vuelta, un intento por
 *  pedido (una falla no se reintenta sola: se limpia la NOTA ODOO para reintentar), pausa total con la propiedad WALMART_CANCEL_PAUSA = 1.
 *  La extension revisa en Seller Center el estado REAL antes de cancelar (solo cancela si esta sin enviar) y despues de cancelar.
 *
 *  Acciones del Web App: wm_cancel_pendientes {clave} -> {ok, ordenes:[...]}   y   wm_cancel_resultado {clave, orden, resultado, motivo, detalle}.
 *  Prefijo cwa / CWA_.
 */

var CWA_ETAPA = 'CANCEL_WALMART';
var CWA_PROP_PAUSA = 'WALMART_CANCEL_PAUSA';   // = '1' detiene TODA cancelacion en Walmart (la extension recibe lista vacia)
var CWA_MAX_CICLO = 5;                         // maximo de ordenes por vuelta de la extension
var CWA_MAX_DIAS = 5;                          // solo ventas de los ultimos dias; mas viejas se cancelan a mano
var CWA_MOTIVOS = { SELLER_REJECTION: 'Rechazar', MIRAKL_REFUND_45: 'Error de precio' };   // los unicos motivos que la extension puede mandar

function cwaPausado_() {
  try { return props_().getProperty(CWA_PROP_PAUSA) === '1'; } catch (e) { return true; }   // ante la duda NO se cancela
}

function cwaTrue_(v) { return v === true || String(v === null || v === undefined ? '' : v).trim().toUpperCase() === 'TRUE'; }

/** true si es una venta de precio erroneo y Walmart todavia NO esta confirmado: el site/Odoo debe esperar (Walmart va primero). */
function cwaFaltaWalmart_(origen, yaWalmart) {
  return String(origen === null || origen === undefined ? '' : origen).toUpperCase().trim() === CAN_ORI_PRECIO && !cwaTrue_(yaWalmart);
}

/**
 * Pura. f = {origen, estado, nota, casilla, yaWalmart, enviar, dias}. true = esta venta se debe cancelar en Walmart AHORA.
 * Solo PRECIO ERRONEO, casilla CANCELAR EN ODOO marcada, Walmart sin confirmar, reciente, sin NO CANCELAR/OJO/ERROR WALMART/ENVIAR.
 */
function cwaElegible_(f) {
  var ori = String(f.origen === null || f.origen === undefined ? '' : f.origen).toUpperCase().trim();
  var est = String(f.estado === null || f.estado === undefined ? '' : f.estado).trim();
  var nota = String(f.nota === null || f.nota === undefined ? '' : f.nota).trim();
  if (ori !== CAN_ORI_PRECIO) return false;
  if (!cwaTrue_(f.casilla)) return false;                       // sin casilla marcada decides tu
  if (cwaTrue_(f.yaWalmart)) return false;                      // ya esta
  if (cwaTrue_(f.enviar)) return false;                         // elegiste ENVIAR
  if (/^(NO CANCELAR|OJO|ERROR WALMART)/i.test(nota)) return false;
  if (/^(OJO|NO ENCONTRADA)/i.test(est)) return false;
  if (Number(f.dias) > CWA_MAX_DIAS) return false;              // vieja: a mano
  return true;
}

/** Orden en digitos (la hoja puede traerla como numero o con apostrofo). */
function cwaOrden_(v) { return canTextoOrden_(v).replace(/^'/, '').replace(/\.0+$/, '').replace(/\D/g, ''); }

/** Lee la hoja y arma filas {i (0-based), orden, ...} con lo que hace falta. */
function cwaFilas_(h) {
  var m = canMapaHoja_(h).mapa, n = h.getLastRow() - 1, cOrd = canColOrden_(m);
  if (!cOrd || n < 1) return { filas: [], m: m, n: n, cOrd: cOrd };
  var V = function (k) { var c = m[normEnc_(k)]; return c ? canColVals_(h, c, n) : []; };
  var ord = canColVals_(h, cOrd, n), ori = V(CAN_ORIGEN), est = V(CAN_ESTADO), nota = V(CAN_NOTA), chk = V(CAN_CHECK), ya = V(WMC_YA), env = V('ENVIAR'),
      fc = V('FECHA CORREO'), fl = V('FECHA LECTURA');
  var filas = [];
  for (var i = 0; i < n; i++) {
    var o = cwaOrden_(ord[i]);
    if (!o) continue;
    filas.push({ i: i, orden: o, origen: ori[i], estado: est[i], nota: nota[i], casilla: chk[i], yaWalmart: ya[i], enviar: env[i], dias: canDiasDesde_(fc[i] || fl[i]) });
  }
  return { filas: filas, m: m, n: n, cOrd: cOrd };
}

/** Ordenes por cancelar en Walmart ahora (sin repetir, maximo CWA_MAX_CICLO). Pura sobre las filas ya leidas. */
function cwaLista_(filas) {
  var out = [], vistos = {}, bloq = {};
  (filas || []).forEach(function (f) { if (!cwaElegible_(f)) { if (/^(NO CANCELAR|OJO|ERROR WALMART)/i.test(String(f.nota || '').trim())) bloq[f.orden] = true; } });
  (filas || []).forEach(function (f) {
    if (vistos[f.orden] || bloq[f.orden] || !cwaElegible_(f)) return;
    vistos[f.orden] = true;
    if (out.length < CWA_MAX_CICLO) out.push(f.orden);
  });
  return out;
}

/**
 * Seller Center ya dice CANCELADO (lo lee la extension cada rato): se marca CANCELADA EN WALMART en las ventas de precio erroneo.
 * Es lo que Walmart dice, no una suposicion. Devuelve cuantas marco.
 */
function cwaSincronizarSeller_(h, datos) {
  var cuantas = 0;
  try {
    var c = datos || cwaFilas_(h), m = c.m, cYa = m[normEnc_(WMC_YA)];
    if (!cYa || !c.filas.length) return 0;
    var idx = scIndice_(), marcadas = {};
    c.filas.forEach(function (f) {
      if (String(f.origen || '').toUpperCase() !== CAN_ORI_PRECIO || cwaTrue_(f.yaWalmart)) return;
      var s = idx[f.orden];
      if (!s || s.norm !== 'CANCELADO') return;
      h.getRange(f.i + 2, cYa).setValue(true);
      f.yaWalmart = true; cuantas++; marcadas[f.orden] = true;
    });
    if (cuantas) logOk_(CWA_ETAPA, 'Seller Center ya las tiene canceladas: marcada CANCELADA EN WALMART en ' + cuantas + ' fila(s): ' + Object.keys(marcadas).join(', '), { ordenes: Object.keys(marcadas) });
  } catch (e) { try { logWarn_(CWA_ETAPA, 'No pude cruzar con Seller Center: ' + String(e.message || e).split('\n')[0]); } catch (x) {} }
  return cuantas;
}

/** Accion wm_cancel_pendientes: la lista de ordenes que la extension debe cancelar en Walmart (solo con la clave de la extension). */
function cwaEntregar_(p) {
  var err = csAutorizar_(p); if (err) return err;
  if (cwaPausado_()) return { ok: true, ordenes: [], nota: 'pausado' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: true, ordenes: [], nota: 'ocupado' };
  try {
    var h = getHoja_(CAN_HOJA);
    if (!h || h.getLastRow() < 2) return { ok: true, ordenes: [] };
    var c = cwaFilas_(h);
    if (c.m[normEnc_(WMC_YA)] === undefined) {   // sin la casilla CANCELADA EN WALMART no hay forma de confirmar: no se cancela nada
      try { avisoLogDia_('CWA_SIN_CASILLA', 'ERROR', CWA_ETAPA, 'Cancelaciones no tiene la columna CANCELADA EN WALMART: no se cancela nada en Walmart. Corre Formato de cancelaciones.'); flushLog_(); } catch (e0) {}
      return { ok: true, ordenes: [], nota: 'sin_casilla' };
    }
    cwaSincronizarSeller_(h, c);
    var ords = cwaLista_(c.filas);
    if (ords.length) { logInfo_(CWA_ETAPA, 'Extension: ' + ords.length + ' venta(s) por cancelar en Walmart: ' + ords.join(', ')); flushLog_(); }
    return { ok: true, ordenes: ords };
  } finally { lock.releaseLock(); }
}

/**
 * Accion wm_cancel_resultado: p = {orden, resultado, motivo, detalle}
 *  resultado: 'cancelada' (la extension la cancelo y la verifico) | 'ya_cancelada' (Seller Center ya la tenia cancelada) |
 *             'no_cancelable' (ya enviada/entregada/no esta: se avisa) | 'error' (fallo o no se pudo verificar) | 'sin_sesion' (solo se avisa).
 */
function cwaRecibirResultado_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var orden = cwaOrden_(p.orden);
  if (!orden) return { ok: false, error: 'sin_orden' };
  var res = String(p.resultado || '');
  if (['cancelada', 'ya_cancelada', 'no_cancelable', 'error', 'sin_sesion'].indexOf(res) < 0) return { ok: false, error: 'resultado_no_valido' };
  var motivoTxt = CWA_MOTIVOS[String(p.motivo || '')] || '';
  var detalle = String(p.detalle === null || p.detalle === undefined ? '' : p.detalle).replace(/[\r\n]+/g, ' ').slice(0, 200);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'ocupado' };
  try {
    var h = getHoja_(CAN_HOJA), c = cwaFilas_(h), m = c.m, cNot = m[normEnc_(CAN_NOTA)], cYa = m[normEnc_(WMC_YA)];
    var filas = c.filas.filter(function (f) { return f.orden === orden; });
    if (res === 'sin_sesion') {
      try { avisoLogDia_('CWA_SIN_SESION', 'WARN', CWA_ETAPA, 'No pude cancelar en Walmart: Seller Center sin sesion o bloqueo anti-bot. Entra a Seller Center con tu codigo 2FA. ' + detalle); flushLog_(); } catch (e0) {}
      return { ok: true };
    }
    var cuando = Utilities.formatDate(new Date(), TZ, 'dd-MMM HH:mm');
    var sinError = function (t) { return String(t || '').replace(/^ERROR WALMART[^|]*\|?\s*/i, '').trim(); };
    if (res === 'cancelada' || res === 'ya_cancelada') {
      filas.forEach(function (f) {
        if (cYa) h.getRange(f.i + 2, cYa).setValue(true);
        if (cNot) {
          var txt = res === 'cancelada' ? ('Cancelada en Walmart por la extension (' + (motivoTxt || 'sin motivo') + ') ' + cuando) : ('Walmart ya la tenia cancelada ' + cuando);
          var previa = sinError(f.nota).replace(/^(Cancelada en Walmart por la extension|Walmart ya la tenia cancelada)[^·]*·?\s*/i, '');
          h.getRange(f.i + 2, cNot).setValue(txt + (previa ? ' · ' + previa : ''));
        }
      });
      logOk_(CWA_ETAPA, 'Cancelada en Walmart: ' + orden + (res === 'ya_cancelada' ? ' (ya estaba cancelada)' : ' (' + (motivoTxt || '?') + ', verificada en Seller Center)') + '. Sigue Odoo/site.', { orden: orden, filas: filas.length, motivo: motivoTxt });
    } else {
      var que = res === 'no_cancelable' ? 'Walmart no permite cancelarla (' + (detalle || 'ya enviada o no esta en Sin enviar') + ')' : 'no se pudo cancelar en Walmart (' + (detalle || 'sin detalle') + ')';
      filas.forEach(function (f) {
        if (cNot) h.getRange(f.i + 2, cNot).setValue('ERROR WALMART: ' + que + ' ' + cuando + ' | ' + sinError(f.nota));
      });
      logErr_(CWA_ETAPA, 'NO se cancelo en Walmart la orden ' + orden + ': ' + que + '. Odoo/site NO se cancela hasta que la canceles a mano en Seller Center y marques CANCELADA EN WALMART.', { orden: orden, resultado: res });
      if (typeof extAlertaFija_ === 'function') extAlertaFija_('cwa-' + orden, 'Walmart NO se pudo cancelar la orden ' + orden + ': cancelala a mano en Seller Center y marca CANCELADA EN WALMART (Odoo espera).');
    }
    try { canQueHacerSync_(h); } catch (eQh) {}
    flushLog_();
    return { ok: true };
  } finally { lock.releaseLock(); }
}
