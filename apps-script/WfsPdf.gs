/**
 * ============================================================
 *  PDF del envio — CATEGORIA, NOMBRE, SKU, AUTORIZADO, GTIN
 * ============================================================
 * Boton: "📑 PDF del envío". Exporta a PDF la parte K a T de la hoja ENVIO sin las columnas VENDIDAS, EN WFS, ODOO,
 * PROPUESTA y SKU BASE (quedan CATEGORIA, NOMBRE, SKU, AUTORIZADO y GTIN), SOLO las filas que de verdad se envian:
 * con piezas en AUTORIZADO, premium, sin CVA/clasicas/cables/restricciones y con GTIN. Sin filas vacias. Las columnas
 * se buscan por ENCABEZADO (wfsLeerHojaEnvio_), no por letra. Se guarda en Drive (carpeta "PDF Envios WFS") y se manda por correo.
 */

/** SKU -> grupo KAM (AUDIO, COMPUTACION...) segun la hoja "Estado Killers" (ya trae la categoria de Walmart -> KAM de
 *  "KAMS Departamentos" y tus DECISION por SKU). Solo cuentan los grupos reales; NO ENVIAR / REPUBLICAR / POR DECIDIR = sin KAM. */
var WFS_PDF_SINKAM = 'SIN KAM';
function wfsPdfKams_() {
  var mapa = {};
  try {
    var ss = SpreadsheetApp.getActive(), h = ss.getSheetByName(PAR_HOJA_ESTADO);
    if (!h || h.getLastRow() < 2) return mapa;
    var validos = {};
    parGrupos_().orden.forEach(function (g) { validos[normEnc_(g)] = String(g).trim(); });
    var m = colsHoja_(h, ['SKU', 'KAM']);
    h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues().forEach(function (f) {
      var k = String(f[m.SKU] || '').trim().toUpperCase(), g = validos[normEnc_(f[m.KAM])];
      if (k && g) mapa[k] = g;
    });
  } catch (e) { /* sin mapa: todo sale como SIN KAM y el PDF se genera igual */ }
  return mapa;
}

/** Filas del PDF: [categoria, nombre, sku, autorizado, gtin] + cabecera. Funcion pura sobre wfsLeerHojaEnvio_. */
function wfsPdfFilas_(sh, kams) {
  kams = kams || {};
  var lec = wfsLeerHojaEnvio_(sh), det = lec.detalle;   // ya sin clasicas, CVA, cables ni restricciones
  var filas = [], sinGtin = 0, ceros = 0, total = 0;
  det.forEach(function (f) {   // col-fija: fila de detalle de wfsLeerHojaEnvio_: [hoja, id, fecha, hora, delivery, folio, sku, skuBase, gtin, categoria, nombre, unidades]
    var uni = Number(f[11]) || 0;   // col-fija: fila de wfsLeerHojaEnvio_ / hoja temporal propia del PDF
    if (uni <= 0) { ceros++; return; }
    var g = String(f[8] || '').replace(/\D/g, '');   // col-fija: fila de wfsLeerHojaEnvio_ / hoja temporal propia del PDF
    if (!g || g.length > 14 || g.length < 8) { sinGtin++; return; }
    var sku0 = String(f[6] || '').trim();   // col-fija: fila de detalle de wfsLeerHojaEnvio_
    filas.push([kams[sku0.toUpperCase()] || WFS_PDF_SINKAM, wfsPdfCorta_(f[10]), String(f[6] || ''), uni, g.length < 14 ? g.padStart(14, '0') : g]);   // col-fija: fila de wfsLeerHojaEnvio_ / hoja temporal propia del PDF
    total += uni;
  });
  // Orden del PDF: grupo KAM de la A a la Z (SIN KAM al final) y, dentro, por SKU.
  var sinKam = filas.filter(function (x) { return x[0] === WFS_PDF_SINKAM; }).length;
  filas.sort(function (a, b) {   // col-fija: fila del PDF [grupo KAM, nombre, sku, autorizado, gtin]
    if (a[0] !== b[0]) {
      if (a[0] === WFS_PDF_SINKAM) return 1;
      if (b[0] === WFS_PDF_SINKAM) return -1;
      return a[0] < b[0] ? -1 : 1;
    }
    return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0;
  });
  var c = det.length ? det[0] : null;
  return { filas: filas, sinKam: sinKam, total: total, sinGtin: sinGtin, ceros: ceros, noWfs: lec.noWfs || [],
    cab: { id: c ? String(c[1] || '') : '', fecha: c ? String(c[2] || '') : '', hora: c ? String(c[3] || '') : '', delivery: c ? String(c[4] || '') : '' } };
}

/** Nombre del producto recortado (PDF): primeros WFS_PDF_NOMBRE caracteres, con \u2026 si se cortó. */
var WFS_PDF_NOMBRE = 38;
function wfsPdfCorta_(t) {
  t = String(t || '').replace(/\s+/g, ' ').trim();
  return t.length > WFS_PDF_NOMBRE ? t.slice(0, WFS_PDF_NOMBRE).trim() + '\u2026' : t;
}

function wfsPdfEnvio() {
  var ss = SpreadsheetApp.getActive(), hojas = wfsChHojas_(ss);
  if (!hojas.length) { dlgInfo_('📑 PDF del envío', 'No hay ninguna hoja "ENVIO N".', 'aviso'); return; }
  var act = ss.getActiveSheet().getName();
  var nom = hojas.indexOf(act) >= 0 ? act : hojas[hojas.length - 1];
  var r;
  try { r = wfsPdfFilas_(ss.getSheetByName(nom), wfsPdfKams_()); }
  catch (e) { dlgInfo_('📑 PDF del envío', 'No pude leer ' + nom + ': ' + e.message, 'error'); return; }
  if (!r.filas.length) { dlgInfo_('📑 PDF del envío', 'La hoja ' + nom + ' no tiene piezas en AUTORIZADO (o ningún SKU con GTIN). No se generó nada.', 'aviso'); return; }

  var tmp = null;
  try {
    var titulo = nom + (r.cab.id ? ' · ID ' + r.cab.id : '') + (r.cab.delivery ? ' · Delivery ' + r.cab.delivery : '') + (r.cab.fecha ? ' · ' + r.cab.fecha : '') + (r.cab.hora ? ' ' + r.cab.hora : '');
    tmp = SpreadsheetApp.create('tmp PDF ' + nom);
    var h = tmp.getSheets()[0], n = r.filas.length;
    h.getRange(1, 1).setValue(titulo).setFontWeight('bold').setFontSize(12);
    h.getRange(2, 1, 1, 5).setValues([['CATEGORIA', 'NOMBRE', 'SKU', 'AUTORIZADO', 'GTIN']]).setFontWeight('bold').setBackground('#1F4E79').setFontColor('#FFFFFF').setHorizontalAlignment('center');
    h.getRange(3, 5, n, 1).setNumberFormat('@');   // col-fija: fila de wfsLeerHojaEnvio_ / hoja temporal propia del PDF
    h.getRange(3, 1, n, 5).setValues(r.filas).setVerticalAlignment('middle').setBorder(true, true, true, true, true, true, '#BBBBBB', SpreadsheetApp.BorderStyle.SOLID);
    h.getRange(3, 4, n, 1).setHorizontalAlignment('center').setFontWeight('bold');   // col-fija: fila de wfsLeerHojaEnvio_ / hoja temporal propia del PDF
    h.getRange(3, 5, n, 1).setHorizontalAlignment('center');   // col-fija: fila de wfsLeerHojaEnvio_ / hoja temporal propia del PDF
    h.getRange(3 + n, 3, 1, 2).setValues([['TOTAL PIEZAS', r.total]]).setFontWeight('bold').setHorizontalAlignment('right');   // col-fija: fila en memoria / columna propia de esta hoja
    h.setFrozenRows(2);
    var ancho = function (col, min) { var m = 0; r.filas.forEach(function (f) { m = Math.max(m, String(f[col]).length); }); return Math.max(min, Math.ceil(m * 7.2) + 14); };   // col-fija: fila del PDF [categoria, nombre, sku, autorizado, gtin]
    [ancho(0, 90), ancho(1, 150), ancho(2, 200), 90, 120].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
    h.getRange(1, 1, 3 + n, 5).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    SpreadsheetApp.flush();
    var blob = wfsPdfExportar_(tmp.getId(), h.getSheetId(), nom);
    var carpeta = wfsPdfCarpeta_();
    var arch = carpeta.createFile(blob), yo = '';
    try { yo = skCorreoYo_(); } catch (e) { yo = ''; }
    var L = ['• ' + nom + ': ' + n + ' SKU · ' + r.total + ' piezas', '✅ PDF guardado en Drive (carpeta "PDF Envios WFS"):', arch.getUrl()];
    if (yo) {
      try { MailApp.sendEmail({ to: yo, subject: 'PDF del envío · ' + nom, body: n + ' SKU, ' + r.total + ' piezas.', attachments: [blob] }); L.push('✅ Enviado a ' + yo); }
      catch (e) { L.push('⚠ No se pudo mandar el correo: ' + e.message); }
    }
    if (r.ceros) L.push('• ' + r.ceros + ' SKU con 0 en AUTORIZADO: no salen.');
    if (r.sinKam) L.push('⚠ ' + r.sinKam + ' SKU sin grupo KAM (salen al final como SIN KAM; decide su KAM en Estado Killers).');
    if (r.sinGtin) L.push('⚠ ' + r.sinGtin + ' SKU sin GTIN válido: no salen en el PDF.');
    if (r.noWfs.length) L.push('• ' + r.noWfs.length + ' SKU que no van a WFS (clásica, CVA, cables o restringidos): no salen.');
    try { logOk_('WFS-PDF', 'PDF del envío ' + nom, n + ' SKU · ' + r.total + ' pzas'); flushLog_(); } catch (e) { /* log: no frena */ }
    dlgInfo_('📑 PDF del envío', L.join('\n'), 'ok');
  } catch (e) {
    try { logErr_('WFS-PDF', 'PDF del envío ' + nom + ' falló', e.message); flushLog_(); } catch (e2) { /* log */ }
    dlgInfo_('📑 PDF del envío', 'No se pudo generar el PDF: ' + e.message, 'error');
  } finally {
    try { if (tmp) DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch (e) { /* temporal: si no se borra, se ve en la papelera */ }
  }
}

/** Exporta una hoja a PDF horizontal, ajustada al ancho de la pagina. Si la URL falla, usa el PDF normal de Drive. */
function wfsPdfExportar_(id, gid, nom) {
  var nombre = 'Envio_' + String(nom).replace(/[^A-Za-z0-9\-]+/g, '_').replace(/^_+|_+$/g, '') + '.pdf';
  try {
    var url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=pdf&gid=' + gid +
      '&size=letter&portrait=false&fitw=true&gridlines=false&printtitle=false&sheetnames=false&pagenumbers=true&repeatrows=2';
    var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) return resp.getBlob().setName(nombre);
  } catch (e) { /* cae al plan B */ }
  return DriveApp.getFileById(id).getAs('application/pdf').setName(nombre);
}

function wfsPdfCarpeta_() {
  var it = DriveApp.getFoldersByName('PDF Envios WFS');
  return it.hasNext() ? it.next() : DriveApp.createFolder('PDF Envios WFS');
}
