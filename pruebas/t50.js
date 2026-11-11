// t50: killers bajo minimo. Base t38: regla de precio minimo, killers, libres, asignados, revision de Ventas Walmart. Datos simulados, no es una corrida real.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN};vm.createContext(ctx);
ctx.escrAsegurarFilas_=()=>{};
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m,d)=>logs.push([k,e,m,d]));ctx.flushLog_=()=>{};ctx.avisoDia_=()=>{};
const props={};ctx.props_=()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)}});
ctx.TZ='America/Mexico_City';ctx.toast_=()=>{};ctx.LOCK_ESPERA_MS=1;ctx.ahora_=()=>'2026-11-02 12:00:00';ctx.VH_HOJA='Ventas Walmart';ctx.dlgInfo_=()=>{};
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.Utilities={formatDate:()=>'30/10'};ctx.SpreadsheetApp={flush:()=>{}};
ctx.sha256_=x=>require('crypto').createHash('sha256').update(String(x)).digest('base64');ctx.normEnc_=s=>String(s===null||s===undefined?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
// libro simulado: hojas como matrices
const libro={};
function Hoja(n){this.n=n;this.d=libro[n]||(libro[n]=[[]]);}
Hoja.prototype={getLastRow(){return this.d.length},getLastColumn(){return Math.max(...this.d.map(r=>r.length),0)},getFrozenRows(){return 1},setFrozenRows(){},
 getRange(r,c,n,w){const d=this.d;w=w||1;return{getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,k)=>{const v=(d[r-1+i]||[])[c-1+k];return v===undefined?'':v})),
  setValues:v=>v.forEach((row,i)=>row.forEach((x,k)=>{d[r-1+i]=d[r-1+i]||[];d[r-1+i][c-1+k]=x}))}}};
ctx.getSpreadsheet_=()=>({getSheetByName:n=>libro[n]?new Hoja(n):null});
ctx.getHoja_=n=>new Hoja(n);
ctx.ubicarColumnas_=(h,enc)=>{const hd=h.d[0];enc.forEach(e=>{if(!hd.some(x=>String(x).toUpperCase()===e.toUpperCase()))hd.push(e)});return{enc,col:Object.fromEntries(hd.map((e,i)=>[String(e).toUpperCase(),i+1]))}};
ctx.escrCol_=(m,e)=>m.col[String(e).toUpperCase()]||0;
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/PreciosErroneos.gs','utf8'),ctx);vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/VentaDiaria.gs','utf8'),ctx);
ctx.kdReintentar_=f=>f();ctx.vdLibro_=()=>ctx.getSpreadsheet_();ctx.vdHoja_=n=>ctx.getHoja_(n);

libro['Precios EM Minimo']=[['Producto','SKU','Walmart Clásica','Walmart Premium'],['a','AAA-1-NEG-1',1000,1100],['b','BBB-2-NEG-2',500,550],['c','CCC-3-NEG-3-OB',800,0]];
libro['Precios CVA Minimo']=[['Producto','SKU','Walmart Clásica','Walmart Premium'],['d','DDD-4-NEG-4-CVA',2000,2100]];

vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesPrecio.gs','utf8'),ctx);
const T=R('peMinimos_()');
const dia=n=>new Date(2026,10,n);
const KS={'AAA-1-NEG-1':[{precio:900,ini:dia(1),fin:dia(30)}]};
const AC=(per,tope)=>({ex:{'AAA-1-NEG-1':per},base:{'AAA-1-NEG-1':per},tope:tope||3});
const base={tabla:T,killers:KS,asig:{},libres:{},acept:AC(7),modo:'auto',killerDesde:dia(5).getTime()};
const E=(v,c)=>R('peEvaluar_')(Object.assign({sku:'AAA-1-NEG-1',piezas:1,items:1,precio:900,fecha:dia(10),odoo:[]},v),Object.assign({},base,c||{}));
let r=E({});
t(r.sem==='BAJO MINIMO','killer vigente que esta en Killers bajo minimo con 7%: BAJO MINIMO');
t(Math.abs(r.pct+0.07)<1e-9,'su % es la perdida de Killers bajo minimo (-7%), no la diferencia contra el precio del killer: '+r.pct);
t(Math.abs(r.dif+70)<1e-6,'la diferencia $ sale de esa perdida (7% de $1000 = $70): '+r.dif);
t(/pierde 7% con el cupon/.test(r.nota),'la nota explica la perdida: '+r.nota);
t(E({fecha:dia(3)}).sem==='KILLER','venta ANTERIOR a la activacion de la regla: se sigue tratando como KILLER');
t(E({},{acept:AC(2.5)}).sem==='KILLER','killer que esta en la hoja pero pierde 3% o menos: KILLER');
t(E({},{acept:{ex:{},base:{},tope:3}}).sem==='KILLER','killer que NO esta en Killers bajo minimo: KILLER');
t(E({},{killerDesde:undefined}).sem==='BAJO MINIMO','sin fecha de activacion la regla aplica');
const CA=R('canpAuto_');
t(CA(R('peEvaluar_')({sku:'AAA-1-NEG-1',piezas:1,items:1,precio:900,fecha:dia(10),odoo:[]},base).pct)===true,'7% -> se cancela sola');
t(CA(R('peEvaluar_')({sku:'AAA-1-NEG-1',piezas:1,items:1,precio:900,fecha:dia(10),odoo:[]},Object.assign({},base,{acept:AC(4.2)})).pct)===false,'4.2% -> espera la casilla');
t(CA(R('peEvaluar_')({sku:'AAA-1-NEG-1',piezas:1,items:1,precio:900,fecha:dia(10),odoo:[]},Object.assign({},base,{acept:AC(5)})).pct)===false,'5% exacto -> espera la casilla');
t(E({precio:900},{killers:{}}).sem==='BAJO MINIMO'&&E({precio:900},{killers:{}}).pct===-0.1,'sin killer: -10% -> BAJO MINIMO con su diferencia normal');
// la fecha de activacion se fija sola la primera vez
const k1=R('peKillerDesde_()');t(k1>0&&props.PE_KILLER_DESDE===String(k1),'peKillerDesde_ guarda la fecha la primera vez');
t(R('peKillerDesde_()')===k1,'y no la cambia despues');
console.log('t50: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
