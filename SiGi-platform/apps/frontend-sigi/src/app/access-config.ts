// Datos institucionales que muestra la vista de acceso. Se fijan en el build (VITE_*) para que cada
// instancia indique su propia institución y canal de soporte sin cambiar el código.
const env = import.meta.env as Record<string, string | undefined>;

const supportEmail = env.VITE_SIGI_SUPPORT_EMAIL?.trim() || null;

export const SIGI_SUPPORT_CONTACT = {
  email: supportEmail,
  /** Texto a mostrar cuando la instancia no configuró un correo de soporte. */
  label: env.VITE_SIGI_SUPPORT_LABEL?.trim() || 'la persona administradora del SIGI en tu institución',
};

export const SIGI_INSTITUTION_NAME = env.VITE_SIGI_INSTITUTION_NAME?.trim() || null;

export const SIGI_VERSION_LABEL = `SIGI v${__SIGI_VERSION__}`;
