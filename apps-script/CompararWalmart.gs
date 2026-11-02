/**
 * ============================================================
 *  Comparar Walmart — Killers activos contra el precio real de Walmart (traido de Venta Diaria Odoo)
 * ============================================================
 *
 *  Hoja "Comparar Walmart": por cada SKU de Killers activos, lo que Walmart tiene publicado (hoja Walmart de este libro,
 *  que baja el dashboard cada 15 min) contra el MINIMO. Solo lee: no toca Killers activos.
 *    - MINIMO APLICABLE: el de Precios EM / CVA Minimo; si el SKU esta en Killers bajo minimo, el minimo que reporta el site.
 *    - ENTRA = precio en Walmart + cupon (el cupon lo paga Walmart).  % VS MINIMO = (ENTRA - minimo) / minimo.
 *    - DECISION con dos cortes (menu: Configurar bandas): OK · DEJAR (hasta 3% abajo) · REVISAR KAM (3% a 10%) ·
 *      CAMBIO / QUITAR (mas de 10%). Ademas: NO PUBLICADO EN WALMART, SIN MINIMO, OK (PRECIO LIBRE).
 *    - PROBLEMA / ACCION SUGERIDA: precio $0, SYSTEM_PROBLEM, despublicado con stock, precio distinto a la carga...
 *      Los que piden caso pasan a "Casos Walmart" si el error dura 12 h o mas (CasosWalmart.gs).
 *  Hoja "Categoria revisar": killers cuya categoria del KAM no coincide con el departamento de Walmart.
 *  Se reescriben solo si cambio el resultado. Corre cada hora despues de Killers activos.
 * ============================================================
 */

var CW_HOJA = 'Comparar Walmart', CW_ETAPA = 'COMPARAR';
var CW_ENC = ['SKU', 'TIPO', 'KAM', 'DECISIÓN', '% VS MÍNIMO', 'ENTRA (PRECIO + CUPÓN)', 'MÍNIMO APLICABLE',
              'PRECIO EN WALMART', 'CARGA (LO QUE PUBLICAS)', 'DIFERENCIA vs CARGA', 'AVISO',
              'ESTADO EN WALMART', 'STOCK WALMART', 'PRODUCTO', 'PROBLEMA', 'ACCIÓN SUGERIDA', 'CASO WALMART'];
var CW_BANDA1_DEF = 3, CW_BANDA2_DEF = 10;
var CW_COLOR = { 'CAMBIO / QUITAR': '#e06666', 'REVISAR KAM': '#f9cb9c', 'DEJAR': '#fff2cc', 'OK': '#d9ead3', 'OK (PRECIO LIBRE)': '#d9ead3' };

var CR_HOJA = 'Categoria revisar';
var CR_ENC = ['SKU', 'KAM', 'DEPARTAMENTO EN WALMART', 'TIPO DE PRODUCTO EN WALMART', 'ESTADO', '% PERDIDA (site)', 'PRODUCTO'];
var CR_ESPERADA = {
  'FOTOGRAFIA': ['FOTOGRAFIA'], 'CAMARAS Y LENTES': ['FOTOGRAFIA'], 'CAMARAS': ['FOTOGRAFIA'], 'AUDIO': ['AUDIO'],
  'COMPUTACION': ['COMPUTADORAS'], 'TABLETS': ['COMPUTADORAS'], 'HARDWARE': ['COMPUTADORAS'], 'VIDEOJUEGOS': ['VIDEOJUEGOS']
};

/** Cortes de las bandas en % positivos (3 = "hasta 3% abajo del minimo"). */
function cwBandas_() {
  var b1 = Number(vdProp_('CW_BANDA1', String(CW_BANDA1_DEF))), b2 = Number(vdProp_('CW_BANDA2', String(CW_BANDA2_DEF)));
  if (!(b1 > 0) || !(b2 > b1)) { b1 = CW_BANDA1_DEF; b2 = CW_BANDA2_DEF; }
  return { b1: b1, b2: b2 };
}

function cwTextoConteo_(c) {
  return 'OK ' + c.OK + ' · DEJAR ' + c.DEJAR + ' · REVISAR KAM ' + c.REVISAR + ' · CAMBIO / QUITAR ' + c.CAMBIO +
    ' · sin minimo ' + c.SINMIN + ' · no publicados ' + c.NOPUB;
}

/** Videojuegos: el killer se compara contra la publicacion PREMIUM real (nunca se inventa el sufijo). */
function cwPremiumVj_(sku, wm) {
  var premium = peTipo_(sku) === 'PREMIUM';
  if (premium && wm[sku] && wm[sku].precio > 0) return { sku: sku, aviso: '' };
  var base = peBase_(sku), cands = Object.keys(wm).filter(function (k) {
    return k !== sku && peTipo_(k) === 'PREMIUM' && wm[k].precio > 0 && peBase_(k) === base;
  });
  if (!premium && cands.length === 1) return { sku: cands[0], aviso: 'Videojuegos: el killer venia sin MSI, se tomo ' + cands[0] };
  if (cands.length) return { sku: sku, aviso: 'Videojuegos: el killer dice ' + sku + ' y Walmart tiene ' + cands.join(', ') };
  return { sku: sku, aviso: '' };
}

/** Diagnostico contra Walmart: { problema, accion, caso(bool), detalle }. */
function cwDiagnostico_(w, wp, carga, dif) {
  var R = function (p, a, c, d) { return { problema: p, accion: a, caso: !!c, detalle: d || '' }; };
  if (!w) return R('NO ESTÁ EN WALMART', 'Revisar en seller center si el SKU cambió o se perdió; abrir caso si no aparece', true);
  var st = normEnc_(w.estado), stock = Number(w.stock) || 0;
  if (w.bloqueado) return R('BLOQUEADO (ya identificado)', 'Nada que hacer: está en tu lista de bloqueados', false);
  if (!(w.precio > 0)) return R('PRECIO EN $0 EN WALMART', 'Walmart muestra precio 0 aunque está publicado: escribir a Walmart / abrir caso', true, 'precio en Walmart $0');
  if (st === 'SYSTEM_PROBLEM') return R('SYSTEM_PROBLEM EN WALMART', 'Error de sistema de Walmart: abrir caso', true, 'estado SYSTEM_PROBLEM');
  if (st === 'UNPUBLISHED' || st === 'RETIRED') {
    if (stock > 0) return R('DESPUBLICADO CON STOCK', 'Revisar en seller center: puede haber vencido la fecha final de exposición; ponerle una más lejana', false);
    return R('SIN STOCK (DESPUBLICADO)', 'Sin stock: normal', false);
  }
  if (Math.abs(dif) >= 1) return R('PRECIO DISTINTO A LA CARGA', 'Walmart no refleja lo que cargaste: revisa que subiste EXPORTAR y los killers; si sigue igual, abrir caso', true, 'Walmart ' + wp + ' vs carga ' + carga);
  return R('', '', false);
}

/**
 * Compara (pura, sin hojas): objs de Killers activos, wm = mapa de vdWalmart_, bm = vdBajoMinimo_, libres, casos, bandas.
 * Devuelve { out:[filas en orden CW_ENC], cont, errores:[{sku, producto, tipo, detalle}] }.
 */
function cwCalcular_(objs, wm, bm, libres, casos, bd) {
  var cont = { OK: 0, DEJAR: 0, REVISAR: 0, CAMBIO: 0, SINMIN: 0, NOPUB: 0 }, out = [], errores = [];
  objs.forEach(function (k) {
    var sku = k.sku, carga = k.negoc, min = k.min || 0, cupon = k.cupon || 0;
    var eBm = bm.skus[sku];
    if (eBm && eBm.minimo > 0) min = eBm.minimo;
    var avisoVj = '', skuWm = sku;
    if (/VIDEOJUEGO/.test(normEnc_(k.kam))) { var rv = cwPremiumVj_(sku, wm); skuWm = rv.sku; avisoVj = rv.aviso; }
    var w = wm[skuWm], dec, pct = '', entra = '', dif = '', aviso = '', wp = '';
    if (!w || !(w.precio > 0)) {
      dec = 'NO PUBLICADO EN WALMART'; cont.NOPUB++;
      aviso = w ? 'Walmart tiene el precio en 0' : 'No está en la hoja Walmart';
      wp = w ? w.precio : '';
    } else {
      wp = w.precio; entra = wp + cupon; dif = wp - carga;
      if (!(min > 0)) { dec = 'SIN MÍNIMO'; cont.SINMIN++; }
      else {
        pct = (entra - min) / min;
        var baja = -pct * 100;
        if (baja <= 0.05) { dec = 'OK'; cont.OK++; }
        else if (libres[peBase_(sku)]) { dec = 'OK (PRECIO LIBRE)'; cont.OK++; }
        else if (baja <= bd.b1) { dec = 'DEJAR'; cont.DEJAR++; }
        else if (baja <= bd.b2) { dec = 'REVISAR KAM'; cont.REVISAR++; }
        else { dec = 'CAMBIO / QUITAR'; cont.CAMBIO++; }
      }
      if (Math.abs(dif) >= 1) aviso = wp > carga ? 'Walmart más alto que tu Carga' : 'Walmart más bajo que tu Carga';
    }
    if (avisoVj) aviso = avisoVj + (aviso ? ' · ' + aviso : '');
    var dg = cwDiagnostico_(w, wp, carga, dif);
    if (dg.caso) errores.push({ sku: sku, producto: k.detalles, tipo: dg.problema, detalle: dg.detalle });
    var caso = cawTexto_(casos, sku);
    if (caso) aviso = caso + (aviso ? ' · ' + aviso : '');
    out.push([sku, 'KILLER', k.kam, dec, pct, entra, min || '', wp, carga || '', dif, aviso, w ? w.estado : '', w ? w.stock : '',
              k.detalles, dg.problema, dg.accion, caso]);
  });
  var PESO = { 'CAMBIO / QUITAR': 0, 'REVISAR KAM': 1, 'DEJAR': 2, 'NO PUBLICADO EN WALMART': 3, 'SIN MÍNIMO': 4 };
  var peso = function (x) { return PESO.hasOwnProperty(x[3]) ? PESO[x[3]] : 5; };   // col-fija: DECISION en el orden de CW_ENC
  var urg = function (x) { return x[14] && !/^(BLOQUEADO|SIN STOCK)/.test(x[14]) ? 0 : 1; };   // col-fija: PROBLEMA en el orden de CW_ENC
  out.sort(function (p, q) {
    return (urg(p) - urg(q)) || (peso(p) - peso(q)) || ((typeof p[4] === 'number' ? p[4] : 9) - (typeof q[4] === 'number' ? q[4] : 9));   // col-fija: % VS MINIMO
  });
  return { out: out, cont: cont, errores: errores };
}

/** Compara y escribe. objs = de kaActualizar_. forzar = reescribe aunque no cambie. */
function cwComparar_(objs, forzar) {
  if (!objs || !objs.length) return { error: 'Killers activos esta vacia.' };
  var w = vdWalmart_();
  if (!w.n) return { error: 'La hoja Walmart esta vacia (se llena sola del dashboard cada 15 min).' };
  var bd = cwBandas_(), bm = vdBajoMinimo_(), casos = {};
  try { cawAsegurarHoja_(); cawDetectarCobro_(); casos = cawVigentes_(); } catch (e) { logWarn_(CAW_ETAPA, 'No se pudo leer Casos Walmart: ' + String(e.message).split('\n')[0]); }
  var r = cwCalcular_(objs, w.mapa, bm, peLibres_(), casos, bd);
  try { cawDetectar_(r.errores, casos); } catch (e) { logWarn_(CAW_ETAPA, 'No se pudo detectar casos: ' + String(e.message).split('\n')[0]); }
  try { cwCategorias_(objs, w.mapa, bm); } catch (e) { logWarn_(CW_ETAPA, 'No se pudo armar Categoria revisar: ' + String(e.message).split('\n')[0]); }

  var huella = sha256_(JSON.stringify([r.out, bd]));
  var h0 = getSpreadsheet_().getSheetByName(CW_HOJA);
  if (!forzar && h0 && h0.getLastRow() > 1 && vdProp_('CW_HUELLA') === huella) { vdLatido_(CW_ETAPA, 'Comparar Walmart al dia (sin cambios)', r.cont); return { total: r.out.length, cont: r.cont, cambio: false }; }
  var h = getHoja_(CW_HOJA), n0 = h.getLastRow();
  var m = reescribirHoja_(h, CW_ENC, r.out, { vacioOk: true, clave: 'ESCR_COLS|' + CW_HOJA });
  var cDec = escrCol_(m, 'DECISIÓN'), n = r.out.length;
  if (cDec) {
    h.getRange(1, cDec).setNote('OK: entra ≥ mínimo\nDEJAR: hasta ' + bd.b1 + '% abajo\nREVISAR KAM: ' + bd.b1 + '% a ' + bd.b2 +
      '%\nCAMBIO / QUITAR: más de ' + bd.b2 + '%\n(Menú: Configurar bandas de Comparar Walmart)');
    var nBg = Math.max(n0 - 1, n);
    if (nBg > 0) h.getRange(2, cDec, nBg, 1).setBackground(null);   // solo el color de DECISION
    if (n) h.getRange(2, cDec, n, 1).setBackgrounds(r.out.map(function (x) { return [CW_COLOR[x[3]] || '#d9d9d9']; }));   // col-fija: DECISION en el orden de CW_ENC
  }
  vdFormato_(h, m, '% VS MÍNIMO', n, '0.0%');
  ['ENTRA (PRECIO + CUPÓN)', 'MÍNIMO APLICABLE', 'PRECIO EN WALMART', 'CARGA (LO QUE PUBLICAS)', 'DIFERENCIA vs CARGA'].forEach(function (x) { vdFormato_(h, m, x, n, '#,##0.00'); });
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);
  vdSetProp_('CW_HUELLA', huella);
  logOk_(CW_ETAPA, 'Comparar Walmart: ' + cwTextoConteo_(r.cont), r.cont);
  return { total: n, cont: r.cont, cambio: true };
}

/** Categoria revisar: categoria del KAM distinta al departamento de Walmart (solo informativa). */
function cwCategorias_(objs, wm, bm) {
  var filas = [], visto = {};
  var evalua = function (sku, kam, prod, estado, per) {
    if (visto[sku]) return; visto[sku] = true;
    var ok = CR_ESPERADA[normEnc_(kam)], w = wm[sku];
    if (!ok || !w || !w.shelf || ok.indexOf(normEnc_(w.shelf)) >= 0) return;
    filas.push([sku, kam, w.shelf, w.tipoProd, estado, per, prod || w.nombre]);
  };
  objs.forEach(function (x) { var e = bm.skus[x.sku]; evalua(x.sku, x.kam, x.detalles, 'ACTIVO', e ? e.perdida / 100 : ''); });
  Object.keys(bm.skus).forEach(function (s) {
    var e = bm.skus[s];
    evalua(s, e.cat || '', '', e.perdida > bm.tope + 0.0001 ? 'FUERA (bajo mínimo)' : 'ACTIVO', e.perdida / 100);
  });
  filas.sort(function (a, b) { return (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0) || (a[0] < b[0] ? -1 : 1); });   // col-fija: fila armada aqui
  var huella = sha256_(JSON.stringify(filas));
  var h0 = getSpreadsheet_().getSheetByName(CR_HOJA);
  if (h0 && vdProp_('CR_HUELLA') === huella) return;
  var h = getHoja_(CR_HOJA);
  var m = reescribirHoja_(h, CR_ENC, filas, { vacioOk: true, clave: 'ESCR_COLS|' + CR_HOJA });
  vdFormato_(h, m, '% PERDIDA (site)', filas.length, '0.0%');
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);
  vdSetProp_('CR_HUELLA', huella);
  logInfo_(CW_ETAPA, 'Categoria revisar: ' + filas.length + ' SKU');
}

/* ---------------- menu ---------------- */

/** Menu: formulario con los dos cortes de las bandas. */
function compararBandas() {
  var b = cwBandas_();
  var js = 'function q(s){return document.querySelector(s)}' +
    'function ir(){var a=q("#b1").value,b=q("#b2").value;document.querySelectorAll("button").forEach(function(x){x.disabled=true});q("#estado").textContent="Guardando y comparando…";' +
    'google.script.run.withSuccessHandler(function(r){q("#estado").textContent=(r&&r.lineas||[]).join(" ");q("#cerrar").style.display="flex";if(!(r&&r.ok))document.querySelectorAll("button").forEach(function(x){x.disabled=false})})' +
    '.withFailureHandler(function(e){q("#estado").textContent="No se pudo: "+(e&&e.message?e.message:e);document.querySelectorAll("button").forEach(function(x){x.disabled=false})})' +
    '.dlgEnvioResponder("cwBandasForm",JSON.stringify({b1:a,b2:b}))}';
  var html = '<!doctype html><html><head><meta charset="utf-8"><base target="_top"><style>' + DLG_CSS + '</style></head><body>' +
    '<h1>Bandas de Comparar Walmart</h1><p class="ayuda">Cuánto puede bajar del mínimo lo que entra (precio en Walmart + cupón) antes de pedir algo.</p>' +
    '<div class="campo"><label>DEJAR: hasta qué % abajo del mínimo se deja el killer</label><input id="b1" type="number" step="0.5" min="0.5" value="' + dlgEsc_(b.b1) + '"><div class="nota">Ejemplo: 3</div></div>' +
    '<div class="campo"><label>CAMBIO / QUITAR: desde qué % abajo del mínimo</label><input id="b2" type="number" step="0.5" min="1" value="' + dlgEsc_(b.b2) + '"><div class="nota">Entre los dos = REVISAR KAM. Ejemplo: 10</div></div>' +
    '<div class="botones"><button class="p" onclick="ir()">Guardar y comparar</button><button onclick="google.script.host.close()">Cancelar</button></div>' +
    '<p id="estado" class="ayuda"></p><div class="botones" id="cerrar" style="display:none"><button class="p" onclick="google.script.host.close()">Cerrar</button></div>' +
    '<script>' + js + '</script></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(380), 'Bandas de Comparar Walmart');
}

/** Lo llama el formulario de bandas (DLG_PERMITIDOS). Valida lo que llega. */
function cwBandasForm(p) {
  var n1 = Number(String(p && p.b1 || '').replace(',', '.')), n2 = Number(String(p && p.b2 || '').replace(',', '.'));
  if (!(n1 > 0) || !(n1 < 50)) return { ok: false, lineas: ['El primer corte debe ser un número mayor que 0 (ej. 3).'] };
  if (!(n2 > n1) || !(n2 <= 100)) return { ok: false, lineas: ['El segundo corte debe ser mayor que ' + n1 + ' (ej. 10).'] };
  vdSetProp_('CW_BANDA1', String(n1)); vdSetProp_('CW_BANDA2', String(n2)); vdSetProp_('CW_HUELLA', '');
  var txt = 'Guardado: DEJAR hasta ' + n1 + '% · REVISAR KAM ' + n1 + '% a ' + n2 + '% · CAMBIO / QUITAR más de ' + n2 + '%.';
  try {
    var a = kaActualizar_(false);
    var c = a ? cwComparar_(a.objs, true) : { error: 'no se pudo leer la hoja Killers' };
    txt += c.error ? ' (No se comparó: ' + c.error + ')' : ' Comparar Walmart actualizada: ' + cwTextoConteo_(c.cont) + '.';
  } catch (e) { txt += ' (No se comparó: ' + String(e.message).split('\n')[0] + ')'; }
  logOk_(CW_ETAPA, txt);
  return { ok: true, lineas: [txt] };
}
