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
 *  Un solo formulario (Dialogos.gs): mes, hasta que propuesta lleva el archivo (solo SIN Evento = hasta la columna P,
 *  hasta PRE/POST, ..., todas), grupos con palomita y dos botones: "Enviar PRUEBA" (solo a tu correo, "[PRUEBA]" en el asunto)
 *  y "Enviar REAL" (pide confirmar, cuenta regresiva). Cada envio queda en la hoja "Envios killers".
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
function skXlsx_(grupo, filas, mes, nEsc) {
  var ESC = PAR_ESCENARIOS.slice(0, nEsc >= 1 && nEsc <= PAR_ESCENARIOS.length ? nEsc : PAR_ESCENARIOS.length);   // propuestas que van en el archivo
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
    ESC.forEach(function () { ENC4.push('PRECIO MEJORADO', 'Precio', 'Killer', 'Precio final'); });
    var C = ENC4.length, n = filas.length;

    var datos = filas.map(function (f) {
      var o = FIJAS.map(function (e) { var v = f[P[e]]; return v === undefined || v === null ? '' : v; });
      ESC.forEach(function (es) { var v = f[P[es[0]]]; o.push(v === undefined || v === null ? '' : v, '', '', ''); });
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
    ESC.forEach(function (es, k) {
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
      ESC.forEach(function (es, k) { for (var j = 0; j < 4; j++) f1(NF + 1 + 4 * k + j, '"$"#,##0'); });
      var dv = SpreadsheetApp.newDataValidation().requireValueInList(['SI', 'NO'], true).build();
      h.getRange(5, 7, n, 1).setDataValidation(dv);  // col-fija: plantilla de Walmart
      h.getRange(5, 11, n, 1).setDataValidation(dv);  // col-fija: plantilla de Walmart
    }
    if (n) {
      // franjas, bordes finos, alineaciones y gris en lo que llena Walmart
      var fondos = [];
      for (var i = 0; i < n; i++) { var fila = []; for (var c2 = 0; c2 < C; c2++) fila.push(i % 2 ? '#F3F6FA' : '#FFFFFF'); fondos.push(fila); }
      h.getRange(5, 1, n, C).setBackgrounds(fondos);  // col-fija: plantilla de Walmart
      ESC.forEach(function (es, k) { h.getRange(5, NF + 2 + 4 * k, n, 3).setBackground('#EDEDED'); });   // Precio / Killer / Precio final: los llena Walmart
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

/** Hasta que propuesta va en el archivo: cada una agrega 4 columnas despues de las 12 fijas (A:L). 1 = hasta la P. */
var SK_HASTA = [
  ['1', 'Solo Propuesta SIN Evento  (hasta la columna P)'],
  ['2', '+ Propuesta PRE y POST Evento  (hasta la T)'],
  ['3', '+ Propuesta EVENTO  (hasta la X)'],
  ['4', '+ Propuesta CYBER WEEK  (hasta la AB)'],
  ['5', '+ Black Friday  (hasta la AF)'],
  ['6', 'TODAS: + Cyber Monday  (hasta la AJ)']
];

/** Menu: ✉️ Solicitud de killers del mes. Manda la propuesta mensual: todo lo de las parrillas. */
function solicitudKillersEnviar() { skAbrir_(false); }

/** Menu: 🔁 Reconsiderar killers. Manda solo lo que hoy NO tiene killer (hoja Estado Killers: KILLER = NO y EN PARRILLA = SI). */
function reconsiderarKillersEnviar() { skAbrir_(true); }

function skCorreoYo_() {
  var yo = String(props_().getProperty('AVISO_CORREO') || '').trim();
  if (!yo) { try { yo = Session.getEffectiveUser().getEmail() || ''; } catch (x) {} }
  return yo;
}

/** Abre el formulario (un solo cuadro con todo). Lo que se manda lo calcula skForm_ al darle enviar. */
function skAbrir_(recon) {
  var TIT = recon ? '🔁 Reconsiderar killers' : '✉️ Solicitud de killers del mes';
  var plan;
  try { plan = skArmar_(recon); } catch (e) { dlgInfo_(TIT, e.message, 'error'); return; }
  if (!plan.paquetes.length) {
    dlgInfo_(TIT, 'No hay nada que enviar.\n\n' +
      (plan.sinSku.length ? 'Parrillas sin SKU: ' + plan.sinSku.join(', ') + '\nCorre 📋 Actualizar parrillas por KAM.\n\n' : '') +
      (plan.sinCorreo.length ? '⚠ Grupos sin correos en la hoja KAMS: ' + plan.sinCorreo.join(', ') : ''), 'aviso');
    return;
  }
  var mes = skMesSiguiente_(), yo = skCorreoYo_();
  var ya = skYaEnviados_();
  var ultimo = String(props_().getProperty('SK_HASTA') || '6');
  var campos = [
    { id: 'mes', etiqueta: 'Mes que va en el asunto', valor: mes, nota: 'Ejemplo: ' + mes },
    { id: 'hasta', etiqueta: 'Qué propuestas lleva el archivo', valor: ultimo, opciones: SK_HASTA,
      nota: 'Las propuestas que no elijas no se mandan. Úsalo cuando ya no haya más eventos este mes.' }
  ];
  if (!yo) campos.push({ id: 'correo', etiqueta: 'Tu correo (a este llegan las PRUEBAS)', valor: '', nota: 'Se guarda una sola vez.' });
  var total = 0;
  var grupos = plan.paquetes.map(function (p) {
    total += p.filas.length;
    return { id: p.grupo, titulo: p.grupo + '  ·  ' + p.filas.length + ' SKU', detalle: 'PARA: ' + p.para.join('; '), marcado: true,
      aviso: (!recon && ya[skClaveLog_(mes, p.grupo, recon)]) ? 'Ya se envió en REAL este mes (en REAL no se reenvía; en PRUEBA sí)' : '' };
  });
  var avisos = [];
  if (plan.sinSku.length) avisos.push('Sin SKU (no se envían): ' + plan.sinSku.join(', '));
  if (plan.sinCorreo.length) avisos.push('Sin correos en la hoja KAMS (no se envían): ' + plan.sinCorreo.join(', '));
  dlgEnvio_({
    titulo: TIT, manejador: recon ? 'skFormReconsiderar' : 'skFormSolicitud', yo: yo, segundos: KC_CUENTA_SEG,
    ayuda: recon ? 'Manda solo los SKU que están en parrilla y hoy NO tienen killer (hoja Estado Killers).' : 'Manda todos los SKU de cada parrilla. Un solo correo por grupo, a todos sus contactos.',
    campos: campos, etiquetaGrupos: 'A qué grupos KAM (quita la palomita a los que no)', grupos: grupos,
    resumen: [['Asunto', skAsunto_(mes, '<GRUPO>', recon)], ['Mensaje', recon ? SK_MENSAJE_RECONSIDERAR : SK_MENSAJE],
              ['Archivo', skNombreArchivo_('<GRUPO>', mes)], ['Total', plan.paquetes.length + ' correos · ' + total + ' SKU']],
    avisos: avisos
  });
}

function skFormSolicitud(p) { return skForm_(false, p); }
function skFormReconsiderar(p) { return skForm_(true, p); }

/** Lo que pasa al darle enviar. Vuelve a armar todo desde las hojas y valida lo que mando la ventana. */
function skForm_(recon, p) {
  var TIT = recon ? 'Reconsiderar killers' : 'Solicitud de killers';
  var MSG = recon ? SK_MENSAJE_RECONSIDERAR : SK_MENSAJE;
  var c = (p && p.campos) || {};
  var prueba = (p && p.modo) !== 'REAL';
  var mes = String(c.mes || '').trim().toUpperCase();
  if (!/^[A-ZÁÉÍÓÚÑ]+ \d{4}$/.test(mes)) return { ok: false, lineas: ['El mes debe verse así: ' + skMesSiguiente_() + '. No se envió nada.'] };
  var nEsc = parseInt(c.hasta, 10);
  if (!(nEsc >= 1 && nEsc <= PAR_ESCENARIOS.length)) return { ok: false, lineas: ['Elige hasta qué propuesta va el archivo. No se envió nada.'] };
  var yo = skCorreoYo_();
  if (!yo) {
    yo = String(c.correo || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(yo)) return { ok: false, lineas: ['Tu correo no se ve bien. No se envió nada.'] };
    props_().setProperty('AVISO_CORREO', yo);
  }
  props_().setProperty('SK_HASTA', String(nEsc));
  var plan = skArmar_(recon);
  var pedidos = (p.grupos || []).map(String);
  plan.paquetes = plan.paquetes.filter(function (q) { return pedidos.indexOf(q.grupo) >= 0; });
  if (!plan.paquetes.length) return { ok: false, lineas: ['Ningún grupo marcado tiene SKU y correos. No se envió nada.'] };

  var ya = skYaEnviados_(), ok = 0, saltados = 0, fallos = [], hLog = kcLog_();
  plan.paquetes.forEach(function (q) {
    var clave = skClaveLog_(mes, q.grupo, recon);
    if (!prueba && !recon && ya[clave]) { saltados++; return; }
    var dest = prueba ? [yo] : q.para;
    var estado = 'ENVIADO';
    try {
      var adj = skXlsx_(q.grupo, q.filas, mes, nEsc);
      MailApp.sendEmail({
        to: dest.join(','),
        subject: (prueba ? '[PRUEBA] ' : '') + skAsunto_(mes, q.grupo, recon),
        body: (prueba ? '[PRUEBA] Esto se habria enviado a: ' + q.para.join('; ') + '\n\n' : '') + MSG,
        attachments: [adj]
      });
      ok++;
    } catch (e) {
      estado = 'ERROR: ' + e.message;
      fallos.push(q.grupo + ': ' + e.message);
    }
    hLog.appendRow([new Date(), prueba ? 'PRUEBA' : 'REAL', clave, dest.join('; '), q.filas.length, estado]);
  });
  try {
    logOk_('SOLICITUD', TIT + ' ' + mes + ' (' + (prueba ? 'PRUEBA' : 'REAL') + ', ' + nEsc + ' propuesta(s)): ' + ok + ' correos enviados' +
      (saltados ? ', ' + saltados + ' ya enviados antes' : '') + (fallos.length ? ', ' + fallos.length + ' con error: ' + fallos.join(' | ') : ''),
      { mes: mes, modo: prueba ? 'PRUEBA' : 'REAL', propuestas: nEsc, grupos: plan.paquetes.map(function (q) { return q.grupo; }) });
    flushLog_();
  } catch (e) {}
  var lineas = [(prueba ? 'PRUEBA: ' : 'ENVIADO: ') + ok + ' de ' + plan.paquetes.length + ' correos' + (prueba ? ' (a ' + yo + ')' : '') + '.',
                'Archivo con ' + nEsc + ' propuesta(s) (hasta la columna ' + colLetra_(12 + 4 * nEsc) + ').'];
  if (saltados) lineas.push(saltados + ' grupo(s) ya se habían enviado en REAL: no se reenviaron.');
  fallos.forEach(function (f) { lineas.push('Falló: ' + f); });
  lineas.push('Quedó registro en la hoja "' + KC_HOJA_LOG + '".');
  return { ok: !fallos.length, lineas: lineas };
}
