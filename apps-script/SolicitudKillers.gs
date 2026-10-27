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
var SK_MENSAJE_RECONSIDERAR = 'Buen día, estos son SKU que no habían sido considerados para Killers. Algunos quizá no alcanzaron consideración: solicitamos volver a considerarlos o ya no tomarlos en cuenta, y con eso nos damos por visto bueno. Otros son productos nuevos que nos gustaría que se incluyeran en los Killers. Saludos';
var SK_MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/** El mes que viene, en el formato del asunto: "NOVIEMBRE 2026". */
function skMesSiguiente_() {
  var mm = parseInt(Utilities.formatDate(new Date(), TZ, 'M'), 10), yy = parseInt(Utilities.formatDate(new Date(), TZ, 'yyyy'), 10);
  mm++;
  if (mm > 12) { mm = 1; yy++; }
  return SK_MESES[mm - 1] + ' ' + yy;
}

function skAsunto_(mes, grupo, recon) { return recon ? 'ELECTRONICS.MEXICO NUEVA SOLICITUD KILLERS - ' + grupo : 'ELECTRONICS.MEXICO SOLICITUD KILLERS ' + mes + ' - ' + grupo; }

/** Mes en curso, formato del asunto: "OCTUBRE 2026" (se usa en nombre de archivo y bitacora de los NUEVOS). */
function skMesActual_() {
  var mm = parseInt(Utilities.formatDate(new Date(), TZ, 'M'), 10), yy = parseInt(Utilities.formatDate(new Date(), TZ, 'yyyy'), 10);
  return SK_MESES[mm - 1] + ' ' + yy;
}

/** Texto con el que queda el grupo en la bitacora "Envios killers" (sirve para no repetir el mismo mes). */
function skClaveLog_(mes, grupo, recon) { return grupo + ' (' + (recon ? 'NUEVOS ' : 'SOLICITUD ') + mes + ')'; }

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
  var enviados = recon ? skEnviadosSku_() : null;     // SKU que ya se mandaron en una solicitud
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
    var ya = null;
    if (recon) {   // nuevos primero, luego los que ya se habian enviado
      var iSku = PAR_ENC.indexOf('SKU SELLER');   // col-fija: posicion de SKU SELLER en PAR_ENC
      var marc = filas.map(function (f) { return { f: f, y: !!enviados[String(f[iSku]).trim()] }; });
      marc.sort(function (a, b) { return (a.y ? 1 : 0) - (b.y ? 1 : 0); });
      filas = marc.map(function (x) { return x.f; }); ya = marc.map(function (x) { return x.y; });
    }
    paquetes.push({ grupo: grupo, filas: filas, para: G.correos.slice(), ya: ya });
  });
  return { paquetes: paquetes, sinSku: sinSku, sinCorreo: sinCorreo };
}

/* ---- Registro de SKU enviados: para distinguir NUEVOS de YA ENVIADOS en la nueva solicitud ---- */
var SK_HOJA_REG = 'SKU enviados killers';
var SK_ENC_REG  = ['FECHA', 'GRUPO KAM', 'SKU', 'TIPO', 'MES'];

function skRegHoja_(crear) {
  var ss = SpreadsheetApp.getActive(), h = ss.getSheetByName(SK_HOJA_REG);
  if (!h && crear) { h = ss.insertSheet(SK_HOJA_REG); h.getRange(1, 1, 1, SK_ENC_REG.length).setValues([SK_ENC_REG]); h.setFrozenRows(1); }  // col-fija: hoja nueva con su propio encabezado
  return h;
}

/** SKU ya enviados (clave SKU). */
function skEnviadosSku_() {
  var out = {}, h = skRegHoja_(false);
  if (!h || h.getLastRow() < 2) return out;
  var m = colsHoja_(h, ['GRUPO KAM', 'SKU']);
  h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues().forEach(function (f) { var k = String(f[m.SKU] || '').trim(); if (k) out[k] = true; });
  return out;
}

/** Anota los SKU de un envio REAL. tipo: 'SOLICITUD' | 'NUEVOS'. */
function skRegistrar_(grupo, skus, tipo, mes) {
  if (!skus.length) return;
  var h = skRegHoja_(true), ya = skEnviadosSku_(), ahora = new Date();
  var filas = skus.filter(function (k) { return !ya[k]; }).map(function (k) { return [ahora, grupo, k, tipo, mes]; });
  if (filas.length) h.getRange(h.getLastRow() + 1, 1, filas.length, SK_ENC_REG.length).setValues(filas);  // col-fija: hoja propia, registro de 5 columnas
}

/** SKU de un .xlsx que mando este mismo script (hoja unica "Killers": SKU SELLER en la columna C, datos desde la fila 5). Lee el XML directo. */
function skSkusDeXlsx_(bytes) {
  var partes = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip')), por = {};
  partes.forEach(function (b) { por[b.getName()] = b; });
  var unesc = function (t) { return t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); };
  var comp = [];
  if (por['xl/sharedStrings.xml']) {
    (por['xl/sharedStrings.xml'].getDataAsString().match(/<si>[\s\S]*?<\/si>/g) || []).forEach(function (si) {
      var t = ''; (si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).forEach(function (x) { t += x.replace(/^<t[^>]*>/, '').replace(/<\/t>$/, ''); });
      comp.push(unesc(t));
    });
  }
  var hoja = por['xl/worksheets/sheet1.xml'];
  if (!hoja) { var k = Object.keys(por).filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort(); hoja = k.length ? por[k[0]] : null; }
  if (!hoja) return [];
  var out = [];
  (hoja.getDataAsString().match(/<c r="C\d+"[^>]*>[\s\S]*?<\/c>/g) || []).forEach(function (c) {
    var fila = parseInt((c.match(/r="C(\d+)"/) || [])[1], 10);
    if (!(fila >= 5)) return;
    var v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1], t = ((c.match(/ t="(\w+)"/) || [])[1]) || '', val = '';
    if (t === 's' && v !== undefined) val = comp[parseInt(v, 10)] || '';
    else if (t === 'inlineStr') val = unesc(((c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]) || '');
    else if (v !== undefined) val = unesc(v);
    val = String(val).trim();
    if (val) out.push(val);
  });
  return out;
}

/**
 * Una sola vez por grupo: si ya hubo un envio REAL de la solicitud (hoja Envios killers) pero el registro no tiene ese grupo,
 * se recuperan los SKU EXACTOS de los Excel que salieron (carpeta Enviados de Gmail, solicitudes REAL de los ultimos 60 dias).
 * Si no se puede leer un adjunto no se supone nada: se avisa en el Log y esos SKU saldran como nuevos.
 * Se llama antes de actualizar parrillas y al abrir NUEVOS.
 */
/** Quita del registro lo que no es un SKU de parrilla (terminan en -MSI...): basura de una lectura mala. */
function skLimpiarRegistro_() {
  var h = skRegHoja_(false);
  if (!h || h.getLastRow() < 2) return;
  var m = colsHoja_(h, ['SKU']), v = h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues();
  for (var i = v.length - 1; i >= 0; i--) if (!PAR_RE_SKU.test(String(v[i][m.SKU] || '').trim())) h.deleteRow(i + 2);
}

function skSembrarEnviados_() {
  skLimpiarRegistro_();
  var ss = SpreadsheetApp.getActive(), lg = ss.getSheetByName(KC_HOJA_LOG);
  if (!lg || lg.getLastRow() < 2) return;
  var mL = colsHoja_(lg, ['MODO', 'GRUPO KAM', 'ESTADO']), conReal = {};
  lg.getRange(2, 1, lg.getLastRow() - 1, lg.getLastColumn()).getValues().forEach(function (f) {
    var cl = String(f[mL['GRUPO KAM']] || '');
    if (normEnc_(f[mL.MODO]) === 'REAL' && normEnc_(f[mL.ESTADO]) === 'ENVIADO' && /\(SOLICITUD /.test(cl)) conReal[cl.replace(/ \(.*$/, '')] = true;
  });
  var h0 = skRegHoja_(false), conReg = {};
  if (h0 && h0.getLastRow() >= 2) { var mR = colsHoja_(h0, ['GRUPO KAM']); h0.getRange(2, 1, h0.getLastRow() - 1, h0.getLastColumn()).getValues().forEach(function (f) { conReg[String(f[mR['GRUPO KAM']])] = true; }); }
  var faltan = Object.keys(conReal).filter(function (g) { return !conReg[g]; });
  if (!faltan.length) return;
  var hecho = {}, fallos = [], vistos = 0, coinciden = 0, adjuntos = 0;
  // sin excluir [PRUEBA] en la busqueda de Gmail (ignora signos); las pruebas se descartan con la expresion del asunto
  GmailApp.search('in:sent newer_than:60d subject:"SOLICITUD KILLERS"', 0, 100).forEach(function (t) {
    t.getMessages().forEach(function (m) {
      vistos++;
      var mm = String(m.getSubject()).match(/^ELECTRONICS\.MEXICO SOLICITUD KILLERS (.+) - (.+)$/);
      if (!mm || faltan.indexOf(mm[2]) < 0) return;
      coinciden++;
      m.getAttachments().forEach(function (a) {
        if (!/\.xlsx$/i.test(a.getName())) return;
        adjuntos++;
        try { var sk = skSkusDeXlsx_(a.getBytes()).filter(function (x) { return PAR_RE_SKU.test(x); }); if (sk.length) { skRegistrar_(mm[2], sk, 'SOLICITUD (recuperado de Enviados)', mm[1]); hecho[mm[2]] = true; } }
        catch (e) { fallos.push(mm[2] + ': ' + e.message); }
      });
    });
  });
  faltan.forEach(function (g) { if (!hecho[g]) fallos.push(g + ': sin SKU recuperados (correos revisados ' + vistos + ', del grupo ' + coinciden + ', adjuntos ' + adjuntos + ')'); });
  try {
    if (fallos.length) logWarn_('SOLICITUD', 'Registro de SKU enviados: no se pudo recuperar ' + fallos.join(' | ') + ' (esos SKU saldran como nuevos)');
    else logOk_('SOLICITUD', 'Registro de SKU enviados recuperado de Enviados: ' + Object.keys(hecho).join(', '));
    flushLog_();
  } catch (e) {}
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
function skXlsx_(grupo, filas, mes, nEsc, ya, recon) {
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
    h.getRange(1, 1).setValue(recon ? 'ELECTRONICS.MEXICO · NUEVA SOLICITUD DE KILLERS' : 'ELECTRONICS.MEXICO · SOLICITUD DE KILLERS ' + mes).setFontWeight('bold').setFontSize(14);  // col-fija: plantilla de Walmart
    h.getRange(2, 1).setValue('CATEGORÍA: ' + grupo + '  ·  ' + n + ' SKU  ·  ID Seller ' + PAR_ID + '  ·  Todos con MSI')  // col-fija: plantilla de Walmart
      .setFontWeight('bold').setFontColor('#44546A');
        var nYa = ya ? ya.filter(Boolean).length : 0;
    if (ya) h.getRange(3, 1).setValue('NUEVOS (fondo verde): ' + (n - nYa) + '   ·   YA ENVIADOS ANTES (fondo amarillo, al final): ' + nYa).setFontWeight('bold').setFontColor('#7F6000');
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
      for (var i = 0; i < n; i++) { var fila = []; for (var c2 = 0; c2 < C; c2++) fila.push(ya ? (ya[i] ? '#FFF2CC' : '#E2EFDA') : (i % 2 ? '#F3F6FA' : '#FFFFFF')); fondos.push(fila); }
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

/** Menu: 🆕 Nuevos productos y faltantes. Manda solo lo que hoy NO tiene killer (hoja Estado Killers: KILLER = NO y EN PARRILLA = SI): los que no alcanzaron consideracion y los productos nuevos. Los killers ya aceptados NO van. */
function nuevosKillersEnviar() { skAbrir_(true); }

function skCorreoYo_() {
  var yo = String(props_().getProperty('AVISO_CORREO') || '').trim();
  if (!yo) { try { yo = Session.getEffectiveUser().getEmail() || ''; } catch (x) {} }
  return yo;
}

/** Abre el formulario (un solo cuadro con todo). Lo que se manda lo calcula skForm_ al darle enviar. */
function skAbrir_(recon) {
  var TIT = recon ? '🆕 Nuevos productos y faltantes' : '✉️ Solicitud de killers del mes';
  var plan;
  try { plan = skArmar_(recon); } catch (e) { dlgInfo_(TIT, e.message, 'error'); return; }
  if (!plan.paquetes.length) {
    dlgInfo_(TIT, 'No hay nada que enviar.\n\n' +
      (plan.sinSku.length ? 'Parrillas sin SKU: ' + plan.sinSku.join(', ') + '\nCorre 📋 Actualizar parrillas por KAM.\n\n' : '') +
      (plan.sinCorreo.length ? '⚠ Grupos sin correos en la hoja KAMS: ' + plan.sinCorreo.join(', ') : ''), 'aviso');
    return;
  }
  try { skSembrarEnviados_(); } catch (e) {}
  var mes = recon ? skMesActual_() : skMesSiguiente_(), yo = skCorreoYo_();
  var ya = skYaEnviados_();
  var ultimo = String(props_().getProperty('SK_HASTA') || '6');
  var campos = recon ? [] : [{ id: 'mes', etiqueta: 'Mes que va en el asunto', valor: mes, nota: 'Ejemplo: ' + mes }];
  campos.push(
    { id: 'hasta', etiqueta: 'Qué propuestas lleva el archivo', valor: ultimo, opciones: SK_HASTA,
      nota: 'Las propuestas que no elijas no se mandan. Úsalo cuando ya no haya más eventos este mes.' });
  if (!yo) campos.push({ id: 'correo', etiqueta: 'Tu correo (a este llegan las PRUEBAS)', valor: '', nota: 'Se guarda una sola vez.' });
  var total = 0;
  var grupos = plan.paquetes.map(function (p) {
    total += p.filas.length;
    return { id: p.grupo, titulo: p.grupo + '  ·  ' + p.filas.length + ' SKU', detalle: 'PARA: ' + p.para.join('; '), marcado: true,
      aviso: (!recon && ya[skClaveLog_(mes, p.grupo, recon)]) ? 'Ya se envió en REAL este mes (en REAL no se reenvía; en PRUEBA y en Reenviar SOLO sí)' : (recon && p.ya ? p.ya.filter(function (x) { return !x; }).length + ' nuevos · ' + p.ya.filter(Boolean).length + ' ya enviados antes (van al final, en amarillo)' : '') };
  });
  var avisos = [];
  if (plan.sinSku.length) avisos.push('Sin SKU (no se envían): ' + plan.sinSku.join(', '));
  if (plan.sinCorreo.length) avisos.push('Sin correos en la hoja KAMS (no se envían): ' + plan.sinCorreo.join(', '));
  dlgEnvio_({
    titulo: TIT, manejador: recon ? 'skFormNuevos' : 'skFormSolicitud', yo: yo, segundos: KC_CUENTA_SEG,
    ayuda: recon ? 'Manda solo los SKU en parrilla que hoy NO tienen killer: los que no alcanzaron consideración y los productos nuevos. Los killers ya aceptados no van. Antes corre 📋 Actualizar parrillas por KAM y ⬇️ Bajar killers del site.' : 'Manda todos los SKU de cada parrilla. Un solo correo por grupo, a todos sus contactos.',
    campos: campos, etiquetaGrupos: 'A qué grupos KAM (quita la palomita a los que no)', grupos: grupos,
    resumen: [['Asunto', skAsunto_(mes, '<GRUPO>', recon)], ['Mensaje', recon ? SK_MENSAJE_RECONSIDERAR : SK_MENSAJE],
              ['Archivo', skNombreArchivo_('<GRUPO>', mes)], ['Total', plan.paquetes.length + ' correos · ' + total + ' SKU']],
    avisos: avisos, reenvio: true
  });
}

function skFormSolicitud(p) { return skForm_(false, p); }
function skFormNuevos(p) { return skForm_(true, p); }

/** Lo que pasa al darle enviar. Vuelve a armar todo desde las hojas y valida lo que mando la ventana. */
function skForm_(recon, p) {
  var TIT = recon ? 'Nuevos productos y faltantes' : 'Solicitud de killers';
  var MSG = recon ? SK_MENSAJE_RECONSIDERAR : SK_MENSAJE;
  var c = (p && p.campos) || {};
  var modo = (p && p.modo) === 'REAL' ? 'REAL' : ((p && p.modo) === 'REENVIO' ? 'REENVIO' : 'PRUEBA');
  var prueba = modo === 'PRUEBA', reenvio = modo === 'REENVIO';
  var otros = reenvio ? dlgOtros_(p) : {};
  if (reenvio && !Object.keys(otros).length) return { ok: false, lineas: ['No encontré ningún correo válido en los cuadros de reenvío. No se envió nada.'] };
  var mes = recon ? skMesActual_() : String(c.mes || '').trim().toUpperCase();
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
  plan.paquetes = plan.paquetes.filter(function (q) { return reenvio ? !!otros[q.grupo] : pedidos.indexOf(q.grupo) >= 0; });
  if (!plan.paquetes.length) return { ok: false, lineas: ['Ningún grupo marcado tiene SKU y correos. No se envió nada.'] };

  var ya = skYaEnviados_(), ok = 0, saltados = 0, fallos = [], hLog = kcLog_();
  plan.paquetes.forEach(function (q) {
    var clave = skClaveLog_(mes, q.grupo, recon);
    if (modo === 'REAL' && !recon && ya[clave]) { saltados++; return; }
    var dest = prueba ? [yo] : (reenvio ? otros[q.grupo] : q.para);
    var estado = 'ENVIADO';
    try {
      var adj = skXlsx_(q.grupo, q.filas, mes, nEsc, q.ya, recon);
      var nNue = q.ya ? q.ya.filter(function (x) { return !x; }).length : 0;
      var cuerpoTxt = (prueba ? '[PRUEBA] Esto se habria enviado a: ' + q.para.join('; ') + '\n\n' : '') + MSG +
        (q.ya ? '\n\nNuevos: ' + nNue + ' (fondo verde en el archivo). Ya enviados antes: ' + (q.ya.length - nNue) + ' (fondo amarillo, al final).' : '');
      MailApp.sendEmail({
        to: dest.join(','),
        subject: (prueba ? '[PRUEBA] ' : '') + skAsunto_(mes, q.grupo, recon),
        body: cuerpoTxt,
        htmlBody: dlgHtmlCorreo_(cuerpoTxt),
        attachments: [adj]
      });
      ok++;
      if (modo === 'REAL') skRegistrar_(q.grupo, q.filas.map(function (f) { return String(f[PAR_ENC.indexOf('SKU SELLER')]).trim(); }), recon ? 'NUEVOS' : 'SOLICITUD', mes);   // col-fija: posicion de SKU SELLER en PAR_ENC
    } catch (e) {
      estado = 'ERROR: ' + e.message;
      fallos.push(q.grupo + ': ' + e.message);
    }
    hLog.appendRow([new Date(), modo, clave, dest.join('; '), q.filas.length, estado]);
  });
  try {
    logOk_('SOLICITUD', TIT + ' ' + mes + ' (' + modo + ', ' + nEsc + ' propuesta(s)): ' + ok + ' correos enviados' +
      (saltados ? ', ' + saltados + ' ya enviados antes' : '') + (fallos.length ? ', ' + fallos.length + ' con error: ' + fallos.join(' | ') : ''),
      { mes: mes, modo: modo, propuestas: nEsc, otros: otros, grupos: plan.paquetes.map(function (q) { return q.grupo; }) });
    flushLog_();
  } catch (e) {}
  var lineas = [(prueba ? 'PRUEBA: ' : (reenvio ? 'REENVÍO: ' : 'ENVIADO: ')) + ok + ' de ' + plan.paquetes.length + ' correos' + (prueba ? ' (a ' + yo + ')' : (reenvio ? ' (' + plan.paquetes.map(function (q) { return q.grupo + ': ' + otros[q.grupo].join(', '); }).join(' | ') + ')' : '')) + '.',
                'Archivo con ' + nEsc + ' propuesta(s) (hasta la columna ' + colLetra_(12 + 4 * nEsc) + ').'];
  if (saltados) lineas.push(saltados + ' grupo(s) ya se habían enviado en REAL: no se reenviaron.');
  fallos.forEach(function (f) { lineas.push('Falló: ' + f); });
  lineas.push('Quedó registro en la hoja "' + KC_HOJA_LOG + '".');
  return { ok: !fallos.length, lineas: lineas };
}

/**
 * Menu: 🔎 Revisar correos de killers enviados. Lee la carpeta Enviados de la cuenta que corre el script (mismo permiso
 * gmail.readonly que Cancelaciones) y lista los correos "SOLICITUD KILLERS / NUEVO PRODUCTO" de los ultimos dias:
 * fecha, a quien, asunto, archivo adjunto y su tamano. Confirma que SI salieron; no abre el contenido del Excel.
 */
function killersRevisarEnviados() {
  var q = 'in:sent newer_than:10d (subject:"SOLICITUD KILLERS" OR subject:"NUEVA SOLICITUD KILLERS" OR subject:"RECONSIDERAR KILLERS")';
  var hilos;
  try { hilos = GmailApp.search(q, 0, 40); } catch (e) { dlgInfo_('🔎 Correos de killers enviados', 'No pude leer Gmail: ' + e.message, 'error'); return; }
  var filas = [];
  hilos.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      var adj = m.getAttachments().map(function (a) { return a.getName() + ' (' + Math.round(a.getSize() / 1024) + ' KB)'; });
      filas.push({ f: m.getDate(), para: m.getTo(), asunto: m.getSubject(), adj: adj.join(', ') || 'SIN ADJUNTO' });
    });
  });
  filas.sort(function (a, b) { return b.f - a.f; });
  if (!filas.length) { dlgInfo_('🔎 Correos de killers enviados', 'No hay correos de killers en Enviados en los últimos 10 días.', 'aviso'); return; }
  var pruebas = filas.filter(function (x) { return /^\[PRUEBA\]/.test(x.asunto); }).length;
  var txt = filas.length + ' correos en Enviados (' + pruebas + ' de PRUEBA, ' + (filas.length - pruebas) + ' reales). Más recientes primero:\n\n' +
    filas.slice(0, 25).map(function (x) {
      return '• ' + Utilities.formatDate(x.f, TZ, 'dd/MM HH:mm') + ' · ' + x.asunto + ' · PARA ' + x.para + ' · ' + x.adj;
    }).join('\n');
  dlgInfo_('🔎 Correos de killers enviados', txt, 'ok');
}
