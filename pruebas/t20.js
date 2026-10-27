// t20 plantilla Walmart + copia para autorizacion
// t19 — WFS en Site Sheet: calculo igual a WFS 1.0 (datos reales 23-oct), formulas, nuevo envio, archivar, traer, automatico.
// Correr desde la carpeta pruebas:  node t20.js
const fs=require('fs'),vm=require('vm');
const SITE=__dirname+'/../apps-script', WFS=SITE;
let p=0,f=0;const ok=(c,m)=>{c?p++:f++;console.log(c?'OK':'FALLA',m)};
const noop=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:noop(),apply:()=>noop()});
class Sh{constructor(n,d){this.n=n;this.d=d.map(r=>r.slice());this.fx={};this.max=Math.max(this.d.length,300);this.oculta=false}
 getName(){return this.n} setName(n){this.n=n;return this}
 getLastRow(){let l=0;this.d.forEach((r,i)=>{if(r.some(c=>c!==''&&c!=null))l=i+1});return l}
 getLastColumn(){let l=0;this.d.forEach(r=>r.forEach((c,j)=>{if(c!==''&&c!=null&&j+1>l)l=j+1}));return Math.max(l,1)}
 getMaxRows(){return this.max} getMaxColumns(){return 60} insertRowsAfter(a,n){this.max+=n} insertColumnsAfter(){}
 setFrozenRows(){} setColumnWidth(){} clear(){this.d=[[]];this.fx={}} setConditionalFormatRules(r){this.reglas=r} getPivotTables(){return []} hideSheet(){this.oculta=true} getIndex(){return 1}
 copyTo(ss){const c=new Sh('Copia de '+this.n,this.d);ss._add(c);return c}
 getRange(r,c,nr,nc){const s=this;nr=nr||1;nc=nc||1;
  const get=()=>{const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((s.d[r-1+i]||[])[c-1+j]??'');o.push(row)}return o};
  const set=v=>{v.forEach((row,i)=>{while(s.d.length<r+i)s.d.push([]);row.forEach((x,j)=>{s.d[r-1+i][c-1+j]=x})})};
  const api={getValues:get,getDisplayValues:()=>get().map(x=>x.map(v=>v===null||v===undefined?'':String(v))),
   getDisplayValue:()=>String(get()[0][0]),getValue:()=>get()[0][0],
   getFormula:()=>s.fx[r+','+c]||'',
   setFormula:t=>{s.fx[r+','+c]=t;return P},
   setValues:v=>{set(v);return P},setValue:x=>{set([[x]]);return P},
   clearContent:()=>{for(let i=0;i<nr;i++)for(let j=0;j<nc;j++){if(s.d[r-1+i])s.d[r-1+i][c-1+j]='';delete s.fx[(r+i)+','+(c+j)]}return P}};
  const P=new Proxy(api,{get:(t,k)=>k in t?t[k]:()=>P});return P}}
const sheets={};const orden=[];
const ss={getSheetByName:n=>sheets[n]||null,getSheets:()=>orden.slice(),deleteSheet:h=>{delete sheets[h.getName()];orden.splice(orden.indexOf(h),1)},
 insertSheet:(n)=>{const h=new Sh(n,[[]]);ss._add(h);return h},
 _add:h=>{orden.push(h);const old=h.setName.bind(h);h.setName=n=>{for(const k in sheets)if(sheets[k]===h)delete sheets[k];old(n);sheets[n]=h;return h};sheets[h.getName()]=h}};
const logs=[];const props={};
const ctx={console,Date,JSON,Math,Object,Array,String,Number,isNaN,parseInt,
 logStart_(){},logInfo_(e,m){logs.push('INFO '+m)},logOk_(e,m){logs.push('OK '+m)},logWarn_(e,m){logs.push('WARN '+m)},logErr_(e,m){logs.push('ERR '+m)},logFinish_(){},logLatido_(){},flushLog_(){},
 Utilities:{formatDate:(d,z,fm)=>{const x=new Date(d);const p2=n=>String(n).padStart(2,'0');return fm.replace('yyyy',x.getFullYear()).replace('MM',p2(x.getMonth()+1)).replace('dd',p2(x.getDate())).replace('HH',p2(x.getHours())).replace('mm',p2(x.getMinutes())).replace('ss',p2(x.getSeconds()))},parseDate:()=>new Date()},
 SpreadsheetApp:{getActive:()=>ss,newConditionalFormatRule:()=>noop()},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 ScriptApp:{getProjectTriggers:()=>[]},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SITE+'/Columnas.gs','utf8'),ctx);
vm.runInContext(fs.readFileSync(SITE+'/Escritura.gs','utf8'),ctx,{filename:'Escritura.gs'});
['Wfs.gs','WfsHoja.gs','WfsEnvios.gs','WfsChoferes.gs','WfsPlantilla.gs','WfsAutoriza.gs'].forEach(n=>vm.runInContext(fs.readFileSync(WFS+'/'+n,'utf8'),ctx,{filename:n}));

const run=c=>vm.runInContext(c,ctx);
const ENC=run('WFS_ENV_ENC');
const ix=(n,o)=>{let k=0;for(let i=0;i<ENC.length;i++)if(ENC[i]===n&&++k===(o||1))return i};
const mkEnvio=(nom,det,delivery)=>{const d=[ENC.slice()];const r2=new Array(ENC.length).fill('');r2[ix('DELIVERY')]=delivery;r2[ix('FECHA')]='2026-10-28';r2[ix('HORA')]='08:00';r2[ix('CHOFER')]='PROMOTORA RESTREPO';d.push(r2);
 det.forEach((x,i)=>{const r=i===0?r2:new Array(ENC.length).fill('');if(i===0){}else d.push(r);
  r[ix('SKU')]=x[0];r[ix('AUTORIZADO')]=x[1];r[ix('SKU',2)]=x[0].replace(/-MSI(-\d)?$/,'')});
 const h=new Sh(nom,d);ss._add(h);return h};
const E=mkEnvio('ENVIO 20 28/10/26',[['AAA-111-MSI',10],['BBB-222-MSI',5],['CCC-333-MSI',0],['ZZZ-999-MSI',2]],'DLV123');
const gi=ix('AUTORIZADO')+1;[['7501234567890'],['12345678901'],[''],['']].forEach((g,i)=>{E.d[1+i][gi]=g[0]});
E.d[1][ix('CATEGORIA')]='C1';E.d[1][ix('NOMBRE')]='Prod A';
ss.getActiveSheet=()=>sheets['ENVIO 20 28/10/26'];

ctx.DriveApp={getFoldersByName:()=>({hasNext:()=>false}),createFolder:()=>({createFile:b=>({getUrl:()=>'http://f/'+b.n})}),getFileById:id=>({addEditor:c=>{ctx.__ed=c}})};
const mails=[];ctx.MailApp={sendEmail:o=>mails.push(o)};ctx.skCorreoYo_=()=>'yo@x.com';
const F=(modo,extra)=>{ctx.__p={modo,campos:Object.assign({hoja:'ENVIO 20 28/10/26',nombre:'NO',sinGtin:'PARAR'},extra||{})};return run('wfsPlantillaForm(__p)')};
// filas
const fl=run("wfsPlFilas_(SpreadsheetApp.getActive().getSheetByName('ENVIO 20 28/10/26'),false)");console.log(JSON.stringify(fl));
ok(fl.filas.length===2&&fl.filas[1].gtin==='00012345678901'&&fl.sinGtin.length===1&&fl.ceros===1,'filas: pad a 14, 0 omitido, ZZZ sin GTIN detectado');
let r=F('PRUEBA');ok(!r.ok&&/sin GTIN/.test(r.lineas.join()),'revisar avisa sin GTIN y no genera');
ctx.Utilities.newBlob=(d,t,n)=>({n,d});
let gen=0;ctx.wfsPlXlsx_=()=>{gen++;return {n:'x'}};
r=F('REAL');ok(!r.ok&&gen===0&&mails.length===0,'real con sinGtin PARAR: no genera');
r=F('REAL',{sinGtin:'OMITIR'});ok(r.ok&&gen===1&&mails.length===1,'real con OMITIR: genera 1 y manda correo');
// autoriza: copia
const copias=[];
ctx.SpreadsheetApp.create=n=>{const h=new Sh('Hoja 1',[[]]);const lib={n,hojas:[h],getSheets:()=>lib.hojas,getSheetByName:x=>lib.hojas.find(y=>y.getName()===x)||null,getId:()=>'ID1',getUrl:()=>'http://sheet/ID1'};copias.push(lib);return lib};
ctx.SpreadsheetApp.openById=id=>copias.find(c=>c.getId()===id);
ctx.SpreadsheetApp.newDataValidation=()=>noop();
ctx.props_=()=>ctx.PropertiesService.getScriptProperties();
const A=(fn,modo,extra)=>{ctx.__p={modo,campos:Object.assign({hoja:'ENVIO 20 28/10/26',correo:''},extra||{})};return run(fn+'(__p)')};
r=A('wfsAutorizaCopiaForm','PRUEBA');ok(r.ok&&copias.length===0&&!sheets['Autorizaciones WFS'],'copia ver: no crea nada');
r=A('wfsAutorizaCopiaForm','REAL',{correo:'mal'});ok(!r.ok&&copias.length===0,'correo malo: no crea');
r=A('wfsAutorizaCopiaForm','REAL',{correo:'otra@x.com'});console.log(r.lineas.join('\n'));
ok(r.ok&&copias.length===1&&ctx.__ed==='otra@x.com'&&sheets['Autorizaciones WFS'].getLastRow()===2,'copia real: crea, comparte, registra');
const c1=copias[0].hojas[0];console.log(JSON.stringify(c1.d.slice(3,8)));
ok(c1.d[4][0]==='AAA-111-MSI'&&c1.d[4][3]===10&&c1.d[4][4]===10,'copia trae SKU, propuesta y AUTORIZADO inicial');
r=A('wfsAutorizaCopiaForm','REAL');ok(!r.ok&&copias.length===1,'segunda copia pendiente: no duplica');
// la otra persona edita
c1.d[4][4]=7;c1.d[5][4]='';
r=A('wfsAutorizaTraerForm','PRUEBA');console.log(r.lineas.join('\n'));
ok(r.ok&&E.d[1][ix('AUTORIZADO')]===10,'traer ver: no escribe');
r=A('wfsAutorizaTraerForm','REAL');console.log(r.lineas.join('\n'));
ok(r.ok&&E.d[1][ix('AUTORIZADO')]===7&&E.d[2][ix('AUTORIZADO')]===0,'traer real: escribe 7 y blanco=0');
E.d[1][ix('AUTORIZADO')]=10;E.d[2][ix('AUTORIZADO')]=5;c1.d.splice(5,1);c1.d[4][4]=7;
r=A('wfsAutorizaTraerForm','REAL');console.log(r.lineas.join('\n'));
ok(r.ok&&E.d[1][ix('AUTORIZADO')]===7&&E.d[2][ix('AUTORIZADO')]===0,'fila borrada en la copia => 0, conciliado por SKU');
ok(/^TRAIDO/.test(sheets['Autorizaciones WFS'].d[1][4]),'registro marcado TRAIDO');
c1.d[4][4]='abc';r=A('wfsAutorizaTraerForm','REAL');ok(!r.ok&&E.d[1][ix('AUTORIZADO')]===7,'cantidad no valida: no escribe');
console.log(p+' OK, '+f+' FALLAS');process.exit(f?1:0);
