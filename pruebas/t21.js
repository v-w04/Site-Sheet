// t21 formato hoja ENVIO, popups (JS valido, ID/DELIVERY), editor con datos del envio
// t19 — WFS en Site Sheet: calculo igual a WFS 1.0 (datos reales 23-oct), formulas, nuevo envio, archivar, traer, automatico.
// Correr desde la carpeta pruebas:  node t20.js
const fs=require('fs'),vm=require('vm');
const SITE=__dirname+'/../apps-script', WFS=SITE;
let p=0,f=0;const ok=(c,m)=>{c?p++:f++;console.log(c?'OK':'FALLA',m)};
const noop=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:noop(),apply:()=>noop()});
class Sh{setRowHeight(){} setTabColor(){} constructor(n,d){this.n=n;this.d=d.map(r=>r.slice());this.fx={};this.max=Math.max(this.d.length,300);this.oculta=false}
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


ctx.SpreadsheetApp.BorderStyle={SOLID:'SOLID'};
const fm=run("wfsFormatoEnvio_(SpreadsheetApp.getActive().getSheetByName('ENVIO 20 28/10/26'))");
ok(fm.detalle===4&&fm.choferes===0,'formato: cuenta detalle y corre sin error ('+JSON.stringify(fm)+')');
// popups: el JS del HTML compila y trae los inputs nuevos
const h1=run('wfsHtmlNuevoEnvio_()'),h2=run('wfsChHtml_()');
[h1,h2].forEach((h,i)=>{const js=h.split('<script>')[1].split('</script>')[0];let o=true;try{new Function(js)}catch(e){o=false;console.log(e.message)}ok(o,'JS valido popup '+(i+1))});
ok(/id="idenv"/.test(h1)&&/id="deliv"/.test(h1)&&/idEnvio:/.test(h1),'nuevo envio trae ID y DELIVERY');
ok(/min-width:0/.test(h1)&&/min-width:0/.test(h2),'fieldset sin desborde (min-width:0)');
ok(/id="i_id"/.test(h2)&&/id="i_del"/.test(h2)&&/info:\{id:/.test(h2),'editor trae ID, DELIVERY, fecha y hora');
// editor: guarda ID/DELIVERY/fecha/hora
ctx.__o={hoja:'ENVIO 20 28/10/26',choferes:[{nombre:'JUAN',curp:'X',contacto:'1'}],camionetas:[{placas:'AAA1',color:'BLANCO',tipo:'VAN'}],info:{id:'12345',delivery:'DLV999',fecha:'2026-11-02',hora:'09:30'}};
const out=run('wfsChGuardar_(__o)');console.log(out);
const E2=sheets['ENVIO 20 28/10/26'];
ok(E2.d[1][0]==='12345'&&E2.d[1][ix('DELIVERY')]==='DLV999'&&E2.d[1][ix('HORA')]==='09:30','editor escribe ID, DELIVERY y hora en la fila 2');
ok(E2.d[2][ix('CHOFER')]==='JUAN','editor sigue guardando choferes');
ctx.__o.info.fecha='mañana';let e='';try{run('wfsChGuardar_(__o)')}catch(x){e=x.message}ok(/fecha/.test(e),'fecha mala: error y no escribe');
const dd=run("wfsChDatos('ENVIO 20 28/10/26')");ok(dd.info&&dd.info.id==='12345','datos del editor traen info actual');
console.log(p+' OK, '+f+' FALLAS');process.exit(f?1:0);
