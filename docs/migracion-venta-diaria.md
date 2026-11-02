# Migración de Venta Diaria Odoo → Site Sheet (estado al 2-nov-2026)

Regla: todo lo posible del SITE; Odoo (sesión/correo de Luis) solo lo mínimo. Venta Diaria solo se LEE (nunca se cambia).
Todo está escrito y probado con datos simulados (pruebas t36–t39); falta correrlo en el libro real.

## Qué quedó en Site Sheet

| Pieza de Venta Diaria | En Site Sheet | Archivo |
|---|---|---|
| WALMART (ventas) | hoja **Ventas Walmart** (site, desde 1-oct-2026, sin duplicar, estatus/tracking se actualizan) | VentasHistorico.gs |
| PEDIDOS CVA + correo diario 8 am | hoja **Pedidos CVA** (Odoo) + correo a victor.walmart.04@gmail.com. El automático está APAGADO hasta el menú "Pasar el correo CVA a Site Sheet" (un solo remitente) | VentasCva.gs, VentaDiaria.gs |
| PRECIOS ERICK (análisis) e Histórico de alertas | columnas SEMAFORO etc. en Ventas Walmart (desde 1-nov) + hoja **Alertas de precio** | PreciosErroneos.gs |
| PRECIO LIBRE, SKU ASIGNADOS, KILLERS HISTORICO | hojas **Precio libre**, **SKU asignados**, **Killers historico** = FOTOS: cada vez que cambia la lista de killers del site se guarda la foto completa con su carga del mes ("NOVIEMBRE 2026-1", "-2", "-3"... sin tope) y la hora (FOTO). La toma la bajada de killers al escribir la hoja Killers. Septiembre y octubre (442 rangos, 163 de octubre) se copian de Venta Diaria con "Traer TODO" | PreciosErroneos.gs, Killers.gs |
| (nuevo) Ventas con killer | hojas **Ventas killers mes en curso**, **Ventas killers historico** (meses cerrados, octubre en adelante), **Ventas killers resumen**: cada venta con el killer activo en ese momento (última foto antes de la venta; antes de la primera foto, por rango), CUPON TOTAL, NOS PAGAN TOTAL, acumulado. Cada hora | VentasKillers.gs |
| KILLERS ACTIVOS | hoja **Killers activos** (solo de la hoja Killers del site). KILLERS PEGAR y el reporte KILLERS <MES> se quitaron (2-nov): el histórico mensual vive en Killers historico | KillersActivos.gs |
| COMPARAR WALMART, CATEGORIA REVISAR, bandas | hojas **Comparar Walmart**, **Categoria revisar**; bandas en un formulario | CompararWalmart.gs |
| CASOS WALMART | hoja **Casos Walmart** (manual + detectados a las 6:00 y 12:00) | CasosWalmart.gs |
| EXPORTAR / MINIMO / MAXIMO, PRECIOS VARIACIONES | hojas **EXPORTAR**, **MINIMO**, **MAXIMO**, **Precios variaciones**. Publicaciones de las hojas Walmart + Bloqueados de este libro (ya no openById al dashboard) | ExportarPrecios.gs |
| WalmartApi (customerOrderId) | no hace falta: el site trae venta (609…) y referencia (6000…), estatus y guía → **Consulta Pedidos** y Ventas Walmart | — |
| BUSCAR VENTAS | **Consulta Pedidos** | ConsultaPedidos.gs |
| KILLERS BAJO MINIMO, COBRO DISTINTO, Sobreventa WFS/Pick, COMISIONES, PRECIOS ERIK | ya eran nativos de Site Sheet | — |
| Importar ventas de Odoo, Limpieza, LOG Ventas | reemplazados: ventas del site; "Quitar respaldos y hojas viejas"; todo escribe al **Log** de Site Sheet | — |

## Corridas automáticas

- `killersProgramado` (cada hora): killers, dashboard, promos, comisiones, CVA catálogo, ventas 30 días, cobro distinto, ordenar.
- `ventasProgramado` (cada hora, trigger nuevo): ventas Walmart → ventas CVA → precios erróneos → ventas con killer → Killers activos + Comparar + Casos → EXPORTAR.
- Después de subir: menú ⏱ Corridas automáticas → ▶️ Activar TODAS las corridas (crea el trigger nuevo).
- Etapas en el Log: VENTAS_HIST, CVA_VENTAS, PRECIOS_ERR, KILLERS_ACT, COMPARAR, CASOS, EXPORTAR, VENTAS_KILLERS, VENTA_DIARIA.

## Para apagar Venta Diaria (cuando lo nuevo esté verificado)

1. Correr una vez 📥 Traer TODO de Venta Diaria (una vez).
2. Quitar los activadores de Venta Diaria Odoo (Extensiones > Apps Script > Activadores).
3. Correr 🔀 Pasar el correo CVA a Site Sheet.
4. Monitor EM lee `LOG Ventas` de Venta Diaria: apuntarlo al `Log` de Site Sheet.
5. Si otro libro lee EXPORTAR / MINIMO / MAXIMO de Venta Diaria (IMPORTRANGE), apuntarlo a Site Sheet (mismos nombres de hoja y columnas).

## Pendiente de confirmar con datos reales

- RESUELTO 2-nov: el `precio` del site es el TOTAL de la orden (2 piezas = 9,098; 6 piezas = 16,014). Por defecto modo total.
- Que la cuenta de los triggers abra el libro de variaciones (ID 1Uy-SIuVb77x…). Si no, EXPORTAR usa la copia de la hoja Precios variaciones.

## Auditoría 2-nov-2026 (AUDIT · OVERKILL · PURGE · VALIDATE)

- AUDIT: sintaxis 64 archivos OK; lint de columnas 0; menú ↔ guía 0 diferencias; script estático ❌ 0. Los "posibles secretos" de los archivos nuevos son IDs de libros (no credenciales).
- OVERKILL corregido: un solo lector de Killers bajo minimo (vdBajoMinimo_; peAceptables_ ya no lee la hoja); peNorm_ → normEnc_ (Columnas.gs); vcNum_ → peNum_; vdHuella_ → sha256_ (Precios.gs); el ID de Venta Diaria en una sola constante (VD_LIBRO_VIEJO).
- OVERKILL abierto (🟡, no se tocó): Venta Diaria Odoo sigue con sus activadores (importar cada 10 min, precios/EXPORTAR/COMPARAR cada 15, sobreventa cada 30): duplica lo que ya hace Site Sheet → quitarlos al validar. vdPct_ y kcPct_ leen % distinto. Consulta Pedidos podría leer primero Ventas Walmart antes de ir al site.
- PURGE: quitados Killers pegar, reporte del mes, compararWalmart, ventasCvaTraerHistorico y preciosErroneosTraerDeVentaDiaria (los cubre "Traer TODO"). Pendiente de confirmar: cpValor_ (ConsultaPedidos.gs) sin uso.
- VALIDATE: pruebas t19, t26–t28, t33, t35–t39 en verde (datos simulados). Falta la corrida en vivo y revisar el Log.

## Corrida del 2-nov (12:30–12:57) y correcciones

- Bajada de ventas: el site entrega 100 por pagina; con por_pag=500 la bajada creia que la pagina 1 era la ultima (solo 100 ventas). Corregido (100 por pagina + total) y se vuelve a barrer desde el 1-oct (llaves _V2).
- FECHA salia 6 h adelantada: `fecha_iso` del site viene en UTC sin zona. Corregido; FECHA se corrige en las filas ya bajadas.
- Ventas Walmart ahora trae MES, CANAL VENTA (WFS / SELLER, de FULFILLMENT) y PRECIO UNITARIO.
- Timeouts del libro (Traer TODO, precios erroneos, ventas con killer): el libro se abre una vez por corrida con reintento (vdLibro_/vdHoja_) y las lecturas reintentan. El Log ya no pierde lineas si Google tarda.
- Traer TODO: en PEDIDOS CVA de Venta Diaria el titulo de la columna A (ID Linea) esta sobrescrito ("noahags cam"): se toma la columna A.
- EXPORTAR: la cuenta de los triggers (soporte.electronics.inventario) no tiene acceso al libro de variaciones (1Uy-SIuVb77x…). Usa la copia que trae "Traer TODO"; para que se actualice sola hay que compartir ese libro con esa cuenta (solo lectura).
- Nueva familia VENTAS en el libro: Resumen venta y killers (toda la venta WFS/SELLER + killers por mes), Ventas Walmart (historico de toda la venta), Ventas killers mes en curso / historico, Ventas 30 dias, Pedidos CVA, Alertas de precio.
- Pendiente: el archivo "Ventas WALMART 2026" (11v1dq…) es demasiado grande para exportarlo desde aqui; falta una copia .xlsx para revisar WALMART DIARIO / WFS / SELLER / K.ACTIVOS SEPTIEMBRE 2026.

## Corrida del 2-nov (13:12–13:40) y correcciones

- Traer TODO: OK (Pedidos CVA 162, Killers historico +332 rangos de sep/oct, Alertas 201, SKU asignados 1).
- Ventas Walmart: bajada completa en una corrida: 1,372 ventas (oct 1,343 · nov 29), WFS 618 / SELLER 754. Si una bajada no termina, se agenda sola (ventasHistoricoContinuar) hasta acabar; al final el Log dice "bajada completa terminada".
- Precios erroneos revisaba TODO (FECHA llega como fecha y la comparacion de texto fallaba). Corregido: compara fechas; una vez limpia el semaforo y las alertas del site anteriores al 1-nov.
- La hoja convierte "OCTUBRE 2026" en fecha: el resumen salia con killers en 0 para octubre. Corregido (MES como texto y se lee de vuelta).
- Resumen venta y killers = logica de "WALMART Diario" (Ventas WALMART 2026): TOTAL = venta WFS + venta SELLER + killers (cupon x piezas), promedio diario, el mes mas nuevo arriba. Diferencias: aqui las canceladas no cuentan y el killer se cruza por SKU y FECHA (alla solo por SKU del mes).
- Nuevo: Resumen venta CVA (aparte de Walmart): venta total, sin IVA, lineas, piezas, acumulada y una columna por plataforma.
- EXPORTAR: escribia EXPORTAR y MINIMO y se agotaba el tiempo en MAXIMO. Ahora cada hoja por separado, con reintento, y solo la que cambio.
- Copia del libro "Ventas WALMART 2026" en Site Sheet\referencias (fuera de GitHub por .gitignore).
