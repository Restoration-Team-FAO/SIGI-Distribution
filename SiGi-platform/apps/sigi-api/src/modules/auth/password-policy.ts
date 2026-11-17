export const MINIMUM_PASSWORD_LENGTH = 12;

export function isStrongPassword(value: string) {
  return (
    value.length >= MINIMUM_PASSWORD_LENGTH &&
    /[a-z]/i.test(value) &&
    /\d/.test(value)
  );
}
