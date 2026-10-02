/**
 * Concentrado.gs — Site Sheet
 *
 * La hoja maestra. Reemplaza el "Concentrado" del libro Inventarios WM, pero
 * sin un solo IMPORTRANGE: todo sale de hojas que este mismo libro ya baja.
 *
 *   Walmart            catalogo, estatus, precios, MKP, WFS   (Walmart.gs)
 *   Catalogo           REFERENCIA, NOMBRE y CATEGORIA de Odoo (Odoo.gs)
 *   Inventario Actual  lo libre en Odoo                       (Stock.gs)
 *   Precios * 6        las 3 bandas por master                (Precios.gs)
 *   Killers            los killers vigentes                   (Killers.gs)
 *   _Marcas            prefijo -> marca                       (Inventarios.gs)
 *
 * Como correrlo: en el editor, funcion armarConcentrado, Ejecutar.
 * Queda con formulas vivas: se actualiza solo cuando corren los triggers.
 *
 * ------------------------------------------------------------------
 * Lo que se arreglo respecto al libro viejo
 * ------------------------------------------------------------------
 * 1. El regex de variantes es UNO SOLO en toda la hoja. En el viejo, AF/AG/AH
 *    usaban "(-MSI-[2-9]|-[2-9])$", que no quita el -MSI solo: un XXX-MSI no
 *    heredaba nada y un XXX-MSI-2 si.
 * 2. Ademas quita el -MSI aunque venga antes del -CVA (PER-...-MSI-CVA), que
 *    el viejo tampoco resolvia.
 * 3. AF buscaba XLOOKUP(base, P:P, P:P): buscaba el SKU dentro de la columna de
 *    precios. Ahora busca donde debe.
 * 4. Nada de rangos cerrados en la fila 4037: todo es abierto.
 * 5. Se fueron COMISION y CF: los precios del site ya traen la comision y
 *    ninguna formula las usaba.
 * 6. Se fue la columna Buybox: llevaba 3,126 filas vacias.
 */

var CC_HOJA = 'Concentrado';

var CC_ENCABEZADOS = [
  'SKU', 'SKU BASE', 'ESTATUS', 'CATEGORIA WM', 'CATEGORIA ODOO', 'NOMBRE',
  'MARCA', 'MODELO', 'PRECIO WM',
  'GTIN', 'UPC', 'WALMART UPC', 'DISPONIBLE ODOO', 'MKP', 'WFS', 'ES WFS',
  'MINIMO', 'NORMAL', 'MAXIMO', 'KILLER', 'CUPON', 'VENDEMOS', 'URL'
];

/* Hojas de las que jala. Si alguna falta, se crea vacia para que no truene. */
var CC_WALMART = 'Walmart';
var CC_CAT     = 'Catalogo';
var CC_STOCK   = 'Inventario Actual';
var CC_KILLERS = 'Killers';
var CC_MARCAS  = '_Marcas';

/**
 * Prefijos que comparten dos marcas (NIN = Nintendo y Ninja, PAN = Panasonic
 * y Pantum...). _Marcas solo admite una marca por prefijo, asi que aqui va la
 * excepcion: si el SKU empieza con PREFIJO y el NOMBRE trae alguna de las
 * palabras (separadas con |), la marca es la de esta hoja. Editable a mano;
 * se aplica al volver a Armar Concentrado / Rehacer Inventarios.
 */
var CC_MARCAS_EXC = '_Marcas Excepciones';
var CC_MARCAS_EXC_BASE = [
  ['NIN', 'NINJA',           'NINJA'],
  ['PAN', 'PANTUM',          'PANTUM'],
  ['HUA', 'HUAWEI|MATEBOOK', 'HUAWEI']
];

/** Respaldos que se conservan por hoja (los mas nuevos). */
var CC_RESPALDOS_CONSERVAR = 1;

/** Hojas sueltas que ya no usa nadie y se quitan al armar. */
/* Hojas que ya no usa nadie y se quitan al armar el Concentrado:
 *   Productos            IMPORTRANGE viejo; el cruce SKU-UPC-nombre ya sale de Catalogo (Odoo)
 *   UBICACIONES(_ACTIVAS) el inventario llega ya sumado del site, el libro no elige ubicaciones
 *   _Comisiones          los precios del site ya traen la comision; nadie la usaba
 *   _CamposOdoo          diagnostico; se vuelve a crear con explorarCamposOdoo() si hace falta
 * OJO: el CODIGO de Odoo (Odoo.gs) se queda; aqui solo se quitan hojas. */
var CC_HOJAS_HUERFANAS = ['Hoja 10', 'Productos', 'UBICACIONES', 'UBICACIONES_ACTIVAS',
                          '_Comisiones', '_CamposOdoo'];

/* Las 6 hojas de precios. Se detectan solas, pero este es el orden esperado. */
var CC_BANDAS = [
  { nombre: 'MINIMO', frag: 'minimo' },
  { nombre: 'NORMAL', frag: 'normal' },
  { nombre: 'MAXIMO', frag: 'maximo' }
];

/* La anatomia del SKU (base, premium, alternas) vive en Config.gs: skuBase_,
   skuEsPremium_, skuEsAlterna_ y SKU_FX_* para las formulas. */

/* ================================================================== */
/*  Entrada                                                            */
/* ================================================================== */

function armarConcentrado() {
  var ss = SpreadsheetApp.getActive();

  // Antes de escribir formulas: que todas las fuentes traigan sus columnas.
  var problemas = revisarEsquemas_(ss);
  if (problemas.length) throw new Error('No se armo el Concentrado:\n\n' + problemas.join('\n'));

  var w = ss.getSheetByName(CC_WALMART);
  if (!w || w.getLastRow() < 2) {
    throw new Error('Falta la hoja "' + CC_WALMART + '". Corre primero wmWalmartBajar().');
  }

  var hojas = ccHojasDePrecios_(ss);
  var faltan = CC_BANDAS.filter(function (b) { return !hojas[b.frag] || !hojas[b.frag].length; });
  if (faltan.length) {
    throw new Error('No encontre hojas de precios para: ' +
                    faltan.map(function (b) { return b.nombre; }).join(', ') +
                    '. Corre primero la bajada de precios.');
  }

  ccAsegurarHoja_(ss, CC_KILLERS, ['SKU', 'TITULO', 'PUBLICADO', 'CUPON', 'NOS PAGAN', 'NEGOCIADO', 'INICIA', 'TERMINA', 'DIAS']);
  ccAsegurarHoja_(ss, CC_MARCAS, ['PREFIJO', 'MARCA']);
  ccSembrarExcepcionesMarca_(ss);
  ccAsegurarHoja_(ss, CC_CAT, ['SKU', 'REFERENCIA', 'NOMBRE', 'CATEGORIA', 'Actualizado']);

  var c = ss.getSheetByName(CC_HOJA);
  if (c) ccRespaldar_(ss, c); else c = ss.insertSheet(CC_HOJA);

  ccPonerFormulas_(c, w.getLastRow(), hojas);
  var limpieza = limpiarHojasViejas_(ss);

  var msg = 'Hoja "' + CC_HOJA + '" armada con ' + CC_ENCABEZADOS.length + ' columnas.\n\n' +
            'Renglones: ' + (w.getLastRow() - 1) + ' (los de la hoja Walmart)\n\n' +
            'Fuentes, todas de este mismo libro:\n' +
            '  Walmart, Catalogo, Inventario Actual,\n' +
            '  ' + CC_BANDAS.map(function (b) { return hojas[b.frag].join(' + '); }).join('\n  ') + ',\n' +
            '  Killers, _Marcas\n\n' +
            'Cero IMPORTRANGE. Corre revisarConcentrado() para ver que tan bien cruzo todo.';
  ccAviso_('Concentrado', msg);
  return msg;
}

/* ================================================================== */
/*  Formulas                                                           */
/* ================================================================== */

function ccPonerFormulas_(c, filasWalmart, hojas) {
  /*
   * TODAS las columnas de otras hojas se buscan por ENCABEZADO (Columnas.gs):
   * fxCol_ / fxBuscar_ usan INDIRECT + MATCH contra la fila 1, asi que mover,
   * insertar o borrar columnas en Walmart, Catalogo, Inventario Actual,
   * Precios, Killers o _Marcas no corre ningun dato.
   *
   * Las referencias a columnas de ESTA misma hoja ($F, $V, $S...) si son por
   * letra; Sheets las ajusta solo si alguien inserta una columna aqui, y el
   * Concentrado se reescribe completo cada vez que se arma.
   */
  var SKU  = '$A2:$A';
  var BASE = '$B2:$B';

  // Las columnas de esta hoja que usan otras formulas, por nombre -> letra
  var L = {};
  CC_ENCABEZADOS.forEach(function (n, i) { L[n] = colLetra_(i + 1); });
  function aqui(n) { return '$' + L[n] + '2:$' + L[n]; }

  function env(f) { return '=ARRAYFORMULA(IF(' + SKU + '="","",' + f + '))'; }

  function deWalmart(enc) {
    return env('IFERROR(' + fxBuscar_(SKU, CC_WALMART, 'SKU', enc) + ',"")');
  }
  function deCatalogo(enc, alterno) {
    return env('IFERROR(' + fxBuscar_(BASE, CC_CAT, 'SKU', enc) + ',' + (alterno || '""') + ')');
  }
  /** El precio de la banda, del master que sea, del canal que toque. */
  function precio(frag) {
    var hs = hojas[frag];
    function cadena(canal) {
      var f = '""';
      for (var i = hs.length - 1; i >= 0; i--) {
        f = 'IFERROR(' + fxBuscar_(BASE, hs[i], 'SKU', canal) + ',' + f + ')';
      }
      return f;
    }
    return env('IF(REGEXMATCH(' + SKU + ',' + SKU_FX_PREMIUM + '),' +
               cadena('Walmart Premium') + ',' + cadena('Walmart Clásica') + ')');
  }

  // Una formula por ENCABEZADO. El orden de las columnas lo da CC_ENCABEZADOS.
  var f = {};

  // SKU — la llave, viene de la columna SKU de la hoja Walmart (donde este)
  var vivo = fxCol_(CC_WALMART, 'SKU', 2);
  f['SKU'] = '=ARRAYFORMULA(IFERROR(IF(' + vivo + '="","",' + vivo + '),""))';

  // SKU BASE — sin -MSI, sin -MSI-n y sin la alterna -n (hasta -99). Conserva el -CVA.
  //    Regla completa en Config.gs (Anatomia del SKU).
  //    Si el SKU sin -MSI existe tal cual en Catalogo, esa es la base (no se le
  //    quita nada mas); si no, se le quita la alterna.
  var sinMsi = 'REGEXREPLACE(UPPER(TRIM(' + SKU + ')),' + SKU_FX_QUITA_MSI + ',"$2")';
  f['SKU BASE'] = env('IF(IFERROR(' + fxExiste_(sinMsi, CC_CAT, 'SKU') + ',FALSE),' + sinMsi + ',' +
                      'REGEXREPLACE(' + sinMsi + ',' + SKU_FX_QUITA_ALT + ',"$1"))');

  f['ESTATUS'] = deWalmart('ESTATUS');
  f['CATEGORIA WM'] = deWalmart('CATEGORIA');
  f['CATEGORIA ODOO'] = deCatalogo('CATEGORIA');

  // NOMBRE — el de Odoo; si no esta, el de Walmart
  f['NOMBRE'] = deCatalogo('NOMBRE', 'IFERROR(' + fxBuscar_(SKU, CC_WALMART, 'SKU', 'NOMBRE') + ',"")');

  // MARCA — prefijo del SKU traducido en _Marcas, con las excepciones
  //    de _Marcas Excepciones revisadas contra el NOMBRE
  var pre = 'IFERROR(REGEXEXTRACT(' + BASE + ',"^[^-]+"),"")';
  f['MARCA'] = env(formulaMarca_(pre, aqui('NOMBRE')));

  // MODELO — el segmento de enmedio del SKU
  f['MODELO'] = env('IFERROR(REGEXEXTRACT(' + BASE + ',"^[^-]+-(.+?)-[A-Za-z/]{2,4}(?:-[A-Za-z0-9]{1,8}){1,3}$"),' +
              'IFERROR(REGEXEXTRACT(' + BASE + ',"^[^-]+-(.+)-[A-Za-z/]{2,4}-?$"),""))');

  f['PRECIO WM'] = deWalmart('PRECIO');
  f['GTIN'] = deWalmart('GTIN');   // ya viene a 14 digitos
  f['UPC'] = deWalmart('UPC');

  // WALMART UPC — GTIN sin digito verificador y con un cero al frente.
  f['WALMART UPC'] = env('IF(' + aqui('GTIN') + '="","","0"&LEFT(' + aqui('GTIN') + ',13))');

  // DISPONIBLE ODOO — columna Libre de Inventario Actual
  f['DISPONIBLE ODOO'] = env('IFERROR(' + fxBuscar_(BASE, CC_STOCK, 'SKU', 'Libre') + ',0)');

  f['MKP'] = deWalmart('INV NORMAL');
  f['WFS'] = deWalmart('WFS');
  f['ES WFS'] = deWalmart('ES WFS');
  // MINIMO / NORMAL / MAXIMO — de las hojas de precios, por SKU BASE, en el
  //    canal que toque: premium si trae -MSI, clasica si no. Las alternas
  //    (-2, -MSI-2...) heredan el precio de su base en su canal.
  f['MINIMO'] = precio('minimo');
  f['NORMAL'] = precio('normal');
  f['MAXIMO'] = precio('maximo');

  // KILLER — por el SKU completo, no por la base. Solo cuenta si sigue
  //    vigente (TERMINA despues de ahora).
  f['KILLER'] = env('IF(NOT(' + fxExiste_(SKU, CC_KILLERS, 'SKU') + '),"NO",' +
              'IFERROR(IF(' + fxBuscar_(SKU, CC_KILLERS, 'SKU', 'TERMINA') + '>NOW(),"SI","NO"),"SI"))');

  // CUPON — de la columna CUPON de Killers
  f['CUPON'] = env('IF(' + aqui('KILLER') + '<>"SI","",IFERROR(' + fxBuscar_(SKU, CC_KILLERS, 'SKU', 'CUPON') + ',""))');

  // VENDEMOS — el minimo menos el cupon del killer
  f['VENDEMOS'] = env('IF(' + aqui('MINIMO') + '="","",' + aqui('MINIMO') + '-IFERROR(VALUE(' + aqui('CUPON') + '),0))');

  // URL de la publicacion
  f['URL'] = env('IF(' + aqui('WALMART UPC') + '="","","https://www.walmart.com.mx/ip/detalle/del/articulo/"&' + aqui('WALMART UPC') + ')');

  var sinFormula = CC_ENCABEZADOS.filter(function (n) { return !f[n]; });
  var deMas = Object.keys(f).filter(function (n) { return CC_ENCABEZADOS.indexOf(n) < 0; });
  if (sinFormula.length || deMas.length) {
    throw new Error('Concentrado: encabezados sin formula: ' + sinFormula.join(', ') +
                    ' / formulas sin encabezado: ' + deMas.join(', '));
  }

  // --- limpiar y escribir ---
  ccQuitarFiltro_(c);
  c.clear();
  c.clearNotes();
  try { c.getRange(1, 1, c.getMaxRows(), c.getMaxColumns()).clearDataValidations(); } catch (e) {}

  var nC = CC_ENCABEZADOS.length;
  var sc = c.getMaxColumns() - nC;
  if (sc > 0) c.deleteColumns(nC + 1, sc);
  if (sc < 0) c.insertColumnsAfter(c.getMaxColumns(), -sc);
  var quiero = Math.max(filasWalmart + 50, 100);
  var sf = c.getMaxRows() - quiero;
  if (sf > 0) c.deleteRows(quiero + 1, sf);
  if (sf < 0) c.insertRowsAfter(c.getMaxRows(), -sf);

  c.getRange(1, 1, 1, nC).setValues([CC_ENCABEZADOS])
   .setFontWeight('bold').setBackground('#eef2f7');

  // Los codigos, como texto, ANTES de que caiga la formula. Por nombre.
  function rg(nombre, cuantas) {
    return c.getRange(2, CC_ENCABEZADOS.indexOf(nombre) + 1, c.getMaxRows() - 1, cuantas || 1);
  }
  ['GTIN', 'UPC', 'WALMART UPC'].forEach(function (n) { rg(n).setNumberFormat('@'); });

  CC_ENCABEZADOS.forEach(function (n, i) { c.getRange(2, i + 1).setFormula(f[n]); });

  c.setFrozenRows(1);
  c.setFrozenColumns(2);
  rg('PRECIO WM').setNumberFormat('#,##0.00');
  ['DISPONIBLE ODOO', 'MKP', 'WFS'].forEach(function (n) { rg(n).setNumberFormat('#,##0'); });
  ['MINIMO', 'NORMAL', 'MAXIMO', 'CUPON', 'VENDEMOS'].forEach(function (n) { rg(n).setNumberFormat('#,##0.00'); });
  c.getRange(1, 1, 1, nC).createFilter();

  SpreadsheetApp.flush();
  c.autoResizeColumns(1, nC);
  var cN = CC_ENCABEZADOS.indexOf('NOMBRE') + 1, cU = CC_ENCABEZADOS.indexOf('URL') + 1;
  if (c.getColumnWidth(cN) > 380) c.setColumnWidth(cN, 380);
  if (c.getColumnWidth(cU) > 260) c.setColumnWidth(cU, 260);
}

/* ================================================================== */
/*  Diagnostico                                                        */
/* ================================================================== */

/** Que tan bien cruzo cada fuente. Sirve para cachar huecos de datos. */
function revisarConcentrado() {
  var ss = SpreadsheetApp.getActive();
  var c = ss.getSheetByName(CC_HOJA);
  if (!c || c.getLastRow() < 2) throw new Error('Corre primero armarConcentrado().');

  var k = colsHoja_(c, ['SKU', 'SKU BASE', 'CATEGORIA ODOO', 'MARCA', 'MINIMO', 'ES WFS']);
  var d = c.getRange(2, 1, c.getLastRow() - 1, c.getLastColumn()).getValues();
  var n = 0, sinCat = 0, sinPrecio = 0, sinMarca = 0, msi = 0, msiFuera = 0;
  var ejSinPrecio = [], ejSinCat = [];

  d.forEach(function (f) {
    var sku = String(f[k.SKU] || '').trim();
    if (!sku) return;
    n++;
    if (!f[k['CATEGORIA ODOO']]) { sinCat++; if (ejSinCat.length < 8) ejSinCat.push(sku); }
    if (f[k.MINIMO] === '' || f[k.MINIMO] === null) { sinPrecio++; if (ejSinPrecio.length < 8) ejSinPrecio.push(sku); }
    if (String(f[k.MARCA] || '') === String(f[k['SKU BASE']] || '').split('-')[0]) sinMarca++;
    if (skuEsPremium_(sku)) {
      msi++;
      if (f[k['ES WFS']] !== 'SI') msiFuera++;
    }
  });

  var pc = function (x) { return n ? ' (' + Math.round(100 * x / n) + '%)' : ''; };
  var msg =
    'Renglones: ' + n + '\n\n' +
    'Sin categoria de Odoo:   ' + sinCat + pc(sinCat) + '\n' +
    'Sin precio de banda:     ' + sinPrecio + pc(sinPrecio) + '\n' +
    'Marca sin traducir:      ' + sinMarca + pc(sinMarca) + '\n\n' +
    'SKUs -MSI:               ' + msi + '\n' +
    '   fuera de WFS:         ' + msiFuera + '\n' +
    (ejSinCat.length ? '\nSin categoria, ejemplos:\n  ' + ejSinCat.join('\n  ') : '') +
    (ejSinPrecio.length ? '\n\nSin precio, ejemplos:\n  ' + ejSinPrecio.join('\n  ') : '');
  ccAviso_('Revision del Concentrado', msg);
  return msg;
}

/* ================================================================== */
/*  Apoyo                                                              */
/* ================================================================== */

/** Agrupa las hojas de precios por banda. Devuelve {minimo:[...], ...} */
function ccHojasDePrecios_(ss) {
  var out = { minimo: [], normal: [], maximo: [] };
  ss.getSheets().forEach(function (h) {
    var nom = h.getName();
    if (h.getLastRow() < 2 || h.getLastColumn() < 2) return;
    // Se reconoce por sus ENCABEZADOS (SKU + los dos canales de Walmart),
    // no por cuantas columnas tiene.
    var enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(normEnc_);
    var tiene = function (x) { return enc.indexOf(normEnc_(x)) >= 0; };
    if (!(tiene('SKU') && tiene('Walmart Clásica') && tiene('Walmart Premium'))) return;
    var bajo = nom.toLowerCase();
    CC_BANDAS.forEach(function (b) {
      if (bajo.indexOf(b.frag) >= 0) out[b.frag].push(nom);
    });
  });
  return out;
}

function ccAsegurarHoja_(ss, nombre, encabezados) {
  var h = ss.getSheetByName(nombre);
  if (h) return h;
  h = ss.insertSheet(nombre);
  h.getRange(1, 1, 1, encabezados.length).setValues([encabezados])
   .setFontWeight('bold').setBackground('#eef2f7');
  h.setFrozenRows(1);
  return h;
}

function ccRespaldar_(ss, hoja) {
  return respaldoComoValores_(ss, hoja);
}

/**
 * Respaldo oculto de una hoja, SOLO con valores.
 *
 * Antes era un copyTo() a secas: la copia se llevaba las ARRAYFORMULA y
 * seguia recalculando todo el Concentrado (~3,400 filas) por cada respaldo,
 * y cuando cambiaba el mapeo de columnas el respaldo mostraba basura (el UPC
 * en la columna de categoria). Ahora se congela con los valores del momento
 * y solo se conservan los CC_RESPALDOS_CONSERVAR mas nuevos.
 */
function respaldoComoValores_(ss, hoja) {
  var sello = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd-HHmm');
  var nombre = hoja.getName() + '_respaldo_' + sello;
  var vieja = ss.getSheetByName(nombre);
  if (vieja) ss.deleteSheet(vieja);

  var copia = hoja.copyTo(ss).setName(nombre);
  var filas = hoja.getLastRow(), cols = hoja.getLastColumn();
  if (filas > 0 && cols > 0) {
    var valores = hoja.getRange(1, 1, filas, cols).getValues();
    copia.getRange(1, 1, copia.getMaxRows(), copia.getMaxColumns()).clearContent();
    copia.getRange(1, 1, filas, cols).setValues(valores);
  }
  copia.hideSheet();

  borrarRespaldosViejos_(ss, hoja.getName(), CC_RESPALDOS_CONSERVAR);
  return nombre;
}

/** Deja solo los `conservar` respaldos mas nuevos de una hoja. */
function borrarRespaldosViejos_(ss, base, conservar) {
  var pref = base + '_respaldo_';
  var resp = ss.getSheets().filter(function (h) {
    return h.getName().indexOf(pref) === 0;
  }).sort(function (a, b) {                    // el sello yyyyMMdd-HHmm ordena solo
    return a.getName() < b.getName() ? 1 : -1;
  });
  var borrados = [];
  resp.slice(conservar).forEach(function (h) {
    borrados.push(h.getName());
    ss.deleteSheet(h);
  });
  return borrados;
}

/**
 * Quita hojas que ya no usa nadie: las huerfanas de CC_HOJAS_HUERFANAS y los
 * respaldos de mas. Tambien se puede correr suelta desde el menu.
 */
function limpiarHojasViejas_(ss) {
  ss = ss || SpreadsheetApp.getActive();
  var quitadas = [];
  CC_HOJAS_HUERFANAS.forEach(function (n) {
    var h = ss.getSheetByName(n);
    if (h && ss.getSheets().length > 1) { ss.deleteSheet(h); quitadas.push(n); }
  });
  ['Concentrado', 'Inventarios'].forEach(function (base) {
    quitadas = quitadas.concat(borrarRespaldosViejos_(ss, base, CC_RESPALDOS_CONSERVAR));
  });
  if (quitadas.length) {
    try { logInfo_('LIMPIEZA', 'Hojas quitadas: ' + quitadas.join(', ')); flushLog_(); } catch (e) {}
  }
  return quitadas;
}

function limpiarHojasViejas() {
  var q = limpiarHojasViejas_(SpreadsheetApp.getActive());
  ccAviso_('Limpieza', q.length ? 'Quite: \n  ' + q.join('\n  ') : 'No habia nada que quitar.');
}

/* ---- Marca ---- */

/** Crea _Marcas Excepciones con la semilla si no existe. No pisa lo editado. */
function ccSembrarExcepcionesMarca_(ss) {
  if (ss.getSheetByName(CC_MARCAS_EXC)) return;
  var h = ss.insertSheet(CC_MARCAS_EXC);
  h.getRange(1, 1, 1, 3).setValues([['PREFIJO', 'SI EL NOMBRE TRAE', 'MARCA']])
   .setFontWeight('bold').setBackground('#eef2f7');
  h.getRange(2, 1, CC_MARCAS_EXC_BASE.length, 3).setValues(CC_MARCAS_EXC_BASE);
  h.getRange(1, 1).setNote('Palabras separadas con |. Se aplica al volver a Armar Concentrado.');
  h.setFrozenRows(1);
  h.autoResizeColumns(1, 3);
}

/** Lee las excepciones de la hoja (o la semilla si no hay hoja). */
function ccExcepcionesMarca_(ss) {
  var h = ss.getSheetByName(CC_MARCAS_EXC);
  if (!h || h.getLastRow() < 2) return CC_MARCAS_EXC_BASE;
  var k = colsHoja_(h, ['PREFIJO', 'SI EL NOMBRE TRAE', 'MARCA']);
  return h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues().map(function (r) {
    return [r[k.PREFIJO], r[k['SI EL NOMBRE TRAE']], r[k.MARCA]];
  }).filter(function (r) {
    return String(r[0]).trim() && String(r[1]).trim() && String(r[2]).trim();
  });
}

/**
 * Formula de MARCA para ARRAYFORMULA. Primero las excepciones (prefijo +
 * palabra en el nombre), luego _Marcas por prefijo, y si no, el prefijo.
 */
function formulaMarca_(pre, nombre) {
  var esc = function (t) { return String(t).trim().replace(/"/g, '""'); };
  var f = 'IFERROR(' + fxBuscar_(pre, CC_MARCAS, 'PREFIJO', 'MARCA') + ',' + pre + ')';
  var exc = ccExcepcionesMarca_(SpreadsheetApp.getActive());
  for (var i = exc.length - 1; i >= 0; i--) {
    var p = esc(exc[i][0]).toUpperCase(), pal = esc(exc[i][1]).toUpperCase(), m = esc(exc[i][2]);
    f = 'IF((' + pre + '="' + p + '")*IFERROR(REGEXMATCH(UPPER(' + nombre + '),"' + pal + '"),FALSE),"' +
        m + '",' + f + ')';
  }
  return f;
}

function ccQuitarFiltro_(hoja) {
  try { var f = hoja.getFilter(); if (f) f.remove(); } catch (e) {}
}

function ccAviso_(titulo, msg) {
  Logger.log(titulo + '\n' + msg);
  try { SpreadsheetApp.getUi().alert(titulo, String(msg).slice(0, 4000), SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) {}
}

/** Numero de columna -> letra (1 = A). Para armar rangos sin escribirlos. */
function ccLetra_(n) {
  var s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; }
  return s;
}
