// OdooSesion.gs con datos simulados: recibir la sesion de Chrome, probarla, llamar por JSON-RPC, sesion vencida, odooExecute_ y odooApagado_.
const fs=require('fs'),vm=require('vm');
const ctx={console};vm.createContext(ctx);
const cargar=f=>vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8'),ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[];['Ok','Info','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m,d)=>logs.push([k,e,m,d]));
ctx.flushLog_=()=>{};ctx.avisoDia_=(k,n,e,m)=>logs.push(['dia',e,m]);ctx.avisoLogDia_=(k,n,e,m)=>logs.push(['dia',e,m]);
const props={EXT_CLAVE:'clave-buena'};
const P={getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)},deleteProperty:k=>{delete props[k]}};
ctx.PropertiesService={getScriptProperties:()=>P};ctx.props_=()=>P;
const cache={};ctx.CacheService={getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v},remove:k=>{delete cache[k]}})};
ctx.igualesSeguro_=(a,b)=>a===b;ctx.EXT_PROP_CLAVE='EXT_CLAVE';ctx.EXT_MAX_FALLOS=10;ctx.EXT_BLOQUEO_SEG=600;ctx.contarFetch_=()=>{};
ctx.dlgInfo_=(a,b,c)=>logs.push(['dlg',a,b,c]);

const SES='abcdef0123456789abcdef0123456789abcdef01';
const resp=(code,obj)=>({getResponseCode:()=>code,getContentText:()=>JSON.stringify(obj)});
const pedidas=[];
function fakeFetch(url,o){
  const cookie=o.headers.Cookie;const b=JSON.parse(o.payload);pedidas.push({url,cookie,method:b.params&&b.params.method});
  const viva=cookie==='session_id='+SES;
  if(url.indexOf('/web/session/get_session_info')>=0)
    return resp(200, viva?{result:{uid:7,username:'soporte@x.com',name:'Victor'}}:{result:{uid:false}});
  if(url.indexOf('/web/dataset/call_kw/')>=0){
    if(!viva)return resp(200,{error:{message:'Odoo Session Expired',data:{name:'odoo.http.SessionExpiredException'}}});
    return resp(200,{result:[{id:1,name:'WH/OUT/1',state:'assigned'}]});
  }
  return resp(404,{});
}
ctx.UrlFetchApp={fetch:fakeFetch};
ctx.Utilities={sleep:()=>{}};
cargar('OdooSesion.gs');
cargar('Odoo.gs');

// ---- recibir la sesion de la extension ----
t(R('recibirCookieOdoo_({clave:"mala",cookie:"'+SES+'"})').error==='no_autorizado','clave mala = no_autorizado');
const rec=R('recibirCookieOdoo_({clave:"clave-buena",cookie:"session_id='+SES+'"})');
t(rec.ok===true&&rec.usuario==='soporte@x.com','clave buena + sesion viva = guardada, con usuario');
t(props.ODOO_SESION===SES,'la sesion queda en Propiedades');
t(JSON.parse(props.ODOO_SESION_INFO).nombre==='Victor','guarda a nombre de quien');
t(R('recibirCookieOdoo_({clave:"clave-buena",cookie:"'+SES+'"})').igual===true,'misma sesion = igual, no reescribe');
t(R('recibirCookieOdoo_({clave:"clave-buena",cookie:"x"})').error==='cookie_invalida','cookie corta = invalida');
const mala=R('recibirCookieOdoo_({clave:"clave-buena",cookie:"ffffffffffffffffffffffffffffffffffffff99"})');
t(mala.error==='sesion_no_valida','sesion que no sirve no se guarda');
t(props.ODOO_SESION===SES,'no pisa la sesion buena con una mala');

// ---- odooApagado_: con sesion, encendido ----
t(R('odooApagado_()')===false,'con sesion guardada, Odoo NO esta apagado');
delete props.ODOO_SESION;
t(R('odooApagado_()')===true,'sin sesion ni ODOO_ACTIVO, apagado');
props.ODOO_SESION=SES;

// ---- odsEjecutar_ y odooExecute_ usan la sesion ----
const r=R('odsEjecutar_("stock.picking","search_read",[[["state","=","assigned"]]],{fields:["name"]})');
t(Array.isArray(r)&&r[0].name==='WH/OUT/1','odsEjecutar_ devuelve el result de Odoo');
t(pedidas.some(p=>p.url.indexOf('/web/dataset/call_kw/stock.picking/search_read')>=0&&p.cookie==='session_id='+SES),'llama a call_kw con tu sesion');
const r2=R('odooExecute_("stock.picking","search_read",[[]],{})');
t(Array.isArray(r2),'odooExecute_ enruta por la sesion cuando existe');

// ---- sesion vencida: se borra y avisa ----
props.ODOO_SESION='ffffffffffffffffffffffffffffffffffffff99';
let err='';try{R('odsEjecutar_("res.partner","read",[[1]],{})');}catch(e){err=e.message;}
t(/vencio/.test(err),'sesion vencida lanza error claro');
t(!props.ODOO_SESION,'sesion vencida se borra sola');
t(logs.some(l=>l[0]==='dia'&&/vencio/.test(l[2])),'avisa en el Log que vencio');

console.log('t30: '+ok+' OK, '+bad+' fallas');process.exit(bad?1:0);
