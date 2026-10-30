/**
 * ============================================================
 *  Republicar — TODO lo que hay que publicar de nuevo, en una sola hoja
 * ============================================================
 *
 *  Hoja "Republicar": una fila por PUBLICACION NUEVA que quieres en Walmart. Sirve para:
 *    CATEGORIA MAL · COBRO DISTINTO · FECHA VENCIDA · UPC O GTIN AJENO · MAS PRESENCIA (otra publicacion del mismo
 *    SKU base) · OTRO.  Es historial: NADA se borra ni se bloquea solo.
 *
 *  Entran de tres formas:
 *   - Solos (una sola vez por SKU, se recuerda en REPUBLICAR_VISTOS: si borras la fila no vuelve):
 *       . todo SKU de la hoja "Cobro distinto"                      (MOTIVO = COBRO DISTINTO)
 *       . todo SKU con DECISION = REPUBLICAR en "Estado Killers"     (MOTIVO = CATEGORIA MAL; tambien los que quedan
 *         asi por tener su categoria en REPUBLICAR en KAMS Departamentos)
 *   - A mano: escribes SKU VIEJO (el SKU base o uno que ya existe) y MOTIVO en una fila nueva.
 *   - MAS PRESENCIA: escribe COPIAS = 3 y se arman 3 filas (cada una con su propio SKU nuevo).
 *
 *  SKU NUEVO: si lo dejas vacio el script lo propone: SIEMPRE el SKU base con el siguiente consecutivo libre.
 *     Premium (termina en -MSI):  X-MSI -> X-MSI-2 -> X-MSI-3 ...        Clasica:  X -> X-2 -> X-3 ... (hasta -99)
 *  Mira Walmart, Bloqueados y la propia hoja para no repetir. Lo puedes cambiar a mano. Los -OB / -OPENBOX no se
 *  proponen. CATEGORIA NUEVA y UPC O GTIN AJENO son notas tuyas (el Publicador usa la categoria).
 *
 *  Tres estados, todos automaticos:
 *    PENDIENTE    el SKU NUEVO todavia no aparece en la hoja "Walmart".
 *    REPUBLICADO  el SKU NUEVO ya aparece (FECHA REPUBLICADO y el ESTATUS que trae Walmart): falta bloquear el viejo.
 *    CERRADO      el SKU VIEJO ya aparece en la hoja "Bloqueados" (lo que bloqueas en el dashboard): nada mas que hacer.
 *  Las de MAS PRESENCIA no bloquean el viejo, asi que se quedan en REPUBLICADO. La hoja se ordena sola:
 *  REPUBLICADO arriba (te falta bloquear), luego PENDIENTE, y CERRADO al fondo. DIAS AHI cuenta desde FECHA ENTRADA
 *  (se congela al republicarse). El script nunca bloquea ni borra: los viejos los bloqueas TU en el dashboard.
 *
 *  Corre despues de cada bajada de la hoja Walmart (wmWalmartBajar) y a mano desde el menu.
 *  Todas las columnas se buscan por encabezado.
 */

var REP_HOJA   = 'Republicar';
var REP_ETAPA  = 'REPUBLICAR';
var REP_ENC    = ['SKU VIEJO', 'SKU NUEVO', 'ESTADO', 'DIAS AHI', 'MOTIVO', 'ORIGEN', 'FECHA ENTRADA', 'FECHA REPUBLICADO', 'ESTATUS NUEVO', 'NOTA', 'CATEGORIA NUEVA', 'UPC O GTIN AJENO', 'COPIAS', 'FECHA CERRADO'];
var REP_MOTIVOS = ['CATEGORIA MAL', 'COBRO DISTINTO', 'FECHA VENCIDA', 'UPC O GTIN AJENO', 'MAS PRESENCIA', 'OTRO'];
var REP_PEND   = 'PENDIENTE';
var REP_LISTO  = 'REPUBLICADO';
var REP_CERRADO = 'CERRADO';
var REP_ORI_CD = 'COBRO DISTINTO';
var REP_ORI_MAN = 'MANUAL';
var REP_ORI_ESTADO = 'ESTADO KILLERS';
var REP_ORI_CATEGORIA = 'CATEGORIA REPUBLICAR';
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
  try {
    var mm = colsHoja_(h, ['MOTIVO']);
    h.getRange(2, mm.MOTIVO + 1, Math.max(h.getMaxRows() - 1, 1), 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(REP_MOTIVOS, true).setAllowInvalid(true).build());
  } catch (e) {}
  return h;
}

/** Lista en ESTADO y colores (PENDIENTE amarillo, REPUBLICADO verde, CERRADO gris). */
function repReglas_(h) {
  try {
    var m = colsHoja_(h, ['ESTADO']);
    var col = m.ESTADO + 1, L = colLetra_(col), rango = h.getRange(2, col, Math.max(h.getMaxRows() - 1, 1), 1);
    if (h.getConditionalFormatRules().length !== 3) {
      h.setConditionalFormatRules([
        SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + L + '2="' + REP_LISTO + '"').setBackground('#b6d7a8').setFontColor('#274e13').setRanges([rango]).build(),
        SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + L + '2="' + REP_PEND + '"').setBackground('#ffe599').setFontColor('#7f6000').setRanges([rango]).build(),
        SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + L + '2="' + REP_CERRADO + '"').setBackground('#d9d9d9').setFontColor('#666666').setRanges([rango]).build()
      ]);
    }
    rango.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([REP_PEND, REP_LISTO, REP_CERRADO], true).setAllowInvalid(true).build());
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

/**
 * Siguiente SKU libre para republicar: el SKU base con el siguiente consecutivo.
 * Premium (termina en -MSI o -MSI-n): base-MSI-2, -MSI-3 ...   Clasica: base-2, -3 ... (hasta 99).
 * `tomados` = { SKU EN MAYUSCULAS: true } con todo lo que ya existe o ya esta pendiente (se le agrega el propuesto).
 * Devuelve '' si no se puede proponer (vacio, -OB / -OPENBOX o ya llego a 99).
 */
function repSiguienteSku_(sku, tomados) {
  var s = String(sku === null || sku === undefined ? '' : sku).trim();
  if (!s) return '';
  var u = s.toUpperCase();
  if (/-(OB|OPENBOX)(-|$)/.test(u)) return '';
  var prem = /-MSI(-([2-9]|[1-9]\d))?$/.test(u);
  var base = prem ? s.replace(/-MSI(-([2-9]|[1-9]\d))?$/i, '') : s.replace(/-([2-9]|[1-9]\d)$/, '');
  var pref = (base + (prem ? '-MSI-' : '-')).toUpperCase();
  var max = 1;
  Object.keys(tomados).forEach(function (k) {
    if (k.indexOf(pref) !== 0) return;
    var resto = k.substring(pref.length);
    if (/^\d{1,2}$/.test(resto) && +resto > max) max = +resto;
  });
  if (max >= 99) return '';
  var nuevo = base + (prem ? '-MSI-' : '-') + (max + 1);
  tomados[nuevo.toUpperCase()] = true;
  return nuevo;
}

function repActualizarCon_() {
  var ss = getSpreadsheet_();
  var hoy = hoy_();
  var h = repHoja_();
  var m = colsHoja_(h, REP_ENC.slice(0, 8), ['ESTATUS NUEVO', 'NOTA', 'CATEGORIA NUEVA', 'UPC O GTIN AJENO', 'COPIAS', 'FECHA CERRADO']);
  var nC = h.getLastColumn();
  var n = Math.max(h.getLastRow() - 1, 0);
  var vals = n ? h.getRange(2, 1, n, nC).getValues() : [];
  var nExist = vals.length;
  var cVi = m['SKU VIEJO'], cNu = m['SKU NUEVO'];

  // --- lo que ya esta en la hoja ---
  var existentes = {};
  vals.forEach(function (f) {
    var vi = repNorm_(f[cVi]), nu = repNorm_(f[cNu]);
    if (vi) existentes[vi] = true;
    if (nu) existentes[nu] = true;
  });

  // --- lo que hay en Walmart y en Bloqueados (para no repetir SKU y para saber cuando ya aparecio) ---
  var walmart = null, tomados = {};
  var hW = ss.getSheetByName(WD_HOJA);
  if (hW && hW.getLastRow() >= 2) {
    var mw = colsHoja_(hW, ['SKU'], ['ESTATUS']);
    walmart = {};
    hW.getRange(2, 1, hW.getLastRow() - 1, hW.getLastColumn()).getValues().forEach(function (f) {
      var k = repNorm_(f[mw.SKU]);
      if (k) { walmart[k] = mw.ESTATUS >= 0 ? String(f[mw.ESTATUS] || '') : ''; tomados[k] = true; }
    });
  }
  var bloq = {}, hB = ss.getSheetByName(WD_HOJA_BLOQ);
  if (hB && hB.getLastRow() >= 2) {
    var mb = colsHoja_(hB, ['SKU']);
    hB.getRange(2, 1, hB.getLastRow() - 1, hB.getLastColumn()).getValues().forEach(function (f) {
      var k = repNorm_(f[mb.SKU]); if (k) { tomados[k] = true; bloq[k] = true; }
    });
  }
  Object.keys(existentes).forEach(function (k) { tomados[k] = true; });

  // --- 1) entran solos (una sola vez por SKU): Cobro distinto y los marcados REPUBLICAR en Estado Killers ---
  var nuevosFilas = [];
  var vistos = {};
  try { JSON.parse(PropertiesService.getScriptProperties().getProperty(REP_PROP_VISTOS) || '[]').forEach(function (s) { vistos[s] = true; }); } catch (e) { vistos = {}; }
  var cambioVistos = false;
  var hC = ss.getSheetByName(CD_HOJA);
  if (hC && hC.getLastRow() >= 2) {
    var mc = colsHoja_(hC, ['SKU'], ['CAUSA']);
    hC.getRange(2, 1, hC.getLastRow() - 1, hC.getLastColumn()).getValues().forEach(function (f) {
      var sku = String(f[mc.SKU] || '').trim(), k = repNorm_(sku);
      if (!k || existentes[k] || vistos[k]) return;
      vistos[k] = true; cambioVistos = true; existentes[k] = true;
      nuevosFilas.push({ sku: sku, motivo: 'COBRO DISTINTO', origen: REP_ORI_CD, nota: mc.CAUSA >= 0 ? String(f[mc.CAUSA] || '') : '' });
    });
  }
  var hE = ss.getSheetByName(PAR_HOJA_ESTADO);
  if (hE && hE.getLastRow() >= 2) {
    var me = colsHoja_(hE, ['SKU'], ['DECISION', 'DEPARTAMENTO', 'CATEGORIA', 'NOTA']);
    if (me.DECISION >= 0) hE.getRange(2, 1, hE.getLastRow() - 1, hE.getLastColumn()).getValues().forEach(function (f) {   // sin DECISION = formato anterior: nada que meter
      if (normEnc_(f[me.DECISION]) !== PAR_REPUBLICAR) return;
      var sku = String(f[me.SKU] || '').trim(), k = repNorm_(sku);
      if (!k || existentes[k] || vistos[k]) return;
      vistos[k] = true; cambioVistos = true; existentes[k] = true;
      var dc = (me.DEPARTAMENTO >= 0 ? String(f[me.DEPARTAMENTO] || '') : '') + (me.CATEGORIA >= 0 && f[me.CATEGORIA] ? ' / ' + f[me.CATEGORIA] : '');
      var porCat = (me.NOTA >= 0 && String(f[me.NOTA] || '').indexOf(PAR_NOTA_AUTO) === 0);
      nuevosFilas.push({ sku: sku, motivo: 'CATEGORIA MAL', origen: porCat ? REP_ORI_CATEGORIA : REP_ORI_ESTADO, nota: dc });
    });
  }
  if (cambioVistos) PropertiesService.getScriptProperties().setProperty(REP_PROP_VISTOS, JSON.stringify(Object.keys(vistos)));
  nuevosFilas.forEach(function (x) {
    var fila = new Array(nC).fill('');
    fila[cVi] = x.sku; fila[m['MOTIVO']] = x.motivo; fila[m['ORIGEN']] = x.origen;
    if (m.NOTA >= 0) fila[m.NOTA] = x.nota;
    vals.push(fila);
  });

  // --- 2) COPIAS > 1: una fila por cada publicacion que quieres (cada una con su SKU nuevo) ---
  var copiasCreadas = 0;
  if (m.COPIAS >= 0) {
    var hasta = vals.length;
    for (var i = 0; i < hasta; i++) {
      var f0 = vals[i], cp = parseInt(f0[m.COPIAS], 10);
      if (!(cp > 1) || !repNorm_(f0[cVi]) || repNorm_(f0[m.ESTADO]) === REP_LISTO || repNorm_(f0[m.ESTADO]) === REP_CERRADO) continue;
      cp = Math.min(cp, 20);
      for (var j = 1; j < cp; j++) {
        var cl = f0.slice();
        cl[cNu] = ''; cl[m.ESTADO] = ''; cl[m['DIAS AHI']] = ''; cl[m['FECHA ENTRADA']] = ''; cl[m['FECHA REPUBLICADO']] = '';
        if (m['ESTATUS NUEVO'] >= 0) cl[m['ESTATUS NUEVO']] = '';
        cl[m.COPIAS] = 1;
        vals.push(cl); copiasCreadas++;
      }
      f0[m.COPIAS] = 1;
    }
  }
  var nTotal = vals.length;

  // --- 3) SKU NUEVO propuesto: el SKU base con el siguiente consecutivo libre ---
  var propuestos = 0, sinPropuesta = [];
  vals.forEach(function (f) {
    var vi = String(f[cVi] || '').trim();
    if (!vi || repNorm_(f[cNu]) || repNorm_(f[m.ESTADO]) === REP_LISTO || repNorm_(f[m.ESTADO]) === REP_CERRADO) return;
    var s = repSiguienteSku_(vi, tomados);
    if (s) { f[cNu] = s; propuestos++; } else sinPropuesta.push(vi);
  });

  // --- 4) estados: PENDIENTE -> REPUBLICADO (el nuevo ya esta en Walmart) -> CERRADO (el viejo ya esta en Bloqueados) ---
  var republicados = [], cerrados = [], pendientes = 0, listos = 0, nCerrados = 0, masViejo = null;
  var cEst = m.ESTADO, cOri = m.ORIGEN, cFe = m['FECHA ENTRADA'], cFr = m['FECHA REPUBLICADO'], cDias = m['DIAS AHI'], cEn = m['ESTATUS NUEVO'], cFc = m['FECHA CERRADO'];
  vals.forEach(function (f) {
    var vi = repNorm_(f[cVi]), nu = repNorm_(f[cNu]);
    if (!vi && !nu) return;
    var est = repNorm_(f[cEst]);
    if (!est) { est = REP_PEND; f[cEst] = REP_PEND; }
    if (!String(f[cOri] || '').trim()) f[cOri] = REP_ORI_MAN;
    if (!repDia_(f[cFe])) f[cFe] = hoy;
    var diaEntrada = repDia_(f[cFe]);

    if (est === REP_PEND && nu && nu !== vi && walmart && (nu in walmart)) {
      est = REP_LISTO; f[cEst] = REP_LISTO; f[cFr] = hoy;
      if (cEn >= 0) f[cEn] = walmart[nu];
      republicados.push((vi || '(sin SKU viejo)') + ' → ' + String(f[cNu]).trim());
    }
    if ((est === REP_LISTO || est === REP_CERRADO) && !repDia_(f[cFr])) f[cFr] = hoy;
    if (est === REP_LISTO && vi && bloq[vi] && cFc >= 0) {
      est = REP_CERRADO; f[cEst] = REP_CERRADO; f[cFc] = hoy;
      cerrados.push(String(f[cVi]).trim());
    }

    var fin = (est === REP_LISTO || est === REP_CERRADO) ? repDia_(f[cFr]) : hoy;
    f[cDias] = repDiasEntre_(diaEntrada, fin);
    if (est === REP_CERRADO) nCerrados++;
    else if (est === REP_LISTO) listos++;
    else {
      pendientes++;
      if (!masViejo || f[cDias] > masViejo.dias) masViejo = { sku: String(f[cVi] || f[cNu]).trim(), dias: f[cDias] };
    }
  });

  // --- 5) ordenar (REPUBLICADO arriba, luego PENDIENTE, CERRADO al fondo) y escribir todo el bloque ---
  var rango = function (e) { e = repNorm_(e); return e === REP_LISTO ? 0 : e === REP_CERRADO ? 2 : 1; };
  var indexado = vals.map(function (f, i) { return { f: f, i: i }; });
  indexado.sort(function (a, b) {
    var ra = rango(a.f[cEst]), rb = rango(b.f[cEst]);
    if (ra !== rb) return ra - rb;
    var da = Number(a.f[cDias]) || 0, db = Number(b.f[cDias]) || 0;
    if (ra !== 2 && da !== db) return db - da;      // los que llevan mas dias, primero
    return a.i - b.i;
  });
  vals = indexado.map(function (x) { return x.f; });
  if (nTotal) {
    if (h.getMaxRows() < nTotal + 1) h.insertRowsAfter(h.getMaxRows(), nTotal + 1 - h.getMaxRows());
    var esFecha = {}; [cFe, cFr, cFc].forEach(function (c) { if (c !== undefined && c >= 0) esFecha[c] = true; });
    for (var c = 0; c < nC; c++) {
      var col = vals.map(function (f) {
        var v = f[c];
        return [esFecha[c] ? repFechaCelda_(repDia_(v)) : (v === undefined || v === null ? '' : v)];
      });
      var rg = h.getRange(2, c + 1, nTotal, 1);
      if (c === cVi || c === cNu) rg.setNumberFormat('@');
      rg.setValues(col);
      if (esFecha[c]) rg.setNumberFormat('yyyy-mm-dd');
    }
  }

  // --- 6) Log ---
  var res = { nuevos: nuevosFilas.length, copias: copiasCreadas, propuestos: propuestos, republicados: republicados.length, cerrados: cerrados.length, pendientes: pendientes, listos: listos, nCerrados: nCerrados, sinPropuesta: sinPropuesta };
  if (nuevosFilas.length) logOk_(REP_ETAPA, 'Republicar: entraron ' + nuevosFilas.length + ' SKU (Cobro distinto / REPUBLICAR en Estado Killers): ' + nuevosFilas.map(function (x) { return x.sku; }).join(', '), { skus: nuevosFilas });
  if (copiasCreadas) logOk_(REP_ETAPA, 'Republicar: ' + copiasCreadas + ' filas nuevas por COPIAS');
  if (propuestos) logOk_(REP_ETAPA, 'Republicar: ' + propuestos + ' SKU NUEVO propuestos (siguiente consecutivo del SKU base)');
  if (sinPropuesta.length) avisoDia_('rep-sinprop:' + sinPropuesta.join(','), 'WARN', REP_ETAPA, 'Republicar: no pude proponer SKU NUEVO para ' + sinPropuesta.join(', ') + ' (-OB / -OPENBOX o ya llego al -99); escribelo a mano.');   // 1 vez al dia por lista (antes salia cada 15 min)
  if (republicados.length) logOk_(REP_ETAPA, 'Republicar: ' + republicados.length + ' ya aparecen en Walmart (REPUBLICADO): ' + republicados.join(' | '), { skus: republicados });
  if (cerrados.length) logOk_(REP_ETAPA, 'Republicar: ' + cerrados.length + ' CERRADOS (el SKU viejo ya esta bloqueado): ' + cerrados.join(' | '), { skus: cerrados });
  if (!walmart) logWarn_(REP_ETAPA, 'Republicar: la hoja Walmart esta vacia o no existe; hoy no se pudo revisar si ya aparecieron los SKU nuevos.');
  logLatido_(REP_ETAPA, 'Republicar al dia', { pendientes: pendientes, republicados: listos, cerrados: nCerrados, masViejo: masViejo });
  flushLog_();
  return res;
}

/** Menu: actualizar ahora y mostrar el resultado. */
function republicarActualizar() {
  var ui = SpreadsheetApp.getUi();
  toast_('Actualizando Republicar...', 'REPUBLICAR', 30);
  try {
    var r = repActualizar_();
    if (r.omitido) { alertLog_(ui, 'Republicar', 'Otra corrida tiene el libro ocupado. Intenta en un minuto; no se corrio nada doble.', ui.ButtonSet.OK); return; }
    alertLog_(ui, 'Republicar',
      'Entraron solos (Cobro distinto / REPUBLICAR): ' + r.nuevos + '\n' +
      'Filas nuevas por COPIAS: ' + r.copias + '\n' +
      'SKU NUEVO propuestos: ' + r.propuestos + '\n' +
      'Pasaron a REPUBLICADO: ' + r.republicados + '\n' +
      'Pasaron a CERRADO (viejo ya bloqueado): ' + r.cerrados + '\n\n' +
      'PENDIENTES (el nuevo aun no aparece): ' + r.pendientes + '\n' +
      'REPUBLICADOS (falta bloquear el viejo): ' + r.listos + '\n' +
      'CERRADOS: ' + r.nCerrados +
      (r.sinPropuesta.length ? '\n\nSin propuesta (escribe el SKU NUEVO tu): ' + r.sinPropuesta.join(', ') : '') + '\n\n' +
      'El SKU NUEVO se propone solo (SKU base + siguiente consecutivo); puedes cambiarlo en la hoja ' + REP_HOJA + '.', ui.ButtonSet.OK);
  } catch (e) {
    try { logErr_(REP_ETAPA, 'Republicar fallo: ' + String(e.message || e).split('\n')[0]); flushLog_(); } catch (x) {}
    alertLog_(ui, 'Fallo', String(e.message || e).split('\n')[0], ui.ButtonSet.OK);
  }
}
