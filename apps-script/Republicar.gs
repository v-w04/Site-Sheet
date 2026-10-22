/**
 * ============================================================
 *  Republicar — SKUs que hay que republicar con otro SKU
 * ============================================================
 *
 *  Hoja "Republicar": una fila por SKU que se republica (fecha de fin vencida, categoria incorrecta /
 *  cobro distinto, etc.). Es historial: NADA se borra ni se bloquea solo.
 *
 *  Entran de dos formas:
 *   - Solos: todo SKU que aparezca en la hoja "Cobro distinto" (ORIGEN = COBRO DISTINTO). Cada SKU entra una
 *     sola vez (se recuerda en REPUBLICAR_VISTOS): si borras la fila no vuelve a entrar.
 *   - A mano: escribes SKU VIEJO (y MOTIVO) en una fila nueva; el script llena ESTADO, ORIGEN y FECHA ENTRADA.
 *
 *  Tu escribes el SKU NUEVO. Cuando ese SKU aparece en la hoja "Walmart" (la bajada del dashboard) la fila pasa
 *  de PENDIENTE a REPUBLICADO, con FECHA REPUBLICADO y el ESTATUS que trae Walmart. DIAS AHI cuenta los dias
 *  desde FECHA ENTRADA (se congela al republicarse). Los que llevan mucho tiempo los bloqueas TU a mano en el
 *  dashboard de Walmart y borras la fila: el script nunca bloquea.
 *
 *  Corre despues de cada bajada de la hoja Walmart (wmWalmartBajar) y a mano desde el menu.
 *  Todas las columnas se buscan por encabezado.
 */

var REP_HOJA   = 'Republicar';
var REP_ETAPA  = 'REPUBLICAR';
var REP_ENC    = ['SKU VIEJO', 'SKU NUEVO', 'ESTADO', 'DIAS AHI', 'MOTIVO', 'ORIGEN', 'FECHA ENTRADA', 'FECHA REPUBLICADO', 'ESTATUS NUEVO', 'NOTA'];
var REP_PEND   = 'PENDIENTE';
var REP_LISTO  = 'REPUBLICADO';
var REP_ORI_CD = 'COBRO DISTINTO';
var REP_ORI_MAN = 'MANUAL';
var REP_PROP_VISTOS = 'REPUBLICAR_VISTOS';

function repNorm_(s) { return String(s === null || s === undefined ? '' : s).trim().toUpperCase(); }

/** Fecha (Date o 'yyyy-MM-dd...') -> 'yyyy-MM-dd' o ''. */
function repDia_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var t = String(v === null || v === undefined ? '' : v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.substring(0, 10) : '';
}

/** Dias entre dos 'yyyy-MM-dd' (0 si falta alguno). */
function repDiasEntre_(desde, hasta) {
  if (!desde || !hasta) return '';
  var a = desde.split('-'), b = hasta.split('-');
  var d = Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
  return d < 0 ? 0 : d;
}

function repFechaCelda_(dia) { return dia ? Utilities.parseDate(dia, TZ, 'yyyy-MM-dd') : ''; }

/** Crea la hoja si no existe y agrega los encabezados que falten (a la derecha). Devuelve la hoja. */
function repHoja_() {
  var h = getHoja_(REP_HOJA);
  var nC = Math.max(1, h.getLastColumn());
  var enc = h.getLastRow() >= 1 ? h.getRange(1, 1, 1, nC).getValues()[0] : [];
  var tiene = {};
  enc.forEach(function (e) { var k = normEnc_(e); if (k) tiene[k] = true; });
  var faltan = REP_ENC.filter(function (e) { return !tiene[normEnc_(e)]; });
  if (faltan.length) {
    var vacia = !enc.some(function (e) { return String(e || '').trim(); });
    var col = vacia ? 1 : h.getLastColumn() + 1;
    h.getRange(1, col, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
    if (vacia) h.setFrozenRows(1);
  }
  repReglas_(h);
  return h;
}

/** Lista en ESTADO y colores (una sola vez; si ya hay reglas no toca nada). */
function repReglas_(h) {
  try {
    if (h.getConditionalFormatRules().length) return;
    var m = colsHoja_(h, ['ESTADO']);
    var col = m.ESTADO + 1, L = colLetra_(col), rango = h.getRange(2, col, Math.max(h.getMaxRows() - 1, 1), 1);
    h.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + L + '2="' + REP_LISTO + '"').setBackground('#b6d7a8').setFontColor('#274e13').setRanges([rango]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + L + '2="' + REP_PEND + '"').setBackground('#ffe599').setFontColor('#7f6000').setRanges([rango]).build()
    ]);
    rango.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([REP_PEND, REP_LISTO], true).setAllowInvalid(true).build());
  } catch (e) {
    try { logWarn_(REP_ETAPA, 'No se pudo poner el formato de Republicar: ' + String(e.message || e).split('\n')[0]); } catch (x) {}
  }
}

/**
 * Hace todo: llena filas a mano, agrega los de Cobro distinto, marca REPUBLICADO los que ya aparecen en Walmart
 * y recalcula DIAS AHI. Devuelve { omitido, nuevos, republicados, pendientes, listos }.
 */
function repActualizar_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) return { omitido: true, motivo: 'ocupado' };
  try { return repActualizarCon_(); } finally { lock.releaseLock(); }
}

function repActualizarCon_() {
  var ss = getSpreadsheet_();
  var hoy = hoy_();
  var h = repHoja_();
  var m = colsHoja_(h, REP_ENC.slice(0, 8), ['ESTATUS NUEVO', 'NOTA']);
  var nC = h.getLastColumn();
  var n = Math.max(h.getLastRow() - 1, 0);
  var vals = n ? h.getRange(2, 1, n, nC).getValues() : [];

  // --- lo que ya esta en la hoja ---
  var existentes = {}, hayFilas = [];
  vals.forEach(function (f) {
    var vi = repNorm_(f[m['SKU VIEJO']]), nu = repNorm_(f[m['SKU NUEVO']]);
    if (vi) existentes[vi] = true;
    if (nu) existentes[nu] = true;
  });

  // --- 1) los de Cobro distinto entran solos (una sola vez por SKU) ---
  var nuevosFilas = [];
  var hC = ss.getSheetByName(CD_HOJA);
  if (hC && hC.getLastRow() >= 2) {
    var mc = colsHoja_(hC, ['SKU'], ['CAUSA']);
    var cd = hC.getRange(2, 1, hC.getLastRow() - 1, hC.getLastColumn()).getValues();
    var vistos = {};
    try { JSON.parse(PropertiesService.getScriptProperties().getProperty(REP_PROP_VISTOS) || '[]').forEach(function (s) { vistos[s] = true; }); } catch (e) { vistos = {}; }
    var cambioVistos = false;
    cd.forEach(function (f) {
      var sku = String(f[mc.SKU] || '').trim(), k = repNorm_(sku);
      if (!k || existentes[k] || vistos[k]) return;
      vistos[k] = true; cambioVistos = true; existentes[k] = true;
      nuevosFilas.push({ sku: sku, motivo: mc.CAUSA >= 0 ? String(f[mc.CAUSA] || '') : '' });
    });
    if (cambioVistos) PropertiesService.getScriptProperties().setProperty(REP_PROP_VISTOS, JSON.stringify(Object.keys(vistos)));
  }
  nuevosFilas.forEach(function (x) {
    var fila = new Array(nC).fill('');
    fila[m['SKU VIEJO']] = x.sku; fila[m['MOTIVO']] = x.motivo; fila[m['ORIGEN']] = REP_ORI_CD;
    vals.push(fila);
  });
  var nTotal = vals.length;

  // --- 2) lo que aparece en la hoja Walmart ---
  var walmart = null, hW = ss.getSheetByName(WD_HOJA);
  if (hW && hW.getLastRow() >= 2) {
    var mw = colsHoja_(hW, ['SKU'], ['ESTATUS']);
    walmart = {};
    hW.getRange(2, 1, hW.getLastRow() - 1, hW.getLastColumn()).getValues().forEach(function (f) {
      var k = repNorm_(f[mw.SKU]);
      if (k) walmart[k] = mw.ESTATUS >= 0 ? String(f[mw.ESTATUS] || '') : '';
    });
  }

  // --- 3) recorrer filas ---
  var republicados = [], pendientes = 0, listos = 0, masViejo = null;
  var cEst = m.ESTADO, cOri = m.ORIGEN, cFe = m['FECHA ENTRADA'], cFr = m['FECHA REPUBLICADO'], cDias = m['DIAS AHI'], cEn = m['ESTATUS NUEVO'];
  vals.forEach(function (f) {
    var vi = repNorm_(f[m['SKU VIEJO']]), nu = repNorm_(f[m['SKU NUEVO']]);
    if (!vi && !nu) return;
    var est = repNorm_(f[cEst]);
    if (!est) { est = REP_PEND; f[cEst] = REP_PEND; }
    if (!String(f[cOri] || '').trim()) f[cOri] = REP_ORI_MAN;
    if (!repDia_(f[cFe])) f[cFe] = hoy;
    var diaEntrada = repDia_(f[cFe]);

    if (est !== REP_LISTO && nu && nu !== vi && walmart && (nu in walmart)) {
      est = REP_LISTO; f[cEst] = REP_LISTO; f[cFr] = hoy;
      if (cEn >= 0) f[cEn] = walmart[nu];
      republicados.push((vi || '(sin SKU viejo)') + ' → ' + String(f[m['SKU NUEVO']]).trim());
    }
    if (est === REP_LISTO && !repDia_(f[cFr])) f[cFr] = hoy;

    var fin = est === REP_LISTO ? repDia_(f[cFr]) : hoy;
    f[cDias] = repDiasEntre_(diaEntrada, fin);
    if (est === REP_LISTO) listos++;
    else {
      pendientes++;
      if (!masViejo || f[cDias] > masViejo.dias) masViejo = { sku: String(f[m['SKU VIEJO']] || f[m['SKU NUEVO']]).trim(), dias: f[cDias] };
    }
  });

  // --- 4) escribir solo las columnas del script (por encabezado) ---
  if (nTotal) {
    var cols = [cEst, cDias, cOri, cFe, cFr].concat(cEn >= 0 ? [cEn] : []);
    cols.forEach(function (c) {
      var col = vals.map(function (f) {
        var v = f[c];
        return [(c === cFe || c === cFr) ? repFechaCelda_(repDia_(v)) : (v === undefined || v === null ? '' : v)];
      });
      var r = h.getRange(2, c + 1, nTotal, 1);
      r.setValues(col);
      if (c === cFe || c === cFr) r.setNumberFormat('yyyy-mm-dd');
    });
    if (nuevosFilas.length) {
      // SKU VIEJO y MOTIVO solo en las filas nuevas (el resto lo escribe el usuario)
      var ini = nTotal - nuevosFilas.length;
      var cv = m['SKU VIEJO'], cm = m['MOTIVO'];
      h.getRange(2 + ini, cv + 1, nuevosFilas.length, 1).setNumberFormat('@').setValues(nuevosFilas.map(function (x) { return [x.sku]; }));
      h.getRange(2 + ini, cm + 1, nuevosFilas.length, 1).setValues(nuevosFilas.map(function (x) { return [x.motivo]; }));
    }
  }

  // --- 5) Log ---
  var res = { nuevos: nuevosFilas.length, republicados: republicados.length, pendientes: pendientes, listos: listos };
  if (nuevosFilas.length) logOk_(REP_ETAPA, 'Republicar: entraron ' + nuevosFilas.length + ' SKU de Cobro distinto: ' + nuevosFilas.map(function (x) { return x.sku; }).join(', '), { skus: nuevosFilas });
  if (republicados.length) logOk_(REP_ETAPA, 'Republicar: ' + republicados.length + ' ya aparecen en Walmart (REPUBLICADO): ' + republicados.join(' | '), { skus: republicados });
  if (!walmart) logWarn_(REP_ETAPA, 'Republicar: la hoja Walmart esta vacia o no existe; hoy no se pudo revisar si ya aparecieron los SKU nuevos.');
  logLatido_(REP_ETAPA, 'Republicar al dia', { pendientes: pendientes, republicados: listos, masViejo: masViejo });
  flushLog_();
  return res;
}

/** Menu: actualizar ahora y mostrar el resultado. */
function republicarActualizar() {
  var ui = SpreadsheetApp.getUi();
  toast_('Actualizando Republicar...', 'REPUBLICAR', 30);
  try {
    var r = repActualizar_();
    if (r.omitido) { ui.alert('Republicar', 'Otra corrida tiene el libro ocupado. Intenta en un minuto.', ui.ButtonSet.OK); return; }
    ui.alert('Republicar',
      'Entraron de Cobro distinto: ' + r.nuevos + '\n' +
      'Pasaron a REPUBLICADO: ' + r.republicados + '\n\n' +
      'Pendientes: ' + r.pendientes + '\n' +
      'Republicados (historial): ' + r.listos + '\n\n' +
      'El SKU NUEVO lo escribes tu en la hoja ' + REP_HOJA + '.', ui.ButtonSet.OK);
  } catch (e) {
    try { logErr_(REP_ETAPA, 'Republicar fallo: ' + String(e.message || e).split('\n')[0]); flushLog_(); } catch (x) {}
    ui.alert('Fallo', String(e.message || e).split('\n')[0], ui.ButtonSet.OK);
  }
}
