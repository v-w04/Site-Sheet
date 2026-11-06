/**
 * PromosArchivo.gs - Archivo para SUBIR promociones al site (plantilla_promociones_walmart.xlsx).
 *
 * Mismo formato que la plantilla del site: hoja "Promociones" (SKU · CATEGORIA · REDUCCION (PUNTOS)) y hoja
 * "Categorias validas" (CATEGORIA · COMISION NORMAL (%)). Los SKU salen de los killers del grupo KAM elegido
 * (hojas Killers bajo minimo y Killers activos), solo premium (-MSI). El archivo se guarda en Drive (carpeta
 * "Promociones Walmart") y se manda a tu correo. No toca el site: tu lo subes.
 *
 * Menu: Killers > Bajo minimo > Archivo de promociones para el site.
 */

var PA_PUNTOS_DEF = 7;
var PA_CARPETA = 'Promociones Walmart';
/* Grupo KAM -> nombre de la hoja "Categorias validas" del site. Los grupos que no estan aqui no se ofrecen. */
var PA_GRUPO_CAT = {
  'VIDEOJUEGOS': 'Videojuegos', 'FOTOGRAFIA': 'Camaras y Lentes', 'TV': 'TV y Video', 'AUDIO': 'Audio y Amplificadores',
  'COMPUTACION': 'Computadoras', 'ELECTRODOMESTICOS': 'Electrodomesticos', 'JUGUETERIA': 'Juguetes',
  'AUTOMOTRIZ': 'Automotriz', 'BELLEZA': 'Salud y Belleza', 'FERRETERIA': 'Herramientas'
};
var PA_CATEGORIAS_VALIDAS = [['Accesorios', 15], ['Alimentos', 15], ['Audio y Amplificadores', 10], ['Automotriz', 12], ['Cables', 15],
  ['Calzado', 15], ['Camaras y Lentes', 10], ['Celulares', 10], ['Cocina y Hogar', 15], ['Computadoras', 10], ['Deportes', 15],
  ['Electrodomesticos', 15], ['Hardware', 15], ['Herramientas', 12], ['Iluminacion', 15], ['Impresoras y Escaneres', 10],
  ['Joyeria', 20], ['Juguetes', 15], ['Lentes de Armazon', 15], ['Mascotas', 15], ['Perfumes', 15], ['Proyectores', 10],
  ['Relojes', 15], ['Salud y Belleza', 15], ['Tablets', 10], ['TV y Video', 10], ['Videojuegos', 10]];

/** Menu: abre el formulario (grupo + puntos). */
function promosArchivoWalmart() {
  var opts = Object.keys(PA_GRUPO_CAT).map(function (g) {
    return '<option value="' + g + '"' + (g === 'VIDEOJUEGOS' ? ' selected' : '') + '>' + g + '</option>';
  }).join('');
  var html = '<div style="font:14px Arial;padding:6px">' +
    '<p>Archivo con el formato de la plantilla del site, con los killers <b>premium (-MSI)</b> del grupo.</p>' +
    '<p>Grupo KAM:<br><select id="g" style="width:100%;padding:6px">' + opts + '</select></p>' +
    '<p>Reducción (puntos de comisión):<br><input id="p" type="number" step="0.5" min="0" max="30" value="' + PA_PUNTOS_DEF + '" style="width:100%;padding:6px"></p>' +
    '<p id="m" style="color:#555"></p>' +
    '<button id="b" style="padding:8px 14px;background:#0071DC;color:#fff;border:0;border-radius:4px" onclick="ir()">Generar archivo</button> ' +
    '<button style="padding:8px 14px" onclick="google.script.host.close()">Cerrar</button></div>' +
    '<script>function ir(){var b=document.getElementById("b");b.disabled=true;document.getElementById("m").textContent="Generando…";' +
    'google.script.run.withSuccessHandler(function(t){document.getElementById("m").innerHTML=t;b.disabled=false;})' +
    '.withFailureHandler(function(e){document.getElementById("m").textContent="Error: "+e.message;b.disabled=false;})' +
    '.paGenerar(document.getElementById("g").value,document.getElementById("p").value);}</script>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(420).setHeight(330), 'Archivo de promociones para el site');
}

/** SKU premium de los killers del grupo (bajo minimo + activos), sin repetir. Funcion pura sobre las tablas leidas. */
function paSkus_(bajo, activos, grupo) {
  var out = {};
  var re = /-MSI(-\d+)?(-CVA)?$/i;
  function tomar(v, colSku, colKam) {
    if (!v || v.length < 2) return;
    var c = colsDe_(v[0], [colSku, colKam], 'Promos archivo');
    for (var i = 1; i < v.length; i++) {
      var s = String(v[i][c[colSku]] || '').trim();
      if (s && String(v[i][c[colKam]]).trim().toUpperCase() === grupo && re.test(s)) out[s] = true;
    }
  }
  tomar(bajo, 'SKU WALMART', 'CATEGORIA KAM');
  tomar(activos, 'SKU', 'KAM');
  return Object.keys(out).sort();
}

/** Lo llama el formulario. Valida lo que llega de la ventana, genera el .xlsx, lo guarda en Drive y lo manda por correo. */
function paGenerar(grupo, puntos) {
  grupo = String(grupo || '').toUpperCase();
  puntos = Number(puntos);
  if (!PA_GRUPO_CAT[grupo]) throw new Error('Grupo no válido.');
  if (!(puntos >= 0 && puntos <= 30)) throw new Error('Los puntos deben ir de 0 a 30.');
  var ss = SpreadsheetApp.getActive();
  var t = function (n) { var h = ss.getSheetByName(n); return h && h.getLastRow() > 1 ? h.getDataRange().getValues() : null; };
  var skus = paSkus_(t('Killers bajo minimo'), t('Killers activos'), grupo);
  if (!skus.length) return 'No hay killers premium de ' + grupo + ' en Killers bajo minimo / activos.';

  var cat = PA_GRUPO_CAT[grupo];
  var tmp = SpreadsheetApp.create('tmp_promos_' + grupo);
  try {
    var h1 = tmp.getSheets()[0]; h1.setName('Promociones');
    var f1 = [['SKU', 'CATEGORIA', 'REDUCCION (PUNTOS)']].concat(skus.map(function (s) { return [s, cat, puntos]; }));
    h1.getRange(1, 1, f1.length, 3).setValues(f1);
    var h2 = tmp.insertSheet('Categorias validas');
    h2.getRange(1, 1, PA_CATEGORIAS_VALIDAS.length + 1, 2).setValues([['CATEGORIA', 'COMISION NORMAL (%)']].concat(PA_CATEGORIAS_VALIDAS));
    [[h1, 3, [42.7, 26, 20]], [h2, 2, [30, 22]]].forEach(function (x) {
      x[0].getRange(1, 1, 1, x[1]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#0071DC').setHorizontalAlignment('center');
      for (var c = 0; c < x[1]; c++) x[0].setColumnWidth(c + 1, Math.round(x[2][c] * 7));
    });
    SpreadsheetApp.flush();
    var stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd_HHmm');
    var nombre = 'plantilla_promociones_walmart_' + grupo + '_' + stamp + '.xlsx';
    var blob = exportarXlsx_(tmp.getId(), nombre);
    var it = DriveApp.getFoldersByName(PA_CARPETA);
    var carpeta = it.hasNext() ? it.next() : DriveApp.createFolder(PA_CARPETA);
    var url = carpeta.createFile(blob).getUrl();
    var yo = ''; try { yo = skCorreoYo_(); } catch (e) {}
    var aviso = '';
    if (yo) {
      try { MailApp.sendEmail({ to: yo, subject: 'Promociones para el site · ' + grupo + ' · ' + puntos + ' pts', body: skus.length + ' SKU premium de ' + grupo + ' con ' + puntos + ' puntos.', attachments: [blob] }); aviso = ' Enviado a ' + yo + '.'; }
      catch (e) { aviso = ' (No se pudo mandar el correo: ' + e.message + ')'; }
    }
    logOk_('PROMOS_ARCHIVO', nombre + ' · ' + skus.length + ' SKU · ' + puntos + ' pts · ' + cat + aviso);
    flushLog_();
    return '✅ ' + skus.length + ' SKU de ' + grupo + ' · ' + puntos + ' pts.' + aviso + '<br><a href="' + url + '" target="_blank">Abrir en Drive</a>';
  } finally {
    try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch (e) {}
  }
}
