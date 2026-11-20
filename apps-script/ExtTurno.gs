/**
 * ============================================================
 *  Turno de la extension entre varias computadoras (20-nov-2026)
 * ============================================================
 *  Ella quiere poder tener la extension en varias computadoras a la vez para que nunca se caiga. Todas mandan cookie y
 *  sesion de Odoo; lo que HACE cosas (cancelar, guias, Seller Center, rastreo) solo lo corre la computadora con el TURNO.
 *  Cada extension pregunta (accion ext_turno) antes de sus corridas automaticas. La que tiene el turno lo renueva cada vez;
 *  si deja de preguntar EXT_TURNO_MIN minutos (apagada, sin internet), la siguiente que pregunte se lo queda y queda en el Log.
 *  Prefijo extTurno / EXT_TURNO_.
 */
var EXT_TURNO_PROP = 'EXT_TURNO_V1', EXT_PCS_PROP = 'EXT_PCS_V1', EXT_TURNO_MIN = 15;

/** Pura. cur = {id, nombre, hasta, desde} | null. Devuelve { nuevo, lider, cambio, antes }. */
function extTurnoDecidir_(cur, id, nombre, ahora) {
  var libre = !cur || !cur.id || !(Number(cur.hasta) > ahora);
  if (cur && cur.id === id) return { nuevo: { id: id, nombre: nombre, hasta: ahora + EXT_TURNO_MIN * 60000, desde: cur.desde || ahora }, lider: true, cambio: false, antes: null };
  if (libre) return { nuevo: { id: id, nombre: nombre, hasta: ahora + EXT_TURNO_MIN * 60000, desde: ahora }, lider: true, cambio: true, antes: cur && cur.id ? cur.nombre : null };
  return { nuevo: cur, lider: false, cambio: false, antes: null };
}

/** Accion ext_turno: p = {clave, id, nombre}. Devuelve {ok, lider, quien, pcs}. */
function extTurno_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var id = String(p.id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  if (id.length < 8) return { ok: false, error: 'sin_id' };
  var nombre = extTexto_(p.nombre, 40).replace(/[<>]/g, '') || ('PC-' + id.slice(0, 4).toUpperCase());
  var props = props_(), ahora = Date.now();
  var leer = function (k) { try { return JSON.parse(props.getProperty(k) || 'null'); } catch (e) { return null; } };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { var c0 = leer(EXT_TURNO_PROP); return { ok: true, lider: !!(c0 && c0.id === id), quien: c0 ? c0.nombre : '', ocupado: true }; }
  try {
    var cur = leer(EXT_TURNO_PROP), d = extTurnoDecidir_(cur, id, nombre, ahora);
    if (d.lider) props.setProperty(EXT_TURNO_PROP, JSON.stringify(d.nuevo));
    var pcs = leer(EXT_PCS_PROP) || {};
    pcs[id] = { nombre: nombre, visto: ahora };
    Object.keys(pcs).forEach(function (k) { if (ahora - Number(pcs[k].visto) > 7 * 86400000) delete pcs[k]; });
    props.setProperty(EXT_PCS_PROP, JSON.stringify(pcs));
    var activas = Object.keys(pcs).filter(function (k) { return ahora - Number(pcs[k].visto) <= 30 * 60000; }).length;
    if (d.cambio) {
      if (d.antes) logWarn_(EXT_ETAPA, 'Turno de la extension: ahora trabaja ' + nombre + ' (' + d.antes + ' dejo de responder ' + EXT_TURNO_MIN + ' min)');
      else logInfo_(EXT_ETAPA, 'Turno de la extension: trabaja ' + nombre);
      flushLog_();
    }
    return { ok: true, lider: d.lider, quien: d.lider ? nombre : (cur ? cur.nombre : ''), pcs: activas };
  } finally { lock.releaseLock(); }
}
