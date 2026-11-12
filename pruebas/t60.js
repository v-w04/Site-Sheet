// t60: lo que se corta por tiempo sigue SOLO en 1 min (cadena horaria de killers y precios). Simulado.
const fs=require('fs'),vm=require('vm'),path=require('path');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const src=f=>fs.readFileSync(path.join(__dirname,'..','apps-script',f),'utf8').replace(/\r\n/g,'\n');
const slice=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b));
// ---------- killers ----------
const K=src('Killers.gs');
const ctx={console,JSON,Date,Math,Number,String,Object,Array};vm.createContext(ctx);
let props={},trig=[],logs=[],corrio=[],reloj=0;
ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)},deleteProperty:k=>{delete props[k]}})};
ctx.tgUnaVez_=(fn,ms)=>trig.push([fn,ms]);ctx.tgBorrarUnaVez_=()=>{};ctx.logInfo_=(e,m)=>logs.push('INFO '+m);ctx.avisoDia_=(k,n,e,m)=>logs.push(n+' '+m);ctx.flushLog_=()=>{};
ctx.Date={now:()=>reloj};
const lento=n=>()=>{corrio.push(n);reloj+=100*1000;};   // cada modulo tarda 100 s
['ventas30Programado_','dashboardProgramado_','promosProgramado_','comisionesProgramado_','cvaCatalogoProgramado_','cobroDistintoProgramado_','kvProgramado_','orgProgramado_'].forEach(f=>ctx[f]=lento(f));
ctx.kProgramadoKillers_=()=>'ok';
vm.runInContext('var K_CADENA_MS = 270 * 1000;'+slice(K,'function killersProgramado()','/** Revision horaria de killers'),ctx);
t(JSON.stringify(ctx.kOrdenCadena_(['ventas30','a','b','c'],['c','x'],false))==='["ventas30","c","a","b"]','orden: ventas30, luego pendientes, luego el resto');
t(JSON.stringify(ctx.kOrdenCadena_(['ventas30','a','b','c'],['c','b'],true))==='["c","b"]','continuacion: solo lo pendiente');
ctx.killersProgramado();
t(corrio.length===3&&trig.length===1&&trig[0][0]==='killersContinuar'&&trig[0][1]===60000,'hora: corre 3 (270 s) y agenda killersContinuar en 1 min');
t(JSON.parse(props.KILLERS_CADENA_PEND).length===5&&/sigue sola en 1 min/.test(logs[0]),'guarda los 5 que faltan y lo dice en el Log (INFO)');
corrio=[];ctx.killersContinuar();
t(corrio.length===3&&corrio[0]==='comisionesProgramado_'&&trig.length===2,'continuacion: sigue con lo pendiente, no repite lo hecho');
corrio=[];ctx.killersContinuar();
t(corrio.length===2&&!props.KILLERS_CADENA_PEND&&trig.length===2,'termina lo que faltaba y ya no agenda mas');
// tope de vueltas
props.KILLERS_CADENA_VUELTAS='5';props.KILLERS_CADENA_PEND=JSON.stringify(['promos','comisiones','cva catalogo','cobro distinto','verificar correos']);trig=[];logs=[];
ctx.killersContinuar();
t(trig.length===0&&/WARN .*5 vueltas extra/.test(logs[0]),'despues de 5 vueltas extra ya no agenda: avisa y sigue la proxima hora');
ctx.killersProgramado();t(props.KILLERS_CADENA_VUELTAS!=='5','cada hora se reinician las vueltas');
// ---------- precios ----------
const P=src('Precios.gs');
const c2={console,JSON,Math,Number,String,Object,Array};vm.createContext(c2);
let pp={},tr2=[],lg2=[];
c2.props_=()=>({getProperty:k=>k in pp?pp[k]:null,setProperty:(k,v)=>{pp[k]=String(v)},deleteProperty:k=>{delete pp[k]}});
c2.tgUnaVez_=(fn,ms)=>tr2.push([fn,ms]);c2.tgBorrarUnaVez_=()=>{};c2.logInfo_=(e,m)=>lg2.push('INFO '+m);c2.logWarn_=(e,m)=>lg2.push('WARN '+m);
vm.runInContext(slice(P,'/** Despues de una corrida: si faltaron','/** Todas las combinaciones. Es lo que corre el trigger. */'),c2);
c2.preciosSiguiente_(2);t(pp.PRECIOS_FALTAN==='2'&&tr2[0][0]==='preciosContinuar'&&/siguen solas en 1 min/.test(lg2[0]),'precios: faltaron 2, sigue sola en 1 min');
c2.preciosSiguiente_(1);c2.preciosSiguiente_(1);c2.preciosSiguiente_(1);
t(tr2.length===3&&/WARN Faltaron 1 .*3 vueltas/.test(lg2[3]),'precios: maximo 3 vueltas seguidas, luego avisa');
c2.preciosSiguiente_(0);t(!pp.PRECIOS_FALTAN&&!pp.PRECIOS_VUELTAS,'precios: al terminar todo se limpia');
// continuacion: baja solo lo que falta
let llamado=null;c2.descargarPrecios=()=>{llamado=c2.PRECIOS_LIMITE_;return {estado:'ok'}};pp.PRECIOS_FALTAN='2';
c2.preciosContinuar();t(llamado===2,'preciosContinuar baja solo las 2 que faltaban');
pp={};llamado=null;c2.preciosContinuar();t(llamado===null,'sin pendientes no hace nada');
pp={PRECIOS_FALTAN:'2'};tr2=[];c2.descargarPrecios=()=>({estado:'ocupado'});c2.preciosContinuar();
t(tr2.length===1&&tr2[0][1]===120000,'si otra corrida tiene el candado, reintenta en 2 min');
// el trigger esta registrado como de una vez
const T=src('Triggers.gs');t(/FUNCIONES_DE_UNA_VEZ[^;]*'killersContinuar'[^;]*'preciosContinuar'/.test(T),'killersContinuar y preciosContinuar registrados como de una vez');
console.log('t60: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
