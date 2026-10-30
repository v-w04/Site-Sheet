/**
 * ============================================================
 *  CVA Catalogo — lo que CVA tiene hoy (clave, precio, stock)
 * ============================================================
 *
 * Copia, solo de lectura, la hoja SYNC_CVA del libro "CVA 5.0" (la que ese
 * proyecto mantiene al dia contra la API de CVA). Sirve para cotizar lo que
 * NO esta en el stock de Odoo pero SI en CVA: da la clave interna de CVA, el
 * precio del momento y cuantas piezas hay.
 *
 * - Nunca escribe en CVA 5.0: solo lo abre y lo lee.
 * - Columnas por ENCABEZADO (colsDe_), no por posicion.
 * - Solo baja filas con stock > 0 (sucursal + CEDIS): lo demas no se puede pedir.
 * - Se revisa cada hora dentro de killersProgramado; la hoja solo se reescribe
 *   si CVA cambio algo (huella).
 * - Si la cuenta que corre los triggers no tiene acceso a CVA 5.0, sale un
 *   ERROR claro en el Log (una vez al dia) y la hoja se queda como estaba.
 *
 * Precio CVA = el que manda la API de CVA (costo para nosotros), NO precio de
 * venta. Stock SUC = sucursal, CEDIS = centro de distribucion.
 */

var CVA_LIBRO_ID     = '1X_Tsi3m9dboLxxZksozRHsBGpwO1BUuHFLvkoRbgSY4';  // libro "CVA 5.0"
var CVA_HOJA_FUENTE  = 'SYNC_CVA';
var CVA_HOJA         = 'CVA Catalogo';
var CVA_PROP_HUELLA  = 'CVA_CATALOGO_HUELLA';
var CVA_VERSION      = '1';

var CVA_REQ = ['clave', 'descripcion', 'marca', 'grupo', 'precio', 'stock_suc', 'stock_cedis'];
var CVA_OPC = ['moneda', 'en_transito', 'garantia', 'promo_precio', 'ts'];

var CVA_ENCABEZADOS = ['CLAVE CVA', 'DESCRIPCION', 'MARCA', 'GRUPO', 'PRECIO CVA', 'MONEDA',
                       'STOCK SUC', 'STOCK CEDIS', 'STOCK TOTAL', 'EN TRANSITO', 'GARANTIA',
                       'PRECIO PROMO', 'ACTUALIZADO CVA', 'ACTUALIZADO'];

/** Menu: baja el catalogo de CVA ahora y avisa. */
function cvaCatalogoBajar() {
  var r = cvaCatalogoActualizar_(true);
  var msg = r.error ? 'No se pudo: ' + r.error
          : r.filas + ' productos con stock en CVA, en la hoja "' + CVA_HOJA + '".';
  try { alertLog_(SpreadsheetApp.getUi(), 'CVA Catalogo', msg, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { Logger.log(msg); }
  return msg;
}

/** Corrida de cada hora (la llama killersProgramado). */
function cvaCatalogoProgramado_() {
  cvaCatalogoActualizar_(false);
}

function cvaCatalogoActualizar_(forzar) {
  var props = PropertiesService.getScriptProperties();
  var fuente;
  try {
    var libro = SpreadsheetApp.openById(CVA_LIBRO_ID);
    fuente = libro.getSheetByName(CVA_HOJA_FUENTE);
    if (!fuente) throw new Error('El libro CVA 5.0 no tiene la hoja ' + CVA_HOJA_FUENTE);
  } catch (e) {
    unaVezAlDia_('cva:acceso', function () {
      logErr_('CVA', 'No se pudo abrir CVA 5.0 / ' + CVA_HOJA_FUENTE +
                     '. Revisa que la cuenta de los triggers tenga acceso al libro.',
              { error: String(e.message).substring(0, 300) });
    });
    flushLog_();
    return { error: e.message };
  }

  var nF = fuente.getLastRow(), nC = fuente.getLastColumn();
  if (nF < 2) {
    unaVezAlDia_('cva:vacia', function () { logWarn_('CVA', CVA_HOJA_FUENTE + ' esta vacia; no se toca la hoja ' + CVA_HOJA); });
    flushLog_();
    return { error: 'fuente vacia' };
  }
  var vals = fuente.getRange(1, 1, nF, nC).getValues();
  var c = colsDe_(vals[0], CVA_REQ, CVA_HOJA_FUENTE, CVA_OPC);

  var num = function (v) { var n = Number(v); return isNaN(n) ? 0 : n; };
  var get = function (r, k) { return c[k] >= 0 ? r[c[k]] : ''; };
  var salida = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    var clave = String(get(r, 'clave') || '').trim();
    if (!clave) continue;
    var suc = num(get(r, 'stock_suc')), ced = num(get(r, 'stock_cedis'));
    if (suc + ced <= 0) continue;
    var ts = get(r, 'ts');
    salida.push([clave, get(r, 'descripcion'), get(r, 'marca'), get(r, 'grupo'),
                 num(get(r, 'precio')), get(r, 'moneda'), suc, ced, suc + ced,
                 num(get(r, 'en_transito')), get(r, 'garantia'), get(r, 'promo_precio'),
                 ts instanceof Date ? Utilities.formatDate(ts, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : String(ts || '')]);
  }
  if (!salida.length) {
    unaVezAlDia_('cva:sinstock', function () { logWarn_('CVA', 'CVA 5.0 no trae productos con stock; no se toca la hoja ' + CVA_HOJA); });
    flushLog_();
    return { error: 'sin productos con stock' };
  }
  salida.sort(function (a, b) {
    var g = String(a[3]).localeCompare(String(b[3]));
    return g || (a[4] - b[4]);
  });

  var huella = sha256_(CVA_VERSION + JSON.stringify(salida));
  var hoja = SpreadsheetApp.getActive().getSheetByName(CVA_HOJA);
  var hayHoja = hoja && hoja.getLastRow() > 1;
  if (!forzar && hayHoja && huella === props.getProperty(CVA_PROP_HUELLA)) {
    unaVezAlDia_('cva:igual', function () {
      logInfo_('CVA', 'Sin cambios (' + salida.length + ' productos con stock). Se revisa cada hora.');
    });
    flushLog_();
    return { filas: salida.length };
  }

  // Guarda: lista parcial contra una hoja llena = casi seguro la fuente a medias.
  if (!forzar && guardaParcial_('CVA', CVA_HOJA, salida.length, escrFilasHoja_(CVA_HOJA))) {
    flushLog_();
    return { error: 'lista parcial' };
  }

  var sello = ahora_();
  var filas = [CVA_ENCABEZADOS];
  salida.forEach(function (f) { filas.push(f.concat([sello])); });

  escribirTabla_(CVA_HOJA, filas);
  try { cvaFormato_(filas.length - 1); } catch (e) { console.log('formato CVA: ' + e.message); }
  props.setProperty(CVA_PROP_HUELLA, huella);

  logOk_('CVA', 'CVA Catalogo actualizado: ' + salida.length + ' productos con stock');
  flushLog_();
  return { filas: salida.length };
}

/** Mismo formato que las demas hojas del site: encabezado azul, filtro, congelado, anchos. */
function cvaFormato_(nFilas) {
  var h = SpreadsheetApp.getActive().getSheetByName(CVA_HOJA);
  if (!h || nFilas < 1) return;
  // Columnas del script POR ENCABEZADO: las tuyas (en medio o a la derecha) no se tocan.
  var m = escrMapaHoja_(h, CVA_ENCABEZADOS);
  if (!m.pos.length) return;

  m.tramos.forEach(function (tr) {
    var an = tr.fin - tr.ini + 1;
    h.getRange(1, tr.ini, 1, an).setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF')
     .setWrap(false).setVerticalAlignment('middle').setHorizontalAlignment('center');
    h.getRange(2, tr.ini, nFilas, an).setWrap(false).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
     .setVerticalAlignment('middle');
  });
  h.setFrozenRows(1);
  h.setFrozenColumns(1);

  var der = function (enc, fmt) {
    var r = escrRango_(h, m, enc, nFilas);
    if (r) r.setNumberFormat(fmt).setHorizontalAlignment('right');
  };
  der('PRECIO CVA', '$#,##0.00');
  der('PRECIO PROMO', '$#,##0.00');
  ['STOCK SUC', 'STOCK CEDIS', 'STOCK TOTAL', 'EN TRANSITO'].forEach(function (e) { der(e, '#,##0'); });
  escrFormatos_(h, m, { 'ACTUALIZADO': 'yyyy-mm-dd hh:mm' }, nFilas);
  escrFiltro_(h, 1);
  SpreadsheetApp.flush();

  var ancho = [110, 520, 110, 140, 110, 70, 90, 100, 100, 100, 100, 110, 140, 140];
  CVA_ENCABEZADOS.forEach(function (e, i) { if (m.todas[i] && ancho[i]) h.setColumnWidth(m.todas[i], ancho[i]); });
  h.setRowHeights(1, 1, 30);
  h.setRowHeights(2, nFilas, 21);
}
