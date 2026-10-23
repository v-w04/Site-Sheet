/**
 * ============================================================
 *  Solicitud de killers del mes — un correo por KAM con su parrilla
 * ============================================================
 *
 *  Menu: 🔥 Killers y KAMs -> ✉️ Solicitud de killers del mes (parrillas).
 *
 *  Por cada grupo KAM que tenga SKU en su hoja "Parrilla <GRUPO>" y correos en la hoja "KAMS":
 *    - ASUNTO:  ELECTRONICS.MEXICO SOLICITUD KILLERS <MES AÑO> - <GRUPO>     (ej. ... NOVIEMBRE 2026 - AUDIO)
 *    - MENSAJE: Buen día, enviamos nuestra solicitud para Killers, saludos
 *    - ADJUNTO: Killers_Electronics.Mexico_<GRUPO>_<DDmesAA>_v<MES>.xlsx, con la estructura de la plantilla de Walmart (hoja unica "Killers") y lo que dice la hoja de la parrilla
 *    - PARA:    todos los contactos del grupo en UN SOLO correo (no uno por persona).
 *  Los grupos y sus contactos salen de las hojas "KAMS" y "KAMS Departamentos". Nada se inventa.
 *
 *  Antes de enviar muestra a quien va cada correo: SI = enviar de verdad, NO = PRUEBA (todo llega solo a tu
 *  correo, con "[PRUEBA]" en el asunto), CANCELAR = nada. Cada envio queda en la hoja "Envios killers".
 *  Un grupo que ya se envio en REAL para ese mes no se vuelve a enviar (se avisa).
 *
 *  Necesita el permiso script.send_mail (esta en appsscript.json).
 */

var SK_MENSAJE = 'Buen día, enviamos nuestra solicitud para Killers, saludos';
var SK_MENSAJE_RECONSIDERAR = 'Buen día, solicitamos reconsiderar estos productos para Killers, saludos';
var SK_MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/** El mes que viene, en el formato del asunto: "NOVIEMBRE 2026". */
function skMesSiguiente_() {
  var mm = parseInt(Utilities.formatDate(new Date(), TZ, 'M'), 10), yy = parseInt(Utilities.formatDate(new Date(), TZ, 'yyyy'), 10);
  mm++;
  if (mm > 12) { mm = 1; yy++; }
  return SK_MESES[mm - 1] + ' ' + yy;
}

function skAsunto_(mes, grupo, recon) { return 'ELECTRONICS.MEXICO ' + (recon ? 'RECONSIDERAR KILLERS ' : 'SOLICITUD KILLERS ') + mes + ' - ' + grupo; }

/** Texto con el que queda el grupo en la bitacora "Envios killers" (sirve para no repetir el mismo mes). */
function skClaveLog_(mes, grupo, recon) { return grupo + ' (' + (recon ? 'RECONSIDERAR ' : 'SOLICITUD ') + mes + ')'; }

/** SKU que estan en parrilla pero NO tienen killer (hoja Estado Killers: KILLER=NO y EN PARRILLA=SI). Es la lista de "no aceptados". */
function skRechazados_() {
  var out = {};
  var h = SpreadsheetApp.getActive().getSheetByName(PAR_HOJA_ESTADO);
  if (!h || h.getLastRow() < 2) return out;
  var m = colsHoja_(h, ['SKU', 'KILLER', 'EN PARRILLA']);
  h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues().forEach(function (f) {
    if (normEnc_(f[m['KILLER']]) === 'NO' && normEnc_(f[m['EN PARRILLA']]) === 'SI') out[String(f[m['SKU']]).trim()] = true;
  });
  return out;
}

/**
 * Lee la hoja de cada parrilla (lo que se ve es lo que se manda) y los correos del grupo.
 * @return {{paquetes:Array, sinSku:string[], sinCorreo:string[]}} paquetes = [{grupo, filas, para}]
 */
function skArmar_(recon) {
  var ss = getSpreadsheet_();
  var rechazados = recon ? skRechazados_() : null;   // SKU con KILLER=NO que SI estan en parrilla
  var kg = kamsLeer_(), g = parGrupos_();
  var paquetes = [], sinSku = [], sinCorreo = [];
  g.orden.forEach(function (grupo) {
    var h = ss.getSheetByName(parHojaDe_(grupo));
    var filas = [];
    if (h && h.getLastRow() >= 2) {
      var m = colsHoja_(h, PAR_ENC);
      h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues().forEach(function (f) {
        var skuF = String(f[m['SKU SELLER']] || '').trim();
        if (!skuF) return;
        if (rechazados && !rechazados[skuF]) return;
        filas.push(PAR_ENC.map(function (e) { return f[m[e]]; }));   // en el orden de PAR_ENC
      });
    }
    if (!filas.length) { sinSku.push(grupo); return; }
    var G = kg.grupos[grupo];
    if (!G || !G.correos.length) { sinCorreo.push(grupo); return; }
    paquetes.push({ grupo: grupo, filas: filas, para: G.correos.slice() });
  });
  return { paquetes: paquetes, sinSku: sinSku, sinCorreo: sinCorreo };
}

/** DDmesAA en minusculas, como en el nombre de la plantilla de Walmart: 22oct26. */
function skFechaNombre_() {
  var meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var mm = parseInt(Utilities.formatDate(new Date(), TZ, 'M'), 10);
  return Utilities.formatDate(new Date(), TZ, 'dd') + meses[mm - 1] + Utilities.formatDate(new Date(), TZ, 'yy');
}

/** Nombre del archivo: Killers_Electronics.Mexico_<GRUPO>_<DDmesAA>_v<MES>.xlsx (la plantilla de Walmart es Plantilla_Killers_Nombre_Seller_DDmesAA_vEvento). */
function skNombreArchivo_(grupo, mes) {
  var m = String(mes || '').split(' ')[0];
  return 'Killers_' + PAR_SELLER + '_' + grupo + '_' + skFechaNombre_() + '_v' + m + '.xlsx';
}

/**
 * Arma el .xlsx que se manda con la estructura de la plantilla de Walmart (una sola hoja, "Killers"; encabezado en la fila 4):
 * ID Seller | Nombre Seller | SKU Seller | GTIN | WUPC | Descripcion | MSI | Fecha Inicio | Fecha Fin | Inv | WFS | PRECIO FULL
 * y, por cada uno de los 6 escenarios, PRECIO MEJORADO (nuestro) + Precio / Killer / Precio final (los llena Walmart, quedan vacios).
 * `filas` vienen en el orden de PAR_ENC.
 */
function skXlsx_(grupo, filas, mes) {
  var tmp = SpreadsheetApp.create('tmp_killers_' + grupo + '_' + Date.now());
  var idTmp = tmp.getId();
  try {
    var h = tmp.getSheets()[0];
    h.setName('Killers');
    var P = {};                                              // col-fija: indice de cada columna de PAR_ENC en las filas recibidas
    PAR_ENC.forEach(function (e, i) { P[e] = i; });
    var FIJAS = ['ID SELLER', 'NOMBRE SELLER', 'SKU SELLER', 'GTIN', 'WUPC', 'DESCRIPCION', 'MSI', 'FECHA INICIO', 'FECHA FIN', 'INV', 'WFS', 'PRECIO FULL'];
    var ENC4 = ['ID Seller', 'Nombre Seller', 'SKU Seller', 'GTIN', 'WUPC', 'Descripción', 'MSI', 'Fecha Inicio', 'Fecha Fin', 'Inv', 'WFS', 'PRECIO FULL'];
    var NF = FIJAS.length;                                   // columnas fijas; los escenarios empiezan en NF + 1
    PAR_ESCENARIOS.forEach(function () { ENC4.push('PRECIO MEJORADO', 'Precio', 'Killer', 'Precio final'); });
    var C = ENC4.length, n = filas.length;

    var datos = filas.map(function (f) {
      var o = FIJAS.map(function (e) { var v = f[P[e]]; return v === undefined || v === null ? '' : v; });
      PAR_ESCENARIOS.forEach(function (es) { var v = f[P[es[0]]]; o.push(v === undefined || v === null ? '' : v, '', '', ''); });
      return o;
    });
    h.getRange(4, 1, 1, C).setValues([ENC4]);  // col-fija: plantilla de Walmart
    if (n) h.getRange(5, 1, n, C).setValues(datos);  // col-fija: plantilla de Walmart

    var AZUL = '#4472C4', VERDE = '#00B050', ROJO = '#FF0000', BLANCO = '#FFFFFF';
    var COLORES = ['#4472C4', '#ED7D31', '#4C216D', '#FFC000', '#7F7F7F', '#44546A'];
    h.getRange(4, 1, 1, C).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);  // col-fija: plantilla de Walmart
    h.getRange(4, 1, 1, NF).setBackground(AZUL).setFontColor(BLANCO);  // col-fija: plantilla de Walmart
    h.getRange(4, 8, 1, 5).setBackground(VERDE).setFontColor('#000000');              // fechas, inv, WFS y precio full: los llena el seller  // col-fija: plantilla de Walmart
    // titulo y subtitulo (columnas A:L de las filas 1 y 2, libres en la plantilla)
    h.getRange(1, 1).setValue('ELECTRONICS.MEXICO · SOLICITUD DE KILLERS ' + mes).setFontWeight('bold').setFontSize(14);  // col-fija: plantilla de Walmart
    h.getRange(2, 1).setValue('CATEGORÍA: ' + grupo + '  ·  ' + n + ' SKU  ·  ID Seller ' + PAR_ID + '  ·  Todos con MSI')  // col-fija: plantilla de Walmart
      .setFontWeight('bold').setFontColor('#44546A');
    PAR_ESCENARIOS.forEach(function (es, k) {
      var c0 = NF + 1 + 4 * k;
      h.getRange(2, c0, 1, 4).merge().setValue(es[1]).setBackground(COLORES[k]).setFontColor(BLANCO).setFontWeight('bold').setHorizontalAlignment('center');
      h.getRange(3, c0 + 1, 1, 3).merge().setValue('*Debe ser llenado y confirmado por Walmart* Propuesta Walmart')
        .setBackground(COLORES[k]).setFontColor(BLANCO).setFontWeight('bold').setWrap(true);
      h.getRange(4, c0, 1, 1).setBackground(VERDE).setFontColor('#000000');
      h.getRange(4, c0 + 1, 1, 3).setBackground(COLORES[k]).setFontColor(BLANCO);
    });
    if (n) {
      var f1 = function (c, fmt) { h.getRange(5, c, n, 1).setNumberFormat(fmt); };
      f1(1, '0');
      f1(4, '00000000000000'); f1(5, '00000000000000');                               // GTIN y WUPC: 14 digitos con ceros a la izquierda
      f1(8, 'dd/mm/yyyy'); f1(9, 'dd/mm/yyyy'); f1(10, '#,##0');
      f1(12, '"$"#,##0');
      PAR_ESCENARIOS.forEach(function (es, k) { for (var j = 0; j < 4; j++) f1(NF + 1 + 4 * k + j, '"$"#,##0'); });
      var dv = SpreadsheetApp.newDataValidation().requireValueInList(['SI', 'NO'], true).build();
      h.getRange(5, 7, n, 1).setDataValidation(dv);  // col-fija: plantilla de Walmart
      h.getRange(5, 11, n, 1).setDataValidation(dv);  // col-fija: plantilla de Walmart
    }
    if (n) {
      // franjas, bordes finos, alineaciones y gris en lo que llena Walmart
      var fondos = [];
      for (var i = 0; i < n; i++) { var fila = []; for (var c2 = 0; c2 < C; c2++) fila.push(i % 2 ? '#F3F6FA' : '#FFFFFF'); fondos.push(fila); }
      h.getRange(5, 1, n, C).setBackgrounds(fondos);  // col-fija: plantilla de Walmart
      PAR_ESCENARIOS.forEach(function (es, k) { h.getRange(5, NF + 2 + 4 * k, n, 3).setBackground('#EDEDED'); });   // Precio / Killer / Precio final: los llena Walmart
      h.getRange(4, 1, n + 1, C).setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);  // col-fija: plantilla de Walmart
      [1, 7, 8, 9, 10, 11].forEach(function (c3) { h.getRange(5, c3, n, 1).setHorizontalAlignment('center'); });
      h.getRange(5, 12, n, C - 11).setHorizontalAlignment('right');  // col-fija: plantilla de Walmart
      h.getRange(5, 1, n, C).setVerticalAlignment('middle');  // col-fija: plantilla de Walmart
      try { h.getRange(4, 1, n + 1, C).createFilter(); } catch (e) {}  // col-fija: plantilla de Walmart
    }
    h.setRowHeight(4, 34);
    var ANCHOS = [92, 110, 220, 130, 130, 340, 50, 90, 90, 60, 60, 110];
    ANCHOS.forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
    for (var c = NF + 1; c <= C; c++) h.setColumnWidth(c, ((c - NF - 1) % 4 === 0) ? 120 : 95);
    h.setRowHeight(3, 36);
    h.setFrozenRows(4);
    h.setFrozenColumns(3);
    SpreadsheetApp.flush();
    return exportarXlsx_(idTmp, skNombreArchivo_(grupo, mes));
  } finally {
    try { DriveApp.getFileById(idTmp).setTrashed(true); } catch (e) {}
  }
}

/** Grupos que ya se enviaron en REAL para ese mes: { claveLog: fecha }. */
function skYaEnviados_() {
  var out = {};
  var h = SpreadsheetApp.getActive().getSheetByName(KC_HOJA_LOG);
  if (!h || h.getLastRow() < 2) return out;
  var m = colsHoja_(h, ['FECHA', 'MODO', 'GRUPO KAM', 'ESTADO']);
  h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues().forEach(function (f) {
    if (normEnc_(f[m.MODO]) === 'REAL' && normEnc_(f[m.ESTADO]) === 'ENVIADO') out[String(f[m['GRUPO KAM']] || '')] = f[m.FECHA];
  });
  return out;
}

/** Menu: solicitud nueva (todo lo de las parrillas) o reconsiderar (solo lo que no tiene killer). */
function solicitudKillersEnviar() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('✉️ ¿Qué vas a mandar?',
    'SI = SOLICITUD de killers (todo lo de las parrillas)\nNO = RECONSIDERAR (solo lo que hoy NO tiene killer, hoja "' + PAR_HOJA_ESTADO + '")\nCANCELAR = salir',
    ui.ButtonSet.YES_NO_CANCEL);
  if (r === ui.Button.CANCEL || r === ui.Button.CLOSE) return;
  skFlujo_(r === ui.Button.NO);
}

/** Atajo: reconsiderar directo (para ponerlo en el menu cuando quieras). */
function reconsiderarKillersEnviar() { skFlujo_(true); }

function skFlujo_(recon) {
  var ui = SpreadsheetApp.getUi();
  var TIT = recon ? '🔁 Reconsiderar killers' : '✉️ Solicitud de killers';
  var MSG = recon ? SK_MENSAJE_RECONSIDERAR : SK_MENSAJE;
  var plan;
  try { plan = skArmar_(recon); } catch (e) { ui.alert('✉️ Solicitud de killers', e.message, ui.ButtonSet.OK); return; }
  if (!plan.paquetes.length) {
    ui.alert('✉️ Solicitud de killers',
      'No hay nada que enviar.\n\n' +
      (plan.sinSku.length ? 'Parrillas sin SKU: ' + plan.sinSku.join(', ') + '\n(corre 📋 Actualizar parrillas por KAM)\n' : '') +
      (plan.sinCorreo.length ? 'Grupos sin correos en la hoja KAMS: ' + plan.sinCorreo.join(', ') : ''), ui.ButtonSet.OK);
    return;
  }

  // Que KAMs: vacio = todos
  var rk = ui.prompt(TIT, 'Que grupos KAM quieres incluir?\nDisponibles: ' + plan.paquetes.map(function (p) { return p.grupo; }).join(', ') + '\n\nEscribe los nombres separados por coma, o deja vacio para TODOS.', ui.ButtonSet.OK_CANCEL);
  if (rk.getSelectedButton() !== ui.Button.OK) return;
  var elegidos = String(rk.getResponseText() || '').split(',').map(function (s) { return normEnc_(s); }).filter(Boolean);
  if (elegidos.length) {
    plan.paquetes = plan.paquetes.filter(function (p) { return elegidos.indexOf(normEnc_(p.grupo)) >= 0; });
    if (!plan.paquetes.length) { ui.alert(TIT, 'Ninguno de esos nombres coincide. No se envio nada.', ui.ButtonSet.OK); return; }
  }

  // Mes de la solicitud (se puede cambiar)
  var rm = ui.prompt(TIT, 'Mes de la solicitud (va en el asunto):', ui.ButtonSet.OK_CANCEL);
  if (rm.getSelectedButton() !== ui.Button.OK) return;
  var mes = String(rm.getResponseText() || '').trim().toUpperCase();
  if (!mes) mes = skMesSiguiente_();

  var yo = String(props_().getProperty('AVISO_CORREO') || '').trim();
  if (!yo) { try { yo = Session.getEffectiveUser().getEmail() || ''; } catch (x) {} }
  if (!yo) {
    var rc = ui.prompt('Tu correo', 'Escribe tu correo (a este llegan las PRUEBAS).\nSe guarda una sola vez.', ui.ButtonSet.OK_CANCEL);
    if (rc.getSelectedButton() !== ui.Button.OK) return;
    yo = String(rc.getResponseText() || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(yo)) { ui.alert('Ese correo no se ve bien. No se envio nada.'); return; }
    props_().setProperty('AVISO_CORREO', yo);
  }

  var ya = skYaEnviados_();
  var total = 0;
  var lin = plan.paquetes.map(function (p) {
    total += p.filas.length;
    var enviado = recon ? null : ya[skClaveLog_(mes, p.grupo, recon)];
    return '▸ ' + p.grupo + '  (' + p.filas.length + ' SKU)' + (enviado ? '   ⚠ YA SE ENVIO EN REAL (no se reenvia)' : '') +
      '\n    PARA: ' + p.para.join('; ');
  });
  var avisos = [];
  if (plan.sinSku.length) avisos.push('Sin SKU (no se envian): ' + plan.sinSku.join(', '));
  if (plan.sinCorreo.length) avisos.push('⚠ Sin correos en KAMS (no se envian): ' + plan.sinCorreo.join(', '));

  var texto =
    'DE: ' + yo + '\n' +
    'ASUNTO: ' + skAsunto_(mes, '<GRUPO>', recon) + '\n' +
    'MENSAJE: ' + MSG + '\n' +
    'ADJUNTO: ' + skNombreArchivo_('<GRUPO>', mes) + ' (estructura de la plantilla de Walmart, con lo que dice cada hoja Parrilla)\n\n' +
    lin.join('\n') + '\n\n' +
    'Total: ' + plan.paquetes.length + ' correos, ' + total + ' SKU. Un solo correo por grupo, a todos sus contactos.\n' +
    (avisos.length ? '\n' + avisos.join('\n') + '\n' : '') +
    '\n────────────\n' +
    'SI = ENVIAR DE VERDAD a los KAMs (hay ' + KC_CUENTA_SEG + ' s para cancelar en la hoja "' + KC_HOJA_LOG + '")\n' +
    'NO = PRUEBA: manda todo solo a ti (' + yo + ')\n' +
    'CANCELAR = no enviar nada';
  var r = ui.alert(TIT + ' · confirma el envio', texto.substring(0, 3900), ui.ButtonSet.YES_NO_CANCEL);
  if (r === ui.Button.CANCEL || r === ui.Button.CLOSE) return;
  var prueba = (r === ui.Button.NO);
  if (!prueba && !kcCuentaRegresiva_(KC_CUENTA_SEG, TIT + ' ' + mes)) {
    try { logWarn_('SOLICITUD', TIT + ' ' + mes + ' CANCELADA en la cuenta regresiva (no se envio nada)'); flushLog_(); } catch (e) {}
    ui.alert('✉️ Cancelado', 'Cancelaste durante la cuenta regresiva. No se envio nada.', ui.ButtonSet.OK);
    return;
  }

  var ok = 0, saltados = 0, fallos = [];
  var hLog = kcLog_();
  plan.paquetes.forEach(function (p) {
    var clave = skClaveLog_(mes, p.grupo, recon);
    if (!prueba && !recon && ya[clave]) { saltados++; return; }
    var dest = prueba ? [yo] : p.para;
    var estado = 'ENVIADO';
    try {
      var adj = skXlsx_(p.grupo, p.filas, mes);
      MailApp.sendEmail({
        to: dest.join(','),
        subject: (prueba ? '[PRUEBA] ' : '') + skAsunto_(mes, p.grupo, recon),
        body: (prueba ? '[PRUEBA] Esto se habria enviado a: ' + p.para.join('; ') + '\n\n' : '') + MSG,
        attachments: [adj]
      });
      ok++;
    } catch (e) {
      estado = 'ERROR: ' + e.message;
      fallos.push(p.grupo + ': ' + e.message);
    }
    hLog.appendRow([new Date(), prueba ? 'PRUEBA' : 'REAL', clave, dest.join('; '), p.filas.length, estado]);
  });
  try {
    logOk_('SOLICITUD', TIT + ' ' + mes + ' (' + (prueba ? 'PRUEBA' : 'REAL') + '): ' + ok + ' correos enviados' +
      (saltados ? ', ' + saltados + ' ya enviados antes' : '') + (fallos.length ? ', ' + fallos.length + ' con error: ' + fallos.join(' | ') : ''),
      { mes: mes, modo: prueba ? 'PRUEBA' : 'REAL', grupos: plan.paquetes.map(function (p) { return p.grupo; }) });
    flushLog_();
  } catch (e) {}

  ui.alert(TIT + ' · listo',
    (prueba ? 'PRUEBA: ' : 'ENVIADO: ') + ok + ' de ' + plan.paquetes.length + ' correos' + (prueba ? ' (a ' + yo + ')' : '') + '.\n' +
    (saltados ? saltados + ' grupo(s) ya se habian enviado en REAL: no se reenviaron.\n' : '') +
    (fallos.length ? '\nFallaron:\n' + fallos.join('\n') + '\n' : '') +
    '\nQuedo registro en la hoja "' + KC_HOJA_LOG + '".', ui.ButtonSet.OK);
}
