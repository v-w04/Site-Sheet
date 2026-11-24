/**
 * SubidaPrecios.gs · Subida automatica de precios y killers a Walmart (la dispara la extension de Chrome).
 *
 * Flujo (24-nov-2026, ella: "yo te lo indico con un boton de la extension; si pido todo, una sola confirmacion"):
 *   1) La extension (boton Precios / Killers / Todo / Prueba) pide el archivo con la accion sub_preparar.
 *   2) El Sheet arma el archivo AL MOMENTO (inicio = ahora + WM_MIN_ADELANTO min) y lo manda en base64.
 *   3) La extension lo sube en Seller Center (Catalogo > Actualizar articulos > Actualizar con archivo > Precios) y avisa con sub_resultado.
 *   4) Si fue "Todo": la extension espera unos minutos y pide el de killers (se genera entonces, con su propio inicio).
 *
 * Fuentes (las mismas que usa ella a mano):
 *   - Precios normales: hoja EXPORTAR  -> SKU WALMART · PRECIO CARGA   (precio = PRECIO CARGA x 1.3 tachado, promo = PRECIO CARGA)
 *   - Killers:          hoja Killers activos -> SKU · Precio negociado · Fecha formato (fin, YA en UTC; no se le suman 6 h)
 * Nunca se sube sola: solo por el boton de la extension (o, mas adelante, a la hora que ella decida).
 *
 * Acciones del Web App: sub_preparar {clave, tipo:'precios'|'killers'|'prueba'}  y  sub_resultado {clave, job, tipo, resultado, detalle}.
 */

var SP_ETAPA = 'SUBIDA';
var SP_HOJA_EXPORTAR = 'EXPORTAR';
var SP_HOJA_KACT = 'Killers activos';
var SP_PRUEBA_N = 2;                 // la prueba sube solo estos killers (mismo precio que ya tienen: no cambia nada)
var SP_PROP_ULTIMA = 'SP_ULTIMA';
var SP_TIPOS = ['precios', 'killers', 'prueba'];

/** Fin de los precios normales: ultimo dia del mes SIGUIENTE a las 23:59 (hora Mexico). Hoy 24-nov -> 31-dic. */
function spFinPrecios_() {
  var h = new Date();
  var primero = new Date(h.getFullYear(), h.getMonth() + 2, 1, 0, 0, 0, 0);
  return new Date(primero.getTime() - 60 * 1000);
}

function spRedondo_(n) { return Math.round(Number(n) * 100) / 100; }

/** Fila del archivo (A..K) con el mismo formato de wmGenerarArchivo. ini/fin ya en "hora de hoja" (se suman 6 h aqui); finUtc = true si fin ya viene en UTC. */
function spFila_(sku, promo, iniMx, fin, finYaUtc) {
  return ['', '', '', sku, '', spRedondo_(promo * WM_MULT_TACHADO), 'Reemplazar todo', 'Rebaja', spRedondo_(promo),
          wmAUtc_(iniMx), finYaUtc ? fin : wmAUtc_(fin)];
}

/** Precios normales desde EXPORTAR. Devuelve {filas, saltadas:[texto]}. */
function spFilasPrecios_() {
  var h = getHoja_(SP_HOJA_EXPORTAR);
  if (!h || h.getLastRow() < 2) throw new Error('No hay datos en la hoja "' + SP_HOJA_EXPORTAR + '".');
  var c = colsHoja_(h, ['SKU WALMART', 'PRECIO CARGA']);
  var d = h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues();
  var ini = wmAhoraMasMinutos_(WM_MIN_ADELANTO), fin = spFinPrecios_();
  var filas = [], saltadas = [], vistos = {};
  d.forEach(function (r) {
    var sku = String(r[c['SKU WALMART']] || '').trim();
    if (!sku || vistos[sku]) return;
    vistos[sku] = true;
    var promo = Number(r[c['PRECIO CARGA']]);
    if (!(promo > 0)) { saltadas.push(sku + ' (sin precio)'); return; }
    filas.push(spFila_(sku, promo, ini, fin, false));
  });
  return { filas: filas, saltadas: saltadas };
}

/** Killers vigentes desde Killers activos. Devuelve {filas, saltadas:[texto]}. */
function spFilasKillers_() {
  var h = getHoja_(SP_HOJA_KACT);
  if (!h || h.getLastRow() < 2) throw new Error('No hay datos en la hoja "' + SP_HOJA_KACT + '".');
  var c = colsHoja_(h, ['SKU', 'Precio negociado', 'Fecha formato'], ['Inicio de la oferta']);
  var d = h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues();
  var ini0 = wmAhoraMasMinutos_(WM_MIN_ADELANTO);
  var filas = [], saltadas = [], vistos = {};
  d.forEach(function (r) {
    var sku = String(r[c.SKU] || '').trim();
    if (!sku || vistos[sku]) return;
    vistos[sku] = true;
    var neg = Number(r[c['Precio negociado']]);
    if (!(neg > 0)) { saltadas.push(sku + ' (sin precio negociado)'); return; }
    var fin = r[c['Fecha formato']];
    if (!(fin instanceof Date) || isNaN(fin.getTime())) { saltadas.push(sku + ' (sin Fecha formato)'); return; }
    // Inicio: ahora + 7 min; si el killer arranca mas adelante, respeta su inicio.
    var ini = ini0;
    var i0 = c['Inicio de la oferta'] >= 0 ? r[c['Inicio de la oferta']] : null;
    if (i0 instanceof Date && !isNaN(i0.getTime()) && i0.getTime() > ini0.getTime()) ini = i0;
    if (fin.getTime() <= wmAUtc_(ini).getTime()) { saltadas.push(sku + ' (ya vencio)'); return; }
    filas.push(spFila_(sku, neg, ini, fin, true));   // Fecha formato ya es UTC
  });
  return { filas: filas, saltadas: saltadas };
}

function spFmtUtc_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm'); }

/** Arma el archivo del tipo pedido. Sin tocar Drive ni lock: lo usan las pruebas. */
function spArmar_(tipo) {
  var r = tipo === 'precios' ? spFilasPrecios_() : spFilasKillers_();
  if (tipo === 'prueba') r.filas = r.filas.slice(0, SP_PRUEBA_N);
  return r;
}

/** Accion sub_preparar: arma el archivo AHORA y lo entrega en base64. */
function spPreparar_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var tipo = String(p.tipo || '');
  if (SP_TIPOS.indexOf(tipo) < 0) return { ok: false, error: 'tipo_no_valido' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return { ok: false, error: 'ocupado' };
  try {
    var r = spArmar_(tipo === 'prueba' ? 'killers' : tipo);
    if (tipo === 'prueba') r.filas = r.filas.slice(0, SP_PRUEBA_N);
    if (!r.filas.length) {
      logErr_(SP_ETAPA, 'No hay filas para subir (' + tipo + '). Saltadas: ' + r.saltadas.length, { saltadas: r.saltadas.slice(0, 20) }); flushLog_();
      return { ok: false, error: 'sin_filas', saltadas: r.saltadas.slice(0, 30) };
    }
    var archivo = wmConstruirXlsx_(r.filas);
    var bytes = archivo.getBlob().getBytes();
    var job = 'sp' + Date.now();
    var info = { job: job, tipo: tipo, n: r.filas.length, saltadas: r.saltadas.length, inicio_utc: spFmtUtc_(r.filas[0][9]), fin_utc: spFmtUtc_(r.filas[0][10]), archivo: archivo.getName(), hora: Date.now(), estado: 'entregado' }; // col-fija: fila armada por spFila_ en este archivo (J=9, K=10)
    props_().setProperty(SP_PROP_ULTIMA, JSON.stringify(info));
    logInfo_(SP_ETAPA, 'Archivo de ' + tipo + ' listo para la extension: ' + info.n + ' SKUs, inicio ' + info.inicio_utc + ' UTC' + (r.saltadas.length ? ', ' + r.saltadas.length + ' saltados' : ''), { job: job, archivo: info.archivo, saltadas: r.saltadas.slice(0, 20) });
    flushLog_();
    return { ok: true, job: job, tipo: tipo, nombre: archivo.getName(), n: info.n, saltadas: r.saltadas.slice(0, 30), nSaltadas: r.saltadas.length,
             inicio_utc: info.inicio_utc, fin_utc: info.fin_utc, base64: Utilities.base64Encode(bytes) };
  } catch (e) {
    logErr_(SP_ETAPA, 'No pude armar el archivo de ' + tipo + ': ' + (e && e.message ? e.message : e)); flushLog_();
    return { ok: false, error: 'armar: ' + String(e && e.message ? e.message : e).slice(0, 120) };
  } finally { lock.releaseLock(); }
}

/** Accion sub_resultado: la extension cuenta como le fue en Seller Center. resultado: subido | incierto | error | sin_sesion. */
function spRecibirResultado_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var res = String(p.resultado || ''), tipo = String(p.tipo || '');
  if (['subido', 'incierto', 'error', 'sin_sesion'].indexOf(res) < 0) return { ok: false, error: 'resultado_no_valido' };
  var detalle = String(p.detalle === null || p.detalle === undefined ? '' : p.detalle).replace(/[\r\n]+/g, ' ').slice(0, 600);
  var ult = {};
  try { ult = JSON.parse(props_().getProperty(SP_PROP_ULTIMA) || '{}') || {}; } catch (e) { ult = {}; }
  ult.estado = res; ult.detalle = detalle; ult.horaResultado = Date.now();
  try { props_().setProperty(SP_PROP_ULTIMA, JSON.stringify(ult)); } catch (e2) {}
  var que = (tipo === 'prueba' ? 'PRUEBA' : tipo) + (ult.n ? ' (' + ult.n + ' SKUs)' : '');
  if (res === 'subido') {
    logOk_(SP_ETAPA, 'Subida a Walmart enviada: ' + que + '. ' + detalle, { job: p.job });
  } else if (res === 'incierto') {
    logWarn_(SP_ETAPA, 'Subida de ' + que + ' SIN confirmar: revisa Seller Center > Actividad de carga. ' + detalle, { job: p.job });
    if (typeof extAlertaFija_ === 'function') extAlertaFija_('sp-incierto', 'Subida de ' + que + ' sin confirmar: revisa Actividad de carga en Seller Center');
  } else if (res === 'sin_sesion') {
    logWarn_(SP_ETAPA, 'No pude subir ' + que + ': Seller Center sin sesion. Entra con tu codigo 2FA y vuelve a pulsar el boton. ' + detalle, { job: p.job });
  } else {
    logErr_(SP_ETAPA, 'NO se subio ' + que + ': ' + detalle, { job: p.job });
    if (typeof extAlertaFija_ === 'function') extAlertaFija_('sp-error', 'No se pudo subir ' + que + ' a Walmart: ' + detalle.slice(0, 120));
  }
  flushLog_();
  return { ok: true };
}
