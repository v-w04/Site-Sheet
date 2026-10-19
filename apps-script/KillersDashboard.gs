/**
 * KillersDashboard.gs — Site Sheet
 *
 * Baja la pestana "Dashboard" de /walmart/killers (Ofertas Especiales) tal
 * cual la manda el site.
 *
 *     GET https://electronicsmexico.site/walmart/killers/api/dashboard
 *
 * REGLA (desde 14-oct-2026): la lista YA NO se baja tal cual. Se calcula aqui,
 * igual que Venta Diaria, para que los correos a los KAMs coincidan:
 *   PAGAN  = NEGOCIADO + CUPON (hoja Killers; NOS PAGAN del site no sirve).
 *   MINIMO = "Walmart Premium" si el SKU termina en -MSI / -MSI-2..9, si no
 *            "Walmart Clasica", de "Precios EM Minimo" y luego "Precios CVA
 *            Minimo" (gana la primera aparicion). Minimo 0 o vacio: no entra.
 *   Promocion (hoja Promociones): solo PUNTOS DE DESCUENTO, y solo si APLICA=SI,
 *            EN EL SITE=SI, CAT COINCIDE=SI, ESTADO activa o sin_fecha, y
 *            APLICA A cubre el tipo del SKU (si dice premium, la clasica no la
 *            tiene: videojuegos). Minimo aplicable = minimo x (1 - puntos/100).
 *   % PERDIDA = (minimo aplicable - PAGAN) / minimo aplicable, nunca menor a 0.
 *   Solo entran los de perdida MAYOR a 3% (KC_PERDIDA_MIN). Se excluyen los
 *   bloqueados (hoja Bloqueados) y los SKU de KD_EXCLUIDOS (precio libre).
 * El dashboard del site se sigue pidiendo solo para la categoria y la nota.
 *
 * Columnas: las 11 del site (A-K), luego CATEGORIA (L), CATEGORIA KAM (M, segun
 * la hoja KAMS), % PERDIDA (N, calculada como arriba; se queda en N), y despues DEPARTAMENTO WALMART, UPC y GTIN.
 *
 * CATEGORIA: el dashboard no la trae para killers_falta. Se busca en este orden:
 * `cat` de `propuestas` (site) -> CATEGORIA ODOO del Concentrado -> CATEGORIA de
 * la hoja Walmart. DEPARTAMENTO, UPC y GTIN salen de la hoja Walmart por SKU.
 * Son busquedas, no calculos.
 *
 * Uso:  kdBajar()  (menu Killers > Calcular killers bajo minimo)
 * Cada hora: lo llama killersProgramado(); solo reescribe si el site cambio.
 */

var KD_RUTA_DEFAULT = '/walmart/killers/api/dashboard';
var KD_PROP_RUTA    = 'DASHBOARD_RUTA';
var KD_PROP_HUELLA  = 'DASHBOARD_HUELLA';

var KD_HOJA_BAJO    = 'Killers bajo minimo';

/* true = al minimo de Precios se le restan los puntos de la promocion (regla de Venta Diaria).
   false = se usa el minimo de Precios tal cual. OJO: hoy el minimo de Precios EM/CVA ya trae la
   promo descontada en los 78 SKU con promocion (coincide con MINIMO PREMIUM de Promociones). */
var KD_APLICAR_PUNTOS = false;   // 19-oct-2026: la verdad es el minimo que viene del site (Precios EM/CVA Minimo); ya trae la promo. No se descuenta dos veces.

/* SKU que Luis vende mas baratos a proposito: nunca entran a la lista ni al correo. Editar aqui. */
var KD_EXCLUIDOS = [
  'HP-35D67AA-NEG-9383-MSI-2',
  'AMA-53034095-NEG-4699-MSI'
];

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
  try { r = kdTraer_(); }
  catch (e) { r = { json: {}, texto: '', ruta: '(sin dashboard del site: la lista se calcula aqui)' }; }
  var res = kdEscribir_(r);
  PropertiesService.getScriptProperties().setProperty(KD_PROP_HUELLA, kdHuellaCalculo_() + '.' + kdFirmaKams_());
  kAviso_('Dashboard', res.resumen);
  return res.resumen;
}

/** Lo llama killersProgramado() cada hora. Solo escribe si cambio. */
function dashboardProgramado_() {
  var props = PropertiesService.getScriptProperties();
  var r;
  try { r = kdTraer_(); }
  catch (e) { r = { json: {}, texto: '', ruta: '(sin dashboard del site: la lista se calcula aqui)' }; }   // el site solo aporta categorias

  // La huella incluye la hoja KAMS: si cambias el mapa de categorias, se reescribe aunque el site no cambie.
  // Y si la hoja de killers no existe (la borraron o nunca se escribio), tambien se reescribe.
  var huella = kdHuellaCalculo_() + '.' + kdFirmaKams_();
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

  var calc = kdCalcular_();
  var cab = KD_COLS_BAJO.map(function (c) { return c[0]; })
            .concat([KD_COL_CATEGORIA, KD_COL_CAT_KAM, KD_COL_PCT, KD_COL_DEPTO, 'UPC', 'GTIN']);
  var sinCat = 0, sinKam = 0;
  var filas = calc.filas.map(function (f11) {
    var sku = String(f11[0]).toUpperCase(), base = String(f11[1]).toUpperCase();
    var o = { sku: f11[0], sku_base: f11[1] };
    var w = ap.wm[sku] || ap.wm[base] || {};
    var cat = (cats ? kdCategoriaDe_(cats, o) : '') || ap.conc[sku] || ap.conc[base] || w.cat || '';
    var grupo = '';
    if (kams) grupo = kamsGrupoDe_(kams, [w.dep, cat, w.cat]) || 'SIN KAM';
    if (!cat) sinCat++;
    if (grupo === 'SIN KAM') sinKam++;
    return f11.slice(0, 11).concat([cat, grupo, f11[11], w.dep || '', w.upc || '', w.gtin || '']);
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

  // hoja Correo = vista previa de los correos (solo perdida > 3%); si falla no tumba la bajada
  try { kdReintentar_(kcRefrescarCorreo_); } catch (e) { console.log('Correo: ' + e.message); }

  var resumen = 'Killers bajo minimo: ' + filas.length + ' killers.\n' +
    (sinCat ? '⚠ ' + sinCat + ' sin categoria.\n' : '') +
    (sinKam ? '⚠ ' + sinKam + ' sin KAM (agrega su departamento/categoria en la hoja KAMS Departamentos).\n' : '') +
    (kams ? '' : '⚠ No pude leer la hoja KAMS.\n') +
    calc.resumen;
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


/* ================================================================== */
/*  Calculo (misma regla que Venta Diaria)                             */
/* ================================================================== */

function kdTabla_(nombre) {
  var h = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!h || h.getLastRow() < 2) return null;
  return h.getDataRange().getValues();
}

function kdNum_(v) {
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v === null || v === undefined ? '' : v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

/** Huella de lo que alimenta el calculo; si cambia algo, se reescribe la hoja. */
function kdHuellaCalculo_() {
  try { return sha256_(JSON.stringify(kdCalcular_().filas)).substring(0, 16); }
  catch (e) { return 'err-' + Date.now(); }
}

/**
 * Devuelve { filas: [[11 columnas del site..., pct(posicion 11)]], resumen }.
 * Orden de cada fila: SKU, SKU BASE, PRODUCTO, PRECIO KILLER(=NEGOCIADO), CUPON,
 * NOS PAGAN(=NEGOCIADO+CUPON), MINIMO(aplicable), FALTA, INICIA, TERMINA, DIAS, %PERDIDA.
 */
function kdCalcular_() {
  var kil = kdTabla_('Killers');
  if (!kil) throw new Error('La hoja Killers esta vacia: no hay con que calcular.');
  var ck = colsDe_(kil[0], ['SKU', 'NEGOCIADO', 'CUPON'], 'Killers', ['SKU BASE', 'TITULO', 'INICIA', 'TERMINA', 'DIAS']);

  // minimos: EM primero, CVA despues; la primera aparicion gana
  var minimos = {};
  ['Precios EM Minimo', 'Precios CVA Minimo'].forEach(function (nom) {
    var t = kdTabla_(nom);
    if (!t) return;
    var c = colsDe_(t[0], ['SKU', 'Walmart Clasica', 'Walmart Premium'], nom);
    for (var i = 1; i < t.length; i++) {
      var k = String(t[i][c['SKU']]).trim().toUpperCase();
      if (k && !minimos[k]) minimos[k] = { cla: kdNum_(t[i][c['Walmart Clasica']]), pre: kdNum_(t[i][c['Walmart Premium']]) };
    }
  });

  // promociones vigentes: SKU -> {pts, aplicaA}
  var promos = {};
  var tp = kdTabla_('Promociones');
  if (tp) {
    var cp = colsDe_(tp[0], ['SKU', 'APLICA', 'EN EL SITE', 'PUNTOS DE DESCUENTO'], 'Promociones', ['CAT COINCIDE', 'ESTADO', 'APLICA A']);
    var sn = function (v) { return normEnc_(v); };
    for (var j = 1; j < tp.length; j++) {
      var r = tp[j], kp = String(r[cp['SKU']]).trim().toUpperCase();
      if (!kp) continue;
      if (sn(r[cp['APLICA']]) !== 'SI' || sn(r[cp['EN EL SITE']]) !== 'SI') continue;
      if (cp['CAT COINCIDE'] >= 0 && sn(r[cp['CAT COINCIDE']]) !== 'SI') continue;
      var est = cp['ESTADO'] >= 0 ? String(r[cp['ESTADO']]).trim().toLowerCase() : 'activa';
      if (est && est !== 'activa' && est !== 'sin_fecha') continue;
      var pts = kdNum_(r[cp['PUNTOS DE DESCUENTO']]);
      if (!(pts > 0)) continue;
      promos[kp] = { pts: pts, aplicaA: cp['APLICA A'] >= 0 ? normEnc_(r[cp['APLICA A']]).toLowerCase() : 'ambas' };
    }
  }

  var bloq = wdBloqueados_(SpreadsheetApp.getActive());
  var excl = {}; KD_EXCLUIDOS.forEach(function (k) { excl[String(k).toUpperCase()] = true; });

  var filas = [], nBloq = 0, nExcl = 0, nSinMin = 0, nPromo = 0, total = 0;
  for (var i = 1; i < kil.length; i++) {
    var f = kil[i];
    var sku = String(f[ck['SKU']]).trim();
    if (!sku) continue;
    total++;
    var U = sku.toUpperCase();
    var base = (ck['SKU BASE'] >= 0 ? String(f[ck['SKU BASE']]).trim() : '') || sku.replace(/-MSI(-\d)?$/i, '');
    var B = base.toUpperCase();
    if (excl[U]) { nExcl++; continue; }
    if (bloq[U] || bloq[B]) { nBloq++; continue; }

    var neg = kdNum_(f[ck['NEGOCIADO']]), cup = kdNum_(f[ck['CUPON']]);
    var pago = neg + cup;
    var m = minimos[B] || minimos[U];
    var premium = /-MSI(-\d)?$/i.test(U);
    var min = m ? (premium ? m.pre : m.cla) : 0;
    if (!(min > 0) || !(neg > 0)) { nSinMin++; continue; }

    var pr = promos[B] || promos[U];
    if (KD_APLICAR_PUNTOS && pr && !(pr.aplicaA === 'premium' && !premium) && !(pr.aplicaA === 'clasica' && premium)) {
      min = min * (1 - pr.pts / 100);
      nPromo++;
    }
    min = Math.round(min * 100) / 100;
    var falta = Math.max(0, Math.round((min - pago) * 100) / 100);
    var pct = falta / min;
    if (!(pct > KC_PERDIDA_MIN)) continue;

    filas.push([sku, base, ck['TITULO'] >= 0 ? f[ck['TITULO']] : '', neg, cup, pago, min, falta,
                ck['INICIA'] >= 0 ? f[ck['INICIA']] : '', ck['TERMINA'] >= 0 ? f[ck['TERMINA']] : '',
                ck['DIAS'] >= 0 ? f[ck['DIAS']] : '', pct]);
  }
  filas.sort(function (a, b) { return b[11] - a[11]; });

  var resumen = '\nCalculado aqui (misma regla que Venta Diaria): ' + total + ' killers revisados, ' +
    filas.length + ' pierden mas de ' + Math.round(KC_PERDIDA_MIN * 100) + '%.\n' +
    nPromo + ' con promocion aplicada; ' + nBloq + ' bloqueados y ' + nExcl + ' de precio libre fuera; ' +
    nSinMin + ' sin minimo o sin negociado.';
  return { filas: filas, resumen: resumen };
}
