export interface RedactOptions {
  /** Extra patterns applied on top of the defaults */
  patterns?: RegExp[];
  /** Replacement string, defaults to "[REDACTED]" */
  replacement?: string;
  /** Skip the built-in credential patterns */
  disableDefaults?: boolean;
}

export const DEFAULT_REDACT_PATTERNS: RegExp[] = [
  /(password|passwd|pwd|token|secret|api[_-]?key|apikey|access[_-]?key)=\S+/gi,
  // Only treat Bearer values of realistic length as secrets, so prose like
  // "Bearer tokens are required" survives.
  /[Bb]earer\s+\S{8,}/g,
];

/**
 * Redact secrets from commit text before it leaves the machine.
 * Patterns are cloned per call so shared/global regex instances stay stateless.
 */
export function redactText(text: string, options: RedactOptions = {}): string {
  const replacement = options.replacement ?? "[REDACTED]";
  const sources = options.disableDefaults
    ? (options.patterns ?? [])
    : [...DEFAULT_REDACT_PATTERNS, ...(options.patterns ?? [])];
  let out = text;
  for (const pattern of sources) {
    out = out.replace(new RegExp(pattern.source, pattern.flags), replacement);
  }
  return out;
}
