/**
 * ============================================================
 *  Casos Walmart — registro y seguimiento de casos con Walmart (traido de Venta Diaria Odoo)
 * ============================================================
 *
 *  Hoja "Casos Walmart": cada caso es una fila y NUNCA se borra; cuando se resuelve cambias ESTADO a CERRADO
 *  (y llenas RESOLUCION y FECHA CIERRE). Estados: POR ABRIR · ABIERTO · EN ESPERA WALMART · CERRADO.
 *  La llenas tu; el script solo AGREGA filas (POR ABRIR, DETECTADO = AUTO):
 *    - de Comparar Walmart: precio $0, SYSTEM_PROBLEM, no esta en Walmart, precio distinto a la carga, si el mismo
 *      error dura 12 h o mas; se registran solo en las revisiones de las 6:00 y las 12:00.
 *    - de Cobro distinto: cada SKU una sola vez.
 *  Solo agrega si el SKU no tiene ya un caso vigente. Comparar Walmart muestra el caso vigente en CASO WALMART.
 *
 *  CORREOS DE WALMART (cawLeerCorreo_): cada hora, en la cuenta que recibe los correos de Walmart (la misma de
 *  Cancelaciones), lee los avisos de Seller Support (apertura, respuesta, pide informacion, resuelto, cierre) y los de
 *  Garantias / Embarques, y actualiza el caso por FOLIO (8 digitos), por la referencia de Walmart o por TIPO + PEDIDO:
 *  ESTADO, ULTIMO CORREO y ACCION (el siguiente paso). Un caso que no estaba se agrega (DETECTADO = CORREO).
 *  Para ligar un caso POR ABRIR con sus correos: al abrirlo en Seller Center escribe su FOLIO en la fila.
 *  No guarda el texto de los correos (traen datos de clientes): solo asunto corto, pedido y fechas.
 * ============================================================
 */

var CAW_HOJA = 'Casos Walmart', CAW_ETAPA = 'CASOS';
var CAW_ENC = ['FOLIO WALMART', 'FECHA ABIERTO', 'SKU', 'PRODUCTO', 'TIPO', 'MOTIVO', 'ESTADO', 'CORREO ENVIADO',
               'SEGUIMIENTO', 'RESOLUCION', 'FECHA CIERRE', 'DETECTADO', 'PEDIDO', 'ULTIMO CORREO', 'ACCION', 'REF WALMART'];
var CAW_HORAS_ERROR = 12, CAW_HORAS_REVISION = [6, 12];
var CAW_ESTADOS = ['POR ABRIR', 'ABIERTO', 'PIDE INFO', 'RESPUESTA WALMART', 'EN ESPERA WALMART', 'RESUELTO', 'CERRADO'];
var CAW_COLOR = { 'POR ABRIR': '#fff2cc', 'ABIERTO': '#fce5cd', 'PIDE INFO': '#f4cccc', 'RESPUESTA WALMART': '#d9ead3', 'EN ESPERA WALMART': '#cfe2f3', 'RESUELTO': '#b6d7a8', 'CERRADO': '#d9d9d9' };
var CAW_ACCION = { 'POR ABRIR': 'Abrir caso en Seller Center', 'ABIERTO': 'Esperar respuesta', 'PIDE INFO': 'Responder a Walmart',
                   'RESPUESTA WALMART': 'Leer respuesta y decidir', 'EN ESPERA WALMART': 'Esperar respuesta', 'RESUELTO': 'Confirmar y cerrar', 'CERRADO': '' };
var CAW_DIAS_SEGUIMIENTO = 3;   // sin correo nuevo en un caso abierto: pedir seguimiento
var CAW_Q = '(from:soportemp@walmart.com OR from:sellersupport@walmart.com OR "soportemp@walmart.com" OR "sellersupport@walmart.com"' +
            ' OR ((from:walmart.com OR from:wal-mart.com) (subject:garantía OR subject:"detención de embarque")))' +
            ' -from:claroshop.com -from:chedraui.com.mx';
var CAW_SEMILLA = ['LOG-910007565-NEG-7548-MSI', 'LOG-920012593-BLA-4060-MSI'];   // Walmart los deja en $0 (bug conocido)

function cawHoy_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

/** Fila de caso nueva (objeto por encabezado). */
function cawFila_(sku, producto, tipo, motivo, detectado) {
  return { 'FECHA ABIERTO': cawHoy_(), 'SKU': sku, 'PRODUCTO': producto || '', 'TIPO': tipo, 'MOTIVO': motivo, 'ESTADO': 'POR ABRIR', 'CORREO ENVIADO': 'NO', 'DETECTADO': detectado };
}

/** Crea la hoja si falta (con la semilla y sus listas). No toca una hoja que ya tenga datos. */
function cawAsegurarHoja_() {
  var ss = vdLibro_(), h = ss.getSheetByName(CAW_HOJA);
  if (h && h.getLastRow() > 1) return h;
  h = peHojaAsegurar_(CAW_HOJA, CAW_ENC);
  if (h.getLastRow() < 2 && vdProp_('CAW_SEMBRADA') !== '1') {
    peAgregar_(h, CAW_ENC, CAW_SEMILLA.map(function (s) { return cawFila_(s, '', 'PRECIO EN $0 EN WALMART', 'Precio $0 en Walmart (bug)', 'MANUAL'); }));
    vdSetProp_('CAW_SEMBRADA', '1');
    try { cawFormato_(h); } catch (e) { logWarn_(CAW_ETAPA, 'No se pudo poner listas y colores: ' + String(e.message).split('\n')[0]); }
  }
  return h;
}

/** { SKU: {folio, estado} } de los casos vigentes (ESTADO distinto de CERRADO). */
function cawVigentes_() {
  var out = {}, t = peTabla_(CAW_HOJA);
  if (!t) return out;
  var iS = peCol_(t, ['SKU']), iF = peCol_(t, ['FOLIO WALMART']), iE = peCol_(t, ['ESTADO']);
  if (iS < 0) return out;
  t.filas.forEach(function (f) {
    var s = peSku_(f[iS]); if (!s) return;
    var est = iE < 0 ? '' : String(f[iE] || '').trim();
    if (normEnc_(est) === 'CERRADO') return;
    out[s] = { folio: iF < 0 ? '' : String(f[iF] || '').trim(), estado: est || 'POR ABRIR' };
  });
  return out;
}

var CAW_TIPO_SIN_GUIA = 'SIN GUIA';

/** { PEDIDO: {estado, folio} } de los casos de un pedido (tipos SIN GUIA y SELLER SUPPORT). Gana el vigente mas reciente; si todos estan cerrados, el ultimo. */
function cawEstadoPorPedido_() {
  var out = {}, t = peTabla_(CAW_HOJA);
  if (!t) return out;
  var iP = peCol_(t, ['PEDIDO']), iE = peCol_(t, ['ESTADO']), iF = peCol_(t, ['FOLIO WALMART']), iT = peCol_(t, ['TIPO']);
  if (iP < 0) return out;
  t.filas.forEach(function (f) {
    var ped = String(f[iP] === null || f[iP] === undefined ? '' : f[iP]).replace(/\D/g, ''); if (!ped) return;
    var tipo = iT < 0 ? '' : normEnc_(f[iT]);
    if (tipo !== normEnc_(CAW_TIPO_SIN_GUIA) && tipo !== 'SELLER SUPPORT') return;
    var est = (iE < 0 ? '' : String(f[iE] || '').trim().toUpperCase()) || 'POR ABRIR', cerrado = /^(RESUELTO|CERRADO)$/.test(est);
    var ya = out[ped];
    if (ya && !ya.cerrado && cerrado) return;   // un caso vigente no lo tapa uno cerrado mas nuevo
    out[ped] = { estado: est, folio: iF < 0 ? '' : String(f[iF] || '').replace(/^'/, '').trim(), cerrado: cerrado };
  });
  return out;
}

/** Abre (en la hoja) un caso POR ABRIR "no se genero la guia" por cada pedido que no tenga caso. lista = [{pedido, sku}]. Devuelve cuantos creo. */
function cawAbrirSinGuia_(lista) {
  if (!lista || !lista.length) return 0;
  var ya = cawEstadoPorPedido_(), vistos = {}, filas = [];
  lista.forEach(function (x) {
    var ped = String(x.pedido || '').replace(/\D/g, '');
    if (!ped || vistos[ped] || ya[ped]) return;
    vistos[ped] = true;
    var f = cawFila_(x.sku || '', '', CAW_TIPO_SIN_GUIA, 'No se generó la guía del pedido', 'AUTO ' + cawHoy_());
    f['PEDIDO'] = "'" + ped; f['ACCION'] = CAW_ACCION['POR ABRIR'];
    filas.push(f);
  });
  if (!filas.length) return 0;
  var h = cawAsegurarHoja_();
  peAgregar_(h, CAW_ENC, filas);
  try { cawFormato_(h); } catch (e) {}
  logWarn_(CAW_ETAPA, filas.length + ' caso(s) nuevo(s) por abrir (pedido sin guia)', { pedidos: filas.map(function (f) { return String(f['PEDIDO']).replace(/\D/g, ''); }) });
  return filas.length;
}

/** Texto para CASO WALMART de Comparar ('' si no hay caso vigente). */
function cawTexto_(casos, sku) {
  var c = casos && casos[sku];
  if (!c) return '';
  return (c.folio ? 'Caso ' + c.folio : 'Caso sin folio') + ' · ' + c.estado;
}

/** ¿Toca registrar? Una vez por cada revision del dia (la primera corrida desde las 6:00 y desde las 12:00). */
function cawTocaRevision_(prop) {
  var hora = Number(Utilities.formatDate(new Date(), TZ, 'H')), ranura = null;
  CAW_HORAS_REVISION.forEach(function (h) { if (hora >= h) ranura = h; });
  if (ranura === null) return false;
  var llave = cawHoy_() + '|' + ranura;
  if (vdProp_(prop) === llave) return false;
  vdSetProp_(prop, llave);
  return true;
}

/** Errores de hoy [{sku, producto, tipo, detalle}]: agrega los que llevan 12 h o mas y no tienen caso. Devuelve cuantos. */
function cawDetectar_(errores, casos) {
  var visto = {};
  try { visto = JSON.parse(vdProp_('CAW_ERRORES_VISTOS') || '{}'); } catch (e) { visto = {}; }
  var ahora = Date.now(), nuevo = {}, porSku = {}, toca = cawTocaRevision_('CAW_ULTIMA_REVISION');
  errores.forEach(function (x) {
    var k = x.sku + '|' + x.tipo, desde = visto[k] || ahora;
    nuevo[k] = desde;
    if (!toca || ahora - desde < CAW_HORAS_ERROR * 3600000 || casos[x.sku]) return;
    var e = porSku[x.sku] || (porSku[x.sku] = { producto: x.producto, tipos: [], detalles: [] });
    e.tipos.push(x.tipo); if (x.detalle) e.detalles.push(x.detalle);
  });
  var txt = JSON.stringify(nuevo);
  if (txt.length > 8500) txt = '{}';    // tope de una Script Property; se vuelve a contar desde cero
  vdSetProp_('CAW_ERRORES_VISTOS', txt);
  var skus = Object.keys(porSku);
  if (!skus.length) return 0;
  var h = cawAsegurarHoja_();
  peAgregar_(h, CAW_ENC, skus.map(function (s) {
    var e = porSku[s];
    return cawFila_(s, e.producto, e.tipos.join(' + '), (e.detalles.length ? e.detalles.join('; ') : 'Error') + ' (' + CAW_HORAS_ERROR + ' h+)', 'AUTO ' + cawHoy_());
  }));
  logWarn_(CAW_ETAPA, skus.length + ' caso(s) nuevo(s) por abrir con Walmart', { skus: skus });
  return skus.length;
}

/** Cobro distinto: cada SKU se registra UNA vez como caso por abrir. */
function cawDetectarCobro_() {
  var primera = vdProp_('CAW_COBRO_INICIAL') !== '1';
  if (!primera && !cawTocaRevision_('CAW_ULTIMA_REVISION_COBRO')) return 0;
  vdSetProp_('CAW_COBRO_INICIAL', '1');
  var cd = vdCobroDistinto_(), t = peTabla_(CAW_HOJA), ya = {};
  if (t) {
    var iS = peCol_(t, ['SKU']), iT = peCol_(t, ['TIPO']);
    if (iS >= 0 && iT >= 0) t.filas.forEach(function (f) { if (normEnc_(f[iT]).indexOf('COBRO DISTINTO') >= 0) ya[peSku_(f[iS])] = true; });
  }
  var filas = [];
  Object.keys(cd).forEach(function (s) {
    if (ya[s]) return;
    var c = cd[s], det = [];
    if (c.pedidos !== '' && c.pedidos !== undefined) det.push(c.pedidos + ' ped.');
    if (c.pesos !== '' && c.pesos !== undefined) det.push('$' + c.pesos + ' de más');
    if (c.causa) det.push(String(c.causa));
    filas.push(cawFila_(s, '', 'COBRO DISTINTO', 'Cobro distinto' + (det.length ? ': ' + det.join(' · ') : ''), 'AUTO ' + cawHoy_()));
  });
  if (!filas.length) return 0;
  peAgregar_(cawAsegurarHoja_(), CAW_ENC, filas);
  logWarn_(CAW_ETAPA, filas.length + ' caso(s) nuevo(s) por abrir (cobro distinto)', { skus: filas.map(function (f) { return f.SKU; }) });
  return filas.length;
}

/** Listas (ESTADO, CORREO ENVIADO) y color de ESTADO, por encabezado, solo en esas columnas. Idempotente. */
function cawFormato_(sh) {
  var h = sh || vdLibro_().getSheetByName(CAW_HOJA);
  if (!h) return;
  var m = ubicarColumnas_(h, CAW_ENC, 1), filas = Math.max(h.getMaxRows() - 1, 1);   // solo las filas que tiene la hoja (Ordenar deja margen para escribir)
  var cE = escrCol_(m, 'ESTADO'), cC = escrCol_(m, 'CORREO ENVIADO');
  if (cE) {
    var rango = h.getRange(2, cE, filas, 1);
    rango.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CAW_ESTADOS, true).setAllowInvalid(true).build());
    var propias = function (r) {
      var rs = r.getRanges(), cond = r.getBooleanCondition();
      var vals = cond ? cond.getCriteriaValues() : [];
      return rs.length === 1 && rs[0].getColumn() === cE && vals.length === 1 && CAW_ESTADOS.indexOf(String(vals[0])) >= 0;
    };
    var reglas = h.getConditionalFormatRules().filter(function (r) { return !propias(r); });
    CAW_ESTADOS.forEach(function (e) { reglas.push(SpreadsheetApp.newConditionalFormatRule().setRanges([rango]).whenTextEqualTo(e).setBackground(CAW_COLOR[e]).build()); });
    h.setConditionalFormatRules(reglas);
  }
  if (cC) h.getRange(2, cC, filas, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['SI', 'NO'], true).setAllowInvalid(true).build());
}

/** Menu: revisa ya (cobro distinto + lo que diga Comparar) y pone listas y colores. */
function casosWalmartRevisar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(90000)) { dlgInfo_('Casos Walmart', 'Otra corrida tiene el candado. Espera un minuto y vuelve a darle.', 'aviso'); return; }
  try {
    var h = cawAsegurarHoja_();
    vdSetProp_('CAW_ULTIMA_REVISION_COBRO', '');
    var nCobro = cawDetectarCobro_(), co = null;
    try { co = cawLeerCorreo_(); } catch (ec) { logWarn_(CAW_ETAPA, 'Correos de casos: ' + String(ec.message).split('\n')[0]); }
    cawFormato_(h);
    var vig = cawVigentes_();
    var txt = 'Vigentes: ' + Object.keys(vig).length + '\nNuevos por cobro distinto: ' + nCobro +
      (co ? '\nCorreos (' + (co.cuenta || 'esta cuenta') + '): ' + co.casos + ' casos · ' + co.nuevos + ' nuevos · ' + co.cambios + ' actualizados' : '') +
      '\n\nComparar Walmart agrega los suyos a las 6:00 y 12:00.';
    logOk_(CAW_ETAPA, 'Casos revisados: ' + Object.keys(vig).length + ' vigentes, ' + nCobro + ' nuevos por cobro distinto');
    flushLog_();
    h.activate();
    dlgInfo_('Casos Walmart', txt, 'ok');
  } catch (e) {
    logErr_(CAW_ETAPA, 'No se pudo revisar Casos Walmart: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    dlgInfo_('Casos Walmart', 'Fallo: ' + String(e.message).split('\n')[0], 'error');
  } finally { lock.releaseLock(); }
}

/** Traer TODO de Venta Diaria: copia CASOS WALMART (sin duplicar por SKU + TIPO + FECHA ABIERTO). Devuelve texto. */
function cawTraerDeVentaDiaria_() {
  var o = peLeerViejo_(SpreadsheetApp.openById(VD_LIBRO_VIEJO), 'CASOS WALMART');
  if (!o) return 'no habia casos en Venta Diaria';
  var h = peHojaAsegurar_(CAW_HOJA, CAW_ENC), t = peTabla_(CAW_HOJA), ya = {};
  var llave = function (s, tp, f) { return peSku_(s) + '|' + normEnc_(tp) + '|' + String(f instanceof Date ? Utilities.formatDate(f, TZ, 'yyyy-MM-dd') : f).slice(0, 10); };
  var vigente = function (est) { return normEnc_(est) !== 'CERRADO'; };
  if (t) {
    var iS = peCol_(t, ['SKU']), iT = peCol_(t, ['TIPO']), iF = peCol_(t, ['FECHA ABIERTO']), iE = peCol_(t, ['ESTADO']);
    t.filas.forEach(function (f) {
      var tp = iT < 0 ? '' : f[iT];
      ya[llave(f[iS], tp, iF < 0 ? '' : f[iF])] = true;
      if (vigente(iE < 0 ? '' : f[iE])) ya[peSku_(f[iS]) + '|' + normEnc_(tp) + '|VIGENTE'] = true;   // la semilla de aqui y la de alla no se duplican
    });
  }
  var nuevas = [];
  o.filas.forEach(function (r) {
    var s = peGet_(o, r, ['SKU']); if (!peSku_(s)) return;
    var k = llave(s, peGet_(o, r, ['TIPO']), peGet_(o, r, ['FECHA ABIERTO']));
    var kv = peSku_(s) + '|' + normEnc_(peGet_(o, r, ['TIPO'])) + '|VIGENTE';
    if (ya[k] || (vigente(peGet_(o, r, ['ESTADO'])) && ya[kv])) return;
    ya[k] = true;
    var f = {}; CAW_ENC.forEach(function (e) { f[e] = peGet_(o, r, [e]); });
    nuevas.push(f);
  });
  if (nuevas.length) peAgregar_(h, CAW_ENC, nuevas);
  vdSetProp_('CAW_SEMBRADA', '1');
  try { cawFormato_(h); } catch (e) {}
  return nuevas.length + ' caso(s) nuevo(s) de ' + o.filas.length;
}

/* ======================= Correos de Walmart -> casos ======================= */

/** Folio comparable: sin ceros a la izquierda ('09436486' y 9436486 son el mismo). */
function cawFolio_(v) { var t = String(v === null || v === undefined ? '' : v).replace(/^'/, '').trim(); return /^\d+$/.test(t) ? String(Number(t)) : t; }

/**
 * Lo que dice UN correo (puro, sin Gmail). m = {asunto, cuerpo, de, fecha}.
 * Devuelve null si no es de un caso.
 */
function cawLeerMensaje_(m) {
  var asunto = String(m.asunto || ''), cuerpo = String(m.cuerpo || '').split(/An English version/i)[0], de = String(m.de || '').toLowerCase();
  var todo = asunto + '\n' + cuerpo, x;
  var caso = (x = asunto.match(/(?:Cierre de caso|Tu ticket)\s+(\d{8})/i)) ? x[1]
           : (x = cuerpo.match(/N[uú]mero de caso:?\s*(\d{8})/i)) ? x[1]
           : (x = cuerpo.match(/n[uú]mero de folio:?\s*-?\s*(\d{8})/i)) ? x[1]
           : (x = todo.match(/casenumber=(\d{6,})/i)) ? x[1] : '';
  var ref = (x = todo.match(/ref:!?\w+\.!?(\w+):ref/)) ? x[1] : '';
  var pedido = (x = todo.match(/\b(60000\d{10})(?:-\d+){0,2}\b/)) ? x[1] : '';   // pedido de Walmart: 15 digitos (6000000..., 6000001..., etc.)
  var garantia = /garant[ií]a/i.test(asunto), embarque = /detenci[oó]n de embarque/i.test(asunto);
  if (!caso && !ref && !((garantia || embarque) && pedido)) return null;
  var nuestro = de && !/walmart\.com|wal-mart\.com/.test(de) && !/soportemp@|sellersupport@/i.test(cuerpo.slice(0, 600));
  var estado;
  if (/Tu ticket \d+ ha sido resuelto|Resolvimos tu ticket/i.test(todo)) estado = 'RESUELTO';
  else if (/Cierre de caso|se ha solucionado tu caso/i.test(todo)) estado = 'CERRADO';
  else if (nuestro) estado = 'EN ESPERA WALMART';
  else if (/Apertura de caso/i.test(asunto) && !/^\s*(fwd?:\s*)*re:/i.test(asunto)) estado = 'ABIERTO';
  else if (/podr[ií]as? (compartir|enviar|proporcionar|indicar)|favor de (enviar|compartir|proporcionar)|nos (comparta|proporcione|env[ií]e)|necesitamos (que|los|la|el)/i.test(cuerpo)) estado = 'PIDE INFO';
  else estado = 'RESPUESTA WALMART';
  var motivo = asunto.replace(/\[\s*ref:[^\]]*\]/ig, '').replace(/^\s*((fwd?|re|rv|fw):\s*)+/ig, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return {
    caso: caso, ref: ref, pedido: pedido, estado: estado, fecha: m.fecha, motivo: motivo,
    tipo: garantia ? 'GARANTIA' : embarque ? 'DETENCION DE EMBARQUE' : 'SELLER SUPPORT',
    sinRespuesta: /falta de respuesta|no (hemos )?recibido (su |tu )?respuesta|sin respuesta/i.test(cuerpo)
  };
}

/** Agrupa los correos en casos (puro). Clave: folio; si no hay, la referencia de Walmart; si no, TIPO + PEDIDO. */
function cawCasosDeCorreos_(lecturas) {
  var refCaso = {}, casos = {};
  lecturas.forEach(function (l) { if (l.caso && l.ref) refCaso[l.ref] = l.caso; });
  lecturas.slice().sort(function (a, b) { return a.fecha - b.fecha; }).forEach(function (l) {
    var caso = l.caso || refCaso[l.ref] || '';
    var k = caso ? 'F' + cawFolio_(caso) : l.ref ? 'R' + l.ref : 'P' + l.tipo + '|' + l.pedido;
    var c = casos[k] || (casos[k] = { caso: caso, ref: l.ref, pedido: '', tipo: l.tipo, motivo: '', abierto: l.fecha, ultimo: l.fecha, estado: l.estado, sinRespuesta: false, correos: 0 });
    c.correos++;
    c.pedido = c.pedido || l.pedido; c.ref = c.ref || l.ref; c.caso = c.caso || caso;
    if (!c.motivo || /apertura de caso/i.test(c.motivo)) c.motivo = l.motivo || c.motivo;
    // el ultimo correo manda; un aviso de "resuelto" no baja un cierre del mismo dia
    if (!(c.estado === 'CERRADO' && l.estado === 'RESUELTO')) c.estado = l.estado;
    c.ultimo = l.fecha; c.sinRespuesta = l.sinRespuesta || (c.sinRespuesta && /RESUELTO|CERRADO/.test(l.estado));
  });
  return casos;
}

/** Siguiente paso de un caso. */
function cawAccion_(estado, ultimo, sinRespuesta, ahoraMs) {
  if (/RESUELTO|CERRADO/.test(estado) && sinRespuesta) return 'Reabrir si sigue el problema';
  var dias = ultimo instanceof Date ? Math.floor((ahoraMs - ultimo.getTime()) / 86400000) : 0;
  if (/ABIERTO|EN ESPERA WALMART/.test(estado) && dias > CAW_DIAS_SEGUIMIENTO) return 'Dar seguimiento (' + dias + ' d sin respuesta)';
  return CAW_ACCION[estado] || '';
}

/** Lee los correos de la cuenta que corre esto y actualiza la hoja. Devuelve {cuenta, correos, casos, nuevos, cambios}. */
function cawLeerCorreo_() {
  var cuenta = '';
  try { cuenta = Session.getEffectiveUser().getEmail(); } catch (e) {}
  var dias = vdProp_('CAW_CORREO_INI') === '1' ? 45 : 400;   // la primera vez trae el ultimo año completo
  var hilos = GmailApp.search(CAW_Q + ' newer_than:' + dias + 'd', 0, 150), lect = [];
  hilos.forEach(function (th) {
    th.getMessages().forEach(function (m) {
      var l = cawLeerMensaje_({ asunto: m.getSubject(), cuerpo: m.getPlainBody().slice(0, 6000), de: m.getFrom(), fecha: m.getDate() });
      if (l) lect.push(l);
    });
  });
  vdSetProp_('CAW_CORREO_INI', '1');
  var casos = cawCasosDeCorreos_(lect), r = { cuenta: cuenta, correos: lect.length, casos: Object.keys(casos).length, nuevos: 0, cambios: 0 };
  if (!r.casos) {
    avisoDia_('caw-sin-correo', 'INFO', CAW_ETAPA, 'Casos: sin correos de Walmart en ' + (cuenta || 'esta cuenta'));
    vdLatido_(CAW_ETAPA, 'Casos: revisado, sin correos de Walmart (' + (cuenta || 'cuenta no legible') + ')');
    return r;
  }
  var h = cawAsegurarHoja_(), m = ubicarColumnas_(h, CAW_ENC, 1), ahora = Date.now();
  var col = function (e) { return escrCol_(m, e); };
  var n = Math.max(h.getLastRow() - 1, 0), vals = n ? h.getRange(2, 1, n, h.getLastColumn()).getValues() : [];
  var v = function (f, e) { var c = col(e); return c ? f[c - 1] : ''; };
  var porFolio = {}, porRef = {}, porPedido = {}, sinFolio = {};
  vals.forEach(function (f, i) {
    var fo = cawFolio_(v(f, 'FOLIO WALMART')); if (fo) porFolio[fo] = i;
    var rf = String(v(f, 'REF WALMART') || '').trim(); if (rf) porRef[rf] = i;
    var pd = String(v(f, 'PEDIDO') || '').trim(); if (pd) porPedido[normEnc_(v(f, 'TIPO')) + '|' + pd] = i;
    var pdn = String(v(f, 'PEDIDO') || '').replace(/\D/g, ''); if (pdn && !fo && normEnc_(v(f, 'ESTADO')) !== 'CERRADO') sinFolio[pdn] = i;   // caso abierto por el Sheet (SIN GUIA): aun no tiene folio de Walmart
  });
  var nuevas = [];
  Object.keys(casos).forEach(function (k) {
    var c = casos[k], i = c.caso && porFolio[cawFolio_(c.caso)] !== undefined ? porFolio[cawFolio_(c.caso)]
          : c.ref && porRef[c.ref] !== undefined ? porRef[c.ref]
          : c.pedido && porPedido[normEnc_(c.tipo) + '|' + c.pedido] !== undefined ? porPedido[normEnc_(c.tipo) + '|' + c.pedido]
          : c.pedido && sinFolio[c.pedido] !== undefined ? sinFolio[c.pedido] : -1;
    var accion = cawAccion_(c.estado, c.ultimo, c.sinRespuesta, ahora);
    if (i < 0) {
      nuevas.push({ 'FOLIO WALMART': c.caso ? "'" + c.caso : '', 'FECHA ABIERTO': c.abierto, 'TIPO': c.tipo, 'MOTIVO': c.motivo, 'ESTADO': c.estado,
        'CORREO ENVIADO': 'SI', 'FECHA CIERRE': /RESUELTO|CERRADO/.test(c.estado) ? c.ultimo : '', 'DETECTADO': 'CORREO', 'PEDIDO': c.pedido ? "'" + c.pedido : '',
        'ULTIMO CORREO': c.ultimo, 'ACCION': accion, 'REF WALMART': c.ref });
      return;
    }
    var f = vals[i], fila = i + 2, ult = v(f, 'ULTIMO CORREO'), cambio = false;
    var nuevoCorreo = !(ult instanceof Date) || c.ultimo.getTime() > ult.getTime() + 1000;
    var poner = function (e, x) { var cc = col(e); if (!cc) return; if (String(f[cc - 1]) === String(x)) return; h.getRange(fila, cc).setValue(x); cambio = true; };
    // tu ESTADO manda mientras no llegue un correo nuevo (p. ej. lo cerraste tu)
    if (nuevoCorreo) { poner('ESTADO', c.estado); poner('ULTIMO CORREO', c.ultimo); }
    if (nuevoCorreo && /^AUTO/.test(String(v(f, 'DETECTADO') || '')) && !(ult instanceof Date)) { poner('FECHA ABIERTO', c.abierto); poner('CORREO ENVIADO', 'SI'); }   // el Sheet lo dejo POR ABRIR; el primer correo de Walmart confirma que ya se abrio
    var est = nuevoCorreo ? c.estado : String(v(f, 'ESTADO') || '').trim().toUpperCase();
    poner('ACCION', normEnc_(est) === normEnc_(c.estado) ? accion : (CAW_ACCION[est] !== undefined ? CAW_ACCION[est] : ''));
    if (!String(v(f, 'PEDIDO') || '').trim() && c.pedido) poner('PEDIDO', "'" + c.pedido);
    if (!String(v(f, 'REF WALMART') || '').trim() && c.ref) poner('REF WALMART', c.ref);
    if (!cawFolio_(v(f, 'FOLIO WALMART')) && c.caso) poner('FOLIO WALMART', "'" + c.caso);
    if (nuevoCorreo && /RESUELTO|CERRADO/.test(c.estado) && !v(f, 'FECHA CIERRE')) poner('FECHA CIERRE', c.ultimo);
    if (cambio) r.cambios++;
  });
  if (nuevas.length) { peAgregar_(h, CAW_ENC, nuevas); r.nuevos = nuevas.length; }
  if (r.nuevos || r.cambios) {
    logOk_(CAW_ETAPA, 'Casos por correo: ' + r.nuevos + ' nuevos, ' + r.cambios + ' actualizados (' + r.casos + ' casos, ' + (cuenta || 'cuenta no legible') + ')');
    try { cawFormato_(h); } catch (e) {}
  } else {
    vdLatido_(CAW_ETAPA, 'Casos por correo: revisado, sin cambios (' + r.casos + ' casos, ' + (cuenta || 'cuenta no legible') + ')');
  }
  return r;
}


/* ======================= "Sus casos" de Seller Center -> corroborar la hoja ======================= */
/*
 *  La extension lee (con tu sesion, solo lectura) la lista "Sus casos" de Seller Center (ultimos 30 dias) y manda
 *  por caso: folio, fecha, asunto y estado (NO el propietario). Aqui se compara con la hoja, que guarda el historico
 *  (Walmart borra los viejos). Reglas, sin pisar lo que tu escribes:
 *    - folio que no esta en la hoja: se AGREGA (DETECTADO = SELLER CENTER).
 *    - Walmart lo da por Resuelto/Cerrado y la hoja no: pasa a RESUELTO/CERRADO (con FECHA CIERRE y ACCION).
 *    - Walmart lo muestra abierto y la hoja lo tenia POR ABRIR: pasa a ABIERTO.
 *    - Walmart lo muestra abierto y tu lo tienes cerrado: NO se toca; avisa una vez al dia en el Log.
 *    - cualquier otro estado tuyo (PIDE INFO, RESPUESTA WALMART...) se respeta.
 */

/** Estado de Seller Center -> estado de la hoja ('' si no se reconoce: no se cambia nada). */
function cawScEstado_(txt) {
  var t = String(txt || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (/^(abrir|abierto|abierta|nuevo|nueva|open|new)\b/.test(t)) return 'ABIERTO';
  if (/progreso|en proceso|in progress|working/.test(t)) return 'EN ESPERA WALMART';
  if (/^(resuelto|resuelta|resolved)\b/.test(t)) return 'RESUELTO';
  if (/^(cerrado|cerrada|closed)\b/.test(t)) return 'CERRADO';
  return '';
}

/** Filas que manda la extension -> limpias y acotadas ({folio, fecha 'AAAA-MM-DD', asunto, estado}). */
function cawScLimpiar_(filas) {
  var out = [], vistos = {};
  (Array.isArray(filas) ? filas : []).slice(0, 300).forEach(function (f) {
    if (!f) return;
    var folio = String(f.folio || '').replace(/\D/g, '');
    if (!/^\d{6,10}$/.test(folio) || vistos[folio]) return;
    vistos[folio] = true;
    var fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(f.fecha || '')) ? String(f.fecha) : '';
    out.push({ folio: folio, fecha: fecha, asunto: String(f.asunto || '').replace(/\s+/g, ' ').trim().slice(0, 80), estado: String(f.estado || '').replace(/\s+/g, ' ').trim().slice(0, 40) });
  });
  return out;
}

function cawScFecha_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
}

/** Compara la lista de Seller Center con la hoja. Devuelve {recibidas, nuevos, cambios, discrepancias, desconocidos:[...]} . */
function cawScCorroborar_(filas, ahoraMs) {
  var r = { recibidas: filas.length, nuevos: 0, cambios: 0, discrepancias: [], desconocidos: [] };
  if (!filas.length) return r;
  var h = cawAsegurarHoja_(), m = ubicarColumnas_(h, CAW_ENC, 1);
  var col = function (e) { return escrCol_(m, e); };
  var n = Math.max(h.getLastRow() - 1, 0), vals = n ? h.getRange(2, 1, n, h.getLastColumn()).getValues() : [];
  var v = function (f, e) { var c = col(e); return c ? f[c - 1] : ''; };
  var porFolio = {};
  vals.forEach(function (f, i) { var fo = cawFolio_(v(f, 'FOLIO WALMART')); if (fo) porFolio[fo] = i; });
  var nuevas = [], hoy = new Date(ahoraMs);
  filas.forEach(function (c) {
    var est = cawScEstado_(c.estado);
    if (!est && c.estado && r.desconocidos.indexOf(c.estado) < 0) r.desconocidos.push(c.estado);
    var i = porFolio[cawFolio_(c.folio)];
    if (i === undefined) {
      var cerrado = /RESUELTO|CERRADO/.test(est);
      nuevas.push({ 'FOLIO WALMART': "'" + c.folio, 'FECHA ABIERTO': cawScFecha_(c.fecha), 'TIPO': 'SELLER SUPPORT', 'MOTIVO': c.asunto, 'ESTADO': est || 'ABIERTO',
        'CORREO ENVIADO': 'SI', 'FECHA CIERRE': cerrado ? hoy : '', 'DETECTADO': 'SELLER CENTER', 'ACCION': CAW_ACCION[est || 'ABIERTO'] || '' });
      return;
    }
    var f = vals[i], fila = i + 2, cambio = false, miEst = String(v(f, 'ESTADO') || '').trim().toUpperCase();
    var poner = function (e, x) { var cc = col(e); if (!cc) return; if (String(f[cc - 1]) === String(x)) return; h.getRange(fila, cc).setValue(x); cambio = true; };
    if (!v(f, 'FECHA ABIERTO') && c.fecha) poner('FECHA ABIERTO', cawScFecha_(c.fecha));
    if (/^(RESUELTO|CERRADO)$/.test(est) && !/^(RESUELTO|CERRADO)$/.test(miEst)) {
      poner('ESTADO', est); poner('ACCION', CAW_ACCION[est] || '');
      if (!v(f, 'FECHA CIERRE')) poner('FECHA CIERRE', hoy);
    } else if (/^(ABIERTO|EN ESPERA WALMART)$/.test(est) && (miEst === 'POR ABRIR' || miEst === '')) {
      poner('ESTADO', 'ABIERTO'); poner('ACCION', CAW_ACCION['ABIERTO'] || ''); poner('CORREO ENVIADO', 'SI');
    } else if (/^(ABIERTO|EN ESPERA WALMART)$/.test(est) && /^(RESUELTO|CERRADO)$/.test(miEst)) {
      r.discrepancias.push(c.folio);
    }
    if (cambio) r.cambios++;
  });
  if (nuevas.length) { peAgregar_(h, CAW_ENC, nuevas); r.nuevos = nuevas.length; }
  if (r.nuevos || r.cambios) { try { cawFormato_(h); } catch (e) {} }
  return r;
}

/** Una linea FINISH cada 2 h como maximo: confirma que la lectura de Seller Center sigue viva (aparte del latido de los correos). */
function cawLatidoSc_(msg) {
  var ult = Number(vdProp_('CAW_SC_LATIDO', '0'));
  if (Date.now() - ult < 2 * 3600000) return;
  vdSetProp_('CAW_SC_LATIDO', String(Date.now()));
  logRow_('FINISH', CAW_ETAPA, msg);
}

/** POST 'seller_casos' {clave, filas:[{folio, fecha, asunto, estado}]} -> {ok, recibidas, nuevos, cambios}. */
function cawScRecibir_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var filas = cawScLimpiar_(p.filas);
  if (!filas.length) return { ok: true, recibidas: 0, nuevos: 0, cambios: 0 };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'ocupado' };
  try {
    var r = cawScCorroborar_(filas, Date.now());
    var txt = 'Casos en Seller Center: ' + r.recibidas + ' leidos, ' + r.nuevos + ' nuevos en la hoja, ' + r.cambios + ' actualizados';
    if (r.nuevos || r.cambios) logOk_(CAW_ETAPA, txt); else cawLatidoSc_(txt + ' (sin cambios)');
    r.discrepancias.forEach(function (fo) {
      avisoDia_('caw-sc-disc-' + fo, 'WARN', CAW_ETAPA, 'Caso ' + fo + ': Seller Center lo muestra abierto y la hoja lo tiene cerrado: revisalo');
    });
    if (r.desconocidos.length) avisoDia_('caw-sc-estado-raro', 'WARN', CAW_ETAPA, 'Casos: estado de Seller Center que no conozco: ' + r.desconocidos.join(' / ').slice(0, 120));
    flushLog_();
    return { ok: true, recibidas: r.recibidas, nuevos: r.nuevos, cambios: r.cambios };
  } catch (e) {
    logErr_(CAW_ETAPA, 'No se pudo corroborar los casos de Seller Center: ' + String(e.message).split('\n')[0]); flushLog_();
    return { ok: false, error: 'no_se_pudo_guardar' };
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}
