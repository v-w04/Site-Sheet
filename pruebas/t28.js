// Auditoria 30-oct: menu = guia, handlers existen, agrupado de cancelaciones, aviso de Republicar 1 vez al dia.
const fs=require('fs'),vm=require('vm');const dir=__dirname+'/../apps-script/';
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const setup=fs.readFileSync(dir+'Setup.gs','utf8');
const items=[...setup.matchAll(/\.addItem\('([^']+)',\s*'([^']+)'\)/g)];
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(dir+'Organizar.gs','utf8'),ctx);
const guia=vm.runInContext('ORG_GUIA_MENU',ctx).map(f=>f[1]);
const enGuia=x=>guia.some(g=>g===x||g.endsWith('→ '+x));
items.forEach(m=>t(enGuia(m[1]),'menu sin fila en la guia: '+m[1]));
guia.forEach(g=>t(items.some(m=>m[1]===g||g.endsWith('→ '+m[1])),'guia con opcion que ya no esta en el menu: '+g));
const todo=fs.readdirSync(dir).filter(f=>f.endsWith('.gs')).map(f=>fs.readFileSync(dir+f,'utf8')).join('\n');
items.forEach(m=>t(new RegExp('function\\s+'+m[2]+'\\s*\\(').test(todo),'el menu llama a una funcion que no existe: '+m[2]));
// cancelaciones: el agrupado de Walmart no es "otro asunto" y el asunto normal no se confunde
const re=new RegExp(/var CAN_RE_AGRUPADO = (\/.*\/i);/.exec(fs.readFileSync(dir+'Cancelaciones.gs','utf8'))[1].slice(1,-2),'i');
t(re.test('Cancelación por Solicitud del Cte 29_10_2026'),'agrupado se reconoce');
t(!re.test('Cancelación por Solicitud del Cliente'),'asunto normal NO es agrupado');
// republicar: el aviso de sin propuesta va 1 vez al dia
t(/avisoDia_\('rep-sinprop:/.test(fs.readFileSync(dir+'Republicar.gs','utf8')),'aviso sin propuesta 1 vez al dia');
console.log(ok+' OK, '+bad+' fallas');process.exit(bad?1:0);
