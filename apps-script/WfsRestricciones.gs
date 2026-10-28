/**
 * ============================================================
 *  Restricciones de WFS — que NO se envia a Walmart Fulfillment
 * ============================================================
 *
 * Reglas FIJAS (en el codigo, ver Wfs.gs): solo premium (-MSI, -MSI-2 ... -MSI-99), nunca CVA.
 * Reglas EDITABLES: la hoja "Restricciones WFS" (TIPO, VALOR, MOTIVO, DESDE):
 *   SKU BASE   -> ese SKU base, sus variantes (-2, -3...) y sus premium (-MSI, -MSI-2...) NO van a WFS.
 *                 Si tiene killer, el killer SI se solicita: solo WFS esta vetado.
 *   SKU EXACTO -> SOLO ese SKU publicado, tal cual (ej. SON-CFIZCT1W-BLA-1674-MSI); sus hermanos (-MSI-2...) SI van.
 *   CATEGORIA  -> toda categoria cuyo nombre CONTENGA ese texto (sin importar mayusculas) NO va a WFS.
 * Si la hoja no existe se usan las reglas de abajo (las mismas con las que se crea). Para quitar o agregar una regla,
 * edita la hoja: no hay que tocar codigo ni volver a subir nada.
 */
var WFS_RESTR = {
  hoja: 'Restricciones WFS',
  enc: ['TIPO', 'VALOR', 'MOTIVO', 'DESDE'],
  base: [
    ['SKU BASE', 'DYS-1749064-FUC-3952', 'No se envia a WFS ni el SKU, ni sus variantes, ni sus premium. Si hay killer, el killer SI se solicita.', '2026-10-28'],
    ['SKU EXACTO', 'SON-CFIZCT1W-BLA-1674-MSI', 'Solo esta publicacion no va a WFS; SON-CFIZCT1W-BLA-1674-MSI-2 si va y recibe todo el WFS de ese producto.', '2026-10-28'],
    ['SKU EXACTO', 'SON-CFIZCT1W-CAM-2671-MSI', 'Walmart no deja convertir esta publicacion a WFS; hay que republicarla. No se envia mientras tanto.', '2026-10-28'],
    ['SKU EXACTO', 'JBL-JBLT530BTLAVAM-LIL-6962-MSI', 'Walmart no deja convertir a WFS: REPUBLICAR. No se envia mientras tanto.', '2026-10-28'],
    ['CATEGORIA', 'cable', 'Cables no se envian a WFS (por ejemplo los de TRA / 1HORA).', '2026-10-28']
  ],
  fijas: [
    ['REGLA FIJA', 'Solo premium', 'Solo se envian SKU que terminan en -MSI o -MSI-2 ... -MSI-99. Esta regla vive en el codigo.', '2026-10-28'],
    ['REGLA FIJA', 'Nunca CVA', 'Ningun SKU con CVA (-CVA, -MSI-CVA, -CVA-MSI) va a WFS. Esta regla vive en el codigo.', '2026-10-28']
  ]
};
var WFS_RESTR_CACHE = null;

function wfsRestriccionesReset_() { WFS_RESTR_CACHE = null; }

/** {skus:[{v,motivo}], cats:[{v,motivo}]}: de la hoja si existe; si no, de las reglas por defecto. */
function wfsRestriccionesLeer_() {
  if (WFS_RESTR_CACHE) return WFS_RESTR_CACHE;
  var filas = null;
  try {
    var h = SpreadsheetApp.getActive().getSheetByName(WFS_RESTR.hoja);
    if (h && h.getLastRow() >= 1) {
      var m = colsHoja_(h, ['TIPO', 'VALOR'], ['MOTIVO']);
      filas = h.getLastRow() < 2 ? [] : h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues().map(function (r) {
        return [String(r[m.TIPO] || ''), String(r[m.VALOR] || ''), m.MOTIVO >= 0 ? String(r[m.MOTIVO] || '') : ''];
      });
    }
  } catch (e) { filas = null; }
  if (!filas) filas = WFS_RESTR.base;
  var out = { skus: [], exactos: [], cats: [] };
  filas.forEach(function (f) {
    var tipo = String(f[0]).trim().toUpperCase(), v = String(f[1]).trim();   // col-fija: fila en memoria / columna propia de esta hoja
    if (!v) return;
    if (/^SKU\s*BASE/.test(tipo)) out.skus.push({ v: v.toUpperCase(), motivo: String(f[2] || '') });
    else if (/^SKU/.test(tipo)) out.exactos.push({ v: v.toUpperCase(), motivo: String(f[2] || '') });   // col-fija: fila en memoria / columna propia de esta hoja
    else if (/^CATEG/.test(tipo)) out.cats.push({ v: v.toLowerCase(), motivo: String(f[2] || '') });   // col-fija: fila en memoria / columna propia de esta hoja
  });
  WFS_RESTR_CACHE = out;
  return out;
}

/** Texto del motivo si el SKU (o su categoria) esta vetado en la hoja de restricciones; '' si no. */
function wfsRestriccionDe_(sku, cat) {
  var r = wfsRestriccionesLeer_(), u = String(sku || '').trim().toUpperCase(), c = String(cat || '').toLowerCase(), i;
  for (i = 0; i < r.exactos.length; i++) if (u === r.exactos[i].v) return 'SKU ' + u + ' restringido para WFS (hoja ' + WFS_RESTR.hoja + ')';
  for (i = 0; i < r.skus.length; i++) {
    var b = r.skus[i].v;
    if (u === b || u.indexOf(b + '-') === 0) return 'SKU base ' + b + ' restringido para WFS (hoja ' + WFS_RESTR.hoja + ')';
  }
  for (i = 0; i < r.cats.length; i++) {
    if (c.indexOf(r.cats[i].v) >= 0) return 'categoria "' + String(cat).trim() + '" restringida para WFS (hoja ' + WFS_RESTR.hoja + ')';
  }
  return '';
}

/** Menu: crea la hoja (si falta) con las reglas actuales y la abre. */
function wfsRestricciones() {
  var ss = SpreadsheetApp.getActive(), h = ss.getSheetByName(WFS_RESTR.hoja), nueva = false;
  if (!h) {
    h = ss.insertSheet(WFS_RESTR.hoja);
    nueva = true;
    var filas = WFS_RESTR.base.concat(WFS_RESTR.fijas);
    h.getRange(1, 1, 1, WFS_RESTR.enc.length).setValues([WFS_RESTR.enc]).setBackground('#1F4E79').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
    h.getRange(2, 1, filas.length, WFS_RESTR.enc.length).setValues(filas);
    h.getRange(2, 4, filas.length, 1).setNumberFormat('@');   // col-fija: fila en memoria / columna propia de esta hoja
    h.setFrozenRows(1);
    [130, 240, 520, 100].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
    h.getRange(1, 1).setNote('TIPO = SKU BASE (con variantes y premium), SKU EXACTO (solo esa publicacion) o CATEGORIA. VALOR = el SKU o una palabra de la categoria. Las filas REGLA FIJA solo informan: viven en el codigo.');
    wfsRestriccionesReset_();
    logInfo_('WFS', 'Hoja ' + WFS_RESTR.hoja + ' creada con ' + WFS_RESTR.base.length + ' reglas');
    flushLog_();
  }
  var nuevas = nueva ? [] : wfsRestriccionesSembrar_(h);
  if (nuevas.length) { wfsRestriccionesReset_(); logInfo_('WFS', 'Restricciones WFS: se agregaron ' + nuevas.length + ' regla(s) nuevas del código', nuevas.join(' · ')); flushLog_(); }
  ss.setActiveSheet(h);
  var r = wfsRestriccionesLeer_();
  dlgInfo_('🚫 Restricciones WFS',
    (nueva ? 'Hoja creada. ' : '') + (nuevas.length ? 'Se agregaron reglas nuevas: ' + nuevas.join(', ') + '.\n\n' : '') + 'Hoy NO se envía a WFS:\n\n' +
    '• Clásicas (todo lo que no termine en -MSI / -MSI-2 … -MSI-99)\n• Todo SKU con CVA\n' +
    r.skus.map(function (x) { return '• SKU base ' + x.v + ' (con variantes y premium)'; }).join('\n') + (r.skus.length ? '\n' : '') +
    r.exactos.map(function (x) { return '• SKU ' + x.v + ' (solo esa publicación)'; }).join('\n') + (r.exactos.length ? '\n' : '') +
    r.cats.map(function (x) { return '• Categorías que contengan "' + x.v + '"'; }).join('\n') +
    '\n\nPara agregar o quitar una, edita la hoja Restricciones WFS (TIPO = SKU BASE, SKU EXACTO o CATEGORIA). Un SKU vetado para WFS sí puede llevar killer.', 'ok');
}

/** Agrega a la hoja YA existente las reglas por defecto que le faltan (por TIPO+VALOR). Cada regla se siembra UNA sola vez:
 *  si la borras a mano despues, no regresa. Se insertan antes de las filas REGLA FIJA. Devuelve los VALOR agregados. */
function wfsRestriccionesSembrar_(h) {
  var P = PropertiesService.getScriptProperties(), clave = 'WFS_RESTR_SEMBRADAS';
  var hechas = {};
  try { hechas = JSON.parse(P.getProperty(clave) || '{}'); } catch (e) { hechas = {}; }
  var ult = h.getLastRow();
  var datos = ult >= 2 ? h.getRange(2, 1, ult - 1, 2).getValues() : [];
  var hay = {}, primeraFija = -1;
  datos.forEach(function (r, i) {
    hay[String(r[0]).trim().toUpperCase() + '|' + String(r[1]).trim().toUpperCase()] = 1;
    if (primeraFija < 0 && /^REGLA FIJA/i.test(String(r[0]))) primeraFija = i;
  });
  var faltan = WFS_RESTR.base.filter(function (f) {
    var k = String(f[0]).toUpperCase() + '|' + String(f[1]).toUpperCase();
    return !hay[k] && !hechas[k];
  });
  WFS_RESTR.base.forEach(function (f) { hechas[String(f[0]).toUpperCase() + '|' + String(f[1]).toUpperCase()] = 1; });
  if (faltan.length) {
    var fila = primeraFija >= 0 ? primeraFija + 2 : ult + 1;
    if (primeraFija >= 0) h.insertRowsBefore(fila, faltan.length);
    h.getRange(fila, 1, faltan.length, WFS_RESTR.enc.length).setValues(faltan);
    h.getRange(fila, 4, faltan.length, 1).setNumberFormat('@');
  }
  P.setProperty(clave, JSON.stringify(hechas));
  return faltan.map(function (f) { return f[1]; });
}
