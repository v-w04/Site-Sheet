/**
 * ============================================================
 *  Config — SITE SHEET
 * ============================================================
 *
 *  Baja del sitio de la empresa lo que hoy se consulta a mano:
 *  inventario (stock y negativos) y precios (2 masters x 3 bandas).
 *  Todo termina en hojas de este Sheet, y el dashboard las sirve
 *  con botones de descarga.
 *
 *  AUTENTICACION: token fijo en el header X-API-Key. No expira.
 *  La cookie de sesion queda solo como respaldo mientras el
 *  servidor acepta el token en todas las rutas.
 *
 *  Apps Script corre en servidores de Google, no en tu navegador:
 *  NO puede ver tu sesion ni enterarse de cuando haces login. Por
 *  eso la cookie siempre sera un parche manual y el token es la
 *  unica solucion de verdad.
 *
 *  REGLA: aqui no hay credenciales. Token, cookie e ID del Sheet
 *  viven en PropertiesService. Este archivo se sube a un repo.
 */

/* ================ SITIO ================ */
var SITE = 'https://electronicsmexico.site';

var RUTA_STOCK      = '/stock-odoo-data';
var RUTA_NEGATIVOS  = '/stock-odoo-negativos-data';

/** La ruta de datos de precios se descubre una vez y se guarda.
 *  Menu SITE SHEET > Configuracion > Descubrir endpoint de precios. */
var RUTA_PRECIOS_PAGINA = '/precios-em';

/** Candidatas que prueba el descubridor, en orden. */
var CANDIDATAS_PRECIOS = [
  '/precios-em-data',
  '/precios-data',
  '/precios-em/data',
  '/api/precios-em',
  '/api/precios',
  '/precios-em.json',
  '/precios-em?format=json'
];

/* ================ MASTERS Y BANDAS ================
   Los mismos que los botones de la pagina:
     data-m  -> elemex | cva
     data-b  -> minimo | normal | maximo                        */

var MASTERS = [
  { id: 'elemex', etiqueta: 'Electronics Mexico' },
  { id: 'cva',    etiqueta: 'CVA' }
];

var BANDAS = [
  { id: 'minimo', etiqueta: 'Minimo' },
  { id: 'normal', etiqueta: 'Normal' },
  { id: 'maximo', etiqueta: 'Maximo' }
];

/** Nombre de hoja para cada combinacion. 6 hojas. */
function hojaPrecios_(master, banda) {
  var m = master === 'cva' ? 'CVA' : 'EM';
  var b = banda.charAt(0).toUpperCase() + banda.slice(1);
  return 'Precios ' + m + ' ' + b;
}

/**
 * Orden preferido de columnas, tomado del export que ya usas.
 * Si el endpoint trae campos que no estan en esta lista, se agregan
 * al final: nunca se pierde informacion por no haberla previsto.
 */
var COLUMNAS_PRECIOS = [
  'Producto', 'SKU', 'Categoría ML', 'Rango de envío', 'Envío', 'Peso kg',
  'Stock Odoo', 'Cambio de precio %', 'Precio anterior', 'Cambió el',
  'MELI Clásica', 'MELI Premium', 'Walmart Clásica', 'Walmart Premium',
  'Coppel', 'Totalplay', 'T1 Sears', 'Liverpool', 'AliExpress',
  'Elektra', 'TikTok Shop', 'Tienda Nube', 'Avisos'
];

/** Columnas que deben ir en formato texto: sin `@`, Sheets se come
 *  los ceros de la izquierda de un SKU o un UPC. */
var RE_COLUMNA_TEXTO = /sku|upc|gtin|ean|codigo|barcode/i;

/* ================ HOJAS ================ */
var HOJA = {
  STOCK:     'Inventario Actual',
  NEGATIVOS: 'Inventario Negativo',
  LOG:       'Log'
};

/* ================ PROPIEDADES ================ */
/** Los nombres de las llaves no son secretos; los valores nunca
 *  aparecen en el codigo. */
var PROP = {
  SHEET_ID:  'SHEET_ID',
  TOKEN:     'SITE_API_TOKEN',
  COOKIE:    'SITE_SESSION_COOKIE',
  RUTA_PRE:  'RUTA_PRECIOS',
  PW_HASH:   'DASH_PW_HASH',
  PW_SALT:   'DASH_PW_SALT'
};

/** Huella de lo ultimo escrito por hoja, para no reescribir cuando
 *  nada cambio. Se guarda como PROP_HUELLA + nombre de hoja. */
var PROP_HUELLA = 'HUELLA_';

/** La cuota de UrlFetch es POR CUENTA DE GOOGLE, no por proyecto.
 *  Si este proyecto tuviera triggers de dos cuentas, una puede
 *  tener la cuota quemada y la otra no — por eso estos flags van
 *  en USER properties, no en script properties. */
var PROP_CUOTA_DIA   = 'CUOTA_AGOTADA_DIA';
var PROP_FETCH_DIA   = 'FETCH_DIA';
var PROP_FETCH_COUNT = 'FETCH_COUNT';

/* ================ OPERACION ================ */
var TZ                = 'America/Mexico_City';
var TRIGGER_MINUTOS   = 15;
var FETCH_REINTENTOS  = 3;     // solo 5xx / 429 / red. NUNCA para cuota.
var CACHE_VIEJO_SEG   = 180;
var LOCK_ESPERA_MS    = 5000;
var PAUSA_ENTRE_MS    = 400;
var MAX_FILAS_LOG     = 500;

/* ================ DASHBOARD ================ */
var SESION_HORAS     = 12;
var MAX_INTENTOS     = 5;
var BLOQUEO_MINUTOS  = 15;
var ITERACIONES_HASH = 5000;

/* ================ HELPERS ================ */

function props_()     { return PropertiesService.getScriptProperties(); }
function propsUser_() { return PropertiesService.getUserProperties(); }

function prop_(llave) {
  var v = props_().getProperty(llave);
  if (!v) {
    throw new Error(
      'Falta la configuracion "' + llave + '". ' +
      'Abre el Sheet y usa el menu SITE SHEET > Configuracion.'
    );
  }
  return v;
}

/** El Sheet SIEMPRE por openById: getActiveSpreadsheet() devuelve
 *  null en triggers y en web apps. */
function getSpreadsheet_() {
  var id = props_().getProperty(PROP.SHEET_ID);
  if (id) return SpreadsheetApp.openById(id);

  var activo = SpreadsheetApp.getActiveSpreadsheet();
  if (activo) return activo;

  throw new Error('Falta el ID del Sheet. Menu SITE SHEET > Configuracion.');
}

function getHoja_(nombre) {
  var ss = getSpreadsheet_();
  var h = ss.getSheetByName(nombre);
  if (!h) h = ss.insertSheet(nombre);
  return h;
}

function hoy_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function ahora_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

/** toast seguro: en triggers no hay UI, y un -1 lo deja pegado. */
function toast_(msg, titulo, segundos) {
  try {
    SpreadsheetApp.getActive().toast(msg, titulo || 'SITE SHEET', segundos || 5);
  } catch (e) { /* sin UI */ }
}
