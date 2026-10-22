/**
 * ============================================================
 *  Log — buffer en memoria, una sola escritura al final
 * ============================================================
 *
 * Escribir renglon por renglon en la hoja es lentisimo: cada
 * appendRow es una ida y vuelta al servidor. Se acumulan en
 * memoria y se vuelcan de un golpe con flushLog_().
 *
 * Toda funcion que loguee tiene que llamar flushLog_() en su
 * finally, o el log se pierde cuando truena algo.
 */

var LOG_HEADERS = ['Hora', 'Nivel', 'Etapa', 'Mensaje', 'Detalles (JSON)'];
var LOG_BUFFER = [];

function logRow_(nivel, etapa, mensaje, detalles) {
  LOG_BUFFER.push([
    ahora_(), nivel, etapa || '', String(mensaje || ''),
    detalles ? safeJson_(detalles) : ''
  ]);
  console.log('[' + nivel + '] ' + etapa + ' - ' + mensaje);
}

function logStart_ (e, m, d) { logRow_('START',  e, m, d); }
function logFinish_(e, m, d) { logRow_('FINISH', e, m, d); }
function logInfo_  (e, m, d) { logRow_('INFO',   e, m, d); }
function logOk_    (e, m, d) { logRow_('OK',     e, m, d); }
function logWarn_  (e, m, d) { logRow_('WARN',   e, m, d); }

/**
 * Latido: para corridas que salen bien cada 15 min (Stock, Walmart). Solo deja
 * 1 fila por hora (la corrida cuyo minuto es < 15); los fallos se loguean
 * siempre con logErr_/logWarn_, esto solo calla el "todo bien" repetido.
 */
function logLatido_(e, m, d) {
  if (new Date().getMinutes() < 15) logRow_('FINISH', e, m, d);
}
function logErr_   (e, m, d) { logRow_('ERROR',  e, m, d); }

function flushLog_() {
  if (!LOG_BUFFER.length) return;

  // Dos corridas que escriben al mismo tiempo (inventario y catálogo, por
  // ejemplo) leían el mismo getLastRow() y una pisaba las líneas de la otra.
  // El DocumentLock solo lo usa el Log, así que no frena a nadie más.
  var candado = null;
  try {
    candado = LockService.getDocumentLock();
    if (candado && !candado.tryLock(10000)) candado = null;
  } catch (e) { candado = null; }

  try {
    var sh = getHoja_(HOJA.LOG);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
    }
    sh.getRange(sh.getLastRow() + 1, 1, LOG_BUFFER.length, LOG_HEADERS.length)
      .setValues(LOG_BUFFER);

    var total = sh.getLastRow() - 1;
    if (total > MAX_FILAS_LOG) sh.deleteRows(2, total - MAX_FILAS_LOG);
  } catch (e) {
    console.error('No se pudo escribir el log: ' + e.message);
  } finally {
    if (candado) { try { candado.releaseLock(); } catch (e) {} }
  }
  LOG_BUFFER = [];
}

function safeJson_(o) {
  try {
    return JSON.stringify(o, function (_, v) { return v === undefined ? null : v; });
  } catch (e) {
    return String(o);
  }
}

function limpiarLog_() {
  var sh = getSpreadsheet_().getSheetByName(HOJA.LOG);
  if (!sh) return;
  var ultima = sh.getLastRow();
  if (ultima > 1) sh.getRange(2, 1, ultima - 1, LOG_HEADERS.length).clear();
}

/* ================================================================== */
/*  Una vez al dia por clave (UN solo helper para todo el libro)       */
/* ================================================================== */

/**
 * Una Script Property por clave: UNAVEZ_<clave> = yyyy-MM-dd. Antes cada modulo
 * guardaba UNA marca para todas sus claves y se pisaban (avisos cada hora).
 * Las marcas de dias pasados se borran solas una vez al dia.
 */
var UNAVEZ_PREF = 'UNAVEZ_';

/** Llave corta y estable para la clave (las largas se recortan con un resumen). */
function unaVezLlave_(clave) {
  var c = String(clave === null || clave === undefined ? '' : clave).replace(/\s+/g, ' ').trim();
  if (c.length > 60) {
    var dg = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, c, Utilities.Charset.UTF_8);
    c = c.substring(0, 40) + '#' + Utilities.base64EncodeWebSafe(dg).substring(0, 10);
  }
  return UNAVEZ_PREF + c;
}

/** Corre fn solo la primera vez del dia para esa clave. Devuelve true si corrio. */
function unaVezAlDia_(clave, fn) {
  var p = props_(), k = unaVezLlave_(clave), hoy = hoy_();
  try { if (p.getProperty(k) === hoy) return false; } catch (e) {}
  if (fn) fn();
  try { p.setProperty(k, hoy); } catch (e) {}
  unaVezLimpiar_(p, hoy);
  return true;
}

/** Olvida las marcas que empiezan con `prefijo` (p. ej. al llegar una tanda nueva). */
function unaVezOlvidar_(prefijo) {
  try {
    var p = props_(), base = UNAVEZ_PREF + String(prefijo || ''), todas = p.getProperties();
    Object.keys(todas).forEach(function (k) { if (k.indexOf(base) === 0) p.deleteProperty(k); });
  } catch (e) {}
}

/** Borra las marcas de otros dias (una vez al dia), para que no se acumulen. */
function unaVezLimpiar_(p, hoy) {
  try {
    var kl = UNAVEZ_PREF + '_LIMPIO';
    if (p.getProperty(kl) === hoy) return;
    var todas = p.getProperties();
    Object.keys(todas).forEach(function (k) {
      if (k.indexOf(UNAVEZ_PREF) === 0 && k !== kl && todas[k] !== hoy) p.deleteProperty(k);
    });
    p.setProperty(kl, hoy);
  } catch (e) {}
}

/** Una fila en el Log por dia y por clave (nivel: INFO, WARN, ERROR...). */
function avisoDia_(clave, nivel, etapa, mensaje, detalles) {
  return unaVezAlDia_(clave, function () { logRow_(nivel, etapa, mensaje, detalles); });
}

/** Aviso en pantalla si hay UI; sin UI (trigger, web app) solo queda en el registro de ejecucion. */
function aviso_(titulo, msg) {
  Logger.log(titulo + '\n' + msg);
  try { var ui = SpreadsheetApp.getUi(); ui.alert(titulo, String(msg).slice(0, 4000), ui.ButtonSet.OK); }
  catch (e) {}
}
