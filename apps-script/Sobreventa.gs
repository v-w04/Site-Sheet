/**
 * SITE SHEET - Sobreventa (calco de "Sobreventa.gs" de Venta Diaria Odoo 2026)
 *
 * Baja de Odoo los pickings en estado "waiting"/"confirmed" (lo que ya se
 * vendio y todavia no se surte = sobreventa) y los reparte en dos hojas,
 * SIEMPRE filtrando por cliente WALMART:
 *
 *   - Sobreventa WFS      -> picking type 14 (Ordenes de entrega Walmart WFS)
 *   - Sobreventa Pick      -> picking type 3  (ElectronicsMexico: Pick)
 *                            (mismo nombre que en Venta Diaria)
 *
 * La logica es la MISMA que en Venta Diaria (auth -> company -> verifica picking
 * types -> stock.picking waiting/confirmed -> filtro WALMART -> stock.move ->
 * default_code de los productos -> una fila por SKU). Solo cambia la conexion:
 * usa la de este proyecto (odooExecute_, credenciales en Script Properties).
 * Cada hoja es una foto completa: se reescribe entera en cada corrida
 * (no es un historico). 12 columnas iguales a Venta Diaria + ACTUALIZADO (hora de la corrida).
 */

var SOBREVENTA = {
  CONTACTO: 'WALMART',                 // se filtra SIEMPRE por este cliente
  ESTADOS:  ['waiting', 'confirmed'],  // "en espera" / "confirmado" = sin surtir
  DESTINOS: [
    { hoja: 'Sobreventa WFS',     tipos: [14] },
    { hoja: 'Sobreventa Pick', tipos: [3], cancela: true }   // cancela: la usa CancelacionesSobreventa.gs (6-7am)
  ]
};
var SOB_COMPANY_NAME = 'ElectronicsMexico';

var ENC_SOBREVENTA = ['Referencia', 'Desde', 'Hacia', 'Contacto', 'Fecha programada',
                      'Documento origen', 'Estado', 'Tipo de operaci\u00f3n', 'SKU',
                      'Nombre producto', 'Qty demandada', 'Qty realizada', 'ACTUALIZADO',
                      'CANCELAR EN ODOO'];
var SOB_COL_CHECK = 'CANCELAR EN ODOO';   // casilla: la marcas tu y el menu cancela en Odoo las marcadas

// -- Ayudantes: mismas funciones que usa Venta Diaria, con los nombres/forma de este proyecto --

/** Igual que candado_ de Venta Diaria. */
function sobCandado_(ms) {
  var lock = LockService.getScriptLock();
  try {
    return lock.tryLock(ms || 30000) ? lock : null;
  } catch (e) {
    return null;
  }
}

/** Igual que avisar_ de Venta Diaria. */
function sobAvisar_(texto) {
  try { SpreadsheetApp.getUi().alert(texto); }
  catch (e) { console.log(texto); }
}

/** Igual que logError_ de Venta Diaria (aqui el Log se vacia con flushLog_). */
function sobLogErr_(etapa, e) {
  logErr_(etapa, String(e && e.message || e));
}

/** prop_ de Venta Diaria: devuelve '' si no existe (el de este proyecto truena). */
function sobProp_(k) {
  var v = props_().getProperty(k);
  return (v === null || v === '') ? '' : v;
}
function sobSetProp_(k, v) { props_().setProperty(k, String(v)); }

/** norm_ de Venta Diaria: sin acentos, espacios simples, mayusculas. */
function sobNorm_(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** num_ de Venta Diaria (vacio = 0; el num_ de este proyecto devuelve vacio). */
function sobNum_(v) {
  if (typeof v === 'number') return v;
  if (v === '' || v === null || v === undefined) return 0;
  var n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

/**
 * fecha_ de Venta Diaria: Odoo manda las fechas en UTC como "2026-09-14 06:29:00";
 * se le pega la Z para que se interprete como UTC.
 */
function sobFecha_(d) {
  if (!d) return '';
  if (d instanceof Date) return d;
  var dt = new Date(String(d).replace(' ', 'T') + 'Z');
  return isNaN(dt.getTime()) ? String(d) : dt;
}

/**
 * Id de la empresa ElectronicsMexico (igual que odooCompanyId_ de Venta Diaria).
 * La instancia es multiempresa: sin este filtro se colarian ventas de otras
 * razones sociales. Se cachea en ODOO_COMPANY_ID.
 */
function sobCompanyId_() {
  var guardado = sobProp_('ODOO_COMPANY_ID');
  if (guardado) return Number(guardado);
  var filas = odooExecute_('res.company', 'search_read',
    [[['name', '=', SOB_COMPANY_NAME]]], { fields: ['id', 'name'], limit: 1 });
  if (!filas || !filas.length) return 0;          // sin filtro, pero no truena
  sobSetProp_('ODOO_COMPANY_ID', String(filas[0].id));
  return filas[0].id;
}

/** llamadasDeHoy_ de Venta Diaria: llamadas del dia (contador de este proyecto). */
function sobLlamadasHoy_() {
  try {
    var p = propsUser_();
    return (p.getProperty(PROP_FETCH_DIA) === hoy_()) ? Number(p.getProperty(PROP_FETCH_COUNT) || 0) : 0;
  } catch (e) { return 0; }
}

// Estado de Odoo → etiqueta que se ve en la hoja (igual que el original).
var SOB_ESTADO = { waiting: 'En espera', confirmed: 'Confirmado', assigned: 'Listo' };

/** Menú: revisa la sobreventa ahora y avisa cuántas filas quedaron. */
function revisarSobreventa() {
  if (odooApagado_()) { dlgInfo_('Sobreventa', 'Odoo esta apagado: no hay sesion de Odoo. Abre Odoo en Chrome y en la extension Site Sheet - Cookie da Enviar ahora.', 'aviso'); return; }
  var lock = sobCandado_(3 * 60 * 1000);
  if (!lock) { sobAvisar_('Hay otra corrida en curso. Intenta en un minuto.'); return; }
  try {
    var r = sobreventa_();
    sobAvisar_('Sobreventa actualizada (solo WALMART):\n\n' +
      SOBREVENTA.DESTINOS.map(function (d) {
        return '  · ' + d.hoja + ': ' + (r.porHoja[d.hoja] || 0) + ' línea(s)';
      }).join('\n') +
      '\n\nPickings en espera/confirmados: ' + r.pickings +
      '\nLlamadas a Odoo hoy: ' + sobLlamadasHoy_());
  } catch (e) {
    sobLogErr_('SOBREVENTA', e);
    sobAvisar_('❌ Falló la sobreventa\n\n' + e);
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

/**
 * Trigger: corre en silencio.
 *
 * El trigger corre cada 30 min (48 veces al día) y casi siempre encuentra lo
 * MISMO. Escribir un renglón cada vez llenaba el LOG de basura, así que solo
 * deja renglón cuando:
 *   · la foto CAMBIÓ respecto a la corrida anterior (número de pickings o de
 *     líneas por hoja), o
 *   · es la primera corrida del día ("Trigger vivo"), para saber de un vistazo
 *     que el trigger sigue vivo.
 * Las hojas SIEMPRE se actualizan; lo que se calla es el LOG.
 */
function sobreventaAuto() {
  if (odooApagado_()) { avisoDia_('odoo-apagado-sob', 'INFO', 'SOBREVENTA', 'Odoo apagado: la sobreventa no se baja (no hay acceso a Odoo)'); flushLog_(); return; }
  var lock = sobCandado_(60 * 1000);
  if (!lock) return;                 // ya hay otra corrida; no encimar llamadas
  try {
    var r = sobreventa_();
    var datos = { pickings: r.pickings, porHoja: r.porHoja };

    // Huella de la corrida: "49|Sobreventa WFS=49;Sobreventa Pick=0"
    var huella = r.pickings + '|' + SOBREVENTA.DESTINOS.map(function (d) {
      return d.hoja + '=' + (r.porHoja[d.hoja] || 0);
    }).join(';');

    var hoy = hoy_();
    if (huella !== sobProp_('SOBREVENTA_HUELLA')) {
      sobSetProp_('SOBREVENTA_HUELLA', huella);
      sobSetProp_('SOBREVENTA_LATIDO_DIA', hoy);
      logOk_('SOBREVENTA', 'Sobreventa Walmart (cambió)', datos);
    } else if (sobProp_('SOBREVENTA_LATIDO_DIA') !== hoy) {
      sobSetProp_('SOBREVENTA_LATIDO_DIA', hoy);
      logOk_('SOBREVENTA', 'Trigger vivo (sin cambios)', datos);
    }
  } catch (e) {
    sobLogErr_('SOBREVENTA', e);
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

/**
 * Núcleo. Devuelve { pickings, porHoja:{<hoja>:n} }.
 * No manda correos ni alertas: solo actualiza las hojas.
 */
function sobreventa_() {
  var company = sobCompanyId_();
  var ctx = company ? { company_id: company } : {};

  // Todos los picking types que nos interesan (WFS + Pick).
  var tipos = [];
  SOBREVENTA.DESTINOS.forEach(function (d) { tipos = tipos.concat(d.tipos); });

  // Verifica los tipos contra Odoo (solo para dejar el nombre en el LOG y
  // avisar si alguno ya no existe). No es crítico si falla.
  try {
    var tv = sobBuscar_('stock.picking.type',
      [['id', 'in', tipos], ['active', '=', true]], ['id', 'name'], ctx);
    var vistos = {};
    tv.forEach(function (t) { vistos[t.id] = true; });
    var faltan = tipos.filter(function (id) { return !vistos[id]; });
    if (faltan.length) {
      logWarn_('SOBREVENTA', 'Hay picking types que Odoo ya no reconoce', { ids: faltan });
    }
  } catch (e) { /* la verificación es opcional */ }

  // 1) Pickings en espera / confirmados de esos tipos.
  var pickings = sobBuscar_('stock.picking',
    [['picking_type_id', 'in', tipos], ['state', 'in', SOBREVENTA.ESTADOS]],
    ['id', 'name', 'state', 'scheduled_date', 'origin',
     'partner_id', 'location_id', 'location_dest_id', 'picking_type_id'], ctx);

  // 2) Solo WALMART (el contacto viene como [id, "WALMART"]).
  pickings = pickings.filter(function (p) {
    return Array.isArray(p.partner_id) &&
           sobNorm_(p.partner_id[1]).indexOf(sobNorm_(SOBREVENTA.CONTACTO)) >= 0;
  });

  var res = { pickings: pickings.length, porHoja: {} };

  if (!pickings.length) {
    // No hay sobreventa Walmart: deja las hojas vacías (solo timestamp + títulos).
    SOBREVENTA.DESTINOS.forEach(function (d) {
      escribirSobreventa_(d.hoja, []);
      res.porHoja[d.hoja] = 0;
    });
    return res;
  }

  // 3) Movimientos (una línea por SKU) de esos pickings.
  var idsPk = pickings.map(function (p) { return p.id; });
  var moves = sobBuscarEnLotes_('stock.move', idsPk, 'picking_id',
    [['state', 'not in', ['cancel', 'draft']]],
    ['id', 'picking_id', 'product_id', 'product_uom_qty', 'quantity', 'state'], ctx);

  // 4) SKU real (default_code) de cada producto.
  var idsProd = {};
  moves.forEach(function (m) {
    if (Array.isArray(m.product_id)) idsProd[m.product_id[0]] = true;
  });
  var prod = {};
  var listaProd = Object.keys(idsProd).map(Number);
  if (listaProd.length) {
    sobBuscarEnLotes_('product.product', listaProd, 'id', [],
      ['id', 'default_code', 'display_name'], ctx).forEach(function (p) {
        prod[p.id] = { sku: p.default_code || '', nombre: p.display_name || '' };
      });
  }

  // 5) Movimientos agrupados por picking.
  var porPicking = {};
  moves.forEach(function (m) {
    var pid = Array.isArray(m.picking_id) ? m.picking_id[0] : null;
    if (!pid) return;
    (porPicking[pid] || (porPicking[pid] = [])).push(m);
  });

  // 6) Filas por hoja (una por movimiento), según el picking type.
  var hojaDeTipo = {};
  SOBREVENTA.DESTINOS.forEach(function (d) {
    d.tipos.forEach(function (id) { hojaDeTipo[id] = d.hoja; });
  });
  var filas = {};
  SOBREVENTA.DESTINOS.forEach(function (d) { filas[d.hoja] = []; });

  pickings.forEach(function (p) {
    var tipoId = Array.isArray(p.picking_type_id) ? p.picking_type_id[0] : null;
    var hoja = hojaDeTipo[tipoId];
    if (!hoja) return;                                  // tipo que no mapeamos

    var base = [
      p.name || '',
      Array.isArray(p.location_id)      ? p.location_id[1]      : '',
      Array.isArray(p.location_dest_id) ? p.location_dest_id[1] : '',
      Array.isArray(p.partner_id)       ? p.partner_id[1]       : '',
      sobFecha_(p.scheduled_date),
      p.origin || '',
      SOB_ESTADO[p.state] || p.state || '',
      Array.isArray(p.picking_type_id)  ? p.picking_type_id[1]  : ''
    ];

    var movs = porPicking[p.id] || [];
    if (!movs.length) {
      filas[hoja].push(base.concat(['', '', 0, 0]));
      return;
    }
    movs.forEach(function (m) {
      var pid = Array.isArray(m.product_id) ? m.product_id[0] : null;
      var info = (pid && prod[pid]) || { sku: '', nombre: '' };
      filas[hoja].push(base.concat([
        info.sku, info.nombre,
        sobNum_(m.product_uom_qty), sobNum_(m.quantity)
      ]));
    });
  });

  // 7) Escribir cada hoja (foto completa).
  SOBREVENTA.DESTINOS.forEach(function (d) {
    escribirSobreventa_(d.hoja, filas[d.hoja]);
    res.porHoja[d.hoja] = filas[d.hoja].length;
  });

  return res;
}

/**
 * Escribe una hoja de sobreventa como foto completa: encabezados en la fila 1 y
 * datos desde la 2, como el resto de las hojas de este proyecto. La hora de la
 * corrida va en la columna ACTUALIZADO (en Venta Diaria iba en una fila arriba
 * del encabezado; aqui no ocupa una fila).
 */
function escribirSobreventa_(nombre, filas) {
  var sh = getHoja_(nombre);
  sobMigrarFilaTitulo_(sh);
  var ahora = ahora_();
  // La hoja se reescribe completa cada 30 min y las filas cambian de lugar: la casilla se guarda por
  // Referencia + SKU y se vuelve a poner en la fila que corresponda (nunca queda marcada otra venta).
  var marcas = sobMarcasPrevias_(sh);
  // Solo se escriben las columnas del script (por encabezado). Tus columnas, formatos y
  // validaciones se quedan.
  // vacioOk: una foto sin sobreventa es un resultado valido (deja la hoja con titulos y sin filas).
  var m = reescribirHoja_(sh, ENC_SOBREVENTA, (filas || []).map(function (f) {
    return f.concat([ahora, marcas[sobLlaveFila_(f)] === true]);
  }), { vacioOk: true, validaciones: true, clave: 'ENC_ESCRITOS_SOBREVENTA_' + nombre.replace(/\W+/g, '_') });
  var cc = escrCol_(m, SOB_COL_CHECK);
  if (cc && m.n > 0) sh.getRange(m.filaDatos, cc, m.n, 1).insertCheckboxes();
}

/** Llave de una linea de sobreventa: Referencia (picking) + SKU. Se ubican por su lugar en ENC_SOBREVENTA (el arreglo que arma este mismo archivo). */
var SOB_I_REF = ENC_SOBREVENTA.indexOf('Referencia'), SOB_I_SKU = ENC_SOBREVENTA.indexOf('SKU');
function sobLlaveFila_(f) { return String(f[SOB_I_REF] || '').trim() + '|' + String(f[SOB_I_SKU] || '').trim().toUpperCase(); }

/** { Referencia|SKU: true } de las casillas marcadas hoy en la hoja (por encabezado). */
function sobMarcasPrevias_(sh) {
  var out = {};
  if (sh.getLastRow() < 2) return out;
  var c;
  try { c = colsHoja_(sh, ['Referencia', 'SKU'], [SOB_COL_CHECK]); } catch (e) { return out; }
  if (c[SOB_COL_CHECK] < 0) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 1)).getValues().forEach(function (f) {
    if (f[c[SOB_COL_CHECK]] === true) out[String(f[c['Referencia']] || '').trim() + '|' + String(f[c['SKU']] || '').trim().toUpperCase()] = true;
  });
  return out;
}

/**
 * Una sola vez por hoja: la version anterior dejaba en la fila 1 "Ultima actualizacion: ..." y el
 * encabezado en la fila 2. Si todavia esta asi, se quita esa fila (era del script) para que el
 * encabezado quede en la fila 1.
 */
function sobMigrarFilaTitulo_(sh) {
  if (sh.getLastRow() < 2) return;
  var a1 = String(sh.getRange(1, 1).getValue() || '');
  if (a1.indexOf('Última actualización') === 0 && String(sh.getRange(2, 1).getValue() || '') === ENC_SOBREVENTA[0]) {
    sh.deleteRow(1);
  }
}

// ── Lectura de Odoo con paginación (reusa la conexión de Venta Diaria) ──────

/**
 * search_read paginado (lotes de 1000) sobre la conexión ya configurada.
 * Reintenta una vez ante un HTTP 429 de Odoo (rate limit por ráfaga).
 */
function sobBuscar_(modelo, dominio, campos, ctx) {
  var limit = 1000, offset = 0, todo = [];
  while (true) {
    var kw = { fields: campos, limit: limit, offset: offset };
    if (ctx) kw.context = ctx;
    var lote = sobEjecutar_(modelo, 'search_read', [dominio], kw) || [];
    todo = todo.concat(lote);
    if (lote.length < limit) break;
    offset += lote.length;
  }
  return todo;
}

/**
 * Igual que sobBuscar_ pero trocea un dominio [campo, 'in', ids] en bloques de
 * 200 ids, para no armar un XML gigante ni pedirle demasiado a Odoo de golpe.
 */
function sobBuscarEnLotes_(modelo, ids, campo, dominioExtra, campos, ctx) {
  var out = [];
  for (var i = 0; i < ids.length; i += 200) {
    var trozo = ids.slice(i, i + 200);
    var dom = [[campo, 'in', trozo]].concat(dominioExtra || []);
    out = out.concat(sobBuscar_(modelo, dom, campos, ctx));
  }
  return out;
}

/** Una llamada a Odoo con un reintento ante 429 (espera y vuelve a intentar). */
function sobEjecutar_(modelo, metodo, args, kw) {
  try {
    return odooExecute_(modelo, metodo, args, kw);
  } catch (e) {
    var msg = String(e && e.message || e);
    if (msg.indexOf('429') >= 0) {
      Utilities.sleep(4000);
      return odooExecute_(modelo, metodo, args, kw);
    }
    throw e;
  }
}
