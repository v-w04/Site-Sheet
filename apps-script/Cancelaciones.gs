/**
 * ============================================================
 *  Cancelaciones — solicitudes de cancelacion del cliente (correo de Walmart)
 * ============================================================
 *
 *  Lee el correo automatico de no-reply de Walmart Marketplace con asunto
 *  "Cancelacion por Solicitud del Cliente Walmart Marketplace" y copia a la hoja
 *  "Cancelaciones" TODAS las filas de la tabla que trae, una fila por pedido.
 *
 *  - Cuenta: la dueña del Sheet (la que corre el script). Solo se LEEN correos
 *    (permiso gmail.readonly); solo se guardan los datos de esa tabla.
 *  - Columnas fijas de la A a la D: FECHA LECTURA (el dia en que se leyo), FECHA CORREO,
 *    ID CORREO (sirve para no repetir), LINK. Despues, UNA COLUMNA POR CADA ENCABEZADO de la
 *    tabla de Walmart, tal como viene. Si Walmart agrega o renombra una columna, se agrega al
 *    final y se sigue extrayendo; nada se pierde ni se borra.
 *  - SKU COMPLETO: si el SKU del correo viene cortado con "...", se completa con la hoja Walmart.
 *  - Gmail agrupa los correos en conversaciones: se revisa CADA mensaje de la conversacion.
 *  - Se busca por asunto Y por la etiqueta; si en la etiqueta hay otros asuntos, se anota en el Log.
 *  - La hoja solo CRECE: nunca borra ni reescribe filas. Lo que agregues a la derecha se respeta.
 *
 *  Corre cada hora (killersProgramado) y a mano: menu Walmart > Leer cancelaciones del correo.
 *  Primera vez: lee desde el 15-oct-2026 (CAN_DESDE).
 */

var CAN_HOJA     = 'Cancelaciones';
var CAN_ETAPA    = 'CANCEL';
var CAN_DESDE    = '2026-10-15';                       // primer dia que se lee
var CAN_REMITENTE = 'no-reply@es.relay.walmart.com';
var CAN_ASUNTO   = 'cancelacion por solicitud del cliente';   // sin acentos, en minusculas
var CAN_ETIQUETA = '2. Walmart Cancelacion';
var CAN_DIAS_REVISION = 4;                             // cada hora se revisan los ultimos dias (lo ya leido se salta)
var CAN_FIJAS = ['FECHA LECTURA', 'FECHA CORREO', 'ID CORREO', 'LINK'];
var CAN_SKU_COMPLETO = 'SKU COMPLETO';
var CAN_OBS = 'OBSERVACION';

/* ---------------- texto y HTML ---------------- */

function canSinAcentos_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function canDecodificar_(t) {
  var mapa = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return String(t)
    .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); })
    .replace(/&([a-z]+);/gi, function (m, n) { return mapa[n.toLowerCase()] !== undefined ? mapa[n.toLowerCase()] : m; });
}

function canLimpiarCelda_(t) {
  return canDecodificar_(String(t).replace(/<[^>]*>/g, ' '))
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Saca TODAS las tablas de un HTML como arreglos de filas (cada fila, un arreglo de textos).
 * Maneja tablas anidadas (los correos usan tablas para el diseño): solo se devuelven las tablas
 * "hoja" (las que no contienen otra tabla dentro de una celda). Una tabla = { filas: [[texto,...]], th: bool }.
 */
function canTablas_(html) {
  html = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  var re = /<(\/?)(table|tr|td|th)\b[^>]*>/gi;
  var pila = [], hojas = [], ultimo = 0, m;

  function cerrarCelda(t) {
    if (!t || !t.celda) return;
    if (!t.fila) t.fila = [];
    t.fila.push(canLimpiarCelda_(t.celda.texto));
    if (t.celda.th) t.hayTh = true;
    t.celda = null;
  }
  function cerrarFila(t) {
    if (!t) return;
    cerrarCelda(t);
    if (t.fila && t.fila.length) t.filas.push({ celdas: t.fila, th: t.filaTh });
    t.fila = null; t.filaTh = false;
  }

  while ((m = re.exec(html)) !== null) {
    var texto = html.slice(ultimo, m.index);
    ultimo = re.lastIndex;
    var top = pila[pila.length - 1];
    if (top && top.celda) top.celda.texto += texto;

    var cierra = m[1] === '/', tag = m[2].toLowerCase();
    if (tag === 'table') {
      if (!cierra) {
        if (top && top.celda) top.anidada = true;
        pila.push({ filas: [], fila: null, filaTh: false, celda: null, anidada: false, hayTh: false });
      } else if (pila.length) {
        var t = pila.pop();
        cerrarFila(t);
        if (!t.anidada && t.filas.length) hojas.push({ filas: t.filas, hayTh: t.hayTh });
      }
    } else if (top) {
      if (tag === 'tr') {
        cerrarFila(top);
        if (!cierra) { top.fila = []; top.filaTh = false; }
      } else {   // td / th
        cerrarCelda(top);
        if (!cierra) {
          if (!top.fila) { top.fila = []; top.filaTh = false; }
          top.celda = { texto: '', th: tag === 'th' };
          if (tag === 'th') top.filaTh = true;
        }
      }
    }
  }
  return hojas;
}

/**
 * De las tablas de un correo: encabezados y filas de datos.
 * Tabla de datos = tiene al menos 2 filas y 2 columnas. Si trae <th>, el encabezado es la fila con <th>;
 * si no, la primera fila. Devuelve [{ enc: [...], filas: [[...]] }].
 */
function canTablasDeDatos_(html) {
  var salida = [];
  canTablas_(html).forEach(function (t) {
    if (t.filas.length < 2) return;
    var iEnc = 0;
    for (var i = 0; i < t.filas.length; i++) { if (t.filas[i].th) { iEnc = i; break; } }
    var enc = t.filas[iEnc].celdas;
    if (enc.length < 2) return;
    var datos = [];
    for (var j = iEnc + 1; j < t.filas.length; j++) {
      var c = t.filas[j].celdas;
      if (!c.some(function (x) { return x !== ''; })) continue;
      datos.push(c);
    }
    if (!datos.length) return;
    salida.push({ enc: enc, filas: datos });
  });
  return salida;
}

/* ---------------- SKU cortado ---------------- */

function canSkusConocidos_() {
  var lista = [];
  ['Walmart', 'Bloqueados'].forEach(function (nombre) {
    try {
      var h = SpreadsheetApp.getActive().getSheetByName(nombre);
      if (!h || h.getLastRow() < 2) return;
      var c = canMapaHoja_(h).mapa[normEnc_('SKU')];
      if (!c) return;
      var vals = h.getRange(2, c, h.getLastRow() - 1, 1).getValues();
      vals.forEach(function (v) { var s = String(v[0] || '').trim(); if (s) lista.push(s); });
    } catch (e) {}
  });
  return lista;
}

/** Si el SKU viene cortado con "..." lo completa con un SKU conocido que empiece igual (solo si es unico). */
function canCompletarSku_(valor, conocidos) {
  var v = String(valor || '').trim();
  if (!v) return '';
  var cortado = /(\.\.\.|…)$/.test(v);
  if (!cortado) return v;
  var pre = v.replace(/(\.\.\.|…)+$/, '').toUpperCase();
  if (!pre) return v;
  var hallados = {};
  conocidos.forEach(function (s) { if (s.toUpperCase().indexOf(pre) === 0) hallados[s] = true; });
  var ks = Object.keys(hallados).sort(function (x, y) { return x.length - y.length; });
  if (ks.length === 1) return ks[0];
  // varios: si todos son el SKU base + sufijos (-MSI, -OB...), el completo es el base
  if (ks.length > 1 && ks.every(function (k) { return k === ks[0] || k.indexOf(ks[0] + '-') === 0; })) return ks[0];
  return v;
}

/** Todos los SKU conocidos que empiezan igual que el SKU cortado (para revisar si hay mas de uno). */
function canCandidatosSku_(valor, conocidos) {
  var v = String(valor || '').trim();
  if (!/(\.\.\.|…)$/.test(v)) return '';
  var pre = v.replace(/(\.\.\.|…)+$/, '').toUpperCase();
  if (!pre) return '';
  var h = {};
  conocidos.forEach(function (x) { if (x.toUpperCase().indexOf(pre) === 0) h[x] = true; });
  var ks = Object.keys(h);
  return ks.length > 1 ? ks.sort().slice(0, 6).join(' | ') : '';
}

/* ---------------- hoja ---------------- */

/** Encabezados actuales de la hoja { NORMALIZADO: columna 1-based } y el ultimo con texto. */
function canMapaHoja_(h) {
  var nc = Math.max(h.getLastColumn(), 1);
  var fila = h.getRange(1, 1, 1, nc).getValues()[0];
  var mapa = {}, fin = 0;
  for (var i = 0; i < fila.length; i++) {
    var k = normEnc_(fila[i]);
    if (k) { if (mapa[k] === undefined) mapa[k] = i + 1; fin = i + 1; }
  }
  return { mapa: mapa, fin: fin };
}

/** Garantiza columnas para estos encabezados (los que falten se agregan AL FINAL). Devuelve {NORMALIZADO: columna}. */
function canAsegurarColumnas_(h, encabezados) {
  var info = canMapaHoja_(h), mapa = info.mapa, fin = info.fin, nuevas = [];
  encabezados.forEach(function (e) {
    var k = normEnc_(e);
    if (k && mapa[k] === undefined) { fin++; mapa[k] = fin; nuevas.push([fin, e]); }
  });
  if (h.getMaxColumns() < fin) h.insertColumnsAfter(h.getMaxColumns(), fin - h.getMaxColumns());
  nuevas.forEach(function (x) { h.getRange(1, x[0]).setValue(x[1]).setFontWeight('bold'); });
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);
  return mapa;
}

function canIdsLeidos_(h, colId) {
  var ids = {};
  if (h.getLastRow() < 2 || !colId) return ids;
  h.getRange(2, colId, h.getLastRow() - 1, 1).getValues().forEach(function (v) {
    var s = String(v[0] || '').trim(); if (s) ids[s] = true;
  });
  return ids;
}

/* ---------------- Gmail ---------------- */

function canFechaTexto_(d) { return Utilities.formatDate(d, TZ, 'yyyy/MM/dd'); }

/** Todos los mensajes que cumplen (busqueda por asunto + por etiqueta), sin repetir, en orden de fecha. */
function canMensajes_(desde) {
  var q1 = 'from:' + CAN_REMITENTE + ' subject:"Solicitud del Cliente" after:' + canFechaTexto_(new Date(desde.getTime() - 86400000));
  var q2 = 'label:' + CAN_ETIQUETA.toLowerCase().replace(/\s+/g, '-') + ' after:' + canFechaTexto_(new Date(desde.getTime() - 86400000));
  var vistos = {}, msgs = [], otros = {}, nHilos = 0;

  [q1, q2].forEach(function (q) {
    var inicio = 0, lote = 100;
    while (inicio < 3000) {
      var hilos = GmailApp.search(q, inicio, lote);
      if (!hilos.length) break;
      nHilos += hilos.length;
      hilos.forEach(function (hilo) {
        hilo.getMessages().forEach(function (m) {
          var id = m.getId();
          if (vistos[id]) return;
          vistos[id] = true;
          var f = m.getDate();
          if (f < desde) return;
          var asunto = m.getSubject() || '';
          var deWalmart = canSinAcentos_(m.getFrom()).indexOf('walmart') !== -1;
          if (canSinAcentos_(asunto).indexOf(CAN_ASUNTO) !== -1 && deWalmart) {
            msgs.push({ msg: m, id: id, fecha: f, hilo: hilo.getId() });
          } else {
            otros[asunto] = (otros[asunto] || 0) + 1;
          }
        });
      });
      if (hilos.length < lote) break;
      inicio += lote;
    }
  });
  msgs.sort(function (a, b) { return a.fecha - b.fecha; });
  return { msgs: msgs, otros: otros, hilos: nHilos };
}

/** Filas ya guardadas cuyo SKU COMPLETO sigue cortado: se vuelve a intentar (solo toca la columna SKU COMPLETO y SKU CANDIDATOS). */
function canReparar_(h) {
  if (h.getLastRow() < 2) return 0;
  var mapa = canMapaHoja_(h).mapa, cs = mapa[normEnc_(CAN_SKU_COMPLETO)];
  if (!cs) return 0;
  var n = h.getLastRow() - 1, vals = h.getRange(2, cs, n, 1).getValues(), conocidos = null, cambios = 0;
  var cc = mapa[normEnc_('SKU CANDIDATOS')];
  for (var i = 0; i < n; i++) {
    var v = String(vals[i][0] || '');
    if (!/(\.\.\.|…)$/.test(v)) continue;
    if (conocidos === null) conocidos = canSkusConocidos_();
    var nuevo = canCompletarSku_(v, conocidos);
    if (nuevo !== v) { h.getRange(i + 2, cs).setValue(nuevo); cambios++; }
    var cand = canCandidatosSku_(v, conocidos);
    if (cand) {
      if (!cc) cc = canAsegurarColumnas_(h, ['SKU CANDIDATOS'])[normEnc_('SKU CANDIDATOS')];
      h.getRange(i + 2, cc).setNumberFormat('@').setValue(cand);
    }
  }
  return cambios;
}

/* ---------------- proceso ---------------- */

/**
 * Lee los correos desde `desde` (Date) y agrega a la hoja lo que no estaba.
 * Devuelve { nuevos: correos nuevos, filas: filas agregadas, sinTabla: correos sin tabla, revisados }.
 */
function canLeer_(desde) {
  var t0 = Date.now(), res0 = 0;
  var h = getHoja_(CAN_HOJA);
  var r = canMensajes_(desde);

  var cols0 = canAsegurarColumnas_(h, CAN_FIJAS);
  try { res0 = canReparar_(h); } catch (e) { res0 = 0; }
  var yaLeidos = canIdsLeidos_(h, cols0[normEnc_('ID CORREO')]);
  var pendientes = r.msgs.filter(function (x) { return !yaLeidos[x.id]; });

  var res = { nuevos: pendientes.length, filas: 0, sinTabla: 0, revisados: r.msgs.length, skuCompletados: res0 };
  var hoyD = Utilities.parseDate(hoy_(), TZ, 'yyyy-MM-dd');

  if (pendientes.length) {
    var conocidos = null;
    var items = [];   // { fijas:[], valores:{ENC:texto}, encs:[...] }

    pendientes.forEach(function (p) {
      var html = '';
      try { html = p.msg.getBody(); } catch (e) { html = ''; }
      var tablas = canTablasDeDatos_(html);
      try {
        var iPuntos = html.indexOf('...');
        if (iPuntos > -1 && props_().getProperty('CAN_MUESTRA') !== '1') {
          logInfo_(CAN_ETAPA, 'Muestra del HTML donde Walmart corta un valor con "...": ' + html.substring(Math.max(0, iPuntos - 400), iPuntos + 150));
          props_().setProperty('CAN_MUESTRA', '1');
        }
      } catch (e) {}
      var link = 'https://mail.google.com/mail/u/0/#all/' + p.hilo;

      if (!tablas.length) {
        res.sinTabla++;
        logWarn_(CAN_ETAPA, 'Correo de cancelacion SIN tabla reconocible: se guarda una fila para que no se pierda. Revisalo a mano.',
                 { id: p.id, fecha: Utilities.formatDate(p.fecha, TZ, 'yyyy-MM-dd HH:mm'), inicio: canLimpiarCelda_(html).slice(0, 300) });
        var v0 = {}; v0[CAN_OBS] = 'SIN TABLA EN EL CORREO - revisar a mano';
        items.push({ fijas: [hoyD, p.fecha, p.id, link], valores: v0, encs: [CAN_OBS] });
        return;
      }
      tablas.forEach(function (t) {
        // encabezados repetidos dentro de la misma tabla: (2), (3)...
        var vistos = {}, encs = t.enc.map(function (e, i) {
          var base = e || ('COLUMNA ' + (i + 1)), k = normEnc_(base);
          vistos[k] = (vistos[k] || 0) + 1;
          return vistos[k] > 1 ? base + ' (' + vistos[k] + ')' : base;
        });
        t.filas.forEach(function (fila) {
          var valores = {}, encsFila = encs.slice();
          encs.forEach(function (e, i) { valores[e] = i < fila.length ? fila[i] : ''; });
          for (var i = encs.length; i < fila.length; i++) {            // fila con mas celdas que encabezados
            var extra = 'COLUMNA ' + (i + 1);
            valores[extra] = fila[i]; encsFila.push(extra);
          }
          // SKU completo
          var eSku = '';
          encsFila.forEach(function (e) { if (!eSku && /\bSKU\b/i.test(canSinAcentos_(e))) eSku = e; });
          if (eSku) {
            if (conocidos === null) conocidos = canSkusConocidos_();
            valores[CAN_SKU_COMPLETO] = canCompletarSku_(valores[eSku], conocidos);
            encsFila.push(CAN_SKU_COMPLETO);
            var cand = canCandidatosSku_(valores[eSku], conocidos);
            if (cand) { valores['SKU CANDIDATOS'] = cand; encsFila.push('SKU CANDIDATOS'); }
          }
          items.push({ fijas: [hoyD, p.fecha, p.id, link], valores: valores, encs: encsFila });
        });
      });
    });

    // columnas necesarias (las nuevas van al final) y escritura al final de la hoja
    var todas = CAN_FIJAS.slice();
    items.forEach(function (it) { it.encs.forEach(function (e) { if (todas.indexOf(e) === -1) todas.push(e); }); });
    var mapa = canAsegurarColumnas_(h, todas);
    var ancho = 0; Object.keys(mapa).forEach(function (k) { ancho = Math.max(ancho, mapa[k]); });
    ancho = Math.max(ancho, h.getLastColumn());

    var datos = items.map(function (it) {
      var fila = new Array(ancho).fill('');
      CAN_FIJAS.forEach(function (f, i) { fila[mapa[normEnc_(f)] - 1] = it.fijas[i]; });
      it.encs.forEach(function (e) { fila[mapa[normEnc_(e)] - 1] = it.valores[e]; });
      return fila;
    });

    var ini = h.getLastRow() + 1;
    if (h.getMaxRows() < ini + datos.length) h.insertRowsAfter(h.getMaxRows(), ini + datos.length - h.getMaxRows());
    // todo como texto (los numeros de orden pasan de 15 digitos), salvo las dos fechas fijas
    h.getRange(ini, 1, datos.length, ancho).setNumberFormat('@');
    h.getRange(ini, mapa[normEnc_('FECHA LECTURA')], datos.length, 1).setNumberFormat('dd/mm/yyyy');
    h.getRange(ini, mapa[normEnc_('FECHA CORREO')], datos.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
    h.getRange(ini, 1, datos.length, ancho).setValues(datos);
    SpreadsheetApp.flush();
    res.filas = datos.length;
  }

  // otros asuntos dentro de la etiqueta: una vez al dia, para que no se pierda un formato nuevo
  try {
    var otrosK = Object.keys(r.otros);
    if (otrosK.length) {
      var marca = hoy_() + '|' + otrosK.length;
      if (props_().getProperty('CAN_OTROS') !== marca) {
        logInfo_(CAN_ETAPA, 'En la busqueda hay correos con OTRO asunto (no se leen): ' +
                            otrosK.slice(0, 4).map(function (a) { return '"' + a.substring(0, 70) + '"'; }).join(', ') +
                            (otrosK.length > 4 ? ' y ' + (otrosK.length - 4) + ' mas' : ''));
        props_().setProperty('CAN_OTROS', marca);
      }
    }
  } catch (e) {}

  res.ms = Date.now() - t0;
  return res;
}

function canMensajeError_(e) {
  var m = String(e && e.message || e).split('\n')[0];
  if (/gmail|permission|permiso|authoriz|autoriz/i.test(m)) {
    return m + ' | Falta el permiso de Gmail: corre cualquier opcion del menu y acepta, luego "Activar TODAS las corridas".';
  }
  return m;
}

/** Menu: lee desde el 15-oct (lo ya leido se salta). */
function cancelacionesBajar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) { toast_('Otra bajada en curso. Intenta en un minuto.', 'CANCELACIONES', 8); return; }
  try {
    toast_('Leyendo correos de cancelaciones...', 'CANCELACIONES', 60);
    logStart_(CAN_ETAPA, 'Leyendo correos de cancelaciones desde ' + CAN_DESDE);
    var r = canLeer_(Utilities.parseDate(CAN_DESDE, TZ, 'yyyy-MM-dd'));
    logFinish_(CAN_ETAPA, 'Cancelaciones: ' + r.nuevos + ' correos nuevos, ' + r.filas + ' filas agregadas', r);
    flushLog_();
    toast_(r.nuevos + ' correos nuevos · ' + r.filas + ' filas' + (r.sinTabla ? ' · ' + r.sinTabla + ' SIN tabla (ver Log)' : ''), 'CANCELACIONES', 10);
  } catch (e) {
    logErr_(CAN_ETAPA, 'No se pudieron leer las cancelaciones: ' + canMensajeError_(e));
    try { flushLog_(); } catch (x) {}
    toast_('Fallo: ' + canMensajeError_(e), 'CANCELACIONES', 20);
  } finally {
    lock.releaseLock();
  }
}

/** Lo llama killersProgramado() cada hora: los ultimos dias; lo ya leido se salta. */
function cancelacionesProgramado_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var base = Utilities.parseDate(CAN_DESDE, TZ, 'yyyy-MM-dd');
    var reciente = new Date(Date.now() - CAN_DIAS_REVISION * 86400000);
    var desde = reciente > base ? reciente : base;
    var h = SpreadsheetApp.getActive().getSheetByName(CAN_HOJA);
    if (!h || h.getLastRow() < 2) desde = base;          // hoja nueva o vacia: todo desde el 15-oct
    var r = canLeer_(desde);
    if (r.filas > 0) logOk_(CAN_ETAPA, 'Cancelaciones nuevas: ' + r.nuevos + ' correos, ' + r.filas + ' filas', r);
    else logLatido_(CAN_ETAPA, 'Cancelaciones al dia', r);
    try { props_().deleteProperty('CAN_ULT_ERROR'); } catch (e) {}
  } catch (e) {
    var msg = canMensajeError_(e).substring(0, 220);
    var marca = hoy_() + '|' + msg;
    var previa = '';
    try { previa = props_().getProperty('CAN_ULT_ERROR') || ''; } catch (x) {}
    if (previa !== marca) {
      logWarn_(CAN_ETAPA, 'No se pudieron leer las cancelaciones: ' + msg);
      try { props_().setProperty('CAN_ULT_ERROR', marca); } catch (x) {}
    }
  } finally {
    try { flushLog_(); } catch (x) {}
    lock.releaseLock();
  }
}
