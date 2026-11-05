const fs=require('fs'),vm=require('vm');const ctx={console,JSON,Object,String,RegExp};vm.createContext(ctx);
const s=fs.readFileSync('apps-script/Escritura.gs','utf8');
function ex(n){const i=s.indexOf('function '+n+'(');let d=0,j=s.indexOf('{',i);for(let k=j;k<s.length;k++){if(s[k]==='{')d++;if(s[k]==='}'){d--;if(!d){vm.runInContext(s.slice(i,k+1),ctx);return}}}}
ex('escrEstiloFamilia_');
vm.runInContext("var ORG_HOJAS=[['Walmart','WALMART'],['Oportunidades','WALMART'],['Log','SISTEMA'],['X','OCULTAS']];var ORG_GRUPOS={WALMART:{color:'#1a73e8'},SISTEMA:{color:'#e37400'},OCULTAS:{color:'#9aa0a6'},KILLERS:{color:'#d93025'}};",ctx);
const F=ctx.escrEstiloFamilia_;const H=n=>({getName:()=>n});let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
t(F(H('Walmart'),{fondo:'#eef2f7'}).fondo==='#1a73e8','gris -> azul de Walmart');
t(F(H('Parrilla TV'),{fondo:'#EEF2F7',centro:true}).fondo==='#d93025'&&F(H('Parrilla TV'),{fondo:'#EEF2F7',centro:true}).centro===true,'Parrilla -> rojo, conserva otras opciones');
t(F(H('Desconocida'),{fondo:'#eef2f7'}).fondo==='#eef2f7','hoja no registrada se queda igual');
t(F(H('X'),{fondo:'#eef2f7'}).fondo==='#eef2f7','ocultas no cambia');
t(F(H('Walmart'),{fondo:'#D93025',color:'#FFFFFF'}).fondo==='#D93025','otro estilo se respeta');
t(F(H('Walmart'),undefined)===undefined&&F(H('Walmart'),false)===false,'sin estilo no truena');
console.log(ok+' ok'+(bad?' '+bad+' FALLAS':''));process.exit(bad?1:0)
