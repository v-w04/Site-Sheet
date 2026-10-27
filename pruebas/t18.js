// t18 — WFS en Site Sheet: calculo igual a WFS 1.0 (datos reales 23-oct), formulas, nuevo envio, archivar, traer, automatico.
// Correr desde la carpeta pruebas:  node t17.js
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
['Wfs.gs','WfsHoja.gs','WfsEnvios.gs','WfsChoferes.gs'].forEach(n=>vm.runInContext(fs.readFileSync(WFS+'/'+n,'utf8'),ctx,{filename:n}));
vm.runInContext('1',ctx);
const run=c=>vm.runInContext(c,ctx);
const ENC=run('WFS_ENV_ENC');
const mk=(nom,ch,cm)=>{const d=[ENC.slice()];const r2=new Array(ENC.length).fill('');r2[4]='PROMOTORA RESTREPO';r2[5]='ELECTRONICS.MEXICO';r2[6]='TRANSPORTISTA';r2[7]='qr@x.com';r2[0]='ID1';r2[3]='D123';d.push(r2);
 const n=Math.max(ch.length,cm.length);for(let i=0;i<n;i++){const r=new Array(ENC.length).fill('');if(ch[i]){r[4]=ch[i][0];r[7]=ch[i][1];r[8]=ch[i][2]}if(cm[i]){r[5]=cm[i][0];r[6]=cm[i][1]}d.push(r)}
 const h=new Sh(nom,d);ss._add(h);return h};
ss._add(new Sh('CATALOGO CHOFERES',[['CHOFER','CURP','CONTACTO','VECES','ULTIMO ENVIO'],['LUIS PEREZ','CURP1','55 1',3,'ENVIO 19'],['ANA RUIZ','CURP2','55 2',2,'ENVIO 19']]));
ss._add(new Sh('CATALOGO CAMIONETAS',[['PLACAS','COLOR','TIPO','VECES','ULTIMO ENVIO'],['AAA111','BLANCO','CRAFTER',5,'ENVIO 19'],['BBB222','BLANCO','TRANSIT',2,'ENVIO 19']]));
mk('ENVIO 20 28/10/26',[['LUIS PEREZ','CURP1','55 1'],['ANA RUIZ','CURP2','55 2']],[['AAA111 BLANCO','CRAFTER']]);
ss.getActiveSheet=()=>sheets['ENVIO 20 28/10/26'];
let d=run("wfsChDatos('')");
ok(d.hoja==='ENVIO 20 28/10/26'&&d.hojas.length===1,'datos: toma la hoja ENVIO');
ok(d.choferes.filter(x=>x.marcado).length===2&&d.camionetas.filter(x=>x.marcado).length===1,'datos: marca los actuales');
ok(d.camionetas.some(x=>x.a==='BBB222'&&!x.marcado),'datos: el catalogo aparece sin marcar');
// cambio: quitar ANA, agregar CARLOS (nuevo), camionetas AAA111 + BBB222
ctx.__o={hoja:'ENVIO 20 28/10/26',choferes:[{nombre:'LUIS PEREZ',curp:'curp1',contacto:'55 1'},{nombre:'carlos nuevo',curp:'cnuevo01',contacto:'55 9'}],camionetas:[{placas:'AAA111',color:'BLANCO',tipo:'CRAFTER'},{placas:'BBB222',color:'BLANCO',tipo:'TRANSIT'}]};
const msg=run('wfsChGuardar(__o)');
console.log(msg);
const lec=run("wfsLeerHojaEnvio_(SpreadsheetApp.getActive().getSheetByName('ENVIO 20 28/10/26'))");
ok(lec.choferes.map(x=>x[1]).join('|')==='LUIS PEREZ|CARLOS NUEVO','la hoja queda con los choferes finales (ANA fuera)');
ok(lec.camionetas.length===2&&lec.camionetas[1][1]==='BBB222','la hoja queda con las camionetas finales');
ok(sheets['ENVIO 20 28/10/26'].d[1][4]==='PROMOTORA RESTREPO'&&sheets['ENVIO 20 28/10/26'].d[1][7]==='qr@x.com','la cabecera del envio (fila 2) no se toca');
const cat=sheets['CATALOGO CHOFERES'].d;
ok(cat.length===4&&cat[3][0]==='CARLOS NUEVO','el chofer nuevo pasa al catalogo');
ok(sheets['CATALOGO CAMIONETAS'].d.length===3,'camioneta existente no se duplica');
// segundo guardado igual no duplica catalogo
run('wfsChGuardar(__o)');
ok(sheets['CATALOGO CHOFERES'].d.length===4,'guardar otra vez no duplica el catalogo');
// validaciones
ctx.__o2={hoja:'ENVIO 20 28/10/26',choferes:[],camionetas:ctx.__o.camionetas};
let e1='';try{run('wfsChGuardar(__o2)')}catch(e){e1=e.message}
ok(/al menos un chofer/.test(e1),'sin choferes: no guarda');
ss._add(new Sh('ENVIO 5 vieja',[['A','B','C'],['x','y','z']]));
ctx.__o3={hoja:'ENVIO 5 vieja',choferes:ctx.__o.choferes,camionetas:ctx.__o.camionetas};
let e2='';try{run('wfsChGuardar(__o3)')}catch(e){e2=e.message}
ok(/no tiene el formato/.test(e2),'hoja vieja a mano: no la toca');
console.log(p+' OK '+f+' FALLA');
