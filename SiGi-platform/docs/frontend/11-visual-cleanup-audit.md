# Auditoría de limpieza visual y navegación

## Decisión de producto

SIGI opera con un único frontend autenticado: `frontend-admin`. No existe navegación anónima ni una experiencia paralela de “portal país”. La ruta `/administration` es el único acceso sin sesión; después del login, rutas, módulos, tabs, acciones y configuración se muestran según permisos y EGI activo.

Las rutas históricas (`/dashboard`, `/projects`, `/geo-bi`, entre otras) se conservan únicamente como redirecciones hacia su equivalente autenticado. El dominio público anterior redirige al dominio único y `frontend-country` ya no forma parte de la topología Docker de producción.

El retiro técnico posterior eliminó también el paquete `frontend-country`, el router/shell anónimo incrustado, sus pruebas y sus variantes de Compose. Los endpoints de publicación del API se conservan para integraciones, pero no existe una aplicación web anónima.

Ask SIGI no se muestra: todavía no existe un servicio gobernado, con permisos, fuentes y auditoría. Añadir una entrada vacía contradiría la orientación funcional de esta iteración.

## Matriz

| Ruta | Problema visual | Texto demo detectado | Problema de navegación | Problema responsive | Acción requerida | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| `/administration` | Introducción extensa y bloques promocionales | Explicación del frontend único | Enlace hacia portal público inexistente | Formulario debía conservar jerarquía en móvil | Reducir acceso a título, instrucción y formulario; retirar enlace público | Implementado |
| `/admin` | Duplicación entre topbar y encabezado; paneles con exceso de explicación técnica | Endpoints y permisos expuestos en widgets | Inicio mezclado con ayuda dentro del mismo grupo | Cards y cabecera ocupaban demasiado alto | Topbar compacta; datos y acciones primero; ocultar detalles técnicos | Implementado |
| `/admin/projects` | Título largo, paneles anidados y contexto repetido | Narrativa institucional y enlace “Vista pública” | Ruta pública duplicaba la experiencia | Sidebar reducía demasiado el área útil en tablet | Título `Proyectos`, contador, tabs y acciones; retirar enlace público | Implementado |
| `/admin/geobi` | Introducciones y recorridos de presentación antes del mapa | “Qué demuestra”, “recorrido sugerido”, Bridge y Geo/BI como narrativa | Enlace al visor público duplicado | Mapa necesitaba una navegación lateral compacta | Priorizar visor, capas, filtros y análisis; lenguaje operativo | Implementado |
| `/admin/indicators` | Encabezado descriptivo largo | Explicación de catálogo verificable | Enlace público redundante | Tabs requieren desplazamiento horizontal controlado | Mostrar contador, métricas, catálogo y tabs por permiso | Implementado |
| `/admin/data` | Acciones presentadas como tarjetas grandes | Explicación del punto de entrada | Rutas operativas dispersas | Tarjetas debían reacomodarse sin desborde | Encabezado breve, tabs persistentes y acciones autorizadas | Implementado |
| `/admin/reports` | Encabezado y catálogo con texto metodológico excesivo | Explicaciones sobre implementación de secciones | Enlace público redundante | Tabs y filtros debían conservar deep links | Acción `Generar informe`, catálogo, compromisos e historial | Implementado |
| `/admin/administration` | Demasiados bloques decorativos | Descripción de la arquitectura unificada | Funciones técnicas e institucionales competían | Grid debía reducirse progresivamente | Contador de funciones, dos grupos y tabs por permiso | Implementado |
| `/admin/institutions` | Encabezado promocional | “Malla operativa” como narrativa | Sin problema funcional | Paneles densos | Sustituir narrativa por contador y estado | Implementado |
| `/admin/users` | Explicación extensa de la consola | Lenguaje de presentación | Acciones repartidas entre tabs internos | Formularios largos en pantallas estrechas | Contador, tabs y formularios existentes | Implementado |
| `/admin/connectors` | Cards y explicaciones del diagrama funcional | “Vista unificada”, “base sólida”, diagnóstico | Correctamente restringido a Administración | Menú interno necesita wrap | Reducir encabezados y conservar controles técnicos necesarios | Implementado |
| `/admin/publications` | Introducción de flujo institucional | “Esta vista sintetiza...” | Correctamente restringido por permiso | Paneles responsivos existentes | Mostrar canales, colas y estados | Implementado |
| `/admin/audit` | Texto de presentación antes de la bitácora | “Ahora se lee como...” | Correctamente restringido por permiso | Tabla requiere scroll propio | Priorizar eventos, actores y filtros | Implementado |
| `/admin/api` | Narrativa institucional sobre la capa técnica | “Esta vista traduce...” | Correctamente restringido por permiso | Operaciones críticas deben conservar espacio | Mantener términos técnicos necesarios y retirar narrativa | Implementado |

## Sidebar

| Requisito | Implementación |
| --- | --- |
| Expandir y colapsar | Control visible dentro de la marca en ambos estados |
| Persistencia | `localStorage` con clave `sigi.sidebar.collapsed.v2` |
| Estado activo | Fondo claro, contraste AA e indicador `aria-current=page` |
| Tooltips | `title`, `data-tooltip` y nombre accesible en estado compacto |
| Jerarquía | Inicio, Proyectos, Territorio, Indicadores, Datos, Informes, Ayuda y Administración |
| Permisos | Los módulos se filtran con las capacidades efectivas de la sesión |
| Desktop | Sidebar fijo, expandido por defecto salvo preferencia guardada |
| Tablet | Sidebar fijo, compacto por defecto y expandible |
| Móvil | Drawer independiente con backdrop y control de cierre |

## Cambios globales

- Topbar reducida a breadcrumbs, contexto EGI, ayuda y perfil; ya no repite título y subtítulo de la página.
- Page headers más compactos, con un título, un subtítulo breve y acciones autorizadas.
- Panels y métricas sin sombras decorativas, con menor radio y padding.
- Navegación principal plana; los submódulos permanecen en tabs contextuales.
- Terminología técnica conservada solamente en Administración, API, conectores y configuración.
- Estados vacíos y mensajes se mantienen orientados a la acción disponible.

## Validación

La aceptación requiere:

1. escritorio: expandido → colapsado → recarga → expandido;
2. tablet: inicio compacto y expansión manual;
3. móvil: abrir drawer → navegar o cerrar → drawer oculto;
4. verificación de tooltips, estado activo, permisos y persistencia;
5. ejecución de typecheck, lint, unit tests, build y E2E sobre el único frontend.
