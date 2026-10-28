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
var WFS_AU_ENC = ['SKU', 'SKU BASE', 'NOMBRE', 'CATEGORIA', 'VENDIDAS', 'EN WFS', 'PROPUESTA', 'AUTORIZADO'];
function wfsAuLetra_(n) { var t = ''; while (n > 0) { var r = (n - 1) % 26; t = String.fromCharCode(65 + r) + t; n = Math.floor((n - 1) / 26); } return t; }

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
  return wfsLeerHojaEnvio_(sh).detalle.map(function (f) {   // col-fija: fila de detalle de wfsLeerHojaEnvio_: [hoja,id,fecha,hora,delivery,folio,sku,skuBase,gtin,categoria,nombre,unidades,PROPUESTA,VENDIDAS,EN WFS]
    return { sku: String(f[6] || '').trim(), base: String(f[7] || '').trim(), nombre: String(f[10] || '').trim(), cat: String(f[9] || '').trim(),  // col-fija: fila de wfsLeerHojaEnvio_
      vend: Number(f[13]) || 0, wfs: Number(f[14]) || 0, uni: Number(f[12]) || Number(f[11]) || 0 };   // col-fija: ver arriba
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
      { id: 'reemplazar', etiqueta: 'Si ya hay una copia pendiente de ese envío', valor: 'NO', opciones: [['NO', 'No: avisarme y no crear otra'], ['SI', 'Reemplazarla (la anterior va a la papelera de Drive)']] },
      { id: 'correo', etiqueta: 'Compartir con (opcional)', valor: correo, nota: 'Si escribes un correo, se le comparte ESE archivo como editor y Google le avisa. Si lo dejas vacío, solo te doy el link.' }
    ],
    resumen: [['Lleva', 'SKU · SKU BASE · NOMBRE · CATEGORIA · VENDIDAS · EN WFS · PROPUESTA · AUTORIZADO (viene en 0, ahí escribe la persona)']],
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
  var pend = ya && !/^(TRAIDO|REEMPLAZADA|ANULADA)/.test(ya.ESTADO), reemp = c.reemplazar === 'SI';
  if (pend) L.push('⚠ Ya hay una copia pendiente de este envío: ' + ya.LINK + (reemp ? ' · se REEMPLAZARÍA (la anterior va a la papelera de Drive).' : ''));
  if (!real) { L.push('✅ Esto llevaría la copia. No se creó nada.'); return { ok: true, lineas: L }; }
  if (pend && !reemp) { L.push('No se creó otra para no confundir a la persona. Usa esa, o vuelve a abrir esta ventana y elige "Reemplazarla".'); return { ok: false, lineas: L }; }
  if (pend && reemp) {
    try { DriveApp.getFileById(ya.ID).setTrashed(true); L.push('✅ La copia anterior se mandó a la papelera de Drive (se puede recuperar).'); }
    catch (e) { L.push('⚠ No pude mandar a la papelera la copia anterior (' + e.message + '). Bórrala a mano en Drive; sigo con la nueva.'); }
    ya.h.getRange(ya.fila, ya.m.ESTADO + 1).setValue('REEMPLAZADA ' + Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm'));
  }

  var nombre = 'AUTORIZACION ' + sh.getName();
  var nuevo = SpreadsheetApp.create(nombre);
  var h = nuevo.getSheets()[0];
  h.setName(WFS_AU.hojaCopia);
  h.getRange(1, 1).setValue('AUTORIZACIÓN DE CANTIDADES · ' + sh.getName()).setFontWeight('bold').setFontSize(14);  // col-fija: copia armada por este script
  h.getRange(2, 1).setValue('AUTORIZADO viene en 0. Escribe ahí las piezas que SÍ se pueden enviar de cada SKU (0 = no se envía). No cambies SKU ni PROPUESTA.');  // col-fija: copia armada por este script
  h.getRange(4, 1, 1, WFS_AU_ENC.length).setValues([WFS_AU_ENC]).setBackground('#1F4E79').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');  // col-fija: copia armada por este script
  var E = WFS_AU_ENC, cAut = E.indexOf('AUTORIZADO') + 1, cProp = E.indexOf('PROPUESTA') + 1;
  var filas = lin.map(function (x) {
    var fila = new Array(E.length).fill('');
    fila[E.indexOf('SKU')] = x.sku; fila[E.indexOf('SKU BASE')] = x.base; fila[E.indexOf('NOMBRE')] = x.nombre; fila[E.indexOf('CATEGORIA')] = x.cat;
    fila[E.indexOf('VENDIDAS')] = x.vend; fila[E.indexOf('EN WFS')] = x.wfs; fila[E.indexOf('PROPUESTA')] = x.uni;
    fila[E.indexOf('AUTORIZADO')] = 0;   // AUTORIZADO nace en 0: la persona escribe lo que SI se manda
    return fila;
  });
  var f0 = WFS_AU.primeraFila;
  h.getRange(f0, 1, filas.length, E.length).setValues(filas);
  var ult = f0 + filas.length - 1;
  h.getRange(ult + 2, 1).setValue('TOTAL').setFontWeight('bold');
  [cProp, cAut].forEach(function (cc) { h.getRange(ult + 2, cc).setFormula('=SUM(' + wfsAuLetra_(cc) + f0 + ':' + wfsAuLetra_(cc) + ult + ')').setFontWeight('bold').setHorizontalAlignment('center'); });
  try {
    h.getRange(f0, 1, filas.length, E.length).setVerticalAlignment('middle');
    h.getRange(f0, E.indexOf('VENDIDAS') + 1, filas.length, 3).setHorizontalAlignment('center');   // VENDIDAS, EN WFS, PROPUESTA
    h.getRange(f0, cAut, filas.length, 1).setBackground('#FFF2CC').setHorizontalAlignment('center').setFontWeight('bold');
    h.getRange(f0, cAut, filas.length, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).setHelpText('Número entero, 0 o más').build());
    [170, 170, 380, 190, 90, 80, 100, 110].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
    h.setFrozenRows(4);
    h.getRange(f0, 1, filas.length, cAut - 1).protect().setWarningOnly(true);   // todo menos AUTORIZADO avisa si lo tocan
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
  try { logOk_('WFS-AUTORIZA', 'Copia para autorización creada de ' + sh.getName(), lin.length + ' SKU · ' + piezas + ' pzas'); } catch (e) { /* log: no frena */ }
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

  var f0 = WFS_AU.primeraFila, n = Math.max(0, hc.getLastRow() - f0 + 1), nc = Math.max(1, hc.getLastColumn());
  var mc;
  try { mc = colsDe_(hc.getRange(f0 - 1, 1, 1, nc).getDisplayValues()[0], ['SKU', 'AUTORIZADO'], WFS_AU.hojaCopia); }
  catch (e) { return { ok: false, lineas: ['❌ La copia ya no tiene las columnas SKU y AUTORIZADO en su encabezado. No se escribió nada.'] }; }
  var datos = n ? hc.getRange(f0, 1, n, nc).getDisplayValues() : [];
  var aut = {}, malos = [], blancos = 0, total = 0;
  datos.forEach(function (r) {
    var sku = String(r[mc.SKU]).trim();
    if (!sku || /^TOTAL$/i.test(sku)) return;
    var t = String(r[mc.AUTORIZADO]).replace(/,/g, '').trim();
    var v;
    if (t === '') { v = 0; blancos++; } else { v = Number(t); }
    if (!isFinite(v) || v < 0 || Math.floor(v) !== v) { malos.push(sku + ' ("' + r[mc.AUTORIZADO] + '")'); return; }
    if (sku in aut) { malos.push(sku + ' (repetido en la copia)'); return; }
    aut[sku] = v; total += v;
  });
  if (!Object.keys(aut).length) return { ok: false, lineas: ['❌ La copia no tiene ningún SKU (¿borraron todas las filas?). No se escribió nada.'] };
  if (malos.length) return { ok: false, lineas: ['❌ Cantidades no válidas en la copia (deben ser enteros de 0 en adelante): ' + malos.slice(0, 15).join(', ') + (malos.length > 15 ? '…' : '') + '. No se escribió nada.'] };

  var encH = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getDisplayValues()[0].map(function (v) { return String(v || '').toUpperCase().replace(/[^A-Z ]/g, '').trim(); });
  var P = { sku: 0, prop: 0, aut: 0 };
  for (var q = 0; q < encH.length; q++) {
    if (encH[q] === 'SKU' && !P.sku && q >= 9) P.sku = q + 1;
    if (encH[q] === 'PROPUESTA') P.prop = q + 1;
    if (encH[q] === 'AUTORIZADO') P.aut = q + 1;
  }
  if (!P.sku || !P.aut) return { ok: false, lineas: ['La hoja ' + sh.getName() + ' no tiene columnas SKU y AUTORIZADO. No se hizo nada.'] };
  var ult = sh.getLastRow();
  var skus = sh.getRange(2, P.sku, Math.max(1, ult - 1), 1).getDisplayValues();
  var rg = sh.getRange(2, P.aut, Math.max(1, ult - 1), 1);
  var cur = rg.getValues();
  var prop = P.prop ? sh.getRange(2, P.prop, Math.max(1, ult - 1), 1).getValues() : null;
  var cambios = [], sinCopia = [], antes = 0, despues = 0, vistos = {};
  skus.forEach(function (r, i) {
    var sku = String(r[0]).trim();
    if (!sku) return;
    var a = Number(cur[i][0]) || 0;
    var pr = prop ? (Number(prop[i][0]) || 0) : a;
    antes += pr;
    if (!(sku in aut)) {   // la persona borró la fila: queda en 0
      if (pr > 0) sinCopia.push(sku);
      if (a !== 0) { cambios.push(sku + ': ' + pr + ' → 0 (borrado en la copia)'); cur[i][0] = 0; }
      else if (pr > 0) cambios.push(sku + ': ' + pr + ' → 0 (borrado en la copia)');
      return;
    }
    vistos[sku] = 1;
    despues += aut[sku];
    if (aut[sku] !== a) { cambios.push(sku + ': ' + pr + ' → ' + aut[sku]); cur[i][0] = aut[sku]; }
  });
  var extra = Object.keys(aut).filter(function (k) { return !vistos[k]; });

  var L = ['• ' + sh.getName() + ': propuesta ' + antes + ' pzas → autorizado ' + despues + ' pzas · ' + cambios.length + ' SKU cambian'];
  if (blancos) L.push('• ' + blancos + ' SKU en blanco en la copia se tomaron como 0.');
  cambios.slice(0, 25).forEach(function (x) { L.push('  ' + x); });
  if (cambios.length > 25) L.push('  … y ' + (cambios.length - 25) + ' más');
  if (sinCopia.length) L.push('⚠ ' + sinCopia.length + ' SKU ya no están en la copia (la persona borró la fila) → quedan en 0.');
  if (extra.length) L.push('⚠ ' + extra.length + ' SKU de la copia no están en la hoja ENVIO (se ignoran): ' + extra.slice(0, 10).join(', '));
  if (!real) { L.push(cambios.length ? '✅ Esto cambiaría. No se escribió nada.' : '✅ No hay cambios. No se escribió nada.'); return { ok: true, lineas: L }; }

  if (cambios.length) rg.setValues(cur);
  reg.h.getRange(reg.fila, reg.m.ESTADO + 1).setValue('TRAIDO ' + Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm'));
  try { logOk_('WFS-AUTORIZA', 'Autorizado traído a ' + sh.getName(), 'propuesta ' + antes + ' → autorizado ' + despues + ' pzas · ' + cambios.length + ' cambios · ' + sinCopia.length + ' sin copia · ' + extra.length + ' extra'); } catch (e) { /* log */ }
  L.push('✅ Autorizado traído a la columna AUTORIZADO de ' + sh.getName() + '. Ya puedes crear el traslado en Odoo y la plantilla de Walmart.');
  return { ok: true, lineas: L };
}


/** 🗑 Copias de envios que ya no existen: busca en el registro las PENDIENTES cuya hoja ENVIO ya no esta y las manda a la papelera. */
function wfsAutorizaHuerfanas() {
  var l = wfsAuHuerfanas_();
  if (!l.length) { dlgInfo_('🗑 Copias sobrantes', 'No hay copias pendientes de envíos que ya no existan. Nada que quitar.', 'ok'); return; }
  dlgOpciones_({
    titulo: '🗑 Copias sobrantes',
    texto: 'Estas copias siguen PENDIENTES pero su hoja ENVIO ya no existe:\n\n' + l.map(function (x) { return '• ' + x.nombre; }).join('\n') +
      '\n\nSe mandan a la papelera de Drive (se pueden recuperar) y quedan ANULADAS en el registro.',
    manejador: 'wfsAutorizaHuerfanasForm',
    botones: [{ id: 'QUITAR', texto: 'Mandar a la papelera', tipo: 'r2' }]
  });
}

function wfsAuHuerfanas_() {
  var h = wfsAuReg_(false), ss = SpreadsheetApp.getActive(), out = [];
  if (!h || h.getLastRow() < 2) return out;
  var m = colsHoja_(h, WFS_AU_REG_ENC), v = h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues();
  v.forEach(function (r, i) {
    var est = String(r[m.ESTADO]);
    if (/^(TRAIDO|REEMPLAZADA|ANULADA)/.test(est)) return;
    if (ss.getSheetByName(String(r[m.ENVIO]))) return;
    out.push({ fila: i + 2, nombre: String(r[m.ENVIO]), id: String(r[m.ID]), h: h, m: m });
  });
  return out;
}

function wfsAutorizaHuerfanasForm(p) {
  if (!p || p.boton !== 'QUITAR') throw new Error('Opcion no valida.');
  var L = [], marca = 'ANULADA ' + Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm');
  wfsAuHuerfanas_().forEach(function (x) {
    try { DriveApp.getFileById(x.id).setTrashed(true); L.push('✅ ' + x.nombre + ': copia a la papelera.'); }
    catch (e) { L.push('⚠ ' + x.nombre + ': no pude borrar el archivo (' + e.message + '); queda anulada en el registro.'); }
    x.h.getRange(x.fila, x.m.ESTADO + 1).setValue(marca);
  });
  return { ok: true, lineas: L.length ? L : ['Nada que quitar.'] };
}
