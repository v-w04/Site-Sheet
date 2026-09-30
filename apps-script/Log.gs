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
