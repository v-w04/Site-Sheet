/**
 * Inventarios.gs — Site Sheet
 *
 * Reconstruye la hoja "Inventarios".
 *
 *   - Quita las columnas basura (las que estaban en G, H, I) y deja los
 *     encabezados alineados con los datos.
 *   - REFERENCIA / CATEGORIA / NOMBRE se buscan en la hoja "Catalogo" (Odoo),
 *     que si trae los 2,497 productos de CVA.
 *   - MARCA / MODELO / COLOR se sacan del propio SKU, traduciendo con dos
 *     hojas chicas (_Marcas y _Colores) que este script arma solo a partir
 *     de las filas que hoy ya estan llenas.
 *
 * Queda todo con formulas vivas: cuando el trigger refresca "Inventario
 * Actual", la hoja Inventarios se actualiza sola.
 *
 * Como correrlo: en el editor de Apps Script, elegir la funcion
 * rehacerInventarios y darle Ejecutar. Hace un respaldo antes de tocar nada.
 *
 * Otras funciones utiles:
 *   revisarFaltantesEnCatalogo()  SKUs del inventario que Odoo no tiene.
 *   revisarSinTraducir()          prefijos y colores que faltan en las hojas.
 */

var HOJA_INV       = 'Inventarios';
var HOJA_MARCAS    = '_Marcas';
var HOJA_COLORES   = '_Colores';
var HOJA_CAT_INV   = 'Catalogo';
var HOJA_STOCK_INV = 'Inventario Actual';

var ENCABEZADOS_INV = [
  'REFERENCIA', 'CATEGORIA', 'MARCA', 'NOMBRE', 'MODELO', 'COLOR', 'SKU', 'DISPONIBLE'
];

/*
 * Anatomia del SKU:   MARCA - MODELO - COLOR - CODIGO [ -CVA | -OB | -MSI... ]
 * Ejemplos reales:
 *   1HO-AUT111BLACK-NEG-0974
 *   HP-14-DQ6105DX-ROS-7817            (modelo con guion adentro)
 *   3NS-CD205-NEG-3931-CVA
 *   ASU-E1504GAWS34-GRI-A030-OB
 *   ASU-GA401QH211ZG14BL-GRI-57-1
 *   ASU-GA503RMG15R93060-GRI           (sin codigo final)
 * Probado contra 704 SKUs reales: 99.3% resuelto.
 */
var RE_PREFIJO   = '"^[^-]+"';
var RE_COLOR_1   = '"-([A-Za-z/]{2,4})(?:-[A-Za-z0-9]{1,8}){1,3}$"';
var RE_COLOR_2   = '"-([A-Za-z/]{2,4})-?$"';
var RE_MODELO_1  = '"^[^-]+-(.+?)-[A-Za-z/]{2,4}(?:-[A-Za-z0-9]{1,8}){1,3}$"';
var RE_MODELO_2  = '"^[^-]+-(.+)-[A-Za-z/]{2,4}-?$"';

/* Version JS de los mismos patrones, para la cosecha y el diagnostico. */
var JS_COLOR_1 = /-([A-Za-z\/]{2,4})(?:-[A-Za-z0-9]{1,8}){1,3}$/;
var JS_COLOR_2 = /-([A-Za-z\/]{2,4})-?$/;

/* Semillas. Lo que ya este escrito a mano en la hoja siempre gana. */
var COLORES_BASE = [
  ['NEG', 'NEGRO'], ['BLA', 'BLANCO'], ['GRI', 'GRIS'], ['PLA', 'PLATA'],
  ['DOR', 'DORADO'], ['AZU', 'AZUL'], ['ROJ', 'ROJO'], ['VER', 'VERDE'],
  ['AMA', 'AMARILLO'], ['ROS', 'ROSA'], ['MOR', 'MORADO'], ['NAR', 'NARANJA'],
  ['CAF', 'CAFE'], ['BEI', 'BEIGE'], ['TRA', 'TRANSPARENTE'], ['MUL', 'MULTICOLOR'],
  ['TUR', 'TURQUESA'], ['VIN', 'VINO'], ['LIL', 'LILA'], ['MEN', 'MENTA'],
  ['COB', 'COBRE'], ['BRO', 'BRONCE'], ['TIT', 'TITANIO'], ['GRA', 'GRAFITO'],
  ['MAR', 'MARRON'], ['CEL', 'CELESTE'], ['CRE', 'CREMA'], ['LAV', 'LAVANDA'],
  ['N/A', 'NO APLICA']
];

var MARCAS_BASE = [
  ['1HO', '1HORA'],     ['3NS', '3NSTAR'],    ['ACE', 'ACER'],
  ['ACT', 'ACTECK'],    ['ADA', 'ADATA'],     ['AKG', 'AKG'],
  ['ALI', 'ALIENWARE'], ['AMA', 'AMAZON'],    ['AMD', 'AMD'],
  ['ANE', 'ANET'],      ['ANK', 'ANKER'],     ['ANV', 'ANVIZ'],
  ['AOC', 'AOC'],       ['AOR', 'AORUS'],     ['APC', 'APC'],
  ['APP', 'APPLE'],     ['ASR', 'ASROCK'],    ['ASU', 'ASUS'],
  ['BAC', 'BACKDROP'],  ['BAL', 'BALAM RUSH'],['BEA', 'BEATS'],
  ['BEH', 'BEHRINGER'], ['BOB', 'BOB ESPONJA'],
  ['FUJ', 'FUJIFILM'],  ['GEN', 'GENERICO'],  ['GHI', 'GHIA'],
  ['GRA', 'GRANDSTREAM'],['HP', 'HP'],        ['INT', 'INTEL'],
  ['JBL', 'JBL'],       ['NIN', 'NINTENDO'],  ['ROK', 'ROKU'],
  ['SAM', 'SAMSUNG'],   ['SKU', 'SKULLCANDY'],['SON', 'SONY'],
  ['TRA', 'TRANSHINE']
];

/* ================================================================== */
/*  Punto de entrada                                                    */
/* ================================================================== */

function rehacerInventarios() {
  var ss = SpreadsheetApp.getActive();

  var problemas = revisarEsquemas_(ss);
  if (problemas.length) throw new Error('No se rehizo Inventarios:\n\n' + problemas.join('\n'));

  var cat = ss.getSheetByName(HOJA_CAT_INV);
  if (!cat || cat.getLastRow() < 2) {
    throw new Error('Falta la hoja "' + HOJA_CAT_INV + '". Corre primero sincronizarCatalogo.');
  }
  var stock = ss.getSheetByName(HOJA_STOCK_INV);
  if (!stock || stock.getLastRow() < 2) {
    throw new Error('Falta la hoja "' + HOJA_STOCK_INV + '". Corre primero la bajada de inventario.');
  }

  var inv = ss.getSheetByName(HOJA_INV);
  if (!inv) inv = ss.insertSheet(HOJA_INV);

  // 1. Cosechar lo que ya esta lleno, ANTES de tocar nada.
  var cosecha = cosecharDiccionariosInv_(inv);

  // 2. Escribir / completar las hojas de traduccion.
  var nMarcas  = escribirDiccionarioInv_(ss, HOJA_MARCAS,  ['PREFIJO', 'MARCA'], MARCAS_BASE,  cosecha.marcas);
  var nColores = escribirDiccionarioInv_(ss, HOJA_COLORES, ['CODIGO', 'COLOR'],  COLORES_BASE, cosecha.colores);

  ccSembrarExcepcionesMarca_(ss);

  // 3. Respaldo oculto, por si algo sale mal.
  var respaldo = respaldarHojaInv_(ss, inv);

  // 4. Reconstruir con formulas.
  ponerFormulasInventarios_(inv, stock.getLastRow());

  var msg = 'Hoja "' + HOJA_INV + '" reconstruida con ' + ENCABEZADOS_INV.length + ' columnas.\n\n' +
            '_Marcas:  ' + nMarcas  + ' prefijos (' + contarInv_(cosecha.marcas)  + ' rescatados de la hoja vieja)\n' +
            '_Colores: ' + nColores + ' codigos (' + contarInv_(cosecha.colores) + ' rescatados)\n' +
            'Respaldo oculto: ' + respaldo;
  aviso_('Inventarios', msg);
  return msg;
}

/* Para el menu, cuando se agregue en Setup.gs */
function uiRehacerInventarios() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert(
    'Rehacer Inventarios',
    'Se van a borrar las columnas actuales de la hoja "Inventarios" y se van a ' +
    'poner formulas nuevas que jalan de Catalogo (Odoo).\n' +
    'Antes se guarda un respaldo automatico de la hoja.\n\nContinuar?',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  rehacerInventarios();
}

/* ================================================================== */
/*  Cosecha de diccionarios desde lo que ya estaba escrito              */
/* ================================================================== */

function cosecharDiccionariosInv_(inv) {
  var marcas = {}, colores = {};
  if (!inv || inv.getLastRow() < 2 || inv.getLastColumn() < 2) {
    return { marcas: marcas, colores: colores };
  }

  var datos = inv.getRange(1, 1, inv.getLastRow(), inv.getLastColumn()).getValues();
  var enc = datos[0].map(function (v) { return String(v || '').trim().toUpperCase(); });

  var cMarca = enc.indexOf('MARCA');
  var cColor = enc.indexOf('COLOR');
  var cSku   = enc.indexOf('SKU');

  // Si el encabezado no ayuda (estaban corridos), buscar la columna que
  // realmente contiene SKUs.
  var cSkuReal = columnaQueParaceSkuInv_(datos);
  if (cSkuReal >= 0) cSku = cSkuReal;
  if (cSku < 0) return { marcas: marcas, colores: colores };

  for (var i = 1; i < datos.length; i++) {
    var sku = String(datos[i][cSku] || '').trim();
    if (!sku || sku.indexOf('-') < 0) continue;

    if (cMarca >= 0) {
      var marca = String(datos[i][cMarca] || '').trim();
      if (esValorInv_(marca)) {
        var pre = sku.split('-')[0].toUpperCase();
        if (pre && !marcas[pre]) marcas[pre] = marca;
      }
    }

    if (cColor >= 0) {
      var color = String(datos[i][cColor] || '').trim();
      if (esValorInv_(color)) {
        var cod = codigoColorInv_(sku);
        if (cod && !colores[cod]) colores[cod] = color;
      }
    }
  }
  return { marcas: marcas, colores: colores };
}

function esValorInv_(v) {
  if (!v) return false;
  var u = v.toUpperCase();
  if (u === 'NO ESTA' || u === 'N/A' || u === 'NO APLICA') return false;
  if (v.charAt(0) === '#') return false;   // #N/A, #REF!
  return true;
}

function codigoColorInv_(sku) {
  var m = sku.match(JS_COLOR_1);
  if (!m) m = sku.match(JS_COLOR_2);
  return m ? m[1].toUpperCase() : '';
}

function columnaQueParaceSkuInv_(datos) {
  var mejor = -1, mejorPuntos = 0;
  var filas = Math.min(datos.length, 300);
  for (var c = 0; c < datos[0].length; c++) {
    var puntos = 0;
    for (var i = 1; i < filas; i++) {
      var v = String(datos[i][c] || '');
      if (/^[A-Za-z0-9]+-.+-[A-Za-z\/]{2,4}/.test(v)) puntos++;
    }
    if (puntos > mejorPuntos) { mejorPuntos = puntos; mejor = c; }
  }
  return mejorPuntos >= 5 ? mejor : -1;
}

/* ================================================================== */
/*  Hojas de traduccion                                                 */
/* ================================================================== */

/**
 * Prioridad: lo escrito a mano en la hoja > lo cosechado > la semilla.
 * Nunca se pisa una traduccion que ya se haya corregido a mano.
 *
 * La hoja la editas tu: los renglones que ya estan se quedan EN SU LUGAR (asi
 * lo que tengas en columnas tuyas sigue alineado), solo se llena la traduccion
 * si estaba vacia, y las llaves nuevas se agregan al final. Se escribe solo en
 * las dos columnas del script, por encabezado (Escritura.gs).
 */
function escribirDiccionarioInv_(ss, nombre, encabezados, base, cosechado) {
  var mapa = {};
  base.forEach(function (p) { mapa[String(p[0]).toUpperCase()] = p[1]; });
  Object.keys(cosechado).forEach(function (k) { mapa[k] = cosechado[k]; });

  var hoja = ss.getSheetByName(nombre);
  var filas = [], vistos = {};
  if (hoja && hoja.getLastRow() > 1) {
    // Lo escrito a mano se lee por ENCABEZADO: si alguien metio una columna
    // en medio, no se toma la equivocada como traduccion.
    var k = colsHoja_(hoja, [encabezados[0], encabezados[1]]);
    var prev = hoja.getRange(2, 1, hoja.getLastRow() - 1, hoja.getLastColumn()).getValues();
    prev.forEach(function (r) {
      var crudo = r[k[encabezados[0]]], v = r[k[encabezados[1]]];
      var kk = String(crudo || '').trim().toUpperCase();
      var vv = String(v || '').trim();
      if (kk && !vv && mapa[kk]) v = mapa[kk];          // traduccion vacia: se llena
      if (kk) vistos[kk] = true;
      filas.push([crudo, v]);                            // el renglon se queda donde esta
    });
  }
  if (!hoja) hoja = ss.insertSheet(nombre);

  Object.keys(mapa).sort().forEach(function (kk) {
    if (!vistos[kk]) filas.push([kk, mapa[kk]]);         // llaves nuevas, al final
  });

  quitarFiltroInv_(hoja);
  var m = reescribirHoja_(hoja, encabezados, filas, { estiloEnc: { fondo: '#eef2f7' } });
  hoja.setFrozenRows(1);
  escrAutoAncho_(hoja, m);

  return filas.filter(function (f) { return String(f[0] || '').trim(); }).length;
}

/* ================================================================== */
/*  Respaldo                                                            */
/* ================================================================== */

function respaldarHojaInv_(ss, hoja) {
  // Solo valores y solo el mas nuevo (ver respaldoComoValores_ en Concentrado.gs)
  return respaldoComoValores_(ss, hoja);
}

/* ================================================================== */
/*  Formulas                                                            */
/* ================================================================== */

function ponerFormulasInventarios_(inv, filasStock) {
  /*
   * Las columnas de Catalogo, Inventario Actual, _Marcas y _Colores se
   * buscan por ENCABEZADO (Columnas.gs): moverlas o insertar columnas en
   * esas hojas no corre ningun dato. Las de esta misma hoja (SKU, NOMBRE)
   * salen de ENCABEZADOS_INV, no de letras escritas a mano.
   */
  // La letra de cada columna sale de DONDE ESTA su encabezado (Escritura.gs):
  // si agregas una columna tuya en medio, las formulas siguen apuntando bien.
  var mi = ubicarColumnas_(inv, ENCABEZADOS_INV, 1, { fondo: '#eef2f7' });
  var L = {};
  ENCABEZADOS_INV.forEach(function (n, i) { L[n] = colLetra_(mi.pos[i]); });
  function aqui(n) { return '$' + L[n] + '2:$' + L[n]; }

  var SKU  = aqui('SKU');                              // la llave, en esta misma hoja
  var VIVO = fxCol_(HOJA_STOCK_INV, 'SKU', 2);         // SKU en Inventario Actual, renglon por renglon

  var pre = 'IFERROR(REGEXEXTRACT(' + SKU + ',' + RE_PREFIJO + '),"")';
  var cod = 'IFERROR(REGEXEXTRACT(' + SKU + ',' + RE_COLOR_1 + '),' +
            'IFERROR(REGEXEXTRACT(' + SKU + ',' + RE_COLOR_2 + '),""))';
  var mod = 'IFERROR(REGEXEXTRACT(' + SKU + ',' + RE_MODELO_1 + '),' +
            'IFERROR(REGEXEXTRACT(' + SKU + ',' + RE_MODELO_2 + '),""))';

  function env(x) { return '=ARRAYFORMULA(IF(' + SKU + '="","",' + x + '))'; }
  function deCat(enc, siNo) { return env('IFERROR(' + fxBuscar_(SKU, HOJA_CAT_INV, 'SKU', enc) + ',' + siNo + ')'); }

  var porNombre = {
    'REFERENCIA': deCat('REFERENCIA', '"SIN REFERENCIA"'),
    'CATEGORIA':  deCat('CATEGORIA', '"SIN CATEGORIA"'),
    // MARCA: prefijo traducido en _Marcas + excepciones contra el NOMBRE
    'MARCA':      env(formulaMarca_(pre, aqui('NOMBRE'))),
    // NOMBRE: el de Odoo; si no esta, el Producto que manda el site
    'NOMBRE':     deCat('NOMBRE', 'IFERROR(' + fxCol_(HOJA_STOCK_INV, 'Producto', 2) + ',"")'),
    'MODELO':     env(mod),
    'COLOR':      env('IFERROR(' + fxBuscar_(cod, HOJA_COLORES, 'CODIGO', 'COLOR') + ',' + cod + ')'),
    // SKU: viene de Inventario Actual, es la llave de todo lo demas
    'SKU':        '=ARRAYFORMULA(IFERROR(IF(' + VIVO + '="","",' + VIVO + '),""))',
    // DISPONIBLE: columna Libre de Inventario Actual, renglon por renglon
    'DISPONIBLE': '=ARRAYFORMULA(IFERROR(IF(' + VIVO + '="","",' + fxCol_(HOJA_STOCK_INV, 'Libre', 2) + '),""))'
  };
  var f = ENCABEZADOS_INV.map(function (n) {
    if (!porNombre[n]) throw new Error('Inventarios: no hay formula para "' + n + '"');
    return porNombre[n];
  });

  // --- escribir, POR ENCABEZADO (Escritura.gs) ---
  // Solo las columnas del script: tus columnas, notas y validaciones se quedan.
  escrRangos_(inv, mi, 1, inv.getMaxRows()).forEach(function (r) {
    r.clearNote();
    try { r.clearDataValidations(); } catch (e) {}
  });
  var quiero = Math.max(filasStock + 50, 100);
  if (inv.getMaxRows() < quiero) inv.insertRowsAfter(inv.getMaxRows(), quiero - inv.getMaxRows());

  // Una sola fila (la 2) con las ARRAYFORMULA; abajo se limpia solo en las columnas del script.
  var m = reescribirHoja_(inv, ENCABEZADOS_INV, [f], { estiloEnc: { fondo: '#eef2f7' } });
  // Filas justas (evita que las ARRAYFORMULA se estiren a miles de filas vacias), sin quitar ninguna con algo tuyo.
  escrRecortarFilas_(inv, quiero, m);

  inv.setFrozenRows(1);
  inv.getRange(2, escrCol_(m, 'DISPONIBLE'), inv.getMaxRows() - 1, 1).setNumberFormat('#,##0');
  escrFiltro_(inv, 1);

  SpreadsheetApp.flush();

  escrAutoAncho_(inv, m);
  escrAnchoMax_(inv, m, 'NOMBRE', 420);
}

function quitarFiltroInv_(hoja) {
  try {
    var f = hoja.getFilter();
    if (f) f.remove();
  } catch (e) {}
}

/* ================================================================== */
/*  Diagnostico                                                         */
/* ================================================================== */

/** Cuantos SKUs del inventario no aparecen en Catalogo (Odoo). */
function revisarFaltantesEnCatalogo() {
  var ss = SpreadsheetApp.getActive();
  var cat = ss.getSheetByName(HOJA_CAT_INV);
  var stock = ss.getSheetByName(HOJA_STOCK_INV);
  if (!cat || !stock) throw new Error('Faltan las hojas Catalogo o Inventario Actual.');

  var kc = colsHoja_(cat, ['SKU']), ks = colsHoja_(stock, ['SKU']);
  var enCat = {};
  cat.getRange(2, kc.SKU + 1, Math.max(cat.getLastRow() - 1, 1), 1).getValues()
     .forEach(function (r) { var k = String(r[0] || '').trim(); if (k) enCat[k] = 1; });

  var faltan = [];
  stock.getRange(2, ks.SKU + 1, Math.max(stock.getLastRow() - 1, 1), 1).getValues()
       .forEach(function (r) {
         var k = String(r[0] || '').trim();
         if (k && !enCat[k]) faltan.push(k);
       });

  var msg = 'SKUs en Inventario Actual: ' + (stock.getLastRow() - 1) + '\n' +
            'SKUs en Catalogo (Odoo):  ' + (cat.getLastRow() - 1) + '\n' +
            'No encontrados en Odoo:   ' + faltan.length +
            (faltan.length ? '\n\nPrimeros 20:\n' + faltan.slice(0, 20).join('\n') : '');
  aviso_('Faltantes en Catalogo', msg);
  return msg;
}

/** Prefijos y codigos de color que quedaron sin traducir. */
function revisarSinTraducir() {
  var ss = SpreadsheetApp.getActive();
  var inv = ss.getSheetByName(HOJA_INV);
  if (!inv || inv.getLastRow() < 2) throw new Error('Falta la hoja Inventarios.');

  var k = colsHoja_(inv, ['MARCA', 'COLOR', 'SKU']);
  var d = inv.getRange(2, 1, inv.getLastRow() - 1, inv.getLastColumn()).getValues();
  var marcas = {}, colores = {};
  d.forEach(function (r) {
    var marca = String(r[k.MARCA] || '').trim();
    var color = String(r[k.COLOR] || '').trim();
    var sku   = String(r[k.SKU] || '').trim();
    if (!sku) return;
    var pre = sku.split('-')[0].toUpperCase();
    if (marca && marca.toUpperCase() === pre) marcas[pre] = 1;
    var cod = codigoColorInv_(sku);
    if (cod && color && color.toUpperCase() === cod) colores[cod] = 1;
  });

  var lm = Object.keys(marcas).sort();
  var lc = Object.keys(colores).sort();
  var msg = 'Prefijos sin marca (' + lm.length + '):\n' + (lm.join(', ') || '(ninguno)') +
            '\n\nCodigos sin color (' + lc.length + '):\n' + (lc.join(', ') || '(ninguno)') +
            '\n\nCompletalos a mano en las hojas ' + HOJA_MARCAS + ' y ' + HOJA_COLORES + '.\n' +
            'Lo que escribas ahi ya no se pisa nunca.';
  aviso_('Sin traducir', msg);
  return msg;
}

/* ================================================================== */
/*  Utilerias                                                           */
/* ================================================================== */

function contarInv_(obj) { return Object.keys(obj).length; }


