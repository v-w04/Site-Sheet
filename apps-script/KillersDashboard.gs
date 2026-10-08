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
 * Solo se baja UNA hoja: "Killers bajo minimo" (killers_falta, "Killers que no
 * cubren tu minimo"). Las demas partes del dashboard (cobros distintos, datos
 * sueltos) NO se bajan: no se pidieron.
 *
 * Columnas: las 11 del site (A-K), luego CATEGORIA (L), CATEGORIA KAM (M, segun
 * la hoja KAMS), % PERDIDA (N, = FALTA / MINIMO, el unico calculo, pedido a
 * proposito; se queda en N), y despues DEPARTAMENTO WALMART, UPC y GTIN.
 *
 * CATEGORIA: el dashboard no la trae para killers_falta. Se busca en este orden:
 * `cat` de `propuestas` (site) -> CATEGORIA ODOO del Concentrado -> CATEGORIA de
 * la hoja Walmart. DEPARTAMENTO, UPC y GTIN salen de la hoja Walmart por SKU.
 * Son busquedas, no calculos.
 *
 * Uso:  kdBajar()  (menu Killers > Bajar dashboard del site)
 * Cada hora: lo llama killersProgramado(); solo reescribe si el site cambio.
 */

var KD_RUTA_DEFAULT = '/walmart/killers/api/dashboard';
var KD_PROP_RUTA    = 'DASHBOARD_RUTA';
var KD_PROP_HUELLA  = 'DASHBOARD_HUELLA';

var KD_HOJA_BAJO    = 'Killers bajo minimo';

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

/* Columnas que se agregan despues de las del site. Aqui SI se calcula
   (lo pidio el): % PERDIDA = FALTA / MINIMO, y va en la columna N. */
var KD_COL_CATEGORIA = 'CATEGORIA';
var KD_COL_CAT_KAM   = 'CATEGORIA KAM';
var KD_COL_PCT       = '% PERDIDA';
var KD_COL_DEPTO     = 'DEPARTAMENTO WALMART';

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
  logOk_('KILLERS', 'Killers bajo minimo actualizado: ' + res.bajo + ' killers');
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
      Utilities.sleep(8000 * (i + 1));
    }
  }
  throw ult;
}

function kdEscribir_(r) {
  var j = r.json || {};
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var nota = 'Bajado del site el ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm') +
             '\nRuta: ' + r.ruta +
             (j.edad_killers_h !== undefined ? '\nEdad de los datos en el site (edad_killers_h): ' + j.edad_killers_h + ' h' : '');

  var cats = kdCategorias_();
  var kams = null;
  try { kams = kdReintentar_(function () { return kamsLeer_(); }); } catch (e) { console.log('KAMS: ' + e.message); }
  var ap = kdApoyo_();

  var bajo = Array.isArray(j.killers_falta) ? j.killers_falta : [];
  var cab = KD_COLS_BAJO.map(function (c) { return c[0]; })
            .concat([KD_COL_CATEGORIA, KD_COL_CAT_KAM, KD_COL_PCT, KD_COL_DEPTO, 'UPC', 'GTIN']);
  var sinCat = 0, sinKam = 0;
  var filas = bajo.map(function (o) {
    var f = KD_COLS_BAJO.map(function (c) { return kdCelda_(o[c[1]]); });
    var sku = String(o.sku || '').toUpperCase(), base = String(o.sku_base || '').toUpperCase();
    var w = ap.wm[sku] || ap.wm[base] || {};
    var cat = (cats ? kdCategoriaDe_(cats, o) : '') || ap.conc[sku] || ap.conc[base] || w.cat || '';
    var grupo = '';
    if (kams) grupo = kamsGrupoDe_(kams, [w.dep, cat, w.cat]) || 'SIN KAM';
    if (!cat) sinCat++;
    if (grupo === 'SIN KAM') sinKam++;
    var min = Number(o.kam_minimo), fal = Number(o.kam_falta);
    var pct = (min > 0 && !isNaN(fal)) ? fal / min : '';
    return f.concat([cat, grupo, pct, w.dep || '', w.upc || '', w.gtin || kdCelda_(o.gtin)]);
  });

  kdReintentar_(function () {
    var h = kdHoja_(KD_HOJA_BAJO, [cab].concat(filas), nota);
    if (filas.length) {
      // posiciones de las columnas que acabamos de escribir nosotros: salen del propio encabezado
      var cu = cab.indexOf('UPC') + 1, cg = cab.indexOf('GTIN') + 1, cp = cab.indexOf(KD_COL_PCT) + 1;
      h.getRange(2, cu, filas.length, 1).setNumberFormat('@');   // UPC y GTIN como texto (ceros al inicio)
      h.getRange(2, cg, filas.length, 1).setNumberFormat('@');
      h.getRange(2, cp, filas.length, 1).setNumberFormat('0.0%');   // % PERDIDA
    }
  });

  var resumen = 'Killers bajo minimo: ' + filas.length + ' killers.\n' +
    (sinCat ? '⚠ ' + sinCat + ' sin categoria.\n' : '') +
    (sinKam ? '⚠ ' + sinKam + ' sin KAM (agrega su departamento/categoria en la hoja KAMS, columna E).\n' : '') +
    (kams ? '' : '⚠ No pude leer la hoja KAMS.\n') +
    '\nNada se calculo aqui, salvo el % de perdida (Falta / Minimo): lo demas es lo que mando el site.';
  return { resumen: resumen, bajo: filas.length };
}

/** Busquedas en hojas que ya estan en el libro: Walmart (departamento, UPC, GTIN, categoria) y Concentrado (categoria Odoo). */
function kdApoyo_() {
  var ss = SpreadsheetApp.getActive();
  var out = { wm: {}, conc: {} };
  try {
    kdReintentar_(function () {
      var h = ss.getSheetByName('Walmart');
      if (!h || h.getLastRow() < 2) return;
      var v = h.getDataRange().getDisplayValues();
      var c = colsDe_(v[0], ['SKU'], 'Walmart', ['DEPARTAMENTO', 'UPC', 'GTIN', 'CATEGORIA']);
      for (var i = 1; i < v.length; i++) {
        var k = String(v[i][c['SKU']]).trim().toUpperCase();
        if (k) out.wm[k] = {
          dep:  c['DEPARTAMENTO'] >= 0 ? v[i][c['DEPARTAMENTO']] : '',
          upc:  c['UPC'] >= 0 ? v[i][c['UPC']] : '',
          gtin: c['GTIN'] >= 0 ? v[i][c['GTIN']] : '',
          cat:  c['CATEGORIA'] >= 0 ? v[i][c['CATEGORIA']] : ''
        };
      }
    });
  } catch (e) { console.log('apoyo Walmart: ' + e.message); }
  try {
    kdReintentar_(function () {
      var h = ss.getSheetByName('Concentrado');
      if (!h || h.getLastRow() < 2) return;
      var v = h.getDataRange().getDisplayValues();
      var c = colsDe_(v[0], ['SKU', 'CATEGORIA ODOO'], 'Concentrado');
      for (var i = 1; i < v.length; i++) {
        var k = String(v[i][c['SKU']]).trim().toUpperCase(), cat = String(v[i][c['CATEGORIA ODOO']]).trim();
        if (k && cat && cat !== 'All') out.conc[k] = cat;
      }
    });
  } catch (e) { console.log('apoyo Concentrado: ' + e.message); }
  return out;
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
