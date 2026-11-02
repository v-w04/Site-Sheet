/**
 * ============================================================
 *  Killers activos — lo que aplica HOY por SKU (traido de Venta Diaria Odoo)
 * ============================================================
 *
 *  Hoja "Killers activos": un renglon por SKU con el killer que cubre hoy (o el proximo, POR INICIAR), con su minimo,
 *  lo que nos pagan y el % contra el minimo. Las columnas A-T son las de la hoja "Activos" de siempre.
 *
 *  De donde sale: SOLO la hoja Killers (la baja el site cada hora). Nada se pega a mano.
 *  Reglas (las de Venta Diaria):
 *    - varios rangos de un SKU: gana el que cubre hoy (el que empezo mas tarde); si ninguno, el proximo por iniciar;
 *      si todos vencieron no entra.
 *    - fuera si esta en "Killers bajo minimo" con perdida mayor al tope (3%, Script Property BAJO_MIN_PERDIDA);
 *    - fuera si Walmart le cobra distinto (hoja Cobro distinto).
 *    - PRECIO = minimo de Precios EM / CVA Minimo (Premium si el SKU es -MSI); con SKU asignados vale el mas bajo del grupo.
 *  Se reescribe solo si cambio (huella). Corre cada hora en ventasProgramado y desde el menu.
 *  El historico (todo killer que ha existido, con su carga del mes "NOVIEMBRE 2026-3") vive en "Killers historico".
 * ============================================================
 */

var KA_HOJA = 'Killers activos', KA_ETAPA = 'KILLERS_ACT';
var KA_PROP_HUELLA = 'KA_HUELLA', KA_PROP_N = 'KA_N';

var KA_ENC = ['SKU', 'Detalles del artículo', 'PRECIO', 'Precio negociado', 'Cupón de oferta', 'PAGAN', '%', 'Carga',
              'Inicio de la oferta', 'Finalización de la oferta', 'Fecha formato', 'Comisión sobre el cupón killer',
              'Oferta con venta a MSI', 'Comisión MSI', 'Válida sólo WFS', 'Descuento de killer por devolución',
              'Disponibilidad', 'Observaciones', 'VALIDACIÓN', 'KAM',
              'SKU GENERAL', 'ORIGEN', 'ESTADO', 'CARGA KILLER', 'OTROS RANGOS', '% PERDIDA (site)'];

/* Columnas de la hoja Killers del site (por encabezado, con alias). Obligatorias: SKU, NEGOCIADO, TERMINA. */
var KA_ALIAS = {
  SKU: ['SKU', 'SKU PUBLICACION'], TITULO: ['TITULO', 'DETALLES DEL ARTICULO', 'DETALLES'], PUB: ['PUBLICADO', 'PRECIO ACTUAL'],
  CUPON: ['CUPON', 'CUPON DE OFERTA'], NOS: ['NOS PAGAN', 'RECIBIMOS'], NEGOC: ['NEGOCIADO', 'PRECIO NEGOCIADO'],
  COMK: ['COMISION KILLER', 'COMISION SOBRE EL CUPON KILLER'], COMMSI: ['COMISION MSI'], INI: ['INICIA', 'INICIO', 'INICIO DE LA OFERTA'],
  FIN: ['TERMINA', 'FIN', 'FINALIZACION DE LA OFERTA'], WFS: ['SOLO WFS', 'VALIDA SOLO WFS']
};

function kaMs_(d) { return d instanceof Date ? d.getTime() : NaN; }
function kaDdmm_(d) { return d instanceof Date ? Utilities.formatDate(d, TZ, 'dd/MM') : ''; }

/* ---------------- fuentes ---------------- */

/** Killers de la hoja Killers (site) como objetos. null si faltan columnas obligatorias. */
function kaDelSite_() {
  var t = peTabla_(PE_HOJA_KILLERS);
  if (!t) return { lista: [], filas: 0 };
  var c = {}; Object.keys(KA_ALIAS).forEach(function (k) { c[k] = peCol_(t, KA_ALIAS[k]); });
  if (c.SKU < 0 || c.NEGOC < 0 || c.FIN < 0) {
    avisoDia_('ka-sin-columnas', 'WARN', KA_ETAPA, 'La hoja Killers no trae SKU, NEGOCIADO y TERMINA: no se armo Killers activos', { encabezados: t.enc.map(String) });
    return null;
  }
  var g = function (f, k) { return c[k] < 0 ? '' : f[c[k]]; }, lista = [];
  t.filas.forEach(function (f) {
    var sku = peSku_(g(f, 'SKU')), negoc = peNum_(g(f, 'NEGOC')), fin = peFecha_(g(f, 'FIN'));
    if (!sku || !(negoc > 0) || !(fin instanceof Date)) return;
    var cupon = peNum_(g(f, 'CUPON')), nos = peNum_(g(f, 'NOS'));
    lista.push({ sku: sku, general: peBase_(sku), detalles: String(g(f, 'TITULO') || '').slice(0, 200), actual: g(f, 'PUB'),
      negoc: negoc, cupon: cupon, recibimos: nos || negoc + cupon, ini: peFecha_(g(f, 'INI')), fin: fin,
      comCup: vdPct_(g(f, 'COMK')), msi: peTipo_(sku) === 'PREMIUM' ? 'Sí' : 'No', comMsi: vdPct_(g(f, 'COMMSI')),
      wfs: g(f, 'WFS'), devol: '', disp: '', obs: '', origen: 'SITE' });
  });
  return { lista: lista, filas: t.filas.length };
}

/** Carga del mes de cada rango en Killers historico ("NOVIEMBRE 2026-3"; llave SKU|negociado|cupon|inicio|fin). */
function kaCargasHist_() {
  var out = {}, t = peTabla_(PE_HOJA_KH);
  if (!t) return out;
  var a = peCol_(t, ['SKU']), b = peCol_(t, ['PRECIO NEGOCIADO']), c = peCol_(t, ['CUPON']), d = peCol_(t, ['INICIO']), e = peCol_(t, ['FIN']), k = peCol_(t, ['CARGA', 'CARGA #']);
  if (a < 0 || b < 0 || k < 0) return out;
  t.filas.forEach(function (r) { var ll = peLlaveK_(r[a], r[b], c < 0 ? 0 : r[c], d < 0 ? '' : r[d], e < 0 ? '' : r[e]); if (!(ll in out)) out[ll] = r[k]; });   // la primera foto en que aparecio
  return out;
}

/**
 * De varios rangos de un SKU, el que aplica en t (ms): cubre t -> el que empezo mas tarde;
 * si no, el proximo por iniciar; si no, null.
 */
function kaQueAplica_(rangos, t) {
  var cubre = rangos.filter(function (k) {
    return (!(k.ini instanceof Date) || kaMs_(k.ini) <= t) && (!(k.fin instanceof Date) || kaMs_(k.fin) >= t);
  });
  if (cubre.length) {
    cubre.sort(function (a, b) { return (kaMs_(b.ini) || 0) - (kaMs_(a.ini) || 0); });
    return { k: cubre[0], estado: 'VIGENTE' };
  }
  var fut = rangos.filter(function (k) { return k.ini instanceof Date && kaMs_(k.ini) > t; });
  if (fut.length) {
    fut.sort(function (a, b) { return kaMs_(a.ini) - kaMs_(b.ini); });
    return { k: fut[0], estado: 'POR INICIAR' };
  }
  return null;
}

/** Minimo que aplica a un SKU (con SKU asignados: el mas bajo del grupo). 0 si no tiene. */
function kaMinimo_(tabla, asig, sku) {
  var g = peGrupoDe_(asig, sku), lista = [sku].concat(g ? g.grupo : []), min = 0;
  lista.forEach(function (x) { var m = peMinimoDe_(tabla, x); if (m > 0 && (!min || m < min)) min = m; });
  return min;
}

/* ---------------- armar la tabla ---------------- */

/**
 * Arma Killers activos en memoria. ctx (opcional, para pruebas): { ahora, site, tabla, asig, bm, cd, kam, cargas }.
 * Devuelve { filas:[en orden KA_ENC], objs:[{sku, detalles, min, negoc, cupon, kam, estado,...}], res }.
 */
function kaConstruir_(ctx) {
  ctx = ctx || {};
  var site = ctx.site || kaDelSite_();
  if (site === null) return null;
  var ahora = ctx.ahora || Date.now();
  var tabla = ctx.tabla || peMinimos_(), asig = ctx.asig || peAsignados_(), bm = ctx.bm || vdBajoMinimo_();
  var cd = ctx.cd || vdCobroDistinto_(), kam = ctx.kam || vdKamPorSku_(), cargas = ctx.cargas || kaCargasHist_();
  var todos = site.lista;
  var porSku = {};
  todos.forEach(function (k) { (porSku[k.sku] = porSku[k.sku] || []).push(k); });

  var res = { total: 0, vigentes: 0, porIniciar: 0, bajoMinimo: 0, cobroDistinto: 0, vencidos: 0, sinMinimo: 0, site: site.lista.length };
  var sel = [];
  Object.keys(porSku).forEach(function (sku) {
    var x = kaQueAplica_(porSku[sku], ahora);
    if (!x) { res.vencidos++; return; }
    var e = bm.skus[sku];
    if (e && e.perdida > bm.tope + 0.0001) { res.bajoMinimo++; return; }
    if (cd[sku]) { res.cobroDistinto++; return; }
    sel.push({ sku: sku, x: x });
  });
  sel.sort(function (a, b) {
    var va = a.x.estado === 'VIGENTE' ? 0 : 1, vb = b.x.estado === 'VIGENTE' ? 0 : 1;
    return (va - vb) || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0);
  });

  var filas = [], objs = [];
  sel.forEach(function (s) {
    var k = s.x.k, rangos = porSku[s.sku];
    var min = kaMinimo_(tabla, asig, k.sku);
    if (!min) res.sinMinimo++;
    var pagan = k.negoc + (k.cupon || 0);
    var otros = rangos.filter(function (r) { return r !== k && r.fin instanceof Date && kaMs_(r.fin) >= ahora; })
      .map(function (r) { return '$' + r.negoc + ' ' + kaDdmm_(r.ini) + '–' + kaDdmm_(r.fin); }).join(' · ');
    var e = bm.skus[k.sku];
    var kamTxt = (e && e.cat) || kam[k.sku] || kam[peBase_(k.sku)] || '';
    var carga = cargas[peLlaveK_(k.sku, k.negoc, k.cupon, k.ini, k.fin)];
    var fechaFmt = k.fin instanceof Date ? new Date(k.fin.getTime() + 6 * 3600000) : '';
    if (s.x.estado === 'VIGENTE') res.vigentes++; else res.porIniciar++;
    filas.push([k.sku, k.detalles, min || 'NO ESTA', k.negoc, k.cupon ? k.cupon : '', pagan, min ? pagan / min : '', k.negoc,
      k.ini, k.fin, fechaFmt, k.comCup, k.msi, k.comMsi, k.wfs, k.devol, k.disp, k.obs, 'SI', kamTxt,
      k.general, k.origen, s.x.estado, carga === undefined ? '' : carga, otros, e ? e.perdida / 100 : '']);
    objs.push({ sku: k.sku, detalles: k.detalles, min: min, negoc: k.negoc, cupon: k.cupon || 0, kam: kamTxt, estado: s.x.estado, fin: k.fin });
  });
  res.total = filas.length;
  return { filas: filas, objs: objs, res: res };
}

/** Escribe Killers activos si cambio. Devuelve { res, objs, cambio } (o null si no se pudo leer la hoja Killers). */
function kaActualizar_(forzar) {
  var a = kaConstruir_();
  if (!a) return null;
  var huella = sha256_(JSON.stringify(a.filas));
  var h0 = getSpreadsheet_().getSheetByName(KA_HOJA);
  if (!forzar && h0 && h0.getLastRow() > 1 && vdProp_(KA_PROP_HUELLA) === huella) { vdLatido_(KA_ETAPA, 'Killers activos al dia (sin cambios)', a.res); return { res: a.res, objs: a.objs, cambio: false }; }
  var antes = Number(vdProp_(KA_PROP_N, '0'));
  if (!forzar && antes >= 20 && a.filas.length < antes * 0.5 && vdProp_('KA_PARCIAL') !== String(a.filas.length)) {
    vdSetProp_('KA_PARCIAL', String(a.filas.length));
    avisoDia_('ka-parcial', 'WARN', KA_ETAPA, 'Killers activos bajaria de ' + antes + ' a ' + a.filas.length + ' SKUs: no se aplico. Si la proxima corrida trae lo mismo, se acepta.');
    return { res: a.res, objs: a.objs, cambio: false };
  }
  var h = getHoja_(KA_HOJA);
  var m = reescribirHoja_(h, KA_ENC, a.filas, { vacioOk: true, clave: 'ESCR_COLS|' + KA_HOJA });
  var n = a.filas.length;
  ['PRECIO', 'Precio negociado', 'Cupón de oferta', 'PAGAN', 'Carga'].forEach(function (x) { vdFormato_(h, m, x, n, '$#,##0'); });
  ['%', 'Comisión sobre el cupón killer', 'Comisión MSI'].forEach(function (x) { vdFormato_(h, m, x, n, '0.0%'); });
  ['Inicio de la oferta', 'Finalización de la oferta', 'Fecha formato'].forEach(function (x) { vdFormato_(h, m, x, n, 'dd/MM/yyyy HH:mm'); });
  vdFormato_(h, m, '% PERDIDA (site)', n, '0.00%');
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);
  vdSetProp_(KA_PROP_HUELLA, huella);
  vdSetProp_(KA_PROP_N, String(n));
  vdSetProp_('KA_PARCIAL', '');
  logOk_(KA_ETAPA, 'Killers activos: ' + a.res.vigentes + ' vigentes, ' + a.res.porIniciar + ' por iniciar', a.res);
  return { res: a.res, objs: a.objs, cambio: true };
}

/** Texto del resumen para el popup. */
function kaResumen_(r) {
  return 'Renglones: ' + r.total + '\n• Vigentes: ' + r.vigentes + '\n• Por iniciar: ' + r.porIniciar +
    '\n\nFuera por bajo minimo (perdida mayor al tope): ' + r.bajoMinimo + '\nFuera por cobro distinto: ' + r.cobroDistinto +
    '\nVencidos: ' + r.vencidos + (r.sinMinimo ? '\n⚠ Sin minimo en Precios EM / CVA: ' + r.sinMinimo : '');
}

/** Menu: rehace Killers activos y la comparacion contra Walmart. */
function killersActivosActualizar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(90000)) { dlgInfo_('Killers activos', 'Otra corrida tiene el candado. Espera un minuto y vuelve a darle.', 'aviso'); return; }
  try {
    toast_('Armando Killers activos...', 'KILLERS ACTIVOS', 30);
    peKillersSync_();
    var a = kaActualizar_(true);
    if (!a) { flushLog_(); dlgInfo_('Killers activos', 'La hoja Killers no trae SKU, NEGOCIADO y TERMINA. Corre primero ⬇️ Bajar killers del site.', 'aviso'); return; }
    var c = null;
    try { c = cwComparar_(a.objs, true); } catch (e) { logWarn_(CW_ETAPA, 'No se pudo comparar contra Walmart: ' + String(e.message).split('\n')[0]); }
    flushLog_();
    dlgInfo_('Killers activos', kaResumen_(a.res) + (c && !c.error ? '\n\nComparar Walmart: ' + cwTextoConteo_(c.cont) : (c && c.error ? '\n\n⚠ Comparar Walmart: ' + c.error : '')), 'ok');
  } catch (e) {
    logErr_(KA_ETAPA, 'No se pudo armar Killers activos: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    dlgInfo_('Killers activos', 'Fallo: ' + String(e.message).split('\n')[0], 'error');
  } finally { lock.releaseLock(); }
}

/** Cada hora (ventasProgramado): Killers activos -> Comparar Walmart -> Casos Walmart. */
function kaProgramado_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(VD_LOCK_MS)) { avisoDia_('ka-ocupado', 'INFO', KA_ETAPA, 'Killers activos saltada: otra corrida tenia el candado.'); return; }
  try {
    var a = kaActualizar_(false);
    if (a) {
      try { cwComparar_(a.objs, false); }
      catch (e) { avisoDia_('cw-error:' + String(e.message).slice(0, 80), 'WARN', CW_ETAPA, 'No se pudo comparar contra Walmart: ' + String(e.message).split('\n')[0]); }
    }
  } catch (e) {
    var msg = String(e.message).split('\n')[0].substring(0, 160);
    avisoDia_('ka-error:' + msg, 'WARN', KA_ETAPA, 'No se pudo armar Killers activos: ' + msg);
  } finally { try { flushLog_(); } catch (x) {} lock.releaseLock(); }
}
