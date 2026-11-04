/**
 * ActualizarPrecios.gs — Site Sheet
 *
 * Un solo boton para la actualizacion de precios: baja todo lo que hace falta y recalcula, en el orden en que
 * cada paso depende del anterior:
 *   1 Precios (EM y CVA: minimo, normal, maximo)   -> de aqui salen los minimos
 *   2 Promociones                                  -> los puntos de comision que bajan el minimo
 *   3 Killers del site
 *   4 Killers bajo minimo                          -> usa 1, 2 y 3
 *   5 Killers activos + Comparar Walmart           -> usa 1, 3 y 4
 *   6 EXPORTAR / MINIMO / MAXIMO                   -> usa 1
 * Una sola ventana al final. Si un paso falla, los que dependen de el no se corren (saldrian con datos viejos).
 * Google corta una ejecucion de menu a los 6 min: si no alcanza, se detiene antes y la siguiente vez continua en el
 * paso que falto (si fue hace menos de 30 min).
 */
var AP_ETAPA = 'ACT_PRECIOS', AP_PROP = 'AP_PASO', AP_TOPE_MS = 280 * 1000, AP_VIGENCIA_MS = 30 * 60 * 1000;

var AP_PASOS = [
  { id: 'precios',  nombre: 'Precios (EM y CVA)',            dep: [] },
  { id: 'promos',   nombre: 'Promociones',                   dep: [] },
  { id: 'killers',  nombre: 'Killers del site',              dep: [] },
  { id: 'bajo',     nombre: 'Killers bajo minimo',           dep: ['precios', 'promos', 'killers'] },
  { id: 'activos',  nombre: 'Killers activos y Comparar Walmart', dep: ['precios', 'killers', 'bajo'] },
  { id: 'exportar', nombre: 'EXPORTAR, MINIMO y MAXIMO',     dep: ['precios'] }
];

/** Ejecuta un paso. Devuelve { ok, texto }. */
function apCorrer_(id) {
  if (id === 'precios') {
    // La corrida automatica de cada hora (~:19) tarda ~100 s y tiene el candado: se espera a que termine (hasta ~3 min).
    var r = descargarPrecios(), esperas = 0;
    while (r.estado === 'ocupado' && esperas < 6) { Utilities.sleep(30000); esperas++; r = descargarPrecios(); }
    if (r.estado === 'ocupado') return { ok: false, texto: 'Otra corrida de precios sigue en curso despues de esperar 3 min. Vuelve a darle en un par de minutos.' };
    var t = r.actualizadas + ' actualizadas, ' + r.sinCambio + ' sin cambios, ' + r.fallidas + ' con error';
    return { ok: !(r.fallidas > 0 && r.actualizadas === 0 && r.sinCambio === 0), texto: t };
  }
  if (id === 'promos') {
    var p = promosActualizar_(false);   // sin forzar: si el site manda una lista parcial, el guardarrail la detiene
    return p.error ? { ok: false, texto: 'No se pudo: ' + p.error } : { ok: true, texto: p.filas + ' promociones' };
  }
  if (id === 'killers') {
    killersBajar();
    return { ok: true, texto: 'bajados' };
  }
  if (id === 'bajo') {
    var b = kdBajar();
    return { ok: true, texto: String(b || '').split('\n')[0].slice(0, 120) };
  }
  if (id === 'activos') {
    var a = String(killersActivosActualizar(true));
    return { ok: !/FALLO|otra corrida|le faltan/i.test(a), texto: a.split('\n')[0].slice(0, 160) };
  }
  if (id === 'exportar') {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(90000)) return { ok: false, texto: 'Otra corrida tenia el candado.' };
    try {
      var x = vdIntentar_(function () { return exportarPrecios_(true); });
      return { ok: true, texto: 'EXPORTAR ' + x.finales.EXPORTAR + ' SKUs, MINIMO ' + x.finales.MINIMO + ', MAXIMO ' + x.finales.MAXIMO };
    } finally { lock.releaseLock(); }
  }
  return { ok: false, texto: 'paso desconocido' };
}

/** Pasos que ya se hicieron en una corrida cortada hace poco ({} si no hay o ya es vieja). */
function apPendiente_() {
  try {
    var o = JSON.parse(vdProp_(AP_PROP, '{}'));
    if (o && o.t && Date.now() - o.t < AP_VIGENCIA_MS && o.hechos) return o.hechos;
  } catch (e) {}
  return {};
}

function actualizarPreciosTodo() {
  var t0 = Date.now(), hechos = apPendiente_(), venia = Object.keys(hechos).length > 0;
  var estado = {}, lineas = [], cortado = false;
  Object.keys(hechos).forEach(function (k) { estado[k] = true; });
  toast_('Actualizando precios y killers, en orden. Tarda unos minutos; el avance sale en la hoja Log.', 'ACTUALIZAR PRECIOS', 60);
  AVISO_BUFFER_ = [];
  try {
    AP_PASOS.forEach(function (p, i) {
      var num = (i + 1) + ' · ' + p.nombre + ': ';
      if (hechos[p.id]) { lineas.push(num + 'ya estaba hecho (corrida anterior)'); return; }
      var falla = p.dep.filter(function (d) { return !estado[d]; });
      if (falla.length) { lineas.push(num + 'NO se corrio: depende de un paso que fallo o falta'); return; }
      if (Date.now() - t0 > AP_TOPE_MS) { cortado = true; lineas.push(num + 'falta (se acabo el tiempo de Google)'); return; }
      try {
        var r = apCorrer_(p.id);
        lineas.push(num + (r.ok ? '' : 'FALLO · ') + r.texto);
        if (r.ok) { estado[p.id] = true; hechos[p.id] = true; }
      } catch (e) { lineas.push(num + 'FALLO · ' + String(e.message || e).split('\n')[0].slice(0, 160)); }
    });
  } finally { AVISO_BUFFER_ = null; }
  var todo = AP_PASOS.every(function (p) { return estado[p.id]; });
  vdSetProp_(AP_PROP, todo ? '{}' : JSON.stringify({ t: Date.now(), hechos: hechos }));
  if (cortado) lineas.push('\nVuelve a darle a este mismo boton: sigue en el paso que falto.');
  else if (!todo) lineas.push('\nCorrige lo que fallo y vuelve a darle: solo repite lo que falto.');
  logInfo_(AP_ETAPA, 'Actualizar precios: ' + lineas.join(' | ').replace(/\n/g, ' '));
  try { flushLog_(); } catch (x) {}
  dlgInfo_('Actualizar precios y killers' + (todo ? ' · listo' : ''), lineas.join('\n'), todo ? 'ok' : 'aviso');
}
