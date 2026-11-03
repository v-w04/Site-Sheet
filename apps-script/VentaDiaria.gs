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
var VD_LOCK_MS = 20000;              // los modulos de esta cadena esperan hasta 20 s el candado (la otra cadena puede estar corriendo)
var VD_LIBRO_VIEJO = '17S65PqXK1DfJeHloJ4IFt-3K-MnQKOQaN_BiE9RUYaw';   // Venta Diaria Odoo 2026 (solo lectura)
var VD_PROP_CORREO_CVA = 'VC_CORREO_AUTO';   // '1' = el correo diario CVA sale de Site Sheet
var VD_PROP_TRAER = 'VD_TRAER_HECHO';        // pasos de "Traer TODO" ya terminados (JSON)

/* ---------------- utilidades comunes ---------------- */

/**
 * El libro, abierto UNA vez por corrida y con reintento: es grande (70+ hojas) y Google contesta "Se agoto el tiempo
 * de espera del servicio Hojas de calculo" cuando se abre muchas veces seguidas o mientras corre otro proceso pesado.
 */
var VD_LIBRO = null;
function vdLibro_() {
  if (VD_LIBRO) return VD_LIBRO;
  VD_LIBRO = kdReintentar_(function () { return SpreadsheetApp.getActiveSpreadsheet() || getSpreadsheet_(); });
  return VD_LIBRO;
}
/**
 * Corre un paso COMPLETO otra vez si Google contesta "Se agoto el tiempo de espera" en cualquier punto (no solo al
 * leer o escribir). Los pasos de esta familia son idempotentes: repetirlos da el mismo resultado. 3 intentos con
 * espera de 20 s y 40 s. Si no es un tiempo de espera, el error sale igual.
 */
function vdIntentar_(fn) {
  var ult;
  for (var i = 1; i <= 3; i++) {
    try { return fn(); }
    catch (e) {
      ult = e;
      if (!/tiempo de espera|timed out|timeout|Service Spreadsheets|servicio Hojas/i.test(String(e && e.message || e)) || i === 3) throw e;
      try { logWarn_(VD_ETAPA, 'Google tardo de mas (intento ' + i + ' de 3); lo vuelvo a intentar solo en ' + (20 * i) + ' s'); flushLog_(); } catch (x) {}
      VD_LIBRO = null;                                  // se vuelve a abrir el libro
      Utilities.sleep(20000 * i);
    }
  }
  throw ult;
}

/** reescribirHoja_ con reintento (es idempotente: si Google tarda, se vuelve a escribir igual). */
function vdEscribir_(h, enc, filas, opts) {
  try { vdRenombrar_(h); } catch (e) {}
  var r = kdReintentar_(function () { return reescribirHoja_(h, enc, filas, opts); });
  try { SpreadsheetApp.flush(); } catch (e) {}
  return r;
}
/**
 * Encabezados que se acortaron: antes de escribir, el encabezado viejo se renombra EN SU LUGAR (la columna, sus datos,
 * tu formato y tu ancho se quedan). Si ya existe el nuevo, no se toca nada.
 */
var VD_RENOMBRAR = {
  'Ventas killers mes en curso': { 'CUPON ACUMULADO DEL MES': 'CUPON ACUM', 'COMO SE UBICO EL KILLER': 'KILLER POR' },
  'Ventas killers historico': { 'CUPON ACUMULADO DEL MES': 'CUPON ACUM', 'COMO SE UBICO EL KILLER': 'KILLER POR' }
};
function vdRenombrar_(h) {
  var mapa = VD_RENOMBRAR[h.getName()];
  if (!mapa || h.getLastColumn() < 1) return 0;
  var enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); }), n = 0;
  Object.keys(mapa).forEach(function (viejo) {
    var i = enc.indexOf(viejo);
    if (i >= 0 && enc.indexOf(mapa[viejo]) < 0) { h.getRange(1, i + 1).setValue(mapa[viejo]); enc[i] = mapa[viejo]; n++; }
  });
  return n;
}

/**
 * Textos largos que ya quedaron escritos en las hojas (de antes de acortarlos): se cambian UNA vez por el texto corto.
 * [hoja, columna, viejo, nuevo, esRegex]. Lo corre Ordenar (vdAplicarFormatos_). Marca: VD_TEXTOS_V1.
 */
var VD_TEXTOS = [
  ['Ventas killers historico', 'KILLER POR', 'RANGO (antes de la primera foto)', 'RANGO'],
  ['Ventas killers historico', 'KILLER POR', '^FOTO ', '', true],
  ['Ventas killers historico', 'NOTA', 'La orden trae varios productos: revisar el precio', 'Varios productos'],
  ['Ventas killers historico', 'NOTA', 'Se vendio a otro precio que el negociado', 'Otro precio'],
  ['Ventas Walmart', 'NOTAS PRECIO', 'La orden trae varios productos: el precio del site es de toda la orden', 'Varios productos: precio de la orden'],
  ['Casos Walmart', 'MOTIVO', 'El precio queda en $0 en Walmart (bug de Walmart): enviar correo y abrir caso', 'Precio $0 en Walmart (bug)'],
  ['Casos Walmart', 'MOTIVO', '^Walmart cobró distinto a lo debido', 'Cobro distinto', true],
  ['Casos Walmart', 'MOTIVO', ' cobrados de más', ' de más', true],
  ['Casos Walmart', 'MOTIVO', ' pedido\\(s\\)', ' ped.', true]
];
function vdTextosCortos_() {
  if (vdProp_('VD_TEXTOS_V1') === '1') return 0;
  var ss = vdLibro_(), n = 0;
  VD_TEXTOS.forEach(function (t) {
    var h = ss.getSheetByName(t[0]);
    if (!h || h.getLastRow() < 2) return;
    try { vdRenombrar_(h); } catch (e) {}
    var enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); }), c = enc.indexOf(t[1]);
    if (c < 0) return;
    var f = h.getRange(2, c + 1, h.getLastRow() - 1, 1).createTextFinder(t[2]);
    if (t[4]) f.useRegularExpression(true); else f.matchEntireCell(true);
    n += f.replaceAllWith(t[3]);
  });
  vdSetProp_('VD_TEXTOS_V1', '1');
  if (n) logInfo_('VENTA_DIARIA', 'Textos largos acortados en las hojas: ' + n + ' celdas');
  return n;
}

/** Hoja del libro (la crea si falta), con reintento. */
function vdHoja_(nombre) {
  return kdReintentar_(function () { var ss = vdLibro_(); return ss.getSheetByName(nombre) || ss.insertSheet(nombre); });
}

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

/**
 * Trigger: todo lo de ventas y precios que venia de Venta Diaria.
 * Google corta una corrida a los 6 min sin avisar. Por eso:
 *  - antes de empezar cada modulo se calcula si alcanza (lo que tardo la ultima vez, VD_DUR_<modulo>); si no, se deja;
 *  - lo que se dejo (o se corto) va PRIMERO en la siguiente hora (VD_CADENA_PEND), asi ninguno se queda sin correr;
 *  - si un modulo se corto a media corrida (quedo marcado en VD_CORRIENDO), se avisa en el Log.
 */
var VD_TOPE_MS = 330 * 1000;   // margen antes de los 6 min de Google
function ventasProgramado() {
  var t0 = Date.now(), saltados = [], props = PropertiesService.getScriptProperties();
  var modulos = {
    'ventas walmart': ventasHistoricoProgramado_, 'ventas cva': ventasCvaProgramado_, 'precios erroneos': preciosErroneosProgramado_,
    'ventas killers': vkProgramado_, 'killers activos': kaProgramado_, 'exportar': exProgramado_, 'formatos': function () { vdAplicarFormatos_(); }
  };
  var orden = Object.keys(modulos), pend = [];
  try { pend = JSON.parse(props.getProperty('VD_CADENA_PEND') || '[]'); } catch (e) {}
  pend = pend.filter(function (k) { return modulos[k]; });
  orden = pend.concat(orden.filter(function (k) { return pend.indexOf(k) < 0; }));
  var cortado = props.getProperty('VD_CORRIENDO');
  if (cortado) {
    var cx = cortado.split('|');
    props.setProperty('VD_DUR_' + cx[0], String(VD_TOPE_MS));   // la proxima vez corre con todo el tiempo
    logWarn_(VD_ETAPA, 'Corrida de ventas: "' + cx[0] + '" se corto por tiempo (6 min). Va primero en esta vuelta.');
    if (orden.indexOf(cx[0]) > 0) { orden.splice(orden.indexOf(cx[0]), 1); orden.unshift(cx[0]); }
  }
  orden.forEach(function (k, i) {
    var est = Number(props.getProperty('VD_DUR_' + k) || 45000), usado = Date.now() - t0;
    // el primero siempre corre (si no, uno lento nunca correria); los demas solo si alcanzan
    if (i > 0 && (saltados.length || usado + est > VD_TOPE_MS)) { saltados.push(k); return; }
    props.setProperty('VD_CORRIENDO', k + '|' + Date.now());
    var ti = Date.now();
    try { modulos[k](); } catch (e) { console.log(k + ': ' + e.message); }
    props.setProperty('VD_DUR_' + k, String(Math.max(Date.now() - ti, 5000)));
    props.deleteProperty('VD_CORRIENDO');
  });
  props.setProperty('VD_CADENA_PEND', JSON.stringify(saltados));
  if (saltados.length) avisoDia_('vd-cadena-tope', 'INFO', VD_ETAPA, 'Corrida de ventas: sin tiempo para ' + saltados.join(', ') + '; van primero en la proxima hora.');
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
    ['cva',     'Pedidos CVA (historico)',                         function () { var r = vcTraerHistorico_(); try { vcResumen_(); } catch (e) {} return r; }],
    ['listas',  'Precio libre, SKU asignados, killers y alertas',  peTraerDeVentaDiaria_],
    ['casos',   'Casos Walmart',                                    cawTraerDeVentaDiaria_],
    ['vars',    'Precios variaciones',                              exTraerVariacionesDeVd_]
  ];
  try {
    pasos.forEach(function (p) {
      if (hecho[p[0]]) { lineas.push('• ' + p[1] + ': ya estaba copiado'); return; }
      if (Date.now() - t0 > 240000) { faltan.push(p[1]); return; }
      try {
        var r = vdIntentar_(p[2]);
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

/* ---------------- formatos de las hojas de esta familia ---------------- */

/*
 * Formato de cada columna del script en las hojas de ventas, killers y precios. Se aplica cada hora (barato: una
 * llamada por columna) y solo donde la celda trae un formato "de fabrica" o uno puesto por error (fechas como mm-dd-yy,
 * $ en columnas que no son dinero). Si tu le pones otro formato a mano, se respeta.
 */
var VD_FMT = { F: 'dd/MM/yyyy HH:mm', D: 'dd/MM/yyyy', $: '$#,##0.00', $0: '$#,##0', P: '0.0%', N: '0', T: '@' };
var VD_FORMATOS = {
  'Ventas Walmart': { 'FECHA': 'F', 'CREADO': 'F', 'ACTUALIZADO': 'F', 'MES': 'mmmm yyyy', 'PRECIO': '$', 'PRECIO UNITARIO': '$', 'PIEZAS': 'N', 'ITEMS': 'N',
    'ENVIO N GUIAS': 'N', 'ENVIO PASO': 'N', 'ENVIO PAQUETERIA': 'T', 'MINIMO APLICADO': '$', 'DIFERENCIA $': '$', 'DIFERENCIA %': 'P', 'REVISADO PRECIO': 'F' },
  'Pedidos CVA': { 'Fecha creación': 'F', 'Cantidad': 'N', 'Precio unitario': '$', 'Importe línea': '$', 'Total orden': '$' },
  'Alertas de precio': { 'FECHA ALERTA': 'F', 'FECHA VENTA': 'F', 'CANTIDAD': 'N', 'PRECIO VENTA': '$', 'MINIMO': '$', 'DIFERENCIA': '$', 'DIFERENCIA %': 'P' },
  'Killers historico': { 'INICIO': 'F', 'FIN': 'F', 'FOTO': 'F', 'REGISTRADO': 'F', 'PRECIO NEGOCIADO': '$', 'CUPON': '$', 'PRECIO ACTUAL': '$', 'RECIBIMOS': '$', 'COMISION CUPON': 'P', 'COMISION MSI': 'P' },
  'Casos Walmart': { 'FECHA ABIERTO': 'D', 'FECHA CIERRE': 'D' },
  'Precios variaciones': { 'PRECIO': '$', 'ACTUALIZADO': 'F' },
  'Precio libre': { 'HASTA (opcional)': 'D' },
  'Sobreventa WFS': { 'Fecha programada': 'F', 'FECHA VENTA': 'F', 'ACTUALIZADO': 'F', 'REVISADO': 'F', 'STOCK WFS': 'N', 'EN TRASLADO': 'N', 'Qty demandada': 'N', 'Qty realizada': 'N' }
};
var VD_FMT_MALOS = ['', 'General', 'mm-dd-yy', 'm/d/yy', 'M/d/yyyy', '0.###############', 'yyyy-mm-dd h:mm:ss', 'yyyy-mm-dd hh:mm', 'yyyy-mm-dd'];

/** Aplica VD_FORMATOS. Devuelve cuantas columnas cambio. */
function vdAplicarFormatos_() {
  var ss = vdLibro_(), n = 0;
  try { vdTextosCortos_(); } catch (e) { logWarn_('VENTA_DIARIA', 'Textos cortos: ' + String(e.message).split('\n')[0]); }
  Object.keys(VD_FORMATOS).forEach(function (hoja) {
    var h = ss.getSheetByName(hoja);
    if (!h || h.getLastRow() < 2) return;
    var enc = kdReintentar_(function () { return h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0]; });
    var filas = h.getLastRow() - 1;
    Object.keys(VD_FORMATOS[hoja]).forEach(function (e) {
      var i = -1;
      enc.forEach(function (x, k) { if (i < 0 && normEnc_(x) === normEnc_(e)) i = k; });
      if (i < 0) return;
      var quiero = VD_FMT[VD_FORMATOS[hoja][e]] || VD_FORMATOS[hoja][e];
      var actual = String(h.getRange(2, i + 1).getNumberFormat() || '');
      var esDinero = /\$/.test(quiero), malo = VD_FMT_MALOS.indexOf(actual) >= 0 || (!esDinero && /\$/.test(actual));
      if (actual === quiero || !malo) return;
      kdReintentar_(function () { h.getRange(2, i + 1, filas, 1).setNumberFormat(quiero); });
      n++;
    });
  });
  if (n) logInfo_(VD_ETAPA, 'Formato de columnas puesto en las hojas de ventas, killers y precios: ' + n + ' columna(s)');
  return n;
}
