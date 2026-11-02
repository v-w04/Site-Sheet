/**
 * ============================================================
 *  Precios erroneos — ventas de Walmart vendidas por debajo del minimo
 * ============================================================
 *
 *  Revisa las ventas de la hoja "Ventas Walmart" (site) desde PE_DESDE (1-nov-2026; Script Property PE_DESDE)
 *  contra el MINIMO de las hojas Precios EM Minimo / Precios CVA Minimo (Walmart Clasica o Premium segun el SKU).
 *  Escribe el resultado en columnas del script dentro de Ventas Walmart y, si quedo bajo el minimo, una fila en
 *  "Alertas de precio" (historico, solo crece, sin correos).
 *
 *  Regla (la de Venta Diaria Odoo): alerta cuando el precio unitario queda por debajo del minimo, salvo:
 *    - killer de ese SKU, a ese precio, vigente el dia de la venta (hoja "Killers historico")
 *    - killer que esta en "Killers bajo minimo" con perdida del tope (3%) o menos
 *    - SKU en la hoja "Precio libre" (se vende mas barato a proposito)
 *    - SKU asignado a otro: vale el minimo mas bajo del grupo ("SKU asignados")
 *  Nunca alertan: prefijos RES- / WL- / OB-, ventas con precio menor a $50, SKU sin minimo.
 *
 *  PRECIO: el site manda el TOTAL de la orden (confirmado con ventas reales el 2-nov): unitario = precio / piezas.
 *  Script Property PE_PRECIO_MODO = unitario | auto cambia esa lectura si algun dia el site cambia.
 */

var PE_ETAPA = 'PRECIOS_ERR';
var PE_DESDE_DEFECTO = '2026-11-01';
var PE_TOLERANCIA = 0.01;
var PE_PRECIO_MIN_COMERCIAL = 50;
var PE_PREFIJOS_IGNORADOS = ['RES-', 'WL-', 'OB-'];
var PE_HOJA_ALERTAS = 'Alertas de precio', PE_HOJA_LIBRE = 'Precio libre', PE_HOJA_ASIG = 'SKU asignados', PE_HOJA_KH = 'Killers historico';
var PE_HOJAS_MINIMO = ['Precios EM Minimo', 'Precios CVA Minimo'];
var PE_HOJA_BAJO = 'Killers bajo minimo', PE_HOJA_KILLERS = 'Killers';

var PE_ENC_ANALISIS = ['MINIMO APLICADO', 'DIFERENCIA $', 'DIFERENCIA %', 'SEMAFORO', 'NOTAS PRECIO', 'REVISADO PRECIO'];
var PE_ENC_ALERTAS = ['FECHA ALERTA', 'FOLIO', 'CLIENTE', 'VENDEDOR', 'SKU', 'CANTIDAD', 'PRECIO VENTA', 'MINIMO', 'DIFERENCIA', 'DIFERENCIA %', 'FECHA VENTA', 'NOTAS', 'ORIGEN DATO'];
var PE_ENC_LIBRE = ['SKU', 'MOTIVO', 'HASTA (opcional)'];
var PE_ENC_ASIG = ['SKU PRINCIPAL', 'ASIGNADO 1', 'ASIGNADO 2', 'ASIGNADO 3', 'ASIGNADO 4', 'ASIGNADO 5'];
var PE_ENC_KH = ['SKU', 'SKU GENERAL', 'PRECIO NEGOCIADO', 'CUPON', 'INICIO', 'FIN', 'CARGA', 'CARGA #', 'FOTO', 'ORIGEN', 'REGISTRADO',
                 'DETALLES', 'PRECIO ACTUAL', 'RECIBIMOS', 'COMISION CUPON', 'COMISION MSI', 'SOLO WFS', 'OBSERVACIONES'];

/* ---------------- SKU y numeros ---------------- */

function peSku_(s) { return String(s === null || s === undefined ? '' : s).trim().toUpperCase(); }
function peNum_(v) { if (typeof v === 'number') return v; var n = Number(String(v === null || v === undefined ? '' : v).replace(/[$,%\s]/g, '')); return isNaN(n) ? 0 : n; }
function peEsCva_(s) { return peSku_(s).indexOf('-CVA') >= 0; }
function peTipo_(s) { var v = peSku_(s); if (/-OB$/.test(v)) return 'OPEN BOX'; if (/-MSI(-[2-9])?$/.test(v)) return 'PREMIUM'; return 'CLASICA'; }
function peBase_(s) {
  var v = peSku_(s).replace(/-OB$/, '').replace(/-(MSI(-[2-9])?|[2-9])$/, '').replace(/-CVA$/, '');
  return v.replace(/-(MSI(-[2-9])?|[2-9])$/, '');
}
function peSinVar_(s) { return peSku_(s).replace(/-MSI-[2-9]$/, '-MSI').replace(/-[2-9]$/, ''); }
function peCvaGen_(s) { var v = peSku_(s); return /-CVA-(MSI(-[2-9])?|[2-9])$/.test(v) ? v.replace(/-(MSI(-[2-9])?|[2-9])$/, '') : v; }
function peIgnorado_(s) { var v = peSku_(s); for (var i = 0; i < PE_PREFIJOS_IGNORADOS.length; i++) if (v.indexOf(PE_PREFIJOS_IGNORADOS[i]) === 0) return true; return false; }

/** Fecha en Date: Date, "30/09/2026 23:58" o "2026-09-30 23:58[:00]" (hora de Mexico). */
function peFecha_(v) {
  if (v instanceof Date) return v;
  var s = String(v === null || v === undefined ? '' : v).trim(), m;
  if (!s) return '';
  if ((m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/))) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/))) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  var d = new Date(s);
  return isNaN(d.getTime()) ? '' : d;
}

/* ---------------- lectura de hojas por encabezado ---------------- */

/** { enc, pos:{NORM:i}, filas } de una hoja de este libro (o null si no existe / esta vacia). */
function peTabla_(nombre) {
  var h = vdLibro_().getSheetByName(nombre);
  if (!h || h.getLastRow() < 1 || h.getLastColumn() < 1) return null;
  var d = kdReintentar_(function () { return h.getRange(1, 1, h.getLastRow(), h.getLastColumn()).getValues(); }), pos = {};
  d[0].forEach(function (x, i) { var k = normEnc_(x); if (k && pos[k] === undefined) pos[k] = i; });
  return { enc: d[0], pos: pos, filas: d.slice(1) };
}
function peCol_(t, nombres) {
  for (var i = 0; i < nombres.length; i++) { var j = t.pos[normEnc_(nombres[i])]; if (j !== undefined) return j; }
  return -1;
}

/** Mapa SKU -> {c, p} con Walmart Clasica / Premium de las hojas de minimos (EM primero). */
function peMinimos_() {
  var mapa = {}, n = 0;
  PE_HOJAS_MINIMO.forEach(function (nombre) {
    var t = peTabla_(nombre); if (!t) return;
    var iS = peCol_(t, ['SKU']), iC = peCol_(t, ['Walmart Clasica']), iP = peCol_(t, ['Walmart Premium']);
    if (iS < 0 || (iC < 0 && iP < 0)) return;
    t.filas.forEach(function (f) {
      var s = peSku_(f[iS]); if (!s || mapa[s]) return;
      var c = iC < 0 ? 0 : peNum_(f[iC]), p = iP < 0 ? 0 : peNum_(f[iP]);
      if (c > 0 || p > 0) { mapa[s] = { c: c, p: p }; n++; }
    });
  });
  return { minimos: mapa, n: n };
}

/** Minimo que aplica: SKU exacto, sin variante, CVA general y base (un -CVA o -OB no cae al de EM). Premium -> columna P. */
function peMinimoDe_(tabla, sku) {
  var s = peSku_(sku);
  var f = tabla.minimos[s] || tabla.minimos[peSinVar_(s)] || tabla.minimos[peCvaGen_(s)];
  if (!f && !peEsCva_(s) && peTipo_(s) !== 'OPEN BOX') f = tabla.minimos[peBase_(s)];
  if (!f) return 0;
  return peTipo_(s) === 'PREMIUM' ? (f.p || 0) : (f.c || 0);
}

/** Hoja con encabezados; la crea si falta (solo encabezados y formato basico). */
function peHojaAsegurar_(nombre, enc) {
  var h = vdHoja_(nombre);
  ubicarColumnas_(h, enc, 1, { negrita: true, fondo: '#b45f06', color: '#ffffff', centro: true });
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);
  return h;
}

/** SKU ASIGNADOS: { SKU: {principal, grupo:[...]} }. */
function peAsignados_() {
  var mapa = {}, t = peTabla_(PE_HOJA_ASIG);
  if (!t) return mapa;
  var cols = [];
  t.enc.forEach(function (h, i) { if (/^(SKU PRINCIPAL|ASIGNADO)/.test(normEnc_(h))) cols.push(i); });
  t.filas.forEach(function (fila) {
    if (cols.length) fila = cols.map(function (i) { return fila[i]; });
    var grupo = fila.map(peSku_).filter(function (x) { return x; });
    if (grupo.length < 2) return;
    var info = { principal: grupo[0], grupo: grupo };
    grupo.forEach(function (x) { mapa[x] = info; mapa[peBase_(x)] = mapa[peBase_(x)] || info; });
  });
  return mapa;
}
function peGrupoDe_(asig, sku) { if (!asig) return null; var s = peSku_(sku); return asig[s] || asig[peSinVar_(s)] || null; }

/** PRECIO LIBRE: { SKUBASE: true } (vence al dia siguiente de HASTA si lo traen). */
function peLibres_() {
  var m = {}, t = peTabla_(PE_HOJA_LIBRE);
  if (!t) return m;
  var iS = peCol_(t, ['SKU']), iH = peCol_(t, ['HASTA (opcional)', 'HASTA']);
  if (iS < 0) return m;
  var ahora = Date.now();
  t.filas.forEach(function (r) {
    var k = peBase_(r[iS]); if (!k) return;
    var h = iH < 0 ? '' : peFecha_(r[iH]);
    if (h instanceof Date && h.getTime() + 86400000 < ahora) return;
    m[k] = true;
  });
  return m;
}

/** Rangos de killers (hoja Killers historico): { SKU: [{precio, ini, fin}] } por SKU y SKU general. */
function peKillers_() {
  var mapa = {}, t = peTabla_(PE_HOJA_KH);
  if (!t) return mapa;
  var iS = peCol_(t, ['SKU']), iG = peCol_(t, ['SKU GENERAL']), iN = peCol_(t, ['PRECIO NEGOCIADO']), iI = peCol_(t, ['INICIO']), iF = peCol_(t, ['FIN']);
  if (iS < 0 || iN < 0) return mapa;
  t.filas.forEach(function (r) {
    var sku = peSku_(r[iS]), neg = peNum_(r[iN]); if (!sku || !(neg > 0)) return;
    var e = { precio: neg, ini: iI < 0 ? '' : peFecha_(r[iI]), fin: iF < 0 ? '' : peFecha_(r[iF]) };
    [sku, iG < 0 ? '' : peSku_(r[iG])].forEach(function (k) { if (k) (mapa[k] = mapa[k] || []).push(e); });
  });
  return mapa;
}
function peEnVentana_(e, fecha) {
  if (!(fecha instanceof Date)) return true;
  var t = fecha.getTime(), dia = 86400000;
  if (e.ini instanceof Date && t < e.ini.getTime() - dia) return false;
  if (e.fin instanceof Date && t > e.fin.getTime() + dia) return false;
  return true;
}
function peKillerAplica_(killers, sku, precio, fecha, grupo) {
  var ll = [peSku_(sku), peSinVar_(sku), peBase_(sku)];
  (grupo || []).forEach(function (x) { ll.push(peSku_(x), peBase_(x)); });
  for (var i = 0; i < ll.length; i++) {
    var l = killers[ll[i]]; if (!l) continue;
    for (var j = 0; j < l.length; j++) if (Math.abs(l[j].precio - precio) <= PE_TOLERANCIA && peEnVentana_(l[j], fecha)) return l[j];
  }
  return null;
}

/** Killers bajo minimo para la regla de precio: { ex:{SKU:perdida%}, base:{SKUBASE:perdida% maxima}, tope }. Lee la hoja con vdBajoMinimo_ (un solo lector). */
function peAceptables_() {
  var bm = vdBajoMinimo_(), m = { ex: {}, base: {}, tope: bm.tope };
  Object.keys(bm.skus).forEach(function (s) {
    var per = bm.skus[s].perdida, b = peBase_(s);
    m.ex[s] = per;
    if (m.base[b] === undefined || per > m.base[b]) m.base[b] = per;
  });
  return m;
}

/* ---------------- la regla ---------------- */

/**
 * v = { sku, odoo:[skus], piezas, items, precio, fecha(Date) }. ctx = { tabla, killers, asig, libres, acept, modo }.
 * Devuelve { min, dif, pct, sem, nota }.
 */
function peEvaluar_(v, ctx) {
  var s = peSku_(v.sku);
  var vacio = function (sem, n) { return { min: '', dif: '', pct: '', sem: sem, nota: n }; };
  if (!s) return vacio('SIN SKU', 'La venta no trae SKU');
  if (peIgnorado_(s)) return vacio('IGNORADO', 'Prefijo viejo RES- / WL- / OB-');
  if (Number(v.items) > 1) return vacio('VARIOS ITEMS', 'La orden trae varios productos: el precio del site es de toda la orden');
  var piezas = Math.max(Number(v.piezas) || 1, 1), p1 = peNum_(v.precio), p2 = p1 / piezas, modo = ctx.modo;
  if (!(p1 >= PE_PRECIO_MIN_COMERCIAL)) return vacio('INTERNA', 'Venta interna, insumo o prueba (precio menor a $' + PE_PRECIO_MIN_COMERCIAL + ')');
  var p = modo === 'total' ? p2 : p1;

  var g = peGrupoDe_(ctx.asig, s), refSku = g ? g.principal : s, grupo = g ? g.grupo : null;
  var notaAsig = (g && g.principal !== s) ? 'Asignado a ' + g.principal : '';
  var min = 0;
  [s, refSku].concat(grupo || []).forEach(function (x) { var m = peMinimoDe_(ctx.tabla, x); if (m > 0 && (!min || m < min)) min = m; });
  if (!min) (v.odoo || []).forEach(function (x) { var m = peMinimoDe_(ctx.tabla, x); if (m > 0 && (!min || m < min)) min = m; });
  if (!min) return vacio('SIN REFERENCIA', 'No tiene minimo en Precios EM / CVA' + (peTipo_(s) === 'PREMIUM' ? ' (columna Premium)' : ''));

  var varias = modo === 'auto' && piezas > 1;
  if (varias) {
    if (p2 >= min - PE_TOLERANCIA) return { min: min, dif: p2 - min, pct: (p2 - min) / min, sem: 'OK', nota: notaAsig };
    if (p1 >= min - PE_TOLERANCIA) return { min: min, dif: p2 - min, pct: (p2 - min) / min, sem: 'REVISAR', nota: 'Varias piezas: no se sabe si el precio del site es unitario o total (total/piezas = $' + Math.round(p2 * 100) / 100 + ')' };
    p = p2;
  }
  var dif = p - min, pct = dif / min;
  if (p >= min - PE_TOLERANCIA) return { min: min, dif: dif, pct: pct, sem: 'OK', nota: notaAsig };
  var baseSku = peBase_(s);
  if (ctx.libres[baseSku] || ctx.libres[peBase_(refSku)]) return { min: min, dif: dif, pct: pct, sem: 'OK', nota: 'Precio libre (hoja ' + PE_HOJA_LIBRE + ')' };
  var k = peKillerAplica_(ctx.killers, s, p, v.fecha, grupo);
  if (k) return { min: min, dif: dif, pct: pct, sem: 'KILLER', nota: 'Killer $' + k.precio + (k.fin instanceof Date ? ' (hasta ' + Utilities.formatDate(k.fin, TZ, 'dd/MM') + ')' : '') };
  var per = ctx.acept.ex[s] !== undefined ? ctx.acept.ex[s] : ctx.acept.base[baseSku];
  if (per !== undefined && !isNaN(per) && per <= ctx.acept.tope + 0.0001) {
    return { min: min, dif: dif, pct: pct, sem: 'KILLER', nota: 'Bajo minimo aceptable: pierde ' + (Math.round(per * 10) / 10) + '% (tope ' + ctx.acept.tope + '%)' };
  }
  return { min: min, dif: dif, pct: pct, sem: 'BAJO MINIMO', nota: notaAsig };
}

/* ---------------- revisar las ventas ---------------- */

function peDesde_() {
  var d = ''; try { d = String(props_().getProperty('PE_DESDE') || ''); } catch (e) {}
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : PE_DESDE_DEFECTO;
}
function peModo_() {
  var m = ''; try { m = String(props_().getProperty('PE_PRECIO_MODO') || ''); } catch (e) {}
  // Confirmado con ventas reales (2-nov): el PRECIO del site es el TOTAL de la orden (2 piezas = 9,098; 6 piezas = 16,014).
  return m === 'unitario' ? 'unitario' : (m === 'auto' ? 'auto' : 'total');
}

/** Revisa lo pendiente. Devuelve { revisadas, alertas, revisar, sinRef, sinMinimos }. */
function peRevisar_() {
  var res = { revisadas: 0, alertas: 0, revisar: 0, sinRef: 0, sinMinimos: false };
  var h = vdLibro_().getSheetByName(VH_HOJA);
  if (!h || h.getLastRow() < 2) return res;
  var m = ubicarColumnas_(h, PE_ENC_ANALISIS, 1, { negrita: true, fondo: '#b45f06', color: '#ffffff', centro: true });
  var n = h.getLastRow() - 1;
  var colV = function (nombre) { return m.col[normEnc_(nombre)] || 0; };
  var vals = function (c) { return c ? h.getRange(2, c, n, 1).getValues() : null; };
  var cF = colV('FOLIO'), cFe = colV('FECHA'), cS = colV('SKU'), cPr = colV('PRECIO');
  if (!cF || !cFe || !cS || !cPr) throw new Error('Ventas Walmart no trae FOLIO, FECHA, SKU y PRECIO');
  var fol = vals(cF), fec = vals(cFe), sku = vals(cS), pre = vals(cPr), odo = vals(colV('SKUS ODOO')), pzs = vals(colV('PIEZAS')), itm = vals(colV('ITEMS')), cli = vals(colV('CLIENTE'));
  var A = {}; PE_ENC_ANALISIS.forEach(function (e) { A[e] = vals(colV(e)); });

  var tabla = peMinimos_();
  if (!tabla.n) { res.sinMinimos = true; return res; }
  var ctx = { tabla: tabla, killers: peKillers_(), asig: peAsignados_(), libres: peLibres_(), acept: peAceptables_(), modo: peModo_() };
  var desde = peDesde_(), hoyMs = Date.now(), cambios = {}, alertas = [];
  var desdeMs = new Date(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10))).getTime();
  var limpiar = vdProp_('PE_LIMPIEZA_V1') !== '1';   // una vez: quita lo que se reviso de mas antes del 1-nov (FECHA llego como fecha y la comparacion de texto fallaba)
  PE_ENC_ANALISIS.forEach(function (e) { cambios[e] = false; });

  for (var i = 0; i < n; i++) {
    var fd = peFecha_(fec[i][0]);                     // la hoja convierte el texto en fecha: siempre se compara como fecha
    if (!(fd instanceof Date)) continue;
    if (fd.getTime() < desdeMs) {
      if (limpiar && A['SEMAFORO'][i][0] !== '') PE_ENC_ANALISIS.forEach(function (e) { if (A[e] && A[e][i][0] !== '') { A[e][i][0] = ''; cambios[e] = true; } });
      continue;
    }
    var sem = String(A['SEMAFORO'][i][0] || '');
    var reintento = (sem === 'SIN REFERENCIA' && fd instanceof Date && hoyMs - fd.getTime() < 3 * 86400000) || (sem === 'REVISAR' && ctx.modo !== 'auto');   // REVISAR = se dudaba unitario/total: ya se sabe
    if (sem && !reintento) continue;
    var v = { sku: sku[i][0], odoo: odo ? String(odo[i][0] || '').split('|').map(function (x) { return x.trim(); }).filter(String) : [], piezas: pzs ? pzs[i][0] : 1, items: itm ? itm[i][0] : 1, precio: pre[i][0], fecha: fd };
    var r = peEvaluar_(v, ctx);
    res.revisadas++;
    if (r.sem === 'REVISAR') res.revisar++;
    if (r.sem === 'SIN REFERENCIA') res.sinRef++;
    var nuevo = { 'MINIMO APLICADO': r.min, 'DIFERENCIA $': r.dif, 'DIFERENCIA %': r.pct, 'SEMAFORO': r.sem, 'NOTAS PRECIO': r.nota, 'REVISADO PRECIO': ahora_() };
    PE_ENC_ANALISIS.forEach(function (e) { if (A[e] && String(A[e][i][0]) !== String(nuevo[e])) { A[e][i][0] = nuevo[e]; cambios[e] = true; } });
    if (r.sem === 'BAJO MINIMO') alertas.push({ folio: String(fol[i][0]), cliente: cli ? cli[i][0] : '', sku: String(sku[i][0]), cant: pzs ? pzs[i][0] : 1, precio: peNum_(pre[i][0]), min: r.min, dif: r.min - peNum_(pre[i][0]), pct: r.pct, fecha: fd, nota: r.nota });
  }
  PE_ENC_ANALISIS.forEach(function (e) { if (cambios[e]) h.getRange(2, colV(e), n, 1).setValues(A[e]); });
  if (limpiar) { res.limpiadas = peLimpiarAlertas_(desdeMs); vdSetProp_('PE_LIMPIEZA_V1', '1'); }
  if (alertas.length) res.alertas = peAlertar_(alertas);
  SpreadsheetApp.flush();
  return res;
}

/** Una vez: quita de Alertas de precio las alertas del site (ORIGEN DATO = SITE) de ventas anteriores al inicio de la revision. */
function peLimpiarAlertas_(desdeMs) {
  var t = peTabla_(PE_HOJA_ALERTAS); if (!t) return 0;
  var iO = peCol_(t, ['ORIGEN DATO']), iF = peCol_(t, ['FECHA VENTA']);
  if (iO < 0 || iF < 0) return 0;
  var idx = PE_ENC_ALERTAS.map(function (e) { return peCol_(t, [e]); }), quitadas = 0;
  var filas = t.filas.filter(function (f) {
    var fd = peFecha_(f[iF]);
    if (String(f[iO]) === 'SITE' && (!(fd instanceof Date) || fd.getTime() < desdeMs)) { quitadas++; return false; }
    return true;
  }).map(function (f) { return idx.map(function (i) { return i < 0 ? '' : f[i]; }); });
  if (!quitadas) return 0;
  vdEscribir_(vdHoja_(PE_HOJA_ALERTAS), PE_ENC_ALERTAS, filas, { vacioOk: true, clave: 'ESCR_COLS|' + PE_HOJA_ALERTAS });
  logOk_(PE_ETAPA, 'Alertas de precio: quite ' + quitadas + ' alerta(s) de ventas anteriores al ' + peDesde_() + ' (se habian revisado de mas)');
  return quitadas;
}

/** Agrega filas (objetos por encabezado) al final de una hoja, solo en las columnas del script. */
function peAgregar_(h, enc, filas) {
  if (!filas || !filas.length) return;
  var m = ubicarColumnas_(h, enc, 1), ini = h.getLastRow() + 1;
  enc.forEach(function (e) {
    var c = escrCol_(m, e); if (!c) return;
    h.getRange(ini, c, filas.length, 1).setValues(filas.map(function (x) { return [x[e] === undefined || x[e] === null ? '' : x[e]]; }));
  });
}

/** Agrega a "Alertas de precio" lo que no estaba (llave FOLIO|SKU|PRECIO). Devuelve cuantas entraron. */
function peAlertar_(alertas) {
  var h = peHojaAsegurar_(PE_HOJA_ALERTAS, PE_ENC_ALERTAS), t = peTabla_(PE_HOJA_ALERTAS), claves = {};
  if (t) { var iF = peCol_(t, ['FOLIO']), iS = peCol_(t, ['SKU']), iP = peCol_(t, ['PRECIO VENTA']); t.filas.forEach(function (r) { claves[String(r[iF]) + '|' + peSku_(r[iS]) + '|' + peNum_(r[iP])] = true; }); }
  var nuevas = alertas.filter(function (a) { var k = a.folio + '|' + peSku_(a.sku) + '|' + a.precio; if (claves[k]) return false; claves[k] = true; return true; });
  if (!nuevas.length) return 0;
  var ahora = new Date();
  peAgregar_(h, PE_ENC_ALERTAS, nuevas.map(function (a) {
    return { 'FECHA ALERTA': ahora, 'FOLIO': a.folio, 'CLIENTE': a.cliente, 'VENDEDOR': '', 'SKU': a.sku, 'CANTIDAD': a.cant, 'PRECIO VENTA': a.precio, 'MINIMO': a.min, 'DIFERENCIA': a.dif, 'DIFERENCIA %': a.pct, 'FECHA VENTA': a.fecha, 'NOTAS': a.nota, 'ORIGEN DATO': 'SITE' };
  }));
  logWarn_(PE_ETAPA, nuevas.length + ' venta(s) de Walmart por debajo del minimo', { skus: nuevas.slice(0, 10).map(function (a) { return a.sku; }) });
  return nuevas.length;
}

/* ---------------- killers historico ---------------- */

function peLlaveK_(s, n, c, i, f) {
  var fi = peFecha_(i), ff = peFecha_(f);
  return [peSku_(s), peNum_(n), peNum_(c), fi instanceof Date ? fi.getTime() : '', ff instanceof Date ? ff.getTime() : ''].join('|');
}
/** { claves:{llave:true}, maxCarga } de la hoja Killers historico. */
function peKhClaves_() {
  var out = { claves: {}, maxCarga: 0 }, t = peTabla_(PE_HOJA_KH);
  if (!t) return out;
  var a = peCol_(t, ['SKU']), b = peCol_(t, ['PRECIO NEGOCIADO']), c = peCol_(t, ['CUPON']), d = peCol_(t, ['INICIO']), e = peCol_(t, ['FIN']), k = peCol_(t, ['CARGA #']);
  t.filas.forEach(function (r) {
    out.claves[peLlaveK_(r[a], r[b], c < 0 ? 0 : r[c], d < 0 ? '' : r[d], e < 0 ? '' : r[e])] = true;
    if (k >= 0 && peNum_(r[k]) > out.maxCarga) out.maxCarga = peNum_(r[k]);
  });
  return out;
}

var PE_MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/** Etiqueta de la carga del mes ("NOVIEMBRE 2026-3"), como en Venta Diaria: cada tanda nueva del mes suma 1. */
function peEtiquetaCarga_(fecha) {
  var mes = Utilities.formatDate(fecha, TZ, 'yyyy-MM'), k = 'PE_CARGA_MES_' + mes;
  var n = Number(props_().getProperty(k) || 0) + 1;
  props_().setProperty(k, String(n));
  return PE_MESES[Number(mes.slice(5)) - 1] + ' ' + mes.slice(0, 4) + '-' + n;
}

/**
 * Historico mensual de killers = FOTOS. Cada vez que cambia la lista de killers del site (otro SKU, otro precio,
 * otro cupon u otras fechas) se guarda en "Killers historico" la foto COMPLETA de los killers de ese momento, con su
 * carga del mes ("NOVIEMBRE 2026-1", "-2", "-3"... sin tope) y la hora de la foto (FOTO). Si nada cambio no escribe.
 * Asi se sabe que killers estaban activos en cada momento, aunque un KAM quite uno antes de su fecha o adelante otro.
 * La llama la bajada de killers (kEscribirTanda_, al escribir la hoja Killers) y, como respaldo, la revision horaria
 * de precios erroneos. Devuelve cuantos killers trae la foto nueva (0 = sin cambios).
 */
function peKillersSync_() {
  var t = peTabla_(PE_HOJA_KILLERS);
  if (!t) return 0;
  var iS = peCol_(t, ['SKU']), iN = peCol_(t, ['NEGOCIADO', 'PRECIO NEGOCIADO']), iC = peCol_(t, ['CUPON']), iI = peCol_(t, ['INICIA', 'INICIO']), iF = peCol_(t, ['TERMINA', 'FIN']), iG = peCol_(t, ['SKU BASE']);
  var iT = peCol_(t, ['TITULO', 'DETALLES']), iP = peCol_(t, ['PUBLICADO', 'PRECIO ACTUAL']), iR = peCol_(t, ['NOS PAGAN', 'RECIBIMOS']), iK = peCol_(t, ['COMISION KILLER']), iM = peCol_(t, ['COMISION MSI']), iW = peCol_(t, ['SOLO WFS']);
  var opc = function (r, i) { return i < 0 ? '' : r[i]; };
  if (iS < 0 || iN < 0 || iF < 0) return 0;
  var foto = [], llaves = [], vistas = {};
  t.filas.forEach(function (r) {
    var s = peSku_(r[iS]); if (!s || !(peNum_(r[iN]) > 0) || !(peFecha_(r[iF]) instanceof Date)) return;
    var k = peLlaveK_(s, r[iN], iC < 0 ? 0 : r[iC], iI < 0 ? '' : r[iI], r[iF]);
    if (vistas[k]) return; vistas[k] = true; llaves.push(k);
    foto.push({ 'SKU': s, 'SKU GENERAL': iG < 0 ? peBase_(s) : (peSku_(r[iG]) || peBase_(s)), 'PRECIO NEGOCIADO': peNum_(r[iN]), 'CUPON': iC < 0 ? 0 : peNum_(r[iC]), 'INICIO': iI < 0 ? '' : peFecha_(r[iI]), 'FIN': peFecha_(r[iF]), 'ORIGEN': 'SITE',
      'DETALLES': String(opc(r, iT)).slice(0, 200), 'PRECIO ACTUAL': opc(r, iP), 'RECIBIMOS': opc(r, iR), 'COMISION CUPON': opc(r, iK), 'COMISION MSI': opc(r, iM), 'SOLO WFS': opc(r, iW) });
  });
  if (!foto.length) return 0;                                   // hoja vacia (todo vencio): no hay foto que guardar
  var huella = sha256_(JSON.stringify(llaves.slice().sort()));
  if (huella === props_().getProperty('PE_FOTO_HUELLA')) return 0;
  var antes = {}; try { antes = JSON.parse(props_().getProperty('PE_FOTO_LLAVES') || '{}'); } catch (e) { antes = {}; }
  var h = peHojaAsegurar_(PE_HOJA_KH, PE_ENC_KH), kc = peKhClaves_();
  var carga = Math.max(kc.maxCarga, Number(props_().getProperty('PE_CARGA_N') || 0)) + 1, ahora = new Date();
  var etiqueta = peEtiquetaCarga_(ahora);
  foto.forEach(function (x) { x['CARGA'] = etiqueta; x['CARGA #'] = carga; x['FOTO'] = ahora; x['REGISTRADO'] = ahora; });
  peAgregar_(h, PE_ENC_KH, foto);
  props_().setProperty('PE_CARGA_N', String(carga));
  props_().setProperty('PE_FOTO_HUELLA', huella);
  var mapa = {}; llaves.forEach(function (k) { mapa[sha256_(k).slice(0, 10)] = 1; });
  var nuevos = Object.keys(mapa).filter(function (k) { return !antes[k]; }).length, quitados = Object.keys(antes).filter(function (k) { return !mapa[k]; }).length;
  var txt = JSON.stringify(mapa); props_().setProperty('PE_FOTO_LLAVES', txt.length < 8500 ? txt : '{}');
  logOk_(PE_ETAPA, 'Foto de killers ' + etiqueta + ': ' + foto.length + ' killers activos (' + nuevos + ' nuevos o cambiados, ' + quitados + ' quitados vs la foto anterior)');
  return foto.length;
}

/* ---------------- menu y trigger ---------------- */

function peCorrer_() {
  var k = peKillersSync_();
  var r = peRevisar_(); r.killersNuevos = k;
  return r;
}

/** Menu: revisa precios de las ventas de Walmart ya. */
function preciosErroneosRevisar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) { toast_('Otra revision en curso. Intenta en un minuto.', 'PRECIOS ERRONEOS', 8); return; }
  try {
    toast_('Revisando precios de ventas...', 'PRECIOS ERRONEOS', 30);
    var r = peCorrer_();
    var txt = r.sinMinimos ? 'No hay minimos en Precios EM Minimo / Precios CVA Minimo: no revise nada.' :
      r.revisadas + ' venta(s) revisadas desde ' + peDesde_() + ' · ' + r.alertas + ' alerta(s) · ' + r.revisar + ' por revisar (varias piezas) · ' + r.sinRef + ' sin referencia';
    (r.sinMinimos ? logWarn_ : logOk_)(PE_ETAPA, 'Precios erroneos: ' + txt, r);
    flushLog_();
    dlgInfo_('Precios erroneos', txt, r.alertas || r.sinMinimos ? 'aviso' : 'ok');
  } catch (e) {
    logErr_(PE_ETAPA, 'No se pudo revisar precios: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    dlgInfo_('Precios erroneos', 'Fallo: ' + String(e.message).split('\n')[0], 'error');
  } finally { lock.releaseLock(); }
}

/** Cada hora (cadena de killersProgramado), despues de bajar las ventas. */
function preciosErroneosProgramado_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(VD_LOCK_MS)) { avisoDia_('pe-ocupado', 'INFO', PE_ETAPA, 'Precios erroneos saltada: otra corrida tenia el candado.'); return; }
  try {
    var r = peCorrer_();
    if (r.sinMinimos) avisoDia_('pe-sin-minimos', 'WARN', PE_ETAPA, 'Precios erroneos: no hay minimos en Precios EM / CVA Minimo');
    else if (r.revisadas || r.killersNuevos) logOk_(PE_ETAPA, 'Precios erroneos: ' + r.revisadas + ' revisadas, ' + r.alertas + ' alertas, ' + r.revisar + ' por revisar', r);
    else vdLatido_(PE_ETAPA, 'Precios erroneos al dia (nada nuevo que revisar)');
  } catch (e) {
    var msg = String(e.message).split('\n')[0].substring(0, 160);
    avisoDia_('pe-error:' + msg, 'WARN', PE_ETAPA, 'No se pudo revisar precios de ventas: ' + msg);
  } finally { try { flushLog_(); } catch (x) {} lock.releaseLock(); }
}

/* ---------------- copiar de Venta Diaria Odoo (una vez, solo lectura) ---------------- */

/** { pos, filas } de una hoja del libro viejo, o null. */
function peLeerViejo_(libro, nombre) {
  var sh = libro.getSheetByName(nombre);
  if (!sh || sh.getLastRow() < 2) return null;
  var d = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), pos = {};
  d[0].forEach(function (x, i) { var k = normEnc_(x); if (k && pos[k] === undefined) pos[k] = i; });
  return { pos: pos, filas: d.slice(1) };
}
function peGet_(o, r, nombres) { for (var q = 0; q < nombres.length; q++) { var j = o.pos[normEnc_(nombres[q])]; if (j !== undefined) return r[j]; } return ''; }

/** Copia las cuatro listas de Venta Diaria. Devuelve texto ("a · b · c"); lanza si el libro no abre. */
function peTraerDeVentaDiaria_() {
  var libro = SpreadsheetApp.openById(VD_LIBRO_VIEJO), partes = [];
  // 1) listas del usuario: se agregan los SKU que no esten (la primera columna es el SKU)
  [['PRECIO LIBRE', PE_HOJA_LIBRE, PE_ENC_LIBRE], ['SKU ASIGNADOS', PE_HOJA_ASIG, PE_ENC_ASIG]].forEach(function (x) {
    var o = peLeerViejo_(libro, x[0]);
    if (!o) { partes.push(x[1] + ': no encontre datos en la hoja ' + x[0]); return; }
    var h = peHojaAsegurar_(x[1], x[2]), t = peTabla_(x[1]), ya = {}, iA = t ? peCol_(t, [x[2][0]]) : -1;
    if (t && iA >= 0) t.filas.forEach(function (r) { ya[peBase_(r[iA])] = true; });
    var nuevas = o.filas.filter(function (r) { var k = peBase_(peGet_(o, r, [x[2][0], 'SKU'])); return k && !ya[k]; });
    peAgregar_(h, x[2], nuevas.map(function (r) { var f = {}; x[2].forEach(function (e) { f[e] = peGet_(o, r, [e]); }); return f; }));
    partes.push(x[1] + ': ' + nuevas.length + ' nuevo(s) de ' + o.filas.length);
  });
  // 2) killers historico
  var kh = peLeerViejo_(libro, 'KILLERS HISTORICO');
  if (kh) {
    var h2 = peHojaAsegurar_(PE_HOJA_KH, PE_ENC_KH), kc = peKhClaves_(), nu = [], maxC = kc.maxCarga;
    kh.filas.forEach(function (r) {
      var s = peSku_(peGet_(kh, r, ['SKU'])), neg = peNum_(peGet_(kh, r, ['PRECIO NEGOCIADO'])); if (!s || !(neg > 0)) return;
      var k = peLlaveK_(s, neg, peGet_(kh, r, ['CUPON']), peGet_(kh, r, ['INICIO']), peGet_(kh, r, ['FIN'])); if (kc.claves[k]) return; kc.claves[k] = true;
      var nc = peNum_(peGet_(kh, r, ['CARGA #'])); if (nc > maxC) maxC = nc;
      var et = String(peGet_(kh, r, ['CARGA']) || ''), me = /^([A-Z]+) (\d{4})-(\d+)$/.exec(et);
      if (me && PE_MESES.indexOf(me[1]) >= 0) { var km = 'PE_CARGA_MES_' + me[2] + '-' + ('0' + (PE_MESES.indexOf(me[1]) + 1)).slice(-2); if (Number(me[3]) > Number(props_().getProperty(km) || 0)) props_().setProperty(km, me[3]); }
      nu.push({ 'SKU': s, 'SKU GENERAL': peSku_(peGet_(kh, r, ['SKU GENERAL'])) || peBase_(s), 'PRECIO NEGOCIADO': neg, 'CUPON': peNum_(peGet_(kh, r, ['CUPON'])), 'INICIO': peFecha_(peGet_(kh, r, ['INICIO'])), 'FIN': peFecha_(peGet_(kh, r, ['FIN'])), 'CARGA': et, 'CARGA #': nc, 'ORIGEN': peGet_(kh, r, ['ORIGEN']) || 'VENTA DIARIA', 'REGISTRADO': peGet_(kh, r, ['REGISTRADO']),
        'DETALLES': String(peGet_(kh, r, ['DETALLES']) || '').slice(0, 200), 'PRECIO ACTUAL': peGet_(kh, r, ['PRECIO ACTUAL']), 'RECIBIMOS': peGet_(kh, r, ['RECIBIMOS']),
        'COMISION CUPON': peGet_(kh, r, ['COMISION CUPON']), 'COMISION MSI': peGet_(kh, r, ['COMISION MSI']), 'SOLO WFS': peGet_(kh, r, ['SOLO WFS']), 'OBSERVACIONES': String(peGet_(kh, r, ['OBSERVACIONES']) || '').slice(0, 300) });
    });
    peAgregar_(h2, PE_ENC_KH, nu);
    props_().setProperty('PE_CARGA_N', String(Math.max(maxC, Number(props_().getProperty('PE_CARGA_N') || 0))));
    partes.push(PE_HOJA_KH + ': ' + nu.length + ' rango(s) nuevo(s) de ' + kh.filas.length);
  } else partes.push('KILLERS HISTORICO: no encontre datos');
  // 3) historico de alertas (A = fecha de la alerta, el resto por encabezado)
  var al = peLeerViejo_(libro, 'Histórico de alertas') || peLeerViejo_(libro, 'HISTORICO ALERTAS');
  if (al) {
    var h3 = peHojaAsegurar_(PE_HOJA_ALERTAS, PE_ENC_ALERTAS), t3 = peTabla_(PE_HOJA_ALERTAS), ya3 = {};
    if (t3) { var f3 = peCol_(t3, ['FOLIO']), s3 = peCol_(t3, ['SKU']), p3 = peCol_(t3, ['PRECIO VENTA']); t3.filas.forEach(function (r) { ya3[String(r[f3]) + '|' + peSku_(r[s3]) + '|' + peNum_(r[p3])] = true; }); }
    var na = [];
    al.filas.forEach(function (r) {
      var so = peGet_(al, r, ['SO']), sk = peGet_(al, r, ['SKU']); if (so === '' || so === null) return;
      var vn = peNum_(peGet_(al, r, ['VENTA'])), k = String(so) + '|' + peSku_(sk) + '|' + vn; if (ya3[k]) return; ya3[k] = true;
      na.push({ 'FECHA ALERTA': r[0], 'FOLIO': so, 'CLIENTE': peGet_(al, r, ['CLIENTE']), 'VENDEDOR': peGet_(al, r, ['VENDEDOR']), 'SKU': sk, 'CANTIDAD': peGet_(al, r, ['CANTIDAD']), 'PRECIO VENTA': vn, 'MINIMO': peNum_(peGet_(al, r, ['ERIK'])), 'DIFERENCIA': peNum_(peGet_(al, r, ['DIFERENCIA'])), 'ORIGEN DATO': 'VENTA DIARIA' });   // col-fija: la columna A de esa hoja es la fecha de la alerta
    });
    peAgregar_(h3, PE_ENC_ALERTAS, na);
    partes.push(PE_HOJA_ALERTAS + ': ' + na.length + ' alerta(s) nueva(s) de ' + al.filas.length);
  } else partes.push('Historico de alertas: no encontre datos');
  logOk_(PE_ETAPA, 'Copiado de Venta Diaria: ' + partes.join(' · '));
  return partes.join(' · ');
}
