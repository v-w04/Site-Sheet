/**
 * Oportunidades.gs — Site Sheet
 *
 * Encuentra el dinero parado: producto que SI tienes en Odoo pero que NO se
 * esta vendiendo en Walmart porque la publicacion se cayo.
 *
 * Trabaja por familia, no por publicacion, porque las variantes comparten el
 * mismo inventario de Odoo: contar las piezas cuatro veces infla el numero.
 *
 *   CAIDA     la familia tiene stock y NINGUNA publicacion viva  -> no vendes nada
 *   A MEDIAS  tiene stock y algunas vivas y otras caidas         -> vendes menos
 *
 * Y separa el motivo, porque la accion es distinta:
 *   SYSTEM_PROBLEM  error del lado de Walmart. Se reclama con ticket.
 *   UNPUBLISHED     se apago. Suele ser la fecha de fin de venta ya vencida.
 *
 * Funciones:
 *   armarOportunidades()   la hoja "Oportunidades"
 *   resParaDesactivar()    los RES/WL/OB que siguen publicados sin stock
 */

var OP_HOJA  = 'Oportunidades';
var OP_BAJAS = '_Desactivar';
var OP_CONC  = 'Concentrado';

var OP_EXCLUIR = /^(RES|WL|OB)-/i;

var OP_ENCABEZADOS = [
  'FAMILIA (ODOO)', 'NOMBRE', 'CATEGORIA', 'STOCK ODOO', 'PRECIO',
  'VALOR PARADO', 'SITUACION', 'PUBLICACIONES', 'VIVAS', 'CAIDAS',
  'UNPUBLISHED', 'SYSTEM_PROBLEM', 'ACCION', 'SKUs CAIDOS'
];

/* Columnas del Concentrado que se usan, POR ENCABEZADO (nunca por posicion). */
var OP_ENC = { SKU:'SKU', BASE:'SKU BASE', ESTATUS:'ESTATUS', CATODOO:'CATEGORIA ODOO',
               NOMBRE:'NOMBRE', PRECIO:'PRECIO WM', GTIN:'GTIN', ODOO:'DISPONIBLE ODOO' };

/** Indices 0-based de esas columnas en el Concentrado tal como esta. */
function opIdx_(c) {
  var m = colsHoja_(c, Object.keys(OP_ENC).map(function (k) { return OP_ENC[k]; }));
  var o = {};
  Object.keys(OP_ENC).forEach(function (k) { o[k] = m[OP_ENC[k]]; });
  return o;
}

/* Posicion de una columna de la hoja que ESTE script escribe. */
function opPos_(nombre) { return OP_ENCABEZADOS.indexOf(nombre); }

/* ================================================================== */

function armarOportunidades() {
  var ss = SpreadsheetApp.getActive();
  var c = ss.getSheetByName(OP_CONC);
  if (!c || c.getLastRow() < 2) {
    throw new Error('Falta la hoja "' + OP_CONC + '". Corre primero armarConcentrado().');
  }

  var K = opIdx_(c);
  var d = c.getRange(2, 1, c.getLastRow() - 1, c.getLastColumn()).getValues();
  var fam = {};

  d.forEach(function (f) {
    var sku = String(f[K.SKU] || '').trim();
    if (!sku || OP_EXCLUIR.test(sku)) return;
    var k = String(f[K.BASE] || '').trim();
    if (!k) return;
    if (!fam[k]) {
      fam[k] = { stock: 0, precio: 0, nombre: '', cat: '', pubs: [], vivas: 0,
                 unpub: 0, sysprob: 0, otros: 0, caidos: [] };
    }
    var g = fam[k];
    var st = Number(f[K.ODOO]) || 0;
    if (st > g.stock) g.stock = st;                       // el mismo para toda la familia
    var p = Number(f[K.PRECIO]) || 0;
    if (p > g.precio) g.precio = p;
    if (!g.nombre) g.nombre = f[K.NOMBRE] || '';
    if (!g.cat) g.cat = f[K.CATODOO] || '';

    var est = String(f[K.ESTATUS] || '');
    g.pubs.push(sku);
    if (est === 'PUBLISHED') g.vivas++;
    else {
      g.caidos.push(sku);
      if (est === 'UNPUBLISHED') g.unpub++;
      else if (est === 'SYSTEM_PROBLEM') g.sysprob++;
      else g.otros++;
    }
  });

  var filas = [];
  Object.keys(fam).forEach(function (k) {
    var g = fam[k];
    if (g.stock <= 0) return;                 // sin stock no hay dinero parado
    var caidas = g.pubs.length - g.vivas;
    if (caidas === 0) return;                 // todo vivo, no hay nada que hacer

    var situacion = g.vivas === 0 ? 'CAIDA' : 'A MEDIAS';
    var accion = g.sysprob > 0
      ? (g.unpub > 0 ? 'RECLAMAR A WALMART + REACTIVAR' : 'RECLAMAR A WALMART')
      : 'REACTIVAR';

    filas.push([
      k, g.nombre, g.cat, g.stock, g.precio,
      g.vivas === 0 ? g.stock * g.precio : '',       // solo lo 100% parado suma
      situacion, g.pubs.length, g.vivas, caidas,
      g.unpub, g.sysprob, accion, g.caidos.join(', ')
    ]);
  });

  if (!filas.length) {
    opAviso_('Oportunidades', 'No hay producto con stock y publicaciones caidas. Todo vendiendo.');
    return 0;
  }

  // Primero lo 100% caido, y dentro de eso por valor
  filas.sort(function (a, b) {
    if (a[6] !== b[6]) return a[6] === 'CAIDA' ? -1 : 1;
    var va = Number(a[5]) || (a[3] * a[4]), vb = Number(b[5]) || (b[3] * b[4]);
    return vb - va;
  });

  opEscribir_(ss, OP_HOJA, OP_ENCABEZADOS, filas, function (h, n) {
    h.getRange(2, 4, n, 1).setNumberFormat('#,##0');
    h.getRange(2, 5, n, 2).setNumberFormat('$#,##0');
    h.getRange(2, 8, n, 5).setNumberFormat('#,##0');
    var rango = h.getRange(2, 1, n, OP_ENCABEZADOS.length);
    h.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$' + colLetra_(opPos_('SITUACION') + 1) + '2="CAIDA"').setBackground('#fce8e6').setRanges([rango]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$' + colLetra_(opPos_('SYSTEM_PROBLEM') + 1) + '2>0').setBackground('#fff4e5')
        .setRanges([h.getRange(2, 12, n, 1)]).build()
    ]);
  });

  var iSit = opPos_('SITUACION'), iStk = opPos_('STOCK ODOO'), iVal = opPos_('VALOR PARADO'), iSys = opPos_('SYSTEM_PROBLEM');
  var caidas = filas.filter(function (f) { return f[iSit] === 'CAIDA'; });
  var piezas = caidas.reduce(function (a, f) { return a + f[iStk]; }, 0);
  var valor  = caidas.reduce(function (a, f) { return a + (Number(f[iVal]) || 0); }, 0);
  var conSys = filas.filter(function (f) { return f[iSys] > 0; }).length;

  opAviso_('Oportunidades',
    filas.length + ' familias con stock y publicaciones caidas.\n\n' +
    'CAIDAS (ninguna publicacion viva): ' + caidas.length + '\n' +
    '   piezas paradas: ' + Math.round(piezas).toLocaleString() + '\n' +
    '   valor a precio de Walmart: $' + Math.round(valor).toLocaleString() + '\n\n' +
    'A MEDIAS (vendes por unas, no por otras): ' + (filas.length - caidas.length) + '\n\n' +
    'Con SYSTEM_PROBLEM (error de Walmart, se reclama): ' + conSys + '\n\n' +
    'La hoja va ordenada por dinero parado: empieza por arriba.');
  return filas.length;
}

/* ================================================================== */

/**
 * Los RES/WL/OB que siguen publicados. Son tus primeras publicaciones, ya no se
 * resurten, y lo que servia ya se reetiqueto con la nomenclatura actual.
 * Esta hoja es la lista para pedirle a Walmart que las baje.
 */
function resParaDesactivar() {
  var ss = SpreadsheetApp.getActive();
  var c = ss.getSheetByName(OP_CONC);
  if (!c || c.getLastRow() < 2) throw new Error('Corre primero armarConcentrado().');

  var K = opIdx_(c);
  var d = c.getRange(2, 1, c.getLastRow() - 1, c.getLastColumn()).getValues();
  var filas = [], conStock = 0;
  d.forEach(function (f) {
    var sku = String(f[K.SKU] || '').trim();
    if (!sku || !OP_EXCLUIR.test(sku)) return;
    if (String(f[K.ESTATUS] || '') !== 'PUBLISHED') return;
    var st = Number(f[K.ODOO]) || 0;
    if (st > 0) conStock++;
    filas.push([sku, String(f[K.GTIN] || ''), f[K.NOMBRE],
                Number(f[K.PRECIO]) || '', st,
                st > 0 ? 'REVISAR: tiene stock' : 'Sin stock, se puede bajar']);
  });

  if (!filas.length) {
    opAviso_('Desactivar', 'No hay publicaciones RES/WL/OB activas.');
    return 0;
  }
  filas.sort(function (a, b) { return b[4] - a[4]; });

  opEscribir_(ss, OP_BAJAS,
    ['SKU', 'GTIN', 'NOMBRE', 'PRECIO', 'STOCK ODOO', 'NOTA'], filas,
    function (h, n) {
      h.getRange(2, 2, n, 1).setNumberFormat('@');
      h.getRange(2, 4, n, 1).setNumberFormat('$#,##0');
      h.getRange(2, 5, n, 1).setNumberFormat('#,##0');
    });

  opAviso_('Desactivar publicaciones viejas',
    filas.length + ' publicaciones RES/WL/OB siguen activas en Walmart.\n\n' +
    (conStock ? conStock + ' TIENEN stock en Odoo: revisalas antes de pedir la baja,\n' +
                'puede que valga la pena reetiquetarlas en vez de bajarlas.\n\n'
              : 'Ninguna tiene stock, asi que ninguna se puede vender.\n' +
                'Bajarlas es limpieza, no urgencia.\n\n') +
    'La hoja "' + OP_BAJAS + '" tiene SKU y GTIN para el ticket.');
  return filas.length;
}

/* ================================================================== */

function opEscribir_(ss, nombre, encabezados, filas, formato) {
  var h = ss.getSheetByName(nombre);
  if (!h) h = ss.insertSheet(nombre);
  try { var fl = h.getFilter(); if (fl) fl.remove(); } catch (e) {}
  h.clear();
  try { h.setConditionalFormatRules([]); } catch (e) {}

  var nC = encabezados.length;
  var sc = h.getMaxColumns() - nC;
  if (sc > 0) h.deleteColumns(nC + 1, sc);
  if (sc < 0) h.insertColumnsAfter(h.getMaxColumns(), -sc);
  var quiero = Math.max(filas.length + 1, 50);
  var sf = h.getMaxRows() - quiero;
  if (sf > 0) h.deleteRows(quiero + 1, sf);
  if (sf < 0) h.insertRowsAfter(h.getMaxRows(), -sf);

  h.getRange(1, 1, 1, nC).setValues([encabezados])
   .setFontWeight('bold').setBackground('#eef2f7');
  h.getRange(2, 1, filas.length, nC).setValues(filas);
  if (formato) formato(h, filas.length);

  h.setFrozenRows(1);
  h.getRange(1, 1, 1, nC).createFilter();
  SpreadsheetApp.flush();
  h.autoResizeColumns(1, nC);
  if (h.getColumnWidth(2) > 340) h.setColumnWidth(2, 340);
  if (nC >= 14 && h.getColumnWidth(14) > 340) h.setColumnWidth(14, 340);
  ss.setActiveSheet(h);
}

function opAviso_(titulo, msg) {
  Logger.log(titulo + '\n' + msg);
  try { SpreadsheetApp.getUi().alert(titulo, String(msg).slice(0, 4000), SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) {}
}
