/**
 * Combos.gs — Site Sheet
 *
 * Candidatos a COMBO con intencion (no combos por hacerlos): varios productos DISTINTOS de una misma categoria
 * (ej. 3 controles, 3 ratones) que ya estan publicados, se venden y tienen stock. Ella decide cuales pasan.
 *
 * Por que de la misma categoria y no "lo que se compra junto": en oct-nov casi nadie compra 2 productos distintos
 * en un pedido de Walmart (1 de 2,185), asi que esos datos no sirven para armar combos. El factor de venta sale
 * de las piezas vendidas por producto en 30 dias.
 *
 * Hojas:
 *   Combos reglas      (ella la edita) una fila por categoria: ACTIVA, CATEGORIA 1, CATEGORIA 2, CATEGORIA 3, PRODUCTOS, NOTA.
 *                      Con solo CATEGORIA 1 llena: combos de esa categoria con PRODUCTOS (2 a 4, por defecto 3) productos.
 *                      Con 2 o 3 categorias llenas: un producto de cada una (mezclado). Se crea una vez con las categorias
 *                      que mas venden; despues nunca se pisa.
 *   Combos candidatos  (script) la lista de todo. Ella escribe DECISION = SI / NO. Lo ya decidido se conserva al actualizar.
 *   Combos depurados   (script) solo los SI, en columnas SKU 1, SKU 2, SKU 3 (SKU 4): listos para copiar al site.
 *
 * No escribe en Walmart ni en el site; solo lee Walmart, Ventas 30 dias e Inventario Actual de este libro.
 */
var CMB_HOJA_REGLAS = 'Combos reglas', CMB_HOJA_CAND = 'Combos candidatos', CMB_HOJA_DEP = 'Combos depurados', CMB_ETAPA = 'COMBOS';
var CMB_ENC_REGLAS = ['ACTIVA', 'CATEGORIA 1', 'CATEGORIA 2', 'CATEGORIA 3', 'PRODUCTOS', 'NOTA'];
var CMB_ENC_CAND = ['REGLA', 'SKU 1', 'SKU 2', 'SKU 3', 'SKU 4', 'PRODUCTOS', 'PIEZAS 30D', 'ANCLA', 'MINIMO', 'STOCK MIN', 'PRECIO SUMA', 'DECISION', 'NOTA'];
var CMB_ENC_DEP = ['SKU 1', 'SKU 2', 'SKU 3', 'SKU 4', 'PRODUCTOS', 'PRECIO SUMA', 'ANCLA', 'MINIMO', 'REGLA'];
var CMB_OPC = { top: 8, minAncla: 3, minComp: 1, maxPorRegla: 30, semillas: 12 };

/** Pura. SKU -> modelo: sin -MSI ni -MSI-n, primeras dos partes (marca-modelo). Dos colores del mismo modelo = mismo modelo. */
function cmbModelo_(sku) {
  var s = String(sku || '').toUpperCase().replace(/-MSI(-\d{1,2})?(?=-|$)/g, '').split('-');
  return s.slice(0, 2).join('-');
}

/** Pura. Llave de un combo (sin importar el orden de los SKU). */
function cmbLlave_(skus) {
  return (skus || []).map(function (x) { return String(x || '').trim().toUpperCase(); }).filter(Boolean).sort().join('|');
}

/** Pura. Combinaciones de `k` elementos de `arr` (en orden). */
function cmbCombinar_(arr, k) {
  var out = [];
  (function rec(ini, act) {
    if (act.length === k) { out.push(act.slice()); return; }
    for (var i = ini; i < arr.length; i++) { act.push(arr[i]); rec(i + 1, act); act.pop(); }
  })(0, []);
  return out;
}

/** Pura. Producto cartesiano de listas (un producto de cada una). */
function cmbCartesiano_(listas) {
  var out = [[]];
  listas.forEach(function (l) { var n = []; out.forEach(function (a) { l.forEach(function (x) { n.push(a.concat([x])); }); }); out = n; });
  return out;
}

/**
 * Pura. Arma los candidatos.
 *   reglas  [{activa, cats:[...], n, nota}]
 *   cat     {SKU: {cat, nombre, precio, publicado}}
 *   ventas  {SKU: piezas 30 dias}      stock {SKU: libre} o null (sin dato: no se filtra por stock)
 * Devuelve [{regla, skus, productos, piezas, ancla, minimo, stockMin, precio}] ordenados por regla y luego por MINIMO.
 */
function cmbArmar_(reglas, cat, ventas, stock, opc) {
  opc = opc || CMB_OPC;
  var out = [];
  (reglas || []).forEach(function (r) {
    if (!r || !r.activa || !r.cats || !r.cats.length) return;
    var pools = r.cats.map(function (c) {
      var lista = [];
      Object.keys(cat).forEach(function (sku) {
        var x = cat[sku], pz = Number(ventas[sku]) || 0;
        if (!x || !x.publicado || String(x.cat).toLowerCase() !== String(c).toLowerCase() || pz < opc.minComp) return;
        if (stock && !(Number(stock[sku]) > 0)) return;
        lista.push({ sku: sku, pz: pz });
      });
      lista.sort(function (a, b) { return b.pz - a.pz || (a.sku < b.sku ? -1 : 1); });
      var vistos = {}, sin = [];
      lista.forEach(function (p) { var m = cmbModelo_(p.sku); if (vistos[m]) return; vistos[m] = true; sin.push(p); });
      return sin.slice(0, opc.top);
    });
    var combos;
    if (pools.length === 1) {
      var n = Math.max(2, Math.min(4, Number(r.n) || 3));
      combos = cmbCombinar_(pools[0], n);
    } else combos = cmbCartesiano_(pools).filter(function (c) {
      var u = {}; return c.every(function (p) { var m = cmbModelo_(p.sku); if (u[m]) return false; u[m] = true; return true; });
    });
    var filas = [];
    combos.forEach(function (c) {
      var pz = c.map(function (p) { return p.pz; }), ancla = Math.max.apply(null, pz), minimo = Math.min.apply(null, pz);
      if (ancla < opc.minAncla) return;
      var stk = c.map(function (p) { return stock ? Number(stock[p.sku]) || 0 : ''; });
      filas.push({
        regla: r.cats.join(' + '), skus: c.map(function (p) { return p.sku; }),
        productos: c.map(function (p) { return String((cat[p.sku] || {}).nombre || '').slice(0, 60); }).join(' + '),
        piezas: pz, ancla: ancla, minimo: minimo, stockMin: stock ? Math.min.apply(null, stk) : '',
        precio: Math.round(c.reduce(function (s, p) { return s + (Number((cat[p.sku] || {}).precio) || 0); }, 0) * 100) / 100
      });
    });
    filas.sort(function (a, b) { return b.minimo - a.minimo || b.ancla - a.ancla || (cmbLlave_(a.skus) < cmbLlave_(b.skus) ? -1 : 1); });
    out = out.concat(filas.slice(0, opc.maxPorRegla));
  });
  return out;
}

/** Pura. Categorias que mas venden (publicadas, con 2+ modelos distintos que venden) -> primeras `n`. Para sembrar las reglas. */
function cmbSemillas_(cat, ventas, n) {
  var por = {};
  Object.keys(cat).forEach(function (sku) {
    var x = cat[sku], pz = Number(ventas[sku]) || 0;
    if (!x || !x.publicado || !x.cat || pz < 1) return;
    var o = por[x.cat] = por[x.cat] || { cat: x.cat, pz: 0, modelos: {} };
    o.pz += pz; o.modelos[cmbModelo_(sku)] = true;
  });
  return Object.keys(por).map(function (k) { return por[k]; })
    .filter(function (o) { return Object.keys(o.modelos).length >= 3; })
    .sort(function (a, b) { return b.pz - a.pz; }).slice(0, n).map(function (o) { return o.cat; });
}

/** Pura. Lo que ella ya decidio (llave -> {decision, nota}) y las filas decididas que ya no salieron (para no perderlas). */
function cmbConservar_(previas, nuevas) {
  var dec = {}, hay = {};
  nuevas.forEach(function (f) { hay[cmbLlave_(f.skus)] = true; });
  var huerfanas = [];
  (previas || []).forEach(function (p) {
    var k = cmbLlave_(p.skus); if (!k) return;
    var d = String(p.decision || '').trim(), nota = /^Ya no sale en la lista nueva/.test(String(p.nota || '')) ? '' : String(p.nota || '').trim();
    if (d || nota) { dec[k] = { decision: p.decision, nota: nota }; if (!hay[k]) huerfanas.push(p); }
  });
  return { dec: dec, huerfanas: huerfanas };
}

/** Pura. ¿La decision es un SI? */
function cmbEsSi_(d) { return /^(si|sí|s|x|1|ok|yes)$/i.test(String(d || '').trim()); }

/* ====================== Lectura / escritura en el libro ====================== */

function cmbLeerDatos_() {
  var tw = peTabla_('Walmart'), tv = peTabla_('Ventas 30 dias'), ti = peTabla_('Inventario Actual');
  if (!tw) throw new Error('Falta la hoja "Walmart" (menú Catálogo Walmart › Bajar del site).');
  var iS = peCol_(tw, ['SKU']), iC = peCol_(tw, ['CATEGORIA']), iE = peCol_(tw, ['ESTATUS']), iP = peCol_(tw, ['PRECIO']), iN = peCol_(tw, ['NOMBRE']);
  if (iS < 0 || iC < 0 || iE < 0) throw new Error('La hoja "Walmart" no trae SKU, CATEGORIA y ESTATUS.');
  var cat = {};
  tw.filas.forEach(function (f) {
    var sku = String(f[iS] || '').trim(); if (!sku) return;
    cat[sku] = { cat: String(f[iC] || '').trim(), nombre: iN >= 0 ? f[iN] : '', precio: iP >= 0 ? f[iP] : 0, publicado: String(f[iE] || '').trim().toUpperCase() === 'PUBLISHED' };
  });
  var ventas = {};
  if (tv) { var vS = peCol_(tv, ['SKU']), vP = peCol_(tv, ['PIEZAS']); if (vS >= 0 && vP >= 0) tv.filas.forEach(function (f) { var s = String(f[vS] || '').trim(); if (s) ventas[s] = (ventas[s] || 0) + (Number(f[vP]) || 0); }); }
  var stock = null;
  if (ti) { var sS = peCol_(ti, ['SKU']), sL = peCol_(ti, ['LIBRE']); if (sS >= 0 && sL >= 0) { stock = {}; ti.filas.forEach(function (f) { var s = String(f[sS] || '').trim(); if (s) stock[s] = Number(f[sL]) || 0; }); } }
  return { cat: cat, ventas: ventas, stock: stock, ventasOk: !!tv && Object.keys(ventas).length > 0 };
}

/** Crea "Combos reglas" solo si no existe o esta vacia, con las categorias que mas venden. Nunca pisa lo que ella ya puso. */
function cmbReglasAsegurar_(d) {
  var h = peHojaAsegurar_(CMB_HOJA_REGLAS, CMB_ENC_REGLAS), m = ubicarColumnas_(h, CMB_ENC_REGLAS, 1);
  if (h.getLastRow() > 1) return false;
  var cats = cmbSemillas_(d.cat, d.ventas, CMB_OPC.semillas);
  if (!cats.length) return false;
  peAgregar_(h, CMB_ENC_REGLAS, cats.map(function (c) { return { 'ACTIVA': 'SI', 'CATEGORIA 1': c, 'CATEGORIA 2': '', 'CATEGORIA 3': '', 'PRODUCTOS': 3, 'NOTA': 'Sembrada con las categorias que mas venden. Cambiala, apagala (ACTIVA = NO) o agrega mas. Para mezclar categorias llena CATEGORIA 2 y 3.' }; }));
  return true;
}

function cmbLeerReglas_() {
  var t = peTabla_(CMB_HOJA_REGLAS); if (!t) return [];
  var a = peCol_(t, ['ACTIVA']), c1 = peCol_(t, ['CATEGORIA 1']), c2 = peCol_(t, ['CATEGORIA 2']), c3 = peCol_(t, ['CATEGORIA 3']), n = peCol_(t, ['PRODUCTOS']);
  if (a < 0 || c1 < 0) return [];
  return t.filas.map(function (f) {
    var cats = [c1, c2, c3].map(function (i) { return i >= 0 ? String(f[i] || '').trim() : ''; }).filter(Boolean);
    return { activa: cmbEsSi_(f[a]), cats: cats, n: n >= 0 ? f[n] : 3 };
  }).filter(function (r) { return r.cats.length; });
}

function cmbLeerPrevias_() {
  var t = peTabla_(CMB_HOJA_CAND); if (!t) return [];
  var ix = ['SKU 1', 'SKU 2', 'SKU 3', 'SKU 4'].map(function (e) { return peCol_(t, [e]); }), dI = peCol_(t, ['DECISION']), nI = peCol_(t, ['NOTA']);
  return t.filas.map(function (f) {
    var fila = { skus: ix.map(function (i) { return i >= 0 ? String(f[i] || '').trim() : ''; }).filter(Boolean), decision: dI >= 0 ? f[dI] : '', nota: nI >= 0 ? f[nI] : '', crudo: {} };
    CMB_ENC_CAND.forEach(function (e) { var i = peCol_(t, [e]); if (i >= 0) fila.crudo[e] = f[i]; });
    return fila;
  });
}

/** Menu: arma / actualiza "Combos candidatos" (conserva SI / NO y notas). */
function combosCandidatosActualizar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) { dlgInfo_('Combos', 'Otra corrida tiene el candado. Espera un minuto y vuelve a intentar.', 'aviso'); return; }
  try {
    var d = cmbLeerDatos_();
    if (!d.ventasOk) { dlgInfo_('Combos', 'No hay datos en "Ventas 30 dias". Corre primero 📈 Ventas › Bajar ventas 30 dias.', 'aviso'); return; }
    var sembrada = cmbReglasAsegurar_(d);
    var reglas = cmbLeerReglas_(), activas = reglas.filter(function (r) { return r.activa; });
    if (!activas.length) { dlgInfo_('Combos', 'No hay reglas activas en "Combos reglas" (ACTIVA = SI).', 'aviso'); return; }
    var nuevas = cmbArmar_(reglas, d.cat, d.ventas, d.stock, CMB_OPC);
    var previas = cmbLeerPrevias_(), con = cmbConservar_(previas, nuevas);
    var filas = nuevas.map(function (f) {
      var k = cmbLlave_(f.skus), x = con.dec[k] || {};
      return cmbFila_(f, x.decision, x.nota);
    });
    con.huerfanas.forEach(function (p) {
      var c = p.crudo || {}, o = {};
      CMB_ENC_CAND.forEach(function (e) { o[e] = c[e] === undefined ? '' : c[e]; });
      o['NOTA'] = (/^Ya no sale en la lista nueva/.test(String(p.nota || '')) ? '' : String(p.nota || '').trim()) || 'Ya no sale en la lista nueva (sin ventas o sin stock); lo dejo porque ya lo habias decidido';
      filas.push(CMB_ENC_CAND.map(function (e) { return o[e]; }));
    });
    var h = peHojaAsegurar_(CMB_HOJA_CAND, CMB_ENC_CAND);
    reescribirHoja_(h, CMB_ENC_CAND, filas, { vacioOk: true, texto: ['SKU 1', 'SKU 2', 'SKU 3', 'SKU 4'] });
    logOk_(CMB_ETAPA, 'Combos candidatos: ' + nuevas.length + ' de ' + activas.length + ' regla(s)' + (con.huerfanas.length ? ', ' + con.huerfanas.length + ' ya decidido(s) conservado(s)' : '') + (sembrada ? '; reglas sembradas' : '')); flushLog_();
    dlgInfo_('Combos candidatos', [
      nuevas.length + ' combos candidatos en ' + activas.length + ' regla(s) (hoja Combos candidatos).',
      sembrada ? '• Se creó "Combos reglas" con las categorías que más venden: ajústala a tu gusto.' : '',
      '• Escribe SI o NO en DECISION. Lo que decidas se conserva al actualizar.',
      '• Luego corre 🧩 Combos › Pasar los SI a depurados.'
    ].filter(Boolean).join('\n\n'), 'ok');
  } catch (e) {
    logErr_(CMB_ETAPA, 'Combos candidatos: ' + String(e.message || e).split('\n')[0]); flushLog_();
    dlgInfo_('Combos', 'No se pudo armar: ' + String(e.message || e).split('\n')[0], 'error');
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

function cmbFila_(f, decision, nota) {
  var sk = f.skus.concat(['', '', '', '']).slice(0, 4), o = {
    'REGLA': f.regla, 'SKU 1': sk[0], 'SKU 2': sk[1], 'SKU 3': sk[2], 'SKU 4': sk[3], 'PRODUCTOS': f.productos, 'PIEZAS 30D': f.piezas.join(' / '),
    'ANCLA': f.ancla, 'MINIMO': f.minimo, 'STOCK MIN': f.stockMin, 'PRECIO SUMA': f.precio, 'DECISION': decision || '', 'NOTA': nota || ''
  };
  return CMB_ENC_CAND.map(function (e) { return o[e]; });
}

/** Menu: copia a "Combos depurados" solo los SI, listos para pegar en el site (un SKU por columna). */
function combosDepurar() {
  try {
    var t = peTabla_(CMB_HOJA_CAND);
    if (!t) { dlgInfo_('Combos', 'Primero corre 🧩 Combos › Armar / actualizar candidatos.', 'aviso'); return; }
    var c = {}; CMB_ENC_CAND.forEach(function (e) { c[e] = peCol_(t, [e]); });
    if (c['DECISION'] < 0) { dlgInfo_('Combos', 'En "Combos candidatos" falta la columna DECISION.', 'error'); return; }
    var filas = [];
    t.filas.forEach(function (f) {
      if (!cmbEsSi_(f[c['DECISION']])) return;
      var g = function (e) { return c[e] >= 0 ? f[c[e]] : ''; };
      filas.push([g('SKU 1'), g('SKU 2'), g('SKU 3'), g('SKU 4'), g('PRODUCTOS'), g('PRECIO SUMA'), g('ANCLA'), g('MINIMO'), g('REGLA')]);
    });
    var h = peHojaAsegurar_(CMB_HOJA_DEP, CMB_ENC_DEP);
    reescribirHoja_(h, CMB_ENC_DEP, filas, { vacioOk: true, texto: ['SKU 1', 'SKU 2', 'SKU 3', 'SKU 4'] });
    logOk_(CMB_ETAPA, 'Combos depurados: ' + filas.length + ' con SI'); flushLog_();
    dlgInfo_('Combos depurados', filas.length ? filas.length + ' combo(s) con SI pasaron a "Combos depurados": copia las columnas SKU 1, SKU 2, SKU 3 (y SKU 4) y pégalas en la pestaña de combos del site.' : 'Aún no hay ningún SI en DECISION de "Combos candidatos".', filas.length ? 'ok' : 'aviso');
  } catch (e) {
    logErr_(CMB_ETAPA, 'Combos depurados: ' + String(e.message || e).split('\n')[0]); flushLog_();
    dlgInfo_('Combos', 'No se pudo: ' + String(e.message || e).split('\n')[0], 'error');
  }
}
