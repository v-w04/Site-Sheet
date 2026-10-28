/**
 * ============================================================
 *  PDF del envio — CATEGORIA, NOMBRE, SKU, AUTORIZADO, GTIN
 * ============================================================
 * Boton: "📑 PDF del envío". Exporta a PDF la parte K a T de la hoja ENVIO sin las columnas VENDIDAS, EN WFS, ODOO,
 * PROPUESTA y SKU BASE (quedan CATEGORIA, NOMBRE, SKU, AUTORIZADO y GTIN), SOLO las filas que de verdad se envian:
 * con piezas en AUTORIZADO, premium, sin CVA/clasicas/cables/restricciones y con GTIN. Sin filas vacias. Las columnas
 * se buscan por ENCABEZADO (wfsLeerHojaEnvio_), no por letra. Se guarda en Drive (carpeta "PDF Envios WFS") y se manda por correo.
 */

/** Filas del PDF: [categoria, nombre, sku, autorizado, gtin] + cabecera. Funcion pura sobre wfsLeerHojaEnvio_. */
function wfsPdfFilas_(sh) {
  var lec = wfsLeerHojaEnvio_(sh), det = lec.detalle;   // ya sin clasicas, CVA, cables ni restricciones
  var filas = [], sinGtin = 0, ceros = 0, total = 0;
  det.forEach(function (f) {   // col-fija: fila de detalle de wfsLeerHojaEnvio_: [hoja, id, fecha, hora, delivery, folio, sku, skuBase, gtin, categoria, nombre, unidades]
    var uni = Number(f[11]) || 0;   // col-fija: fila de wfsLeerHojaEnvio_ / hoja temporal propia del PDF
    if (uni <= 0) { ceros++; return; }
    var g = String(f[8] || '').replace(/\D/g, '');   // col-fija: fila de wfsLeerHojaEnvio_ / hoja temporal propia del PDF
    if (!g || g.length > 14 || g.length < 8) { sinGtin++; return; }
    filas.push([String(f[9] || ''), String(f[10] || ''), String(f[6] || ''), uni, g.length < 14 ? g.padStart(14, '0') : g]);   // col-fija: fila de wfsLeerHojaEnvio_ / hoja temporal propia del PDF
    total += uni;
  });
  var c = det.length ? det[0] : null;
  return { filas: filas, total: total, sinGtin: sinGtin, ceros: ceros, noWfs: lec.noWfs || [],
    cab: { id: c ? String(c[1] || '') : '', fecha: c ? String(c[2] || '') : '', hora: c ? String(c[3] || '') : '', delivery: c ? String(c[4] || '') : '' } };
}

function wfsPdfEnvio() {
  var ss = SpreadsheetApp.getActive(), hojas = wfsChHojas_(ss);
  if (!hojas.length) { dlgInfo_('📑 PDF del envío', 'No hay ninguna hoja "ENVIO N".', 'aviso'); return; }
  var act = ss.getActiveSheet().getName();
  var nom = hojas.indexOf(act) >= 0 ? act : hojas[hojas.length - 1];
  var r;
  try { r = wfsPdfFilas_(ss.getSheetByName(nom)); }
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
    [150, 360, 230, 90, 120].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
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
