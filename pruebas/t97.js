// t97: Ordenar hojas e indice reanudable (24-nov): una etapa terminada no se repite y, sin tiempo, se salta y queda pendiente. Nada real.
const fs=require('fs'),vm=require('vm');let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const src=fs.readFileSync(__dirname+'/../apps-script/Organizar.gs','utf8');
const P={};const ctx={console,JSON,Date,Object,Array,String,Number,Math,RegExp,Utilities:{sleep(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>P[k]===undefined?null:P[k],setProperty:(k,v)=>{P[k]=v},deleteProperty:k=>{delete P[k]}})}};vm.createContext(ctx);
const a=src.indexOf('/* 24-nov (ella: "se para siempre'),b=src.indexOf('/* Cada grupo = UN solo color');
const c=src.indexOf('/** Milisegundos que le quedan'),d=src.indexOf('/** Menu: ordena y avisa');
vm.runInContext('var ORG_PRESUPUESTO_MS=280000,ORG_T0=0;'+src.slice(a,b)+src.slice(c,d),ctx);
let n=0;const av=[];
ctx.ORG_T0=Date.now();
t(ctx.orgEtapa_('A',()=>{n++;return 5},av)===5&&n===1,'corre la etapa y devuelve su resultado');
t(ctx.orgEtapa_('A',()=>{n++;return 9},av)===5&&n===1,'una etapa ya hecha no se repite (devuelve lo guardado)');
t(ctx.orgEtapa_('Formatos',()=>{n++;return 1},av)===1&&ctx.orgEtapa_('Formatos',()=>{n++;return 2},av)===2&&n===3,'Formatos/Anchos/Recorte se repiten (se retoman solos por dentro)');
ctx.ORG_T0=Date.now()-250000;   // quedan 30 s: menos del minimo
t(ctx.orgEtapa_('B',()=>{n++;return 1},av)===null&&n===3&&ctx.ORG_PEND.indexOf('B')>=0,'sin tiempo: se salta y queda pendiente');
ctx.ORG_T0=0;
t(ctx.orgEtapa_('C',()=>{n++;return 7},av)===7&&!('C' in JSON.parse(P.ORG_HECHAS||'{}')),'la corrida por hora (ORG_T0=0) no lleva cuenta ni se salta');
t(/tgUnaVez_\('orgSeguir_', 60000\)/.test(src)&&/function orgSeguir_/.test(src)&&/Guia \(crear\)/.test(src),'continuacion automatica en 1 min y la etapa Guia ya no choca de nombre');
console.log('t97',ok,'ok',bad,'fallas');process.exit(bad?1:0);
