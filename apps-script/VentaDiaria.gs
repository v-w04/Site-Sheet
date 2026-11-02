/**
 * ============================================================
 *  VentaDiaria — lo que se trajo de "Venta Diaria Odoo" a Site Sheet
 * ============================================================
 *
 *  Una sola fuente: ventas Walmart (site), ventas CVA (Odoo), precios erroneos, Killers activos, Comparar Walmart,
 *  Casos Walmart y EXPORTAR / MINIMO / MAXIMO viven aqui. Venta Diaria Odoo solo se LEE (para copiar su historico una vez).
 *
 *  Corrida automatica: ventasProgramado (cada hora, trigger aparte de killersProgramado para que ninguna cadena se quede
 *  sin tiempo). Orden: ventas Walmart -> ventas CVA -> precios erroneos -> ventas con killer -> Killers activos + Comparar + Casos -> EXPORTAR.
 *  Cada modulo en su try/catch: si uno falla, los demas siguen. Todo resultado va a la hoja Log.
 *
 *  Menu (📥 Traer de Venta Diaria): "Traer TODO de Venta Diaria (una vez)" copia, sin duplicar, lo que habia alla:
 *  Pedidos CVA, precio libre, SKU asignados, killers historico, alertas, casos y precios variaciones. Es reanudable.
 *
 *  Correo CVA: mientras Venta Diaria siga con sus activadores, el correo automatico de aqui esta APAGADO (dos remitentes
 *  = correos repetidos). Se enciende con el menu "Pasar el correo CVA a Site Sheet" despues de quitar los activadores
 *  de Venta Diaria.
 * ============================================================
 */

var VD_ETAPA = 'VENTA_DIARIA';
var VD_CADENA_MS = 270 * 1000;
var VD_LOCK_MS = 20000;              // los modulos de esta cadena esperan hasta 20 s el candado (la otra cadena puede estar corriendo)
var VD_LIBRO_VIEJO = '17S65PqXK1DfJeHloJ4IFt-3K-MnQKOQaN_BiE9RUYaw';   // Venta Diaria Odoo 2026 (solo lectura)
var VD_PROP_CORREO_CVA = 'VC_CORREO_AUTO';   // '1' = el correo diario CVA sale de Site Sheet
var VD_PROP_TRAER = 'VD_TRAER_HECHO';        // pasos de "Traer TODO" ya terminados (JSON)

/* ---------------- utilidades comunes ---------------- */

function vdProp_(k, def) { var v = null; try { v = props_().getProperty(k); } catch (e) {} return (v === null || v === '') ? (def === undefined ? '' : def) : v; }
function vdSetProp_(k, v) { try { props_().setProperty(k, String(v)); } catch (e) {} }

/**
 * "Corrio bien, sin cambios": una fila FINISH en el Log cada 2 h como maximo por proceso, para que la hoja Salud
 * sepa que sigue vivo aunque no haya nada nuevo (las corridas con cambios ya escriben su OK).
 */
function vdLatido_(etapa, msg, d) {
  var k = 'VD_LATIDO_' + etapa, ult = Number(vdProp_(k, '0'));
  if (Date.now() - ult < 2 * 3600000) return;
  vdSetProp_(k, String(Date.now()));
  logRow_('FINISH', etapa, msg, d);
}

/** Formato de numero en una columna del script: si la celda ya trae un formato tuyo se respeta y se extiende. */
function vdFormato_(h, m, enc, n, fmt) {
  var c = escrCol_(m, enc);
  if (!c || !n) return;
  var actual = String(h.getRange(m.filaDatos || 2, c).getNumberFormat() || '');
  var usar = (!actual || actual === 'General' || actual === '0.###############') ? fmt : actual;
  h.getRange(m.filaDatos || 2, c, n, 1).setNumberFormat(usar);
}

/** Porcentaje: 0.1, "10%", "10" -> 0.10 */
function vdPct_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v === 'number') return v > 1 ? v / 100 : v;
  var s = String(v).replace('%', '').trim(), n = Number(s);
  if (isNaN(n) || s === '') return '';
  return (String(v).indexOf('%') >= 0 || n > 1) ? n / 100 : n;
}

/** Killers bajo minimo (del site): { skus:{SKU:{perdida(%), minimo, cat}}, tope(%) }. */
function vdBajoMinimo_() {
  var tope = 3;
  try { tope = Number(props_().getProperty('BAJO_MIN_PERDIDA')) || 3; } catch (e) {}
  var out = { skus: {}, n: 0, tope: tope }, t = peTabla_(PE_HOJA_BAJO);
  if (!t) return out;
  var iS = peCol_(t, ['SKU WALMART', 'SKU']), iF = peCol_(t, ['FALTA']), iM = peCol_(t, ['MINIMO']), iCk = peCol_(t, ['CATEGORIA KAM']), iC = peCol_(t, ['CATEGORIA']), iP = -1;
  t.enc.forEach(function (x, i) { if (iP < 0 && normEnc_(x).indexOf('PERDIDA') >= 0) iP = i; });
  if (iS < 0) return out;
  t.filas.forEach(function (f) {
    var s = peSku_(f[iS]); if (!s) return;
    var mn = iM < 0 ? 0 : peNum_(f[iM]), fal = iF < 0 ? 0 : peNum_(f[iF]), per = NaN;
    if (mn > 0 && iF >= 0) per = fal / mn * 100;
    else if (iP >= 0) { per = peNum_(f[iP]); if (per <= 1 && String(f[iP]).indexOf('%') < 0) per = per * 100; }
    if (isNaN(per)) return;
    var cat = iCk >= 0 && f[iCk] ? String(f[iCk]) : (iC >= 0 ? String(f[iC] || '') : '');
    out.skus[s] = { perdida: per, minimo: mn, cat: cat };
    out.n++;
  });
  return out;
}

/** Cobro distinto (del site): { SKU:{pesos, pedidos, causa} }. */
function vdCobroDistinto_() {
  var out = {}, t = peTabla_(CD_HOJA);
  if (!t) return out;
  var iS = peCol_(t, ['SKU']), iP = peCol_(t, ['PESOS']), iN = peCol_(t, ['PEDIDOS']), iC = peCol_(t, ['CAUSA']);
  if (iS < 0) return out;
  t.filas.forEach(function (f) {
    var s = peSku_(f[iS]); if (!s) return;
    out[s] = { pesos: iP < 0 ? '' : f[iP], pedidos: iN < 0 ? '' : f[iN], causa: iC < 0 ? '' : f[iC] };
  });
  return out;
}

/** Publicaciones de Walmart (hojas Walmart y Bloqueados de este libro): { mapa:{SKU:{...}}, skus:[SKU tal cual] }. */
function vdWalmart_() {
  var out = { mapa: {}, skus: [], n: 0 };
  [[WD_HOJA, false], [WD_HOJA_BLOQ, true]].forEach(function (x) {
    var t = peTabla_(x[0]); if (!t) return;
    var iS = peCol_(t, ['SKU']), iD = peCol_(t, ['DEPARTAMENTO']), iP = peCol_(t, ['PRECIO']), iE = peCol_(t, ['ESTATUS']), iW = peCol_(t, ['WFS']), iM = peCol_(t, ['INV NORMAL']), iC = peCol_(t, ['CATEGORIA']), iN = peCol_(t, ['NOMBRE']);
    if (iS < 0) return;
    t.filas.forEach(function (f) {
      var raw = f[iS];
      if (raw === '' || raw === null) return;
      var s = peSku_(raw);
      if (out.mapa[s]) return;
      out.skus.push(typeof raw === 'number' ? raw : String(raw).trim());
      out.mapa[s] = {
        precio: iP < 0 ? 0 : peNum_(f[iP]), estado: iE < 0 ? '' : String(f[iE] || ''),
        stock: (iW < 0 ? 0 : peNum_(f[iW])) + (iM < 0 ? 0 : peNum_(f[iM])),
        shelf: iD < 0 ? '' : String(f[iD] || ''), tipoProd: iC < 0 ? '' : String(f[iC] || ''),
        nombre: iN < 0 ? '' : String(f[iN] || ''), bloqueado: x[1]
      };
      out.n++;
    });
  });
  return out;
}

/** KAM de cada SKU segun Estado Killers: { SKU: KAM }. */
function vdKamPorSku_() {
  var out = {}, t = peTabla_(PAR_HOJA_ESTADO);
  if (!t) return out;
  var iS = peCol_(t, ['SKU']), iK = peCol_(t, ['KAM']);
  if (iS < 0 || iK < 0) return out;
  t.filas.forEach(function (f) { var s = peSku_(f[iS]); if (s && f[iK]) out[s] = String(f[iK]); });
  return out;
}

/* ---------------- corrida automatica (cada hora) ---------------- */

/** Trigger: todo lo de ventas y precios que venia de Venta Diaria. */
function ventasProgramado() {
  var t0 = Date.now(), saltados = [];
  var modulos = [
    ['ventas walmart',   ventasHistoricoProgramado_],
    ['ventas cva',       ventasCvaProgramado_],
    ['precios erroneos', preciosErroneosProgramado_],
    ['ventas killers',   vkProgramado_],
    ['killers activos',  kaProgramado_],
    ['exportar',         exProgramado_]
  ];
  modulos.forEach(function (m) {
    if (saltados.length || Date.now() - t0 > VD_CADENA_MS) { saltados.push(m[0]); return; }
    try { m[1](); } catch (e) { console.log(m[0] + ': ' + e.message); }
  });
  if (saltados.length) {
    avisoDia_('vd-cadena-tope', 'WARN', VD_ETAPA, 'Corrida de ventas: se acabo el tiempo (~4.5 min); se saltaron: ' + saltados.join(', ') + '. Siguen en la proxima hora.');
  }
  try { flushLog_(); } catch (x) {}
}

/* ---------------- correo CVA: un solo remitente ---------------- */

/** ¿El correo diario CVA sale de Site Sheet? (apagado mientras Venta Diaria siga mandandolo) */
function vdCorreoCvaActivo_() { return vdProp_(VD_PROP_CORREO_CVA) === '1'; }

/** Menu: pasa el correo CVA a Site Sheet. Lo de antes de hoy a las 8 am ya lo mando Venta Diaria: se marca como avisado. */
function ventasCvaPasarCorreo() {
  try {
    var H = vcHoja_(), n = H.h.getLastRow(), cF = escrCol_(H.m, 'Fecha creación'), marca = 1;
    var corte = new Date(); corte.setHours(VC_HORA_REPORTE, 0, 0, 0);
    if (new Date() < corte) corte = new Date(corte.getTime() - 86400000);
    if (n > 1 && cF) {
      var fechas = H.h.getRange(2, cF, n - 1, 1).getValues();
      for (var i = 0; i < fechas.length; i++) {
        var d = fechas[i][0] instanceof Date ? fechas[i][0] : vcFecha_(fechas[i][0]);
        if (d instanceof Date && d < corte) marca = i + 2;
      }
    }
    vdSetProp_(VC_PROP_AVISADA, String(marca));
    vdSetProp_(VD_PROP_CORREO_CVA, '1');
    var txt = 'Desde hoy el correo diario CVA (8 am, a ' + VC_CORREO + ') sale de Site Sheet.\n\n' +
      'Marque como ya avisadas las ventas hasta el ' + Utilities.formatDate(corte, TZ, 'dd/MM HH:mm') + ' (las mando Venta Diaria).\n\n' +
      '⚠ Quita los activadores de Venta Diaria Odoo (Extensiones > Apps Script > Activadores) si no lo has hecho, o llegaran dos correos.';
    logOk_(VC_ETAPA, 'Correo CVA pasado a Site Sheet', { filaAvisada: marca });
    flushLog_();
    dlgInfo_('Correo CVA', txt, 'ok');
  } catch (e) {
    logErr_(VC_ETAPA, 'No pude pasar el correo CVA: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    dlgInfo_('Correo CVA', 'No pude pasar el correo: ' + String(e.message).split('\n')[0], 'error');
  }
}

/* ---------------- traer TODO de Venta Diaria (una vez, reanudable) ---------------- */

/** Menu: copia todo lo de Venta Diaria en pasos; los terminados no se repiten. */
function ventaDiariaTraerTodo() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(90000)) { dlgInfo_('Traer de Venta Diaria', 'Otra corrida tiene el candado. Espera un minuto y vuelve a correr esta misma opcion.', 'aviso'); return; }
  var hecho = {}, t0 = Date.now(), lineas = [], faltan = [];
  try { hecho = JSON.parse(vdProp_(VD_PROP_TRAER) || '{}'); } catch (e) { hecho = {}; }
  var pasos = [
    ['cva',     'Pedidos CVA (historico)',                         vcTraerHistorico_],
    ['listas',  'Precio libre, SKU asignados, killers y alertas',  peTraerDeVentaDiaria_],
    ['casos',   'Casos Walmart',                                    cawTraerDeVentaDiaria_],
    ['vars',    'Precios variaciones',                              exTraerVariacionesDeVd_]
  ];
  try {
    pasos.forEach(function (p) {
      if (hecho[p[0]]) { lineas.push('• ' + p[1] + ': ya estaba copiado'); return; }
      if (Date.now() - t0 > 240000) { faltan.push(p[1]); return; }
      try {
        var r = p[2]();
        hecho[p[0]] = ahora_();
        vdSetProp_(VD_PROP_TRAER, JSON.stringify(hecho));
        lineas.push('• ' + p[1] + ': ' + r);
      } catch (e) {
        lineas.push('• ' + p[1] + ': ❌ ' + String(e.message).split('\n')[0]);
        faltan.push(p[1]);
      }
    });
    var txt = 'Copie de Venta Diaria Odoo (solo la lei, sin duplicar):\n\n' + lineas.join('\n') +
      (faltan.length ? '\n\n⚠ Faltan: ' + faltan.join(', ') + '. Vuelve a correr esta misma opcion: no se pierde nada ni se duplica.' : '\n\nListo: ya no hace falta volver a correrla.');
    (faltan.length ? logWarn_ : logOk_)(VD_ETAPA, 'Traer de Venta Diaria: ' + lineas.join(' · '));
    flushLog_();
    dlgInfo_('Traer de Venta Diaria', txt, faltan.length ? 'aviso' : 'ok');
  } finally { lock.releaseLock(); }
}
