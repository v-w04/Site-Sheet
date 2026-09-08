/**
 * Walmart.gs — Site Sheet
 *
 * Trae a la hoja "Walmart" el catalogo y los inventarios que el proyecto
 * WALMART DASHBOARD ya esta bajando de la API todo el dia.
 *
 * NO llama a la API de Walmart ni usa IMPORTRANGE: lee el otro libro con
 * SpreadsheetApp.openById(), que es una lectura de script.
 *   - cero llamadas de UrlFetch, o sea cero cuota
 *   - no se rompe por permisos como los IMPORTRANGE
 *   - no duplica las credenciales de Walmart en este proyecto
 *
 * Orden la primera vez:
 *   1) wmDashboardConectar()   pega el ID o la URL del libro WALMART DASHBOARD
 *   2) wmWalmartBajar()        escribe la hoja "Walmart"
 *
 * Despues solo se corre wmWalmartBajar(), o lo hace el trigger.
 *
 * Del dashboard se usan dos hojas:
 *   Inventario  — catalogo + WFS  (37 columnas, de las que 18 traen datos)
 *   Inv_Normal  — inventario propio por SKU (el barrido uno por uno)
 * Las columnas vacias del dashboard son las del endpoint nuevo de WFS, que
 * esta bloqueado en la cuenta (401 Program Eligibility): edades, proyecciones,
 * sell-through, dias de supply y piezas sugeridas.
 */

var WD_HOJA = 'Walmart';
var WD_PROP = { LIBRO: 'WM_DASHBOARD_ID' };

var WD_ORIGEN = { INV: 'Inventario', MKP: 'Inv_Normal' };

var WD_COLUMNAS = [
  'SKU', 'NOMBRE', 'CATEGORIA', 'DEPARTAMENTO', 'PRECIO', 'ESTATUS',
  'GTIN', 'UPC', 'WPID', 'MKP', 'WFS', 'WFS ESTADO', 'ES WFS', 'ACTUALIZADO'
];
var WD_COL = {
  SKU:1, NOMBRE:2, CATEGORIA:3, DEPTO:4, PRECIO:5, ESTATUS:6,
  GTIN:7, UPC:8, WPID:9, MKP:10, WFS:11, WFS_EST:12, ES_WFS:13, ACT:14
};

/**
 * Un SKU va a WFS solo si trae -MSI o -MSI-0..9. No se ancla al final porque
 * los de CVA vienen como ...-MSI-CVA. Y como exige el guion de enmedio, un SKU
 * que EMPIEZA con MSI- (la marca de computadoras) no cuenta.
 */
var WD_RE_MSI = /-MSI(-\d)?/i;

/* ================================================================== */
/*  Configuracion                                                      */
/* ================================================================== */

function wmDashboardConectar() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Walmart Dashboard',
    'Pega la URL o el ID del libro WALMART DASHBOARD.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var id = wdId_(String(r.getResponseText()).trim());
  if (!id) throw new Error('No reconoci el ID.');

  var libro;
  try { libro = SpreadsheetApp.openById(id); }
  catch (e) { throw new Error('No pude abrir ese libro. Revisa que la cuenta que corre el script tenga acceso.'); }

  var faltan = [];
  [WD_ORIGEN.INV, WD_ORIGEN.MKP].forEach(function (n) {
    if (!libro.getSheetByName(n)) faltan.push(n);
  });
  if (faltan.length) throw new Error('Ese libro no trae las hojas: ' + faltan.join(', '));

  PropertiesService.getScriptProperties().setProperty(WD_PROP.LIBRO, id);
  wdAviso_('Walmart Dashboard',
    'Conectado a "' + libro.getName() + '".\n\nAhora corre wmWalmartBajar().');
}

function wdId_(txt) {
  var m = String(txt).match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(txt) ? txt : '';
}

function wdLibro_() {
  var id = PropertiesService.getScriptProperties().getProperty(WD_PROP.LIBRO);
  if (!id) throw new Error('Falta conectar el dashboard. Corre wmDashboardConectar().');
  return SpreadsheetApp.openById(id);
}

/* ================================================================== */
/*  Bajada                                                             */
/* ================================================================== */

function wmWalmartBajar() {
  var t0 = Date.now();
  var ss = SpreadsheetApp.getActive();
  var libro = wdLibro_();

  // --- Inventario ---
  var hInv = libro.getSheetByName(WD_ORIGEN.INV);
  if (!hInv || hInv.getLastRow() < 2) throw new Error('El dashboard no tiene datos en "' + WD_ORIGEN.INV + '".');
  var inv = hInv.getRange(1, 1, hInv.getLastRow(), hInv.getLastColumn()).getValues();
  var ci = wdIndices_(inv[0]);

  // --- Inventario propio ---
  var mkp = {};
  var hMkp = libro.getSheetByName(WD_ORIGEN.MKP);
  if (hMkp && hMkp.getLastRow() > 1) {
    var dm = hMkp.getRange(1, 1, hMkp.getLastRow(), hMkp.getLastColumn()).getValues();
    var cm = wdIndices_(dm[0]);
    for (var j = 1; j < dm.length; j++) {
      var k = String(dm[j][cm.sku] || '').trim();
      if (k) mkp[k] = wdNum_(dm[j][cm.cantidad]);
    }
  }

  var filas = [];
  for (var i = 1; i < inv.length; i++) {
    var f = inv[i];
    var sku = String(f[ci.sku] || '').trim();
    if (!sku) continue;
    filas.push([
      sku,
      f[ci.productName] || '',
      f[ci.productType] || '',
      f[ci.shelf] || '',
      wdNum_(f[ci.price]),
      f[ci.publishedStatus] || '',
      wdGtin_(f[ci.gtin]),
      wdGtin_(f[ci.upc]),
      f[ci.wpid] || '',
      (mkp[sku] === undefined ? '' : mkp[sku]),
      wdNum_(f[ci.wfsDisponible]),
      f[ci.wfsEstado] || '',
      wdSiNo_(f[ci.esWFS]),
      wdFecha_(f[ci.wfsActualizado])
    ]);
  }

  wdEscribir_(filas);

  var r = wdResumen_(filas);
  wdAviso_('Walmart',
    filas.length + ' articulos en la hoja "' + WD_HOJA + '".\n\n' +
    'En WFS (ES WFS = SI):     ' + r.enWfs + '\n' +
    '   con existencia:        ' + r.conStock + '\n' +
    '   agotados:              ' + (r.enWfs - r.conStock) + '\n' +
    'Fuera de WFS:             ' + (filas.length - r.enWfs) + '\n\n' +
    'SKUs que terminan en -MSI: ' + r.msi + '\n' +
    '   ya en WFS:             ' + (r.msi - r.msiFuera) + '\n' +
    '   FUERA de WFS:          ' + r.msiFuera + '\n' +
    '   de esos, publicados:   ' + r.msiAccionables + '  <- los que se pueden convertir hoy\n\n' +
    'Tardo ' + Math.round((Date.now() - t0) / 1000) + ' s. Cero llamadas de UrlFetch.');

  return r;
}

function wdResumen_(filas) {
  var r = { enWfs: 0, conStock: 0, msi: 0, msiFuera: 0, msiAccionables: 0 };
  filas.forEach(function (f) {
    var esWfs = f[WD_COL.ES_WFS - 1] === 'SI';
    if (esWfs) {
      r.enWfs++;
      if (Number(f[WD_COL.WFS - 1]) > 0) r.conStock++;
    }
    if (WD_RE_MSI.test(f[0])) {
      r.msi++;
      if (!esWfs) {
        r.msiFuera++;
        if (f[WD_COL.ESTATUS - 1] === 'PUBLISHED') r.msiAccionables++;
      }
    }
  });
  return r;
}

/* ================================================================== */
/*  Lo que falta convertir a WFS                                       */
/* ================================================================== */

/**
 * Los GTIN listos para pegar en el seller center:
 *   Catalogo > Actualizar articulos > Actualizacion con GTINs > Convertir a WFS
 *
 * La plantilla baja UNA POR CATEGORIA, asi que aqui salen agrupados por
 * categoria: una tanda por bloque.
 */
function wmGtinsParaConvertir() {
  var pendientes = wdPendientes_();
  if (!pendientes.length) {
    wdAviso_('Convertir a WFS', 'No hay SKUs -MSI publicados fuera de WFS. Todo al dia.');
    return;
  }

  var porCat = {};
  pendientes.forEach(function (p) {
    var c = p.categoria || '(sin categoria)';
    if (!porCat[c]) porCat[c] = [];
    porCat[c].push(p.gtin);
  });

  var cats = Object.keys(porCat).sort(function (a, b) { return porCat[b].length - porCat[a].length; });
  var texto = cats.map(function (c) {
    return '### ' + c + '  (' + porCat[c].length + ')\n' + porCat[c].join(',');
  }).join('\n\n');

  // La hoja es lo util: el alert no deja copiar comodo.
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName('_ConvertirWFS');
  if (!h) h = ss.insertSheet('_ConvertirWFS');
  h.clear();
  h.getRange(1, 1, 1, 3).setValues([['CATEGORIA', 'CUANTOS', 'GTINs PARA PEGAR']])
   .setFontWeight('bold').setBackground('#eef2f7');
  var filas = cats.map(function (c) { return [c, porCat[c].length, porCat[c].join(',')]; });
  h.getRange(2, 1, filas.length, 3).setValues(filas);
  h.setFrozenRows(1);
  h.setColumnWidth(3, 600);
  h.getRange(2, 3, filas.length, 1).setWrap(false);
  ss.setActiveSheet(h);

  wdAviso_('Convertir a WFS',
    pendientes.length + ' SKUs -MSI publicados que todavia no estan en WFS,\n' +
    'repartidos en ' + cats.length + ' categorias.\n\n' +
    'Se escribio la hoja "_ConvertirWFS": cada renglon es una tanda.\n' +
    'Copia la celda de GTINs de un renglon y pegala en\n' +
    'Catalogo > Actualizar articulos > Actualizacion con GTINs > Convertir a WFS.\n\n' +
    'Las 5 categorias mas grandes:\n' +
    cats.slice(0, 5).map(function (c) { return '  ' + porCat[c].length + '  ' + c; }).join('\n'));
}

/** SKUs -MSI, publicados, que no estan en WFS. */
function wdPendientes_() {
  var h = SpreadsheetApp.getActive().getSheetByName(WD_HOJA);
  if (!h || h.getLastRow() < 2) throw new Error('Corre primero wmWalmartBajar().');

  var d = h.getRange(2, 1, h.getLastRow() - 1, WD_COLUMNAS.length).getValues();
  var out = [];
  d.forEach(function (f) {
    var sku = String(f[0] || '').trim();
    if (!sku || !WD_RE_MSI.test(sku)) return;
    if (f[WD_COL.ES_WFS - 1] === 'SI') return;
    if (f[WD_COL.ESTATUS - 1] !== 'PUBLISHED') return;
    var gtin = String(f[WD_COL.GTIN - 1] || '').trim();
    if (!gtin) return;
    out.push({ sku: sku, gtin: gtin, categoria: String(f[WD_COL.CATEGORIA - 1] || ''),
               nombre: f[WD_COL.NOMBRE - 1], precio: f[WD_COL.PRECIO - 1] });
  });
  return out;
}

/* ================================================================== */
/*  Publicaciones con problema                                         */
/* ================================================================== */

/**
 * Llena la plantilla "Mi Producto Esta Inactivo O Inedito" para el ticket
 * de soporte: Estatus | GTIN | Nombre | Precio actual.
 * Se queda en una hoja para copiarla o exportarla.
 */
function wmProductosInactivos() {
  var h = SpreadsheetApp.getActive().getSheetByName(WD_HOJA);
  if (!h || h.getLastRow() < 2) throw new Error('Corre primero wmWalmartBajar().');

  var d = h.getRange(2, 1, h.getLastRow() - 1, WD_COLUMNAS.length).getValues();
  var filas = [];
  d.forEach(function (f) {
    var est = f[WD_COL.ESTATUS - 1];
    if (est !== 'UNPUBLISHED' && est !== 'SYSTEM_PROBLEM') return;
    filas.push([
      'No Visible',
      String(f[WD_COL.GTIN - 1] || ''),
      f[WD_COL.NOMBRE - 1],
      f[WD_COL.PRECIO - 1],
      f[0],
      est
    ]);
  });
  if (!filas.length) { wdAviso_('Publicaciones', 'No hay productos inactivos ni con problema.'); return; }

  var ss = SpreadsheetApp.getActive();
  var hh = ss.getSheetByName('_Inactivos');
  if (!hh) hh = ss.insertSheet('_Inactivos');
  hh.clear();
  hh.getRange(1, 1, 1, 6).setValues([[
    'Estatus del Articulos / Product Status', 'GTIN',
    'Nombre de producto/Product name',
    'Precio Actual en Seller Center / Current Price in Seller Center',
    'SKU (referencia)', 'ESTATUS REAL (referencia)'
  ]]).setFontWeight('bold').setBackground('#eef2f7');
  hh.getRange(2, 1, filas.length, 6).setValues(filas);
  hh.getRange(2, 2, filas.length, 1).setNumberFormat('@');
  hh.setFrozenRows(1);
  hh.getRange(1, 1, 1, 6).createFilter();
  SpreadsheetApp.flush();
  hh.autoResizeColumns(1, 6);
  if (hh.getColumnWidth(3) > 400) hh.setColumnWidth(3, 400);
  ss.setActiveSheet(hh);

  var sp = filas.filter(function (f) { return f[5] === 'SYSTEM_PROBLEM'; }).length;
  wdAviso_('Publicaciones con problema',
    filas.length + ' productos no visibles en la hoja "_Inactivos".\n\n' +
    '   UNPUBLISHED:    ' + (filas.length - sp) + '\n' +
    '   SYSTEM_PROBLEM: ' + sp + '  <- estos son error de Walmart, se reclaman\n\n' +
    'Las primeras 4 columnas son las de la plantilla de soporte.\n' +
    'Las dos ultimas son solo tu referencia, no van en el ticket.');
}

/* ================================================================== */
/*  Escritura                                                          */
/* ================================================================== */

function wdEscribir_(filas) {
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName(WD_HOJA);
  if (!h) h = ss.insertSheet(WD_HOJA);

  try { var fl = h.getFilter(); if (fl) fl.remove(); } catch (e) {}
  h.clear();

  var nC = WD_COLUMNAS.length;
  var sc = h.getMaxColumns() - nC;
  if (sc > 0) h.deleteColumns(nC + 1, sc);
  if (sc < 0) h.insertColumnsAfter(h.getMaxColumns(), -sc);
  var quiero = Math.max(filas.length + 1, 50);
  var sf = h.getMaxRows() - quiero;
  if (sf > 0) h.deleteRows(quiero + 1, sf);
  if (sf < 0) h.insertRowsAfter(h.getMaxRows(), -sf);

  h.getRange(1, 1, 1, nC).setValues([WD_COLUMNAS])
   .setFontWeight('bold').setBackground('#eef2f7');

  if (filas.length) {
    var n = filas.length;
    // Los codigos van como texto ANTES de escribir, para no perder los ceros.
    h.getRange(2, WD_COL.GTIN, n, 3).setNumberFormat('@');
    h.getRange(2, 1, n, nC).setValues(filas);
    h.getRange(2, WD_COL.PRECIO, n, 1).setNumberFormat('#,##0.00');
    h.getRange(2, WD_COL.MKP, n, 2).setNumberFormat('#,##0');
    h.getRange(2, WD_COL.ACT, n, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  }

  h.setFrozenRows(1);
  h.setFrozenColumns(1);
  h.getRange(1, 1, 1, nC).createFilter();
  SpreadsheetApp.flush();
  h.autoResizeColumns(1, nC);
  if (h.getColumnWidth(WD_COL.NOMBRE) > 380) h.setColumnWidth(WD_COL.NOMBRE, 380);
}

/* ================================================================== */
/*  Utilerias                                                          */
/* ================================================================== */

/** Encuentra las columnas del dashboard por nombre, sin depender del orden. */
function wdIndices_(encabezados) {
  var mapa = {};
  encabezados.forEach(function (v, i) {
    var k = String(v || '').trim();
    if (k) mapa[k.toLowerCase()] = i;
  });
  function b(nombres) {
    for (var i = 0; i < nombres.length; i++) {
      var k = nombres[i].toLowerCase();
      if (mapa[k] !== undefined) return mapa[k];
    }
    for (var j = 0; j < nombres.length; j++) {
      var f = nombres[j].toLowerCase();
      var llaves = Object.keys(mapa);
      for (var x = 0; x < llaves.length; x++) if (llaves[x].indexOf(f) >= 0) return mapa[llaves[x]];
    }
    return -1;
  }
  return {
    sku:             b(['sku']),
    productName:     b(['productName', 'nombre']),
    productType:     b(['productType', 'categoria']),
    shelf:           b(['shelf', 'departamento']),
    price:           b(['price', 'precio']),
    publishedStatus: b(['publishedStatus', 'estatus']),
    gtin:            b(['gtin']),
    upc:             b(['upc']),
    wpid:            b(['wpid']),
    wfsDisponible:   b(['wfsDisponible', 'wfsdisp']),
    wfsEstado:       b(['wfsEstado']),
    esWFS:           b(['esWFS']),
    wfsActualizado:  b(['wfsActualizado', 'revisadoEn']),
    cantidad:        b(['cantidad', 'quantity'])
  };
}

/** 14 digitos con ceros a la izquierda, que es como los pide Walmart. */
function wdGtin_(v) {
  var s = String(v === null || v === undefined ? '' : v).replace(/\D/g, '');
  if (!s) return '';
  while (s.length < 14) s = '0' + s;
  return s;
}

function wdNum_(v) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(v);
  return isNaN(n) ? '' : n;
}

function wdSiNo_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim().toUpperCase();
  if (s === 'SÍ' || s === 'SI' || s === 'Y' || s === 'YES' || s === 'TRUE') return 'SI';
  if (s === 'NO' || s === 'N' || s === 'FALSE') return 'NO';
  return s;
}

function wdFecha_(v) {
  if (!v) return '';
  if (v instanceof Date) return v;
  var d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d;
}

function wdAviso_(titulo, msg) {
  Logger.log(titulo + '\n' + msg);
  try { SpreadsheetApp.getUi().alert(titulo, String(msg).slice(0, 4000), SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) {}
}
