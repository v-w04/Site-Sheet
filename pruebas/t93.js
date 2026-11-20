// t93: turno entre varias computadoras (20-nov): solo una HACE cosas; si se apaga, otra toma el turno sola.
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
// ---- Sheet ----
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp};vm.createContext(ctx);
const props={};ctx.props_=()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)}});
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m)=>logs.push([k,m]));ctx.flushLog_=()=>{};ctx.EXT_ETAPA='EXTENSION';
ctx.extTexto_=(x,n)=>String(x==null?'':x).replace(/[\r\n]+/g,' ').slice(0,n||120);
let auth=null;ctx.csAutorizar_=()=>auth;ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/ExtTurno.gs','utf8'),ctx);
const T=(id,nombre)=>ctx.extTurno_({clave:'k',id,nombre});
let r=T('aaaaaaaa11','PC oficina');t(r.ok&&r.lider&&r.quien==='PC oficina','la primera que pregunta toma el turno');
r=T('bbbbbbbb22','Laptop casa');t(r.ok&&!r.lider&&r.quien==='PC oficina'&&r.pcs===2,'la segunda queda en espera y sabe quien trabaja');
r=T('aaaaaaaa11','PC oficina');t(r.lider,'la que tiene el turno lo renueva');
// la oficina se apaga: 16 min sin preguntar
const cur=JSON.parse(props.EXT_TURNO_V1);cur.hasta=Date.now()-60000;props.EXT_TURNO_V1=JSON.stringify(cur);
logs.length=0;r=T('bbbbbbbb22','Laptop casa');t(r.lider&&logs.some(l=>l[0]==='Warn'&&/ahora trabaja Laptop casa \(PC oficina dejo de responder/.test(l[1])),'si la que trabaja deja de responder 15 min, otra toma el turno y queda en el Log');
r=T('aaaaaaaa11','PC oficina');t(!r.lider&&r.quien==='Laptop casa','cuando la oficina regresa, queda en espera (no le quita el turno a la que ya trabaja)');
auth={ok:false,error:'no_autorizado'};t(T('cccccccc33','X').error==='no_autorizado','sin clave no hay turno');auth=null;
t(T('short','X').error==='sin_id','id invalido');
t(/ext_turno[\s\S]{0,40}extTurno_/.test(fs.readFileSync(__dirname+'/../apps-script/WebAPI.gs','utf8')),'accion del Web App conectada');
// ---- Extension ----
const bg=fs.readFileSync(__dirname+'/../extension-cookie/background.js','utf8');
function simula({resp}){
  const mem={},posts=[],noop=()=>{},ev={addListener:noop,removeListener:noop};let creadas=0;
  const chromeSim={cookies:{onChanged:ev,get:async()=>null,getAll:async()=>[]},alarms:{create:noop,get:async()=>null,getAll:async()=>[],onAlarm:ev},idle:{setDetectionInterval:noop,onStateChanged:ev},runtime:{onInstalled:ev,onStartup:ev,onMessage:ev,getPlatformInfo:async()=>({}),getManifest:()=>({version:'x'})},
    action:{setBadgeText:noop,setBadgeBackgroundColor:noop,setTitle:noop},
    storage:{local:{get:async(k)=>{const base={url:'https://script.google.com/macros/s/AKfycbTEST/exec',clave:'k'.repeat(40),gaActivo:true,gaModo:'real',gaPruebaOk:true};const o=Object.assign({},base,mem);return o},set:async(o)=>{Object.assign(mem,o)}}},
    tabs:{onUpdated:ev,query:async()=>[],create:async()=>{creadas++;return{id:7}},get:async()=>({id:7,status:'complete'}),update:async()=>{},remove:async()=>{}},
    windows:{getAll:async()=>[{id:1}],create:async()=>({id:5,tabs:[{id:8}]}),remove:async()=>{}},scripting:{executeScript:async()=>[{result:null}]}};
  const sandbox={console,JSON,Date,Object,Array,String,Number,Math,isNaN,Promise,RegExp,parseFloat,Error,URL,TextEncoder,encodeURIComponent,Intl,crypto:{randomUUID:()=>'1234abcd-5678-90ef-aaaa-bbbbccccdddd'},
    chrome:chromeSim,setInterval:()=>0,clearInterval:noop,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,2)),clearTimeout,
    fetch:async(u,o)=>{const b=JSON.parse(o.body);posts.push(b);const r=b.accion==='ext_turno'?resp:{ok:true,guias:[],ordenes:[],pedidos:[]};return{status:200,text:async()=>JSON.stringify(r)}}};
  vm.createContext(sandbox);vm.runInContext(bg+';this.tengoTurno=tengoTurno;this.rqCiclo=rqCiclo;this.wmCancelCiclo=wmCancelCiclo;this.cancelarCiclo=cancelarCiclo;this.gaCiclo=gaCiclo;this.scCiclo=scCiclo;',sandbox);
  return {s:sandbox,mem,posts,creadas:()=>creadas};
}
(async()=>{
  let S=simula({resp:{ok:true,lider:false,quien:'PC oficina',pcs:2}});
  for(const f of ['rqCiclo','wmCancelCiclo','cancelarCiclo','scCiclo']){const r=await S.s[f](false);t(r.espera&&r.turno===false,f+': en espera no corre');}
  const rg=await S.s.gaCiclo(false,false);t(rg.espera&&rg.turno===false,'guias: en espera no compra');
  t(S.posts.filter(p=>p.accion!=='ext_turno').length===0&&S.creadas()===0,'en espera no llama al Sheet para trabajar ni abre pestañas');
  t(S.posts.filter(p=>p.accion==='ext_turno').length===1,'pregunta el turno una vez por minuto (cache)');
  t(/En espera: trabaja PC oficina/.test(S.mem.estadoTurno.texto),'popup: dice quien trabaja');
  const id=S.posts[0].id;t(/^[a-z0-9]{8,40}$/i.test(id)&&S.mem.instId===id&&S.posts[0].nombre==='PC-'+id.slice(0,4).toUpperCase(),'id propio guardado y nombre por omision');
  S=simula({resp:{ok:true,lider:true,quien:'PC-1234',pcs:1}});
  let r=await S.s.rqCiclo(false);t(!r.turno&&!r.espera||r.ok,'con turno: si corre');t(S.posts.some(p=>p.accion==='rastreo_lista'),'con turno: pide sus guias');
  S=simula({resp:{ok:false,lider:false,quien:'PC oficina'}});
  r=await S.s.rqCiclo(true);t(S.posts.some(p=>p.accion==='rastreo_lista')&&!S.posts.some(p=>p.accion==='ext_turno'),'los botones (forzar) corren sin preguntar turno');
  S=simula({resp:{ok:false,error:'sesion_invalida'}});t(await S.s.tengoTurno()===true&&/Falta publicar/.test(S.mem.estadoTurno.texto),'Web App sin publicar: trabaja como antes y lo avisa');
  const src=bg;t(/tengoTurno\(\)\.then\(t => \{ if \(t\) cancelarCiclo\(true\)/.test(src),'al prender, solo la del turno reanuda cancelaciones');
  t(/pc: yo\.nombre, turno:/.test(src),'el estado que va al Log dice que computadora es y si trabaja');
  console.log('t93: '+ok+' ok'+(bad?', '+bad+' FALLA':''));process.exit(bad?1:0);
})();
