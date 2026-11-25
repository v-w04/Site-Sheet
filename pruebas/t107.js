// t107: borrar una computadora desde la extension (25-nov-2026): ext_pc_borrar. Reloj y propiedades simulados.
const fs = require('fs'), vm = require('vm');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };
let reloj = Date.UTC(2026, 10, 25, 16, 0, 0);
const ctx = { console, JSON, Date: { now: () => reloj }, Object, Array, String, Number, Math, isNaN, RegExp }; vm.createContext(ctx);
const props = {}; ctx.props_ = () => ({ getProperty: k => k in props ? props[k] : null, setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } });
const logs = []; ['Info', 'Ok', 'Warn', 'Err'].forEach(k => ctx['log' + k + '_'] = (e, m) => logs.push([k, m])); ctx.flushLog_ = () => {}; ctx.EXT_ETAPA = 'EXTENSION';
ctx.extTexto_ = (x, n) => String(x == null ? '' : x).replace(/[\r\n]+/g, ' ').slice(0, n || 120);
ctx.csAutorizar_ = (p) => p && p.clave === 'k' ? null : { ok: false, error: 'sesion_invalida' };
ctx.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/ExtTurno.gs', 'utf8'), ctx);
const DELL = ['dddddddd01', 'DELL'], FV = ['ffffffff02', 'FORCEV'], FANT = ['gggggggg03', 'PC-B73C'];
const T = (pc) => ctx.extTurno_({ clave: 'k', id: pc[0], nombre: pc[1] });
const pcs = () => JSON.parse(props.EXT_PCS_V1 || '{}');
// FANT pregunta una vez y se apaga; DELL y FORCEV siguen
T(FANT); for (let i = 0; i < 20; i++) { reloj += 60000; T(DELL); T(FV); }
let r = ctx.extOrdenVer_({ clave: 'k' });
t(r.pcs.length === 3 && r.pcs.find(x => x.nombre === 'PC-B73C').activa === false, 'la apagada sigue en la lista, desactivada');
t(ctx.extPcBorrar_({ clave: 'mala', id: FANT[0] }).error === 'sesion_invalida', 'sin clave no borra');
t(ctx.extPcBorrar_({ clave: 'k', id: DELL[0] }).error === 'prendida' && !!pcs()[DELL[0]], 'una prendida no se borra');
t(ctx.extPcBorrar_({ clave: 'k', id: '' }).error === 'id_vacio', 'id vacio');
r = ctx.extPcBorrar_({ clave: 'k', id: FANT[0] });
t(r.ok && r.pcs.length === 2 && !pcs()[FANT[0]], 'la apagada se borra');
t(logs.some(l => /Computadora borrada desde la extension: PC-B73C/.test(l[1])), 'queda en el Log');
t(ctx.extPcBorrar_({ clave: 'k', id: FANT[0] }).ok, 'borrar otra vez no truena');
// sale tambien del orden elegido
ctx.extOrdenGuardar_({ clave: 'k', orden: [FV[0], DELL[0]] });
for (let i = 0; i < 20; i++) { reloj += 60000; T(DELL); }   // FORCEV se apaga
t(ctx.extPcBorrar_({ clave: 'k', id: FV[0] }).ok && JSON.parse(props.EXT_ORDEN_V1).join() === DELL[0], 'sale del orden elegido');
// si vuelve a prenderse se registra sola
reloj += 60000; T(FV);
t(!!pcs()[FV[0]], 'si vuelve a prenderse se registra otra vez');
console.log('t107 ok ' + ok + (bad ? ' FALLAS ' + bad : '')); process.exit(bad ? 1 : 0);
