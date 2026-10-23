const fs=require('fs'),vm=require('vm');
const S=__dirname+'/../apps-script/', U=S;
const D=JSON.parse(fs.readFileSync(''+__dirname+'/datos/parr_data.json','utf8'));
let p=0,f=0;const ok=(c,m)=>{c?p++:f++;console.log(c?'OK':'FALLA',m)};
const noop=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:noop(),apply:()=>noop()});
class Sh{constructor(n,d){this.n=n;this.d=d}getName(){return this.n}setColumnWidth(){}
 getLastRow(){let l=0;this.d.forEach((r,i)=>{if(r.some(c=>c!==''&&c!=null))l=i+1});return l}
 getLastColumn(){let l=0;this.d.forEach(r=>r.forEach((c,j)=>{if(c!==''&&c!=null&&j+1>l)l=j+1}));return l}
 getRange(r,c,nr,nc){const s=this;nr=nr||1;nc=nc||1;
  return new Proxy({getValues:()=>{const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((s.d[r-1+i]||[])[c-1+j]??'');o.push(row)}return o},
   setValues:v=>{v.forEach((row,i)=>{while(s.d.length<r+i)s.d.push([]);row.forEach((x,j)=>{s.d[r-1+i][c-1+j]=x})})},
   setValue:x=>{while(s.d.length<r)s.d.push([]);s.d[r-1][c-1]=x;return noop()}},{get:(t,k)=>k in t?t[k]:noop()})}
 getDataRange(){return{getValues:()=>this.d.map(r=>r.slice())}}}
const hojas={};for(const n in D)hojas[n]=new Sh(n,D[n].map(r=>r.slice()));
const logs=[],escritas={};
const ctx={console,Date,JSON,Math,Object,Array,String,Number,isNaN,parseInt,
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
const D2=hojas['KAMS Departamentos'];
// 1a corrida: crea la tabla
let r=vm.runInContext('parActualizar_(true)',ctx);
const hdr=D2.d[0]; console.log(hdr);
ok(hdr.slice(0,2).join()==='DEPARTAMENTO,GRUPO KAM'&&hdr[2]===undefined||hdr[2]==='','A:B intactas y columna separadora');
const ic=hdr.indexOf('CATEGORIA WALMART'),ig=hdr.indexOf('GRUPO KAM CATEGORIA'),id=hdr.indexOf('DEPARTAMENTO WALMART'),inn=hdr.indexOf('SKU MSI');
ok(ic>3&&ig>ic&&id>=3&&inn>ig,'4 encabezados nuevos a la derecha');
const filas=D2.d.slice(1).filter(x=>x[ic]);
console.log('categorias',filas.length, 'sin sugerencia',filas.filter(x=>!x[ig]).length);
ok(D2.d.slice(1,14).every((x,i)=>x[0]===D['KAMS Departamentos'][i+1][0]&&x[1]===D['KAMS Departamentos'][i+1][1]),'DEPARTAMENTO/GRUPO KAM sin cambios');
const gx=(d,c)=>{const x=filas.find(x=>x[id]===d&&x[ic]===c);return x&&x[ig]};
console.log('Computadoras/Auriculares',gx('Computadoras','Auriculares'),'| Videojuegos/Laptops',gx('Videojuegos','Laptops'),'| Computadoras/Controles',gx('Computadoras','Controles para consolas de videojuegos'),'| Celulares/Relojes',gx('Celulares','Relojes Inteligentes'),'| Audio/Bocinas',gx('Audio','Bocinas Portátiles'),'| Fotografía/Memoria Flash',gx('Fotografía','Memoria Flash'));
ok(gx('Computadoras','Auriculares')==='AUDIO'&&gx('Videojuegos','Laptops')==='COMPUTACION'&&gx('Computadoras','Controles para consolas de videojuegos')==='VIDEOJUEGOS'&&!gx('Celulares','Relojes Inteligentes')&&gx('Audio','Bocinas Portátiles')==='AUDIO','sugerencias por categoria');
console.log(r.categorias, 'parrillas',r.total,'analisis',r.analisis);
// el usuario cambia decisiones
const fila=(d,c)=>D2.d.findIndex((x,i)=>i>0&&x[id]===d&&x[ic]===c);
D2.d[fila('Computadoras','Auriculares')][ig]='NO ENVIAR';
D2.d[fila('Celulares','Relojes Inteligentes')][ig]='NO ENVIAR';
D2.d[fila('Celulares','Teléfonos Celulares')][ig]='TV'; // cualquiera
const antes=D2.d.length;
r=vm.runInContext('parActualizar_(true)',ctx);
ok(D2.d.length===antes&&r.categorias.nuevas===0,'no duplica categorias en la 2a corrida');
ok(D2.d[fila('Computadoras','Auriculares')][ig]==='NO ENVIAR','respeta lo que el usuario puso');
const P=escritas['Parrilla TV'].filas, A=escritas['Analisis Killers'].filas;
ok(!A.some(x=>x[2]==='Relojes Inteligentes')&&!A.some(x=>x[2]==='Teléfonos Celulares'),'categoria decidida (NO ENVIAR o KAM) sale del analisis');
ok(!A.some(x=>x[1]==='Computadoras'&&x[2]==='Auriculares'),'NO ENVIAR por categoria no se lista');
const a=vm.runInContext("(function(){var k=kamsLeer_();return [kamsGrupoPorCat_(k,'Celulares','Teléfonos Celulares'),kamsGrupoPorCat_(k,'Celulares','Relojes Inteligentes'),kamsGrupoPorCat_(k,'Audio','Bocinas Portátiles'),k.catHay]})()",ctx);
console.log(a); ok(a[0]==='TV'&&a[1]==='NO ENVIAR'&&a[2]==='AUDIO'&&a[3],'killers bajo minimo lee la misma tabla');
// categoria nueva
const W=hojas['Walmart'];const hw=W.d[0];const row=W.d[1].slice();row[hw.indexOf('DEPARTAMENTO')]='Mascotas';row[hw.indexOf('CATEGORIA')]='Collares-MSI';row[hw.indexOf('SKU')]='ZZZ-1-MSI';W.d.push(row);
r=vm.runInContext('parActualizar_(true)',ctx);
ok(r.categorias.nuevas===1&&r.categorias.sinDecidir>=1,'categoria nueva se agrega sin decidir');
ok(logs.some(l=>/Categorias \(KAMS Departamentos\)/.test(l[1])),'log con categorias');
console.log(p+' OK '+f+' FALLA');
