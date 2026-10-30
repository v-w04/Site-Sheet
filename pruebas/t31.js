// OdooSesion.gs: entrar solo con correo y contraseña (simulado): login, cookie, renovar al vencer, no insistir, no filtrar la contraseña.
const fs=require('fs'),vm=require('vm');
const ctx={console};vm.createContext(ctx);
const cargar=f=>vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8'),ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[];['Ok','Info','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m)=>logs.push([k,e,m]));
ctx.flushLog_=()=>{};ctx.avisoDia_=(k,n,e,m)=>logs.push(['dia',e,m]);ctx.avisoLogDia_=(k,n,e,m)=>logs.push(['dia',e,m]);
const props={};
const P={getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)},deleteProperty:k=>{delete props[k]}};
ctx.PropertiesService={getScriptProperties:()=>P};ctx.props_=()=>P;ctx.contarFetch_=()=>{};ctx.dlgInfo_=()=>{};
let vigente='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', n=0, loginOk=true, ultDb='';
const resp=(code,obj,hdr)=>({getResponseCode:()=>code,getContentText:()=>JSON.stringify(obj),getAllHeaders:()=>hdr||{}});
ctx.UrlFetchApp={fetch:(url,o)=>{
  const b=JSON.parse(o.payload);
  if(url.indexOf('/web/session/authenticate')>=0){ n++; ultDb=b.params.db;
    if(!loginOk||b.params.password!=='secreta')return resp(200,{result:{uid:false}});
    vigente='S'+n+'0123456789abcdef0123456789abcdef0123';
    return resp(200,{result:{uid:7,username:b.params.login,name:'Victor'}},{'Set-Cookie':['frontend_lang=es_MX; Path=/','session_id='+vigente+'; Expires=x; HttpOnly; Path=/']});}
  if(url.indexOf('/web/dataset/call_kw/')>=0){
    if(o.headers.Cookie!=='session_id='+vigente)return resp(200,{error:{message:'Odoo Session Expired',data:{name:'odoo.http.SessionExpiredException'}}});
    return resp(200,{result:[{id:1}]});}
  return resp(404,{});}};
cargar('OdooSesion.gs');cargar('Odoo.gs');

t(R('odsHayCreds_()')===false,'sin credenciales: no hay');
t(R('odooApagado_()')===true,'sin sesion ni credenciales: Odoo apagado');
let r=R('odsEntrar_()');t(r.error==='sin_credenciales','sin credenciales no intenta entrar');
props.ODOO_LOGIN='yo@x.com';props.ODOO_CLAVE='secreta';
t(R('odooApagado_()')===false,'con credenciales Odoo queda encendido');
r=R('odsEntrar_()');t(r.ok&&props.ODOO_SESION===vigente&&/^S1/.test(props.ODOO_SESION),'entra y guarda session_id (la de Set-Cookie, no frontend_lang)');
t(ultDb==='electronicsmexico','db sale del subdominio si no hay ODOO_DB');
t(JSON.parse(props.ODOO_SESION_INFO).via==='correo','anota que entro por correo');
// sesion vencida: renueva sola y repite UNA vez
vigente='ZZZ';
const res=R('odsEjecutar_("stock.picking","search_read",[[]],{})');
t(Array.isArray(res)&&n===2,'sesion vencida: renueva sola y repite la llamada (login 2 veces en total)');
// sin sesion guardada: entra solo
delete props.ODOO_SESION;
t(R('odsEjecutar_("res.users","read",[[1]],{})').length===1&&n===3,'sin sesion: entra solo y llama');
// odooExecute_ usa el camino con credenciales
delete props.ODOO_SESION;
t(R('odooExecute_("res.users","read",[[1]],{})').length===1,'odooExecute_ funciona solo con credenciales');
// contraseña mala: no insiste 10 min, avisa sin la contraseña
props.ODOO_CLAVE='mala';delete props.ODOO_SESION;n=0;
r=R('odsEntrar_()');t(!r.ok&&r.error==='login_fallo','contraseña mala = falla');
r=R('odsEntrar_()');t(r.error==='espera_10_min'&&n===1,'no insiste antes de 10 minutos (1 solo intento)');
t(!JSON.stringify(logs).includes('secreta')&&!JSON.stringify(logs).includes('"mala')&&!JSON.stringify(logs).includes('mala"'),'la contraseña nunca sale en el Log');
let e;try{R('odsEjecutar_("a.b","c",[],{})')}catch(x){e=x.message}
t(/No hay sesion de Odoo/.test(e||''),'si no puede entrar, error claro');
console.log(ok+' OK '+bad+' FALLA');process.exit(bad?1:0);
