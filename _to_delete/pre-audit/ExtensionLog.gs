/**
 * ============================================================
 *  Estado de la extension en el Log (etapa EXTENSION)
 * ============================================================
 *  La extension "Site Sheet - Cookie" manda su estado completo al terminar cada vuelta de guias (en punto y y media) y al abrir Chrome.
 *  Asi el Log dice, sin que nadie pegue nada: version, que modulo esta bien o mal (cookie, Odoo, cancelar, Seller Center, guias),
 *  hace cuanto corrio cada uno, la proxima vuelta de guias, cuantos pedidos espera la extension y cuantas cajas recuerda.
 *  Si pasa mas de ~45 min sin ninguna fila EXTENSION, la extension no esta corriendo (Chrome cerrado, PC dormida o extension apagada).
 *  No trae cookies, claves ni datos de clientes.
 */
var EXT_ETAPA = 'EXTENSION';
var EXT_PROP_ULTIMO = 'EXT_ULTIMO';
var EXT_MODULOS = { cookie: 'Cookie', odoo: 'Odoo', cancelar: 'Cancelar', seller: 'Seller Center', walmart: 'Cancelar Walmart', rastreo: 'Rastreo', guias: 'Guias' };

function extTexto_(x, n) { return String(x == null ? '' : x).replace(/[\r\n]+/g, ' ').slice(0, n || 120); }

/** Web App (accion 'ext_estado'): guarda el estado en el Log. */
function extRecibirEstado_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var e = (p && p.estado) || {};
  var limpio = {
    pc: extTexto_(e.pc, 40), turno: e.turno === 'trabaja' ? 'trabaja' : (e.turno === 'espera' ? 'en espera' : ''),
    version: extTexto_(e.version, 12), motivo: extTexto_(e.motivo, 30), hora: Number(e.hora) || new Date().getTime(),
    guiasActivo: !!e.gaActivo, guiasModo: e.gaModo === 'real' ? 'real' : 'prueba', pruebaOk: !!e.gaPruebaOk,
    proxGuias: Number(e.proxGuias) || 0, modulos: {}, esperando: Math.min(Number(e.nVistas) || 0, 999),
    cajas: Math.min(Number(e.nCajas) || 0, 999), intentadasHoy: Math.min(Number(e.nIntentadas) || 0, 999), fallosHoy: {}
  };
  var problemas = [], partes = [];
  var ahora = new Date().getTime();
  Object.keys(EXT_MODULOS).forEach(function (k) {
    var m = (e.modulos || {})[k];
    if (!m || typeof m !== 'object') { limpio.modulos[k] = null; partes.push(EXT_MODULOS[k] + ': sin dato'); return; }
    var edad = m.hora ? Math.max(0, Math.round((ahora - Number(m.hora)) / 60000)) : null;
    limpio.modulos[k] = { ok: m.ok !== false, texto: extTexto_(m.texto, 160), haceMin: edad };
    partes.push(EXT_MODULOS[k] + (m.ok === false ? ' ❌' : ' ✅') + (edad !== null ? ' (hace ' + edad + ' min)' : '') + ': ' + extTexto_(m.texto, 80));
    if (m.ok === false && (limpio.turno !== 'en espera' || k === 'cookie' || k === 'odoo')) problemas.push(EXT_MODULOS[k]);   // una computadora en espera solo avisa de lo que si hace (cookie y Odoo)
  });
  Object.keys(e.fallosHoy || {}).slice(0, 20).forEach(function (po) {
    if (/^\d{9,20}$/.test(po)) limpio.fallosHoy[po] = Math.min(Number(e.fallosHoy[po]) || 0, 99);
  });
  if (e.repFallo && typeof e.repFallo === 'object') {
    limpio.repFallo = { haceMin: Math.min(Number(e.repFallo.hace_min) || 0, 99999), err: extTexto_(e.repFallo.err, 60) };
    if (limpio.repFallo.haceMin <= 60) { problemas.push('reporte de guias'); partes.push('❌ el reporte de guias NO llego al Sheet hace ' + limpio.repFallo.haceMin + ' min (' + limpio.repFallo.err + ')'); }
  }
  var cab = (limpio.pc ? limpio.pc + (limpio.turno ? ' (' + limpio.turno + ')' : '') + ' · ' : '') + 'v' + (limpio.version || '?') + ' · guias ' + (limpio.guiasActivo ? (limpio.guiasModo === 'real' ? 'AUTOMATICAS (compra)' : 'solo prueba') : 'APAGADAS')
    + (limpio.proxGuias ? ' · proxima vuelta ' + Utilities.formatDate(new Date(limpio.proxGuias), TZ, 'HH:mm') : '')
    + ' · esperando ' + limpio.esperando + ' pedido(s) · cajas recordadas ' + limpio.cajas;
  var texto = cab + ' | ' + partes.join(' | ');
  try { props_().setProperty(EXT_PROP_ULTIMO, JSON.stringify(limpio)); } catch (x) {}
  if (problemas.length) logWarn_(EXT_ETAPA, texto, limpio); else logOk_(EXT_ETAPA, texto, limpio);
  flushLog_();
  return { ok: true, alertas: extAlertas_() };
}

/**
 * ALERTAS (19-nov): errores del Sheet que la persona debe ver SIN abrir el Log. Misma regla que la hoja Salud (❌ = el ultimo ERROR es mas nuevo que la ultima corrida buena,
 * y fue hace <= ventanaErrorH horas). Se entregan a la extension en cada vuelta (guias_lista y ext_estado): icono rojo "!" y franja roja en su ventana.
 * Pura: eventos [[ms, nivel, etapa, mensaje]] y ahora -> ["ETAPA: mensaje (hace X)", ...] (maximo 5).
 */
function extAlertasDe_(eventos, ahora) {
  var filas = saludCalcular_(eventos, ahora), out = [];
  filas.forEach(function (f) {
    if (f[5] !== '❌') return;   // col-fija: fila en memoria de saludCalcular_
    var hace = f[4] instanceof Date ? saludMin_((ahora - f[4].getTime()) / 60000) : '';   // col-fija: fila en memoria de saludCalcular_
    out.push(extTexto_(f[0] + ': ' + f[6] + (hace ? ' (hace ' + hace + ')' : ''), 170));   // col-fija: fila en memoria de saludCalcular_
  });
  return out.slice(0, 5);
}

/**
 * Alertas FIJAS: avisos de protecciones que frenaron algo (candado de precio erroneo, tabla de minimos incompleta, fallo al pasar a Cancelaciones).
 * NO se quitan porque otra corrida del mismo proceso salga bien: duran EXT_ALERTA_FIJA_HORAS horas y se renuevan si vuelve a pasar.
 */
var EXT_PROP_ALERTAS = 'EXT_ALERTAS_FIJAS';
var EXT_ALERTA_FIJA_HORAS = 6;

/** Pura: objeto {clave: {t, x}} y ahora -> textos vigentes (los mas nuevos primero). */
function extAlertasFijasDe_(o, ahora) {
  var out = [];
  Object.keys(o || {}).forEach(function (k) {
    var e = o[k];
    if (e && e.x && ahora - Number(e.t) <= EXT_ALERTA_FIJA_HORAS * 3600000) out.push({ t: Number(e.t), x: String(e.x) });
  });
  out.sort(function (a, b) { return b.t - a.t; });
  return out.map(function (e) { return e.x; });
}

/** Quita una alerta fija (cuando lo que la causo ya se resolvio). */
function extAlertaFijaQuitar_(clave) {
  try {
    var o = JSON.parse(props_().getProperty(EXT_PROP_ALERTAS) || '{}') || {};
    if (o[String(clave)]) { delete o[String(clave)]; props_().setProperty(EXT_PROP_ALERTAS, JSON.stringify(o)); }
  } catch (e) {}
}

/** Quita las alertas fijas cuya clave cumple el patron (p. ej. los avisos viejos de una guia por renglon). */
function extAlertasFijasQuitarSi_(re) {
  try {
    var o = JSON.parse(props_().getProperty(EXT_PROP_ALERTAS) || '{}') || {}, n = 0;
    Object.keys(o).forEach(function (k) { if (re.test(k)) { delete o[k]; n++; } });
    if (n) props_().setProperty(EXT_PROP_ALERTAS, JSON.stringify(o));
    return n;
  } catch (e) { return 0; }
}

function extAlertaFija_(clave, texto) {
  try {
    var o = {};
    try { o = JSON.parse(props_().getProperty(EXT_PROP_ALERTAS) || '{}') || {}; } catch (e1) { o = {}; }
    var ahora = Date.now();
    Object.keys(o).forEach(function (k) { if (!o[k] || ahora - Number(o[k].t) > EXT_ALERTA_FIJA_HORAS * 3600000) delete o[k]; });
    o[String(clave)] = { t: ahora, x: extTexto_(texto, 170) };
    props_().setProperty(EXT_PROP_ALERTAS, JSON.stringify(o));
  } catch (e) {}
}

/** Alertas activas leyendo el final del Log. Nunca truena: si algo falla devuelve [] y no frena a la extension. */
function extAlertas_() {
  try {
    var log = SpreadsheetApp.getActive().getSheetByName('Log');
    if (!log || log.getLastRow() < 2) return [];
    var n = Math.min(2500, log.getLastRow() - 1);
    var v = log.getRange(log.getLastRow() - n + 1, 1, n, 4).getValues();   // col-fija: fila en memoria / columnas del propio Log
    var ev = v.map(function (r) { return [saludHora_(r[0]), r[1], r[2], r[3]]; });   // col-fija: fila en memoria / columnas del propio Log
    var fijas = []; try { fijas = extAlertasFijasDe_(JSON.parse(props_().getProperty(EXT_PROP_ALERTAS) || '{}'), Date.now()); } catch (e2) { fijas = []; }
    return fijas.concat(extAlertasDe_(ev, Date.now())).slice(0, 5);
  } catch (e) { return []; }
}

/** Lo ultimo que dijo la extension (o null). */
function extUltimo_() {
  try { var j = props_().getProperty(EXT_PROP_ULTIMO); return j ? JSON.parse(j) : null; } catch (e) { return null; }
}
