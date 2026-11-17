# ADR-UX-001 — Frontend único con vistas determinadas por permisos

## Estado

**Aprobado para preparación. Implementación pendiente.**

| Campo | Valor |
| --- | --- |
| Rama de trabajo | `feature/ux-ui-v2` |
| Baseline protegido | `integration/sigi-v1-reconciled` · `5d18aace` |
| Decisión | Consolidar `frontend-country` y `frontend-admin` en una sola aplicación web |
| Seguridad | El backend continúa siendo la autoridad |
| Compatibilidad | Conservar inicialmente todas las URLs existentes |
| Retiro de aplicaciones | No retirar `frontend-country` hasta completar paridad y aprobación |

## Contexto

SIGI mantiene hoy dos aplicaciones React:

- `frontend-country`: portal público, sin sesión administrativa;
- `frontend-admin`: consola autenticada, con roles, permisos y contexto EGI.

La división técnica aisló correctamente la superficie pública, pero produjo dos experiencias paralelas para Dashboard, Proyectos, GIS, Indicadores, Calidad, Reportes y Documentos. La duplicación dificulta saber dónde consultar y dónde operar, multiplica componentes y hace posible que ambas experiencias diverjan.

Un ejemplo observable es `Resumen regional`: en el portal público representa una vista territorial real (`/territory`), mientras que en Admin apunta a `/admin/modules`, que muestra salud técnica de componentes y no información regional.

## Decisión

SIGI tendrá una sola aplicación frontend y un único sistema de diseño. La sesión, los permisos, el EGI y la visibilidad del dato determinarán qué rutas, navegación, controles y acciones se presentan.

```text
Una aplicación SIGI
├── usuario anónimo
│   └── vistas públicas y datos publicados
├── consumidor autenticado
│   └── lectura del EGI autorizado
├── usuario operativo
│   └── tareas permitidas de proyecto, datos, GIS, monitoreo o reportes
└── administrador
    └── configuración y gobierno según permisos explícitos
```

La consolidación usará `apps/frontend-admin` como anfitrión inicial porque ya contiene autenticación, sesión, permisos, EGI, rutas protegidas y acciones mutables. El nombre físico del directorio no se cambiará durante la migración para evitar romper Docker, CI y despliegue. Un eventual renombre a `apps/frontend` será una decisión separada y posterior.

## Principios obligatorios

1. **Una función, una implementación.** Las variantes pública y operativa comparten componentes y difieren por capacidades y fuente de datos.
2. **Autorización en backend.** La UI puede ocultar acciones, pero cada endpoint conserva guards, roles, permisos y alcance EGI.
3. **Público es una capacidad, no otro producto.** El portal público es la salida publicada del flujo administrativo.
4. **URLs estables primero.** La consolidación no exige renombrar rutas en la primera etapa.
5. **Sin mocks de sustitución.** Se mantienen los endpoints y resultados reales.
6. **Retiro tardío.** `frontend-country` permanece ejecutable hasta demostrar paridad.
7. **Rollback por ola.** Cada paso debe poder revertirse sin tocar el baseline.

## Modelo de navegación objetivo

### Sin sesión

```text
Inicio público
Territorio
Proyectos publicados
Mapa público
Indicadores públicos
Reportes publicados
Documentos públicos
Iniciar sesión
```

### Con sesión operativa

```text
Inicio
Proyectos
Territorio y GIS
Monitoreo
Datos
Reportes
Archivos
Publicación
Ayuda
```

### Con permisos administrativos

```text
Navegación operativa
+ Administración
+ ⚙ Configuración dentro de cada módulo autorizado
```

No se usarán tabs para cambiar entre módulos globales. Las tabs mantendrán el contexto de una entidad o módulo.

## Estrategia de rutas

Durante la consolidación, una sola SPA resolverá ambos conjuntos de rutas:

| Tipo | Rutas conservadas | Comportamiento |
| --- | --- | --- |
| Público | `/`, `/dashboard`, `/territory`, `/projects`, `/geo-bi`, `/indicators`, `/incidents`, `/quality`, `/integrations`, `/reports`, `/documents`, `/restoration`, `/administration` | Acceso anónimo con datos publicables |
| Autenticado | `/admin`, `/admin/projects`, `/admin/geobi`, `/admin/sources`, `/admin/reports/*`, etc. | Sesión, EGI y permisos vigentes |
| Compatibilidad | host anterior de Country | Proxy o redirect hacia las rutas públicas de la aplicación única |

No se crearán redirects masivos antes de montar y probar las rutas públicas en el anfitrión unificado.

## Resolución del inicio

- `/` sin sesión: dashboard público;
- `/` con sesión: puede ofrecer “Entrar a mi espacio” sin redirección automática inesperada;
- `/admin`: login o inicio operativo según sesión;
- logout: vuelve a una vista pública segura;
- un deep link protegido conserva su destino después del login cuando el usuario está autorizado.

## Límites de datos

| Contexto | Fuente permitida |
| --- | --- |
| Anónimo | endpoints públicos y registros con visibilidad publicada |
| Autenticado | endpoints admin autorizados y EGI accesible |
| Vista previa pública | mismo modelo/serialización pública; no reutiliza respuestas internas completas |
| Vista global | solo roles globales ya autorizados por backend |

La aplicación única no debe consultar un endpoint administrativo para renderizar una pantalla anónima. Compartir componentes no significa compartir respuestas sensibles.

## Consecuencias positivas

- una navegación y un lenguaje visual;
- menos pantallas duplicadas;
- mantenimiento único de Dashboard, Proyectos, GIS, Reportes y Documentos;
- transición natural entre editar, previsualizar y publicar;
- accesibilidad y responsive corregidos una sola vez;
- menor riesgo de divergencia funcional.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Filtrar información interna en una vista pública | Mantener endpoints públicos separados, tests de visibilidad y revisión de payloads |
| Aumentar el bundle inicial | Lazy loading por dominio y separación de chunks públicos/operativos |
| Romper URLs o bookmarks | Conservar rutas y validar deep links antes del cutover |
| Acoplar componentes a sesión/EGI | Contenedores de datos separados y componentes de presentación reutilizables |
| Perder independencia del portal público | Despliegue del mismo artefacto con host/base path y política de rutas configurable |
| Regresión de permisos | Matriz de roles, pruebas UI y smokes API `403` |
| Retiro prematuro de Country | Operación paralela hasta gate de paridad y aprobación explícita |

## Alternativas descartadas

### Mantener dos frontends totalmente independientes

Descartado como objetivo porque conserva duplicación de navegación, componentes y significado de módulos.

### Convertir Country en iframe o microfrontend

Descartado: mantiene dos shells, complica accesibilidad, sesión, navegación y observabilidad.

### Unificar también los endpoints públicos y administrativos

Descartado para esta fase. La consolidación visual no debe reducir el aislamiento de datos ni alterar contratos backend.

## No objetivos de la primera implementación

- renombrar `apps/frontend-admin`;
- eliminar `frontend-country`;
- modificar el modelo de datos;
- sustituir guards de backend;
- cambiar dominios productivos;
- rediseñar simultáneamente todas las páginas;
- crear un nuevo sistema de autenticación o SSO.

## Criterio de cierre de la decisión

La decisión se considera implementada únicamente cuando todas las rutas públicas y autenticadas funcionan desde un artefacto, la matriz de permisos pasa, existe paridad visual/funcional y el retiro del artefacto Country recibe aprobación explícita.
