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
var WD_HOJA_BLOQ = 'Bloqueados';   // los que tu bloqueas en el dashboard, aparte

/* Prefijos que SIEMPRE se ignoran, aunque no esten en la lista del dashboard:
   RES- (primeras publicaciones sin stock), WL- (listings viejos) y OB-
   (publicaciones viejas openbox). Ancla al inicio: el sufijo -OB del final
   son los openbox de verdad, esos NO se tocan. */
var WD_RE_PREFIJO_BLOQ = /^(RES|WL|OB)-/i;
var WD_PROP = { LIBRO: 'WM_DASHBOARD_ID', MARCA: 'WM_DASHBOARD_MARCA' };

var WD_ORIGEN = { INV: 'Inventario', MKP: 'Inv_Normal', LOG: 'Sync_Log', BLOQ: 'Bloqueados' };

/**
 * Las 8 primeras son las que de verdad se usan y van en el mismo orden que
 * en el dashboard (sku, shelf, upc, gtin, price, publishedStatus,
 * wfsDisponible, invNormal). Las 4 de atras son de apoyo. Se quitaron WPID
 * y WFS ESTADO: nadie los ocupaba.
 *
 * Las columnas del origen SIEMPRE se buscan por nombre (wdIndices_), nunca
 * por letra: el 17/09 el dashboard v1.1 metio tres columnas nuevas despues
 * de publishedStatus y todo lo de esWFS en adelante se recorrio 3 lugares.
 * Buscando por nombre eso no importa.
 */
var WD_COLUMNAS = [
  'SKU', 'DEPARTAMENTO', 'UPC', 'GTIN', 'PRECIO', 'ESTATUS',
  'WFS', 'INV NORMAL', 'NOMBRE', 'CATEGORIA', 'ES WFS', 'ACTUALIZADO'
];
var WD_COL = {
  SKU:1, DEPTO:2, UPC:3, GTIN:4, PRECIO:5, ESTATUS:6,
  WFS:7, MKP:8, NOMBRE:9, CATEGORIA:10, ES_WFS:11, ACT:12
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

/**
 * Escribe la hoja "Walmart" desde el dashboard.
 *
 * Sale en un segundo si el dashboard no ha vuelto a correr desde la ultima vez.
 * Esto importa: el trigger va cada 15 minutos, o sea 96 corridas al dia, y cada
 * reescritura completa lee ~124,000 celdas y escribe ~47,000. El presupuesto de
 * triggers de Google es de 90 minutos AL DIA para todo el proyecto, compartido
 * con descargarTodoStock y descargarPrecios. Si el dashboard se cae, se atrasa o
 * simplemente no ha corrido, esas corridas se saltan y no gastan nada.
 *
 * La firma es el ultimo renglon del Sync_Log del dashboard: una lectura de un
 * renglon, no de las 3,341 filas.
 *
 * @param {boolean} [forzar] true reescribe aunque no haya cambios.
 */
function wmWalmartBajar(forzar) {
  var t0 = Date.now();
  var ss = SpreadsheetApp.getActive();

  logStart_('WALMART', 'Bajando hoja Walmart');

  var libro;
  try {
    libro = wdLibro_();
  } catch (e) {
    // Este es EL error que hay que ver: si la cuenta del trigger no puede abrir
    // el dashboard, la hoja se queda vieja y sin esta linea nadie se entera.
    logErr_('WALMART', 'No pude abrir el libro WALMART DASHBOARD', { error: e.message });
    flushLog_();
    throw e;
  }

  // --- Salida rapida: el dashboard no ha corrido desde la ultima vez ---
  var marca = wdMarcaDashboard_(libro);
  if (forzar !== true && wdSinCambios_(ss, marca)) {
    logFinish_('WALMART', 'Bajando hoja Walmart',
      { omitido: true, motivo: 'el dashboard no ha corrido', desde: wdMarcaFecha_(marca) });
    flushLog_();
    wdAvisoSiHayUi_('Walmart',
      'El dashboard no ha vuelto a correr desde la ultima bajada,\n' +
      'asi que la hoja "' + WD_HOJA + '" ya esta al dia. No se reescribio nada.\n\n' +
      'Ultima corrida del dashboard: ' + wdMarcaFecha_(marca) + '\n\n' +
      'Si aun asi quieres rehacerla, corre wmWalmartBajarForzado().');
    return { omitido: true, marca: marca, segundos: Math.round((Date.now() - t0) / 1000) };
  }

  // --- Inventario ---
  var hInv = libro.getSheetByName(WD_ORIGEN.INV);
  if (!hInv || hInv.getLastRow() < 2) {
    logErr_('WALMART', 'El dashboard no tiene datos en "' + WD_ORIGEN.INV + '"');
    flushLog_();
    throw new Error('El dashboard no tiene datos en "' + WD_ORIGEN.INV + '".');
  }
  var inv = hInv.getRange(1, 1, hInv.getLastRow(), hInv.getLastColumn()).getValues();
  var ci = wdIndices_(inv[0]);

  /* Las columnas se buscan por nombre, asi que moverlas de lugar no rompe
     nada; RENOMBRARLAS si. Sin esta revision el indice se queda en -1, la
     columna sale vacia y nadie se entera. */
  var sinColumna = [];
  ['sku', 'shelf', 'upc', 'gtin', 'price', 'publishedStatus',
   'wfsDisponible', 'invNormal'].forEach(function (k) {
    if (ci[k] === -1) sinColumna.push(k);
  });
  if (sinColumna.length) {
    logErr_('WALMART', 'El dashboard ya no trae estas columnas: ' + sinColumna.join(', '),
            { encabezados: inv[0].join(' | ') });
    flushLog_();
    throw new Error('El dashboard cambio de columnas y faltan: ' + sinColumna.join(', ') +
                    '. Revisa la hoja "' + WD_ORIGEN.INV + '".');
  }

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

  /* Lista de SKUs que tu bloqueas desde el dashboard (hoja Bloqueados).
     Es la unica fuente de verdad del bloqueo: dentro de Inventario un SKU
     bloqueado puede seguir apareciendo como PUBLISHED, asi que se cruza el
     SKU contra esta lista, no se lee ningun estado. */
  var bloq = wdBloqueados_(libro);

  var filas = [];       // los limpios: van a la hoja Walmart
  var filasBloq = [];   // los bloqueados: van a la hoja Bloqueados, aparte
  for (var i = 1; i < inv.length; i++) {
    var f = inv[i];
    var sku = String(f[ci.sku] || '').trim();
    if (!sku) continue;
    /* invNormal viene en la misma hoja Inventario. Antes se sacaba de
       Inv_Normal con un VLOOKUP y 36 SKUs se quedaban en blanco porque esa
       hoja trae menos filas. La hoja aparte solo se usa si la columna no
       existiera. */
    var normal = ci.invNormal >= 0 ? wdNum_(f[ci.invNormal])
                                   : (mkp[sku] === undefined ? '' : mkp[sku]);
    var fila = [
      sku,
      f[ci.shelf] || '',
      wdGtin_(f[ci.upc]),
      wdGtin_(f[ci.gtin]),
      wdNum_(f[ci.price]),
      f[ci.publishedStatus] || '',
      wdNum_(f[ci.wfsDisponible]),
      normal,
      f[ci.productName] || '',
      f[ci.productType] || '',
      wdSiNo_(f[ci.esWFS]),
      wdFecha_(f[ci.wfsActualizado])
    ];
    if (bloq[sku.toUpperCase()] || WD_RE_PREFIJO_BLOQ.test(sku)) filasBloq.push(fila);
    else filas.push(fila);
  }

  wdEscribir_(filas, WD_HOJA);
  wdEscribir_(filasBloq, WD_HOJA_BLOQ);

  // Se guarda DESPUES de escribir: si la escritura truena, la proxima corrida
  // vuelve a intentarlo en vez de creer que ya quedo.
  if (marca) {
    try { PropertiesService.getScriptProperties().setProperty(WD_PROP.MARCA, marca); } catch (e) {}
  }

  var r = wdResumen_(filas);

  // La huella en el Log es lo unico que deja ver desde el Sheet si el trigger
  // de 15 minutos esta corriendo: los triggers solo salen en "Ejecuciones".
  logFinish_('WALMART', 'Bajando hoja Walmart', {
    filas: filas.length, bloqueados: filasBloq.length,
    enWfs: r.enWfs, msiFuera: r.msiFuera, ms: Date.now() - t0
  });
  flushLog_();

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
    'Bloqueados (hoja aparte):  ' + filasBloq.length + '\n\n' +
    'Tardo ' + Math.round((Date.now() - t0) / 1000) + ' s. Cero llamadas de UrlFetch.');

  return r;
}

/** Rehace la hoja aunque el dashboard no haya corrido. */
function wmWalmartBajarForzado() {
  return wmWalmartBajar(true);
}

/* ================================================================== */
/*  Guardia: no reescribir si el dashboard no ha corrido               */
/* ================================================================== */

/**
 * Firma de la ultima corrida del dashboard: numero de renglon del Sync_Log
 * mas su contenido. Cambia en cuanto el dashboard escribe una linea nueva.
 * Si no hay Sync_Log o no se puede leer, devuelve '' y la guardia se apaga
 * sola: mas vale reescribir de mas que quedarse con datos viejos.
 */
function wdMarcaDashboard_(libro) {
  try {
    var h = libro.getSheetByName(WD_ORIGEN.LOG);
    if (!h) return '';
    var n = h.getLastRow();
    if (n < 2) return '';
    var nc = Math.min(h.getLastColumn(), 6);
    var f = h.getRange(n, 1, 1, nc).getValues()[0];
    var partes = f.map(function (v) {
      if (v instanceof Date) return String(v.getTime());
      return String(v === null || v === undefined ? '' : v);
    });
    return n + '|' + partes.join('|');
  } catch (e) {
    return '';
  }
}

/**
 * Se puede saltar la corrida solo si se cumple TODO:
 *   - hay firma del dashboard
 *   - es identica a la de la ultima escritura
 *   - la hoja "Walmart" existe y trae datos
 * Lo ultimo es lo que hace que la guardia se cure sola: si alguien borra la
 * hoja o la vacia, la siguiente corrida la rehace aunque la firma coincida.
 */
function wdSinCambios_(ss, marca) {
  if (!marca) return false;
  var prev = '';
  try { prev = PropertiesService.getScriptProperties().getProperty(WD_PROP.MARCA) || ''; } catch (e) {}
  if (prev !== marca) return false;
  var h = ss.getSheetByName(WD_HOJA);
  if (!h || h.getLastRow() < 2) return false;
  if (h.getLastColumn() !== WD_COLUMNAS.length) return false;   // cambio el formato
  return true;
}

/** Saca de la firma algo legible para el aviso. */
function wdMarcaFecha_(marca) {
  var partes = String(marca || '').split('|');
  for (var i = 1; i < partes.length; i++) {
    var v = partes[i];
    if (/^\d{12,}$/.test(v)) {
      return Utilities.formatDate(new Date(Number(v)),
        Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    }
    var d = new Date(v);
    if (v && !isNaN(d.getTime()) && /\d{4}/.test(v)) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    }
  }
  return partes.slice(1).join(' ') || '(sin fecha en el Sync_Log)';
}

/* ================================================================== */

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

/**
 * SKUs bloqueados desde el dashboard (hoja "Bloqueados", columna sku).
 * Devuelve un objeto {SKU_EN_MAYUSCULAS: true} para checar pertenencia
 * rapido. Si la hoja no existe, no bloquea nada (objeto vacio).
 */
function wdBloqueados_(libro) {
  var set = {};
  try {
    var h = libro.getSheetByName(WD_ORIGEN.BLOQ);
    if (!h || h.getLastRow() < 2) return set;
    var d = h.getRange(1, 1, h.getLastRow(), h.getLastColumn()).getValues();
    var ci = wdIndices_(d[0]);
    var cSku = ci.sku >= 0 ? ci.sku : 0;   // col A es 'sku' en el dashboard
    for (var i = 1; i < d.length; i++) {
      var k = String(d[i][cSku] || '').trim().toUpperCase();
      if (k) set[k] = true;
    }
  } catch (e) { /* sin hoja de bloqueados, no se filtra nada */ }
  return set;
}

function wdEscribir_(filas, nombre) {
  nombre = nombre || WD_HOJA;
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName(nombre);
  if (!h) h = ss.insertSheet(nombre);

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

    /* El formato se fija SIEMPRE, columna por columna, antes y despues de
       escribir. Si no, la hoja se queda con el formato que tenia de antes:
       asi fue como wfsDisponible acabo mostrando fechas de 1900 cuando el
       dashboard se recorrio. Texto primero, para no perder ceros a la
       izquierda en los codigos. */
    h.getRange(2, WD_COL.UPC, n, 2).setNumberFormat('@');          // UPC, GTIN
    h.getRange(2, WD_COL.SKU, n, 2).setNumberFormat('@');          // SKU, DEPARTAMENTO
    h.getRange(2, WD_COL.ESTATUS, n, 1).setNumberFormat('@');
    h.getRange(2, WD_COL.NOMBRE, n, 3).setNumberFormat('@');       // NOMBRE, CATEGORIA, ES WFS

    h.getRange(2, 1, n, nC).setValues(filas);

    h.getRange(2, WD_COL.PRECIO, n, 1).setNumberFormat('#,##0.00');
    h.getRange(2, WD_COL.WFS, n, 2).setNumberFormat('#,##0');      // WFS, INV NORMAL
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
    invNormal:       b(['invNormal']),
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

/**
 * Numero, aguantando que la celda de origen traiga formato de fecha.
 *
 * El 17/09 el dashboard v1.1 metio tres columnas nuevas despues de
 * publishedStatus y todo lo que venia de esWFS en adelante se recorrio.
 * Los datos quedaron bien, pero el FORMATO vive en la columna, no en el dato:
 * wfsDisponible cayo donde antes estaba invRevisado y heredo su formato de
 * fecha. Entonces getValues() ya no devuelve 20, devuelve un Date, y
 * Number(Date) da los milisegundos desde 1970 (-2209137804000 para el cero).
 * Aqui se regresa el numero de serie de Sheets, que es el valor de verdad.
 */
function wdNum_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    var serie = (v.getTime() - new Date(1899, 11, 30).getTime()) / 86400000;
    return Math.round(serie * 1e6) / 1e6;
  }
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

/** Igual que wdAviso_, pero desde un trigger ni siquiera arma el texto. */
function wdAvisoSiHayUi_(titulo, msg) {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { return; }
  Logger.log(titulo + '\n' + msg);
  try { ui.alert(titulo, String(msg).slice(0, 4000), ui.ButtonSet.OK); } catch (e) {}
}
