// t102: ORDEN DE TRABAJO del turno (25-nov-2026): primero DELL SERVIDOR, si no FORCEV, luego FCORSAIR.
// Si regresa una de mejor lugar no le quita el turno de golpe: la que trabaja lo SUELTA en su siguiente pregunta (sin dos corridas a la vez).
// Reloj y hoja simulados; las extensiones preguntan cada minuto como en la realidad. Nada real.
const fs = require('fs'), vm = require('vm');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };
let reloj = Date.UTC(2026, 10, 25, 14, 0, 0);
const ctx = { console, JSON, Date: { now: () => reloj }, Object, Array, String, Number, Math, isNaN, RegExp }; vm.createContext(ctx);
const props = {}; ctx.props_ = () => ({ getProperty: k => k in props ? props[k] : null, setProperty: (k, v) => { props[k] = String(v); } });
const logs = []; ['Info', 'Ok', 'Warn', 'Err'].forEach(k => ctx['log' + k + '_'] = (e, m) => logs.push([k, m])); ctx.flushLog_ = () => {}; ctx.EXT_ETAPA = 'EXTENSION';
ctx.extTexto_ = (x, n) => String(x == null ? '' : x).replace(/[\r\n]+/g, ' ').slice(0, n || 120);
ctx.csAutorizar_ = () => null; ctx.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/ExtTurno.gs', 'utf8'), ctx);
const DELL = ['dddddddd01', 'DELL SERVIDOR'], FV = ['ffffffff02', 'FORCEV'], FC = ['cccccccc03', 'FCORSAIR'];
const T = (pc) => ctx.extTurno_({ clave: 'k', id: pc[0], nombre: pc[1] });
const reinicia = () => { Object.keys(props).forEach(k => delete props[k]); logs.length = 0; };
const turno = () => JSON.parse(props.EXT_TURNO_V1 || 'null');
const dice = (re) => logs.some(l => re.test(l[1]));
/** Pasan n minutos; en cada minuto preguntan las computadoras prendidas (en ese orden). Devuelve quien tiene el turno al final. */
const corre = (n, prendidas) => { for (let i = 0; i < n; i++) { reloj += 60000; prendidas.forEach(T); } const x = turno(); return x && x.id ? x.nombre : ''; };

// 0) lugares
const rg = ctx.extTurnoRango_;
t(rg('DELL SERVIDOR') === 0 && rg('dell servidor') === 0 && rg(' Dell-Servidor ') === 0 && rg('FORCEV') === 1 && rg('FCORSAIR') === 2 && rg('Laptop casa') === 99 && rg('') === 99 && rg(null) === 99, 'lugares: DELL 0, FORCEV 1, FCORSAIR 2, desconocida 99');

// 1) las tres prendidas: Dell trabaja, las otras esperan y no le piden nada
reinicia();
t(corre(30, [FC, FV, DELL]) === 'DELL SERVIDOR', 'con las tres prendidas trabaja Dell aunque FCORSAIR pregunte primero');
t(!turno().cede, 'las de peor lugar no le piden el turno a Dell');
let r = T(FV); t(!r.lider && r.quien === 'DELL SERVIDOR', 'FORCEV queda en espera y sabe que trabaja Dell');

// 2) Dell se apaga: toma FORCEV (no FCORSAIR), a los 15 min
t(corre(10, [FC, FV]) === 'DELL SERVIDOR', 'a los 10 min sin Dell todavia es de Dell (no se salta los 15 min)');
t(corre(8, [FC, FV]) === 'FORCEV', 'a los 15+ min sin Dell, toma FORCEV (mejor lugar que FCORSAIR)');
t(dice(/ahora trabaja FORCEV \(DELL SERVIDOR dejo de responder 15 min\)/), 'queda en el Log por que cambio el turno');
t(corre(10, [FC, FV]) === 'FORCEV', 'FORCEV conserva el turno');

// 3) regresa Dell: no se lo quita de golpe; FORCEV lo suelta en su siguiente pregunta (cuando Dell ya pregunto otra vez) y Dell lo toma
logs.length = 0;
reloj += 60000; r = T(DELL);
t(!r.lider && r.quien === 'FORCEV', 'Dell regresa y no se lo quita de golpe (FORCEV sigue)');
t(turno().id === FV[0] && turno().cede && turno().cede.id === DELL[0], 'deja la peticion de Dell sobre el turno de FORCEV');
t(dice(/DELL SERVIDOR esta prendida y le toca primero/), 'el Log dice que Dell lo pidio');
r = T(FC); t(!r.lider && r.quien === 'FORCEV', 'FCORSAIR sigue esperando');
r = T(FV); t(r.lider && turno().id === FV[0], 'FORCEV aun lo conserva: Dell solo ha preguntado una vez (una prendida de segundos no le quita el turno)');
t(turno().cede && turno().cede.id === DELL[0], 'al renovar, FORCEV conserva la peticion de Dell mientras Dell siga prendida');
reloj += 60000; T(DELL);                           // pregunta otra vez (ya lleva dos minutos prendida)
r = T(FC); t(!r.lider, 'FCORSAIR espera');
r = T(FV); t(!r.lider && r.quien === 'DELL SERVIDOR', 'FORCEV suelta el turno en su siguiente pregunta y sabe que sigue Dell');
t(turno().id === '' && turno().para === 'DELL SERVIDOR', 'el turno queda libre y apartado para Dell');
t(dice(/FORCEV lo suelta para DELL SERVIDOR/), 'el Log dice que FORCEV lo solto para Dell');
r = T(FC); t(!r.lider, 'FCORSAIR NO se queda el turno libre (Dell, de mejor lugar, esta prendida)');
r = T(FV); t(!r.lider, 'FORCEV tampoco lo recupera (Dell esta prendida)');
reloj += 60000; r = T(DELL); t(r.lider && r.quien === 'DELL SERVIDOR', 'Dell toma el turno');
t(dice(/trabaja DELL SERVIDOR \(le tocaba por el orden\)/), 'el Log dice que le tocaba por el orden');
t(corre(20, [FC, FV, DELL]) === 'DELL SERVIDOR', 'despues se queda Dell');

// 4) nunca dos con el turno: en todo el cambio, a lo mas una responde lider
reinicia();
corre(3, [FC]);                                   // solo FCORSAIR prendida: trabaja
let simultaneos = 0, vistoDell = false;
for (let i = 0; i < 12; i++) {
  reloj += 60000;
  const pcs = i < 2 ? [FC] : [FC, FV, DELL];      // desde el minuto 3 se prenden FORCEV y Dell
  const lids = pcs.map(T).filter(x => x.lider).length;
  if (lids > 1) simultaneos++;
}
t(simultaneos === 0 && turno().nombre === 'DELL SERVIDOR', 'FCORSAIR -> Dell sin que dos computadoras tengan el turno a la vez: termina Dell');

// 5) la de mejor lugar pidio el turno y se apago antes de tomarlo: el que trabaja NO lo suelta
reinicia();
corre(5, [FV]);                                   // FORCEV trabaja
reloj += 60000; T(DELL);                           // Dell pregunta una vez (pide el turno) y se apaga
const pidio = turno().cede && turno().cede.id === DELL[0];
t(pidio, 'Dell pidio el turno');
t(corre(10, [FV]) === 'FORCEV' && !turno().cede && turno().id === FV[0], 'si Dell se apago antes de tomarlo, FORCEV lo conserva y se borra la peticion');
t(!dice(/FORCEV lo suelta para/), 'y no lo solto');

// 6) FCORSAIR trabaja y regresan Dell y FORCEV: pasa a Dell (no a FORCEV)
reinicia();
corre(5, [FC]);
t(corre(12, [FC, FV, DELL]) === 'DELL SERVIDOR', 'FCORSAIR cede a Dell aunque FORCEV tambien regrese');

// 7) FORCEV trabaja y regresa FCORSAIR (peor lugar): no se mueve nada
reinicia();
corre(5, [FV]);
t(corre(10, [FV, FC]) === 'FORCEV' && !turno().cede, 'FCORSAIR no le quita nada a FORCEV');

// 8) nombres desconocidos empatan: gana la que ya trabaja, como antes (t93)
reinicia();
const A = ['aaaaaaaa11', 'PC oficina'], B = ['bbbbbbbb22', 'Laptop casa'];
t(corre(10, [A, B]) === 'PC oficina' && !turno().cede, 'dos desconocidas: no se piden el turno');
t(corre(16, [B]) === 'Laptop casa', 'si la que trabaja deja de responder, la otra lo toma');
t(corre(10, [A, B]) === 'Laptop casa', 'al regresar, la primera queda en espera');
// desconocida contra conocida: la conocida va primero
reinicia();
corre(5, [A]);
t(corre(10, [A, FC]) === 'FCORSAIR', 'una con nombre de la lista va antes que una desconocida');

// 9) sin la lista de computadoras (llamada vieja de la funcion) se comporta como siempre
const d = ctx.extTurnoDecidir_({ id: 'x', nombre: 'FORCEV', hasta: reloj + 600000, desde: reloj }, 'y', 'DELL SERVIDOR', reloj);
t(!d.lider && d.evento === 'cede-pedido', 'la funcion pura sin lista de computadoras tambien pide el turno al de peor lugar');
const d2 = ctx.extTurnoDecidir_(null, 'y', 'FCORSAIR', reloj);
t(d2.lider && d2.cambio, 'sin turno previo y sin lista: toma el turno');

// 10) la accion del Web App sigue conectada y el turno solo lo da quien tiene la clave
t(/ext_turno[\s\S]{0,40}extTurno_/.test(fs.readFileSync(__dirname + '/../apps-script/WebAPI.gs', 'utf8')), 'accion del Web App conectada');

console.log(bad ? ('FALLAN ' + bad + ' (ok ' + ok + ')') : ('t102 ok ' + ok)); process.exit(bad ? 1 : 0);
