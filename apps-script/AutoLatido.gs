/**
 * AutoLatido.gs · La subida automatica de FORCEV, vista desde el Sheet (26-nov-2026).
 * El 5-AUTO.bat avisa en cada vuelta con la accion auto_latido: {evento, pc, detalle}.
 *   vuelta  = dio la vuelta y no habia nada que subir (o esta esperando que se calmen los cambios)
 *   subido  = corrio 5-SUBIR-TODO y termino bien
 *   fallo   = 5-SUBIR-TODO fallo
 *   no_sube = las pruebas no pasaron: no subio nada
 * Esta accion NO ejecuta nada ni lee nada: solo guarda el ultimo estado (propiedad AUTO_LATIDO_V1) y deja un renglon en el Log
 * cuando sube o cuando algo falla. La fila "¿La subida automatica de FORCEV esta viva?" de la hoja Reporte lee esa propiedad.
 * Sin clave a proposito: la clave nunca debe quedar escrita en un archivo del repo; lo peor que puede pasar es un aviso falso.
 */
var AL_PROP = 'AUTO_LATIDO_V1', AL_ETAPA = 'AUTO_SUBIDA';
var AL_EVENTOS = { vuelta: 1, subido: 1, fallo: 1, no_sube: 1 };

/** Pura. s = estado anterior o null. Devuelve {nuevo, loguear}. El Log se escribe al subir y al cambiar a fallo; un fallo que sigue igual se repite cada hora. */
function alAplicar_(s, ev, pc, det, ahora) {
  var ant = s || {}, n = { pc: pc, vuelta: ahora, evento: ev, detalle: det, desde: ant.evento === ev ? (ant.desde || ahora) : ahora, subido: ant.subido || 0, logMs: ant.logMs || 0 };
  if (ev === 'subido') n.subido = ahora;
  var loguear = ev === 'subido' || (ev !== 'vuelta' && (ant.evento !== ev || ahora - (ant.logMs || 0) > 3600000));
  if (loguear) n.logMs = ahora;
  return { nuevo: n, loguear: loguear };
}

/** Accion auto_latido (POST). */
function alRecibir_(p) {
  var ev = String((p && p.evento) || '');
  if (!AL_EVENTOS[ev]) return { ok: false, error: 'evento_invalido' };
  var pc = String(p.pc || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30) || 'PC';
  var det = String(p.detalle || '').replace(/[\r\n<>]+/g, ' ').slice(0, 160);
  var props = props_(), ahora = Date.now();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok: true, ocupado: true };
  try {
    var ant = null;
    try { ant = JSON.parse(props.getProperty(AL_PROP) || 'null'); } catch (e) { ant = null; }
    var r = alAplicar_(ant, ev, pc, det, ahora);
    props.setProperty(AL_PROP, JSON.stringify(r.nuevo));
    if (r.loguear) {
      if (ev === 'subido') logOk_(AL_ETAPA, 'Subida automatica (' + pc + '): ' + (det || 'subio todo'));
      else logWarn_(AL_ETAPA, 'Subida automatica (' + pc + ') ' + (ev === 'no_sube' ? 'NO SUBE: ' : 'FALLO: ') + det);
      flushLog_();
    }
    return { ok: true };
  } finally { lock.releaseLock(); }
}
