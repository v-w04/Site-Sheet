/**
 * ============================================================
 *  EXPORTAR / MINIMO / MAXIMO — precios por SKU publicado en Walmart (traido de Venta Diaria Odoo)
 * ============================================================
 *
 *   EXPORTAR   SKU WALMART · PRECIO FINAL · PRECIO -2% · PRECIO CARGA
 *   MINIMO     SKU WALMART · PRECIO MINIMO
 *   MAXIMO     SKU WALMART · PRECIO MAXIMO
 *
 *  Mismo resultado que en Venta Diaria, pero todo de ESTE libro (una sola fuente, sin openById ni IMPORTRANGE):
 *    1. Precios: Precios EM y debajo CVA Normal | Minimo | Maximo (Walmart Clasica / Premium). Si sale en las dos, gana EM.
 *    2. SKU publicado = general (o general-2..9) -> precio CLASICA; general-MSI (o -MSI-2..9) -> precio PREMIUM.
 *       Publicaciones = hojas Walmart + Bloqueados de este libro.
 *    3. SKU asignados: el asignado toma los precios del principal.
 *    4. Precios variaciones (precios a mano por SKU publicado) van al final y ganan; una variacion sin precio (0)
 *       nunca pisa un precio bueno.
 *    5. EXPORTAR sin repetidos (gana el ultimo). PRECIO -2% = precio x 0.98. PRECIO CARGA = ENTERO(-2% / 10) x 10 + 9.
 *  Guardarrailes: una hoja de precios con menos de 100 SKUs, menos de 100 publicaciones, o EXPORTAR que se encoge a
 *  menos de la mitad -> no se escribe nada. Solo escribe si cambio algo. Corre cada hora (ventasProgramado) y desde el menu.
 *
 *  Precios variaciones: hoja de este libro que el script llena del libro de variaciones (ID abajo, hoja PRINCIPAL -2,
 *  C112:C y J112:J). Si ese libro no abre, se usa la copia que ya esta en la hoja.
 * ============================================================
 */

var EXP = {
  ETAPA: 'EXPORTAR',
  HOJA: { EXPORTAR: 'EXPORTAR', MINIMO: 'MINIMO', MAXIMO: 'MAXIMO', VARIACIONES: 'Precios variaciones' },
  COLS: {
    EXPORTAR: ['SKU WALMART', 'PRECIO FINAL', 'PRECIO -2%', 'PRECIO CARGA'],
    MINIMO:   ['SKU WALMART', 'PRECIO MINIMO'],
    MAXIMO:   ['SKU WALMART', 'PRECIO MAXIMO']
  },
  SITE: {
    EXPORTAR: ['Precios EM Normal', 'Precios CVA Normal'],
    MINIMO:   ['Precios EM Minimo', 'Precios CVA Minimo'],
    MAXIMO:   ['Precios EM Maximo', 'Precios CVA Maximo']
  },
  ENC_VARS: ['SKU WALMART', 'PRECIO', 'ACTUALIZADO'],
  VARIACIONES: { ID: '1Uy-SIuVb77xFFGTuAmN6CvbpbWbTU4JXEH7OFNzXrbI', HOJA: 'PRINCIPAL -2', RANGO_SKU: 'C112:C', RANGO_PRECIO: 'J112:J' },
  FACTOR: 0.98,
  MIN_FILAS_SITE: 100,
  MIN_INVENTARIO: 100
};

/* ---------------- logica pura (se prueba en Node) ---------------- */

/** { R:[SKU], S:[precio] }. inv: SKUs publicados; precios: [[sku, clasica, premium]] EM y debajo CVA; vars: [[llave, precio]]. */
function exArmar_(inv, precios, vars, esExportar) {
  var E = Object.create(null), F = Object.create(null);
  for (var i = 0; i < precios.length; i++) {
    var k = String(precios[i][0]).toLowerCase();
    if (!(k in E)) { E[k] = precios[i][1]; F[k] = precios[i][2]; }   // col-fija: arreglo [sku, clasica, premium] armado por exFilasPrecios_
  }
  var J = [], N = [];
  for (var j = 0; j < inv.length; j++) {
    var b = inv[j];
    if (typeof b !== 'string' || b === '') continue;
    var bl = b.toLowerCase(), m;
    if ((bl in E) || ((m = /^(.*)-[2-9]$/.exec(bl)) && (m[1] in E))) {
      var kc = b.replace(/-[2-9]$/, '').toLowerCase();
      J.push([b, (kc in E) ? E[kc] : '#N/A']);
    }
    if ((m = /^(.*)-msi(?:-[2-9])?$/.exec(bl)) && (m[1] in E)) {
      var kp = b.replace(/-MSI(?:-[2-9])?$/i, '').toLowerCase();
      N.push([b, (kp in F) ? F[kp] : '#N/A']);
    }
  }
  var pares = J.concat(N), conPrecio = Object.create(null);
  pares.forEach(function (q) { if (typeof q[1] === 'number' && q[1] > 0) conPrecio[q[0].toLowerCase()] = true; });   // col-fija: par [sku, precio]
  for (var v = 0; v < vars.length; v++) {
    var llave = vars[v][0];   // col-fija: par [sku, precio]
    if (llave === '' || llave === null || llave === undefined) continue;
    var p = vars[v][1];   // col-fija: par [sku, precio]
    if (!(typeof p === 'number' && p > 0) && conPrecio[String(llave).toLowerCase()]) continue;
    pares.push([String(llave), p]);
  }
  var R = [], S = [];
  if (esExportar) {
    var ultimo = Object.create(null), orden = [];
    pares.forEach(function (q) { var kl = q[0].toLowerCase(); if (!(kl in ultimo)) orden.push(q[0]); ultimo[kl] = q[1]; });   // col-fija: par [sku, precio]
    orden.forEach(function (k0) { R.push(k0); S.push(ultimo[k0.toLowerCase()]); });
  } else {
    pares.forEach(function (q) { R.push(q[0]); S.push(q[1]); });   // col-fija: par [sku, precio]
  }
  S = S.map(function (x) { return x === '#N/A' ? 0 : x; });
  return { R: R, S: S };
}

/** [PRECIO -2%, PRECIO CARGA]. Vacio -> vacio; 0 -> 0 (nunca una carga de $9). */
function exCarga_(precio) {
  if (typeof precio !== 'number') return ['', ''];
  if (!(precio > 0)) return [0, 0];
  var t = precio * EXP.FACTOR;
  return [Math.round(t * 100) / 100, Math.floor(t / 10) * 10 + 9];
}

function exFilas_(tipo, t) {
  var filas = [];
  for (var i = 0; i < t.R.length; i++) {
    var s = t.S[i], fila = [t.R[i], (s === undefined || s === null) ? '' : s];
    if (tipo === 'EXPORTAR') fila = fila.concat(exCarga_(s));
    filas.push(fila);
  }
  return filas;
}

/** SKU publicado -> SKU general (quita -MSI, -MSI-2..9 o -2..9). */
function exGeneral_(sku) { return String(sku).replace(/-MSI(?:-[2-9])?$/i, '').replace(/-[2-9]$/, ''); }

/** [[generalAsignado, generalPrincipal]] de los grupos de SKU asignados. */
function exParesAsignados_(asig) {
  var out = [], vistos = {}, grupos = {};
  Object.keys(asig || {}).forEach(function (k) { var g = asig[k]; grupos[g.grupo.join('|')] = g; });
  Object.keys(grupos).forEach(function (c) {
    var g = grupos[c], gp = exGeneral_(g.principal);
    g.grupo.forEach(function (x) {
      var ga = exGeneral_(x), k = ga.toLowerCase();
      if (k === gp.toLowerCase() || vistos[k]) return;
      vistos[k] = true; out.push([ga, gp]);
    });
  });
  return out;
}

/** El asignado toma clasica y premium del principal (reemplaza o agrega su fila). filas: [[sku, clasica, premium]]. */
function exAplicarAsignados_(filas, pares) {
  var out = filas.map(function (f) { return f.slice(); });
  if (!pares.length) return out;
  var idx = Object.create(null);
  out.forEach(function (f, i) { var k = String(f[0]).toLowerCase(); if (!(k in idx)) idx[k] = i; });   // col-fija: [sku, clasica, premium]
  pares.forEach(function (par) {
    var ip = idx[par[1].toLowerCase()];   // col-fija: par [asignado, principal]
    if (ip === undefined) return;
    var P = out[ip], hay = false;
    out.forEach(function (f) { if (String(f[0]).toLowerCase() === par[0].toLowerCase()) { f[1] = P[1]; f[2] = P[2]; hay = true; } });   // col-fija: idem
    if (!hay) { var n = P.slice(); n[0] = par[0]; out.push(n); }   // col-fija: idem
  });
  return out;
}

/** Variaciones crudas [[llave, precio]] -> precio numero o 0. null si viene un error de hoja (#REF!). */
function exVariacionesDe_(valores) {
  var out = [];
  for (var i = 0; i < valores.length; i++) {
    var llave = String(valores[i][0] == null ? '' : valores[i][0]).trim();   // col-fija: par [sku, precio]
    if (!llave) continue;
    if (llave.charAt(0) === '#') return null;
    var p = valores[i][1], precio = 0;   // col-fija: par [sku, precio]
    if (typeof p === 'number') precio = p > 0 ? p : 0;
    else if (p !== '' && p !== null && p !== undefined && String(p).charAt(0) !== '#') { var n = peNum_(p); precio = n > 0 ? n : 0; }
    out.push([llave, precio]);
  }
  return out;
}

/* ---------------- lecturas (este libro) ---------------- */

/** Precios de una hoja Precios EM/CVA: [[sku, clasica, premium]]. */
function exFilasPrecios_(nombre) {
  var t = peTabla_(nombre);
  if (!t) throw new Error('No existe o esta vacia la hoja "' + nombre + '"');
  var iS = peCol_(t, ['SKU']), iC = peCol_(t, ['Walmart Clasica']), iP = peCol_(t, ['Walmart Premium']);
  var faltan = []; if (iS < 0) faltan.push('SKU'); if (iC < 0) faltan.push('Walmart Clásica'); if (iP < 0) faltan.push('Walmart Premium');
  if (faltan.length) throw new Error('En "' + nombre + '" faltan encabezados: ' + faltan.join(', '));
  var out = [];
  t.filas.forEach(function (f) {
    var s = String(f[iS] == null ? '' : f[iS]).trim(); if (!s) return;
    var c = peNum_(f[iC]), p = peNum_(f[iP]);
    out.push([s, c > 0 ? c : '', p > 0 ? p : '']);
  });
  return out;
}

function exFuente_(tipo) {
  var todo = [];
  EXP.SITE[tipo].forEach(function (nombre) {
    var filas = exFilasPrecios_(nombre);
    if (filas.length < EXP.MIN_FILAS_SITE) throw new Error('"' + nombre + '" trae solo ' + filas.length + ' SKUs (minimo ' + EXP.MIN_FILAS_SITE + '). No escribi nada para no perder precios buenos.');
    todo = todo.concat(filas);
  });
  return todo;
}

/** Variaciones: del libro de variaciones (y se guarda la copia en la hoja); si no abre, la copia de la hoja. */
function exVariaciones_() {
  var vars = null, origen = '';
  try {
    var sh = SpreadsheetApp.openById(EXP.VARIACIONES.ID).getSheetByName(EXP.VARIACIONES.HOJA);
    if (sh) {
      var a = sh.getRange(EXP.VARIACIONES.RANGO_SKU).getValues(), b = sh.getRange(EXP.VARIACIONES.RANGO_PRECIO).getValues();
      vars = exVariacionesDe_(a.map(function (r, i) { return [r[0], b[i] ? b[i][0] : '']; }));   // col-fija: rangos de una sola columna
      origen = 'libro de variaciones';
    }
  } catch (e) { vars = null; }
  if (vars && vars.length) { exGuardarVariaciones_(vars); return { vars: vars, origen: origen }; }
  var t = peTabla_(EXP.HOJA.VARIACIONES), copia = [];
  if (t) {
    var iS = peCol_(t, ['SKU WALMART']), iP = peCol_(t, ['PRECIO']);
    if (iS >= 0 && iP >= 0) copia = exVariacionesDe_(t.filas.map(function (f) { return [f[iS], f[iP]]; })) || [];
  }
  if (!copia.length) throw new Error('No pude leer el libro de variaciones y la hoja "' + EXP.HOJA.VARIACIONES + '" esta vacia. No escribi nada para no perder los precios de las variaciones (corre "Traer TODO de Venta Diaria").');
  avisoDia_('ex-vars-copia', 'WARN', EXP.ETAPA, 'El libro de variaciones no abrio; use la copia de la hoja ' + EXP.HOJA.VARIACIONES + ' (' + copia.length + ')');
  return { vars: copia, origen: 'copia de la hoja' };
}

/** Escribe la copia de variaciones si cambio. */
function exGuardarVariaciones_(vars) {
  var huella = sha256_(JSON.stringify(vars));
  if (vdProp_('EX_VARS_HUELLA') === huella && vdLibro_().getSheetByName(EXP.HOJA.VARIACIONES)) return;
  var ahora = new Date();
  var h = vdHoja_(EXP.HOJA.VARIACIONES);
  var m = vdEscribir_(h, EXP.ENC_VARS, vars.map(function (v) { return [v[0], v[1], ahora]; }), { clave: 'ESCR_COLS|' + EXP.HOJA.VARIACIONES, texto: ['SKU WALMART'] });   // col-fija: par [sku, precio]
  vdFormato_(h, m, 'PRECIO', vars.length, '#,##0.00');
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);
  vdSetProp_('EX_VARS_HUELLA', huella);
}

/** Traer TODO de Venta Diaria: copia PRECIOS VARIACIONES (valores) a la hoja de aqui. Devuelve texto. */
function exTraerVariacionesDeVd_() {
  try { var v = exVariaciones_(); if (v.origen === 'libro de variaciones') return v.vars.length + ' variaciones leidas del libro de variaciones'; } catch (e) {}
  var sh = SpreadsheetApp.openById(VD_LIBRO_VIEJO).getSheetByName('PRECIOS VARIACIONES');
  if (!sh || sh.getLastRow() < 1) return 'Venta Diaria no tiene PRECIOS VARIACIONES';
  var vars = exVariacionesDe_(sh.getRange(1, 1, sh.getLastRow(), 2).getValues());   // col-fija: esa hoja son dos IMPORTRANGE en A y B
  if (!vars || !vars.length) return 'PRECIOS VARIACIONES de Venta Diaria no trae datos (IMPORTRANGE sin permiso)';
  exGuardarVariaciones_(vars);
  return vars.length + ' variaciones copiadas';
}

/* ---------------- calculo y escritura ---------------- */

/** Recalcula y escribe EXPORTAR, MINIMO y MAXIMO. forzar = reescribe aunque nada cambie. */
function exportarPrecios_(forzar) {
  var t0 = Date.now();
  var w = vdWalmart_();
  if (w.skus.length < EXP.MIN_INVENTARIO) throw new Error('Las hojas Walmart + Bloqueados traen solo ' + w.skus.length + ' publicaciones (minimo ' + EXP.MIN_INVENTARIO + '). No escribi nada.');
  var v = exVariaciones_(), pares = exParesAsignados_(peAsignados_());
  var asignGen = Object.create(null);
  pares.forEach(function (p) { asignGen[p[0].toLowerCase()] = true; });   // col-fija: par [asignado, principal]
  var vars = v.vars.filter(function (x) { return !asignGen[exGeneral_(x[0]).toLowerCase()]; });   // col-fija: par [sku, precio]
  var fuentes = {};
  ['EXPORTAR', 'MINIMO', 'MAXIMO'].forEach(function (tipo) { fuentes[tipo] = exAplicarAsignados_(exFuente_(tipo), pares); });
  var huella = sha256_(JSON.stringify([w.skus, vars, fuentes]));
  var existen = ['EXPORTAR', 'MINIMO', 'MAXIMO'].every(function (k) { return !!vdLibro_().getSheetByName(EXP.HOJA[k]); });
  if (!forzar && existen && vdProp_('EX_HUELLA') === huella) { vdLatido_(EXP.ETAPA, 'EXPORTAR, MINIMO y MAXIMO al dia (sin cambios)'); return { cambio: false }; }

  var tablas = {
    EXPORTAR: exArmar_(w.skus, fuentes.EXPORTAR, vars, true),
    MINIMO:   exArmar_(w.skus, fuentes.MINIMO, vars, false),
    MAXIMO:   exArmar_(w.skus, fuentes.MAXIMO, vars, false)
  };
  var finales = tablas.EXPORTAR.R.length, antes = Number(vdProp_('EX_N', '0'));
  if (antes && finales < antes * 0.5) throw new Error('EXPORTAR saldria con ' + finales + ' SKUs contra ' + antes + ' la ultima vez. No escribi nada.');

  var res = { cambio: true, finales: {}, sinPrecio: {}, ceros: {}, variaciones: vars.length, origenVariaciones: v.origen, publicaciones: w.skus.length };
  ['EXPORTAR', 'MINIMO', 'MAXIMO'].forEach(function (tipo) {
    var filas = exFilas_(tipo, tablas[tipo]), hu = sha256_(JSON.stringify(filas)), h = vdHoja_(EXP.HOJA[tipo]);
    // Cada hoja por separado: la que no cambio no se reescribe; si Google tarda en una, las otras ya quedaron.
    if (vdProp_('EX_HUELLA_' + tipo) !== hu || h.getLastRow() < 2) {
      var m = vdEscribir_(h, EXP.COLS[tipo], filas, { clave: 'ESCR_COLS|' + EXP.HOJA[tipo], texto: ['SKU WALMART'] });
      EXP.COLS[tipo].slice(1).forEach(function (c) { vdFormato_(h, m, c, filas.length, '#,##0.00'); });
      if (h.getFrozenRows() < 1) h.setFrozenRows(1);
      vdSetProp_('EX_HUELLA_' + tipo, hu);
    }
    var S = tablas[tipo].S;
    res.finales[tipo] = tablas[tipo].R.length;
    res.sinPrecio[tipo] = S.filter(function (x) { return x === '' || x === null || x === undefined; }).length;
    res.ceros[tipo] = S.filter(function (x) { return x === 0; }).length;
  });
  SpreadsheetApp.flush();
  vdSetProp_('EX_HUELLA', huella);
  vdSetProp_('EX_N', String(finales));
  res.segundos = Math.round((Date.now() - t0) / 100) / 10;
  logOk_(EXP.ETAPA, 'EXPORTAR ' + res.finales.EXPORTAR + ' · MINIMO ' + res.finales.MINIMO + ' · MAXIMO ' + res.finales.MAXIMO + ' SKUs · ' + res.segundos + ' s', res);
  return res;
}

/** Cada hora (ventasProgramado). Un error igual solo una vez al dia en el Log. */
function exProgramado_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(VD_LOCK_MS)) { avisoDia_('ex-ocupado', 'INFO', EXP.ETAPA, 'EXPORTAR saltada: otra corrida tenia el candado.'); return; }
  try { exportarPrecios_(false); }
  catch (e) { var msg = String(e.message).split('\n')[0].substring(0, 200); avisoDia_('ex-error:' + msg, 'ERROR', EXP.ETAPA, 'No se pudo actualizar EXPORTAR / MINIMO / MAXIMO: ' + msg); }
  finally { try { flushLog_(); } catch (x) {} lock.releaseLock(); }
}

/** Menu: recalcula ya y avisa. */
function exportarPreciosWalmart() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(90000)) { dlgInfo_('EXPORTAR', 'Otra corrida tiene el candado. Espera un minuto y vuelve a darle.', 'aviso'); return; }
  try {
    toast_('Calculando EXPORTAR, MINIMO y MAXIMO...', 'EXPORTAR', 60);
    var r = exportarPrecios_(true);
    flushLog_();
    dlgInfo_('EXPORTAR, MINIMO y MAXIMO', 'Actualizadas en ' + r.segundos + ' s\n\n• EXPORTAR: ' + r.finales.EXPORTAR + ' SKUs\n• MINIMO: ' + r.finales.MINIMO +
      ' SKUs\n• MAXIMO: ' + r.finales.MAXIMO + ' SKUs\n\nEn 0 (variacion sin precio): EXPORTAR ' + r.ceros.EXPORTAR + ' · MINIMO ' + r.ceros.MINIMO + ' · MAXIMO ' + r.ceros.MAXIMO +
      '\nVariaciones: ' + r.variaciones + ' (' + r.origenVariaciones + ') · publicaciones leidas: ' + r.publicaciones, 'ok');
  } catch (e) {
    logErr_(EXP.ETAPA, 'No se pudo actualizar EXPORTAR / MINIMO / MAXIMO: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    dlgInfo_('EXPORTAR, MINIMO y MAXIMO', 'No se escribio nada: ' + String(e.message).split('\n')[0], 'error');
  } finally { lock.releaseLock(); }
}
