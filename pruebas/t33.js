// CancelacionesSite.gs (simulado): cancelacion directa pausada, pendientes, diagnostico de permisos, busqueda del boton del site.
const fs=require('fs'),vm=require('vm');
const ctx={console};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[],dlgs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m,d)=>logs.push([k,e,m,d]));ctx.flushLog_=()=>{};
ctx.dlgInfo_=(a,b,c)=>dlgs.push([a,b,c]);
const props={};ctx.props_=()=>({getProperty:k=>k in props?props[k]:null});
ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>k in props?props[k]:null})};
ctx.odooApagado_=()=>false;ctx.odsSesion_=()=>'SES';ctx.SITE='https://x.site';
// hoja Cancelaciones simulada
ctx.CAN_HOJA='Cancelaciones';ctx.CAN_ETAPA='CANCEL';ctx.CAN_ESTADO='ESTADO ODOO';ctx.CAN_ORIGEN='ORIGEN';ctx.CAN_ORI_PRUEBA='PRUEBA';
const filas=[['609001','CORREO','CANCELADO EN ODOO'],['609002','CORREO',''],['609003','SOBREVENTA','OJO: algo'],['609002','CORREO',''],['609004','PRUEBA',''],['609005','',' ']];
const cols={'ORDEN DE COMPRA#':1,'ORIGEN':2,'ESTADO ODOO':3};
ctx.getHoja_=()=>({getLastRow:()=>filas.length+1,getRange:(r,c,n)=>({getValues:()=>filas.slice(r-2,r-2+n).map(f=>[f[c-1]])})});
ctx.canMapaHoja_=()=>({mapa:cols});ctx.normEnc_=x=>String(x);ctx.canColVals_=(h,c,n)=>filas.map(f=>f[c-1]);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesSite.gs','utf8'),ctx);

t(R('csDirectoPausado_()')===true,'por defecto la cancelacion directa esta pausada');
props.CANCELAR_ODOO_DIRECTO='1';t(R('csDirectoPausado_()')===false,'con CANCELAR_ODOO_DIRECTO=1 se reactiva');delete props.CANCELAR_ODOO_DIRECTO;
const p=R('csPendientes_()');
t(p.map(x=>x.orden).join()==='609002,609003,609005','pendientes: sin cancelados, sin PRUEBA, sin repetidos');
R('csAvisarPausa_([{orden:"609002"},{orden:"609002"},{orden:"609005"}])');
t(logs.some(l=>/PAUSADA/.test(l[2])&&/2 pendiente/.test(l[2])&&/609005/.test(l[2])),'el aviso de pausa va al Log con la lista');
R('cancelacionesPendientesSite()');t(dlgs.some(d=>/609002/.test(d[1])&&/Cancelar venta/.test(d[1])),'popup de pendientes lista las ventas');
R('csDialogoPausa_()');t(dlgs.some(d=>/pausada/.test(d[1])&&/Pendientes en la hoja ahora: 3/.test(d[1])),'popup de pausa dice cuantos hay');
// diagnostico
const llamadas=[];
ctx.odooExecute_=(m,met,args,kw)=>{llamadas.push(met+':'+m+':'+(args[0]&&args[0].length===undefined?'':args[0]));
 if(met==='check_access_rights'){ if(m==='nope')throw new Error('x'); return !(m==='sale.order'&&args[0]==='write'); }
 if(met==='search_count')return 85383; return true;};
ctx.odsPost_=()=>({j:{result:{server_version:'17.0'}}});
R('odooDiagnostico()');
const d=dlgs[dlgs.length-1];
t(/sale\.order \(Ventas\): leer SI · escribir NO · crear SI/.test(d[1]),'diagnostico: escribir NO en ventas se ve');
t(/ves 85383 registros/.test(d[1])&&/Odoo 17\.0/.test(d[1]),'diagnostico: conteo y version');
t(!llamadas.some(x=>/^(write|create|unlink|run)/.test(x.split(':')[0])),'el diagnostico no escribe nada en Odoo');
t(logs.some(l=>l[1]==='CANCEL_SITE'&&/Diagnostico de Odoo/.test(l[2])),'el diagnostico queda en el Log');
// has_access como respaldo (Odoo 18)
ctx.odooExecute_=(m,met)=>{ if(met==='check_access_rights')throw new Error('no attribute'); if(met==='has_access')return true; return 5;};
t(R('csPermiso_("sale.order","read")')==='SI','respaldo has_access cuando no existe check_access_rights');
ctx.odooExecute_=()=>{throw new Error('boom')};t(R('csPermiso_("x","read")')==='N/D','modelo que no existe = N/D');
// busqueda del boton
const html='<script src="/static/app.js"></script><button onclick="cancelarVenta()">Cancelar venta</button>';
const js='async function cancelarVenta(){ const r = await fetch("/ventas-general/cancelar", {method:"POST", body: JSON.stringify({id, pin, motivo})}); } var x="/api/ventas/cancel-info";';
ctx.fetchSitio_=(r)=>({codigo:200,texto:r==='/ventas-general'?html:js});
R('siteDescubrirCancelar()');
const l=logs.filter(x=>x[1]==='CANCEL_SITE').pop();
t(/\/ventas-general\/cancelar/.test(JSON.stringify(l[3].rutas))&&l[3].frag.length>=1,'encuentra la ruta y el fragmento de cancelar');
t(/POST/.test(JSON.stringify(l[3].frag)),'el fragmento trae el metodo');
console.log(ok+' OK '+bad+' FALLA');process.exit(bad?1:0);
