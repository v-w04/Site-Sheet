/**
 * ============================================================
 *  WfsAutoriza — copia del envio para que otra persona AUTORICE las cantidades, y traerlas de vuelta
 * ============================================================
 *  1) "Copia para autorización": crea un Google Sheet APARTE (solo SKU, nombre, categoria, cantidad propuesta y una
 *     columna AUTORIZADO para llenar). Asi la otra persona no ve nada mas de este libro. Si se escribe su correo, se le
 *     comparte ESE archivo como editor (Google le avisa por correo). Queda anotada en la hoja "Autorizaciones WFS".
 *  2) "Traer autorizado": lee la columna AUTORIZADO de esa copia y la escribe en la columna AUTORIZADO de la hoja ENVIO.
 *     Esa columna es la que despues leen el traslado a Odoo y la plantilla de Walmart.
 * ============================================================
 */

var WFS_AU = {
  hojaReg: 'Autorizaciones WFS',
  hojaCopia: 'Autorizar',
  primeraFila: 5,   // col-fija: la copia la arma este script: encabezado en la fila 4, datos desde la 5
  propCorreo: 'WFS_AUT_CORREO'
};
var WFS_AU_REG_ENC = ['ENVIO', 'FECHA', 'LINK', 'ID', 'ESTADO', 'COMPARTIDO CON'];
var WFS_AU_ENC = ['SKU', 'NOMBRE', 'CATEGORIA', 'PROPUESTA', 'AUTORIZADO', 'NOTA'];

function wfsAuReg_(crear) {
  var ss = SpreadsheetApp.getActive(), h = ss.getSheetByName(WFS_AU.hojaReg);
  if (!h && crear) {
    h = ss.insertSheet(WFS_AU.hojaReg);
    h.getRange(1, 1, 1, WFS_AU_REG_ENC.length).setValues([WFS_AU_REG_ENC]).setBackground('#1F4E79').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
    h.setFrozenRows(1);
    [170, 140, 360, 260, 190, 220].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  }
  return h;
}

/** Fila del registro de un envio: { fila, ENVIO, LINK, ID, ESTADO } o null. */
function wfsAuBuscar_(envio) {
  var h = wfsAuReg_(false);
  if (!h || h.getLastRow() < 2) return null;
  var m = colsHoja_(h, WFS_AU_REG_ENC), v = h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues();
  for (var i = v.length - 1; i >= 0; i--) {
    if (String(v[i][m.ENVIO]) === envio) return { fila: i + 2, ENVIO: v[i][m.ENVIO], LINK: v[i][m.LINK], ID: String(v[i][m.ID]), ESTADO: String(v[i][m.ESTADO]), h: h, m: m };
  }
  return null;
}

function wfsAuLineas_(sh) {
  return wfsLeerHojaEnvio_(sh).detalle.map(function (f) {   // col-fija: fila de detalle de wfsLeerHojaEnvio_: [hoja, id, fecha, hora, delivery, folio, sku, skuBase, gtin, categoria, nombre, unidades]
    return { sku: String(f[6] || '').trim(), nombre: String(f[10] || '').trim(), cat: String(f[9] || '').trim(), uni: Number(f[11]) || 0 };  // col-fija: fila de wfsLeerHojaEnvio_ / copia propia
  }).filter(function (x) { return x.sku && x.uni > 0; });
}

function wfsAuHojasForm_() {
  var hojas = wfsChHojas_(SpreadsheetApp.getActive());
  var activa = SpreadsheetApp.getActiveSheet().getName();
  return { hojas: hojas, activa: hojas.indexOf(activa) >= 0 ? activa : hojas[0] };
}

/* ---------------- 1) Copia para autorizacion ---------------- */
function wfsAutorizaCopia() {
  var d = wfsAuHojasForm_();
  if (!d.hojas.length) { dlgInfo_('📤 Copia para autorización', 'No hay ninguna hoja "ENVIO N". Crea una con 🚚 Nuevo envío.', 'aviso'); return; }
  var correo = ''; try { correo = String(props_().getProperty(WFS_AU.propCorreo) || ''); } catch (e) {}
  dlgEnvio_({
    titulo: '📤 Copia para autorización',
    ayuda: 'Crea un Google Sheet aparte con solo SKU, nombre y cantidades, para que la otra persona ponga las cantidades AUTORIZADAS sin ver nada más de este libro.',
    manejador: 'wfsAutorizaCopiaForm', yo: '', segundos: 3,
    etiquetas: { prueba: 'Ver', real: 'Crear copia', pruebaTitulo: 'Muestra qué llevaría. No crea nada.' },
    campos: [
      { id: 'hoja', etiqueta: 'Hoja del envío', valor: d.activa, opciones: d.hojas.map(function (h) { return [h, h]; }) },
      { id: 'correo', etiqueta: 'Compartir con (opcional)', valor: correo, nota: 'Si escribes un correo, se le comparte ESE archivo como editor y Google le avisa. Si lo dejas vacío, solo te doy el link.' }
    ],
    resumen: [['Lleva', 'SKU · NOMBRE · CATEGORIA · PROPUESTA · AUTORIZADO (editable) · NOTA']],
    avisos: ['Después, con 📥 Traer autorizado, esas cantidades pasan a la columna AUTORIZADO de la hoja ENVIO.'],
    reenvio: false
  });
}

function wfsAutorizaCopiaForm(p) {
  var c = p.campos || {}, real = p.modo === 'REAL';
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(String(c.hoja || ''));
  if (!sh || wfsChHojas_(ss).indexOf(sh.getName()) < 0) return { ok: false, lineas: ['Elige una hoja ENVIO. No se hizo nada.'] };
  var correo = String(c.correo || '').trim();
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { ok: false, lineas: ['El correo no se ve bien. No se hizo nada.'] };
  var lin = wfsAuLineas_(sh);
  if (!lin.length) return { ok: false, lineas: ['La hoja ' + sh.getName() + ' no tiene cantidades en AUTORIZADO. No se hizo nada.'] };
  var piezas = lin.reduce(function (a, x) { return a + x.uni; }, 0);
  var L = ['• ' + sh.getName() + ': ' + lin.length + ' SKU · ' + piezas + ' piezas'];
  var ya = wfsAuBuscar_(sh.getName());
  if (ya && !/^TRAIDO/.test(ya.ESTADO)) L.push('⚠ Ya hay una copia pendiente de este envío: ' + ya.LINK);
  if (!real) { L.push('✅ Esto llevaría la copia. No se creó nada.'); return { ok: true, lineas: L }; }
  if (ya && !/^TRAIDO/.test(ya.ESTADO)) { L.push('No se creó otra para no confundir a la persona. Usa esa. Si necesitas una nueva, borra su fila en "' + WFS_AU.hojaReg + '".'); return { ok: false, lineas: L }; }

  var nombre = 'AUTORIZACION ' + sh.getName();
  var nuevo = SpreadsheetApp.create(nombre);
  var h = nuevo.getSheets()[0];
  h.setName(WFS_AU.hojaCopia);
  h.getRange(1, 1).setValue('AUTORIZACIÓN DE CANTIDADES · ' + sh.getName()).setFontWeight('bold').setFontSize(14);  // col-fija: copia armada por este script
  h.getRange(2, 1).setValue('Escribe en la columna AUTORIZADO las piezas que SÍ se pueden enviar de cada SKU (0 = no se envía). No cambies SKU ni PROPUESTA.');  // col-fija: copia armada por este script
  h.getRange(4, 1, 1, WFS_AU_ENC.length).setValues([WFS_AU_ENC]).setBackground('#1F4E79').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');  // col-fija: copia armada por este script
  var filas = lin.map(function (x) { return [x.sku, x.nombre, x.cat, x.uni, x.uni, '']; });
  var f0 = WFS_AU.primeraFila;
  h.getRange(f0, 1, filas.length, WFS_AU_ENC.length).setValues(filas);  // col-fija: copia armada por este script
  var ult = f0 + filas.length - 1;
  h.getRange(ult + 2, 1).setValue('TOTAL').setFontWeight('bold');
  h.getRange(ult + 2, 4).setFormula('=SUM(D' + f0 + ':D' + ult + ')').setFontWeight('bold');  // col-fija: copia armada por este script
  h.getRange(ult + 2, 5).setFormula('=SUM(E' + f0 + ':E' + ult + ')').setFontWeight('bold');  // col-fija: copia armada por este script
  try {
    h.getRange(f0, 5, filas.length, 1).setBackground('#FFF2CC').setHorizontalAlignment('center');  // col-fija: copia armada por este script
    h.getRange(f0, 4, filas.length, 1).setHorizontalAlignment('center');  // col-fija: copia armada por este script
    h.getRange(f0, 5, filas.length, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).setHelpText('Número entero, 0 o más').build());  // col-fija: copia armada por este script
    [160, 380, 180, 100, 110, 220].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
    h.setFrozenRows(4);
    h.getRange(f0, 1, filas.length, 4).protect().setWarningOnly(true);  // col-fija: copia armada por este script
  } catch (e) { /* adornos: si algo falla, la copia sirve igual */ }

  var id = nuevo.getId(), url = nuevo.getUrl();
  var compartido = '';
  if (correo) {
    try { DriveApp.getFileById(id).addEditor(correo); compartido = correo; props_().setProperty(WFS_AU.propCorreo, correo); L.push('✅ Compartido como editor con ' + correo + ' (Google le avisa por correo).'); }
    catch (e) { L.push('⚠ No se pudo compartir con ' + correo + ': ' + e.message + ' · compártelo tú con el link.'); }
  }
  var reg = wfsAuReg_(true);
  reg.getRange(reg.getLastRow() + 1, 1, 1, WFS_AU_REG_ENC.length).setValues([[sh.getName(), Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm'), url, id, 'PENDIENTE', compartido]]);
  L.push('✅ Copia creada: ' + lin.length + ' SKU · ' + piezas + ' piezas.');
  L.push('• ' + url);
  L.push('• Cuando la persona termine: 📥 Traer autorizado.');
  return { ok: true, lineas: L };
}

/* ---------------- 2) Traer autorizado ---------------- */
function wfsAutorizaTraer() {
  var d = wfsAuHojasForm_();
  if (!d.hojas.length) { dlgInfo_('📥 Traer autorizado', 'No hay ninguna hoja "ENVIO N".', 'aviso'); return; }
  dlgEnvio_({
    titulo: '📥 Traer autorizado',
    ayuda: 'Lee la columna AUTORIZADO de la copia que llenó la otra persona y la escribe en la columna AUTORIZADO de la hoja ENVIO. Ver cambios no escribe nada.',
    manejador: 'wfsAutorizaTraerForm', yo: '', segundos: 3,
    etiquetas: { prueba: 'Ver cambios', real: 'Traer a la hoja', pruebaTitulo: 'Muestra qué cambiaría. No escribe nada.' },
    campos: [{ id: 'hoja', etiqueta: 'Hoja del envío', valor: d.activa, opciones: d.hojas.map(function (h) { return [h, h]; }) }],
    resumen: [['Origen', 'La copia de "' + WFS_AU.hojaReg + '" de ese envío'], ['Destino', 'Columna AUTORIZADO de la hoja ENVIO']],
    avisos: ['Un SKU en blanco en la copia se toma como 0 (no se envía).'],
    reenvio: false
  });
}

function wfsAutorizaTraerForm(p) {
  var c = p.campos || {}, real = p.modo === 'REAL';
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(String(c.hoja || ''));
  if (!sh || wfsChHojas_(ss).indexOf(sh.getName()) < 0) return { ok: false, lineas: ['Elige una hoja ENVIO. No se hizo nada.'] };
  var reg = wfsAuBuscar_(sh.getName());
  if (!reg) return { ok: false, lineas: ['Ese envío no tiene copia para autorización. Primero 📤 Copia para autorización.'] };
  var libro;
  try { libro = SpreadsheetApp.openById(reg.ID); } catch (e) { return { ok: false, lineas: ['No pude abrir la copia (' + e.message + '). Revisa que no esté borrada.'] }; }
  var hc = libro.getSheetByName(WFS_AU.hojaCopia);
  if (!hc) return { ok: false, lineas: ['La copia ya no tiene la hoja "' + WFS_AU.hojaCopia + '". No se hizo nada.'] };

  var f0 = WFS_AU.primeraFila, n = Math.max(0, hc.getLastRow() - f0 + 1);
  var datos = n ? hc.getRange(f0, 1, n, 5).getDisplayValues() : [];   // col-fija: copia de este script: SKU, NOMBRE, CATEGORIA, PROPUESTA, AUTORIZADO
  var aut = {}, malos = [], blancos = 0, total = 0;
  datos.forEach(function (r) {
    var sku = String(r[0]).trim();
    if (!sku || /^TOTAL$/i.test(sku)) return;
    var t = String(r[4]).replace(/,/g, '').trim();  // col-fija: fila de wfsLeerHojaEnvio_ / copia propia
    var v;
    if (t === '') { v = 0; blancos++; } else { v = Number(t); }
    if (!isFinite(v) || v < 0 || Math.floor(v) !== v) { malos.push(sku + ' ("' + r[4] + '")'); return; }  // col-fija: fila de wfsLeerHojaEnvio_ / copia propia
    aut[sku] = v; total += v;
  });
  if (malos.length) return { ok: false, lineas: ['❌ Cantidades no válidas en la copia (deben ser enteros de 0 en adelante): ' + malos.slice(0, 15).join(', ') + (malos.length > 15 ? '…' : '') + '. No se escribió nada.'] };

  var P = { sku: wfsIdxEnc_(WFS_ENV_ENC, 'SKU', 1), aut: wfsIdxEnc_(WFS_ENV_ENC, 'AUTORIZADO') };
  var ult = sh.getLastRow();
  var skus = sh.getRange(2, P.sku, Math.max(1, ult - 1), 1).getDisplayValues();
  var rg = sh.getRange(2, P.aut, Math.max(1, ult - 1), 1);
  var cur = rg.getValues();
  var cambios = [], sinCopia = [], antes = 0, despues = 0, vistos = {};
  skus.forEach(function (r, i) {
    var sku = String(r[0]).trim();
    if (!sku) return;
    var a = Number(cur[i][0]) || 0;
    antes += a;
    if (!(sku in aut)) { if (a > 0) sinCopia.push(sku); despues += a; return; }
    vistos[sku] = 1;
    despues += aut[sku];
    if (aut[sku] !== a) { cambios.push(sku + ': ' + a + ' → ' + aut[sku]); cur[i][0] = aut[sku]; }
  });
  var extra = Object.keys(aut).filter(function (k) { return !vistos[k]; });

  var L = ['• ' + sh.getName() + ': propuesta ' + antes + ' pzas → autorizado ' + despues + ' pzas · ' + cambios.length + ' SKU cambian'];
  if (blancos) L.push('• ' + blancos + ' SKU en blanco en la copia se tomaron como 0.');
  cambios.slice(0, 25).forEach(function (x) { L.push('  ' + x); });
  if (cambios.length > 25) L.push('  … y ' + (cambios.length - 25) + ' más');
  if (sinCopia.length) L.push('⚠ ' + sinCopia.length + ' SKU de la hoja ENVIO no están en la copia (se dejan igual): ' + sinCopia.slice(0, 10).join(', '));
  if (extra.length) L.push('⚠ ' + extra.length + ' SKU de la copia no están en la hoja ENVIO (se ignoran): ' + extra.slice(0, 10).join(', '));
  if (!real) { L.push(cambios.length ? '✅ Esto cambiaría. No se escribió nada.' : '✅ No hay cambios. No se escribió nada.'); return { ok: true, lineas: L }; }

  if (cambios.length) rg.setValues(cur);
  reg.h.getRange(reg.fila, reg.m.ESTADO + 1).setValue('TRAIDO ' + Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm'));
  L.push('✅ Autorizado traído a la columna AUTORIZADO de ' + sh.getName() + '. Ya puedes crear el traslado en Odoo y la plantilla de Walmart.');
  return { ok: true, lineas: L };
}
