/**
 * BuzonMensajes.gs — Site Sheet
 *
 * Los mensajes del Buzon de Seller Center que PIDEN RESPUESTA (los recientes), en la hoja "Buzon Mensajes".
 * Es para que ella no tenga que revisar el Buzon: aqui se ve que falta contestar, de que tipo es y que plantilla va.
 *
 * - La extension abre una pestana PROPIA del Buzon (no toca las de ella), lee el texto de la lista (solo lectura)
 *   y lo manda aqui tal cual (accion 'seller_buzon_lista'). El Sheet lo interpreta: asi, si Walmart cambia algo,
 *   se arregla aqui sin tener que reinstalar la extension en las 3 computadoras.
 * - Solo se guardan los que dicen "Se requiere una respuesta". Si despues aparece el mismo mensaje sin esa marca,
 *   la fila pasa a RESUELTO. No se borra nada.
 * - Etapa 1 (hoy): ella anota en PLANTILLA el NUM de la hoja "Plantillas Buzon".
 * - Etapa 2 (hoy, solo sugerencia): SUGERIDA = la plantilla que ella mas ha usado para ese TIPO de mensaje
 *   (minimo 3 veces y 70%). No manda nada.
 * - Etapa 3 (enviar sola) NO existe: mandar un mensaje es escribir en Walmart y solo se hara con su OK expreso.
 * - Aqui no se envia nada a Walmart.
 */
var BZM_HOJA = 'Buzon Mensajes', BZM_ETAPA = 'BUZON';
var BZM_ENC = ['ESTADO', 'LIMITE', 'FECHA', 'CLIENTE', 'TIPO', 'ASUNTO', 'PEDIDO', 'PLANTILLA', 'SUGERIDA', 'NOTA', 'VISTO'];
var BZM_MIN_USOS = 3, BZM_MIN_PORC = 0.7;

/** Pura. Fecha del Buzon -> 'yyyy-mm-dd'. 'Hoy'/'Ayer' contra hoyIso; 'MM/DD/YYYY' (formato de Walmart). '' si no entiende. */
function bzmFecha_(txt, hoyIso) {
  var s = String(txt || '').trim(), m;
  if (/^hoy$/i.test(s)) return hoyIso || '';
  if (/^ayer$/i.test(s)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hoyIso || '')) return '';
    var p = hoyIso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) - 86400000);
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return '';
  return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
}

/** Pura. Clasifica por el asunto del mensaje del cliente. */
function bzmTipo_(asunto) {
  var a = String(asunto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/no ha llegado|fecha estimada|no llego|retraso|demora/.test(a)) return 'LLEGADA';
  if (/factura/.test(a)) return 'FACTURA';
  if (/garantia/.test(a)) return 'GARANTIA';
  if (/llego incompleto|incompleto|faltan? pieza|falta(n)? producto/.test(a)) return 'INCOMPLETO';
  if (/dano|danado|roto|defectuos|no funciona|descompuesto|equivocad/.test(a)) return 'DANADO';
  if (/devol|reembolso|cancel/.test(a)) return 'DEVOLUCION';
  if (/dudas|como usar|instruccion|funciona/.test(a)) return 'USO';
  return 'OTRO';
}

/**
 * Pura. Texto de la pagina del Buzon -> [{cliente, fecha, asunto, pedido, tipo, pendiente, horas, atrasado}].
 * Cada mensaje son estas lineas seguidas: cliente / fecha / "Mensaje ...: asunto, pedido" / "Nº de pedido: X" /
 * (opcional) "Se requiere una respuesta" y "47 horas" o "Atrasado". Sin repetidos (mismo pedido+tipo+fecha+cliente).
 */
function bzmParsear_(texto, hoyIso) {
  var L = String(texto || '').split(/\r?\n/).map(function (x) { return x.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  var reFecha = /^(Hoy|Ayer|\d{1,2}\/\d{1,2}\/\d{4})$/i, rePed = /^N[º°o.]?\s*de pedido\s*:\s*(\S+)/i;
  var inicios = [];
  for (var i = 0; i + 3 < L.length; i++) {
    if (reFecha.test(L[i + 1]) && /^Mensaje\b/i.test(L[i + 2]) && rePed.test(L[i + 3]) && !reFecha.test(L[i])) inicios.push(i);
  }
  var out = [], vistos = {};
  inicios.forEach(function (ini, k) {
    var fin = k + 1 < inicios.length ? inicios[k + 1] : L.length, resto = L.slice(ini + 4, fin);
    var asuntoTodo = L[ini + 2].replace(/^[^:]*:\s*/, ''), pedido = rePed.exec(L[ini + 3])[1];
    var asunto = asuntoTodo.replace(/,\s*\d{6,}\s*$/, '').trim();
    var pendiente = false, horas = null, atrasado = false;
    resto.slice(0, 4).forEach(function (x) {
      var m;
      if (/^Se requiere una respuesta$/i.test(x)) pendiente = true;
      else if (/^Atrasado$/i.test(x)) atrasado = true;
      else if ((m = /^(\d+)\s*(horas?|h|d[ií]as?|minutos?)$/i.exec(x))) horas = /^d/i.test(m[2]) ? +m[1] * 24 : /^m/i.test(m[2]) ? Math.ceil(+m[1] / 60) : +m[1];
    });
    var fecha = bzmFecha_(L[ini + 1], hoyIso);
    var msg = { cliente: L[ini], fecha: fecha, asunto: asunto, pedido: pedido, tipo: bzmTipo_(asunto), pendiente: pendiente, horas: horas, atrasado: atrasado };
    var llave = bzmLlave_(msg);
    if (vistos[llave]) { if (pendiente) { var u = vistos[llave]; u.pendiente = true; u.atrasado = u.atrasado || atrasado; if (horas !== null) u.horas = horas; } return; }
    vistos[llave] = msg; out.push(msg);
  });
  return out;
}

/** Pura. Llave de un mensaje (sin importar mayusculas ni espacios). */
function bzmLlave_(m) {
  return [String(m.pedido || ''), String(m.tipo || ''), String(m.fecha || ''), String(m.cliente || '').toLowerCase().replace(/\s+/g, ' ')].join('|');
}

/** Pura. Texto del limite: 'ATRASADO', '47 h' o ''. */
function bzmLimite_(m) { return m.atrasado ? 'ATRASADO' : (m.horas !== null && m.horas !== undefined ? m.horas + ' h' : ''); }

/** Pura. Con lo que ella ya anoto -> {TIPO: NUM sugerido}. Minimo BZM_MIN_USOS usos y BZM_MIN_PORC del total de ese tipo. */
function bzmSugerencias_(historial) {
  var por = {};
  (historial || []).forEach(function (x) {
    var n = Number(x.plantilla); if (!x.tipo || !isFinite(n) || n <= 0) return;
    (por[x.tipo] = por[x.tipo] || {})[n] = (por[x.tipo][n] || 0) + 1;
  });
  var out = {};
  Object.keys(por).forEach(function (tipo) {
    var tot = 0, mejor = 0, usos = 0;
    Object.keys(por[tipo]).forEach(function (n) { tot += por[tipo][n]; if (por[tipo][n] > usos) { usos = por[tipo][n]; mejor = +n; } });
    if (usos >= BZM_MIN_USOS && usos / tot >= BZM_MIN_PORC) out[tipo] = mejor;
  });
  return out;
}

/** POST 'seller_buzon_lista' {clave, texto, porResponder} -> {ok, leidos, pendientes, nuevos, resueltos}. */
function bzmRecibir_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var texto = String(p.texto || '').slice(0, 150000);
  var hoyIso = Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd');
  var msgs = bzmParsear_(texto, hoyIso);
  if (!msgs.length) {
    if (texto.length > 300 && /Mensaje|Buz/i.test(texto)) { logWarn_(BZM_ETAPA, 'Buzon: no reconoci el formato de la lista (Walmart pudo cambiar la pantalla)'); flushLog_(); return { ok: false, error: 'formato' }; }
    return { ok: true, leidos: 0, pendientes: 0, nuevos: 0, resueltos: 0 };
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'ocupado' };
  try {
    var h = peHojaAsegurar_(BZM_HOJA, BZM_ENC), m = ubicarColumnas_(h, BZM_ENC, 1);
    var col = function (e) { return escrCol_(m, e); };
    var n = Math.max(h.getLastRow() - 1, 0), vals = n ? h.getRange(2, 1, n, h.getLastColumn()).getValues() : [];
    var v = function (f, e) { var c = col(e); return c ? f[c - 1] : ''; };
    var poner = function (fila, e, x) { var c = col(e); if (c) h.getRange(fila, c).setValue(x); };
    var ahora = Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm');
    var porLlave = {};
    vals.forEach(function (f, i) {
      var fecha = v(f, 'FECHA'); if (fecha instanceof Date) fecha = Utilities.formatDate(fecha, 'America/Mexico_City', 'yyyy-MM-dd');
      porLlave[bzmLlave_({ pedido: v(f, 'PEDIDO'), tipo: v(f, 'TIPO'), fecha: fecha, cliente: v(f, 'CLIENTE') })] = i;
    });
    var sug = bzmSugerencias_(vals.map(function (f) { return { tipo: String(v(f, 'TIPO')), plantilla: v(f, 'PLANTILLA') }; }));
    var nuevos = [], resueltos = 0, urgentes = 0;
    msgs.forEach(function (x) {
      var i = porLlave[bzmLlave_(x)];
      if (i === undefined) {
        if (!x.pendiente) return;   // solo se guardan los que piden respuesta
        if (x.atrasado || (x.horas !== null && x.horas <= 24)) urgentes++;
        nuevos.push({ 'ESTADO': 'PENDIENTE', 'LIMITE': bzmLimite_(x), 'FECHA': x.fecha, 'CLIENTE': x.cliente, 'TIPO': x.tipo, 'ASUNTO': x.asunto, 'PEDIDO': "'" + x.pedido, 'PLANTILLA': '', 'SUGERIDA': sug[x.tipo] || '', 'NOTA': '', 'VISTO': ahora });
        return;
      }
      var f = vals[i], fila = i + 2, est = String(v(f, 'ESTADO'));
      if (x.pendiente) {
        if (est !== 'PENDIENTE') { poner(fila, 'ESTADO', 'PENDIENTE'); f[col('ESTADO') - 1] = 'PENDIENTE'; }
        if (String(v(f, 'LIMITE')) !== bzmLimite_(x)) poner(fila, 'LIMITE', bzmLimite_(x));
        if (!String(v(f, 'PLANTILLA')).trim() && String(v(f, 'SUGERIDA')) !== String(sug[x.tipo] || '')) poner(fila, 'SUGERIDA', sug[x.tipo] || '');
      } else if (est === 'PENDIENTE') { poner(fila, 'ESTADO', 'RESUELTO'); poner(fila, 'LIMITE', ''); f[col('ESTADO') - 1] = 'RESUELTO'; resueltos++; }
      poner(fila, 'VISTO', ahora);
    });
    if (nuevos.length) peAgregar_(h, BZM_ENC, nuevos);
    if (nuevos.length || resueltos) { try { bzmFormato_(h, m); } catch (e) {} }
    var pendientes = 0; vals.forEach(function (f) { if (String(v(f, 'ESTADO')) === 'PENDIENTE') pendientes++; });
    pendientes += nuevos.length;
    if (nuevos.length || resueltos) {
      var txt = 'Buzon: ' + nuevos.length + ' mensaje(s) nuevo(s) que piden respuesta, ' + resueltos + ' ya resuelto(s); pendientes ahora: ' + pendientes;
      if (urgentes) logWarn_(BZM_ETAPA, txt + ' (' + urgentes + ' urgente(s): atrasados o con menos de 24 h)'); else logOk_(BZM_ETAPA, txt);
    }
    flushLog_();
    return { ok: true, leidos: msgs.length, pendientes: pendientes, nuevos: nuevos.length, resueltos: resueltos };
  } catch (e) {
    logErr_(BZM_ETAPA, 'No se pudo guardar la lista del Buzon: ' + String(e.message || e).split('\n')[0]); flushLog_();
    return { ok: false, error: 'no_se_pudo_guardar' };
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

/** Anchos y ajuste de texto solo en las columnas propias, y solo si estan angostas (respeta lo que ella ya cambio). */
function bzmFormato_(h, m) {
  var ancho = { 'ESTADO': 90, 'LIMITE': 80, 'FECHA': 85, 'CLIENTE': 170, 'TIPO': 100, 'ASUNTO': 300, 'PEDIDO': 130, 'PLANTILLA': 85, 'SUGERIDA': 85, 'NOTA': 200, 'VISTO': 120 };
  BZM_ENC.forEach(function (e) { var c = escrCol_(m, e); if (c && h.getColumnWidth(c) < 60 && ancho[e] > 60) h.setColumnWidth(c, ancho[e]); });
}
