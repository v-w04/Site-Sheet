/**
 * ============================================================
 *  Rastreo de guias en la paqueteria (BigSmart y FedEx) — hoja PAQUETERIA (19-nov-2026)
 * ============================================================
 *
 *  La extension "Site Sheet - Cookie" abre las paginas PUBLICAS de rastreo en el Chrome de ella (sin cuentas, sin API,
 *  sin llaves) y le manda al Sheet lo que ve. La verdad del paquete es la paqueteria.
 *
 *  Que guias: las de Ventas Walmart (ENVIO GUIA) de ventas de los ultimos RQ_DIAS dias (nada mas viejo).
 *  Cada guia se vuelve a consultar cada RQ_CADA_H horas hasta que la paqueteria dice algo FINAL:
 *    ENTREGADO · ROBADO · PERDIDO · DEVUELTO · CANCELADO CLIENTE  -> se detiene y queda en "Estado final" (ella filtra y abre caso).
 *  Una guia que cumple RQ_DIAS dias sin estado final deja de buscarse: Estado final = SIN FINAL EN 14 DIAS (revisarla a mano).
 *  BigSmart decide por el CODIGO del ultimo evento (catalogo abajo; ver catalogo-codigos-bigsmart.md). Codigo nuevo: se sigue
 *  buscando y se avisa "CODIGO NUEVO" con su texto. FedEx no tiene codigos: decide el texto del ultimo evento.
 *  Si la pagina pide verificacion ("eres humano") o no carga: Nota = REVISAR A MANO y alerta roja. Nunca se intenta saltar.
 *  NUNCA cancela nada (ni Walmart ni Odoo): solo informa.
 *
 *  Acciones del Web App: rastreo_lista {clave} -> {ok, guias:[{guia, paq}]}   rastreo_resultado {clave, resultados:[...]}.
 *  Prefijo rq / RQ_.
 */

var RQ_HOJA = 'PAQUETERIA', RQ_ETAPA = 'RASTREO';
var RQ_DIAS = 14;          // solo ventas de los ultimos 14 dias (ella: "maximo 2 semanas, nada para atras")
var RQ_CADA_H = 3;         // cada guia se vuelve a consultar cada 3 horas
var RQ_LOTE = 40;          // guias por vuelta de la extension (la extension da una vuelta cada 10 min, todo el dia). 20-nov: 20 -> 40 al sumar las guias de TRACKING (~600 en 14 dias)
var RQ_REINT_MIN = 10;     // 20-nov (ella: "entra en loop hasta que consigas los datos"): una guia que no se pudo leer se vuelve a pedir a los 10 min, no a las 3 h
var RQ_FALLAS_ALERTA = 6;  // alerta roja solo si la MISMA guia lleva 6 lecturas seguidas sin datos (~1 h intentando); antes solo queda en el Log y se sigue intentando
var RQ_ENC = ['Guia', 'Paqueteria', 'Orden Walmart (6000)', 'Orden de compra (609)', 'Fecha venta', 'Estatus real', 'Ultimo evento',
              'Codigo evento', 'Fecha evento', 'Fecha recoleccion', 'Estado final', 'Accion sugerida', 'Fecha estado final', 'Codigos historial', 'Consultas',
              'Fecha consulta', 'Nota', 'Historial'];   // Historial (20-nov): todos los eventos en JSON, para la API propia (RastreoAPI.gs)
var RQ_SIN_FINAL = 'SIN FINAL EN 14 DIAS';
// 20-nov (ella): en todo lo que se lee, BigSmart se llama "Paqueteria Dedicada Walmart". Por dentro (Sheet <-> extension) la clave sigue siendo BIGSMART.
var RQ_PDW = 'PAQUETERIA DEDICADA WALMART';
function rqNombrePaq_(paq) { return paq === 'BIGSMART' ? RQ_PDW : (paq || 'PAQUETERIA DESCONOCIDA'); }
// En Ventas Walmart (19-nov, ella: "en las ventas de Walmart pon el estatus en tiempo real"): una columna por dato, se llenan al llegar cada resultado.
var RQ_VW_ENC = ['PAQ ESTATUS', 'PAQ ULTIMO EVENTO', 'PAQ FECHA EVENTO', 'PAQ RECOLECCION', 'PAQ ESTADO FINAL', 'PAQ CONSULTADO'];
var RQ_MESES = { ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5, jul: 6, ago: 7, aug: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11, dec: 11 };

/** Fecha de un evento como la pinta la paqueteria -> Date (hora de Mexico) o null. BigSmart "13 nov 2026, 06:18 p.m."; FedEx "11/17/26 5:44 PM". */
function rqFecha_(txt) {
  var t = String(txt === null || txt === undefined ? '' : txt).toLowerCase().replace(/\s+/g, ' ').trim();
  var h = 0, mi = 0, m = /(\d{1,2}):(\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/.exec(t);
  if (m) { h = Number(m[1]); mi = Number(m[2]); var pm = m[3] && /^p/.test(m[3]); if (pm && h < 12) h += 12; if (m[3] && !pm && h === 12) h = 0; }
  var a = /(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})/.exec(t);
  if (a && RQ_MESES[a[2]] !== undefined) return new Date(Number(a[3]), RQ_MESES[a[2]], Number(a[1]), h, mi);
  var b = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t);
  if (b) { var y = Number(b[3]); if (y < 100) y += 2000; return new Date(y, Number(b[1]) - 1, Number(b[2]), h, mi); }
  return null;
}

/** Catalogo de BigSmart: codigo -> estado. EN CURSO = se sigue buscando. */
var RQ_BS = {
  101: 'EN CURSO', 103: 'EN CURSO', 105: 'EN CURSO', 106: 'EN CURSO', 107: 'EN CURSO', 108: 'EN CURSO', 200: 'EN CURSO', 210: 'EN CURSO',
  206: 'EN CURSO', 207: 'EN CURSO',   // 206 de vuelta a la estacion (excepcion de entrega), 207 en espera de ser reenviado: se sigue buscando
  131: 'EN CURSO',   // 20-nov: 131 Descontenerizado (visto en vivo)
  219: 'EN CURSO', 301: 'EN CURSO', 302: 'EN CURSO', 303: 'EN CURSO',
  360: 'ENTREGADO', 212: 'ROBADO', 220: 'CANCELADO CLIENTE'
};
var RQ_FINALES = ['ENTREGADO', 'ROBADO', 'PERDIDO', 'DEVUELTO', 'CANCELADO CLIENTE', 'NO EXISTE EN FEDEX'];
// 27-nov: FedEx contesta "no encontro la guia" y la guia seguia en ERROR para siempre (45+ lecturas). Despues de tantas lecturas seguidas (~6 h) deja de ser error: queda en Estado final.
var RQ_FEDEX_NOEXISTE = 36;
var RQ_ACCION = {
  'ENTREGADO': 'Nada',
  'ROBADO': 'Abrir caso en Walmart: "La paquetería recolectó mi paquete, pero la guía no tiene movimiento"',
  'PERDIDO': 'Abrir caso en Walmart: "La paquetería recolectó mi paquete, pero la guía no tiene movimiento"',
  'DEVUELTO': 'Revisar la devolución (que regrese al almacén)',
  'CANCELADO CLIENTE': 'El cliente no quiso el envío: cancelar en Odoo (tú) y revisar que regrese',
  'NO EXISTE EN FEDEX': 'FedEx no tiene esta guía: pregunta a quien la empacó (columna Empacó) si es la guía correcta o hay que generar otra; si el paquete ya salió, reclama con FedEx',
  'SIN FINAL EN 14 DIAS': 'Revisar la guía a mano (14 días sin estado final)'
};
var RQ_ESTATUS = { 'NO EXISTE EN FEDEX': 'FedEx no la encuentra', 'ENTREGADO': 'Entregado', 'ROBADO': 'Robado', 'PERDIDO': 'Perdido', 'DEVUELTO': 'Devuelto', 'CANCELADO CLIENTE': 'Cancelado por el cliente' };

/* ---------------- piezas puras (se prueban sin Google) ---------------- */

/** Paqueteria por el formato de la guia: BIGSMART (MXFDDWM...), FEDEX (solo digitos) o '' (no se consulta). */
function rqPaqDe_(guia) {
  var g = String(guia === null || guia === undefined ? '' : guia).trim();
  if (/^MXFDDWM\d+$/i.test(g)) return 'BIGSMART';
  if (/^\d{10,15}$/.test(g)) return 'FEDEX';
  return '';
}

/** Guias de una celda ENVIO GUIA (pueden venir varias, y Sheets puede traer el numero como 519750918399.0). */
function rqGuias_(v) {
  if (typeof v === 'number') return [v.toFixed(0)];
  return String(v === null || v === undefined ? '' : v).split(/[,;\s]+/).map(function (x) { return x.replace(/\.0+$/, '').trim(); }).filter(Boolean);
}

/** Guias de la columna TRACKING de Seller Center ("MXFDD MXFDDWM23097897", "MX-FEDX 545284634491", "12345678 MXFDDWM..."): solo las que se pueden rastrear. */
function rqGuiasTracking_(v) {
  return rqGuias_(v).filter(function (g) { return !!rqPaqDe_(g) || /^iMile/i.test(g); });
}

/** Guias de una venta: ENVIO GUIA (site) y, si el site aun no la tiene, TRACKING (Seller Center). Las de WFS (FULFILLMENT = fulfillment) no: las mueve Walmart. */
function rqGuiasVenta_(envioGuia, tracking, fulfillment) {
  var g = rqGuias_(envioGuia);
  if (g.length) return g;
  if (/^fulfillment$/i.test(String(fulfillment || '').trim())) return [];
  return rqGuiasTracking_(tracking);
}

function rqSinAcentos_(s) {
  var t = String(s === null || s === undefined ? '' : s).toLowerCase();
  try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
  return t;
}

/** Estado final por TEXTO (FedEx, o codigo de BigSmart que no esta en el catalogo). '' = sigue en curso. */
function rqFinalPorTexto_(txt) {
  var t = rqSinAcentos_(txt);
  if (!t) return '';
  if (/robad|stolen/.test(t)) return 'ROBADO';
  if (/extravi|perdid|\blost\b|unable to locate/.test(t)) return 'PERDIDO';
  if (/devuelt|devolucion|regres|retorno|return(ed|ing)?\b.*\b(sender|shipper|remitente)|returned/.test(t)) return 'DEVUELTO';
  if (/cancelad|cancelled|canceled|no desea el envio/.test(t)) return 'CANCELADO CLIENTE';
  if (/\bentregado\b|\bdelivered\b/.test(t) && !/no entregado|not delivered|por entregar|out for delivery/.test(t)) return 'ENTREGADO';
  return '';
}

/**
 * Lo que vio la extension -> que se escribe. r = {paq, eventos:[{cod, txt, fecha, lugar}] (BigSmart: lo mas reciente PRIMERO; FedEx: lo mas reciente AL FINAL), resumen}.
 * Devuelve { final, estatus, evento, codigo, fecha, nuevo (codigo no conocido), codigos (historial) }.
 */
function rqClasificar_(r) {
  var ev = (r && Array.isArray(r.eventos)) ? r.eventos.filter(function (e) { return e && (e.cod || e.txt); }) : [];
  var paq = String(r && r.paq || '');
  var ult = ev.length ? (paq === 'FEDEX' ? ev[ev.length - 1] : ev[0]) : null;
  var out = { final: '', estatus: '', evento: '', codigo: '', fecha: '', nuevo: false, codigos: '', recoleccion: '' };
  // recoleccion: el primer evento con el paquete ya en manos de la paqueteria (BigSmart: despues de 101/108; FedEx: "Picked up")
  var crono = paq === 'FEDEX' ? ev : ev.slice().reverse();
  for (var k = 0; k < crono.length; k++) {
    var ck = String(crono[k].cod || '').trim(), tk = rqSinAcentos_(crono[k].txt);
    if (paq === 'FEDEX' ? /picked up|recolectad/.test(tk) : (/^\d+$/.test(ck) && ck !== '101' && ck !== '108')) { out.recoleccion = String(crono[k].fecha || '').trim(); break; }
  }
  if (!ult) {   // sin historial: lo que diga el resumen de la pagina
    out.final = rqFinalPorTexto_(r && r.resumen);
    out.estatus = out.final ? RQ_ESTATUS[out.final] : (r && r.resumen ? 'En camino (' + String(r.resumen).slice(0, 60) + ')' : '');
    out.evento = String(r && r.resumen || '').slice(0, 120);
    return out;
  }
  var cod = String(ult.cod === null || ult.cod === undefined ? '' : ult.cod).trim();
  out.codigo = cod;
  out.evento = String(ult.txt || '').replace(/\s+/g, ' ').trim().slice(0, 150);
  out.fecha = String(ult.fecha || '').trim().slice(0, 40);
  out.codigos = ev.map(function (e) { return String(e.cod || '').trim(); }).filter(Boolean).join(' ');
  if (paq === 'BIGSMART' && /^\d+$/.test(cod)) {
    var k = RQ_BS[Number(cod)];
    if (k) out.final = k === 'EN CURSO' ? '' : k;
    else { out.nuevo = true; out.final = rqFinalPorTexto_(ult.txt); }   // codigo nuevo: solo se detiene si el texto dice claramente que termino
  } else {
    out.final = rqFinalPorTexto_(ult.txt);
  }
  out.estatus = out.final ? RQ_ESTATUS[out.final] : 'En camino';
  return out;
}

/** true si la guia toca consultarse ahora. f = {final, paq, consulta (ms|0)}. */
function rqToca_(f, ahoraMs) {
  if (String(f.final || '').trim()) return false;
  if (!f.paq) return false;
  var espera = /^REVISAR A MANO/.test(String(f.nota || '')) ? RQ_REINT_MIN * 60000 : RQ_CADA_H * 3600000;   // la que fallo: loop cada 10 min hasta leerla
  return !(f.consulta > 0) || ahoraMs - f.consulta >= espera;
}

/** Cuantas lecturas seguidas lleva sin datos (sale de la Nota "REVISAR A MANO (n seguidas): ..."). */
function rqFallasDe_(nota) {
  var t = String(nota || ''), m = t.match(/^REVISAR A MANO \((\d+) seguidas?\)/);
  return m ? Number(m[1]) : (/^REVISAR A MANO/.test(t) ? 1 : 0);
}

/* ---------------- hoja ---------------- */

function rqMs_(v) { if (v instanceof Date) return v.getTime(); var d = new Date(String(v || '')); return isNaN(d.getTime()) ? 0 : d.getTime(); }

/** Agrega las guias nuevas de Ventas Walmart (ultimos RQ_DIAS dias) y marca las que ya pasaron el plazo. Devuelve {h, t, nuevas, vencidas}. */
function rqSincronizar_() {
  var h = peHojaAsegurar_(RQ_HOJA, RQ_ENC), t = peTabla_(RQ_HOJA) || { pos: {}, filas: [] };
  var ahora = Date.now(), desde = ahora - RQ_DIAS * 86400000;
  var iG = peCol_(t, ['Guia']), ya = {};
  t.filas.forEach(function (f) { var g = String(f[iG] === undefined ? '' : f[iG]).replace(/^'/, '').replace(/\.0+$/, '').trim(); if (g) ya[g] = true; });
  var v = peTabla_(typeof VH_HOJA !== 'undefined' ? VH_HOJA : 'Ventas Walmart'), nuevas = [];
  if (v) {
    var vG = peCol_(v, ['ENVIO GUIA']), vF = peCol_(v, ['FECHA']), v6 = peCol_(v, ['REFERENCIA']), v9 = peCol_(v, ['FOLIO', 'ORDEN ID']);
    var vT = peCol_(v, ['TRACKING']), vFu = peCol_(v, ['FULFILLMENT']);   // 20-nov: 618 ventas traian guia en TRACKING (Seller Center) y no en ENVIO GUIA (site): no se rastreaban
    if ((vG >= 0 || vT >= 0) && vF >= 0) v.filas.forEach(function (f) {
      var fv = rqMs_(f[vF]);
      if (!(fv >= desde)) return;
      rqGuiasVenta_(vG >= 0 ? f[vG] : '', vT >= 0 ? f[vT] : '', vFu >= 0 ? f[vFu] : '').forEach(function (g) {
        if (ya[g]) return;
        ya[g] = true;
        var paq = rqPaqDe_(g);
        nuevas.push({ 'Guia': "'" + g, 'Paqueteria': rqNombrePaq_(paq), 'Orden Walmart (6000)': v6 >= 0 ? "'" + prDigitos_(f[v6]) : '',
                      'Orden de compra (609)': v9 >= 0 ? "'" + prDigitos_(f[v9]) : '', 'Fecha venta': new Date(fv), 'Consultas': 0,
                      'Nota': paq ? '' : 'No se consulta: solo Paqueteria Dedicada Walmart y FedEx' });
      });
    });
  }
  if (nuevas.length) peAgregar_(h, RQ_ENC, nuevas);
  // filas viejas que decian BIGSMART: se renombran una vez a Paqueteria Dedicada Walmart
  var iPq = peCol_(t, ['Paqueteria']);
  if (iPq >= 0) t.filas.forEach(function (f, i) { if (String(f[iPq] || '').trim().toUpperCase() === 'BIGSMART') h.getRange(i + 2, iPq + 1).setValue(RQ_PDW); });
  // las que pasaron el plazo sin estado final: dejan de buscarse
  t = peTabla_(RQ_HOJA);
  var vencidas = 0;
  if (t && t.filas.length) {
    var iE = peCol_(t, ['Estado final']), iFv = peCol_(t, ['Fecha venta']), iA = peCol_(t, ['Accion sugerida']), iP = peCol_(t, ['Paqueteria']);
    if (iE >= 0 && iFv >= 0) t.filas.forEach(function (f, i) {
      if (String(f[iE] || '').trim()) return;
      var fv = rqMs_(f[iFv]);
      if (fv > 0 && fv < desde && rqPaqDe_(String(f[iG]).replace(/^'/, '')) && String(f[iP] || '') !== 'PAQUETERIA DESCONOCIDA') {
        h.getRange(i + 2, iE + 1).setValue(RQ_SIN_FINAL);
        if (iA >= 0) h.getRange(i + 2, iA + 1).setValue(RQ_ACCION[RQ_SIN_FINAL]);
        vencidas++;
      }
    });
  }
  return { h: h, nuevas: nuevas.length, vencidas: vencidas };
}

/** Accion rastreo_lista: las guias que tocan ahora (sin estado final, BigSmart/FedEx, sin consultar en RQ_CADA_H horas), las mas atrasadas primero. */
function rqLista_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: true, guias: [], nota: 'ocupado' };
  try {
    var s = rqSincronizar_();
    if (s.nuevas || s.vencidas) logInfo_(RQ_ETAPA, 'PAQUETERIA: ' + s.nuevas + ' guia(s) nueva(s) de Ventas Walmart' + (s.vencidas ? ', ' + s.vencidas + ' pasaron ' + RQ_DIAS + ' dias sin estado final (dejan de buscarse)' : ''));
    var t = peTabla_(RQ_HOJA);
    if (!t) return { ok: true, guias: [] };
    var iG = peCol_(t, ['Guia']), iE = peCol_(t, ['Estado final']), iC = peCol_(t, ['Fecha consulta']), iN = peCol_(t, ['Nota']), ahora = Date.now();
    var lista = [];
    t.filas.forEach(function (f) {
      var g = String(f[iG] === undefined ? '' : f[iG]).replace(/^'/, '').replace(/\.0+$/, '').trim();
      var x = { guia: g, paq: rqPaqDe_(g), final: iE >= 0 ? f[iE] : '', consulta: iC >= 0 ? rqMs_(f[iC]) : 0, nota: iN >= 0 ? f[iN] : '' };
      if (g && rqToca_(x, ahora)) lista.push(x);
    });
    lista.sort(function (a, b) { return a.consulta - b.consulta; });
    flushLog_();
    return { ok: true, guias: lista.slice(0, RQ_LOTE).map(function (x) { return { guia: x.guia, paq: x.paq }; }), pendientes: lista.length };
  } finally {
    lock.releaseLock();
    // empaque de Odoo FUERA del candado (20-nov): las llamadas a Odoo tardan y dejaban sin candado a los precios
    try { if (typeof rqoEmpaque_ === 'function') rqoEmpaque_(false); } catch (eO) { try { logWarn_(RQ_ETAPA, 'No pude leer el empaque en Odoo: ' + String(eO.message || eO).split('\n')[0]); flushLog_(); } catch (e2) {} }
  }
}

/** Accion rastreo_resultado: p.resultados = [{guia, paq, ok, cf, error, resumen, eventos:[{cod, txt, fecha, lugar}]}]. */
function rqResultado_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var res = Array.isArray(p.resultados) ? p.resultados.slice(0, 40) : [];
  if (!res.length) return { ok: true, escritas: 0 };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'ocupado' };
  try {
    var h = peHojaAsegurar_(RQ_HOJA, RQ_ENC), t = peTabla_(RQ_HOJA);
    if (!t) return { ok: true, escritas: 0 };
    var col = {}; RQ_ENC.forEach(function (e) { col[e] = peCol_(t, [e]); });
    var fila = {}; t.filas.forEach(function (f, i) { var g = String(f[col['Guia']] === undefined ? '' : f[col['Guia']]).replace(/^'/, '').replace(/\.0+$/, '').trim(); if (g) fila[g] = i; });
    var ahora = new Date(), escritas = 0, finales = [], nuevos = {}, revisar = [], reintentos = [], vw = [];
    var poner = function (i, e, v) { if (col[e] >= 0) h.getRange(i + 2, col[e] + 1).setValue(v); };
    res.forEach(function (r) {
      var g = String(r && r.guia || '').replace(/[^0-9A-Za-z]/g, '');
      if (!g || fila[g] === undefined) return;
      var i = fila[g], f = t.filas[i];
      if (String(f[col['Estado final']] || '').trim()) return;   // ya termino: no se toca
      poner(i, 'Fecha consulta', ahora);
      poner(i, 'Consultas', (Number(f[col['Consultas']]) || 0) + 1);
      if (!r.ok || r.cf) {
        var motivo = r.cf ? 'la pagina pidio verificacion ("eres humano")' : String(r.error || 'la pagina no cargo').slice(0, 100);
        var seguidas = rqFallasDe_(f[col['Nota']]) + 1;
        if (!r.cf && /FedEx no encontro la guia/i.test(motivo) && seguidas >= RQ_FEDEX_NOEXISTE) {   // ya no es un error de lectura: FedEx no tiene la guia
          poner(i, 'Nota', 'FedEx no la encuentra (' + seguidas + ' lecturas seguidas)');
          poner(i, 'Estatus real', RQ_ESTATUS['NO EXISTE EN FEDEX']);
          poner(i, 'Estado final', 'NO EXISTE EN FEDEX');
          poner(i, 'Accion sugerida', RQ_ACCION['NO EXISTE EN FEDEX']);
          poner(i, 'Fecha estado final', ahora);
          finales.push({ guia: g, final: 'NO EXISTE EN FEDEX', o609: String(f[col['Orden de compra (609)']] || '').replace(/^'/, '') });
          escritas++;
          return;
        }
        poner(i, 'Nota', 'REVISAR A MANO (' + seguidas + ' seguidas): ' + motivo + ' · se reintenta sola cada ' + RQ_REINT_MIN + ' min');
        escritas++;
        if (!r.cf && seguidas < RQ_FALLAS_ALERTA) { reintentos.push(g + ' (' + seguidas + ')'); return; }   // pasajero: se sigue intentando, sin alerta roja
        // lo que dice Odoo del empaque (RastreoOdoo.gs): si salio de bodega, el reclamo es con la paqueteria
        var iEm = peCol_(t, ['Empaco']), iFe = peCol_(t, ['Fecha empaque']), od = '';
        if (iEm >= 0 && String(f[iEm] || '').trim()) {
          var fe = iFe >= 0 ? f[iFe] : '';
          od = '; en Odoo la empaco ' + f[iEm] + (fe ? ' el ' + (fe instanceof Date ? Utilities.formatDate(fe, 'America/Mexico_City', 'dd-MMM HH:mm') : fe) : '') + ' (salio de bodega)';
        }
        revisar.push(g + ' (' + seguidas + ' lecturas seguidas sin datos: ' + motivo + od + ')');
        return;
      }
      var c = rqClasificar_({ paq: r.paq || rqPaqDe_(g), eventos: r.eventos, resumen: r.resumen });
      poner(i, 'Estatus real', c.estatus);
      poner(i, 'Ultimo evento', c.evento);
      poner(i, 'Codigo evento', c.codigo ? "'" + c.codigo : '');
      poner(i, 'Fecha evento', c.fecha);
      if (c.codigos) poner(i, 'Codigos historial', c.codigos);
      var hist = (Array.isArray(r.eventos) ? r.eventos : []).slice(0, 80).map(function (e) { return { cod: String(e && e.cod || '').slice(0, 10), txt: String(e && e.txt || '').replace(/\s+/g, ' ').slice(0, 160), fecha: String(e && e.fecha || '').slice(0, 40), lugar: String(e && e.lugar || '').slice(0, 60) }; });
      if (hist.length) poner(i, 'Historial', JSON.stringify(hist));
      if (c.recoleccion && !String(f[col['Fecha recoleccion']] || '').trim()) poner(i, 'Fecha recoleccion', rqFecha_(c.recoleccion) || c.recoleccion);
      poner(i, 'Nota', c.nuevo ? 'CODIGO NUEVO ' + c.codigo + ': ' + c.evento : '');
      if (c.nuevo) nuevos[c.codigo] = c.evento;
      if (c.final) {
        poner(i, 'Estado final', c.final);
        poner(i, 'Accion sugerida', RQ_ACCION[c.final] || '');
        poner(i, 'Fecha estado final', ahora);
        if (c.final !== 'ENTREGADO') finales.push({ guia: g, final: c.final, o609: String(f[col['Orden de compra (609)']] || '').replace(/^'/, '') });
      }
      escritas++;
      vw.push({ guia: g, estatus: c.estatus, evento: c.evento, fecha: rqFecha_(c.fecha) || c.fecha, rec: c.recoleccion ? (rqFecha_(c.recoleccion) || c.recoleccion) : '', final: c.final });
    });
    try { rqVentasWalmart_(vw, ahora); } catch (eVw) { logWarn_(RQ_ETAPA, 'No pude poner el estatus de paqueteria en Ventas Walmart: ' + String(eVw.message || eVw).split('\n')[0]); }
    if (typeof extAlertasFijasQuitarSi_ === 'function') extAlertasFijasQuitarSi_(/^rq-(MXFDDWM|\d)/);   // los avisos viejos de una guia por renglon
    var porFinal = {};
    finales.forEach(function (x) {
      logWarn_(RQ_ETAPA, 'Guia ' + x.guia + (x.o609 ? ' (orden ' + x.o609 + ')' : '') + ': ' + x.final + '. ' + (RQ_ACCION[x.final] || ''), x);
      porFinal[x.final] = (porFinal[x.final] || 0) + 1;
    });
    // 20-nov (ella: "el mensaje esta larguisimo, dejalo en un renglon"): UN aviso corto por tipo; el detalle esta en el Log y en PAQUETERIA
    Object.keys(porFinal).forEach(function (f) {
      if (typeof extAlertaFija_ === 'function') extAlertaFija_('rq-final-' + f, porFinal[f] + ' guia(s) ' + f + ': ve PAQUETERIA, filtra Estado final');
    });
    Object.keys(nuevos).forEach(function (k) { try { avisoLogDia_('RQ_COD_' + k, 'WARN', RQ_ETAPA, 'Paqueteria Dedicada Walmart: codigo nuevo ' + k + ' "' + nuevos[k] + '". La guia se sigue buscando; hay que agregarlo al catalogo.'); } catch (e) {} });
    if (reintentos.length) logInfo_(RQ_ETAPA, 'Rastreo: ' + reintentos.length + ' guia(s) no se leyeron esta vez, se reintentan solas en ' + RQ_REINT_MIN + ' min: ' + reintentos.join(', '));
    if (revisar.length) {
      logErr_(RQ_ETAPA, 'Rastreo: ' + revisar.length + ' guia(s) siguen sin leerse despues de intentar ~1 h (se siguen intentando cada ' + RQ_REINT_MIN + ' min): ' + revisar.join(', '));
      if (typeof extAlertaFija_ === 'function') extAlertaFija_('rq-revisar', 'Rastreo: ' + revisar.length + ' guia(s) sin leerse despues de ~1 h de intentos (Nota en PAQUETERIA). Se siguen intentando.');
    }
    if (!revisar.length && !reintentos.length && escritas && typeof extAlertaFijaQuitar_ === 'function') extAlertaFijaQuitar_('rq-revisar');   // ya se leyeron todas: se quita el aviso rojo viejo
    if (escritas) logOk_(RQ_ETAPA, 'Rastreo: ' + escritas + ' guia(s) consultadas' + (finales.length ? ', ' + finales.length + ' con estado final para abrir caso' : ''));
    flushLog_();
    return { ok: true, escritas: escritas, finales: finales.length };
  } finally { lock.releaseLock(); }
}

/** Pone el estatus de la paqueteria en Ventas Walmart (columnas PAQ ..., al final; solo esas celdas). x = [{guia, estatus, evento, fecha, rec, final}]. */
function rqVentasWalmart_(x, ahora) {
  if (!x || !x.length) return 0;
  var h = vdHoja_(typeof VH_HOJA !== 'undefined' ? VH_HOJA : 'Ventas Walmart');
  if (!h || h.getLastRow() < 2) return 0;
  var m = ubicarColumnas_(h, RQ_VW_ENC, 1, { negrita: true, fondo: '#38761d', color: '#ffffff', centro: true });
  var mg = ubicarColumnas_(h, ['ENVIO GUIA'], 1), cG = escrCol_(mg, 'ENVIO GUIA');
  if (!cG) return 0;
  var mt = ubicarColumnas_(h, ['TRACKING', 'FULFILLMENT'], 1), cT = escrCol_(mt, 'TRACKING'), cFu = escrCol_(mt, 'FULFILLMENT'), nF = h.getLastRow() - 1;
  var guias = h.getRange(2, cG, nF, 1).getValues(), trk = cT ? h.getRange(2, cT, nF, 1).getValues() : null, ful = cFu ? h.getRange(2, cFu, nF, 1).getValues() : null, filas = {};
  guias.forEach(function (r, i) { var gs = rqGuiasVenta_(r[0], trk ? trk[i][0] : '', ful ? ful[i][0] : ''); gs.forEach(function (g) { (filas[g] = filas[g] || []).push({ fila: i + 2, varias: gs.length > 1 }); }); });
  var n = 0;
  x.forEach(function (e) {
    (filas[e.guia] || []).forEach(function (f) {
      var pre = f.varias ? e.guia + ': ' : '';
      var val = { 'PAQ ESTATUS': pre + e.estatus, 'PAQ ULTIMO EVENTO': pre + e.evento, 'PAQ FECHA EVENTO': e.fecha, 'PAQ ESTADO FINAL': e.final ? pre + e.final : '', 'PAQ CONSULTADO': ahora };
      if (e.rec) val['PAQ RECOLECCION'] = e.rec;
      Object.keys(val).forEach(function (k) { var c = escrCol_(m, k); if (c) h.getRange(f.fila, c).setValue(val[k]); });
      n++;
    });
  });
  return n;
}
