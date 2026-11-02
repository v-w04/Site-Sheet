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
 *    "Ventas killers resumen"       un renglon por mes: ventas, piezas, venta, cupon y nos pagan.
 *  Un mes se cierra solo si la bajada completa de ventas ya termino y el historico de killers tiene rangos de ese mes.
 * ============================================================
 */

var VK_ETAPA = 'VENTAS_KILLERS';
var VK_HOJA_MES = 'Ventas killers mes en curso', VK_HOJA_HIST = 'Ventas killers historico', VK_HOJA_RES = 'Ventas killers resumen';
var VK_PROP_CERRADOS = 'VK_MESES_CERRADOS';
var VK_ENC = ['MES', 'FECHA VENTA', 'FOLIO', 'ORDEN ID', 'REFERENCIA', 'SKU', 'PRODUCTO', 'PIEZAS', 'PRECIO VENTA', 'VENTA TOTAL',
              'ESTATUS', 'KILLER CARGA', 'KILLER INICIO', 'KILLER FIN', 'PRECIO NEGOCIADO', 'CUPON', 'NOS PAGAN',
              'CUPON TOTAL', 'NOS PAGAN TOTAL', 'PRECIO = NEGOCIADO', 'CUPON ACUMULADO DEL MES', 'COMO SE UBICO EL KILLER', 'NOTA'];
var VK_ENC_RES = ['MES', 'ESTADO', 'VENTAS CON KILLER', 'PIEZAS', 'VENTA TOTAL', 'CUPON TOTAL', 'NOS PAGAN TOTAL',
                  'VENTAS A PRECIO NEGOCIADO', 'CUPON A PRECIO NEGOCIADO', 'CANCELADAS (no cuentan)', 'ACTUALIZADO'];

function vkMes_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM'); }
function vkNombreMes_(mes) { return PE_MESES[Number(mes.slice(5, 7)) - 1] + ' ' + mes.slice(0, 4); }
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
  var iF = c('FECHA'), iFo = c('FOLIO'), iO = c('ORDEN ID'), iR = c('REFERENCIA'), iS = c('SKU'), iP = c('PRODUCTO'), iQ = c('PIEZAS'), iPr = c('PRECIO'), iE = c('ESTATUS'), iEn = c('ESTADO NORM'), iIt = c('ITEMS');
  if (iF < 0 || iS < 0 || iPr < 0) return out;
  var v = function (f, i) { return i < 0 ? '' : f[i]; };
  t.filas.forEach(function (f) {
    var d = peFecha_(f[iF]); if (!(d instanceof Date)) return;
    var est = String(v(f, iE) || ''), en = String(v(f, iEn) || '');
    out.push({ fecha: d, folio: v(f, iFo), orden: v(f, iO), ref: v(f, iR), sku: peSku_(f[iS]), producto: v(f, iP), piezas: Math.max(peNum_(v(f, iQ)) || 1, 1),
      precio: peNum_(f[iPr]), estatus: est || en, cancelada: /CANCEL/i.test(est + ' ' + en), items: Number(v(f, iIt)) || 1 });
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
  var como = 'RANGO (antes de la primera foto)';
  if (foto) {
    cubre = cubre.filter(function (r) { return foto.llaves[r.llave]; });
    if (!cubre.length) return null;                               // estaba en un rango, pero ya no venia en la foto activa: lo quitaron
    como = 'FOTO ' + foto.carga;
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
  var filas = [], res = { ventas: 0, piezas: 0, venta: 0, cupon: 0, nos: 0, aNeg: 0, cupNeg: 0, canceladas: 0 }, acum = 0;
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
      filas.push([vkNombreMes_(mes), v.fecha, v.folio, v.orden, v.ref, v.sku, v.producto, q, unit, ventaT, v.estatus,
        r.carga, r.ini, r.fin, r.neg, r.cup, r.rec, cupT, nosT, coincide ? 'SI' : 'NO', acum, k.como,
        v.items > 1 ? 'La orden trae varios productos: revisar el precio' : (coincide ? '' : 'Se vendio a otro precio que el negociado')]);
    });
  return { filas: filas, res: res };
}

/* ---------------- escritura ---------------- */

function vkFormatos_(h, m, n) {
  ['FECHA VENTA', 'KILLER INICIO', 'KILLER FIN'].forEach(function (x) { vdFormato_(h, m, x, n, 'dd/MM/yyyy HH:mm'); });
  ['PRECIO VENTA', 'VENTA TOTAL', 'PRECIO NEGOCIADO', 'CUPON', 'NOS PAGAN', 'CUPON TOTAL', 'NOS PAGAN TOTAL', 'CUPON ACUMULADO DEL MES'].forEach(function (x) { vdFormato_(h, m, x, n, '$#,##0.00'); });
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
  var h = getHoja_(VK_HOJA_HIST), t = peTabla_(VK_HOJA_HIST), previas = [];
  if (t) {
    var idx = VK_ENC.map(function (e) { return peCol_(t, [e]); }), iM = peCol_(t, ['MES']);
    t.filas.forEach(function (f) {
      if (iM < 0 || f[iM] === '' || String(f[iM]) === quitarMes) return;
      previas.push(idx.map(function (i) { return i < 0 ? '' : f[i]; }));
    });
  }
  var todas = previas.concat(filas);
  var m = reescribirHoja_(h, VK_ENC, todas, { vacioOk: true, clave: 'ESCR_COLS|' + VK_HOJA_HIST });
  vkFormatos_(h, m, todas.length);
}

/** Resumen por mes: meses cerrados (del historico) + mes en curso. */
function vkResumen_(resMes, mesActual) {
  var por = {}, cerrados = vkCerrados_();
  var t = peTabla_(VK_HOJA_HIST);
  if (t) {
    var g = function (n) { return peCol_(t, [n]); }, iM = g('MES'), iQ = g('PIEZAS'), iV = g('VENTA TOTAL'), iC = g('CUPON TOTAL'), iN = g('NOS PAGAN TOTAL'), iP = g('PRECIO = NEGOCIADO');
    t.filas.forEach(function (f) {
      var mes = String(f[iM] || ''); if (!mes) return;
      var x = por[mes] = por[mes] || { ventas: 0, piezas: 0, venta: 0, cupon: 0, nos: 0, aNeg: 0, cupNeg: 0, canceladas: '' };
      x.ventas++; x.piezas += peNum_(f[iQ]); x.venta += peNum_(f[iV]); x.cupon += peNum_(f[iC]); x.nos += peNum_(f[iN]);
      if (String(f[iP]) === 'SI') { x.aNeg++; x.cupNeg += peNum_(f[iC]); }
    });
  }
  Object.keys(cerrados).forEach(function (mes) { var n = vkNombreMes_(mes); if (por[n]) por[n].canceladas = cerrados[mes].canceladas || 0; });
  var filas = Object.keys(por).map(function (n) { var x = por[n]; return [n, 'CERRADO', x.ventas, x.piezas, x.venta, x.cupon, x.nos, x.aNeg, x.cupNeg, x.canceladas, '']; });
  var r = resMes.res;
  filas.push([vkNombreMes_(mesActual), 'EN CURSO', r.ventas, r.piezas, r.venta, r.cupon, r.nos, r.aNeg, r.cupNeg, r.canceladas, new Date()]);
  var orden = function (n) { var p = String(n).split(' '); return p[1] + '-' + ('0' + (PE_MESES.indexOf(p[0]) + 1)).slice(-2); };
  filas.sort(function (a, b) { return orden(a[0]) < orden(b[0]) ? -1 : 1; });   // col-fija: fila armada aqui en el orden de VK_ENC_RES
  var h = getHoja_(VK_HOJA_RES);
  var m = reescribirHoja_(h, VK_ENC_RES, filas, { vacioOk: true, clave: 'ESCR_COLS|' + VK_HOJA_RES });
  ['VENTA TOTAL', 'CUPON TOTAL', 'NOS PAGAN TOTAL', 'CUPON A PRECIO NEGOCIADO'].forEach(function (x) { vdFormato_(h, m, x, filas.length, '$#,##0.00'); });
  vdFormato_(h, m, 'ACTUALIZADO', filas.length, 'dd/MM/yyyy HH:mm');
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);
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
  var huella = sha256_(JSON.stringify([rm.filas, Object.keys(cerrados)]));
  var h0 = getSpreadsheet_().getSheetByName(VK_HOJA_MES);
  if (forzar || out.cerrados.length || !h0 || vdProp_('VK_HUELLA') !== huella) {
    var h = getHoja_(VK_HOJA_MES);
    var m = reescribirHoja_(h, VK_ENC, rm.filas, { vacioOk: true, clave: 'ESCR_COLS|' + VK_HOJA_MES });
    vkFormatos_(h, m, rm.filas.length);
    vkResumen_(rm, mesActual);
    vdSetProp_('VK_HUELLA', huella);
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
  try { vkActualizar_(false); }
  catch (e) { var msg = String(e.message).split('\n')[0].substring(0, 160); avisoDia_('vk-error:' + msg, 'WARN', VK_ETAPA, 'No se pudo armar Ventas con killer: ' + msg); }
  finally { try { flushLog_(); } catch (x) {} lock.releaseLock(); }
}

function vkTexto_(r) {
  var d = function (n) { return '$' + Math.round(n).toLocaleString('es-MX'); };
  return 'Ventas con killer: ' + r.ventas + ' (' + r.piezas + ' piezas)\n• Venta: ' + d(r.venta) + '\n• Cupon de killers: ' + d(r.cupon) +
    '\n• Nos pagan (negociado + cupon): ' + d(r.nos) + '\n• A precio negociado: ' + r.aNeg + ' ventas, cupon ' + d(r.cupNeg) + (r.canceladas ? '\n• Canceladas (no cuentan): ' + r.canceladas : '');
}

/** Menu: actualiza ya (cierra meses pendientes, rehace el mes en curso y el resumen). */
function ventasKillersActualizar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(90000)) { dlgInfo_('Ventas con killer', 'Otra corrida tiene el candado. Espera un minuto y vuelve a darle.', 'aviso'); return; }
  try {
    toast_('Cruzando ventas con killers...', 'VENTAS CON KILLER', 60);
    var r = vkActualizar_(true);
    flushLog_();
    dlgInfo_('Ventas con killer', vkNombreMes_(r.mes) + ' (en curso)\n\n' + vkTexto_(r.res) +
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
