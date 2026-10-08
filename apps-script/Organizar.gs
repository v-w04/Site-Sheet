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

var ORG_GRUPOS = {
  GUIA:    { titulo: '📖 GUIA',                      color: '#00796b' },
  KILLERS: { titulo: '🔥 KILLERS Y PROMOCIONES',      color: '#d93025' },
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
  ['Dashboard',            'KILLERS', 'Indicadores del dashboard del site (killers, cobros, edad de datos)', 'Auto, cada hora'],
  ['Killers bajo minimo',  'KILLERS', 'Killers que no cubren tu minimo: cuanto falta, % de perdida, categoria y KAM', 'Auto, cada hora'],
  ['Cobros distintos',     'KILLERS', 'SKUs donde Walmart cobra distinto a lo esperado', 'Auto, cada hora'],
  ['Cobros detalle',       'KILLERS', 'Detalle de esos cobros distintos', 'Auto, cada hora'],
  ['Killers',              'KILLERS', 'Killers activos y propuestas bajados del site', 'Auto, cada hora'],
  ['Promociones',          'KILLERS', 'Promociones del site por SKU', 'Auto, cada hora'],
  ['KAMS',                 'KILLERS', 'Contactos de los KAMs de Walmart por categoria y correos a enviar', 'Manual (tu la editas)'],
  ['Correo',               'KILLERS', 'Asunto y mensaje del correo de cambio de killers', 'Manual (tu la editas)'],
  ['Envios killers',       'KILLERS', 'Bitacora de correos enviados a los KAMs', 'Auto, al enviar'],

  ['Walmart',              'WALMART', 'Catalogo de Walmart bajado del dashboard (UPC, GTIN, precio, WFS)', 'Auto, cada 15 min'],
  ['Bloqueados',           'WALMART', 'Articulos que bloqueas en el dashboard de Walmart', 'Auto, con Walmart'],
  ['Concentrado',          'WALMART', 'Un renglon por SKU: Walmart + Odoo + precios + categorias', 'Menu: Armar Concentrado'],
  ['Variantes',            'WALMART', 'Familias y variantes (Odoo) ligadas a cada SKU de Walmart', 'Menu: Armar Variantes'],
  ['Oportunidades',        'WALMART', 'Oportunidades de precio detectadas', 'Menu: Buscar oportunidades'],

  ['Cambio Walmart',       'PRECIOS', 'Hoja de trabajo para el cambio de precios y el archivo a Walmart', 'Menu: Nuevo cambio'],
  ['Enlaces',              'PRECIOS', 'Enlaces de precio: un SKU toma los precios Clasica/Premium de otro', 'Manual (tu la editas)'],
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

  ['Log',                  'SISTEMA', 'Bitacora de todo lo que hacen los procesos automaticos', 'Auto']
];


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
  ['SITE SHEET', '🧩 Rehacer hoja Inventarios', 'Reconstruye la hoja Inventarios desde cero.', 'Solo si esa hoja se dañó', 'CUIDADO'],
  ['SITE SHEET', '🧹 Limpiar Log', 'Borra la bitacora (hoja Log).', 'Si el Log ya esta enorme', 'CUIDADO'],

  ['🏬 Walmart', '⬇️ Bajar catálogo de Walmart', 'Llena la hoja Walmart desde el dashboard de Walmart. Sale rapido si nada cambio.', 'Normalmente solo (cada 15 min)', 'A VECES'],
  ['🏬 Walmart', '♻️ Rehacer hoja Walmart (forzado)', 'Igual que la anterior pero reescribe todo aunque no haya cambios.', 'Si la hoja se ve mal o incompleta', 'SOPORTE'],
  ['🏬 Walmart', '🧱 Armar Concentrado', 'Arma la hoja Concentrado: un renglon por SKU con Walmart + Odoo + precios + categorias.', 'Cuando cambie el catalogo o quieras refrescar el cruce', 'A VECES'],
  ['🏬 Walmart', '🧹 Quitar respaldos y hojas viejas', 'Borra hojas de respaldo y hojas huerfanas viejas.', 'De vez en cuando, para limpiar', 'CUIDADO'],
  ['🏬 Walmart', '🧭 Revisar columnas de todas las hojas', 'Revisa que cada hoja traiga todas sus columnas.', 'Si sospechas que falta una columna', 'SOPORTE'],
  ['🏬 Walmart', '🧬 Armar Variantes', 'Arma la hoja Variantes (familias de Odoo ligadas a cada SKU de Walmart).', 'Cuando haya SKUs nuevos o cambie la asignacion', 'A VECES'],
  ['🏬 Walmart', '💰 Buscar oportunidades', 'Llena la hoja Oportunidades con oportunidades de precio.', 'Cuando quieras revisar oportunidades', 'A VECES'],
  ['🏬 Walmart', '🔍 Revisar Concentrado', 'Dice que tan bien cruzo cada fuente; sirve para cachar huecos de datos.', 'Despues de armar el Concentrado', 'SOPORTE'],
  ['🏬 Walmart', '🔍 Revisar variantes', 'Revisa la calidad de las variantes.', 'Despues de armar Variantes', 'SOPORTE'],
  ['🏬 Walmart', '📦 GTINs para convertir a WFS', 'Lista de GTINs agrupados por categoria para pegar en el seller center (Convertir a WFS).', 'Cuando vayas a convertir articulos a WFS', 'A VECES'],
  ['🏬 Walmart', '🚫 Productos inactivos', 'Llena la plantilla "Mi producto esta inactivo o inedito" para el ticket de soporte.', 'Cuando abras ticket por inactivos', 'A VECES'],
  ['🏬 Walmart', '🧹 Publicaciones viejas a dar de baja', 'Lista de publicaciones RES/WL/OB que siguen activas y hay que pedirle a Walmart que baje.', 'Cuando limpies publicaciones viejas', 'A VECES'],

  ['🏷 Cambio de precios', '🆕 Nuevo cambio', 'Empieza un cambio de precios: pregunta el tipo (masivo, killers o SKUs especificos) y arma la hoja Cambio Walmart.', 'PASO 1 de un cambio de precios', 'DIARIO'],
  ['🏷 Cambio de precios', '📋 Pegar SKUs', 'Llena la hoja con una lista de SKUs que pegues (killers / ofertas).', 'Paso 2 si el cambio es de SKUs especificos', 'DIARIO'],
  ['🏷 Cambio de precios', '✅ Marcar lo filtrado', 'Marca las filas que deje visibles tu filtro.', 'Paso 2: elegir que cambia', 'DIARIO'],
  ['🏷 Cambio de precios', '🔤 Marcar por texto', 'Marca por texto (categoria, marca o palabra del producto).', 'Paso 2: elegir que cambia', 'DIARIO'],
  ['🏷 Cambio de precios', '☑️ Marcar todo', 'Marca todas las filas.', 'Paso 2', 'DIARIO'],
  ['🏷 Cambio de precios', '⬜ Desmarcar todo', 'Quita todas las marcas.', 'Paso 2', 'DIARIO'],
  ['🏷 Cambio de precios', '✖️ Aplicar factor de precio', 'Multiplica el precio de las filas marcadas (1 = 100%, 0.98 = 98%).', 'Paso 3', 'DIARIO'],
  ['🏷 Cambio de precios', '📅 Aplicar fechas', 'Pone inicio = ahora + 5 min y el fin que digas, en las filas marcadas.', 'Paso 4. Correla justo antes de generar el archivo.', 'DIARIO'],
  ['🏷 Cambio de precios', '🔗 Asignar variante a mano', 'Cuelga una publicacion de otra familia cuando su SKU no sigue la convencion.', 'Solo en casos raros', 'SOPORTE'],
  ['🏷 Cambio de precios', '📄 GENERAR ARCHIVO WALMART', 'Genera el xlsx para Walmart en Drive (carpeta Archivos Walmart).', 'Paso 5, el ultimo', 'DIARIO'],

  ['🔥 Killers', '⬇️ Bajar killers del site', 'Baja los killers y propuestas del site a la hoja Killers.', 'Normalmente solo (cada hora)', 'A VECES'],
  ['🔥 Killers', '📊 Bajar dashboard del site', 'Baja el dashboard del site: llena Killers bajo minimo (con categoria, KAM y % de perdida), Cobros distintos y Dashboard.', 'Cuando quieras ver los killers que no cubren tu minimo (tambien corre solo cada hora)', 'DIARIO'],
  ['🔥 Killers', '📧 Enviar correos de killers', 'Arma un correo por categoria KAM con el adjunto SKU / precio minimo / GTIN / UPC. Antes de enviar muestra a quien y que datos. SI = real, NO = prueba solo a ti.', 'Cuando haya que pedir cambio de killers a los KAMs de Walmart', 'DIARIO'],
  ['🔥 Killers', '🏷️ Bajar promociones del site', 'Baja las promociones del site a la hoja Promociones.', 'Normalmente solo (cada hora)', 'A VECES'],
  ['🔥 Killers', '🔑 Probar credenciales', 'Prueba que combinacion de credencial acepta el site para killers.', 'Si killers marca error 401', 'SOPORTE'],
  ['🔥 Killers', '🔎 Descubrir ruta de killers', 'Busca la ruta de killers a ciegas.', 'Solo si el site cambia la ruta', 'SOPORTE'],
  ['🔥 Killers', '🧬 Ver estructura', 'Muestra que trae la respuesta de killers sin escribir nada.', 'Para diagnosticar', 'SOPORTE'],
  ['🔥 Killers', '✏️ Ruta a mano', 'Captura la ruta de killers a mano.', 'Solo si el site cambia la ruta', 'SOPORTE'],

  ['🧾 Cotizaciones', '🆕 Nueva cotización', 'Deja lista la hoja Cotizador (la vacia si ya existe).', 'Inicio de una cotizacion', 'A VECES'],
  ['🧾 Cotizaciones', '🔎 Buscar productos', 'Reconoce cada partida y propone los SKU de las tres gamas.', 'Paso 2 de cotizar', 'A VECES'],
  ['🧾 Cotizaciones', '📄 Generar cotización', 'Guarda la cotizacion (Resumen + 3 gamas) en el libro de historial.', 'Paso 3 de cotizar', 'A VECES'],
  ['🧾 Cotizaciones', '📚 Abrir historial', 'Muestra el link del libro de historial.', 'Para ver cotizaciones pasadas', 'A VECES'],
  ['🧾 Cotizaciones', '🧩 Reglas de búsqueda', 'Abre o crea la hoja de reglas de busqueda.', 'Para ajustar como se reconocen productos', 'SOPORTE'],
  ['🧾 Cotizaciones', '🔗 Usar otro libro de historial', 'Cambia el libro donde se guarda el historial.', 'Casi nunca', 'SOPORTE'],

  ['⚙️ Configuración', '🔑 Configurar token API', 'Guarda el token del site (forma correcta y permanente de entrar).', 'Una vez, o si cambia el token', 'SOPORTE'],
  ['⚙️ Configuración', '🗄 Conectar Odoo', 'Guarda los datos de conexion a Odoo.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración', '🏬 Conectar Walmart Dashboard', 'Conecta el libro del dashboard de Walmart.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración', '🔐 Login automático del site', 'Guarda usuario y clave para renovar la sesion sola.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración', '🔁 Renovar cookie ahora', 'Renueva la sesion del site ahora.', 'Si salen errores de sesion', 'SOPORTE'],
  ['⚙️ Configuración', '🍪 Actualizar cookie a mano', 'Pega la cookie del site a mano (parche que vence).', 'Solo si el login automatico falla', 'SOPORTE'],
  ['⚙️ Configuración', '🔎 Descubrir endpoint de precios', 'Busca la ruta de precios.', 'Solo si el site cambia', 'SOPORTE'],
  ['⚙️ Configuración', '🔬 Analizar la página de precios', 'Analiza la pagina de precios del site.', 'Diagnostico', 'SOPORTE'],
  ['⚙️ Configuración', '🧬 Ver estructura de la respuesta', 'Muestra como viene la respuesta del site.', 'Diagnostico', 'SOPORTE'],
  ['⚙️ Configuración', '🧪 Volcar un registro de muestra', 'Muestra un registro de ejemplo.', 'Diagnostico', 'SOPORTE'],
  ['⚙️ Configuración', '🔎 Radiografía de una hoja', 'Escribe en _Radiografia como esta armada otra hoja (columnas, formulas, ejemplo).', 'Cuando quieras revisar formulas de una hoja', 'SOPORTE'],
  ['⚙️ Configuración', '✏️ Poner ruta de precios a mano', 'Captura la ruta de precios a mano.', 'Solo si el site cambia', 'SOPORTE'],
  ['⚙️ Configuración', '📋 Capturar ID del Sheet', 'Guarda el ID de este libro.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración', '🔒 Password del dashboard', 'Define la contraseña del dashboard web.', 'Una vez', 'SOPORTE'],
  ['⚙️ Configuración', '🧪 Probar conexión', 'Prueba que todo conecte.', 'Si algo no baja', 'SOPORTE'],
  ['⚙️ Configuración', '👁 Ver qué está configurado', 'Dice que esta configurado (nunca muestra los valores).', 'Si algo no baja', 'SOPORTE'],
  ['⚙️ Configuración', '📊 Consumo de UrlFetch hoy', 'Cuantas consultas al site llevas hoy contra el limite de Google.', 'Si salen errores de cuota', 'SOPORTE'],
  ['⚙️ Configuración', '♻️ Reintentar tras cuota agotada', 'Quita la marca de cuota agotada para volver a intentar.', 'Despues de que Google reinicie la cuota', 'SOPORTE'],
  ['⚙️ Configuración', '💥 Forzar rebajada completa', 'Borra las huellas para que la proxima corrida reescriba TODAS las hojas.', 'Solo si una hoja se ve mal y no se arregla sola', 'CUIDADO'],
  ['⚙️ Configuración', '🗑 Borrar TODAS las credenciales', 'Borra token, cookie, login y demas guardados.', 'Casi nunca', 'CUIDADO'],

  ['⏱ Triggers', '🔍 Ver triggers de este proyecto', 'Lista las corridas automaticas que hay activas.', 'Para verificar que todo corre solo', 'SOPORTE'],
  ['⏱ Triggers', '▶️ Activar TODAS las corridas', 'Crea las corridas automaticas (inventario, precios, walmart, killers).', 'Una vez, o si dejaron de correr', 'SOPORTE'],
  ['⏱ Triggers', '🛑 Quitar corridas', 'Apaga todas las corridas automaticas.', 'Solo para pausar todo', 'CUIDADO']
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

function orgGrupoOculta_(nombre) {
  return /respaldo/i.test(nombre) || nombre === '_CatalogoTmp' || /^_.*tmp$/i.test(nombre);
}

/** Menu: ordena y avisa. */
function orgOrdenar() {
  var r = orgAplicar_(true);
  var ui = SpreadsheetApp.getUi();
  ui.alert('🗂️ Libro ordenado',
    r.ordenadas + ' hojas con color y orden.\n' +
    r.encabezados + ' encabezados unificados.\n' +
    'Indice: hoja "' + ORG_INDICE + '" (la primera).\n' +
    (r.sinClasificar.length
      ? '\nSIN CLASIFICAR (no estan en el registro, las deje donde estaban):\n  ' + r.sinClasificar.join('\n  ') +
        '\n\nDime cuales son y las agrego al orden.'
      : '\nNo quedo ninguna hoja sin clasificar.') +
    (r.faltan.length ? '\n\nEn el registro pero aun no existen (se crean al correr su proceso):\n  ' + r.faltan.join(', ') : ''),
    ui.ButtonSet.OK);
}

/** Cada hora, sin avisos. Solo trabaja si algo cambio. */
function orgProgramado_() {
  orgAplicar_(false);
}

/**
 * @param {boolean} completo true = menu (todo + indice); false = silencioso (solo si algo cambio)
 */
function orgAplicar_(completo) {
  var ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(ORG_GUIA)) orgGuia_(ss);
  var hojas = ss.getSheets();
  var porNombre = {};
  hojas.forEach(function (h) { porNombre[h.getName()] = h; });

  var reg = {};                       // nombre -> {grupo, desc, act}
  ORG_HOJAS.forEach(function (f) { reg[f[0]] = { grupo: f[1], desc: f[2], act: f[3] }; });

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
  ORG_HOJAS.forEach(function (f) { if (porNombre[f[0]]) deseado.push(f[0]); });
  sinClas.forEach(function (n) { deseado.push(n); });
  ocultas.sort().forEach(function (n) { deseado.push(n); });

  // Huella: nombres + orden. Si no cambio y es la corrida silenciosa, solo revisa encabezados.
  var huella = deseado.join('|');
  var props = PropertiesService.getScriptProperties();
  var igual = (props.getProperty(ORG_PROP_HUELLA) === huella) && !!porNombre[ORG_INDICE];

  var resumen = { ordenadas: 0, encabezados: 0, sinClasificar: sinClas, faltan: [] };
  ORG_HOJAS.forEach(function (f) { if (!porNombre[f[0]]) resumen.faltan.push(f[0]); });

  if (completo || !igual) {
    var ind = porNombre[ORG_INDICE] || ss.insertSheet(ORG_INDICE);
    porNombre[ORG_INDICE] = ind;

    // posicion
    deseado.forEach(function (n, i) {
      var h = porNombre[n];
      if (!h) return;
      if (h.isSheetHidden()) return;
      if (h.getIndex() !== i + 1) { ss.setActiveSheet(h); ss.moveActiveSheet(i + 1); }
    });
    ss.setActiveSheet(ind);

    // color de pestana
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

    orgGuia_(ss);
    porNombre[ORG_GUIA] = ss.getSheetByName(ORG_GUIA);
    orgIndice_(ind, reg, porNombre, sinClas, ocultas);
    props.setProperty(ORG_PROP_HUELLA, huella);
  }

  // encabezados: el menu los aplica siempre; la corrida silenciosa solo si alguien los deshizo
  ORG_HOJAS.forEach(function (f) {
    var h = porNombre[f[0]];
    if (!h) return;
    if (orgEncabezado_(h, ORG_GRUPOS[f[1]].color, completo)) resumen.encabezados++;
  });
  return resumen;
}

/** Estilo del encabezado (fila 1) y fila congelada. true si cambio algo. */
function orgEncabezado_(h, color, forzar) {
  var nC = h.getLastColumn(), nF = h.getLastRow();
  if (nC < 1 || nF < 1) return false;
  var enc = h.getRange(1, 1, 1, nC);
  var a1 = String(h.getRange(1, 1).getValue() || '');
  if (!a1 && nC === 1) return false;                 // hoja vacia
  var cambio = false;
  if (forzar || enc.getCell(1, 1).getBackground().toLowerCase() !== color) {
    enc.setFontWeight('bold').setFontColor('#ffffff').setBackground(color).setVerticalAlignment('middle');
    cambio = true;
  }
  if (h.getFrozenRows() === 0 && nF > 1) { h.setFrozenRows(1); cambio = true; }
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
    var items = ORG_HOJAS.filter(function (f) { return f[1] === k && porNombre[f[0]]; });
    if (!items.length) return;
    filas.push([ORG_GRUPOS[k].titulo, 'PARA QUE SIRVE', 'SE ACTUALIZA', 'FILAS', '']);
    banners.push({ fila: filas.length, color: ORG_GRUPOS[k].color });
    items.forEach(function (f) {
      var h = porNombre[f[0]];
      var gid = h.getSheetId();
      filas.push(['=HYPERLINK("#gid=' + gid + '","' + f[0].replace(/"/g, '""') + '")', f[2], f[3], Math.max(h.getLastRow() - 1, 0), '']);
    });
    filas.push(['', '', '', '', '']);
  });

  if (sinClas.length) {
    filas.push(['❓ SIN CLASIFICAR', 'No estan en el registro de Organizar.gs', '', 'FILAS', '']);
    banners.push({ fila: filas.length, color: '#202124' });
    sinClas.forEach(function (n) {
      filas.push(['=HYPERLINK("#gid=' + porNombre[n].getSheetId() + '","' + n.replace(/"/g, '""') + '")', '', '', Math.max(porNombre[n].getLastRow() - 1, 0), '']);
    });
    filas.push(['', '', '', '', '']);
  }
  if (ocultas.length) {
    filas.push([ORG_GRUPOS.OCULTAS.titulo, '', '', 'FILAS', '']);
    banners.push({ fila: filas.length, color: ORG_GRUPOS.OCULTAS.color });
    ocultas.forEach(function (n) {
      filas.push([n, 'Oculta a proposito (clic derecho > Mostrar hoja si la necesitas)', '', Math.max(porNombre[n].getLastRow() - 1, 0), '']);
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
