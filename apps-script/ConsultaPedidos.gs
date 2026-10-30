/**
 * ConsultaPedidos.gs - "Consulta Pedidos": pegas numeros de pedido (609… o 6000…) y te devuelve, una fila por pedido:
 * SKU, si ya salio (entregas de Odoo), paqueteria (BigSmart / FedEx, por el formato de la guia), guia (campo "Guia de rastreo"
 * de la venta), estatus de la paqueteria, conclusion y el link para abrir el rastreo. SOLO LEE: no cambia nada en Odoo ni toca Cancelaciones.
 * FUENTE: primero el site (/ventas-general, la ruta de datos se descubre sola y se guarda en CP_RUTA_VENTAS);
 * lo que no este en el site se busca en Odoo mientras haya acceso.
 *
 * Estatus de la paqueteria: se intenta leer la pagina de rastreo con UrlFetch. Si la pagina arma la cronologia con JavaScript
 * (o no trae la guia en su texto) NO se inventa nada: queda "ABRIR LINK" y el boton abre todas las pestañas.
 *
 * Todo con prefijo cp / CP_. Columnas por encabezado (colsHoja_ + reescribirHoja_).
 */
var CP_HOJA = 'Consulta Pedidos';
var CP_ENC = ['PEDIDO', 'SKU', 'PIEZAS', 'ESTADO VENTA', 'ENTREGA / ENVIO', 'ENVIADO', 'PAQUETERIA', 'GUIA', 'ESTATUS PAQUETERIA', 'ULTIMO EVENTO', 'CONCLUSION', 'LINK RASTREO', 'NOTA', 'CONSULTADO', 'FUENTE'];
var CP_CFG = {
  LOTE: 100,
  MAX_PAGINAS: 60,               // guias que se piden a la pagina por corrida (cuota UrlFetch y tiempo)
  MS_PRESUPUESTO: 240000,        // tope de la corrida (el limite de Apps Script es 6 min)
  ZONA: 'America/Mexico_City',
  URL_FEDEX: 'https://www.fedex.com/fedextrack/?trknbr={GUIA}&locale=es_MX',
  URL_BIGSMART: 'https://bigsmart.mx/tracking?guia={GUIA}',   // SIN VERIFICAR: se puede cambiar en Propiedades del script CP_URL_BIGSMART
  PROP_URL_BIGSMART: 'CP_URL_BIGSMART',
  PROP_CAMPOS: 'CP_CAMPOS_VENTA'
};
var CP_ESTADOS_PICK = { draft: 'Borrador', waiting: 'Esperando otra operacion', confirmed: 'Esperando disponibilidad', assigned: 'Listo', done: 'Hecho', cancel: 'Cancelado' };
var CP_ESTADOS_VENTA = { draft: 'Cotizacion', sent: 'Cotizacion enviada', sale: 'Confirmada', done: 'Bloqueada', cancel: 'CANCELADA' };

/* ---------------- piezas puras (se prueban sin Google) ---------------- */

/** Paqueteria por el formato de la guia: BigSmart = MXFDDWM + digitos; FedEx = 12 a 15 digitos. */
function cpPaqueteria_(guia) {
  var g = String(guia || '').trim();
  if (/^MXFDDWM\d+$/i.test(g)) return 'BigSmart';
  if (/^\d{12,15}$/.test(g)) return 'FedEx';
  return '';
}

/** Guias de un texto (pueden venir varias separadas por coma, espacio o salto de linea). */
function cpGuias_(texto) {
  var out = [], vistos = {};
  String(texto == null || texto === false ? '' : texto).split(/[\s,;|]+/).forEach(function (g) {
    g = g.trim();
    if (g && !vistos[g.toUpperCase()]) { vistos[g.toUpperCase()] = true; out.push(g); }
  });
  return out;
}

function cpUrlBase_(paq) {
  if (paq === 'FedEx') return CP_CFG.URL_FEDEX;
  if (paq === 'BigSmart') {
    var p = '';
    try { p = PropertiesService.getScriptProperties().getProperty(CP_CFG.PROP_URL_BIGSMART) || ''; } catch (e) {}
    return p || CP_CFG.URL_BIGSMART;
  }
  return '';
}

function cpLink_(paq, guia) {
  var u = cpUrlBase_(paq);
  return u ? u.replace('{GUIA}', encodeURIComponent(guia)) : '';
}

/** Valor de un campo de Odoo como texto (many2one llega como [id, nombre]; vacio llega como false). */
function cpValor_(v) {
  if (v === false || v === null || v === undefined) return '';
  if (Array.isArray(v)) return String(v.length > 1 ? v[1] : v[0]);   // col-fija: par [id, nombre] de Odoo, no es una columna de hoja
  return String(v);
}

function cpTextoPlano_(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&aacute;/gi, 'a').replace(/&eacute;/gi, 'e')
    .replace(/&iacute;/gi, 'i').replace(/&oacute;/gi, 'o').replace(/&uacute;/gi, 'u').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Lee el estatus del texto de la pagina. SOLO si la guia aparece en el texto (si no, la pagina no trae el dato
 * y seria un verde falso). Devuelve {estatus, evento, nota}; estatus '' = no se pudo leer.
 */
function cpInterpretar_(paq, guia, texto) {
  var t = cpTextoPlano_(texto), n = normEnc_(t);
  if (!t) return { estatus: '', evento: '', nota: 'pagina vacia' };
  if (n.indexOf(normEnc_(guia)) < 0) return { estatus: '', evento: '', nota: 'la pagina no trae la guia en su texto (se arma con JavaScript): abrir el link' };
  function ev(re) { var m = re.exec(n); if (!m) return ''; var i = Math.max(0, m.index - 20); return n.substring(i, Math.min(n.length, m.index + 70)).trim(); }
  var re;
  re = /(NO SE PUDO ENTREGAR|NO ENTREGAD|INTENTO DE ENTREGA|ENTREGA FALLIDA|DELIVERY EXCEPTION)/;
  if (re.test(n)) return { estatus: 'Incidencia', evento: ev(re), nota: 'leido de la pagina' };
  re = /(ENTREGADO|DELIVERED)/;
  if (re.test(n)) return { estatus: 'Entregado', evento: ev(re), nota: 'leido de la pagina' };
  re = /(CANCELAD)/;
  if (re.test(n)) return { estatus: 'Cancelado', evento: ev(re), nota: 'leido de la pagina' };
  re = /(EN RUTA|EN TRANSITO|IN TRANSIT|ON THE WAY|EN CAMINO)/;
  if (re.test(n)) return { estatus: 'En transito', evento: ev(re), nota: 'leido de la pagina' };
  re = /(LISTO PARA SER RECOLECTADO|INFORMACION ENVIADA|SHIPMENT INFORMATION SENT|GUIA CREADA)/;
  if (re.test(n)) return { estatus: 'Sin recolectar', evento: ev(re), nota: 'leido de la pagina' };
  return { estatus: '', evento: '', nota: 'la pagina trae la guia pero no un estatus conocido: abrir el link' };
}

/** Texto de las entregas: "WH/OUT/00123: Hecho | WH/PICK/00122: Hecho". */
function cpEntregaTxt_(picks) {
  return picks.slice().sort(function (a, b) { return String(a.name) < String(b.name) ? -1 : 1; }).map(function (p) {
    return p.name + ': ' + (CP_ESTADOS_PICK[p.state] || p.state);
  }).join(' | ');
}

function cpEsSalida_(p) {
  return String(p.picking_type_code || '') === 'outgoing' || /\/OUT\//i.test(String(p.name || ''));
}

/** SI / PARCIAL / NO / SIN ENTREGA / CANCELADA segun las salidas (OUT) de Odoo. */
function cpEnviado_(ventaEstado, picks) {
  if (ventaEstado === 'cancel') return 'CANCELADA';
  var outs = picks.filter(function (p) { return cpEsSalida_(p) && p.state !== 'cancel'; });
  if (!outs.length) return 'SIN ENTREGA';
  var hechas = outs.filter(function (p) { return p.state === 'done'; }).length;
  return hechas === outs.length ? 'SI' : (hechas ? 'PARCIAL' : 'NO');
}

function cpConclusion_(enviado, estPaq, hayGuia) {
  if (enviado === 'CANCELADA') return 'CANCELADA EN ODOO';
  if (estPaq === 'Entregado') return 'ENTREGADO';
  if (estPaq === 'Cancelado') return 'GUIA CANCELADA: no salio';
  if (estPaq === 'Sin recolectar') return 'NO SALIO: guia sin recolectar';
  if (estPaq === 'En transito') return 'EN CAMINO';
  if (estPaq === 'Incidencia') return 'INCIDENCIA: revisar';
  if (enviado === 'NO' || enviado === 'SIN ENTREGA') return hayGuia ? 'GUIA CREADA PERO ODOO SIN SALIDA: revisar' : 'NO ENVIADO: falta la salida en Odoo';
  if (!hayGuia) return 'SALIDA HECHA SIN GUIA: revisar';
  return 'REVISAR EN LA PAQUETERIA (abrir link)';
}

/** Todas las URLs de una celda LINK RASTREO. */
function cpUrls_(texto) {
  return String(texto || '').split(/\s+/).filter(function (u) { return /^https?:\/\//i.test(u); });
}

/* ---------------- Odoo ---------------- */

/** Nombres tecnicos de los campos de la venta por su etiqueta (Studio). Cache 6 h. */
function cpCamposVenta_() {
  var c = CacheService.getScriptCache(), k = CP_CFG.PROP_CAMPOS;
  try { var v = c.get(k); if (v) return JSON.parse(v); } catch (e) {}
  var f = odooExecute_('sale.order', 'fields_get', [], { attributes: ['string', 'type'] }) || {};
  var porEtiqueta = {};
  Object.keys(f).forEach(function (nom) { porEtiqueta[normEnc_((f[nom] || {}).string)] = nom; });
  var r = {
    guia: f.x_studio_guia_de_rastreo ? 'x_studio_guia_de_rastreo' : (porEtiqueta['GUIA DE RASTREO'] || porEtiqueta['GUIA DE RASTREO:'] || ''),
    estatus: porEtiqueta['ESTATUS DE PEDIDO'] || porEtiqueta['ESTATUS DE PEDIDO:'] || '',
    estado: porEtiqueta['ESTADO VENTA'] || porEtiqueta['ESTADO VENTA:'] || '',
    registradas: porEtiqueta['GUIA REGISTRADAS'] || '',
    retorno: porEtiqueta['GUIA RETORNO'] || porEtiqueta['GUIA RETORNO:'] || ''
  };
  try { c.put(k, JSON.stringify(r), 21600); } catch (e) {}
  return r;
}

/** Lee de Odoo: ventas (por numero; las que falten, por referencia del cliente), lineas con SKU y entregas. */
function cpLeerOdoo_(nombres) {
  var campos = cpCamposVenta_();
  var fv = ['name', 'state', 'client_order_ref', 'partner_id', 'amount_total'];
  ['guia', 'estatus', 'estado', 'registradas', 'retorno'].forEach(function (k) { if (campos[k]) fv.push(campos[k]); });
  var ventas = {}, porRef = {}, hallados = {};
  for (var i = 0; i < nombres.length; i += CP_CFG.LOTE) {
    var tr = nombres.slice(i, i + CP_CFG.LOTE);
    odooExecute_('sale.order', 'search_read', [[['name', 'in', tr]]], { fields: fv }).forEach(function (v) { ventas[String(v.name)] = v; hallados[String(v.name)] = true; });
  }
  var faltan = nombres.filter(function (n) { return !hallados[n]; });
  for (var j = 0; j < faltan.length; j += CP_CFG.LOTE) {
    var t2 = faltan.slice(j, j + CP_CFG.LOTE);
    odooExecute_('sale.order', 'search_read', [[['client_order_ref', 'in', t2]]], { fields: fv }).forEach(function (v) { porRef[String(v.client_order_ref)] = v; });
  }
  nombres.forEach(function (n) { if (!ventas[n] && porRef[n]) { ventas[n] = porRef[n]; ventas[n].__porRef = true; } });

  var vs = Object.keys(ventas).map(function (k) { return ventas[k]; });
  var idNombre = {}, nomVenta = {};
  vs.forEach(function (v) { idNombre[v.id] = String(v.name); nomVenta[String(v.name)] = true; });
  var lineas = {}, entregas = {}, prodIds = {};
  var nomsReales = Object.keys(nomVenta);
  for (var a = 0; a < nomsReales.length; a += CP_CFG.LOTE) {
    var tn = nomsReales.slice(a, a + CP_CFG.LOTE);
    var ids = tn.map(function (n) { return ventas[n] && ventas[n].id; }).filter(Boolean);
    if (ids.length) {
      odooExecute_('sale.order.line', 'search_read', [[['order_id', 'in', ids]]], { fields: ['order_id', 'product_id', 'product_uom_qty'] }).forEach(function (l) {
        var nom = idNombre[Array.isArray(l.order_id) ? l.order_id[0] : l.order_id];
        if (!nom || !l.product_id) return;
        (lineas[nom] = lineas[nom] || []).push(l);
        prodIds[Array.isArray(l.product_id) ? l.product_id[0] : l.product_id] = true;
      });
    }
    var pk = cpLeerEntregas_(tn);
    pk.forEach(function (p) { (entregas[String(p.origin)] = entregas[String(p.origin)] || []).push(p); });
  }
  var codigos = {}, pid = Object.keys(prodIds).map(Number);
  for (var b = 0; b < pid.length; b += 200) {
    odooExecute_('product.product', 'search_read', [[['id', 'in', pid.slice(b, b + 200)]]], { fields: ['default_code'], context: { active_test: false } })
      .forEach(function (p) { codigos[p.id] = cpValor_(p.default_code); });
  }
  return { campos: campos, ventas: ventas, lineas: lineas, entregas: entregas, codigos: codigos };
}

/** Entregas por origen. Si el Odoo trae carrier_tracking_ref se pide tambien; si no existe se reintenta sin el. */
function cpLeerEntregas_(nombres) {
  var dom = [[['origin', 'in', nombres]]];
  try {
    return odooExecute_('stock.picking', 'search_read', dom, { fields: ['name', 'origin', 'state', 'picking_type_code', 'carrier_tracking_ref'] }) || [];
  } catch (e) {
    return odooExecute_('stock.picking', 'search_read', dom, { fields: ['name', 'origin', 'state', 'picking_type_code'] }) || [];
  }
}

/* ---------------- paqueteria ---------------- */

function cpPedirPagina_(paq, guia) {
  var url = cpLink_(paq, guia);
  if (!url) return { estatus: '', evento: '', nota: 'sin link de rastreo para esta paqueteria', diag: null };
  var r;
  try {
    r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'es-MX,es;q=0.9' } });
  } catch (e) {
    return { estatus: '', evento: '', nota: 'no se pudo abrir la pagina: ' + String(e.message || e).substring(0, 80), diag: { url: url, error: String(e.message || e).substring(0, 200) } };
  }
  var cod = r.getResponseCode(), cuerpo = r.getContentText() || '';
  var res = cod === 200 ? cpInterpretar_(paq, guia, cuerpo) : { estatus: '', evento: '', nota: 'la pagina contesto HTTP ' + cod };
  res.diag = { url: url, codigo: cod, largo: cuerpo.length, guiaEnTexto: normEnc_(cpTextoPlano_(cuerpo)).indexOf(normEnc_(guia)) >= 0, inicio: cpTextoPlano_(cuerpo).substring(0, 160), estatus: res.estatus };
  return res;
}

/* ---------------- hoja y menu ---------------- */

function cpHoja_() {
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName(CP_HOJA);
  if (!h) h = ss.insertSheet(CP_HOJA);
  if (h.getLastRow() < 1 || !String(h.getRange(1, 1).getValue() || '').trim()) {
    h.getRange(1, 1, 1, CP_ENC.length).setValues([CP_ENC]);   // hoja nueva o vacia: pone sus encabezados (nunca pisa los de una hoja con datos)
    h.setFrozenRows(1);
  }
  return h;
}

/* ---------------- site: /ventas-general (fuente principal; Odoo queda de respaldo) ---------------- */

var CP_SITIO = {
  PAGINA: '/ventas-general',
  PROP_RUTA: 'CP_RUTA_VENTAS',           // ruta que funciono (se descubre sola; se puede fijar a mano)
  PROP_FIRMA: 'CP_CAMPOS_SITIO',
  PROP_PARAM: 'CP_PARAM_BUSCAR',       // nombre del parametro de busqueda que funciono
  PARAMS: ['q', 'buscar', 'search', 'busqueda', 'folio', 'texto'],
  MS_BUSQUEDA: 120000,
  CANDIDATAS: ['/ventas-general-data?canal=Walmart', '/ventas-general-data', '/ventas-general/api/data', '/ventas-general/data', '/api/ventas-general'],
  EXTRA: 'limit=5000&per_page=5000&page_size=5000'   // un servidor ignora lo que no conoce
};

function cpConExtra_(ruta) { return ruta + (ruta.indexOf('?') < 0 ? '?' : '&') + CP_SITIO.EXTRA; }

/** El arreglo de pedidos dentro de la respuesta (arreglo directo o el arreglo de objetos mas grande hasta 2 niveles). */
function cpArregloPedidos_(j) {
  if (Array.isArray(j)) return j.filter(function (o) { return o && typeof o === 'object'; });
  var mejor = [];
  function ver(v) { if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && v.length > mejor.length) mejor = v; }
  if (j && typeof j === 'object') {
    Object.keys(j).forEach(function (k) {
      var v = j[k]; ver(v);
      if (v && typeof v === 'object' && !Array.isArray(v)) Object.keys(v).forEach(function (k2) { ver(v[k2]); });
    });
  }
  return mejor;
}

/** ¿Son pedidos de Walmart? (traen folios 609… / 6000… de 15 digitos). */
function cpPareceVentas_(arr) { return !!(arr && arr.length && /(^|[^0-9])60\d{13}([^0-9]|$)/.test(JSON.stringify(arr).substring(0, 600000))); }   // toda la lista: las primeras pueden ser de otro canal

function cpProbarVentas_(ruta, diag) {
  try {
    var r = fetchSitio_(cpConExtra_(ruta), { crudo: true, silencioso: true }) || {};
    var t = String(r.texto || '').trim();
    diag.probadas.push(ruta + ' -> HTTP ' + r.codigo + ', ' + t.length + ' bytes');
    if (r.codigo !== 200 || !/^[\[{]/.test(t)) return null;
    var j = JSON.parse(t), arr = cpArregloPedidos_(j);
    if (!cpPareceVentas_(arr)) { diag.probadas.push(ruta + ' -> JSON sin folios de Walmart: ' + t.substring(0, 220)); return null; }
    return { ruta: ruta, pedidos: arr, json: j };
  } catch (e) {
    diag.probadas.push(ruta + ' -> error ' + String(e.message || e).split('\n')[0].substring(0, 90));
    return null;
  }
}

/** Busca la ruta de datos de /ventas-general: la guardada, las candidatas y, si no, la que pide la propia pagina en su JS. */
function cpRutaVentas_(diag) {
  var p = PropertiesService.getScriptProperties(), guardada = p.getProperty(CP_SITIO.PROP_RUTA) || '';
  var lista = (guardada ? [guardada] : []).concat(CP_SITIO.CANDIDATAS.filter(function (r) { return r !== guardada; }));
  for (var i = 0; i < lista.length; i++) {
    var r = cpProbarVentas_(lista[i], diag);
    if (r) { if (r.ruta !== guardada) p.setProperty(CP_SITIO.PROP_RUTA, r.ruta); return r; }
  }
  try {
    var rep = { rutas: [] };
    var pg = fetchSitio_(CP_SITIO.PAGINA, { crudo: true, silencioso: true }) || {};
    var html = String(pg.texto || '');
    diag.pagina = 'HTTP ' + pg.codigo + ', ' + html.length + ' bytes';
    agregarRutas_(rep, html, 'pagina');
    var re = /<script[^>]+src=["']([^"']+)["']/gi, m, n = 0;
    while ((m = re.exec(html)) !== null && n < 10) {
      var src = m[1];
      if (/^https?:/i.test(src) && src.indexOf(SITE) !== 0) continue;
      if (src.indexOf(SITE) === 0) src = src.substring(SITE.length);
      if (src.charAt(0) !== '/') src = '/' + src;
      n++;
      try { var js = fetchSitio_(src, { crudo: true, silencioso: true }) || {}; agregarRutas_(rep, String(js.texto || ''), src); } catch (e) {}
    }
    var rutas = rep.rutas.map(function (x) { return x.ruta; });
    diag.rutasPagina = rutas.slice(0, 40);
    rutas.filter(function (x) { return /venta|order|pedido|sale/i.test(x) && lista.indexOf(x) < 0; }).slice(0, 12).some(function (x) {
      var r2 = cpProbarVentas_(x, diag);
      if (r2) { p.setProperty(CP_SITIO.PROP_RUTA, x); diag.hallada = r2; }
      return !!r2;
    });
    if (diag.hallada) { var h = diag.hallada; delete diag.hallada; return h; }
  } catch (e) { diag.errorPagina = String(e.message || e).substring(0, 160); }
  return null;
}

/** Aplana un objeto: [['lineas[0].sku','HP-1'], ...]. */
function cpAplanar_(o, pref, out, prof) {
  Object.keys(o || {}).forEach(function (k) {
    var v = o[k], kk = (pref ? pref + '.' : '') + k;
    if (v && typeof v === 'object' && !Array.isArray(v)) { if (prof < 4) cpAplanar_(v, kk, out, prof + 1); }
    else if (Array.isArray(v)) {
      if (v.length && v[0] && typeof v[0] === 'object') { if (prof < 4) v.forEach(function (x, i) { cpAplanar_(x, kk + '[' + i + ']', out, prof + 1); }); }
      else out.push([kk, v.join(', ')]);
    } else out.push([kk, v]);
  });
  return out;
}

function cpEstatusEnvio_(txt) {
  var n = normEnc_(txt);
  if (!n) return '';
  if (/NO ENTREGAD|INTENTO|FALLID|EXCEPCION|EXCEPTION/.test(n)) return 'Incidencia';
  if (/ENTREGAD|DELIVERED/.test(n)) return 'Entregado';
  if (/CANCEL/.test(n)) return 'Cancelado';
  if (/CAMINO|TRANSIT|EN RUTA|SHIPPED/.test(n)) return 'En transito';
  if (/RECOLECT|INFORMACION ENVIADA|LABEL|GUIA CREADA/.test(n)) return 'Sin recolectar';
  return '';
}

function cpEnviadoCanal_(estado) {
  var n = normEnc_(estado);
  if (/CANCEL/.test(n)) return 'CANCELADA';
  if (/DELIVER|ENTREGAD|SHIP|ENVIAD|EMBARC/.test(n)) return 'SI';
  if (/CREAT|ACKNOWLEDG|ACEPTAD|PENDIENT|NUEV/.test(n)) return 'NO';
  return '';
}

/** Lee un pedido del site sin depender de nombres de campo fijos: por la forma del valor y palabras de la llave. */
function cpDeSitio_(o) {
  var pares = cpAplanar_(o, '', [], 0).map(function (x) { return [normEnc_(String(x[0]).replace(/[._\[\]0-9]+/g, ' ')), x[1], x[0]]; });
  function val(reLlave, reNo) {
    for (var i = 0; i < pares.length; i++) {
      var v = pares[i][1];   // col-fija: par [llave, valor] que arma cpAplanar_, no es una columna de hoja
      if (v === null || v === undefined || v === '' || v === false) continue;
      if (reLlave.test(pares[i][0]) && !(reNo && reNo.test(pares[i][0]))) return String(v);
    }
    return '';
  }
  function todos(reV) { return pares.map(function (x) { return String(x[1] == null ? '' : x[1]).trim(); }).filter(function (v) { return reV.test(v); }); }
  var folio = todos(/^609\d{12}$/)[0] || '';
  var ref = todos(/^6000\d{11}$/)[0] || '';
  var guias = [];
  pares.forEach(function (x) {
    var v = String(x[1] == null ? '' : x[1]).trim();
    cpGuias_(v).forEach(function (g) { if (cpPaqueteria_(g) && /GUIA|TRACK|RASTREO|SHIP|ENVIO/.test(x[0]) && guias.indexOf(g) < 0) guias.push(g); });
  });
  if (!guias.length) todos(/^MXFDDWM\d+$/i).forEach(function (g) { if (guias.indexOf(g) < 0) guias.push(g); });
  var skuOdoo = [], skuCanal = [], pzas = 0;
  pares.forEach(function (x) {
    var v = String(x[1] == null ? '' : x[1]).trim();
    if (/SKU|DEFAULT CODE|REFERENCIA/.test(x[0]) && /^[A-Z0-9]{2,}(-[A-Z0-9\/\.]+)+$/i.test(v)) {
      var dest = /ODOO|ERP|INTERNO/.test(x[0]) ? skuOdoo : skuCanal;
      if (dest.indexOf(v) < 0) dest.push(v);
    }
    if (/(^| )(CANTIDAD|CANT|QTY|QUANTITY|PIEZAS|UNIDADES)( |$)/.test(x[0]) && !isNaN(Number(x[1]))) pzas += Number(x[1]);
  });
  var estEnvio = val(/(ENVIO|SHIPPING|SHIPMENT|TRACKING|GUIA).*(ESTATUS|STATUS|ESTADO)|(ESTATUS|STATUS|ESTADO).*(ENVIO|SHIPPING|SHIPMENT|TRACKING|GUIA)/);
  var estCanal = val(/(^| )(ESTADO|ESTATUS|STATUS|STATE)( CANAL| ORDEN| PEDIDO)?$/, /ENVIO|SHIPPING|TRACKING|GUIA|ODOO|ERP|PAGO/);
  return {
    folio: folio, ref: ref, guias: guias, sku: skuOdoo.length ? skuOdoo : skuCanal, skuCanal: skuCanal, piezas: pzas,
    estadoCanal: estCanal, estatusEnvio: estEnvio, erp: val(/(^| )ERP/), fecha: val(/FECHA|DATE|CREAD|CREATED/),
    paqTexto: val(/PAQUETERIA|CARRIER|PORTADOR/)
  };
}

/** Los folios que no vinieron en la lista general se buscan uno por uno con el parametro de busqueda del site (se descubre y se guarda). */
function cpBuscarFolios_(ruta, folios, porFolio, diag) {
  var p = PropertiesService.getScriptProperties(), guard = p.getProperty(CP_SITIO.PROP_PARAM) || '', t0 = Date.now();
  var base = ruta.split('?')[0];
  diag.buscadas = []; diag.noHalladas = [];
  folios.forEach(function (f) {
    if (porFolio[f]) return;
    if (Date.now() - t0 > CP_SITIO.MS_BUSQUEDA) { diag.noHalladas.push(f + ' (sin tiempo)'); return; }
    var params = guard ? [guard].concat(CP_SITIO.PARAMS.filter(function (x) { return x !== guard; })) : CP_SITIO.PARAMS;
    for (var i = 0; i < params.length; i++) {
      try {
        var r = fetchSitio_(base + '?' + params[i] + '=' + encodeURIComponent(f), { crudo: true, silencioso: true }) || {};
        var t = String(r.texto || '').trim();
        if (r.codigo !== 200 || !/^[\[{]/.test(t) || t.indexOf(f) < 0) continue;   // un parametro que el site ignora devuelve la lista general sin ese folio
        cpArregloPedidos_(JSON.parse(t)).forEach(function (o) {
          var d = cpDeSitio_(o);
          if (d.folio && !porFolio[d.folio]) porFolio[d.folio] = d;
          if (d.ref && !porFolio[d.ref]) porFolio[d.ref] = d;
        });
        if (porFolio[f]) {
          if (params[i] !== guard) { guard = params[i]; p.setProperty(CP_SITIO.PROP_PARAM, guard); }
          diag.buscadas.push(f + ' con ?' + params[i]);
          break;
        }
      } catch (e) {}
    }
    if (!porFolio[f]) diag.noHalladas.push(f);
  });
}

/** Pedidos del site por folio (609 y 6000). {porFolio, ruta, diag} o porFolio vacio si el site no contesto. */
function cpLeerSitio_(folios) {
  var diag = { probadas: [] };
  if (typeof fetchSitio_ !== 'function') return { porFolio: {}, ruta: '', diag: diag };
  var r = cpRutaVentas_(diag);
  if (!r) return { porFolio: {}, ruta: '', diag: diag };
  var porFolio = {};
  r.pedidos.forEach(function (o) {
    var d = cpDeSitio_(o);
    if (d.folio) porFolio[d.folio] = d;
    if (d.ref) porFolio[d.ref] = d;
  });
  if (folios && folios.length) cpBuscarFolios_(r.ruta, folios, porFolio, diag);
  try {
    var firma = Object.keys(r.pedidos[0] || {}).sort().join(',');
    var p = PropertiesService.getScriptProperties();
    if (p.getProperty(CP_SITIO.PROP_FIRMA) !== firma) {
      logInfo_('CONSULTA_PEDIDOS', 'Campos que manda el site (' + r.ruta + ')', { campos: Object.keys(r.pedidos[0] || {}), ejemplo: JSON.stringify(r.pedidos[0]).substring(0, 1500), pedidos: r.pedidos.length });
      p.setProperty(CP_SITIO.PROP_FIRMA, firma);
    }
    var tot = r.json && !Array.isArray(r.json) ? (r.json.total || r.json.count || r.json.totalCount || 0) : 0;
    if (tot && Number(tot) > r.pedidos.length) logWarn_('CONSULTA_PEDIDOS', 'El site mando ' + r.pedidos.length + ' de ' + tot + ' pedidos (viene paginado): los mas viejos pueden no encontrarse.', { ruta: r.ruta });
  } catch (e) {}
  return { porFolio: porFolio, ruta: r.ruta, diag: diag };
}

/** Paqueteria, link y estatus de una lista de guias. estSitio = estatus que ya dio el site (si existe no se raspa la pagina). */
function cpGuiasInfo_(guias, estSitio, ctx) {
  var out = { paqs: [], links: [], ests: [], evs: [], notas: [] };
  guias.forEach(function (g) {
    var paq = cpPaqueteria_(g);
    out.paqs.push(paq || 'DESCONOCIDA');
    var lk = cpLink_(paq, g);
    if (lk) { out.links.push(lk); ctx.cuenta.links++; }
    var r;
    if (estSitio) r = { estatus: estSitio, evento: '', nota: '' };
    else if (paq && ctx.cache[g]) r = ctx.cache[g];
    else if (paq && ctx.nPag < CP_CFG.MAX_PAGINAS && (Date.now() - ctx.t0) < CP_CFG.MS_PRESUPUESTO) {
      r = cpPedirPagina_(paq, g); ctx.nPag++; ctx.cache[g] = r;
      if (r.diag && !ctx.diag[paq]) { ctx.diag[paq] = true; try { logInfo_('CONSULTA_PEDIDOS', 'Diagnostico de la pagina de ' + paq, r.diag); } catch (e) {} }
    } else if (paq) r = { estatus: '', evento: '', nota: 'sin consultar la pagina (limite de la corrida)' };
    else r = { estatus: '', evento: '', nota: 'la guia no es BigSmart ni FedEx' };
    out.ests.push(r.estatus || 'ABRIR LINK'); out.evs.push(r.evento || '');
    if (r.estatus) ctx.cuenta.leidos++; else ctx.cuenta.aAbrir++;
    if (r.nota) out.notas.push(g + ': ' + r.nota);
  });
  var e = out.ests;
  out.unico = e.length && e.every(function (x) { return x === e[0]; }) ? (e[0] === 'ABRIR LINK' ? '' : e[0]) : (e.indexOf('Entregado') >= 0 ? 'Incidencia' : '');
  return out;
}

function cpFilaSitio_(ped, d, ctx, ahora) {
  var enviado = cpEnviadoCanal_(d.estadoCanal);
  var estS = cpEstatusEnvio_(d.estatusEnvio);
  var gi = cpGuiasInfo_(d.guias, estS, ctx);
  if (!d.guias.length) ctx.cuenta.sinGuia++;
  var concl = cpConclusion_(enviado || (d.guias.length ? 'SI' : 'NO'), gi.unico, d.guias.length > 0);
  var notas = [];
  if (d.ref && ped === d.ref && d.folio) notas.push('folio Walmart ' + d.folio);
  if (d.erp) notas.push('#ERP ' + d.erp);
  if (d.fecha) notas.push('fecha ' + d.fecha);
  if (d.estatusEnvio) notas.push('envio en el site: ' + d.estatusEnvio);
  if (d.skuCanal.length && d.sku !== d.skuCanal) notas.push('SKU canal ' + d.skuCanal.join(' | '));
  return [d.folio || ped, d.sku.join(' | '), d.piezas || '', d.estadoCanal ? 'Canal: ' + d.estadoCanal : '', d.estatusEnvio || '', enviado || '',
          gi.paqs.join(' | '), d.guias.join(' | '), gi.ests.join(' | '), gi.evs.filter(Boolean).join(' | ') || d.estatusEnvio || '', concl,
          gi.links.join('\n'), notas.concat(gi.notas).join(' ; '), ahora, 'SITE'];
}

function cpFilaOdoo_(ped, od, ctx, ahora) {
  var v = od.ventas[ped];
  if (!v) {
    ctx.cuenta.noExiste++;
    return [ped, '', '', 'NO ENCONTRADO', '', '', '', '', '', '', 'NO ENCONTRADO', '', 'No esta en el site (/ventas-general) ni en Odoo', ahora, ''];
  }
  var nom = String(v.name), notas = [];
  if (v.__porRef) notas.push('encontrado por referencia del cliente: venta ' + nom);
  var ls = od.lineas[nom] || [];
  var sku = ls.map(function (l) { var id = Array.isArray(l.product_id) ? l.product_id[0] : l.product_id; return (od.codigos[id] || cpValor_(l.product_id)) + (ls.length > 1 ? ' x' + l.product_uom_qty : ''); }).join(' | ');
  var pzas = ls.reduce(function (s, l) { return s + (Number(l.product_uom_qty) || 0); }, 0);
  var picks = od.entregas[nom] || [];
  var enviado = cpEnviado_(v.state, picks);
  var guias = cpGuias_(od.campos.guia ? v[od.campos.guia] : '');
  if (!guias.length) picks.forEach(function (p) { cpGuias_(p.carrier_tracking_ref).forEach(function (g) { if (guias.indexOf(g) < 0) guias.push(g); }); });
  if (!od.campos.guia) notas.push('no se encontro el campo "Guia de rastreo" en la venta');
  if (!guias.length) ctx.cuenta.sinGuia++;
  var gi = cpGuiasInfo_(guias, '', ctx);
  var concl = cpConclusion_(enviado, gi.unico, guias.length > 0);
  var extra = [];
  if (od.campos.estatus && cpValor_(v[od.campos.estatus])) extra.push('Estatus De Pedido: ' + cpValor_(v[od.campos.estatus]));
  if (od.campos.estado && cpValor_(v[od.campos.estado])) extra.push('Estado Venta: ' + cpValor_(v[od.campos.estado]));
  if (od.campos.retorno && cpValor_(v[od.campos.retorno])) extra.push('Guia Retorno: ' + cpValor_(v[od.campos.retorno]));
  return [nom, sku, pzas, CP_ESTADOS_VENTA[v.state] || v.state, cpEntregaTxt_(picks), enviado, gi.paqs.join(' | '), guias.join(' | '),
          gi.ests.join(' | '), gi.evs.filter(Boolean).join(' | '), concl, gi.links.join('\n'), extra.concat(notas, gi.notas).join(' ; '), ahora, 'ODOO'];
}

/** Menu: 🔎 Consultar pedidos (site + guías). Primero el site (/ventas-general); lo que no este ahi, Odoo (mientras haya acceso). */
function cpConsultar() {
  var t0 = Date.now();
  try {
    var h = cpHoja_();
    var c = colsHoja_(h, ['PEDIDO']);
    var nF = h.getLastRow() - 1;
    if (nF < 1) {
      dlgInfo_('Consulta Pedidos', 'La hoja "' + CP_HOJA + '" esta lista pero vacia.\n\n• Pega los numeros de pedido en la columna PEDIDO (uno por fila).\n• Vuelve a elegir SITE SHEET > 📈 Ventas y sobreventa > 🔎 Consultar pedidos.', 'aviso');
      return;
    }
    var datos = h.getRange(2, 1, nF, Math.max(1, h.getLastColumn())).getValues();
    var pedidos = datos.map(function (f) { return String(f[c.PEDIDO] == null ? '' : f[c.PEDIDO]).replace(/\.0+$/, '').trim(); });
    var unicos = [], vistos = {};
    pedidos.forEach(function (p) { if (p && !vistos[p]) { vistos[p] = true; unicos.push(p); } });
    if (!unicos.length) { dlgInfo_('Consulta Pedidos', 'No hay numeros en la columna PEDIDO.', 'aviso'); return; }

    var ctx = { t0: t0, nPag: 0, cache: {}, diag: {}, cuenta: { filas: 0, noExiste: 0, sinGuia: 0, links: 0, leidos: 0, aAbrir: 0, sitio: 0, odoo: 0 } };
    var ahora = Utilities.formatDate(new Date(), CP_CFG.ZONA, 'yyyy-MM-dd HH:mm');

    var st = cpLeerSitio_(unicos);
    if (!st.ruta) { try { logWarn_('CONSULTA_PEDIDOS', 'No encontre la ruta de datos de ' + CP_SITIO.PAGINA + ': se usa Odoo', st.diag); } catch (e) {} }
    else if (st.diag.noHalladas && st.diag.noHalladas.length) { try { logWarn_('CONSULTA_PEDIDOS', st.diag.noHalladas.length + ' folios no estan en ' + st.ruta + ' ni buscandolos uno por uno', st.diag); } catch (e) {} }
    var faltan = unicos.filter(function (p) { return !st.porFolio[p]; });
    var od = { ventas: {}, lineas: {}, entregas: {}, codigos: {}, campos: {} }, odooError = '';
    if (faltan.length) {
      try { od = cpLeerOdoo_(faltan); } catch (e) { odooError = String(e.message || e).substring(0, 160); }
    }

    var filas = pedidos.map(function (ped) {
      if (!ped) return CP_ENC.map(function () { return ''; });
      ctx.cuenta.filas++;
      if (st.porFolio[ped]) { ctx.cuenta.sitio++; return cpFilaSitio_(ped, st.porFolio[ped], ctx, ahora); }
      var f = cpFilaOdoo_(ped, od, ctx, ahora);
      if (f[CP_ENC.indexOf('FUENTE')] === 'ODOO') ctx.cuenta.odoo++;
      else if (odooError) f[CP_ENC.indexOf('NOTA')] = 'No esta en el site; Odoo no contesto: ' + odooError;
      return f;
    });

    reescribirHoja_(h, CP_ENC, filas, { texto: ['PEDIDO', 'GUIA'], vacioOk: false });
    var k = ctx.cuenta;
    var msg = k.filas + ' pedidos: ' + k.sitio + ' del site, ' + k.odoo + ' de Odoo, ' + k.noExiste + ' no encontrados, ' + k.sinGuia + ' sin guia; ' +
              k.leidos + ' guias con estatus, ' + k.aAbrir + ' para abrir el link.';
    logOk_('CONSULTA_PEDIDOS', msg, { rutaSite: st.ruta || '(no encontrada)', paginasPedidas: ctx.nPag, odooError: odooError, segundos: Math.round((Date.now() - t0) / 1000) });
    flushLog_();
    var avisos = [];
    if (!st.ruta) avisos.push('⚠ No encontre por donde pide sus datos /ventas-general: todo salio de Odoo. El detalle quedo en el Log (CONSULTA_PEDIDOS).');
    if (k.aAbrir) avisos.push('⚠ ' + k.aAbrir + ' guias quedaron en ABRIR LINK: ni el site ni la pagina de la paqueteria dieron el estatus.');
    dlgInfo_('Consulta Pedidos', msg + '\n\n• La hoja "' + CP_HOJA + '" trae SKU, si salio, guia, estatus, conclusion y FUENTE (SITE u ODOO).\n• Para abrir el rastreo de todos: SITE SHEET > 📈 Ventas y sobreventa > 🌐 Abrir rastreo de todos los pedidos.' +
      (avisos.length ? '\n\n' + avisos.join('\n') : ''), avisos.length ? 'aviso' : 'ok');
  } catch (e) {
    try { logErr_('CONSULTA_PEDIDOS', String(e.message || e), { pila: String(e.stack || '').substring(0, 400) }); flushLog_(); } catch (e2) {}
    dlgInfo_('Consulta Pedidos', 'No se pudo consultar: ' + String(e.message || e) + '\n\nNo se cambio nada en Odoo ni en el site. Vuelve a correr esta misma opcion.', 'error');
  }
}

/** Menu: 🌐 Abrir rastreo de todos los pedidos (una pestaña por guia). */
function cpAbrirTodos() {
  try {
    var h = cpHoja_();
    var c = colsHoja_(h, ['PEDIDO', 'LINK RASTREO']);
    var nF = h.getLastRow() - 1;
    var urls = [], vistos = {};
    if (nF >= 1) {
      h.getRange(2, 1, nF, Math.max(1, h.getLastColumn())).getValues().forEach(function (f) {
        cpUrls_(f[c['LINK RASTREO']]).forEach(function (u) { if (!vistos[u]) { vistos[u] = true; urls.push(u); } });
      });
    }
    if (!urls.length) { dlgInfo_('Abrir rastreo', 'No hay links en la columna LINK RASTREO.\n\n• Primero corre 🔎 Consultar pedidos (site + guías).', 'aviso'); return; }
    var lista = urls.map(function (u) { return '<li><a href="' + dlgEsc_(u) + '" target="_blank" rel="noopener">' + dlgEsc_(u) + '</a></li>'; }).join('');
    var json = JSON.stringify(urls).replace(/</g, '\\u003c');
    var html = '<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>' + DLG_CSS + ' ul{max-height:230px;overflow:auto;padding-left:18px;font-size:12px} li{margin:2px 0;word-break:break-all}</style></head><body>' +
      '<div class="info"><div class="ic">🌐</div><div class="c"><h1>Abrir rastreo de ' + urls.length + ' guia' + (urls.length === 1 ? '' : 's') + '</h1>' +
      '<p>El boton abre una pestaña por guia. Si el navegador bloquea ventanas emergentes, permitelas para esta pagina y vuelve a darle.</p><ul>' + lista + '</ul></div></div>' +
      '<div class="botones"><button class="p" onclick="abrir()">Abrir las ' + urls.length + ' pestañas</button><button onclick="google.script.host.close()">Cerrar</button></div>' +
      '<script>var U=' + json + ';function abrir(){for(var i=0;i<U.length;i++){window.open(U[i],"_blank");}}</script></body></html>';
    logOk_('CONSULTA_PEDIDOS', 'Abrir rastreo: ' + urls.length + ' links'); flushLog_();
    SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(430), 'Abrir rastreo');
  } catch (e) {
    try { logErr_('CONSULTA_PEDIDOS', 'Abrir rastreo: ' + String(e.message || e)); flushLog_(); } catch (e2) {}
    dlgInfo_('Abrir rastreo', String(e.message || e), 'error');
  }
}
