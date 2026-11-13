/**
 * ============================================================
 *  Reporte — la hoja con TODO lo que lleva el reporte del dia
 * ============================================================
 *
 *  Una fila por pregunta del reporte (AREA, PREGUNTA) con su RESPUESTA, ESTADO (✅ ⚠️ ❌), ACCION y cuando se
 *  ACTUALIZO. Cuando pides "reporte" se lee ESTA hoja: asi nunca falta un area.
 *
 *  LLENA = AUTO: el script calcula la respuesta solo (cada hora, justo despues de Salud, y desde el menu).
 *  LLENA = CLAUDE: preguntas que tu agregas; el script no las toca y Claude las responde cuando pides el reporte.
 *  Para agregar una pregunta nueva: escribe una fila al final con AREA y PREGUNTA (LLENA en blanco o CLAUDE).
 *  El script nunca borra ni reordena filas; solo escribe RESPUESTA, ESTADO, ACCION y ACTUALIZADO de las filas AUTO.
 * ============================================================
 */

var RP_HOJA = 'Reporte', RP_ETAPA = 'REPORTE';
var RP_ENC = ['AREA', 'PREGUNTA', 'RESPUESTA', 'ESTADO', 'ACCION', 'LLENA', 'ACTUALIZADO'];

/* ---------- piezas puras (se prueban sin Sheet) ---------- */

function rpMs_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(v || '').trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0)).getTime() : null;
}
function rpNum_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function rpTxt_(v) { return String(v === null || v === undefined ? '' : v).trim(); }
function rpPesos_(v) { return '$' + String(Math.round(rpNum_(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function rpPeor_(a, b) { var o = { '✅': 0, '⚠️': 1, '❌': 2 }; return (o[b] || 0) > (o[a] || 0) ? b : a; }
function rpCuenta_(lista, f) { var o = {}; lista.forEach(function (x) { var k = f(x); if (k) o[k] = (o[k] || 0) + 1; }); return o; }
function rpPartes_(o, sep) { return Object.keys(o).map(function (k) { return k + ' ' + o[k]; }).join(sep || ' · '); }
function rpUno_(lista, f) { for (var i = 0; i < lista.length; i++) if (f(lista[i])) return lista[i]; return null; }

/** Fila de Salud de un proceso: {estado, hace} (aviso si no hay dato). */
function rpSalud_(D, nombre) {
  var f = rpUno_(D.salud || [], function (x) { return rpTxt_(x['PROCESO']) === nombre; });
  return f ? { estado: rpTxt_(f['ESTADO']) || '⚠️', hace: rpTxt_(f['HACE']) } : { estado: '⚠️', hace: 'sin dato' };
}

/**
 * Datos de las hojas (objetos por encabezado normalizado) + contexto -> filas del reporte [{area, pregunta, resp, estado, accion}].
 * ctx = { ahora (ms), hoy 'AAAA-MM-DD', mes 'AAAA-MM', dow (1=lunes..7), hora, iso(ms) }
 */
function rpCalcular_(D, ctx) {
  var out = [], add = function (area, pregunta, resp, estado, accion) { out.push({ area: area, pregunta: pregunta, resp: resp, estado: estado, accion: accion || '' }); };
  var L = function (k) { return D[k] || []; };

  // CONEXIONES
  var pr = rpSalud_(D, 'PRECIOS'), ex = rpSalud_(D, 'EXTENSION'), est = rpPeor_(pr.estado, ex.estado);
  add('CONEXIONES', '¿Cookie del site y precios al día?', 'Precios ' + pr.estado + ' hace ' + pr.hace + ' · Extensión ' + ex.estado + ' hace ' + ex.hace, est,
    est === '✅' ? '' : 'Entrar al site y dar "Enviar ahora" en la extensión');
  var se = rpSalud_(D, 'SELLER');
  add('CONEXIONES', '¿Seller Center leyendo pedidos?', se.estado + ' hace ' + se.hace, se.estado, se.estado === '✅' ? '' : 'Entrar a Seller Center (2FA) para que la extensión lea');
  var sal = L('salud'), mal = sal.filter(function (f) { return rpTxt_(f['ESTADO']) === '❌'; }).map(function (f) { return rpTxt_(f['PROCESO']); });
  var av = sal.filter(function (f) { return rpTxt_(f['ESTADO']) === '⚠️'; }).map(function (f) { return rpTxt_(f['PROCESO']); });
  add('CONEXIONES', '¿Algún proceso con falla?', (sal.length - mal.length - av.length) + ' bien' + (av.length ? ' · avisos: ' + av.join(', ') : '') + (mal.length ? ' · ERROR: ' + mal.join(', ') : ''),
    mal.length ? '❌' : av.length ? '⚠️' : '✅', (mal.length || av.length) ? 'Ver la hoja Salud' : '');

  // BUZON
  var b = D.buzon;
  if (!b || ctx.ahora - rpNum_(b.hora) > 6 * 3600000) add('BUZON', '¿Mensajes sin leer o por responder?', 'Sin lectura reciente del buzón', '⚠️', 'Entrar a Seller Center para que la extensión lea el buzón');
  else {
    var sl = rpNum_(b.sinLeer), pdr = rpNum_(b.porResponder);
    add('BUZON', '¿Mensajes sin leer o por responder?', sl + ' sin leer · ' + pdr + ' por responder', (sl || pdr) ? '⚠️' : '✅', (sl || pdr) ? 'Revisar el buzón de Seller Center' : '');
  }

  // SOBREVENTA
  var wfs = L('sobWfs').filter(function (f) { return rpTxt_(f['REFERENCIA']); });
  var acc = rpCuenta_(wfs, function (f) { return rpTxt_(f['ACCION']) || 'sin acción'; });
  add('SOBREVENTA', '¿Sobreventas WFS abiertas?', wfs.length ? wfs.length + ' abiertas (' + rpPartes_(acc, ' · ') + ')' : 'Ninguna', wfs.length ? '⚠️' : '✅', wfs.length ? 'Resolver las de la hoja Sobreventa WFS' : '');
  var pick = L('sobPick').filter(function (f) { return rpTxt_(f['REFERENCIA']); });
  add('SOBREVENTA', '¿Sobreventas Pick abiertas?', pick.length ? pick.length + ' abiertas' : 'Ninguna', pick.length ? '⚠️' : '✅', pick.length ? 'Revisar Sobreventa Pick' : '');

  // CASOS (ultimas 2 semanas)
  var desde = ctx.ahora - 14 * 86400000;
  var cs = L('casos').filter(function (f) { var t = rpMs_(f['FECHA ABIERTO']); return t !== null && t >= desde; });
  var ce = rpCuenta_(cs, function (f) { return rpTxt_(f['ESTADO']).toUpperCase() || 'POR ABRIR'; });
  var n = function (k) { return ce[k] || 0; };
  var cerr = n('RESUELTO') + n('CERRADO'), accs = [];
  if (n('PIDE INFO')) accs.push('Responder ' + n('PIDE INFO') + ' que piden información');
  if (n('RESPUESTA WALMART')) accs.push('Leer ' + n('RESPUESTA WALMART') + ' respuesta(s) de Walmart');
  if (n('POR ABRIR')) accs.push('Abrir ' + n('POR ABRIR') + ' por abrir');
  add('CASOS', '¿Casos de las últimas 2 semanas?', 'Por abrir ' + n('POR ABRIR') + ' · Abiertos ' + n('ABIERTO') + ' · Piden info ' + n('PIDE INFO') + ' · Respuesta Walmart ' + n('RESPUESTA WALMART') + ' · En espera ' + n('EN ESPERA WALMART') + ' · Cerrados ' + cerr,
    accs.length ? '⚠️' : '✅', accs.join('; '));

  // CANCELACIONES
  var cc = L('canc'), canceladas = cc.filter(function (f) { return /^CANCELADO/.test(rpTxt_(f['ESTADO ODOO']).toUpperCase()); });
  var fechaDe = function (f) { var t = rpMs_(f['FECHA ODOO']); return t === null ? '' : ctx.iso(t); };
  var hoyC = canceladas.filter(function (f) { return fechaDe(f) === ctx.hoy; }), mesC = canceladas.filter(function (f) { return fechaDe(f).slice(0, 7) === ctx.mes; });
  var tipo = function (f) { var o = rpTxt_(f['ORIGEN']).toUpperCase(); return /SOBREVENTA/.test(o) ? 'sobreventa' : /PRECIO/.test(o) ? 'precio erróneo' : /CORREO/.test(o) ? 'correo' : 'otras'; };
  var th = rpCuenta_(hoyC, tipo), tm = rpCuenta_(mesC, tipo);
  add('CANCELACIONES', '¿Cuántas ventas se cancelaron?', 'Hoy ' + hoyC.length + (hoyC.length ? ' (' + rpPartes_(th) + ')' : '') + ' · Mes ' + mesC.length + (mesC.length ? ' (' + rpPartes_(tm) + ')' : ''), '✅', '');
  var err = cc.filter(function (f) { return /^ERROR/.test(rpTxt_(f['ESTADO ODOO']).toUpperCase()); }).length;
  var ojo = cc.filter(function (f) { return /^OJO/.test(rpTxt_(f['ESTADO ODOO']).toUpperCase()); }).length;
  add('CANCELACIONES', '¿Cancelaciones con error o pendientes?', (err || ojo) ? err + ' con error · ' + ojo + ' con aviso (orden activa)' : 'Ninguna', err ? '❌' : ojo ? '⚠️' : '✅', (err || ojo) ? 'Revisar esas filas en Cancelaciones' : '');

  // PRECIOS ERRONEOS
  var pe = cc.filter(function (f) { return /PRECIO/.test(rpTxt_(f['ORIGEN']).toUpperCase()); });
  var porDecidir = pe.filter(function (f) { return f['CANCELAR EN ODOO'] !== true && !rpTxt_(f['ESTADO ODOO']); }).length;
  var peMes = pe.filter(function (f) { var t = rpMs_(f['FECHA CORREO']) || rpMs_(f['FECHA LECTURA']); return t !== null && ctx.iso(t).slice(0, 7) === ctx.mes; }).length;
  var peCan = pe.filter(function (f) { return /^CANCELADO/.test(rpTxt_(f['ESTADO ODOO']).toUpperCase()); }).length;
  add('PRECIOS ERRONEOS', '¿Precios erróneos por decidir (3% a 5%)?', porDecidir + ' por decidir · ' + peMes + ' entraron este mes · ' + peCan + ' canceladas en total', porDecidir ? '⚠️' : '✅',
    porDecidir ? 'Decidir con la casilla CANCELAR EN ODOO' : '');

  // KILLERS
  var kil = L('killers').filter(function (f) { return rpTxt_(f['SKU']); }).length;
  var kb = L('killersBajo').filter(function (f) { return rpTxt_(f['SKU WALMART']); });
  var kb5 = kb.filter(function (f) { return rpNum_(f['% PERDIDA']) > 0.05; }).length;
  add('KILLERS', '¿Killers y cuántos van bajo mínimo?', kil + ' killers · ' + kb.length + ' bajo mínimo' + (kb.length ? ' (' + kb5 + ' con pérdida mayor a 5%)' : ''), kb.length ? '⚠️' : '✅',
    kb.length ? 'Revisar Killers bajo minimo' + (kb5 ? ' (los de más de 5% se cancelan solos)' : '') : '');

  // RECOLECCION
  var rc = L('recol').map(function (f) { return { t: rpMs_(f['FECHA Y HORA']), f: f }; }).filter(function (x) { return x.t !== null; }).sort(function (a, b) { return b.t - a.t; });
  if (!rc.length) add('RECOLECCION', '¿Se solicitó la recolección?', 'Sin registros', '⚠️', 'Revisar Recoleccion Historial');
  else {
    var u = rc[0], bien = /^✅/.test(rpTxt_(u.f['RESULTADO'])), hoyR = ctx.iso(u.t) === ctx.hoy, laboral = ctx.dow >= 1 && ctx.dow <= 5;
    var e = !bien ? '❌' : (!hoyR && laboral && ctx.hora >= 9) ? '⚠️' : '✅';
    add('RECOLECCION', '¿Se solicitó la recolección?', rpTxt_(u.f['RESULTADO']) + ' · ' + ctx.iso(u.t) + ' · para ' + rpTxt_(u.f['RECOLECCION DEL']) + (e === '⚠️' ? ' · hoy aún no' : ''), e,
      e === '✅' ? '' : !bien ? 'Revisar el Log y reenviar la recolección' : 'Confirmar que hoy sí salió la recolección');
  }

  // VENTAS
  var rm = rpUno_(L('resMes'), function (f) { return rpTxt_(f['ESTADO']).toUpperCase() === 'EN CURSO'; });
  add('VENTAS', '¿Venta Walmart del mes?', rm ? rpTxt_(rm['MES']) + ': ' + rpPesos_(rm['TOTAL']) + ' (WFS ' + rpPesos_(rm['WFS']) + ' · Seller ' + rpPesos_(rm['SELLER']) + ' · Killers ' + rpPesos_(rm['KILLERS']) + ')' : 'Sin mes en curso', rm ? '✅' : '⚠️', '');
  var rv = rpUno_(L('resCva'), function (f) { return rpTxt_(f['ESTADO']).toUpperCase() === 'EN CURSO'; });
  add('VENTAS', '¿Venta CVA del mes y acumulada?', rv ? 'Mes ' + rpPesos_(rv['VENTA TOTAL']) + ' · Acumulada (todo el histórico) ' + rpPesos_(rv['VENTA ACUMULADA']) : 'Sin mes en curso', rv ? '✅' : '⚠️', '');

  // PEDIDOS EN RIESGO
  var rg = L('riesgo').filter(function (f) { return rpTxt_(f['PEDIDO']); });
  var rs = rpCuenta_(rg, function (f) { return rpTxt_(f['SITUACION']) || 'sin situación'; });
  add('PEDIDOS EN RIESGO', '¿Pedidos en riesgo por falta de embarque?', rg.length ? rg.length + ': ' + rpPartes_(rs) : 'Ninguno', rg.length ? '⚠️' : '✅', rg.length ? 'Revisar Pedidos en riesgo' : '');
  return out;
}

/* ---------- lectura y escritura en el Sheet ---------- */

/** Hoja -> lista de objetos por encabezado normalizado ([] si no existe). */
function rpObjetos_(nombre) {
  var t = peTabla_(nombre);
  if (!t) return [];
  var cab = t.enc.map(function (x) { return normEnc_(x); });
  return t.filas.map(function (f) { var o = {}; cab.forEach(function (k, i) { if (k && o[k] === undefined) o[k] = f[i]; }); return o; });
}

function rpDatos_() {
  var buzon = null;
  try { buzon = bzLeer_(); } catch (e) {}
  return {
    salud: rpObjetos_('Salud'), sobWfs: rpObjetos_('Sobreventa WFS'), sobPick: rpObjetos_('Sobreventa Pick'), casos: rpObjetos_(CAW_HOJA), canc: rpObjetos_('Cancelaciones'),
    killers: rpObjetos_('Killers'), killersBajo: rpObjetos_('Killers bajo minimo'), recol: rpObjetos_('Recoleccion Historial'),
    resMes: rpObjetos_('Resumen venta y killers'), resCva: rpObjetos_('Resumen venta CVA'), riesgo: rpObjetos_(PRI_HOJA), buzon: buzon
  };
}

function rpContexto_() {
  var ahora = Date.now(), d = new Date(ahora);
  var iso = function (ms) { return Utilities.formatDate(new Date(ms), TZ, 'yyyy-MM-dd'); };
  return { ahora: ahora, hoy: iso(ahora), mes: iso(ahora).slice(0, 7), dow: Number(Utilities.formatDate(d, TZ, 'u')), hora: Number(Utilities.formatDate(d, TZ, 'H')), iso: iso };
}

/** Recalcula y escribe las filas AUTO. Devuelve {filas, nuevas, avisos, hoja}. */
function reporteActualizar_() {
  var filas = rpCalcular_(rpDatos_(), rpContexto_());
  var h = peHojaAsegurar_(RP_HOJA, RP_ENC), m = ubicarColumnas_(h, RP_ENC, 1);
  var col = function (e) { return escrCol_(m, e); };
  var n = Math.max(h.getLastRow() - 1, 0), ahora = new Date();
  var leer = function (e) { var c = col(e); return (c && n) ? h.getRange(2, c, n, 1).getValues().map(function (r) { return r[0]; }) : null; };
  var cPreg = leer('PREGUNTA'), cLlena = leer('LLENA');
  var datos = { 'RESPUESTA': leer('RESPUESTA'), 'ESTADO': leer('ESTADO'), 'ACCION': leer('ACCION'), 'ACTUALIZADO': leer('ACTUALIZADO') };
  var fila = {}; (cPreg || []).forEach(function (p, i) { var k = normEnc_(p); if (k && fila[k] === undefined) fila[k] = i; });
  var nuevas = [], avisos = 0;
  filas.forEach(function (f) {
    if (f.estado !== '✅') avisos++;
    var i = fila[normEnc_(f.pregunta)];
    if (i === undefined) { nuevas.push({ 'AREA': f.area, 'PREGUNTA': f.pregunta, 'RESPUESTA': f.resp, 'ESTADO': f.estado, 'ACCION': f.accion, 'LLENA': 'AUTO', 'ACTUALIZADO': ahora }); return; }
    var llena = normEnc_(cLlena ? cLlena[i] : '');
    if (llena && llena !== 'AUTO') return;   // la fila la llena Claude: no se toca
    if (datos['RESPUESTA']) datos['RESPUESTA'][i] = f.resp;
    if (datos['ESTADO']) datos['ESTADO'][i] = f.estado;
    if (datos['ACCION']) datos['ACCION'][i] = f.accion;
    if (datos['ACTUALIZADO']) datos['ACTUALIZADO'][i] = ahora;
  });
  if (n) Object.keys(datos).forEach(function (e) {
    if (!datos[e]) return;
    h.getRange(2, col(e), n, 1).setValues(datos[e].map(function (x) { return [x]; }));
  });
  if (nuevas.length) peAgregar_(h, RP_ENC, nuevas);
  try { rpFormato_(h, m); } catch (e) {}
  var r = { filas: filas, nuevas: nuevas.length, avisos: avisos, hoja: h };
  logOk_(RP_ETAPA, 'Reporte: ' + filas.length + ' preguntas, ' + avisos + ' con aviso' + (nuevas.length ? ', ' + nuevas.length + ' nuevas' : ''));
  return r;
}

/** Anchos (solo si la columna esta angosta) y ESTADO centrado. Nunca toca formatos que ya traiga. */
function rpFormato_(h, m) {
  var ancho = { 'AREA': 150, 'PREGUNTA': 280, 'RESPUESTA': 520, 'ESTADO': 70, 'ACCION': 360, 'LLENA': 80, 'ACTUALIZADO': 140 };
  RP_ENC.forEach(function (e) { var c = escrCol_(m, e); if (c && h.getColumnWidth(c) < 100 && ancho[e]) h.setColumnWidth(c, ancho[e]); });
  var cE = escrCol_(m, 'ESTADO'), nf = h.getLastRow() - 1;
  if (cE && nf > 0) h.getRange(2, cE, nf, 1).setHorizontalAlignment('center');
}

/** La llama Salud cada hora (despues de actualizarse). Nunca interrumpe a quien la llama. */
function reporteProgramado_() {
  try { reporteActualizar_(); } catch (e) { logWarn_(RP_ETAPA, 'Reporte: ' + String(e.message || e).split('\n')[0]); }
}

/** Menu: actualiza y abre la hoja. */
function reporteMenu() {
  var r = reporteActualizar_();
  flushLog_();
  SpreadsheetApp.getActive().setActiveSheet(r.hoja);
  dlgInfo_('📋 Reporte del día', r.filas.length + ' preguntas actualizadas, ' + r.avisos + ' con aviso.\n\nPara agregar una pregunta: escribe una fila al final con AREA y PREGUNTA.', r.avisos ? 'aviso' : 'ok');
}
