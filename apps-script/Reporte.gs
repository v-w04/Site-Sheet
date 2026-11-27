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
// Orden del reporte (el mismo en la hoja y en el chat): primero lo bien ✅, luego los avisos ⚠️, al final lo rojo ❌; dentro de cada grupo, por area en este orden
var RP_AREAS = ['ACCION', 'CONEXIONES', 'SOBREVENTA', 'CASOS', 'BUZON', 'CANCELACIONES', 'PEDIDOS EN RIESGO', 'KILLERS', 'PRECIOS ERRONEOS', 'RECOLECCION', 'RASTREO', 'VENTAS'];

/* ---------- piezas puras (se prueban sin Sheet) ---------- */

function rpMs_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(v || '').trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0)).getTime() : null;
}
/** Fecha de una celda (Date o texto) como AAAA-MM-DD; si no es fecha, el texto tal cual. */
function rpFecha_(v, ctx) { var t = rpMs_(v); return t === null ? rpTxt_(v) : ctx.iso(t); }
function rpNum_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function rpTxt_(v) { return String(v === null || v === undefined ? '' : v).trim(); }
function rpPesos_(v) { return '$' + String(Math.round(rpNum_(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
/** Hasta 5 identificadores (pedido u orden, sin sufijos -1-1) de las filas, "y N mas" si hay mas. */
function rpIds_(filas, campos) {
  var ids = filas.map(function (f) {
    for (var i = 0; i < campos.length; i++) { var m = /\d{12,}/.exec(rpTxt_(f[campos[i]])); if (m) return m[0]; }
    return '';
  }).filter(function (x) { return x; });
  return ids.slice(0, 5).join(', ') + (ids.length > 5 ? ' y ' + (ids.length - 5) + ' más' : '');
}
function rpPeor_(a, b) { var o = { '✅': 0, '⚠️': 1, '❌': 2 }; return (o[b] || 0) > (o[a] || 0) ? b : a; }
function rpCuenta_(lista, f) { var o = {}; lista.forEach(function (x) { var k = f(x); if (k) o[k] = (o[k] || 0) + 1; }); return o; }
function rpPartes_(o, sep) { return Object.keys(o).map(function (k) { return k + ' ' + o[k]; }).join(sep || ' · '); }
function rpUno_(lista, f) { for (var i = 0; i < lista.length; i++) if (f(lista[i])) return lista[i]; return null; }

/** Fila de Salud de un proceso: {estado, hace} (aviso si no hay dato). */
function rpSalud_(D, nombre) {
  var f = rpUno_(D.salud || [], function (x) { return rpTxt_(x['PROCESO']) === nombre; });
  return f ? { estado: rpTxt_(f['ESTADO']) || '⚠️', hace: rpTxt_(f['HACE']) } : { estado: '⚠️', hace: 'sin dato' };
}

/** Pura. "12 min", "3.5 h", "2 días" desde un instante (ms) hasta ahora. */
function rpHace_(ms, ahora) { var m = Math.max(0, Math.round((ahora - Number(ms)) / 60000)); return m < 60 ? m + ' min' : m < 2880 ? (Math.round(m / 6) / 10) + ' h' : Math.round(m / 1440) + ' días'; }

/** Pura. La subida automatica de FORCEV (26-nov): s = propiedad AUTO_LATIDO_V1 ({pc, vuelta, evento, detalle, desde, subido}) o null. {resp, estado, accion}.
 *  ✅ dio vuelta hace menos de 30 min y no hay fallo · ⚠️ sin dato o sin vueltas hace 30 min a 3 h · ❌ no sube (pruebas o 5-SUBIR-TODO fallaron) o sin vueltas hace mas de 3 h. */
function rpSubidaAuto_(s, ahora) {
  if (!s || !s.vuelta) return { resp: 'Sin dato: la subida automática de FORCEV todavía no ha avisado', estado: '⚠️', accion: 'Esperar 15 min; si sigue sin dato, revisar que FORCEV esté prendida y con la sesión iniciada' };
  var min = (ahora - Number(s.vuelta)) / 60000, quien = s.pc || 'FORCEV';
  var ult = s.subido ? 'última subida hace ' + rpHace_(s.subido, ahora) : 'sin subidas registradas';
  if (s.evento === 'no_sube' || s.evento === 'fallo') return { resp: quien + ' NO sube: ' + (s.detalle || s.evento) + ' · desde hace ' + rpHace_(s.desde || s.vuelta, ahora) + ' · ' + ult, estado: '❌', accion: 'Pedirle a Claude que revise por qué no sube (detalle en .git\\sitesheet-auto\\ultimo-5.txt de FORCEV)' };
  if (min > 180) return { resp: quien + ' sin dar vuelta hace ' + rpHace_(s.vuelta, ahora) + ' · ' + ult, estado: '❌', accion: 'Revisar FORCEV: prendida, con la sesión de Windows iniciada y sin suspender' };
  if (min > 30) return { resp: quien + ' sin dar vuelta hace ' + rpHace_(s.vuelta, ahora) + ' (debe ser cada 15 min) · ' + ult, estado: '⚠️', accion: 'Revisar FORCEV: prendida, con la sesión de Windows iniciada y sin suspender' };
  return { resp: quien + ' viva: última vuelta hace ' + rpHace_(s.vuelta, ahora) + ' · ' + ult, estado: '✅', accion: '' };
}

/** Pura. El actualizador de la extension en las PCs servidor (26-nov): mapa = propiedad AUTO_LATIDO_EXT_V1 ({PC: {pc, vuelta, evento, detalle, desde, subido}}) o null.
 *  Por PC: ✅ dio vuelta hace menos de 30 min y no fallo · ⚠️ sin vuelta de 30 min a 3 h · ❌ fallo al actualizar o sin vuelta hace mas de 3 h. Una PC que no avisa hace mas de 1 dia se ignora. */
function rpActualizadores_(mapa, ahora) {
  var pcs = Object.keys(mapa || {}).map(function (k) { return mapa[k]; }).filter(function (x) { return x && x.vuelta && (ahora - Number(x.vuelta)) <= 86400000; });
  if (!pcs.length) return { resp: 'Sin dato: ninguna computadora ha avisado de su actualizador de la extensión', estado: '⚠️', accion: 'En la Dell, correr 5-DELL.bat (versión nueva) una vez; después se actualiza sola cada 15 min' };
  var est = '✅', acc = [];
  var lineas = pcs.map(function (x) {
    var min = (ahora - Number(x.vuelta)) / 60000, quien = x.pc || 'PC', e = '✅', txt;
    var cambio = x.subido ? 'último cambio hace ' + rpHace_(x.subido, ahora) : 'sin cambios registrados';
    if (x.evento === 'fallo') { e = '❌'; txt = quien + ' NO se actualiza: ' + (x.detalle || 'falló') + ' · desde hace ' + rpHace_(x.desde || x.vuelta, ahora); acc.push('Revisar ' + quien + ': correr 5-DELL.bat a mano y, si sigue fallando, mandar la pantalla a Claude'); }
    else if (min > 180) { e = '❌'; txt = quien + ' sin dar vuelta hace ' + rpHace_(x.vuelta, ahora) + ' · ' + cambio; acc.push('Revisar ' + quien + ': prendida, con la sesión de Windows iniciada y la tarea SiteSheet-Dell-Actualizar activa'); }
    else if (min > 30) { e = '⚠️'; txt = quien + ' sin dar vuelta hace ' + rpHace_(x.vuelta, ahora) + ' (debe ser cada 15 min) · ' + cambio; acc.push('Revisar ' + quien + ': prendida, con la sesión de Windows iniciada y sin suspender'); }
    else txt = quien + ' se actualiza sola' + (x.detalle ? ' (' + x.detalle + ')' : '') + ' · última vuelta hace ' + rpHace_(x.vuelta, ahora) + ' · ' + cambio;
    est = rpPeor_(est, e);
    return txt;
  });
  return { resp: lineas.join('\n'), estado: est, accion: acc.join('\n') };
}

/** Pura. Que computadora trabaja (26-nov): turno = respuesta de extOrdenResp_ ({pcs:[{nombre, visto, activa, turno}], quien}) o vacio. Devuelve {resp, estado, accion}.
 *  ✅ una trabaja y hay otra prendida de respaldo · ⚠️ trabaja sola (sin respaldo) o la que tiene el turno no responde · ❌ nadie tiene el turno. */
function rpComputadoras_(turno, ahora) {
  // La extension pregunta por el turno en cada vuelta (~15 min), no cada minuto: "prendida" = pregunto hace 20 min o menos; mas de 1 dia sin verse = computadora vieja que se ignora
  var todas = (turno && turno.pcs) || [], MAX_VIVA = 20, MAX_VIEJA = 1440;
  var min = function (p) { return (ahora - Number(p.visto)) / 60000; };
  var pcs = todas.filter(function (p) { return p.turno || min(p) <= MAX_VIEJA; });
  var viejas = todas.length - pcs.length, nota = viejas ? ' (+' + viejas + ' sin verse hace más de 1 día: se pueden borrar en Opciones de la extensión)' : '';
  if (!pcs.length) return { resp: 'Sin dato: ninguna computadora ha preguntado por el turno' + nota, estado: '⚠️', accion: 'Prender la Dell o FORCEV y abrir Chrome con la extensión' };
  var hace = function (ms) { return rpHace_(ms, ahora); };
  var viva = function (p) { return min(p) <= MAX_VIVA; };
  var trabaja = rpUno_(pcs, function (p) { return p.turno; });
  var partes = pcs.map(function (p) { return p.nombre + (p.turno ? ' TRABAJA' : viva(p) ? ' en espera' : ' sin responder hace ' + hace(p.visto)); });
  var apagadas = pcs.filter(function (p) { return !viva(p) && !p.turno; }).map(function (p) { return p.nombre; });
  var vivas = pcs.filter(viva).length;
  if (!trabaja) return { resp: 'Ninguna tiene el turno · ' + partes.join(' · ') + nota, estado: '❌', accion: 'Prender la Dell o FORCEV y revisar que Chrome esté abierto con la extensión' };
  if (!viva(trabaja)) return { resp: trabaja.nombre + ' tiene el turno pero no responde hace ' + hace(trabaja.visto) + ' · ' + partes.join(' · ') + nota, estado: '⚠️', accion: 'Revisar ' + trabaja.nombre + ' (Chrome abierto y sin suspender); si no responde, otra toma el turno sola' };
  if (vivas < 2) return { resp: trabaja.nombre + ' trabaja sola, sin respaldo · ' + partes.join(' · ') + nota, estado: '⚠️', accion: 'Prender ' + (apagadas.length ? apagadas.join(' o ') : 'la otra computadora') + ' como respaldo (Chrome abierto, sin suspender)' };
  return { resp: trabaja.nombre + ' trabaja · ' + partes.filter(function (x) { return x.indexOf(' TRABAJA') < 0; }).join(' · ') + nota, estado: '✅', accion: '' };
}


/**
 * Datos de las hojas (objetos por encabezado normalizado) + contexto -> filas del reporte [{area, pregunta, resp, estado, accion}].
 * ctx = { ahora (ms), hoy 'AAAA-MM-DD', mes 'AAAA-MM', dow (1=lunes..7), hora, iso(ms) }
 */
function rpCalcular_(D, ctx) {
  var out = [], add = function (area, pregunta, resp, estado, accion) { out.push({ area: area, pregunta: pregunta, resp: resp, estado: estado, accion: accion || '' }); };
  var L = function (k) { return D[k] || []; };

  // CONEXIONES
  var cpu = rpComputadoras_(D.turno, ctx.ahora);
  add('CONEXIONES', '¿Qué computadora está trabajando?', cpu.resp, cpu.estado, cpu.accion);
  var sub = rpSubidaAuto_(D.autoLatido, ctx.ahora);
  add('CONEXIONES', '¿La subida automática de FORCEV está viva?', sub.resp, sub.estado, sub.accion);
  var act = rpActualizadores_(D.autoAct, ctx.ahora);
  add('CONEXIONES', '¿La Dell se está actualizando sola?', act.resp, act.estado, act.accion);
  var pr = rpSalud_(D, 'PRECIOS'), ex = rpSalud_(D, 'EXTENSION'), est = rpPeor_(pr.estado, ex.estado);
  var prSin = pr.hace === 'sin dato';   // 26-nov: no hay NINGUNA fila PRECIOS en el Log (la descarga no deja registro): se dice tal cual, no "hace sin dato"
  add('CONEXIONES', '¿Cookie del site y precios al día?', (prSin ? 'Precios: sin registro de la descarga en el Log (' + pr.estado + ')' : 'Precios ' + pr.estado + ' hace ' + pr.hace) + ' · Extensión ' + ex.estado + ' hace ' + ex.hace, est,
    est === '✅' ? '' : (prSin ? 'Correr el menú Actualizar precios y killers y ver que en el Log aparezca PRECIOS "terminado". ' : '') + 'Si la extensión no está ✅: entrar al site y dar "Enviar ahora"');
  var se = rpSalud_(D, 'SELLER');
  add('CONEXIONES', '¿Seller Center leyendo pedidos?', se.estado + ' hace ' + se.hace, se.estado, se.estado === '✅' ? '' : 'Entrar a Seller Center (2FA) para que la extensión lea');
  var sal = L('salud'), mal = sal.filter(function (f) { return rpTxt_(f['ESTADO']) === '❌'; }).map(function (f) { return rpTxt_(f['PROCESO']); });
  var av = sal.filter(function (f) { return rpTxt_(f['ESTADO']) === '⚠️'; }).map(function (f) { return rpTxt_(f['PROCESO']); });
  add('CONEXIONES', '¿Algún proceso con falla?', (sal.length - mal.length - av.length) + ' bien' + (av.length ? ' · avisos: ' + av.join(', ') : '') + (mal.length ? ' · ERROR: ' + mal.join(', ') : ''),
    mal.length ? '❌' : av.length ? '⚠️' : '✅', (mal.length || av.length) ? 'En la hoja Salud revisa ' + (mal.length ? 'el ERROR de ' + mal.join(', ') : 'los avisos de ' + av.join(', ')) : '');

  // BUZON
  var b = D.buzon;
  if (!b || ctx.ahora - rpNum_(b.hora) > 6 * 3600000) add('BUZON', '¿Mensajes sin leer o por responder?', 'Sin lectura reciente del buzón', '⚠️', 'Entrar a Seller Center para que la extensión lea el buzón');
  else {
    var sl = rpNum_(b.sinLeer), pdr = rpNum_(b.porResponder);
    add('BUZON', '¿Mensajes sin leer o por responder?', sl + ' sin leer · ' + pdr + ' por responder (total del buzón)', (sl || pdr) ? '⚠️' : '✅', (sl || pdr) ? 'En Seller Center abre el buzón (Customer) y contesta los mensajes de la última semana: ' + sl + ' sin leer, ' + pdr + ' por responder' : '');
  }

  // SOBREVENTA
  var wfs = L('sobWfs').filter(function (f) { return rpTxt_(f['REFERENCIA']); });
  var acc = rpCuenta_(wfs, function (f) { return rpTxt_(f['ACCION']) || 'sin acción'; });
  add('SOBREVENTA', '¿Sobreventas WFS abiertas?', wfs.length ? wfs.length + ' abiertas (' + rpPartes_(acc, ' · ') + ')' : 'Ninguna', wfs.length ? '⚠️' : '✅', wfs.length ? 'En la hoja Sobreventa WFS resuelve las ' + wfs.length + ' abiertas' + (function () { var k = Object.keys(acc).sort(function (a, b) { return acc[b] - acc[a]; })[0]; return k && k !== 'sin acción' ? '; empieza por las ' + acc[k] + ' con ACCION "' + k + '"' : ''; })() : '');
  var pick = L('sobPick').filter(function (f) { return rpTxt_(f['REFERENCIA']); });
  add('SOBREVENTA', '¿Sobreventas Pick abiertas?', pick.length ? pick.length + ' abiertas' : 'Ninguna', pick.length ? '⚠️' : '✅', pick.length ? 'En la hoja Sobreventa Pick revisa las ' + pick.length + ' abiertas' : '');

  // CASOS (ultimas 2 semanas)
  var desde = ctx.ahora - 14 * 86400000;
  var cs = L('casos').filter(function (f) { var t = rpMs_(f['FECHA ABIERTO']); return t !== null && t >= desde; });
  var ce = rpCuenta_(cs, function (f) { return rpTxt_(f['ESTADO']).toUpperCase() || 'POR ABRIR'; });
  var n = function (k) { return ce[k] || 0; };
  var cerr = n('RESUELTO') + n('CERRADO'), accs = [];
  var reab = L('casos').filter(function (f) { return /^REABIERTO/i.test(rpTxt_(f['SEGUIMIENTO'])) && !/^(RESUELTO|CERRADO)$/i.test(rpTxt_(f['ESTADO'])); }).length;   // casos que reabriste y esperan a Walmart
  if (n('PIDE INFO')) accs.push('En Casos Walmart (ESTADO = PIDE INFO) responde ' + n('PIDE INFO') + ' que piden información');
  if (n('RESPUESTA WALMART')) accs.push('En Casos Walmart (ESTADO = RESPUESTA WALMART) lee ' + n('RESPUESTA WALMART') + ' respuesta(s) de Walmart y decide qué contestar');
  if (n('POR ABRIR')) accs.push('En Casos Walmart (ESTADO = POR ABRIR) abre ' + n('POR ABRIR') + ' caso(s) en Seller Center');
  var dd = L('decidir');   // si existe la hoja Casos Decidir, los pasos van por ahi (una decision por caso)
  if (dd.length) {
    var sinDec = dd.filter(function (f) { return !rpTxt_(f['DECISION']); }).length;
    var conTxt = dd.filter(function (f) { return ['ABRIR', 'ABRIR JUNTOS', 'RESPONDER', 'SEGUIMIENTO', 'CERRAR'].indexOf(rpTxt_(f['DECISION']).toUpperCase()) >= 0; }).length;
    accs = [];
    if (sinDec) accs.push('En la hoja Casos Decidir elige la DECISION de ' + sinDec + ' caso(s) y corre el menú 📝 Casos: decidir y generar textos');
    if (conTxt) accs.push('Pega en Seller Center el texto listo (columna TEXTO LISTO) de ' + conTxt + ' caso(s) ya decididos');
  }
  add('CASOS', '¿Casos de las últimas 2 semanas?', 'Por abrir ' + n('POR ABRIR') + ' · Abiertos ' + n('ABIERTO') + ' · Piden info ' + n('PIDE INFO') + ' · Respuesta Walmart ' + n('RESPUESTA WALMART') + ' · En espera ' + n('EN ESPERA WALMART') + ' · Cerrados ' + cerr + (reab ? ' · Reabiertos esperando a Walmart ' + reab : ''),
    accs.length ? '⚠️' : '✅', accs.join('\n'));

  // CANCELACIONES: cuantas se cancelaron por cada motivo (hoy y mes) y cuantas de precio erroneo esperan tu analisis
  var cc = L('canc'), canceladas = cc.filter(function (f) { return /^CANCELADO/.test(rpTxt_(f['ESTADO ODOO']).toUpperCase()); });
  var fechaDe = function (f) { var t = rpMs_(f['FECHA ODOO']); return t === null ? '' : ctx.iso(t); };
  var hoyC = canceladas.filter(function (f) { return fechaDe(f) === ctx.hoy; }), mesC = canceladas.filter(function (f) { return fechaDe(f).slice(0, 7) === ctx.mes; });
  var motivo = function (f) { var o = rpTxt_(f['ORIGEN']).toUpperCase(); return /SOBREVENTA/.test(o) ? 'Pick' : /PRECIO/.test(o) ? 'Precio erróneo' : /FRAUDE/.test(o) ? 'Fraude' : /CORREO/.test(o) ? 'Correo' : 'Otras'; };
  var porMotivo = function (lista) {
    var o = rpCuenta_(lista, motivo), t = ['Pick', 'Correo', 'Precio erróneo', 'Fraude'].map(function (k) { return k + ' ' + (o[k] || 0); });
    if (o['Otras']) t.push('Otras ' + o['Otras']);
    return t.join(' · ');
  };
  var peEspera = cc.filter(function (f) { return /PRECIO/.test(rpTxt_(f['ORIGEN']).toUpperCase()) && f['CANCELAR EN ODOO'] !== true && f['ENVIAR'] !== true && !rpTxt_(f['ESTADO ODOO']); }).length;
  var desde14 = ctx.iso(Date.parse(ctx.hoy) - 14 * 86400000);
  // 19-nov: PRECIO ERRONEO lo cancela la extension en Walmart y en Odoo (CancelacionesWalmartAuto.gs). A mano solo queda: fraude, y precio erroneo que fallo en Walmart (NOTA "ERROR WALMART") o de mas de CWA_MAX_DIAS dias.
  var recienteC = function (f) { var t = rpMs_(f['FECHA CORREO']) || rpMs_(f['FECHA LECTURA']); return t === null || ctx.iso(t) >= ctx.iso(Date.parse(ctx.hoy) - CWA_MAX_DIAS * 86400000); };
  var errWmC = function (f) { return /^ERROR WALMART/i.test(rpTxt_(f['NOTA ODOO'])); };
  var enCola = cc.filter(function (f) {
    return /PRECIO/.test(rpTxt_(f['ORIGEN']).toUpperCase()) && f['CANCELAR EN ODOO'] === true && f['ENVIAR'] !== true && f['CANCELADA EN WALMART'] !== true && !errWmC(f) && recienteC(f) &&
      !/^(OJO|NO ENCONTRADA)/i.test(rpTxt_(f['ESTADO ODOO']));
  }).length;
  var faltaWm = cc.filter(function (f) {
    var o = rpTxt_(f['ORIGEN']).toUpperCase();
    if (f['CANCELADA EN WALMART'] === true) return false;
    if (/FRAUDE/.test(o)) return /^CANCELADO/.test(rpTxt_(f['ESTADO ODOO']).toUpperCase()) && fechaDe(f) >= desde14;
    if (/PRECIO/.test(o)) return f['CANCELAR EN ODOO'] === true && f['ENVIAR'] !== true && (errWmC(f) || !recienteC(f)) && fechaDe(f) >= desde14 || (errWmC(f) && f['CANCELAR EN ODOO'] === true);
    return false;
  }).length;
  var accC = [];
  if (peEspera) accC.push('Decidir los precios erróneos en espera: casilla CANCELAR EN ODOO para cancelar (en Walmart y en Odoo) o ENVIAR para mandarlo');
  if (faltaWm) accC.push('Cancelar en Walmart a mano ' + faltaWm + ' (fraude, o precio erróneo que el sistema no pudo cancelar) y marcar CANCELADA EN WALMART');
  add('CANCELACIONES', '¿Cuántas ventas se cancelaron?', 'Hoy ' + hoyC.length + ': ' + porMotivo(hoyC) + '\nMes ' + mesC.length + ': ' + porMotivo(mesC) + '\nPrecio erróneo en espera de tu análisis: ' + peEspera + '\nEn cola para cancelarse solas en Walmart y luego en Odoo: ' + enCola + '\nPor cancelar en Walmart a mano (últimos 14 días): ' + faltaWm,
    (peEspera || faltaWm) ? '⚠️' : '✅', accC.join('\n'));
  // 26-nov: PRECIO ERRONEO es lo vital: si el sistema no pudo cancelar en Walmart, ella entra a cancelar a mano. Fila propia, en rojo si hay algo a mano.
  var pePre = cc.filter(function (f) { return /PRECIO/.test(rpTxt_(f['ORIGEN']).toUpperCase()); });
  var peLlegoHoy = pePre.filter(function (f) { var t = rpMs_(f['FECHA CORREO']) || rpMs_(f['FECHA LECTURA']); return t !== null && ctx.iso(t) === ctx.hoy; }).length;
  var peCanHoy = pePre.filter(function (f) { return /^CANCELADO/.test(rpTxt_(f['ESTADO ODOO']).toUpperCase()) && fechaDe(f) === ctx.hoy; }).length;
  var peMano = pePre.filter(function (f) { return f['CANCELADA EN WALMART'] !== true && f['ENVIAR'] !== true && f['CANCELAR EN ODOO'] === true && (errWmC(f) || (!recienteC(f) && fechaDe(f) >= desde14)); });
  var peLineas = ['Hoy: entraron ' + peLlegoHoy + ' · canceladas ' + peCanHoy, 'A mano en Walmart: ' + peMano.length + (peMano.length ? ' · pedidos ' + rpIds_(peMano, ['ORDEN DE COMPRA#', 'PEDIDO#']) : ''), 'En cola para cancelarse solas: ' + enCola, 'Por decidir (3% a 7%): ' + peEspera];
  var peAcc = [];
  if (peMano.length) peAcc.push('Entrar a Walmart y cancelar a mano ' + peMano.length + ' por precio erróneo (el sistema no pudo) y marcar CANCELADA EN WALMART: ' + rpIds_(peMano, ['ORDEN DE COMPRA#', 'PEDIDO#']));
  if (enCola) peAcc.push('Revisar en 1 hora: si ' + enCola + ' por precio erróneo siguen en cola, la extensión no está cancelando (Seller Center abierto y con sesión)');
  if (peEspera) peAcc.push('Decidir ' + peEspera + ' precio(s) erróneo(s) de 3% a 7%: CANCELAR EN ODOO o ENVIAR');
  if (!peAcc.length && (peLlegoHoy || peCanHoy)) peAcc.push('Revisar en la hoja Cancelaciones (ORIGEN = PRECIO ERRONEO) las de hoy: ya quedaron canceladas en Walmart y Odoo');
  add('CANCELACIONES', '¿Hay cancelaciones por precio erróneo?', peLineas.join('\n'), peMano.length ? '❌' : (peAcc.length || peLlegoHoy || peCanHoy) ? '⚠️' : '✅', peAcc.join('\n'));
  // La cancelacion llego cuando el pedido ya tenia guia: hay que avisar a la paqueteria (casilla PAQUETERIA AVISADA)
  var tardias = cc.filter(function (f) { var t = rpMs_(f['FECHA CORREO']) || rpMs_(f['FECHA LECTURA']); return /^S[IÍ](\s|$)/i.test(rpTxt_(f['GUIA EN SITE'])) && f['PAQUETERIA AVISADA'] !== true && t !== null && ctx.iso(t) >= desde14; });
  // 20-nov: los ERROR de pedidos antiguos (mas de CAN_DIAS_ANTIGUO dias: ya salieron de bodega o son WFS) no son error rojo: solo se cuentan
  var diasAnt = typeof CAN_DIAS_ANTIGUO !== 'undefined' ? CAN_DIAS_ANTIGUO : 7;
  var esAntiguo = function (f) { var t = rpMs_(f['FECHA CORREO']) || rpMs_(f['FECHA LECTURA']); return t !== null && ctx.ahora - t > diasAnt * 86400000; };
  var errTodos = cc.filter(function (f) { return /^ERROR/.test(rpTxt_(f['ESTADO ODOO']).toUpperCase()); });
  var antiguos = errTodos.filter(esAntiguo).length;
  var err = errTodos.length - antiguos;
  var ojo = cc.filter(function (f) { return /^OJO/.test(rpTxt_(f['ESTADO ODOO']).toUpperCase()); }).length;
  add('CANCELACIONES', '¿Cancelaciones con error o pendientes?', ((err || ojo || tardias.length) ? err + ' con error · ' + ojo + ' con aviso (orden activa)' + (tardias.length ? ' · ' + tardias.length + ' llegaron con la guía ya hecha' : '') : 'Ninguna') + (antiguos ? ' · ' + antiguos + ' antiguos que ya no se cancelan (ya salieron o son WFS)' : ''), (err || tardias.length) ? '❌' : ojo ? '⚠️' : '✅', (function () {
      var l = [];
      if (tardias.length) l.push('AVISAR A LA PAQUETERÍA que detenga el paquete (' + tardias.length + ') y marcar PAQUETERIA AVISADA: ' + rpIds_(tardias, ['ORDEN DE COMPRA#', 'PEDIDO#']));
      var de = function (re) { return cc.filter(function (f) { return re.test(rpTxt_(f['ESTADO ODOO']).toUpperCase()); }); };
      if (err) l.push('En la hoja Cancelaciones filtra QUE HACER = 🔴 · ESTADO ODOO ERROR (' + err + ') y cancélalos tú en el site: ' + rpIds_(de(/^ERROR/).filter(function (f) { return !esAntiguo(f); }), ['PEDIDO#', 'ORDEN DE COMPRA#']));
      if (ojo) l.push('En la hoja Cancelaciones filtra QUE HACER = 🔴 o 🟡 · ESTADO ODOO OJO PENDIENTE (' + ojo + ') y cancela la orden activa en Odoo: ' + rpIds_(de(/^OJO/), ['ORDEN DE COMPRA#', 'PEDIDO#']));
      return l.join('\n');
    })());

  // PRECIOS ERRONEOS
  var pe = cc.filter(function (f) { return /PRECIO/.test(rpTxt_(f['ORIGEN']).toUpperCase()); });
  var porDecidir = pe.filter(function (f) { return f['CANCELAR EN ODOO'] !== true && f['ENVIAR'] !== true && !rpTxt_(f['ESTADO ODOO']); }).length;
  var peMes = pe.filter(function (f) { var t = rpMs_(f['FECHA CORREO']) || rpMs_(f['FECHA LECTURA']); return t !== null && ctx.iso(t).slice(0, 7) === ctx.mes; }).length;
  var peCan = pe.filter(function (f) { return /^CANCELADO/.test(rpTxt_(f['ESTADO ODOO']).toUpperCase()); }).length;
  add('PRECIOS ERRONEOS', '¿Precios erróneos por decidir (3% a 7%)?', porDecidir + ' por decidir · ' + peMes + ' entraron este mes · ' + peCan + ' canceladas en total', porDecidir ? '⚠️' : '✅',
    porDecidir ? 'Decidir: CANCELAR EN ODOO (se cancela) o ENVIAR (se manda la guía)' : '');

  // GUIAS AUTOMATICAS: lo que hizo la extension en su ultima corrida (ver GuiasAuto.gs)
  try {
    var ga = (typeof gaUltima_ === 'function') ? gaUltima_() : null;
    if (ga) {
      var haceG = Math.max(0, Math.round((Date.now() - ga.ts) / 60000));
      var malG = (ga.resultados && (ga.resultados.mal || ga.resultados.pend)) || ga.error;
      var smG = (ga.sinMedidas || []).length;
      add('GUIAS', '¿Qué hizo la compra automática de guías?', 'Hace ' + (haceG < 90 ? haceG + ' min' : Math.round(haceG / 60) + ' h') + ' · ' + gaResumenReporte_(ga),
        malG ? '❌' : smG ? '⚠️' : '✅',
        (smG ? 'Escribe la caja una vez por SKU en la página de Guías: ' + ga.sinMedidas.slice(0, 5).map(function (x) { return x.sku; }).join(', ') : '') + (ga.resultados && ga.resultados.pend ? '\nHay guías pagadas sin marcar: abre Guías y pica «Reintentar marcar enviados»' : ''));
    }
  } catch (eG) {}

  // GUIAS GRANDES: pedidos con muchas piezas de un mismo producto (su guia no sale sola; ella las genera en Seller Center)
  try {
    var gg = ggResumen_();
    add('GUIAS', '¿Pedidos con muchas piezas esperando tus guías?', gg.porHacer + ' por hacer · ' + gg.porEnviar + ' por enviar · ' + gg.enviados + ' enviados', gg.porHacer ? '⚠️' : '✅',
      gg.porHacer ? 'Genera sus guías en Seller Center y marca GUIAS LISTAS en la hoja "Guias grandes"' : '');
  } catch (eGg) {}

  // KILLERS
  var kil = L('killers').filter(function (f) { return rpTxt_(f['SKU']); }).length;
  var kb = L('killersBajo').filter(function (f) { return rpTxt_(f['SKU WALMART']); });
  var topeK = typeof CANP_AUTO_PCT !== 'undefined' ? CANP_AUTO_PCT : 7;   // 19-nov: el tope de cancelacion sola es 7% (antes 5%)
  var kb5 = kb.filter(function (f) { return rpNum_(f['% PERDIDA']) > topeK / 100; }).length;
  add('KILLERS', '¿Killers y cuántos van bajo mínimo?', kil + ' killers · ' + kb.length + ' bajo mínimo' + (kb.length ? ' (' + kb5 + ' con pérdida mayor a ' + topeK + '%)' : ''), kb.length ? '⚠️' : '✅',
    kb.length ? 'En la hoja Killers bajo minimo revisa los ' + kb.length + (kb5 ? ' (los ' + kb5 + ' con pérdida de más de ' + topeK + '% se cancelan solos en Walmart y Odoo)' : '') : '');

  // RECOLECCION  (➖ Ya estaba pedida cuenta como bien: el AUTO la omite porque ya se pidio)
  var rc = L('recol').map(function (f) { return { t: rpMs_(f['FECHA Y HORA']), f: f }; }).filter(function (x) { return x.t !== null; }).sort(function (a, b) { return b.t - a.t; });
  if (!rc.length) add('RECOLECCION', '¿Se solicitó la recolección?', 'Sin registros', '⚠️', 'Revisar Recoleccion Historial');
  else {
    var u = rc[0], bien = /^(✅|➖)/.test(rpTxt_(u.f['RESULTADO'])), hoyR = ctx.iso(u.t) === ctx.hoy, laboral = ctx.dow >= 1 && ctx.dow <= 5;
    var e = !bien ? '❌' : (!hoyR && laboral && ctx.hora >= 9) ? '⚠️' : '✅';
    add('RECOLECCION', '¿Se solicitó la recolección?', rpTxt_(u.f['RESULTADO']) + ' · ' + ctx.iso(u.t) + ' · para ' + rpFecha_(u.f['RECOLECCION DEL'], ctx) + (e === '⚠️' ? ' · hoy aún no' : ''), e,
      e === '✅' ? '' : !bien ? 'Revisar el Log y reenviar la recolección' : 'Confirmar que hoy sí salió la recolección');
  }
  // 19-nov: a que hora recogio de verdad la paqueteria (hoja PAQUETERIA, columna Fecha recoleccion: primer evento de la guia ya en manos de la paqueteria)
  var pq = L('paq');
  if (pq.length) {
    var recDe = function (dia) { var ts = pq.map(function (f) { return rpMs_(f['FECHA RECOLECCION']); }).filter(function (t) { return t !== null && ctx.iso(t) === dia; }).sort(function (a, b) { return a - b; }); return ts; };
    var hhmm = function (t) { return Utilities.formatDate(new Date(t), TZ, 'HH:mm'); };
    var ayerD = ctx.iso(ctx.ahora - 86400000), rh = recDe(ctx.hoy), ra = recDe(ayerD), laboralR = ctx.dow >= 1 && ctx.dow <= 5;
    var eR = rh.length ? '✅' : (laboralR && ctx.hora >= 15 ? '⚠️' : '✅');
    add('RECOLECCION', '¿A qué hora recogió la paquetería?', (rh.length ? 'Hoy a las ' + hhmm(rh[0]) + ' (' + rh.length + ' guía' + (rh.length === 1 ? '' : 's') + ')' : 'Hoy todavía no hay guías recolectadas') +
      (ra.length ? ' · ayer a las ' + hhmm(ra[0]) + ' (' + ra.length + ')' : ''), eR, eR === '⚠️' ? 'Confirma con bodega si pasó la paquetería (según Paquetería Dedicada Walmart / FedEx todavía no recoge)' : '');
  }

  // 24-nov (ella: "necesito estar informada si tengo o no pedidos atrasados siempre"): guias de la Paqueteria Dedicada Walmart ya listas
  // (codigo 108) que todavia no recogen, por dia en que quedaron listas. 2+ dias = atrasadas.
  if (pq.length) {
    var cset = {};
    L('canc').forEach(function (f) { if (/^CANCELADO/.test(rpTxt_(f['ESTADO ODOO']).toUpperCase())) { [f['ORDEN DE COMPRA#'], f['PEDIDO#']].forEach(function (v) { var d = rpTxt_(v).replace(/\D/g, ''); if (d) cset[d] = 1; }); } });
    var pr = rpPendRecoger_(pq, ctx.ahora, ctx, cset);
    add('RECOLECCION', '¿Paquetes pendientes de recoger?',
      pr.total ? pr.total + ' pendientes · ' + pr.atrasados + ' atrasados (2+ días hábiles) · ' + pr.dias.map(function (d) { return d.n + ' del ' + d.dia; }).join(' · ') : 'Ninguno',
      pr.atrasados ? '❌' : '✅',
      pr.atrasados ? 'Pedir a la paquetería que pase por los ' + pr.atrasados + ' atrasados (la guía queda en "Listo para ser recolectado"). Órdenes: ' + pr.lista.slice(0, 10).join(', ') : '');
  }

  // VENTAS
  // 26-nov (ella pidio un formato mas claro): una linea por idea, mes en curso, mes anterior y, en CVA, acumulado y canales.
  var rm = rpUno_(L('resMes'), function (f) { return rpTxt_(f['ESTADO']).toUpperCase() === 'EN CURSO'; });
  var rmAnt = rpUno_(L('resMes'), function (f) { return rpTxt_(f['ESTADO']).toUpperCase() === 'CERRADO'; });
  add('VENTAS', '¿Venta Walmart del mes?', rm ? [rpTxt_(rm['MES']) + ' (en curso): ' + rpPesos_(rm['TOTAL']) + (rm['DIARIO'] !== undefined && rm['DIARIO'] !== '' ? ' · ' + rpPesos_(rm['DIARIO']) + ' por día' : ''),
    'WFS ' + rpPesos_(rm['WFS']) + ' · Seller ' + rpPesos_(rm['SELLER']) + ' · Killers ' + rpPesos_(rm['KILLERS'])].concat(rmAnt ? ['Mes anterior (' + rpTxt_(rmAnt['MES']) + '): ' + rpPesos_(rmAnt['TOTAL'])] : []).join('\n') : 'Sin mes en curso', rm ? '✅' : '⚠️', '');
  var rv = rpUno_(L('resCva'), function (f) { return rpTxt_(f['ESTADO']).toUpperCase() === 'EN CURSO'; });
  var rvAnt = rpUno_(L('resCva'), function (f) { return rpTxt_(f['ESTADO']).toUpperCase() === 'CERRADO'; });
  var canalesCva = rv ? Object.keys(rv).filter(function (k) { return /^VENTA (?!TOTAL|SIN|ACUM)/.test(k) && rpNum_(rv[k]) > 0; }).map(function (k) { return { n: k.replace(/^VENTA /, ''), v: rpNum_(rv[k]) }; }).sort(function (x, y) { return y.v - x.v; }).slice(0, 4) : [];
  add('VENTAS', '¿Venta CVA del mes y acumulada?', rv ? ['Mes en curso (' + rpTxt_(rv['MES']) + '): ' + rpPesos_(rv['VENTA TOTAL']) + ' · ' + rpNum_(rv['LINEAS']) + ' líneas · ' + rpNum_(rv['PIEZAS']) + ' piezas',
    'Acumulado total (todo el histórico): ' + rpPesos_(rv['VENTA ACUMULADA'])].concat(rvAnt ? ['Mes anterior (' + rpTxt_(rvAnt['MES']) + '): ' + rpPesos_(rvAnt['VENTA TOTAL'])] : [], canalesCva.length ? ['Canales del mes: ' + canalesCva.map(function (c) { return c.n.charAt(0) + c.n.slice(1).toLowerCase() + ' ' + rpPesos_(c.v); }).join(' · ')] : []).join('\n') : 'Sin mes en curso', rv ? '✅' : '⚠️', '');

  // 20-nov (ella: "cuando empiecen a aparecer guias con dias sin movimiento, que salgan en los reportes"). Reglas de
  // rastreo-sin-movimiento-y-aviso-bigsmart.md: 108 (lista para recolectar) con 2+ dias = nunca recolectada; otro evento con 3+ dias = sin movimiento.
  var sm = rpSinMovimiento_(L('paq'), Date.now());
  if (L('paq').length) add('RASTREO', '¿Guías sin movimiento?',
    sm.todas.length ? sm.todas.length + ': ' + sm.nunca.length + ' nunca recolectadas (2+ días hábiles en "Listo para ser recolectado") · ' + sm.paradas.length + ' recolectadas sin evento en 3+ días' : 'Ninguna',
    sm.todas.length ? '❌' : '✅',
    sm.todas.slice(0, 8).map(function (x) { return x.guia + ' · ' + x.dias + ' días · ' + x.motivo + (x.orden ? ' · orden ' + x.orden : ''); }).join('\n') +
      (sm.todas.length > 8 ? '\nY ' + (sm.todas.length - 8) + ' más: filtra la hoja PAQUETERIA por Codigo evento / Fecha evento' : '') +
      (sm.nunca.length ? '\nNunca recolectadas: llamar a la paquetería para que pase' : '') +
      (sm.paradas.length ? '\nRecolectadas sin movimiento: abrir caso "La paquetería recolectó mi paquete, pero la guía no tiene movimiento"' : ''));

  // 20-nov (ella: "esto tiene que salir en el reporte"): pedidos que Walmart sigue viendo en "Nuevo" con mas de 1 dia.
  // Con guia ya hecha = nadie confirmo el envio en Walmart (la compra automatica no los ve: ya salieron de la lista de guias del site).
  var se = rpSinEnviar_(L('seller'), L('paq'), ctx);
  if (L('seller').length) add('PEDIDOS EN RIESGO', '¿Pedidos en "Nuevo" en Walmart con más de 1 día?',
    se.todos.length ? se.todos.length + ': ' + se.conGuia.length + ' ya tienen guía (falta confirmar el envío en Seller Center) · ' + se.sinGuia.length + ' sin guía' : 'Ninguno',
    se.todos.length ? '❌' : '✅',
    se.conGuia.slice(0, 6).map(function (x) { return 'Confirmar envío en Seller Center · pedido ' + x.pedido + ' · guía ' + x.guia + ' · desde ' + x.fecha; })
      .concat(se.sinGuia.slice(0, 4).map(function (x) { return 'Sin guía: revisar en el site · pedido ' + x.pedido + ' · desde ' + x.fecha; })).join('\n') +
      (se.todos.length > 10 ? '\nY ' + (se.todos.length - 10) + ' más en la hoja Seller Center' : ''));

  // PEDIDOS EN RIESGO
  var rg = L('riesgo').filter(function (f) { return rpTxt_(f['PEDIDO']); });
  var rs = rpCuenta_(rg, function (f) { return rpTxt_(f['SITUACION']) || 'sin situación'; });
  add('PEDIDOS EN RIESGO', '¿Pedidos en riesgo por falta de embarque?', rg.length ? rg.length + ': ' + rpPartes_(rs) : 'Ninguno', rg.length ? '⚠️' : '✅', rg.slice(0, 5).map(function (f) { return (rpTxt_(f['ACCION']) || 'Revisar') + ' · pedido ' + rpIds_([f], ['PEDIDO']); }).join('\n') + (rg.length > 5 ? '\nY ' + (rg.length - 5) + ' más en la hoja Pedidos en riesgo' : ''));
  // primero ✅, luego ⚠️, luego ❌; dentro de cada grupo por area (estable)
  var rango = { '✅': 0, '⚠️': 1, '❌': 2 };
  var ord = out.map(function (x, i) { return { x: x, e: rango[x.estado] === undefined ? 1 : rango[x.estado], a: RP_AREAS.indexOf(x.area) < 0 ? RP_AREAS.length : RP_AREAS.indexOf(x.area), i: i }; })
    .sort(function (p, q) { return p.e - q.e || p.a - q.a || p.i - q.i; }).map(function (p) { return p.x; });
  return [rpAcciones_(ord)].concat(ord);
}

/** Fila fija arriba: todos los pasos juntos (lo urgente primero), uno por linea y numerados. */
function rpAcciones_(filas) {
  var pasos = [], hayRojo = false;
  [['❌'], ['⚠️']].forEach(function (g) {
    filas.forEach(function (f) {
      if (f.estado !== g[0] || !rpTxt_(f.accion)) return;
      if (g[0] === '❌') hayRojo = true;
      String(f.accion).split('\n').forEach(function (l) { l = rpTxt_(l); if (l) pasos.push(f.area + ': ' + l); });
    });
  });
  return { area: 'ACCION', pregunta: '¿Qué hago ahora?',
    resp: pasos.length ? pasos.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') : 'Nada pendiente',
    estado: pasos.length ? (hayRojo ? '❌' : '⚠️') : '✅', accion: '' };
}

/**
 * Pura. Guias EN CURSO (sin Estado final) paradas: 108 con 2+ dias = nunca recolectada; cualquier otro evento con 3+ dias = sin movimiento.
 * paq = objetos de PAQUETERIA por encabezado normalizado. Ordena de mas a menos dias.
 */
var RP_SM_DIAS = 3, RP_SM_DIAS_108 = 2;
/**
 * 24-nov (ella: "un paquete de viernes en la tarde espera al lunes, no es atraso"): los dias de espera cuentan SOLO de lunes a viernes.
 * Pura. Dias habiles COMPLETOS entre el dia del evento y hoy (ni uno ni otro). isoFn(ms) -> 'AAAA-MM-DD' (CDMX por omision, UTC-6 fijo).
 */
function rpDiasHab_(t, ahoraMs, isoFn) {
  var iso = isoFn || function (ms) { return new Date(ms - 6 * 3600000).toISOString().slice(0, 10); };
  var fin = iso(ahoraMs), n = 0;
  if (iso(t) >= fin) return 0;
  for (var ms = t + 86400000, i = 0; i < 90; i++, ms += 86400000) {
    var d = iso(ms);
    if (d >= fin) break;
    var dw = new Date(d + 'T12:00:00Z').getUTCDay();
    if (dw >= 1 && dw <= 5) n++;
  }
  return n;
}
function rpSinMovimiento_(paq, ahoraMs, isoFn) {
  var nunca = [], paradas = [];
  (paq || []).forEach(function (f) {
    if (rpTxt_(f['ESTADO FINAL'])) return;
    var g = rpTxt_(f['GUIA']).replace(/^'/, ''), cod = rpTxt_(f['CODIGO EVENTO']).replace(/^'/, ''), t = rpMs_(f['FECHA EVENTO']);
    if (!g || !cod || t === null) return;
    var dias = rpDiasHab_(t, ahoraMs, isoFn);   // dias habiles (lunes a viernes)
    var x = { guia: g, dias: dias, codigo: cod, orden: rpTxt_(f['ORDEN DE COMPRA (609)']).replace(/^'/, ''), motivo: '' };
    if (cod === '108') { if (dias >= RP_SM_DIAS_108) { x.motivo = 'nunca recolectada (108)'; nunca.push(x); } }
    else if (dias >= RP_SM_DIAS) { x.motivo = 'sin evento desde el código ' + cod + ' "' + rpTxt_(f['ULTIMO EVENTO']).slice(0, 40) + '"'; paradas.push(x); }
  });
  var orden = function (a, b) { return b.dias - a.dias; };
  nunca.sort(orden); paradas.sort(orden);
  return { nunca: nunca, paradas: paradas, todas: paradas.concat(nunca) };
}

/**
 * Pura. Guias de la Paqueteria Dedicada Walmart en codigo 108 (lista para recolectar), sin Fecha recoleccion y sin Estado final.
 * Agrupa por dia del evento 108 (dd/mm). atrasados = 2+ dias. paq = objetos de PAQUETERIA por encabezado normalizado.
 */
function rpPendRecoger_(paq, ahoraMs, ctx, canc) {
  var porDia = {}, lista = [], atrasados = 0, total = 0, canceladas = [];
  var sd = function (v) { return rpTxt_(v).replace(/\D/g, ''); };
  (paq || []).forEach(function (f) {
    if (rpTxt_(f['ESTADO FINAL']) || rpTxt_(f['FECHA RECOLECCION'])) return;
    if (!/DEDICADA|BIGSMART/.test(rpTxt_(f['PAQUETERIA']).toUpperCase())) return;
    if (rpTxt_(f['CODIGO EVENTO']).replace(/^'/, '') !== '108') return;
    var t = rpMs_(f['FECHA EVENTO']); if (t === null) return;
    var o609 = sd(f['ORDEN DE COMPRA']) || sd(f['ORDEN DE COMPRA (609)']), o6k = sd(f['ORDEN WALMART (6000)']);
    // 24-nov: una orden cancelada con guia ya comprada no es un paquete que recoger (se avisa a la paqueteria aparte)
    if (canc && ((o609 && canc[o609]) || (o6k && canc[o6k]))) { canceladas.push(o609 || o6k || rpTxt_(f['GUIA']).replace(/^'/, '')); return; }
    var iso = ctx.iso(t), dia = iso.slice(8, 10) + '/' + iso.slice(5, 7);
    porDia[iso] = porDia[iso] || { dia: dia, n: 0 }; porDia[iso].n++;
    total++;
    if (rpDiasHab_(t, ahoraMs, ctx && ctx.iso) >= 2) { atrasados++; lista.push(o609 || o6k || rpTxt_(f['GUIA']).replace(/^'/, '')); }
  });
  var dias = Object.keys(porDia).sort().map(function (k) { return porDia[k]; });
  return { total: total, atrasados: atrasados, dias: dias, lista: lista, canceladas: canceladas };
}

/**
 * Pura. Pedidos de Seller Center en "Nuevo"/"Aceptado" con fecha de pedido anterior a hoy (mas de 1 dia), separados en
 * con guia (hoja PAQUETERIA por Orden Walmart 6000) y sin guia. sc/paq = objetos por encabezado normalizado.
 */
function rpSinEnviar_(sc, paq, ctx) {
  var guia = {};
  (paq || []).forEach(function (f) { var o = rpTxt_(f['ORDEN WALMART (6000)']).replace(/\D/g, ''); var g = rpTxt_(f['GUIA']).replace(/^'/, ''); if (o && g && !guia[o]) guia[o] = g; });
  var hoy = ctx.hoy, todos = [], conGuia = [], sinGuia = [], visto = {};
  (sc || []).forEach(function (f) {
    var est = rpTxt_(f['ESTADO SELLER CENTER']).toLowerCase();
    if (!/^(nuevo|aceptado)/.test(est)) return;
    var act = rpMs_(f['ACTUALIZADO']);
    if (act === null || Date.now() - act > 6 * 3600000) return;   // 20-nov: solo lo que Seller Center confirmo en las ultimas 6 h (la hoja guarda filas viejas que ya no se releen)
    var ped = rpTxt_(f['PEDIDO']).replace(/\D/g, '').replace(/^(\d{15}).*/, '$1');
    var t = rpMs_(f['FECHA PEDIDO']);
    if (!ped || visto[ped] || t === null || ctx.iso(t) >= hoy) return;   // de hoy: van normales (espera de 30 min y compra automatica)
    visto[ped] = true;
    var x = { pedido: ped, fecha: ctx.iso(t), guia: guia[ped] || '' };
    todos.push(x); (x.guia ? conGuia : sinGuia).push(x);
  });
  var orden = function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; };
  conGuia.sort(orden); sinGuia.sort(orden);
  return { todos: todos, conGuia: conGuia, sinGuia: sinGuia };
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
  var turno = null, autoLatido = null, autoAct = null;
  try { autoLatido = JSON.parse(props_().getProperty('AUTO_LATIDO_V1') || 'null'); } catch (e) {}
  try { autoAct = JSON.parse(props_().getProperty('AUTO_LATIDO_EXT_V1') || 'null'); } catch (e) {}
  try { turno = extOrdenResp_(props_(), Date.now()); } catch (e) {}
  return {
    salud: rpObjetos_('Salud'), sobWfs: rpObjetos_('Sobreventa WFS'), sobPick: rpObjetos_('Sobreventa Pick'), casos: rpObjetos_(CAW_HOJA), decidir: rpObjetos_('Casos Decidir'), canc: rpObjetos_('Cancelaciones'),
    killers: rpObjetos_('Killers'), killersBajo: rpObjetos_('Killers bajo minimo'), recol: rpObjetos_('Recoleccion Historial'), paq: rpObjetos_('PAQUETERIA'), seller: rpObjetos_('Seller Center'),
    resMes: rpObjetos_('Resumen venta y killers'), resCva: rpObjetos_('Resumen venta CVA'), riesgo: rpObjetos_(PRI_HOJA), buzon: buzon, turno: turno, autoLatido: autoLatido, autoAct: autoAct
  };
}

function rpContexto_() {
  var ahora = Date.now(), d = new Date(ahora);
  var iso = function (ms) { return Utilities.formatDate(new Date(ms), TZ, 'yyyy-MM-dd'); };
  return { ahora: ahora, hoy: iso(ahora), mes: iso(ahora).slice(0, 7), dow: Number(Utilities.formatDate(d, TZ, 'u')), hora: Number(Utilities.formatDate(d, TZ, 'H')), iso: iso };
}

/** Acomoda las filas AUTO en el orden del reporte (✅, ⚠️, ❌); las preguntas tuyas (LLENA = CLAUDE) quedan al final. Solo reescribe si el orden cambio. */
function rpOrdenar_(h, m, filas) {
  var n = h.getLastRow() - 1, nc = h.getLastColumn(), cP = escrCol_(m, 'PREGUNTA'), cL = escrCol_(m, 'LLENA');
  if (n < 2 || !cP) return false;
  var pos = {}; filas.forEach(function (f, i) { pos[normEnc_(f.pregunta)] = i; });
  var vals = h.getRange(2, 1, n, nc).getValues();
  var orden = vals.map(function (r, i) {
    var k = pos[normEnc_(r[cP - 1])], llena = cL ? normEnc_(r[cL - 1]) : '';
    return { r: r, o: (k === undefined || (llena && llena !== 'AUTO')) ? filas.length + 1 : k, i: i };
  });
  orden.sort(function (a, b) { return a.o - b.o || a.i - b.i; });
  if (orden.every(function (x, j) { return x.i === j; })) return false;
  h.getRange(2, 1, n, nc).setValues(orden.map(function (x) { return x.r; }));
  return true;
}

/** Pura: indices (0 = fila 2) de filas AUTO cuya pregunta ya no existe (p. ej. la vieja "(3% a 5%)"). Las que llena Claude no se tocan. */
function rpViejas_(preguntas, llenas, filas) {
  var vivas = {}; filas.forEach(function (f) { vivas[normEnc_(f.pregunta)] = true; });
  var out = [];
  preguntas.forEach(function (p, i) {
    var k = normEnc_(p), ll = normEnc_(llenas ? llenas[i] : '');
    if (k && !vivas[k] && (!ll || ll === 'AUTO') && /\(\d+% A \d+%\)/.test(k)) out.push(i);   // 20-nov: solo preguntas con rango de % viejo (las demas pueden faltar un rato por falta de datos)
  });
  return out;
}
/** Borra del Reporte las filas AUTO viejas (de abajo hacia arriba) y lo deja en el Log. */
function rpQuitarViejas_(h, m, filas) {
  var n = h.getLastRow() - 1, cP = escrCol_(m, 'PREGUNTA'), cL = escrCol_(m, 'LLENA');
  if (n < 1 || !cP) return 0;
  var preg = h.getRange(2, cP, n, 1).getValues().map(function (r) { return r[0]; });
  var ll = cL ? h.getRange(2, cL, n, 1).getValues().map(function (r) { return r[0]; }) : null;
  var v = rpViejas_(preg, ll, filas);
  for (var j = v.length - 1; j >= 0; j--) h.deleteRow(v[j] + 2);
  if (v.length) logInfo_(RP_ETAPA, 'Reporte: se quitaron ' + v.length + ' fila(s) vieja(s): ' + v.map(function (i) { return preg[i]; }).join(' · '));
  return v.length;
}

/** Recalcula y escribe las filas AUTO. Devuelve {filas, nuevas, avisos, hoja}. */
function reporteActualizar_() {
  var filas = rpCalcular_(rpDatos_(), rpContexto_());
  var h = peHojaAsegurar_(RP_HOJA, RP_ENC), m = ubicarColumnas_(h, RP_ENC, 1);
  var col = function (e) { return escrCol_(m, e); };
  rpOrdenar_(h, m, filas);
  rpQuitarViejas_(h, m, filas);
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

/** Formato legible: anchos (solo si la columna esta angosta), texto que se ajusta, ESTADO centrado y con color. Nunca pisa formatos tuyos. */
function rpFormato_(h, m) {
  var ancho = { 'AREA': 150, 'PREGUNTA': 280, 'RESPUESTA': 520, 'ESTADO': 70, 'ACCION': 360, 'LLENA': 80, 'ACTUALIZADO': 140 };
  RP_ENC.forEach(function (e) { var c = escrCol_(m, e); if (c && h.getColumnWidth(c) < 100 && ancho[e]) h.setColumnWidth(c, ancho[e]); });
  var nf = h.getLastRow() - 1;
  if (nf < 1) return;
  ['AREA', 'PREGUNTA', 'RESPUESTA', 'ACCION'].forEach(function (e) { var c = escrCol_(m, e); if (c) h.getRange(2, c, nf, 1).setWrap(true).setVerticalAlignment('top'); });
  var cE = escrCol_(m, 'ESTADO');
  if (cE) h.getRange(2, cE, nf, 1).setHorizontalAlignment('center').setVerticalAlignment('top');
  var cA = escrCol_(m, 'ACTUALIZADO');
  if (cA) h.getRange(2, cA, nf, 1).setNumberFormat('yyyy-mm-dd hh:mm').setVerticalAlignment('top');
  // colores del ESTADO: una sola vez (si la hoja ya tiene reglas de color no se agregan otras)
  if (cE && !h.getConditionalFormatRules().length) {
    var rango = h.getRange(2, cE, Math.max(h.getMaxRows() - 1, 1), 1), regla = function (txt, fondo) {
      return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(txt).setBackground(fondo).setRanges([rango]).build();
    };
    h.setConditionalFormatRules([regla('✅', '#d9ead3'), regla('⚠️', '#fff2cc'), regla('❌', '#f4cccc')]);
  }
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
