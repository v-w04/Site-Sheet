/**
 * ============================================================
 *  VentaHistorica.gs - septiembre 2026 y los meses del archivo "Ventas WALMART 2026", como VALORES fijos
 * ============================================================
 *
 *  Datos: VentaHistoricaDatos.gs (generado de tus CSV y de la hoja WALMART de Venta Diaria Odoo; solo lectura).
 *  Menu: SITE SHEET > 📈 Ventas > 📥 Traer septiembre y meses del archivo (se puede repetir: reescribe lo mismo).
 *
 *  Hojas (valores, nada de formulas salvo "Venta por año"):
 *    "Ventas septiembre"  una linea por venta WFS y SELLER de septiembre 2026 (CSV): canal, referencia, fecha, SKU, piezas,
 *                         precio, venta total y killer (cupon x piezas, ya cruzado con K.ACTIVOS septiembre).
 *    "Odoo septiembre"    las ventas de septiembre tal como las maneja Odoo (las 13 columnas de Venta Diaria Odoo, sin cambios).
 *    "Resumen venta y killers"  (VentasKillers.gs) suma al final los meses del archivo con su total: vkResumen_ llama a
 *                         vhiFilasResumen_. Un mes que el site ya calcula (octubre en adelante) nunca se pisa.
 *    "Venta por año"      formulas sobre el Resumen: meses contados, WFS, SELLER, KILLERS, TOTAL y promedio por mes.
 *
 *  Septiembre no entra a "Ventas Walmart" a proposito: esa hoja la baja el site cada hora y sus filas se identifican por
 *  FOLIO; mezclar lineas de CSV sin folio la expondria a duplicados y a revisiones de precio/cancelacion que no le tocan.
 * ============================================================
 */

var VHI_ETAPA = 'HISTORICO_SEP';
var VHI_HOJA_SEP = 'Ventas septiembre', VHI_HOJA_ODOO = 'Odoo septiembre', VHI_HOJA_ANIO = 'Venta por año';
var VHI_MES_SEP = '2026-09';
var VHI_ENC_SEP = ['MES', 'CANAL VENTA', 'REFERENCIA', 'FECHA VENTA', 'SKU', 'PRODUCTO', 'PIEZAS', 'PRECIO UNITARIO', 'VENTA TOTAL', 'KILLER UNITARIO', 'KILLER TOTAL'];
var VHI_ENC_ODOO = ['ID Línea', 'Número (SO)', 'Fecha creación', 'Cliente', 'Vendedor', 'Estado SO', 'SKU', 'Producto', 'Cantidad', 'Precio unitario', 'Importe línea', 'Total orden', 'Precio referencia'];
var VHI_ENC_ANIO = ['AÑO', 'MESES', 'WFS', 'SELLER', 'KILLERS', 'TOTAL', 'PROMEDIO MES'];

/** 'yyyy-mm-dd' o 'yyyy-mm-dd hh:mm:ss' -> Date (hora del script). */
function vhiFecha_(s) {
  var m = String(s || '').match(/^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d):(\d\d))?/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)) : '';
}

/** 1234567.8 -> '1,234,568' */
function vhiMiles_(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/** Totales de las lineas de septiembre (pura: se prueba sin Google). */
function vhiTotales_(lineas) {
  var t = { seller: 0, wfs: 0, killers: 0, nSeller: 0, nWfs: 0 };
  lineas.forEach(function (l) {
    if (l[0] === 'WFS') { t.wfs += l[7]; t.nWfs++; } else { t.seller += l[7]; t.nSeller++; }
    t.killers += l[9];
  });
  return t;
}

/** Filas para el Resumen: meses del archivo que el site no calcula. presentes = { 'yyyy-MM': true }. Mas nuevo primero. */
function vhiFilasResumen_(presentes) {
  var out = [];
  VHI_MESES.forEach(function (x) {
    var mes = x[0];
    if (presentes[mes]) return;
    var dias = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate(), total = x[4];
    out.push([vkNombreMes_(mes), x[1] == null ? '' : x[1], x[2] == null ? '' : x[2], x[3] == null ? '' : x[3], total, total / dias, 'CERRADO', '']);
  });
  return out;
}

function vhiEscribir_() {
  var t = vhiTotales_(VHI_SEP_LINEAS), nombre = vkNombreMes_(VHI_MES_SEP);
  var filas = VHI_SEP_LINEAS.map(function (l) {
    return [nombre, l[0], l[1], vhiFecha_(l[2]), l[5], l[3], l[4], l[6], l[7], l[8], l[9]];
  }).sort(function (a, b) { return a[3] - b[3]; });
  var h = vdHoja_(VHI_HOJA_SEP);
  var m = vdEscribir_(h, VHI_ENC_SEP, filas, { vacioOk: true, clave: 'ESCR_COLS|' + VHI_HOJA_SEP, texto: ['MES', 'REFERENCIA', 'SKU'] });
  vdFormato_(h, m, 'FECHA VENTA', filas.length, 'yyyy-MM-dd');
  ['PRECIO UNITARIO', 'VENTA TOTAL', 'KILLER UNITARIO', 'KILLER TOTAL'].forEach(function (x) { vdFormato_(h, m, x, filas.length, '$#,##0.00'); });
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);

  var fo = VHI_SEP_ODOO.map(function (r) {
    var x = r.slice(); x[2] = vhiFecha_(x[2]); return x;
  });
  var ho = vdHoja_(VHI_HOJA_ODOO);
  var mo = vdEscribir_(ho, VHI_ENC_ODOO, fo, { vacioOk: true, clave: 'ESCR_COLS|' + VHI_HOJA_ODOO, texto: ['Número (SO)', 'SKU'] });
  vdFormato_(ho, mo, 'Fecha creación', fo.length, 'yyyy-MM-dd HH:mm:ss');
  ['Precio unitario', 'Importe línea', 'Total orden', 'Precio referencia'].forEach(function (x) { vdFormato_(ho, mo, x, fo.length, '$#,##0.00'); });
  if (ho.getFrozenRows() < 1) ho.setFrozenRows(1);
  var iImp = VHI_ENC_ODOO.indexOf('Importe línea'), odoo = 0;
  VHI_SEP_ODOO.forEach(function (r) { odoo += Number(r[iImp]) || 0; });
  return { t: t, lineas: filas.length, odooLineas: fo.length, odooImporte: odoo };
}

/** Hoja "Venta por año": formulas sobre el Resumen. Se rehace cada vez que se rehace el Resumen. */
function vhiAnio_() {
  var t = peTabla_(VK_HOJA_RES);
  if (!t) return;
  var letra = function (n) { var j = t.pos[normEnc_(n)]; return j === undefined ? '' : colLetra_(j + 1); };
  var cM = letra('MES'), cW = letra('WFS'), cS = letra('SELLER'), cK = letra('KILLERS'), cT = letra('TOTAL');
  if (!cM || !cW || !cS || !cK || !cT) return;
  var iM = t.pos[normEnc_('MES')], anios = {};
  t.filas.forEach(function (f) { var a = String(f[iM] || '').trim().slice(-4); if (/^\d{4}$/.test(a)) anios[a] = 1; });
  var R = "'" + VK_HOJA_RES + "'!";
  var filas = Object.keys(anios).sort().reverse().map(function (a) {
    var cr = '"* ' + a + '"', sumaF = function (c) { return 'SUMIF(' + R + cM + ':' + cM + ',' + cr + ',' + R + c + ':' + c + ')'; };
    var meses = 'COUNTIF(' + R + cM + ':' + cM + ',' + cr + ')';
    return [Number(a), '=' + meses, '=' + sumaF(cW), '=' + sumaF(cS), '=' + sumaF(cK), '=' + sumaF(cT), '=IFERROR(' + sumaF(cT) + '/' + meses + ',"")'];
  });
  var h = vdHoja_(VHI_HOJA_ANIO);
  var m = vdEscribir_(h, VHI_ENC_ANIO, filas, { vacioOk: true, clave: 'ESCR_COLS|' + VHI_HOJA_ANIO });
  ['WFS', 'SELLER', 'KILLERS', 'TOTAL', 'PROMEDIO MES'].forEach(function (x) { vdFormato_(h, m, x, filas.length, '$#,##0'); });
  try {
    h.getRange(1, escrCol_(m, 'AÑO') || 1).setNote('Suma los meses del Resumen venta y killers de cada año. TOTAL = WFS + SELLER + KILLERS del mes. WFS, SELLER y KILLERS solo suman los meses que traen ese dato (varios meses del archivo solo tienen el total). MESES = meses contados en el año: un año con pocos meses no es comparable con uno completo.');
    h.getRange(1, 1, 1, VHI_ENC_ANIO.length).setFontWeight('bold');
  } catch (e) {}
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);
}

/** Menu. */
function traerHistoricoSeptiembre() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(90000)) { dlgInfo_('Septiembre y meses', 'Otra corrida tiene el candado. Espera un minuto y vuelve a darle.', 'aviso'); return; }
  try {
    toast_('Trayendo septiembre y los meses del archivo...', 'HISTORICO', 60);
    var r = vdIntentar_(function () { return vhiEscribir_(); });
    var k = vdIntentar_(function () { return vkActualizar_(true); });
    var sep = null; VHI_MESES.forEach(function (x) { if (x[0] === VHI_MES_SEP) sep = x; });
    var cuadra = sep && Math.abs((r.t.wfs + r.t.seller + r.t.killers) - sep[4]) < 1;
    var txt = 'Ventas septiembre: ' + r.lineas + ' lineas (SELLER ' + r.t.nSeller + ' · WFS ' + r.t.nWfs + ')\n' +
      'SELLER $' + vhiMiles_(r.t.seller) + ' · WFS $' + vhiMiles_(r.t.wfs) + ' · killers $' + vhiMiles_(r.t.killers) + '\n' +
      (cuadra ? '✅ Cuadra con el total de septiembre del archivo ($' + vhiMiles_(sep[4]) + ')' : '⚠️ NO cuadra con el total del archivo') + '\n\n' +
      'Odoo septiembre: ' + r.odooLineas + ' lineas, $' + vhiMiles_(r.odooImporte) + '\n\n' +
      'Resumen venta y killers y Venta por año ya incluyen los meses del archivo.';
    logOk_(VHI_ETAPA, 'Septiembre traido: ' + r.lineas + ' lineas Walmart (SELLER ' + r.t.nSeller + ', WFS ' + r.t.nWfs + '), ' + r.odooLineas + ' lineas Odoo; ' + (cuadra ? 'cuadra' : 'NO cuadra') + ' con el archivo');
    flushLog_();
    dlgInfo_('Septiembre y meses del archivo', txt, cuadra ? 'ok' : 'aviso');
  } catch (e) {
    logErr_(VHI_ETAPA, 'No se pudo traer septiembre: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    dlgInfo_('Septiembre y meses', 'Fallo: ' + String(e.message).split('\n')[0], 'error');
  } finally { lock.releaseLock(); }
}
