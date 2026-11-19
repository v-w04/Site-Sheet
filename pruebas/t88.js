// t88: CancelacionesWalmartAuto.gs (19-nov): cancelar en Walmart primero y luego Odoo, con la logica de la dueña.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m,d)=>logs.push([k,e,m,d]));ctx.flushLog_=()=>{};
const alertas=[];ctx.extAlertaFija_=(k,x)=>alertas.push([k,x]);
const props={};ctx.props_=()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)}});
ctx.avisoLogDia_=(a,b,c,d)=>logs.push(['AV',b,c,d]);
ctx.TZ='America/Mexico_City';ctx.Utilities={formatDate:()=>'19-nov 12:00'};
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.normEnc_=x=>String(x);
let auth=null;ctx.csAutorizar_=()=>auth;
ctx.CAN_HOJA='Cancelaciones';ctx.CAN_ETAPA='CANCEL';ctx.CAN_ESTADO='ESTADO ODOO';ctx.CAN_ORIGEN='ORIGEN';ctx.CAN_ORI_PRUEBA='PRUEBA';ctx.CAN_CHECK='CANCELAR EN ODOO';ctx.CAN_NOTA='NOTA ODOO';ctx.CAN_POR='CANCELADO POR';ctx.CAN_FECHA_ODOO='FECHA ODOO';
ctx.CAN_PROP_PERSONA='P';ctx.CAN_PERSONA_DEFECTO='victor';ctx.ahora_=()=>'x';ctx.hoy_=()=>'2026-11-19';
const E=['ORDEN DE COMPRA#','ORIGEN','ESTADO ODOO','CANCELAR EN ODOO','NOTA ODOO','CANCELADO POR','FECHA ODOO','CANCELADA EN WALMART','ENVIAR','FECHA CORREO'];
const cols={};E.forEach((e,i)=>cols[e]=i+1);
let filas;const hoy=new Date();const viejo=new Date(Date.now()-9*86400000);
const reset=()=>{filas=[
 ['609101','PRECIO ERRONEO','',true,'Precio erroneo: vendida a $1 con minimo $2 (7.5% abajo)','','',false,false,hoy],        // 0 >7%: sale
 ['609102','PRECIO ERRONEO','',true,'','','',false,false,hoy],                                                       // 1 sale
 ['609103','PRECIO ERRONEO','',false,'','','',false,false,hoy],                                                      // 2 sin casilla (3-7%): decide ella
 ['609104','SOBREVENTA','',true,'','','',false,false,hoy],                                                           // 3 sobreventa: NUNCA en Walmart
 ['609105','PRECIO ERRONEO','CANCELADO EN SITE',true,'','','',false,false,hoy],                                     // 4 ya en Odoo, falta Walmart: sale
 ['609106','PRECIO ERRONEO','',true,'','','',true,false,hoy],                                                        // 5 Walmart ya marcada: no sale
 ['609107','PRECIO ERRONEO','',true,'','','',false,true,hoy],                                                        // 6 ENVIAR: no sale
 ['609108','PRECIO ERRONEO','',true,'NO CANCELAR esta','','',false,false,hoy],                                      // 7 no
 ['609109','PRECIO ERRONEO','OJO la entrega ya salio',true,'','','',false,false,hoy],                               // 8 no
 ['609110','PRECIO ERRONEO','',true,'','','',false,false,viejo],                                                     // 9 vieja (9 dias): a mano
 ['609111','PRECIO ERRONEO','',true,'ERROR WALMART: no se pudo 19-nov | x','','',false,false,hoy],                  // 10 fallo antes: no reintenta
 ['609112','PRUEBA','',true,'','','',false,false,hoy]];};
reset();
const celdas=[];
ctx.getHoja_=()=>({getLastRow:()=>filas.length+1,getRange:(r,c,n,w)=>{n=n||1;w=w||1;return{
  getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,k)=>(filas[r-2+i]||[])[c-1+k])),
  setValues:v=>v.forEach((row,i)=>row.forEach((x,k)=>{filas[r-2+i][c-1+k]=x})),
  setValue:x=>{celdas.push([r,c,x]);filas[r-2][c-1]=x}}}});
ctx.canMapaHoja_=()=>({mapa:cols});ctx.canColVals_=(h,c,n)=>c?filas.map(f=>f[c-1]):[];
ctx.canQueHacerSync_=()=>0;
ctx.csDirectoPausado_=()=>true;
const L=f=>vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8'),ctx);
L('CancelacionesWalmart.gs');L('CancelacionesPrecio.gs');
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesSobreventa.gs','utf8').replace(/\r\n/g,'\n').match(/function canColOrden_[\s\S]*?\n}\n/)[0],ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesSobreventa.gs','utf8').replace(/\r\n/g,'\n').match(/function canTextoOrden_[\s\S]*?\n}\n/)[0],ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesEstado.gs','utf8').replace(/\r\n/g,'\n').match(/function canDiasDesde_[\s\S]*?\n}\n/)[0],ctx);
L('CancelacionesWalmartAuto.gs');L('CancelacionesSite.gs');
ctx.csAutorizar_=()=>auth;
let seller={};ctx.scIndice_=()=>seller;

// 1) quien es elegible
const el=o=>ctx.cwaElegible_(Object.assign({origen:'PRECIO ERRONEO',estado:'',nota:'',casilla:true,yaWalmart:false,enviar:false,dias:1},o));
t(el({}),'precio erroneo con casilla, reciente: SI');
t(!el({origen:'SOBREVENTA'})&&!el({origen:'FRAUDE'})&&!el({origen:'CORREO'})&&!el({origen:'MANUAL'})&&!el({origen:'PRUEBA'}),'solo PRECIO ERRONEO: sobreventa, fraude, correo, manual y prueba NUNCA se cancelan en Walmart');
t(!el({casilla:false}),'sin casilla (la dueña decide): NO');
t(!el({yaWalmart:true})&&!el({yaWalmart:'TRUE'}),'Walmart ya confirmado: NO');
t(!el({enviar:true}),'ENVIAR marcado: NO');
t(!el({nota:'NO CANCELAR'})&&!el({nota:'ERROR WALMART: x'})&&!el({nota:'OJO'}),'NO CANCELAR / ERROR WALMART / OJO en la nota: NO');
t(!el({estado:'OJO x'})&&!el({estado:'NO ENCONTRADA EN ODOO'}),'estado OJO / NO ENCONTRADA: NO');
t(el({dias:5})&&!el({dias:6}),'solo ventas de los ultimos 5 dias');
t(el({estado:'CANCELADO EN SITE'}),'ya cancelada en Odoo pero falta Walmart: SI');
// 2) lista
const c=ctx.cwaFilas_(ctx.getHoja_());
let lista=ctx.cwaLista_(c.filas);
t(lista.join()==='609101,609102,609105','lista: '+lista.join());
const muchas=[];for(let i=0;i<9;i++)muchas.push({orden:'6099'+i,origen:'PRECIO ERRONEO',casilla:true,yaWalmart:false,dias:1,estado:'',nota:'',enviar:false});
muchas.push(muchas[0]);
t(ctx.cwaLista_(muchas).length===5,'maximo 5 por vuelta, sin repetir');
// 3) entregar: pausa, clave, casilla, sincronizar con Seller Center
auth={ok:false,error:'no_autorizado'};t(R('cwaEntregar_')({}).error==='no_autorizado','sin clave correcta no entrega nada');auth=null;
props.WALMART_CANCEL_PAUSA='1';let r=R('cwaEntregar_')({});t(r.ok&&r.ordenes.length===0&&r.nota==='pausado','en pausa: lista vacia');delete props.WALMART_CANCEL_PAUSA;
delete cols['CANCELADA EN WALMART'];logs.length=0;r=R('cwaEntregar_')({});t(r.ordenes.length===0&&r.nota==='sin_casilla'&&logs.some(l=>l[0]==='AV'),'sin la columna CANCELADA EN WALMART no cancela nada y avisa');cols['CANCELADA EN WALMART']=8;
seller={'609101':{norm:'CANCELADO'},'609999':{norm:'CANCELADO'}};
r=R('cwaEntregar_')({});
t(filas[0][7]===true,'Seller Center ya la tenia cancelada: se marca CANCELADA EN WALMART sola');
t(r.ordenes.join()==='609102,609105','lo ya cancelado en Walmart no se vuelve a mandar: '+r.ordenes.join());
t(filas[3][7]===false&&filas[2][7]===false,'sobreventa y filas sin casilla no se marcan');
seller={};
// 4) resultados
const post=(o)=>R('cwaRecibirResultado_')(Object.assign({clave:'k'},o));
r=post({orden:'609102',resultado:'cancelada',motivo:'SELLER_REJECTION'});
t(r.ok&&filas[1][7]===true&&/Cancelada en Walmart por la extension \(Rechazar\)/.test(filas[1][4]),'cancelada: marca CANCELADA EN WALMART y deja la nota: '+filas[1][4]);
t(logs.some(l=>l[0]==='Ok'&&/Cancelada en Walmart: 609102/.test(l[2])),'queda en el Log');
r=post({orden:'609105',resultado:'ya_cancelada'});t(filas[4][7]===true&&/ya la tenia cancelada/.test(filas[4][4]),'ya cancelada: se marca');
filas[5][7]=false;
// falla
logs.length=0;alertas.length=0;
r=post({orden:'609103',resultado:'error',detalle:'Walmart respondio: algo'});   // sin casilla pero igual se anota (no se marca YA)
t(filas[2][7]===false&&/^ERROR WALMART/.test(filas[2][4]),'error: NO marca CANCELADA EN WALMART y la nota empieza con ERROR WALMART: '+filas[2][4]);
t(logs.some(l=>l[0]==='Err'&&/NO se cancelo en Walmart la orden 609103/.test(l[2]))&&alertas.some(a=>a[0]==='cwa-609103'&&/609103/.test(a[1])),'error: Log en rojo y alerta fija');
filas[2][3]=true;   // si ahora la marcara, no se reintenta sola
t(!ctx.cwaLista_(ctx.cwaFilas_(ctx.getHoja_()).filas).includes('609103'),'una falla NO se reintenta sola');
// Odoo espera a Walmart, y cuando ella marca CANCELADA EN WALMART a mano, sigue (aunque la nota diga ERROR WALMART)
let sitio=R('csParaExtension_()');t(!sitio.includes('609103'),'falla de Walmart: Odoo/site NO la cancela');
filas[2][7]=true;sitio=R('csParaExtension_()');t(sitio.includes('609103'),'ella la cancela a mano y marca CANCELADA EN WALMART: Odoo/site sigue');
filas[2][7]=false;filas[2][3]=false;
r=post({orden:'609103',resultado:'no_cancelable',detalle:'estado en Seller Center: Shipped'});t(/Walmart no permite cancelarla/.test(filas[2][4]),'no_cancelable (ya enviada): se avisa');
// sin sesion: solo aviso, no toca la fila
const antes=JSON.stringify(filas);logs.length=0;r=post({orden:'609101',resultado:'sin_sesion',detalle:'sin sesion'});t(JSON.stringify(filas)===antes&&logs.some(l=>l[0]==='AV'),'sin sesion: solo aviso, no cambia la hoja');
t(post({orden:'609101',resultado:'cualquiera'}).error==='resultado_no_valido'&&post({orden:'',resultado:'error'}).error==='sin_orden','resultado u orden invalidos se rechazan');
auth={ok:false,error:'no_autorizado'};const antes2=JSON.stringify(filas);t(post({orden:'609101',resultado:'cancelada'}).error==='no_autorizado'&&JSON.stringify(filas)===antes2,'sin clave correcta no escribe');auth=null;
// el motivo solo puede ser uno de los dos conocidos
reset();post({orden:'609102',resultado:'cancelada',motivo:'HACKER'});t(/sin motivo/.test(filas[1][4]),'un motivo desconocido no pasa');
// 5) Walmart va PRIMERO: precio erroneo sin CANCELADA EN WALMART no sale al site; las demas origenes siguen igual
reset();
sitio=R('csParaExtension_()');
t(!sitio.includes('609101')&&!sitio.includes('609102')&&sitio.includes('609104'),'precio erroneo espera a Walmart; sobreventa sigue su camino: '+sitio.join());
filas[0][7]=true;sitio=R('csParaExtension_()');t(sitio.includes('609101'),'con Walmart confirmado sale al site');
// el menu "pendientes" tambien respeta el orden
const pen=R('csPendientes_()').map(x=>x.orden);t(!pen.includes('609102')&&pen.includes('609101'),'lista de pendientes del site respeta Walmart primero');
// 6) seguridad de la accion: el archivo no manda nada a Walmart, solo habla con la hoja
const src=fs.readFileSync(__dirname+'/../apps-script/CancelacionesWalmartAuto.gs','utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
t(!/UrlFetchApp|walmartapis|https?:\/\/seller/.test(src),'el Sheet no llama a Walmart: solo la extension lo hace');
const w=fs.readFileSync(__dirname+'/../apps-script/WebAPI.gs','utf8');
t(/wm_cancel_pendientes[\s\S]{0,80}cwaEntregar_/.test(w)&&/wm_cancel_resultado[\s\S]{0,80}cwaRecibirResultado_/.test(w),'acciones del Web App conectadas');
t(/csAutorizar_\(p\)/.test(src),'las dos acciones exigen la clave de la extension');
console.log('t88: '+ok+' ok'+(bad?', '+bad+' FALLA':''));process.exit(bad?1:0);
