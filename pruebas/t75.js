// gaCiclo (extension-cookie/background.js): apagado por defecto, solo prueba hasta que una prueba salga bien, falla cerrado, reporta al Sheet.
const fs=require('fs'),vm=require('vm'),path=require('path');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const dir=path.join(__dirname,'..','extension-cookie');
const bgSrc=fs.readFileSync(path.join(dir,'background.js'),'utf8'), gaSrc=fs.readFileSync(path.join(dir,'autoguias.js'),'utf8');
function mundo(opt){
  const store=Object.assign({url:'https://script.google.com/macros/s/ABC/exec',clave:'k'.repeat(40)},opt.store||{});
  const log={tabs:[],sheet:[],exec:[],removed:[]};
  const noop=()=>{};const ev={addListener:noop,removeListener:noop};
  const chrome={
    storage:{local:{get:async(keys)=>{const o={};(Array.isArray(keys)?keys:[keys]).forEach(k=>{if(k in store)o[k]=store[k]});return o},set:async(o)=>{Object.assign(store,o)}}},
    runtime:{onInstalled:ev,onStartup:ev,onMessage:ev,getPlatformInfo:async()=>({}),getManifest:()=>({version:'1.5.0'})},
    alarms:{create:noop,onAlarm:ev},idle:{setDetectionInterval:noop,onStateChanged:ev},
    action:{setBadgeText:noop,setBadgeBackgroundColor:noop,setTitle:noop},
    cookies:{get:async()=>null,onChanged:ev},
    tabs:{create:async(o)=>{log.tabs.push(o.url);return {id:7,url:o.url}},get:async()=>({id:7,status:'complete',url:opt.urlFinal||'https://electronicsmexico.site/walmart/guias'}),remove:async(id)=>{log.removed.push(id)},query:async()=>[],onUpdated:ev},
    scripting:{executeScript:async(o)=>{log.exec.push(o);return [{result:opt.resultado||{ok:true,modo:o.args[1].modo,comprados:['609100000001'],saltados:{'sin medidas':['609100000002']},sinMedidas:[{po:'609100000002',sku:'S2',producto:'P'}],resultados:{ok:o.args[1].modo==='real'?1:0,pend:0,mal:0},error:'',vistos:['609100000001','609100000002'],intentados:o.args[1].modo==='real'?['609100000001']:[]}}]}}
  };
  const ctx={console,chrome,importScripts:noop,setTimeout:(f)=>{f();return 0},clearTimeout:noop,setInterval:()=>0,clearInterval:noop,URL,JSON,Date,Promise,Math,Array,Object,String,Number,Set,RegExp,Error,
    fetch:async(u,o)=>{const b=JSON.parse(o.body);log.sheet.push(b);let r;
      if(b.accion==='guias_lista')r=opt.lista===undefined?{ok:true,retener:[],enviar:[],forzados:[],conflictos:[],umbralPct:3}:opt.lista;
      else r={ok:true};
      return {status:200,text:async()=>JSON.stringify(r),json:async()=>r}},
    crypto:{subtle:{digest:async()=>new ArrayBuffer(8)}},TextEncoder};
  vm.createContext(ctx);vm.runInContext(gaSrc,ctx);ctx.gaEnPagina=vm.runInContext('gaEnPagina',ctx);
  vm.runInContext(bgSrc,ctx);
  return {ctx,store,log};
}
const corre=async(w,f,p)=>vm.runInContext('gaCiclo',w.ctx)(f,p);
(async()=>{
let w=mundo({});let r=await corre(w,false,false);
t(r.apagado&&w.log.tabs.length===0&&w.log.sheet.length===0,'apagado por defecto: no abre pestanas ni llama al Sheet');
w=mundo({store:{gaActivo:true,gaModo:'real'}});
const h=new Date().getHours();
// fuera de horario (si la hora real cae dentro, se prueba con el boton)
// 19-nov: sin horario, las guias corren todo el dia (ella deja la PC prendida toda la noche)
t(/const GA_HORA_INI = 0, GA_HORA_FIN = 24;/.test(fs.readFileSync(__dirname+'/../extension-cookie/background.js','utf8')),'guias automaticas: todo el dia (0 a 24 h)');
// boton del popup = prueba siempre
w=mundo({store:{gaActivo:true,gaModo:'real'}});r=await corre(w,true,true);
t(w.log.exec.length===1&&w.log.exec[0].world==='MAIN'&&w.log.exec[0].args[1].modo==='prueba','el boton SIEMPRE corre en modo prueba aunque este en REAL');
t(w.store.gaPruebaOk===true,'una prueba sin error deja gaPruebaOk');
t(w.log.sheet[0].accion==='guias_lista'&&w.log.sheet.some(x=>x.accion==='guias_reporte'),'pide la lista y reporta al Sheet');
const rep=w.log.sheet.find(x=>x.accion==='guias_reporte').corrida;
t(rep.sinMedidas[0].sku==='S2'&&!JSON.stringify(rep).match(/cliente|destino|direccion/i),'el reporte lleva SKU/pedido/producto y nada de clientes');
t(w.log.removed.length===1,'cierra su pestana');
t(w.log.tabs[0]==='https://electronicsmexico.site/walmart/guias','solo abre la pagina de Guias del site');
// real sin prueba previa: se degrada a prueba
w=mundo({store:{gaActivo:true,gaModo:'real'}});await corre(w,true,false);
t(w.log.exec[0].args[1].modo==='prueba','modo REAL sin prueba previa: corre como prueba');
// real con prueba previa: compra
w=mundo({store:{gaActivo:true,gaModo:'real',gaPruebaOk:true}});r=await corre(w,true,false);
t(w.log.exec[0].args[1].modo==='real'&&w.log.exec[0].args[1].tope===undefined,'modo REAL con prueba previa: sin tope');
t(w.store.gaIntentadas&&w.store.gaIntentadas.pos.includes('609100000001'),'guarda las intentadas del dia para no repetir');
// hora de primera vista (espera de 30 min): se guarda una vez y no se reinicia
const t1=w.store.gaVistas&&w.store.gaVistas['609100000001'];
t(t1>0&&w.store.gaVistas['609100000002']>0,'guarda la hora en que vio por primera vez cada pedido');
// segunda corrida pasa las intentadas
w.log.exec.length=0;await new Promise(r=>setTimeout(r,5));await corre(w,true,false);
t(w.log.exec[0].args[1].vistas['609100000001']===t1&&w.store.gaVistas['609100000001']===t1,'la hora de primera vista NO se reinicia en la siguiente corrida');
w.log.exec.length=0;await corre(w,true,false);t(w.log.exec[0].args[1].yaIntentadas.includes('609100000001'),'la siguiente corrida recibe las ya intentadas');
// falla cerrado: lista mala
w=mundo({store:{gaActivo:true,gaModo:'real',gaPruebaOk:true},lista:{ok:false,error:'sin_hoja_cancelaciones'}});r=await corre(w,true,false);
t(w.log.tabs.length===0&&w.log.exec.length===0&&!r.ok,'sin lista del Sheet: no abre ni compra nada');
w=mundo({store:{gaActivo:true,gaModo:'real',gaPruebaOk:true},lista:null});r=await corre(w,true,false);t(w.log.exec.length===0,'Sheet no responde: no compra');
// site sin sesion (redirige a login)
w=mundo({store:{gaActivo:true,gaModo:'real',gaPruebaOk:true},urlFinal:'https://electronicsmexico.site/login'});r=await corre(w,true,false);
t(w.log.exec.length===0&&w.store.estadoGA&&/sin sesion/i.test(w.store.estadoGA.texto),'site sin sesion: no corre nada y lo dice');
// sin configuracion
w=mundo({store:{gaActivo:true,clave:''}});r=await corre(w,true,false);t(r.error==='sin_config'&&w.log.tabs.length===0,'sin clave: no hace nada');
// prueba con error NO habilita REAL
w=mundo({store:{gaActivo:true,gaModo:'real'},resultado:{ok:false,modo:'prueba',comprados:[],saltados:{},sinMedidas:[],resultados:{},error:'odoo_no_contesto'}});await corre(w,true,true);
t(!w.store.gaPruebaOk,'una prueba con error no habilita el modo REAL');
console.log('t75: '+ok+' ok'+(bad?', '+bad+' FALLA':''));process.exit(bad?1:0);
})().catch(e=>{console.log('FALLA excepcion',e&&e.stack||e);process.exit(1)});
