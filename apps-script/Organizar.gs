/**
 * Organizar.gs
 *
 * Pone orden en el libro: colores de pestana por grupo, orden de las hojas,
 * encabezados con el mismo estilo, fila 1 congelada y una hoja "📑 Indice"
 * con un link a cada hoja y para que sirve.
 *
 * NO toca datos, formulas, filtros ni anchos. Solo:
 *   - color de pestana y posicion
 *   - estilo del encabezado (fila 1): negrita, texto blanco, fondo del grupo
 *   - congelar la fila 1 si la hoja no tenia nada congelado
 *   - la hoja Indice (la unica que se escribe)
 * Las hojas ocultas siguen ocultas. Las hojas que no estan en el registro de
 * abajo se dejan donde estan y salen en el Indice como SIN CLASIFICAR.
 *
 * Menu: 🗂️ Ordenar hojas e indice.  Tambien corre solo, sin avisos, cada hora
 * (orgProgramado_), para que una hoja nueva o reescrita no deshaga el orden.
 *
 * Para agregar una hoja nueva al orden: una linea en ORG_HOJAS.
 */

var ORG_INDICE = '📑 Índice';
var ORG_GUIA   = '📖 Guía del menú';
var ORG_PROP_HUELLA = 'ORG_HUELLA';
var ORG_PROP_ANCHO = 'ORG_ANCHO';
var ORG_PROP_ANCHO2 = 'ORG_ANCHO2';   // por hoja: dia de la ultima revision y ancho que puso el script por columna
// Ancho minimo (px) por hoja y columna (encabezado normalizado): columnas que se llenan despues, a mano, y no pueden quedar angostas.
var ORG_ANCHO_PISO = {
  'Republicar': { 'SKU VIEJO': 260, 'SKU NUEVO': 260, 'ESTADO': 120, 'DIAS AHI': 80, 'MOTIVO': 330, 'ORIGEN': 130, 'FECHA ENTRADA': 125, 'FECHA REPUBLICADO': 150, 'ESTATUS NUEVO': 130, 'NOTA': 240, 'CATEGORIA NUEVA': 220, 'UPC O GTIN AJENO': 200, 'COPIAS': 80, 'FECHA CERRADO': 130 }
};
var ORG_ANCHO_MAX = 280;      // tope en pixeles para columnas de contenido largo
var ORG_ANCHO_MIN = 60;
/* Hojas que ya fijan sus propios anchos (cada vez que se escriben) o que no son tablas de datos. */
function orgSin_(lista, n) { return lista.indexOf(n) !== -1 || /^ENVIO\s+\d+/i.test(n); }   // las hojas ENVIO N ponen su propio formato
var ORG_SIN_ANCHO = ['Recoleccion Historial', 'Recoleccion Formulario', 'WFS', 'Killers bajo minimo', 'Killers', 'Log', 'Envios killers', 'SKU enviados killers', 'KAMS', 'KAMS Departamentos', 'Correo', 'Comisiones', 'CVA Catalogo', 'Cancelaciones', 'Concentrado', 'Inventarios',
                     'Walmart', 'Bloqueados', 'Promociones', 'Variantes', 'Oportunidades', 'Cambio Walmart',
                     'Cotizador', 'Cotizador Candidatos', '_Reglas Cotizador', '_Nombres Cotizacion', '_ConvertirWFS', '_Inactivos', '_Desactivar'];
/* Hojas que ponen SU encabezado (color, fila) cada vez que se escriben: Ordenar no se los pinta.
   Correo lleva el encabezado de la tabla en la fila 4, no en la 1. */
var ORG_SIN_ENCABEZADO = ['Recoleccion Historial', 'Recoleccion Formulario', 'WFS', 'Cancelaciones', 'Correo', 'Walmart', 'Bloqueados', 'Promociones', 'Comisiones', 'CVA Catalogo',
                          'Concentrado', 'Variantes', 'Oportunidades', 'Cambio Walmart', 'Killers bajo minimo',
                          'Cotizador', 'Cotizador Candidatos', '_Reglas Cotizador', '_Nombres Cotizacion',
                          '_ConvertirWFS', '_Inactivos', '_Desactivar'];
/* Hojas cuyo encabezado NO esta en la fila 1 (la fila 1 trae un titulo o fecha): fila del encabezado. */
var ORG_FILA_ENC = {};   // ninguna hoja por ahora: todas llevan el encabezado en la fila 1
function orgFilaEnc_(nombre) { return ORG_FILA_ENC[nombre] || 1; }
/* Un solo presupuesto para todo Ordenar (Apps Script corta a los 6 min), repartido entre etapas. */
var ORG_PRESUPUESTO_MS = 280 * 1000;
var ORG_T0 = 0;

/* Cada grupo = UN solo color para todas sus pestañas (asi se ve donde empieza y donde termina el grupo).
   Los grupos que quedan uno junto a otro llevan colores bien distintos entre si. */
var ORG_GRUPOS = {
  GUIA:    { titulo: '📖 GUIA',                      color: '#00796b' },
  KILLERS: { titulo: '🔥 KILLERS',                   color: '#d93025' },
  VENTAS:  { titulo: '📈 VENTAS',                    color: '#3949ab' },
  WFS:     { titulo: '🚚 WFS',                       color: '#f9ab00' },
  WALMART: { titulo: '🏬 WALMART',                   color: '#1a73e8' },
  PRECIOS: { titulo: '💲 PRECIOS',                   color: '#188038' },
  ODOO:    { titulo: '📦 ODOO',                      color: '#7b1fa2' },
  RECOLECCION: { titulo: '🚛 RECOLECCIÓN',           color: '#0097a7' },
  CONFIG:  { titulo: '⚙️ LISTAS',                    color: '#5f6368' },
  SISTEMA: { titulo: '🛠️ SISTEMA',                    color: '#e37400' },
  OCULTAS: { titulo: '🙈 OCULTAS',                   color: '#9aa0a6' }
};
var ORG_COLOR_SIN_CLASIFICAR = '#202124';
/** Color de pestaña: el del grupo (igual para todas las hojas del grupo). */
function orgColorPestana_(grupo) {
  var g = ORG_GRUPOS[grupo];
  return g ? g.color : null;
}

/** [nombre de hoja, grupo, para que sirve, como se actualiza]. El orden de aqui es el orden del libro. */
var ORG_HOJAS = [
  [ORG_GUIA,               'GUIA',    'Qué hace cada opción del menú y cuándo usarla', 'Auto (Ordenar)'],
  ['Killers bajo minimo',  'KILLERS', 'Killers bajo tu mínimo: falta, categoría, KAM, UPC y % de pérdida', 'Auto, cada hora'],
  ['Killers',              'KILLERS', 'Killers activos y propuestas del site', 'Auto, cada hora'],
  ['Killers activos',      'KILLERS', 'Killer vigente por SKU: mínimo, negociado, cupón, pagan, fechas y KAM', 'Auto, cada hora + Menú'],
  ['Killers historico',    'KILLERS', 'Fotos de killers activos por cambio (-1, -2, -3…). Solo crece', 'Auto, cada hora'],
  ['Promociones',          'KILLERS', 'Promociones del site por SKU', 'Auto, cada hora'],
  ['Comisiones',           'KILLERS', 'Comisión por categoría de Walmart', 'Auto, cada hora'],
  ['CVA Catalogo',         'KILLERS', 'Stock CVA de hoy: clave, precio y piezas', 'Auto, cada hora'],
  ['KAMS',                 'KILLERS', 'Contactos de los KAMs: grupo, nombre y correo', 'A mano'],
  ['KAMS Departamentos',   'KILLERS', 'Grupo KAM de cada departamento de Walmart', 'A mano'],
  ['Estado Killers',    'KILLERS',  'Decisión por SKU -MSI: KAM, killer sí/no, parrilla y avisos', 'Auto + Menú'],
  ['Correo',               'KILLERS', 'Asunto, mensaje y vista previa del correo de bajo mínimo', 'Auto + Menú'],
  ['Envios killers',       'KILLERS', 'Bitácora de correos enviados a los KAMs', 'Auto, al enviar'],
  ['SKU enviados killers', 'KILLERS', 'SKU ya enviados en solicitudes reales', 'Auto, al enviar'],

  ['Resumen venta y killers', 'VENTAS', 'Venta por mes: WFS, seller, killers, total y diario', 'Auto, cada hora + Menú'],
  ['Ventas Walmart',       'VENTAS', 'Todas las ventas Walmart desde oct-2026. Solo crece', 'Auto, cada hora + Menú'],
  ['Ventas killers mes en curso', 'VENTAS', 'Ventas -MSI del mes con su killer al momento de la venta', 'Auto, cada hora + Menú'],
  ['Ventas killers historico', 'VENTAS', 'Meses cerrados de ventas con killer (valores fijos)', 'Auto, al cambiar de mes'],
  ['Ventas 30 dias',       'VENTAS', 'Piezas vendidas por SKU en 30 días (la usa WFS)', 'Auto, cada hora + Menú'],
  ['Pedidos CVA',          'VENTAS', 'Ventas de SKUs -CVA (Odoo). Base del correo por venta CVA', 'Auto, cada hora + Menú'],
  ['Resumen venta CVA',    'VENTAS', 'Venta CVA por mes, aparte de Walmart', 'Auto, cada hora + Menú'],
  ['Alertas de precio',    'VENTAS', 'Ventas Walmart bajo el mínimo. Solo crece', 'Auto, cada hora + Menú'],

  ['WFS',                  'WFS',     'Hoja de trabajo del envío a WFS: ventas, propuesta y envío final', 'Auto, cada hora + Menú'],
  ['HISTORICO ENVIOS',     'WFS',     'Envíos archivados, una línea por SKU', 'Menú: Archivar'],
  ['Traslados Odoo',       'WFS',     'Traslados a WFS creados en Odoo, por SKU', 'Menú: Crear traslado'],
  ['Autorizaciones WFS',   'WFS',     'Copias para autorización: link, estado y con quién', 'Menú'],
  ['Restricciones WFS',    'WFS',     'SKU y categorías que no van a WFS', 'A mano + Menú'],
  ['HISTORICO CHOFERES',   'WFS',     'Choferes de cada envío archivado', 'Menú: Archivar'],
  ['HISTORICO CAMIONETAS', 'WFS',     'Camionetas de cada envío archivado', 'Menú: Archivar'],
  ['CATALOGO CHOFERES',    'WFS',     'Choferes para elegir en el envío', 'A mano + al archivar'],
  ['CATALOGO CAMIONETAS',  'WFS',     'Camionetas para elegir en el envío', 'A mano + al archivar'],

  ['Walmart',              'WALMART', 'Catálogo de Walmart: UPC, GTIN, precio y WFS', 'Auto, 15 min'],
  ['Bloqueados',           'WALMART', 'Artículos bloqueados en el dashboard', 'Auto, con Walmart'],
  ['Concentrado',          'WALMART', 'Por SKU: Walmart + Odoo + precios + categorías', 'Menú'],
  ['Variantes',            'WALMART', 'Familias y variantes de Odoo por SKU', 'Auto 7:00 + Menú'],
  ['Oportunidades',        'WALMART', 'Oportunidades de precio', 'Auto 7:00 + Menú'],

  ['Republicar',        'WALMART', 'Publicaciones a rehacer: SKU nuevo propuesto y estado', 'Auto + Menú'],
  ['Cobro distinto',       'WALMART', 'SKU donde Walmart cobró otra categoría', 'Auto, cada hora + Menú'],
  ['Cobro distinto detalle','WALMART', 'Pedidos con cobro distinto: cobrado vs debido', 'Auto, cada hora + Menú'],
  ['Killers sin minimo',   'WALMART', 'Killers bajo tu mínimo (Dashboard del site)', 'Auto, cada hora + Menú'],

  ['Precio libre',         'WALMART', 'SKU que vendes baratos a propósito: no alertan', 'A mano'],
  ['SKU asignados',        'WALMART', 'SKU ligados a uno principal: vale el mínimo más bajo', 'A mano'],
  ['Comparar Walmart',     'WALMART', 'Killers vs precio real y mínimo: decisión, problema y caso', 'Auto, cada hora + Menú'],
  ['Categoria revisar',    'WALMART', 'Killers con categoría distinta a la de Walmart', 'Auto, con Comparar'],
  ['Casos Walmart',        'WALMART', 'Casos con Walmart: estado, último correo y acción. No se borra', 'Auto (correos) + Menú'],
  ['Cancelaciones',        'WALMART', 'Cancelaciones del cliente y sobreventa Pick. Solo crece', 'Auto, cada hora + Menú'],
  ['Cancelada en camino',  'WALMART', 'Salio y se cancelo en Odoo: seguir el paquete hasta que regrese', 'Auto, con ventas'],
  ['Sobreventa WFS',       'WALMART', 'Salidas WFS sin surtir: QUE PASO y ACCION (site, stock WFS, traslados)', 'Auto, 30 min'],
  ['Sobreventa Pick',   'WALMART', 'Picks Walmart sin surtir, por SKU', 'Auto, 30 min'],
  ['Consulta Pedidos',  'WALMART', 'Pegas pedidos y trae venta, SKU, guía, estatus y rastreo', 'Menú'],

  ['Walmart EDI',          'WALMART', 'Publicaciones Walmart EDI del site', 'Menú'],
  ['Cruce EDI',            'WALMART', 'Walmart EDI vs Bloqueados: diagnóstico por SKU (no asignados)', 'Auto, cada 2 h + Menú'],
  ['_ConvertirWFS',        'WALMART', 'GTINs por categoría para convertir a WFS', 'Menú'],
  ['_Inactivos',           'WALMART', 'Plantilla de ticket de producto inactivo', 'Menú'],
  ['_Desactivar',          'WALMART', 'Publicaciones RES/WL/OB activas a dar de baja', 'Menú'],

  ['Cambio Walmart',       'PRECIOS', 'Hoja de trabajo del cambio de precios', 'Menú'],
  ['EXPORTAR',             'PRECIOS', 'Precio final, -2% y carga por SKU publicado', 'Auto, cada hora + Menú'],
  ['MINIMO',               'PRECIOS', 'Precio mínimo por SKU publicado', 'Auto, cada hora'],
  ['MAXIMO',               'PRECIOS', 'Precio máximo por SKU publicado', 'Auto, cada hora'],
  ['Precios variaciones',  'PRECIOS', 'Precios a mano del libro de variaciones (ganan)', 'Auto, con EXPORTAR'],
  ['Cotizador',            'PRECIOS', 'Hoja de trabajo de la cotización', 'Menú'],
  ['Cotizador Candidatos', 'PRECIOS', 'Opciones encontradas por partida', 'Menú'],
  ['Precios EM Minimo',    'PRECIOS', 'Precios EM, mínimo', 'Auto, cada hora'],
  ['Precios EM Normal',    'PRECIOS', 'Precios EM, normal', 'Auto, cada hora'],
  ['Precios EM Maximo',    'PRECIOS', 'Precios EM, máximo', 'Auto, cada hora'],
  ['Precios CVA Minimo',   'PRECIOS', 'Precios CVA, mínimo', 'Auto, cada hora'],
  ['Precios CVA Normal',   'PRECIOS', 'Precios CVA, normal', 'Auto, cada hora'],
  ['Precios CVA Maximo',   'PRECIOS', 'Precios CVA, máximo', 'Auto, cada hora'],

  ['Inventario Actual',    'ODOO',    'Existencias por SKU', 'Auto, 15 min'],
  ['Inventario Negativo',  'ODOO',    'SKUs con existencia negativa', 'Auto, 15 min'],
  ['Inventarios',          'ODOO',    'Inventario por referencia, marca y modelo', 'Menú'],
  ['Catalogo',             'ODOO',    'Catálogo de Odoo', 'Menú'],

  ['Recoleccion Historial', 'RECOLECCION', 'Solicitudes de recolección: fecha y resultado', 'Auto, L-V 7:00'],
  ['Recoleccion Formulario', 'RECOLECCION', 'Formulario de Walmart cada vez que cambia', 'Auto'],

  ['_Marcas',              'CONFIG',  'Prefijo de SKU → marca', 'A mano'],
  ['_Marcas Excepciones',  'CONFIG',  'Excepciones de marcas', 'A mano'],
  ['_Colores',             'CONFIG',  'Código de color → nombre', 'A mano'],
  ['_Reglas Cotizador',    'CONFIG',  'Reglas de búsqueda del cotizador', 'A mano + Menú'],
  ['_Nombres Cotizacion',  'CONFIG',  'Nombre de cada SKU en la cotización', 'Auto + a mano'],
  ['_CancelOdoo',          'CONFIG', 'Cómo cancela Odoo: modelos, campos y botones', 'Menú'],

  ['Salud',                'SISTEMA', 'Por proceso: ritmo, última buena, último error y estado', 'Auto, cada hora + Menú'],
  ['Log',                  'SISTEMA', 'Bitácora de todo lo que corre', 'Auto']
];

/**
 * Lista efectiva del registro: ORG_HOJAS mas las hojas "Parrilla <KAM>" que existan (se crean solas cuando aparece un grupo KAM nuevo),
 * que entran ordenadas por nombre justo despues de "Estado Killers" y con el color de KILLERS. Asi una parrilla nueva nunca queda
 * al final como SIN CLASIFICAR ni entre hojas que no son de su familia.
 */
function orgListaActual_() {
  var nombres = {};
  SpreadsheetApp.getActive().getSheets().forEach(function (h) { nombres[h.getName()] = true; });
  var fijos = {};
  ORG_HOJAS.forEach(function (f) { fijos[f[0]] = true; });
  var parr = Object.keys(nombres).filter(function (n) { return /^Parrilla\s+\S/.test(n) && !fijos[n]; }).sort();
  var envios = Object.keys(nombres).filter(function (n) { return /^ENVIO\s+\d+/i.test(n) && !fijos[n]; }).sort(function (a, b) {
    return Number(/^ENVIO\s+(\d+)/i.exec(b)[1]) - Number(/^ENVIO\s+(\d+)/i.exec(a)[1]) || (a < b ? -1 : 1);
  });
  var out = [];
  ORG_HOJAS.forEach(function (f) {
    if (f[0] === 'WFS') envios.forEach(function (n) {   // hojas ENVIO N: primero de la familia WFS, la mas nueva arriba
      out.push([n, 'WFS', 'Envío ' + n.replace(/^ENVIO\s+/i, '') + ' en preparación: propuesta, autorizado y choferes', 'Menú (se archiva)']);
    });
    out.push(f);
    if (f[0] === 'Estado Killers') parr.forEach(function (n) {
      out.push([n, 'KILLERS', 'SKU -MSI con stock del KAM ' + n.replace(/^Parrilla\s+/, ''), 'Auto + Menú']);
    });
  });
  return out;
}



/* ================================================================== */
/*  Guia del menu SITE SHEET                                          */
/* ================================================================== */

/**
 * [seccion, opcion, que hace, cuando usarla, nivel]
 * nivel: DIARIO = lo usas en tu operacion | A VECES = cuando toca | SOPORTE = solo si algo falla o se configura | CUIDADO = borra o rehace cosas
 * Si cambias el menu en Setup.gs, cambia aqui la linea y corre Ordenar hojas.
 */
var ORG_GUIA_MENU = [
  ['SITE SHEET', '🔄 Bajar TODO ahora', 'Baja precios (6 hojas) e inventario ya, como las corridas automáticas.', 'Para datos frescos sin esperar', 'A VECES'],
  ['SITE SHEET', '🗂️ Ordenar hojas e índice', 'Orden, colores, encabezados, formatos, anchos, recorte de vacías, Índice y esta guía.', 'Hoja nueva o libro desordenado', 'A VECES'],
  ['🔥 Killers › 🎯 Killers activos y Comparar Walmart', '🔄 Actualizar Killers activos y Comparar Walmart', 'Rehace Killers activos, Comparar Walmart y Categoría revisar. Corre sola cada hora.', 'Para ver ya un killer nuevo', 'DIARIO'],
  ['🔥 Killers › 🎯 Killers activos y Comparar Walmart', '🎚️ Bandas de Comparar Walmart (DEJAR / REVISAR KAM)', 'Cortes de Comparar: % bajo mínimo para DEJAR (3) y para CAMBIO / QUITAR (10). Guarda y recompara.', 'Para ser más o menos estricta', 'SOPORTE'],
  ['🔥 Killers › ✉️ Envíos a KAMs', '1 · Solicitud del mes (todo)', 'Formulario: mes, propuestas, grupos KAM. Manda todo cada parrilla. PRUEBA (solo a ti) o REAL.', 'Una vez al mes, primero PRUEBA', 'A VECES'],
  ['🔥 Killers › ✉️ Envíos a KAMs', '2 · Nuevos + faltantes (sin killer)', 'Manda a cada KAM los SKU en parrilla sin killer. Nuevos en verde, ya enviados en amarillo.', 'Productos nuevos o pedir revisión', 'A VECES'],
  ['🔥 Killers › ✉️ Envíos a KAMs', '3 · SOLO los nuevos', 'Manda solo los SKU que nunca se habían enviado.', 'SKU nuevos en la parrilla', 'A VECES'],
  ['🔥 Killers › ✉️ Envíos a KAMs', '4 · Bajo mínimo', 'Un correo por grupo KAM con las filas ENVIAR = SI de la hoja Correo. Muestra antes a quién y qué.', 'Pedir cambio de killers', 'DIARIO'],
  ['🔥 Killers › ✉️ Envíos a KAMs', '🔎 Revisar correos de killers enviados', 'Lista los correos de solicitud de los últimos 10 días: fecha, a quién, asunto y adjunto.', 'Confirmar que salieron', 'A VECES'],
  ['🔥 Killers › 📉 Bajo mínimo', '📊 Calcular killers bajo mínimo', 'Killers que pierden más de 3% contra tu mínimo, con categoría, KAM, UPC y GTIN. Corre cada hora.', 'Ver killers bajo mínimo ya', 'DIARIO'],
  ['🔥 Killers › 📉 Bajo mínimo', '📋 Actualizar hoja Correo', 'Rehace la vista previa del correo de bajo mínimo; pon NO en ENVIAR a lo que no va.', 'Antes de enviar', 'DIARIO'],
  ['🔥 Killers', '📋 Actualizar parrillas por KAM', 'Rehace las parrillas por KAM y Estado Killers. Corre cada hora y al editar KAM o DECISIÓN.', 'Tras cambiar KAMS Departamentos', 'DIARIO'],
  ['🔥 Killers › ⬇️ Bajar del site (corre solo cada hora)', '⬇️ Bajar killers del site', 'Baja killers y propuestas a la hoja Killers.', 'Normalmente solo (cada hora)', 'A VECES'],
  ['🔥 Killers › ⬇️ Bajar del site (corre solo cada hora)', '🏷️ Bajar promociones del site', 'Baja las promociones a la hoja Promociones.', 'Normalmente solo (cada hora)', 'A VECES'],
  ['🔥 Killers › ⬇️ Bajar del site (corre solo cada hora)', '💰 Bajar comisiones del site', 'Baja la comisión por categoría a la hoja Comisiones.', 'Normalmente solo (cada hora)', 'A VECES'],
  ['🔥 Killers › ⬇️ Bajar del site (corre solo cada hora)', '📦 Bajar catalogo CVA', 'Copia el stock de CVA (clave, precio, piezas) a CVA Catalogo.', 'Normalmente solo (cada hora)', 'A VECES'],
  ['💲 Precios', '📤 Actualizar EXPORTAR, MINIMO y MAXIMO', 'Rehace EXPORTAR, MINIMO y MAXIMO por SKU publicado. Si falta una fuente no escribe. Cada hora.', 'Cuando cambien precios', 'DIARIO'],
  ['💲 Precios', '🔍 Revisar precios erróneos de ventas Walmart', 'Compara las ventas desde noviembre contra el mínimo; las de abajo van a Alertas de precio. Cada hora.', 'Ver alertas ya', 'A VECES'],
  ['💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)', '1 · 🆕 Nuevo cambio', 'Inicia un cambio de precios (masivo, killers o SKUs) en la hoja Cambio Walmart.', 'Paso 1', 'DIARIO'],
  ['💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)', '1b · 📋 Pegar SKUs', 'Llena la hoja con los SKUs que pegues.', 'Paso 2 si son SKUs específicos', 'DIARIO'],
  ['💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)', '2 · ✅ Marcar lo filtrado', 'Marca las filas visibles del filtro.', 'Paso 2', 'DIARIO'],
  ['💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)', '2 · 🔤 Marcar por texto', 'Marca por categoría, marca o palabra.', 'Paso 2', 'DIARIO'],
  ['💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)', '2 · ☑️ Marcar todo', 'Marca todas las filas.', 'Paso 2', 'DIARIO'],
  ['💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)', '2 · ⬜ Desmarcar todo', 'Quita todas las marcas.', 'Paso 2', 'DIARIO'],
  ['💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)', '3 · ✖️ Aplicar factor de precio', 'Multiplica el precio de lo marcado (0.98 = 98%).', 'Paso 3', 'DIARIO'],
  ['💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)', '4 · 📅 Aplicar fechas', 'Inicio = ahora + 5 min y el fin que digas, en lo marcado.', 'Paso 4, justo antes del archivo', 'DIARIO'],
  ['💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)', '5 · 📄 GENERAR ARCHIVO WALMART', 'Genera el xlsx para Walmart en Drive (Archivos Walmart).', 'Paso 5', 'DIARIO'],
  ['📈 Ventas', '🗃️ Bajar histórico de ventas Walmart (site)', 'Baja las ventas Walmart del site sin duplicar; estatus y guía se actualizan. Sigue sola hasta terminar.', 'Para verlo ya', 'A VECES'],
  ['📈 Ventas › 💰 Venta total y killers (resumen del mes)', '💰 Actualizar ventas con killer', 'Cruza cada venta con su killer, cierra meses y rehace Resumen venta y killers. Cada hora.', 'Ver lo que dejan los killers', 'DIARIO'],
  ['📈 Ventas › 💰 Venta total y killers (resumen del mes)', '🔁 Rehacer un mes cerrado', 'Vuelve a cruzar un mes cerrado y lo reemplaza en el histórico.', 'Llegaron datos tarde', 'SOPORTE'],
  ['📈 Ventas', '📈 Bajar ventas 30 dias', 'Llena Ventas 30 dias (piezas por SKU). Se actualiza sola cada hora.', 'Forzarla ahora', 'A VECES'],
  ['📈 Ventas › 🟣 Ventas CVA', '🟣 Bajar ventas CVA (Odoo)', 'Baja las ventas -CVA a Pedidos CVA y manda el correo del día si toca. Cada hora.', 'Verlas ya', 'A VECES'],
  ['📈 Ventas › 🟣 Ventas CVA', '✉️ Mandar correo CVA pendiente', 'Manda ya las ventas CVA sin avisar a victor.walmart.04@gmail.com.', 'Si no salió el del día', 'SOPORTE'],
  ['📈 Ventas › 🟣 Ventas CVA', '🔀 Pasar el correo CVA a Site Sheet (después de apagar Venta Diaria)', 'El correo CVA de las 8 am sale de aquí y no de Venta Diaria. Antes quita los activadores de Venta Diaria.', 'Una vez, al apagar Venta Diaria', 'CUIDADO'],
  ['📈 Ventas', '🔎 Consultar pedidos (site + guías)', 'Busca en el site los pedidos de Consulta Pedidos: SKU, si salió, guía, paquetería y estatus. Solo lee.', 'Saber dónde va un pedido', 'A VECES'],
  ['📈 Ventas', '🌐 Abrir rastreo de todos los pedidos', 'Abre el rastreo de cada guía de Consulta Pedidos.', 'Tras Consultar pedidos', 'A VECES'],
  ['🚫 Pedidos con problema › 📦 Sobreventa', '📦 Revisar sobreventa (Walmart)', 'Baja la sobreventa de Odoo y en WFS dice qué pasó y qué hacer por pedido.', 'Normalmente solo (30 min)', 'A VECES'],
  ['🚫 Pedidos con problema › 📦 Sobreventa', '👁 Ver qué cancelaría la sobreventa', 'Muestra qué ventas de Pick cancelaría la corrida de 6-7 am. No cancela.', 'Antes de aceptar guías', 'A VECES'],
  ['🚫 Pedidos con problema › 📦 Sobreventa', '❌ Cancelar en Odoo las marcadas de sobreventa', 'Cancela en Odoo las ventas marcadas en Sobreventa Pick o WFS y las anota en Cancelaciones.', 'Cancelar sobreventa a mano', 'CUIDADO'],
  ['🚫 Pedidos con problema › ❌ Cancelaciones', '📥 Leer cancelaciones del correo', 'Lee los correos de cancelación de Walmart y los agrega a Cancelaciones. Cada hora, sin repetir.', 'Leer ya', 'A VECES'],
  ['🚫 Pedidos con problema › ❌ Cancelaciones', '📋 Pendientes de cancelar en el site', 'Lista las cancelaciones que faltan en el site. Solo consulta.', 'Cada mañana', 'DIARIO'],
  ['🚫 Pedidos con problema › ❌ Cancelaciones', '🧾 Verificar cancelaciones en Odoo', 'Llena ESTADO ODOO y la entrega de cada cancelación. Solo lee. Cada hora.', 'Revisar ya', 'A VECES'],
  ['🚫 Pedidos con problema › ❌ Cancelaciones', '❌ CANCELAR EN ODOO las marcadas', 'Cancela en Odoo lo marcado con tu usuario y PIN. Si ya salió, avisa que es devolución.', 'Tras marcar casillas', 'CUIDADO'],
  ['🚫 Pedidos con problema › ❌ Cancelaciones', '🧪 Cancelar UNA venta por número', 'Cancela en Odoo una venta por su número, con confirmación.', 'Probar o una venta suelta', 'CUIDADO'],
  ['🚫 Pedidos con problema › ❌ Cancelaciones', '🔑 Guardar PIN y quién cancela', 'Guarda tu nombre y PIN en el script, solo para cancelar.', 'Una vez o si cambia el PIN', 'SOPORTE'],
  ['🚫 Pedidos con problema › ❌ Cancelaciones', '⏱️ Activar cancelaciones automáticas', 'Crea la corrida horaria de cancelaciones y casos en la cuenta que recibe los correos.', 'Una vez, con esa cuenta', 'SOPORTE'],
  ['🚫 Pedidos con problema › ❌ Cancelaciones', '🎨 Formato de cancelaciones', 'Pone casillas, colores por día y fechas en Cancelaciones.', 'Si se ve mal', 'SOPORTE'],
  ['🚫 Pedidos con problema › ❌ Cancelaciones', '↔️ Ordenar columnas de cancelaciones', 'Acomoda las columnas de Cancelaciones por importancia.', 'Si se desordena', 'SOPORTE'],
  ['🚫 Pedidos con problema', '💸 Bajar cobro distinto', 'Llena Cobro distinto y Killers sin mínimo desde el Dashboard del site. Cada hora.', 'Forzarlo ahora', 'A VECES'],
  ['🚫 Pedidos con problema', '📂 Casos Walmart (revisar)', 'Lee correos de casos, agrega los de cobro distinto y pone listas y colores. Nada se borra.', 'Dar seguimiento a casos', 'A VECES'],
  ['🏬 Catálogo Walmart', '⬇️ Bajar catálogo de Walmart', 'Llena la hoja Walmart desde el dashboard. Rápido si nada cambió.', 'Normalmente solo (15 min)', 'A VECES'],
  ['🏬 Catálogo Walmart', '🔁 Actualizar hoja Republicar', 'Agrega lo que hay que republicar, propone SKU NUEVO y marca REPUBLICADO. No bloquea nada.', 'Normalmente solo', 'A VECES'],
  ['🏬 Catálogo Walmart › 📋 Walmart EDI', '📋 Bajar lista Walmart EDI', 'Llena Walmart EDI con todas las publicaciones para depurar.', 'Al depurar', 'A VECES'],
  ['🏬 Catálogo Walmart › 📋 Walmart EDI', '🔀 Cruzar EDI vs Bloqueados', 'Diagnóstico por SKU (asignar, bloquear, ok) en Cruce EDI. Solo recomienda.', 'Tras bajar EDI', 'A VECES'],
  ['🏬 Catálogo Walmart › 🧾 Listas para Walmart', '📦 GTINs para convertir a WFS', 'GTINs por categoría para pegar en el seller center.', 'Al convertir a WFS', 'A VECES'],
  ['🏬 Catálogo Walmart › 🧾 Listas para Walmart', '🚫 Productos inactivos', 'Llena la plantilla de ticket de producto inactivo.', 'Ticket por inactivos', 'A VECES'],
  ['🏬 Catálogo Walmart › 🧾 Listas para Walmart', '🧹 Publicaciones viejas a dar de baja', 'Lista publicaciones RES/WL/OB activas para pedir su baja.', 'Al limpiar publicaciones', 'A VECES'],
  ['🏬 Catálogo Walmart › 🧬 Concentrado y variantes', '🧱 Armar Concentrado', 'Un renglón por SKU: Walmart + Odoo + precios + categorías.', 'Cuando cambie el catálogo', 'A VECES'],
  ['🏬 Catálogo Walmart › 🧬 Concentrado y variantes', '🧬 Armar Variantes', 'Familias de Odoo ligadas a cada SKU de Walmart.', 'SKUs nuevos', 'A VECES'],
  ['🏬 Catálogo Walmart › 🧬 Concentrado y variantes', '🔗 Asignar variante a mano', 'Liga una publicación a otra familia.', 'Casos raros', 'SOPORTE'],
  ['🏬 Catálogo Walmart › 🧬 Concentrado y variantes', '💰 Buscar oportunidades', 'Llena Oportunidades de precio.', 'Revisar oportunidades', 'A VECES'],
  ['🚚 Logística › 🚚 Envíos WFS', '📥 Actualizar ventas y calcular', 'Trae ventas de 30 días a WFS y calcula MSI, CLÁSICA y ENVÍO FINAL. Avisa si pisa tu trabajo.', 'Antes de armar un envío', 'DIARIO'],
  ['🚚 Logística › 🚚 Envíos WFS', '▶ Calcular envío WFS (sin traer ventas)', 'Recalcula MSI, CLÁSICA y ENVÍO FINAL con las ventas que ya están.', 'Cambió el stock', 'A VECES'],
  ['🚚 Logística › 🚚 Envíos WFS', '🚚 Nuevo envío (hoja ENVIO)', 'Crea la hoja ENVIO N con la propuesta, choferes y camionetas. SKU sin GTIN no entran.', 'Envío listo', 'DIARIO'],
  ['🚚 Logística › 🚚 Envíos WFS', '✏️ Cambiar choferes y camionetas de un envío', 'Cambia ID, delivery, cita, choferes y camionetas de un ENVIO N.', 'Llegan los choferes finales', 'A VECES'],
  ['🚚 Logística › 🚚 Envíos WFS', '📤 Copia para autorización', 'Crea un Sheet aparte con AUTORIZADO en 0 y lo comparte para autorizar.', 'Falta que alguien autorice', 'A VECES'],
  ['🚚 Logística › 🚚 Envíos WFS', '📥 Traer autorizado', 'Copia AUTORIZADO de la copia a la hoja ENVIO.', 'Ya autorizaron', 'A VECES'],
  ['🚚 Logística › 🚚 Envíos WFS', '📦 Crear traslado en Odoo (envío autorizado)', 'Crea el traslado a WFS en Odoo con lo autorizado y lo anota en Traslados Odoo. No duplica.', 'Con lo autorizado', 'A VECES'],
  ['🚚 Logística › 🚚 Envíos WFS', '📄 Archivo para importar el envío en Odoo', 'CSV en Drive con el traslado para importarlo en Odoo. No escribe en Odoo.', 'Con lo autorizado', 'A VECES'],
  ['🚚 Logística › 🚚 Envíos WFS', '📄 Plantilla de Walmart (WFS)', 'Excel de orden de entrada de Walmart con lo autorizado (máx. 101 SKU por archivo).', 'Tras crear el traslado', 'A VECES'],
  ['🚚 Logística › 🚚 Envíos WFS', '📑 PDF del envío (CATEGORIA, NOMBRE, SKU, AUTORIZADO, GTIN)', 'PDF del envío agrupado por KAM; queda en Drive y llega por correo.', 'Para imprimir o compartir', 'A VECES'],
  ['🚚 Logística › 🚚 Envíos WFS', '🗄 Archivar envíos y limpiar', 'Pasa las hojas ENVIO a los históricos y las borra. Si algo no cuadra, no borra.', 'Tras salir el envío', 'CUIDADO'],
  ['🚚 Logística › 🚚 Envíos WFS › 🧰 Herramientas WFS', '🗑 Quitar copias sobrantes', 'Manda a la papelera las copias de envíos que ya no existen.', 'Tras rehacer un envío', 'A VECES'],
  ['🚚 Logística › 🚚 Envíos WFS › 🧰 Herramientas WFS', '🚫 Restricciones WFS', 'Abre la hoja de SKU y categorías que no van a WFS.', 'Vetar o liberar algo', 'A VECES'],
  ['🚚 Logística › 🚚 Envíos WFS › 🧰 Herramientas WFS', '📊 Ver estado de WFS', 'Dice si el cálculo automático corre, qué tan frescas son las ventas y si hay trabajo a medias.', 'Si dudas que esté al día', 'A VECES'],
  ['🚚 Logística › 🚚 Envíos WFS › 🧰 Herramientas WFS', '⏰ Encender cálculo automático (cada hora)', 'Trae ventas y recalcula cada hora; se pausa si editaste Envío o AUTORIZADO.', 'Una vez', 'SOPORTE'],
  ['🚚 Logística › 🚚 Envíos WFS › 🧰 Herramientas WFS', '🛑 Apagar cálculo automático', 'Quita el cálculo de cada hora.', 'Si no quieres que corra solo', 'SOPORTE'],
  ['🚚 Logística › 🚚 Envíos WFS › 🧰 Herramientas WFS', '🔌 Probar lectura de ventas', 'Lee Ventas 30 dias sin tocar WFS.', 'Si no se actualizan', 'SOPORTE'],
  ['🚚 Logística › 🚚 Envíos WFS › 🧰 Herramientas WFS', '📥 Crear hoja WFS (formato de Inventarios WM)', 'Copia la hoja WFS de Inventarios WM y crea históricos y catálogos vacíos.', 'Una sola vez', 'SOPORTE'],
  ['🚚 Logística › 🚛 Recolección Walmart', '📊 Estado (envío diario y formulario)', 'Dice si el envío diario está instalado, qué pasó la última vez y si cambió el formulario.', 'Confirmar que va bien', 'A VECES'],
  ['🚚 Logística › 🚛 Recolección Walmart', '🧪 Probar sin enviar', 'Arma la solicitud y revisa el formulario sin mandar nada.', 'Tras un cambio', 'A VECES'],
  ['🚚 Logística › 🚛 Recolección Walmart', '📨 Enviar ahora', 'Pide ya la recolección del siguiente día hábil, con confirmación.', 'Si no salió la automática', 'CUIDADO'],
  ['🚚 Logística › 🚛 Recolección Walmart', '▶️ Instalar envío diario (L-V 7am)', 'Activa el envío L-V 7:00 con esta cuenta. No duplica.', 'Una vez', 'SOPORTE'],
  ['🚚 Logística › 🚛 Recolección Walmart', '🛑 Quitar envío diario', 'Apaga el envío automático de esta cuenta.', 'Pausar o cambiar de cuenta', 'SOPORTE'],
  ['🧾 Cotizaciones', '🆕 Nueva cotización', 'Deja lista la hoja Cotizador.', 'Inicio', 'A VECES'],
  ['🧾 Cotizaciones', '🔎 Buscar productos', 'Reconoce cada partida y propone SKU en tres gamas.', 'Paso 2', 'A VECES'],
  ['🧾 Cotizaciones', '📄 Generar cotización', 'Guarda la cotización en el libro de historial.', 'Paso 3', 'A VECES'],
  ['🧾 Cotizaciones', '📚 Abrir historial', 'Link del libro de historial.', 'Ver cotizaciones pasadas', 'A VECES'],
  ['🧾 Cotizaciones', '🧩 Reglas de búsqueda', 'Abre la hoja de reglas de búsqueda.', 'Ajustar reconocimiento', 'SOPORTE'],
  ['🧾 Cotizaciones', '🔗 Usar otro libro de historial', 'Cambia el libro del historial.', 'Casi nunca', 'SOPORTE'],
  ['🩺 Salud y diagnóstico', '🩺 Salud del Sheet', 'Abre Salud: por proceso, última corrida buena, último error y estado.', 'Saber si todo corre', 'A VECES'],
  ['🩺 Salud y diagnóstico', '🧪 Probar conexión', 'Prueba que todo conecte.', 'Si algo no baja', 'SOPORTE'],
  ['🩺 Salud y diagnóstico', '👁 Ver qué está configurado', 'Dice qué está configurado, sin mostrar valores.', 'Si algo no baja', 'SOPORTE'],
  ['🩺 Salud y diagnóstico', '📊 Consumo de UrlFetch hoy', 'Consultas al site de hoy contra el límite.', 'Errores de cuota', 'SOPORTE'],
  ['🩺 Salud y diagnóstico', '♻️ Reintentar tras cuota agotada', 'Quita la marca de cuota agotada.', 'Tras reinicio de cuota', 'SOPORTE'],
  ['🩺 Salud y diagnóstico', '🔑 Probar credenciales de killers', 'Prueba qué credencial acepta el site.', 'Killers da 401', 'SOPORTE'],
  ['🩺 Salud y diagnóstico', '🔍 Revisar Concentrado', 'Dice qué tan bien cruzó cada fuente.', 'Tras armar Concentrado', 'SOPORTE'],
  ['🩺 Salud y diagnóstico', '🔍 Revisar variantes', 'Revisa la calidad de las variantes.', 'Tras armar Variantes', 'SOPORTE'],
  ['🩺 Salud y diagnóstico', '🧭 Revisar columnas de todas las hojas', 'Revisa que cada hoja tenga sus columnas.', 'Si falta una columna', 'SOPORTE'],
  ['🩺 Salud y diagnóstico › 🧰 Avanzado (solo si te lo piden)', '🔎 Descubrir ruta de killers', 'Busca la ruta de killers.', 'Si el site la cambia', 'SOPORTE'],
  ['🩺 Salud y diagnóstico › 🧰 Avanzado (solo si te lo piden)', '🧬 Ver estructura de killers', 'Muestra la respuesta de killers sin escribir.', 'Diagnóstico', 'SOPORTE'],
  ['🩺 Salud y diagnóstico › 🧰 Avanzado (solo si te lo piden)', '🔎 Descubrir endpoint de precios', 'Busca la ruta de precios.', 'Si el site cambia', 'SOPORTE'],
  ['🩺 Salud y diagnóstico › 🧰 Avanzado (solo si te lo piden)', '🔬 Analizar la página de precios', 'Analiza la página de precios del site.', 'Diagnóstico', 'SOPORTE'],
  ['🩺 Salud y diagnóstico › 🧰 Avanzado (solo si te lo piden)', '🧬 Ver estructura de la respuesta', 'Muestra cómo viene la respuesta del site.', 'Diagnóstico', 'SOPORTE'],
  ['🩺 Salud y diagnóstico › 🧰 Avanzado (solo si te lo piden)', '🧪 Volcar un registro de muestra', 'Muestra un registro de ejemplo.', 'Diagnóstico', 'SOPORTE'],
  ['🩺 Salud y diagnóstico › 🧰 Avanzado (solo si te lo piden)', '🔎 Radiografía de una hoja', 'Escribe en _Radiografia cómo está armada una hoja.', 'Revisar fórmulas', 'SOPORTE'],
  ['🩺 Salud y diagnóstico › 🧰 Avanzado (solo si te lo piden)', '🔬 Ver campos de Odoo', 'Escribe en _CamposOdoo los campos de product.template.', 'Ubicar un campo', 'SOPORTE'],
  ['🩺 Salud y diagnóstico › 🧰 Avanzado (solo si te lo piden)', '🔎 Descubrir cancelación en Odoo', 'Lee cómo cancela Odoo y lo deja en _CancelOdoo. No cancela.', 'Una sola vez', 'SOPORTE'],
  ['🩺 Salud y diagnóstico › 🧰 Avanzado (solo si te lo piden)', '↩️ Ruta de killers de fábrica', 'Regresa la ruta de killers a la de fábrica.', 'Killers dejó de bajar', 'SOPORTE'],
  ['🩺 Salud y diagnóstico › 🧰 Avanzado (solo si te lo piden)', '🔍 Revisar triggers de esta cuenta', 'Corridas de esta cuenta, acceso al dashboard y última línea del Log.', 'Si algo no corre solo', 'SOPORTE'],
  ['🩺 Salud y diagnóstico › 🧰 Avanzado (solo si te lo piden)', '🔍 SKUs del inventario que faltan en Odoo', 'Cuenta SKUs de Inventario Actual que no están en Catalogo.', 'Huecos en Inventarios', 'SOPORTE'],
  ['🩺 Salud y diagnóstico › 🧰 Avanzado (solo si te lo piden)', '🔍 Marcas y colores sin traducir', 'Lista prefijos sin marca y códigos sin color.', 'Tras rehacer Inventarios', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › ⏱ Corridas automáticas', '🔍 Ver triggers de este proyecto', 'Lista las corridas activas.', 'Verificar que corre solo', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › ⏱ Corridas automáticas', '▶️ Activar TODAS las corridas', 'Borra todos los activadores de tu cuenta y pone las corridas fijas y las opcionales que ya tenías.', 'Una vez o si dejan de correr', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › ⏱ Corridas automáticas', '🛑 Quitar corridas', 'Apaga todas las corridas de tu cuenta.', 'Pausar todo', 'CUIDADO'],
  ['⚙️ Configuración y mantenimiento › 📥 Traer de Venta Diaria (una vez)', '📥 Traer TODO de Venta Diaria (una vez)', 'Copia sin duplicar lo de Venta Diaria. Reanudable.', 'Una sola vez', 'A VECES'],
  ['⚙️ Configuración y mantenimiento › 🛠 Mantenimiento', '💲 Solo precios (6 hojas)', 'Baja solo las 6 hojas de precios.', 'Solo precios', 'A VECES'],
  ['⚙️ Configuración y mantenimiento › 🛠 Mantenimiento', '🧪 Probar ruta nueva de precios', 'Pide 3 productos a la ruta nueva y deja el resultado en el Log.', 'Probar la ruta', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🛠 Mantenimiento', '📦 Solo inventario', 'Baja solo Inventario Actual y Negativo.', 'Solo inventario', 'A VECES'],
  ['⚙️ Configuración y mantenimiento › 🛠 Mantenimiento', '🗂 Bajar catálogo de Odoo', 'Baja el catálogo de Odoo a Catalogo.', 'Productos nuevos en Odoo', 'A VECES'],
  ['⚙️ Configuración y mantenimiento › 🛠 Mantenimiento', '♻️ Rehacer hoja Walmart (forzado)', 'Reescribe la hoja Walmart aunque no haya cambios.', 'Si se ve mal', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🛠 Mantenimiento', '🧩 Rehacer hoja Inventarios', 'Reconstruye Inventarios desde cero.', 'Si se dañó', 'CUIDADO'],
  ['⚙️ Configuración y mantenimiento › 🛠 Mantenimiento', '💥 Forzar rebajada completa', 'La próxima corrida reescribe todas las hojas.', 'Si una hoja no se arregla', 'CUIDADO'],
  ['⚙️ Configuración y mantenimiento › 🛠 Mantenimiento', '🧹 Quitar respaldos y hojas viejas', 'Borra respaldos y hojas huérfanas.', 'De vez en cuando', 'CUIDADO'],
  ['⚙️ Configuración y mantenimiento › 🛠 Mantenimiento', '🧹 Limpiar Log', 'Borra la hoja Log.', 'Si está enorme', 'CUIDADO'],
  ['⚙️ Configuración y mantenimiento › 🌐 Site y extensión', '🔑 Configurar token API', 'Guarda el token del site.', 'Una vez o si cambia', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🌐 Site y extensión', '🔐 Login automático del site', 'Guarda usuario y clave para renovar la sesión.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🌐 Site y extensión', '🔁 Renovar cookie ahora', 'Renueva la sesión del site.', 'Errores de sesión', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🌐 Site y extensión', '🍪 Actualizar cookie a mano', 'Pega la cookie a mano (vence).', 'Si falla el login', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🌐 Site y extensión', '🧩 Clave de la extensión', 'URL y clave para la extensión de Chrome.', 'Al instalar la extensión', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🌐 Site y extensión', '🔎 Buscar cómo cancela el site', 'Lee el botón Cancelar venta del site y lo deja en el Log. No cancela.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🌐 Site y extensión', '✏️ Poner ruta de precios a mano', 'Captura la ruta de precios.', 'Si el site cambia', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🌐 Site y extensión', '✏️ Poner ruta de killers a mano', 'Captura la ruta de killers.', 'Si el site cambia', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🗄 Odoo', '🗄 Conectar Odoo', 'Guarda la conexión a Odoo.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🗄 Odoo', '🔑 Guardar correo y contraseña de Odoo', 'Guarda tu acceso a Odoo para entrar sin Chrome. Lo prueba al guardar.', 'Una vez (respaldo)', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🗄 Odoo', '🔐 Estado de la sesión de Odoo', 'Dice si hay sesión de Odoo, de quién y si sigue viva.', 'Si Odoo falla', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🗄 Odoo', '🩺 Diagnóstico de permisos de Odoo', 'Qué puede leer, escribir y crear tu usuario en Odoo. Queda en el Log.', 'Ver permisos', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 🗄 Odoo', '🧹 Borrar correo y contraseña de Odoo', 'Quita tu acceso de Odoo del script.', 'Cambias de cuenta', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 📋 Este libro y avisos', '🏬 Conectar Walmart Dashboard', 'Conecta el libro del dashboard de Walmart.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 📋 Este libro y avisos', '📋 Capturar ID del Sheet', 'Guarda el ID de este libro.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 📋 Este libro y avisos', '🔒 Password del dashboard', 'Define la contraseña del dashboard web.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento › 📋 Este libro y avisos', '📧 Poner correo de avisos', 'Guarda el correo de avisos.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración y mantenimiento', '🗑 Borrar TODAS las credenciales', 'Borra token, cookie, logins, clave de la extensión, avisos y Odoo. El PIN se queda.', 'Casi nunca', 'CUIDADO']
];

var ORG_NIVEL_COLOR = { 'DIARIO': '#d9ead3', 'A VECES': '#fff2cc', 'SOPORTE': '#eeeeee', 'CUIDADO': '#f4cccc' };

function orgGuia_(ss) {
  var h = ss.getSheetByName(ORG_GUIA) || ss.insertSheet(ORG_GUIA);
  h.clear();
  var filas = [['SECCIÓN', 'OPCIÓN', 'QUÉ HACE', 'CUÁNDO', 'NIVEL']].concat(ORG_GUIA_MENU);
  var nF = filas.length;
  if (h.getMaxRows() < nF + 3) h.insertRowsAfter(h.getMaxRows(), nF + 3 - h.getMaxRows());
  if (h.getMaxColumns() < 5) h.insertColumnsAfter(h.getMaxColumns(), 5 - h.getMaxColumns());
  h.getRange(1, 1, nF, 5).setValues(filas);
  h.getRange(1, 1, 1, 5).setFontWeight('bold').setFontColor('#ffffff').setBackground(ORG_GRUPOS.GUIA.color);
  var bg = [];
  for (var i = 1; i < nF; i++) {
    var c = ORG_NIVEL_COLOR[filas[i][4]] || '#ffffff';
    bg.push([c, c, c, c, c]);
  }
  h.getRange(2, 1, nF - 1, 5).setBackgrounds(bg).setVerticalAlignment('top');
  h.getRange(2, 1, nF - 1, 5).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);   // una línea por opción
  [250, 300, 600, 230, 80].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  h.setFrozenRows(1);
  try { var f = h.getFilter(); if (f) f.remove(); } catch (e) {}
  h.getRange(1, 1, nF, 5).createFilter();
  h.getRange(1, 1).setNote('DIARIO = operación · A VECES = cuando toca · SOPORTE = si algo falla · CUIDADO = borra o rehace.\nLo que no está en el menú corre solo.');
}

/* ================================================================== */
/*  Formatos: precios como precios, fechas como fechas                  */
/* ================================================================== */

var ORG_RE_DINERO = /^(PRECIO|MINIMO|NORMAL|MAXIMO|NOS PAGAN|PUBLICADO|NEGOCIADO|CUPON|VENDEMOS|TACHADO|ENVIO|WALMART (CLASICA|PREMIUM)|TIENDA NUBE|CLASICA|PREMIUM|FALTA)\b/;
var ORG_RE_FECHA  = /^(ACTUALIZADO|CAPTURADA|INICIA|TERMINA|INICIO|FIN|INI|CAMBIO EL|FECHA PROGRAMADA)\b|\bCORTE$/;
var ORG_FMT_DINERO = '$#,##0.00';
var ORG_FMT_FECHA  = 'yyyy-mm-dd hh:mm';
/* Hojas que ya ponen su propio formato cada vez que se escriben, o que no son tablas de datos. */
var ORG_SIN_FORMATO = ['WFS', 'Killers bajo minimo', 'Killers', 'Log', 'Envios killers', 'SKU enviados killers', 'KAMS', 'KAMS Departamentos', 'Correo', 'Comisiones', 'CVA Catalogo', 'Cancelaciones', 'Cobro distinto', 'Cobro distinto detalle', 'Killers sin minimo',
                       'Walmart', 'Bloqueados', 'Promociones', 'Concentrado', 'Variantes', 'Oportunidades', 'Cambio Walmart', 'Cotizador', 'Cotizador Candidatos',
                       'Killers activos', 'Comparar Walmart', 'EXPORTAR', 'MINIMO', 'MAXIMO', 'Precios variaciones',
                       'Ventas killers mes en curso', 'Ventas killers historico', 'Resumen venta y killers', 'Resumen venta CVA',
                       'Ventas Walmart', 'Pedidos CVA', 'Alertas de precio', 'Killers historico', 'Casos Walmart', 'Precio libre', 'Sobreventa WFS', 'Cancelada en camino'];   // ponen su formato (VentaDiaria.gs VD_FORMATOS)

/**
 * Pone el mismo formato en todas las columnas de dinero y de fecha, buscandolas por ENCABEZADO.
 * Solo toca una columna si sus primeras celdas son del tipo esperado (numeros / fechas reales):
 * el texto se queda como texto y nada se convierte ni se pierde.
 * @return {number} columnas formateadas
 */
function orgFormatos_(ss) {
  var total = 0, fallas = [];
  var limite = Date.now() + orgQueda_() * 0.6;             // su parte del presupuesto; lo que falte se retoma al volver a correrlo
  ss.getSheets().forEach(function (h) {
    if (new Date().getTime() > limite) { fallas.push('(tiempo) ' + h.getName()); return; }
    var n = h.getName();
    if (n === ORG_INDICE || n === ORG_GUIA || orgSin_(ORG_SIN_FORMATO, n)) return;
    if (orgGrupoOculta_(n) || h.isSheetHidden() || /^_/.test(n)) return;
    try {
      total += orgReintento_(function () { return orgFormatosHoja_(h); });
    } catch (e) {
      fallas.push(n);
      console.log('Formatos ' + n + ': ' + e.message);
    }
  });
  orgFormatos_.fallas = fallas;
  return total;
}

/** Formatea una hoja. Se salta las columnas que ya tienen el formato (asi la segunda vuelta casi no cuesta). */
function orgFormatosHoja_(h) {
  var total = 0;
  var nF = h.getLastRow(), nC = h.getLastColumn();
  var fe = orgFilaEnc_(h.getName());
  if (nF < fe + 1 || nC < 1) return 0;
  var muestra = h.getRange(fe, 1, Math.min(nF - fe + 1, 8), nC).getValues();
  var fmts = h.getRange(fe + 1, 1, 1, nC).getNumberFormats()[0];
  var enc = muestra[0];
  for (var c = 0; c < nC; c++) {
    var t = normEnc_(enc[c]);
    if (!t) continue;
    var tipo = ORG_RE_DINERO.test(t) ? 'D' : (ORG_RE_FECHA.test(t) ? 'F' : '');
    if (!tipo) continue;
    var hay = false;
    for (var r = 1; r < muestra.length; r++) {
      var x = muestra[r][c];
      if (tipo === 'D' ? (typeof x === 'number') : (x instanceof Date)) { hay = true; break; }
    }
    if (!hay) continue;
    var fmt = tipo === 'D' ? ORG_FMT_DINERO : ORG_FMT_FECHA;
    if (fmts[c] === fmt) continue;                         // ya esta
    h.getRange(fe + 1, c + 1, nF - fe, 1).setNumberFormat(fmt);
    total++;
  }
  return total;
}

/* ================================================================== */

function orgGrupoOculta_(nombre) {
  return /respaldo/i.test(nombre) || nombre === '_CatalogoTmp' || /^_.*tmp$/i.test(nombre);
}

/**
 * Quita lo que no debe quedar a la vista: los respaldos de mas (se conserva el MAS NUEVO de cada
 * hoja base) y la hoja temporal del catalogo (solo si no hay una bajada en curso). Devuelve los nombres quitados.
 */
function orgLimpiar_(ss) {
  var quitadas = [];
  var props = PropertiesService.getScriptProperties();
  var bases = {};
  ss.getSheets().forEach(function (h) {
    var n = h.getName(), i = n.indexOf('_respaldo_');
    if (i > 0) bases[n.substring(0, i)] = true;
  });
  Object.keys(bases).forEach(function (b) { quitadas = quitadas.concat(borrarRespaldosViejos_(ss, b, 1)); });
  // Respaldos ocultos de la hoja WFS ('WFS RESPALDO ...'): ya no se crean ni se guardan; si queda alguno, se borra
  ss.getSheets().filter(function (h) { return /^WFS RESPALDO /.test(h.getName()); }).forEach(function (h) {
    var n = h.getName();
    try { if (ss.getSheets().length > 1) { ss.deleteSheet(h); quitadas.push(n); } } catch (e) { console.log('Limpieza ' + n + ': ' + e.message); }
  });
  ss.getSheets().forEach(function (h) {
    var n = h.getName();
    var esTmp = (n === HOJA_CATALOGO_TMP) && !props.getProperty(PROP_CAT_ESTADO);
    // 'Enlaces' ya no se usa ni se crea; si quedo una vacia (sin encabezado ni datos) de una version vieja, se quita
    var esEnlacesVacia = (n === 'Enlaces') && h.getLastRow() <= 1 && !String(h.getRange(1, 1).getValue() || '').trim();
    if ((esTmp || esEnlacesVacia) && ss.getSheets().length > 1) { ss.deleteSheet(h); quitadas.push(n); }
  });
  return quitadas;
}

/** Milisegundos que le quedan al presupuesto de Ordenar (ORG_T0 = cuando arranco). */
function orgQueda_() {
  return ORG_T0 ? Math.max(0, ORG_T0 + ORG_PRESUPUESTO_MS - Date.now()) : ORG_PRESUPUESTO_MS;
}

/** Un reintento si Sheets se agota (pasajero) y aun hay presupuesto; cualquier otro error se deja pasar. */
function orgReintento_(fn) {
  try { return fn(); }
  catch (e) {
    var pasajero = /tiempo de espera|timed out|timeout|Service Spreadsheets|servicio Hojas/i.test(String(e && e.message || e));
    if (!pasajero || orgQueda_() < 30000) throw e;
    Utilities.sleep(5000);
    return fn();
  }
}

/** Corre una etapa con su reintento. Si falla, la anota en avisos y sigue con la siguiente (devuelve null). */
function orgEtapa_(nombre, fn, avisos) {
  try { return orgReintento_(fn); }
  catch (e) {
    console.log('Ordenar ' + nombre + ': ' + e.message);
    if (avisos) avisos.push(nombre + ': ' + String(e.message).split('\n')[0]);
    return null;
  }
}

/** Menu: ordena y avisa. */
function orgOrdenar() {
  var ui = SpreadsheetApp.getUi();
  var avisos = [];
  var quitadas = [];
  ORG_T0 = Date.now();
  // Cada etapa va aparte, con su reintento: si Sheets se agota en una, las demas siguen y te digo cual falto.
  orgEtapa_('KAMS', function () { kcCrearHojas_(); }, avisos);
  quitadas = orgEtapa_('Limpieza de hojas viejas', function () { return limpiarHojasViejas_(SpreadsheetApp.getActive()); }, avisos) || [];
  quitadas = quitadas.concat(orgEtapa_('Limpieza de respaldos', function () { return orgLimpiar_(SpreadsheetApp.getActive()); }, avisos) || []);
  var r = null;
  try { r = orgAplicar_(true, avisos); } catch (e) { avisos.push('Orden/indice: ' + e.message); }
  if (!r) {
    alertLog_(ui, '🗂️ Ordenar hojas', 'No terminó:\n  ' + avisos.join('\n  ') +
      '\n\nSheets ocupado. Espera 2 min y vuelve a correrlo: sigue donde se quedó.', ui.ButtonSet.OK);
    return;
  }
  var falt = (orgFormatos_.fallas || []);
  if (falt.length) avisos.push('Formatos pendientes: ' + falt.join(', '));
  var faltA = (orgAnchos_.faltan || []);
  if (faltA.length) avisos.push('Anchos pendientes: ' + faltA.join(', '));
  var faltR = (orgRecortar_.faltan || []);
  if (faltR.length) avisos.push('Recorte pendiente: ' + faltR.length + ' hoja(s), sigue sola');
  alertLog_(ui, '🗂️ Libro ordenado',
    'Hojas ordenadas: ' + r.ordenadas + '\n' +
    'Encabezados: ' + r.encabezados + '\n' +
    'Formatos: ' + r.formatos + '\n' +
    'Anchos: ' + r.anchos + '\n' +
    'Recortadas: ' + (r.recortadas || 0) + '\n' +
    'En una línea: ' + (r.clip || 0) + '\n' +
    (quitadas.length ? 'Quitadas: ' + quitadas.join(', ') + '\n' : '') +
    (r.sinClasificar.length ? '\nSin clasificar:\n  ' + r.sinClasificar.join('\n  ') : '') +
    (avisos.length ? '\n\n⚠ ' + avisos.join('\n⚠ ') : ''),
    ui.ButtonSet.OK);
}

/** Cada hora, sin avisos. Solo trabaja si algo cambio. */
function orgProgramado_() {
  ORG_T0 = 0;
  orgAplicar_(false, []);
}

/**
 * @param {boolean} completo true = menu (todo + indice); false = silencioso (solo si algo cambio)
 * @param {string[]} avisos   aqui se anotan las etapas que no terminaron
 */
function orgAplicar_(completo, avisos) {
  avisos = avisos || [];
  var ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(ORG_GUIA)) orgEtapa_('Guia', function () { orgGuia_(ss); }, avisos);
  var hojas = ss.getSheets();
  var porNombre = {};
  hojas.forEach(function (h) { porNombre[h.getName()] = h; });

  var reg = {};                       // nombre -> {grupo, desc, act}
  orgListaActual_().forEach(function (f) { reg[f[0]] = { grupo: f[1], desc: f[2], act: f[3] }; });   // col-fija: f es una fila del registro ORG_HOJAS (nombre, grupo, para que sirve, como se actualiza), no una hoja

  var visibles = [], ocultas = [], sinClas = [];
  hojas.forEach(function (h) {
    var n = h.getName();
    if (n === ORG_INDICE) return;
    if (reg[n]) return;
    if (orgGrupoOculta_(n) || h.isSheetHidden()) { ocultas.push(n); return; }
    sinClas.push(n);
  });

  // Orden deseado: indice, registro (si existe), sin clasificar, ocultas
  var deseado = [ORG_INDICE];
  orgListaActual_().forEach(function (f) { if (porNombre[f[0]]) deseado.push(f[0]); });
  sinClas.forEach(function (n) { deseado.push(n); });
  ocultas.sort().forEach(function (n) { deseado.push(n); });

  // Huella: nombres + orden. Si no cambio y es la corrida silenciosa, solo revisa encabezados.
  var huella = deseado.join('|');
  var props = PropertiesService.getScriptProperties();
  var igual = (props.getProperty(ORG_PROP_HUELLA) === huella) && !!porNombre[ORG_INDICE];

  var resumen = { ordenadas: 0, encabezados: 0, sinClasificar: sinClas, faltan: [] };
  orgListaActual_().forEach(function (f) { if (!porNombre[f[0]]) resumen.faltan.push(f[0]); });

  if (completo || !igual) {
    var ind = porNombre[ORG_INDICE] || ss.insertSheet(ORG_INDICE);
    porNombre[ORG_INDICE] = ind;

    // posicion
    var okOrden = orgEtapa_('Orden de hojas', function () {
      deseado.forEach(function (n, i) {
        var h = porNombre[n];
        if (!h) return;
        if (h.isSheetHidden()) return;
        if (h.getIndex() !== i + 1) { ss.setActiveSheet(h); ss.moveActiveSheet(i + 1); }
      });
      ss.setActiveSheet(ind);
      return true;
    }, avisos);

    // color de pestana
    orgEtapa_('Colores', function () {
      resumen.ordenadas = 0;
      deseado.forEach(function (n) {
        var h = porNombre[n];
        if (!h) return;
        var c = null, g = null;
        if (n === ORG_INDICE) c = '#202124';
        else if (reg[n]) g = reg[n].grupo;
        else if (ocultas.indexOf(n) !== -1) g = 'OCULTAS';
        else if (sinClas.indexOf(n) !== -1) c = ORG_COLOR_SIN_CLASIFICAR;   // hoja nueva sin registrar: negro, para que se note y se registre
        if (g) c = orgColorPestana_(g);
        try { h.setTabColor(c); } catch (e) {}
        resumen.ordenadas++;
      });
    }, avisos);

    orgEtapa_('Guia', function () { orgGuia_(ss); porNombre[ORG_GUIA] = ss.getSheetByName(ORG_GUIA); }, avisos);
    var okInd = orgEtapa_('Indice', function () { orgIndice_(ind, reg, porNombre, sinClas, ocultas); return true; }, avisos);
    if (okOrden && okInd) props.setProperty(ORG_PROP_HUELLA, huella);   // si una fallo, la proxima corrida la repite
  }

  // encabezados: el menu los aplica siempre; la corrida silenciosa solo si alguien los deshizo.
  // Las hojas que ponen su propio encabezado (ORG_SIN_ENCABEZADO) no se tocan.
  orgEtapa_('Encabezados', function () {
    orgListaActual_().forEach(function (f) {
      var h = porNombre[f[0]];
      if (!h || orgSin_(ORG_SIN_ENCABEZADO, f[0])) return;
      if (orgEncabezado_(h, ORG_GRUPOS[f[1]].color, completo)) resumen.encabezados++;
    });
    sinClas.forEach(function (n) {   // hojas sin registrar tambien llevan encabezado (nunca quedan sin formato)
      var h = porNombre[n];
      if (h && !orgSin_(ORG_SIN_ENCABEZADO, n) && orgEncabezado_(h, ORG_GRUPOS.CONFIG.color, completo)) resumen.encabezados++;
    });
  }, avisos);
  resumen.formatos = completo ? (orgEtapa_('Formatos', function () { return orgFormatos_(ss); }, avisos) || 0) : 0;
  if (completo) resumen.formatos += orgEtapa_('Formatos de ventas y killers', function () { return vdAplicarFormatos_(); }, avisos) || 0;   // VentaDiaria.gs
  resumen.anchos = completo ? (orgEtapa_('Anchos', function () { return orgAnchos_(ss); }, avisos) || 0) : 0;
  resumen.clip = completo ? (orgEtapa_('Texto en una línea', function () { return orgClip_(ss); }, avisos) || 0) : 0;
  var hoyR = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  if (completo || props.getProperty(ORG_PROP_RECORTE) !== hoyR) {
    resumen.recortadas = orgEtapa_('Filas y columnas vacias', function () { return orgRecortar_(ss, completo ? null : 60000); }, avisos) || 0;
    if (!(orgRecortar_.faltan || []).length) props.setProperty(ORG_PROP_RECORTE, hoyR);
  }
  return resumen;
}

/**
 * Texto en una línea: las filas de datos de cada hoja del registro quedan en CLIP (el texto largo se corta a la vista
 * en vez de hacer la fila alta). Índice y Guía lo ponen al armarse. Se salta ORG_CON_SALTO (hojas de formato libre).
 * @return {number} hojas
 */
var ORG_CON_SALTO = ['Correo'];
function orgClip_(ss) {
  var n = 0, faltan = [];
  orgListaActual_().forEach(function (f) {
    var nombre = f[0];   // col-fija: f es una fila del registro ORG_HOJAS, no una hoja
    if (nombre === ORG_INDICE || nombre === ORG_GUIA || ORG_CON_SALTO.indexOf(nombre) !== -1) return;
    if (orgQueda_() < 15000) { faltan.push(nombre); return; }
    var h = ss.getSheetByName(nombre);
    if (!h) return;
    var lr = h.getLastRow(), lc = h.getLastColumn();
    if (lr < 2 || lc < 1) return;
    try { h.getRange(2, 1, lr - 1, lc).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP); n++; }
    catch (e) { console.log('Clip ' + nombre + ': ' + e.message); }
  });
  orgClip_.faltan = faltan;
  return n;
}

/**
 * Recorta las filas y columnas VACIAS del final de cada hoja: cada hoja queda del tamano de lo que trae y crece sola
 * cuando hace falta (todo lo que escribe pasa por reescribirHoja_ / escrAsegurarFilas_, que agregan filas). Menos celdas
 * vacias = el libro abre, filtra y se lee mas rapido.
 * - Filas: se deja un margen chico (10 filas o 10% de lo que trae; 20 en hojas que llenas a mano, para escribir).
 * - Columnas: hasta la ultima con encabezado o dato; las del medio nunca se tocan.
 * - No toca: hojas ocultas, con graficas, con formulas de arreglo arriba (ARRAYFORMULA, IMPORTRANGE, QUERY...: esas
 *   necesitan sus filas), hojas casi vacias ni las de ORG_SIN_RECORTE. Nunca borra una celda con algo.
 * Si a una hoja le quedan menos de 5 filas libres, le regresa el margen (por si algo escribe sin pedir filas).
 * @return {number} hojas recortadas
 */
var ORG_SIN_RECORTE = ['Concentrado', 'Inventarios', 'Cotizador', 'Recoleccion Formulario', 'Correo'];
var ORG_LLENAS_A_MANO = ['KAMS', 'KAMS Departamentos', 'Comisiones', 'SKU asignados', 'Precio libre', 'Casos Walmart', 'Estado Killers', 'Republicar', 'Cancelada en camino'];
var ORG_PROP_RECORTE = 'ORG_RECORTE_DIA';

function orgRecortar_(ss, limiteMs) {
  var fin = Date.now() + (limiteMs || orgQueda_() - 5000), n = 0, filasQ = 0, colsQ = 0, faltan = [], det = [];
  ss.getSheets().forEach(function (h) {
    var nombre = h.getName();
    if (orgSin_(ORG_SIN_RECORTE, nombre) && !/^ENVIO\s+\d+/i.test(nombre)) return;
    if (Date.now() > fin) { faltan.push(nombre); return; }
    try {
      if (h.isSheetHidden() || h.getCharts().length) return;
      var lr = h.getLastRow(), lc = h.getLastColumn();
      if (lr < 2 || lc < 1) return;
      var arriba = h.getRange(1, 1, Math.min(lr, 3), lc).getFormulas();
      if (arriba.some(function (f) { return f.some(function (x) { return /ARRAYFORMULA|IMPORTRANGE|QUERY\(|FILTER\(|SORT\(|UNIQUE\(|IMPORTDATA|IMPORTXML/i.test(x); }); })) return;
      var mano = ORG_LLENAS_A_MANO.indexOf(nombre) !== -1;
      var margen = mano ? 20 : Math.max(10, Math.ceil(lr * 0.1));
      var quiero = Math.max(lr + margen, h.getFrozenRows() + 2);
      var mr = h.getMaxRows(), mc = h.getMaxColumns(), cambio = false;
      if (mr > quiero + margen) { h.deleteRows(quiero + 1, mr - quiero); filasQ += mr - quiero; cambio = true; }   // solo si sobra el doble del margen: no recorta a cada rato
      else if (mr - lr < 5) { h.insertRowsAfter(mr, quiero - mr); cambio = true; }
      var qc = Math.max(lc, h.getFrozenColumns() + 1);
      if (mc > qc) { h.deleteColumns(qc + 1, mc - qc); colsQ += mc - qc; cambio = true; }
      if (cambio) { n++; det.push(nombre + ' ' + mr + 'x' + mc + ' -> ' + h.getMaxRows() + 'x' + h.getMaxColumns()); }
    } catch (e) { console.log('Recortar ' + nombre + ': ' + e.message); }
  });
  orgRecortar_.faltan = faltan;
  if (n) logInfo_('ORDENAR', 'Filas y columnas vacias quitadas en ' + n + ' hoja(s): ' + filasQ + ' filas y ' + colsQ + ' columnas', det);
  return n;
}

/**
 * Ancho de columnas: nunca menor que el encabezado completo (8 px por letra + 34 del icono de filtro); si el contenido
 * es corto se ajusta a el y si es largo se corta en ORG_ANCHO_MAX. Se mide con una muestra (encabezado + primeras 300
 * filas), no con autoResize (muy lento). Solo ajusta las columnas que NO se habian ajustado antes (por encabezado):
 * si cambias un ancho a mano o mueves la columna, se respeta; una columna nueva si se ajusta. Una columna que ya trae un ancho distinto del de fabrica (100 px) no se toca.
 * Firma en Script Properties ORG_ANCHO. Tiene tope de tiempo: lo que no alcanza se retoma al volver a correrlo.
 */
function orgAnchos_(ss) {
  var props = PropertiesService.getScriptProperties();
  var hechas = {}, rev = {};
  try { hechas = JSON.parse(props.getProperty(ORG_PROP_ANCHO) || '{}'); } catch (e) {}
  try { rev = JSON.parse(props.getProperty(ORG_PROP_ANCHO2) || '{}'); } catch (e) {}
  var hoyD = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var limite = Date.now() + orgQueda_() - 5000, n = 0, faltan = [];   // lo que queda del presupuesto
  orgListaActual_().forEach(function (f) {
    var nombre = f[0];
    if (nombre === ORG_GUIA || orgSin_(ORG_SIN_ANCHO, nombre)) return;
    var h = ss.getSheetByName(nombre);
    if (!h) return;
    var fe = orgFilaEnc_(nombre);
    var nC = Math.min(h.getLastColumn(), 60);
    if (nC < 1 || h.getLastRow() < fe) return;
    if (new Date().getTime() > limite) { faltan.push(nombre); return; }
    try {
      orgReintento_(function () {
        var datos = h.getRange(fe, 1, Math.min(h.getLastRow() - fe + 1, 301), nC).getDisplayValues();
        var ya = Array.isArray(hechas[nombre]) ? hechas[nombre] : [];
        var rv = rev[nombre] || { dia: '', px: {} };
        var revisar = rv.dia !== hoyD;                       // revision de anchos que se quedaron cortos: una vez al dia por hoja
        var pisos = ORG_ANCHO_PISO[nombre] || {};
        var nuevosEnc = datos[0].map(normEnc_).filter(function (k) { return k && ya.indexOf(k) < 0; });
        if (!nuevosEnc.length && !revisar && !Object.keys(pisos).length) return;
        var cambio = false;
        for (var c = 0; c < nC; c++) {
          var k = normEnc_(datos[0][c]);
          if (!k) continue;
          var enc = String(datos[0][c] || ''), largo = 0;
          for (var r = 1; r < datos.length; r++) { var l = String(datos[r][c] || '').length; if (l > largo) largo = l; }
          var pxEnc = enc ? enc.length * 8 + 34 : 0;
          var pxCont = Math.min(largo * 6.6 + 16, ORG_ANCHO_MAX);
          var piso = pisos[k] || 0;
          var necesita = Math.round(Math.max(pxEnc, pxCont, ORG_ANCHO_MIN, piso));
          var actual = h.getColumnWidth(c + 1);
          if (ya.indexOf(k) < 0) {
            if (actual !== 100 && !(piso && actual < piso)) continue;     // ya tiene un ancho puesto (por ti o por el script): se respeta
            h.setColumnWidth(c + 1, necesita); rv.px[k] = necesita; cambio = true;
          } else {
            // columna ya ajustada antes: solo se ENSANCHA (nunca se encoge) si el ancho sigue siendo el que puso el script
            // (o el de fabrica de 100 px / el que salio con la hoja vacia) y el contenido ya no cabe; el piso de la hoja se aplica siempre.
            var propio = actual === 100 || ((rv.px[k] !== undefined) ? Math.abs(actual - rv.px[k]) <= 2 : Math.abs(actual - Math.max(pxEnc, ORG_ANCHO_MIN)) <= 3);   // 100 = ancho de fabrica
            if ((revisar && propio && necesita > actual + 8) || (piso && actual < piso)) {
              h.setColumnWidth(c + 1, necesita); rv.px[k] = necesita; cambio = true;
            }
          }
        }
        hechas[nombre] = ya.concat(nuevosEnc);
        rv.dia = hoyD; rev[nombre] = rv;
        if (cambio || nuevosEnc.length) n++;
      });
    } catch (e) { faltan.push(nombre); console.log('Anchos ' + nombre + ': ' + e.message); }
  });
  props.setProperty(ORG_PROP_ANCHO, JSON.stringify(hechas));
  props.setProperty(ORG_PROP_ANCHO2, JSON.stringify(rev));
  orgAnchos_.faltan = faltan;
  return n;
}

/** Estilo del encabezado (fila 1) y fila congelada. true si cambio algo. */
function orgEncabezado_(h, color, forzar) {
  var fila = orgFilaEnc_(h.getName());
  var nC = h.getLastColumn(), nF = h.getLastRow();
  if (nC < 1 || nF < fila) return false;
  var enc = h.getRange(fila, 1, 1, nC);
  var a1 = String(h.getRange(fila, 1).getValue() || '');
  if (!a1 && nC === 1) return false;                 // hoja vacia
  var cambio = false;
  if (forzar || enc.getCell(1, 1).getBackground().toLowerCase() !== color) {
    enc.setFontWeight('bold').setFontColor('#ffffff').setBackground(color).setVerticalAlignment('middle');
    cambio = true;
  }
  if (h.getFrozenRows() < fila && nF > fila) { h.setFrozenRows(fila); cambio = true; }
  return cambio;
}

/** Escribe la hoja Indice. */
function orgIndice_(ind, reg, porNombre, sinClas, ocultas) {
  ind.clear();
  var tz = Session.getScriptTimeZone();
  var filas = [], banners = [], enlaces = [];

  filas.push(['📑 ÍNDICE DEL LIBRO', '', '', '', '']);
  filas.push(['Actualizado ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm') + ' · clic en el nombre para ir', '', '', '', '']);
  filas.push(['', '', '', '', '']);

  var claves = Object.keys(ORG_GRUPOS).filter(function (k) { return k !== 'OCULTAS'; });   // todas las familias (VENTAS incluida), en su orden
  claves.forEach(function (k) {
    var items = orgListaActual_().filter(function (f) { return f[1] === k && porNombre[f[0]]; });   // col-fija: f es una fila del registro ORG_HOJAS (nombre, grupo, para que sirve, como se actualiza), no una hoja
    if (!items.length) return;
    filas.push([ORG_GRUPOS[k].titulo, 'PARA QUÉ', 'SE ACTUALIZA', 'FILAS', '']);
    banners.push({ fila: filas.length, color: ORG_GRUPOS[k].color });
    items.forEach(function (f) {
      var h = porNombre[f[0]];
      var gid = h.getSheetId();
      filas.push(['=HYPERLINK("#gid=' + gid + '","' + f[0].replace(/"/g, '""') + '")', f[2], f[3], Math.max(h.getLastRow() - orgFilaEnc_(h.getName()), 0), '']);   // col-fija: f es una fila del registro ORG_HOJAS, no una columna de hoja
    });
    filas.push(['', '', '', '', '']);
  });

  if (sinClas.length) {
    filas.push(['❓ SIN CLASIFICAR', 'Falta registrarlas', '', 'FILAS', '']);
    banners.push({ fila: filas.length, color: '#202124' });
    sinClas.forEach(function (n) {
      filas.push(['=HYPERLINK("#gid=' + porNombre[n].getSheetId() + '","' + n.replace(/"/g, '""') + '")', '', '', Math.max(porNombre[n].getLastRow() - orgFilaEnc_(n), 0), '']);
    });
    filas.push(['', '', '', '', '']);
  }
  if (ocultas.length) {
    filas.push([ORG_GRUPOS.OCULTAS.titulo, '', '', 'FILAS', '']);
    banners.push({ fila: filas.length, color: ORG_GRUPOS.OCULTAS.color });
    ocultas.forEach(function (n) {
      filas.push([n, 'Oculta (clic derecho › Mostrar)', '', Math.max(porNombre[n].getLastRow() - orgFilaEnc_(n), 0), '']);
    });
  }

  var nF = filas.length;
  if (ind.getMaxRows() < nF + 5) ind.insertRowsAfter(ind.getMaxRows(), nF + 5 - ind.getMaxRows());
  if (ind.getMaxColumns() < 5) ind.insertColumnsAfter(ind.getMaxColumns(), 5 - ind.getMaxColumns());
  ind.getRange(1, 1, nF, 5).setValues(filas.map(function (f) {
    return f.map(function (v) { return (typeof v === 'string' && v.charAt(0) === '=') ? '' : v; });
  }));
  // formulas de link
  filas.forEach(function (f, i) {
    if (typeof f[0] === 'string' && f[0].charAt(0) === '=') ind.getRange(i + 1, 1).setFormula(f[0]);
  });

  ind.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  ind.getRange(2, 1).setFontColor('#5f6368').setFontStyle('italic');
  banners.forEach(function (b) {
    ind.getRange(b.fila, 1, 1, 4).setBackground(b.color).setFontColor('#ffffff').setFontWeight('bold');
  });
  ind.getRange(1, 4, nF, 1).setHorizontalAlignment('right').setNumberFormat('#,##0');
  ind.getRange(3, 1, Math.max(nF - 2, 1), 4).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  ind.setColumnWidth(1, 260); ind.setColumnWidth(2, 480); ind.setColumnWidth(3, 170); ind.setColumnWidth(4, 70);
  ind.setFrozenRows(0);
  ind.setHiddenGridlines(true);
}
