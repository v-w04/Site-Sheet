/**
 * KillersCorreo.gs
 *
 * Correo a los KAMs de Walmart cuando cambia el precio minimo de un killer.
 *
 * Menu: 🔥 Killers -> 📧 Enviar correos de killers
 *
 * De donde sale todo (nada se calcula aqui):
 *   - Killers y MINIMO:   hoja "Killers bajo minimo" (bajada del site).
 *   - GTIN y UPC:         hoja "Walmart" (cruce por SKU).
 *   - Destinatarios:      hoja "KAMS" (se llena a mano; los correos NO van al repo).
 *   - Asunto y mensaje:   hoja "Correo" (editable).
 *
 * Flujo: arma un correo por categoria KAM -> muestra en un popup a quien y que
 * datos -> SI = envia de verdad, NO = envia SOLO A TI como prueba, CANCELAR = nada.
 * Cada envio queda en la hoja "Envios killers".
 *
 * Necesita el permiso script.send_mail (esta en appsscript.json).
 */

var KC_HOJA_KAMS   = 'KAMS';
var KC_HOJA_CORREO = 'Correo';
var KC_HOJA_LOG    = 'Envios killers';
var KC_PARA_ROW    = 'PARA (COMPENDIO)';
var KC_SIN_KAM     = 'SIN KAM';

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

function kcNorm_(t) {
  return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Lee la hoja KAMS.
 * Columnas: GRUPO | NOMBRE | CORREO | VERIFICAR | CATEGORIAS DEL SITE (separadas por ;)
 * La fila "PARA (compendio)" de cada grupo se ignora: los correos se juntan de las filas de personas.
 * @return {{orden:string[], grupos:Object}} grupos[NOMBRE] = {correos:[], cats:[]}
 */
function kamsLeer_() {
  var h = kcCrearHojas_().getSheetByName(KC_HOJA_KAMS);
  if (!h) throw new Error('No existe la hoja "' + KC_HOJA_KAMS + '" y no hay datos para crearla (falta KamsDatos.gs).');
  var v = h.getDataRange().getValues();
  var orden = [], grupos = {};
  for (var i = 1; i < v.length; i++) {
    var g = kcNorm_(v[i][0]);
    if (!g) continue;
    if (!grupos[g]) { grupos[g] = { correos: [], cats: [] }; orden.push(g); }
    var nom = kcNorm_(v[i][1]);
    var cats = String(v[i][4] || '').split(';');
    cats.forEach(function (c) { c = kcNorm_(c); if (c && grupos[g].cats.indexOf(c) === -1) grupos[g].cats.push(c); });
    if (nom.indexOf('PARA') === 0) continue;
    var mail = String(v[i][2] || '').trim();
    if (mail.indexOf('@') > 0 && grupos[g].correos.indexOf(mail) === -1) grupos[g].correos.push(mail);
  }
  return { orden: orden, grupos: grupos };
}


/**
 * Crea las hojas KAMS y Correo si no existen, con formato.
 * Los contactos vienen de KAMS_SEMILLA (archivo privado KamsDatos.gs, fuera de GitHub).
 * Si la hoja ya existe no la toca: manda la hoja.
 * @return {Spreadsheet}
 */
function kcCrearHojas_() {
  var ss = SpreadsheetApp.getActive();
  var hK = ss.getSheetByName(KC_HOJA_KAMS);
  if ((!hK || hK.getLastRow() === 0) && typeof KAMS_SEMILLA !== 'undefined') {
    var h = hK || ss.insertSheet(KC_HOJA_KAMS);
    var filas = [['GRUPO KAM', 'NOMBRE', 'CORREO', 'VERIFICAR', 'CATEGORIAS DEL SITE (separadas por ;)']];
    var compendio = [], ini = 0, grupo = null;
    var cierra = function () {
      if (grupo === null) return;
      filas.push([grupo, 'PARA (compendio)', '=TEXTJOIN("; ",TRUE,C' + (ini + 1) + ':C' + filas.length + ')', '', '']);
      compendio.push(filas.length);
      filas.push(['', '', '', '', '']);
    };
    KAMS_SEMILLA.forEach(function (f) {
      if (f[0] !== grupo) { cierra(); grupo = f[0]; ini = filas.length; }
      filas.push(f);
    });
    cierra();
    h.getRange(1, 1, filas.length, 5).setValues(filas);
    h.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#eef2f7');
    compendio.forEach(function (r) { h.getRange(r, 1, 1, 5).setFontWeight('bold').setBackground('#fff2cc'); });
    h.setFrozenRows(1);
    [150, 220, 300, 90, 420].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  }
  var hC = ss.getSheetByName(KC_HOJA_CORREO);
  if (!hC || hC.getLastRow() === 0) {
    var c = hC || ss.insertSheet(KC_HOJA_CORREO);
    c.getRange('A1:B2').setValues([['ASUNTO', KC_ASUNTO_DEFAULT], ['MENSAJE', KC_MENSAJE_DEFAULT]]);
    c.getRange('A1:A2').setFontWeight('bold');
    c.setColumnWidth(1, 90); c.setColumnWidth(2, 640);
    c.getRange('B2').setWrap(true).setVerticalAlignment('top');
    c.setRowHeight(2, 170);
  }
  return ss;
}

/** Grupo KAM de una categoria del site. Igualdad exacta primero, luego "contiene". '' si no hay. */
function kamsGrupoDe_(kams, categoria) {
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
  if (h) {
    var a = String(h.getRange('B1').getValue() || '').trim();
    var m = String(h.getRange('B2').getValue() || '').trim();
    if (a) asunto = a;
    if (m) msg = m;
  }
  return { asunto: asunto, mensaje: msg };
}

/* ================================================================== */
/*  Armado de los correos                                              */
/* ================================================================== */

function kcColIdx_(cab, nombre) {
  var n = kcNorm_(nombre);
  for (var i = 0; i < cab.length; i++) if (kcNorm_(cab[i]) === n) return i;
  return -1;
}

/**
 * Arma un paquete por grupo KAM.
 * @return {{paquetes:Object[], sinKam:Object[], sinCorreo:string[], sinGtin:number}}
 */
function kcArmar_() {
  var ss = SpreadsheetApp.getActive();
  var hb = ss.getSheetByName('Killers bajo minimo');
  if (!hb || hb.getLastRow() < 2) throw new Error('La hoja "Killers bajo minimo" esta vacia. Corre primero 📊 Bajar dashboard del site.');
  var kams = kamsLeer_();

  var vb = hb.getDataRange().getValues();
  var cab = vb[0];
  var iSku = kcColIdx_(cab, 'SKU WALMART'), iMin = kcColIdx_(cab, 'MINIMO'),
      iCat = kcColIdx_(cab, 'CATEGORIA'),   iNom = kcColIdx_(cab, 'PRODUCTO');
  if (iSku < 0 || iMin < 0 || iCat < 0) throw new Error('A "Killers bajo minimo" le faltan columnas (SKU WALMART, MINIMO o CATEGORIA). Vuelve a bajar el dashboard.');

  // GTIN y UPC de la hoja Walmart, por SKU
  var gt = {};
  var hw = ss.getSheetByName('Walmart');
  if (hw && hw.getLastRow() > 1) {
    var vw = hw.getDataRange().getDisplayValues();
    var wS = kcColIdx_(vw[0], 'SKU'), wG = kcColIdx_(vw[0], 'GTIN'), wU = kcColIdx_(vw[0], 'UPC');
    if (wS >= 0) for (var r = 1; r < vw.length; r++) {
      var k = String(vw[r][wS]).trim().toUpperCase();
      if (k) gt[k] = { gtin: wG >= 0 ? vw[r][wG] : '', upc: wU >= 0 ? vw[r][wU] : '' };
    }
  }

  var porGrupo = {}, sinKam = [], sinGtin = 0;
  for (var i = 1; i < vb.length; i++) {
    var sku = String(vb[i][iSku] || '').trim();
    if (!sku) continue;
    var cat = vb[i][iCat];
    var g = kamsGrupoDe_(kams, cat);
    var min = vb[i][iMin];
    if (!g) { sinKam.push({ sku: sku, cat: String(cat || '(vacia)') }); continue; }
    var x = gt[sku.toUpperCase()] || { gtin: '', upc: '' };
    if (!x.gtin && !x.upc) sinGtin++;
    (porGrupo[g] = porGrupo[g] || []).push([sku, min, x.gtin, x.upc, iNom >= 0 ? vb[i][iNom] : '']);
  }

  var paquetes = [], sinCorreo = [];
  kams.orden.forEach(function (g) {
    if (!porGrupo[g]) return;
    var correos = kams.grupos[g].correos;
    if (!correos.length) { sinCorreo.push(g); return; }
    paquetes.push({ grupo: g, para: correos, filas: porGrupo[g] });
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
      (plan.sinKam.length ? plan.sinKam.length + ' killers sin grupo KAM (revisa la columna E de la hoja KAMS).\n' : '') +
      (plan.sinCorreo.length ? 'Grupos sin correos: ' + plan.sinCorreo.join(', ') : ''), ui.ButtonSet.OK);
    return;
  }

  var t = kcTextos_();
  var yo = Session.getEffectiveUser().getEmail();
  var total = 0;
  var lin = plan.paquetes.map(function (p) {
    total += p.filas.length;
    return '▸ ' + p.grupo + '  (' + p.filas.length + ' killers)\n    PARA: ' + p.para.join('; ');
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
    'ADJUNTO: xlsx con SKU | PRECIO MINIMO | GTIN | UPC\n\n' +
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
