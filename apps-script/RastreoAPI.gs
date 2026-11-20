/**
 * ============================================================
 *  API propia de rastreo (20-nov-2026) — solo lectura, 24/7 en Google
 * ============================================================
 *
 *  Ella: "haz la extensión, la API, aplicación, lo que sea, ya". La extensión lee la Paquetería Dedicada Walmart / FedEx
 *  (Rastreo.gs) y guarda todo en la hoja PAQUETERIA. Esta API sirve ESOS datos guardados: nunca consulta a la paqueteria
 *  en linea, asi que responde aunque la PC este apagada (lo que muestra es lo ultimo que se leyo).
 *
 *  Mismo Web App (/exec) y mismo portero que el dashboard: primero  ?accion=login&password=...  -> token (Auth.gs).
 *  Rutas (GET):
 *    /exec/v1/health?token=T                         -> estado del rastreo (al dia o atrasado)
 *    /exec/v1/trackings?token=T[&estado=en_curso|final|ENTREGADO|ROBADO...][&paq=...][&limite=500]
 *    /exec/v1/trackings/<GUIA>?token=T               -> una guia con todo lo guardado
 *    /exec/v1/trackings/<GUIA>/events?token=T        -> historial completo de eventos (columna Historial)
 *  Equivalentes sin ruta: ?accion=v1_health | v1_trackings | v1_tracking&guia=G | v1_events&guia=G
 *  Prefijo rqa / RQA_.
 */

var RQA_MAX = 2000;
var RQA_CAMPOS = [
  ['guia', 'Guia'], ['paqueteria', 'Paqueteria'], ['orden_walmart', 'Orden Walmart (6000)'], ['orden_compra', 'Orden de compra (609)'],
  ['fecha_venta', 'Fecha venta'], ['estatus', 'Estatus real'], ['ultimo_evento', 'Ultimo evento'], ['codigo', 'Codigo evento'],
  ['fecha_evento', 'Fecha evento'], ['fecha_recoleccion', 'Fecha recoleccion'], ['estado_final', 'Estado final'],
  ['accion_sugerida', 'Accion sugerida'], ['fecha_estado_final', 'Fecha estado final'], ['codigos', 'Codigos historial'],
  ['consultas', 'Consultas'], ['fecha_consulta', 'Fecha consulta'], ['nota', 'Nota'],
  ['empaco', 'Empaco'], ['fecha_empaque', 'Fecha empaque'], ['picking_salida', 'Picking salida'], ['guia_bodega', 'Guia escaneada en bodega']
];

/** /exec/v1/... -> {accion, guia}. null si no es una ruta de la API. */
function rqaRuta_(pathInfo) {
  var s = String(pathInfo || '').replace(/^\/+|\/+$/g, '');
  var m;
  if (s === 'v1/health') return { accion: 'v1_health' };
  if (s === 'v1/trackings') return { accion: 'v1_trackings' };
  if ((m = s.match(/^v1\/trackings\/([A-Za-z0-9]{6,30})\/events$/))) return { accion: 'v1_events', guia: m[1] };
  if ((m = s.match(/^v1\/trackings\/([A-Za-z0-9]{6,30})$/))) return { accion: 'v1_tracking', guia: m[1] };
  return s ? { accion: 'v1_desconocida' } : null;
}

function rqaTxt_(v) { return String(v === null || v === undefined ? '' : v).replace(/^'/, '').replace(/\.0+$/, '').trim(); }

/** Fila de PAQUETERIA -> objeto de la API (por encabezado). */
function rqaObjeto_(t, f) {
  var o = {};
  RQA_CAMPOS.forEach(function (c) {
    var i = peCol_(t, [c[1]]);
    var v = i >= 0 ? f[i] : '';
    o[c[0]] = v instanceof Date ? v.toISOString() : (c[0] === 'consultas' ? (Number(v) || 0) : rqaTxt_(v));
  });
  o.en_curso = !o.estado_final;
  return o;
}

/** Pura: filtra la lista. f = {estado, paq, limite}. */
function rqaFiltrar_(lista, f) {
  f = f || {};
  var est = String(f.estado || '').trim().toUpperCase(), paq = String(f.paq || '').trim().toUpperCase();
  var lim = Math.max(1, Math.min(RQA_MAX, Number(f.limite) || RQA_MAX));
  return lista.filter(function (o) {
    if (est === 'EN_CURSO' && !o.en_curso) return false;
    if (est === 'FINAL' && o.en_curso) return false;
    if (est && est !== 'EN_CURSO' && est !== 'FINAL' && String(o.estado_final).toUpperCase() !== est) return false;
    if (paq && String(o.paqueteria).toUpperCase().indexOf(paq) < 0) return false;
    return true;
  }).slice(0, lim);
}

/** Pura: salud del rastreo. lista = objetos de la API; ahoraMs. */
function rqaSalud_(lista, ahoraMs) {
  var ult = 0, enCurso = 0, revisar = 0, atrasadas = 0, finales = {};
  lista.forEach(function (o) {
    var c = Date.parse(o.fecha_consulta) || 0;
    if (c > ult) ult = c;
    if (o.en_curso) {
      enCurso++;
      if (/^REVISAR A MANO/.test(o.nota)) revisar++;
      if (/^(PAQUETERIA DEDICADA WALMART|BIGSMART|FEDEX)$/.test(String(o.paqueteria).toUpperCase()) && (!c || ahoraMs - c > (RQ_CADA_H * 60 + 60) * 60000)) atrasadas++;
    } else finales[o.estado_final] = (finales[o.estado_final] || 0) + 1;
  });
  var min = ult ? Math.round((ahoraMs - ult) / 60000) : null;
  return { ok: true, al_dia: min !== null && min <= 30 && atrasadas === 0, ultima_lectura: ult ? new Date(ult).toISOString() : '', minutos_desde_ultima_lectura: min,
           total: lista.length, en_curso: enCurso, finales: finales, revisar_a_mano: revisar, atrasadas: atrasadas };
}

/** Pura: historial guardado (JSON de la columna Historial) -> eventos. */
function rqaEventos_(historial) {
  var a = [];
  try { a = JSON.parse(String(historial || '[]')); } catch (e) { a = []; }
  return Array.isArray(a) ? a.map(function (e) { return { codigo: rqaTxt_(e.cod), descripcion: rqaTxt_(e.txt), fecha: rqaTxt_(e.fecha), lugar: rqaTxt_(e.lugar) }; }) : [];
}

function rqaTabla_() { return peTabla_(RQ_HOJA) || { pos: {}, filas: [] }; }

/** Atiende una accion v1_* (ya con sesion valida). */
function rqaAtender_(accion, p) {
  var t = rqaTabla_(), iG = peCol_(t, ['Guia']);
  var lista = t.filas.filter(function (f) { return iG >= 0 && rqaTxt_(f[iG]); }).map(function (f) { return rqaObjeto_(t, f); });
  if (accion === 'v1_health') return rqaSalud_(lista, Date.now());
  if (accion === 'v1_trackings') { var l = rqaFiltrar_(lista, p); return { ok: true, total: l.length, trackings: l }; }
  var g = rqaTxt_(p.guia).replace(/[^A-Za-z0-9]/g, '');
  if (accion === 'v1_tracking' || accion === 'v1_events') {
    if (!g) return { ok: false, error: 'falta guia' };
    var k = -1;
    for (var i = 0; i < t.filas.length; i++) if (rqaTxt_(t.filas[i][iG]).toUpperCase() === g.toUpperCase()) { k = i; break; }
    if (k < 0) return { ok: false, error: 'guia no encontrada (solo ventas de los ultimos ' + RQ_DIAS + ' dias)' };
    var iH = peCol_(t, ['Historial']), ev = rqaEventos_(iH >= 0 ? t.filas[k][iH] : '');
    if (accion === 'v1_events') return { ok: true, guia: g, total: ev.length, eventos: ev, nota: ev.length ? '' : 'sin historial guardado todavia (se llena en la siguiente lectura)' };
    var o = rqaObjeto_(t, t.filas[k]); o.eventos = ev;
    return { ok: true, tracking: o };
  }
  return { ok: false, error: 'ruta desconocida: usa /v1/health, /v1/trackings, /v1/trackings/<GUIA> o /v1/trackings/<GUIA>/events' };
}
