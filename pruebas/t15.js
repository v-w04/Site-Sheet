const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(__dirname+'/../apps-script/KillersCorreo.gs','utf8');
const a=src.indexOf('var KC_CUENTA_SEG'),b=src.indexOf('function kcEnviar()');
const helper='var KC_HOJA_LOG="Envios killers";'+src.slice(a,b);
function run(cancelEn){
  const cells={},calls=[];let sleeps=0;
  const rng=(r,c)=>{const o=new Proxy({setValue:v=>{cells[r+','+c]=v;return o},setValues:v=>{cells[r+','+c]=v;return o},getValue:()=>c===9&&r===3?(cancelEn&&sleeps>=cancelEn):cells[r+','+c],insertCheckboxes:()=>{calls.push('chk');return o},clear:()=>{calls.push('clear:'+r+','+c);return o}},{get:(t,k)=>k in t?t[k]:(()=>o)});return o};
  const h={getRange:(r,c,nr,nc)=>rng(r,c),setColumnWidth(){}};
  const ctx={console,Utilities:{sleep:()=>{sleeps++}},SpreadsheetApp:{flush(){},getActive:()=>({setActiveSheet(){},toast(){}})},kcLog_:()=>h};
  vm.createContext(ctx);vm.runInContext(helper,ctx);
  const r=vm.runInContext("kcCuentaRegresiva_(30,'Prueba')",ctx);
  return {r,sleeps,limpio:calls.some(x=>x.startsWith('clear'))};
}
let p=0,f=0;const ok=(c,m)=>{c?p++:f++;console.log(c?'OK':'FALLA',m)};
let x=run(0);ok(x.r===true&&x.sleeps===30&&x.limpio,'sin cancelar: espera 30 s, devuelve true y limpia el bloque');
x=run(5);ok(x.r===false&&x.sleeps===5&&x.limpio,'casilla marcada al s5: devuelve false, para y limpia');
console.log(p+' OK '+f+' FALLA');
