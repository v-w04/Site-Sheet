// t62: reparar la Orden de compra# de filas de PRECIO ERRONEO desde ID CORREO y quitar la fila repetida (con los datos reales del 11-nov).
const fs=require('fs'),vm=require('vm'),path=require('path');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const P=fs.readFileSync(path.join(__dirname,'..','apps-script','CancelacionesPrecio.gs'),'utf8').replace(/\r\n/g,'\n');
const ctx={console,JSON,String,Object,Array};vm.createContext(ctx);
vm.runInContext(P.slice(P.indexOf('function canpPlanReparar_'),P.indexOf('/** Aplica el plan a la hoja Cancelaciones')),ctx);
const PE='PRECIO ERRONEO';
// filas 59, 60, 61 de la hoja real (indices 0,1,2) + una de correo
const filas=[
 {orden:'609131694294215',id:'PRECIO-609131694301179',origen:PE,sku:'HP-15FB3093DX-NEG-6874-MSI',pedido:'600000137199022',estado:'CANCELADO EN SITE'},
 {orden:'',id:'PRECIO-609131694294215',origen:PE,sku:'SON-CFI7119-BLA-4538',pedido:'600000136570538',estado:'PENDIENTE: orden activa en Odoo'},
 {orden:'609131694301179',id:'PRECIO-609131694301179',origen:PE,sku:'HP-15FB3093DX-NEG-6874-MSI',pedido:'600000137199022',estado:'CANCELADO EN ODOO'},
 {orden:'609130490159014',id:'ID-CORREO-X',origen:'CORREO',sku:'A',pedido:'1',estado:'ERROR'}];
const plan=ctx.canpPlanReparar_(filas);
t(plan.poner.length===2&&plan.poner[0].i===0&&plan.poner[0].orden==='609131694301179'&&plan.poner[1].i===1&&plan.poner[1].orden==='609131694294215','pone la orden de ID CORREO en las filas 59 y 60: '+JSON.stringify(plan.poner));
t(JSON.stringify(plan.quitar)==='[0]','quita la repetida del HP (la que no esta cancelada en Odoo): '+JSON.stringify(plan.quitar));
t(!plan.poner.some(x=>x.i===3),'una fila de CORREO no se toca');
// ya correctas: no hace nada
const bien=[{orden:'609131694294215',id:'PRECIO-609131694294215',origen:PE,sku:'S',pedido:'1',estado:''},{orden:'609131694301179',id:'PRECIO-609131694301179',origen:PE,sku:'H',pedido:'2',estado:''}];
const p2=ctx.canpPlanReparar_(bien);t(!p2.poner.length&&!p2.quitar.length,'filas correctas: no cambia nada');
// orden numerica con .0 de Sheets
const p3=ctx.canpPlanReparar_([{orden:'609131694294215.0',id:'PRECIO-609131694294215',origen:PE,sku:'S',pedido:'1',estado:''}]);t(!p3.poner.length,'orden con ".0" no se considera distinta');
// misma orden pero distinto SKU/pedido: NO son repetidas
const p4=ctx.canpPlanReparar_([{orden:'609131694294215',id:'PRECIO-609131694294215',origen:PE,sku:'A',pedido:'1',estado:''},{orden:'609131694294215',id:'PRECIO-609131694294215',origen:PE,sku:'B',pedido:'1',estado:''}]);
t(!p4.quitar.length,'misma orden con otro SKU (pedido de varias lineas) no se quita');
const C=fs.readFileSync(path.join(__dirname,'..','apps-script','Cancelaciones.gs'),'utf8');t(/canpReparaOrdenes_\(h\)/.test(C),'se llama al verificar en Odoo');
console.log('t62: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
