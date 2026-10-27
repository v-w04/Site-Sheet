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
var ORG_SIN_ANCHO = ['WFS', 'Killers bajo minimo', 'Killers', 'Log', 'Envios killers', 'SKU enviados killers', 'KAMS', 'KAMS Departamentos', 'Correo', 'Comisiones', 'CVA Catalogo', 'Cancelaciones', 'Concentrado', 'Inventarios',
                     'Walmart', 'Bloqueados', 'Promociones', 'Variantes', 'Oportunidades', 'Cambio Walmart',
                     'Cotizador', 'Cotizador Candidatos', '_Reglas Cotizador', '_Nombres Cotizacion', '_ConvertirWFS', '_Inactivos', '_Desactivar'];
/* Hojas que ponen SU encabezado (color, fila) cada vez que se escriben: Ordenar no se los pinta.
   Correo lleva el encabezado de la tabla en la fila 4, no en la 1. */
var ORG_SIN_ENCABEZADO = ['WFS', 'Cancelaciones', 'Correo', 'Walmart', 'Bloqueados', 'Promociones', 'Comisiones', 'CVA Catalogo',
                          'Concentrado', 'Variantes', 'Oportunidades', 'Cambio Walmart', 'Killers bajo minimo',
                          'Cotizador', 'Cotizador Candidatos', '_Reglas Cotizador', '_Nombres Cotizacion',
                          '_ConvertirWFS', '_Inactivos', '_Desactivar'];
/* Hojas cuyo encabezado NO esta en la fila 1 (la fila 1 trae un titulo o fecha): fila del encabezado. */
var ORG_FILA_ENC = {};   // ninguna hoja por ahora: todas llevan el encabezado en la fila 1
function orgFilaEnc_(nombre) { return ORG_FILA_ENC[nombre] || 1; }
/* Un solo presupuesto para todo Ordenar (Apps Script corta a los 6 min), repartido entre etapas. */
var ORG_PRESUPUESTO_MS = 280 * 1000;
var ORG_T0 = 0;

var ORG_GRUPOS = {
  GUIA:    { titulo: '📖 GUIA',                      color: '#00796b' },
  KILLERS: { titulo: '🔥 KILLERS Y PROMOCIONES',      color: '#d93025' },
  WFS:     { titulo: '🚚 ENVIOS WFS',                 color: '#e67c73' },
  WALMART: { titulo: '🏬 WALMART: CATALOGO Y ANALISIS', color: '#1a73e8' },
  PRECIOS: { titulo: '💲 PRECIOS Y CAMBIOS',          color: '#188038' },
  ODOO:    { titulo: '📦 ODOO: INVENTARIO Y CATALOGO', color: '#9334e6' },
  CONFIG:  { titulo: '⚙️ LISTAS DE APOYO',            color: '#5f6368' },
  SISTEMA: { titulo: '🛠️ SISTEMA',                    color: '#e37400' },
  OCULTAS: { titulo: '🙈 OCULTAS (respaldos y temporales)', color: '#9aa0a6' }
};

/** [nombre de hoja, grupo, para que sirve, como se actualiza]. El orden de aqui es el orden del libro. */
var ORG_HOJAS = [
  [ORG_GUIA,               'GUIA',    'Que hace cada opcion del menu SITE SHEET y cual debes tocar', 'Auto (la rehace Ordenar)'],
  ['Killers bajo minimo',  'KILLERS', 'Killers que no cubren tu minimo: falta, categoria, KAM, UPC, GTIN y % de perdida', 'Auto, cada hora'],
  ['Killers',              'KILLERS', 'Killers activos y propuestas bajados del site', 'Auto, cada hora'],
  ['Promociones',          'KILLERS', 'Promociones del site por SKU', 'Auto, cada hora'],
  ['Comisiones',           'KILLERS', 'Comision normal por categoria de Walmart (Configuracion del site)', 'Auto, cada hora'],
  ['CVA Catalogo',         'KILLERS', 'Lo que CVA tiene en stock hoy: clave CVA, precio y piezas (copia de CVA 5.0 / SYNC_CVA)', 'Auto, cada hora'],
  ['KAMS',                 'KILLERS', 'Contactos de los KAMs de Walmart (grupo, nombre, correo, confirmado) a quienes se envia', 'Manual (tu la editas)'],
  ['KAMS Departamentos',   'KILLERS', 'De que grupo KAM es cada departamento de Walmart (define a quien va cada killer)', 'Manual (tu la editas)'],
  ['Estado Killers',    'KILLERS',  'Una sola hoja para decidir: los SKU -MSI publicados (y los de cualquier estatus sin KAM o con decision) con su KAM, si tienen killer (SI/NO), si entran a parrilla y avisos. Tu escribes la DECISION por SKU (un KAM, NO ENVIAR o REPUBLICAR). Filtra KILLER=NO y EN PARRILLA=SI para ver los que no pusieron', 'Auto con Walmart + Menu: Actualizar parrillas por KAM'],
  ['Correo',               'KILLERS', 'Asunto y mensaje (editables) + tabla de killers con perdida > 3% = vista previa de los correos (ENVIAR SI/NO)', 'Cada vez que se calcula Killers bajo minimo + menu Actualizar hoja Correo'],
  ['Envios killers',       'KILLERS', 'Bitacora de correos enviados a los KAMs', 'Auto, al enviar'],
  ['SKU enviados killers', 'KILLERS', 'Registro de los SKU que ya se mandaron en solicitudes REAL (para marcar NUEVOS vs YA ENVIADOS)', 'Auto, al enviar'],

  ['WFS',                  'WFS',     'La hoja de trabajo del envio a WFS: ventas 30 dias, bloques MSI y CLASICA, PROPUESTA y ENVIO FINAL (traida de WFS 1.0)', 'Menu: Actualizar ventas y calcular (y cada hora si el automatico esta encendido)'],
  ['HISTORICO ENVIOS',     'WFS',     'Todos los envios archivados, una linea por SKU', 'Menu: Archivar envios y limpiar'],
  ['HISTORICO CHOFERES',   'WFS',     'Choferes de cada envio archivado', 'Menu: Archivar envios y limpiar'],
  ['HISTORICO CAMIONETAS', 'WFS',     'Camionetas de cada envio archivado', 'Menu: Archivar envios y limpiar'],
  ['CATALOGO CHOFERES',    'WFS',     'Choferes para elegir en el nuevo envio (CHOFER, CURP, CONTACTO): escribelos a mano la primera vez; luego se llena al archivar', 'Manual + auto, al archivar'],
  ['CATALOGO CAMIONETAS',  'WFS',     'Camionetas para elegir en el nuevo envio (PLACAS, COLOR, TIPO): escribelas a mano la primera vez; luego se llena al archivar', 'Manual + auto, al archivar'],

  ['Walmart',              'WALMART', 'Catalogo de Walmart bajado del dashboard (UPC, GTIN, precio, WFS)', 'Auto, cada 15 min'],
  ['Bloqueados',           'WALMART', 'Articulos que bloqueas en el dashboard de Walmart', 'Auto, con Walmart'],
  ['Concentrado',          'WALMART', 'Un renglon por SKU: Walmart + Odoo + precios + categorias', 'Menu: Armar Concentrado'],
  ['Variantes',            'WALMART', 'Familias y variantes (Odoo) ligadas a cada SKU de Walmart', 'Menu: Armar Variantes'],
  ['Oportunidades',        'WALMART', 'Oportunidades de precio detectadas', 'Menu: Buscar oportunidades'],

  ['Republicar',        'WALMART', 'Todo lo que se publica de nuevo (categoria mal, cobro distinto, fecha vencida, UPC o GTIN ajeno, mas presencia): una fila por publicacion. SKU NUEVO se propone solo (SKU base + siguiente consecutivo, -MSI-2, -MSI-3...). Estados automaticos: PENDIENTE, REPUBLICADO (el nuevo ya esta en Walmart: falta bloquear el viejo) y CERRADO (el viejo ya esta en Bloqueados). Se ordena sola. Tu bloqueas los viejos a mano', 'Auto con Walmart + Menu: Actualizar hoja Republicar'],
  ['Cobro distinto',       'WALMART', 'Un renglon por SKU donde Walmart cobro una categoria distinta a la debida (ultimos cortes), del Dashboard del site. Se actualiza cada hora', 'Menu: Bajar cobro distinto'],
  ['Cobro distinto detalle','WALMART', 'Un renglon por pedido de los SKUs de Cobro distinto: corte, cobrado vs debido, diferencia en pesos', 'Menu: Bajar cobro distinto'],
  ['Killers sin minimo',   'WALMART', 'Killers que no cubren tu minimo, del Dashboard del site. Se actualiza cada hora', 'Menu: Bajar cobro distinto'],

  ['Ventas 30 dias',       'WALMART', 'Piezas vendidas por SKU en los ultimos 30 dias, del site (se actualiza cada hora). La lee la hoja WFS', 'Menu: Bajar ventas 30 dias'],
  ['Cancelaciones',        'WALMART', 'Solicitudes de cancelacion del cliente (correo de Walmart) y ventas en sobreventa de Pick; columna ORIGEN dice por que. Solo crece', 'Menu: Leer cancelaciones del correo'],
  ['Sobreventa WFS',       'WALMART', 'Traslados de Odoo en espera hacia WFS (lo vendido a Walmart que aun no se surte). Una linea por SKU; foto completa', 'Auto, cada 30 min'],
  ['Sobreventa Pick',   'WALMART', 'Picks de Odoo en espera de Walmart (lo vendido que aun no se surte). Una linea por SKU; foto completa', 'Auto, cada 30 min'],

  ['Walmart EDI',          'WALMART', 'Todas las publicaciones de Walmart EDI del site (asignadas y sin asignar), para depurar y cruzar con Bloqueados', 'Menu: Bajar lista Walmart EDI'],
  ['Cruce EDI',            'WALMART', 'Cruce de Walmart EDI vs Bloqueados: diagnostico por SKU para depurar (anota tu DECISION y NOTAS)', 'Menu: Cruzar EDI vs Bloqueados'],
  ['_ConvertirWFS',        'WALMART', 'GTINs agrupados por categoria para pegar en el seller center (Convertir a WFS)', 'Menu: GTINs para convertir a WFS'],
  ['_Inactivos',           'WALMART', 'Plantilla "Mi producto esta inactivo o inedito" para el ticket de soporte', 'Menu: Productos inactivos'],
  ['_Desactivar',          'WALMART', 'Publicaciones RES/WL/OB que siguen activas: SKU y GTIN para pedir la baja', 'Menu: Publicaciones viejas a dar de baja'],

  ['Cambio Walmart',       'PRECIOS', 'Hoja de trabajo para el cambio de precios y el archivo a Walmart', 'Menu: Nuevo cambio'],
  ['Cotizador',            'PRECIOS', 'Hoja de trabajo de la cotizacion: partidas pegadas y SKUs propuestos en tres gamas', 'Menu: Cotizaciones'],
  ['Cotizador Candidatos', 'PRECIOS', 'Todas las opciones que encontro Buscar productos para cada partida', 'Menu: Buscar productos'],
  ['Precios EM Minimo',    'PRECIOS', 'Precios EM, nivel minimo', 'Auto, cada hora'],
  ['Precios EM Normal',    'PRECIOS', 'Precios EM, nivel normal', 'Auto, cada hora'],
  ['Precios EM Maximo',    'PRECIOS', 'Precios EM, nivel maximo', 'Auto, cada hora'],
  ['Precios CVA Minimo',   'PRECIOS', 'Precios CVA, nivel minimo', 'Auto, cada hora'],
  ['Precios CVA Normal',   'PRECIOS', 'Precios CVA, nivel normal', 'Auto, cada hora'],
  ['Precios CVA Maximo',   'PRECIOS', 'Precios CVA, nivel maximo', 'Auto, cada hora'],

  ['Inventario Actual',    'ODOO',    'Existencias actuales del site/Odoo por SKU', 'Auto, cada 15 min'],
  ['Inventario Negativo',  'ODOO',    'SKUs con existencia negativa y su ubicacion', 'Auto, cada 15 min'],
  ['Inventarios',          'ODOO',    'Inventarios por referencia (marca, modelo, categoria)', 'Menu'],
  ['Catalogo',             'ODOO',    'Catalogo bajado de Odoo', 'Menu: Bajar catalogo de Odoo'],

  ['_Marcas',              'CONFIG',  'Prefijo de SKU a marca', 'Manual'],
  ['_Marcas Excepciones',  'CONFIG',  'Excepciones a la regla de marcas', 'Manual'],
  ['_Colores',             'CONFIG',  'Codigo de color a nombre de color', 'Manual'],
  ['_Reglas Cotizador',    'CONFIG',  'Reglas de busqueda del cotizador (como se reconoce cada producto)', 'Manual (menu: Reglas de busqueda)'],
  ['_Nombres Cotizacion',  'CONFIG',  'Nombre con que sale cada SKU en la cotizacion (editable)', 'Auto al cotizar + manual'],
  ['_CancelOdoo',          'CONFIG', 'Como cancela Odoo (cuadro Cancelar venta): modelos, campos y botones. Solo lectura, se rehace desde el menu Diagnostico', 'Menu: Descubrir cancelacion en Odoo'],

  ['Log',                  'SISTEMA', 'Bitacora de todo lo que hacen los procesos automaticos', 'Auto']
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
  var out = [];
  ORG_HOJAS.forEach(function (f) {
    out.push(f);
    if (f[0] === 'Estado Killers') parr.forEach(function (n) {
      out.push([n, 'KILLERS', 'Parrilla del KAM ' + n.replace(/^Parrilla\s+/, '') + ': SKU -MSI publicados con stock cuyo departamento en Walmart es de este KAM (SKU, ID, SELLER, WUPC, GTIN, NOMBRE, PRECIO FULL, PRECIO MEJORADO, TOTAL)', 'Auto con Walmart + Menu: Actualizar parrillas por KAM']);
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
  ['SITE SHEET', '🔄 Bajar TODO ahora', 'Baja precios (6 hojas) e inventario ahora. Es lo mismo que hacen solos los disparadores.', 'Cuando quieras datos frescos ya, sin esperar', 'A VECES'],
  ['SITE SHEET', '🗂️ Ordenar hojas e índice', 'Pone colores, orden, encabezados iguales y rehace el Índice y esta guía.', 'Cuando aparezca una hoja nueva (tambien corre sola cada hora)', 'A VECES'],
  ['🔥 Killers y KAMs', '📋 Actualizar parrillas por KAM', 'Rehace las hojas Parrilla (una por KAM) y Estado Killers con los SKU -MSI publicados y con stock, repartidos por la categoria de Walmart segun la tabla KAMS Departamentos. Tambien corre sola cada hora y al editar el grupo KAM de una categoria o la DECISION en Estado Killers. Si dice que hay otra corrida, espera un minuto: no se corrio nada doble.', 'Despues de cambiar KAMS Departamentos, o cuando quieras ver las parrillas ya', 'DIARIO'],
  ['🔥 Killers y KAMs', '✉️ Envíos de killers → 1 · Solicitud del mes (todo)', 'Un formulario: mes, hasta qué propuesta lleva el archivo (solo SIN Evento = hasta la columna P, o más), grupos KAM con palomita y botones Enviar PRUEBA (solo a ti) / Enviar REAL / Reenviar SOLO a los correos que pegues (suplentes por fuera de oficina). Manda todo lo de cada parrilla.', 'Una vez al mes, probando antes con PRUEBA', 'A VECES'],
  ['🔥 Killers y KAMs', '✉️ Envíos de killers → 2 · Nuevos + faltantes (sin killer)', 'Mismo formulario. Manda a cada KAM, con asunto ELECTRONICS.MEXICO NUEVA SOLICITUD KILLERS - <GRUPO>, los SKU en parrilla que hoy NO tienen killer. En el Excel los NUEVOS van primero (verde) y los que ya se habían enviado al final (amarillo). Los killers ya aceptados no van.', 'Cuando lleguen productos nuevos o quieras pedir otra revisión (primero Actualizar parrillas y Bajar killers del site)', 'A VECES'],
  ['🔥 Killers y KAMs', '✉️ Envíos de killers → 3 · SOLO los nuevos', 'Mismo formulario, pero solo manda los SKU que nunca se habían enviado en una solicitud (todo en verde). Mensaje propio: productos nuevos para Killers.', 'Cuando salgan SKU nuevos en la parrilla', 'A VECES'],
  ['🔥 Killers y KAMs', '🔎 Revisar correos de killers enviados', 'Lee la carpeta Enviados de Gmail y lista los correos de Solicitud / Nuevos productos de los últimos 10 días: fecha, a quién, asunto y archivo adjunto con su tamaño.', 'Después de enviar, para confirmar que salieron', 'A VECES'],
  ['🔥 Killers y KAMs', '📊 Calcular killers bajo mínimo', 'Calcula la hoja Killers bajo minimo con la misma regla que Venta Diaria (pago = negociado + cupon contra el minimo de Precios, con puntos de promocion): solo los que pierden mas de 3%, con categoria, KAM, UPC, GTIN y % de perdida.', 'Cuando quieras ver los killers que no cubren tu minimo (tambien corre solo cada hora)', 'DIARIO'],
  ['🔥 Killers y KAMs', '📋 Actualizar hoja Correo', 'Rehace la tabla de la hoja Correo: killers con perdida mayor a 3%, con grupo KAM, UPC, GTIN y categoria. Es la vista previa de lo que se envia; ahi pones NO en ENVIAR a lo que no quieras mandar. Tambien se actualiza sola cada vez que se calcula Killers bajo minimo.', 'Antes de enviar correos, para revisar a quien y que va', 'DIARIO'],
  ['🔥 Killers y KAMs', '✉️ Envíos de killers → 4 · Bajo mínimo', 'Arma un correo por grupo KAM con lo que dice la tabla de la hoja Correo (filas con ENVIAR = SI), adjunto SKU / precio minimo / GTIN / UPC. Antes de enviar muestra a quien y que datos. SI = real, NO = prueba solo a ti.', 'Cuando haya que pedir cambio de killers a los KAMs de Walmart', 'DIARIO'],
  ['🔥 Killers y KAMs', '⬇️ Bajar killers del site', 'Baja los killers y propuestas del site a la hoja Killers.', 'Normalmente solo (cada hora)', 'A VECES'],
  ['🔥 Killers y KAMs', '🏷️ Bajar promociones del site', 'Baja las promociones del site a la hoja Promociones.', 'Normalmente solo (cada hora)', 'A VECES'],
  ['🔥 Killers y KAMs', '💰 Bajar comisiones del site', 'Baja la comision por categoria de Walmart (Configuracion del site) a la hoja Comisiones.', 'Normalmente solo (cada hora)', 'A VECES'],
  ['🔥 Killers y KAMs', '📦 Bajar catalogo CVA', 'Copia de CVA 5.0 lo que CVA tiene en stock (clave, precio, piezas) a la hoja CVA Catalogo.', 'Normalmente solo (cada hora)', 'A VECES'],
  ['🚚 Envíos WFS', '📥 Actualizar ventas y calcular', 'Pega las ventas de 30 dias (hoja Ventas 30 dias) en la hoja WFS y calcula MSI, CLASICA y ENVIO FINAL. Si ya cambiaste Envio o AUTORIZADO te avisa que se perderia antes de hacerlo.', 'Antes de armar un envio (o cuando quieras la propuesta al dia)', 'DIARIO'],
  ['🚚 Envíos WFS', '▶ Calcular envío WFS (sin traer ventas)', 'Recalcula MSI, CLASICA y ENVIO FINAL con las ventas que ya estan en la hoja WFS (reescribe la columna Envio).', 'Cuando cambie el stock y no quieras volver a traer ventas', 'A VECES'],
  ['🚚 Envíos WFS', '🚚 Nuevo envío (hoja ENVIO)', 'Crea la hoja ENVIO N con lo de ENVIO FINAL (si escribiste AUTORIZADO manda esa columna) y los choferes y camionetas que marques. ID ENVIO y DELIVERY quedan vacios: los da Walmart.', 'Cuando el envio este listo', 'DIARIO'],
  ['🚚 Envíos WFS', '🗄 Archivar envíos y limpiar', 'Pasa las hojas ENVIO a HISTORICO ENVIOS / CHOFERES / CAMIONETAS (se suman a lo que ya habia), rehace los catalogos y borra esas hojas ENVIO. Si algo no cuadra no borra nada.', 'Despues de que el envio salio', 'CUIDADO'],
  ['🚚 Envíos WFS', '📊 Ver estado de WFS', 'Dice si el calculo automatico esta encendido y como le fue, que tan frescas estan las ventas, cuantos SKU y piezas hay en MSI y ENVIO FINAL y si hay trabajo a medias.', 'Si dudas de que este al dia', 'A VECES'],
  ['🚚 Envíos WFS', '⏰ Encender cálculo automático (cada hora)', 'Cada hora trae las ventas y recalcula. Se pausa solo si editaste Envio o AUTORIZADO (no pisa tu trabajo). No envia nada a nadie.', 'Una vez', 'SOPORTE'],
  ['🚚 Envíos WFS', '🛑 Apagar cálculo automático', 'Quita el calculo de cada hora. Los botones siguen funcionando.', 'Si no quieres que corra solo', 'SOPORTE'],
  ['🚚 Envíos WFS', '🔌 Probar lectura de ventas', 'Lee la hoja Ventas 30 dias sin tocar la hoja WFS: SKUs, piezas y hora de bajada.', 'Si las ventas no se actualizan', 'SOPORTE'],
  ['🚚 Envíos WFS', '📥 Crear hoja WFS (formato de Inventarios WM)', 'Copia de Inventarios WM la hoja WFS (formato y colores) y crea aqui nuevos y vacios los HISTORICO y CATALOGO de choferes y camionetas (los historicos de alla no se traen). Alla no borra nada; aqui no toca las que ya existan.', 'Una sola vez, al pasar WFS a este libro', 'SOPORTE'],
  ['🏷 Cambio de precios', '🆕 Nuevo cambio', 'Empieza un cambio de precios: pregunta el tipo (masivo, killers o SKUs especificos) y arma la hoja Cambio Walmart.', 'PASO 1 de un cambio de precios', 'DIARIO'],
  ['🏷 Cambio de precios', '📋 Pegar SKUs', 'Llena la hoja con una lista de SKUs que pegues (killers / ofertas).', 'Paso 2 si el cambio es de SKUs especificos', 'DIARIO'],
  ['🏷 Cambio de precios', '✅ Marcar lo filtrado', 'Marca las filas que deje visibles tu filtro.', 'Paso 2: elegir que cambia', 'DIARIO'],
  ['🏷 Cambio de precios', '🔤 Marcar por texto', 'Marca por texto (categoria, marca o palabra del producto).', 'Paso 2: elegir que cambia', 'DIARIO'],
  ['🏷 Cambio de precios', '☑️ Marcar todo', 'Marca todas las filas.', 'Paso 2', 'DIARIO'],
  ['🏷 Cambio de precios', '⬜ Desmarcar todo', 'Quita todas las marcas.', 'Paso 2', 'DIARIO'],
  ['🏷 Cambio de precios', '✖️ Aplicar factor de precio', 'Multiplica el precio de las filas marcadas (1 = 100%, 0.98 = 98%).', 'Paso 3', 'DIARIO'],
  ['🏷 Cambio de precios', '📅 Aplicar fechas', 'Pone inicio = ahora + 5 min y el fin que digas, en las filas marcadas.', 'Paso 4. Correla justo antes de generar el archivo.', 'DIARIO'],
  ['🏷 Cambio de precios', '📄 GENERAR ARCHIVO WALMART', 'Genera el xlsx para Walmart en Drive (carpeta Archivos Walmart).', 'Paso 5, el ultimo', 'DIARIO'],
  ['📈 Ventas y sobreventa', '📈 Bajar ventas 30 dias', 'Llena la hoja Ventas 30 dias con las piezas vendidas por SKU en los ultimos 30 dias (cada hora se actualiza sola). WFS 1.0 la lee de aqui.', 'Solo si quieres forzarla ahora', 'A VECES'],
  ['📈 Ventas y sobreventa', '💸 Bajar cobro distinto', 'Llena las hojas Cobro distinto (pedidos donde Walmart cobro otra categoria) y Killers sin minimo con lo que muestra el Dashboard del site. Cada hora se actualiza sola.', 'Solo si quieres forzarlo ahora', 'A VECES'],
  ['📈 Ventas y sobreventa', '📦 Revisar sobreventa (Walmart)', 'Llena Sobreventa WFS y Sobreventa Pick con lo que Odoo tiene vendido a Walmart y sin surtir (pickings en espera/confirmados).', 'Normalmente solo (cada 30 min)', 'A VECES'],
  ['📈 Ventas y sobreventa', '❌ Cancelar en Odoo las marcadas de sobreventa', 'Cancela en Odoo, COMPLETAS, las ventas con la casilla CANCELAR EN ODOO marcada en Sobreventa Pick o Sobreventa WFS (aunque traigan -CVA). Pide confirmacion, deja la fila en Cancelaciones con ORIGEN SOBREVENTA MANUAL y desmarca las ya canceladas. Despues cancelalas tambien en el Seller Center.', 'Cuando decidas cancelar una sobreventa a mano', 'CUIDADO'],
  ['📚 Catálogo Walmart', '⬇️ Bajar catálogo de Walmart', 'Llena la hoja Walmart desde el dashboard de Walmart. Sale rapido si nada cambio.', 'Normalmente solo (cada 15 min)', 'A VECES'],
  ['📚 Catálogo Walmart', '📋 Bajar lista Walmart EDI', 'Llena la hoja Walmart EDI con TODAS las publicaciones de Walmart (asignadas y sin asignar) para depurar: bloquear lo que no tiene sentido y ubicar lo que deberia estar asignado.', 'Cuando vayas a depurar', 'A VECES'],
  ['📚 Catálogo Walmart', '🔀 Cruzar EDI vs Bloqueados', 'Arma la hoja Cruce EDI: un renglon por SKU de Walmart con diagnostico (asignar, bloquear, desbloquear?, ok) cruzando EDI, Walmart, Bloqueados y el catalogo de Odoo. Solo recomienda, no bloquea nada.', 'Despues de bajar la lista EDI, cuando vayas a depurar', 'A VECES'],
  ['📚 Catálogo Walmart', '📦 GTINs para convertir a WFS', 'Lista de GTINs agrupados por categoria para pegar en el seller center (Convertir a WFS).', 'Cuando vayas a convertir articulos a WFS', 'A VECES'],
  ['📚 Catálogo Walmart', '🚫 Productos inactivos', 'Llena la plantilla "Mi producto esta inactivo o inedito" para el ticket de soporte.', 'Cuando abras ticket por inactivos', 'A VECES'],
  ['📚 Catálogo Walmart', '🧹 Publicaciones viejas a dar de baja', 'Lista de publicaciones RES/WL/OB que siguen activas y hay que pedirle a Walmart que baje.', 'Cuando limpies publicaciones viejas', 'A VECES'],
  ['📚 Catálogo Walmart', '🔁 Actualizar hoja Republicar', 'Revisa la hoja Republicar: mete los SKU de Cobro distinto y los marcados REPUBLICAR en Estado Killers, propone el SKU NUEVO (SKU base + siguiente consecutivo), arma las filas de COPIAS, pasa a REPUBLICADO los que ya aparecen en Walmart y cuenta los dias. Nunca bloquea ni borra nada.', 'Normalmente solo (con cada bajada de Walmart)', 'A VECES'],
  ['🧬 Concentrado y variantes', '🧱 Armar Concentrado', 'Arma la hoja Concentrado: un renglon por SKU con Walmart + Odoo + precios + categorias.', 'Cuando cambie el catalogo o quieras refrescar el cruce', 'A VECES'],
  ['🧬 Concentrado y variantes', '🧬 Armar Variantes', 'Arma la hoja Variantes (familias de Odoo ligadas a cada SKU de Walmart).', 'Cuando haya SKUs nuevos o cambie la asignacion', 'A VECES'],
  ['🧬 Concentrado y variantes', '🔗 Asignar variante a mano', 'Cuelga una publicacion de otra familia cuando su SKU no sigue la convencion.', 'Solo en casos raros', 'SOPORTE'],
  ['🧬 Concentrado y variantes', '💰 Buscar oportunidades', 'Llena la hoja Oportunidades con oportunidades de precio.', 'Cuando quieras revisar oportunidades', 'A VECES'],
  ['🚫 Cancelaciones', '📥 Leer cancelaciones del correo', 'Lee en Gmail los correos de Walmart "Cancelacion por Solicitud del Cliente" desde el 15-oct y agrega a la hoja Cancelaciones los pedidos de su tabla. Cada hora corre sola y no repite lo ya leido.', 'Para leer ya mismo, o la primera vez', 'A VECES'],
  ['🚫 Cancelaciones', '⏱️ Activar cancelaciones automáticas', 'Crea la corrida de cada hora que lee los correos de cancelacion. Queda a nombre de la cuenta que la activa (la que recibe los correos) y no toca las demas corridas.', 'Una vez, con la cuenta dueña de los correos', 'SOPORTE'],
  ['🚫 Cancelaciones', '🧾 Verificar cancelaciones en Odoo', 'Consulta en Odoo cada pedido de la hoja Cancelaciones y llena ESTADO ODOO y la entrega cancelada (WH/PICK...). Solo lee, no cambia nada en Odoo. Tambien corre cada hora.', 'Para revisar ya mismo', 'A VECES'],
  ['🚫 Cancelaciones', '❌ CANCELAR EN ODOO las marcadas', 'Cancela en Odoo las ventas con la casilla CANCELAR EN ODOO marcada, con tu usuario y PIN (igual que el cuadro Cancelar venta). Pide confirmacion antes. Si la entrega ya esta hecha no cancela: avisa que requiere devolucion. Luego verifica y llena estado y entrega.', 'Despues de marcar las casillas de lo que ya quieres cancelar', 'CUIDADO'],
  ['🚫 Cancelaciones', '🧪 Cancelar UNA venta por número', 'Pide el numero de una venta y la cancela en Odoo con tu usuario y PIN, con confirmacion; muestra el resultado y las entregas. Sirve para probar o cancelar una suelta.', 'Para probar la primera vez o una venta que no esta en la hoja', 'CUIDADO'],
  ['🚫 Cancelaciones', '👁 Ver qué cancelaría la sobreventa', 'Baja la sobreventa de Pick de Odoo y muestra qué ventas cancelaría la corrida de 6-7am (las que traen un SKU sin -CVA), cuáles se quedan por -CVA y si pasa el tope. No cancela ni escribe en Cancelaciones.', 'Antes de aceptar las guías o para revisar', 'A VECES'],
  ['🚫 Cancelaciones', '🔑 Guardar PIN y quién cancela', 'Guarda tu nombre (como sale en ¿Quien cancela?) y tu PIN de 4 digitos en las propiedades del script, solo para cancelar. No se escribe en hojas ni en el Log.', 'Una vez, y si cambias el PIN', 'SOPORTE'],
  ['🚫 Cancelaciones', '🎨 Formato de cancelaciones', 'Pone casillas, el color tenue por dia de la semana en toda la fila y el formato de fechas en Cancelaciones.', 'Si se ven mal los colores o las casillas', 'SOPORTE'],
  ['🚫 Cancelaciones', '↔️ Ordenar columnas de cancelaciones', 'Acomoda las columnas de Cancelaciones por importancia: pedido, Odoo, apoyo, detalle de Walmart y datos tecnicos al final, con encabezados de color por bloque.', 'Si Walmart agrega una columna nueva o se desordena', 'SOPORTE'],
  ['🩺 Diagnóstico › 🧰 Avanzado', '🔎 Descubrir cancelación en Odoo', 'Lee de Odoo como se llama su cuadro de cancelar (quien cancela / PIN) y lo escribe en la hoja _CancelOdoo. No cancela nada.', 'Una sola vez, para armar la cancelacion desde la hoja', 'SOPORTE'],
  ['🩺 Diagnóstico (si algo falla)', '🧭 Revisar columnas de todas las hojas', 'Revisa que cada hoja traiga todas sus columnas.', 'Si sospechas que falta una columna', 'SOPORTE'],
  ['🩺 Diagnóstico (si algo falla)', '🔍 Revisar Concentrado', 'Dice que tan bien cruzo cada fuente; sirve para cachar huecos de datos.', 'Despues de armar el Concentrado', 'SOPORTE'],
  ['🩺 Diagnóstico (si algo falla)', '🔍 Revisar variantes', 'Revisa la calidad de las variantes.', 'Despues de armar Variantes', 'SOPORTE'],
  ['🧾 Cotizaciones', '🆕 Nueva cotización', 'Deja lista la hoja Cotizador (la vacia si ya existe).', 'Inicio de una cotizacion', 'A VECES'],
  ['🧾 Cotizaciones', '🔎 Buscar productos', 'Reconoce cada partida y propone los SKU de las tres gamas.', 'Paso 2 de cotizar', 'A VECES'],
  ['🧾 Cotizaciones', '📄 Generar cotización', 'Guarda la cotizacion (Resumen + 3 gamas) en el libro de historial.', 'Paso 3 de cotizar', 'A VECES'],
  ['🧾 Cotizaciones', '📚 Abrir historial', 'Muestra el link del libro de historial.', 'Para ver cotizaciones pasadas', 'A VECES'],
  ['🧾 Cotizaciones', '🧩 Reglas de búsqueda', 'Abre o crea la hoja de reglas de busqueda.', 'Para ajustar como se reconocen productos', 'SOPORTE'],
  ['🧾 Cotizaciones', '🔗 Usar otro libro de historial', 'Cambia el libro donde se guarda el historial.', 'Casi nunca', 'SOPORTE'],
  ['🛠 Mantenimiento', '💲 Solo precios (6 hojas)', 'Baja solo los precios (las 6 hojas Precios EM/CVA).', 'Si solo necesitas precios frescos', 'A VECES'],
  ['🛠 Mantenimiento', '🧪 Probar ruta nueva de precios', 'Pide 3 productos a la ruta nueva de precios con la llave y deja en el Log como vienen. No escribe en las hojas.', 'Solo para probar la ruta nueva', 'SOPORTE'],
  ['🛠 Mantenimiento', '📦 Solo inventario', 'Baja solo el inventario (Inventario Actual y Negativo).', 'Si solo necesitas inventario fresco', 'A VECES'],
  ['🛠 Mantenimiento', '🗂 Bajar catálogo de Odoo', 'Baja el catalogo de productos de Odoo a la hoja Catalogo.', 'Cuando haya productos nuevos en Odoo', 'A VECES'],
  ['🛠 Mantenimiento', '🧩 Rehacer hoja Inventarios', 'Reconstruye la hoja Inventarios desde cero.', 'Solo si esa hoja se dañó', 'CUIDADO'],
  ['🛠 Mantenimiento', '🧹 Limpiar Log', 'Borra la bitacora (hoja Log).', 'Si el Log ya esta enorme', 'CUIDADO'],
  ['🛠 Mantenimiento', '♻️ Rehacer hoja Walmart (forzado)', 'Igual que la anterior pero reescribe todo aunque no haya cambios.', 'Si la hoja se ve mal o incompleta', 'SOPORTE'],
  ['🛠 Mantenimiento', '🧹 Quitar respaldos y hojas viejas', 'Borra hojas de respaldo y hojas huerfanas viejas.', 'De vez en cuando, para limpiar', 'CUIDADO'],
  ['🛠 Mantenimiento', '💥 Forzar rebajada completa', 'Borra las huellas para que la proxima corrida reescriba TODAS las hojas.', 'Solo si una hoja se ve mal y no se arregla sola', 'CUIDADO'],
  ['⚙️ Configuración (una vez)', '✏️ Poner ruta de killers a mano', 'Captura la ruta de killers a mano.', 'Solo si el site cambia la ruta', 'SOPORTE'],
  ['⚙️ Configuración (una vez)', '🔑 Configurar token API', 'Guarda el token del site (forma correcta y permanente de entrar).', 'Una vez, o si cambia el token', 'SOPORTE'],
  ['⚙️ Configuración (una vez)', '🗄 Conectar Odoo', 'Guarda los datos de conexion a Odoo.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración (una vez)', '🏬 Conectar Walmart Dashboard', 'Conecta el libro del dashboard de Walmart.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración (una vez)', '🔐 Login automático del site', 'Guarda usuario y clave para renovar la sesion sola.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración (una vez)', '🔁 Renovar cookie ahora', 'Renueva la sesion del site ahora.', 'Si salen errores de sesion', 'SOPORTE'],
  ['⚙️ Configuración (una vez)', '🍪 Actualizar cookie a mano', 'Pega la cookie del site a mano (parche que vence).', 'Solo si el login automatico falla', 'SOPORTE'],
  ['⚙️ Configuración (una vez)', '🧩 Clave de la extensión', 'Genera o muestra la URL y la clave que se pegan en la extension de Chrome (manda la cookie sola).', 'Una vez, al instalar la extension', 'SOPORTE'],
  ['⚙️ Configuración (una vez)', '📧 Poner correo de avisos', 'Guarda el correo donde llegan los avisos (cookie vencida, etc.).', 'Una sola vez', 'SOPORTE'],
  ['⚙️ Configuración (una vez)', '✏️ Poner ruta de precios a mano', 'Captura la ruta de precios a mano.', 'Solo si el site cambia', 'SOPORTE'],
  ['⚙️ Configuración (una vez)', '📋 Capturar ID del Sheet', 'Guarda el ID de este libro.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración (una vez)', '🔒 Password del dashboard', 'Define la contraseña del dashboard web.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración (una vez)', '🗑 Borrar TODAS las credenciales', 'Borra token, cookie, password del dashboard, login, clave de la extension, correo de avisos y Odoo. El PIN de cancelacion se queda.', 'Casi nunca', 'CUIDADO'],
  ['⏱ Corridas automáticas', '🔍 Ver triggers de este proyecto', 'Lista las corridas automaticas que hay activas.', 'Para verificar que todo corre solo', 'SOPORTE'],
  ['⏱ Corridas automáticas', '▶️ Activar TODAS las corridas', 'Crea las corridas automaticas (inventario, precios, walmart, killers).', 'Una vez, o si dejaron de correr', 'SOPORTE'],
  ['⏱ Corridas automáticas', '🛑 Quitar corridas', 'Apaga todas las corridas automaticas.', 'Solo para pausar todo', 'CUIDADO'],
  ['🩺 Diagnóstico (si algo falla)', '🔑 Probar credenciales de killers', 'Prueba que combinacion de credencial acepta el site para killers.', 'Si killers marca error 401', 'SOPORTE'],
  ['🩺 Diagnóstico › 🧰 Avanzado', '🔎 Descubrir ruta de killers', 'Busca la ruta de killers a ciegas.', 'Solo si el site cambia la ruta', 'SOPORTE'],
  ['🩺 Diagnóstico › 🧰 Avanzado', '🧬 Ver estructura de killers', 'Muestra que trae la respuesta de killers sin escribir nada.', 'Para diagnosticar', 'SOPORTE'],
  ['🩺 Diagnóstico › 🧰 Avanzado', '🔎 Descubrir endpoint de precios', 'Busca la ruta de precios.', 'Solo si el site cambia', 'SOPORTE'],
  ['🩺 Diagnóstico › 🧰 Avanzado', '🔬 Analizar la página de precios', 'Analiza la pagina de precios del site.', 'Diagnostico', 'SOPORTE'],
  ['🩺 Diagnóstico › 🧰 Avanzado', '🧬 Ver estructura de la respuesta', 'Muestra como viene la respuesta del site.', 'Diagnostico', 'SOPORTE'],
  ['🩺 Diagnóstico › 🧰 Avanzado', '🧪 Volcar un registro de muestra', 'Muestra un registro de ejemplo.', 'Diagnostico', 'SOPORTE'],
  ['🩺 Diagnóstico › 🧰 Avanzado', '🔎 Radiografía de una hoja', 'Escribe en _Radiografia como esta armada otra hoja (columnas, formulas, ejemplo).', 'Cuando quieras revisar formulas de una hoja', 'SOPORTE'],
  ['🩺 Diagnóstico (si algo falla)', '🧪 Probar conexión', 'Prueba que todo conecte.', 'Si algo no baja', 'SOPORTE'],
  ['🩺 Diagnóstico (si algo falla)', '👁 Ver qué está configurado', 'Dice que esta configurado (nunca muestra los valores).', 'Si algo no baja', 'SOPORTE'],
  ['🩺 Diagnóstico (si algo falla)', '📊 Consumo de UrlFetch hoy', 'Cuantas consultas al site llevas hoy contra el limite de Google.', 'Si salen errores de cuota', 'SOPORTE'],
  ['🩺 Diagnóstico (si algo falla)', '♻️ Reintentar tras cuota agotada', 'Quita la marca de cuota agotada para volver a intentar.', 'Despues de que Google reinicie la cuota', 'SOPORTE'],
  ['🩺 Diagnóstico › 🧰 Avanzado', '🔬 Ver campos de Odoo', 'Escribe en _CamposOdoo todos los campos de product.template (nombre, tipo y etiqueta).', 'Solo si hay que ubicar un campo de Odoo', 'SOPORTE'],
  ['🩺 Diagnóstico › 🧰 Avanzado', '↩️ Ruta de killers de fábrica', 'Regresa la ruta y el metodo de killers a los de fabrica (por si Descubrir ruta guardo una mala).', 'Si killers dejo de bajar despues de cambiar la ruta', 'SOPORTE'],
  ['🩺 Diagnóstico › 🧰 Avanzado', '🔍 Revisar triggers de esta cuenta', 'Dice que corridas automaticas tiene esta cuenta, si abre el libro WALMART DASHBOARD y la ultima linea del Log.', 'Correrlo con la cuenta que instala las corridas, si algo no corre solo', 'SOPORTE'],
  ['🩺 Diagnóstico › 🧰 Avanzado', '🔍 SKUs del inventario que faltan en Odoo', 'Cuenta los SKUs de Inventario Actual que no estan en Catalogo (Odoo) y muestra los primeros 20. No cambia nada.', 'Si el Concentrado o Inventarios traen huecos', 'SOPORTE'],
  ['🩺 Diagnóstico › 🧰 Avanzado', '🔍 Marcas y colores sin traducir', 'Lista los prefijos sin marca y los codigos sin color de la hoja Inventarios, para completarlos en _Marcas y _Colores.', 'Despues de rehacer Inventarios', 'SOPORTE']
];

var ORG_NIVEL_COLOR = { 'DIARIO': '#d9ead3', 'A VECES': '#fff2cc', 'SOPORTE': '#eeeeee', 'CUIDADO': '#f4cccc' };

function orgGuia_(ss) {
  var h = ss.getSheetByName(ORG_GUIA) || ss.insertSheet(ORG_GUIA);
  h.clear();
  var filas = [['SECCION DEL MENU', 'OPCION', 'QUE HACE', 'CUANDO USARLA', 'NIVEL']].concat(ORG_GUIA_MENU);
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
  h.getRange(2, 3, nF - 1, 2).setWrap(true);
  [170, 270, 520, 330, 90].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  h.setFrozenRows(1);
  try { var f = h.getFilter(); if (f) f.remove(); } catch (e) {}
  h.getRange(1, 1, nF, 5).createFilter();
  h.getRange(1, 1).setNote('DIARIO = lo usas en tu operacion. A VECES = cuando toca. SOPORTE = solo si algo falla o se configura. CUIDADO = borra o rehace cosas.\nLo que no esta en el menu corre solo.');
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
                       'Walmart', 'Bloqueados', 'Promociones', 'Concentrado', 'Variantes', 'Oportunidades', 'Cambio Walmart', 'Cotizador', 'Cotizador Candidatos'];

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
    if (n === ORG_INDICE || n === ORG_GUIA || ORG_SIN_FORMATO.indexOf(n) !== -1) return;
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
    ui.alert('🗂️ Ordenar hojas', 'No termino:\n  ' + avisos.join('\n  ') +
      '\n\nEs Sheets ocupado (corridas automaticas). Espera 1-2 minutos, sin tocar el libro, y vuelve a correrlo: retoma donde se quedo.', ui.ButtonSet.OK);
    return;
  }
  var falt = (orgFormatos_.fallas || []);
  if (falt.length) avisos.push('Formatos pendientes en: ' + falt.join(', ') + ' (vuelve a correrlo y los termina)');
  var faltA = (orgAnchos_.faltan || []);
  if (faltA.length) avisos.push('Anchos pendientes en: ' + faltA.join(', ') + ' (vuelve a correrlo y los termina)');
  ui.alert('🗂️ Libro ordenado',
    r.ordenadas + ' hojas con color y orden.\n' +
    r.encabezados + ' encabezados unificados.\n' +
    r.formatos + ' columnas de precio/fecha con formato unificado.\n' +
    r.anchos + ' hojas con ancho de columnas ajustado (encabezado completo; lo que ya ajustaste a mano se respeta).\n' +
    (quitadas.length ? 'Quitadas: ' + quitadas.join(', ') + '\n' : '') +
    'Indice: hoja "' + ORG_INDICE + '" (la primera).\n' +
    (r.sinClasificar.length
      ? '\nSIN CLASIFICAR (no estan en el registro, las deje donde estaban):\n  ' + r.sinClasificar.join('\n  ') +
        '\n\nDime cuales son y las agrego al orden.'
      : '\nNo quedo ninguna hoja sin clasificar.') +
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
        var c = null;
        if (n === ORG_INDICE) c = '#202124';
        else if (reg[n]) c = ORG_GRUPOS[reg[n].grupo].color;
        else if (ocultas.indexOf(n) !== -1) c = ORG_GRUPOS.OCULTAS.color;
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
      if (!h || ORG_SIN_ENCABEZADO.indexOf(f[0]) !== -1) return;
      if (orgEncabezado_(h, ORG_GRUPOS[f[1]].color, completo)) resumen.encabezados++;
    });
  }, avisos);
  resumen.formatos = completo ? (orgEtapa_('Formatos', function () { return orgFormatos_(ss); }, avisos) || 0) : 0;
  resumen.anchos = completo ? (orgEtapa_('Anchos', function () { return orgAnchos_(ss); }, avisos) || 0) : 0;
  return resumen;
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
    if (nombre === ORG_GUIA || ORG_SIN_ANCHO.indexOf(nombre) !== -1) return;
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
  filas.push(['Actualizado ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm') + '. Da clic en el nombre para ir a la hoja.', '', '', '', '']);
  filas.push(['', '', '', '', '']);

  var claves = ['GUIA', 'KILLERS', 'WALMART', 'PRECIOS', 'ODOO', 'CONFIG', 'SISTEMA'];
  claves.forEach(function (k) {
    var items = orgListaActual_().filter(function (f) { return f[1] === k && porNombre[f[0]]; });   // col-fija: f es una fila del registro ORG_HOJAS (nombre, grupo, para que sirve, como se actualiza), no una hoja
    if (!items.length) return;
    filas.push([ORG_GRUPOS[k].titulo, 'PARA QUE SIRVE', 'SE ACTUALIZA', 'FILAS', '']);
    banners.push({ fila: filas.length, color: ORG_GRUPOS[k].color });
    items.forEach(function (f) {
      var h = porNombre[f[0]];
      var gid = h.getSheetId();
      filas.push(['=HYPERLINK("#gid=' + gid + '","' + f[0].replace(/"/g, '""') + '")', f[2], f[3], Math.max(h.getLastRow() - orgFilaEnc_(h.getName()), 0), '']);   // col-fija: f es una fila del registro ORG_HOJAS, no una columna de hoja
    });
    filas.push(['', '', '', '', '']);
  });

  if (sinClas.length) {
    filas.push(['❓ SIN CLASIFICAR', 'No estan en el registro de Organizar.gs', '', 'FILAS', '']);
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
      filas.push([n, 'Oculta a proposito (clic derecho > Mostrar hoja si la necesitas)', '', Math.max(porNombre[n].getLastRow() - orgFilaEnc_(n), 0), '']);
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
  ind.setColumnWidth(1, 300); ind.setColumnWidth(2, 520); ind.setColumnWidth(3, 200); ind.setColumnWidth(4, 80);
  ind.setFrozenRows(0);
  ind.setHiddenGridlines(true);
}
