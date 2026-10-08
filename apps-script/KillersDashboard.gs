/**
 * KillersDashboard.gs — Site Sheet
 *
 * Baja la pestana "Dashboard" de /walmart/killers (Ofertas Especiales) tal
 * cual la manda el site.
 *
 *     GET https://electronicsmexico.site/walmart/killers/api/dashboard
 *
 * REGLA: aqui no se calcula nada. Cada numero, lista y porcentaje se escribe
 * como llego; lo que el site no manda, no existe en la hoja.
 *
 * Que trae el JSON y en que hoja cae:
 *
 *   escalares (edad_killers_h, killers_falta_pesos, cortes.pesos,
 *   cortes.cortes ...)                              -> "Dashboard"
 *
 *   killers_falta   "Killers que no cubren tu minimo" -> "Killers bajo minimo"
 *                   (+ CATEGORIA al final, del site)
 *
 *   cortes.skus     "Walmart cobro distinto", una fila por SKU y corte
 *                                                    -> "Cobros distintos"
 *   cortes.skus[].filas[].detalle  los pedidos       -> "Cobros detalle"
 *
 * Al final de esa hoja: CATEGORIA (del site), CATEGORIA KAM (segun la hoja KAMS)
 * y % PERDIDA = FALTA / MINIMO (el unico calculo, pedido a proposito).
 *
 * CATEGORIA: el dashboard no la trae para killers_falta. Se toma del campo
 * `cat` de `propuestas` en /walmart/killers/api/data (el site la manda por
 * SKU). Es una busqueda, no un calculo.
 *
 * Uso:  kdBajar()  (menu Killers > Bajar dashboard del site)
 * Cada hora: lo llama killersProgramado(); solo reescribe si el site cambio.
 */

var KD_RUTA_DEFAULT = '/walmart/killers/api/dashboard';
var KD_PROP_RUTA    = 'DASHBOARD_RUTA';
var KD_PROP_HUELLA  = 'DASHBOARD_HUELLA';

var KD_HOJA_RESUMEN = 'Dashboard';
var KD_HOJA_BAJO    = 'Killers bajo minimo';
var KD_HOJA_COBROS  = 'Cobros distintos';
var KD_HOJA_DETALLE = 'Cobros detalle';

/* [encabezado, campo del site] */
var KD_COLS_BAJO = [
  ['SKU WALMART',  'sku'],
  ['SKU BASE',     'sku_base'],
  ['PRODUCTO',     'titulo'],
  ['PRECIO KILLER','actual'],
  ['CUPON',        'cupon'],
  ['NOS PAGAN',    'recibimos'],
  ['MINIMO',       'kam_minimo'],
  ['FALTA',        'kam_falta'],
  ['INICIA',       'ini'],
  ['TERMINA',      'fin'],
  ['DIAS',         'dias_restantes']
];

/* Columnas que se agregan al final de "Killers bajo minimo". Aqui SI se calcula
   (lo pidio el): % PERDIDA = FALTA / MINIMO. El % va siempre al final. */
var KD_COL_CATEGORIA = 'CATEGORIA';
var KD_COL_CAT_KAM   = 'CATEGORIA KAM';
var KD_COL_PCT       = '% PERDIDA';

var KD_COLS_COBROS = [
  ['SKU',            'sku'],
  ['SKU BASE',       'base'],
  ['CORTE',          'corte'],
  ['PUBLICACION',    'pub'],
  ['CAT QUE COBRA',  'cat_cobra'],
  ['CAT DEBIDA',     'cat_debida'],
  ['CAT PROMO',      'promo_cat'],
  ['CAUSA',          'causa'],
  ['COBRADO %',      'cobrado'],
  ['DEBIDO %',       'debido'],
  ['DIFERENCIA $',   'dif'],
  ['PEDIDOS',        'pedidos']
];

var KD_COLS_DETALLE = [
  ['SKU',        'sku'],
  ['CORTE',      'corte'],
  ['PEDIDO',     'pedido'],
  ['VENTA',      'venta'],
  ['COMISION $', 'com'],
  ['TASA %',     't'],
  ['ENVIO',      'envio'],
  ['KILLER',     'killer'],
  ['COM KILLER', 'kcom'],
  ['FECHA',      'fecha']
];

/* ================================================================== */
/*  Bajada                                                             */
/* ================================================================== */

/** Menu: baja, escribe y avisa. */
function kdBajar() {
  var r;
  try {
    r = kdTraer_();
  } catch (e) {
    var url = kdPedirRuta_(e.message);
    if (!url) return;
    PropertiesService.getScriptProperties().setProperty(KD_PROP_RUTA, url);
    r = kdTraer_();
  }
  var res = kdEscribir_(r);
  PropertiesService.getScriptProperties().setProperty(KD_PROP_HUELLA, sha256_(r.texto) + '.' + kdFirmaKams_());
  kAviso_('Dashboard', res.resumen);
  return res.resumen;
}

/** Lo llama killersProgramado() cada hora. Solo escribe si cambio. */
function dashboardProgramado_() {
  var props = PropertiesService.getScriptProperties();
  var r;
  try { r = kdTraer_(); }
  catch (e) {
    kUnaVezAlDia_('dashboard-error', function () {
      logWarn_('KILLERS', 'Dashboard del site: ' + String(e.message).split('\n')[0]);
    });
    return;
  }

  // La huella incluye la hoja KAMS: si cambias el mapa de categorias, se reescribe aunque el site no cambie.
  // Y si la hoja de killers no existe (la borraron o nunca se escribio), tambien se reescribe.
  var huella = sha256_(r.texto) + '.' + kdFirmaKams_();
  var hojaOk = !!SpreadsheetApp.getActive().getSheetByName(KD_HOJA_BAJO);
  if (hojaOk && huella === props.getProperty(KD_PROP_HUELLA)) return;   // igual que la ultima vez

  var res;
  try { res = kdEscribir_(r); }
  catch (e) {
    // sin guardar huella: la siguiente hora lo vuelve a intentar
    kUnaVezAlDia_('dashboard-escritura', function () {
      logWarn_('KILLERS', 'Dashboard: no se pudo escribir, se reintenta en la siguiente corrida', { error: String(e.message).split('\n')[0] });
    });
    return;
  }
  props.setProperty(KD_PROP_HUELLA, huella);
  logOk_('KILLERS', 'Dashboard actualizado: ' + res.bajo + ' bajo minimo, ' +
                    res.cobros + ' cobros distintos');
}

/** Firma corta de la hoja KAMS (correos y categorias), para saber si cambio el mapa. */
function kdFirmaKams_() {
  try {
    var h = SpreadsheetApp.getActive().getSheetByName('KAMS');
    if (!h || h.getLastRow() < 2) return 'sin-kams';
    return sha256_(JSON.stringify(h.getDataRange().getValues())).substring(0, 12);
  } catch (e) { return 'err'; }
}

function kdTraer_() {
  var ruta = PropertiesService.getScriptProperties().getProperty(KD_PROP_RUTA) || KD_RUTA_DEFAULT;
  var r = kTraer_(ruta);
  r.ruta = ruta;
  return r;
}

function kdPedirRuta_(motivo) {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { throw new Error(motivo); }
  var p = ui.prompt('Ruta del dashboard',
    String(motivo).substring(0, 700) + '\n\n' +
    'En el navegador: F12 > Network > clic derecho en la fila "dashboard" > ' +
    'Copy > Copy URL. Pegala aqui:', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return '';
  var t = String(p.getResponseText() || '').trim();
  if (!t) return '';
  t = t.replace(/^https?:\/\/[^\/]+/i, '');
  t = t.replace(/([?&])_=\d+/, '').replace(/[?&]$/, '');
  return t.charAt(0) === '/' ? t : '/' + t;
}

/* ================================================================== */
/*  Escritura (sin calculos)                                           */
/* ================================================================== */

/**
 * Google a veces contesta "Se agoto el tiempo de espera del servicio Hojas de calculo"
 * cuando el libro esta ocupado (los procesos de cada 15 min escriben al mismo tiempo).
 * Es pasajero: se espera y se reintenta. Cualquier otro error se deja pasar.
 */
function kdReintentar_(fn) {
  var ult;
  for (var i = 0; i < 4; i++) {
    try { return fn(); }
    catch (e) {
      ult = e;
      if (!/tiempo de espera|timed out|timeout|Service Spreadsheets|servicio Hojas/i.test(String(e && e.message || e))) throw e;
      Utilities.sleep(5000 * (i + 1));
    }
  }
  throw ult;
}

function kdEscribir_(r) {
  var j = r.json || {};
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var nota = 'Bajado del site el ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm') +
             '\nRuta: ' + r.ruta;

  // --- Dashboard: los datos sueltos, tal cual (se escribe al final) ---
  var escalares = [];
  kdRecorrer_(j, '', escalares);

  // --- Killers que no cubren el minimo ---
  var cats = kdCategorias_();
  var kams = null;
  try { kams = kdReintentar_(function () { return kamsLeer_(); }); } catch (e) { console.log('KAMS: ' + e.message); }
  var bajo = Array.isArray(j.killers_falta) ? j.killers_falta : [];
  var cabBajo = KD_COLS_BAJO.map(function (c) { return c[0]; })
                .concat([KD_COL_CATEGORIA, KD_COL_CAT_KAM, KD_COL_PCT]);
  var iMin = KD_COLS_BAJO.map(function (c) { return c[1]; }).indexOf('kam_minimo');
  var iFal = KD_COLS_BAJO.map(function (c) { return c[1]; }).indexOf('kam_falta');
  var filasBajo = bajo.map(function (o) {
    var f = KD_COLS_BAJO.map(function (c) { return kdCelda_(o[c[1]]); });
    var cat = cats ? kdCategoriaDe_(cats, o) : '';
    var grupo = '';
    if (kams) grupo = kamsGrupoDe_(kams, cat) || 'SIN KAM';
    var min = Number(o.kam_minimo), fal = Number(o.kam_falta);
    var pct = (min > 0 && !isNaN(fal)) ? fal / min : '';
    return f.concat([cat, grupo, pct]);
  });
  var fallos = [];
  var paso = function (nombre, fn) {
    try { kdReintentar_(fn); } catch (e) { fallos.push(nombre + ': ' + e.message); logWarn_('KILLERS', 'Dashboard: no pude escribir ' + nombre, { error: e.message }); }
  };
  // la que mas te importa va primero
  paso(KD_HOJA_BAJO, function () {
    var hBajo = kdHoja_(KD_HOJA_BAJO, [cabBajo].concat(filasBajo), nota);
    if (filasBajo.length) hBajo.getRange(2, cabBajo.length, filasBajo.length, 1).setNumberFormat('0.0%');
  });

  // --- Walmart cobro distinto ---
  var skus = (j.cortes && Array.isArray(j.cortes.skus)) ? j.cortes.skus : [];
  var filasCobros = [], filasDetalle = [];
  skus.forEach(function (s) {
    (s.filas || []).forEach(function (fi) {
      filasCobros.push(KD_COLS_COBROS.map(function (c) {
        // `base` vive en el SKU, no en la fila de corte
        return kdCelda_(fi[c[1]] !== undefined ? fi[c[1]] : s[c[1]]);
      }));
      (fi.detalle || []).forEach(function (d) {
        filasDetalle.push(KD_COLS_DETALLE.map(function (c) {
          if (c[1] === 'corte') return kdCelda_(fi.corte);
          return kdCelda_(d[c[1]]);
        }));
      });
    });
  });
  paso(KD_HOJA_COBROS,  function () { kdHoja_(KD_HOJA_COBROS,  [KD_COLS_COBROS.map(function (c) { return c[0]; })].concat(filasCobros),  nota); });
  paso(KD_HOJA_DETALLE, function () { kdHoja_(KD_HOJA_DETALLE, [KD_COLS_DETALLE.map(function (c) { return c[0]; })].concat(filasDetalle), nota); });
  paso(KD_HOJA_RESUMEN, function () {
    var hR = kdHoja_(KD_HOJA_RESUMEN, [['CAMPO', 'VALOR']].concat(escalares), nota);
    hR.getRange(1, 2, escalares.length + 1, 1).setHorizontalAlignment('left');
  });
  if (fallos.length) throw new Error('Se escribio lo que se pudo, pero fallo:\n' + fallos.join('\n') + '\n\nVuelve a correrlo en un minuto.');

  var resumen = 'Dashboard bajado del site.\n\n' +
    'Killers bajo minimo:  ' + filasBajo.length + (cats ? '  (con categoria)' : '  (sin categoria: no llego `propuestas`)') + (kams ? '' : '  | sin hoja KAMS') + '\n' +
    'Cobros distintos:     ' + filasCobros.length + ' filas, ' + filasDetalle.length + ' pedidos\n' +
    'Datos sueltos:        ' + escalares.length + '\n\n' +
    'Nada se calculo aqui: es lo que mando el site.';
  return { resumen: resumen, bajo: filasBajo.length, cobros: filasCobros.length };
}

/** Datos sueltos a cualquier profundidad; las listas de objetos se saltan. */
function kdRecorrer_(v, ruta, out) {
  if (Array.isArray(v)) {
    if (v.length && v[0] && typeof v[0] === 'object') return;      // lista de objetos: va a su hoja
    out.push([ruta, v.map(kdCelda_).join(', ')]);
    return;
  }
  if (v && typeof v === 'object') {
    Object.keys(v).forEach(function (k) { kdRecorrer_(v[k], ruta ? ruta + '.' + k : k, out); });
    return;
  }
  out.push([ruta, v === null || v === undefined ? '' : v]);
}

function kdCelda_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function kdHoja_(nombre, filas, nota) {
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  try { var f = h.getFilter(); if (f) f.remove(); } catch (e) {}
  h.clear();

  var nC = filas[0].length;
  if (h.getMaxColumns() < nC) h.insertColumnsAfter(h.getMaxColumns(), nC - h.getMaxColumns());
  if (h.getMaxRows() < filas.length) h.insertRowsAfter(h.getMaxRows(), filas.length - h.getMaxRows());

  h.getRange(1, 1, filas.length, nC).setValues(filas);
  h.getRange(1, 1, 1, nC).setFontWeight('bold').setBackground('#eef2f7');
  h.setFrozenRows(1);
  if (filas.length > 1) h.getRange(1, 1, filas.length, nC).createFilter();
  h.getRange(1, 1).setNote(nota);
  SpreadsheetApp.flush();
  try { h.autoResizeColumns(1, nC); } catch (e) {}
  for (var c = 1; c <= nC; c++) if (h.getColumnWidth(c) > 420) h.setColumnWidth(c, 420);
  return h;
}

/**
 * SKU -> categoria, tal como la manda el site en `propuestas` (campo `cat`).
 * Si no se puede traer, devuelve null y la hoja sale sin esa columna.
 */
function kdCategorias_() {
  try {
    var j = kTraer_().json;
    var props = (j && j.propuestas) || [];
    if (!props.length) return null;
    var mapa = {};
    props.forEach(function (p) {
      var c = p.cat || p.cat_ml || '';
      if (!c) return;
      if (p.sku)      mapa[String(p.sku).toUpperCase()] = c;
      if (p.sku_base && !mapa[String(p.sku_base).toUpperCase()]) mapa[String(p.sku_base).toUpperCase()] = c;
    });
    return mapa;
  } catch (e) { return null; }
}

function kdCategoriaDe_(cats, o) {
  var sku = String(o.sku || '').toUpperCase();
  var base = String(o.sku_base || '').toUpperCase();
  return cats[sku] || cats[base] || '';
}
