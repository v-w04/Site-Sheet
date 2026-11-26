// t114: extension 1.10.8 - descargas desde GitHub en Opciones y botones compactos (max 2 por fila)
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'extension-cookie');
let ok = 0, mal = 0;
function t(c, m) { if (c) ok++; else { mal++; console.log('FALLA ' + m); } }
const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
t(man.version === '1.10.8', 'manifest 1.10.8');
t(JSON.stringify(man.permissions) === JSON.stringify(['cookies', 'storage', 'alarms', 'idle', 'tabs', 'scripting']), 'sin permisos nuevos');
t(!man.permissions.includes('downloads') && man.host_permissions.length === 7, 'sin downloads ni hosts nuevos (la descarga usa fetch+blob)');
const html = fs.readFileSync(path.join(dir, 'options.html'), 'utf8');
t(/id="dz"/.test(html) && /id="db"/.test(html) && /id="dver"/.test(html) && /id="dmsg"/.test(html), 'opciones: botones dz/db y avisos');
t(/5-SUBIR-TODO\.bat y 5-AUTO\.bat son solo de la FORCEV/.test(html), 'opciones: aclara lo exclusivo de FORCEV');
const js = fs.readFileSync(path.join(dir, 'options.js'), 'utf8');
t(js.includes("raw.githubusercontent.com/v-w04/Site-Sheet/main/"), 'origen: GitHub main');
t(js.includes("'extension-cookie-' + versionRemota + '.zip'") && js.includes("traer('5-DELL.bat')"), 'baja zip por version y 5-DELL.bat');
t(js.includes("replace(/\\r?\\n/g, '\\r\\n')"), '5-DELL.bat sale con CRLF');
t(!/innerHTML/.test(js), 'sin innerHTML');
// comparacion de versiones
const ctx = {}; vm.createContext(ctx);
const m1 = js.match(/function numsDe[\s\S]*?function esMayor[^\n]*\n/);
t(!!m1, 'funciones de version presentes');
vm.runInContext(m1[0] + ';this.esMayor=esMayor', ctx);
t(ctx.esMayor('1.10.8', '1.10.7') && !ctx.esMayor('1.10.7', '1.10.8') && !ctx.esMayor('1.10.8', '1.10.8'), '1.10.8 > 1.10.7');
t(ctx.esMayor('1.10.10', '1.10.9') && ctx.esMayor('1.11.0', '1.10.99') && ctx.esMayor('2.0.0', '1.99.99'), 'compara numeros, no texto');
// popup compacto
const pop = fs.readFileSync(path.join(dir, 'popup.html'), 'utf8');
t(/\.opbuttons\.four\{grid-template-columns:1fr 1fr\}/.test(pop), 'popup: Precios/Killers/Ambos/Prueba en 2 columnas');
t(!/repeat\(4,1fr\)/.test(pop), 'popup: nada en 4 columnas');
t(/min-height:40px/.test(pop) && !/min-height:70px/.test(pop), 'popup: tarjetas de categoria compactas');
t((pop.match(/class="opcategory/g) || []).length === 4, 'popup: 4 categorias');
// las 4 pantallas del popup siguen
['resumen', 'operaciones', 'mensajes'].forEach(id => t(pop.includes('id="' + id + '"'), 'popup: vista ' + id));
// sintaxis
try { new vm.Script(js); t(true); } catch (e) { t(false, 'options.js sintaxis ' + e.message); }
console.log('t114: ' + ok + ' ok' + (mal ? ', ' + mal + ' FALLAN' : ''));
process.exit(mal ? 1 : 0);
