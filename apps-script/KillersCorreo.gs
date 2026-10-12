/**
 * KillersCorreo.gs
 *
 * Correo a los KAMs de Walmart cuando cambia el precio minimo de un killer.
 *
 * Menu: 🔥 Killers y KAMs -> 📋 Actualizar hoja Correo / 📧 Enviar correos a los KAMs
 *
 * De donde sale todo (nada se calcula aqui):
 *   - Killers y MINIMO:   hoja "Killers bajo minimo" (bajada del site); a la hoja "Correo" pasan solo los de % PERDIDA > 3%.
 *   - QUE se envia:       la TABLA de la hoja "Correo" (vista previa; ENVIAR = SI/NO por SKU).
 *   - GTIN y UPC:         hoja "Walmart" (cruce por SKU).
 *   - Destinatarios:      hojas "KAMS" (contactos) y "KAMS Departamentos" (de quien es cada departamento); se llenan a mano, los correos NO van al repo.
 *   - Asunto y mensaje:   hoja "Correo" (editable).
 *
 * Flujo: arma un correo por categoria KAM -> muestra en un popup a quien y que
 * datos -> SI = envia de verdad, NO = envia SOLO A TI como prueba, CANCELAR = nada.
 * Cada envio queda en la hoja "Envios killers".
 *
 * Necesita el permiso script.send_mail (esta en appsscript.json).
 */

var KC_HOJA_KAMS   = 'KAMS';
var KC_HOJA_DEPTOS = 'KAMS Departamentos';
var KC_HOJA_CORREO = 'Correo';
var KC_HOJA_LOG    = 'Envios killers';
var KC_PARA_ROW    = 'PARA (COMPENDIO)';
var KC_SIN_KAM     = 'SIN KAM';
var KC_ENC_E       = 'DEPARTAMENTOS WALMART';
/* Encabezados con los que esa columna se llamo antes; se siguen aceptando. */
var KC_ENC_E_VIEJOS = ['DEPARTAMENTOS / CATEGORIAS WALMART (separados por ;)', 'CATEGORIAS DEL SITE (separadas por ;)'];

var KC_ASUNTO_DEFAULT = 'Cambio de killers por cambio de precio';
var KC_MENSAJE_DEFAULT =
  'Hola,\n\n' +
  'Debido a la entrada de nueva mercancia y a la ponderacion de la misma, los precios con los que ' +
  'se ofrecio el killer el mes pasado cambiaron. Solicitamos un cambio a fin de poder activarlo de nuevo.\n\n' +
  'Adjuntamos los SKU con el nuevo precio minimo, junto con su GTIN y UPC.\n\n' +
  'Saludos';

/* ================================================================== */
/*  Hoja KAMS                                                          */
/* ================================================================== */

/** De un mapa de colsDe_, el indice de la primera columna encontrada entre `nombres` (-1 si ninguna). */
function kcPrimera_(col, nombres) {
  for (var i = 0; i < nombres.length; i++) if (col[nombres[i]] !== undefined && col[nombres[i]] >= 0) return col[nombres[i]];
  return -1;
}

function kcNorm_(t) {
  return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Lee las hojas KAMS (contactos) y KAMS Departamentos (que departamento es de que grupo).
 * KAMS:               GRUPO KAM | NOMBRE | CORREO | CONFIRMADO (SI/NO)
 * KAMS Departamentos: DEPARTAMENTO | GRUPO KAM
 * Todo por ENCABEZADO (Columnas.gs). Una persona por renglon, sin renglones vacios ni "compendios".
 * @return {{orden:string[], grupos:Object}} grupos[NOMBRE] = {correos:[], cats:[], sinConfirmar:[]}
 */
function kamsLeer_() {
  var ss = kcCrearHojas_();
  var h = ss.getSheetByName(KC_HOJA_KAMS);
  if (!h) throw new Error('No existe la hoja "' + KC_HOJA_KAMS + '" y no hay datos para crearla (falta KamsDatos.gs).');
  var orden = [], grupos = {};
  var nuevo = function (g) { if (!grupos[g]) { grupos[g] = { correos: [], cats: [], sinConfirmar: [] }; orden.push(g); } return grupos[g]; };

  var v = h.getDataRange().getValues();
  var col = colsDe_(v[0] || [], ['GRUPO KAM', 'NOMBRE', 'CORREO'], KC_HOJA_KAMS, ['CONFIRMADO']);
  for (var i = 1; i < v.length; i++) {
    var g = kcNorm_(v[i][col['GRUPO KAM']]);
    if (!g) continue;
    var G = nuevo(g);
    if (kcNorm_(v[i][col['NOMBRE']]).indexOf('PARA') === 0) continue;       // compatibilidad con la hoja vieja
    var mail = String(v[i][col['CORREO']] || '').trim();
    if (mail.indexOf('@') <= 0 || G.correos.indexOf(mail) !== -1) continue;
    G.correos.push(mail);
    if (col['CONFIRMADO'] >= 0 && kcNorm_(v[i][col['CONFIRMADO']]) !== 'SI') G.sinConfirmar.push(mail);
  }

  var hd = ss.getSheetByName(KC_HOJA_DEPTOS);
  if (hd && hd.getLastRow() > 1) {
    var vd = hd.getDataRange().getValues();
    var cd = colsDe_(vd[0] || [], ['DEPARTAMENTO', 'GRUPO KAM'], KC_HOJA_DEPTOS);
    for (var j = 1; j < vd.length; j++) {
      var gd = kcNorm_(vd[j][cd['GRUPO KAM']]), dep = kcNorm_(vd[j][cd['DEPARTAMENTO']]);
      if (!gd || !dep) continue;
      var GD = nuevo(gd);
      if (GD.cats.indexOf(dep) === -1) GD.cats.push(dep);
    }
  }
  return { orden: orden, grupos: grupos };
}

/** Texto de un departamento/categoria -> lista de tokens (separados por ;). */
function kcTokens_(texto) {
  return String(texto || '').split(';').map(function (t) { return String(t).trim(); }).filter(function (t) { return t; });
}

/**
 * Lee la hoja KAMS en su formato VIEJO (VERIFICAR, columna de departamentos, renglones PARA y en blanco).
 * @return {{contactos:Array, mapa:Array}} contactos=[grupo,nombre,correo,confirmado]; mapa=[departamento,grupo]
 */
function kcLeerViejo_(h) {
  var v = h.getDataRange().getValues();
  var col = colsDe_(v[0] || [], ['GRUPO KAM', 'NOMBRE', 'CORREO'], KC_HOJA_KAMS,
                    ['VERIFICAR', 'CONFIRMADO', KC_ENC_E].concat(KC_ENC_E_VIEJOS));
  var iCats = kcPrimera_(col, [KC_ENC_E].concat(KC_ENC_E_VIEJOS));
  var contactos = [], mapa = [], vistoMapa = {};
  for (var i = 1; i < v.length; i++) {
    var g = String(v[i][col['GRUPO KAM']] || '').trim();
    if (!g) continue;
    var nom = String(v[i][col['NOMBRE']] || '').trim();
    var esCompendio = kcNorm_(nom).indexOf('PARA') === 0;
    if (iCats >= 0) kcTokens_(v[i][iCats]).forEach(function (t) {
      var llave = kcNorm_(t);
      if (!vistoMapa[llave]) { vistoMapa[llave] = true; mapa.push([t, g]); }
    });
    var mail = String(v[i][col['CORREO']] || '').trim();
    if (esCompendio || mail.indexOf('@') <= 0) continue;
    var conf;
    if (col['CONFIRMADO'] >= 0) conf = kcNorm_(v[i][col['CONFIRMADO']]) === 'SI' ? 'SI' : 'NO';
    else conf = (col['VERIFICAR'] >= 0 && kcNorm_(v[i][col['VERIFICAR']]) === 'SI') ? 'NO' : 'SI';
    contactos.push([g, nom, mail, conf]);
  }
  return { contactos: contactos, mapa: mapa };
}

/** Escribe una tabla plana con formato: encabezado, filtro, congelado, sin renglones/columnas de sobra. */
function kcPonerTabla_(ss, nombre, enc, filas, anchos, colGrupo) {
  var h = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  try { var f = h.getFilter(); if (f) f.remove(); } catch (e) {}
  h.clear();
  h.clearConditionalFormatRules();
  h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns()).clearDataValidations();
  var n = Math.max(filas.length, 1);
  if (h.getMaxColumns() < enc.length) h.insertColumnsAfter(h.getMaxColumns(), enc.length - h.getMaxColumns());
  if (h.getMaxRows() < n + 1) h.insertRowsAfter(h.getMaxRows(), n + 1 - h.getMaxRows());
  h.getRange(1, 1, 1, enc.length).setValues([enc])
   .setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF').setHorizontalAlignment('center');
  if (filas.length) {
    h.getRange(2, 1, filas.length, enc.length).setValues(filas).setVerticalAlignment('middle');
    // franjas por grupo: se alterna el color cada vez que cambia el grupo
    var fondo = [], par = false, previo = null;
    filas.forEach(function (r) {
      if (r[colGrupo] !== previo) { par = !par; previo = r[colGrupo]; }
      var c = par ? '#FFFFFF' : '#EEF2F7';
      fondo.push(enc.map(function () { return c; }));
    });
    h.getRange(2, 1, filas.length, enc.length).setBackgrounds(fondo);
  }
  h.setFrozenRows(1);
  anchos.forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  // sin renglones ni columnas vacias de sobra
  var maxF = h.getMaxRows(), usadas = filas.length + 1;
  if (usadas >= 2 && maxF > usadas) h.deleteRows(usadas + 1, maxF - usadas);
  var maxC = h.getMaxColumns();
  if (maxC > enc.length) h.deleteColumns(enc.length + 1, maxC - enc.length);
  h.getRange(1, 1, usadas, enc.length).createFilter();
  return h;
}

/** Escribe KAMS (contactos) y KAMS Departamentos con el formato nuevo. contactos/mapa ya van ordenados. */
function kcEscribirKams_(ss, contactos, mapa) {
  contactos = contactos.slice().sort(function (a, b) {
    return kcNorm_(a[0]).localeCompare(kcNorm_(b[0])) || kcNorm_(a[1]).localeCompare(kcNorm_(b[1]));
  });
  mapa = mapa.slice().sort(function (a, b) {
    return kcNorm_(a[1]).localeCompare(kcNorm_(b[1])) || kcNorm_(a[0]).localeCompare(kcNorm_(b[0]));
  });
  var hK = kcPonerTabla_(ss, KC_HOJA_KAMS, ['GRUPO KAM', 'NOMBRE', 'CORREO', 'CONFIRMADO'], contactos, [170, 240, 320, 120], 0);
  if (contactos.length) {
    var nK = contactos.length;
    hK.getRange(2, 4, nK, 1).setDataValidation(SpreadsheetApp.newDataValidation() // col-fija
      .requireValueInList(['SI', 'NO'], true).setAllowInvalid(false).build()).setHorizontalAlignment('center');
    hK.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($D2<>"",$D2<>"SI")').setBackground('#FFE599').setRanges([hK.getRange(2, 1, nK, 4)]).build()]);
  }
  var hD = kcPonerTabla_(ss, KC_HOJA_DEPTOS, ['DEPARTAMENTO', 'GRUPO KAM'], mapa, [320, 170], 1);
  var grupos = [];
  contactos.forEach(function (c) { if (grupos.indexOf(c[0]) === -1) grupos.push(c[0]); });
  if (mapa.length && grupos.length) {
    hD.getRange(2, 2, mapa.length, 1).setDataValidation(SpreadsheetApp.newDataValidation() // col-fija
      .requireValueInList(grupos, true).setAllowInvalid(true).build());
  }
}

/**
 * Crea / migra las hojas KAMS, KAMS Departamentos y Correo.
 *  - KAMS vieja (VERIFICAR, renglones PARA/en blanco, departamentos en la col E): se lee y se REESCRIBE
 *    plana (GRUPO KAM | NOMBRE | CORREO | CONFIRMADO) y los departamentos pasan a "KAMS Departamentos".
 *  - Si no existe o esta vacia: se crea desde KAMS_SEMILLA (KamsDatos.gs, privado, fuera de GitHub).
 *  - Si ya esta en el formato nuevo no la toca: manda la hoja.
 * @return {Spreadsheet}
 */
function kcCrearHojas_() {
  var ss = SpreadsheetApp.getActive();
  var hK = ss.getSheetByName(KC_HOJA_KAMS);
  var hD = ss.getSheetByName(KC_HOJA_DEPTOS);
  var vacia = !hK || hK.getLastRow() < 2;
  var encK = vacia ? [] : hK.getRange(1, 1, 1, hK.getLastColumn()).getValues()[0].map(kcNorm_);
  var formatoNuevo = !vacia && encK.indexOf('CONFIRMADO') >= 0 && encK.indexOf('VERIFICAR') < 0;

  if (vacia && typeof KAMS_SEMILLA !== 'undefined') {
    var contactos = [], mapa = [], vistoM = {};
    KAMS_SEMILLA.forEach(function (f) {
      contactos.push([f[0], f[1], f[2], String(f[3]).toUpperCase() === 'SI' ? 'NO' : 'SI']); // col-fija
      kcTokens_(f[4]).forEach(function (t) { if (!vistoM[kcNorm_(t)]) { vistoM[kcNorm_(t)] = true; mapa.push([t, f[0]]); } }); // col-fija
    });
    kcEscribirKams_(ss, contactos, mapa);
  } else if (!vacia && !formatoNuevo) {
    var viejo = kcLeerViejo_(hK);
    kcEscribirKams_(ss, viejo.contactos, viejo.mapa);
  } else if (formatoNuevo && (!hD || hD.getLastRow() < 2) && typeof KAMS_SEMILLA !== 'undefined') {
    // KAMS ya esta bien pero falta el mapa de departamentos: se arma desde la semilla.
    var mapa2 = [], vm = {};
    KAMS_SEMILLA.forEach(function (f) {
      kcTokens_(f[4]).forEach(function (t) { if (!vm[kcNorm_(t)]) { vm[kcNorm_(t)] = true; mapa2.push([t, f[0]]); } }); // col-fija
    });
    var actual = hK.getDataRange().getValues().slice(1).filter(function (r) { return r[0]; });
    kcEscribirKams_(ss, actual, mapa2);
  }

  var hC = ss.getSheetByName(KC_HOJA_CORREO);
  if (!hC || hC.getLastRow() === 0) {
    var c = hC || ss.insertSheet(KC_HOJA_CORREO);
    c.getRange('A1:B2').setValues([['ASUNTO', KC_ASUNTO_DEFAULT], ['MENSAJE', KC_MENSAJE_DEFAULT]]);
    c.getRange('A1:A2').setFontWeight('bold');
    c.getRange('B1:B2').setWrap(true).setVerticalAlignment('top');
  }
  return ss;
}

/**
 * Grupo KAM de un departamento/categoria. Acepta un texto o una lista de candidatos
 * (en orden de prioridad: el primero que caiga en un grupo gana).
 * Igualdad exacta primero, luego "contiene". '' si ninguno cae.
 */
function kamsGrupoDe_(kams, candidatos) {
  var lista = Array.isArray(candidatos) ? candidatos : [candidatos];
  for (var n = 0; n < lista.length; n++) {
    var g = kamsGrupoUno_(kams, lista[n]);
    if (g) return g;
  }
  return '';
}

function kamsGrupoUno_(kams, categoria) {
  var c = kcNorm_(categoria);
  if (!c) return '';
  var i, j, g, t;
  for (i = 0; i < kams.orden.length; i++) {
    g = kams.orden[i];
    if (kams.grupos[g].cats.indexOf(c) !== -1) return g;
  }
  for (i = 0; i < kams.orden.length; i++) {
    g = kams.orden[i];
    for (j = 0; j < kams.grupos[g].cats.length; j++) {
      t = kams.grupos[g].cats[j];
      if (t.length >= 4 && (c.indexOf(t) !== -1 || t.indexOf(c) !== -1)) return g;
    }
  }
  return '';
}


/** Asunto y mensaje desde la hoja "Correo" (A1/B1 asunto, A2/B2 mensaje). Si falta, usa los de arriba. */
function kcTextos_() {
  var h = SpreadsheetApp.getActive().getSheetByName(KC_HOJA_CORREO);
  var asunto = KC_ASUNTO_DEFAULT, msg = KC_MENSAJE_DEFAULT;
  if (h && h.getLastRow() >= 1) {
    // por etiqueta (ASUNTO / MENSAJE en la primera columna), no por celda fija; el valor va a su derecha
    var v = h.getDataRange().getValues();
    v.forEach(function (f) {
      var et = kcNorm_(f[0]), val = String(f[1] || '').trim();
      if (et === 'ASUNTO' && val) asunto = val;
      if (et === 'MENSAJE' && val) msg = val;
    });
  }
  return { asunto: asunto, mensaje: msg };
}

/* ================================================================== */
/*  Hoja Correo: asunto y mensaje arriba + tabla de killers a enviar   */
/* ================================================================== */

var KC_PERDIDA_MIN = 0.03;   // se manda solo lo que pierde MAS de 3% (% PERDIDA = FALTA / MINIMO)
var KC_FILA_ENC    = 4;      // fila del encabezado de la tabla (1 asunto, 2 mensaje, 3 vacia)
var KC_ENC_CORREO  = ['ENVIAR', 'GRUPO KAM', 'SKU', 'PRODUCTO', 'PRECIO MINIMO', '% PERDIDA', 'CATEGORIA', 'UPC', 'GTIN', 'PARA', 'AVISO'];

/** Numero desde una celda: acepta 0.05, "5%" o "5.0 %". '' si no es numero. */
function kcPct_(v) {
  if (typeof v === 'number') return v;
  var t = String(v == null ? '' : v).trim();
  if (!t) return '';
  var n = parseFloat(t.replace('%', '').replace(',', '.'));
  if (isNaN(n)) return '';
  return t.indexOf('%') >= 0 ? n / 100 : n;
}

/** Fila del encabezado de la tabla de Correo (la que empieza con ENVIAR), 0 si no hay. */
function kcFilaEnc_(v) {
  for (var i = 0; i < Math.min(v.length, 12); i++) if (kcNorm_(v[i][0]) === 'ENVIAR') return i + 1;
  return 0;
}

/**
 * Rehace la tabla de la hoja "Correo" a partir de "Killers bajo minimo":
 * solo los SKU con % PERDIDA mayor a KC_PERDIDA_MIN, con grupo KAM, UPC, GTIN y categoria.
 * Asunto y mensaje (filas 1 y 2) no se tocan. La columna ENVIAR (SI/NO) conserva lo que
 * pusiste a mano por SKU. Es la vista previa EXACTA de lo que sale en los correos.
 * @return {{total:number, enviar:number, sinKam:number, sinCorreo:number}}
 */
function kcRefrescarCorreo_() {
  var ss = kcCrearHojas_();
  var h = ss.getSheetByName(KC_HOJA_CORREO);
  var kams = kamsLeer_();

  // 1) lo que ya habia: ENVIAR=NO puesto a mano (no el automatico por falta de KAM/correo)
  var noManual = {};
  if (h.getLastRow() >= 2) {
    var vp = h.getDataRange().getValues();
    var fe = kcFilaEnc_(vp);
    if (fe) {
      var cp = colsDe_(vp[fe - 1], ['ENVIAR', 'SKU'], KC_HOJA_CORREO, ['AVISO']);
      for (var p = fe; p < vp.length; p++) {
        var sk = String(vp[p][cp['SKU']] || '').trim().toUpperCase();
        var av = cp['AVISO'] >= 0 ? kcNorm_(vp[p][cp['AVISO']]) : '';
        if (sk && kcNorm_(vp[p][cp['ENVIAR']]) === 'NO' && av.indexOf('SIN GRUPO') < 0 && av.indexOf('SIN CORREO') < 0) noManual[sk] = true;
      }
    }
  }

  // 2) killers con perdida > 3%
  var filas = [];
  var hb = ss.getSheetByName('Killers bajo minimo');
  if (hb && hb.getLastRow() >= 2) {
    var vb = hb.getDataRange().getValues();
    var cb = colsDe_(vb[0], ['SKU WALMART', 'MINIMO', '% PERDIDA'], 'Killers bajo minimo',
                     ['PRODUCTO', 'CATEGORIA', 'CATEGORIA KAM', 'DEPARTAMENTO WALMART', 'UPC', 'GTIN']);
    var val = function (r, n) { return cb[n] >= 0 ? r[cb[n]] : ''; };
    for (var i = 1; i < vb.length; i++) {
      var r = vb[i];
      var sku = String(r[cb['SKU WALMART']] || '').trim();
      var pct = kcPct_(r[cb['% PERDIDA']]);
      if (!sku || pct === '' || !(pct > KC_PERDIDA_MIN)) continue;
      var g = kcNorm_(val(r, 'CATEGORIA KAM'));
      if (!g || g === KC_SIN_KAM) g = kamsGrupoDe_(kams, [val(r, 'DEPARTAMENTO WALMART'), val(r, 'CATEGORIA')]) || KC_SIN_KAM;
      var G = kams.grupos[g];
      var correos = G ? G.correos : [];
      var avisos = [];
      if (g === KC_SIN_KAM) avisos.push('Sin grupo KAM: no se envia');
      else if (!correos.length) avisos.push('Sin correos: no se envia');
      else if (G.sinConfirmar.length) avisos.push('Correo sin confirmar');
      var upc = String(val(r, 'UPC') || ''), gtin = String(val(r, 'GTIN') || '');
      if (!upc && !gtin) avisos.push('Sin GTIN ni UPC');
      var sendable = g !== KC_SIN_KAM && correos.length > 0;
      filas.push([
        (sendable && !noManual[sku.toUpperCase()]) ? 'SI' : 'NO', g, sku, val(r, 'PRODUCTO'), val(r, 'MINIMO'),
        pct, val(r, 'CATEGORIA'), upc, gtin, correos.join('; '), avisos.join(' · ')
      ]);
    }
  }
  var rango = function (g) { var k = kams.orden.indexOf(g); return g === KC_SIN_KAM ? 9999 : (k < 0 ? 9000 : k); };
  filas.sort(function (a, b) { return (rango(a[1]) - rango(b[1])) || (b[5] - a[5]); });   // col-fija

  // 3) escribir: filas 1-2 (asunto/mensaje) se quedan; todo desde la 3 se rehace
  var nC = KC_ENC_CORREO.length;
  try { var f = h.getFilter(); if (f) f.remove(); } catch (e) {}
  h.getRange(1, 1, 2, h.getMaxColumns()).breakApart();
  h.clearConditionalFormatRules();
  if (h.getMaxColumns() < nC) h.insertColumnsAfter(h.getMaxColumns(), nC - h.getMaxColumns());
  var nF = Math.max(filas.length, 1);
  var ultima = KC_FILA_ENC + nF;
  if (h.getMaxRows() < ultima) h.insertRowsAfter(h.getMaxRows(), ultima - h.getMaxRows());
  var abajo = h.getRange(3, 1, h.getMaxRows() - 2, h.getMaxColumns());
  abajo.clear(); abajo.clearDataValidations();
  if (h.getMaxRows() > ultima) h.deleteRows(ultima + 1, h.getMaxRows() - ultima);
  if (h.getMaxColumns() > nC) h.deleteColumns(nC + 1, h.getMaxColumns() - nC);

  // arriba: asunto y mensaje
  h.getRange('A1:A2').setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF').setVerticalAlignment('top');
  h.getRange('B1:G1').merge().setWrap(true).setVerticalAlignment('top').setBackground('#FFF8E1');
  h.getRange('B2:G2').merge().setWrap(true).setVerticalAlignment('top').setBackground('#FFF8E1');
  h.setRowHeight(1, 24); h.setRowHeight(2, 110); h.setRowHeight(3, 12);

  // tabla
  var enc = h.getRange(KC_FILA_ENC, 1, 1, nC);
  enc.setValues([KC_ENC_CORREO]).setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF').setHorizontalAlignment('center');
  if (filas.length) {
    var cuerpo = h.getRange(KC_FILA_ENC + 1, 1, filas.length, nC);
    h.getRange(KC_FILA_ENC + 1, 8, filas.length, 2).setNumberFormat('@');   // col-fija: UPC y GTIN como texto
    cuerpo.setValues(filas).setVerticalAlignment('middle');
    h.getRange(KC_FILA_ENC + 1, 5, filas.length, 1).setNumberFormat('$#,##0.00');   // col-fija: PRECIO MINIMO
    h.getRange(KC_FILA_ENC + 1, 6, filas.length, 1).setNumberFormat('0.0%');        // col-fija: % PERDIDA
    var fondo = [], par = false, previo = null;
    filas.forEach(function (x) {
      if (x[1] !== previo) { par = !par; previo = x[1]; }    // col-fija
      var c = par ? '#FFFFFF' : '#EEF2F7';
      fondo.push(KC_ENC_CORREO.map(function () { return c; }));
    });
    cuerpo.setBackgrounds(fondo);
    h.getRange(KC_FILA_ENC + 1, 1, filas.length, 1).setDataValidation(SpreadsheetApp.newDataValidation() // col-fija
      .requireValueInList(['SI', 'NO'], true).setAllowInvalid(false).build()).setHorizontalAlignment('center');
    h.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$A' + (KC_FILA_ENC + 1) + '="NO"')
        .setFontColor('#9AA0A6').setRanges([cuerpo]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$K' + (KC_FILA_ENC + 1) + '<>""')
        .setBackground('#FFE599').setRanges([h.getRange(KC_FILA_ENC + 1, nC, filas.length, 1)]).build()
    ]);
  } else {
    h.getRange(KC_FILA_ENC + 1, 2).setValue('Ningun killer con perdida mayor a ' + Math.round(KC_PERDIDA_MIN * 100) + '% en "Killers bajo minimo".')  // col-fija
      .setFontStyle('italic').setFontColor('#5F6368');
  }
  [90, 160, 120, 300, 120, 90, 170, 130, 140, 260, 240].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  h.setFrozenRows(KC_FILA_ENC);
  h.getRange(KC_FILA_ENC, 1, nF + 1, nC).createFilter();

  var enviar = filas.filter(function (x) { return x[0] === 'SI'; }).length;   // col-fija
  return {
    total: filas.length, enviar: enviar,
    sinKam: filas.filter(function (x) { return x[1] === KC_SIN_KAM; }).length,                       // col-fija
    sinCorreo: filas.filter(function (x) { return x[1] !== KC_SIN_KAM && !x[9]; }).length            // col-fija
  };
}

/** Menu: actualizar la tabla de la hoja Correo a mano y decir como quedo. */
function kcActualizar() {
  var ui = SpreadsheetApp.getUi();
  var r;
  try { r = kdReintentar_(kcRefrescarCorreo_); }
  catch (e) { ui.alert('📋 Hoja Correo', 'No pude actualizarla: ' + e.message, ui.ButtonSet.OK); return; }
  ui.alert('📋 Hoja Correo',
    r.total + ' killers con perdida mayor a ' + Math.round(KC_PERDIDA_MIN * 100) + '%.\n' +
    r.enviar + ' marcados para enviar (ENVIAR = SI).\n' +
    (r.sinKam ? '⚠ ' + r.sinKam + ' sin grupo KAM (agrega su departamento en KAMS Departamentos).\n' : '') +
    (r.sinCorreo ? '⚠ ' + r.sinCorreo + ' en grupos sin correos.\n' : '') +
    '\nRevisa la tabla; pon NO en ENVIAR a lo que no quieras mandar. Los correos salen de ESA tabla.', ui.ButtonSet.OK);
}

/* ================================================================== */
/*  Armado de los correos                                              */
/* ================================================================== */

/**
 * Arma un paquete por grupo KAM leyendo la TABLA de la hoja "Correo" (filas con ENVIAR distinto de NO).
 * Si la tabla no existe todavia, la arma desde "Killers bajo minimo".
 * @return {{paquetes:Object[], sinKam:Object[], sinCorreo:string[], sinGtin:number}}
 */
function kcArmar_() {
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName(KC_HOJA_CORREO);
  var v = h ? h.getDataRange().getValues() : [];
  if (!kcFilaEnc_(v)) {
    var hb = ss.getSheetByName('Killers bajo minimo');
    if (!hb || hb.getLastRow() < 2) throw new Error('La hoja "Killers bajo minimo" esta vacia. Corre primero 📊 Bajar killers bajo minimo.');
    kcRefrescarCorreo_();
    h = ss.getSheetByName(KC_HOJA_CORREO);
    v = h.getDataRange().getValues();
  }
  var fe = kcFilaEnc_(v);
  var c = colsDe_(v[fe - 1], ['ENVIAR', 'GRUPO KAM', 'SKU', 'PRECIO MINIMO'], KC_HOJA_CORREO,
                  ['PRODUCTO', 'CATEGORIA', 'UPC', 'GTIN']);
  var kams = kamsLeer_();

  var porGrupo = {}, sinKam = [], sinGtin = 0;
  for (var i = fe; i < v.length; i++) {
    var sku = String(v[i][c['SKU']] || '').trim();
    if (!sku || kcNorm_(v[i][c['ENVIAR']]) === 'NO') continue;
    var g = kcNorm_(v[i][c['GRUPO KAM']]);
    if (!g || g === KC_SIN_KAM || !kams.grupos[g]) {
      sinKam.push({ sku: sku, cat: String((c['CATEGORIA'] >= 0 ? v[i][c['CATEGORIA']] : '') || '(vacia)') });
      continue;
    }
    var gtin = c['GTIN'] >= 0 ? v[i][c['GTIN']] : '', upc = c['UPC'] >= 0 ? v[i][c['UPC']] : '';
    if (!gtin && !upc) sinGtin++;
    (porGrupo[g] = porGrupo[g] || []).push([sku, v[i][c['PRECIO MINIMO']], gtin, upc, c['PRODUCTO'] >= 0 ? v[i][c['PRODUCTO']] : '']);
  }

  var paquetes = [], sinCorreo = [];
  kams.orden.forEach(function (g) {
    if (!porGrupo[g]) return;
    var correos = kams.grupos[g].correos;
    if (!correos.length) { sinCorreo.push(g); return; }
    paquetes.push({ grupo: g, para: correos, filas: porGrupo[g], sinConf: kams.grupos[g].sinConfirmar });
  });
  return { paquetes: paquetes, sinKam: sinKam, sinCorreo: sinCorreo, sinGtin: sinGtin };
}

/** Arma el .xlsx adjunto: SKU | PRECIO MINIMO | GTIN | UPC. GTIN/UPC como texto para no perder ceros. */
function kcXlsx_(grupo, filas) {
  var tmp = SpreadsheetApp.create('tmp_killers_' + grupo + '_' + Date.now());
  var idTmp = tmp.getId();
  try {
    var h = tmp.getSheets()[0];
    h.setName('Killers');
    var datos = [['SKU', 'PRECIO MINIMO', 'GTIN', 'UPC']].concat(filas.map(function (f) { return [f[0], f[1], f[2], f[3]]; }));
    h.getRange(1, 3, datos.length, 2).setNumberFormat('@');
    h.getRange(1, 1, datos.length, 4).setValues(datos);
    h.getRange(1, 1, 1, 4).setFontWeight('bold');
    h.getRange(2, 2, Math.max(filas.length, 1), 1).setNumberFormat('#,##0.00');
    h.autoResizeColumns(1, 4);
    SpreadsheetApp.flush();
    var resp = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + idTmp + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) throw new Error('No pude exportar el adjunto (HTTP ' + resp.getResponseCode() + ').');
    var fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
    return resp.getBlob().setName('Killers_precio_minimo_' + grupo.replace(/[^A-Z0-9]+/g, '_') + '_' + fecha + '.xlsx');
  } finally {
    try { DriveApp.getFileById(idTmp).setTrashed(true); } catch (e) {}
  }
}

/* ================================================================== */
/*  Menu: confirmar y enviar                                           */
/* ================================================================== */

function kcEnviar() {
  var ui = SpreadsheetApp.getUi();
  var plan;
  try { plan = kcArmar_(); } catch (e) { ui.alert('📧 Correos de killers', e.message, ui.ButtonSet.OK); return; }

  if (!plan.paquetes.length) {
    ui.alert('📧 Correos de killers',
      'No hay nada que enviar.\n\n' +
      (plan.sinKam.length ? plan.sinKam.length + ' killers sin grupo KAM (agrega su departamento en la hoja KAMS Departamentos).\n' : '') +
      (plan.sinCorreo.length ? 'Grupos sin correos: ' + plan.sinCorreo.join(', ') : ''), ui.ButtonSet.OK);
    return;
  }

  var t = kcTextos_();
  var yo = Session.getEffectiveUser().getEmail();
  var total = 0;
  var lin = plan.paquetes.map(function (p) {
    total += p.filas.length;
    return '▸ ' + p.grupo + '  (' + p.filas.length + ' killers)\n    PARA: ' + p.para.join('; ') +
      (p.sinConf && p.sinConf.length ? '\n    ⚠ sin confirmar: ' + p.sinConf.join('; ') : '');
  });
  var avisos = [];
  if (plan.sinKam.length) {
    var cats = {};
    plan.sinKam.forEach(function (s) { cats[s.cat] = (cats[s.cat] || 0) + 1; });
    avisos.push('⚠ ' + plan.sinKam.length + ' killers SIN grupo KAM, NO se envian: ' +
      Object.keys(cats).map(function (c) { return c + ' (' + cats[c] + ')'; }).join(', '));
  }
  if (plan.sinCorreo.length) avisos.push('⚠ Grupos sin correos, NO se envian: ' + plan.sinCorreo.join(', '));
  if (plan.sinGtin) avisos.push('⚠ ' + plan.sinGtin + ' SKU sin GTIN ni UPC en la hoja Walmart (van con esas celdas vacias).');

  var texto =
    'DE: ' + yo + '\n' +
    'ASUNTO: ' + t.asunto + '\n' +
    'ADJUNTO: xlsx con SKU | PRECIO MINIMO | GTIN | UPC\nORIGEN: tabla de la hoja "Correo" (solo filas con ENVIAR = SI)\n\n' +
    lin.join('\n') + '\n\n' +
    'Total: ' + plan.paquetes.length + ' correos, ' + total + ' killers.\n' +
    (avisos.length ? '\n' + avisos.join('\n') + '\n' : '') +
    '\nMENSAJE:\n' + t.mensaje + '\n\n' +
    '────────────\n' +
    'SI = ENVIAR DE VERDAD a los KAMs\n' +
    'NO = PRUEBA: manda todo solo a ti (' + yo + ')\n' +
    'CANCELAR = no enviar nada';

  var r = ui.alert('📧 Confirma el envio', texto, ui.ButtonSet.YES_NO_CANCEL);
  if (r === ui.Button.CANCEL || r === ui.Button.CLOSE) return;
  var prueba = (r === ui.Button.NO);

  var ok = 0, fallos = [];
  var hLog = kcLog_();
  plan.paquetes.forEach(function (p) {
    var dest = prueba ? [yo] : p.para;
    var estado = 'ENVIADO';
    try {
      var adj = kcXlsx_(p.grupo, p.filas);
      var cuerpo = (prueba ? '[PRUEBA] Esto se habria enviado a: ' + p.para.join('; ') + '\n\n' : '') + t.mensaje;
      MailApp.sendEmail({
        to: dest.join(','),
        subject: (prueba ? '[PRUEBA] ' : '') + t.asunto + (prueba ? ' - ' + p.grupo : ''),
        body: cuerpo,
        attachments: [adj]
      });
      ok++;
    } catch (e) {
      estado = 'ERROR: ' + e.message;
      fallos.push(p.grupo + ': ' + e.message);
    }
    hLog.appendRow([new Date(), prueba ? 'PRUEBA' : 'REAL', p.grupo, dest.join('; '), p.filas.length, estado]);
  });

  ui.alert('📧 Listo',
    (prueba ? 'PRUEBA: ' : 'ENVIADO: ') + ok + ' de ' + plan.paquetes.length + ' correos' +
    (prueba ? ' (a ' + yo + ')' : '') + '.\n' +
    (fallos.length ? '\nFallaron:\n' + fallos.join('\n') + '\n' : '') +
    '\nQuedo registro en la hoja "' + KC_HOJA_LOG + '".', ui.ButtonSet.OK);
}

function kcLog_() {
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName(KC_HOJA_LOG);
  if (!h) {
    h = ss.insertSheet(KC_HOJA_LOG);
    h.getRange(1, 1, 1, 6).setValues([['FECHA', 'MODO', 'GRUPO KAM', 'PARA', 'KILLERS', 'ESTADO']]).setFontWeight('bold');
    h.setFrozenRows(1);
  }
  return h;
}
