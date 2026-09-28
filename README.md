# Cima Fix

Cima Fix es un sistema para registrar y dar seguimiento a reportes de incidencias de mantenimiento e infraestructura en el Campus Sauzal de la Universidad Autónoma de Baja California (UABC), Ensenada. Permite a estudiantes y docentes reportar un problema en minutos y consultar su estado en cualquier momento: registro centralizado, prevención de duplicados y notificación directa al personal responsable. No sustituye al personal de mantenimiento ni decide por ellos qué atender; su valor está en darle a la comunidad del campus un canal confiable para reportar, y al personal encargado, trazabilidad real de los reportes.

> **Estado:** en desarrollo.

---

## El problema

Actualmente, el mecanismo de reporte en el Campus Sauzal es un código QR que dirige a un formulario de Google: una vía de un solo sentido, sin registro consultable y sin manera de saber si un problema ya fue reportado o si alguien ya lo está atendiendo.

Una encuesta inicial y una ronda de entrevistas con la comunidad del campus —administración, soporte técnico, docentes y estudiantes— apuntan a la misma causa: la desconfianza no nace del formulario, nace del silencio después de enviarlo. Un docente entrevistado describió sentir frustración y desconfianza al no saber nunca si su reporte fue atendido; una estudiante contó que los profesores llegaban a repetir el mismo reporte varias veces solo para "meter presión", ante la falta de visibilidad sobre su estado.

Del lado de quien atiende los reportes, el panorama tampoco es mejor: hoy se administran a mano sobre una hoja de cálculo, donde cada reporte y cada cambio de estado se registra manualmente uno por uno. Cima Fix no solo le da visibilidad a quien reporta — también le quita esa carga administrativa a quien atiende.

Cima Fix resuelve esto con:

### Registro y consulta centralizada

En lugar de un formulario que desaparece en una bandeja de entrada, cada incidencia queda en un registro persistente y consultable por cualquier miembro de la comunidad del campus.

### Verificación institucional

El acceso requiere autenticarse con una cuenta `@uabc.edu.mx` mediante Google. Toda persona que reporta o atiende una incidencia pertenece verificadamente a la comunidad universitaria.

### Prevención de duplicados

Al momento de registrar una incidencia, el sistema muestra reportes existentes similares (mismo campus, categoría y edificio, dentro de una ventana de tiempo reciente) para que el reportante confirme si es el mismo problema en vez de crear uno nuevo.

### Mapa de incidencias por campus

Un mapa del campus muestra los reportes abiertos por edificio, con un indicador visual por edificio — una forma rápida de ver dónde se concentran los problemas.

### Seguimiento de estado transparente

El encargado puede actualizar el estado del reporte directamente dentro del sistema, evitando que un reporte quede indefinidamente con estado desconocido.

### Prioridad automática

Cada reporte recibe una prioridad calculada automáticamente a partir de varios factores — sin que el encargado tenga que asignarla a mano.

### Notificaciones por correo

Cuando se le asigna un reporte a un encargado, este recibe un correo con el enlace directo al reporte; y cuando el reporte se marca como resuelto, quien lo reportó recibe un correo confirmando que el problema fue solucionado.

---

## Documentación técnica

| Documento                                                            | Contenido                                                                                                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`cima-fix-research`](https://github.com/cima-fix/cima-fix-research) | **Investigación de campo** — entrevistas con administración, soporte técnico, docentes, estudiantes, y la evidencia detrás de las decisiones de alcance y prioridad. |

---

## Stack técnico

- **Backend:** Node.js + Hono (TypeScript)
- **Base de datos:** PostgreSQL (Neon) + Drizzle ORM
- **Autenticación:** Google Identity Services (OAuth 2.0 / OIDC), restringida al dominio institucional
- **Mapa:** Leaflet + react-leaflet
- **Almacenamiento de imágenes:** Cloudinary
- **Notificaciones:** correo transaccional (Resend)
- **Rate limiting:** middleware para Hono con estado en Redis (Upstash)
- **Frontend:** React + Vite (TypeScript), Tailwind CSS

---

## Equipo de desarrollo

| Nombre                                                           |
| ---------------------------------------------------------------- |
| [Alcantar Martinez, Emir Alexander](https://github.com/ALXND3R)  |
| [Zazueta Medrano, Aidan](https://github.com/AidanZZMD)           |
| [Montano Valencia, Mike Armando](https://github.com/MikeArmando) |
| [Moreno Calderon, Troy Leonardo](https://github.com/Troy2404)    |
| [Perez Aguirre Mextli, Citlali](https://github.com/mxcitali)     |
| [Jaime Mascareño, Carlos Alberto](https://github.com/TitaniumCJ) |
| [Meza Espinoza, Kevin Andre](https://github.com/kmeza1402)       |

---

<sub>Proyecto desarrollado por el equipo de Cima Fix como parte del curso «Tecnologías Emergentes para el Desarrollo de Soluciones» en la Universidad Autónoma de Baja California (UABC), con aplicación real en el Campus Sauzal, Ensenada.</sub>
