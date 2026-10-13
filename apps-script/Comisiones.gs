/**
 * ============================================================
 *  Comisiones — comision normal por categoria de Walmart (del site)
 * ============================================================
 *
 * electronicsmexico.site/walmart/killers/api/comisiones (pestana Ofertas
 * Especiales -> Configuracion). Es la tabla "CATEGORIA WALMART / COMISION
 * NORMAL (%) / LA PROMO APLICA A" que el site usa para rehacer los precios.
 *
 * Mismo modulo que los killers y las promos: misma cookie, mismo perfil de
 * encabezados (kTraer_ en Killers.gs). Se revisa cada hora dentro de
 * killersProgramado y solo se reescribe la hoja si el contenido cambio.
 *
 * Aqui no se calcula nada: la hoja es lo que manda el site. Si el site agrega
 * un campo, sale al final con su nombre; el orden y los nombres de abajo solo
 * son para que se vea como la pestana del site.
 */

var CM_RUTA        = '/walmart/killers/api/comisiones';
var CM_HOJA        = 'Comisiones';
var CM_PROP_HUELLA = 'COMISIONES_HUELLA';
var CM_PROP_AVISO  = 'COMISIONES_AVISO_DIA';

/** Sube este numero si cambia el formato de la hoja: fuerza una reescritura. */
var CM_VERSION = '1';

/** [llave del site, encabezado, tipo]  (% = puntos de comision, t = texto) */
var CM_COLUMNAS = [
  ['nombre',   'CATEGORIA WALMART',  't'],
  ['pct',      'COMISION NORMAL',    '%'],
  ['aplica_a', 'LA PROMO APLICA A',  't']
];

/** Menu: baja las comisiones ahora y avisa. */
function comisionesBajar() {
  var r = comisionesActualizar_(true);
  var msg = r.error ? 'No se pudo: ' + r.error
          : r.filas + ' categorias en la hoja "' + CM_HOJA + '".';
  try { SpreadsheetApp.getUi().alert('Comisiones', msg, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { Logger.log(msg); }
  return msg;
}

/** Corrida de cada hora (la llama killersProgramado). */
function comisionesProgramado_() {
  comisionesActualizar_(false);
}

function comisionesActualizar_(forzar) {
  var props = PropertiesService.getScriptProperties();
  var r;
  try {
    r = kTraer_(CM_RUTA);
  } catch (e) {
    cmUnaVezAlDia_('error', function () {
      logErr_('COMISIONES', 'No se pudo leer ' + CM_RUTA, { error: String(e.message).substring(0, 300) });
    });
    flushLog_();
    return { error: e.message };
  }

  var lista = cmLista_(r.json);
  if (!lista || !lista.length) {
    cmUnaVezAlDia_('forma', function () {
      logWarn_('COMISIONES', 'El site contesto pero no trae categorias. Llaves recibidas: ' +
                             Object.keys(r.json || {}).join(', '));
    });
    flushLog_();
    return { error: 'sin lista' };   // no se toca la hoja: mejor la ultima buena que una vacia
  }

  var huella = sha256_(CM_VERSION + JSON.stringify(lista));
  var hoja = SpreadsheetApp.getActive().getSheetByName(CM_HOJA);
  var hayHoja = hoja && hoja.getLastRow() > 1;
  if (!forzar && hayHoja && huella === props.getProperty(CM_PROP_HUELLA)) {
    cmUnaVezAlDia_('igual', function () {
      logInfo_('COMISIONES', 'Sin cambios (' + lista.length + ' categorias). Se revisa cada hora.');
    });
    flushLog_();
    return { filas: lista.length };
  }

  // Llaves que manda el site: primero las conocidas, luego las nuevas.
  var recibidos = [];
  lista.forEach(function (o) {
    Object.keys(o || {}).forEach(function (k) { if (recibidos.indexOf(k) < 0) recibidos.push(k); });
  });
  var conocidas = CM_COLUMNAS.map(function (c) { return c[0]; });
  var campos = conocidas.filter(function (k) { return recibidos.indexOf(k) >= 0; })
    .concat(recibidos.filter(function (k) { return conocidas.indexOf(k) < 0; }));

  lista = lista.slice().sort(function (a, b) {
    return String(a.nombre || '').localeCompare(String(b.nombre || ''));
  });

  var filas = [campos.map(cmEncabezado_).concat(['ACTUALIZADO'])];
  var sello = ahora_();
  lista.forEach(function (o) {
    filas.push(campos.map(function (k) { return cmValor_(k, o[k]); }).concat([sello]));
  });

  escribirTabla_(CM_HOJA, filas);
  try { cmFormato_(campos, filas.length - 1); } catch (e) { console.log('formato comisiones: ' + e.message); }
  props.setProperty(CM_PROP_HUELLA, huella);

  logOk_('COMISIONES', 'Comisiones actualizadas: ' + lista.length + ' categorias');
  flushLog_();
  return { filas: lista.length };
}

/** La lista de categorias: el arreglo de objetos que mande el site (hoy `lista`). */
function cmLista_(json) {
  if (!json) return null;
  if (Array.isArray(json)) return json;
  var directas = ['lista', 'comisiones', 'categorias', 'items', 'data'];
  for (var i = 0; i < directas.length; i++) {
    if (Array.isArray(json[directas[i]])) return json[directas[i]];
  }
  return kEncontrarLista_(json, []);
}

function cmEncabezado_(k) {
  for (var i = 0; i < CM_COLUMNAS.length; i++) if (CM_COLUMNAS[i][0] === k) return CM_COLUMNAS[i][1]; // col-fija
  return String(k).replace(/_/g, ' ').toUpperCase();
}

function cmTipo_(k) {
  for (var i = 0; i < CM_COLUMNAS.length; i++) if (CM_COLUMNAS[i][0] === k) return CM_COLUMNAS[i][2]; // col-fija
  return '';
}

/** Valores tal cual los manda el site; solo "ambas/premium/clasica" se lee como en la pestana. */
function cmValor_(k, v) {
  if (v === null || v === undefined) return '';
  if (k === 'aplica_a') {
    var t = String(v).toLowerCase();
    if (t === 'ambas') return 'Clasica y Premium';
    if (t === 'premium') return 'Premium';
    if (t === 'clasica') return 'Clasica';
    return v;
  }
  if (typeof v === 'boolean') return v ? 'SI' : 'NO';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Formato igual al de las demas hojas del site: encabezado azul, filtro, congelado, anchos. */
function cmFormato_(campos, nFilas) {
  var h = SpreadsheetApp.getActive().getSheetByName(CM_HOJA);
  if (!h || nFilas < 1) return;
  var nC = campos.length + 1;
  var enc = h.getRange(1, 1, 1, nC);

  try { var f = h.getFilter(); if (f) f.remove(); } catch (e) {}

  enc.setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF')
     .setWrap(false).setWrapStrategy(SpreadsheetApp.WrapStrategy.OVERFLOW)
     .setVerticalAlignment('middle').setHorizontalAlignment('center');
  h.getRange(2, 1, nFilas, nC).setWrap(false).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
     .setVerticalAlignment('middle');
  h.setFrozenRows(1);
  h.setFrozenColumns(1);

  campos.forEach(function (k, i) {
    var rg = h.getRange(2, i + 1, nFilas, 1);
    if (cmTipo_(k) === '%') rg.setNumberFormat('0"%"').setHorizontalAlignment('right');
    else if (cmTipo_(k) === '') rg.setNumberFormat('General');
  });
  h.getRange(2, nC, nFilas, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  h.getRange(1, 1, nFilas + 1, nC).createFilter();
  SpreadsheetApp.flush();

  // Anchos: lo que pidan los datos, nunca menos que el encabezado completo.
  h.autoResizeColumns(1, nC);
  var encs = enc.getValues()[0];
  for (var c = 1; c <= nC; c++) {
    var minimo = String(encs[c - 1]).length * 8 + 40;
    if (c === nC) minimo = Math.max(minimo, 135);
    h.setColumnWidth(c, Math.max(h.getColumnWidth(c), minimo));
  }
  h.setRowHeights(1, 1, 30);
  h.setRowHeights(2, nFilas, 21);
}

function cmUnaVezAlDia_(clave, fn) {
  var props = PropertiesService.getScriptProperties();
  var marca = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '|' + clave;
  if (props.getProperty(CM_PROP_AVISO) === marca) return;
  fn();
  props.setProperty(CM_PROP_AVISO, marca);
}
