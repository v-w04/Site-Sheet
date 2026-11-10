// Cadena de ventas (VentaDiaria.gs ventasProgramado): tope de tiempo, pendientes primero y modulo cortado. Simulado.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const P={};ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>k in P?P[k]:null,setProperty:(k,v)=>{P[k]=String(v)},deleteProperty:k=>{delete P[k]}})};
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m)=>logs.push([k,m]));ctx.avisoDia_=(a,b,c,m)=>logs.push(['DIA',m]);ctx.flushLog_=()=>{};
ctx.encProgramado_=function(){};
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/VentaDiaria.gs','utf8'),ctx);
let reloj=7200000;ctx.Date.now=()=>reloj;const corridos=[];
const mod=(n,ms)=>()=>{corridos.push(n);reloj+=ms};
ctx.ventasHistoricoProgramado_=mod('vw',120000);ctx.ventasCvaProgramado_=mod('cva',10000);ctx.preciosErroneosProgramado_=mod('pe',20000);
ctx.vkProgramado_=mod('vk',30000);ctx.kaProgramado_=mod('ka',150000);ctx.exProgramado_=mod('ex',60000);ctx.ediProgramado_=mod('edi',1000);ctx.vdAplicarFormatos_=mod('fmt',5000);
P['VD_DUR_killers activos']='200000';
vm.runInContext('ventasProgramado()',ctx);
t(corridos.join(',')==='vw,cva,pe,vk','primera hora: corre lo que alcanza (ka 150 s ya no cabe)');
t(JSON.parse(P.VD_CADENA_PEND).join(',')==='killers activos,exportar,edi,formatos','lo que no alcanzo queda pendiente');
corridos.length=0;reloj=0;vm.runInContext('ventasProgramado()',ctx);
t(corridos[0]==='ka'&&corridos[1]==='ex'&&corridos[2]==='edi'&&corridos[3]==='fmt','siguiente hora: los pendientes van primero');
// modulo cortado por Google (quedo marcado)
P.VD_CORRIENDO='exportar|1';P.VD_CADENA_PEND='[]';corridos.length=0;reloj=10900000;
vm.runInContext('ventasProgramado()',ctx);
t(corridos[0]==='ex'&&logs.some(l=>l[0]==='Warn'&&/se corto por tiempo/.test(l[1])),'cortado: avisa y va primero');
t(!('VD_CORRIENDO' in P),'al terminar no queda marcado');
// --- CICLO: no empieza otro hasta cumplir VD_CICLO_MIN; sigue por tandas solo con lo pendiente; reintenta fallas; avisa al terminar ---
const correr=(n)=>{for(let i=0;i<n;i++){vm.runInContext('ventasProgramado()',ctx);reloj+=900000;}};
const ciclos=()=>logs.filter(l=>/Ciclo completo|CON FALLAS/.test(l[1])).length;
P.VD_CORRIENDO&&delete P.VD_CORRIENDO;
correr(8);   // cierra cualquier ciclo abierto (8 tandas de 15 min = 2 h: ya toco otro, asi que se abre y se cierra)
P.VD_CICLO_ABIERTO='0';P.VD_CICLO_INI=String(reloj);corridos.length=0;
vm.runInContext('ventasProgramado()',ctx);
t(corridos.length===0,'ciclo cerrado hace <60 min: no corre nada (no se pisa)');
reloj+=3600000+1;logs.length=0;corridos.length=0;
const antes=ciclos();correr(6);
console.log(JSON.stringify(logs.slice(-5)),ciclos(),antes,P.VD_CICLO_ABIERTO,P.VD_CADENA_PEND);t(ciclos()===antes+1&&logs.some(l=>l[0]==='Ok'&&/Ciclo completo/.test(l[1])),'termina con "Ciclo completo" en el Log, una sola vez');
// un modulo que truena: se reintenta y al tercero se avisa, sin frenar a los demas
reloj+=3600000+1;logs.length=0;corridos.length=0;
ctx.ediProgramado_=()=>{throw new Error('boom')};
correr(8);
t(logs.filter(l=>l[0]==='Warn'&&/intento/.test(l[1])).length>=2,'falla: reintenta en la siguiente tanda');
t(logs.some(l=>l[0]==='Err'&&/fallo 3 veces/.test(l[1])),'falla 3 veces: ERROR');
t(logs.some(l=>l[0]==='Err'&&/CON FALLAS en edi/.test(l[1])),'el ciclo termina marcando que fallo edi');
t(corridos.includes('ka')&&corridos.includes('ex'),'una falla no frena a los demas modulos');
console.log('t43: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
