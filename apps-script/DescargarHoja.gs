/**
 *  DescargarHoja.gs — Baja cualquier hoja de este libro como Excel (.xlsx), sin pedirselo a nadie.
 *
 *  Menu: SITE SHEET > ⬇️ Descargar una hoja como Excel
 *  Ventana con la lista de hojas -> boton "Descargar" -> link de descarga (y copia en la carpeta de Drive
 *  "Descargas Site Sheet", y queda en el Log). Solo exporta la hoja elegida (con formato y formulas como valores
 *  que muestra el Sheet, tal como el export oficial de Google).
 */
var DH_CARPETA = 'Descargas Site Sheet';

function descargarHoja() {
  var ss = SpreadsheetApp.getActive();
  var nombres = ss.getSheets().map(function (s) { return s.getName(); });
  var opciones = nombres.map(function (n) {
    return '<option value="' + dhEsc_(n) + '">' + dhEsc_(n) + '</option>';
  }).join('');
  var html = HtmlService.createHtmlOutput(
    '<style>body{font-family:Arial,sans-serif;margin:16px;color:#222}select{width:100%;padding:8px;font-size:14px;margin:8px 0}' +
    'button{background:#0071DC;color:#fff;border:0;padding:10px 18px;font-size:14px;border-radius:6px;cursor:pointer}' +
    'button:disabled{opacity:.5}#r{margin-top:14px;font-size:14px}a{color:#0071DC;font-weight:bold}</style>' +
    '<b>Elige la hoja a descargar</b><br><select id="h">' + opciones + '</select>' +
    '<button id="b" onclick="ir()">⬇️ Descargar Excel</button><div id="r"></div>' +
    '<script>function ir(){var b=document.getElementById("b"),r=document.getElementById("r");b.disabled=true;r.textContent="Preparando…";' +
    'google.script.run.withSuccessHandler(function(x){b.disabled=false;r.innerHTML=x.ok?("✅ <a href=\\""+x.url+"\\" target=\\"_blank\\">Descargar "+x.nombre+"</a><br>"+x.detalle):("❌ "+x.error)})' +
    '.withFailureHandler(function(e){b.disabled=false;r.textContent="❌ "+e.message}).descargarHojaGenerar(document.getElementById("h").value)}</script>'
  ).setWidth(460).setHeight(230);
  SpreadsheetApp.getUi().showModalDialog(html, '⬇️ Descargar una hoja como Excel');
}

/** La llama la ventana. Valida que la hoja exista (no confia en lo que mande la ventana). */
function descargarHojaGenerar(nombreHoja) {
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(String(nombreHoja || ''));
    if (!sh) return { ok: false, error: 'No existe esa hoja.' };
    var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx&gid=' + sh.getSheetId();
    var cod = 0, resp = null;
    for (var i = 0; i <= 3; i++) {
      if (i) Utilities.sleep(2000 * Math.pow(2, i - 1));
      resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      cod = resp.getResponseCode();
      if (cod === 200) break;
      if (cod !== 429 && cod < 500) break;
    }
    if (cod !== 200) throw new Error('Google no dejo exportar (HTTP ' + cod + '). Vuelve a intentar.');
    var fecha = Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd_HHmm');
    var nombre = String(nombreHoja).replace(/[\\\/:*?"<>|]/g, '-') + '_' + fecha + '.xlsx';
    var blob = resp.getBlob().setName(nombre);
    var it = DriveApp.getFoldersByName(DH_CARPETA);
    var carpeta = it.hasNext() ? it.next() : DriveApp.createFolder(DH_CARPETA);
    var f = carpeta.createFile(blob);
    logOk_('DESCARGA', 'Hoja "' + nombreHoja + '" exportada a Excel: ' + nombre + ' (' + Math.round(blob.getBytes().length / 1024) + ' KB)');
    flushLog_();
    return { ok: true, url: f.getDownloadUrl(), nombre: nombre, detalle: 'Copia en Drive > ' + DH_CARPETA };
  } catch (e) {
    logErr_('DESCARGA', 'No se pudo exportar "' + nombreHoja + '": ' + e.message);
    flushLog_();
    return { ok: false, error: e.message };
  }
}

function dhEsc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
