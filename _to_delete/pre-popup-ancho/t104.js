// t104: ORDEN ELEGIDO desde la extension (25-nov-2026): ext_orden_ver / ext_orden_guardar y su efecto en el turno. Reloj y hoja simulados.
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };
let reloj = Date.UTC(2026, 10, 25, 15, 0, 0);
const ctx = { console, JSON, Date: { now: () => reloj }, Object, Array, String, Number, Math, isNaN, RegExp }; vm.createContext(ctx);
const props = {}; ctx.props_ = () => ({ getProperty: k => k in props ? props[k] : null, setProperty: (k, v) => { props[k] = String(v); } });
const logs = []; ['Info', 'Ok', 'Warn', 'Err'].forEach(k => ctx['log' + k + '_'] = (e, m) => logs.push([k, m])); ctx.flushLog_ = () => {}; ctx.EXT_ETAPA = 'EXTENSION';
ctx.extTexto_ = (x, n) => String(x == null ? '' : x).replace(/[\r\n]+/g, ' ').slice(0, n || 120);
ctx.csAutorizar_ = (p) => p && p.clave === 'k' ? null : { ok: false, error: 'sesion_invalida' };
ctx.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/ExtTurno.gs', 'utf8'), ctx);
const DELL = ['dddddddd01', 'DELL SERVIDOR'], FV = ['ffffffff02', 'FORCEV'], FC = ['cccccccc03', 'FCORSAIR'], LAP = ['llllllll04', 'Laptop casa'];
const T = (pc) => ctx.extTurno_({ clave: 'k', id: pc[0], nombre: pc[1] });
const turno = () => JSON.parse(props.EXT_TURNO_V1 || 'null');
const corre = (n, pcs) => { for (let i = 0; i < n; i++) { reloj += 60000; pcs.forEach(T); } const x = turno(); return x && x.id ? x.nombre : ''; };
const dice = (re) => logs.some(l => re.test(l[1]));

// 0) rango con y sin lista elegida
const rg = ctx.extTurnoRango_;
t(rg('FORCEV') === 1 && rg('FORCEV', 'x', null) === 1 && rg('FORCEV', 'x', []) === 1, 'sin lista elegida manda el nombre');
t(rg('FORCEV', 'a', ['a', 'b']) === 0 && rg('DELL', 'b', ['a', 'b']) === 1, 'con lista elegida manda la lista');
t(rg('DELL', 'z', ['a', 'b']) === 10 && rg('FCORSAIR', 'z', ['a']) === 12 && rg('Laptop', 'z', ['a']) === 109, 'las que no estan en la lista van despues, con el orden por nombre entre ellas');

// 1) ver: ordena por defecto (Dell, FORCEV, FCORSAIR) y marca quien trabaja
corre(5, [FC, FV, DELL, LAP]);
let r = ctx.extOrdenVer_({ clave: 'k' });
t(r.ok && r.pcs.map(x => x.nombre).join() === 'DELL SERVIDOR,FORCEV,FCORSAIR,Laptop casa', 'ver: orden por nombre: ' + r.pcs.map(x => x.nombre));
t(r.pcs[0].turno === true && r.pcs.filter(x => x.turno).length === 1 && r.quien === 'DELL SERVIDOR' && !r.elegido, 'ver: Dell tiene el turno y no hay orden elegido');
t(r.pcs.every(x => x.activa), 'ver: las 4 prendidas');
t(ctx.extOrdenVer_({ clave: 'mala' }).error === 'sesion_invalida', 'ver: sin clave no entrega nada');

// 2) guardar: FORCEV primero, luego Dell; Dell cede en su siguiente vuelta (sin dos a la vez)
r = ctx.extOrdenGuardar_({ clave: 'k', orden: [FV[0], DELL[0], 'noexiste99', FV[0], FC[0]] });
t(r.ok && r.elegido && r.pcs.map(x => x.nombre).join() === 'FORCEV,DELL SERVIDOR,FCORSAIR,Laptop casa', 'guardar: ids repetidos o desconocidos se ignoran: ' + r.pcs.map(x => x.nombre));
t(JSON.parse(props.EXT_ORDEN_V1).join() === [FV[0], DELL[0], FC[0]].join(), 'guarda solo ids vistos, sin repetir');
t(dice(/Orden de las computadoras cambiado desde la extension: FORCEV > DELL SERVIDOR > FCORSAIR/), 'queda en el Log');
let simultaneos = 0;
for (let i = 0; i < 8; i++) { reloj += 60000; const l = [FC, FV, DELL, LAP].map(T).filter(x => x.lider).length; if (l > 1) simultaneos++; }
t(simultaneos === 0 && turno().nombre === 'FORCEV', 'tras guardar, el turno pasa a FORCEV sin que trabajen dos a la vez');
t(corre(10, [FC, FV, DELL, LAP]) === 'FORCEV', 'y se queda FORCEV aunque Dell este prendida');

// 3) FORCEV se apaga: toma Dell (segunda de su lista), no FCORSAIR
t(corre(20, [FC, DELL, LAP]) === 'DELL SERVIDOR', 'sin FORCEV trabaja Dell (siguiente en su lista)');
// 4) FORCEV regresa: le toca primero, Dell cede
t(corre(8, [FC, FV, DELL, LAP]) === 'FORCEV', 'FORCEV regresa y recupera el turno por su lugar');

// 5) una PC nueva que no esta en su lista va despues de las elegidas
const NUEVA = ['nnnnnnnn05', 'DELL-OFICINA'];
corre(3, [FV, NUEVA]);
r = ctx.extOrdenVer_({ clave: 'k' });
t(r.pcs.map(x => x.nombre).slice(0, 3).join() === 'FORCEV,DELL SERVIDOR,FCORSAIR' && r.pcs[r.pcs.length - 1].nombre.length > 0 && r.pcs.find(x => x.id === NUEVA[0]).elegido === false, 'una computadora nueva queda despues de las que ella ordeno');
t(turno().nombre === 'FORCEV', 'la nueva no le quita el turno a nadie');

// 6) guardar vacio / invalido
t(ctx.extOrdenGuardar_({ clave: 'k', orden: [] }).error === 'orden_vacio' && ctx.extOrdenGuardar_({ clave: 'k', orden: ['zzzzzzzz'] }).error === 'orden_vacio', 'orden vacio o de ids desconocidos se rechaza y no cambia nada');
t(ctx.extOrdenGuardar_({ clave: 'mala', orden: [DELL[0]] }).error === 'sesion_invalida', 'guardar exige la clave');
t(JSON.parse(props.EXT_ORDEN_V1)[0] === FV[0], 'lo rechazado no toco el orden guardado');

// 7) cableado: Web App, background y opciones
const wa = fs.readFileSync(__dirname + '/../apps-script/WebAPI.gs', 'utf8');
t(/ext_orden_ver[\s\S]{0,40}extOrdenVer_/.test(wa) && /ext_orden_guardar[\s\S]{0,40}extOrdenGuardar_/.test(wa), 'acciones del Web App conectadas');
const bg = fs.readFileSync(path.join(__dirname, '..', 'extension-cookie', 'background.js'), 'utf8'), op = fs.readFileSync(path.join(__dirname, '..', 'extension-cookie', 'options.js'), 'utf8'), oh = fs.readFileSync(path.join(__dirname, '..', 'extension-cookie', 'options.html'), 'utf8');
t(/m\.tipo === 'orden_ver'[\s\S]{0,60}orden_guardar/.test(bg) && /ext_orden_guardar/.test(bg) && /ext_orden_ver/.test(bg), 'background atiende orden_ver y orden_guardar');
t(/id="ordl"/.test(oh) && /id="og"/.test(oh) && /orden_guardar/.test(op) && /orden_ver/.test(op), 'las Opciones muestran la lista y el boton Guardar orden');
t(!/innerHTML/.test(op.slice(op.indexOf('pintaOrden'))), 'la lista se pinta sin innerHTML (los nombres no se interpretan como HTML)');
console.log(bad ? ('FALLAN ' + bad + ' (ok ' + ok + ')') : ('t104 ok ' + ok)); process.exit(bad ? 1 : 0);
