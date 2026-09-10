const PASSWORD_RULES = {
  minLength: 8,
  uppercase: true,
  lowercase: true,
  digit: true,
} as const;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_RULES.minLength) {
    return `Password must be at least ${PASSWORD_RULES.minLength} characters`;
  }
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  return null;
}