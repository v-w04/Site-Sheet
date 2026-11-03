# Sobreventa WFS, casos Walmart y formato de reporte (2-nov-2026)

## Sobreventa WFS (SobreventaWfs.gs)
- Fuente: hoja Sobreventa WFS (Odoo, salidas WFS de Walmart sin surtir, picking type 14). Al 2-nov: 51 pedidos de jun a oct.
- Cada bajada (30 min) cruza cada pedido con: site (referencia 6000…: estado en Walmart, canal, envío, fecha; 1 consulta cada 6 h por pedido), stock libre en la ubicación WFS de Odoo (columna Desde) y traslados abiertos a WFS (hoja Traslados Odoo).
- Columnas: ESTADO WM, ENVIO, CANAL, FECHA VENTA, FOLIO, STOCK WFS, EN TRASLADO, QUE PASO, ACCION, REVISADO.
- QUE PASO → ACCION:
  - Cancelada en Walmart → Cancelar en Odoo
  - WFS la surtió · hay stock WFS → Comprobar disponibilidad y validar
  - WFS la surtió · stock en traslado → Validar traslado y luego la salida
  - WFS la surtió · Odoo sin stock WFS → Cargar stock WFS en Odoo y validar
  - Venta seller con salida WFS → Revisar (se surte de bodega)
  - Walmart no la surte (n d) → Revisar en Seller Center · Walmart aún no la surte → Esperar
  - No está en el site → Buscar en Seller Center
- Solo lee. Falta decidir con el usuario qué se automatiza por caso (cancelar marcadas, ajuste/traslado WFS).

## Casos Walmart por correo (CasosWalmart.gs, cawLeerCorreo_)
- Los avisos de Seller Support llegan a la cuenta de Victor (victor.walmart.04@gmail.com); corre cada hora dentro de cancelacionesProgramado_ (la cuenta que recibe los correos de Walmart) y en el menú Casos Walmart.
- Tipos: apertura (Número de caso 8 dígitos), respuesta, pide info, resuelto ("Tu ticket N ha sido resuelto"), cierre ("Cierre de caso N"); Garantías y Detención de embarque por TIPO + PEDIDO. Clave: folio, ref de Salesforce (ref:!00D…!xxx:ref) o TIPO + PEDIDO.
- Columnas nuevas: PEDIDO, ULTIMO CORREO, ACCION, REF WALMART. Estados: POR ABRIR, ABIERTO, PIDE INFO, RESPUESTA WALMART, EN ESPERA WALMART, RESUELTO, CERRADO.
- No guarda el cuerpo del correo (datos de clientes).

## Formato de reporte (cuando el usuario pide "reporte")
Muy corto, una línea por área, sin explicaciones:
```
Reporte HH:MM
Corridas: ✅ … | ⏳/❌ …
Sobreventa WFS: n · cancelar n · sin stock WFS n · … | Pick: n
Killers: n activos · cambios hoy n
Precios erróneos: n hoy · n mes
Cancelaciones: n nuevas · n canceladas
Recolección: última solicitud dd/mm
Casos: n abiertos · n pide info · n por abrir
⚡ lo que tiene que hacer (si hay)
```
