/**
 * AutoLatido.gs · Lo que corre solo en las computadoras, visto desde el Sheet (26-nov-2026).
 * Dos tareas automaticas avisan con la accion auto_latido: {tarea, evento, pc, detalle}:
 *  - tarea "subida" (5-AUTO.bat de FORCEV): vuelta (nada que subir / esperando), subido, fallo, no_sube (las pruebas no pasaron).
 *  - tarea "actualizador" (5-DELL.bat de cada PC servidor): vuelta (al dia), actualizado (A a B), fallo.
 * Esta accion NO ejecuta nada ni lee nada: solo guarda el ultimo estado (propiedades AUTO_LATIDO_V1 y AUTO_LATIDO_EXT_V1) y deja un
 * renglon en el Log cuando algo cambia o falla. Las filas de la hoja Reporte leen esas propiedades.
 * Sin clave a proposito: la clave nunca debe quedar escrita en un archivo del repo; lo peor que puede pasar es un aviso falso.
 */
var AL_PROP = 'AUTO_LATIDO_V1', AL_PROP_EXT = 'AUTO_LATIDO_EXT_V1', AL_ETAPA = 'AUTO_SUBIDA', AL_ETAPA_EXT = 'AUTO_EXT';
var AL_EVENTOS = { vuelta: 1, subido: 1, fallo: 1, no_sube: 1 }, AL_EVENTOS_EXT = { vuelta: 1, actualizado: 1, fallo: 1 };

/** Pura. s = estado anterior o null. Devuelve {nuevo, loguear}. El Log se escribe al subir/actualizar y al cambiar a fallo; un fallo que sigue igual se repite cada hora. */
function alAplicar_(s, ev, pc, det, ahora) {
  var ant = s || {}, n = { pc: pc, vuelta: ahora, evento: ev, detalle: det, desde: ant.evento === ev ? (ant.desde || ahora) : ahora, subido: ant.subido || 0, logMs: ant.logMs || 0 };
  var cambio = ev === 'subido' || ev === 'actualizado';
  if (cambio) n.subido = ahora;
  var loguear = cambio || (ev !== 'vuelta' && (ant.evento !== ev || ahora - (ant.logMs || 0) > 3600000));
  if (loguear) n.logMs = ahora;
  return { nuevo: n, loguear: loguear };
}

/** Accion auto_latido (POST). */
function alRecibir_(p) {
  var ext = String((p && p.tarea) || '') === 'actualizador', ev = String((p && p.evento) || '');
  if (!(ext ? AL_EVENTOS_EXT : AL_EVENTOS)[ev]) return { ok: false, error: 'evento_invalido' };
  var pc = String(p.pc || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30) || 'PC';
  var det = String(p.detalle || '').replace(/[\r\n<>]+/g, ' ').slice(0, 160);
  var props = props_(), ahora = Date.now(), llave = ext ? AL_PROP_EXT : AL_PROP;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok: true, ocupado: true };
  try {
    var ant = null;
    try { ant = JSON.parse(props.getProperty(llave) || 'null'); } catch (e) { ant = null; }
    var r;
    if (ext) {
      var mapa = (ant && typeof ant === 'object') ? ant : {};
      r = alAplicar_(mapa[pc] || null, ev, pc, det, ahora);
      mapa[pc] = r.nuevo;
      var ks = Object.keys(mapa);
      if (ks.length > 10) { ks.sort(function (a, b) { return Number(mapa[a].vuelta) - Number(mapa[b].vuelta); }); for (var i = 0; i < ks.length - 10; i++) delete mapa[ks[i]]; }
      props.setProperty(llave, JSON.stringify(mapa));
    } else {
      r = alAplicar_(ant, ev, pc, det, ahora);
      props.setProperty(llave, JSON.stringify(r.nuevo));
    }
    if (r.loguear) {
      if (ext) {
        if (ev === 'actualizado') logOk_(AL_ETAPA_EXT, 'Extension actualizada sola en ' + pc + ': ' + (det || 'version nueva'));
        else logWarn_(AL_ETAPA_EXT, 'El actualizador de la extension de ' + pc + ' FALLO: ' + det);
      } else if (ev === 'subido') logOk_(AL_ETAPA, 'Subida automatica (' + pc + '): ' + (det || 'subio todo'));
      else logWarn_(AL_ETAPA, 'Subida automatica (' + pc + ') ' + (ev === 'no_sube' ? 'NO SUBE: ' : 'FALLO: ') + det);
      flushLog_();
    }
    return { ok: true };
  } finally { lock.releaseLock(); }
}
