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
    unaVezAlDia_('comisiones:error', function () {
      logErr_('COMISIONES', 'No se pudo leer ' + CM_RUTA, { error: String(e.message).substring(0, 300) });
    });
    flushLog_();
    return { error: e.message };
  }

  var lista = cmLista_(r.json);
  if (!lista || !lista.length) {
    unaVezAlDia_('comisiones:forma', function () {
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
    unaVezAlDia_('comisiones:igual', function () {
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

  // Guarda: lista parcial contra una hoja llena = casi seguro el site, no que se quitaron categorias.
  if (!forzar && guardaParcial_('COMISIONES', CM_HOJA, lista.length, escrFilasHoja_(CM_HOJA))) {
    flushLog_();
    return { error: 'lista parcial' };
  }

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
  // Columnas del script POR ENCABEZADO: si agregas una tuya en medio, el
  // formato sigue cayendo en la columna correcta y la tuya no se toca.
  var encs = campos.map(cmEncabezado_).concat(['ACTUALIZADO']);
  var m = escrMapaHoja_(h, encs);
  if (!m.pos.length) return;

  m.tramos.forEach(function (tr) {
    var an = tr.fin - tr.ini + 1;
    h.getRange(1, tr.ini, 1, an).setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF')
     .setWrap(false).setWrapStrategy(SpreadsheetApp.WrapStrategy.OVERFLOW)
     .setVerticalAlignment('middle').setHorizontalAlignment('center');
    h.getRange(2, tr.ini, nFilas, an).setWrap(false).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
     .setVerticalAlignment('middle');
  });
  h.setFrozenRows(1);
  h.setFrozenColumns(1);

  campos.forEach(function (k, i) {
    var c = m.todas[i];
    if (!c) return;
    var rg = h.getRange(2, c, nFilas, 1);
    if (cmTipo_(k) === '%') rg.setNumberFormat('0"%"').setHorizontalAlignment('right');
    else if (cmTipo_(k) === '') rg.setNumberFormat('General');
  });
  var cAct = m.todas[encs.length - 1];
  if (cAct) h.getRange(2, cAct, nFilas, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  escrFiltro_(h, 1);
  SpreadsheetApp.flush();

  // Anchos: lo que pidan los datos, nunca menos que el encabezado completo.
  escrAutoAncho_(h, m);
  encs.forEach(function (e, i) {
    var c = m.todas[i];
    if (!c) return;
    var minimo = String(e).length * 8 + 40;
    if (i === encs.length - 1) minimo = Math.max(minimo, 135);
    h.setColumnWidth(c, Math.max(h.getColumnWidth(c), minimo));
  });
  h.setRowHeights(1, 1, 30);
  h.setRowHeights(2, nFilas, 21);
}
