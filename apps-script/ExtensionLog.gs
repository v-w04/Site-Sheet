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
var EXT_MODULOS = { cookie: 'Cookie', odoo: 'Odoo', cancelar: 'Cancelar', seller: 'Seller Center', guias: 'Guias' };

function extTexto_(x, n) { return String(x == null ? '' : x).replace(/[\r\n]+/g, ' ').slice(0, n || 120); }

/** Web App (accion 'ext_estado'): guarda el estado en el Log. */
function extRecibirEstado_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var e = (p && p.estado) || {};
  var limpio = {
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
    if (m.ok === false) problemas.push(EXT_MODULOS[k]);
  });
  Object.keys(e.fallosHoy || {}).slice(0, 20).forEach(function (po) {
    if (/^\d{9,20}$/.test(po)) limpio.fallosHoy[po] = Math.min(Number(e.fallosHoy[po]) || 0, 99);
  });
  if (e.repFallo && typeof e.repFallo === 'object') {
    limpio.repFallo = { haceMin: Math.min(Number(e.repFallo.hace_min) || 0, 99999), err: extTexto_(e.repFallo.err, 60) };
    if (limpio.repFallo.haceMin <= 60) { problemas.push('reporte de guias'); partes.push('❌ el reporte de guias NO llego al Sheet hace ' + limpio.repFallo.haceMin + ' min (' + limpio.repFallo.err + ')'); }
  }
  var cab = 'v' + (limpio.version || '?') + ' · guias ' + (limpio.guiasActivo ? (limpio.guiasModo === 'real' ? 'AUTOMATICAS (compra)' : 'solo prueba') : 'APAGADAS')
    + (limpio.proxGuias ? ' · proxima vuelta ' + Utilities.formatDate(new Date(limpio.proxGuias), TZ, 'HH:mm') : '')
    + ' · esperando ' + limpio.esperando + ' pedido(s) · cajas recordadas ' + limpio.cajas;
  var texto = cab + ' | ' + partes.join(' | ');
  try { props_().setProperty(EXT_PROP_ULTIMO, JSON.stringify(limpio)); } catch (x) {}
  if (problemas.length) logWarn_(EXT_ETAPA, texto, limpio); else logOk_(EXT_ETAPA, texto, limpio);
  flushLog_();
  return { ok: true };
}

/** Lo ultimo que dijo la extension (o null). */
function extUltimo_() {
  try { var j = props_().getProperty(EXT_PROP_ULTIMO); return j ? JSON.parse(j) : null; } catch (e) { return null; }
}
