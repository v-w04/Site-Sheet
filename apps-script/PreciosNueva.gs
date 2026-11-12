/**
 * ============================================================
 *  Precios — prueba de la ruta nueva (solo lectura)
 * ============================================================
 *
 *  El site tiene una ruta GET que acepta la llave de solo lectura:
 *
 *    GET /precios-em/api/precios?sku=SKU1,SKU2&formato=csv
 *    Header: Authorization: Bearer <llave>
 *    Sin sku trae todo el catalogo por paginas (&pagina=1&por_pagina=500).
 *    La llave necesita la pestana "Precios Electronics Mexico".
 *
 *  Esta funcion NO cambia como bajan los precios: solo pide 3 productos y
 *  deja en el Log como viene la respuesta (columnas y una fila), para poder
 *  armar el mapeo a las 23 columnas sin adivinar.
 *
 *  Es lectura pura: no escribe en ninguna hoja de precios.
 */

var PN_RUTA = '/precios-em/api/precios';
