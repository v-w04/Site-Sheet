// Cancelaciones por precio erroneo (CancelacionesPrecio.gs) y cancelar en Walmart por API (CancelacionesWalmart.gs). Datos simulados.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,encodeURIComponent};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
ctx.normEnc_=x=>String(x).trim().toUpperCase();
ctx.CAN_ORIGEN='ORIGEN';ctx.CAN_SKU_COMPLETO='SKU COMPLETO';ctx.CAN_NOTA='NOTA ODOO';ctx.CAN_CHECK='CANCELAR EN ODOO';
ctx.canErr_=m=>{const e=new Error(m);e.canSeguro=true;return e};
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m)=>logs.push([k,m]));
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesPrecio.gs','utf8'),ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesWalmart.gs','utf8'),ctx);
// --- filas de precio erroneo ---
const enc=['ORIGEN','FECHA LECTURA','FECHA CORREO','ID CORREO','ORDEN DE COMPRA#','PEDIDO#','SKU COMPLETO','QTY.','CANCELAR EN ODOO','NOTA ODOO'];
const mapa={};enc.forEach((e,i)=>mapa[e]=i+1);
const F=vm.runInContext('canpFilas_',ctx);
const ventas=[{orden:'609130991595561',pedido:'600000136',sku:'MIC-1',piezas:1,precio:16789,minimo:22509,pct:-0.254},{orden:'609130991595561',pedido:'x',sku:'MIC-1',piezas:1,precio:1,minimo:2,pct:-0.5},{orden:'609130000000002',pedido:'',sku:'AAA',piezas:2,precio:900,minimo:1000,pct:-0.1}];
const r=F(ventas,mapa,enc.length,{'609130000000002':true},new Date(2026,10,4),new Date(2026,10,4));
t(r.filas.length===1&&r.ordenes[0]==='609130991595561','agrega la nueva, no repite la que ya esta ni la duplicada');
t(r.yaEstaban===2,'cuenta las que ya estaban');
t(r.filas[0][0]==='PRECIO ERRONEO'&&r.filas[0][8]===false,'ORIGEN PRECIO ERRONEO y casilla de Odoo APAGADA');
t(/25\.4% abajo/.test(r.filas[0][9])&&/16789/.test(r.filas[0][9]),'la nota dice precio, minimo y % abajo: '+r.filas[0][9]);
t(r.filas[0][4]==='609130991595561'&&r.filas[0][6]==='MIC-1','orden y SKU en su columna');
// --- Walmart API ---
const L=vm.runInContext('wmcLineas_',ctx);
const orden1={order:{purchaseOrderId:'6091',orderLines:{orderLine:[{lineNumber:'1',orderLineStatuses:{orderLineStatus:[{status:'Created',statusQuantity:{unitOfMeasurement:'EACH',amount:'1'}}]}}]}}};
t(JSON.stringify(L(orden1))==='[{"n":"1","estado":"created","cant":"1"}]','lee lineas de una orden');
const orden2={list:{elements:{order:[{orderLines:{orderLine:{lineNumber:'2',orderLineStatuses:{orderLineStatus:{status:'Shipped',statusQuantity:{amount:'3'}}}}}}]}}};
t(L(orden2)[0].estado==='shipped'&&L(orden2)[0].cant==='3','acepta envoltorio y objetos sueltos');
t(L(null).length===0&&L({}).length===0,'sin lineas no truena');
const cu=vm.runInContext('wmcCuerpo_',ctx)([{n:'1',cant:'2'}]);
const ln=cu.orderCancellation.orderLines.orderLine[0];
t(ln.lineNumber==='1'&&ln.orderLineStatuses.orderLineStatus[0].status==='Cancelled'&&ln.orderLineStatuses.orderLineStatus[0].cancellationReason==='SELLER_REJECTION'&&ln.orderLineStatuses.orderLineStatus[0].statusQuantity.amount==='2','cuerpo del cancel con motivo SELLER_REJECTION y cantidad');
// llamadas simuladas
let llamadas=[],estado='created',tokenCode=200;
const cache={};ctx.CacheService={getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v},remove:k=>{delete cache[k]}})};
const props={WALMART_API_CLIENT_ID:'id1',WALMART_API_CLIENT_SECRET:'sec1'};ctx.props_=()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}});
ctx.Utilities={getUuid:()=>'guid',base64Encode:s=>Buffer.from(s).toString('base64')};
ctx.UrlFetchApp={fetch:(url,o)=>{llamadas.push({url,o});
  const rsp=(c,b)=>({getResponseCode:()=>c,getContentText:()=>typeof b==='string'?b:JSON.stringify(b)});
  if(/\/v3\/token$/.test(url))return tokenCode===200?rsp(200,{access_token:'TOK',expires_in:900}):rsp(401,'no');
  if(/\/cancel$/.test(url))return rsp(200,{order:{}});
  if(/\/v3\/orders\/404/.test(url))return rsp(404,'x');
  return rsp(200,{order:{orderLines:{orderLine:[{lineNumber:'1',orderLineStatuses:{orderLineStatus:[{status:estado,statusQuantity:{amount:'1'}}]}}]}}});}};
let c=vm.runInContext("wmcCancelar_('6091')",ctx);
t(c.ok&&/1 linea/.test(c.texto),'cancela una orden Created');
const post=llamadas.find(x=>/\/cancel$/.test(x.url));
t(post&&post.o.headers['WM_SEC.ACCESS_TOKEN']==='TOK'&&post.o.headers['WM_MARKET']==='mx'&&post.o.headers['WM_GLOBAL_VERSION']==='3.1','headers: token, mercado mx y version global');
const tok=llamadas.find(x=>/\/v3\/token$/.test(x.url));
t(tok.o.headers.Authorization==='Basic '+Buffer.from('id1:sec1').toString('base64')&&tok.o.payload.grant_type==='client_credentials','el token se pide con Basic y client_credentials');
const nTok=llamadas.filter(x=>/token$/.test(x.url)).length;vm.runInContext("wmcCancelar_('6091')",ctx);
t(llamadas.filter(x=>/token$/.test(x.url)).length===nTok,'el token se reutiliza (cache)');
estado='shipped';llamadas=[];c=vm.runInContext("wmcCancelar_('6091')",ctx);
t(!c.ok&&/Sin lineas cancelables/.test(c.texto)&&!llamadas.some(x=>/\/cancel$/.test(x.url)),'una orden ya enviada NO se cancela (no llama al cancel)');
estado='cancelled';c=vm.runInContext("wmcCancelar_('6091')",ctx);
t(c.ok&&c.ya,'ya cancelada en Walmart: se da por buena sin llamar al cancel');
c=vm.runInContext("wmcCancelar_('404')",ctx);
t(!c.ok&&/no encuentra/.test(c.texto),'orden que Walmart no encuentra');
delete cache.WMC_TOKEN;tokenCode=401;
let err='';try{vm.runInContext("wmcCancelar_('6091')",ctx)}catch(e){err=e.message}
t(/Client ID/.test(err),'sin token: error claro, sin credenciales en el texto');
t(!/sec1/.test(err),'el secreto nunca sale en un mensaje');
props.WALMART_API_CLIENT_SECRET='';tokenCode=200;delete cache.WMC_TOKEN;err='';try{vm.runInContext("wmcCancelar_('6091')",ctx)}catch(e){err=e.message}
t(/Faltan las credenciales/.test(err),'sin credenciales guardadas: avisa');
console.log('t46: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
