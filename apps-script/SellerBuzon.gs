/**
 * ============================================================
 *  Buzon de Seller Center — solo un CONTADOR (sin leer, por responder)
 * ============================================================
 *
 *  La extension "Site Sheet - Cookie" abre el buzon de Seller Center con tu sesion, lee en la pagina SOLO los dos
 *  numeros del paginador ("1-25 de N") con el filtro "sin leer" y con "por responder", y los manda aqui (POST
 *  'seller_buzon'). NO se lee, abre ni guarda ningun mensaje (traen datos de clientes). No hay hoja nueva: el
 *  resultado queda en el Log (etapa BUZON: lo ve Salud y el reporte) y en la propiedad SC_BUZON.
 * ============================================================
 */

var BZ_ETAPA = 'BUZON', BZ_PROP = 'SC_BUZON';

/** Numero valido del contador (entero 0..99999) o null. */
function bzNum_(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return (isFinite(n) && n >= 0 && n < 100000) ? Math.floor(n) : null;
}

/** {sinLeer, porResponder} limpio; null si no trae ningun numero valido. */
function bzLimpiar_(p) {
  var s = bzNum_(p && p.sinLeer), r = bzNum_(p && p.porResponder);
  if (s === null && r === null) return null;
  return { sinLeer: s, porResponder: r };
}

/** Texto corto para el Log / reporte. */
function bzTexto_(b) {
  var partes = [];
  partes.push((b.sinLeer === null ? '?' : b.sinLeer) + ' sin leer');
  partes.push((b.porResponder === null ? '?' : b.porResponder) + ' por responder');
  return 'Buzon Seller Center (ultimos 7 dias): ' + partes.join(', ');
}

/** Ultimo contador guardado: {sinLeer, porResponder, hora} o null. */
function bzLeer_() {
  try { var t = props_().getProperty(BZ_PROP); return t ? JSON.parse(t) : null; } catch (e) { return null; }
}

/** POST 'seller_buzon' {clave, sinLeer, porResponder} -> {ok}. */
function bzRecibir_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var b = bzLimpiar_(p);
  if (!b) return { ok: true, guardado: false };
  try {
    var antes = bzLeer_();
    // un numero que no se pudo leer esta vez conserva el ultimo bueno
    if (antes) { if (b.sinLeer === null) b.sinLeer = antes.sinLeer; if (b.porResponder === null) b.porResponder = antes.porResponder; }
    var cambio = !antes || antes.sinLeer !== b.sinLeer || antes.porResponder !== b.porResponder;
    b.hora = Date.now();
    props_().setProperty(BZ_PROP, JSON.stringify(b));
    if (cambio) logOk_(BZ_ETAPA, bzTexto_(b)); else vdLatido_(BZ_ETAPA, bzTexto_(b) + ' (sin cambios)');
    flushLog_();
    return { ok: true, guardado: true, cambio: cambio };
  } catch (e) {
    logErr_(BZ_ETAPA, 'No se pudo guardar el buzon: ' + String(e.message).split('\n')[0]); flushLog_();
    return { ok: false, error: 'no_se_pudo_guardar' };
  }
}
