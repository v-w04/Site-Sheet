/**
 * Variantes.gs — Site Sheet
 *
 * La hoja "Variantes": una publicacion de Walmart por renglon, agrupadas por
 * el SKU de Odoo del que cuelgan.
 *
 * La regla del negocio: el inventario de Odoo es la ley. Una publicacion de
 * Walmart no es un producto, es una forma de vender un producto de Odoo. Por
 * eso la llave de todo es el SKU de Odoo, y las publicaciones se le cuelgan:
 *
 *   1HO-AUT111BLACK-NEG-0974          <- el producto en Odoo (la FAMILIA)
 *     1HO-AUT111BLACK-NEG-0974        clasica
 *     1HO-AUT111BLACK-NEG-0974-2      clasica alterna
 *     1HO-AUT111BLACK-NEG-0974-MSI    premium
 *     1HO-AUT111BLACK-NEG-0974-MSI-2  premium alterna
 *
 * Las cuatro comparten un solo inventario en Odoo y deben moverse juntas de
 * precio. Si una se queda atras, esta hoja lo marca.
 *
 * La familia se saca sola del SKU. Cuando no se puede (porque diste de alta
 * una publicacion con otro nombre), se escribe a mano en la columna
 * ASIGNACION MANUAL y esa gana para siempre: armarVariantes() nunca la pisa.
 *
 * Orden:
 *   1) armarVariantes()      arma la hoja desde el Concentrado
 *   2) revisarVariantes()    dice cuales familias tienen precios desalineados
 *   3) asignarVariante()     para colgar a mano una publicacion rebelde
 */

var VA_HOJA = 'Variantes';
var VA_CONC = 'Concentrado';

var VA_ENCABEZADOS = [
  'SKU WALMART', 'FAMILIA (ODOO)', 'ASIGNACION MANUAL', 'CANAL', 'ROL',
  'HERMANOS', 'ESTATUS', 'ES WFS', 'GTIN',
  'PRECIO HOY', 'MINIMO', 'NORMAL', 'MAXIMO',
  'DISPONIBLE ODOO', 'ALERTA'
];
var VA_COL = {
  SKU:1, FAM:2, MANUAL:3, CANAL:4, ROL:5, HERMANOS:6, ESTATUS:7, ES_WFS:8,
  GTIN:9, HOY:10, MIN:11, NOR:12, MAX:13, ODOO:14, ALERTA:15
};

/* Prefijos que no entran a este control. */
var VA_EXCLUIR = /^(RES|WL|OB)-/i;

/* ================================================================== */
/*  Armado                                                             */
/* ================================================================== */

function armarVariantes() {
  var ss = SpreadsheetApp.getActive();
  var c = ss.getSheetByName(VA_CONC);
  if (!c || c.getLastRow() < 2) {
    throw new Error('Falta la hoja "' + VA_CONC + '". Corre primero armarConcentrado().');
  }

  var manual = vaLeerManuales_(ss);          // lo escrito a mano se respeta
  var d = c.getRange(2, 1, c.getLastRow() - 1, 25).getValues();

  var reg = [];
  d.forEach(function (f) {
    var sku = String(f[0] || '').trim();
    if (!sku || VA_EXCLUIR.test(sku)) return;
    var auto = String(f[1] || '').trim();     // SKU BASE del Concentrado
    var man  = manual[sku] || '';
    reg.push({
      sku: sku,
      auto: auto,
      manual: man,
      familia: man || auto,
      canal: vaEsPremium_(sku) ? 'Premium' : 'Clasica',
      estatus: f[2],
      esWfs: f[17],
      gtin: String(f[11] || ''),
      hoy: vaNum_(f[8]),
      min: vaNum_(f[18]),
      nor: vaNum_(f[19]),
      max: vaNum_(f[20]),
      odoo: vaNum_(f[14])
    });
  });

  if (!reg.length) throw new Error('El Concentrado no trae SKUs utiles (todos son RES/WL/OB).');

  // Agrupar por familia
  var fam = {};
  reg.forEach(function (r) {
    if (!fam[r.familia]) fam[r.familia] = [];
    fam[r.familia].push(r);
  });

  // Rol: el principal es el que no trae sufijo; si no hay, el primero del canal
  Object.keys(fam).forEach(function (k) {
    var grupo = fam[k];
    var principal = null;
    grupo.forEach(function (r) { if (r.sku.toUpperCase() === k.toUpperCase()) principal = r; });
    grupo.forEach(function (r) {
      r.hermanos = grupo.length;
      r.rol = (r === principal) ? 'PRINCIPAL' : (principal ? 'VARIANTE' : 'SUELTA');
    });
    if (!principal && grupo.length) grupo[0].rol = 'PRINCIPAL';
  });

  // Alertas
  reg.forEach(function (r) {
    r.alerta = vaAlerta_(r, fam[r.familia]);
  });

  // Ordenar por familia y dentro de ella: principal primero, luego canal
  reg.sort(function (a, b) {
    if (a.familia !== b.familia) return a.familia < b.familia ? -1 : 1;
    if (a.rol !== b.rol) return a.rol === 'PRINCIPAL' ? -1 : 1;
    if (a.canal !== b.canal) return a.canal === 'Clasica' ? -1 : 1;
    return a.sku < b.sku ? -1 : 1;
  });

  var filas = reg.map(function (r) {
    return [r.sku, r.familia, r.manual, r.canal, r.rol, r.hermanos, r.estatus,
            r.esWfs, r.gtin, r.hoy, r.min, r.nor, r.max, r.odoo, r.alerta];
  });

  vaEscribir_(ss, filas);

  var conVar = Object.keys(fam).filter(function (k) { return fam[k].length > 1; }).length;
  var alertas = filas.filter(function (f) { return f[VA_COL.ALERTA - 1]; }).length;
  vaAviso_('Variantes',
    filas.length + ' publicaciones en ' + Object.keys(fam).length + ' familias.\n\n' +
    'Familias con mas de una publicacion: ' + conVar + '\n' +
    'Publicaciones con alerta: ' + alertas + '\n' +
    (Object.keys(manual).length ? 'Asignaciones a mano respetadas: ' + Object.keys(manual).length + '\n' : '') +
    '\nCorre revisarVariantes() para el detalle de las desalineadas.');
  return filas.length;
}

/** Que esta mal en este renglon, si algo. */
function vaAlerta_(r, grupo) {
  if (!r.odoo && r.odoo !== 0) return 'SIN PRODUCTO EN ODOO';
  if (r.min === '' && r.nor === '' && r.max === '') return 'SIN PRECIO EN EL SITE';

  // Precio distinto al de sus hermanos del mismo canal, estando publicadas
  if (r.estatus === 'PUBLISHED' && r.hoy !== '') {
    var otros = grupo.filter(function (x) {
      return x !== r && x.canal === r.canal && x.estatus === 'PUBLISHED' && x.hoy !== '';
    });
    for (var i = 0; i < otros.length; i++) {
      if (Math.abs(Number(otros[i].hoy) - Number(r.hoy)) > 0.01) return 'PRECIO DISTINTO A SUS HERMANOS';
    }
  }
  if (r.rol === 'SUELTA') return 'SIN PRINCIPAL — revisa la asignacion';
  return '';
}

/* ================================================================== */
/*  Revision                                                           */
/* ================================================================== */

function revisarVariantes() {
  var h = vaHoja_();
  var n = h.getLastRow() - 1;
  if (n < 1) throw new Error('Corre primero armarVariantes().');

  var d = h.getRange(2, 1, n, VA_ENCABEZADOS.length).getValues();
  var porFam = {}, cuenta = {};
  d.forEach(function (f) {
    var k = String(f[VA_COL.FAM - 1] || '');
    if (!porFam[k]) porFam[k] = [];
    porFam[k].push(f);
    var a = String(f[VA_COL.ALERTA - 1] || '');
    if (a) cuenta[a] = (cuenta[a] || 0) + 1;
  });

  var desal = [];
  Object.keys(porFam).forEach(function (k) {
    var g = porFam[k];
    ['Clasica', 'Premium'].forEach(function (cn) {
      var precios = {};
      g.forEach(function (f) {
        if (f[VA_COL.CANAL - 1] !== cn) return;
        if (f[VA_COL.ESTATUS - 1] !== 'PUBLISHED') return;
        var p = f[VA_COL.HOY - 1];
        if (p === '' || p === null) return;
        var kk = Math.round(Number(p) * 100) / 100;
        if (!precios[kk]) precios[kk] = [];
        precios[kk].push(f[0]);
      });
      var llaves = Object.keys(precios);
      if (llaves.length > 1) {
        var nums = llaves.map(Number);
        desal.push({ fam: k, canal: cn, dif: Math.max.apply(null, nums) - Math.min.apply(null, nums), precios: precios });
      }
    });
  });
  desal.sort(function (a, b) { return b.dif - a.dif; });

  var msg = 'Publicaciones: ' + n + '\nFamilias: ' + Object.keys(porFam).length + '\n\n';
  var claves = Object.keys(cuenta);
  msg += claves.length ? 'Alertas:\n' + claves.map(function (k) { return '  ' + cuenta[k] + '  ' + k; }).join('\n')
                       : 'Sin alertas.';
  msg += '\n\nFamilias con precios desalineados: ' + desal.length;
  desal.slice(0, 12).forEach(function (x) {
    msg += '\n\n' + x.fam + '  [' + x.canal + ']  diferencia $' + x.dif.toFixed(2);
    Object.keys(x.precios).sort(function (a, b) { return a - b; }).forEach(function (p) {
      msg += '\n    $' + Number(p).toFixed(2) + '  ' + x.precios[p].join(', ');
    });
  });
  vaAviso_('Revision de variantes', msg);
  return msg;
}

/* ================================================================== */
/*  Asignacion a mano                                                  */
/* ================================================================== */

/**
 * Para colgar una publicacion de otra familia. Sirve cuando entras a una
 * publicacion existente de Walmart con un SKU que no sigue tu convencion.
 */
function asignarVariante() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Asignar variante',
    'Escribe pares "SKU = FAMILIA", uno por renglon.\n' +
    'La FAMILIA es el SKU de Odoo al que se le cuelga.\n\n' +
    'Ejemplo:\n' +
    'WMT-12345-XYZ = 1HO-AUT111BLACK-NEG-0974\n\n' +
    'Para desasignar, deja la familia vacia: WMT-12345-XYZ =',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var pares = {};
  String(r.getResponseText()).split(/\r?\n/).forEach(function (l) {
    var p = l.split('=');
    if (p.length < 2) return;
    var sku = p[0].trim();
    if (sku) pares[sku.toUpperCase()] = p.slice(1).join('=').trim();
  });
  if (!Object.keys(pares).length) throw new Error('No entendi ningun par.');

  var h = vaHoja_();
  var n = h.getLastRow() - 1;
  var skus = h.getRange(2, VA_COL.SKU, n, 1).getValues();
  var man  = h.getRange(2, VA_COL.MANUAL, n, 1).getValues();

  var puestos = 0, noEncontrados = [];
  var vistos = {};
  for (var i = 0; i < n; i++) {
    var k = String(skus[i][0] || '').trim().toUpperCase();
    if (pares[k] !== undefined) { man[i][0] = pares[k]; puestos++; vistos[k] = 1; }
  }
  Object.keys(pares).forEach(function (k) { if (!vistos[k]) noEncontrados.push(k); });

  h.getRange(2, VA_COL.MANUAL, n, 1).setValues(man);

  vaAviso_('Asignar variante',
    puestos + ' asignaciones puestas.' +
    (noEncontrados.length ? '\n\nNo estan en la hoja:\n  ' + noEncontrados.join('\n  ') : '') +
    '\n\nCorre armarVariantes() para que se reagrupe.');
}

/* ================================================================== */
/*  Para el archivo de cambio de precios                               */
/* ================================================================== */

/**
 * Recibe SKUs sueltos y devuelve TODAS las publicaciones de sus familias.
 * Es lo que hace que al cambiar el precio de uno se cambien sus alternos.
 */
function variantesExpandir_(skus) {
  var h = SpreadsheetApp.getActive().getSheetByName(VA_HOJA);
  if (!h || h.getLastRow() < 2) return skus.slice();

  var d = h.getRange(2, 1, h.getLastRow() - 1, VA_ENCABEZADOS.length).getValues();
  var famDe = {}, miembros = {};
  d.forEach(function (f) {
    var s = String(f[0] || '').trim().toUpperCase();
    var k = String(f[VA_COL.FAM - 1] || '').trim().toUpperCase();
    if (!s || !k) return;
    famDe[s] = k;
    if (!miembros[k]) miembros[k] = [];
    miembros[k].push(String(f[0]).trim());
  });

  var out = [], puesto = {};
  skus.forEach(function (s) {
    var k = famDe[String(s).trim().toUpperCase()];
    var lista = (k && miembros[k]) ? miembros[k] : [s];
    lista.forEach(function (x) {
      var kk = x.toUpperCase();
      if (!puesto[kk]) { puesto[kk] = 1; out.push(x); }
    });
  });
  return out;
}

/** Cuantas publicaciones tiene la familia de este SKU. */
function variantesFamiliaDe_(sku) {
  return variantesExpandir_([sku]);
}

/* ================================================================== */
/*  Apoyo                                                              */
/* ================================================================== */

function vaLeerManuales_(ss) {
  var out = {};
  var h = ss.getSheetByName(VA_HOJA);
  if (!h || h.getLastRow() < 2) return out;
  var d = h.getRange(2, 1, h.getLastRow() - 1, VA_COL.MANUAL).getValues();
  d.forEach(function (f) {
    var s = String(f[0] || '').trim();
    var m = String(f[VA_COL.MANUAL - 1] || '').trim();
    if (s && m) out[s] = m;
  });
  return out;
}

function vaEscribir_(ss, filas) {
  var h = ss.getSheetByName(VA_HOJA);
  if (!h) h = ss.insertSheet(VA_HOJA);
  try { var fl = h.getFilter(); if (fl) fl.remove(); } catch (e) {}
  h.clear();

  var nC = VA_ENCABEZADOS.length;
  var sc = h.getMaxColumns() - nC;
  if (sc > 0) h.deleteColumns(nC + 1, sc);
  if (sc < 0) h.insertColumnsAfter(h.getMaxColumns(), -sc);
  var quiero = Math.max(filas.length + 1, 50);
  var sf = h.getMaxRows() - quiero;
  if (sf > 0) h.deleteRows(quiero + 1, sf);
  if (sf < 0) h.insertRowsAfter(h.getMaxRows(), -sf);

  h.getRange(1, 1, 1, nC).setValues([VA_ENCABEZADOS])
   .setFontWeight('bold').setBackground('#eef2f7');
  h.getRange(2, VA_COL.GTIN, Math.max(filas.length, 1), 1).setNumberFormat('@');
  if (filas.length) h.getRange(2, 1, filas.length, nC).setValues(filas);

  var n = Math.max(filas.length, 1);
  h.getRange(2, VA_COL.HOY, n, 4).setNumberFormat('#,##0.00');
  h.getRange(2, VA_COL.ODOO, n, 1).setNumberFormat('#,##0');
  h.setFrozenRows(1);
  h.setFrozenColumns(2);
  h.getRange(1, 1, 1, nC).createFilter();

  // Que salte a la vista lo que esta mal
  if (filas.length) {
    var rango = h.getRange(2, 1, filas.length, nC);
    var reglas = [
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$O2="PRECIO DISTINTO A SUS HERMANOS"')
        .setBackground('#fce8e6').setRanges([rango]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND($O2<>"",$O2<>"PRECIO DISTINTO A SUS HERMANOS")')
        .setBackground('#fff4e5').setRanges([rango]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$C2<>""')
        .setBackground('#e8f0fe').setRanges([h.getRange(2, VA_COL.MANUAL, filas.length, 1)]).build()
    ];
    h.setConditionalFormatRules(reglas);
  }

  SpreadsheetApp.flush();
  h.autoResizeColumns(1, nC);
  ss.setActiveSheet(h);
}

function vaHoja_() {
  var h = SpreadsheetApp.getActive().getSheetByName(VA_HOJA);
  if (!h) throw new Error('No existe la hoja "' + VA_HOJA + '". Corre armarVariantes().');
  return h;
}

/** Premium = trae -MSI en cualquier lugar, tambien antes del -CVA. */
function vaEsPremium_(sku) { return /-MSI(-\d)?/i.test(String(sku)); }

function vaNum_(v) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(v);
  return isNaN(n) ? '' : n;
}

function vaAviso_(titulo, msg) {
  Logger.log(titulo + '\n' + msg);
  try { SpreadsheetApp.getUi().alert(titulo, String(msg).slice(0, 4000), SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) {}
}
