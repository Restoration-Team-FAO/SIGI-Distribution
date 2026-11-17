export type HelpAudience =
  | 'functional_user'
  | 'institution_admin'
  | 'data_technician'
  | 'gis_technician'
  | 'integration_technician'
  | 'support'
  | 'super_admin';

export type HelpContentType =
  | 'user_manual'
  | 'technical_manual'
  | 'step_by_step'
  | 'faq'
  | 'glossary'
  | 'troubleshooting'
  | 'data_entry_rule'
  | 'integration_guide'
  | 'ai_knowledge';

export type HelpModule =
  | 'auth'
  | 'egi'
  | 'admin'
  | 'users'
  | 'roles'
  | 'sources'
  | 'imports'
  | 'validations'
  | 'catalogs'
  | 'schemas'
  | 'projects'
  | 'documents'
  | 'audit'
  | 'geo'
  | 'dashboard'
  | 'country_portal'
  | 'reports'
  | 'kobo'
  | 'ferm'
  | 'odoo'
  | 'api'
  | 'devops'
  | 'support';

export type HelpArticleSection = {
  id: string;
  title: string;
  body: string[];
  bullets?: string[];
  steps?: string[];
};

export type HelpResource = {
  id: string;
  title: string;
  summary: string;
  href: string;
  kind: 'download' | 'internal' | 'external';
};

export type HelpArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  section: string;
  contentType: HelpContentType;
  module: HelpModule;
  audience: HelpAudience[];
  level: 'basic' | 'intermediate' | 'advanced' | 'technical';
  tags: string[];
  keywords: string[];
  version: string;
  status: 'draft' | 'published' | 'archived';
  updatedAt: string;
  estimatedMinutes: number;
  author: string;
  content: string;
  sections: HelpArticleSection[];
  prerequisites: string[];
  commonErrors: string[];
  troubleshooting: string[];
  relatedArticles: string[];
  relatedQuestions: string[];
  resourceIds: string[];
  aiEnabled: boolean;
  sourcePriority: 'official' | 'support' | 'example' | 'legacy';
};

export type HelpLearningPath = {
  id: string;
  title: string;
  summary: string;
  audience: HelpAudience[];
  articleSlugs: string[];
};

export type HelpFaqItem = {
  id: string;
  question: string;
  answer: string;
  articleSlug?: string;
  audience: HelpAudience[];
};

export type HelpSidebarSection = {
  id: string;
  title: string;
  articleSlugs: string[];
};

export const helpResources: HelpResource[] = [
  {
    id: 'diagnostic-checklist',
    title: 'Checklist de diagnóstico SIGI',
    summary: 'Pasos mínimos para revisar API, sesión, EGI, imports y conectores.',
    href: '/help/checklist-diagnostico-sigi.txt',
    kind: 'download',
  },
  {
    id: 'glossary-csv',
    title: 'Glosario SIGI en CSV',
    summary: 'Términos base para operación funcional, técnica y de interoperabilidad.',
    href: '/help/glosario-sigi.csv',
    kind: 'download',
  },
  {
    id: 'ai-rules',
    title: 'Reglas base para respuestas IA',
    summary: 'Plantilla inicial para un futuro asistente de ayuda del SIGI.',
    href: '/help/reglas-respuesta-ia-sigi.json',
    kind: 'download',
  },
  {
    id: 'release-runbook',
    title: 'Runbook de liberación',
    summary: 'Guía operativa actual para levantar y validar el stack productivo.',
    href: '/admin/api',
    kind: 'internal',
  },
];

export const helpArticles: HelpArticle[] = [
  {
    id: 'help-what-is-sigi',
    slug: 'que-es-sigi',
    title: '¿Qué es el SIGI?',
    summary: 'Panorama funcional del SIGI, sus módulos y la lógica de trabajo por espacios EGI.',
    section: 'primeros-pasos',
    contentType: 'user_manual',
    module: 'auth',
    audience: ['functional_user', 'institution_admin', 'support'],
    level: 'basic',
    tags: ['introduccion', 'navegacion', 'egi'],
    keywords: ['sigi', 'sistema', 'egi', 'modulos', 'ingreso'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 6,
    author: 'Equipo SIGI',
    content:
      'SIGI es una plataforma de gestión institucional para operar fuentes, validaciones, proyectos, documentos, capas geoespaciales, publicaciones e interoperabilidad sin mezclar contextos entre EGI.',
    sections: [
      {
        id: 'proposito',
        title: 'Propósito del SIGI',
        body: [
          'SIGI concentra gobierno de datos, operación documental, trazabilidad de proyectos e interoperabilidad técnica en una sola consola.',
          'El modelo vigente separa operación por Espacios de Gestión de Información (EGI) para evitar cruces entre instituciones o contextos operativos.',
        ],
      },
      {
        id: 'modulos-principales',
        title: 'Módulos principales',
        body: ['La consola administrativa actual incluye espacios EGI, instituciones, usuarios, fuentes, validaciones, proyectos, documentos, geoespacial, publicaciones y API.'],
        bullets: [
          'Espacios EGI para seleccionar el contexto operativo.',
          'Fuentes e importaciones para cargas manuales o conectadas.',
          'Validaciones y bitácora para gobernanza y trazabilidad.',
          'Proyectos, documentos y visor geoespacial para la operación transversal.',
        ],
      },
      {
        id: 'principio-egI',
        title: 'Principio de trabajo por EGI',
        body: [
          'La mayoría de módulos operativos requieren un EGI activo.',
          'Superadministradores y administradores nacionales pueden usar vista global explícita cuando el módulo lo soporta.',
        ],
      },
    ],
    prerequisites: ['Tener una cuenta activa en SIGI.'],
    commonErrors: [
      'Entrar a un módulo operativo sin haber seleccionado un EGI.',
      'Interpretar la vista global como si fuera el comportamiento normal de todos los usuarios.',
    ],
    troubleshooting: [
      'Si la consola redirige a “Mis espacios”, crea o selecciona un EGI antes de continuar.',
    ],
    relatedArticles: ['como-ingresar', 'seleccionar-egi', 'navegacion-general'],
    relatedQuestions: [
      '¿Qué diferencia hay entre vista pública y espacio de trabajo?',
      '¿Por qué algunos módulos piden EGI activo?',
    ],
    resourceIds: ['glossary-csv'],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-login',
    slug: 'como-ingresar',
    title: 'Cómo ingresar al sistema',
    summary: 'Acceso con correo y password, manejo de sesión y señales de error comunes.',
    section: 'primeros-pasos',
    contentType: 'step_by_step',
    module: 'auth',
    audience: ['functional_user', 'institution_admin', 'support', 'super_admin'],
    level: 'basic',
    tags: ['login', 'sesion', 'seguridad'],
    keywords: ['ingresar', 'correo', 'password', 'sesion', 'token'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 4,
    author: 'Equipo SIGI',
    content:
      'El acceso vigente a la consola administrativa usa correo y password. La sesión se renueva automáticamente mientras el refresh token siga vigente.',
    sections: [
      {
        id: 'pasos-ingreso',
        title: 'Pasos',
        body: ['Inicia sesión con tu correo y contraseña institucional.'],
        steps: [
          'Abre la página de inicio de sesión del SIGI.',
          'Escribe tu correo institucional.',
          'Ingresa tu contraseña. Puedes usar el ícono del ojo para verla y revisar que esté bien escrita.',
          'Presiona “Iniciar sesión”.',
          'Si olvidaste tu contraseña, usa “¿Olvidaste tu contraseña?” para ver cómo contactar a soporte. Tras varios intentos fallidos la cuenta se bloquea temporalmente.',
        ],
      },
      {
        id: 'sesion-segura',
        title: 'Qué hace la sesión',
        body: [
          'La consola guarda la sesión en almacenamiento de sesión del navegador y renueva el token de acceso cuando está por expirar.',
          'Si el refresh token ya no es válido, la consola te pedirá iniciar sesión nuevamente.',
        ],
      },
      {
        id: 'errores-comunes-login',
        title: 'Mensajes frecuentes',
        body: ['Los errores de sesión se muestran con texto legible y, cuando aplica, incluyen código y referencia de solicitud.'],
        bullets: [
          '“La sesión expiró o ya no es válida”.',
          '“No se pudo conectar con la API del SIGI”.',
        ],
      },
    ],
    prerequisites: ['Contar con usuario activo y password asignado.'],
    commonErrors: [
      'Intentar entrar con credenciales antiguas o copiadas desde entornos demo.',
      'Usar la consola cuando el backend no está levantado.',
    ],
    troubleshooting: [
      'Si ves “Failed to fetch” o mensaje de API caída, valida que la API esté activa.',
      'Si el sistema te saca al formulario de acceso durante una operación larga, verifica vencimiento de sesión y estado del backend.',
    ],
    relatedArticles: ['que-es-sigi', 'seleccionar-egi', 'diagnostico-tecnico'],
    relatedQuestions: ['¿Dónde reviso si la API está activa?', '¿Qué hago si olvidé mi password?'],
    resourceIds: ['diagnostic-checklist'],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-egi',
    slug: 'seleccionar-egi',
    title: 'Cómo seleccionar un EGI',
    summary: 'Guía para elegir el espacio operativo correcto y entender la vista global.',
    section: 'primeros-pasos',
    contentType: 'step_by_step',
    module: 'egi',
    audience: ['functional_user', 'institution_admin', 'support', 'super_admin'],
    level: 'basic',
    tags: ['egi', 'espacios', 'alcance'],
    keywords: ['egi', 'espacio', 'activo', 'vista global'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 5,
    author: 'Equipo SIGI',
    content:
      'El EGI determina qué datos operativos verás y editarás. La selección correcta es obligatoria antes de trabajar con fuentes, importaciones, proyectos o documentos.',
    sections: [
      {
        id: 'donde-entrar',
        title: 'Dónde se selecciona',
        body: ['La gestión del contexto se hace en “Mis espacios” dentro de la consola administrativa.'],
      },
      {
        id: 'pasos-egi',
        title: 'Pasos',
        body: ['Selecciona el espacio que corresponde a tu operación antes de abrir módulos operativos.'],
        steps: [
          'Abre “Mis espacios”.',
          'Busca el EGI por nombre o código.',
          'Confirma que corresponde a la institución y al alcance temático esperado.',
          'Actívalo para la sesión actual.',
        ],
      },
      {
        id: 'vista-global',
        title: 'Vista global',
        body: [
          'La vista global solo debe usarse cuando el rol tenga alcance nacional o global y el módulo la soporte explícitamente.',
          'No reemplaza el trabajo normal por EGI.',
        ],
      },
    ],
    prerequisites: ['Tener acceso a uno o más espacios EGI.'],
    commonErrors: [
      'Operar en el EGI equivocado.',
      'Asumir que la vista global está disponible para todos los perfiles.',
    ],
    troubleshooting: [
      'Si no ves espacios disponibles, revisa tu asignación institucional o membresía EGI.',
      'Si un módulo te bloquea, vuelve a “Mis espacios” y confirma el EGI activo.',
    ],
    relatedArticles: ['que-es-sigi', 'como-ingresar', 'crear-institucion'],
    relatedQuestions: ['¿Cómo sé si estoy en vista global?', '¿Qué módulos exigen EGI activo?'],
    resourceIds: [],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-nav',
    slug: 'navegacion-general',
    title: 'Navegación general de la consola',
    summary: 'Lectura rápida del menú lateral, búsqueda de módulos y comportamiento del shell admin.',
    section: 'primeros-pasos',
    contentType: 'user_manual',
    module: 'admin',
    audience: ['functional_user', 'institution_admin'],
    level: 'basic',
    tags: ['menu', 'navegacion', 'shell'],
    keywords: ['menu lateral', 'modulos', 'consola', 'buscar'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 5,
    author: 'Equipo SIGI',
    content:
      'La consola administrativa usa un layout común con menú lateral, barra superior, búsqueda de módulos y lectura del EGI activo.',
    sections: [
      {
        id: 'shell-admin',
        title: 'Partes del layout',
        body: ['El shell vigente presenta menú lateral, barra superior con contexto EGI y un área central donde se monta cada módulo.'],
        bullets: [
          'Menú lateral por dominios.',
          'Búsqueda rápida de módulos.',
          'Indicador de EGI activo o vista global.',
          'Acciones rápidas como actualizar o cambiar de espacio.',
        ],
      },
      {
        id: 'acceso-modulos',
        title: 'Cómo leer accesos restringidos',
        body: [
          'Los módulos del menú se muestran según permisos efectivos.',
          'Si abres una ruta sin permisos, verás un panel de acceso restringido en lugar del módulo.',
        ],
      },
    ],
    prerequisites: ['Sesión activa en la consola administrativa.'],
    commonErrors: ['Buscar un módulo sin tener el permiso correspondiente.'],
    troubleshooting: ['Si un módulo no aparece, revisa tus permisos o filtra el menú con la búsqueda lateral.'],
    relatedArticles: ['que-es-sigi', 'usuarios-roles', 'bitacora-auditoria'],
    relatedQuestions: ['¿Por qué no veo algunos módulos?', '¿Qué significa acceso restringido?'],
    resourceIds: [],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-institutions',
    slug: 'crear-institucion',
    title: 'Cómo crear una institución',
    summary: 'Creación y mantenimiento de instituciones dentro de la gobernanza SIGI.',
    section: 'administracion',
    contentType: 'step_by_step',
    module: 'admin',
    audience: ['institution_admin', 'super_admin', 'support'],
    level: 'intermediate',
    tags: ['instituciones', 'gobernanza'],
    keywords: ['institucion', 'codigo', 'estado', 'admin'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 7,
    author: 'Equipo SIGI',
    content:
      'La institución es la unidad organizativa base para usuarios, fuentes y espacios EGI.',
    sections: [
      {
        id: 'cuando-crear',
        title: 'Cuándo crear una institución',
        body: [
          'Crea una institución cuando una entidad debe operar con usuarios, fuentes o espacios propios.',
        ],
      },
      {
        id: 'pasos-institucion',
        title: 'Pasos',
        body: ['La pantalla de instituciones permite alta, edición y baja controlada.'],
        steps: [
          'Abre “Instituciones”.',
          'Usa el formulario de creación.',
          'Define un código corto estable.',
          'Escribe el nombre visible completo.',
          'Selecciona el estado operativo.',
        ],
      },
      {
        id: 'buenas-practicas',
        title: 'Buenas prácticas',
        body: ['El código debe ser estable y fácil de reconocer en auditoría o integraciones.'],
        bullets: [
          'Usa códigos consistentes entre SIGI, Odoo y documentos institucionales cuando sea posible.',
          'Evita duplicar instituciones por pequeñas variaciones de nombre.',
        ],
      },
    ],
    prerequisites: ['Permiso para gestionar instituciones.'],
    commonErrors: [
      'Crear una institución duplicada por no revisar catálogo existente.',
      'Usar códigos demasiado largos o ambiguos.',
    ],
    troubleshooting: ['Si no puedes crear una institución, valida que tu rol tenga permisos administrativos suficientes.'],
    relatedArticles: ['seleccionar-egi', 'usuarios-roles'],
    relatedQuestions: ['¿Puedo desactivar una institución sin borrar usuarios?', '¿Cómo impacta una institución en los EGI?'],
    resourceIds: [],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-users-roles',
    slug: 'usuarios-roles',
    title: 'Cómo crear usuarios y asignar roles',
    summary: 'Alta de usuarios, roles globales y lectura del alcance real de permisos.',
    section: 'administracion',
    contentType: 'user_manual',
    module: 'users',
    audience: ['institution_admin', 'super_admin', 'support'],
    level: 'intermediate',
    tags: ['usuarios', 'roles', 'permisos'],
    keywords: ['usuario', 'rol', 'permiso', 'superadmin', 'editor'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 8,
    author: 'Equipo SIGI',
    content:
      'La gestión de usuarios se hace desde el módulo administrativo, separando alta de usuario, edición y gobierno de roles.',
    sections: [
      {
        id: 'roles-base',
        title: 'Roles base',
        body: ['El sistema ya trabaja con roles base como superadmin, national_admin, institution_editor, technical_validator, technical_integration y read_consumer.'],
      },
      {
        id: 'alta-usuario',
        title: 'Alta de usuario',
        body: ['La creación de usuario vive en una vista dedicada para mantener el inventario limpio.'],
        steps: [
          'Abre “Usuarios”.',
          'Entra a la pestaña o pantalla de alta.',
          'Completa correo, nombre, estado y password inicial.',
          'Asigna institución si aplica.',
          'Asigna uno o más roles.',
        ],
      },
      {
        id: 'lectura-permisos',
        title: 'Cómo leer permisos',
        body: [
          'Los permisos efectivos provienen del rol y del contexto EGI.',
          'Un usuario puede ver un módulo en global solo si su rol realmente lo soporta.',
        ],
      },
    ],
    prerequisites: ['Permiso para leer o crear usuarios.'],
    commonErrors: [
      'Asignar un rol demasiado amplio para una tarea operativa simple.',
      'Olvidar la institución en perfiles institucionales.',
    ],
    troubleshooting: [
      'Si un usuario no ve un módulo, revisa primero permiso global y luego membresía EGI.',
    ],
    relatedArticles: ['crear-institucion', 'seleccionar-egi', 'bitacora-auditoria'],
    relatedQuestions: ['¿Qué rol debe tener un validador?', '¿Cómo doy vista global?'],
    resourceIds: [],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-sources',
    slug: 'registrar-fuente',
    title: 'Cómo registrar una fuente de datos',
    summary: 'Creación de fuentes, tipos soportados y relación con institución, EGI y conectores.',
    section: 'gestion-datos',
    contentType: 'step_by_step',
    module: 'sources',
    audience: ['functional_user', 'data_technician', 'institution_admin'],
    level: 'intermediate',
    tags: ['sources', 'kobo', 'odoo', 'excel'],
    keywords: ['fuente', 'datos', 'excel', 'kobo', 'odoo'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 8,
    author: 'Equipo SIGI',
    content:
      'Las fuentes son el punto de entrada formal para imports manuales y sincronizaciones técnicas.',
    sections: [
      {
        id: 'tipos-fuente',
        title: 'Tipos de fuente vigentes',
        body: ['La consola actual soporta fuentes de tipo Kobo, Excel, Odoo, PostGIS y API.'],
      },
      {
        id: 'pasos-fuente',
        title: 'Pasos',
        body: ['Registra la fuente dentro del EGI correcto.'],
        steps: [
          'Selecciona el EGI activo.',
          'Abre “Fuentes de datos”.',
          'Crea la fuente con código, nombre, institución y tipo.',
          'Asocia un conector cuando aplique.',
          'Guarda el estado activo o inactivo según la preparación real.',
        ],
      },
      {
        id: 'alcance-fuente',
        title: 'Alcance y gobernanza',
        body: [
          'Una fuente creada dentro de un EGI no debe usarse para mezclar datos de otros espacios.',
          'Los filtros del sistema ya separan fuentes por EGI o por vista global explícita.',
        ],
      },
    ],
    prerequisites: ['EGI activo y permisos de lectura/gestión de fuentes.'],
    commonErrors: [
      'Crear una fuente en el EGI equivocado.',
      'Registrar una fuente técnica sin documentar su uso operativo.',
    ],
    troubleshooting: [
      'Si no ves una fuente esperada, confirma el EGI activo antes de buscarla.',
    ],
    relatedArticles: ['cargar-excel', 'validar-correcciones', 'kobo-operacion', 'odoo-operacion'],
    relatedQuestions: ['¿Qué diferencia hay entre fuente y conector?', '¿Cuándo uso Excel y cuándo Kobo?'],
    resourceIds: ['diagnostic-checklist'],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-imports',
    slug: 'cargar-excel',
    title: 'Cómo cargar un Excel',
    summary: 'Importación de plantillas, mapeo de columnas y señales para corregir errores.',
    section: 'gestion-datos',
    contentType: 'data_entry_rule',
    module: 'imports',
    audience: ['functional_user', 'data_technician', 'support'],
    level: 'intermediate',
    tags: ['excel', 'importacion', 'mapeo', 'errores'],
    keywords: ['excel', 'xlsx', 'csv', 'import', 'columnas'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 10,
    author: 'Equipo SIGI',
    content:
      'Las cargas de Excel pasan por staging, reglas de validación y promoción; por eso conviene preparar bien la plantilla antes de subirla.',
    sections: [
      {
        id: 'antes-de-subir',
        title: 'Antes de subir',
        body: [
          'Confirma el tipo de entidad que vas a cargar y verifica que la plantilla corresponda al módulo correcto.',
        ],
        bullets: [
          'Instituciones',
          'Proyectos',
          'Indicadores de proyecto',
          'Territorios de proyecto',
        ],
      },
      {
        id: 'pasos-carga',
        title: 'Pasos',
        body: ['La carga se ejecuta desde el módulo de fuentes/importaciones.'],
        steps: [
          'Selecciona el EGI activo.',
          'Abre “Fuentes de datos”.',
          'Elige la entidad del lote.',
          'Sube el archivo CSV/XLSX.',
          'Revisa batch, reglas y errores antes de promover.',
        ],
      },
      {
        id: 'mapeo-columnas',
        title: 'Manejo de columnas',
        body: [
          'Si la plantilla no coincide exactamente, el sistema puede requerir mapeo de columnas.',
          'Las salidas CSV de corrección ayudan a identificar columnas canónicas faltantes.',
        ],
      },
    ],
    prerequisites: ['Fuente registrada o contexto de carga definido.'],
    commonErrors: [
      'Encabezados no canónicos.',
      'Campos obligatorios vacíos.',
      'Subir el archivo en entidad incorrecta.',
    ],
    troubleshooting: [
      'Si el batch termina con errores, revisa primero reglas agregadas y luego filas puntuales.',
      'Usa el CSV exportado de corrección para completar columnas obligatorias y reintentar.',
    ],
    relatedArticles: ['registrar-fuente', 'validar-correcciones'],
    relatedQuestions: ['¿Qué columnas son obligatorias?', '¿Qué hago con errores por mapeo?'],
    resourceIds: ['diagnostic-checklist'],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-validations',
    slug: 'validar-correcciones',
    title: 'Cómo se validan los datos y cómo corregir errores',
    summary: 'Lectura de reglas, errores por batch y flujo de corrección antes de publicar o promover.',
    section: 'gestion-datos',
    contentType: 'troubleshooting',
    module: 'validations',
    audience: ['functional_user', 'data_technician', 'support'],
    level: 'intermediate',
    tags: ['validacion', 'errores', 'calidad'],
    keywords: ['validacion', 'batch', 'error', 'regla', 'correccion'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 9,
    author: 'Equipo SIGI',
    content:
      'La validación en SIGI no es solo un mensaje de error: combina reglas, estados y trazabilidad para saber por qué un lote no puede seguir.',
    sections: [
      {
        id: 'tipos-validacion',
        title: 'Qué revisar',
        body: ['La revisión operativa se hace por resultado de validación, reglas agrupadas y errores fila a fila.'],
      },
      {
        id: 'flujo-correccion',
        title: 'Flujo recomendado',
        body: ['Corrige primero errores estructurales y luego inconsistencias de negocio.'],
        steps: [
          'Abre el batch o conjunto afectado.',
          'Revisa reglas agregadas.',
          'Identifica errores repetidos.',
          'Corrige origen o archivo.',
          'Vuelve a cargar y compara resultado.',
        ],
      },
      {
        id: 'criterio-promocion',
        title: 'Antes de promover',
        body: [
          'Solo promueve cuando los errores críticos ya estén resueltos y la calidad del lote sea coherente con el uso previsto.',
        ],
      },
    ],
    prerequisites: ['Haber cargado un lote o dataset para revisar.'],
    commonErrors: [
      'Intentar promover un lote con errores estructurales.',
      'Corregir una fila manualmente sin atender el problema repetido de fondo.',
    ],
    troubleshooting: [
      'Si un error aparece en muchas filas, revisa el encabezado, catálogo o mapping profile antes de corregir registro por registro.',
    ],
    relatedArticles: ['cargar-excel', 'bitacora-auditoria'],
    relatedQuestions: ['¿Cómo sé si un error es bloqueante?', '¿Qué revisa un validador?'],
    resourceIds: ['diagnostic-checklist'],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-projects',
    slug: 'crear-proyecto',
    title: 'Cómo crear un proyecto y agregar evidencias',
    summary: 'Creación de proyecto, actores, hitos, entregables, documentos y trazabilidad.',
    section: 'proyectos',
    contentType: 'step_by_step',
    module: 'projects',
    audience: ['functional_user', 'institution_admin', 'data_technician'],
    level: 'intermediate',
    tags: ['proyecto', 'actores', 'hitos', 'documentos'],
    keywords: ['proyecto', 'entregable', 'actor', 'documento', 'auditoria'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 9,
    author: 'Equipo SIGI',
    content:
      'El módulo de proyectos ya soporta un CRUD extendido y permite documentar operación, responsables, hitos, entregables y evidencia asociada.',
    sections: [
      {
        id: 'crear-proyecto-base',
        title: 'Crear el proyecto',
        body: ['Inicia en el módulo de proyectos con el EGI correcto activo.'],
        steps: [
          'Abre “Proyectos”.',
          'Crea el proyecto con código, título, estado, institución y alcance.',
          'Completa visibilidad y campos de contexto.',
        ],
      },
      {
        id: 'capas-proyecto',
        title: 'Qué se agrega después',
        body: ['El proyecto puede enriquecerse con más objetos de gestión.'],
        bullets: [
          'Actores',
          'Hitos',
          'Entregables',
          'Documentos y evidencias',
          'Incidentes y trazabilidad',
        ],
      },
      {
        id: 'auditoria-proyecto',
        title: 'Trazabilidad',
        body: [
          'Las operaciones relevantes dejan rastro en auditoría y deben mantenerse dentro del EGI correcto.',
        ],
      },
    ],
    prerequisites: ['Permisos para leer o gestionar proyectos.'],
    commonErrors: [
      'Crear el proyecto sin institución o portafolio claramente definidos.',
      'Subir documentos fuera del contexto del proyecto.',
    ],
    troubleshooting: [
      'Si el proyecto no aparece donde esperas, confirma filtros, visibilidad y EGI activo.',
    ],
    relatedArticles: ['explorador-documental', 'geojson-shapefile', 'bitacora-auditoria'],
    relatedQuestions: ['¿Cómo agrego una evidencia?', '¿Dónde veo incidentes del proyecto?'],
    resourceIds: [],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-docs',
    slug: 'explorador-documental',
    title: 'Cómo usar el explorador documental',
    summary: 'Carga de archivos, navegación tipo explorer, metadatos y versionamiento.',
    section: 'proyectos',
    contentType: 'user_manual',
    module: 'documents',
    audience: ['functional_user', 'institution_admin', 'support'],
    level: 'intermediate',
    tags: ['documentos', 'metadata', 'versiones'],
    keywords: ['archivo', 'carpeta', 'metadato', 'version', 'upload'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 8,
    author: 'Equipo SIGI',
    content:
      'El explorador documental permite navegar carpetas, subir archivos, editar metadatos y consultar vínculos desde una misma pantalla.',
    sections: [
      {
        id: 'vista-general',
        title: 'Qué muestra la pantalla',
        body: ['La experiencia actual es estilo desktop-like, con árbol lateral, inventario central y panel de detalle.'],
      },
      {
        id: 'flujo-archivo',
        title: 'Flujo recomendado',
        body: ['Sube el archivo dentro de la carpeta correcta y luego completa sus metadatos.'],
        steps: [
          'Selecciona una carpeta o crea una nueva.',
          'Usa “Subir” o carga rápida.',
          'Selecciona el archivo en el listado central.',
          'Revisa detalle, metadatos y versiones.',
        ],
      },
      {
        id: 'versionamiento',
        title: 'Versiones y relaciones',
        body: [
          'Cuando un archivo cambia, conviene crear una nueva versión en lugar de perder la trazabilidad del original.',
        ],
      },
    ],
    prerequisites: ['Permiso `files.read` y, para mutar, permisos de gestión documental.'],
    commonErrors: [
      'Subir archivos a la carpeta equivocada.',
      'No completar metadatos mínimos después de la carga.',
    ],
    troubleshooting: [
      'Si un archivo no aparece, revisa contexto EGI, carpeta activa y filtros de búsqueda.',
    ],
    relatedArticles: ['crear-proyecto', 'validar-correcciones'],
    relatedQuestions: ['¿Cómo subo una nueva versión?', '¿Cómo vinculo el archivo a un proyecto?'],
    resourceIds: [],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-geo',
    slug: 'geojson-shapefile',
    title: 'Cómo cargar GeoJSON y Shapefile',
    summary: 'Buenas prácticas para capas geoespaciales y qué hacer cuando el origen viene en GDB/FileGDB.',
    section: 'geoespacial',
    contentType: 'integration_guide',
    module: 'geo',
    audience: ['gis_technician', 'data_technician', 'support'],
    level: 'advanced',
    tags: ['geojson', 'shapefile', 'gis'],
    keywords: ['geojson', 'shapefile', 'geoserver', 'postgis', 'gdb'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 11,
    author: 'Equipo SIGI',
    content:
      'SIGI ya soporta previsualización y carga controlada de geometrías; para FileGDB/GDB hoy la ruta segura sigue siendo conversión previa a formatos soportados.',
    sections: [
      {
        id: 'formatos-vigentes',
        title: 'Formatos vigentes',
        body: ['La operación actual prioriza GeoJSON y paquetes Shapefile válidos.'],
      },
      {
        id: 'pasos-geo',
        title: 'Flujo recomendado',
        body: ['La publicación geoespacial debe pasar por revisión técnica y validación mínima.'],
        steps: [
          'Revisa el sistema de referencia y atributos requeridos.',
          'Usa previsualización cuando esté disponible.',
          'Valida geometría y cobertura.',
          'Importa o publica dentro del EGI correcto.',
        ],
      },
      {
        id: 'gdb-filegdb',
        title: 'Qué hacer con GDB/FileGDB',
        body: [
          'No asumas carga directa como comportamiento estándar del usuario final.',
          'La práctica recomendada hoy es convertir a GeoJSON o Shapefile limpio antes de entrar a SIGI.',
        ],
      },
    ],
    prerequisites: ['Permisos de lectura geoespacial y archivo listo para revisión.'],
    commonErrors: [
      'Subir geometrías sin CRS claro.',
      'Atributos clave incompletos.',
      'Intentar usar FileGDB como si ya fuera un flujo soportado de punta a punta para todos los usuarios.',
    ],
    troubleshooting: [
      'Si la capa falla en validación, revisa columnas requeridas, geometría inválida y límites territoriales.',
    ],
    relatedArticles: ['crear-proyecto', 'kobo-operacion'],
    relatedQuestions: ['¿Qué pasa si el archivo viene en GDB?', '¿Cómo llega una capa a GeoServer?'],
    resourceIds: ['diagnostic-checklist'],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-reports',
    slug: 'dashboards-reportes',
    title: 'Cómo consultar dashboards y reportes',
    summary: 'Lectura de módulos ejecutivos, publicaciones y salidas según los permisos del usuario.',
    section: 'reportes',
    contentType: 'user_manual',
    module: 'reports',
    audience: ['functional_user', 'institution_admin'],
    level: 'basic',
    tags: ['dashboard', 'reportes', 'permisos'],
    keywords: ['dashboard', 'reportes', 'publicaciones', 'permisos'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 6,
    author: 'Equipo SIGI',
    content:
      'SIGI usa un solo frontend autenticado. Cada usuario ve los módulos, acciones y publicaciones autorizados por su rol y permisos.',
    sections: [
      {
        id: 'acceso-por-permisos',
        title: 'Acceso por permisos',
        body: [
          'El espacio de trabajo autenticado concentra operación y gobierno.',
          'La navegación y las acciones disponibles cambian según el rol, el permiso y el EGI activo.',
        ],
      },
      {
        id: 'publicaciones-reportes',
        title: 'Publicaciones',
        body: [
          'Las salidas visibles deben leerse desde el módulo de publicaciones y desde exportaciones o capas cuando aplique.',
        ],
      },
    ],
    prerequisites: ['Tener sesión y permisos de lectura sobre el módulo.'],
    commonErrors: ['Esperar ver acciones o publicaciones fuera del alcance autorizado.'],
    troubleshooting: ['Si un reporte no aparece, verifica estado de publicación, filtros y alcance del EGI.'],
    relatedArticles: ['que-es-sigi', 'interoperabilidad-sigi'],
    relatedQuestions: ['¿Dónde veo un paquete FERM?', '¿Qué significa una salida publicada?'],
    resourceIds: [],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-kobo',
    slug: 'kobo-operacion',
    title: 'Cómo funciona KoboToolbox en SIGI',
    summary: 'Registro de fuente Kobo, test de conexión, preview y sincronización.',
    section: 'interoperabilidad',
    contentType: 'integration_guide',
    module: 'kobo',
    audience: ['integration_technician', 'data_technician', 'support'],
    level: 'advanced',
    tags: ['kobo', 'sync', 'preview'],
    keywords: ['kobo', 'toolbox', 'assetUid', 'sync', 'preview'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 9,
    author: 'Equipo SIGI',
    content:
      'Kobo en SIGI se opera como fuente/conector trazable, con prueba de conexión, preview y ejecución de sincronización desde consola.',
    sections: [
      {
        id: 'datos-necesarios',
        title: 'Configuración mínima',
        body: ['Para una fuente Kobo necesitas asset UID, endpoint/base URL y credencial válida del conector.'],
      },
      {
        id: 'flujo-kobo',
        title: 'Flujo recomendado',
        body: ['No ejecutes sincronización a ciegas sin preview previo cuando el formulario cambió recientemente.'],
        steps: [
          'Registra la fuente Kobo.',
          'Prueba conexión.',
          'Ejecuta preview.',
          'Corre sincronización.',
          'Revisa el último job y sus resultados.',
        ],
      },
    ],
    prerequisites: ['Fuente Kobo registrada y credenciales disponibles.'],
    commonErrors: [
      'Falta de token o credencial.',
      'Asset UID incorrecto.',
      'Endpoint Kobo mal configurado.',
    ],
    troubleshooting: ['Si el preview falla, revisa primero asset UID y autenticación antes de culpar al formulario.'],
    relatedArticles: ['registrar-fuente', 'interoperabilidad-sigi'],
    relatedQuestions: ['¿Qué hace preview Kobo?', '¿Cómo sé si el sync terminó bien?'],
    resourceIds: ['diagnostic-checklist'],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-interop',
    slug: 'interoperabilidad-sigi',
    title: 'Kobo, Odoo, FERM y exportaciones',
    summary: 'Lectura transversal de los puentes de interoperabilidad actuales del SIGI.',
    section: 'interoperabilidad',
    contentType: 'ai_knowledge',
    module: 'api',
    audience: ['integration_technician', 'support', 'super_admin'],
    level: 'technical',
    tags: ['interoperabilidad', 'odoo', 'ferm', 'exports'],
    keywords: ['odoo', 'ferm', 'bridge', 'exports', 'api'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 12,
    author: 'Arquitectura SIGI',
    content:
      'La interoperabilidad actual del SIGI combina conectores entrantes y salidas gobernadas por EGI, con vista global explícita cuando corresponde.',
    sections: [
      {
        id: 'entradas',
        title: 'Entradas',
        body: [
          'Kobo y Odoo operan como fuentes o conectores trazables dentro de la consola administrativa.',
        ],
      },
      {
        id: 'salidas',
        title: 'Salidas',
        body: [
          'Exports, publications e incidents ya respetan EGI activo y `scope=global` explícito.',
          'Los paquetes tipo FERM deben leerse bajo esa misma gobernanza de alcance y permisos.',
        ],
      },
      {
        id: 'reglas-ia',
        title: 'Reglas para una futura IA',
        body: [
          'Si el usuario pregunta por operación, la respuesta debe privilegiar artículos oficiales publicados.',
          'Si el usuario pregunta por formatos o cargas, la respuesta debe mencionar EGI, validaciones y controles de alcance.',
        ],
      },
    ],
    prerequisites: ['Lectura previa básica de fuentes, EGI y publicaciones.'],
    commonErrors: [
      'Confundir conectores entrantes con exportaciones salientes.',
      'Asumir que una salida global está disponible para todos los perfiles.',
    ],
    troubleshooting: ['Cuando una exportación “no coincide”, revisa primero el EGI activo y luego el scope global.'],
    relatedArticles: ['registrar-fuente', 'kobo-operacion', 'dashboards-reportes'],
    relatedQuestions: ['¿Qué exporta FERM?', '¿Cómo se relaciona Odoo con proyectos?'],
    resourceIds: ['ai-rules'],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-devops',
    slug: 'manual-tecnico-operacion',
    title: 'Manual técnico: instalación, Docker, logs y métricas',
    summary: 'Ruta operativa para instalar, levantar, validar y observar SIGI.',
    section: 'manual-tecnico',
    contentType: 'technical_manual',
    module: 'devops',
    audience: ['support', 'integration_technician', 'super_admin'],
    level: 'technical',
    tags: ['docker', 'env', 'logs', 'metrics', 'release'],
    keywords: ['docker', 'compose', 'metrics', 'logs', 'release gate'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 12,
    author: 'Operaciones SIGI',
    content:
      'El stack productivo ya tiene runbook, release gate, verificación de env y métricas internas protegidas por token de servicio.',
    sections: [
      {
        id: 'precondiciones-tecnicas',
        title: 'Precondiciones',
        body: ['La ruta vigente usa Docker Compose productivo, Node.js 20 y archivos `.env.production` validados.'],
      },
      {
        id: 'secuencia-minima',
        title: 'Secuencia mínima',
        body: ['La secuencia recomendada para levantar y validar es la siguiente.'],
        steps: [
          'Generar o validar `.env.production`.',
          'Ejecutar `npm run verify:env:prod`.',
          'Levantar `docker compose -f docker-compose.prod.yml up -d --build`.',
          'Correr `npm run release:gate`.',
        ],
      },
      {
        id: 'observabilidad',
        title: 'Observabilidad mínima actual',
        body: [
          'El stack tiene healthchecks, logs, métricas internas y captura de artefactos en CI.',
        ],
      },
    ],
    prerequisites: ['Acceso al repositorio y al entorno Docker.'],
    commonErrors: [
      'Usar secretos placeholder en producción.',
      'Levantar el stack sin validar variables de entorno.',
    ],
    troubleshooting: [
      'Si el release gate cae, revisa primero el gate puntual afectado y luego logs del servicio correspondiente.',
    ],
    relatedArticles: ['interoperabilidad-sigi', 'diagnostico-tecnico'],
    relatedQuestions: ['¿Dónde está el release gate?', '¿Cómo revisar `/api/metrics`?'],
    resourceIds: ['release-runbook', 'diagnostic-checklist'],
    aiEnabled: true,
    sourcePriority: 'official',
  },
  {
    id: 'help-support',
    slug: 'diagnostico-tecnico',
    title: 'Diagnóstico técnico y errores comunes',
    summary: 'Checklist de soporte para problemas de sesión, API, imports, EGI y conectores.',
    section: 'soporte',
    contentType: 'troubleshooting',
    module: 'support',
    audience: ['support', 'integration_technician', 'super_admin'],
    level: 'technical',
    tags: ['soporte', 'errores', 'api', 'egi'],
    keywords: ['soporte', 'failed to fetch', 'requestId', 'api', 'session'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 8,
    author: 'Mesa técnica SIGI',
    content:
      'Cuando algo falla en SIGI conviene revisar sesión, backend, EGI, permisos y gate funcional antes de cambiar código o datos.',
    sections: [
      {
        id: 'errores-frecuentes',
        title: 'Errores frecuentes',
        body: ['Hay un conjunto corto de fallas repetidas que explican la mayoría de incidentes operativos.'],
        bullets: [
          'No se pudo conectar con la API.',
          'La sesión expiró.',
          'No hay EGI activo.',
          'Error de validación por columnas o catálogos.',
          'Conector sin credenciales o sin endpoint.',
        ],
      },
      {
        id: 'pasos-diagnostico',
        title: 'Checklist',
        body: ['Sigue este orden antes de escalar.'],
        steps: [
          'Validar salud de la API.',
          'Revisar sesión del usuario.',
          'Confirmar EGI activo o vista global.',
          'Leer mensaje con requestId o código.',
          'Revisar logs y smoke correspondiente.',
        ],
      },
    ],
    prerequisites: ['Acceso a la consola o a logs operativos según el caso.'],
    commonErrors: [
      'Escalar el problema sin requestId.',
      'Intentar corregir datos cuando en realidad el EGI activo es incorrecto.',
    ],
    troubleshooting: ['Si el problema es reproducible, captura requestId, módulo, usuario, EGI y hora exacta antes de escalar.'],
    relatedArticles: ['como-ingresar', 'manual-tecnico-operacion'],
    relatedQuestions: ['¿Dónde veo el requestId?', '¿Qué hago con un 403?'],
    resourceIds: ['diagnostic-checklist'],
    aiEnabled: true,
    sourcePriority: 'support',
  },
  {
    id: 'help-glossary',
    slug: 'glosario-sigi',
    title: 'Glosario SIGI',
    summary: 'Términos clave para usuarios funcionales, técnicos y de soporte.',
    section: 'ia-knowledge',
    contentType: 'glossary',
    module: 'support',
    audience: ['functional_user', 'institution_admin', 'data_technician', 'support'],
    level: 'basic',
    tags: ['glosario', 'terminos'],
    keywords: ['glosario', 'egi', 'batch', 'dataset', 'publicacion'],
    version: '1.0.0',
    status: 'published',
    updatedAt: '2026-07-15',
    estimatedMinutes: 7,
    author: 'Equipo SIGI',
    content:
      'Este glosario sirve como referencia humana y también como base indexable para futuras respuestas IA del SIGI.',
    sections: [
      {
        id: 'terminos-base',
        title: 'Términos base',
        body: ['Conceptos mínimos para operar SIGI sin ambigüedad.'],
        bullets: [
          'EGI: Espacio de Gestión de Información.',
          'Fuente: origen formal de datos dentro de la plataforma.',
          'Batch: lote de importación procesado por el pipeline.',
          'Publication: salida o canal de publicación.',
          'Export target: destino de interoperabilidad o entrega estructurada.',
        ],
      },
    ],
    prerequisites: [],
    commonErrors: ['Usar “fuente”, “dataset” y “batch” como sinónimos cuando no lo son.'],
    troubleshooting: ['Si una conversación técnica se vuelve ambigua, vuelve a este glosario antes de seguir.'],
    relatedArticles: ['que-es-sigi', 'interoperabilidad-sigi'],
    relatedQuestions: ['¿Qué diferencia hay entre publication y export?', '¿Qué es un batch?'],
    resourceIds: ['glossary-csv', 'ai-rules'],
    aiEnabled: true,
    sourcePriority: 'official',
  },
];

export const helpSidebarSections: HelpSidebarSection[] = [
  { id: 'primeros-pasos', title: 'Primeros pasos', articleSlugs: ['que-es-sigi', 'como-ingresar', 'seleccionar-egi', 'navegacion-general'] },
  { id: 'administracion', title: 'Administración', articleSlugs: ['crear-institucion', 'usuarios-roles'] },
  { id: 'gestion-datos', title: 'Gestión de datos', articleSlugs: ['registrar-fuente', 'cargar-excel', 'validar-correcciones'] },
  { id: 'proyectos', title: 'Proyectos', articleSlugs: ['crear-proyecto', 'explorador-documental'] },
  { id: 'geoespacial', title: 'Geoespacial', articleSlugs: ['geojson-shapefile'] },
  { id: 'reportes', title: 'Reportes y dashboards', articleSlugs: ['dashboards-reportes'] },
  { id: 'interoperabilidad', title: 'Interoperabilidad', articleSlugs: ['kobo-operacion', 'interoperabilidad-sigi'] },
  { id: 'manual-tecnico', title: 'Manual técnico', articleSlugs: ['manual-tecnico-operacion'] },
  { id: 'ia-knowledge', title: 'Base de conocimiento IA', articleSlugs: ['glosario-sigi', 'interoperabilidad-sigi'] },
  { id: 'soporte', title: 'Soporte', articleSlugs: ['diagnostico-tecnico'] },
];

export const helpLearningPaths: HelpLearningPath[] = [
  {
    id: 'intro-sigi',
    title: 'Introducción al SIGI',
    summary: 'Entrada general a la consola, sesión y lógica por EGI.',
    audience: ['functional_user', 'institution_admin'],
    articleSlugs: ['que-es-sigi', 'como-ingresar', 'seleccionar-egi', 'navegacion-general'],
  },
  {
    id: 'admin-institucional',
    title: 'Administración institucional',
    summary: 'Gobierno base de instituciones, usuarios y permisos.',
    audience: ['institution_admin', 'super_admin'],
    articleSlugs: ['crear-institucion', 'usuarios-roles'],
  },
  {
    id: 'carga-validacion',
    title: 'Carga y validación de datos',
    summary: 'Fuentes, Excel, reglas y corrección operativa.',
    audience: ['functional_user', 'data_technician', 'support'],
    articleSlugs: ['registrar-fuente', 'cargar-excel', 'validar-correcciones'],
  },
  {
    id: 'gestion-proyectos',
    title: 'Gestión de proyectos',
    summary: 'Proyecto, evidencia y operación documental.',
    audience: ['functional_user', 'institution_admin'],
    articleSlugs: ['crear-proyecto', 'explorador-documental'],
  },
  {
    id: 'uso-geo',
    title: 'Uso geoespacial',
    summary: 'Capas, geometrías y publicación técnica.',
    audience: ['gis_technician', 'data_technician'],
    articleSlugs: ['geojson-shapefile'],
  },
  {
    id: 'reportes-y-portal',
    title: 'Reportes y dashboards',
    summary: 'Lectura de salidas y diferencia entre consola y portal.',
    audience: ['functional_user', 'institution_admin'],
    articleSlugs: ['dashboards-reportes'],
  },
  {
    id: 'interop',
    title: 'Interoperabilidad FERM/Kobo',
    summary: 'Puentes técnicos, previews y salidas gobernadas.',
    audience: ['integration_technician', 'support'],
    articleSlugs: ['kobo-operacion', 'interoperabilidad-sigi'],
  },
  {
    id: 'operacion-tecnica',
    title: 'Operación técnica',
    summary: 'Docker, release gate, métricas y soporte.',
    audience: ['support', 'super_admin'],
    articleSlugs: ['manual-tecnico-operacion', 'diagnostico-tecnico'],
  },
];

export const helpFaqItems: HelpFaqItem[] = [
  {
    id: 'faq-egi',
    question: '¿Por qué el sistema me pide un EGI antes de operar?',
    answer: 'Porque la mayoría de módulos operativos separan datos por espacio para no mezclar instituciones ni contextos.',
    articleSlug: 'seleccionar-egi',
    audience: ['functional_user', 'institution_admin'],
  },
  {
    id: 'faq-excel',
    question: '¿Qué hago si el Excel carga pero termina con errores?',
    answer: 'Revisa primero las reglas agregadas del batch y luego corrige columnas o datos obligatorios antes de volver a subirlo.',
    articleSlug: 'validar-correcciones',
    audience: ['functional_user', 'data_technician'],
  },
  {
    id: 'faq-gdb',
    question: '¿Puedo subir un FileGDB directamente?',
    answer: 'No lo tomes como flujo estándar del usuario final. La ruta segura actual es convertirlo antes a GeoJSON o Shapefile limpio.',
    articleSlug: 'geojson-shapefile',
    audience: ['gis_technician', 'support'],
  },
  {
    id: 'faq-api',
    question: '¿Cómo sé si el backend está activo?',
    answer: 'Valida el endpoint de salud de la API y, si operas técnicamente, apóyate en logs y release gate.',
    articleSlug: 'manual-tecnico-operacion',
    audience: ['support', 'super_admin'],
  },
];

export const audienceLabels: Record<HelpAudience, string> = {
  functional_user: 'Usuario funcional',
  institution_admin: 'Administrador institucional',
  data_technician: 'Técnico de datos',
  gis_technician: 'Técnico GIS',
  integration_technician: 'Técnico de interoperabilidad',
  support: 'Soporte técnico',
  super_admin: 'Superadministrador SIGI',
};

export const contentTypeLabels: Record<HelpContentType, string> = {
  user_manual: 'Manual',
  technical_manual: 'Técnico',
  step_by_step: 'Guía paso a paso',
  faq: 'FAQ',
  glossary: 'Glosario',
  troubleshooting: 'Solución de problemas',
  data_entry_rule: 'Regla de carga',
  integration_guide: 'Guía de integración',
  ai_knowledge: 'IA Knowledge',
};

export const moduleLabels: Record<HelpModule, string> = {
  auth: 'Acceso',
  egi: 'EGI',
  admin: 'Administración',
  users: 'Usuarios',
  roles: 'Roles',
  sources: 'Fuentes',
  imports: 'Importaciones',
  validations: 'Validaciones',
  catalogs: 'Catálogos',
  schemas: 'Schemas',
  projects: 'Proyectos',
  documents: 'Documentos',
  audit: 'Auditoría',
  geo: 'Geoespacial',
  dashboard: 'Dashboard',
  country_portal: 'Portal país',
  reports: 'Reportes',
  kobo: 'KoboToolbox',
  ferm: 'FERM',
  odoo: 'Odoo',
  api: 'API / interoperabilidad',
  devops: 'Operación técnica',
  support: 'Soporte',
};

export function buildHelpKnowledgeManifest() {
  return helpArticles.map((article) => ({
    id: article.id,
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    contentType: article.contentType,
    module: article.module,
    audience: article.audience,
    level: article.level,
    tags: article.tags,
    keywords: article.keywords,
    version: article.version,
    status: article.status,
    updatedAt: article.updatedAt,
    estimatedMinutes: article.estimatedMinutes,
    aiEnabled: article.aiEnabled,
    sourcePriority: article.sourcePriority,
    relatedArticles: article.relatedArticles,
    sectionTitles: article.sections.map((section) => section.title),
  }));
}
