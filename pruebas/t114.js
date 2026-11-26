// t114: extension 1.11.0 - popup ancho con dos pestañas (Panel y Configuracion dentro del popup), descargas desde GitHub, botones de a 2, un solo boton de mensaje
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'extension-cookie');
let ok = 0, mal = 0;
function t(c, m) { if (c) ok++; else { mal++; console.log('FALLA ' + m); } }
const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
t(man.version === '1.11.0', 'manifest 1.11.0');
t(JSON.stringify(man.permissions) === JSON.stringify(['cookies', 'storage', 'alarms', 'idle', 'tabs', 'scripting']), 'sin permisos nuevos');
t(!man.permissions.includes('downloads') && man.host_permissions.length === 7, 'sin downloads ni hosts nuevos (la descarga usa fetch+blob)');
t(!('options_page' in man) && !fs.existsSync(path.join(dir, 'options.html')) && !fs.existsSync(path.join(dir, 'options.js')), 'ya no hay pagina de opciones aparte');
const pop = fs.readFileSync(path.join(dir, 'popup.html'), 'utf8');
const pjs = fs.readFileSync(path.join(dir, 'popup.js'), 'utf8');
const js = fs.readFileSync(path.join(dir, 'config.js'), 'utf8');
// popup ancho y solo dos pestañas
t(/body\{width:760px;height:560px/.test(pop), 'popup ancho 760x560 (limite de Chrome 800x600)');
t((pop.match(/data-tab="/g) || []).length === 2 && /data-tab="panel"/.test(pop) && /data-tab="config"/.test(pop), 'dos pestañas: Panel y Configuracion');
t(/id="panel"/.test(pop) && /id="config"/.test(pop) && !/id="mensajes"|id="operaciones"|id="resumen"/.test(pop), 'una sola pantalla Panel y una Configuracion');
t(!/openOptionsPage/.test(pjs) && !/id="o"/.test(pop), 'nada abre otra pestaña para la configuracion');
t(/<script src="popup\.js"><\/script>\s*<script src="config\.js"><\/script>/.test(pop), 'popup carga popup.js y config.js');
// botones: maximo 2 por fila
t(!/repeat\([3-9],/.test(pop) && !/grid-template-columns:1fr 1fr 1fr/.test(pop), 'popup: nunca mas de 2 columnas de botones');
t(/\.btns\{display:grid;grid-template-columns:1fr 1fr/.test(pop), 'popup: botones en 2 columnas');
t(['sp', 'sk', 'st', 'sx', 'g', 'gr', 'c', 'b', 's'].every(i => new RegExp('id="' + i + '"').test(pop)), 'popup: todos los botones de operaciones siguen');
t(!/opcategory/.test(pop) && !/abrirOperacion/.test(pjs), 'popup: sin selector de categorias (todo visible a la vez)');
// mensaje: un solo boton
t(/id="rcp"[^>]*>Copiar mensaje de hoy</.test(pop) && !/id="rac"/.test(pop) && !/<textarea id="rect"[^>]*placeholder/.test(pop), 'un solo boton: Copiar mensaje de hoy');
t(/tipo: 'rec_mensaje'/.test(pjs) && /clipboard\.writeText/.test(pjs) && /execCommand\('copy'\)/.test(pjs), 'el boton trae del Sheet y copia (con respaldo)');
// config
t(['url', 'clave', 'pc', 'gcon', 'ga', 'gm', 'gg', 'ordl', 'og', 'dver', 'dz', 'db', 'da', 'dmsg'].every(i => new RegExp('id="' + i + '"').test(pop)), 'configuracion: todos los campos y botones');
const ids = [...pop.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
t(ids.length === new Set(ids).size, 'ids unicos en popup.html (config y panel no chocan): ' + ids.filter((x, i) => ids.indexOf(x) !== i).join(','));
t(/5-SUBIR-TODO y 5-AUTO son solo de la FORCEV/.test(pop), 'aclara lo exclusivo de FORCEV');
t(/^\(\(\) => \{/.test(js.trim()) && /window\.configAlAbrir/.test(js), 'config.js va en su propio ambito y se abre perezoso');
t(js.includes("raw.githubusercontent.com/v-w04/Site-Sheet/main/"), 'origen: GitHub main');
t(js.includes("'extension-cookie-' + versionRemota + '.zip'") && js.includes("bajarBat('5-DELL.bat'") && js.includes("bajarBat('7-AUTOENCENDIDO.bat'"), 'baja zip por version, 5-DELL.bat y 7-AUTOENCENDIDO.bat');
t(js.includes("replace(/\\r?\\n/g, '\\r\\n')"), 'los .bat salen con CRLF');
t(!/innerHTML/.test(js) && !/innerHTML/.test(pjs), 'sin innerHTML');
const ctx = {}; vm.createContext(ctx);
const m1 = js.match(/function numsDe[\s\S]*?function esMayor[^\n]*\n/);
t(!!m1, 'funciones de version presentes');
vm.runInContext(m1[0] + ';this.esMayor=esMayor', ctx);
t(ctx.esMayor('1.11.0', '1.10.9') && !ctx.esMayor('1.10.9', '1.11.0') && !ctx.esMayor('1.11.0', '1.11.0'), '1.11.0 > 1.10.9');
t(ctx.esMayor('1.10.10', '1.10.9') && ctx.esMayor('2.0.0', '1.99.99'), 'compara numeros, no texto');
// 7-AUTOENCENDIDO.bat
const ae = fs.readFileSync(path.join(__dirname, '..', '7-AUTOENCENDIDO.bat'), 'utf8');
t(/\r\n/.test(ae) && !/[^\x00-\x7f]/.test(ae), '7-AUTOENCENDIDO.bat: CRLF y solo ASCII');
t(ae.includes('powercfg /change standby-timeout-ac 0') && ae.includes('hibernate-timeout-ac 0') && ae.includes('LIDACTION 0'), '7: energia sin suspender');
t(ae.includes('Startup') && ae.includes('--restore-last-session'), '7: Chrome en Inicio');
t(/BIOS/.test(ae) && /netplwiz/.test(ae), '7: avisa lo que va a mano (BIOS y netplwiz)');
{ const et = [...ae.matchAll(/^:([A-Za-z0-9_]+)/gm)].map(m => m[1].toLowerCase()); const us = [...ae.matchAll(/\b(?:goto|call)\s+:?([A-Za-z0-9_]+)/gi)].map(m => m[1].toLowerCase()).filter(x => x !== 'eof' && x !== 'set'); t(us.every(x => et.includes(x)), '7: todas las etiquetas existen'); }
for (const f of ['popup.js', 'config.js', 'background.js', 'autoguias.js', 'cajas.js']) { try { new vm.Script(fs.readFileSync(path.join(dir, f), 'utf8')); t(true); } catch (e) { t(false, f + ' sintaxis ' + e.message); } }
console.log('t114: ' + ok + ' ok' + (mal ? ', ' + mal + ' FALLAN' : ''));
process.exit(mal ? 1 : 0);
