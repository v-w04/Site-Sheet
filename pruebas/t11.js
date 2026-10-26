const fs=require('fs'),vm=require('vm');
const S=__dirname+'/../apps-script/', U=S;
const D=JSON.parse(fs.readFileSync(''+__dirname+'/datos/parr_data.json','utf8'));
let p=0,f=0;const ok=(c,m)=>{c?p++:f++;console.log(c?'OK':'FALLA',m)};
const noop=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:noop(),apply:()=>noop()});
class Sh{constructor(n,d){this.n=n;this.d=d}getName(){return this.n}setColumnWidth(){}appendRow(x){this.d.push(x)}
 getLastRow(){let l=0;this.d.forEach((r,i)=>{if(r.some(c=>c!==''&&c!=null))l=i+1});return l}
 getLastColumn(){let l=0;this.d.forEach(r=>r.forEach((c,j)=>{if(c!==''&&c!=null&&j+1>l)l=j+1}));return l}
 getRange(r,c,nr,nc){const s=this;nr=nr||1;nc=nc||1;
  return new Proxy({getValues:()=>{const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((s.d[r-1+i]||[])[c-1+j]??'');o.push(row)}return o},
   setValues:v=>{v.forEach((row,i)=>{while(s.d.length<r+i)s.d.push([]);row.forEach((x,j)=>{s.d[r-1+i][c-1+j]=x})})},
   setValue:x=>{while(s.d.length<r)s.d.push([]);s.d[r-1][c-1]=x;return noop()},clearContent:()=>{for(let i=0;i<nr;i++)for(let j=0;j<nc;j++)if(s.d[r-1+i])s.d[r-1+i][c-1+j]=''}},{get:(t,k)=>k in t?t[k]:noop()})}
 getDataRange(){return{getValues:()=>this.d.map(r=>r.slice())}}}
const hojas={};for(const n in D)hojas[n]=new Sh(n,D[n].map(r=>r.slice()));
const logs=[],escritas={};
const ctx={Utilities:{formatDate:(d,z,f)=>f==='M'?'10':f==='yyyy'?'2026':f==='dd'?'22':'26'},TZ:'x',console,Date,JSON,Math,Object,Array,String,Number,isNaN,parseInt,
 CC_WALMART:'Walmart',CC_HOJA:'Concentrado',CD_HOJA:'Cobro distinto',LOCK_ESPERA_MS:1,
 getSpreadsheet_:()=>({getSheetByName:n=>hojas[n]||null}),
 getHoja_:n=>hojas[n]||(hojas[n]=new Sh(n,[['SKU','DECISION']])),
 logOk_:(e,m)=>logs.push(['OK',m]),logWarn_:(e,m)=>logs.push(['WARN',m]),logErr_:(e,m)=>logs.push(['ERR',m]),logLatido_:(e,m)=>logs.push(['LAT',m]),flushLog_(){},toast_(){},
 reescribirHoja_:(h,enc,filas)=>{escritas[h.getName()]={enc,filas};},
 SpreadsheetApp:{newDataValidation:()=>({requireValueInList(){return this},setAllowInvalid(){return this},build(){return {}}})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 _p:{},PropertiesService:{getScriptProperties:()=>({getProperty:k=>ctx._p[k]||null,setProperty:(k,v)=>{ctx._p[k]=v}})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(U+'Columnas.gs','utf8'),ctx);
vm.runInContext(fs.readFileSync(S+'KillersCorreo.gs','utf8'),ctx);
ctx.kcCrearHojas_=()=>({getSheetByName:n=>hojas[n]||null});
vm.runInContext(fs.readFileSync(S+'Parrillas.gs','utf8'),ctx);

vm.runInContext('parActualizar_(false)',ctx);
for(const n in escritas){ if(/^Parrilla /.test(n)) hojas[n]=new Sh(n,[escritas[n].enc].concat(escritas[n].filas)); }


const mails=[],alerts=[];let prompts=0;
const ui={ButtonSet:{OK:1,OK_CANCEL:2,YES_NO_CANCEL:3},Button:{OK:'OK',YES:'YES',NO:'NO',CANCEL:'CANCEL',CLOSE:'CLOSE'},
 alert:(a,b)=>{alerts.push(a+'|'+(b||''));if(/qué vas a mandar/i.test(a))return ctx._modo||'YES';return ctx._resp||'OK'},
 prompt:(t,m)=>({getSelectedButton:()=>'OK',getResponseText:()=>/grupos KAM/.test(m)?(ctx._kams||''):'noviembre 2026'})};
Object.assign(ctx,{Session:{getEffectiveUser:()=>({getEmail:()=>'yo@x.com'})},
 SpreadsheetApp:Object.assign({},ctx.SpreadsheetApp,{getUi:()=>ui,getActive:()=>({getSheetByName:n=>hojas[n]||null})}),
 MailApp:{sendEmail:o=>mails.push(o)},KC_HOJA_LOG:'Envios killers',
 props_:()=>ctx.PropertiesService.getScriptProperties(),
 kcLog_:()=>{return hojas['Envios killers']||(hojas['Envios killers']=new Sh('Envios killers',[['FECHA','MODO','GRUPO KAM','PARA','KILLERS','ESTADO']]))},
 exportarXlsx_:(id,n)=>({name:n}),
 skXlsx_:(g,f,m,n)=>({name:'PARRILLA - '+g+'.xlsx',n:f.length,esc:n})});
vm.runInContext(fs.readFileSync(S+'SolicitudKillers.gs','utf8'),ctx);
ctx.skXlsx_=(g,f,m,n)=>({name:'PARRILLA - '+g+'.xlsx',n:f.length,esc:n});
ctx.kcLog_=()=>hojas['Envios killers']||(hojas['Envios killers']=new Sh('Envios killers',[['FECHA','MODO','GRUPO KAM','PARA','KILLERS','ESTADO']]));
const plan=vm.runInContext('skArmar_()',ctx);
console.log(plan.paquetes.map(p=>p.grupo+':'+p.filas.length+' -> '+p.para.length+' correos').join('\n'),'| sinSku',plan.sinSku,'sinCorreo',plan.sinCorreo);
ok(plan.paquetes.length>=1,'hay paquetes');

const todos=plan.paquetes.map(q=>q.grupo);
const F=(fn,modo,grupos,hasta,mes)=>vm.runInContext(fn+'('+JSON.stringify({modo,grupos,campos:{mes:mes||'noviembre 2026',hasta:String(hasta)}})+')',ctx);
let r=F('skFormSolicitud','PRUEBA',todos,1);
ok(r.ok&&mails.length===plan.paquetes.length&&mails.every(m=>m.to==='yo@x.com'&&/^\[PRUEBA\] ELECTRONICS\.MEXICO SOLICITUD KILLERS NOVIEMBRE 2026 - /.test(m.subject)),'PRUEBA: un correo por grupo, solo a mi, asunto correcto');
ok(mails.every(m=>/Buen día, enviamos nuestra solicitud para Killers, saludos$/.test(m.body)&&m.attachments.length===1&&m.attachments[0].esc===1),'mensaje, adjunto y solo 1 propuesta (hasta P)');
ok(/hasta la columna P/.test(r.lineas.join(' ')),'resultado dice hasta la columna P');
mails.length=0; r=F('skFormSolicitud','PRUEBA',todos,3);
ok(mails.every(m=>m.attachments[0].esc===3)&&/hasta la columna X/.test(r.lineas.join(' ')),'3 propuestas = hasta X');
ok(ctx._p.SK_HASTA==='3','recuerda la ultima eleccion');
mails.length=0; r=F('skFormSolicitud','PRUEBA',todos,9); ok(!r.ok&&mails.length===0,'propuesta invalida: no envia');
r=F('skFormSolicitud','PRUEBA',todos,2,'noviembre'); ok(!r.ok&&mails.length===0,'mes invalido: no envia');
mails.length=0; r=F('skFormSolicitud','PRUEBA',['NO EXISTE'],2); ok(!r.ok&&mails.length===0,'grupo inexistente: no envia');
mails.length=0; r=F('skFormSolicitud','REAL',todos,6);
ok(r.ok&&mails.length===plan.paquetes.length&&mails.every((m,i)=>m.to===plan.paquetes[i].para.join(',')&&m.subject==='ELECTRONICS.MEXICO SOLICITUD KILLERS NOVIEMBRE 2026 - '+plan.paquetes[i].grupo),'REAL: todos los contactos juntos, asunto exacto');
mails.length=0; r=F('skFormSolicitud','REAL',todos,6); ok(mails.length===0&&/ya se hab/.test(r.lineas.join(' ')),'segundo REAL del mes no reenvia');
const est=hojas['Estado Killers']=new Sh('Estado Killers',[['SKU','DESCRIPCION','DEPARTAMENTO','CATEGORIA','KAM','KILLER','INV','PRECIO MEJORADO','PRECIO FULL','EN PARRILLA','AVISO']]);
const g0=plan.paquetes[0], g1=plan.paquetes[1];
g0.filas.slice(0,2).forEach(f=>est.d.push([f[2],'','','','','NO','','','','SI','']));
est.d.push([g0.filas[2][2],'','','','','SI','','','','SI','']);
est.d.push([g1.filas[0][2],'','','','','NO','','','','NO','']);
const rp=vm.runInContext('skArmar_(true)',ctx);
ok(rp.paquetes.length===1&&rp.paquetes[0].grupo===g0.grupo&&rp.paquetes[0].filas.length===2,'reconsiderar: solo KILLER=NO y EN PARRILLA=SI, por KAM');
mails.length=0; F('skFormReconsiderar','PRUEBA',todos,2);
ok(mails.length===1&&mails[0].to==='yo@x.com'&&/^\[PRUEBA\] ELECTRONICS\.MEXICO RECONSIDERAR KILLERS NOVIEMBRE 2026 - /.test(mails[0].subject)&&/solicitamos reconsiderar estos productos/.test(mails[0].body),'reconsiderar PRUEBA: asunto y mensaje propios');
mails.length=0; F('skFormReconsiderar','REAL',todos,2); mails.length=0; F('skFormReconsiderar','REAL',todos,2);
ok(mails.length===1,'reconsiderar REAL se puede repetir');
mails.length=0; F('skFormSolicitud','PRUEBA',['TV','VIDEOJUEGOS'],1);
ok(mails.length===2&&mails.every(m=>/ - (TV|VIDEOJUEGOS)$/.test(m.subject)),'seleccion de grupos: solo los marcados');
// formulario: se arma sin error y los textos salen escapados
let html='';ui.showModalDialog=(o,t)=>{html=o.html};
ctx.HtmlService={createHtmlOutput:h=>({html:h,setWidth(){return this},setHeight(){return this}})};
ctx.KC_CUENTA_SEG=30;
vm.runInContext(fs.readFileSync(S+'Dialogos.gs','utf8'),ctx);
vm.runInContext('skAbrir_(false)',ctx);
ok(/Qué propuestas lleva el archivo/.test(html)&&/hasta la columna P/.test(html)&&/Enviar PRUEBA/.test(html)&&/Enviar REAL/.test(html)&&todos.every(g=>html.indexOf('data-grupo="'+g)>=0),'formulario: lista de propuestas, 2 botones nombrados y un check por grupo');
try{vm.runInContext('dlgEnvioResponder("alert",\'{}\')',ctx);ok(false,'responder rechaza nombres no permitidos')}catch(e){ok(/no permitida/i.test(e.message),'responder rechaza nombres no permitidos')}
vm.runInContext('dlgInfo_("T","a <b>\\n\\n• uno\\n• dos","ok")',ctx);
ok(html.indexOf('<b>')<0&&/<ul><li>uno/.test(html),'dlgInfo_ escapa HTML y arma listas');
console.log(p+' OK '+f+' FALLA');
