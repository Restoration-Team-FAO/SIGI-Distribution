# UX/UI V2 — Design system

## Principios

- institucional, sobrio y orientado a datos;
- densidad cómoda por defecto y compacta en tablas/GIS;
- color comunica estado, nunca reemplaza texto o icono;
- componentes comparten API semántica entre Admin y Country;
- CSS variables y clases sustituyen gradualmente estilos inline.

## Tokens iniciales

```css
:root {
  --sigi-color-brand-700: #0b4f3a;
  --sigi-color-brand-600: #146c4e;
  --sigi-color-brand-100: #e8f5ef;
  --sigi-color-ink-900: #10233f;
  --sigi-color-ink-600: #5b6875;
  --sigi-color-border: #d7dde5;
  --sigi-color-surface: #ffffff;
  --sigi-color-canvas: #f4f7f6;
  --sigi-color-success: #1f8a5b;
  --sigi-color-warning: #b45309;
  --sigi-color-danger: #b42318;
  --sigi-space-1: 4px;
  --sigi-space-2: 8px;
  --sigi-space-3: 12px;
  --sigi-space-4: 16px;
  --sigi-space-5: 20px;
  --sigi-space-6: 24px;
  --sigi-space-8: 32px;
  --sigi-radius-sm: 8px;
  --sigi-radius-md: 12px;
  --sigi-radius-lg: 18px;
  --sigi-shadow-1: 0 1px 2px rgba(16,35,63,.08);
  --sigi-shadow-2: 0 12px 32px rgba(16,35,63,.10);
}
```

Tipografía: Source Sans 3/Inter para interfaz; serif solo en piezas editoriales,
no en controles. Escala: 12, 14, 16, 20, 24, 32 px. Cuerpo mínimo 14 px en
desktop y 16 px en entradas móviles.

## Primitives UX-1

| Componente | Contrato mínimo |
| --- | --- |
| `Button` | primary/secondary/quiet/danger; loading; icon; disabled reason |
| `IconButton` | label accesible obligatorio; tooltip |
| `Input`, `Select`, `Checkbox`, `Switch` | label, hint, error, required, disabled |
| `Search` | clear, submit/debounce, result count |
| `Badge`, `StatusBadge` | tono + texto semántico |
| `Card`, `KPI` | heading, metadata, action; KPI exige contexto/corte |
| `Tabs` | teclado, active route/state, overflow móvil |
| `Table`, `Pagination` | sort, selection, row action, loading/empty/error |
| `FilterBar` | búsqueda, filtros activos, limpiar, responsive drawer |
| `Modal`, `Drawer` | focus trap, Escape, restore focus, title |
| `Toast` | success/error con región `aria-live` |
| `Breadcrumb`, `PageHeader`, `SectionHeader` | jerarquía estable y acción primaria |
| `Toolbar`, `FormSection`, `DetailPanel` | composición y densidad consistente |
| estados | loading, empty, error, no permission, no results, dependency error |

## Patrones

### Lista

`PageHeader → FilterBar → resumen opcional → Table → Pagination`.

### Detalle

`Breadcrumb → EntityHeader → Tabs → contenido → acciones contextuales`.

### Formulario

Campos agrupados por intención, validación junto al campo y acciones visibles.
La barra sticky se usa solo cuando el formulario supera un viewport.

## Accesibilidad

- objetivo WCAG 2.1 AA;
- foco `:focus-visible` en ambos frontends;
- contraste AA verificado antes de congelar tokens;
- targets mínimos 40×40 px, 44×44 en táctil;
- `aria-current`, labels, nombres de botones y encabezados jerárquicos;
- respetar `prefers-reduced-motion`;
- tablas conservan headers y caption contextual.
