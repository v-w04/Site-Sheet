/**
 * ============================================================
 *  Promos — promociones de comision de Walmart (del site)
 * ============================================================
 *
 * electronicsmexico.site/walmart/killers/api/promos (pestaña Ofertas
 * Especiales -> Promociones). Walmart baja temporalmente la comision de
 * ciertos SKUs o categorias; el site rehace el precio con la comision final.
 * Se captura con el SKU base y cubre su variante -MSI.
 *
 * Mismo modulo que los killers: misma cookie, mismo perfil de encabezados
 * (kTraer_ en Killers.gs). Se revisa cada hora dentro de killersProgramado y
 * solo se reescribe la hoja si el contenido cambio.
 *
 * La hoja se arma con las LLAVES que mande el site, en el orden en que
 * llegan: si el site agrega o quita un campo, la hoja lo refleja sola y el
 * Log lo dice. Nada aqui depende de posiciones.
 */

var PR_RUTA        = '/walmart/killers/api/promos';
var PR_HOJA        = 'Promociones';
var PR_PROP_HUELLA = 'PROMOS_HUELLA';
var PR_PROP_CAMPOS = 'PROMOS_CAMPOS';
var PR_PROP_AVISO  = 'PROMOS_AVISO_DIA';

/** Sube este numero si cambia el formato de la hoja: fuerza una reescritura. */
var PR_VERSION = '2';

/**
 * Orden y nombre de las columnas. [llave del site, encabezado, formato].
 * Lo que el site mande y no este aqui va al final, con su nombre tal cual,
 * para que nada se pierda si agregan campos.
 *   $ = precio   % = puntos de comision   d = fecha   t = texto
 */
var PR_COLUMNAS = [
  ['sku',            'SKU',                   't'],
  ['nombre',         'PRODUCTO',              't'],
  ['categoria',      'CATEGORIA',             't'],
  ['catalogo',       'CATALOGO',              't'],
  ['aplica',         'APLICA',                't'],
  ['encontrado',     'EN EL SITE',            't'],
  ['com_normal',     'COMISION NORMAL',       '%'],
  ['reduccion',      'PUNTOS DE DESCUENTO',   '%'],
  ['com_final',      'COMISION CON PROMO',    '%'],
  ['antes_clasica',  'CLASICA SIN PROMO',     '$'],
  ['precio_clasica', 'CLASICA CON PROMO',     '$'],
  ['min_clasica',    'MINIMO CLASICA',        '$'],
  ['antes_premium',  'PREMIUM SIN PROMO',     '$'],
  ['precio_premium', 'PREMIUM CON PROMO',     '$'],
  ['min_premium',    'MINIMO PREMIUM',        '$'],
  ['sin_precio',     'AVISO',                 't'],
  ['motivo',         'MOTIVO',                't'],
  ['nota',           'NOTA',                  't'],
  ['sku_capturado',  'SKU CAPTURADO',         't'],
  ['por',            'CAPTURO',               't'],
  ['ts',             'CAPTURADA',             'd']
];

/** Menu: baja las promociones ahora y avisa. */
function promosBajar() {
  var r = promosActualizar_(true);
  var msg = r.error ? 'No se pudo: ' + r.error
          : r.filas + ' promociones en la hoja "' + PR_HOJA + '".' +
            (r.campos ? '\n\nColumnas: ' + r.campos.join(', ') : '');
  try { SpreadsheetApp.getUi().alert('Promociones', msg, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { Logger.log(msg); }
  return msg;
}

/** Corrida de cada hora (la llama killersProgramado). */
function promosProgramado_() {
  promosActualizar_(false);
}

function promosActualizar_(forzar) {
  var props = PropertiesService.getScriptProperties();
  var r;
  try {
    r = kTraer_(PR_RUTA);
  } catch (e) {
    prUnaVezAlDia_('error', function () {
      logErr_('PROMOS', 'No se pudo leer ' + PR_RUTA, { error: String(e.message).substring(0, 300) });
    });
    flushLog_();
    return { error: e.message };
  }

  var lista = prLista_(r.json);
  if (!lista) {
    prUnaVezAlDia_('forma', function () {
      logWarn_('PROMOS', 'El site contesto pero no encontre la lista de promociones. ' +
                         'Llaves recibidas: ' + Object.keys(r.json || {}).join(', '));
    });
    flushLog_();
    return { error: 'sin lista' };
  }

  // Llaves que manda el site, en orden de aparicion.
  var recibidos = [];
  lista.forEach(function (o) {
    Object.keys(o || {}).forEach(function (k) { if (recibidos.indexOf(k) < 0) recibidos.push(k); });
  });
  // Orden de la hoja: primero las conocidas en PR_COLUMNAS, luego las nuevas.
  var conocidas = PR_COLUMNAS.map(function (c) { return c[0]; });
  var campos = conocidas.filter(function (k) { return recibidos.indexOf(k) >= 0; })
    .concat(recibidos.filter(function (k) { return conocidas.indexOf(k) < 0; }));

  var huella = sha256_(PR_VERSION + JSON.stringify(lista));
  var hoja = SpreadsheetApp.getActive().getSheetByName(PR_HOJA);
  var hayHoja = hoja && hoja.getLastRow() > 0;
  if (!forzar && hayHoja && huella === props.getProperty(PR_PROP_HUELLA)) {
    prUnaVezAlDia_('igual', function () {
      logInfo_('PROMOS', 'Sin cambios (' + lista.length + ' promociones). Se revisa cada hora.');
    });
    flushLog_();
    return { filas: lista.length, campos: campos };
  }

  // Aviso si el site cambio de campos respecto a la ultima vez.
  var antes = props.getProperty(PR_PROP_CAMPOS);
  var firma = recibidos.slice().sort().join('|');
  if (antes && antes.split('|').sort().join('|') !== firma) {
    logWarn_('PROMOS', 'El site cambio los campos de promociones', {
      antes: antes.split('|'), ahora: recibidos.slice().sort()
    });
  }

  // Orden de filas: las que aplican primero, luego por categoria y SKU.
  lista = lista.slice().sort(function (a, b) {
    var x = (a.aplica === false) - (b.aplica === false);
    if (x) return x;
    var c = String(a.categoria || '').localeCompare(String(b.categoria || ''));
    if (c) return c;
    return String(a.sku || '').localeCompare(String(b.sku || ''));
  });

  var filas = [campos.map(prEncabezado_).concat(['ACTUALIZADO'])];
  var sello = ahora_();
  lista.forEach(function (o) {
    filas.push(campos.map(function (k) { return prValor_(o[k], prTipo_(k)); }).concat([sello]));
  });
  if (filas.length === 1) filas.push(campos.map(function () { return ''; }).concat([sello]));

  escribirTabla_(PR_HOJA, filas);
  try { prFormato_(campos, filas.length - 1); } catch (e) { console.log('formato promos: ' + e.message); }
  props.setProperty(PR_PROP_HUELLA, huella);
  props.setProperty(PR_PROP_CAMPOS, firma);

  logOk_('PROMOS', 'Promociones actualizadas: ' + lista.length, { campos: campos });
  flushLog_();
  return { filas: lista.length, campos: campos };
}

/** La lista de promociones: el arreglo de objetos que mande el site. */
function prLista_(json) {
  if (!json) return null;
  if (Array.isArray(json)) return json;
  var directas = ['promos', 'promociones', 'items', 'data', 'activas', 'lista'];
  for (var i = 0; i < directas.length; i++) {
    if (Array.isArray(json[directas[i]])) return json[directas[i]];
  }
  return kEncontrarLista_(json, ['categorias', 'kam', 'por_categoria']);
}

/** Encabezado: el de PR_COLUMNAS, o la llave legible (sku_base -> SKU BASE). */
function prEncabezado_(k) {
  for (var i = 0; i < PR_COLUMNAS.length; i++) if (PR_COLUMNAS[i][0] === k) return PR_COLUMNAS[i][1];
  return String(k).replace(/_/g, ' ').toUpperCase();
}

function prTipo_(k) {
  for (var i = 0; i < PR_COLUMNAS.length; i++) if (PR_COLUMNAS[i][0] === k) return PR_COLUMNAS[i][2];
  return '';
}

/** Valores planos para la hoja: objetos y listas como texto, fechas como fecha. */
function prValor_(v, tipo) {
  if (v === null || v === undefined) return '';
  if (tipo === 'd' && typeof v === 'string') {
    // 2026-10-01T09:56:17.355026-06:00 -> el JS de Apps Script solo entiende 3 decimales
    var d = new Date(v.replace(/(\.\d{3})\d+/, '$1'));
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof v === 'string' && v.toLowerCase() === 'cva') return 'CVA';
  if (typeof v === 'string' && v.toLowerCase() === 'elemex') return 'EM';
  if (Array.isArray(v)) return v.map(function (x) { return typeof x === 'object' ? JSON.stringify(x) : x; }).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'SI' : 'NO';
  return v;
}

/** Formato de la hoja: encabezado, anchos, numeros, filtros y colores. Todo por encabezado. */
function prFormato_(campos, nFilas) {
  var h = SpreadsheetApp.getActive().getSheetByName(PR_HOJA);
  if (!h || nFilas < 1) return;
  var nC = campos.length + 1;
  var enc = h.getRange(1, 1, 1, nC);

  try { var f = h.getFilter(); if (f) f.remove(); } catch (e) {}
  h.setConditionalFormatRules([]);

  enc.setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF')
     .setWrap(true).setVerticalAlignment('middle');
  h.setRowHeight(1, 36);
  h.setFrozenRows(1);
  h.setFrozenColumns(1);

  var formato = { '$': '#,##0', '%': '0"%"', 'd': 'yyyy-mm-dd hh:mm' };
  campos.forEach(function (k, i) {
    var t = prTipo_(k);
    var rg = h.getRange(2, i + 1, nFilas, 1);
    if (formato[t]) rg.setNumberFormat(formato[t]).setHorizontalAlignment('right');
    if (t === '$') h.getRange(1, i + 1).setBackground(k.indexOf('min_') === 0 ? '#2E6B3F' : '#3B6EA5');
  });
  h.getRange(2, nC, nFilas, 1).setNumberFormat('yyyy-mm-dd hh:mm');

  // Fila de color: no aplica o no esta en el site.
  var L = function (k) { var i = campos.indexOf(k); return i < 0 ? '' : colLetra_(i + 1); };
  var reglas = [];
  var datos = h.getRange(2, 1, nFilas, nC);
  if (L('encontrado')) {
    reglas.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + L('encontrado') + '2="NO"')
      .setBackground('#fff4e5').setRanges([datos]).build());
  }
  if (L('aplica')) {
    reglas.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + L('aplica') + '2="NO"')
      .setFontColor('#9aa0a6').setRanges([datos]).build());
  }
  h.setConditionalFormatRules(reglas);

  h.getRange(1, 1, nFilas + 1, nC).createFilter();
  SpreadsheetApp.flush();
  h.autoResizeColumns(1, nC);
  var iProd = campos.indexOf('nombre');
  if (iProd >= 0 && h.getColumnWidth(iProd + 1) > 360) h.setColumnWidth(iProd + 1, 360);
  var iAv = campos.indexOf('sin_precio');
  if (iAv >= 0 && h.getColumnWidth(iAv + 1) > 260) h.setColumnWidth(iAv + 1, 260);
}

function prUnaVezAlDia_(clave, fn) {
  var props = PropertiesService.getScriptProperties();
  var marca = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '|' + clave;
  if (props.getProperty(PR_PROP_AVISO) === marca) return;
  fn();
  props.setProperty(PR_PROP_AVISO, marca);
}
