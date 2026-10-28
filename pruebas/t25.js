// t25 PDF del envio (filas K-T sin N,O,P,Q,T; sin vacias)
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
['Wfs.gs','WfsHoja.gs','WfsEnvios.gs','WfsChoferes.gs','WfsPlantilla.gs','WfsAutoriza.gs','WfsTraslado.gs','WfsRestricciones.gs','WfsPdf.gs'].forEach(n=>vm.runInContext(fs.readFileSync(WFS+'/'+n,'utf8'),ctx,{filename:n}));

const run=c=>vm.runInContext(c,ctx);
const ENC=run('WFS_ENV_ENC');
const ix=(n,o)=>{let k=0;for(let i=0;i<ENC.length;i++)if(ENC[i]===n&&++k===(o||1))return i};
const mkEnvio=(nom,det,delivery)=>{const d=[ENC.slice()];const r2=new Array(ENC.length).fill('');r2[ix('DELIVERY')]=delivery;r2[ix('FECHA')]='2026-10-28';r2[ix('HORA')]='08:00';r2[ix('CHOFER')]='PROMOTORA RESTREPO';d.push(r2);
 det.forEach((x,i)=>{const r=i===0?r2:new Array(ENC.length).fill('');if(i===0){}else d.push(r);
  r[ix('SKU')]=x[0];r[ix('AUTORIZADO')]=x[1];r[ix('PROPUESTA')]=x[1];r[ix('SKU BASE')]=x[0].replace(/-MSI(-\d)?$/,'')});
 const h=new Sh(nom,d);ss._add(h);return h};
const E=mkEnvio('ENVIO 20 28/10/26',[['AAA-111-MSI',10],['BBB-222-MSI',5],['CCC-333-MSI',0],['ZZZ-999-MSI',2]],'DLV123');
const gi=ix('AUTORIZADO')+1;[['7501234567890'],['12345678901'],[''],['']].forEach((g,i)=>{E.d[1+i][gi]=g[0]});
E.d[1][ix('CATEGORIA')]='C1';E.d[1][ix('NOMBRE')]='Prod A';
ss.getActiveSheet=()=>sheets['ENVIO 20 28/10/26'];


const pf=run("wfsPdfFilas_(SpreadsheetApp.getActive().getSheetByName('ENVIO 20 28/10/26'))");console.log(JSON.stringify(pf));
ok(pf.filas.length===2,'pdf: solo filas con piezas y GTIN valido (CCC en 0 y ZZZ sin GTIN no salen)');
ok(pf.filas[0].length===5&&pf.filas[0][0]==='C1'&&pf.filas[0][1]==='Prod A'&&pf.filas[0][2]==='AAA-111-MSI'&&pf.filas[0][3]===10&&pf.filas[0][4]==='07501234567890','pdf: columnas CATEGORIA, NOMBRE, SKU, AUTORIZADO, GTIN (pad a 14)');
ok(pf.total===15&&pf.ceros===1&&pf.sinGtin===1,'pdf: total 15 piezas, cuenta 1 en 0 y 1 sin GTIN');
ok(pf.cab.delivery==='DLV123'&&pf.cab.hora==='08:00','pdf: cabecera con delivery y hora');
ok(pf.filas.every(f=>f.every(c=>c!==''||f.indexOf(c)===0||f.indexOf(c)===1)),'pdf: sin filas vacias');
// con una restriccion: sale de noWfs y no del PDF
E.d[3][ix('SKU')]='MIC-EP2-29929-NEG-8159';E.d[3][ix('AUTORIZADO')]=7;
const pf2=run("wfsPdfFilas_(SpreadsheetApp.getActive().getSheetByName('ENVIO 20 28/10/26'))");
ok(pf2.noWfs.length===1&&!pf2.filas.some(f=>/MIC-EP2/.test(f[2])),'pdf: clasica no va en el PDF');
ok(/^CANON RF TELEOBJETIVO 75-300MM F4-5\.6\u2026$/.test(run("wfsPdfCorta_('CANON RF TELEOBJETIVO 75-300MM F4-5.6 PARA CAMARAS EOS NEGRO')"))&&run("wfsPdfCorta_('Prod A')")==='Prod A','pdf: nombre largo se corta a 38 + puntos, el corto no cambia');
console.log(p+' OK '+f+' FALLA');
