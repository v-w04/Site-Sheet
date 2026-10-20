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
 *  Corre cada hora con SU PROPIO trigger (el de la cuenta que lo activa, la dueña del Gmail con los correos) y a mano: menu Walmart > Leer cancelaciones del correo.
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
// Columnas de control (van justo despues de LINK). Tu marcas la casilla; el script llena el resto.
var CAN_CHECK  = 'CANCELAR EN ODOO';
var CAN_ESTADO = 'ESTADO ODOO';
var CAN_ENTREGA = 'ENTREGA CANCELACION';
var CAN_FECHA_ODOO = 'FECHA ODOO';
var CAN_NOTA = 'NOTA ODOO';
var CAN_POR = 'CANCELADO POR';
var CAN_TODAS = 'TODAS LAS ENTREGAS';
var CAN_PRODUCTO = 'PRODUCTO ODOO';
var CAN_TOTAL = 'TOTAL ODOO';
var CAN_CTRL = [CAN_CHECK, CAN_ESTADO, CAN_ENTREGA, CAN_FECHA_ODOO, CAN_POR, CAN_TODAS, CAN_PRODUCTO, CAN_TOTAL, CAN_NOTA];
var CAN_COLORES_DIA = ['#e3efff', '#ffe9e6', '#e4f5e8', '#fff6d9', '#efe6fb', '#dff6f8', '#fdeadf'];   // lunes..domingo

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

/**
 * Llave de un pedido cancelado = orden de compra + pedido + SKU del correo (tal como vienen).
 * Sirve para no repetir el mismo pedido si lo leen dos cuentas de Gmail (el ID de correo cambia por cuenta).
 */
function canLlave_(pares) {
  var o = [], sku = '';
  pares.forEach(function (p) {
    var k = canSinAcentos_(p[0]).replace(/\s+/g, ' ').trim(), v = String(p[1] == null ? '' : p[1]).trim().toUpperCase();
    if (/^(orden de compra|pedido)/.test(k) && k.indexOf('fecha') === -1) o.push(v);
    else if (/^sku$/.test(k) || /^sku \(/.test(k)) { if (!sku) sku = v; }
  });
  return o.length && sku ? o.join('|') + '|' + sku : '';
}

function canLlavesLeidas_(h) {
  var llaves = {};
  if (h.getLastRow() < 2) return llaves;
  var nc = h.getLastColumn();
  var enc = h.getRange(1, 1, 1, nc).getValues()[0];
  h.getRange(2, 1, h.getLastRow() - 1, nc).getValues().forEach(function (f) {
    var l = canLlave_(enc.map(function (e, i) { return [e, f[i]]; }));
    if (l) llaves[l] = true;
  });
  return llaves;
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
  canAsegurarControl_(h);
  cols0 = canAsegurarColumnas_(h, CAN_FIJAS);
  try { res0 = canReparar_(h); } catch (e) { res0 = 0; }
  var yaLeidos = canIdsLeidos_(h, cols0[normEnc_('ID CORREO')]);
  var pendientes = r.msgs.filter(function (x) { return !yaLeidos[x.id]; });
  var llaves = pendientes.length ? canLlavesLeidas_(h) : {};

  var res = { nuevos: pendientes.length, filas: 0, sinTabla: 0, revisados: r.msgs.length, skuCompletados: res0, repetidas: 0 };
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
          var llave = canLlave_(encsFila.map(function (e) { return [e, valores[e]]; }));
          if (llave && llaves[llave]) { res.repetidas++; return; }     // ya esta (leido por otra cuenta o correo reenviado)
          if (llave) llaves[llave] = true;
          items.push({ fijas: [hoyD, p.fecha, p.id, link], valores: valores, encs: encsFila });
        });
      });
    });

    // columnas necesarias (las nuevas van al final) y escritura al final de la hoja
    if (!items.length) { res.ms = Date.now() - t0; return res; }
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
    try { canFormato_(h); } catch (e) { logWarn_(CAN_ETAPA, 'No se pudo dar formato: ' + e.message); }
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

  try { res.cuenta = Session.getEffectiveUser().getEmail(); } catch (e) { res.cuenta = '?'; }
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
    try {
      if (canOdooConectado_() && h2_ok_()) { var vo = canVerificarOdoo_(SpreadsheetApp.getActive().getSheetByName(CAN_HOJA)); if (vo.cambios) logInfo_(CAN_ETAPA, 'Odoo: ' + vo.cambios + ' pedidos con estado nuevo (' + vo.canceladas + ' cancelados)'); }
    } catch (eo) { logWarn_(CAN_ETAPA, 'Verificacion en Odoo fallo: ' + String(eo.message || eo).split('\n')[0].substring(0, 160)); }
    if (r.filas > 0) logOk_(CAN_ETAPA, 'Cancelaciones nuevas: ' + r.nuevos + ' correos, ' + r.filas + ' filas', r);
    else kUnaVezAlDia_('cancel-al-dia', function () { logInfo_(CAN_ETAPA, 'Cancelaciones al dia: la corrida horaria esta funcionando (sin correos nuevos)', r); });
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


/**
 * Menu: crea el trigger propio de cancelaciones (cada hora) a nombre de LA CUENTA QUE LO CORRE.
 * Hazlo con la cuenta que recibe los correos de Walmart. No toca los triggers de las otras corridas.
 */
function cancelacionesActivarTrigger() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cancelacionesProgramado_') { ScriptApp.deleteTrigger(t); n++; }
  });
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cancelacionesAutoProgramado_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cancelacionesProgramado_').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('cancelacionesAutoProgramado_').timeBased().atHour(6).everyDays(1).create();   // entre 6:00 y 7:00 (zona del proyecto: CDMX), para que a las 7 ya este cancelado
  var quien = '';
  try { quien = tgQuien_(); } catch (e) {}
  logInfo_(CAN_ETAPA, 'Trigger de cancelaciones activado (cada hora) por ' + (quien || 'la cuenta actual') + (n ? ' (reemplazo ' + n + ' anterior)' : ''));
  try { flushLog_(); } catch (e) {}
  try {
    SpreadsheetApp.getUi().alert('Cancelaciones',
      'Listo: cada hora se leen los correos de cancelacion y todos los dias entre 6 y 7am se cancelan en Odoo las que sigan pendientes.\n\nQuedo a nombre de ' + (quien || 'la cuenta con la que abriste esta hoja') +
      ' y lee el Gmail de esa cuenta.', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}
}


/* ---------------- columnas de control, colores y casillas ---------------- */

function canLetra_(n) {
  var t = '';
  while (n > 0) { var m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = Math.floor((n - 1) / 26); }
  return t;
}

/** Las columnas de control van justo despues de LINK (columna D). Si ya existen no hace nada. */
function canAsegurarControl_(h) {
  var info = canMapaHoja_(h);
  var faltan = CAN_CTRL.filter(function (k) { return !info.mapa[normEnc_(k)]; });
  if (!faltan.length) return;
  var colLink = info.mapa[normEnc_('LINK')] || 4;
  if (faltan.length === CAN_CTRL.length) {
    h.insertColumnsAfter(colLink, faltan.length);
    faltan.forEach(function (k, i) { h.getRange(1, colLink + 1 + i).setValue(k).setFontWeight('bold'); });
  } else {
    canAsegurarColumnas_(h, faltan);
    try { canOrdenar_(h); } catch (e) {}      // las columnas nuevas se acomodan en su bloque
  }
}

/** Casillas, formato de fecha y colores: un color tenue por dia de la semana en TODA la fila. Se puede correr las veces que sea. */
function canFormato_(h) {
  var info = canMapaHoja_(h), m = info.mapa;
  var ult = h.getLastRow();
  if (ult < 2) return;
  var n = ult - 1;
  var cCheck = m[normEnc_(CAN_CHECK)], cEst = m[normEnc_(CAN_ESTADO)], cFec = m[normEnc_('FECHA CORREO')];

  if (cCheck) {
    var rc = h.getRange(2, cCheck, n, 1);
    rc.setNumberFormat('0');
    rc.insertCheckboxes();
    rc.setHorizontalAlignment('center');
  }
  if (cFec) h.getRange(2, cFec, n, 1).setNumberFormat('ddd dd/mm/yyyy hh:mm');
  [cEst, m[normEnc_(CAN_ENTREGA)], m[normEnc_(CAN_NOTA)]].forEach(function (c) {
    if (c) h.getRange(2, c, n, 1).setNumberFormat('0');
  });
  var cFo = m[normEnc_(CAN_FECHA_ODOO)];
  if (cFo) h.getRange(2, cFo, n, 1).setNumberFormat('dd/mm/yyyy hh:mm');

  // reglas: se quitan solo las nuestras y se vuelven a poner (las que tu agregues se respetan)
  var propias = function (r) {
    try {
      var c = r.getBooleanCondition(); if (!c) return false;
      var v = (c.getCriteriaValues() || []).join(' ');
      return /WEEKDAY\(\$[A-Z]+2,2\)/.test(v) || v.indexOf('"CANCELADO"') > -1 || v.indexOf('"OJO"') > -1;
    } catch (e) { return false; }
  };
  var reglas = h.getConditionalFormatRules().filter(function (r) { return !propias(r); });
  var nuevas = [];
  var filasMax = Math.max(h.getMaxRows() - 1, 1);
  if (cEst) {
    var L = canLetra_(cEst), rE = h.getRange(2, cEst, filasMax, 1);
    nuevas.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=LEFT($' + L + '2,9)="CANCELADO"')
      .setBackground('#a8dbb5').setFontColor('#0b5324').setBold(true).setRanges([rE]).build());
    nuevas.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=OR(LEFT($' + L + '2,4)="OJO ",LEFT($' + L + '2,5)="ERROR",LEFT($' + L + '2,3)="NO ")')
      .setBackground('#f4b6b0').setFontColor('#7a1c14').setBold(true).setRanges([rE]).build());
  }
  if (cFec) {
    var LF = canLetra_(cFec), rT = h.getRange(2, 1, filasMax, h.getMaxColumns());
    CAN_COLORES_DIA.forEach(function (color, i) {
      nuevas.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND($' + LF + '2<>"",WEEKDAY($' + LF + '2,2)=' + (i + 1) + ')')
        .setBackground(color).setRanges([rT]).build());
    });
  }
  h.setConditionalFormatRules(nuevas.concat(reglas));
  h.setFrozenRows(1);
}

function cancelacionesFormato() {
  var h = getHoja_(CAN_HOJA);
  canAsegurarControl_(h);
  canFormato_(h);
  toast_('Formato de Cancelaciones listo (colores por dia y casillas).', 'CANCELACIONES', 6);
}

/* ---------------- verificar en Odoo (solo LEE, no cambia nada en Odoo) ---------------- */

function canOdooConectado_() {
  var p = props_();
  return !!(p.getProperty(PROP_ODOO.URL) && p.getProperty(PROP_ODOO.DB) && p.getProperty(PROP_ODOO.USER) && p.getProperty(PROP_ODOO.KEY));
}

/**
 * Por cada pedido de la hoja que aun no aparece CANCELADO, consulta en Odoo la venta (nombre = "Orden de compra#")
 * y sus entregas (origen = ese nombre). Llena ESTADO ODOO, ENTREGA CANCELACION (ej. WH/PICK/77203), FECHA ODOO y NOTA ODOO.
 * No toca la casilla ni ninguna otra columna.
 */
function canVerificarOdoo_(h) {
  if (!canOdooConectado_()) throw new Error('Odoo no esta conectado: menu Configuracion > Conectar Odoo.');
  var ult = h.getLastRow();
  if (ult < 2) return { revisadas: 0, canceladas: 0 };
  var m = canMapaHoja_(h).mapa, n = ult - 1;
  var cOrd = null;
  Object.keys(m).forEach(function (k) { if (!cOrd && /^ORDEN DE COMPRA/.test(k)) cOrd = m[k]; });
  var cEst = m[normEnc_(CAN_ESTADO)], cEnt = m[normEnc_(CAN_ENTREGA)], cFec = m[normEnc_(CAN_FECHA_ODOO)], cNot = m[normEnc_(CAN_NOTA)];
  var cPor = m[normEnc_(CAN_POR)], cTod = m[normEnc_(CAN_TODAS)], cPro = m[normEnc_(CAN_PRODUCTO)], cTot = m[normEnc_(CAN_TOTAL)];
  var cSku = m[normEnc_(CAN_SKU_COMPLETO)], cQty = m[normEnc_('QTY.')];
  if (!cOrd || !cEst || !cEnt || !cFec || !cNot) throw new Error('Faltan columnas de control: corre "Formato cancelaciones".');

  var col = function (c0) { return c0 ? h.getRange(2, c0, n, 1).getValues() : null; };
  var ord = col(cOrd), est = col(cEst), ent = col(cEnt), fec = col(cFec), not = col(cNot),
      por = col(cPor), tod = col(cTod), pro = col(cPro), tot = col(cTot), sku = col(cSku), qty = col(cQty);

  var nombres = {};
  for (var i = 0; i < n; i++) {
    var o = String(ord[i][0] || '').trim();
    if (!o) continue;
    var cancelada = /^CANCELADO/.test(String(est[i][0] || ''));
    var faltaInfo = (pro && !String(pro[i][0] || '')) || (tod && !String(tod[i][0] || ''));   // filas ya canceladas a las que les faltan los datos nuevos de Odoo
    if (!cancelada || faltaInfo) nombres[o] = true;
  }
  var lista = Object.keys(nombres);
  if (!lista.length) return { revisadas: 0, canceladas: 0, cambios: 0 };

  var ventas = {}, entregas = {}, lineas = {};
  for (var j = 0; j < lista.length; j += 100) {
    var trozo = lista.slice(j, j + 100);
    var vs = odooExecute_('sale.order', 'search_read', [[['name', 'in', trozo]]],
      { fields: ['name', 'state', 'write_date', 'amount_total', 'x_studio_cancelado_por', 'partner_id'] });
    vs.forEach(function (v) { ventas[String(v.name)] = v; });
    odooExecute_('stock.picking', 'search_read', [[['origin', 'in', trozo]]], { fields: ['name', 'origin', 'state', 'picking_type_code'] })
      .forEach(function (p) { (entregas[String(p.origin)] = entregas[String(p.origin)] || []).push(p); });
    if (vs.length && (cPro || cSku || cQty)) {
      var idPorNombre = {};
      vs.forEach(function (v) { idPorNombre[v.id] = String(v.name); });
      odooExecute_('sale.order.line', 'search_read', [[['order_id', 'in', vs.map(function (v) { return v.id; })]]],
        { fields: ['order_id', 'product_id', 'product_uom_qty'] }).forEach(function (l) {
          var nom = idPorNombre[Array.isArray(l.order_id) ? l.order_id[0] : l.order_id];
          if (nom) (lineas[nom] = lineas[nom] || []).push(l);
        });
    }
  }

  var sistemaNota = /^(SALIDA AL CLIENTE|Entregas abiertas|Entrega ya|La salida|Odoo no deja|No encontrada|No es de WALMART)/;
  var canceladas = 0, cambios = 0;
  for (var k = 0; k < n; k++) {
    var nombre = String(ord[k][0] || '').trim();
    if (!nombre || !nombres[nombre]) continue;
    var v = ventas[nombre], ps = entregas[nombre] || [], ls = lineas[nombre] || [];
    var pc = ps.filter(function (x) { return x.state === 'cancel'; }).map(function (x) { return x.name; });
    var hechas = ps.filter(function (x) { return x.state === 'done' && canEsSalida_(x); }).map(function (x) { return x.name; });
    var e = '', f = '', nota = '';
    if (!v) { e = 'NO ENCONTRADA EN ODOO'; }
    else if (v.state === 'cancel') {
      e = 'CANCELADO EN ODOO'; canceladas++;
      try { f = Utilities.formatDate(new Date(String(v.write_date).replace(' ', 'T') + 'Z'), TZ, 'dd/MM/yyyy HH:mm'); } catch (x) {}
    }
    else if (v.state === 'sale') e = 'PENDIENTE: orden activa en Odoo';
    else e = 'PENDIENTE: ' + v.state + ' en Odoo';
    if (v && v.state !== 'cancel' && !canEsWalmart_(v.partner_id)) {
      e = 'OJO cliente no es WALMART'; nota = 'No encontrada como WALMART: cliente "' + canNombreCliente_(v.partner_id) + '". No se cancela automaticamente.';
    } else if (hechas.length) { nota = 'SALIDA AL CLIENTE YA HECHA (' + hechas.join(' | ') + '): para cancelar hace falta devolucion'; if (!/^CANCELADO/.test(e)) e = 'OJO ' + e; }
    else if (v && v.state !== 'cancel' && ps.length) nota = 'Entregas abiertas: ' + ps.map(function (x) { return x.name + ' (' + x.state + ')'; }).join(' | ');
    if (String(est[k][0]) !== e || String(ent[k][0]) !== pc.join(' | ')) cambios++;
    est[k][0] = e; ent[k][0] = pc.join(' | '); fec[k][0] = f;
    // NOTA: solo se reescribe si esta vacia o es una nota del sistema; lo que escribas tu (ej. NO CANCELAR) se respeta
    var notaActual = String(not[k][0] || '');
    if (!notaActual || sistemaNota.test(notaActual) || /^ERROR/.test(e)) not[k][0] = nota || (sistemaNota.test(notaActual) ? '' : notaActual);

    if (v) {
      if (por) { var pp = v.x_studio_cancelado_por; por[k][0] = pp && pp !== false ? String(pp) : String(por[k][0] || ''); }
      if (tot) tot[k][0] = v.amount_total;
      if (tod) tod[k][0] = ps.map(function (x) { return x.name + ' (' + x.state + ')'; }).join(' | ');
      if (pro) pro[k][0] = ls.map(function (l) { return (Array.isArray(l.product_id) ? l.product_id[1] : '') + ' x' + l.product_uom_qty; }).join(' | ');
      if (sku && !String(sku[k][0] || '') && ls.length) {
        var mm = /\[([^\]]+)\]/.exec(Array.isArray(ls[0].product_id) ? String(ls[0].product_id[1]) : '');
        if (mm) sku[k][0] = mm[1];
      }
      if (qty && !String(qty[k][0] || '') && ls.length) qty[k][0] = String(ls.reduce(function (s, l) { return s + Number(l.product_uom_qty || 0); }, 0));
    }
  }
  var poner = function (c0, arr) { if (c0 && arr) h.getRange(2, c0, n, 1).setValues(arr); };
  poner(cEst, est); poner(cEnt, ent); poner(cFec, fec); poner(cNot, not);
  poner(cPor, por); poner(cTod, tod); poner(cPro, pro); poner(cTot, tot); poner(cSku, sku); poner(cQty, qty);
  SpreadsheetApp.flush();
  return { revisadas: lista.length, canceladas: canceladas, cambios: cambios };
}

function cancelacionesVerificarOdoo() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) { toast_('Otra corrida en curso. Intenta en un minuto.', 'CANCELACIONES', 8); return; }
  try {
    var h = getHoja_(CAN_HOJA);
    canAsegurarControl_(h); canFormato_(h);
    toast_('Consultando Odoo...', 'CANCELACIONES', 60);
    var r = canVerificarOdoo_(h);
    logOk_(CAN_ETAPA, 'Verificado en Odoo: ' + r.revisadas + ' pedidos, ' + r.canceladas + ' cancelados', r);
    flushLog_();
    toast_(r.revisadas + ' pedidos revisados · ' + r.canceladas + ' ya cancelados en Odoo', 'CANCELACIONES', 10);
  } catch (e) {
    logErr_(CAN_ETAPA, 'No se pudo verificar en Odoo: ' + String(e.message || e).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    toast_('Fallo: ' + String(e.message || e).split('\n')[0], 'CANCELACIONES', 20);
  } finally { lock.releaseLock(); }
}

/* ---------------- descubrir como cancela Odoo (SOLO LEE; no cancela nada) ---------------- */

/**
 * Escribe en la hoja _CancelOdoo como cancela tu Odoo: los botones "Cancelar" de la venta, las acciones/asistentes
 * a los que llevan y los campos del asistente (el cuadro "Quien cancela? / PIN"). No necesita permisos de administrador
 * (no usa ir.model) y no cancela nada.
 */
function odooDescubrirCancelacion() {
  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  var filas = [['TIPO', 'MODELO / BOTON', 'CAMPO', 'TIPO DE CAMPO', 'ETIQUETA', 'RELACION']];
  var aviso = function (t) { filas.push(['AVISO', String(t).substring(0, 220), '', '', '', '']); };
  var modelos = { 'sale.order.cancel': true, 'x_cancelacion_log': true };   // x_cancelacion_log = el cuadro 'Cancelar venta' (quien cancela + PIN)
  try {
    // 1) campos de la venta que suenen a cancelacion / PIN / autoriza
    var campos = odooExecute_('sale.order', 'fields_get', [], { attributes: ['string', 'type', 'relation'] });
    Object.keys(campos).sort().forEach(function (k) {
      var f = campos[k] || {};
      if (/cancel|pin|motivo|autoriz|quien|^x_studio/i.test(k + ' ' + (f.string || '')))
        filas.push(['CAMPO VENTA', 'sale.order', k, f.type || '', f.string || '', f.relation || '']);
    });
  } catch (e) { aviso('Campos de la venta: ' + (e.message || e)); }

  try {
    // 2) botones "Cancelar" de la vista de la venta
    var vistas = odooExecute_('sale.order', 'get_views', [[[false, 'form']]], {});
    var arch = String(vistas.views.form.arch || '');
    var re = /<button\b[^>]*>/g, b, ids = [];
    while ((b = re.exec(arch)) !== null) {
      if (!/cancel/i.test(b[0])) continue;
      filas.push(['BOTON', b[0].substring(0, 250), '', '', '', '']);
      var nom = /name="([^"]+)"/.exec(b[0]), tip = /type="([^"]+)"/.exec(b[0]);
      if (nom && tip && tip[1] === 'action' && /^\d+$/.test(nom[1])) ids.push(Number(nom[1]));
    }
    if (ids.length) {
      odooExecute_('ir.actions.act_window', 'read', [ids], { fields: ['name', 'res_model', 'view_mode', 'context'] }).forEach(function (a) {
        filas.push(['ACCION', a.res_model, '', a.view_mode || '', a.name || '', String(a.context || '').substring(0, 200)]);
        if (a.res_model) modelos[a.res_model] = true;
      });
    }
  } catch (e) { aviso('Vista de la venta: ' + (e.message || e)); }

  try {
    // 3) acciones con "cancel" en el nombre
    odooExecute_('ir.actions.act_window', 'search_read', [[['name', 'ilike', 'cancel']]], { fields: ['name', 'res_model'], limit: 40 }).forEach(function (a) {
      filas.push(['ACCION', a.res_model, '', '', a.name || '', '']);
      if (a.res_model && /cancel/i.test(a.res_model + ' ' + a.name)) modelos[a.res_model] = true;
    });
  } catch (e) { aviso('Acciones: ' + (e.message || e)); }

  // 4) campos de cada asistente encontrado
  Object.keys(modelos).forEach(function (mod) {
    try {
      var f = odooExecute_(mod, 'fields_get', [], { attributes: ['string', 'type', 'relation', 'selection'] });
      Object.keys(f).sort().forEach(function (k) {
        var x = f[k] || {};
        if (/^(id|display_name|create_uid|create_date|write_uid|write_date|__last_update)$/.test(k)) return;
        filas.push(['CAMPO ASISTENTE', mod, k, x.type || '', x.string || '', x.relation || '']);
      });
    } catch (e) { aviso(mod + ': ' + (e.message || e)); }
  });

  try {
    // botones y campos de la vista del cuadro "Cancelar venta"
    var v2 = odooExecute_('x_cancelacion_log', 'get_views', [[[false, 'form']]], {});
    var a2 = String(v2.views.form.arch || '');
    var rb = /<button\b[^>]*>/g, bb;
    while ((bb = rb.exec(a2)) !== null) filas.push(['BOTON CUADRO', bb[0].substring(0, 250), '', '', '', '']);
    var rf = /<field\b[^>]*>/g, ff;
    while ((ff = rf.exec(a2)) !== null) filas.push(['CAMPO EN VISTA', ff[0].substring(0, 200), '', '', '', '']);
  } catch (e) { aviso('Vista del cuadro: ' + (e.message || e)); }
  try {
    // ultimos registros del cuadro (para ver como se llenan; el PIN NO se escribe en la hoja)
    var ult = odooExecute_('x_cancelacion_log', 'search_read', [[]], { limit: 3, order: 'id desc' });
    ult.forEach(function (r) {
      var o = {};
      Object.keys(r).forEach(function (k) { o[k] = /pin|clave|pass/i.test(k) ? '(oculto)' : r[k]; });
      filas.push(['EJEMPLO REGISTRO', JSON.stringify(o).substring(0, 600), '', '', '', '']);
    });
  } catch (e) { aviso('Registros del cuadro: ' + (e.message || e)); }
  try {
    escribirTabla_('_CancelOdoo', filas);
    logOk_('ODOO', 'Cancelacion: ' + (filas.length - 1) + ' filas en _CancelOdoo');
    flushLog_();
    if (ui) ui.alert('Listo', 'Se escribio la hoja _CancelOdoo con ' + (filas.length - 1) + ' filas. Avisale a Claude.', ui.ButtonSet.OK);
  } catch (e) {
    if (ui) ui.alert('Fallo', String(e.message || e), ui.ButtonSet.OK);
  }
}

/* ---------------- CANCELAR EN ODOO desde la hoja ---------------- */

/**
 * Como cancela tu Odoo (descubierto en _CancelOdoo): se crea un registro en el modelo x_cancelacion_log con
 * la venta (x_studio_order_id), quien cancela (x_studio_persona) y el PIN (x_studio_pin), y se ejecuta la accion del
 * boton "Confirmar cancelacion" (la accion de servidor que trae esa vista). Odoo valida el PIN: si esta mal, no cancela.
 * El PIN y la persona viven en Script Properties; el PIN nunca se escribe en la hoja ni en el Log.
 */
var CAN_MODELO_CANCELA = 'x_cancelacion_log';
var CAN_PROP_PIN = 'ODOO_CANCELA_PIN';
var CAN_PROP_PERSONA = 'ODOO_CANCELA_PERSONA';
var CAN_MAX_POR_CORRIDA = 25;
var CAN_PERSONA_DEFECTO = 'victor_medina';

/** Menu: guarda quien cancela y su PIN (una vez). */
function cancelacionesGuardarPin() {
  var ui = SpreadsheetApp.getUi();
  try {
    var f = odooExecute_(CAN_MODELO_CANCELA, 'fields_get', [['x_studio_persona']], { attributes: ['selection'] });
    var opciones = (f.x_studio_persona && f.x_studio_persona.selection) || [];
    var txt = opciones.map(function (o) { return o[1]; }).join(', ');
    var fija = null;
    opciones.forEach(function (o) { if (o[0] === CAN_PERSONA_DEFECTO) fija = o; });
    if (fija) {
      var pin0 = pedir_(ui, 'PIN de autorizacion', 'Cancelas como "' + fija[1] + '". Escribe tu PIN de 4 digitos. Se guarda solo en las propiedades del script (nunca en una hoja ni en el Log).');
      if (!pin0) return;
      if (!/^\d{4}$/.test(pin0)) { ui.alert('El PIN debe ser de 4 digitos.'); return; }
      props_().setProperty(CAN_PROP_PERSONA, fija[0]);
      props_().setProperty(CAN_PROP_PIN, pin0);
      logInfo_(CAN_ETAPA, 'PIN guardado (persona: ' + fija[0] + ')');
      flushLog_();
      ui.alert('Listo', 'Guardado: cancelas como "' + fija[1] + '".', ui.ButtonSet.OK);
      return;
    }
    var nombre = pedir_(ui, 'Quien cancela', 'Escribe tu nombre tal como sale en Odoo en "¿Quien cancela?".\n\nOpciones: ' + txt);
    if (!nombre) return;
    var q = canSinAcentos_(nombre).trim(), clave = '';
    opciones.forEach(function (o) { if (!clave && (canSinAcentos_(o[1]).trim() === q || canSinAcentos_(o[0]).trim() === q)) clave = o[0]; });
    if (!clave) { ui.alert('No coincide', 'No encontre "' + nombre + '" entre las opciones de Odoo.', ui.ButtonSet.OK); return; }
    var pin = pedir_(ui, 'PIN de autorizacion', 'Escribe tu PIN de 4 digitos. Se guarda solo en las propiedades del script (nunca en una hoja ni en el Log).');
    if (!pin) return;
    if (!/^\d{4}$/.test(pin)) { ui.alert('El PIN debe ser de 4 digitos.'); return; }
    props_().setProperty(CAN_PROP_PERSONA, clave);
    props_().setProperty(CAN_PROP_PIN, pin);
    logInfo_(CAN_ETAPA, 'Quien cancela y PIN guardados (persona: ' + clave + ')');
    flushLog_();
    ui.alert('Listo', 'Guardado: cancelas como "' + nombre + '".', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Fallo', String(e.message || e).split('\n')[0], ui.ButtonSet.OK);
  }
}

/** Id de la accion del boton "Confirmar cancelacion" (se lee de la vista del cuadro, no se adivina). */
function canAccionConfirmar_() {
  var v = odooExecute_(CAN_MODELO_CANCELA, 'get_views', [[[false, 'form']]], {});
  var arch = String(v.views.form.arch || '');
  var m = /<button\b[^>]*name="(\d+)"[^>]*type="action"[^>]*string="Confirmar[^"]*"/.exec(arch) ||
          /<button\b[^>]*string="Confirmar[^"]*"[^>]*name="(\d+)"[^>]*type="action"/.exec(arch);
  if (!m) throw new Error('No encontre el boton "Confirmar cancelacion" en el cuadro de Odoo.');
  return Number(m[1]);
}

/** Solo se cancelan ventas cuyo contacto/cliente sea WALMART. */
function canEsWalmart_(partner) {
  var nombre = Array.isArray(partner) ? String(partner[1] || '') : String(partner || '');
  return /walmart/i.test(nombre);
}
function canNombreCliente_(partner) { return Array.isArray(partner) ? String(partner[1] || '') : String(partner || ''); }

/** La unica entrega que bloquea cancelar es la SALIDA final al cliente (WH/OUT) ya hecha; pick y pack hechos no importan. */
function canEsSalida_(p) {
  return String(p.picking_type_code || '') === 'outgoing' || /\/OUT\//i.test(String(p.name || ''));
}

/** Cancela UNA venta: revisa estado y entregas, crea el registro del cuadro con persona y PIN, y ejecuta "Confirmar cancelacion". true = se envio la cancelacion; false = ya estaba cancelada. Lanza error si no se puede. */
function canCancelarUna_(orden, accion, persona, pin) {
  var v = odooExecute_('sale.order', 'search_read', [[['name', '=', orden]]], { fields: ['name', 'state', 'partner_id'] });
  if (!v.length) throw new Error('No encontrada en Odoo');
  if (v[0].state === 'cancel') return false;
  if (!canEsWalmart_(v[0].partner_id)) throw new Error('No es de WALMART (cliente: ' + canNombreCliente_(v[0].partner_id) + '): no se cancelo');
  var hechasPk = odooExecute_('stock.picking', 'search_read', [[['origin', '=', orden], ['state', '=', 'done']]], { fields: ['name', 'picking_type_code'] }).filter(canEsSalida_);
  if (hechasPk.length) throw new Error('La salida al cliente ya esta hecha (' + hechasPk.map(function (p) { return p.name; }).join(' | ') + '): requiere devolucion, no se cancelo');
  var idLog = odooExecute_(CAN_MODELO_CANCELA, 'create', [{ x_studio_order_id: v[0].id, x_studio_persona: persona, x_studio_pin: pin }]);
  try {
    odooExecute_('ir.actions.server', 'run', [[accion]], { context: { active_model: CAN_MODELO_CANCELA, active_id: idLog, active_ids: [idLog] } });
  } catch (e) {
    var t = String(e.message || e).split('\n')[0];
    if (/ir\.actions\.server|Server Action/i.test(t)) throw new Error('Odoo no deja a este usuario ejecutar la accion de confirmar (' + accion + '). No se cancelo la venta.');
    throw e;
  }
  return true;
}

/** Deja la venta en la hoja Cancelaciones (si no estaba) para que quede en el historial; luego se verifica en Odoo. */
function canAgregarManual_(orden, motivo) {
  var h = getHoja_(CAN_HOJA);
  canAsegurarColumnas_(h, CAN_FIJAS); canAsegurarControl_(h);
  var m = canMapaHoja_(h).mapa, cOrd = null;
  Object.keys(m).forEach(function (k) { if (!cOrd && /^ORDEN DE COMPRA/.test(k)) cOrd = m[k]; });
  if (!cOrd) cOrd = canAsegurarColumnas_(h, ['Orden de compra#'])[normEnc_('Orden de compra#')];
  m = canMapaHoja_(h).mapa;
  if (h.getLastRow() > 1) {
    var yaEsta = h.getRange(2, cOrd, h.getLastRow() - 1, 1).getValues().some(function (v) { return String(v[0]).trim() === orden; });
    if (yaEsta) return false;
  }
  var ancho = Math.max(h.getLastColumn(), 1), fila = new Array(ancho).fill('');
  var ahora = new Date();
  fila[m[normEnc_('FECHA LECTURA')] - 1] = Utilities.parseDate(hoy_(), TZ, 'yyyy-MM-dd');
  fila[m[normEnc_('FECHA CORREO')] - 1] = ahora;
  fila[m[normEnc_('ID CORREO')] - 1] = 'MANUAL-' + orden;
  fila[cOrd - 1] = orden;
  fila[m[normEnc_(CAN_NOTA)] - 1] = motivo || 'Cancelada manualmente desde el menu';
  fila[m[normEnc_(CAN_CHECK)] - 1] = true;
  var r = h.getLastRow() + 1;
  if (h.getMaxRows() < r) h.insertRowsAfter(h.getMaxRows(), 1);
  h.getRange(r, 1, 1, ancho).setNumberFormat('@');
  h.getRange(r, 1, 1, ancho).setValues([fila]);
  try { canFormato_(h); } catch (e) {}
  return true;
}

/** Menu: cancela UNA venta escribiendo su numero (sirve para probar sin tocar la hoja). */
function cancelacionesCancelarUna() {
  var ui = SpreadsheetApp.getUi();
  try {
    if (!canOdooConectado_()) { ui.alert('Odoo no esta conectado: menu Configuracion > Conectar Odoo.'); return; }
    var persona = props_().getProperty(CAN_PROP_PERSONA) || CAN_PERSONA_DEFECTO, pin = props_().getProperty(CAN_PROP_PIN);
    if (!pin) { ui.alert('Falta guardar el PIN: menu Cancelaciones > Guardar PIN y quien cancela.'); return; }
    var orden = pedir_(ui, 'Cancelar UNA venta en Odoo', 'Escribe el numero de la venta (ej. 609129486927617):');
    if (!orden) return;
    var accion = canAccionConfirmar_();
    var v = odooExecute_('sale.order', 'search_read', [[['name', '=', orden]]], { fields: ['name', 'state', 'partner_id'] });
    if (!v.length) { ui.alert('No encontre la venta ' + orden + ' en Odoo.'); return; }
    if (v[0].state !== 'cancel' && !canEsWalmart_(v[0].partner_id)) { ui.alert('No se cancela', 'La venta ' + orden + ' es del cliente "' + canNombreCliente_(v[0].partner_id) + '", no de WALMART. Este boton solo cancela ventas de WALMART.', ui.ButtonSet.OK); return; }
    var r = ui.alert('Cancelar en Odoo', 'Vas a CANCELAR la venta ' + orden + ' (cliente: ' + canNombreCliente_(v[0].partner_id) + ', estado actual: ' + v[0].state + ') como ' + persona + '.\n\n¿Continuar?', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
    var envio = canCancelarUna_(orden, accion, persona, pin);
    var d = odooExecute_('sale.order', 'search_read', [[['name', '=', orden]]], { fields: ['state'] });
    var ps = odooExecute_('stock.picking', 'search_read', [[['origin', '=', orden]]], { fields: ['name', 'state'] });
    try { canAgregarManual_(orden); canVerificarOdoo_(getHoja_(CAN_HOJA)); } catch (e2) { logWarn_(CAN_ETAPA, 'No se pudo anotar en la hoja: ' + String(e2.message || e2).split('\n')[0]); }
    logOk_(CAN_ETAPA, 'Cancelacion individual: ' + orden + ' -> ' + (d[0] ? d[0].state : '?'));
    flushLog_();
    ui.alert('Resultado', 'Venta ' + orden + ': ' + (d[0] ? d[0].state : '?') + (envio ? '' : ' (ya estaba cancelada)') + '\nEntregas: ' +
      (ps.length ? ps.map(function (p) { return p.name + ' (' + p.state + ')'; }).join(' | ') : 'ninguna'), ui.ButtonSet.OK);
  } catch (e) {
    var msg = String(e.message || e).split('\n')[0];
    var pin2 = props_().getProperty(CAN_PROP_PIN); if (pin2) msg = msg.split(pin2).join('****');
    logErr_(CAN_ETAPA, 'Fallo al cancelar una venta: ' + msg);
    try { flushLog_(); } catch (x) {}
    ui.alert('Fallo', msg, ui.ButtonSet.OK);
  }
}

/**
 * Cancela en Odoo las filas indicadas [{fila, orden}], verifica el resultado leyendo Odoo y anota los errores en ESTADO/NOTA.
 * Se detiene si fallan 2 seguidas (para no repetir un PIN malo o un permiso faltante).
 */
function canCancelarFilas_(h, objetivos, accion, persona, pin, origen) {
  var m = canMapaHoja_(h).mapa, cEst = m[normEnc_(CAN_ESTADO)], cNot = m[normEnc_(CAN_NOTA)];
  var errores = {}, hechas = 0, seguidos = 0, detenido = false;
  for (var i = 0; i < objetivos.length; i++) {
    var x = objetivos[i];
    try {
      if (canCancelarUna_(x.orden, accion, persona, pin)) hechas++;
      seguidos = 0;
    } catch (e) {
      errores[x.fila] = String(e.message || e).split('\n')[0].split(pin).join('****').substring(0, 220);
      seguidos++;
      if (seguidos >= 2) { detenido = true; break; }
    }
  }
  var vr = canVerificarOdoo_(h);              // lee el resultado real en Odoo: estado, entrega cancelada, fecha
  Object.keys(errores).forEach(function (fila) {
    var cel = h.getRange(Number(fila), cEst).getValue();
    if (!/^CANCELADO/.test(String(cel))) {
      h.getRange(Number(fila), cEst).setValue(/^(Entrega|La salida)/.test(errores[fila]) ? 'OJO: salida hecha' : 'ERROR: no se cancelo');
      h.getRange(Number(fila), cNot).setValue(errores[fila]);
    }
  });
  var nErr = Object.keys(errores).length;
  var datos = { origen: origen, intentadas: objetivos.length, enviadas: hechas, confirmadas: vr.canceladas, errores: errores, detenido: detenido };
  if (nErr) logWarn_(CAN_ETAPA, 'Cancelacion en Odoo (' + origen + '): ' + vr.canceladas + ' canceladas, ' + nErr + ' con error' + (detenido ? ' (se detuvo tras 2 errores seguidos)' : ''), datos);
  else logOk_(CAN_ETAPA, 'Cancelacion en Odoo (' + origen + '): ' + vr.canceladas + ' canceladas', datos);
  return { hechas: hechas, canceladas: vr.canceladas, nErr: nErr, detenido: detenido };
}

/** Todos los dias (entre 6 y 7am): cancela en Odoo todo lo guardado en Cancelaciones que siga pendiente. */
function cancelacionesAutoProgramado_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    if (!canOdooConectado_()) { logWarn_(CAN_ETAPA, 'Cancelacion automatica: Odoo no esta conectado.'); return; }
    var pin = props_().getProperty(CAN_PROP_PIN), persona = props_().getProperty(CAN_PROP_PERSONA) || CAN_PERSONA_DEFECTO;
    if (!pin) { logWarn_(CAN_ETAPA, 'Cancelacion automatica: falta guardar el PIN (menu Cancelaciones > Guardar PIN).'); return; }
    var h = SpreadsheetApp.getActive().getSheetByName(CAN_HOJA);
    if (!h || h.getLastRow() < 2) return;
    canVerificarOdoo_(h);                          // primero se ve que ya esta cancelado a mano
    var m = canMapaHoja_(h).mapa, n = h.getLastRow() - 1, cOrd = null;
    Object.keys(m).forEach(function (k) { if (!cOrd && /^ORDEN DE COMPRA/.test(k)) cOrd = m[k]; });
    var cEst = m[normEnc_(CAN_ESTADO)], cNot = m[normEnc_(CAN_NOTA)];
    if (!cOrd || !cEst || !cNot) return;
    var ord = h.getRange(2, cOrd, n, 1).getValues(), est = h.getRange(2, cEst, n, 1).getValues(), not = h.getRange(2, cNot, n, 1).getValues();
    var objetivos = [];
    for (var i = 0; i < n; i++) {
      var o = String(ord[i][0] || '').trim(), e = String(est[i][0] || ''), t = String(not[i][0] || '');
      if (!o || /^(CANCELADO|OJO|ERROR|NO ENCONTRADA)/.test(e) || /^NO CANCELAR/i.test(t)) continue;   // las de ERROR/OJO las ve una persona
      objetivos.push({ fila: i + 2, orden: o });
    }
    if (!objetivos.length) { logInfo_(CAN_ETAPA, 'Cancelacion automatica: nada pendiente.'); return; }
    objetivos = objetivos.slice(0, 40);
    logStart_(CAN_ETAPA, 'Cancelacion automatica de ' + objetivos.length + ' ventas en Odoo');
    canCancelarFilas_(h, objetivos, canAccionConfirmar_(), persona, pin, 'automatica 6-7am');
  } catch (e) {
    logErr_(CAN_ETAPA, 'Cancelacion automatica fallo: ' + String(e.message || e).split('\n')[0]);
  } finally {
    try { flushLog_(); } catch (x) {}
    lock.releaseLock();
  }
}

/** Menu: cancela en Odoo las filas con la casilla marcada. */
function cancelacionesCancelarEnOdoo() {
  var ui = SpreadsheetApp.getUi();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) { toast_('Otra corrida en curso. Intenta en un minuto.', 'CANCELACIONES', 8); return; }
  try {
    if (!canOdooConectado_()) { ui.alert('Odoo no esta conectado: menu Configuracion > Conectar Odoo.'); return; }
    var persona = props_().getProperty(CAN_PROP_PERSONA) || CAN_PERSONA_DEFECTO, pin = props_().getProperty(CAN_PROP_PIN);
    if (!pin) { ui.alert('Falta guardar quien cancela y el PIN: menu Cancelaciones > Guardar PIN de cancelacion.'); return; }

    var h = getHoja_(CAN_HOJA);
    var m = canMapaHoja_(h).mapa, ult = h.getLastRow();
    if (ult < 2) { ui.alert('La hoja Cancelaciones esta vacia.'); return; }
    var n = ult - 1, cOrd = null;
    Object.keys(m).forEach(function (k) { if (!cOrd && /^ORDEN DE COMPRA/.test(k)) cOrd = m[k]; });
    var cChk = m[normEnc_(CAN_CHECK)], cEst = m[normEnc_(CAN_ESTADO)], cNot = m[normEnc_(CAN_NOTA)];
    if (!cOrd || !cChk || !cEst || !cNot) { ui.alert('Faltan columnas: corre "Formato de cancelaciones".'); return; }
    var chk = h.getRange(2, cChk, n, 1).getValues(), ord = h.getRange(2, cOrd, n, 1).getValues(), est = h.getRange(2, cEst, n, 1).getValues();
    var objetivos = [];
    for (var i = 0; i < n; i++) {
      var o = String(ord[i][0] || '').trim();
      if (chk[i][0] === true && o && !/^CANCELADO/.test(String(est[i][0] || ''))) objetivos.push({ fila: i + 2, orden: o });
    }
    if (!objetivos.length) { toast_('No hay filas marcadas pendientes de cancelar.', 'CANCELACIONES', 8); return; }
    if (objetivos.length > CAN_MAX_POR_CORRIDA) objetivos = objetivos.slice(0, CAN_MAX_POR_CORRIDA);

    var accion = canAccionConfirmar_();

    var lista = objetivos.slice(0, 12).map(function (x) { return x.orden; }).join('\n');
    var r = ui.alert('Cancelar en Odoo',
      'Vas a CANCELAR ' + objetivos.length + ' venta(s) en Odoo con tu usuario y PIN:\n\n' + lista +
      (objetivos.length > 12 ? '\n... y ' + (objetivos.length - 12) + ' mas' : '') + '\n\n¿Continuar?', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;

    toast_('Cancelando en Odoo...', 'CANCELACIONES', 120);
    logStart_(CAN_ETAPA, 'Cancelando en Odoo ' + objetivos.length + ' ventas');
    var rs = canCancelarFilas_(h, objetivos, accion, persona, pin, 'manual');
    flushLog_();
    toast_(rs.canceladas + ' canceladas en Odoo' + (rs.nErr ? ' · ' + rs.nErr + ' con ERROR (ver NOTA ODOO)' : ''), 'CANCELACIONES', 15);
  } catch (e) {
    logErr_(CAN_ETAPA, 'Fallo al cancelar en Odoo: ' + String(e.message || e).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    ui.alert('Fallo', String(e.message || e).split('\n')[0], ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- orden y jerarquia de las columnas ---------------- */

// Orden de lo importante a lo tecnico. Lo que Walmart agregue y no este aqui queda antes del bloque tecnico.
var CAN_ORDEN_PRINCIPAL = ['FECHA CORREO', 'ORDEN DE COMPRA#', 'PEDIDO#', 'SKU COMPLETO', 'QTY.'];
var CAN_ORDEN_ODOO = [CAN_CHECK, CAN_ESTADO, CAN_ENTREGA, CAN_FECHA_ODOO, CAN_POR, CAN_TODAS, CAN_PRODUCTO, CAN_TOTAL, CAN_NOTA];
var CAN_ORDEN_APOYO = ['FECHA LECTURA', 'OBSERVACION'];
var CAN_ORDEN_WALMART = ['ORDER DATE', 'FECHA DEL PEDIDO', 'FECHA ESTIMADA DE ENVIO', 'FECHA ESTIMADA DE ENTREGA'];
var CAN_ORDEN_TECNICO = ['SKU', 'SKU CANDIDATOS', 'ID CORREO', 'LINK'];

function cancelacionesOrdenarColumnas() {
  var h = getHoja_(CAN_HOJA);
  canAsegurarControl_(h);
  canOrdenar_(h);
  canFormato_(h);
  toast_('Columnas ordenadas: pedido, Odoo, apoyo, detalle Walmart y datos tecnicos.', 'CANCELACIONES', 8);
}

function canOrdenar_(h) {
  var nc = h.getLastColumn();
  var actual = h.getRange(1, 1, 1, nc).getValues()[0].map(normEnc_);
  var conocidos = {};
  [CAN_ORDEN_PRINCIPAL, CAN_ORDEN_ODOO, CAN_ORDEN_APOYO, CAN_ORDEN_WALMART, CAN_ORDEN_TECNICO].forEach(function (g) {
    g.forEach(function (k) { conocidos[normEnc_(k)] = true; });
  });
  var nuevos = actual.filter(function (k) { return k && !conocidos[k]; });
  var meta = [];
  [CAN_ORDEN_PRINCIPAL, CAN_ORDEN_ODOO, CAN_ORDEN_APOYO, CAN_ORDEN_WALMART].forEach(function (g) { meta = meta.concat(g.map(normEnc_)); });
  meta = meta.concat(nuevos).concat(CAN_ORDEN_TECNICO.map(normEnc_));
  meta = meta.filter(function (k) { return actual.indexOf(k) > -1; });

  for (var i = 0; i < meta.length; i++) {
    var pos = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(normEnc_).indexOf(meta[i]) + 1;
    if (pos > 0 && pos !== i + 1) h.moveColumns(h.getRange(1, pos, h.getMaxRows(), 1), i + 1);
  }

  // jerarquia visual: color del encabezado por bloque, anchos y columnas fijas
  var m = canMapaHoja_(h).mapa;
  var bloques = [
    [CAN_ORDEN_PRINCIPAL, '#1f3864', '#ffffff'],
    [CAN_ORDEN_ODOO, '#274e13', '#ffffff'],
    [CAN_ORDEN_APOYO, '#666666', '#ffffff'],
    [CAN_ORDEN_WALMART, '#999999', '#ffffff'],
    [CAN_ORDEN_TECNICO, '#d9d9d9', '#333333']
  ];
  bloques.forEach(function (b) {
    b[0].forEach(function (k) {
      var c = m[normEnc_(k)];
      if (c) h.getRange(1, c).setBackground(b[1]).setFontColor(b[2]).setFontWeight('bold');
    });
  });
  nuevos.forEach(function (k) { var c = m[k]; if (c) h.getRange(1, c).setBackground('#999999').setFontColor('#ffffff').setFontWeight('bold'); });
  var anchos = { 'CANCELADO POR': 120, 'TODAS LAS ENTREGAS': 300, 'PRODUCTO ODOO': 320, 'TOTAL ODOO': 90, 'FECHA CORREO': 150, 'ORDEN DE COMPRA#': 135, 'PEDIDO#': 150, 'SKU COMPLETO': 190, 'QTY.': 45,
    'CANCELAR EN ODOO': 95, 'ESTADO ODOO': 190, 'ENTREGA CANCELACION': 140, 'FECHA ODOO': 120, 'NOTA ODOO': 260,
    'FECHA LECTURA': 100, 'SKU': 170, 'SKU CANDIDATOS': 220, 'ID CORREO': 120, 'LINK': 80 };
  Object.keys(anchos).forEach(function (k) { var c = m[normEnc_(k)]; if (c) h.setColumnWidth(c, anchos[k]); });
  h.setFrozenRows(1);
  var cOrd = m[normEnc_('ORDEN DE COMPRA#')];
  if (cOrd) h.setFrozenColumns(cOrd);
}

function h2_ok_() { var h = SpreadsheetApp.getActive().getSheetByName(CAN_HOJA); return !!(h && h.getLastRow() > 1); }
