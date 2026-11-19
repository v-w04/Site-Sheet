// t89: cancelar en Walmart (enWalmartCancelar / wmCancelCiclo) con un Seller Center SIMULADO. Nada real.
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const bg=fs.readFileSync(__dirname+'/../extension-cookie/background.js','utf8');
const ini=bg.indexOf('async function enWalmartCancelar'),fin=bg.indexOf('async function wmCancelCiclo');
t(ini>0&&fin>ini,'se aislo enWalmartCancelar');
const fn=bg.slice(ini,fin);
// ---- codigo: la unica escritura posible es cancelar una orden aprobada ----
t((fn.match(/mutation\s+[A-Za-z_]+/g)||[]).join()==='mutation update_orders_updateOrder','una sola mutacion en todo el codigo: '+(fn.match(/mutation\s+[A-Za-z_]+/g)||[]).join());
t(!/\.click\(|\.submit\(|dispatchEvent|XMLHttpRequest|execCommand|sendMessage|innerHTML/.test(fn),'sin clics, formularios ni escritura en la pagina');
t(/updatedStatus !== 'Canceled'/.test(fn)&&/permitidas\.includes/.test(fn)&&/MOTIVOS\.includes/.test(fn),'candado: solo Canceled, solo ordenes aprobadas, solo motivos conocidos');
t(/SELLER_REJECTION/.test(fn)&&/MIRAKL_REFUND_45/.test(fn)&&!/MIRAKL_REFUND_15|SELLER_CANCEL_/.test(fn),'solo Rechazar y Error de precio');
// ---- Seller Center simulado con estado ----
function servidor(ordenes,{muta='ok',sinSesion=false,antibot=false,verifica=true}={}){
  const llam=[];const est=JSON.parse(JSON.stringify(ordenes));   // {po:{lineas:[{lineId,primeLineNo,poLineStatus,quantity}],wcp,grupo}}
  const cuerpo=(po,o)=>({customerOrderId:'60000'+po.slice(-8),purchaseOrderId:po,isWCPOrder:o.wcp===true,poLines:o.lineas});
  const lista=g=>Object.keys(est).filter(po=>{const c=est[po].lineas.every(l=>/cancel/i.test(l.poLineStatus));const env=est[po].lineas.some(l=>/ship|deliver/i.test(l.poLineStatus));
    if(g==='Unshipped')return !c&&!env;if(g==='Canceled')return c;return true}).map(po=>cuerpo(po,est[po]));
  const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,isFinite,RegExp,Promise,Error,Intl,Set,
    setTimeout:(f)=>setTimeout(f,0),document:{cookie:sinSesion?'':'XSRF-TOKEN=abc'},localStorage:{getItem:()=>sinSesion?'{}':JSON.stringify({ev1:{tmxId:'tmx1'}})},
    crypto:{getRandomValues:a=>{a.fill(1);return a},randomUUID:()=>'uuid'},
    fetch:async(ruta,o)=>{
      const b=JSON.parse(o.body);llam.push({ruta,op:o.headers.pxqueryname,q:b.query,v:b.variables});
      const j=x=>({status:200,text:async()=>JSON.stringify(x)});
      if(antibot)return{status:403,text:async()=>'px-captcha'};
      if(/get_orders_getAllOrders/.test(b.query))return j({data:{get_orders_getAllOrders:{orderInfo:{purchaseOrders:lista(b.variables.params.orderGroups)}}}});
      if(/update_orders_updateOrder/.test(b.query)){
        if(muta==='errores')return j({errors:[{message:'ORDER_NOT_CANCELLABLE'}]});
        if(muta==='errorList')return j({data:{update_orders_updateOrder:{poUpdateResponseStatus:[{poNumber:b.variables.input[0].poNumber,updateResponsePoLineList:[],errorList:['No se puede cancelar']}]}}});
        if(muta==='vacio')return j({data:{update_orders_updateOrder:null}});
        const po=b.variables.input[0].poNumber;
        if(verifica)est[po].lineas.forEach(l=>{l.poLineStatus='Canceled'});
        return j({data:{update_orders_updateOrder:{poUpdateResponseStatus:[{poNumber:po,updateResponsePoLineList:[{status:'SUCCESS'}],errorList:[]}]}}});
      }
      return j({errors:[{message:'desconocida'}]});
    }};
  vm.createContext(ctx);vm.runInContext('globalThis.enWalmartCancelar='+fn.replace(/^async function enWalmartCancelar/,'(async function enWalmartCancelar')+')',ctx);
  return {ctx,llam,est};
}
const L=(s)=>[{lineId:['1'],primeLineNo:[],poLineStatus:s,quantity:1}];
const muts=S=>S.llam.filter(l=>/update_orders_updateOrder/.test(l.q));
(async()=>{
  // 1) orden nueva: Rechazar (SELLER_REJECTION), se verifica y queda cancelada
  let S=servidor({'609132498200':{lineas:L('New'),wcp:true}});
  let r=await S.ctx.enWalmartCancelar(['609132498200']);
  t(r.sesion&&r.resultados.length===1&&r.resultados[0].resultado==='cancelada'&&r.resultados[0].motivo==='SELLER_REJECTION','nueva -> Rechazar, cancelada y verificada: '+JSON.stringify(r.resultados));
  const m=muts(S);t(m.length===1&&m[0].op==='update_orders_updateOrder'&&m[0].ruta==='/aurora/v2/auroraOrderService/gql','una sola llamada de cancelacion, mismo servicio y operacion que la pagina');
  const inp=m[0].v.input[0];t(inp.poNumber==='609132498200'&&inp.isWCPOrder===true&&inp.poLineRequestDTOList.length===1&&inp.poLineRequestDTOList[0].updatedStatus==='Canceled'&&inp.poLineRequestDTOList[0].cancelationReasonEnum==='SELLER_REJECTION'&&inp.poLineRequestDTOList[0].updatedQuantity===1&&JSON.stringify(inp.poLineRequestDTOList[0].lineIds)==='["1"]','cuerpo igual al de la pagina: '+JSON.stringify(inp));
  // 2) aceptada: la pagina ya no ofrece Rechazar -> Error de precio
  S=servidor({'609132498201':{lineas:L('Acknowledged')}});r=await S.ctx.enWalmartCancelar(['609132498201']);
  t(r.resultados[0].resultado==='cancelada'&&r.resultados[0].motivo==='MIRAKL_REFUND_45','aceptada -> Error de precio: '+JSON.stringify(r.resultados));
  // 3) ya cancelada: no toca nada
  S=servidor({'609132498202':{lineas:L('Canceled')}});r=await S.ctx.enWalmartCancelar(['609132498202']);
  t(r.resultados[0].resultado==='ya_cancelada'&&muts(S).length===0,'ya cancelada en Walmart: se avisa y NO se manda ninguna cancelacion');
  // 4) enviada: no cancelable, sin tocar
  S=servidor({'609132498203':{lineas:L('Shipped')}});r=await S.ctx.enWalmartCancelar(['609132498203']);
  t(r.resultados[0].resultado==='no_cancelable'&&/Shipped/.test(r.resultados[0].detalle)&&muts(S).length===0,'enviada: no cancelable, sin llamada: '+JSON.stringify(r.resultados));
  // 5) mixta (una enviada, otra nueva): no se toca
  S=servidor({'609132498204':{lineas:[{lineId:['1'],primeLineNo:[],poLineStatus:'Shipped',quantity:1},{lineId:['2'],primeLineNo:[],poLineStatus:'New',quantity:1}]}});r=await S.ctx.enWalmartCancelar(['609132498204']);
  t(muts(S).length===0&&r.resultados[0].resultado==='no_cancelable','orden con una linea ya enviada: no se cancela');
  // 6) no existe
  S=servidor({});r=await S.ctx.enWalmartCancelar(['609132498205']);t(r.resultados[0].resultado==='no_cancelable'&&/no aparece/.test(r.resultados[0].detalle)&&muts(S).length===0,'no aparece en Seller Center: no cancelable');
  // 7) varias lineas: se cancelan todas las sin enviar
  S=servidor({'609132498206':{lineas:[{lineId:['1'],primeLineNo:[],poLineStatus:'New',quantity:2},{lineId:['2'],primeLineNo:[],poLineStatus:'New',quantity:1}]}});r=await S.ctx.enWalmartCancelar(['609132498206']);
  t(r.resultados[0].resultado==='cancelada'&&muts(S)[0].v.input[0].poLineRequestDTOList.length===2&&muts(S)[0].v.input[0].poLineRequestDTOList[0].updatedQuantity===2,'dos lineas: se cancelan completas');
  // 8) Walmart rechaza (errors / errorList / respuesta vacia): error, y la vuelta se detiene (la segunda NO se toca)
  for(const modo of ['errores','errorList','vacio']){
    S=servidor({'609132498207':{lineas:L('New')},'609132498208':{lineas:L('New')}},{muta:modo,verifica:false});
    r=await S.ctx.enWalmartCancelar(['609132498207','609132498208']);
    t(r.resultados.length===1&&r.resultados[0].resultado==='error'&&r.resultados[0].detalle&&muts(S).length===1,'Walmart responde mal ('+modo+'): error y la vuelta SE DETIENE: '+JSON.stringify(r.resultados));
  }
  // 9) la mutacion "salio bien" pero no queda cancelada: error de verificacion
  S=servidor({'609132498209':{lineas:L('New')}},{verifica:false});r=await S.ctx.enWalmartCancelar(['609132498209']);
  t(r.resultados[0].resultado==='error'&&/no pude verificar/.test(r.resultados[0].detalle),'sin verificacion no se da por cancelada: '+JSON.stringify(r.resultados));
  // 10) la primera sale bien y la segunda ya estaba cancelada: las dos reportadas
  S=servidor({'609132498210':{lineas:L('New')},'609132498211':{lineas:L('Canceled')}});r=await S.ctx.enWalmartCancelar(['609132498210','609132498211']);
  t(r.resultados.map(x=>x.resultado).join()==='cancelada,ya_cancelada','varias: '+r.resultados.map(x=>x.resultado));
  // 11) solo cancela lo aprobado: ordenes con basura se descartan y nunca mas de 5
  S=servidor({'609132498212':{lineas:L('New')},'609132498213':{lineas:L('New')}});r=await S.ctx.enWalmartCancelar(['abc','609132498212; drop','','609132498212']);
  t(r.resultados.length===1&&r.resultados[0].orden==='609132498212'&&muts(S).length===1&&muts(S)[0].v.input[0].poNumber==='609132498212','solo ordenes validas; la 609132498213 (no pedida) NO se toca');
  const seis={};for(let i=0;i<7;i++)seis['60913249930'+i]={lineas:L('New')};S=servidor(seis);r=await S.ctx.enWalmartCancelar(Object.keys(seis));
  t(r.resultados.length===5&&muts(S).length===5,'maximo 5 por vuelta: '+r.resultados.length);
  // 12) sin sesion y anti-bot
  S=servidor({'609132498214':{lineas:L('New')}},{sinSesion:true});r=await S.ctx.enWalmartCancelar(['609132498214']);t(r.sesion===false&&S.llam.length===0,'sin sesion: no llama a nada');
  S=servidor({'609132498215':{lineas:L('New')}},{antibot:true});r=await S.ctx.enWalmartCancelar(['609132498215']);t(r.resultados[0].resultado==='error'&&/anti-bot/.test(r.resultados[0].detalle)&&muts(S).length===0,'anti-bot: error y no cancela: '+JSON.stringify(r.resultados));
  // 13) todas las lecturas usan la misma consulta; ningun otro nombre de operacion
  S=servidor({'609132498216':{lineas:L('New')}});await S.ctx.enWalmartCancelar(['609132498216']);
  t(S.llam.every(l=>l.op===(/mutation/.test(l.q)?'update_orders_updateOrder':'get_orders_getAllOrders')),'pxqueryname siempre coincide con la operacion');

  /* ---- wmCancelCiclo con chrome simulado ---- */
  function simula({pend,api,modo='ok'}){
    const mem={},posts=[],noop=()=>{},ev={addListener:noop,removeListener:noop};let scripts=0,cerradas=0,creadas=[];
    const chromeSim={cookies:{onChanged:ev,get:async()=>null},alarms:{create:noop,get:async()=>null,getAll:async()=>[],onAlarm:ev},idle:{setDetectionInterval:noop,onStateChanged:ev},runtime:{onInstalled:ev,onStartup:ev,onMessage:ev,getPlatformInfo:async()=>({})},
      action:{setBadgeText:noop,setBadgeBackgroundColor:noop,setTitle:noop},
      storage:{local:{get:async()=>({url:'https://script.google.com/macros/s/AKfycbTEST/exec',clave:'k'}),set:async(o)=>{Object.assign(mem,o)}}},
      tabs:{onUpdated:ev,query:async()=>[],create:async(o)=>{creadas.push(o);return{id:7,windowId:1}},get:async()=>({id:7,status:'complete'}),update:async()=>{},remove:async()=>{cerradas++}},
      windows:{getAll:async()=>[{id:1}],create:async()=>({id:5,tabs:[{id:8}]}),remove:async()=>{}},
      scripting:{executeScript:async(o)=>{scripts++;if(o.func.name!=='enWalmartCancelar')return[{result:{pendiente:true}}];posts.push({accion:'EJECUTA',args:o.args});return[{result:api}]}}};
    const sandbox={console,JSON,Date,Object,Array,String,Number,Math,isNaN,Promise,RegExp,parseFloat,Error,URL,TextEncoder,encodeURIComponent,Intl,
      chrome:chromeSim,setInterval:()=>0,clearInterval:noop,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,5)),clearTimeout,
      fetch:async(u,o)=>{const b=JSON.parse(o.body);posts.push(b);const r=b.accion==='wm_cancel_pendientes'?pend:{ok:true};return{status:200,text:async()=>JSON.stringify(r)}}};
    vm.createContext(sandbox);vm.runInContext(bg+';this.wmCancelCiclo=wmCancelCiclo;',sandbox);
    return {sandbox,mem,posts,info:()=>({scripts,cerradas,creadas})};
  }
  // sin pendientes: no abre nada
  let C=simula({pend:{ok:true,ordenes:[]},api:null});let rc=await C.sandbox.wmCancelCiclo(true);
  t(rc.ok&&C.info().scripts===0&&C.info().creadas.length===0&&/Sin cancelaciones pendientes/.test(C.mem.estadoWM.texto),'sin pendientes: no abre Seller Center');
  C=simula({pend:{ok:true,ordenes:[],nota:'pausado'},api:null});await C.sandbox.wmCancelCiclo(true);t(/pausa/i.test(C.mem.estadoWM.texto)&&C.info().scripts===0,'en pausa: no abre nada y lo dice');
  // con pendientes: ejecuta y reporta cada resultado al Sheet
  C=simula({pend:{ok:true,ordenes:['609132498200','609132498201']},api:{sesion:true,resultados:[{orden:'609132498200',resultado:'cancelada',motivo:'SELLER_REJECTION'},{orden:'609132498201',resultado:'ya_cancelada'}]}});
  rc=await C.sandbox.wmCancelCiclo(true);
  const env=C.posts.filter(p=>p.accion==='EJECUTA');t(env.length===1&&env[0].args[0].join()==='609132498200,609132498201','manda a Seller Center solo las ordenes que dijo el Sheet');
  const rep=C.posts.filter(p=>p.accion==='wm_cancel_resultado');t(rep.length===2&&rep[0].orden==='609132498200'&&rep[0].resultado==='cancelada'&&rep[0].motivo==='SELLER_REJECTION'&&rep[1].resultado==='ya_cancelada','reporta cada resultado al Sheet');
  t(rc.ok&&/2 marcada/.test(C.mem.estadoWM.texto)&&C.info().cerradas===1,'estado ok y cierra la pestaña propia: '+C.mem.estadoWM.texto);
  // falla
  C=simula({pend:{ok:true,ordenes:['609132498200']},api:{sesion:true,resultados:[{orden:'609132498200',resultado:'error',detalle:'Walmart respondio: x'}]}});rc=await C.sandbox.wmCancelCiclo(true);
  t(rc.ok===false&&C.mem.estadoWM.ok===false&&/cancelalas a mano/.test(C.mem.estadoWM.texto)&&C.posts.some(p=>p.accion==='wm_cancel_resultado'&&p.resultado==='error'&&/Walmart respondio/.test(p.detalle)),'falla: se reporta al Sheet y el estado sale en rojo: '+C.mem.estadoWM.texto);
  // sin sesion
  C=simula({pend:{ok:true,ordenes:['609132498200']},api:{sesion:false,resultados:[]}});rc=await C.sandbox.wmCancelCiclo(true);
  t(rc.error==='sin_sesion'&&/2FA/.test(C.mem.estadoWM.texto)&&C.posts.some(p=>p.accion==='wm_cancel_resultado'&&p.resultado==='sin_sesion'),'sin sesion: avisa y no marca nada como cancelado');
  // el Sheet no autoriza
  C=simula({pend:{ok:false,error:'no_autorizado'},api:null});rc=await C.sandbox.wmCancelCiclo(true);t(rc.ok===false&&/Clave incorrecta/.test(C.mem.estadoWM.texto)&&C.info().scripts===0,'clave incorrecta: no hace nada');
  // ordenes con basura que mande el Sheet se descartan
  C=simula({pend:{ok:true,ordenes:['abc','609132498200 ','609132498200; x']},api:{sesion:true,resultados:[]}});await C.sandbox.wmCancelCiclo(true);
  const e2=C.posts.find(p=>p.accion==='EJECUTA');t(!e2||e2.args[0].every(x=>/^\d{9,20}$/.test(x)),'solo digitos llegan a Seller Center');
  console.log('t89: '+ok+' ok'+(bad?', '+bad+' FALLAS':''));process.exit(bad?1:0);
})();
