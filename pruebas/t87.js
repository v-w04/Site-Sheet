// t87: lectura de Seller Center por la API interna (enSellerApi / scApi), solo lectura, con respaldo por pantalla.
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const bg=fs.readFileSync(__dirname+'/../extension-cookie/background.js','utf8');

/* ---- 1) enSellerApi dentro de una pagina simulada ---- */
const ini=bg.indexOf('async function enSellerApi'),fin=bg.indexOf('// Pestaña para leer:');
t(ini>0&&fin>ini,'se aislo enSellerApi');
const fn=bg.slice(ini,fin);
t(!/mutation\s+[A-Za-z]|cancelOrder|acknowledgeOrder|\.click\(|sendMessage|create_supporthub|reOpen/i.test(fn.replace(/\/\\bmutation\\b\/i/,'')),'enSellerApi: solo consultas, ninguna mutacion');
t(/get\[_A-Za-z\]/.test(fn)&&/mutation/.test(fn),'tiene el candado de solo get_*');
function pagina({sesion=true,fallaPedidos=false,antibot=false}={}){
  const llamadas=[];
  const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,isFinite,RegExp,Promise,Error,Intl,
    setTimeout:(f)=>setTimeout(f,0),
    document:{cookie:sesion?'XSRF-TOKEN=abc':''},
    localStorage:{getItem:()=>sesion?JSON.stringify({ev1:{tmxId:'tmx1'}}):'{}'},
    crypto:{getRandomValues:a=>{a.fill(1);return a},randomUUID:()=> 'uuid'},
    fetch:async(ruta,o)=>{
      const b=JSON.parse(o.body);llamadas.push({ruta,op:o.headers.pxqueryname,q:b.query,v:b.variables});
      const j=(x)=>({status:200,text:async()=>JSON.stringify(x)});
      if(antibot) return {status:403,text:async()=>'px-captcha'};
      if(/get_orders_getAllOrders/.test(b.query)){
        if(fallaPedidos) return j({errors:[{message:'boom'}]});
        const p=b.variables.params;
        const mk=(cid,pid,fecha,envio,tot,lineas)=>({customerOrderId:cid,purchaseOrderId:pid,orderDate:fecha,shippingInfo:{estimatedShipDate:envio},orderSummary:{totalAmount:{amount:tot}},poLines:lineas.map(s=>({poLineStatus:s}))});
        let po=[];
        if(p.orderNumber) po=[mk(p.orderNumber,'609131000000001','Thu Nov 19 15:16:57 GMT 2026','Tue Nov 24 05:50:00 GMT 2026',569,['Shipped'])];
        else if(p.orderGroups==='Unshipped') po=[mk('600000134639589','609132498023060','Thu Nov 19 15:16:57 GMT 2026','Tue Nov 24 00:00:00 GMT 2026',569,['New']),mk('600000136739754','609132297042388','Tue Nov 17 20:00:00 GMT 2026','Thu Nov 19 05:50:00 GMT 2026',11250,['New','New'])];
        else if(p.orderGroups==='Canceled') po=[mk('600000139116249','609132497900370','Thu Nov 19 03:53:13 GMT 2026','Sat Nov 21 05:50:00 GMT 2026',0,['Canceled'])];
        else po=[mk('600000139241931','609132498036565','Thu Nov 19 15:40:24 GMT 2026','Tue Nov 24 05:50:00 GMT 2026',2859,['Shipped','Canceled'])];
        return j({data:{get_orders_getAllOrders:{orderInfo:{pageInfo:{totalCount:po.length},purchaseOrders:po}}}});
      }
      if(/get_messages_mailCount/.test(b.query)) return j({data:{get_messages_mailCount:{unreadCount:1}}});
      if(/get_messages_responseNeededCount/.test(b.query)) return j({data:{get_messages_responseNeededCount:{responseNeededCount:2}}});
      if(/get_supporthub_allCases/.test(b.query)) return j({data:{get_supporthub_allCases:[
        {caseNumber:'17151504',createdDate:new Date(Date.now()-2*86400000).toISOString(),subject:'La Paquetería Recolectó Mi Paquete',status:'New'},
        {caseNumber:'17009830',createdDate:new Date(Date.now()-5*86400000).toISOString(),subject:'Sin guia',status:'Needs Info - Internal'},
        {caseNumber:'16000001',createdDate:new Date(Date.now()-60*86400000).toISOString(),subject:'Viejo',status:'Closed'}]}});
      return j({errors:[{message:'desconocida'}]});
    }};
  vm.createContext(ctx);vm.runInContext('globalThis.enSellerApi='+fn.replace(/^async function enSellerApi/,'(async function enSellerApi')+')',ctx);
  return {ctx,llamadas};
}
(async()=>{
  let {ctx,llamadas}=pagina();
  let r=await ctx.enSellerApi(['600000131318758']);
  t(r.sesion===true&&r.errores.length===0,'lee sin errores: '+JSON.stringify(r.errores));
  const u=r.pedidos.Unshipped;
  t(u.length===2&&u[0].pedido==='600000134639589'&&u[0].orden==='609132498023060','pedido = customerOrderId, orden = purchaseOrderId (igual que la hoja): '+JSON.stringify(u[0]));
  t(u[0].estado==='Nuevo'&&u[1].estado==='Nuevo'&&u[1].total===11250&&u[0].total===569,'estado Nuevo (sin repetir) y total numerico');
  t(u[0].fecha==='2026-11-19'&&u[0].envio==='2026-11-23'&&u[1].envio==='2026-11-18','fechas en hora de Mexico (como las muestra la pagina): '+u[0].fecha+' '+u[0].envio+' '+u[1].envio);
  t(r.pedidos.Canceled[0].estado==='Cancelado'&&r.pedidos.Canceled[0].total===0,'canceladas');
  t(r.pedidos.All[0].estado==='Enviado Cancelado','pedido mixto: Enviado Cancelado (la hoja lo lee como CANCELADO como antes): '+r.pedidos.All[0].estado);
  t(r.buscados.length===1&&r.buscados[0].pedido==='600000131318758'&&r.buscados[0].estado==='Enviado','busqueda por orderNumber');
  t(r.buzon.sinLeer===1&&r.buzon.porResponder===2,'buzon: dos numeros');
  t(Array.isArray(r.casos)&&r.casos.length===2&&r.casos[0].folio==='17151504'&&r.casos[1].estado==='Trabajo en progreso'&&r.casos[0].estado==='New'&&/^\d{4}-\d{2}-\d{2}$/.test(r.casos[0].fecha),'casos de los ultimos 30 dias: '+JSON.stringify(r.casos));
  t(llamadas.every(l=>/^get_|^getAllCases$/.test(l.op)&&!/\bmutation\b/i.test(l.q)),'todas las llamadas son lecturas: '+llamadas.map(l=>l.op).join(','));
  t(llamadas.filter(l=>l.op==='get_orders_getAllOrders'&&l.v.params.orderGroups).length===4,'3 listas + 1 busqueda');
  /* sin sesion */
  ({ctx}=pagina({sesion:false}));r=await ctx.enSellerApi([]);
  t(r.sesion===false,'sin XSRF/TMX = sin sesion');
  /* pedidos fallan pero buzon y casos si */
  ({ctx}=pagina({fallaPedidos:true}));r=await ctx.enSellerApi([]);
  t(r.pedidos.Unshipped===null&&r.buzon.sinLeer===1&&Array.isArray(r.casos)&&r.errores.length>=3,'si fallan los pedidos, el buzon y los casos se leen igual');
  /* anti-bot */
  ({ctx}=pagina({antibot:true}));r=await ctx.enSellerApi([]);
  t(r.antibot===true&&r.pedidos.Unshipped===null,'anti-bot se marca');

  /* ---- 2) scApi / scCiclo con chrome simulado ---- */
  function simula({api,modo='ok'}){
    const mem={},posts=[],noop=()=>{},ev={addListener:noop,removeListener:noop};let tabsQ=0,ventanasQ=0,scriptCalls=0,conTabAbierta=false,creadas=[];
    const chromeSim={cookies:{onChanged:ev,get:async()=>null},alarms:{create:noop,onAlarm:ev},idle:{setDetectionInterval:noop,onStateChanged:ev},runtime:{onInstalled:ev,onStartup:ev,onMessage:ev,getPlatformInfo:async()=>({})},
      action:{setBadgeText:noop,setBadgeBackgroundColor:noop,setTitle:noop},
      storage:{local:{get:async(k)=>{const o={url:'https://script.google.com/macros/s/AKfycbTEST/exec',clave:'k'};return o},set:async(o)=>{Object.assign(mem,o)}}},
      tabs:{onUpdated:ev,query:async()=>conTabAbierta?[{id:99,status:'complete',url:'https://seller.walmart.com/home'}]:[],create:async(o)=>{creadas.push(o);return{id:7,windowId:1}},get:async()=>({id:7,status:'complete'}),update:async()=>{},remove:async()=>{tabsQ++}},
      windows:{getAll:async()=>modo==='sinventana'?[]:[{id:1}],create:async()=>({id:5,tabs:[{id:8}]}),remove:async()=>{ventanasQ++}},
      scripting:{executeScript:async(o)=>{scriptCalls++;if(o.world!=='MAIN')return[{result:{pendiente:true}}];return[{result:api}]}}};
    const sandbox={console,JSON,Date,Object,Array,String,Number,Math,isNaN,Promise,RegExp,parseFloat,Error,URL,TextEncoder,encodeURIComponent,Intl,
      chrome:chromeSim,setInterval:()=>0,clearInterval:noop,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,5)),clearTimeout,
      fetch:async(u,o)=>{const b=JSON.parse(o.body);posts.push(b);const r=b.accion==='seller_pendientes'?{ok:true,pedidos:['600000131318758']}:{ok:true,nuevas:1,cambios:0};return{status:200,text:async()=>JSON.stringify(r)}}};
    vm.createContext(sandbox);vm.runInContext(bg+';this.scCiclo=scCiclo;',sandbox);
    return {sandbox,mem,posts,info:()=>({tabsQ,ventanasQ,scriptCalls,creadas}),abrirTab:()=>{conTabAbierta=true}};
  }
  const apiOk={sesion:true,pedidos:{Unshipped:[{pedido:'600000134639589',orden:'609132498023060',fecha:'2026-11-19',envio:'2026-11-23',total:569,estado:'Nuevo'}],Canceled:[],All:[{pedido:'600000139241931',orden:'609132498036565',fecha:'2026-11-19',envio:'2026-11-23',total:2859,estado:'Enviado'}]},buscados:[{pedido:'600000131318758',orden:'1',fecha:'',envio:'',total:1,estado:'Enviado'}],buzon:{sinLeer:1,porResponder:2},casos:[{folio:'17151504',fecha:'2026-11-18',asunto:'x',estado:'New'}],errores:[],antibot:false};
  let S=simula({api:apiOk});
  let rr=await S.sandbox.scCiclo(true);
  const acc=S.posts.map(p=>p.accion+(p.grupo?':'+p.grupo:'')).join(',');
  t(rr.ok===true,'ciclo por API ok: '+JSON.stringify(rr));
  t(acc==='seller_pendientes,seller_pedidos:Unshipped,seller_pedidos:All,seller_pedidos:Busqueda,seller_buzon,seller_casos','envios al Sheet por API (la lista vacia Canceled no se manda): '+acc);
  const bz=S.posts.find(p=>p.accion==='seller_buzon');t(bz.sinLeer===1&&bz.porResponder===2,'buzon enviado');
  t(/pedidos leidos por API/.test(S.mem.estadoSC.texto)&&S.mem.estadoSC.ok===true&&/buzon: 1 sin leer/.test(S.mem.estadoSC.texto)&&/1 casos/.test(S.mem.estadoSC.texto),'estado: '+S.mem.estadoSC.texto);
  t(S.info().tabsQ===1&&S.info().creadas[0].active===false&&S.info().creadas[0].windowId===1,'abre una pestaña propia, sin foco, en la ventana existente, y la cierra');
  /* usa la pestaña ya abierta sin cerrarla */
  S=simula({api:apiOk});S.abrirTab();rr=await S.sandbox.scCiclo(true);
  t(rr.ok===true&&S.info().creadas.length===0&&S.info().tabsQ===0,'reutiliza la pestaña de Seller Center abierta y no la cierra');
  /* sin ventana: la abre minimizada y la cierra */
  S=simula({api:apiOk,modo:'sinventana'});rr=await S.sandbox.scCiclo(true);
  t(rr.ok===true&&S.info().ventanasQ===1,'sin ventana de Chrome: abre una minimizada y la cierra');
  /* sin sesion */
  S=simula({api:{sesion:false,errores:['x']}});rr=await S.sandbox.scCiclo(true);
  t(rr.error==='sin_sesion'&&/sin sesion.*2FA/.test(S.mem.estadoSC.texto)&&S.posts.filter(p=>p.accion==='seller_pedidos').length===0,'sin sesion: avisa del 2FA y no manda pedidos: '+S.mem.estadoSC.texto);
  /* anti-bot */
  S=simula({api:{sesion:true,pedidos:{Unshipped:null,Canceled:null,All:null},buscados:[],buzon:{sinLeer:null,porResponder:null},casos:null,errores:['x'],antibot:true}});rr=await S.sandbox.scCiclo(true);
  t(rr.error==='antibot'&&/anti-bot/.test(S.mem.estadoSC.texto),'anti-bot se avisa');
  /* pedidos fallan sin antibot: sigue la lectura por pantalla (respaldo) */
  S=simula({api:{sesion:true,pedidos:{Unshipped:null,Canceled:null,All:null},buscados:[],buzon:{sinLeer:null,porResponder:null},casos:null,errores:['x'],antibot:false}});rr=await S.sandbox.scCiclo(true);
  t(S.info().creadas.some(c=>c.url==='about:blank'),'si la API no sirve, usa la lectura por pantalla de respaldo');
  /* el Sheet contesta ocupado: pedidos no guardados, pero buzon y casos si */
  S=simula({api:apiOk});S.sandbox.fetch=async(u,o)=>{const b=JSON.parse(o.body);S.posts.push(b);const r=b.accion==='seller_pedidos'?{ok:false,error:'ocupado'}:(b.accion==='seller_pendientes'?{ok:true,pedidos:[]}:{ok:true});return{status:200,text:async()=>JSON.stringify(r)}};
  rr=await S.sandbox.scCiclo(true);
  t(rr.ok===false&&S.posts.some(p=>p.accion==='seller_buzon')&&S.posts.some(p=>p.accion==='seller_casos')&&/ocupado.*buzon/.test(S.mem.estadoSC.texto),'Sheet ocupado: igual manda el buzon y los casos: '+S.mem.estadoSC.texto);
  console.log('t87: '+ok+' ok'+(bad?', '+bad+' FALLAS':''));process.exit(bad?1:0);
})();
