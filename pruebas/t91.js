// t91: rastreo en la extension (enBigSmart / enFedex / rqCiclo) con paginas y Chrome SIMULADOS.
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const bg=fs.readFileSync(__dirname+'/../extension-cookie/background.js','utf8');
const blk=bg.slice(bg.indexOf('// ---- Rastreo de guias'),bg.indexOf('// ---- Guias automaticas'));
t(blk.length>3000,'se aislo el bloque de rastreo');
const sinCom=blk.replace(/^\s*\/\/.*$/gm,'');
t(!/\.submit\(|\.value\s*=|innerHTML\s*=|api\.bigsmart|order-logs|fetch\(/.test(sinCom),'solo lee: sin formularios, sin escribir en la pagina, sin la API de BigSmart ni fetch');
t((sinCom.match(/\.click\(\)/g)||[]).length===1&&/view more details/i.test(sinCom),'unico clic: "View more details" de FedEx');
t(/cf: true/.test(sinCom)&&/if \(r\.cf\) \{ cf = true; break; \}/.test(sinCom),'verificacion "eres humano": se detiene la vuelta');
const fn=n=>blk.slice(blk.indexOf('async function '+n),blk.indexOf('\n}\n',blk.indexOf('async function '+n))+2);
// ---- BigSmart simulado ----
const el=(txt,hijos)=>({innerText:txt||'',querySelector:s=>(hijos||{})[s]||null});
function pagBS({logs=[],cf=false,error='',actual='Entregado'}={}){
  const lis=logs.map(([c,a,f])=>el('',{'.log__code':el(c),'.log__activity':el(a),'.log__date':el(f),'.log__location':el('Puebla')}));
  const sr={querySelectorAll:s=>s==='li.log'?lis:[],querySelector:s=>s==='.feedback__text--error'?(error?el(error):null):(s==='.stage--current .stage__name'?el(actual):null)};
  const ctx={console,Promise,setTimeout:(f)=>setTimeout(f,0),document:{title:cf?'Just a moment...':'Rastrea tu paquete',body:{innerText:cf?'Verifique que es un ser humano':'x'},querySelector:s=>s==='bigsmart-tracking'?{shadowRoot:sr}:null}};
  vm.createContext(ctx);vm.runInContext('globalThis.f='+fn('enBigSmart').replace(/^async function enBigSmart/,'(async function enBigSmart')+')',ctx);return ctx.f;
}
function pagFX(texto,{activo='On the way',cf=false}={}){
  let clic=0;const boton={innerText:'View more details',click:()=>{clic++}};
  const ctx={console,Promise,setTimeout:(f)=>setTimeout(f,0),document:{title:'Detailed Tracking',body:{get innerText(){return cf?'Access Denied':(clic?texto:'545284634491 Label created On the way')}},
    querySelector:s=>s==='.phase3-progress-bar__label--active'&&!cf?{innerText:activo}:null,querySelectorAll:s=>s==='button'?[boton]:[]}};
  vm.createContext(ctx);vm.runInContext('globalThis.f='+fn('enFedex').replace(/^async function enFedex/,'(async function enFedex')+')',ctx);return ctx.f;
}
(async()=>{
  let r=await pagBS({logs:[['360','Entregado','13 nov 2026, 06:18 p.m.'],['303','Tu Paquete siguiente por entregar','13 nov 2026, 03:22 p.m.']]})();
  t(r.ok&&r.eventos.length===2&&r.eventos[0].cod==='360'&&r.eventos[0].txt==='Entregado'&&r.eventos[0].fecha==='13 nov 2026, 06:18 p.m.'&&r.resumen==='Entregado','BigSmart: lee codigo, texto, fecha del shadowRoot (lo mas reciente primero)');
  r=await pagBS({cf:true})();t(r.ok===false&&r.cf===true,'BigSmart con verificacion: cf');
  r=await pagBS({error:'No encontramos tu guía'})();t(r.ok===false&&/No encontramos/.test(r.error),'BigSmart: guia no encontrada');
  const hist='545284634491\nTravel history\nTravel History\nDate\tTime, Status and Location\nSunday, 11/15/26\t\n1:22 PM\nShipment information sent to FedEx\nTuesday, 11/17/26\t\n5:44 PM\nPicked up\nMEXICO MX\n11:00 PM\nLeft FedEx origin facility\nMEXICO MX\nWednesday, 11/18/26\t\n8:00 AM\nArrived at FedEx hub\nCUAUTITLAN IZCALLI MX\n6:57 PM\nDeparted FedEx hub\nCUAUTITLAN IZCALLI MX\nShipment facts\nShipment overview';
  r=await pagFX(hist)();
  t(r.ok&&r.resumen==='On the way'&&r.eventos.length===5,'FedEx: 5 eventos del historial real: '+JSON.stringify(r.eventos.map(e=>e.txt)));
  t(r.eventos[4].txt==='Departed FedEx hub'&&r.eventos[4].lugar==='CUAUTITLAN IZCALLI MX'&&/11\/18\/26 6:57 PM/.test(r.eventos[4].fecha)&&r.eventos[0].txt==='Shipment information sent to FedEx'&&r.eventos[0].lugar==='','FedEx: ultimo evento al final, con lugar y fecha');
  r=await pagFX('x',{cf:true})();t(r.ok===false&&r.cf===true,'FedEx con bloqueo: cf');
  r=await pagFX('Travel History\nMonday, 10/12/26\n11:19 AM\nDelivered\nPLAYAS DE ROSARITO MX\nShipment facts',{activo:'Delivered'})();
  t(r.ok&&r.eventos[0].txt==='Delivered'&&r.resumen==='Delivered','FedEx entregada (519750918399)');
  // ---- rqCiclo con Chrome simulado ----
  function simula({lista,pagina}){
    const mem={},posts=[],noop=()=>{},ev={addListener:noop,removeListener:noop};const tabs={creadas:[],urls:[],cerradas:0,funcs:[]};
    const chromeSim={cookies:{onChanged:ev,get:async()=>null},alarms:{create:noop,get:async()=>null,getAll:async()=>[],onAlarm:ev},idle:{setDetectionInterval:noop,onStateChanged:ev},runtime:{onInstalled:ev,onStartup:ev,onMessage:ev,getPlatformInfo:async()=>({})},
      action:{setBadgeText:noop,setBadgeBackgroundColor:noop,setTitle:noop},
      storage:{local:{get:async()=>({url:'https://script.google.com/macros/s/AKfycbTEST/exec',clave:'k'}),set:async(o)=>{Object.assign(mem,o)}}},
      tabs:{onUpdated:{addListener:(l)=>{setTimeout(()=>l(7,{status:'complete'}),0)},removeListener:noop},query:async()=>[],create:async(o)=>{tabs.creadas.push(o);return{id:7}},update:async(id,o)=>{tabs.urls.push(o.url)},get:async()=>({id:7,status:'complete'}),remove:async()=>{tabs.cerradas++}},
      windows:{getAll:async()=>[{id:1}],create:async()=>({id:5,tabs:[{id:8}]}),remove:async()=>{}},
      scripting:{executeScript:async(o)=>{tabs.funcs.push(o.func.name);return[{result:pagina(tabs.urls[tabs.urls.length-1],o.func.name)}]}}};
    const sandbox={console,JSON,Date,Object,Array,String,Number,Math,isNaN,Promise,RegExp,parseFloat,Error,URL,TextEncoder,encodeURIComponent,Intl,
      chrome:chromeSim,setInterval:()=>0,clearInterval:noop,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,2)),clearTimeout,
      fetch:async(u,o)=>{const b=JSON.parse(o.body);posts.push(b);const r=b.accion==='rastreo_lista'?lista:{ok:true,escritas:(b.resultados||[]).length,finales:1};return{status:200,text:async()=>JSON.stringify(r)}}};
    vm.createContext(sandbox);vm.runInContext(bg+';this.rqCiclo=rqCiclo;',sandbox);
    return {sandbox,mem,posts,tabs};
  }
  let S=simula({lista:{ok:true,guias:[]},pagina:()=>null});let rc=await S.sandbox.rqCiclo(true);
  t(rc.ok&&S.tabs.creadas.length===0&&/Sin guias/.test(S.mem.estadoRQ.texto),'sin guias: no abre nada');
  S=simula({lista:{ok:true,guias:[{guia:'MXFDDWM22301991',paq:'BIGSMART'},{guia:'545284634491',paq:'FEDEX'},{guia:'iMileWM1',paq:''},{guia:'x;drop',paq:'BIGSMART'}]},
    pagina:(u,f)=>f==='enBigSmart'?{ok:true,resumen:'Entregado',eventos:[{cod:'360',txt:'Entregado'}]}:{ok:true,resumen:'On the way',eventos:[{txt:'Picked up'}]}});
  rc=await S.sandbox.rqCiclo(true);
  t(JSON.stringify(S.tabs.urls)==='["https://bigsmart.mx/tracking/?trackingNumber=MXFDDWM22301991","https://www.fedex.com/fedextrack/?trknbr=545284634491"]','abre solo las paginas publicas de las 2 guias validas: '+JSON.stringify(S.tabs.urls));
  t(S.tabs.creadas.length===1&&S.tabs.creadas[0].active===false&&S.tabs.cerradas===1,'una sola pestaña propia, sin foco, y la cierra');
  t(JSON.stringify(S.tabs.funcs)==='["enBigSmart","enFedex"]','usa el lector de cada paqueteria');
  const rep=S.posts.find(p=>p.accion==='rastreo_resultado');t(rep&&rep.resultados.length===2&&rep.resultados[0].guia==='MXFDDWM22301991'&&rep.resultados[0].eventos[0].cod==='360','manda todo el lote al Sheet en una llamada');
  t(rc.ok&&S.mem.estadoRQ.ok&&/2 guia\(s\) consultadas/.test(S.mem.estadoRQ.texto),'estado: '+S.mem.estadoRQ.texto);
  // verificacion: se detiene
  S=simula({lista:{ok:true,guias:[{guia:'MXFDDWM00000001',paq:'BIGSMART'},{guia:'MXFDDWM00000002',paq:'BIGSMART'}]},pagina:()=>({ok:false,cf:true})});
  rc=await S.sandbox.rqCiclo(true);
  t(S.tabs.urls.length===1&&rc.ok===false&&/verificacion/.test(S.mem.estadoRQ.texto)&&S.posts.find(p=>p.accion==='rastreo_resultado').resultados[0].cf===true,'verificacion: para la vuelta en la primera y lo reporta');
  // Sheet sin version nueva
  S=simula({lista:{ok:false,error:'sesion_invalida'},pagina:()=>null});rc=await S.sandbox.rqCiclo(true);t(/Nueva version/.test(S.mem.estadoRQ.texto),'Web App sin publicar: lo dice');
  // alarmas: cada 10 min y todo el dia
  t(/chrome\.alarms\.create\('rastreo', \{ periodInMinutes: RQ_CADA_MIN \}\)/.test(bg)&&/const RQ_CADA_MIN = 10;/.test(bg)&&/if \(a\.name === 'rastreo'\) rqCiclo\(false\)/.test(bg),'alarma cada 10 min');
  const man=JSON.parse(fs.readFileSync(__dirname+'/../extension-cookie/manifest.json','utf8'));
  t(man.host_permissions.includes('https://bigsmart.mx/*')&&man.host_permissions.includes('https://www.fedex.com/*'),'permisos de las dos paginas de rastreo');
  console.log('t91: '+ok+' ok'+(bad?', '+bad+' FALLAS':''));process.exit(bad?1:0);
})();
