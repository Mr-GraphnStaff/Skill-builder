/** Shared credential checks. Never include matched credential text in a finding. */
export const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string, string]> = [
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, 'aws-access-key', 'Possible AWS access key detected.'],
  [/\b(?:api[_-]?key|(?:access[_-]?|auth[_-]?)?token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/i, 'possible-secret', 'Possible hardcoded credential detected.'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, 'api-secret-key', 'Possible API secret key detected.'],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/, 'github-token', 'Possible GitHub token detected.'],
  [/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/, 'private-key', 'Possible private key detected.']
];
