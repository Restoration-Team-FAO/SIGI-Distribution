// Redacción de secretos en configuraciones devueltas por la API (P0-03 / F1-03).
// Ninguna respuesta debe contener credentialSecret, tokens, contraseñas ni claves: solo se
// informa si existen (credentialsConfigured) para que la UI muestre el estado.

const SECRET_KEY_PATTERN =
  /(secret|token|password|passwd|pwd|api[_-]?key|apikey|credential|passphrase|private[_-]?key|authorization|bearer)/i;

export const REDACTED_VALUE = '[REDACTED]';

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as unknown as T;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(key)) {
        if (item !== null && item !== undefined && item !== '') {
          output[key] = REDACTED_VALUE;
        }
        continue;
      }
      output[key] = redactSecrets(item);
    }
    return output as T;
  }
  return value;
}
