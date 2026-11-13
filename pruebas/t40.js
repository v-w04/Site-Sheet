// Recorte de filas/columnas vacias (Organizar.gs orgRecortar_) y escrituras que agregan filas (Escritura.gs). Datos simulados.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,Infinity};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m,d)=>logs.push([k,e,m,d]));
['Organizar','Escritura'].forEach(f=>vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+f+'.gs','utf8'),ctx));
function H(nombre,mr,mc,lr,lc,o){o=o||{};return{nombre,mr,mc,lr,lc,del:[],
 getName(){return nombre},isSheetHidden(){return !!o.oculta},getCharts(){return o.graf?[1]:[]},getLastRow(){return lr},getLastColumn(){return lc},
 getFrozenRows(){return 1},getFrozenColumns(){return 0},getMaxRows(){return this.mr},getMaxColumns(){return this.mc},
 getRange(){return{getFormulas:()=>[[o.formula||'']]}},
 deleteRows(a,n){if(a<=lr)throw new Error('borro una fila con datos');this.mr-=n},insertRowsAfter(a,n){this.mr+=n},
 deleteColumns(a,n){if(a<=lc)throw new Error('borro una columna con datos');this.mc-=n}}}
const hs=[H('Casos Walmart',2000,26,10,12),H('Inventario Negativo',1482,7,1,7),H('Ventas Walmart',1400,60,1373,53),
 H('Concentrado',2444,23,2094,23),H('Formulas',1000,26,50,5,{formula:'=ARRAYFORMULA(A2:A)'}),H('Graf',1000,26,50,5,{graf:1}),
 H('Justa',100,5,100,5),H('Log',3001,5,3001,5),H('Oculta',1000,26,50,5,{oculta:1})];
const ss={getSheets:()=>hs};
ctx.orgQueda_=()=>100000;
const n=vm.runInContext('orgRecortar_',ctx)(ss);
const g=x=>hs.find(h=>h.nombre===x);
t(g('Casos Walmart').mr===15&&g('Casos Walmart').mc===12,'hoja a mano: 10 filas + 5 de margen, columnas hasta la ultima con algo');
t(g('Inventario Negativo').mr===3&&g('Inventario Negativo').mc===7,'hoja con solo encabezado: tambien se recorta (encabezado + 2 de margen)');
t(g('Ventas Walmart').mr===1375&&g('Ventas Walmart').mc===53,'filas: queda con 2 de margen; columnas vacias fuera');
t(g('Concentrado').mr===2444,'Concentrado (ARRAYFORMULA fija) no se toca');
t(g('Formulas').mr===1000&&g('Graf').mr===1000&&g('Oculta').mr===1000,'formulas de arreglo, graficas y ocultas no se tocan');
t(g('Justa').mr===102,'sin filas libres: le regresa el margen');
t(g('Log').mr===3003,'Log lleno: recupera su margen de 2');
t(n>=4&&logs.some(l=>l[1]==='ORDENAR'),'cuenta y deja Log');
// escrAsegurarFilas_
const h2={mr:10,getMaxRows(){return this.mr},insertRowsAfter(a,k){this.mr+=k}};
vm.runInContext('escrAsegurarFilas_',ctx)(h2,11,5);t(h2.mr===15,'agrega filas para escribir de la 11 a la 15');
vm.runInContext('escrAsegurarFilas_',ctx)(h2,2,3);t(h2.mr===15,'si caben no agrega');
console.log('t40: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
