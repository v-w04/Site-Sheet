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
 *   _Comisiones        categoria -> comision y codigo CF      (aqui)
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
 * 5. La comision se busca con la CATEGORIA DE ODOO, no con la de Walmart. En el
 *    viejo cruzaba las 97 categorias de Walmart contra las 27 de Odoo, asi que
 *    casi siempre devolvia 0.
 * 6. Se fue la columna Buybox: llevaba 3,126 filas vacias.
 */

var CC_HOJA = 'Concentrado';

var CC_ENCABEZADOS = [
  'SKU', 'SKU BASE', 'ESTATUS', 'CATEGORIA WM', 'CATEGORIA ODOO', 'NOMBRE',
  'MARCA', 'MODELO', 'PRECIO WM', 'COMISION', 'CF',
  'GTIN', 'UPC', 'WALMART UPC', 'DISPONIBLE ODOO', 'MKP', 'WFS', 'ES WFS',
  'MINIMO', 'NORMAL', 'MAXIMO', 'KILLER', 'CUPON', 'VENDEMOS', 'URL'
];

/* Hojas de las que jala. Si alguna falta, se crea vacia para que no truene. */
var CC_WALMART = 'Walmart';
var CC_CAT     = 'Catalogo';
var CC_STOCK   = 'Inventario Actual';
var CC_KILLERS = 'Killers';
var CC_MARCAS  = '_Marcas';
var CC_COMIS   = '_Comisiones';

/* Las 6 hojas de precios. Se detectan solas, pero este es el orden esperado. */
var CC_BANDAS = [
  { nombre: 'MINIMO', frag: 'minimo' },
  { nombre: 'NORMAL', frag: 'normal' },
  { nombre: 'MAXIMO', frag: 'maximo' }
];

/*
 * Anatomia del SKU de Walmart:
 *   <base>            publicacion clasica
 *   <base>-MSI        publicacion premium (meses sin intereses)
 *   <base>-MSI-0..9   publicaciones alternas de la premium
 *   <base>-0..9       publicaciones alternas de la clasica
 *   <base>-MSI-CVA    producto de CVA en premium
 *
 * OJO: MSI tambien es marca de computadoras. Por eso el patron exige el guion
 * de enmedio: "-MSI". Un SKU que EMPIEZA con "MSI-" no se toca.
 */
var CC_RE_QUITA_MSI  = '"-MSI(-\\d)?"';       // en cualquier lugar, incluso antes de -CVA
var CC_RE_QUITA_ALT  = '"-(\\d)$"';           // un solo digito, al final
var CC_RE_ES_PREMIUM = '"(?i)-MSI(-\\d)?"';

/* Categoria -> comision y codigo CF. Semilla tomada de tu hoja Listas. */
var CC_COMISIONES = [
  ['Accesorios',             0.15, '43202215'],
  ['Alimentos',              0.15, ''],
  ['Audio y Amplificadores', 0.10, '52161514'],
  ['Automotriz',             0.12, '52161514'],
  ['Cables',                 0.15, '43191631'],
  ['Calzado',                0.15, '53111800'],
  ['Camaras y Lentes',       0.10, '25131705'],
  ['Celulares',              0.10, '43191501'],
  ['Cocina y Hogar',         0.15, '52141527'],
  ['Computadoras',           0.10, '43191501'],
  ['Deportes',               0.15, ''],
  ['Electrodomesticos',      0.15, '40101701'],
  ['Hardware',               0.15, '43202005'],
  ['Herramientas',           0.12, '23101502'],
  ['Iluminacion',            0.15, '39101600'],
  ['Impresoras y Escaneres', 0.10, '43212110'],
  ['Joyeria',                0.20, ''],
  ['Juguetes',               0.15, '60141006'],
  ['Lentes de Armazon',      0.15, ''],
  ['Mascotas',               0.15, '10121801'],
  ['Perfumes',               0.15, ''],
  ['Proyectores',            0.10, '45111616'],
  ['Relojes',                0.15, '54111500'],
  ['Salud y Belleza',        0.15, '52141602'],
  ['Tablets',                0.10, '43211509'],
  ['TV y Video',             0.10, '52161542'],
  ['Videojuegos',            0.10, '52161557']
];

/* ================================================================== */
/*  Entrada                                                            */
/* ================================================================== */

function armarConcentrado() {
  var ss = SpreadsheetApp.getActive();

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

  ccSembrarComisiones_(ss);
  ccAsegurarHoja_(ss, CC_KILLERS, ['SKU', 'TITULO', 'PUBLICADO', 'CUPON', 'NOS PAGAN', 'INICIA', 'TERMINA', 'DIAS']);
  ccAsegurarHoja_(ss, CC_MARCAS, ['PREFIJO', 'MARCA']);
  ccAsegurarHoja_(ss, CC_CAT, ['SKU', 'REFERENCIA', 'NOMBRE', 'CATEGORIA', 'Actualizado']);

  var c = ss.getSheetByName(CC_HOJA);
  if (c) ccRespaldar_(ss, c); else c = ss.insertSheet(CC_HOJA);

  ccPonerFormulas_(c, w.getLastRow(), hojas);

  var msg = 'Hoja "' + CC_HOJA + '" armada con ' + CC_ENCABEZADOS.length + ' columnas.\n\n' +
            'Renglones: ' + (w.getLastRow() - 1) + ' (los de la hoja Walmart)\n\n' +
            'Fuentes, todas de este mismo libro:\n' +
            '  Walmart, Catalogo, Inventario Actual,\n' +
            '  ' + CC_BANDAS.map(function (b) { return hojas[b.frag].join(' + '); }).join('\n  ') + ',\n' +
            '  Killers, _Marcas, _Comisiones\n\n' +
            'Cero IMPORTRANGE. Corre revisarConcentrado() para ver que tan bien cruzo todo.';
  ccAviso_('Concentrado', msg);
  return msg;
}

/* ================================================================== */
/*  Formulas                                                           */
/* ================================================================== */

function ccPonerFormulas_(c, filasWalmart, hojas) {
  var W   = "'" + CC_WALMART + "'";
  var CAT = "'" + CC_CAT + "'!$A:$D";        // SKU | REFERENCIA | NOMBRE | CATEGORIA
  var STK = "'" + CC_STOCK + "'!$A:$C";      // SKU | Producto | Libre
  var KIL = "'" + CC_KILLERS + "'!$A:$D";    // SKU | TITULO | PUBLICADO | CUPON
  var MAR = "'" + CC_MARCAS + "'!$A:$B";
  var COM = "'" + CC_COMIS + "'!$A:$C";      // CATEGORIA | COMISION | CF

  var SKU  = '$A2:$A';
  var BASE = '$B2:$B';
  var VIVO = W + '!$A2:$A';

  function env(f) { return '=ARRAYFORMULA(IF(' + SKU + '="","",' + f + '))'; }
  function deWalmart(col) {
    return env('IFERROR(VLOOKUP(' + SKU + ',' + W + '!$A:$N,' + col + ',FALSE),"")');
  }
  function deCatalogo(col, alterno) {
    return env('IFERROR(VLOOKUP(' + BASE + ',' + CAT + ',' + col + ',FALSE),' + (alterno || '""') + ')');
  }
  /** El precio de la banda, del master que sea, del canal que toque. */
  function precio(frag) {
    var hs = hojas[frag];
    function cadena(col) {
      var f = '""';
      for (var i = hs.length - 1; i >= 0; i--) {
        f = 'IFERROR(VLOOKUP(' + BASE + ",'" + hs[i] + "'!$B:$L," + col + ',FALSE),' + f + ')';
      }
      return f;
    }
    return env('IF(REGEXMATCH(' + SKU + ',' + CC_RE_ES_PREMIUM + '),' +
               cadena(11) + ',' + cadena(10) + ')');   // K = Clasica (10), L = Premium (11)
  }

  var f = [];

  // A  SKU — la llave, viene de la hoja Walmart
  f[0] = '=ARRAYFORMULA(IF(' + VIVO + '="","",' + VIVO + '))';

  // B  SKU BASE — sin -MSI, sin -MSI-n, sin -n final. Conserva el -CVA.
  f[1] = env('REGEXREPLACE(REGEXREPLACE(UPPER(TRIM(' + SKU + ')),' +
             CC_RE_QUITA_MSI + ',""),' + CC_RE_QUITA_ALT + ',"")');

  f[2]  = deWalmart(6);    // C  ESTATUS
  f[3]  = deWalmart(3);    // D  CATEGORIA WM
  f[4]  = deCatalogo(4);   // E  CATEGORIA ODOO

  // F  NOMBRE — el de Odoo; si no esta, el de Walmart
  f[5]  = deCatalogo(3, 'IFERROR(VLOOKUP(' + SKU + ',' + W + '!$A:$N,2,FALSE),"")');

  // G  MARCA — prefijo del SKU traducido en _Marcas
  var pre = 'IFERROR(REGEXEXTRACT(' + BASE + ',"^[^-]+"),"")';
  f[6]  = env('IFERROR(VLOOKUP(' + pre + ',' + MAR + ',2,FALSE),' + pre + ')');

  // H  MODELO — el segmento de enmedio del SKU
  f[7]  = env('IFERROR(REGEXEXTRACT(' + BASE + ',"^[^-]+-(.+?)-[A-Za-z/]{2,4}(?:-[A-Za-z0-9]{1,8}){1,3}$"),' +
              'IFERROR(REGEXEXTRACT(' + BASE + ',"^[^-]+-(.+)-[A-Za-z/]{2,4}-?$"),""))');

  f[8]  = deWalmart(5);    // I  PRECIO WM

  // J  COMISION y K  CF — por la categoria de ODOO, no la de Walmart
  f[9]  = env('IFERROR(VLOOKUP($E2:$E,' + COM + ',2,FALSE),"")');
  f[10] = env('IFERROR(VLOOKUP($E2:$E,' + COM + ',3,FALSE),"")');

  f[11] = deWalmart(7);    // L  GTIN  (ya viene a 14 digitos)
  f[12] = deWalmart(8);    // M  UPC

  // N  WALMART UPC — GTIN sin digito verificador y con un cero al frente.
  //    Es la regla que la propia plantilla de soporte documenta.
  f[13] = env('IF($L2:$L="","","0"&LEFT($L2:$L,13))');

  // O  DISPONIBLE ODOO
  f[14] = env('IFERROR(VLOOKUP(' + BASE + ',' + STK + ',3,FALSE),0)');

  f[15] = deWalmart(10);   // P  MKP
  f[16] = deWalmart(11);   // Q  WFS
  f[17] = deWalmart(13);   // R  ES WFS

  f[18] = precio('minimo'); // S
  f[19] = precio('normal'); // T
  f[20] = precio('maximo'); // U

  // V  KILLER  y  W  CUPON — se buscan por el SKU completo, no por la base
  f[21] = env('IF(ISNA(MATCH(' + SKU + ",'" + CC_KILLERS + '\'!$A:$A,0)),"NO","SI")');
  f[22] = env('IFERROR(VLOOKUP(' + SKU + ',' + KIL + ',4,FALSE),"")');

  // X  VENDEMOS — el minimo menos el cupon del killer
  f[23] = env('IF($S2:$S="","",$S2:$S-IFERROR(VALUE($W2:$W),0))');

  // Y  URL de la publicacion
  f[24] = env('IF($N2:$N="","","https://www.walmart.com.mx/ip/detalle/del/articulo/"&$N2:$N)');

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

  // Los codigos, como texto, ANTES de que caiga la formula.
  c.getRange(2, 12, c.getMaxRows() - 1, 3).setNumberFormat('@');

  for (var i = 0; i < f.length; i++) c.getRange(2, i + 1).setFormula(f[i]);

  c.setFrozenRows(1);
  c.setFrozenColumns(2);
  var n = c.getMaxRows() - 1;
  c.getRange(2, 9,  n, 1).setNumberFormat('#,##0.00');            // PRECIO WM
  c.getRange(2, 10, n, 1).setNumberFormat('0.00%');               // COMISION
  c.getRange(2, 15, n, 3).setNumberFormat('#,##0');               // ODOO, MKP, WFS
  c.getRange(2, 19, n, 3).setNumberFormat('#,##0.00');            // bandas
  c.getRange(2, 23, n, 2).setNumberFormat('#,##0.00');            // cupon, vendemos
  c.getRange(1, 1, 1, nC).createFilter();

  SpreadsheetApp.flush();
  c.autoResizeColumns(1, nC);
  if (c.getColumnWidth(6) > 380) c.setColumnWidth(6, 380);
  if (c.getColumnWidth(25) > 260) c.setColumnWidth(25, 260);
}

/* ================================================================== */
/*  Diagnostico                                                        */
/* ================================================================== */

/** Que tan bien cruzo cada fuente. Sirve para cachar huecos de datos. */
function revisarConcentrado() {
  var ss = SpreadsheetApp.getActive();
  var c = ss.getSheetByName(CC_HOJA);
  if (!c || c.getLastRow() < 2) throw new Error('Corre primero armarConcentrado().');

  var d = c.getRange(2, 1, c.getLastRow() - 1, CC_ENCABEZADOS.length).getValues();
  var n = 0, sinCat = 0, sinComis = 0, sinPrecio = 0, sinMarca = 0, msi = 0, msiFuera = 0;
  var ejSinPrecio = [], ejSinCat = [];

  d.forEach(function (f) {
    var sku = String(f[0] || '').trim();
    if (!sku) return;
    n++;
    if (!f[4]) { sinCat++; if (ejSinCat.length < 8) ejSinCat.push(sku); }
    if (f[9] === '' || f[9] === null) sinComis++;
    if (f[18] === '' || f[18] === null) { sinPrecio++; if (ejSinPrecio.length < 8) ejSinPrecio.push(sku); }
    if (String(f[6] || '') === String(f[1] || '').split('-')[0]) sinMarca++;
    if (/-MSI(-\d)?/i.test(sku)) {
      msi++;
      if (f[17] !== 'SI') msiFuera++;
    }
  });

  var pc = function (x) { return n ? ' (' + Math.round(100 * x / n) + '%)' : ''; };
  var msg =
    'Renglones: ' + n + '\n\n' +
    'Sin categoria de Odoo:   ' + sinCat + pc(sinCat) + '\n' +
    'Sin comision:            ' + sinComis + pc(sinComis) + '\n' +
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
    if (h.getLastColumn() < 12 || h.getLastRow() < 2) return;
    var enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0]
      .map(function (v) { return String(v || '').toLowerCase(); });
    var tieneWm = enc.some(function (v) { return v.indexOf('walmart') === 0; });
    if (!tieneWm) return;
    var bajo = nom.toLowerCase();
    CC_BANDAS.forEach(function (b) {
      if (bajo.indexOf(b.frag) >= 0) out[b.frag].push(nom);
    });
  });
  return out;
}

function ccSembrarComisiones_(ss) {
  var h = ss.getSheetByName(CC_COMIS);
  if (h && h.getLastRow() > 1) return h;          // si ya existe, no se pisa
  if (!h) h = ss.insertSheet(CC_COMIS);
  h.clear();
  h.getRange(1, 1, 1, 3).setValues([['CATEGORIA', 'COMISION', 'CF']])
   .setFontWeight('bold').setBackground('#eef2f7');
  h.getRange(2, 1, CC_COMISIONES.length, 3).setValues(CC_COMISIONES);
  h.getRange(2, 2, CC_COMISIONES.length, 1).setNumberFormat('0.00%');
  h.getRange(2, 3, CC_COMISIONES.length, 1).setNumberFormat('@');
  h.setFrozenRows(1);
  var sc = h.getMaxColumns() - 3;
  if (sc > 0) h.deleteColumns(4, sc);
  h.autoResizeColumns(1, 3);
  return h;
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
  var sello = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd-HHmm');
  var nombre = hoja.getName() + '_respaldo_' + sello;
  var vieja = ss.getSheetByName(nombre);
  if (vieja) ss.deleteSheet(vieja);
  hoja.copyTo(ss).setName(nombre).hideSheet();
  return nombre;
}

function ccQuitarFiltro_(hoja) {
  try { var f = hoja.getFilter(); if (f) f.remove(); } catch (e) {}
}

function ccAviso_(titulo, msg) {
  Logger.log(titulo + '\n' + msg);
  try { SpreadsheetApp.getUi().alert(titulo, String(msg).slice(0, 4000), SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) {}
}
