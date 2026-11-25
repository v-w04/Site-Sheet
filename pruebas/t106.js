// t106: Salud/Reporte cada hora SIN depender del minuto ni del candado (25-nov-2026). Reloj y propiedades simulados.
const fs = require('fs'), vm = require('vm');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };
let reloj = Date.UTC(2026, 10, 25, 14, 8, 0);
const props = {}; const llamadas = [];
const ctx = { console, JSON, Object, Array, String, Number, Math, isNaN, RegExp, Date: { now: () => reloj } };
vm.createContext(ctx);
ctx.props_ = () => ({ getProperty: k => k in props ? props[k] : null, setProperty: (k, v) => { props[k] = String(v); } });
ctx.flushLog_ = () => {}; ctx.casosDecidirProgramado_ = () => llamadas.push('casos'); ctx.reporteProgramado_ = () => llamadas.push('reporte');
let src = fs.readFileSync(__dirname + '/../apps-script/Salud.gs', 'utf8');
vm.runInContext(src, ctx);
ctx.saludActualizar_ = () => llamadas.push('salud');   // despues de cargar: reemplaza la real
const corre = () => { llamadas.length = 0; ctx.saludProgramado_(); return llamadas.join(); };
t(corre() === 'salud,casos,reporte', 'primera vez corre todo');
reloj += 15 * 60000; t(corre() === '', 'a los 15 min no vuelve a correr');
reloj += 20 * 60000; t(corre() === '', 'a los 35 min tampoco');
reloj += 20 * 60000; t(corre() === 'salud,casos,reporte', 'a los 55 min corre aunque el minuto sea :23 (ya no depende del minuto)');
reloj += 15 * 60000; t(corre() === '', 'otra vez espera');
reloj -= 3 * 3600000; t(corre() === 'salud,casos,reporte', 'si el reloj se atrasa, no se queda pegado');
// que Stock.gs la llame tambien cuando esta ocupado
const st = fs.readFileSync(__dirname + '/../apps-script/Stock.gs', 'utf8');
const i = st.indexOf("Otra corrida de stock en curso"); const j = st.indexOf("return { estado: 'ocupado' }");
t(i > 0 && j > i && st.slice(i, j).includes('saludProgramado_'), 'Stock: la llama tambien cuando otra corrida tiene el candado');
console.log('t106 ok ' + ok + (bad ? ' FALLAS ' + bad : '')); process.exit(bad ? 1 : 0);
