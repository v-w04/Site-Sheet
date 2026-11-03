// Cadena de ventas (VentaDiaria.gs ventasProgramado): tope de tiempo, pendientes primero y modulo cortado. Simulado.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const P={};ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>k in P?P[k]:null,setProperty:(k,v)=>{P[k]=String(v)},deleteProperty:k=>{delete P[k]}})};
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m)=>logs.push([k,m]));ctx.avisoDia_=(a,b,c,m)=>logs.push(['DIA',m]);ctx.flushLog_=()=>{};
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/VentaDiaria.gs','utf8'),ctx);
let reloj=0;ctx.Date.now=()=>reloj;const corridos=[];
const mod=(n,ms)=>()=>{corridos.push(n);reloj+=ms};
ctx.ventasHistoricoProgramado_=mod('vw',120000);ctx.ventasCvaProgramado_=mod('cva',10000);ctx.preciosErroneosProgramado_=mod('pe',20000);
ctx.vkProgramado_=mod('vk',30000);ctx.kaProgramado_=mod('ka',150000);ctx.exProgramado_=mod('ex',60000);ctx.vdAplicarFormatos_=mod('fmt',5000);
P['VD_DUR_killers activos']='200000';
vm.runInContext('ventasProgramado()',ctx);
t(corridos.join(',')==='vw,cva,pe,vk','primera hora: corre lo que alcanza (ka 150 s ya no cabe)');
t(JSON.parse(P.VD_CADENA_PEND).join(',')==='killers activos,exportar,formatos','lo que no alcanzo queda pendiente');
corridos.length=0;reloj=0;vm.runInContext('ventasProgramado()',ctx);
t(corridos[0]==='ka'&&corridos[1]==='ex'&&corridos[2]==='fmt','siguiente hora: los pendientes van primero');
// modulo cortado por Google (quedo marcado)
P.VD_CORRIENDO='exportar|1';P.VD_CADENA_PEND='[]';corridos.length=0;reloj=0;
vm.runInContext('ventasProgramado()',ctx);
t(corridos[0]==='ex'&&logs.some(l=>l[0]==='Warn'&&/se corto por tiempo/.test(l[1])),'cortado: avisa y va primero');
t(!('VD_CORRIENDO' in P),'al terminar no queda marcado');
console.log('t43: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
