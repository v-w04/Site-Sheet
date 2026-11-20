/**
 * ============================================================
 *  Rastreo: lo que dice ODOO del empaque de cada guia — hoja PAQUETERIA (20-nov-2026)
 * ============================================================
 *
 *  Ella (20-nov): "mira en Odoo… ¿tú no puedes entrar y extraer para leer las situaciones?".
 *  Cuando la paqueteria no tiene historial de una guia, la pregunta es: ¿salio de bodega o no?
 *  Odoo ya lo sabe: en la orden de venta (nombre = orden de compra 609) el webhook de empaque deja un mensaje:
 *    "Empacó: Daniel Robles - 15/11/2026 22:18 | Serie/Venta: … | Picking: WH/OUT/140684 | Cant: 1 | Guía escaneada: MXFDD… | 9 fotos…"
 *  Aqui se lee ese mensaje (SOLO LECTURA, con la sesion de Odoo que manda la extension) y se escribe en PAQUETERIA:
 *    Empaco · Fecha empaque · Picking salida · Guia escaneada en bodega (si no coincide con la guia: "(NO COINCIDE)").
 *  Asi una guia sin movimiento en BigSmart se distingue: empacada y escaneada en bodega -> reclamar a la paqueteria;
 *  sin empaque en Odoo -> el paquete sigue en bodega.
 *  Nunca escribe ni cancela nada en Odoo. Corre desde rastreo_lista (cada 10 min) como maximo cada RQO_CADA_MIN minutos.
 *  Prefijo rqo / RQO_.
 */

var RQO_ENC = ['Empaco', 'Fecha empaque', 'Picking salida', 'Guia escaneada en bodega'];
var RQO_CADA_MIN = 20;     // como maximo una lectura de Odoo cada 20 min
var RQO_MAX = 60;          // ordenes por lectura

/** Saca los datos del mensaje de empaque (HTML o texto). null si no es un mensaje de empaque. */
function rqoParse_(body) {
  var s = String(body || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  var m = s.match(/Empac[oó]\s*:\s*([^|]+?)\s+-\s+(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2})/i);
  if (!m) return null;
  var pk = s.match(/Picking\s*:\s*([A-Z0-9]+\/[A-Z]+\/\d+)/i), ge = s.match(/Gu[ií]a\s+escaneada\s*:\s*([A-Za-z0-9]+)/i);
  return { empaco: m[1].trim(), fechaTxt: m[2], picking: pk ? pk[1] : '', guia: ge ? ge[1] : '' };
}

/** Fecha de Odoo ('2026-11-15 22:18:05', UTC) -> Date. */
function rqoFechaOdoo_(s) {
  var d = new Date(String(s || '').trim().replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? '' : d;
}

/** Llena las columnas de Odoo en PAQUETERIA para las guias que aun no las tienen. Devuelve cuantas lleno. Solo lectura en Odoo. */
function rqoEmpaque_(forzar) {
  if (typeof odooApagado_ === 'function' && odooApagado_()) return 0;
  var cache = CacheService.getScriptCache();
  if (!forzar && cache.get('rqo_ult')) return 0;
  cache.put('rqo_ult', '1', RQO_CADA_MIN * 60);
  var h = peHojaAsegurar_(RQ_HOJA, RQ_ENC.concat(RQO_ENC)), t = peTabla_(RQ_HOJA);
  if (!t || !t.filas.length) return 0;
  var iG = peCol_(t, ['Guia']), iO = peCol_(t, ['Orden de compra (609)']), iE = peCol_(t, ['Empaco']), iEf = peCol_(t, ['Estado final']), iP = peCol_(t, ['Paqueteria']);
  if (iG < 0 || iO < 0 || iE < 0) return 0;
  var porOrden = {};
  t.filas.forEach(function (f, i) {
    if (String(f[iE] || '').trim()) return;                                         // ya se leyo
    if (iEf >= 0 && String(f[iEf] || '').trim() === 'ENTREGADO') return;            // entregada: no hace falta
    if (iP >= 0 && String(f[iP] || '') === 'PAQUETERIA DESCONOCIDA') return;
    var o = prDigitos_(f[iO]);
    if (o) (porOrden[o] = porOrden[o] || []).push(i);
  });
  var ordenes = Object.keys(porOrden).slice(0, RQO_MAX);
  if (!ordenes.length) return 0;
  var vs = odooExecute_('sale.order', 'search_read', [[['name', 'in', ordenes]]], { fields: ['name'] }), nomPorId = {};
  vs.forEach(function (v) { nomPorId[v.id] = String(v.name); });
  var ids = Object.keys(nomPorId).map(Number);
  if (!ids.length) return 0;
  var msgs = odooExecute_('mail.message', 'search_read', [[['model', '=', 'sale.order'], ['res_id', 'in', ids], ['body', 'ilike', 'Empac']]],
    { fields: ['res_id', 'body', 'date'], order: 'date desc' });
  var datos = {};
  msgs.forEach(function (m) {
    var nom = nomPorId[m.res_id]; if (!nom || datos[nom]) return;                   // el mas reciente manda
    var x = rqoParse_(m.body); if (!x) return;
    x.fecha = rqoFechaOdoo_(m.date) || x.fechaTxt;
    datos[nom] = x;
  });
  var m = ubicarColumnas_(h, RQO_ENC, 1), n = 0;
  Object.keys(datos).forEach(function (o) {
    var x = datos[o];
    porOrden[o].forEach(function (i) {
      var g = String(t.filas[i][iG] || '').replace(/^'/, '').trim();
      var ge = x.guia ? (x.guia + (g && x.guia.toUpperCase() !== g.toUpperCase() ? ' (NO COINCIDE)' : '')) : '';
      var val = { 'Empaco': x.empaco, 'Fecha empaque': x.fecha, 'Picking salida': x.picking, 'Guia escaneada en bodega': ge ? "'" + ge : '' };
      RQO_ENC.forEach(function (e) { var c = escrCol_(m, e); if (c) h.getRange(i + 2, c).setValue(val[e]); });
      n++;
    });
  });
  if (n) logInfo_(RQ_ETAPA, 'PAQUETERIA: empaque leido de Odoo para ' + n + ' guia(s) (quien empaco, cuando y guia escaneada)');
  return n;
}
