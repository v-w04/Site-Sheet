const fs=require('fs');
const SP='apps-script/Setup.gs', OR='apps-script/Organizar.gs';
const I=(l,f)=>({i:[l,f]}), S=(n,c)=>({s:n,c}), SEP={sep:1};
const T=[
 I('🔄 Bajar TODO ahora','uiBajarTodo'),
 I('💲 Actualizar precios y killers (todo en orden)','actualizarPreciosTodo'),
 I('🗂️ Ordenar hojas e índice','orgOrdenar'),
 I('⬇️ Descargar una hoja como Excel','descargarHoja'),
 SEP,
 S('🔥 Killers',[
  I('📋 Actualizar parrillas por KAM','parrillasActualizar'),
  I('⬇️ Bajar killers del site (y recalcular todo)','killersBajarYRecalcular'),
  S('🎯 Killers activos y Comparar Walmart',[
   I('🔄 Actualizar Killers activos y Comparar Walmart','killersActivosActualizar'),
   I('🎚️ Bandas de Comparar Walmart (DEJAR / REVISAR KAM)','compararBandas')]),
  S('✉️ Envíos a KAMs',[
   I('1 · Solicitud del mes (todo)','solicitudKillersEnviar'),
   I('2 · Nuevos + faltantes (sin killer)','nuevosKillersEnviar'),
   I('3 · SOLO los nuevos','soloNuevosKillersEnviar'),
   I('4 · Bajo mínimo','kcEnviar'),SEP,
   I('🔎 Revisar correos de killers enviados','killersRevisarEnviados'),
   I('✅ Verificar envíos en Gmail (columna en Envios killers)','kvVerificarMenu')]),
  S('📉 Bajo mínimo',[
   I('📊 Calcular killers bajo mínimo','kdBajar'),
   I('📋 Actualizar hoja Correo','kcActualizar'),
   I('📄 Archivo de promociones para el site','promosArchivoWalmart')])]),
 S('💲 Precios',[
  I('📤 Actualizar EXPORTAR, MINIMO y MAXIMO','exportarPreciosWalmart'),
  I('🔍 Revisar precios erróneos de ventas Walmart','preciosErroneosRevisar'),
  S('🏷 Cambio de precios (pasos 1 a 5)',[
   I('1 · 🆕 Nuevo cambio','wmNuevoCambio'),I('1b · 📋 Pegar SKUs','wmPegarSkus'),
   I('2 · ✅ Marcar lo filtrado','wmMarcarFiltrados'),I('2 · 🔤 Marcar por texto','wmMarcarPorTexto'),
   I('2 · ☑️ Marcar todo','wmMarcarTodo'),I('2 · ⬜ Desmarcar todo','wmDesmarcarTodo'),
   I('3 · ✖️ Aplicar factor de precio','wmAplicarFactor'),I('4 · 📅 Aplicar fechas','wmAplicarFechas'),
   I('5 · 📄 GENERAR ARCHIVO WALMART','wmGenerarArchivo')])]),
 S('📈 Ventas',[
  I('🗃️ Bajar histórico de ventas Walmart (site)','ventasHistoricoBajar'),
  I('📈 Bajar ventas 30 dias','ventas30Bajar'),
  S('💰 Venta total y killers (resumen del mes)',[
   I('💰 Actualizar ventas con killer','ventasKillersActualizar'),
   I('🔁 Rehacer un mes cerrado','ventasKillersRehacerMes')]),
  S('🟣 Ventas CVA',[
   I('🟣 Bajar ventas CVA (Odoo)','ventasCvaBajar'),
   I('✉️ Mandar correo CVA pendiente','ventasCvaCorreoAhora')])]),
 S('🚫 Pedidos y casos',[
  I('🔎 Consultar pedidos (site + guías)','cpConsultar'),
  I('🌐 Abrir rastreo de todos los pedidos','cpAbrirTodos'),
  I('💸 Bajar cobro distinto','cobroDistintoBajar'),
  I('📂 Casos Walmart (revisar)','casosWalmartRevisar'),
  S('📦 Sobreventa',[
   I('📦 Revisar sobreventa (Walmart)','revisarSobreventa'),
   I('👁 Ver qué cancelaría la sobreventa','cancelacionesSobreventaVer'),
   I('❌ Cancelar en Odoo las marcadas de sobreventa','cancelacionesSobreventaMarcadas')]),
  S('❌ Cancelaciones',[
   I('📥 Leer cancelaciones del correo','cancelacionesBajar'),
   I('📋 Pendientes de cancelar en el site','cancelacionesPendientesSite'),
   I('🧾 Verificar cancelaciones en Odoo','cancelacionesVerificarOdoo'),
   I('🧪 Probar cancelación en Walmart (solo lee)','cancelacionesWalmartProbar'),
   I('❌ CANCELAR EN WALMART las marcadas','cancelacionesWalmartCancelar'),
   S('⚙️ Configurar',[
    I('🔑 Guardar PIN y quién cancela','cancelacionesGuardarPin'),
    I('🔑 Guardar credenciales Walmart (API)','cancelacionesWalmartCredenciales'),
    I('⏱️ Activar cancelaciones automáticas','cancelacionesActivarTrigger'),
    I('🎨 Formato de cancelaciones','cancelacionesFormato'),
    I('↔️ Ordenar columnas de cancelaciones','cancelacionesOrdenarColumnas')])]),
  S('📄 Plantillas de caso Walmart',[
   I('1 · Llenar datos (pedido o SKU)','plantillasCasoLlenar'),
   I('2 · Descargar: no se generó la guía','plantillasCasoSinGuia'),
   I('3 · Descargar: publicado y no visible','plantillasCasoNoVisible')])]),
 S('🏬 Catálogo Walmart',[
  I('⬇️ Bajar catálogo de Walmart','wmWalmartBajar'),
  I('🔁 Actualizar hoja Republicar','republicarActualizar'),
  S('⬇️ Bajar del site (corre solo cada hora)',[
   I('🏷️ Bajar promociones del site','promosBajar'),
   I('💰 Bajar comisiones del site','comisionesBajar'),
   I('📦 Bajar catalogo CVA','cvaCatalogoBajar')]),
  S('📋 Walmart EDI',[I('📋 Bajar lista Walmart EDI','ediBajar'),I('🔀 Cruzar EDI vs Bloqueados','cruzarEdiBloqueados')]),
  S('🧾 Listas para Walmart',[
   I('📦 GTINs para convertir a WFS','wmGtinsParaConvertir'),
   I('🚫 Productos inactivos','wmProductosInactivos'),
   I('🧹 Publicaciones viejas a dar de baja','resParaDesactivar')]),
  S('🧬 Concentrado y variantes',[
   I('🧱 Armar Concentrado','armarConcentrado'),I('🧬 Armar Variantes','armarVariantes'),
   I('🔗 Asignar variante a mano','asignarVariante'),I('💰 Buscar oportunidades','armarOportunidades')])]),
 S('🚚 Logística',[
  S('🚚 Envíos WFS',[
   I('📥 Actualizar ventas y calcular','wfsActualizarMenu'),
   I('▶ Calcular envío WFS (sin traer ventas)','wfsCalcularMenu'),SEP,
   I('🚚 Nuevo envío (hoja ENVIO)','wfsNuevoEnvio'),
   I('✏️ Cambiar choferes y camionetas de un envío','wfsCambiarChoferes'),
   I('📤 Copia para autorización','wfsAutorizaCopia'),
   I('📥 Traer autorizado','wfsAutorizaTraer'),
   I('📦 Crear traslado en Odoo (envío autorizado)','wfsTrasladoOdoo'),
   I('📄 Archivo para importar el envío en Odoo','wfsArchivoImportarOdoo'),
   I('📄 Plantilla de Walmart (WFS)','wfsPlantillaWalmart'),
   I('📑 PDF del envío (CATEGORIA, NOMBRE, SKU, AUTORIZADO, GTIN)','wfsPdfEnvio'),
   I('🗄 Archivar envíos y limpiar','wfsArchivarEnvios'),SEP,
   S('🧰 Herramientas WFS',[
    I('🗑 Quitar copias sobrantes','wfsAutorizaHuerfanas'),
    I('🚫 Restricciones WFS','wfsRestricciones'),
    I('📊 Ver estado de WFS','wfsVerEstado'),
    I('⏰ Encender cálculo automático (cada hora)','wfsEncenderAuto'),
    I('🛑 Apagar cálculo automático','wfsApagarAuto')])]),
  S('🚛 Recolección Walmart',[
   I('📊 Estado (envío diario y formulario)','recMenuEstado'),
   I('🧪 Probar sin enviar','recMenuProbar'),
   I('📨 Enviar ahora','recMenuEnviarAhora'),SEP,
   I('▶️ Instalar envío diario (L-V 7am)','recMenuInstalar'),
   I('🛑 Quitar envío diario','recMenuQuitar')])]),
 S('🧾 Cotizaciones',[
  I('🆕 Nueva cotización','cotNueva'),I('🔎 Buscar productos','cotBuscar'),I('📄 Generar cotización','cotGenerar'),SEP,
  I('📚 Abrir historial','cotAbrirHistorial'),I('🧩 Reglas de búsqueda','cotReglas'),I('🔗 Usar otro libro de historial','cotCambiarHistorial')]),
 SEP,
 S('🩺 Salud y diagnóstico',[
  I('🩺 Salud del Sheet','saludMenu'),I('🧪 Probar conexión','uiProbar'),I('👁 Ver qué está configurado','uiEstado'),
  I('📊 Consumo de UrlFetch hoy','uiConsumo'),I('♻️ Reintentar tras cuota agotada','limpiarFlagCuota'),
  I('🔑 Probar credenciales de killers','killersProbarCredenciales'),
  I('🧭 Revisar columnas de todas las hojas','revisarColumnas'),
  S('🔍 Revisiones de datos',[
   I('🔍 Revisar Concentrado','revisarConcentrado'),I('🔍 Revisar variantes','revisarVariantes'),
   I('🔍 Revisar triggers de esta cuenta','revisarTriggers'),
   I('🔍 SKUs del inventario que faltan en Odoo','revisarFaltantesEnCatalogo'),
   I('🔍 Marcas y colores sin traducir','revisarSinTraducir'),
   I('🧬 Ver estructura de killers','killersVerEstructura')])]),
 S('⚙️ Configuración y mantenimiento',[
  S('⏱ Corridas automáticas',[I('🔍 Ver triggers de este proyecto','verTriggers'),I('▶️ Activar TODAS las corridas','instalarTriggers'),I('🛑 Quitar corridas','uiQuitarTriggers')]),
  S('📥 Históricos de una vez',[
   I('📥 Traer septiembre y meses del archivo (una vez)','traerHistoricoSeptiembre'),
   I('📥 Traer TODO de Venta Diaria (una vez)','ventaDiariaTraerTodo')]),
  S('🛠 Mantenimiento',[
   I('💲 Solo precios (6 hojas)','uiPrecios'),I('📦 Solo inventario','uiStock'),I('🗂 Bajar catálogo de Odoo','uiSincronizarCatalogo'),SEP,
   I('♻️ Rehacer hoja Walmart (forzado)','wmWalmartBajarForzado'),I('🧩 Rehacer hoja Inventarios','uiRehacerInventarios'),I('💥 Forzar rebajada completa','uiForzar'),SEP,
   I('🧹 Quitar respaldos y hojas viejas','limpiarHojasViejas'),I('🧹 Limpiar Log','uiLimpiarLog')]),
  S('🌐 Site y extensión',[
   I('🔑 Configurar token API','uiSetToken'),I('🔐 Login automático del site','uiSetLogin'),I('🔁 Renovar cookie ahora','uiRenovarCookie'),
   I('🍪 Actualizar cookie a mano','uiSetCookie'),I('🧩 Clave de la extensión','uiClaveExtension'),
   I('✏️ Poner ruta de precios a mano','uiSetRutaPrecios'),I('✏️ Poner ruta de killers a mano','killersRutaAMano')]),
  S('🗄 Odoo',[
   I('🗄 Conectar Odoo','uiConectarOdoo'),I('🔑 Guardar correo y contraseña de Odoo','uiOdooLogin'),I('🔐 Estado de la sesión de Odoo','odooEstadoSesion'),
   I('🩺 Diagnóstico de permisos de Odoo','odooDiagnostico'),I('🧹 Borrar correo y contraseña de Odoo','uiOdooLoginBorrar')]),
  S('📋 Este libro y avisos',[
   I('🏬 Conectar Walmart Dashboard','wmDashboardConectar'),I('📋 Capturar ID del Sheet','uiSetSheetId'),
   I('🔒 Password del dashboard','uiSetPassword'),I('📧 Poner correo de avisos','uiSetCorreoAvisos'),SEP,
   I('🗑 Borrar TODAS las credenciales','uiBorrarTodo')])]),
];
const errs=[];
(function chk(n,p){let vistoSub=false;n.forEach(x=>{if(x.s){vistoSub=true;chk(x.c,p+' > '+x.s);}else if(x.i&&vistoSub)errs.push('mezclado en '+p+': '+x.i[0]);});})(T,'RAIZ');
if(errs.length){console.log(errs.join('\n'));process.exit(1);}
const q=s=>"'"+s.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";
function emitMenu(c,ind){
  return c.map(x=>{
   if(x.sep) return ind+'.addSeparator()';
   if(x.i) return ind+'.addItem('+q(x.i[0])+', '+q(x.i[1])+')';
   return ind+'.addSubMenu(ui.createMenu('+q(x.s)+')\n'+emitMenu(x.c,ind+'  ')+')';
  }).join('\n');
}
let code="  ui.createMenu('SITE SHEET')\n"+T.map(x=>{
  if(x.sep) return '    .addSeparator()';
  if(x.i) return '    .addItem('+q(x.i[0])+', '+q(x.i[1])+')';
  return '    .addSubMenu(\n      ui.createMenu('+q(x.s)+')\n'+emitMenu(x.c,'        ')+'\n    )';
}).join('\n')+'\n    .addToUi();';
let s=fs.readFileSync(SP,'utf8');
const a=s.indexOf("  ui.createMenu('SITE SHEET')"), b=s.indexOf('.addToUi();',a);
if(a<0||b<0) throw 'ancla';
s=s.slice(0,a)+code+s.slice(b+'.addToUi();'.length);
fs.writeFileSync(SP,s);
const rows=[]; (function w(n,p){n.forEach(x=>{if(x.s)w(x.c,p?p+' › '+x.s:x.s);else if(x.i)rows.push({sec:p||'SITE SHEET',lab:x.i[0],fn:x.i[1]});});})(T,'');
let o=fs.readFileSync(OR,'utf8');
const g0=o.indexOf('var ORG_GUIA_MENU = ['), g1=o.indexOf('\n];',g0);
const lines=o.slice(o.indexOf('\n',g0)+1,g1).split('\n').filter(l=>l.trim().startsWith('['));
const re=/^  \[('(?:[^'\\]|\\.)*'), ('(?:[^'\\]|\\.)*'),/;
const mapa={};
lines.forEach(l=>{const m=l.match(re); if(!m) throw 'linea '+l.slice(0,80); const lab=eval(m[2]); (mapa[lab]=mapa[lab]||[]).push({l,m});});
const out=[], usadas=new Set(), faltan=[];
rows.forEach(r=>{const c=mapa[r.lab]; if(!c||!c.length){faltan.push(r.lab);return;} const e=c.shift(); usadas.add(e.l);
  out.push(e.l.replace(re,(all,s1,s2)=>'  ['+q(r.sec)+', '+s2+','));});
const quitadas=lines.filter(l=>!usadas.has(l)).map(l=>eval(l.match(re)[2]));
o=o.slice(0,o.indexOf('\n',g0)+1)+out.join('\n')+o.slice(g1);
fs.writeFileSync(OR,o);
console.log('menu opciones',rows.length,'guia filas',out.length,'guia antes',lines.length);
console.log('SIN FILA EN GUIA:',faltan);
console.log('FILAS DE GUIA QUITADAS:',quitadas);
