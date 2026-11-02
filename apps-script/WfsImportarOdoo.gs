/**
 * WfsImportarOdoo.gs - arma el ARCHIVO para subir un envio WFS a Odoo con "Importar registros" (sin API, sin cancelar nada):
 * un solo traslado interno con todas las lineas (SKU base y AUTORIZADO, con el mismo tope de stock libre que el traslado por codigo).
 * Se guarda en Drive (carpeta "Plantillas WFS") como CSV UTF-8 y la ventana dice los pasos en Odoo.
 * Las columnas usan los nombres tecnicos de los campos (picking_type_id, move_ids_without_package/product_id, ...).
 * Prefijo wfi / WFI_.
 */
var WFI_ETAPA = 'TRASLADO';
var WFI_ENC = ['picking_type_id', 'location_id', 'location_dest_id', 'partner_id', 'origin', 'scheduled_date',
  'move_ids_without_package/product_id', 'move_ids_without_package/name', 'move_ids_without_package/product_uom_qty',
  'move_ids_without_package/location_id', 'move_ids_without_package/location_dest_id'];

function wfiCsv_(filas) {
  return filas.map(function (f) {
    return f.map(function (v) {
      var s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }).join('\r\n');
}

/** Filas del archivo: encabezado + una por SKU base. La primera lleva los datos del traslado; las demas solo la linea. */
function wfiFilas_(info, doc, fecha, contacto) {
  var filas = [WFI_ENC.slice()];
  (info.lineas || []).forEach(function (l, i) {
    var cab = i === 0 ? [WFS_TR.pickingTypeName, WFS_TR.locOrigen, WFS_TR.locDestino, contacto, doc, fecha] : ['', '', '', '', '', ''];
    filas.push(cab.concat([l.sku, l.sku, l.qty, WFS_TR.locOrigen, WFS_TR.locDestino]));
  });
  return filas;
}

/** Menu: genera el archivo de importacion de Odoo para la hoja ENVIO activa (o la mas reciente). */
function wfsArchivoImportarOdoo() {
  var ss = SpreadsheetApp.getActive(), hojas = wfsTrHojas_();
  var activa = ss.getActiveSheet().getName();
  var nom = hojas.indexOf(activa) >= 0 ? activa : hojas[hojas.length - 1];
  if (!nom) { dlgInfo_('Archivo para Odoo', 'No hay hoja ENVIO. Crea una con 🚚 Nuevo envío y pon en AUTORIZADO lo que autorizaron.', 'aviso'); return; }
  var sh = ss.getSheetByName(nom), info;
  try { info = wfsTrLineas_(sh); } catch (e) { dlgInfo_('Archivo para Odoo', e.message, 'error'); return; }
  if (!info.lineas.length) { dlgInfo_('Archivo para Odoo', 'La hoja ' + nom + ' no tiene cantidades en AUTORIZADO. No se hizo nada.', 'aviso'); return; }
  var f = wfsTrFecha_(info.fecha + (info.hora ? ' ' + info.hora : '')) || wfsTrFecha_(info.fecha) || new Date();
  var doc = String(info.delivery || '').trim() || nom;
  var piezas = info.lineas.reduce(function (a, l) { return a + l.qty; }, 0);
  var avisos = [];
  try {
    var h0 = wfsTrHistorial_(false);
    if (h0 && h0.getLastRow() > 1) {
      var m0 = colsHoja_(h0, ['ENVIO', 'Referencia']);
      var dup = h0.getRange(2, 1, h0.getLastRow() - 1, h0.getLastColumn()).getValues().filter(function (r) { return String(r[m0.ENVIO]) === nom; })[0];
      if (dup) avisos.push('⚠ Ya hay un traslado de ' + nom + ' en la hoja "' + WFS_TR.hojaHist + '" (' + dup[m0.Referencia] + '). Si subes este archivo se duplica: cancela ese primero.');
    }
  } catch (e) {}
  if (info.topes && info.topes.length) avisos.push('✂ ' + info.topes.length + ' SKU base se limitaron a lo libre en Odoo: ' + info.topes.join(' · '));
  if (info.noWfs && info.noWfs.length) avisos.push('⚠ ' + info.noWfs.length + ' SKU no van (solo premium, nunca CVA ni cables): ' + info.noWfs.map(function (x) { return x.sku; }).join(', '));
  var filas = wfiFilas_(info, doc, wfsTrFmtFecha_(f), WFS_TR.contacto);
  var nombre = 'Importar Odoo - ' + nom + '.csv', url = '';
  try {
    var blob = Utilities.newBlob('﻿' + wfiCsv_(filas), 'text/csv', nombre);
    var carpeta = wfsPlCarpeta_();
    var viejos = carpeta.getFilesByName(nombre); while (viejos.hasNext()) viejos.next().setTrashed(true);
    url = carpeta.createFile(blob).getUrl();
  } catch (e) { logErr_(WFI_ETAPA, 'No pude guardar el archivo de importacion en Drive: ' + e.message); flushLog_(); dlgInfo_('Archivo para Odoo', 'No pude guardarlo en Drive: ' + e.message, 'error'); return; }
  logOk_(WFI_ETAPA, 'Archivo de importacion para Odoo listo: ' + nombre + ' (' + info.lineas.length + ' SKU base, ' + piezas + ' piezas, documento origen ' + doc + ')', { url: url });
  flushLog_();
  dlgInfo_('Archivo para Odoo · ' + nom,
    '• ' + info.lineas.length + ' SKU base · ' + piezas + ' piezas · un solo traslado · documento origen ' + doc + '\n• Archivo: ' + nombre + ' (Drive, carpeta Plantillas WFS)\n• ' + url +
    '\n\nEn Odoo: Inventario > Operaciones > Traslados > ⚙ > Importar registros > subir el archivo > pulsa PROBAR (no crea nada) y, si sale bien, IMPORTAR.' +
    '\n\nSi Odoo no reconoce una columna, mapeala a mano en esa pantalla y dime como se llama.' + (avisos.length ? '\n\n' + avisos.join('\n') : ''), avisos.length ? 'aviso' : 'ok');
}
