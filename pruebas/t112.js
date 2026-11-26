// t112: el bot corre las opciones del menu (26-nov-2026): Bot.gs contra onOpen (Setup.gs) + ejecucion sin ventanas con Sheet simulado.
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };
const GS = path.join(__dirname, '..', 'apps-script');
const leer = f => fs.readFileSync(path.join(GS, f), 'utf8');

/* ---------- 1. La lista del bot es EXACTAMENTE el menu de onOpen ---------- */
function menuDeOnOpen() {
  const on = leer('Setup.gs'), i = on.indexOf('function onOpen'), j = on.indexOf('.addToUi()', i), m = on.slice(i, j);
  const toks = []; let k = 0;
  while (k < m.length) {
    const c = m[k];
    if (c === "'" || c === '"') { const q = c; k++; let s = ''; while (m[k] !== q) { if (m[k] === '\\') k++; s += m[k]; k++; } toks.push(['S', s]); k++; continue; }
    if (c === '(' || c === ')') toks.push([c, c]);
    else {
      const mm = /^\.?(createMenu|addSubMenu|addItem|addSeparator)/.exec(m.slice(k));
      if (mm && (k === 0 || !/[A-Za-z0-9_]/.test(m[k - 1]))) { toks.push(['K', mm[1]]); k += mm[0].length; continue; }
    }
    k++;
  }
  let depth = 0, stack = [], items = [];
  for (let n = 0; n < toks.length; n++) {
    const [ty, v] = toks[n];
    if (ty === '(') depth++;
    else if (ty === ')') { depth--; while (stack.length && depth < stack[stack.length - 1][1]) stack.pop(); }
    else if (ty === 'K') {
      if (v === 'addSubMenu') { let u = n + 1; while (!(toks[u][0] === 'K' && toks[u][1] === 'createMenu')) u++; depth++; stack.push([toks[u + 2][1], depth]); n = u + 3; }
      else if (v === 'addItem') items.push([stack.map(s => s[0]).join(' › '), toks[n + 2][1], toks[n + 3][1]]);
    }
  }
  return items;
}
const real = menuDeOnOpen();
t(real.length >= 100, 'se leyo el menu real de onOpen: ' + real.length);

const ctx = {
  console, JSON, Date, Math, Object, Array, String, Number, RegExp, isNaN, Error, Proxy,
  _props: {}, _triggers: [], _logs: [], _uid: 0,
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in ctx._props ? ctx._props[k] : null), setProperty: (k, v) => { ctx._props[k] = String(v); },
    deleteProperty: k => { delete ctx._props[k]; }, getProperties: () => Object.assign({}, ctx._props) }) },
  ScriptApp: { newTrigger: h => ({ timeBased: () => ({ after: () => ({ create: () => { ctx._triggers.push({ h, getHandlerFunction: () => h }); } }) }) }),
               getProjectTriggers: () => ctx._triggers.slice(), deleteTrigger: tr => { ctx._triggers = ctx._triggers.filter(x => x !== tr); } },
  Utilities: { getUuid: () => 'aaaaaaaa-0000-4000-8000-' + String(++ctx._uid).padStart(12, '0') },
  logInfo_: (e, m) => ctx._logs.push(['INFO', m]), logOk_: (e, m) => ctx._logs.push(['OK', m]), logWarn_: (e, m) => ctx._logs.push(['WARN', m]), logErr_: (e, m) => ctx._logs.push(['ERR', m]), flushLog_: () => {},
  SpreadsheetApp: { getUi: () => { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); }, getActive: () => ({ getName: () => 'Site Sheet de prueba' }) },
  _clave: 'CLAVE-DE-PRUEBA',
};
vm.createContext(ctx);
// Piezas del proyecto que Bot.gs usa: aqui simuladas (la clave real nunca esta en el repo).
vm.runInContext(`
  function csAutorizar_(p) { return String(p.clave || '') === _clave ? null : { ok: false, error: 'no_autorizado' }; }
  function dlgLog_(tipo, titulo, texto) { _logs.push(['POPUP', titulo + ': ' + texto]); }
  function dlgInfo_(titulo, texto, tipo) { dlgLog_(tipo, titulo, texto); SpreadsheetApp.getUi().showModalDialog(null, titulo); }
  function alertLog_(ui, a, b, c) { return ui.alert(a, b, c); }
  function dlgEnvio_(cfg) { SpreadsheetApp.getUi().showModalDialog(null, 'envio'); }
  function dlgOpciones_(cfg) { SpreadsheetApp.getUi().showModalDialog(null, 'op'); }
`, ctx);
vm.runInContext(leer('Bot.gs'), ctx);
const R = c => vm.runInContext(c, ctx);
const MENU = R('BOT_MENU');

t(MENU.length === real.length, 'BOT_MENU tiene las mismas opciones que onOpen: ' + MENU.length + ' vs ' + real.length);
let difiere = 0; real.forEach((r, i) => { const b = MENU[i]; if (!b || b.sec !== r[0] || b.etiqueta !== r[1] || b.fn !== r[2]) { difiere++; if (difiere < 4) console.log('  distinto en', i, JSON.stringify(r), JSON.stringify(b)); } });
t(difiere === 0, 'misma seccion, etiqueta, funcion y orden en las ' + real.length + ' filas (distintas: ' + difiere + ')');
const todo = fs.readdirSync(GS).filter(f => f.endsWith('.gs')).map(leer).join('\n');
const sinFn = MENU.filter(f => !new RegExp('function\\s+' + f.fn + '\\s*\\(').test(todo));
t(sinFn.length === 0, 'cada funcion del menu existe en el codigo: ' + sinFn.map(f => f.fn).join(','));
t(new Set(MENU.map(f => f.fn)).size === MENU.length, 'sin funciones repetidas');
t(MENU.every(f => ['ok', 'confirmar', 'sheet'].indexOf(f.modo) >= 0), 'modos validos');
t(MENU.filter(f => f.modo === 'sheet').every(f => f.motivo && f.motivo.length > 10), 'toda opcion que no corre desde el bot dice por que');
const SECRETAS = ['uiSetToken', 'uiSetLogin', 'uiSetCookie', 'uiClaveExtension', 'uiOdooLogin', 'uiOdooLoginBorrar', 'uiSetPassword', 'uiBorrarTodo', 'cancelacionesGuardarPin', 'uiConectarOdoo', 'wmDashboardConectar'];
t(SECRETAS.every(fn => MENU.find(f => f.fn === fn).modo === 'sheet'), 'las que tocan credenciales NO corren desde el bot');
const ENVIOS = ['solicitudKillersEnviar', 'nuevosKillersEnviar', 'soloNuevosKillersEnviar', 'kcEnviar', 'wfsTrasladoOdoo', 'recMenuOtraFecha'];
t(ENVIOS.every(fn => MENU.find(f => f.fn === fn).modo === 'sheet'), 'los envios con ventana de PRUEBA se quedan en el Sheet');
t(['cancelacionesSobreventaMarcadas', 'instalarTriggers', 'recMenuEnviarAhora', 'uiForzar'].every(fn => MENU.find(f => f.fn === fn).modo === 'confirmar'), 'lo que cancela, envia o toca activadores pide confirmar');
t(['saludMenu', 'revisarSobreventa', 'uiProbar', 'kdBajar'].every(fn => MENU.find(f => f.fn === fn).modo === 'ok'), 'lecturas y calculos corren directo');
// la guia del menu (ORG_GUIA_MENU) habla de las mismas opciones: cada etiqueta del menu aparece en Organizar.gs
const guia = leer('Organizar.gs');
const sinGuia = MENU.filter(f => guia.indexOf(f.etiqueta.replace(/^[^A-Za-z0-9¿¡]+/, '').slice(0, 14)) < 0);
t(sinGuia.length <= 6, 'la guia del menu menciona (casi) todas las opciones; sin mencion: ' + sinGuia.map(f => f.etiqueta).join(' | '));

/* ---------- 2. Puerta: clave, lista blanca, confirmar ---------- */
const A = (o) => { const r = vm.runInContext('botAtender_(' + JSON.stringify(Object.assign({ clave: ctx._clave }, o)) + ')', ctx); return r; };
t(vm.runInContext('botAtender_({accion:"bot_menu"})', ctx).error === 'no_autorizado', 'sin clave: no autorizado');
t(vm.runInContext('botAtender_({accion:"bot_menu",clave:"x"})', ctx).error === 'no_autorizado', 'clave mala: no autorizado');
let r = A({ accion: 'bot_menu' });
t(r.ok && r.total === MENU.length && r.menu[0].n === 1 && /^SITE SHEET › /.test(r.menu[0].ruta), 'bot_menu devuelve la lista con ruta');
t(A({ accion: 'bot_ejecutar', fn: 'eval' }).error === 'no_esta_en_el_menu', 'una funcion fuera del menu no corre');
t(A({ accion: 'bot_ejecutar', fn: 'csAutorizar_' }).error === 'no_esta_en_el_menu', 'ni una interna del proyecto');
r = A({ accion: 'bot_ejecutar', fn: 'solicitudKillersEnviar', confirmado: true });
t(r.error === 'solo_desde_el_sheet' && /Envíos a KAMs/.test(r.ruta), 'envio a KAMs: solo desde el Sheet, aun con confirmado');
r = A({ accion: 'bot_ejecutar', fn: 'uiSetToken', confirmado: true });
t(r.error === 'solo_desde_el_sheet', 'credenciales: solo desde el Sheet, aun con confirmado');
r = A({ accion: 'bot_ejecutar', fn: 'instalarTriggers' });
t(r.error === 'falta_confirmar' && ctx._triggers.length === 0, 'confirmar: sin confirmar no programa nada');
t(A({ accion: 'bot_ejecutar', fn: 'instalarTriggers', confirmado: 'true' }).error === 'falta_confirmar', 'confirmado debe ser true de verdad, no texto');
t(A({ accion: 'bot_foo' }).error === 'accion_bot_desconocida', 'accion desconocida');

/* ---------- 3. Ejecucion sin ventanas ---------- */
function correr(fn, extra, codigoFn) {
  if (codigoFn) vm.runInContext(codigoFn, ctx);
  const e = A(Object.assign({ accion: 'bot_ejecutar', fn }, extra || {}));
  if (!e.ok) return { e };
  t(ctx._triggers.length === 1 && ctx._triggers[0].h === 'botTrabajo_', 'programa UN activador de una sola vez (' + fn + ')');
  vm.runInContext('botTrabajo_()', ctx);
  t(ctx._triggers.length === 0, 'el activador se borra solo (' + fn + ')');
  return { e, s: A({ accion: 'bot_estado', job: e.job }).job };
}
let x = correr('saludMenu', {}, 'function saludMenu(){ dlgInfo_("🩺 Salud del Sheet", "Todo corre a su hora", "ok"); return "listo"; }');
t(x.s.estado === 'ok' && /Todo corre a su hora/.test(x.s.salida) && x.s.retorno === 'listo', 'dlgInfo_ sin ventana: texto como resultado: ' + JSON.stringify(x.s));
t(x.s.ventanas === 'simuladas', 'dice que las ventanas se simularon');
t(ctx._logs.some(l => l[0] === 'POPUP' && /Salud/.test(l[1])), 'el aviso tambien queda en el Log (POPUP)');
t(ctx._logs.some(l => l[0] === 'INFO' && /El bot pidió: .*saludMenu/.test(l[1])) && ctx._logs.some(l => l[0] === 'OK' && /Bot terminó/.test(l[1])), 'el Log dice que pidio el bot y como termino');
let falla = false; try { R('SpreadsheetApp.getUi()'); } catch (e) { falla = true; }
t(falla, 'despues de correr, SpreadsheetApp.getUi vuelve a ser el original');
t(R('dlgInfo_.toString()').indexOf('showModalDialog') > 0, 'y dlgInfo_ vuelve a ser el del proyecto');

x = correr('uiProbar', {}, 'function uiProbar(){ var ui = SpreadsheetApp.getUi(); ui.alert("Conexión", "El site responde.", ui.ButtonSet.OK); return { resumen: "ok 200" }; }');
t(x.s.estado === 'ok' && /El site responde/.test(x.s.salida) && x.s.retorno === 'ok 200', 'ui.alert directo y retorno en objeto');

x = correr('uiSetCorreoAvisos', { confirmado: true, entrada: ['avisos@ejemplo.com'] },
  'function uiSetCorreoAvisos(){ var ui = SpreadsheetApp.getUi(); var r = ui.prompt("Correo de avisos", "Escribe el correo", ui.ButtonSet.OK_CANCEL); if (r.getSelectedButton() !== ui.Button.OK) return "cancelado"; return "guardado " + r.getResponseText(); }');
t(x.s.estado === 'ok' && x.s.retorno === 'guardado avisos@ejemplo.com', 'un dato pedido se contesta con "entrada": ' + JSON.stringify(x.s));
t(!JSON.stringify(x.s).includes('avisos@ejemplo.com') || x.s.retorno.includes('avisos@ejemplo.com'), 'la entrada no se devuelve en el estado salvo como parte del resultado');
x = correr('uiSetCorreoAvisos', { confirmado: true });
t(x.s.estado === 'necesita' && x.s.retorno === 'cancelado' && /dato: Correo de avisos/.test(x.s.necesita[0]), 'sin dato: no inventa, cancela y dice que dato falta');

x = correr('uiSetRutaPrecios', { confirmado: true, entrada: ['/precios/api'] },
  'function uiSetRutaPrecios(){ var ui = SpreadsheetApp.getUi(); var r = ui.prompt("Ruta", "Pega el token de acceso", ui.ButtonSet.OK_CANCEL); return r.getSelectedButton() === ui.Button.OK ? "guardado" : "cancelado"; }');
t(x.s.estado === 'necesita' && /sensible/.test(x.s.necesita[0]) && x.s.retorno === 'cancelado', 'un prompt de token/clave se rechaza aunque venga entrada');

x = correr('limpiarHojasViejas', { confirmado: true }, 'function limpiarHojasViejas(){ var ui = SpreadsheetApp.getUi(); var r = ui.alert("Quitar hojas viejas", "¿Borrar los respaldos?", ui.ButtonSet.YES_NO); return r === ui.Button.YES ? "borradas" : "sin cambios"; }');
t(x.s.estado === 'ok' && x.s.retorno === 'borradas', 'pregunta Si/No de una opcion confirmada: contesta que si');
x = correr('uiLimpiarLog', { confirmado: true }, 'function uiLimpiarLog(){ var ui = SpreadsheetApp.getUi(); var r = ui.alert("Limpiar Log", "¿Seguro?", ui.ButtonSet.YES_NO); return r === ui.Button.YES ? "limpio" : "sin cambios"; }');
t(x.s.retorno === 'limpio', 'otra confirmada');
x = correr('kcActualizar', {}, 'function kcActualizar(){ var ui = SpreadsheetApp.getUi(); var r = ui.alert("Correo", "¿Reemplazar la hoja?", ui.ButtonSet.YES_NO); return r === ui.Button.YES ? "reemplazada" : "sin cambios"; }');
t(x.s.estado === 'necesita' && x.s.retorno === 'sin cambios' && /pregunta/.test(x.s.necesita[0]), 'pregunta Si/No en una opcion NO confirmada: contesta NO y lo dice');

x = correr('wfsAutorizaHuerfanas', { confirmado: true });   // es modo sheet
t(x.e.error === 'solo_desde_el_sheet', 'una con ventana de opciones esta marcada para el Sheet');
x = correr('compararBandas', {}, 'function compararBandas(){ dlgEnvio_({titulo:"Envio"}); return "x"; }');
t(x.s.estado === 'necesita' && /ventana de envío/.test(x.s.necesita[0]), 'si una opcion abre un formulario de envio: no se contesta sola');

x = correr('revisarColumnas', {}, 'function revisarColumnas(){ throw new Error("Falta la columna SKU en Walmart\\nmas detalle"); }');
t(x.s.estado === 'error' && x.s.error === 'Falta la columna SKU en Walmart', 'un error de la funcion se reporta (primera linea)');
t(ctx._logs.some(l => l[0] === 'ERR' && /Bot falló/.test(l[1])), 'y queda en el Log como ERROR');

/* ---------- 4. Un trabajo a la vez, diagnostico, limpieza ---------- */
t(A({ accion: 'bot_ejecutar', fn: 'uiEstado' }).error === 'la_funcion_no_existe', 'si la funcion no existe en el proyecto se rechaza al pedirla');
vm.runInContext('function uiEstado(){ throw new Error("sin conexion"); } function uiConsumo(){ return "ok"; }', ctx);
const e1 = A({ accion: 'bot_ejecutar', fn: 'uiEstado' });
t(e1.ok, 'se encola uiEstado' + JSON.stringify(e1));
t(A({ accion: 'bot_ejecutar', fn: 'uiConsumo' }).error === 'ocupado', 'si hay uno en cola, el siguiente espera (ocupado)');
vm.runInContext('botTrabajo_()', ctx);
t(A({ accion: 'bot_estado', job: e1.job }).job.estado === 'error', 'uiEstado que truena: queda como error');
x = (() => { const e = A({ accion: 'bot_diagnostico' }); vm.runInContext('botTrabajo_()', ctx); return A({ accion: 'bot_estado', job: e.job }).job; })();
t(x.estado === 'ok' && /ventanas simuladas/.test(x.retorno) && /Site Sheet de prueba/.test(x.retorno), 'diagnostico: ventanas simuladas y hoja activa: ' + JSON.stringify(x));
for (let i = 0; i < 25; i++) { const e = A({ accion: 'bot_diagnostico' }); if (e.ok) vm.runInContext('botTrabajo_()', ctx); }
t(Object.keys(ctx._props).filter(k => k.indexOf('BOT_JOB_') === 0).length <= 20, 'solo se guardan los ultimos 20 trabajos');
t(A({ accion: 'bot_estado', job: 'zzzzzzzz' }).error === 'no_existe', 'estado de un trabajo que no existe');
// resultado enorme: se recorta para caber en una propiedad
x = correr('uiPrecios', {}, 'function uiPrecios(){ var ui = SpreadsheetApp.getUi(); for (var i=0;i<40;i++) ui.alert("Aviso " + i, new Array(400).join("x"), ui.ButtonSet.OK); return "fin"; }');
t(x.s && x.s.estado === 'ok' && JSON.stringify(ctx._props['BOT_JOB_' + x.e.job]).length < 9500, 'un resultado enorme se recorta para caber (<9 KB)');

console.log('t112: ' + ok + ' ok' + (bad ? ', ' + bad + ' FALLAN' : ''));
process.exit(bad ? 1 : 0);
