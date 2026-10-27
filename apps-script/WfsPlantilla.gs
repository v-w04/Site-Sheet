/**
 * ============================================================
 *  WfsPlantilla — plantilla de Walmart para el envio a WFS (inbound order)
 * ============================================================
 *  Usa la plantilla ORIGINAL de Walmart (inbound-order-template, hoja "Items") metida aqui tal cual y solo le
 *  llena las filas desde la 3: asi el archivo sale identico (instrucciones, listas desplegables, formatos).
 *  Columnas: Product ID type = GTIN | Product ID = GTIN de 14 digitos (texto) | SKU (texto) | Item name (opcional,
 *  vacio salvo que se pida) | Total units = AUTORIZADO | Number of master cases (opcional, vacio) |
 *  Units per master case = 1 | Item label = No Prep Required.
 *  Las listas de la plantilla llegan a la fila 103, asi que cada archivo lleva maximo 101 SKU; si hay mas, salen varios.
 * ============================================================
 */

var WFS_PL_MAX = 101;
var WFS_PL_B64 = [
  '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'
].join('');

function wfsPlEsc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/** Pone las filas en el XML de la hoja Items. filas = [{gtin, sku, nombre, uni}]; desde la fila 3. Funcion pura. */
function wfsPlXml_(xml, filas) {
  var txt = function (ref, v, st) { return '<c r="' + ref + '"' + (st ? ' s="' + st + '"' : '') + ' t="inlineStr"><is><t xml:space="preserve">' + wfsPlEsc_(v) + '</t></is></c>'; };
  var out = xml;
  filas.forEach(function (f, i) {
    var r = 3 + i;
    var celdas = txt('A' + r, 'GTIN') + txt('B' + r, f.gtin, 1) + txt('C' + r, f.sku, 1) +
      (f.nombre ? txt('D' + r, f.nombre) : '') + '<c r="E' + r + '"><v>' + Number(f.uni) + '</v></c>' +
      '<c r="G' + r + '"><v>1</v></c>' + txt('H' + r, 'No Prep Required');
    var viejo = new RegExp('<row r="' + r + '"[^>]*?/>');
    if (!viejo.test(out)) throw new Error('La plantilla no trae la fila ' + r + ' (tope ' + WFS_PL_MAX + ').');
    out = out.replace(viejo, '<row r="' + r + '" spans="1:9" x14ac:dyDescent="0.25">' + celdas + '</row>');
  });
  return out;
}

/** Arma un .xlsx a partir de la plantilla original. */
function wfsPlXlsx_(filas, nombreArchivo) {
  var base = Utilities.newBlob(Utilities.base64Decode(WFS_PL_B64), 'application/zip', 'plantilla.xlsx');
  var partes = Utilities.unzip(base);
  var salida = partes.map(function (b) {
    if (b.getName() !== 'xl/worksheets/sheet1.xml') return b;
    return Utilities.newBlob(wfsPlXml_(b.getDataAsString('UTF-8'), filas), 'text/xml', b.getName());
  });
  return Utilities.zip(salida, nombreArchivo).setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/** Filas de la hoja ENVIO listas para la plantilla (suma si un SKU sale repetido) + lo que no se puede subir. */
function wfsPlFilas_(sh, conNombre) {
  var det = wfsLeerHojaEnvio_(sh).detalle;
  var por = {}, orden = [], sinGtin = [], ceros = 0, pad = 0;
  det.forEach(function (f) {   // col-fija: fila de detalle de wfsLeerHojaEnvio_: [hoja, id, fecha, hora, delivery, folio, sku, skuBase, gtin, categoria, nombre, unidades]
    var sku = String(f[6] || '').trim(), uni = Number(f[11]) || 0;  // col-fija: fila de wfsLeerHojaEnvio_ / copia propia
    if (!sku) return;
    if (uni <= 0) { ceros++; return; }
    var g = String(f[8] || '').replace(/\D/g, '');  // col-fija: fila de wfsLeerHojaEnvio_ / copia propia
    if (!g || g.length > 14 || g.length < 8) { sinGtin.push(sku); return; }
    if (g.length < 14) { g = g.padStart(14, '0'); pad++; }
    if (!por[sku]) { por[sku] = { gtin: g, sku: sku, nombre: conNombre ? String(f[10] || '').trim() : '', uni: 0 }; orden.push(sku); }  // col-fija: fila de wfsLeerHojaEnvio_ / copia propia
    por[sku].uni += uni;
  });
  return { filas: orden.map(function (k) { return por[k]; }), sinGtin: sinGtin, ceros: ceros, pad: pad };
}

/** Comprueba cada GTIN contra el catalogo de Walmart de este libro (hoja Walmart: SKU -> GTIN). Devuelve {revisado, mal:[...]}. */
function wfsPlVerificaGtin_(filas) {
  var h = SpreadsheetApp.getActive().getSheetByName('Walmart');
  if (!h || h.getLastRow() < 2) return { revisado: false, mal: [] };
  var m = colsHoja_(h, ['SKU', 'GTIN']);
  var v = h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getDisplayValues();
  var cat = {};
  v.forEach(function (r) { var k = String(r[m.SKU]).trim(); if (k) cat[k] = String(r[m.GTIN]).replace(/\D/g, '').replace(/^0+/, ''); });
  var mal = [];
  filas.forEach(function (f) {
    var g = String(f.gtin).replace(/\D/g, '').replace(/^0+/, '');
    if (!(f.sku in cat)) mal.push(f.sku + ' (no está en el catálogo Walmart)');
    else if (cat[f.sku] !== g) mal.push(f.sku + ' (GTIN ' + f.gtin + ' ≠ catálogo)');
  });
  return { revisado: true, mal: mal };
}

function wfsPlantillaWalmart() {
  var hojas = wfsChHojas_(SpreadsheetApp.getActive());
  if (!hojas.length) { dlgInfo_('📄 Plantilla de Walmart (WFS)', 'No hay ninguna hoja "ENVIO N". Crea una con 🚚 Nuevo envío y pon en AUTORIZADO lo autorizado.', 'aviso'); return; }
  var activa = SpreadsheetApp.getActiveSheet().getName();
  var yo = ''; try { yo = skCorreoYo_(); } catch (e) {}
  dlgEnvio_({
    titulo: '📄 Plantilla de Walmart (WFS)',
    ayuda: 'Genera el archivo para subir a Walmart (inbound order de WFS), idéntico a su plantilla, con las cantidades de la columna AUTORIZADO de la hoja ENVIO. Pulsa Revisar para ver qué saldría sin generar nada.',
    manejador: 'wfsPlantillaForm', yo: yo, segundos: 3,
    etiquetas: { prueba: 'Revisar', real: 'Generar', pruebaTitulo: 'Cuenta SKU, piezas y GTIN. No genera archivo.' },
    campos: [
      { id: 'hoja', etiqueta: 'Hoja del envío', valor: hojas.indexOf(activa) >= 0 ? activa : hojas[0], opciones: hojas.map(function (h) { return [h, h]; }) },
      { id: 'nombre', etiqueta: 'Escribir el nombre del producto (columna opcional)', valor: 'NO', opciones: [['NO', 'No (como se sube normalmente)'], ['SI', 'Sí']] },
      { id: 'sinGtin', etiqueta: 'Si un SKU no tiene GTIN', valor: 'PARAR', opciones: [['PARAR', 'Parar: no generar nada'], ['OMITIR', 'Generar sin esos SKU']] }
    ],
    resumen: [['Plantilla', 'La original de Walmart (hoja Items)'], ['Valores fijos', 'Product ID type = GTIN · Units per master case = 1 · Item label = No Prep Required'], ['Tope', WFS_PL_MAX + ' SKU por archivo; si hay más salen varios archivos']],
    avisos: ['Se guarda en tu Drive (carpeta "Plantillas WFS") y también te llega por correo.'],
    reenvio: false
  });
}

function wfsPlantillaForm(p) {
  var c = p.campos || {}, real = p.modo === 'REAL';
  var sh = SpreadsheetApp.getActive().getSheetByName(String(c.hoja || ''));
  if (!sh || wfsChHojas_(SpreadsheetApp.getActive()).indexOf(sh.getName()) < 0) return { ok: false, lineas: ['Elige una hoja ENVIO. No se hizo nada.'] };
  var r = wfsPlFilas_(sh, c.nombre === 'SI');
  var L = [];
  var piezas = r.filas.reduce(function (a, f) { return a + f.uni; }, 0);
  if (!r.filas.length) return { ok: false, lineas: ['La hoja ' + sh.getName() + ' no tiene cantidades en AUTORIZADO (o ningún SKU con GTIN). No se hizo nada.'] };
  var nArch = Math.ceil(r.filas.length / WFS_PL_MAX);
  L.push('• ' + sh.getName() + ': ' + r.filas.length + ' SKU · ' + piezas + ' piezas · ' + nArch + ' archivo(s)');
  if (r.ceros) L.push('• ' + r.ceros + ' SKU con 0 en AUTORIZADO: no van.');
  if (r.pad) L.push('• ' + r.pad + ' GTIN se completaron con ceros a 14 dígitos.');
  if (r.sinGtin.length) L.push('⚠ ' + r.sinGtin.length + ' SKU sin GTIN válido: ' + r.sinGtin.join(', '));
  var ver = wfsPlVerificaGtin_(r.filas);
  if (ver.revisado && ver.mal.length) { L.push('❌ ' + ver.mal.length + ' SKU con GTIN que no cuadra con el catálogo de Walmart: ' + ver.mal.slice(0, 10).join(', ') + '. No se genera nada hasta arreglarlo.'); return { ok: false, lineas: L }; }
  L.push(ver.revisado ? '• GTIN verificado contra el catálogo de Walmart (SKU -MSI ↔ su GTIN).' : '⚠ No pude verificar GTIN contra el catálogo (falta la hoja Walmart).');
  if (!real) {
    L.push(r.sinGtin.length ? '⚠ Revisión terminada: hay SKU sin GTIN. No se generó nada.' : '✅ Todo listo para generar. No se generó nada.');
    return { ok: !r.sinGtin.length, lineas: L };
  }
  if (r.sinGtin.length && c.sinGtin !== 'OMITIR') { L.push('❌ No se generó nada: hay SKU sin GTIN (elige "Generar sin esos SKU" si quieres seguir).'); return { ok: false, lineas: L }; }

  var base = String(sh.getName()).replace(/[^A-Za-z0-9\-]+/g, '_').replace(/^_+|_+$/g, '');
  var carpeta = wfsPlCarpeta_(), adjuntos = [], links = [];
  for (var i = 0; i < nArch; i++) {
    var lote = r.filas.slice(i * WFS_PL_MAX, (i + 1) * WFS_PL_MAX);
    var nombre = 'inbound-order-template_' + base + (nArch > 1 ? '_' + (i + 1) + 'de' + nArch : '') + '.xlsx';
    var blob = wfsPlXlsx_(lote, nombre);
    adjuntos.push(blob);
    try { links.push(carpeta.createFile(blob).getUrl()); } catch (e) { links.push('(no se pudo guardar en Drive: ' + e.message + ')'); }
  }
  var yo = ''; try { yo = skCorreoYo_(); } catch (e) {}
  if (yo) {
    try {
      MailApp.sendEmail({ to: yo, subject: 'Plantilla WFS para Walmart · ' + sh.getName(), body: 'Archivo(s) para subir a Walmart (WFS inbound order): ' + r.filas.length + ' SKU, ' + piezas + ' piezas.', attachments: adjuntos });
      L.push('✅ Enviada a ' + yo + ' con ' + nArch + ' archivo(s).');
    } catch (e) { L.push('⚠ No se pudo mandar el correo: ' + e.message); }
  }
  L.push('✅ Plantilla generada: ' + nArch + ' archivo(s) · ' + r.filas.length + ' SKU · ' + piezas + ' piezas.');
  links.forEach(function (u) { L.push('• ' + u); });
  return { ok: true, lineas: L };
}

function wfsPlCarpeta_() {
  var it = DriveApp.getFoldersByName('Plantillas WFS');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Plantillas WFS');
}
