/**
 * ============================================================
 *  Wfs — propuesta de envio a WFS (traspaso de WFS 1.0 v3.8)
 * ============================================================
 *
 *  La LOGICA es la de WFS 1.0 (code.gs / Auto.gs / VentasSite.gs), copiada tal cual
 *  y verificada contra la hoja WFS de "Inventarios WM". Lo unico que cambia es de
 *  DONDE lee, porque ahora todo vive en este libro:
 *    - ventas 30 dias  -> hoja "Ventas 30 dias"        (antes: otro libro)
 *    - publicaciones enlazadas -> hoja "Variantes"      (antes: otro libro)
 *    - estatus, precio y piezas en WFS -> hojas "Walmart" + "Bloqueados" (antes: API INVENTARIO / Concentrado de WFS 1.0)
 *    - stock Odoo (TOTAL) -> "Inventario Actual" LIBRE por SKU base (los -MSI-CVA quedan en 0, igual que antes)
 *
 *  Reglas (25/09/2026): ventas de 30 dias, cobertura de 21 dias en WFS; lo que vende la
 *  clasica (y sus -2..-9) se suma al -MSI que mas vende; las clasicas SIN -MSI llevan su
 *  propio envio; el stock de Odoo se reparte una vez por producto, primero al que mas
 *  vende; RESERVA_ODOO = 0; si no alcanza manda lo que hay; lo que va en transito no se
 *  cuenta; -OB / -OPENBOX nunca se juntan con el original; enlazadas: stock del dueno,
 *  objetivo unico, reparto mitad y mitad.
 *  28/10/2026: un producto con VARIAS -MSI publicadas (-MSI, -MSI-2...) manda WFS a todas, repartido por lo que vende cada una
 *  (objetivo del producto = ventas totales x 21/30; cada -MSI recibe su parte, minimo WFS_PRESENCIA_MIN).
 *
 *  Archivos: Wfs.gs (calculo, menu, automatico, estado) · WfsEnvios.gs (nuevo envio, archivar) ·
 *  WfsHoja.gs (traer la hoja de Inventarios WM y sus formulas).
 * ============================================================
 */

const WFS_CONFIG = {
  VERSION: '3.8-SS',
  ZONA: 'America/Mexico_City',
  HOJA: 'WFS',
  HOJA_CONCENTRADO: 'Concentrado',
  HOJA_INVENTARIO: 'Inventario Actual',
  HOJA_WALMART: 'Walmart',
  HOJA_BLOQUEADOS: 'Bloqueados',
  HOJA_VARIANTES: 'Variantes',
  VAR_COL_SKU: 'SKU WALMART',
  VAR_COL_ASIG: 'ASIGNACION MANUAL',
  DIAS_VENTA: 30,       // periodo de las ventas
  DIAS_COBERTURA: 21,   // dias que debe aguantar WFS
  RESERVA_ODOO: 0,      // piezas que siempre se quedan en Odoo (0 = se puede vaciar)
  VENDIDOS_DIAS: 30,
  FILAS_FX: 400,        // las formulas de la hoja WFS leen hasta esta fila (WFS 1.0: 219)
  // Historicos y catalogos del envio (se crean nuevos aqui con 📥 Crear hoja WFS (formato de Inventarios WM))
  HOJA_HIST: 'HISTORICO ENVIOS',
  HOJA_HIST_CHOF: 'HISTORICO CHOFERES',
  HOJA_HIST_CAM: 'HISTORICO CAMIONETAS',
  HOJA_CAT_CHOF: 'CATALOGO CHOFERES',
  HOJA_CAT_CAM: 'CATALOGO CAMIONETAS',
  // Cabecera fija de la hoja de envio (confirmado por el dueno 30/09/2026)
  RAZON_SOCIAL: 'PROMOTORA RESTREPO SA DE CV',
  SELLER: 'ELECTRONICS.MEXICO',
  CORREO_QR: 'victor.walmart.04@gmail.com',
  // Marcadores de la fila 1 de la hoja WFS (se buscan por texto)
  MARCA_VENTAS: 'VENTIAPP',
  MARCA_MSI: 'MSI MÁS VENTAS',
  MARCA_CLASICA: 'CLÁSICA MÁS VENTAS',
};

const WFS_RE_MSI = /-MSI(-\d{1,2})?$/i;                 // premium: -MSI, -MSI-2 ... -MSI-99
const WFS_RE_BASE = /-(MSI(-\d{1,2})?|[2-9])$/i;
const WFS_RE_ALTERNA = /-[2-9]$/;
// Piezas minimas que debe tener en WFS cada -MSI publicada cuando un producto tiene varias (para que cualquiera pueda llevar killer)
const WFS_PRESENCIA_MIN = 1;

/* REGLA DE WFS: solo se envian publicaciones PREMIUM (SKU que termina en -MSI o -MSI-2 ... -MSI-99) y NUNCA CVA
   (ni "-CVA", ni "-MSI-CVA", ni "-CVA-MSI"). Una clasica o una CVA en un envio WFS puede traer problemas con Walmart. */
function wfsEsCva_(sku) { return /(^|-)CVA(-|$)/i.test(String(sku || '').trim()); }
function wfsEsPremium_(sku) { return /-MSI(-\d{1,2})?$/i.test(String(sku || '').trim()); }
/** '' si el SKU SI puede ir a WFS; si no, el motivo. cat (opcional) = categoria del producto. */
function wfsMotivoNoWfs_(sku, cat) {
  if (wfsEsCva_(sku)) return 'es CVA: a WFS nunca se envia CVA';
  if (!wfsEsPremium_(sku)) return 'es clasica (no termina en -MSI): a WFS solo van premium';
  try { var r = typeof wfsRestriccionDe_ === 'function' ? wfsRestriccionDe_(sku, cat) : ''; if (r) return r; } catch (e) { /* sin hoja de restricciones: solo las reglas fijas */ }
  return '';
}

function wfsMarcadores_() {
  const c = WFS_CONFIG;
  return [c.MARCA_VENTAS, c.MARCA_MSI, c.MARCA_CLASICA, 'PROPUESTA', 'ENVIO FINAL'];
}



const WFS_VENTAS_SITE = {
  HOJA: 'Ventas 30 dias',
  MAX_HORAS: 3,             // mas viejo que esto = no se calcula (falla en rojo)
  FILA_ENC_TOPE: 8,
  ENC: {
    SKU:        ['SKU', 'SKU DEL CANAL', 'SKU CANAL', 'SKU WALMART'],
    PIEZAS:     ['PIEZAS', 'CANTIDAD', 'VENDIDAS', 'UNIDADES', 'QTY'],
    PRODUCTO:   ['PRODUCTO', 'NOMBRE', 'TITULO', 'DESCRIPCION', 'PRODUCT NAME'],
    ACTUALIZADO:['ACTUALIZADO', 'ACTUALIZACION', 'ULTIMA ACTUALIZACION', 'FECHA ACTUALIZACION', 'BAJADO', 'HORA'],
    DESDE:      ['DESDE'],
    HASTA:      ['HASTA'],
  },
  DIAS_VENTANA_MIN: 25,
  DIAS_VENTANA_MAX: 35,
};



// ------------------------------------------------------------
// CATALOGO: lo que antes eran API INVENTARIO + Concentrado de WFS 1.0, ahora desde este libro.
//   SKU, estatus, precio y piezas en WFS <- hoja Walmart + hoja Bloqueados (juntas son todo el inventario
//                                           del dashboard; WFS 1.0 tambien usaba los bloqueados)
//   cupon (informativo)                  <- Concentrado (CUPON)
//   total = stock Odoo                   <- Inventario Actual (LIBRE) buscado por SKU BASE (sin -MSI / -MSI-2..9 / -2..9),
//                                           primer renglon que coincida; si no hay, 0 (igual que el Concentrado de WFS 1.0:
//                                           por eso los -MSI-CVA quedan en 0)
// Todo por ENCABEZADO.
// ------------------------------------------------------------
function wfsLeerCatalogo_() {
  const c = WFS_CONFIG;
  const ss = SpreadsheetApp.getActive();
  const hI = ss.getSheetByName(c.HOJA_INVENTARIO);
  if (!hI) throw new Error("No existe la hoja '" + c.HOJA_INVENTARIO + "'");

  const out = { sku: {}, msiPorBase: {} };
  const stock = {};   // base -> LIBRE (el primero que aparece)
  if (hI.getLastRow() >= 2) {
    const mi = colsHoja_(hI, ['SKU', 'LIBRE']);
    hI.getRange(2, 1, hI.getLastRow() - 1, hI.getLastColumn()).getValues().forEach(function (f) {
      const k = String(f[mi.SKU] || '').trim().toUpperCase();
      if (!k) return;
      const b = k.replace(WFS_RE_BASE, '');
      if (!(b in stock)) stock[b] = wfsNum_(f[mi.LIBRE]);
    });
  }

  const cupon = {};
  const hC = ss.getSheetByName(c.HOJA_CONCENTRADO);
  if (hC && hC.getLastRow() >= 2) {
    const mc = colsHoja_(hC, ['SKU', 'CUPON']);
    hC.getRange(2, 1, hC.getLastRow() - 1, hC.getLastColumn()).getValues().forEach(function (r) {
      const k = String(r[mc.SKU] || '').trim().toUpperCase();
      if (k) cupon[k] = r[mc.CUPON];
    });
  }

  let hojas = 0;
  [c.HOJA_WALMART, c.HOJA_BLOQUEADOS].forEach(function (nombre) {
    const h = ss.getSheetByName(nombre);
    if (!h) { if (nombre === c.HOJA_WALMART) throw new Error("No existe la hoja '" + nombre + "'"); return; }
    if (h.getLastRow() < 2) return;
    hojas++;
    const m = colsHoja_(h, ['SKU', 'ESTATUS', 'PRECIO', 'WFS']);
    h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues().forEach(function (r) {
      const s = String(r[m.SKU] || '').trim();
      if (!s || s.toUpperCase() === 'SKU') return;
      const k = s.toUpperCase();
      if (out.sku[k]) return;                       // Walmart manda sobre Bloqueados
      out.sku[k] = {
        sku: s,
        estado: String(r[m.ESTATUS] || '').trim().toUpperCase(),
        precio: r[m.PRECIO],
        cupon: (k in cupon) ? cupon[k] : '',
        wfs: wfsNum_(r[m.WFS]),
        total: stock[k.replace(WFS_RE_BASE, '')] || 0,
      };
      if (WFS_RE_MSI.test(k)) {
        const base = k.replace(WFS_RE_BASE, '');
        (out.msiPorBase[base] = out.msiPorBase[base] || []).push(k);
      }
    });
  });
  return out;
}


// ---- AYUDAS DE COLUMNAS (de WFS 1.0 Columnas.gs; busqueda por NOMBRE de encabezado, acotada al bloque)
function wfsEnc_(sh, fila) {
  const n = Math.max(sh.getLastColumn(), 1);
  return sh.getRange(fila || 1, 1, 1, n).getDisplayValues()[0].map(normEnc_);
}

function wfsBuscarCol_(enc, nombre, opts) {
  opts = opts || {};
  const meta = normEnc_(nombre);
  const desde = Math.max(1, opts.desde || 1);
  const hasta = Math.min(enc.length, opts.hasta || enc.length);
  const quiero = opts.ocurrencia || 1;
  let vistas = 0;

  for (let i = desde - 1; i < hasta; i++) {
    const h = enc[i];
    const pega = opts.contiene ? (h.indexOf(meta) >= 0) : (h === meta);
    if (pega && ++vistas === quiero) return i + 1;
  }
  return 0;
}

function wfsExigirCol_(enc, nombre, hoja, opts) {
  const cc = wfsBuscarCol_(enc, nombre, opts);
  if (cc) return cc;
  const o = opts || {};
  const donde = (o.desde || o.hasta)
    ? ' (entre ' + colLetra_(o.desde || 1) + ' y ' + colLetra_(o.hasta || enc.length) + ')'
    : '';
  throw new Error(
    "En la hoja '" + hoja + "' no encuentro la columna con encabezado '" + nombre + "'" + donde + '.\n' +
    'El script busca por NOMBRE de encabezado, no por letra: si la renombraste, ' +
    'ponle otra vez ese texto; si la moviste, no hay problema, solo tiene que existir.\n' +
    'Corre 🩺 Diagnóstico > 🧭 Revisar columnas de todas las hojas.'
  );
}

function wfsIdxEnc_(arr, nombre, ocurrencia) {
  const meta = normEnc_(nombre);
  const quiero = ocurrencia || 1;
  let vistas = 0;
  for (let i = 0; i < arr.length; i++) {
    if (normEnc_(arr[i]) === meta && ++vistas === quiero) return i + 1;
  }
  throw new Error("El arreglo de encabezados no trae '" + nombre + "' (ocurrencia " + quiero + ')');
}

function wfsFinBloque_(fila1, colInicio, marcadores) {
  const metas = marcadores.map(normEnc_);
  for (let i = colInicio; i < fila1.length; i++) {
    const h = fila1[i];
    if (!h) continue;
    for (let k = 0; k < metas.length; k++) {
      if (metas[k] && h.indexOf(metas[k]) >= 0) return i;   // 1-based: la de antes
    }
  }
  return fila1.length;
}

function wfsFilaEnc_(sh, ancla, tope) {
  const n = Math.max(sh.getLastColumn(), 1);
  const alto = Math.min(tope || 6, Math.max(sh.getLastRow(), 1));
  const datos = sh.getRange(1, 1, alto, n).getDisplayValues();
  const meta = normEnc_(ancla);
  for (let f = 0; f < datos.length; f++) {
    for (let i = 0; i < datos[f].length; i++) {
      if (normEnc_(datos[f][i]) === meta) return f + 1;
    }
  }
  return 0;
}

// ---- CALCULO (code.gs de WFS 1.0)
function wfsCalcularHoja_() {
  const t0 = Date.now();
  logStart_('CALCULO', 'Calcular envío WFS');
  const c = WFS_CONFIG;
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(c.HOJA);
  if (!sh) throw new Error("No existe la hoja '" + c.HOJA + "'");

  const cols = wfsUbicarBloques_(sh);
  const cat = wfsLeerCatalogo_();
  const ventas = wfsLeerVentas_(sh, cols);
  if (ventas.filas === 0) throw new Error('No hay ventas pegadas en la hoja ' + c.HOJA + '.');

  wfsRespaldarUnaVez_(ss, sh, cols);

  // ── 1. Agrupar ventas por producto base ──────────────────
  const productos = {};   // base -> {msi:{KEY:qty}, cla:{KEY:qty}}
  Object.keys(ventas.porSku).forEach(function (k) {
    const base = k.replace(WFS_RE_BASE, '');
    if (!productos[base]) productos[base] = { msi: {}, cla: {} };
    productos[base][WFS_RE_MSI.test(k) ? 'msi' : 'cla'][k] = ventas.porSku[k];
  });

  // ── 2. Juntar las publicaciones ENLAZADAS en una sola familia ──
  // Variantes!ASIGNACION MANUAL (Sheet Site) dice que una publicacion vive
  // del inventario de otra. El stock es UNO SOLO, el del dueno, y las piezas
  // se reparten MITAD Y MITAD entre las publicaciones enlazadas.
  const asig = wfsLeerAsignados_();
  logInfo_('CALCULO', 'Asignados leídos: ' + Object.keys(asig).length, asig);
  const grupos = {};      // dueno -> [bases]
  Object.keys(productos).forEach(function (base) {
    const dueno = wfsDuenoDe_(asig, base);
    (grupos[dueno] = grupos[dueno] || []).push(base);
  });
  // El dueno entra al grupo aunque no haya vendido nada
  Object.keys(grupos).forEach(function (d) {
    if (grupos[d].indexOf(d) < 0 && cat.msiPorBase[d]) grupos[d].push(d);
  });

  const filasMsi = [];
  const filasCla = [];
  let totalEnvio = 0;
  let totalSinMsi = 0;
  let enlazados = 0;
  const avisos = [];
  const cuenta = {};
  const anota = function (estado) {
    const clave = estado.split(' ·')[0].replace(/ \d+ DÍAS$/, '');
    cuenta[clave] = (cuenta[clave] || 0) + 1;
  };

  Object.keys(grupos).forEach(function (dueno) {
    const bases = grupos[dueno];
    const esFamilia = bases.length > 1;

    // Stock: SIEMPRE el del dueno del inventario. Nunca se suman los stocks
    // de las enlazadas: es el mismo inventario contado dos veces.
    let stock = 0;
    const verStock = function (b) {
      const p = productos[b] || { msi: {}, cla: {} };
      (cat.msiPorBase[b] || []).concat(Object.keys(p.msi), Object.keys(p.cla), [b])
        .forEach(function (k) { if (cat.sku[k]) stock = Math.max(stock, cat.sku[k].total); });
    };
    verStock(dueno);
    if (!stock && !esFamilia) bases.forEach(verStock);

    // ── Cada base arma su principal y sus clasicas ──
    const info = [];
    let demandaFamilia = 0;

    bases.forEach(function (base) {
      const p = productos[base] || { msi: {}, cla: {} };
      const ventasCla = wfsSumar_(p.cla);
      const claBase = {};
      Object.keys(p.cla).forEach(function (k) {
        const cb = k.replace(WFS_RE_ALTERNA, '');
        claBase[cb] = (claBase[cb] || 0) + p.cla[k];
      });
      const cands = (cat.msiPorBase[base] || []).slice();
      Object.keys(p.msi).forEach(function (k) { if (cands.indexOf(k) < 0) cands.push(k); });
      demandaFamilia += ventasCla + wfsSumar_(p.msi);

      if (!cands.length) {
        info.push({ base: base, principal: null, cands: [], claBase: claBase, msi: p.msi, ventasCla: ventasCla });
        return;
      }
      // El principal es EL QUE MAS VENDE. Empates: publicado > mas WFS > nombre corto.
      const orden = cands.slice().sort(function (a, b) {
        return ((p.msi[b] || 0) - (p.msi[a] || 0)) ||
          (wfsPublicado_(cat, b) - wfsPublicado_(cat, a)) ||
          (wfsDe_(cat, b) - wfsDe_(cat, a)) ||
          (a.length - b.length);
      });
      const principal = orden[0];
      if (ventasCla > 0 && (!cat.sku[principal] || !wfsPublicado_(cat, principal))) {
        const vivo = cands.filter(function (k) { return cat.sku[k] && wfsPublicado_(cat, k); });
        if (vivo.length) avisos.push(wfsNombre_(cat, principal) + ' (el que más vende) no se puede surtir; ' +
          'hay otro publicado: ' + wfsNombre_(cat, vivo[0]));
      }
      info.push({ base: base, principal: principal, cands: cands, claBase: claBase, msi: p.msi, ventasCla: ventasCla });
    });

    const conMsi = info.filter(function (x) { return x.principal; });

    // ── Clasicas sin ninguna publicacion -MSI en toda la familia ──
    if (!conMsi.length) {
      let dispCla = Math.max(0, stock - c.RESERVA_ODOO);
      const todas = [];
      info.forEach(function (x) {
        Object.keys(x.claBase).forEach(function (cb) { todas.push([cb, x.claBase[cb]]); });
      });
      todas.sort(function (a, b) { return b[1] - a[1]; }).forEach(function (par) {
        const cb = par[0], q = par[1];
        const wfs = wfsDe_(cat, cb);
        const falta = Math.max(0, Math.ceil(q * c.DIAS_COBERTURA / c.DIAS_VENTA) - wfs);
        let envio = 0;
        let estado = 'SIN PUBLICACIÓN -MSI';
        if (falta > 0 && stock <= c.RESERVA_ODOO) estado += ' · SIN STOCK ODOO';
        else if (falta > 0) {
          envio = Math.min(falta, dispCla);
          dispCla -= envio;
          if (envio < falta) estado += ' · faltan ' + (falta - envio);
        }
        totalEnvio += envio;
        totalSinMsi += envio;
        anota('SIN PUBLICACIÓN -MSI');
        filasCla.push(wfsFilaClasica_(cb, q, cat, stock, envio, estado));
      });
      return;
    }

    // ── Clasicas informativas: su venta ya se fue al -MSI ──
    info.forEach(function (x) {
      const dest = x.principal || conMsi[0].principal;
      Object.keys(x.claBase).forEach(function (cb) {
        filasCla.push(wfsFilaClasica_(cb, x.claBase[cb], cat, stock, null, 'SUMADO A ' + wfsNombre_(cat, dest)));
      });
    });

    let disponible = Math.max(0, stock - c.RESERVA_ODOO);

    // ════ FAMILIA ENLAZADA: un solo objetivo, reparto en partes iguales ════
    if (esFamilia) {
      enlazados += conMsi.length;
      const surtibles = conMsi.filter(function (x) {
        return cat.sku[x.principal] && wfsPublicado_(cat, x.principal);
      });
      let wfsFamilia = 0;
      conMsi.forEach(function (x) { wfsFamilia += wfsDe_(cat, x.principal); });
      const objetivo = Math.ceil(demandaFamilia * c.DIAS_COBERTURA / c.DIAS_VENTA);
      const faltaFamilia = Math.max(0, objetivo - wfsFamilia);

      surtibles.sort(function (a, b) {
        return (wfsSumar_(b.msi) + b.ventasCla) - (wfsSumar_(a.msi) + a.ventasCla);
      });
      const n = surtibles.length || 1;
      const parte = Math.floor(faltaFamilia / n);
      let resto = faltaFamilia - parte * n;
      const cuota = {};
      surtibles.forEach(function (x) {
        cuota[x.principal] = parte + (resto > 0 ? 1 : 0);
        if (resto > 0) resto--;
      });

      const nota = ' · enlazado con ' + dueno;
      conMsi.forEach(function (x) {
        const k = x.principal;
        const dem = wfsSumar_(x.msi) + x.ventasCla;
        const wfs = wfsDe_(cat, k);
        const meta = cuota[k] || 0;
        let envio = 0, estado;
        if (!cat.sku[k]) estado = 'NO ESTÁ EN CONCENTRADO';
        else if (!wfsPublicado_(cat, k)) estado = 'MSI NO PUBLICADO';
        else if (faltaFamilia === 0) estado = 'WFS ALCANZA ' + c.DIAS_COBERTURA + ' DÍAS';
        else if (stock <= c.RESERVA_ODOO) estado = 'SIN STOCK ODOO';
        else {
          envio = Math.min(meta, disponible);
          disponible -= envio;
          estado = envio === meta ? 'ENVIAR' :
            (envio > 0 ? 'PARCIAL · faltan ' + (meta - envio) : 'SIN STOCK ODOO SUFICIENTE');
        }
        totalEnvio += envio;
        anota(estado);
        filasMsi.push({
          sku: wfsNombre_(cat, k), ventas: dem, precio: wfsDato_(cat, k, 'precio'),
          killer: wfsDato_(cat, k, 'cupon'), wfs: wfs, stock: stock,
          envio: envio, estado: estado + nota,
        });
      });
      // Las otras variantes -MSI-N de la familia no llevan envio propio
      conMsi.forEach(function (x) {
        x.cands.forEach(function (k) {
          if (k === x.principal || !(x.msi[k] > 0)) return;
          anota('ENLAZADO');
          filasMsi.push({
            sku: wfsNombre_(cat, k), ventas: x.msi[k], precio: wfsDato_(cat, k, 'precio'),
            killer: wfsDato_(cat, k, 'cupon'), wfs: wfsDe_(cat, k), stock: stock,
            envio: 0, estado: 'ENLAZADO · se surte por ' + wfsNombre_(cat, x.principal),
          });
        });
      });
      return;
    }

    // ════ CASO NORMAL: un producto con una o varias publicaciones -MSI ════
    const x = conMsi[0];
    const demanda = {};
    x.cands.forEach(function (k) { demanda[k] = x.msi[k] || 0; });
    demanda[x.principal] += x.ventasCla;

    // Publicaciones VETADAS para WFS (hoja Restricciones WFS, CVA...): no reciben envio y su venta pasa a la hermana permitida que mas vende
    const vetadas = x.cands.filter(function (k) { return !!wfsMotivoNoWfs_(wfsNombre_(cat, k)); });
    if (vetadas.length) {
      const permitidas = x.cands.filter(function (k) { return vetadas.indexOf(k) < 0; });
      const ventaVet = {};
      vetadas.forEach(function (k) { ventaVet[k] = demanda[k]; });
      const filaVet = function (k) {
        anota('RESTRINGIDO PARA WFS');
        filasMsi.push({ sku: wfsNombre_(cat, k), ventas: ventaVet[k], precio: wfsDato_(cat, k, 'precio'), killer: wfsDato_(cat, k, 'cupon'), wfs: wfsDe_(cat, k), stock: stock, envio: 0, estado: 'RESTRINGIDO PARA WFS · ' + wfsMotivoNoWfs_(wfsNombre_(cat, k)) });
      };
      if (!permitidas.length) { vetadas.forEach(filaVet); return; }
      const dest = permitidas.slice().sort(function (a, b) {
        return (demanda[b] - demanda[a]) || (wfsPublicado_(cat, b) - wfsPublicado_(cat, a)) || (a.length - b.length);
      })[0];
      vetadas.forEach(function (k) { demanda[dest] += demanda[k]; demanda[k] = 0; });
      if (vetadas.indexOf(x.principal) >= 0) x.principal = dest;
      x.cands = permitidas;
      vetadas.forEach(filaVet);
    }

    // Varias -MSI publicadas del MISMO producto (-MSI, -MSI-2...): TODAS reciben WFS (para poder dar killer a cualquiera)
    // y el reparto sigue lo que vende cada una: la que mas vende se lleva mas y asi se ve cual publicacion funciona.
    const surt = x.cands.filter(function (k) { return cat.sku[k] && wfsPublicado_(cat, k); });
    const demTot = x.cands.reduce(function (a, k) { return a + demanda[k]; }, 0);
    if (surt.length >= 2 && demTot > 0 && stock > c.RESERVA_ODOO) {
      const objetivoTot = Math.ceil(demTot * c.DIAS_COBERTURA / c.DIAS_VENTA);
      const meta = {};
      surt.forEach(function (k) {   // meta de cada una = su parte (por ventas) del objetivo, y nunca menos que la presencia minima
        meta[k] = Math.max(WFS_PRESENCIA_MIN, Math.ceil(objetivoTot * demanda[k] / demTot));
      });
      surt.slice().sort(function (a, b) { return (demanda[b] - demanda[a]) || (wfsDe_(cat, a) - wfsDe_(cat, b)); }).forEach(function (k) {
        const wfs = wfsDe_(cat, k), falta = Math.max(0, meta[k] - wfs);
        let envio = 0, estado;
        if (falta === 0) estado = 'WFS ALCANZA ' + c.DIAS_COBERTURA + ' DÍAS';
        else {
          envio = Math.min(falta, disponible);
          disponible -= envio;
          estado = envio === falta ? 'ENVIAR' : (envio > 0 ? 'PARCIAL · faltan ' + (falta - envio) : 'SIN STOCK ODOO SUFICIENTE');
        }
        totalEnvio += envio;
        anota(estado);
        filasMsi.push({
          sku: wfsNombre_(cat, k), ventas: demanda[k], precio: wfsDato_(cat, k, 'precio'),
          killer: wfsDato_(cat, k, 'cupon'), wfs: wfs, stock: stock,
          envio: envio, estado: estado + ' · reparto por ventas entre ' + surt.length + ' -MSI',
        });
      });
      // Las -MSI que existen pero no se pueden surtir (no publicadas o fuera de Concentrado) se avisan, sin envio
      x.cands.forEach(function (k) {
        if (surt.indexOf(k) >= 0 || !(demanda[k] > 0)) return;
        const estado = !cat.sku[k] ? 'NO ESTÁ EN CONCENTRADO' : 'MSI NO PUBLICADO';
        anota(estado);
        filasMsi.push({ sku: wfsNombre_(cat, k), ventas: demanda[k], precio: wfsDato_(cat, k, 'precio'), killer: wfsDato_(cat, k, 'cupon'), wfs: wfsDe_(cat, k), stock: stock, envio: 0, estado: estado });
      });
      return;
    }

    x.cands.slice()
      .sort(function (a, b) { return demanda[b] - demanda[a]; })
      .forEach(function (k) {
        const dem = demanda[k];
        // El principal siempre sale, aunque no venda, para que la regla roja
        // de la columna V encuentre su -MSI
        if (dem <= 0 && k !== x.principal) return;
        const wfs = wfsDe_(cat, k);
        const objetivo = Math.ceil(dem * c.DIAS_COBERTURA / c.DIAS_VENTA);
        const falta = Math.max(0, objetivo - wfs);
        let envio = 0;
        let estado;
        if (!cat.sku[k]) estado = 'NO ESTÁ EN CONCENTRADO';
        else if (!wfsPublicado_(cat, k)) estado = 'MSI NO PUBLICADO';
        else if (falta === 0) estado = 'WFS ALCANZA ' + c.DIAS_COBERTURA + ' DÍAS';
        else if (stock <= c.RESERVA_ODOO) estado = 'SIN STOCK ODOO';
        else {
          envio = Math.min(falta, disponible);
          disponible -= envio;
          estado = envio === falta ? 'ENVIAR' :
            (envio > 0 ? 'PARCIAL · faltan ' + (falta - envio) : 'SIN STOCK ODOO SUFICIENTE');
        }
        totalEnvio += envio;
        anota(estado);
        filasMsi.push({
          sku: wfsNombre_(cat, k), ventas: dem, precio: wfsDato_(cat, k, 'precio'),
          killer: wfsDato_(cat, k, 'cupon'), wfs: wfs, stock: stock,
          envio: envio, estado: estado,
        });
      });
  });

  filasMsi.sort(function (a, b) { return (b.envio - a.envio) || (b.ventas - a.ventas); });
  filasCla.sort(function (a, b) { return b[1] - a[1]; });

  logInfo_('CALCULO', 'Resultado del cálculo',
    { skusMsi: filasMsi.length, skusClasica: filasCla.length, piezas: totalEnvio });
  wfsEscribirBloques_(sh, cols, filasMsi, filasCla);
  logOk_('CALCULO', 'Bloques MSI y CLÁSICA escritos en la hoja ' + c.HOJA);

  const lineas = [];
  lineas.push('• Ventas leídas: ' + ventas.filas + ' filas, ' + Object.keys(ventas.porSku).length + ' SKUs');
  if (ventas.ignoradas) lineas.push('• Ignoradas (sin SKU o cantidad): ' + ventas.ignoradas);
  lineas.push('• Filas -MSI: ' + filasMsi.length + ' · clásicas: ' + filasCla.length +
    (enlazados ? ' · ' + enlazados + ' enlazadas' : ''));
  Object.keys(cuenta).sort().forEach(function (k) { lineas.push('   ' + k + ': ' + cuenta[k]); });
  lineas.push('• TOTAL A ENVIAR: ' + totalEnvio + ' piezas' +
    (totalSinMsi ? ' (' + totalSinMsi + ' en clásicas sin -MSI)' : ''));
  if (filasMsi.length > c.FILAS_FX - 1 || filasCla.length > c.FILAS_FX - 1) {
    lineas.push('⚠ Más de ' + (c.FILAS_FX - 1) + ' filas: las fórmulas de ENVÍO FINAL solo leen hasta la ' + c.FILAS_FX + '.');
  }
  avisos.forEach(function (a) { lineas.push('⚠ ' + a); });
  lineas.push('⏱ ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s · v' + c.VERSION);
  return lineas.join('\n');
}

// ---- ASIGNADOS (publicaciones enlazadas)
function wfsLeerAsignados_() {
  const c = WFS_CONFIG;
  const mapa = {};
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(c.HOJA_VARIANTES);
    if (!sh) return mapa;
    const last = sh.getLastRow();
    if (last < 2) return mapa;
    const nCols = sh.getLastColumn();
    const enc = sh.getRange(1, 1, 1, nCols).getDisplayValues()[0]
      .map(function (v) { return String(v || '').trim().toUpperCase(); });
    const iSku = enc.indexOf(c.VAR_COL_SKU);
    const iAsig = enc.indexOf(c.VAR_COL_ASIG);
    if (iSku < 0 || iAsig < 0) return mapa;
    const data = sh.getRange(2, 1, last - 1, nCols).getDisplayValues();
    data.forEach(function (r) {
      const sku = String(r[iSku] || '').trim().toUpperCase();
      const asig = String(r[iAsig] || '').trim().toUpperCase();
      if (!sku || !asig) return;
      const base = sku.replace(WFS_RE_BASE, '');
      const dueno = asig.replace(WFS_RE_BASE, '');
      if (base && dueno && base !== dueno) mapa[base] = dueno;
    });
  } catch (e) {
    logWarn_('ASIGNADOS', 'No pude leer Variantes: ' + e.message);
  }
  return mapa;
}

function wfsDuenoDe_(mapa, base) {
  let b = base;
  for (let i = 0; i < 5 && mapa[b]; i++) b = mapa[b];
  return b;
}

function wfsFilaClasica_(k, qty, cat, stock, envio, estado) {
  if (envio === null) {
    return [wfsNombre_(cat, k), qty, wfsDato_(cat, k, 'precio'), wfsDe_(cat, k), stock, '', '', estado, '', '', ''];
  }
  return [wfsNombre_(cat, k), qty, wfsDato_(cat, k, 'precio'), wfsDe_(cat, k), stock, stock - envio,
    envio, estado, stock, '#S#', envio];
}

// ---- LECTURAS / ESCRITURA DE LA HOJA WFS
function wfsUbicarBloques_(sh) {
  const c = WFS_CONFIG;
  const fila1 = wfsEnc_(sh, 1);
  const marcas = wfsMarcadores_();

  const bloque = function (marca) {
    const ini = wfsBuscarCol_(fila1, marca, { contiene: true });
    if (!ini) {
      throw new Error("En la hoja '" + c.HOJA + "' no encuentro el marcador '" + marca +
        "' en la fila 1.\nRevisa que la fila 1 de la hoja WFS tenga sus marcadores (VENTIAPP, MSI MÁS VENTAS, CLÁSICA MÁS VENTAS, PROPUESTA, ENVÍO FINAL).");
    }
    return { ini: ini, fin: wfsFinBloque_(fila1, ini, marcas) };
  };

  const bVen = bloque(c.MARCA_VENTAS);
  const bMsi = bloque(c.MARCA_MSI);
  const bCla = bloque(c.MARCA_CLASICA);

  const en = function (b, nombre, ocurrencia) {
    return wfsExigirCol_(fila1, nombre, c.HOJA, { desde: b.ini, hasta: b.fin, ocurrencia: ocurrencia });
  };

  const cols = {
    cant: en(bVen, 'CANTIDAD'),
    sku: en(bVen, 'SKU'),
    // El nombre del producto es opcional: si no esta, no se pega y ya.
    prod: wfsBuscarCol_(fila1, 'PRODUCTO', { desde: bVen.ini, hasta: bVen.fin }),
    msi: en(bMsi, 'SKU'),
    msiFin: bMsi.fin,
    cla: en(bCla, 'SKU'),
    claFin: bCla.fin,
  };
  logInfo_('COLUMNAS', 'Bloques de ' + c.HOJA + ' ubicados por encabezado', {
    cantidad: colLetra_(cols.cant), producto: cols.prod ? colLetra_(cols.prod) : '(no hay)',
    sku: colLetra_(cols.sku), msi: colLetra_(cols.msi), clasica: colLetra_(cols.cla),
  });
  return cols;
}

function wfsLeerVentas_(sh, cols) {
  const last = sh.getLastRow();
  const out = { porSku: {}, filas: 0, ignoradas: 0 };
  if (last < 2) return out;
  const cant = sh.getRange(2, cols.cant, last - 1, 1).getValues();
  const sku = sh.getRange(2, cols.sku, last - 1, 1).getValues();
  for (let i = 0; i < sku.length; i++) {
    const k = String(sku[i][0] || '').trim().toUpperCase();
    const q = Number(cant[i][0]);
    if (!k && (cant[i][0] === '' || cant[i][0] === null)) continue;
    if (!k || isNaN(q) || k === 'SKU' || k.indexOf('SUMA TOTAL') === 0) { out.ignoradas++; continue; }
    out.porSku[k] = (out.porSku[k] || 0) + q;
    out.filas++;
  }
  return out;
}

const WFS_ENC_MSI = ['SKU', 'Vendidas', 'Precio', 'Killer', 'WFS', 'STOCK ANTES', 'STOCK DESPUES',
  'ENVIO PROPUESTO', 'ESTADO', 'STOCK ANTES', 'STOCK DESPUES', 'Envío'];
const WFS_ENC_CLA = ['SKU', 'Vendidas', 'Precio', 'WFS', 'STOCK ANTES', 'STOCK DESPUES',
  'ENVIO PROPUESTO', 'ESTADO', 'STOCK ANTES', 'STOCK DESPUES', 'Envío'];


function wfsEscribirBloques_(sh, cols, filasMsi, filasCla) {
  const nMax = Math.max(filasMsi.length, filasCla.length) + 1;
  if (sh.getMaxRows() < nMax) sh.insertRowsAfter(sh.getMaxRows(), nMax - sh.getMaxRows());
  const alto = sh.getMaxRows();

  // Borra formulas y valores viejos de los dos bloques (el formato se queda)
  sh.getRange(1, cols.msi, alto, WFS_ENC_MSI.length).clearContent();
  sh.getRange(1, cols.cla, alto, WFS_ENC_CLA.length).clearContent();

  // --- Bloque MSI ---
  // Las dos columnas de la formula se sacan de WFS_ENC_MSI por nombre
  // (la SEGUNDA "STOCK ANTES" y "Envio"), no con un +9 y un +11 a
  // mano: asi el arreglo de arriba es la unica fuente de verdad y
  // reordenarlo no deja la formula apuntando a otra columna.
  const colR = cols.msi + wfsIdxEnc_(WFS_ENC_MSI, 'STOCK ANTES', 2) - 1;
  const colT = cols.msi + wfsIdxEnc_(WFS_ENC_MSI, 'ENVIO', 1) - 1;
  const lR = colLetra_(colR), lT = colLetra_(colT);
  const msi = [WFS_ENC_MSI].concat(filasMsi.map(function (f, i) {
    const r = i + 2;
    return [f.sku, f.ventas, f.precio, f.killer, f.wfs, f.stock, f.stock - f.envio,
      f.envio, f.estado, f.stock, '=IF(' + lT + r + '="","",' + lR + r + '-' + lT + r + ')', f.envio];
  }));
  sh.getRange(1, cols.msi, msi.length, WFS_ENC_MSI.length).setValues(msi);

  // --- Bloque CLASICA: las que tienen -MSI son informativas (su venta se
  // sumo al -MSI); las SIN PUBLICACION -MSI llevan envio en Envio (AF) ---
  const lAD = colLetra_(cols.cla + wfsIdxEnc_(WFS_ENC_CLA, 'STOCK ANTES', 2) - 1);
  const lAF = colLetra_(cols.cla + wfsIdxEnc_(WFS_ENC_CLA, 'ENVIO', 1) - 1);
  const cla = [WFS_ENC_CLA].concat(filasCla.map(function (f, i) {
    const r = i + 2;
    return f.map(function (v) {
      return v === '#S#' ? '=IF(' + lAF + r + '="","",' + lAD + r + '-' + lAF + r + ')' : v;
    });
  }));
  sh.getRange(1, cols.cla, cla.length, WFS_ENC_CLA.length).setValues(cla);
}

const WFS_RESPALDOS_RECIENTES = 4;

function wfsRespaldarUnaVez_(ss, sh, cols) {
  wfsPodarRespaldos_(ss);
  const sonda = cols.msi + wfsIdxEnc_(WFS_ENC_MSI, 'STOCK DESPUES', 2) - 1;
  const tieneFormulas = sh.getRange(2, sonda).getFormula() !== '' ||
    sh.getRange(2, cols.msi).getFormula() !== '';
  if (!tieneFormulas) return;
  const hoy = 'WFS RESPALDO ' + Utilities.formatDate(new Date(), WFS_CONFIG.ZONA, 'yyyy-MM-dd');
  const yaHayHoy = ss.getSheets().some(function (h) { return h.getName().indexOf(hoy) === 0; });
  if (yaHayHoy) return;
  const nombre = hoy + ' ' + Utilities.formatDate(new Date(), WFS_CONFIG.ZONA, 'HHmm');
  if (ss.getSheetByName(nombre)) return;
  const copia = sh.copyTo(ss).setName(nombre);
  copia.hideSheet();
}

function wfsPodarRespaldos_(ss) {
  const hojas = ss.getSheets()
    .filter(function (h) { return /^WFS RESPALDO /.test(h.getName()); })
    .sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
  if (hojas.length <= 1 + WFS_RESPALDOS_RECIENTES) return;
  const borrar = hojas.slice(1, hojas.length - WFS_RESPALDOS_RECIENTES);
  let borradas = 0;
  borrar.forEach(function (h) {
    try { ss.deleteSheet(h); borradas++; } catch (e) { /* si no se puede, se intenta en la siguiente vuelta */ }
  });
  if (borradas) logInfo_('RESPALDO', 'Respaldos viejos borrados: ' + borradas + ' (quedan ' + (hojas.length - borradas) + ')');
}

// ---- VENTAS 30 DIAS (VentasSite.gs de WFS 1.0)
function wfsVentasCol_(enc, nombres) {
  for (let i = 0; i < nombres.length; i++) {
    const cc = wfsBuscarCol_(enc, nombres[i]);
    if (cc) return cc;
  }
  return 0;
}

// Sheet Site escribe ACTUALIZADO como texto 'aaaa-mm-dd hh:mm:ss' en hora
// CDMX. Se interpreta EXPLICITAMENTE en esa zona (no con new Date(texto),
// que depende de como lo entienda el motor). Si Sheets ya lo volvio fecha
// real, se usa tal cual.
function wfsVentasFecha_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (v === '' || v === null || v === undefined) return null;
  const t = String(v).trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?$/);
  if (m) {
    const hora = m[2] ? (m[2].length <= 5 ? m[2] + ':00' : m[2]) : '00:00:00';
    try {
      return Utilities.parseDate(m[1] + ' ' + hora.replace(/^(\d):/, '0$1:'),
        WFS_CONFIG.ZONA, 'yyyy-MM-dd HH:mm:ss');
    } catch (e) { return null; }
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Lee las ventas de 30 dias de Sheet Site.
 * Devuelve { filas: [[piezas, producto, sku], ...] (SKU sumados, de mayor a
 * menor), piezas, actualizado: Date|null, horas: number|null, hoja }.
 * Truena con un mensaje claro si no hay hoja, faltan columnas o los datos
 * estan viejos: nunca calcula en silencio con ventas de hace dias.
 */
function wfsLeerVentasSite_() {
  const c = WFS_CONFIG, v = WFS_VENTAS_SITE;
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(v.HOJA);
  if (!sh) {
    throw new Error("No existe la hoja '" + v.HOJA + "'.\n" +
      'Corre 📈 Bajar ventas 30 dias.');
  }

  const filaEnc = wfsFilaEnc_(sh, 'SKU', v.FILA_ENC_TOPE) ||
    (function () {
      for (let i = 1; i < v.ENC.SKU.length; i++) {
        const f = wfsFilaEnc_(sh, v.ENC.SKU[i], v.FILA_ENC_TOPE);
        if (f) return f;
      }
      return 0;
    })();
  if (!filaEnc) {
    throw new Error("En '" + v.HOJA + "' no encuentro la fila de encabezados (busco SKU en las primeras " +
      v.FILA_ENC_TOPE + ' filas).');
  }
  const enc = wfsEnc_(sh, filaEnc);
  const cSku = wfsVentasCol_(enc, v.ENC.SKU);
  const cQty = wfsVentasCol_(enc, v.ENC.PIEZAS);
  const cNom = wfsVentasCol_(enc, v.ENC.PRODUCTO);        // opcional
  const cAct = wfsVentasCol_(enc, v.ENC.ACTUALIZADO);     // opcional, pero se avisa
  const cDes = wfsVentasCol_(enc, v.ENC.DESDE);           // opcional
  const cHas = wfsVentasCol_(enc, v.ENC.HASTA);           // opcional
  if (!cSku) throw new Error("En '" + v.HOJA + "' falta la columna SKU (acepto: " + v.ENC.SKU.join(', ') + ').');
  if (!cQty) throw new Error("En '" + v.HOJA + "' falta la columna de piezas (acepto: " + v.ENC.PIEZAS.join(', ') + ').');

  const last = sh.getLastRow();
  if (last <= filaEnc) throw new Error("La hoja '" + v.HOJA + "' no trae filas de datos.");
  const nC = sh.getLastColumn();
  const datos = sh.getRange(filaEnc + 1, 1, last - filaEnc, nC).getValues();

  const mapa = {};
  let sinSku = 0, maxAct = null, desde = null, hasta = null;
  datos.forEach(function (r) {
    if (cDes && !desde) desde = wfsVentasFecha_(r[cDes - 1]);
    if (cHas && !hasta) hasta = wfsVentasFecha_(r[cHas - 1]);
    if (cAct) {
      const d = wfsVentasFecha_(r[cAct - 1]);
      if (d && (!maxAct || d > maxAct)) maxAct = d;
    }
    const sku = String(r[cSku - 1] === undefined ? '' : r[cSku - 1]).trim();
    const q = Number(String(r[cQty - 1]).replace(/,/g, '')) || 0;
    if (!sku) { if (q > 0) sinSku++; return; }
    if (q <= 0) return;
    const nom = cNom ? String(r[cNom - 1] || '').trim() : '';
    if (!mapa[sku]) mapa[sku] = [0, nom, sku];
    mapa[sku][0] += q;
    if (!mapa[sku][1] && nom) mapa[sku][1] = nom;   // col-fija: arreglo propio [piezas, producto, sku]
  });

  const filas = Object.keys(mapa).map(function (k) { return mapa[k]; });
  filas.sort(function (a, b) { return b[0] - a[0]; });
  if (!filas.length) throw new Error("La hoja '" + v.HOJA + "' no trae SKUs con piezas.");
  let piezas = 0;
  filas.forEach(function (f) { piezas += f[0]; });

  const horas = maxAct ? (Date.now() - maxAct.getTime()) / 3600000 : null;
  if (horas !== null && horas > v.MAX_HORAS) {
    throw new Error("Las ventas de 30 días tienen " + horas.toFixed(1) + ' h sin actualizarse (tope ' +
      v.MAX_HORAS + ' h; última: ' + Utilities.formatDate(maxAct, c.ZONA, 'yyyy-MM-dd HH:mm') + ').\n' +
      'No calculé nada para no mandar con datos viejos. Revisa la bajada de ventas.');
  }
  if (desde && hasta) {
    const dias = Math.round((hasta.getTime() - desde.getTime()) / 86400000);
    if (dias < v.DIAS_VENTANA_MIN || dias > v.DIAS_VENTANA_MAX) {
      logWarn_('VENTAS', 'La ventana de ventas de Sheet Site es de ' + dias + ' días (esperaba ~30)');
    }
  }
  if (horas === null) {
    logWarn_('VENTAS', "La hoja '" + v.HOJA + "' no trae columna de hora de actualización (" +
      v.ENC.ACTUALIZADO.join(' / ') + '): no puedo verificar qué tan frescas son las ventas');
  }
  return { filas: filas, piezas: piezas, sinSku: sinSku, actualizado: maxAct, horas: horas, hoja: v.HOJA };
}

function wfsTraerVentas_() {
  const c = WFS_CONFIG;
  logStart_('VENTAS', 'Traer ventas de la hoja Ventas 30 dias (' + c.VENDIDOS_DIAS + ' días)');
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(c.HOJA);
  if (!sh) throw new Error("No existe la hoja '" + c.HOJA + "'");

  // Las ventas las baja Sheet Site; aqui solo se leen (VentasSite.gs).
  const lec = wfsLeerVentasSite_();
  const filas = lec.filas;
  const piezas = lec.piezas;
  const sinSku = lec.sinSku;
  logInfo_('VENTAS', filas.length + ' SKUs leídos de Sheet Site',
    { hoja: lec.hoja, actualizado: lec.actualizado ? Utilities.formatDate(lec.actualizado, c.ZONA, 'yyyy-MM-dd HH:mm') : null,
      horas: lec.horas === null ? null : Number(lec.horas.toFixed(2)) });

  // ── Escribir en el bloque VENTIAPP (Cantidad · Producto · SKU) ──
  const cols = wfsUbicarBloques_(sh);
  const usadas = [cols.cant, cols.sku].concat(cols.prod ? [cols.prod] : []);
  const prim = Math.min.apply(null, usadas);
  const ancho = Math.max.apply(null, usadas) - prim + 1;
  const alto = Math.max(sh.getMaxRows() - 1, filas.length);
  if (sh.getMaxRows() < filas.length + 1) {
    sh.insertRowsAfter(sh.getMaxRows(), filas.length + 1 - sh.getMaxRows());
  }
  sh.getRange(2, prim, sh.getMaxRows() - 1, ancho).clearContent();
  const datos = filas.map(function (f) {
    const fila = new Array(ancho).fill('');
    fila[cols.cant - prim] = f[0];
    fila[cols.sku - prim] = f[2];   // col-fija: arreglo de ventas armado aqui [cantidad, producto, sku]
    // El nombre solo si existe la columna PRODUCTO (por encabezado, no
    // "la de junto"): si no esta, se pega cantidad y SKU y listo.
    if (cols.prod) fila[cols.prod - prim] = f[1];   // col-fija: arreglo de ventas armado aqui [cantidad, producto, sku]
    return fila;
  });
  sh.getRange(2, prim, datos.length, ancho).setValues(datos);

  const lineas = [];
  lineas.push('• Ventas 30 dias: ' + filas.length + ' SKUs · ' + piezas + ' piezas (últimos ' + c.VENDIDOS_DIAS + ' días)' +
    (lec.actualizado ? ' · ventas de ' + Utilities.formatDate(lec.actualizado, c.ZONA, 'dd/MM HH:mm') : ' · SIN hora de actualización'));
  if (sinSku) lineas.push('  ⚠ ' + sinSku + ' registros sin SKU, ignorados');
  lineas.push('• Pegado en ' + c.HOJA + ' columnas ' + colLetra_(cols.cant) + ':' + colLetra_(cols.sku));
  logFinish_('VENTAS', filas.length + ' SKUs · ' + piezas + ' piezas escritas en ' + c.HOJA);
  return lineas.join('\n');
}

// ---- TRABAJO A MEDIAS (Auto.gs de WFS 1.0)
function wfsHayEdiciones_(ss) {
  const c = WFS_CONFIG;
  const sh = ss.getSheetByName(c.HOJA);
  if (!sh) throw new Error("No existe la hoja '" + c.HOJA + "'");
  const motivos = [];
  const ultima = sh.getLastRow();
  if (ultima < 2) return motivos;
  const n = ultima - 1;

  const columna = function (col) {
    return sh.getRange(2, col, n, 1).getValues().map(function (r) { return r[0]; });
  };
  // ¿En cuántas filas dos columnas no dicen lo mismo?
  const distintas = function (colA, colB) {
    const a = columna(colA), b = columna(colB);
    let k = 0;
    for (let i = 0; i < n; i++) if (String(a[i]) !== String(b[i])) k++;
    return k;
  };

  const cols = wfsUbicarBloques_(sh);

  // MSI: ENVIO PROPUESTO (lo que calculó el script) contra Envío (lo editable)
  const pMsi = cols.msi + wfsIdxEnc_(WFS_ENC_MSI, 'ENVIO PROPUESTO', 1) - 1;
  const tMsi = cols.msi + wfsIdxEnc_(WFS_ENC_MSI, 'ENVIO', 1) - 1;
  const kMsi = distintas(pMsi, tMsi);
  if (kMsi) motivos.push('Envío de MSI cambiado a mano en ' + kMsi + ' fila(s)');

  // CLÁSICA: lo mismo
  const pCla = cols.cla + wfsIdxEnc_(WFS_ENC_CLA, 'ENVIO PROPUESTO', 1) - 1;
  const tCla = cols.cla + wfsIdxEnc_(WFS_ENC_CLA, 'ENVIO', 1) - 1;
  const kCla = distintas(pCla, tCla);
  if (kCla) motivos.push('Envío de CLÁSICA cambiado a mano en ' + kCla + ' fila(s)');

  // ENVÍO FINAL: AUTORIZADO con números = ya estás autorizando
  const enc = wfsEnc_(sh, 1);
  const ini = wfsBuscarCol_(enc, 'ENVIO FINAL', { contiene: true });
  if (ini) {
    const fin = wfsFinBloque_(enc, ini, wfsMarcadores_());
    const cAut = wfsBuscarCol_(enc, 'AUTORIZADO', { desde: ini, hasta: fin });
    if (cAut) {
      const aut = columna(cAut);
      let k = 0;
      aut.forEach(function (v) {
        if ((Number(String(v).replace(/,/g, '')) || 0) > 0) k++;
      });
      if (k) motivos.push('AUTORIZADO con cantidad en ' + k + ' SKU(s)');
    }
  }
  return motivos;
}

// ---- UTILIDADES
function wfsNum_(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
function wfsSumar_(obj) {
  return Object.keys(obj).reduce(function (s, k) { return s + obj[k]; }, 0);
}
function wfsDe_(cat, k) { return cat.sku[k] ? cat.sku[k].wfs : 0; }
function wfsNombre_(cat, k) { return cat.sku[k] ? cat.sku[k].sku : k; }
function wfsDato_(cat, k, campo) { return cat.sku[k] ? cat.sku[k][campo] : ''; }
function wfsPublicado_(cat, k) {
  const e = cat.sku[k] ? cat.sku[k].estado : '';
  return (e === '' || e === 'PUBLISHED') ? 1 : 0;
}

// ============================================================
// MENU Y CORRIDAS (code.gs y Auto.gs de WFS 1.0)
//
// Igual que en WFS 1.0, con estos cambios por vivir en este libro:
//   - el resumen de cada corrida va al Log de este libro (etapa WFS) en vez de la hoja LOG_WFS
//   - la vuelta automatica ya no baja API INVENTARIO: el inventario (Walmart, Inventario Actual)
//     y las ventas (Ventas 30 dias) ya se actualizan solos en este libro
//   - el candado es el del libro (el mismo de todas las bajadas), para no leer una hoja a medio escribir
//   - la hoja "📊 Estado" de WFS 1.0 ahora es un aviso (menu Ver estado de WFS): una hoja menos
// ============================================================

var WFS_ETAPA = 'WFS';
var WFS_AUTO_HANDLER = 'wfsAuto';
var WFS_AUTO_PROP = 'WFS_AUTO_ESTADO';

/** Resumen de una corrida en el Log (antes: una fila en LOG_WFS). */
function wfsLogResumen_(estado, mensaje) {
  var txt = String(mensaje === undefined || mensaje === null ? '' : mensaje);
  var primera = txt.split('\n')[0];
  if (estado === 'ERROR') logErr_(WFS_ETAPA, primera, txt);
  else logOk_(WFS_ETAPA, primera, txt);
}

/** La hoja WFS lista para trabajar (y sus formulas apuntando a este libro). Si no existe, dice que hacer. */
function wfsHojaLista_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(WFS_CONFIG.HOJA);
  if (!sh) {
    throw new Error("Todavia no existe la hoja '" + WFS_CONFIG.HOJA + "' en este libro.\n" +
      'Corre primero: 🚚 Envíos WFS > 📥 Crear hoja WFS (formato de Inventarios WM).');
  }
  wfsAsegurarFormulas_(sh, false);
  return sh;
}

function wfsCandadoMenu_() {
  var lock = LockService.getScriptLock();
  return lock.tryLock(60000) ? lock : null;
}

var WFS_OCUPADO = 'Otra corrida (bajada automática de Walmart, inventario, precios...) tiene el libro ocupado. ' +
                  'Intenta en un minuto; no se corrió nada doble.';

/** Menu: Calcular envio WFS (sin traer ventas). Era runCalcularWFS. */
function wfsCalcularMenu() {
  var ui = SpreadsheetApp.getUi();
  var c = WFS_CONFIG;
  var resp = ui.alert(
    'Calcular envío WFS',
    'Ventas de ' + c.DIAS_VENTA + ' días → cobertura de ' + c.DIAS_COBERTURA +
    ' días en WFS.\nSe reescriben los bloques MSI y CLÁSICA de la hoja ' + c.HOJA +
    ' (la columna Envío incluida).\n\n¿Continuar?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  var lock = wfsCandadoMenu_();
  if (!lock) { ui.alert('WFS', WFS_OCUPADO, ui.ButtonSet.OK); return; }
  try {
    wfsHojaLista_();
    var res = wfsCalcularHoja_();
    wfsLogResumen_('OK', res);
    ui.alert('✅ Envío WFS calculado', res, ui.ButtonSet.OK);
  } catch (e) {
    var msg = 'ERROR: ' + e.message;
    wfsLogResumen_('ERROR', msg + '\n' + (e.stack || ''));
    ui.alert('❌ Error en envío WFS', msg, ui.ButtonSet.OK);
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

/** Trae las ventas de la hoja Ventas 30 dias, las pega en la hoja WFS y recalcula. Devuelve el resumen. */
function wfsVentasYCalcular_() {
  var t = wfsTraerVentas_();
  var calc = wfsCalcularHoja_();
  return t + '\n\n— — —\n\n' + calc;
}

/** Menu: Actualizar ventas ahora (30 dias) y calcular. Era runTraerVentas. */
function wfsActualizarMenu() {
  var ui = SpreadsheetApp.getUi();
  var lock = wfsCandadoMenu_();
  if (!lock) { ui.alert('WFS', WFS_OCUPADO, ui.ButtonSet.OK); return; }
  try {
    wfsHojaLista_();
    // Sin pregunta si no hay nada que perder. Solo se detiene a avisar cuando recalcular
    // borraria algo que escribiste a mano (Envio / AUTORIZADO).
    var motivos = wfsHayEdiciones_(SpreadsheetApp.getActive());
    if (motivos.length) {
      var resp = ui.alert(
        'Hay trabajo a medias',
        'Al actualizar se recalculan MSI y CLÁSICA y las filas se REORDENAN. Se perdería:\n\n• ' +
        motivos.join('\n• ') +
        '\n\nTe recomiendo anotar o copiar tus cantidades antes.\n\n¿Actualizar de todos modos?',
        ui.ButtonSet.YES_NO
      );
      if (resp !== ui.Button.YES) { flushLog_(); return; }
      logWarn_('VENTAS', 'Actualización a mano sobre trabajo a medias (confirmada)', motivos);
    }
    var txt = wfsVentasYCalcular_();
    wfsLogResumen_('OK', txt);
    ui.alert('✅ Ventas traídas y envío calculado', txt, ui.ButtonSet.OK);
  } catch (e) {
    var msg = 'ERROR: ' + e.message;
    wfsLogResumen_('ERROR', msg + '\n' + (e.stack || ''));
    ui.alert('❌ No se trajeron las ventas', msg, ui.ButtonSet.OK);
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

/** Menu: Probar lectura de ventas. Era runProbarVendidos. No toca la hoja WFS. */
function wfsProbarVentas() {
  var ui = SpreadsheetApp.getUi();
  logStart_('PRUEBA', 'Probar lectura de ventas (hoja ' + WFS_VENTAS_SITE.HOJA + ')');
  try {
    var lec = wfsLeerVentasSite_();
    var l = [];
    l.push('Hoja: ' + lec.hoja);
    l.push('SKUs: ' + lec.filas.length + ' · piezas: ' + lec.piezas);
    l.push(lec.actualizado
      ? 'Ventas de: ' + Utilities.formatDate(lec.actualizado, WFS_CONFIG.ZONA, 'yyyy-MM-dd HH:mm') +
        ' (hace ' + lec.horas.toFixed(1) + ' h, tope ' + WFS_VENTAS_SITE.MAX_HORAS + ' h)'
      : '⚠ La hoja no trae hora de actualización: no puedo verificar qué tan frescas son.');
    if (lec.sinSku) l.push('⚠ ' + lec.sinSku + ' renglones con piezas y sin SKU, ignorados');
    l.push('');
    l.push('Primeros 5:');
    lec.filas.slice(0, 5).forEach(function (f) { l.push('  ' + f[0] + ' · ' + f[2]); });   // col-fija: arreglo propio
    logFinish_('PRUEBA', 'Lectura OK: ' + lec.filas.length + ' SKUs', l.join(' | '));
    flushLog_();
    ui.alert('🔌 Ventas de 30 días', l.join('\n'), ui.ButtonSet.OK);
  } catch (e) {
    logErr_('PRUEBA', e.message, e.stack || '');
    flushLog_();
    ui.alert('❌ No pude leer las ventas', e.message, ui.ButtonSet.OK);
  }
}

/* ================ VUELTA AUTOMATICA (Auto.gs de WFS 1.0) ================ */

/**
 * Trigger por hora: ventas de 30 dias -> recalcula MSI y CLASICA.
 * Antes de recalcular revisa si hay trabajo tuyo a medias (Envio distinto de ENVIO PROPUESTO o algun
 * AUTORIZADO > 0): si lo hay NO toca nada, lo deja en el Log y espera (PAUSADA).
 * Nunca relanza el error (un trigger que truena manda un correo cada hora). No envia nada a nadie.
 */
function wfsAuto() {
  var t0 = Date.now();
  var etapa = 'WFS_AUTO';
  logStart_(etapa, 'Vuelta automática: ventas de 30 días → cálculo WFS');
  var candado = null, loTengo = false;
  try {
    var ss = SpreadsheetApp.getActive();
    if (!ss.getSheetByName(WFS_CONFIG.HOJA)) {
      logInfo_(etapa, 'Todavía no existe la hoja ' + WFS_CONFIG.HOJA + ': nada que calcular');
      wfsGuardarEstadoAuto_('SALTADA', 'no existe la hoja ' + WFS_CONFIG.HOJA);
      return;
    }
    candado = LockService.getScriptLock();
    // Hasta 2 min: si justo corre otra cosa vale la pena esperarla en vez de perder la vuelta.
    loTengo = candado.tryLock(120000);
    if (!loTengo) {
      logWarn_(etapa, 'Otra ejecución tenía el candado; me salto esta vuelta');
      wfsGuardarEstadoAuto_('SALTADA', 'otra ejecución tenía el candado');
      return;
    }
    wfsAsegurarFormulas_(ss.getSheetByName(WFS_CONFIG.HOJA), false);
    var motivos = wfsHayEdiciones_(ss);
    if (motivos.length) {
      logWarn_(etapa, 'PAUSADA: hay trabajo a medias y no lo quiero pisar. Usa el botón para actualizar.', motivos);
      wfsGuardarEstadoAuto_('PAUSADA', motivos.join(' · '));
      return;
    }
    var txt = wfsVentasYCalcular_();
    var seg = ((Date.now() - t0) / 1000).toFixed(1);
    logFinish_(etapa, 'Ventas actualizadas en ' + seg + ' s', txt);
    wfsGuardarEstadoAuto_('OK', txt.split('\n')[0]);
  } catch (e) {
    logErr_(etapa, e.message, e.stack || '');
    try { wfsLogResumen_('ERROR', 'Actualización automática: ' + e.message); } catch (e2) {}
    wfsGuardarEstadoAuto_('ERROR', e.message);
  } finally {
    flushLog_();
    if (loTengo) { try { candado.releaseLock(); } catch (e3) {} }
  }
}

function wfsGuardarEstadoAuto_(estado, detalle) {
  try {
    var props = PropertiesService.getScriptProperties();
    var previo = {};
    try { previo = JSON.parse(props.getProperty(WFS_AUTO_PROP) || '{}'); } catch (e) { previo = {}; }
    var ok = estado === 'OK';
    var cuando = Utilities.formatDate(new Date(), WFS_CONFIG.ZONA, 'yyyy-MM-dd HH:mm:ss');
    props.setProperty(WFS_AUTO_PROP, JSON.stringify({
      cuando: cuando,
      estado: estado,
      detalle: String(detalle || '').slice(0, 300),
      seguidas: ok ? 0 : ((previo.seguidas || 0) + 1),   // vueltas seguidas sin lograr actualizar
      ultimaOk: ok ? cuando : (previo.ultimaOk || '')
    }));
  } catch (e) { /* el estado es un lujo: nunca debe tumbar la corrida */ }
}

function wfsInstalados_() {
  return ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === WFS_AUTO_HANDLER; });
}

/** Menu: encender el calculo automatico (cada hora). Era instalarTriggerTodo. */
function wfsEncenderAuto() {
  var ui = SpreadsheetApp.getUi();
  wfsInstalados_().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(WFS_AUTO_HANDLER).timeBased().everyHours(1).create();
  logOk_('WFS_AUTO', 'Trigger instalado: cada hora (ventas 30 días + cálculo WFS)');
  flushLog_();
  ui.alert('✅ Listo',
    'Cada hora, una vuelta:\n' +
    '  1. Ventas de 30 días (hoja ' + WFS_VENTAS_SITE.HOJA + ') → bloque de ventas de WFS\n' +
    '  2. Recalcula MSI y CLÁSICA\n\n' +
    'Si ya empezaste a editar Envío o AUTORIZADO, la vuelta se pausa\n' +
    'para no pisar tu trabajo y lo deja en el Log. El botón\n' +
    '"📥 Actualizar ventas y calcular" siempre funciona.\n\n' +
    'No envía nada a nadie: solo calcula la propuesta.\n' +
    'Para ver cómo le va: 🚚 Envíos WFS ▸ 📊 Ver estado de WFS.',
    ui.ButtonSet.OK);
}

/** Menu: apagar el calculo automatico. Era quitarTriggerTodo. */
function wfsApagarAuto() {
  var ui = SpreadsheetApp.getUi();
  var n = 0;
  wfsInstalados_().forEach(function (t) { ScriptApp.deleteTrigger(t); n++; });
  logInfo_('WFS_AUTO', 'Triggers quitados: ' + n);
  flushLog_();
  ui.alert(n ? '🛑 Quitado' : 'No había ninguno',
    n ? 'Ya no se calcula solo. Los botones del menú siguen funcionando.' : '', ui.ButtonSet.OK);
}

/* ================ ESTADO (Estado.gs de WFS 1.0, ahora como aviso) ================ */

/** Las mismas lineas que escribia la hoja "📊 Estado" de WFS 1.0 (solo lee). */
function wfsEstadoLineas_() {
  var ss = SpreadsheetApp.getActive();
  var c = WFS_CONFIG;
  var f = function (d) { return Utilities.formatDate(d, c.ZONA, 'yyyy-MM-dd HH:mm:ss'); };
  var l = [];
  var add = function (area, dato, valor, ico) { l.push((ico ? ico + ' ' : '') + area + ' · ' + dato + ': ' + valor); };
  var seguro = function (area, fn) {
    try { fn(); } catch (e) { add(area, 'No pude leer', String(e.message).split('\n')[0], '❌'); }
  };

  seguro('AUTOMÁTICO', function () {
    var on = wfsInstalados_().length;
    add('AUTOMÁTICO', 'Encendido', on ? 'SÍ (cada hora)' : 'APAGADO', on ? '✅' : '🟡');
    var e = null;
    try { e = JSON.parse(PropertiesService.getScriptProperties().getProperty(WFS_AUTO_PROP) || 'null'); } catch (x) { e = null; }
    if (!e) { add('AUTOMÁTICO', 'Última vuelta', 'todavía no ha corrido', '🟡'); return; }
    var ico = e.estado === 'OK' ? '✅' : (e.estado === 'PAUSADA' || e.estado === 'SALTADA' ? '🟡' : '❌');
    add('AUTOMÁTICO', 'Última vuelta', e.cuando + ' -> ' + e.estado, ico);
    if (e.detalle) add('AUTOMÁTICO', 'Detalle', e.detalle, '');
    add('AUTOMÁTICO', 'Última vez que las ventas se actualizaron', e.ultimaOk || 'nunca', e.seguidas > 0 ? '❌' : '✅');
    if (e.seguidas > 0) add('AUTOMÁTICO', 'Vueltas seguidas sin actualizar', e.seguidas, '❌');
    if (e.estado === 'PAUSADA') add('AUTOMÁTICO', 'Para retomar', 'botón "📥 Actualizar ventas y calcular", o borra tus cambios en Envío / AUTORIZADO', '');
  });

  seguro('VENTAS', function () {
    try {
      var v = wfsLeerVentasSite_();
      add('VENTAS', 'Hoja ' + v.hoja, v.filas.length + ' SKUs · ' + v.piezas + ' pzas', '✅');
      add('VENTAS', 'Bajadas a las', v.actualizado ? f(v.actualizado) : '(sin hora)',
        (v.horas !== null && v.horas <= WFS_VENTAS_SITE.MAX_HORAS) ? '✅' : '🟡');
    } catch (e) {
      add('VENTAS', WFS_VENTAS_SITE.HOJA, String(e.message).split('\n')[0], '❌');
    }
  });

  seguro('WFS', function () {
    var sh = ss.getSheetByName(c.HOJA);
    if (!sh) { add('WFS', 'Hoja ' + c.HOJA, 'no existe (🚚 Envíos WFS > 📥 Crear hoja WFS (formato de Inventarios WM))', '❌'); return; }
    var cols = wfsUbicarBloques_(sh);
    var n = Math.max(sh.getLastRow() - 1, 0);
    if (!n) { add('WFS', 'Filas', 0, '❌'); return; }
    var enc = wfsEnc_(sh, 1);

    var iV = wfsBuscarCol_(enc, c.MARCA_VENTAS, { contiene: true });
    var fV = wfsFinBloque_(enc, iV, wfsMarcadores_());
    var cCant = wfsBuscarCol_(enc, 'Cantidad', { desde: iV, hasta: fV });
    var cSkuV = wfsBuscarCol_(enc, 'SKU', { desde: iV, hasta: fV });
    if (cCant && cSkuV) {
      var vals = sh.getRange(2, Math.min(cCant, cSkuV), n, Math.abs(cSkuV - cCant) + 1).getValues();
      var ic = cCant - Math.min(cCant, cSkuV), is = cSkuV - Math.min(cCant, cSkuV);
      var skus = 0, pzas = 0;
      vals.forEach(function (r) { if (r[is] !== '') { skus++; pzas += Number(r[ic]) || 0; } });
      add('WFS', 'Ventas en la hoja', skus + ' SKUs · ' + pzas + ' pzas', skus ? '✅' : '❌');
    }

    var cEstM = cols.msi + wfsIdxEnc_(WFS_ENC_MSI, 'ESTADO', 1) - 1;
    var cSkuM = cols.msi + wfsIdxEnc_(WFS_ENC_MSI, 'SKU', 1) - 1;
    var cEnvM = cols.msi + wfsIdxEnc_(WFS_ENC_MSI, 'ENVIO PROPUESTO', 1) - 1;
    var est = sh.getRange(2, cEstM, n, 1).getValues(), sku = sh.getRange(2, cSkuM, n, 1).getValues(), env = sh.getRange(2, cEnvM, n, 1).getValues();
    var cnt = {}, nM = 0, pM = 0;
    for (var i = 0; i < n; i++) {
      if (sku[i][0] === '') continue;
      nM++;
      var k = String(est[i][0]).split(' ·')[0].split(' 21')[0].trim() || '(vacio)';
      cnt[k] = (cnt[k] || 0) + 1;
      pM += Number(env[i][0]) || 0;
    }
    add('WFS', 'MSI: SKUs · pzas propuestas', nM + ' · ' + pM, nM ? '✅' : '❌');
    Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).forEach(function (k2) {
      var mal = /SIN STOCK|NO PUBLICADO|NO EST|PARCIAL|SIN PUBLIC/.test(k2);
      add('WFS', '   estado ' + k2, cnt[k2], mal ? '🟡' : '');
    });
    var cSkuC = cols.cla + wfsIdxEnc_(WFS_ENC_CLA, 'SKU', 1) - 1;
    var nC = 0;
    sh.getRange(2, cSkuC, n, 1).getValues().forEach(function (r) { if (r[0] !== '') nC++; });
    add('WFS', 'CLÁSICA: SKUs', nC, nC ? '✅' : '🟡');

    var iE = wfsBuscarCol_(enc, 'ENVIO FINAL', { contiene: true });
    if (iE) {
      var fE = wfsFinBloque_(enc, iE, wfsMarcadores_());
      var cS = wfsBuscarCol_(enc, 'SKU', { desde: iE, hasta: fE });
      var cU = wfsBuscarCol_(enc, 'UNIDADES', { desde: iE, hasta: fE });
      var cA = wfsBuscarCol_(enc, 'AUTORIZADO', { desde: iE, hasta: fE });
      if (cS && cU) {
        var s = sh.getRange(2, cS, n, 1).getValues(), u = sh.getRange(2, cU, n, 1).getValues();
        var a = cA ? sh.getRange(2, cA, n, 1).getValues() : null;
        var kk = 0, p = 0, ka = 0, pa = 0;
        for (var j = 0; j < n; j++) {
          if (s[j][0] === '') continue;
          var un = Number(String(u[j][0]).replace(/,/g, '')) || 0;
          if (un > 0) { kk++; p += un; }
          var au = a ? (Number(String(a[j][0]).replace(/,/g, '')) || 0) : 0;
          if (au > 0) { ka++; pa += au; }
        }
        add('WFS', 'ENVÍO FINAL: SKUs · pzas', kk + ' · ' + p, kk ? '✅' : '🟡');
        add('WFS', 'AUTORIZADO: SKUs · pzas', ka + ' · ' + pa, ka ? '🟡' : '');
      }
    }
    var motivos = wfsHayEdiciones_(ss);
    add('WFS', 'Trabajo a medias (pausa el automático)', motivos.length ? motivos.join(' · ') : 'ninguno', motivos.length ? '🟡' : '✅');
  });

  seguro('LIBRO', function () {
    var hs = ss.getSheets();
    var resp = hs.filter(function (h) { return /^WFS RESPALDO /.test(h.getName()); }).length;
    var envios = hs.filter(function (h) { return /^ENVIO\s/i.test(h.getName()); }).length;
    add('LIBRO', 'Respaldos WFS (ocultos)', resp, resp > 1 + WFS_RESPALDOS_RECIENTES ? '🟡' : '✅');
    add('LIBRO', 'Hojas ENVIO sin archivar', envios, '');
    add('LIBRO', 'Versión de WFS', c.VERSION, '');
  });
  return l;
}

/** Menu: Ver estado de WFS (antes la hoja "📊 Estado" y "Ver estado" del automatico). */
function wfsVerEstado() {
  var ui = SpreadsheetApp.getUi();
  var l = wfsEstadoLineas_();
  ui.alert('📊 Estado de WFS', l.join('\n') + '\n\nCada vuelta deja su paso a paso en la hoja Log (etapas WFS / WFS_AUTO).', ui.ButtonSet.OK);
}
