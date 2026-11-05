// Verificacion de envios contra Gmail (kvEmparejar_) y contraste de encabezados (escrContraste_). Datos simulados.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp,Infinity};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
// Solo se cargan las funciones puras: se extraen del archivo (el resto usa servicios de Google).
function carga(f,nombres){const s=fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8');
  nombres.forEach(n=>{const i=s.indexOf('function '+n+'(');if(i<0)throw new Error('no esta '+n);let d=0,j=s.indexOf('{',i);for(let k=j;k<s.length;k++){if(s[k]==='{')d++;if(s[k]==='}'){d--;if(!d){vm.runInContext(s.slice(i,k+1),ctx);return}}}});}
vm.runInContext("var KV_VENT_ANTES_MS=2*60*1000,KV_VENT_DESP_MS=20*60*1000;",ctx);
carga('KillersCorreo.gs',['kvEmparejar_']);carga('Escritura.gs',['escrContraste_']);
const E=vm.runInContext('kvEmparejar_',ctx),C=vm.runInContext('escrContraste_',ctx);
const M=(h,m)=>new Date(2026,10,4,h,m).getTime();
// dos envios al mismo grupo (18:14 y 18:17) y cuatro correos en Enviados
const filas=[{i:0,f:M(18,15),para:'audio@x.com; jefe@x.com'},{i:1,f:M(18,17),para:'audio@x.com'},{i:2,f:M(18,15),para:'tv@x.com'},{i:3,f:M(18,15),para:'nadie@x.com'}];
const msgs=[{f:M(18,15),to:'Audio <audio@x.com>,jefe@x.com'},{f:M(18,17),to:'audio@x.com'},{f:M(18,15),to:'tv@x.com'},{f:M(9,0),to:'nadie@x.com'}];
const r=E(filas,msgs);
t(r[0]===0&&r[1]===1,'dos envios al mismo grupo se unen cada uno con su correo: '+JSON.stringify(r));
t(r[2]===2,'otro grupo con su correo');
t(r[3]===-1,'correo fuera de la ventana de tiempo no cuenta');
t(E([{i:0,f:M(10,0),para:'a@x.com'}],[{f:M(10,0),to:'b@x.com'}])[0]===-1,'destinatario distinto no cuenta');
t(E([{i:0,f:M(10,0),para:'A@X.com'}],[{f:M(10,1),to:'a@x.com'}])[0]===0,'no distingue mayusculas');
t(E([{i:0,f:M(10,0),para:'a@x.com'},{i:1,f:M(10,1),para:'a@x.com'}],[{f:M(10,0),to:'a@x.com'}])[1]===-1,'un correo no sirve para dos envios');
t(C('#eef2f7')==='#202124'&&C('#D93025')==='#FFFFFF'&&C('#1F3A5F')==='#FFFFFF','contraste: oscuro sobre fondo claro, blanco sobre rojo/azul');
t(C('rojo')===null,'color invalido -> null');
console.log(ok+' ok'+(bad?', '+bad+' FALLAS':''));process.exit(bad?1:0);
