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
var EXT_TURNO_PROP = 'EXT_TURNO_V1', EXT_PCS_PROP = 'EXT_PCS_V1', EXT_ORDEN_PROP = 'EXT_ORDEN_V1', EXT_TURNO_MIN = 15;

/*  ORDEN DE TRABAJO (25-nov-2026, pedido de ella): primero DELL SERVIDOR; si no esta, FORCEV; y luego FCORSAIR.
 *  Se reconoce por el "Nombre de esta computadora" de la extension (Opciones), sin importar mayusculas ni espacios.
 *  Si regresa una computadora de mejor lugar, no le quita el turno de golpe (se pisarian dos corridas de guias):
 *  deja una peticion ("cede") y la que trabaja SUELTA el turno en su siguiente pregunta (cada ~1 min), antes de otra corrida.
 *  Una computadora con nombre fuera de la lista va al final y empata con las demas desconocidas (gana la primera que pregunta).
 *  EXT_TURNO_VIVA_MIN: una computadora que pregunto hace menos de esto cuenta como prendida (la extension pregunta cada ~1 min). */
var EXT_TURNO_ORDEN = ['DELL', 'FORCEV', 'FCORSAIR'], EXT_TURNO_VIVA_MIN = 6, EXT_TURNO_CEDE_MIN = 30;

/*  ORDEN ELEGIDO POR ELLA (25-nov-2026): desde la extension (Opciones > Orden de las computadoras) mueve las computadoras con
 *  flechas y se guarda aqui (EXT_ORDEN_PROP = lista de ids, la primera es la que trabaja). Si no ha elegido nada, o una computadora
 *  no esta en su lista, se usa el orden por nombre de arriba (las de su lista van antes que las que no estan). */

/** Pura. Lugar de la computadora en el orden (0 = primera). Con la lista de ids elegida por ella (`orden`) manda esa; si no, por nombre.
 *  Las que no estan en su lista van despues (10 + lugar por nombre). Desconocida = 99 (o 109 si ella ya eligio una lista). */
function extTurnoRango_(nombre, id, orden) {
  var tiene = orden && orden.length;
  if (tiene && id) { var ix = orden.indexOf(String(id)); if (ix >= 0) return ix; }
  var n = String(nombre || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), base = 99;
  for (var i = 0; i < EXT_TURNO_ORDEN.length; i++) if (n.indexOf(EXT_TURNO_ORDEN[i]) >= 0) { base = i; break; }
  return tiene ? 10 + base : base;
}

/** Pura. cur = {id, nombre, hasta, desde, cede?:{id,nombre,desde}, para?} | null; pcs = {id: {nombre, visto}} (opcional).
 *  Devuelve { nuevo, lider, cambio, antes, guardar, quien, evento }. evento: 'cede-pedido' | 'cede-suelta' | null. */
function extTurnoDecidir_(cur, id, nombre, ahora, pcs, orden) {
  pcs = pcs || {};
  var rk = function (n, i) { return extTurnoRango_(n, i, orden); };
  var mio = rk(nombre, id), minV = EXT_TURNO_VIVA_MIN * 60000;
  var valido = !!(cur && cur.id && Number(cur.hasta) > ahora);
  var nuevoTurno = function (desde) { return { id: id, nombre: nombre, hasta: ahora + EXT_TURNO_MIN * 60000, desde: desde || ahora }; };
  // Computadora de MEJOR lugar que esta prendida ahora (la que tenia el turno y ya vencio no cuenta: esta apagada).
  var mejor = null;
  Object.keys(pcs).forEach(function (k) {
    if (k === id || !pcs[k]) return;
    if (cur && cur.id === k && !valido) return;
    if (ahora - Number(pcs[k].visto) > minV) return;
    var r = rk(pcs[k].nombre, k);
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
  if (mio < rk(cur.nombre, cur.id)) {                             // otra trabaja y yo tengo mejor lugar: pido el turno
    if (cur.cede && rk(cur.cede.nombre, cur.cede.id) <= mio) return res({ nuevo: cur, lider: false, quien: cur.nombre });   // ya la pidio otra igual o mejor: no se pisan (si no, nunca se cumple)
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
    var cur = leer(EXT_TURNO_PROP), pcs = leer(EXT_PCS_PROP) || {}, orden = leer(EXT_ORDEN_PROP), d = extTurnoDecidir_(cur, id, nombre, ahora, pcs, orden);
    if (d.guardar) props.setProperty(EXT_TURNO_PROP, JSON.stringify(d.nuevo));
    pcs[id] = { nombre: nombre, visto: ahora };
    Object.keys(pcs).forEach(function (k) { if (ahora - Number(pcs[k].visto) > 7 * 86400000) delete pcs[k]; });
    props.setProperty(EXT_PCS_PROP, JSON.stringify(pcs));
    var activas = Object.keys(pcs).filter(function (k) { return ahora - Number(pcs[k].visto) <= 30 * 60000; }).length;
    if (d.evento === 'cede-pedido') { logInfo_(EXT_ETAPA, 'Turno de la extension: ' + nombre + ' esta prendida y le toca primero (orden ' + extOrdenTexto_(pcs, orden) + '); ' + (cur ? cur.nombre : '') + ' lo suelta en su siguiente vuelta'); flushLog_(); }
    else if (d.evento === 'cede-suelta') { logInfo_(EXT_ETAPA, 'Turno de la extension: ' + nombre + ' lo suelta para ' + (d.quien || 'la computadora que le toca')); flushLog_(); }
    else if (d.cambio) {
      if (d.antes) logWarn_(EXT_ETAPA, 'Turno de la extension: ahora trabaja ' + nombre + ' (' + d.antes + ' dejo de responder ' + EXT_TURNO_MIN + ' min)');
      else logInfo_(EXT_ETAPA, 'Turno de la extension: trabaja ' + nombre + (cur && cur.para === nombre ? ' (le tocaba por el orden)' : ''));
      flushLog_();
    }
    return { ok: true, lider: d.lider, quien: d.quien || (cur ? cur.nombre : ''), pcs: activas };
  } finally { lock.releaseLock(); }
}

/** Texto del orden vigente para el Log: "DELL SERVIDOR > FORCEV > FCORSAIR". */
function extOrdenTexto_(pcs, orden) {
  var l = extOrdenLista_(pcs, orden, Date.now());
  return l.length ? l.map(function (x) { return x.nombre; }).join(' > ') : EXT_TURNO_ORDEN.join(' > ');
}

/** Pura. Computadoras vistas en los ultimos 7 dias, en el orden en que trabajarian: [{id, nombre, visto, activa, lugar}]. */
function extOrdenLista_(pcs, orden, ahora) {
  var out = Object.keys(pcs || {}).filter(function (k) { return pcs[k]; }).map(function (k) {
    return { id: k, nombre: pcs[k].nombre, visto: Number(pcs[k].visto), activa: ahora - Number(pcs[k].visto) <= EXT_TURNO_VIVA_MIN * 60000, lugar: extTurnoRango_(pcs[k].nombre, k, orden) };
  });
  out.sort(function (a, b) { return a.lugar - b.lugar || (String(a.nombre) < String(b.nombre) ? -1 : 1); });
  return out;
}

function extOrdenResp_(props, ahora) {
  var leer = function (k) { try { return JSON.parse(props.getProperty(k) || 'null'); } catch (e) { return null; } };
  var cur = leer(EXT_TURNO_PROP), pcs = leer(EXT_PCS_PROP) || {}, orden = leer(EXT_ORDEN_PROP);
  var valido = !!(cur && cur.id && Number(cur.hasta) > ahora);
  var lista = extOrdenLista_(pcs, orden, ahora).map(function (x) { x.turno = !!(valido && cur.id === x.id); x.elegido = !!(orden && orden.indexOf(x.id) >= 0); return x; });
  return { ok: true, pcs: lista, quien: valido ? cur.nombre : '', elegido: !!(orden && orden.length) };
}

/** Accion ext_orden_ver: p = {clave}. Lista de computadoras en su orden de trabajo y quien tiene el turno. */
function extOrdenVer_(p) {
  var err = csAutorizar_(p); if (err) return err;
  return extOrdenResp_(props_(), Date.now());
}

/** Accion ext_pc_borrar: p = {clave, id}. Quita una computadora de la lista (y del orden elegido). Solo las que NO responden:
 *  una prendida volveria a registrarse sola en su siguiente pregunta. Si tenia el turno (ya vencido) o lo estaba pidiendo, se limpia. */
function extPcBorrar_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var props = props_(), ahora = Date.now();
  var id = String(p.id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  if (!id) return { ok: false, error: 'id_vacio' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'ocupado' };
  try {
    var leer = function (k) { try { return JSON.parse(props.getProperty(k) || 'null'); } catch (e) { return null; } };
    var pcs = leer(EXT_PCS_PROP) || {};
    if (pcs[id]) {
      if (ahora - Number(pcs[id].visto) <= EXT_TURNO_VIVA_MIN * 60000) return { ok: false, error: 'prendida' };
      var nombre = pcs[id].nombre;
      delete pcs[id];
      props.setProperty(EXT_PCS_PROP, JSON.stringify(pcs));
      var orden = leer(EXT_ORDEN_PROP);
      if (orden && orden.length) { orden = orden.filter(function (x) { return x !== id; }); if (orden.length) props.setProperty(EXT_ORDEN_PROP, JSON.stringify(orden)); else props.deleteProperty(EXT_ORDEN_PROP); }
      var cur = leer(EXT_TURNO_PROP);
      if (cur && cur.id === id) props.deleteProperty(EXT_TURNO_PROP);
      else if (cur && cur.cede && cur.cede.id === id) { delete cur.cede; props.setProperty(EXT_TURNO_PROP, JSON.stringify(cur)); }
      logInfo_(EXT_ETAPA, 'Computadora borrada desde la extension: ' + nombre);
      flushLog_();
    }
    return extOrdenResp_(props, ahora);
  } finally { lock.releaseLock(); }
}

/** Accion ext_orden_guardar: p = {clave, orden: [ids]} (la primera trabaja primero). Solo acepta computadoras que ya se han visto.
 *  El cambio no mueve el turno de golpe: si la que trabaja ya no es la primera, la nueva primera lo pide y la que trabaja lo suelta
 *  en su siguiente pregunta (misma regla de siempre, sin dos corridas a la vez). */
function extOrdenGuardar_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var props = props_(), ahora = Date.now();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'ocupado' };
  try {
    var pcs; try { pcs = JSON.parse(props.getProperty(EXT_PCS_PROP) || 'null') || {}; } catch (e) { pcs = {}; }
    var vistos = {}, orden = [];
    (Array.isArray(p.orden) ? p.orden : []).slice(0, 30).forEach(function (x) {
      var id = String(x || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
      if (id && pcs[id] && !vistos[id]) { vistos[id] = true; orden.push(id); }
    });
    if (!orden.length) return { ok: false, error: 'orden_vacio' };
    props.setProperty(EXT_ORDEN_PROP, JSON.stringify(orden));
    logInfo_(EXT_ETAPA, 'Orden de las computadoras cambiado desde la extension: ' + extOrdenTexto_(pcs, orden));
    flushLog_();
    return extOrdenResp_(props, ahora);
  } finally { lock.releaseLock(); }
}
