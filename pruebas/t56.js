// t56: Pedidos en riesgo por falta de embarque: tabla del correo, union de avisos, situacion y cruce con ventas/cancelaciones.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp,parseFloat};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
ctx.TZ='America/Mexico_City';ctx.VH_HOJA='Ventas Walmart';ctx.CAN_HOJA='Cancelaciones';
ctx.normEnc_=x=>String(x==null?'':x).trim().toUpperCase();
ctx.Utilities={formatDate:(d,tz,f)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
ctx.logs=[];ctx.logOk_=(e,m)=>ctx.logs.push('OK '+m);ctx.logWarn_=(e,m)=>ctx.logs.push('WARN '+m);ctx.logInfo_=()=>{};ctx.avisoDia_=()=>{};
ctx.sha256_=s=>'h'+String(s).length+':'+String(s);
const props={};ctx.vdProp_=k=>props[k]||'';ctx.vdSetProp_=(k,v)=>{props[k]=v};
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/PedidosRiesgo.gs','utf8'),ctx);
const R=(code)=>vm.runInContext(code,ctx);

/* ---- 1. tabla del correo ---- */
const celda=(x)=>'<td style="border:1px solid #000">'+x+'</td>';
const fila=(a)=>'<tr>'+a.map(celda).join('')+'</tr>';
const html='<html><body><p>Hola</p><table><tr><th>Orden de<br>compra#</th><th>Pedido#</th><th>SKU</th><th>Fecha<br>del pedido</th><th>Fecha<br>estimad<br>a de<br>envío</th><th>Fecha<br>estimad<br>a de<br>entrega</th><th>Total del<br>pedido</th></tr>'+
 fila(['6091301892<br>55859','6000001313<br>18758-1-1','son-<br>cfi2015japon<br>-gri&hellip;','2026-10-27T16:15:32 ....','2026-10-31T19:00:00 ....','2026-10-31T19:00:00 ....','15999.0000<br>000'])+
 fila(['6091301892 89078','600000127458333-1-1','4201188','2026-10-27T18:29:21','2026-11-03T20:00:00','2026-11-03T20:00:00','4959.0000000'])+
 '</table><ol><li>Visite la pestaña</li></ol></body></html>';
ctx.H=html;
const f=R('prParsearHtml_(H)');
t(f.length===2,'dos filas: '+f.length);
t(f[0].orden==='609130189255859'&&f[0].pedido==='600000131318758-1-1','orden y pedido sin espacios: '+f[0].orden+' '+f[0].pedido);
t(f[0].total===15999&&f[1].total===4959,'total numerico');
t(f[0].fechaPedido.getFullYear()===2026&&f[0].fechaPedido.getMonth()===9&&f[0].fechaPedido.getDate()===27,'fecha del pedido');
t(f[0].envioEst.getDate()===31&&f[1].envioEst.getMonth()===10&&f[1].envioEst.getDate()===3,'fecha estimada de envio (no la de entrega)');
t(f[1].sku==='4201188','sku numerico');
/* columnas en otro orden: se lee por encabezado */
ctx.H2='<table><tr><td>SKU</td><td>Total del pedido</td><td>Orden de compra#</td><td>Pedido#</td><td>Fecha del pedido</td><td>Fecha estimada de envío</td><td>Fecha estimada de entrega</td></tr><tr><td>abc</td><td>10.5</td><td>609130189255859</td><td>600000131318758-1-1</td><td>2026-10-27</td><td>2026-10-31</td><td>2026-11-01</td></tr></table>';
const g=R('prParsearHtml_(H2)');
t(g.length===1&&g[0].orden==='609130189255859'&&g[0].sku==='abc'&&g[0].total===10.5&&g[0].envioEst.getDate()===31,'columnas movidas: '+JSON.stringify(g));
ctx.H3='<p>sin tabla</p><table><tr><td>123</td></tr></table>';
t(R('prParsearHtml_(H3)').length===0,'sin encabezado de la tabla no inventa filas');
ctx.T='Tienes 1 pedido. 609130189255859 600000131318758-1-1 son-cfi 2026-10-27';
t(R('prParsearTexto_(T)').length===1,'plan B por texto');

/* ---- 2. union de avisos ---- */
const d1=new Date(2026,10,10,18,2),d2=new Date(2026,10,11,18,4);
ctx.L=[{fecha:d1,filas:[{orden:'1',pedido:'p1',sku:'a',total:1},{orden:'2',pedido:'p2',sku:'b',total:2}]},{fecha:d2,filas:[{orden:'1',pedido:'p1',sku:'a2',total:1}]}];
const u=R('prUnir_(L)');
t(u.por['1'].avisos===2&&u.por['1'].primero===d1.getTime()&&u.por['1'].ultimo===d2.getTime(),'orden 1: dos avisos, primero y ultimo');
t(u.por['2'].avisos===1&&u.por['2'].ultimo===d1.getTime(),'orden 2: un aviso');
t(u.ultimaFecha===d2.getTime(),'fecha del correo mas reciente');

/* ---- 3. situacion y accion ---- */
const hoy=new Date(2026,10,12),ayer=new Date(2026,10,11),manana=new Date(2026,10,14);
const S=(o)=>{ctx.O=Object.assign({enVentas:true,estatus:'Created',guia:false,odooCancelada:false,envioEst:manana,hoy:hoy},o);return R('prSituacion_(O)')};
t(S({enVentas:false}).sit==='NO ESTA EN VENTAS','no esta en ventas');
t(S({estatus:'Cancelled'}).sit==='CANCELADA EN WALMART'&&S({estatus:'Cancelled'}).accion==='','cancelada en Walmart: sin accion');
t(S({odooCancelada:true}).sit==='CANCELADA EN ODOO'&&S({odooCancelada:true}).accion==='Cancelar en Walmart','cancelada en Odoo: falta Walmart');
t(/Walmart dice Enviado/.test(S({odooCancelada:true,estatus:'Shipped'}).accion),'cancelada en Odoo pero Walmart dice Enviado');
t(S({estatus:'Shipped',guia:true}).sit==='ENVIADA CON GUIA','enviada con guia');
t(S({estatus:'Shipped'}).sit==='ENVIADA SIN GUIA'&&/guía/.test(S({estatus:'Shipped'}).accion),'enviada sin guia: abrir caso');
t(S({guia:true}).sit==='CON GUIA, FALTA MARCAR EMBARCADO','con guia sin embarcar');
t(S({envioEst:ayer}).sit==='VENCIDA SIN ENVIAR','vencida');
t(S({}).sit==='POR ENVIAR'&&S({}).accion==='Embarcar antes del 14/11','por enviar con fecha: '+S({}).accion);
t(S({envioEst:hoy}).sit==='POR ENVIAR','vence hoy: aun por enviar');

/* ---- 4. flujo completo con hojas simuladas ---- */
function hoja(enc,filas){const h={enc:enc.slice(),filas:filas||[],maxRows:100};
 h.getLastRow=()=>h.filas.length+1;h.getLastColumn=()=>h.enc.length;h.getMaxRows=()=>h.maxRows;h.getFrozenRows=()=>1;h.setFrozenRows=()=>{};h.activate=()=>{};
 h.getConditionalFormatRules=()=>[];h.setConditionalFormatRules=()=>{};
 h.getRange=(r,c,nr,nc)=>{nr=nr||1;nc=nc||1;return{
  getValues:()=>r===1?[h.enc.slice(c-1,c-1+nc)]:Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>{const row=h.filas[r-2+i];return row&&row[c-1+j]!==undefined?row[c-1+j]:''})),
  setValues:(v)=>{v.forEach((row,i)=>{const k=r-2+i;h.filas[k]=h.filas[k]||[];row.forEach((x,j)=>{h.filas[k][c-1+j]=x})})},
  setValue:(x)=>{const k=r-2;h.filas[k]=h.filas[k]||[];h.filas[k][c-1]=x}}};
 return h}
const libro={};
const regla={setRanges:()=>regla,whenTextEqualTo:()=>regla,setBackground:()=>regla,build:()=>({})};
ctx.SpreadsheetApp={newConditionalFormatRule:()=>regla};
ctx.vdLibro_=()=>({getSheetByName:n=>libro[n]||null});
ctx.peHojaAsegurar_=(n,enc)=>{if(!libro[n])libro[n]=hoja(enc);return libro[n]};
ctx.ubicarColumnas_=(h,enc)=>{const col={};enc.forEach(e=>{let i=h.enc.map(x=>String(x).toUpperCase()).indexOf(e.toUpperCase());if(i<0){h.enc.push(e);i=h.enc.length-1}col[e.toUpperCase()]=i+1});return{col}};
ctx.escrCol_=(m,e)=>m.col[ctx.normEnc_(e)]||0;
ctx.peTabla_=(n)=>{const h=libro[n];if(!h)return null;const pos={};h.enc.forEach((x,i)=>{const k=ctx.normEnc_(x);if(k&&pos[k]===undefined)pos[k]=i});
 return{enc:h.enc,pos,filas:h.filas.map(f=>h.enc.map((_,i)=>f[i]===undefined?'':f[i]))}};
ctx.peCol_=(tb,ns)=>{for(const n of ns){const j=tb.pos[ctx.normEnc_(n)];if(j!==undefined)return j}return -1};
ctx.peAgregar_=(h,enc,filas)=>{const m=ctx.ubicarColumnas_(h,enc);filas.forEach(x=>{const row=[];enc.forEach(e=>{row[m.col[e.toUpperCase()]-1]=x[e]===undefined?'':x[e]});h.filas.push(row)})};
libro['Ventas Walmart']=hoja(['FOLIO','ORDEN ID','ESTATUS','TRACKING','ENVIO GUIA','ODOO ESTADO','SKU'],[
 [609130189255859,609130189255859,'Shipped','','','cancel','SON-CFI2015JAPON-GRI-4392-MSI'],
 [609130189289078,609130189289078,'Created','','MXFDD123','sale','ABC'],
 [609131111111111,609131111111111,'Created','','','sale','XYZ']]);
libro['Cancelaciones']=hoja(['ORDEN DE COMPRA#','ESTADO ODOO'],[[609131111111111,'CANCELADO EN SITE']]);
const asunto='Pedidos en riesgo por falta de embarque - Walmart Marketplace';
const msg=(fecha,html)=>({getSubject:()=>asunto,getBody:()=>html,getPlainBody:()=>'',getDate:()=>fecha});
const htmlA=(ords)=>'<table><tr><td>Orden de compra#</td><td>Pedido#</td><td>SKU</td><td>Fecha del pedido</td><td>Fecha estimada de envío</td><td>Fecha estimada de entrega</td><td>Total del pedido</td></tr>'+ords.map(o=>'<tr><td>'+o+'</td><td>6000001-1-1</td><td>sku</td><td>2026-10-27T10:00:00</td><td>2026-10-31T19:00:00</td><td>2026-11-02</td><td>100.0</td></tr>').join('')+'</table>';
let correos=[msg(new Date(2026,10,10,18,2),htmlA(['609130189255859','609130189289078','609131111111111'])),msg(new Date(2026,10,11,18,4),htmlA(['609130189255859']))];
ctx.GmailApp={search:()=>[{getMessages:()=>correos}]};
let r=R('prCorrida_()');
const h=libro['Pedidos en riesgo'],c=(e)=>h.enc.indexOf(e);
t(h.filas.length===3,'3 ordenes en la hoja: '+h.filas.length);
const por=(o)=>h.filas.find(x=>String(x[c('ORDEN DE COMPRA')]).replace(/\D/g,'')===o);
const a=por('609130189255859'),b=por('609130189289078'),z=por('609131111111111');
t(a[c('AVISOS')]===2&&a[c('EN CORREO')]==='SI','la del ultimo correo: 2 avisos, EN CORREO SI');
t(b[c('AVISOS')]===1&&b[c('EN CORREO')]==='NO','la que ya no sale en el ultimo correo: EN CORREO NO');
t(a[c('SITUACION')]==='CANCELADA EN ODOO'&&/Walmart dice Enviado/.test(a[c('ACCION')]),'cruce: Odoo cancelada y Walmart Shipped: '+a[c('SITUACION')]);
t(b[c('SITUACION')]==='CON GUIA, FALTA MARCAR EMBARCADO'&&b[c('GUIA')]==='SI','cruce: con guia sin embarcar');
t(z[c('SITUACION')]==='CANCELADA EN ODOO'&&z[c('ODOO')]==='CANCELADA','cruce con Cancelaciones (CANCELADO EN SITE)');
t(/Pedidos en riesgo/.test(ctx.logs.join('|')),'escribe al Log cuando algo cambio');
const nl=ctx.logs.length;
R('prCorrida_()');
t(h.filas.length===3&&ctx.logs.length===nl,'segunda corrida igual: sin filas nuevas y sin ruido en el Log '+h.filas.length+' '+JSON.stringify(ctx.logs.slice(nl)));
/* correo nuevo con una orden nueva y avisos extra */
correos.push(msg(new Date(2026,10,12,6,0),htmlA(['609130189255859','609139999999999'])));
R('prCorrida_()');
t(h.filas.length===4,'orden nueva se agrega: '+h.filas.length);
t(por('609130189255859')[c('AVISOS')]===3&&por('609139999999999')[c('SITUACION')]==='NO ESTA EN VENTAS','avisos suben a 3; orden sin venta marcada');
t(por('609130189289078')[c('EN CORREO')]==='NO','sigue fuera del correo mas reciente');
/* sin correos */
correos=[];ctx.GmailApp={search:()=>[]};
const r0=R('prCorrida_()');t(r0.ordenes===0&&h.filas.length===4,'sin correos no toca la hoja');
console.log('t56: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
