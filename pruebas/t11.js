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
 skXlsx_:(g,f)=>({name:'PARRILLA - '+g+'.xlsx',n:f.length})});
vm.runInContext(fs.readFileSync(S+'SolicitudKillers.gs','utf8'),ctx);
ctx.kcCuentaRegresiva_=()=>ctx._cuenta!==false;ctx.skXlsx_=(g,f)=>({name:'PARRILLA - '+g+'.xlsx',n:f.length});
ctx.kcLog_=()=>hojas['Envios killers']||(hojas['Envios killers']=new Sh('Envios killers',[['FECHA','MODO','GRUPO KAM','PARA','KILLERS','ESTADO']]));
const plan=vm.runInContext('skArmar_()',ctx);
console.log(plan.paquetes.map(p=>p.grupo+':'+p.filas.length+' -> '+p.para.length+' correos').join('\n'),'| sinSku',plan.sinSku,'sinCorreo',plan.sinCorreo);
ok(plan.paquetes.length>=1,'hay paquetes');
ctx._modo='YES'; ctx._resp='NO'; vm.runInContext('solicitudKillersEnviar()',ctx);
ok(mails.length===plan.paquetes.length&&mails.every(m=>m.to==='yo@x.com'&&/^\[PRUEBA\] ELECTRONICS\.MEXICO SOLICITUD KILLERS NOVIEMBRE 2026 - /.test(m.subject)),'PRUEBA: un correo por grupo, solo a mi, asunto correcto');
ok(mails.every(m=>/Buen día, enviamos nuestra solicitud para Killers, saludos$/.test(m.body)&&m.attachments.length===1),'mensaje y adjunto');
ctx._cuenta=false;mails.length=0;ctx._resp='YES';vm.runInContext('solicitudKillersEnviar()',ctx);ok(mails.length===0,'REAL cancelado en la cuenta regresiva: no sale ningun correo');ctx._cuenta=true;mails.length=0; ctx._resp='YES'; vm.runInContext('solicitudKillersEnviar()',ctx);
ok(mails.length===plan.paquetes.length,'REAL: un correo por grupo');
ok(mails.every((m,i)=>m.to===plan.paquetes[i].para.join(',')&&m.subject===('ELECTRONICS.MEXICO SOLICITUD KILLERS NOVIEMBRE 2026 - '+plan.paquetes[i].grupo)),'REAL: todos los contactos juntos, asunto exacto');
console.log(mails.map(m=>m.subject+' -> '+m.to).join('\n'));
mails.length=0; vm.runInContext('solicitudKillersEnviar()',ctx);
ok(mails.length===0,'segundo REAL del mismo mes no reenvia');

// --- Reconsiderar y seleccion de KAM
const est=hojas['Estado Killers']=new Sh('Estado Killers',[['SKU','DESCRIPCION','DEPARTAMENTO','CATEGORIA','KAM','KILLER','INV','PRECIO MEJORADO','PRECIO FULL','EN PARRILLA','AVISO']]);
const g0=plan.paquetes[0], g1=plan.paquetes[1];
g0.filas.slice(0,2).forEach(f=>est.d.push([f[2],'','','','','NO','','','','SI','']));
est.d.push([g0.filas[2][2],'','','','','SI','','','','SI','']);           // con killer: no entra
est.d.push([g1.filas[0][2],'','','','','NO','','','','NO','']);           // NO en parrilla: no entra
const rp=vm.runInContext('skArmar_(true)',ctx);
ok(rp.paquetes.length===1&&rp.paquetes[0].grupo===g0.grupo&&rp.paquetes[0].filas.length===2,'reconsiderar: solo KILLER=NO y EN PARRILLA=SI, por KAM');
mails.length=0; ctx._modo='NO'; ctx._resp='NO'; ctx._kams=''; vm.runInContext('solicitudKillersEnviar()',ctx);
ok(mails.length===1&&mails[0].to==='yo@x.com'&&/^\[PRUEBA\] ELECTRONICS\.MEXICO RECONSIDERAR KILLERS NOVIEMBRE 2026 - /.test(mails[0].subject)&&/solicitamos reconsiderar estos productos/.test(mails[0].body),'reconsiderar PRUEBA: asunto y mensaje propios');
mails.length=0; ctx._modo='NO'; ctx._resp='YES'; vm.runInContext('solicitudKillersEnviar()',ctx);
mails.length=0; vm.runInContext('solicitudKillersEnviar()',ctx);
ok(mails.length===1,'reconsiderar REAL se puede repetir (no hay candado mensual)');
mails.length=0; ctx._modo='YES'; ctx._resp='NO'; ctx._kams='tv, videojuegos'; vm.runInContext('solicitudKillersEnviar()',ctx);
ok(mails.length===2&&mails.every(m=>/ - (TV|VIDEOJUEGOS)$/.test(m.subject)),'seleccion de KAM: solo los elegidos');
console.log(p+' OK '+f+' FALLA');
