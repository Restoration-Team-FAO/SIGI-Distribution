# Auditoría de integración de marca SIGI — Fase 1

> Metodología: lectura directa del repositorio `frontend-sigi` (el único frontend de la plataforma, worktree `feature/ux-ui-v2`/`main`) y de `libs/ui`, el paquete compartido de componentes/tokens. Fecha de corte: 2026-10-02. No se modificó ningún archivo durante esta auditoría.

## 1. Resumen ejecutivo

La buena noticia: **ya existe un sistema de design tokens y una librería de componentes base real y centralizada** (`libs/ui/src/tokens.css`), consumida consistentemente por el CSS más nuevo de `apps/frontend-sigi`. No hay que construir un Design System desde cero — hay que **recolorear y retipografiar uno que ya existe**, y luego migrar la deuda técnica que lo rodea.

La mala noticia: los valores actuales del token system **no corresponden a la marca oficial SIGI**:
- El color "brand" está definido en una escala de **verde** (`#083d2f` → `#146c4e`), no en el azul SIGI oficial (`#064578`).
- La tipografía declarada es **"Source Sans 3"**, no **Noto Sans** — y ni siquiera está cargada como web font, por lo que probablemente nunca se renderiza (cae a system font).
- **No existe el logo oficial en ningún lugar de la aplicación.** El encabezado del sidebar es texto plano (`<h1>SIGI</h1>`), lo que viola directamente la regla del Libro de Marca: *"el lettering 'SIGI' pertenece al arte del logo y no debe reproducirse escribiendo el nombre con una fuente de sistema"*.
- **No hay favicon.**
- Hay **423 colores hex hardcodeados** solo en `apps/frontend-sigi/src/styles.css` (2163 líneas) y **1264 usos de `style={{...}}`** inline en páginas/componentes — deuda visual real que bypassa el sistema de tokens incluso para el branding verde actual.

## 2. Arquitectura actual (verificada)

| Elemento | Estado |
|---|---|
| Framework | React 18 + Vite, un solo frontend (`apps/frontend-sigi`) |
| Librería de UI externa | Ninguna (no Tailwind, no MUI, no Chakra, no Ant Design) — CSS propio |
| Sistema de tokens | **Existe y es real**: `libs/ui/src/tokens.css` (paquete compartido del monorepo, `:root` con 40+ custom properties) |
| Librería de componentes base | **Existe y es real**: mismo archivo, clases `.sigi-ui-*` (button, field, badge, card, page-header, breadcrumb, tabs, dialog, drawer, toast, state) |
| CSS de aplicación | `apps/frontend-sigi/src/styles.css`, 2163 líneas, mezcla de `var(--sigi-*)` (consistente) y cientos de hex hardcodeados (inconsistente) |
| Logo | **No existe como asset** — solo texto `<h1>SIGI</h1>` / `<span>SIGI</span>` en el sidebar (`AppShell.tsx:322,329`) |
| Favicon | **No existe** — `apps/frontend-sigi/public/` no tiene ningún ícono; `index.html` no tiene `<link rel="icon">` |
| Fuente web | **No se carga ninguna** — `index.html` solo importa CSS/JS de Leaflet; `--sigi-font-sans: 'Source Sans 3', ...` nunca tiene un `<link>`/`@font-face` que la respalde |
| Metadatos | `<title>SIGI Admin</title>`, sin `theme-color`, sin manifest PWA |

## 3. Design tokens actuales (`libs/ui/src/tokens.css`) — valores exactos

```css
--sigi-color-brand-800: #083d2f;   /* verde muy oscuro */
--sigi-color-brand-700: #0b4f3a;   /* verde oscuro — "color de marca" actual */
--sigi-color-brand-600: #146c4e;   /* verde medio */
--sigi-color-brand-100: #e8f5ef;
--sigi-color-brand-50:  #f3faf6;
--sigi-color-ink-950…400           /* escala de grises/negros, reutilizable tal cual */
--sigi-color-border / border-soft  /* reutilizable tal cual */
--sigi-color-surface / canvas      /* reutilizable tal cual */
--sigi-color-success / warning / danger / info   /* estados semánticos, reutilizables tal cual */
--sigi-space-1…10                  /* escala de espaciado 4-40px, reutilizable tal cual */
--sigi-radius-sm…xl                /* 8-24px, reutilizable tal cual */
--sigi-shadow-1…3                  /* reutilizable tal cual */
--sigi-font-sans: 'Source Sans 3', 'Source Sans Pro', Inter, Roboto, Arial, sans-serif;
--sigi-font-size-xs…2xl
--sigi-content-max: 1600px;
```

**Conclusión clave**: la estructura (nomenclatura, escalas de espaciado/radio/sombra/tipografía, estados semánticos) es sólida y debe **conservarse intacta**. Solo la escala `--sigi-color-brand-*` y `--sigi-font-sans` necesitan cambiar de valor. No hay tokens para turquesa (`#049EAA`) ni verde de marca (`#40AC54`) como colores de *apoyo* — hoy el verde ES el color "brand" principal, lo cual contradice la regla del Libro de Marca de que el azul debe dominar y turquesa/verde son acentos secundarios.

## 4. Hallazgos de inconsistencia

| # | Hallazgo | Evidencia | Riesgo |
|---|---|---|---|
| H1 | Color de marca actual es verde, no el azul SIGI oficial | `libs/ui/src/tokens.css:3-7` | Alto — cambia la percepción de marca en toda la app |
| H2 | Tipografía declarada (`Source Sans 3`) nunca se carga como web font | Sin `<link>`/`@font-face` en todo el repo para esa familia | Medio — probablemente ya renderiza con fallback del sistema, pero de forma no intencional/no verificada |
| H3 | Logo reconstruido como texto plano, violando regla explícita del Libro de Marca | `AppShell.tsx:322,329` | Alto — es la violación de marca más directa encontrada |
| H4 | Sin favicon | `apps/frontend-sigi/public/`, `index.html` | Medio — pestaña del navegador sin identidad, mala percepción profesional |
| H5 | 423 colores hex hardcodeados en un solo archivo CSS, bypasseando el token system | `apps/frontend-sigi/src/styles.css` (grep `#[0-9a-fA-F]{3,6}`) | Alto — cualquier cambio de paleta (incluido este rebrand) requiere tocar cientos de líneas dispersas en vez de un solo archivo de tokens |
| H6 | 1264 usos de `style={{...}}` inline en páginas/componentes | `apps/frontend-sigi/src/pages/*.tsx`, `src/components/*.tsx` | Alto — mismo problema que H5 pero en TSX, más difícil de migrar automáticamente |
| H7 | Fuente serif (`Merriweather`) aparece sin explicación en 2 lugares, inconsistente con el resto del sistema sans-serif | `styles.css:288,428` | Bajo — verificar si es intencional (¿contenido editorial/reportes?) antes de tocar |
| H8 | Sin `theme-color`, sin manifest PWA | `index.html` | Bajo — no bloqueante, pero parte de "metadatos web" del alcance original |
| H9 | Paleta de verdes hardcodeados (`#176847`, `#1f8a5b`, `#0b4f3a`, `#e8f5ef`) duplica casi exactamente los tokens `--sigi-color-brand-*`/`--sigi-color-success*` ya existentes | `styles.css` múltiples líneas (ej. 59-73, 963-1025) | Medio — son candidatos directos y de bajo riesgo para la primera pasada de migración a tokens, porque ya *casi* coinciden con un token existente |

## 5. Lo que NO hay que construir (ya existe, solo recolorear/retipografiar)

- Sistema de tokens de color/espaciado/radio/sombra/tipografía → `libs/ui/src/tokens.css`
- Componentes base: Button, Field (input/select/textarea genérico), Badge, Card, PageHeader, Breadcrumb, Tabs, Dialog, Drawer, Toast, State (empty/error) → mismo archivo, clases `.sigi-ui-*`
- Estados semánticos (success/warning/danger/info) → ya definidos, ya correctos conceptualmente (solo revisar si los valores exactos deben ajustarse para contraste con el nuevo azul)

## 6. Propuesta de migración (fases, sin cambios funcionales)

1. **Tokens** (`libs/ui/src/tokens.css`): reemplazar la escala `--sigi-color-brand-*` por la escala azul SIGI oficial; añadir tokens nuevos para turquesa y verde de marca como acentos (`--sigi-color-accent-teal`, `--sigi-color-accent-green`, no como "brand"); reemplazar `--sigi-font-sans` por Noto Sans con los mismos fallbacks; cargar Noto Sans real vía Google Fonts (`fonts.googleapis.com`/`fonts.gstatic.com`, permitido por la CSP del artifact/hosting estándar).
2. **Logo**: crear `apps/frontend-sigi/public/brand/` con las variantes derivadas del PNG maestro (`docs/brand/SIGI Integrated Information System Logo.png`) — idealmente vectorizar a SVG; como mínimo usar el PNG oficial en el sidebar reemplazando el `<h1>SIGI</h1>` de texto plano, y como favicon/símbolo en espacios compactos.
3. **Favicon y metadatos**: generar favicon desde el isotipo (símbolo), añadir `<link rel="icon">`, `theme-color`, actualizar `<title>`.
4. **Migración de hex hardcodeados**: empezar por H9 (verdes que ya casi coinciden con tokens existentes — menor riesgo de regresión visual), luego el resto de `styles.css`, luego los 1264 `style={{...}}` inline (este último, por volumen, probablemente requiere priorizar por página de mayor tráfico en vez de migración completa en una sola pasada).
5. **QA**: capturas before/after de las pantallas principales, verificación de contraste WCAG AA sobre el nuevo azul (especialmente `--sigi-color-brand-700` usado como texto sobre fondo blanco y como fondo con texto blanco).

## 7. Riesgos

- Cambiar `--sigi-color-brand-*` de verde a azul es un cambio visual **de todo el producto en un solo commit** (todo lo que use `var(--sigi-color-brand-700)` cambia de inmediato) — esto es la intención, pero debe comunicarse como tal, no como un cambio incremental silencioso.
- Los 423 + 1264 usos hardcodeados **no cambiarán automáticamente** — tras actualizar los tokens, la app quedará con una mezcla visual de azul (donde se usa el token) y verde (donde sigue hardcodeado) hasta que se migren. Esto debe gestionarse explícitamente: o se migra en el mismo cambio, o se acepta temporalmente y se declara como deuda técnica conocida (ver sección 15 del instructivo original).
- Ningún archivo de prueba visual/snapshot existe para detectar regresiones automáticamente (confirmado en auditorías previas de esta sesión: cobertura de tests no cubre UI visual) — el QA de esta fase será manual.

## 8. Componentes que deben centralizarse (ya parcialmente lo están)

Ya centralizados correctamente en `libs/ui`: Button, Field, Badge, Card, PageHeader, Breadcrumb, Tabs, Dialog, Drawer, Toast.

**Candidatos a centralizar que hoy viven duplicados/dispersos en `apps/frontend-sigi/src/styles.css`** (con estilos propios en vez de usar `.sigi-ui-*`): `.sigi-status-badge` (duplica conceptualmente `.sigi-ui-badge`), `.reports-button`/`.reports-button--primary` (duplica `.sigi-ui-button`), `.sigi-data-table` (no tiene equivalente en `libs/ui` — candidato a nuevo componente base `DataTable`), `.sigi-filter-bar` (duplica conceptualmente `.sigi-ui-filter-bar`, que sí existe en `libs/ui` pero no se está usando aquí).

## 9. Próximo paso recomendado

Empezar por el punto 1 (tokens) y 3 (favicon/metadatos) de la sección 6: son los cambios de **mayor impacto visual con menor riesgo de regresión funcional**, acotados a 1-2 archivos, y hacen que toda la superficie ya tokenizada (`libs/ui` + la parte de `styles.css` que sí usa `var(--sigi-*)`) se vea correctamente de inmediato. La migración de hardcodeados (punto 4) es deuda técnica de mayor volumen que puede ejecutarse en una fase posterior sin bloquear el cambio de identidad visible.
