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

/*  ORDEN DE TRABAJO (25-nov-2026, pedido de ella): primero DELL SERVIDOR; si no esta, FORCEV; y luego FCORSAIR.
 *  Se reconoce por el "Nombre de esta computadora" de la extension (Opciones), sin importar mayusculas ni espacios.
 *  Si regresa una computadora de mejor lugar, no le quita el turno de golpe (se pisarian dos corridas de guias):
 *  deja una peticion ("cede") y la que trabaja SUELTA el turno en su siguiente pregunta (cada ~1 min), antes de otra corrida.
 *  Una computadora con nombre fuera de la lista va al final y empata con las demas desconocidas (gana la primera que pregunta).
 *  EXT_TURNO_VIVA_MIN: una computadora que pregunto hace menos de esto cuenta como prendida (la extension pregunta cada ~1 min). */
var EXT_TURNO_ORDEN = ['DELL', 'FORCEV', 'FCORSAIR'], EXT_TURNO_VIVA_MIN = 6, EXT_TURNO_CEDE_MIN = 30;

/** Pura. Lugar de la computadora en el orden (0 = primera). Desconocida = 99. */
function extTurnoRango_(nombre) {
  var n = String(nombre || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (var i = 0; i < EXT_TURNO_ORDEN.length; i++) if (n.indexOf(EXT_TURNO_ORDEN[i]) >= 0) return i;
  return 99;
}

/** Pura. cur = {id, nombre, hasta, desde, cede?:{id,nombre,desde}, para?} | null; pcs = {id: {nombre, visto}} (opcional).
 *  Devuelve { nuevo, lider, cambio, antes, guardar, quien, evento }. evento: 'cede-pedido' | 'cede-suelta' | null. */
function extTurnoDecidir_(cur, id, nombre, ahora, pcs) {
  pcs = pcs || {};
  var mio = extTurnoRango_(nombre), minV = EXT_TURNO_VIVA_MIN * 60000;
  var valido = !!(cur && cur.id && Number(cur.hasta) > ahora);
  var nuevoTurno = function (desde) { return { id: id, nombre: nombre, hasta: ahora + EXT_TURNO_MIN * 60000, desde: desde || ahora }; };
  // Computadora de MEJOR lugar que esta prendida ahora (la que tenia el turno y ya vencio no cuenta: esta apagada).
  var mejor = null;
  Object.keys(pcs).forEach(function (k) {
    if (k === id || !pcs[k]) return;
    if (cur && cur.id === k && !valido) return;
    if (ahora - Number(pcs[k].visto) > minV) return;
    var r = extTurnoRango_(pcs[k].nombre);
    if (r < mio && (!mejor || r < mejor.r)) mejor = { id: k, nombre: pcs[k].nombre, r: r, visto: Number(pcs[k].visto) };
  });
  var res = function (o) { o.guardar = !!o.guardar; o.cambio = !!o.cambio; o.antes = o.antes || null; o.evento = o.evento || null; return o; };

  if (cur && cur.id === id) {                                       // yo tengo (o tenia) el turno
    // suelta solo si la mejor ya pregunto OTRA vez despues de pedirlo (una prendida de unos segundos no le quita el turno a nadie)
    if (valido && cur.cede && mejor && ahora - Number(cur.cede.desde) <= EXT_TURNO_CEDE_MIN * 60000 && mejor.visto > Number(cur.cede.desde) + 30000) {
      return res({ nuevo: { id: '', nombre: '', hasta: 0, desde: 0, para: cur.cede.nombre }, lider: false, quien: cur.cede.nombre, guardar: true, evento: 'cede-suelta' });
    }
    if (!valido && mejor) return res({ nuevo: cur, lider: false, quien: mejor.nombre });   // yo ya estaba vencido y hay una mejor prendida: que la tome ella
    var renovado = nuevoTurno(cur.desde);                            // renuevo; la peticion de una mejor SE CONSERVA mientras siga prendida (si se apago, se borra)
    if (cur.cede && mejor) renovado.cede = cur.cede;
    return res({ nuevo: renovado, lider: true, quien: nombre, guardar: true });
  }
  if (!valido) {                                                      // el turno esta libre
    if (mejor) return res({ nuevo: cur, lider: false, quien: mejor.nombre });
    return res({ nuevo: nuevoTurno(), lider: true, quien: nombre, cambio: true, antes: cur && cur.id ? cur.nombre : null, guardar: true });
  }
  if (mio < extTurnoRango_(cur.nombre)) {                             // otra trabaja y yo tengo mejor lugar: pido el turno
    if (cur.cede && extTurnoRango_(cur.cede.nombre) <= mio) return res({ nuevo: cur, lider: false, quien: cur.nombre });   // ya la pidio otra igual o mejor: no se pisan (si no, nunca se cumple)
    var pedido = { id: cur.id, nombre: cur.nombre, hasta: cur.hasta, desde: cur.desde, cede: { id: id, nombre: nombre, desde: ahora } };
    return res({ nuevo: pedido, lider: false, quien: cur.nombre, guardar: true, evento: 'cede-pedido' });
  }
  return res({ nuevo: cur, lider: false, quien: cur.nombre });
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
    var cur = leer(EXT_TURNO_PROP), pcs = leer(EXT_PCS_PROP) || {}, d = extTurnoDecidir_(cur, id, nombre, ahora, pcs);
    if (d.guardar) props.setProperty(EXT_TURNO_PROP, JSON.stringify(d.nuevo));
    pcs[id] = { nombre: nombre, visto: ahora };
    Object.keys(pcs).forEach(function (k) { if (ahora - Number(pcs[k].visto) > 7 * 86400000) delete pcs[k]; });
    props.setProperty(EXT_PCS_PROP, JSON.stringify(pcs));
    var activas = Object.keys(pcs).filter(function (k) { return ahora - Number(pcs[k].visto) <= 30 * 60000; }).length;
    if (d.evento === 'cede-pedido') { logInfo_(EXT_ETAPA, 'Turno de la extension: ' + nombre + ' esta prendida y le toca primero (orden ' + EXT_TURNO_ORDEN.join(' > ') + '); ' + (cur ? cur.nombre : '') + ' lo suelta en su siguiente vuelta'); flushLog_(); }
    else if (d.evento === 'cede-suelta') { logInfo_(EXT_ETAPA, 'Turno de la extension: ' + nombre + ' lo suelta para ' + (d.quien || 'la computadora que le toca')); flushLog_(); }
    else if (d.cambio) {
      if (d.antes) logWarn_(EXT_ETAPA, 'Turno de la extension: ahora trabaja ' + nombre + ' (' + d.antes + ' dejo de responder ' + EXT_TURNO_MIN + ' min)');
      else logInfo_(EXT_ETAPA, 'Turno de la extension: trabaja ' + nombre + (cur && cur.para === nombre ? ' (le tocaba por el orden)' : ''));
      flushLog_();
    }
    return { ok: true, lider: d.lider, quien: d.quien || (cur ? cur.nombre : ''), pcs: activas };
  } finally { lock.releaseLock(); }
}
