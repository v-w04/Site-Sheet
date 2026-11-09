/**
 * ============================================================
 *  Ventas con killer — cuanto se obtiene por los killers, venta por venta
 * ============================================================
 *
 *  Cruza cada venta de Walmart (hoja "Ventas Walmart", del site) con el killer que estaba ACTIVO en el momento de esa
 *  venta (hoja "Killers historico"). Solo entran las ventas que tuvieron killer (los killers son -MSI: la clasica no
 *  entra). Todo se escribe como VALORES (datos de la venta, del killer y fechas), nada de formulas.
 *
 *  Que killer tenia una venta (SKU exacto de la publicacion):
 *    - Desde que hay FOTOS (Site Sheet guarda una foto completa cada vez que cambia la lista del site, "NOVIEMBRE 2026-1",
 *      "-2", "-3"...): vale la ultima foto tomada ANTES de la venta; el killer debe estar en esa foto y su rango
 *      (INICIO-FIN) debe cubrir la hora de la venta. Asi, si un KAM quita un killer antes de su fecha, ya no cuenta.
 *    - Antes de la primera foto (octubre, copiado de Venta Diaria): el rango INICIO-FIN que cubra la venta.
 *    - Si dos rangos cubren la venta, gana el que empezo mas tarde.
 *  Importes: CUPON TOTAL = cupon x piezas (lo que paga Walmart por el killer); NOS PAGAN TOTAL = (negociado + cupon) x piezas.
 *  PRECIO = NEGOCIADO dice si la venta salio al precio negociado (tolerancia $1). Las canceladas no entran.
 *
 *  Hojas:
 *    "Ventas killers mes en curso"  las del mes actual; se rehace cada hora (solo si cambio).
 *    "Ventas killers historico"     los meses cerrados (octubre en adelante). Al empezar un mes, el anterior se cierra y
 *                                   se agrega aqui como valores fijos. Se puede rehacer un mes con el menu.
 *    "Resumen venta y killers"      un renglon por mes: TODA la venta (WFS y SELLER), la venta con killer, el cupon de
 *                                   los killers y la venta total + cupon. La venta de cada mes sale de "Ventas Walmart".
 *  Un mes se cierra solo si la bajada completa de ventas ya termino y el historico de killers tiene rangos de ese mes.
 * ============================================================
 */

var VK_ETAPA = 'VENTAS_KILLERS';
var VK_HOJA_MES = 'Ventas killers mes en curso', VK_HOJA_HIST = 'Ventas killers historico', VK_HOJA_RES = 'Resumen venta y killers';
var VK_HOJA_RES_VIEJA = 'Ventas killers resumen';   // nombre anterior: se renombra sola
var VK_PROP_CERRADOS = 'VK_MESES_CERRADOS';
var VK_ENC = ['MES', 'FECHA VENTA', 'FOLIO', 'ORDEN ID', 'REFERENCIA', 'SKU', 'PRODUCTO', 'PIEZAS', 'PRECIO VENTA', 'VENTA TOTAL',
              'ESTATUS', 'CANAL VENTA', 'KILLER CARGA', 'KILLER INICIO', 'KILLER FIN', 'PRECIO NEGOCIADO', 'CUPON', 'NOS PAGAN',
              'CUPON TOTAL', 'NOS PAGAN TOTAL', 'PRECIO = NEGOCIADO', 'CUPON ACUM', 'KILLER POR', 'NOTA'];
/* Igual que la hoja "WALMART Diario" de Ventas WALMART 2026, en corto:
   WFS = venta WFS del mes · SELLER = venta SELLER del mes · KILLERS = la suma de los cupones de killer que se dieron
   (a cada venta que entro con killer se le asigna su cupon x piezas) · TOTAL = WFS + SELLER + KILLERS.
   El detalle venta por venta esta en "Ventas killers mes en curso" / "Ventas killers historico". */
var VK_ENC_RES = ['MES', 'WFS', 'SELLER', 'KILLERS', 'TOTAL', 'DIARIO', 'ESTADO', 'ACTUALIZADO'];

function vkMes_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM'); }
function vkNombreMes_(mes) { return PE_MESES[Number(mes.slice(5, 7)) - 1] + ' ' + mes.slice(0, 4); }
/** La hoja convierte "OCTUBRE 2026" en fecha: se lee de vuelta como texto. */
function vkMesTexto_(v) { return v instanceof Date ? vkNombreMes_(vkMes_(v)) : String(v || '').trim().toUpperCase(); }
function vkMs_(d) { return d instanceof Date ? d.getTime() : NaN; }

/* ---------------- fuentes ---------------- */

/** Killers historico -> { porSku:{SKU:[rango]}, fotos:[{t, carga, llaves:{}}] (ordenadas) }. */
function vkKillers_() {
  var out = { porSku: {}, fotos: [] }, t = peTabla_(PE_HOJA_KH);
  if (!t) return out;
  var c = function (n) { return peCol_(t, [n]); };
  var iS = c('SKU'), iN = c('PRECIO NEGOCIADO'), iC = c('CUPON'), iI = c('INICIO'), iF = c('FIN'), iCa = c('CARGA'), iFo = c('FOTO'), iR = c('RECIBIMOS');
  if (iS < 0 || iN < 0) return out;
  var vistos = {}, fotos = {};
  t.filas.forEach(function (f) {
    var sku = peSku_(f[iS]), neg = peNum_(f[iN]);
    if (!sku || !(neg > 0)) return;
    var cup = iC < 0 ? 0 : peNum_(f[iC]), ini = iI < 0 ? '' : peFecha_(f[iI]), fin = iF < 0 ? '' : peFecha_(f[iF]);
    var ll = peLlaveK_(sku, neg, cup, ini, fin), carga = iCa < 0 ? '' : String(f[iCa] || '');
    var fo = iFo < 0 ? '' : peFecha_(f[iFo]);
    if (fo instanceof Date) {
      var kf = fo.getTime();
      (fotos[kf] = fotos[kf] || { t: kf, carga: carga, llaves: {} }).llaves[ll] = true;
    }
    if (vistos[ll]) return;                                       // el mismo rango en varias fotos: una sola vez (con su primera carga)
    vistos[ll] = true;
    var rec = iR < 0 ? 0 : peNum_(f[iR]);
    (out.porSku[sku] = out.porSku[sku] || []).push({ llave: ll, neg: neg, cup: cup, rec: rec > 0 ? rec : neg + cup, ini: ini, fin: fin, carga: carga });
  });
  out.fotos = Object.keys(fotos).map(function (k) { return fotos[k]; }).sort(function (a, b) { return a.t - b.t; });
  return out;
}

/** Ventas Walmart como objetos { fecha(Date), folio, orden, ref, sku, producto, piezas, precio, estatus, cancelada, items }. */
function vkVentas_() {
  var out = [], t = peTabla_(VH_HOJA);
  if (!t) return out;
  var c = function (n) { return peCol_(t, [n]); };
  var iF = c('FECHA'), iFo = c('FOLIO'), iO = c('ORDEN ID'), iR = c('REFERENCIA'), iS = c('SKU'), iP = c('PRODUCTO'), iQ = c('PIEZAS'), iPr = c('PRECIO'), iE = c('ESTATUS'), iEn = c('ESTADO NORM'), iIt = c('ITEMS'), iFu = c('FULFILLMENT');
  if (iF < 0 || iS < 0 || iPr < 0) return out;
  var v = function (f, i) { return i < 0 ? '' : f[i]; };
  t.filas.forEach(function (f) {
    var d = peFecha_(f[iF]); if (!(d instanceof Date)) return;
    var est = String(v(f, iE) || ''), en = String(v(f, iEn) || '');
    out.push({ fecha: d, folio: v(f, iFo), orden: v(f, iO), ref: v(f, iR), sku: peSku_(f[iS]), producto: v(f, iP), piezas: Math.max(peNum_(v(f, iQ)) || 1, 1),
      precio: peNum_(f[iPr]), estatus: est || en, cancelada: /CANCEL/i.test(est + ' ' + en), items: Number(v(f, iIt)) || 1,
      canal: /fulfil|wfs/i.test(String(v(f, iFu))) ? 'WFS' : (v(f, iFu) ? 'SELLER' : '') });
  });
  return out;
}

/* ---------------- la regla (pura) ---------------- */

/** Killer de una venta: { r:rango, como } o null. kil = vkKillers_(). */
function vkKillerDe_(kil, sku, t) {
  var rangos = kil.porSku[sku];
  if (!rangos) return null;
  var cubre = rangos.filter(function (r) { return (!(r.ini instanceof Date) || vkMs_(r.ini) <= t) && (!(r.fin instanceof Date) || vkMs_(r.fin) >= t); });
  if (!cubre.length) return null;
  var foto = null;
  for (var i = kil.fotos.length - 1; i >= 0; i--) { if (kil.fotos[i].t <= t) { foto = kil.fotos[i]; break; } }
  var como = 'RANGO';   // antes de la primera foto
  if (foto) {
    cubre = cubre.filter(function (r) { return foto.llaves[r.llave]; });
    if (!cubre.length) return null;                               // estaba en un rango, pero ya no venia en la foto activa: lo quitaron
    como = foto.carga;
  }
  cubre.sort(function (a, b) { return (vkMs_(b.ini) || 0) - (vkMs_(a.ini) || 0); });
  return { r: cubre[0], como: como };
}

/** Precio unitario de la venta segun PE_PRECIO_MODO (auto: el que coincide con el negociado). */
function vkUnitario_(v, neg, modo) {
  var total = v.precio / v.piezas;
  if (modo === 'total') return total;
  if (modo === 'unitario' || v.piezas === 1) return v.precio;
  if (Math.abs(v.precio - neg) <= 1) return v.precio;
  if (Math.abs(total - neg) <= 1) return total;
  return v.precio;
}

/**
 * Filas (orden VK_ENC) de un mes ('yyyy-MM'). Devuelve { filas, res:{ventas, piezas, venta, cupon, nos, aNeg, cupNeg, canceladas} }.
 */
function vkFilasMes_(mes, ventas, kil, modo) {
  var filas = [], res = { ventas: 0, piezas: 0, venta: 0, cupon: 0, nos: 0, aNeg: 0, cupNeg: 0, canceladas: 0, cupWfs: 0, cupSeller: 0 }, acum = 0;
  ventas.filter(function (v) { return vkMes_(v.fecha) === mes; })
    .sort(function (a, b) { return a.fecha - b.fecha; })
    .forEach(function (v) {
      var k = vkKillerDe_(kil, v.sku, v.fecha.getTime());
      if (!k) return;
      if (v.cancelada) { res.canceladas++; return; }
      var r = k.r, unit = vkUnitario_(v, r.neg, modo), q = v.piezas;
      var cupT = r.cup * q, nosT = r.rec * q, ventaT = unit * q, coincide = Math.abs(unit - r.neg) <= 1;
      acum += cupT;
      res.ventas++; res.piezas += q; res.venta += ventaT; res.cupon += cupT; res.nos += nosT;
      if (coincide) { res.aNeg++; res.cupNeg += cupT; }
      if (v.canal === 'WFS') res.cupWfs += cupT; else res.cupSeller += cupT;
      filas.push([vkNombreMes_(mes), v.fecha, v.folio, v.orden, v.ref, v.sku, v.producto, q, unit, ventaT, v.estatus, v.canal,
        r.carga, r.ini, r.fin, r.neg, r.cup, r.rec, cupT, nosT, coincide ? 'SI' : 'NO', acum, k.como,
        v.items > 1 ? 'Varios productos' : (coincide ? '' : 'Otro precio')]);
    });
  return { filas: filas, res: res };
}

/** Venta de TODO el mes (canceladas fuera): { ventas, piezas, venta, wfs, seller }. Importe = precio del site (total de la orden). */
function vkVentaMes_(mes, ventas, modo) {
  var x = { ventas: 0, piezas: 0, venta: 0, wfs: 0, seller: 0 };
  ventas.forEach(function (v) {
    if (v.cancelada || vkMes_(v.fecha) !== mes) return;
    var imp = modo === 'unitario' ? v.precio * v.piezas : v.precio;
    x.ventas++; x.piezas += v.piezas; x.venta += imp;
    if (v.canal === 'WFS') x.wfs += imp; else x.seller += imp;
  });
  return x;
}

/* ---------------- escritura ---------------- */

function vkFormatos_(h, m, n) {
  ['FECHA VENTA', 'KILLER INICIO', 'KILLER FIN'].forEach(function (x) { vdFormato_(h, m, x, n, 'dd/MM/yyyy HH:mm'); });
  ['PRECIO VENTA', 'VENTA TOTAL', 'PRECIO NEGOCIADO', 'CUPON', 'NOS PAGAN', 'CUPON TOTAL', 'NOS PAGAN TOTAL', 'CUPON ACUM'].forEach(function (x) { vdFormato_(h, m, x, n, '$#,##0.00'); });
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);
}

function vkCerrados_() { try { return JSON.parse(vdProp_(VK_PROP_CERRADOS) || '{}'); } catch (e) { return {}; } }

/** ¿Ya se puede cerrar el mes? La bajada completa de ventas termino y hay killers de ese mes. */
function vkPuedeCerrar_(mes, kil) {
  var p = props_();
  if (!p.getProperty(VH_PROP_BARRIDO) || p.getProperty(VH_PROP_MODO) === 'completo') return 'la bajada completa de ventas Walmart no ha terminado';
  var ini = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1).getTime(), fin = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1).getTime();
  var hay = Object.keys(kil.porSku).some(function (s) { return kil.porSku[s].some(function (r) { return vkMs_(r.ini) < fin && vkMs_(r.fin) >= ini; }); });
  return hay ? '' : 'Killers historico no tiene killers de ' + vkNombreMes_(mes) + ' (corre "Traer TODO de Venta Diaria")';
}

/** Reescribe el historico con los meses que ya tenia menos `quitar` mas `filas`. */
function vkGuardarEnHistorico_(quitarMes, filas) {
  var h = vdHoja_(VK_HOJA_HIST), t = peTabla_(VK_HOJA_HIST), previas = [];
  if (t) {
    var idx = VK_ENC.map(function (e) { return peCol_(t, [e]); }), iM = peCol_(t, ['MES']);
    t.filas.forEach(function (f) {
      if (iM < 0 || f[iM] === '' || vkMesTexto_(f[iM]) === quitarMes) return;
      previas.push(idx.map(function (i, k) { return i < 0 ? '' : (VK_ENC[k] === 'MES' ? vkMesTexto_(f[i]) : f[i]); }));
    });
  }
  var todas = previas.concat(filas);
  var m = vdEscribir_(h, VK_ENC, todas, { vacioOk: true, clave: 'ESCR_COLS|' + VK_HOJA_HIST, texto: ['MES'] });
  vkFormatos_(h, m, todas.length);
}

/** Resumen por mes (el mas nuevo arriba): WFS, SELLER, KILLERS (suma de cupones) y TOTAL. */
function vkResumen_(resMes, mesActual, ventas, modo) {
  var cup = {}, cerrados = vkCerrados_();
  var t = peTabla_(VK_HOJA_HIST);
  if (t) {
    var iM = peCol_(t, ['MES']), iC = peCol_(t, ['CUPON TOTAL']);
    t.filas.forEach(function (f) { var mes = vkMesTexto_(f[iM]); if (mes) cup[mes] = (cup[mes] || 0) + peNum_(f[iC]); });
  }
  var meses = {};
  Object.keys(cerrados).forEach(function (m) { meses[m] = 'CERRADO'; });
  meses[mesActual] = 'EN CURSO';
  var hoy = new Date();
  var filas = Object.keys(meses).sort().reverse().map(function (mes) {
    var enCurso = meses[mes] === 'EN CURSO', n = vkNombreMes_(mes);
    var tv = vkVentaMes_(mes, ventas, modo), killers = enCurso ? resMes.res.cupon : (cup[n] || 0), total = tv.wfs + tv.seller + killers;
    var dias = enCurso ? hoy.getDate() : new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
    return [n, tv.wfs, tv.seller, killers, total, dias ? total / dias : '', meses[mes], enCurso ? new Date() : (cerrados[mes] || {}).cerrado || ''];
  });
  filas = filas.concat(vhiFilasResumen_(meses));   // meses del archivo "Ventas WALMART 2026" (VentaHistorica.gs); los que el site ya calcula no se pisan
  var ss = vdLibro_();
  // Hoja nueva y limpia cuando cambia el formato (asi no quedan columnas vacias del formato anterior).
  if (vdProp_('VK_RES_FORMATO') !== '3') {
    [VK_HOJA_RES, VK_HOJA_RES_VIEJA].forEach(function (nm) { var hv = ss.getSheetByName(nm); if (hv) kdReintentar_(function () { ss.deleteSheet(hv); }); });
    vdSetProp_('ESCR_COLS|' + VK_HOJA_RES, '');
    vdSetProp_('VK_RES_FORMATO', '3');
  }
  var h = vdHoja_(VK_HOJA_RES);
  var m = vdEscribir_(h, VK_ENC_RES, filas, { vacioOk: true, clave: 'ESCR_COLS|' + VK_HOJA_RES, texto: ['MES'] });
  ['WFS', 'SELLER', 'KILLERS', 'TOTAL', 'DIARIO'].forEach(function (x) { vdFormato_(h, m, x, filas.length, '$#,##0'); });
  vdFormato_(h, m, 'ACTUALIZADO', filas.length, 'dd/MM/yyyy HH:mm');
  try {
    h.getRange(1, 1, 1, VK_ENC_RES.length).setFontWeight('bold');
    var c = escrCol_(m, 'TOTAL'); if (c && filas.length) h.getRange(2, c, filas.length, 1).setFontWeight('bold');
    h.getRange(1, escrCol_(m, 'MES') || 1).setNote('WFS = venta WFS del mes · SELLER = venta SELLER · KILLERS = suma de los cupones de killer de las ventas que entraron con killer (cupon x piezas) · TOTAL = WFS + SELLER + KILLERS · DIARIO = TOTAL entre los dias del mes (el mes en curso, entre los dias que van). Las canceladas no cuentan. Detalle: Ventas killers mes en curso / historico.');
  } catch (e) {}
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);
  try { vhiAnio_(); } catch (e) { avisoDia_('vhi-anio:' + String(e.message).slice(0, 60), 'WARN', VK_ETAPA, 'No se pudo rehacer Venta por año: ' + String(e.message).split('\n')[0]); }
}

/**
 * Cierra los meses pasados que falten, rehace el mes en curso (si cambio) y el resumen.
 * Devuelve { mes, res, cerrados:[...], pendientes:[...], cambio }.
 */
function vkActualizar_(forzar) {
  var kil = vkKillers_(), ventas = vkVentas_(), modo = peModo_(), hoy = new Date(), mesActual = vkMes_(hoy);
  var out = { mes: mesActual, cerrados: [], pendientes: [], cambio: false };
  var cerrados = vkCerrados_(), desde = String(vhDesde_()).slice(0, 7);
  var meses = {};
  ventas.forEach(function (v) { var m = vkMes_(v.fecha); if (m >= desde && m < mesActual) meses[m] = 1; });
  Object.keys(meses).sort().forEach(function (mes) {
    if (cerrados[mes]) return;
    var porQue = vkPuedeCerrar_(mes, kil);
    if (porQue) { out.pendientes.push(vkNombreMes_(mes) + ': ' + porQue); return; }
    var r = vkFilasMes_(mes, ventas, kil, modo);
    vkGuardarEnHistorico_(vkNombreMes_(mes), r.filas);
    cerrados[mes] = { cerrado: ahora_(), ventas: r.res.ventas, cupon: Math.round(r.res.cupon * 100) / 100, canceladas: r.res.canceladas };
    vdSetProp_(VK_PROP_CERRADOS, JSON.stringify(cerrados));
    out.cerrados.push(vkNombreMes_(mes) + ': ' + r.res.ventas + ' ventas, cupon $' + Math.round(r.res.cupon));
    logOk_(VK_ETAPA, 'Mes cerrado en Ventas killers historico: ' + vkNombreMes_(mes), r.res);
  });
  var rm = vkFilasMes_(mesActual, ventas, kil, modo);
  out.res = rm.res;
  out.tv = vkVentaMes_(mesActual, ventas, modo);
  var huella = sha256_(JSON.stringify([rm.filas, Object.keys(cerrados), vkVentaMes_(mesActual, ventas, modo)]));
  var h0 = vdLibro_().getSheetByName(VK_HOJA_MES);
  var VK_VERSION = '6';   // sube cuando cambia el formato del resumen: la siguiente corrida lo rehace aunque los datos sean iguales
  if (forzar || out.cerrados.length || !h0 || vdProp_('VK_HUELLA') !== huella || vdProp_('VK_VERSION') !== VK_VERSION) {
    var h = vdHoja_(VK_HOJA_MES);
    var m = vdEscribir_(h, VK_ENC, rm.filas, { vacioOk: true, clave: 'ESCR_COLS|' + VK_HOJA_MES, texto: ['MES'] });
    vkFormatos_(h, m, rm.filas.length);
    vkResumen_(rm, mesActual, ventas, modo);
    vdSetProp_('VK_HUELLA', huella);
    vdSetProp_('VK_VERSION', VK_VERSION);
    out.cambio = true;
    logOk_(VK_ETAPA, 'Ventas con killer de ' + vkNombreMes_(mesActual) + ': ' + rm.res.ventas + ' ventas, cupon $' + Math.round(rm.res.cupon), rm.res);
  } else vdLatido_(VK_ETAPA, 'Ventas con killer al dia (sin cambios)');
  if (out.pendientes.length) avisoDia_('vk-pend:' + out.pendientes.join('|').slice(0, 80), 'WARN', VK_ETAPA, 'Meses sin cerrar: ' + out.pendientes.join(' · '));
  return out;
}

/* ---------------- menu y trigger ---------------- */

/** Cada hora (ventasProgramado), despues de bajar ventas y revisar precios. */
function vkProgramado_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(VD_LOCK_MS)) { avisoDia_('vk-ocupado', 'INFO', VK_ETAPA, 'Ventas con killer saltada: otra corrida tenia el candado.'); return; }
  try { vdIntentar_(function () { return vkActualizar_(false); }); }
  catch (e) { var msg = String(e.message).split('\n')[0].substring(0, 160); avisoDia_('vk-error:' + msg, 'WARN', VK_ETAPA, 'No se pudo armar Ventas con killer: ' + msg); }
  finally { try { flushLog_(); } catch (x) {} lock.releaseLock(); }
}

function vkTexto_(r, tv) {
  var d = function (n) { return '$' + Math.round(n || 0).toLocaleString('es-MX'); };
  var t = tv ? '• WFS: ' + d(tv.wfs) + '\n• SELLER: ' + d(tv.seller) + '\n' : '';
  return t + '• KILLERS: ' + d(r.cupon) + ' (cupones de ' + r.ventas + ' ventas que entraron con killer)' +
    (tv ? '\n• TOTAL: ' + d(tv.wfs + tv.seller + r.cupon) : '') + (r.canceladas ? '\n\nCanceladas con killer (no cuentan): ' + r.canceladas : '');
}

/** Menu: actualiza ya (cierra meses pendientes, rehace el mes en curso y el resumen). */
function ventasKillersActualizar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(90000)) { dlgInfo_('Ventas con killer', 'Otra corrida tiene el candado. Espera un minuto y vuelve a darle.', 'aviso'); return; }
  try {
    toast_('Cruzando ventas con killers...', 'VENTAS CON KILLER', 60);
    var r = vdIntentar_(function () { return vkActualizar_(true); });
    flushLog_();
    dlgInfo_('Venta total y killers', vkNombreMes_(r.mes) + ' (en curso)\n\n' + vkTexto_(r.res, r.tv) + '\n\nTodos los meses: hoja "' + VK_HOJA_RES + '".' +
      (r.cerrados.length ? '\n\nMeses cerrados ahora (en Ventas killers historico):\n• ' + r.cerrados.join('\n• ') : '') +
      (r.pendientes.length ? '\n\n⚠ Sin cerrar todavia:\n• ' + r.pendientes.join('\n• ') : ''), r.pendientes.length ? 'aviso' : 'ok');
  } catch (e) {
    logErr_(VK_ETAPA, 'No se pudo armar Ventas con killer: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    dlgInfo_('Ventas con killer', 'Fallo: ' + String(e.message).split('\n')[0], 'error');
  } finally { lock.releaseLock(); }
}

/** Menu: rehace un mes ya cerrado (botones con los meses cerrados). */
function ventasKillersRehacerMes() {
  var meses = Object.keys(vkCerrados_()).sort().reverse().slice(0, 6);
  if (!meses.length) { dlgInfo_('Rehacer un mes', 'Todavia no hay meses cerrados en Ventas killers historico.', 'aviso'); return; }
  dlgOpciones_({ titulo: 'Rehacer un mes cerrado', manejador: 'vkRehacerForm',
    texto: 'Vuelve a cruzar las ventas de ese mes con los killers y reemplaza SOLO ese mes en "Ventas killers historico".\nSirve si se agregaron ventas o killers de ese mes despues de cerrarlo.',
    botones: meses.map(function (m, i) { return { id: m, texto: vkNombreMes_(m), tipo: i === 0 ? 'p' : '' }; }) });
}

/** Lo llama el formulario (DLG_PERMITIDOS). */
function vkRehacerForm(p) {
  var mes = String(p && p.boton || '');
  var cerrados = vkCerrados_();
  if (!/^\d{4}-\d{2}$/.test(mes) || !cerrados[mes]) return { ok: false, lineas: ['Mes no valido.'] };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(90000)) return { ok: false, lineas: ['Otra corrida tiene el candado. Intenta en un minuto.'] };
  try {
    var r = vkFilasMes_(mes, vkVentas_(), vkKillers_(), peModo_());
    vkGuardarEnHistorico_(vkNombreMes_(mes), r.filas);
    cerrados[mes] = { cerrado: ahora_(), ventas: r.res.ventas, cupon: Math.round(r.res.cupon * 100) / 100, canceladas: r.res.canceladas };
    vdSetProp_(VK_PROP_CERRADOS, JSON.stringify(cerrados));
    vdSetProp_('VK_HUELLA', '');
    vkActualizar_(true);
    logOk_(VK_ETAPA, 'Mes rehecho: ' + vkNombreMes_(mes), r.res);
    return { ok: true, lineas: [vkNombreMes_(mes) + ' rehecho: ' + vkTexto_(r.res).replace(/\n• /g, ' · ')] };
  } catch (e) {
    logErr_(VK_ETAPA, 'No se pudo rehacer el mes: ' + String(e.message).split('\n')[0]);
    return { ok: false, lineas: ['No se pudo: ' + String(e.message).split('\n')[0]] };
  } finally { lock.releaseLock(); }
}
