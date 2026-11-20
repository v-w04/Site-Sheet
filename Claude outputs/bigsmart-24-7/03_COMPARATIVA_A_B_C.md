# 03 · Comparativa A / B / C (por evidencia)

| Criterio | A. Cliente HTTP a `order-logs` | B. Playwright en servidor leyendo la página pública | C. Lector de la extensión en Chromium remoto | D. (agregada) Chrome real siempre prendido con la extensión actual |
|---|---|---|---|---|
| ¿Permitido hoy? | ❌ No, sin permiso de BigSmart (credencial interna, 401 sin ella — C4, P1) | ✅ Sí: página pública, mismo método que hoy | ✅ Sí (solo módulo de lectura) | ✅ Sí: es lo que ya corre |
| ¿Funciona desde servidor? | n/a | ❓ **Sin probar (N1)**; antecedente: Cloudflare desafió a scripts y al navegador integrado (P2) | ❓ Igual que B (misma IP de centro de datos) | ✅ comprobado en el Chrome del usuario (C6) |
| Respuesta a CAPTCHA | n/a | se detiene y avisa (no se evade) | igual | igual (ya implementado) |
| Disponibilidad 24/7 | alta | alta si N1 sale bien | alta si N1 sale bien | alta si la máquina no se apaga; con **turno** varias máquinas se respaldan (ya construido) |
| Complejidad | baja | media (worker + Playwright + llamadas al Web App) | media-alta (empaquetar extensión reducida) | **ninguna nueva** |
| Costo aprox. | servidor pequeño | VPS con 1–2 GB RAM | VPS con escritorio | mini PC o PC de oficina encendida |
| Mantenimiento | si cambia el JSON | si cambia la página (mismos selectores que hoy) | igual que B + extensión | el que ya existe |
| Riesgo principal | legal/contractual | bloqueo Cloudflare por IP | bloqueo Cloudflare por IP | apagón / Windows Update |

## Conclusión

1. **A queda descartada mientras BigSmart no dé acceso oficial.** Si lo da, es la mejor opción técnica (y la extensión cambia a la API).
2. **B es la candidata a servicio en la nube, pero depende de una sola prueba (N1)**: si Cloudflare desafía al VPS, B y C no sirven y no se insiste.
3. **D funciona hoy sin código nuevo**: una segunda computadora siempre encendida con Chrome + la extensión. El turno entre computadoras ya evita rastreos dobles.

Crear nuestra API REST no cambia nada de esto: la API propia sirve los datos que ya guardamos; la prueba crítica es **leer** BigSmart desde el servidor.
