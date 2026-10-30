/**
 * ConsultaPedidos.gs - "Consulta Pedidos": pegas numeros de pedido (609… o 6000…) y te devuelve, una fila por pedido:
 * SKU, si ya salio, paqueteria (BigSmart / FedEx), guia, estatus de la paqueteria, conclusion y el link para abrir el rastreo. SOLO LEE: no cambia nada en el site ni toca Cancelaciones.
 * FUENTE: solo el site (/ventas-general). Odoo ya no se usa (sin acceso desde el 30-oct).
 * En PEDIDO pegas la venta (609…) o la referencia (6000…): la hoja llena VENTA y REFERENCIA con las dos.
 *
 * Estatus de la paqueteria: se intenta leer la pagina de rastreo con UrlFetch. Si la pagina arma la cronologia con JavaScript
 * (o no trae la guia en su texto) NO se inventa nada: queda "ABRIR LINK" y el boton abre todas las pestañas.
 *
 * Todo con prefijo cp / CP_. Columnas por encabezado (colsHoja_ + reescribirHoja_).
 */
var CP_HOJA = 'Consulta Pedidos';
var CP_ENC = ['PEDIDO', 'VENTA', 'REFERENCIA', 'SKU', 'PIEZAS', 'ESTADO VENTA', 'ENTREGA / ENVIO', 'ENVIADO', 'PAQUETERIA', 'GUIA', 'ESTATUS PAQUETERIA', 'ULTIMO EVENTO', 'CONCLUSION', 'LINK RASTREO', 'NOTA', 'CONSULTADO'];
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

/** Valor como texto (many2one llega como [id, nombre]; vacio llega como false). */
function cpValor_(v) {
  if (v === false || v === null || v === undefined) return '';
  if (Array.isArray(v)) return String(v.length > 1 ? v[1] : v[0]);   // col-fija: par [id, nombre], no es una columna de hoja
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

function cpConclusion_(enviado, estPaq, hayGuia) {
  if (enviado === 'CANCELADA') return 'CANCELADA';
  if (estPaq === 'Entregado') return 'ENTREGADO';
  if (estPaq === 'Cancelado') return 'GUIA CANCELADA: no salio';
  if (estPaq === 'Sin recolectar') return 'NO SALIO: guia sin recolectar';
  if (estPaq === 'En transito') return 'EN CAMINO';
  if (estPaq === 'Incidencia') return 'INCIDENCIA: revisar';
  if (estPaq === 'Devuelto') return 'DEVUELTO';
  if (enviado === 'NO' || enviado === 'SIN ENTREGA') return hayGuia ? 'GUIA CREADA, AUN SIN SALIR: revisar' : 'NO ENVIADO: sin guia';
  if (!hayGuia) return 'SALIDA HECHA SIN GUIA: revisar';
  return 'REVISAR EN LA PAQUETERIA (abrir link)';
}

/** Todas las URLs de una celda LINK RASTREO. */
function cpUrls_(texto) {
  return String(texto || '').split(/\s+/).filter(function (u) { return /^https?:\/\//i.test(u); });
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

/* ---------------- site: /ventas-general (unica fuente: Odoo ya no se usa desde el 30-oct) ---------------- */

var CP_SITIO = {
  PAGINA: '/ventas-general',
  PROP_RUTA: 'CP_RUTA_VENTAS',           // ruta que funciono (se descubre sola; se puede fijar a mano)
  PROP_FIRMA: 'CP_CAMPOS_SITIO',
  PROP_PARAM: 'CP_PARAM_BUSCAR',       // nombre del parametro de busqueda que funciono
  PARAMS: ['q'],                       // la pagina busca con q= (visto en su JS el 30-oct)
  QS_VACIOS: 'solo_falta=&paqueteria=&envio=&tipo=&desde=&hasta=&envio_est=&cancel=&estado=&cant=',
  MS_BUSQUEDA: 150000,
  POR_PAG: 500,                        // la pagina pide por_pag=100&page=N (visto en DevTools 30-oct)
  MAX_PAGINAS: 40,
  CANALES_WALMART: ['WL'],   // valor del filtro canal; el que devuelva solo canal WL se guarda
  PROP_CANAL: 'CP_CANAL_WALMART',
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
function cpPareceVentas_(arr) {
  if (!arr || !arr.length) return false;
  var o = arr[0] || {};
  if (('folio' in o) || ('orden_id' in o)) return true;   // forma de pedido aunque la primera pagina sea de otro canal (ML, TK)
  return /(^|[^0-9])60\d{13}([^0-9]|$)/.test(JSON.stringify(arr).substring(0, 600000));
}

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
  var cod = (/\[([a-z_,]+)\]$/i.exec(String(txt)) || [])[1];
  if (cod) {
    cod = cod.toLowerCase();
    if (cod === 'entregado') return 'Entregado';
    if (cod === 'incidencia') return 'Incidencia';
    if (cod === 'devuelto') return 'Devuelto';
    if (cod === 'cancelado') return 'Cancelado';
    if (cod === 'recolectado' || cod === 'transito' || cod === 'reparto') return 'En transito';
    if (cod === 'guia') return 'Sin recolectar';
    if (cod === 'sin_guia' || cod === 'sin_indexar') return '';
  }
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
  var folio = String(o.folio || o.orden_id || '').trim();
  if (!/^609\d{12}$/.test(folio)) folio = todos(/^609\d{12}$/)[0] || '';
  var ref = /^6000\d{11}$/.test(String(o.referencia || '')) ? String(o.referencia) : (todos(/^6000\d{11}$/)[0] || '');
  var guias = [];
  pares.forEach(function (x) {
    var v = String(x[1] == null ? '' : x[1]).trim();
    cpGuias_(v).forEach(function (g) { if (cpPaqueteria_(g) && /GUIA|TRACK|RASTREO|SHIP|ENVIO/.test(x[0]) && guias.indexOf(g) < 0) guias.push(g); });
  });
  if (o.envio_guia || o.tracking) guias = cpGuias_(o.envio_guia || o.tracking);
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
  var estEnvio = o.envio_estado_txt ? String(o.envio_estado_txt) + (o.envio_estado ? ' [' + o.envio_estado + ']' : '') : val(/(ENVIO|SHIPPING|SHIPMENT|TRACKING|GUIA).*(ESTATUS|STATUS|ESTADO)|(ESTATUS|STATUS|ESTADO).*(ENVIO|SHIPPING|SHIPMENT|TRACKING|GUIA)/);
  var estCanal = val(/(^| )(ESTADO|ESTATUS|STATUS|STATE)( CANAL| ORDEN| PEDIDO)?$/, /ENVIO|SHIPPING|TRACKING|GUIA|ODOO|ERP|PAGO/);
  return {
    folio: folio, ref: ref, guias: guias, sku: skuOdoo.length ? skuOdoo : skuCanal, skuCanal: skuCanal, piezas: pzas,
    estadoCanal: estCanal, estatusEnvio: estEnvio, erp: val(/(^| )ERP/), fecha: String(o.fecha_iso || '') || val(/FECHA|DATE|CREAD|CREATED/),
    paqTexto: String(o.envio_paqueteria || '') || val(/PAQUETERIA|CARRIER|PORTADOR/),
    ultimo: [o.envio_ult_txt, o.envio_ult_donde, o.envio_ts].filter(function (x) { return x; }).join(' · '),
    urlRastreo: /^https?:\/\//i.test(String(o.envio_url || '')) ? String(o.envio_url) : '',
    retorno: String(o.envio_guia_retorno || ''), producto: String(o.producto || ''), odooId: String(o.odoo_id || '')
  };
}

/** Guarda en porFolio los pedidos de un JSON del site; devuelve el arreglo de pedidos. */
function cpIndexar_(t, porFolio) {
  var arr = cpArregloPedidos_(JSON.parse(t));
  arr.forEach(function (o) {
    var d = cpDeSitio_(o);
    if (d.folio && !porFolio[d.folio]) porFolio[d.folio] = d;
    if (d.ref && !porFolio[d.ref]) porFolio[d.ref] = d;
  });
  return arr;
}

/**
 * Los folios que no vinieron en la primera pagina:
 * 1) con el parametro de busqueda del site (si ya se conoce o se descubre con el primer folio);
 * 2) si no, recorriendo las paginas (por_pag / page) filtradas a Walmart, de la mas nueva a la mas vieja.
 */
function cpBuscarFolios_(ruta, folios, porFolio, diag) {
  var p = PropertiesService.getScriptProperties(), t0 = Date.now(), base = ruta.split('?')[0];
  var guard = p.getProperty(CP_SITIO.PROP_PARAM) || '';
  diag.buscadas = []; diag.noHalladas = []; diag.paginas = [];
  function faltan() { return folios.filter(function (f) { return !porFolio[f]; }); }
  function qs(canal, q, pp, pg) { return base + '?por_pag=' + pp + '&page=' + pg + '&canal=' + encodeURIComponent(canal) + '&q=' + encodeURIComponent(q) + '&' + CP_SITIO.QS_VACIOS; }
  function pedir(u) {
    var r = fetchSitio_(u, { crudo: true, silencioso: true }) || {};
    if (!diag.muestra && r.codigo !== 200) diag.muestra = u + ' -> HTTP ' + r.codigo;
    var t = String(r.texto || '').trim();
    return (r.codigo === 200 && /^[\[{]/.test(t)) ? t : '';
  }
  // 1) busqueda: el parametro guardado para todos; si no hay, se prueba con el primer folio que falte
  var params = guard ? [guard] : CP_SITIO.PARAMS;
  var f1 = faltan()[0];
  if (f1 && !guard) {
    params.some(function (pr) {
      try { var t = pedir(qs('', f1, 100, 1)); if (t && t.indexOf(f1) >= 0) { cpIndexar_(t, porFolio); } else if (!diag.muestraQ) diag.muestraQ = (t || '(sin JSON)').substring(0, 300); } catch (e) { diag.muestraQ = String(e.message || e).substring(0, 200); }
      if (porFolio[f1]) { guard = pr; p.setProperty(CP_SITIO.PROP_PARAM, pr); diag.buscadas.push(f1 + ' con ?' + pr); return true; }
      return false;
    });
  }
  if (guard) {
    faltan().forEach(function (f) {
      if (Date.now() - t0 > CP_SITIO.MS_BUSQUEDA) return;
      try { var t = pedir(qs('', f, 100, 1)); if (t && t.indexOf(f) >= 0) cpIndexar_(t, porFolio); } catch (e) {}
      if (porFolio[f]) diag.buscadas.push(f + ' con ?' + guard);
    });
  }
  // 2) paginas filtradas a Walmart
  if (faltan().length) {
    var canal = p.getProperty(CP_SITIO.PROP_CANAL);
    var filtro = canal === null ? null : canal;
    if (filtro === null) {
      CP_SITIO.CANALES_WALMART.some(function (cv) {
        try {
          var t = pedir(qs(cv, '', 50, 1));
          var arr = t ? cpArregloPedidos_(JSON.parse(t)) : [];
          if (arr.length && arr.every(function (o) { return String(o.canal || '').toUpperCase() === 'WL'; })) { filtro = cv; return true; }
        } catch (e) {}
        return false;
      });
      if (filtro === null) filtro = '';   // sin filtro de canal: se recorre todo
      p.setProperty(CP_SITIO.PROP_CANAL, filtro);
    }
    for (var n = 1; n <= CP_SITIO.MAX_PAGINAS && faltan().length; n++) {
      if (Date.now() - t0 > CP_SITIO.MS_BUSQUEDA) { diag.paginas.push('sin tiempo en la pagina ' + n); break; }
      var u = qs(filtro, '', CP_SITIO.POR_PAG, n);
      var t2 = '';
      try { t2 = pedir(u); } catch (e) {}
      if (!t2) { diag.paginas.push(u + ' -> sin datos'); break; }
      var arr2 = cpIndexar_(t2, porFolio);
      diag.paginas.push('page ' + n + ': ' + arr2.length + ' pedidos');
      if (!arr2.length) break;
    }
    diag.canal = filtro || '(sin filtro)';
  }
  diag.noHalladas = faltan();
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
  var estS = cpEstatusEnvio_(d.estatusEnvio);
  var enviado = cpEnviadoCanal_(d.estadoCanal);
  if (enviado !== 'CANCELADA' && /^(En transito|Entregado|Incidencia|Devuelto)$/.test(estS)) enviado = 'SI';   // la paqueteria ya lo tiene aunque el canal diga Created
  var gi = cpGuiasInfo_(d.guias, estS, ctx);
  if (!d.guias.length) ctx.cuenta.sinGuia++;
  var concl = cpConclusion_(enviado || (d.guias.length ? 'SI' : 'NO'), gi.unico, d.guias.length > 0);
  var notas = [];
  if (d.erp) notas.push('#ERP ' + d.erp);
  if (d.fecha) notas.push('fecha ' + d.fecha);
  if (d.estatusEnvio) notas.push('envio en el site: ' + d.estatusEnvio);
  if (d.skuCanal.length && d.sku !== d.skuCanal) notas.push('SKU canal ' + d.skuCanal.join(' | '));
  if (d.retorno) notas.push('guia retorno ' + d.retorno);
  if (d.producto) notas.push(d.producto.substring(0, 60));
  if (d.urlRastreo) gi.links = [d.urlRastreo];   // el link del propio site manda
  return [ped, d.folio, d.ref, d.sku.join(' | '), d.piezas || '', d.estadoCanal ? 'Canal: ' + d.estadoCanal : '', d.estatusEnvio || '', enviado || '',
          gi.paqs.join(' | '), d.guias.join(' | '), gi.ests.join(' | '), d.ultimo || gi.evs.filter(Boolean).join(' | ') || '', concl,
          gi.links.join('\n'), notas.concat(gi.notas).join(' ; '), ahora];
}

/** Menu: 🔎 Consultar pedidos (site + guías). Solo el site (/ventas-general). */
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
    if (!st.ruta) { try { logWarn_('CONSULTA_PEDIDOS', 'No encontre la ruta de datos de ' + CP_SITIO.PAGINA, st.diag); } catch (e) {} }
    else if (st.diag.noHalladas && st.diag.noHalladas.length) { try { logWarn_('CONSULTA_PEDIDOS', st.diag.noHalladas.length + ' folios no estan en ' + st.ruta + ' ni buscandolos uno por uno', st.diag); } catch (e) {} }
    var filas = pedidos.map(function (ped) {
      if (!ped) return CP_ENC.map(function () { return ''; });
      ctx.cuenta.filas++;
      if (st.porFolio[ped]) { ctx.cuenta.sitio++; return cpFilaSitio_(ped, st.porFolio[ped], ctx, ahora); }
      ctx.cuenta.noExiste++;
      var f = CP_ENC.map(function () { return ''; });
      f[CP_ENC.indexOf('PEDIDO')] = ped; f[CP_ENC.indexOf('CONCLUSION')] = 'NO ENCONTRADO'; f[CP_ENC.indexOf('CONSULTADO')] = ahora;
      f[CP_ENC.indexOf('NOTA')] = st.ruta ? 'No esta en Ventas General del site (ni buscando por venta o referencia)' : 'El site no contesto (ver Log, CONSULTA_PEDIDOS)';
      return f;
    });

    reescribirHoja_(h, CP_ENC, filas, { texto: ['PEDIDO', 'VENTA', 'REFERENCIA', 'GUIA'], vacioOk: false });
    var k = ctx.cuenta;
    var msg = k.filas + ' pedidos: ' + k.sitio + ' encontrados en el site, ' + k.noExiste + ' no encontrados, ' + k.sinGuia + ' sin guia; ' +
              k.leidos + ' guias con estatus, ' + k.aAbrir + ' para abrir el link.';
    logOk_('CONSULTA_PEDIDOS', msg, { rutaSite: st.ruta || '(no encontrada)', paginasPedidas: ctx.nPag, segundos: Math.round((Date.now() - t0) / 1000) });
    flushLog_();
    var avisos = [];
    if (!st.ruta) avisos.push('⚠ El site no contesto o no encontre sus datos de /ventas-general. El detalle quedo en el Log (CONSULTA_PEDIDOS).');
    if (k.aAbrir) avisos.push('⚠ ' + k.aAbrir + ' guias quedaron en ABRIR LINK: ni el site ni la pagina de la paqueteria dieron el estatus.');
    dlgInfo_('Consulta Pedidos', msg + '\n\n• La hoja "' + CP_HOJA + '" trae VENTA y REFERENCIA, SKU, si salio, guia, estatus y conclusion.\n• Para abrir el rastreo de todos: SITE SHEET > 📈 Ventas y sobreventa > 🌐 Abrir rastreo de todos los pedidos.' +
      (avisos.length ? '\n\n' + avisos.join('\n') : ''), avisos.length ? 'aviso' : 'ok');
  } catch (e) {
    try { logErr_('CONSULTA_PEDIDOS', String(e.message || e), { pila: String(e.stack || '').substring(0, 400) }); flushLog_(); } catch (e2) {}
    dlgInfo_('Consulta Pedidos', 'No se pudo consultar: ' + String(e.message || e) + '\n\nNo se cambio nada en el site. Vuelve a correr esta misma opcion.', 'error');
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
