// Alertas de envio (CanceladasEnCamino.gs) con los 5 pedidos reales de la imagen y casos limite. Simulado.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Math,Object,Array,String,Number,RegExp,isNaN};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CanceladasEnCamino.gs','utf8'),ctx);
const ahora=Date.parse('2026-11-10T19:00:00Z'), A=d=>vm.runInContext('cecAlerta_('+JSON.stringify(d)+','+ahora+')',ctx);
const base={estatus:'Created',env:'recolectado',ultTxt:'Guía creada por Walmart',guia:'MXFDDWM21640553',ts:Date.parse('2026-10-08T05:50:00Z'),consultado:Date.parse('2026-11-02T14:19:00Z'),dias:36};
let a=A(base); t(a&&a.estado==='GUIA SIN MOVIMIENTO','Created + guia creada hace 33 d -> GUIA SIN MOVIMIENTO');
a=A(Object.assign({},base,{ts:Date.parse('2026-11-10T05:00:00Z'),dias:6,consultado:Date.parse('2026-11-10T10:00:00Z')})); t(a===null,'guia creada hoy: sin alerta');
a=A(Object.assign({},base,{ts:Date.parse('2026-11-08T05:00:00Z'),dias:6,consultado:Date.parse('2026-11-10T10:00:00Z')})); t(a&&a.estado==='GUIA SIN MOVIMIENTO','guia creada hace 2 d -> alerta');
a=A({estatus:'Shipped',env:'recolectado',ultTxt:'Recolectado',guia:'X1',ts:Date.parse('2026-11-01T00:00:00Z'),consultado:Date.parse('2026-11-10T00:00:00Z'),dias:10}); t(a&&a.estado==='RECOLECTADO DETENIDO','recolectado sin avance 9 d -> RECOLECTADO DETENIDO');
a=A({estatus:'Shipped',env:'recolectado',ultTxt:'Recolectado',guia:'X1',ts:Date.parse('2026-11-08T00:00:00Z'),consultado:Date.parse('2026-11-10T00:00:00Z'),dias:10}); t(a===null,'recolectado hace 2 d: sin alerta');
a=A({estatus:'Shipped',env:'recolectado',ultTxt:'',guia:'X1',ts:0,consultado:Date.parse('2026-11-02T00:00:00Z'),dias:14}); t(a&&a.estado==='RASTREO SIN ACTUALIZAR','sin movimiento conocido y consulta de hace 8 d -> RASTREO SIN ACTUALIZAR');
a=A({estatus:'Shipped',env:'recolectado',ultTxt:'',guia:'X1',ts:0,consultado:Date.parse('2026-11-10T00:00:00Z'),dias:14}); t(a===null,'consulta de hoy: sin alerta');
t(A(Object.assign({},base,{env:'entregado'}))===null,'entregado: sin alerta');
t(A(Object.assign({},base,{env:'cancelado'}))===null,'guia cancelada: sin alerta');
t(A(Object.assign({},base,{guia:''}))===null,'sin guia: sin alerta (eso es otro tema)');
t(A(Object.assign({},base,{estatus:'Cancelled'}))===null,'Walmart cancelado: sin alerta');
console.log('t_cec: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
