import { Link } from 'react-router-dom';
import { Badge, Card, PageHeader } from '@sigi/ui';

type ConfigurationItem = {
  title: string;
  description: string;
  to?: string;
  status?: 'Disponible' | 'Gobernado por backend';
};

const moduleConfiguration: Record<string, {
  title: string;
  description: string;
  backTo: string;
  items: ConfigurationItem[];
}> = {
  projects: {
    title: 'Configuración de Proyectos',
    description: 'Gobierno de catálogos, reglas y parámetros que no forman parte del trabajo diario de la cartera.',
    backTo: '/projects',
    items: [
      { title: 'Estados y prioridades', description: 'Valores canónicos usados por las fichas de proyecto.', status: 'Gobernado por backend' },
      { title: 'Tipos y catálogos', description: 'Clasificación temática y estructura de portafolios.', status: 'Gobernado por backend' },
      { title: 'Reglas territoriales', description: 'Permisos y validación para polígonos y cobertura.', status: 'Gobernado por backend' },
    ],
  },
  data: {
    title: 'Configuración de Datos',
    description: 'Conectores, mapeos y parámetros técnicos separados de fuentes, importaciones y calidad.',
    backTo: '/admin/data',
    items: [
      { title: 'Conectores', description: 'Credenciales, servicios técnicos y sincronización.', to: '/admin/connectors', status: 'Disponible' },
      { title: 'Perfiles de mapeo', description: 'Equivalencias versionadas y defaults reutilizables por fuente.', to: '/admin/data/mappings', status: 'Disponible' },
      { title: 'Odoo', description: 'Mapeos y parámetros del conector Odoo.', to: '/admin/sources/odoo', status: 'Disponible' },
      { title: 'KoboToolbox', description: 'Conexión, formularios y promoción de datos Kobo.', to: '/admin/sources/kobo', status: 'Disponible' },
      { title: 'Reglas de calidad', description: 'Asignación y gobierno técnico de validaciones.', to: '/admin/validations', status: 'Disponible' },
    ],
  },
  gis: {
    title: 'Configuración de GIS',
    description: 'Publicación, interoperabilidad y parámetros geoespaciales fuera del visor operativo.',
    backTo: '/admin/geobi',
    items: [
      { title: 'Catálogo geográfico', description: 'Capas administradas, publicación y retiro.', to: '/admin/geospatial-catalog', status: 'Disponible' },
      { title: 'GeoServer y CRS', description: 'Capacidades, workspaces y referencia espacial.', to: '/admin/geospatial-catalog', status: 'Disponible' },
      { title: 'Visibilidad y permisos', description: 'Reglas de exposición pública e interna por capa.', to: '/admin/geospatial-catalog', status: 'Disponible' },
    ],
  },
  monitoring: {
    title: 'Configuración de Monitoreo',
    description: 'Umbrales, reglas y asignaciones técnicas separadas del seguimiento operativo.',
    backTo: '/admin/validations',
    items: [
      { title: 'Reglas de calidad', description: 'Criterios de validación aplicados a datos e importaciones.', to: '/admin/validations', status: 'Disponible' },
      { title: 'Asignaciones', description: 'Responsables técnicos para revisión de hallazgos.', to: '/admin/validations', status: 'Disponible' },
      { title: 'Umbrales', description: 'Parámetros canónicos de severidad y seguimiento.', status: 'Gobernado por backend' },
    ],
  },
};

export function ModuleConfigurationPage(props: { module: keyof typeof moduleConfiguration }) {
  const profile = moduleConfiguration[props.module];
  return (
    <section className="sigi-configuration-page">
      <PageHeader
        eyebrow="Administración del módulo"
        title={profile.title}
        description={profile.description}
        actions={<Link className="sigi-module-header__configuration" to={profile.backTo}>Volver a operación</Link>}
      />
      <div className="sigi-configuration-grid">
        {profile.items.map((item) => (
          <Card
            key={item.title}
            title={item.title}
            description={item.description}
            action={<Badge tone={item.status === 'Disponible' ? 'success' : 'neutral'}>{item.status}</Badge>}
          >
            {item.to ? <Link className="sigi-configuration-link" to={item.to}>Abrir configuración</Link> : <p className="sigi-configuration-note">No existe una pantalla mutable en el baseline; se conserva la regla vigente.</p>}
          </Card>
        ))}
      </div>
    </section>
  );
}
