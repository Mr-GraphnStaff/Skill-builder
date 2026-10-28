const yaml: { load(value: string): unknown } = require('js-yaml');

export type VersionDeclaration = { source: 'metadata.version' | 'version'; value: string; valid: boolean };
export type SkillIdentity = {
  name?: string;
  description?: string;
  declaredVersion?: string;
  versionSource?: VersionDeclaration['source'];
  declarations: VersionDeclaration[];
  conflict: boolean;
  warnings: string[];
};

export const semanticVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function mapping(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Read declarations, never instructions or incidental version-like prose. */
export function readSkillIdentity(manifest: string): SkillIdentity {
  const result: SkillIdentity = { declarations: [], conflict: false, warnings: [] };
  const block = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(manifest);
  if (!block) {
    result.warnings.push('SKILL.md has no readable YAML frontmatter. Checks will explain what needs attention.');
    return result;
  }
  let values: Record<string, unknown> | undefined;
  try { values = mapping(yaml.load(block[1])); }
  catch { result.warnings.push('SKILL.md frontmatter could not be read. Checks will explain what needs attention.'); return result; }
  if (!values) { result.warnings.push('SKILL.md frontmatter must be a mapping.'); return result; }
  if (typeof values.name === 'string') result.name = values.name;
  if (typeof values.description === 'string') result.description = values.description;
  const metadata = mapping(values.metadata);
  for (const [source, container, key] of [
    ['metadata.version', metadata, 'version'], ['version', values, 'version']
  ] as const) {
    if (!container || !Object.prototype.hasOwnProperty.call(container, key)) continue;
    const value = container[key];
    const valid = typeof value === 'string' && semanticVersion.test(value);
    result.declarations.push({ source, value: typeof value === 'string' ? value : String(value), valid });
    if (!valid) result.warnings.push(`${source} is not a semantic version such as 2.13.0. SkillJetty will manage the release number; the original declaration is preserved.`);
  }
  const valid = result.declarations.filter(item => item.valid);
  result.conflict = new Set(result.declarations.map(item => item.value)).size > 1;
  if (result.conflict) result.warnings.push('The version declarations in SKILL.md disagree. Review the declarations before sharing; SkillJetty has not changed either one.');
  else if (valid.length) { result.declaredVersion = valid[0].value; result.versionSource = valid[0].source; }
  return result;
}

/** SemVer precedence with arbitrary-size integer support; build labels do not affect precedence. */
export function compareReleaseVersions(left: string, right: string): number {
  if (!semanticVersion.test(left) || !semanticVersion.test(right)) throw new Error('Cannot compare invalid semantic versions.');
  const split = (value: string) => {
    const [core, ...prerelease] = value.split('+')[0].split('-');
    return { core: core.split('.').map(BigInt), prerelease: prerelease.join('-').split('.').filter(Boolean) };
  };
  const a = split(left), b = split(right);
  for (let index = 0; index < 3; index++) if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  if (!a.prerelease.length || !b.prerelease.length) return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const x = a.prerelease[index], y = b.prerelease[index];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const numericX = /^\d+$/.test(x), numericY = /^\d+$/.test(y);
    if (numericX && numericY) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (numericX !== numericY) return numericX ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

/** Continue a prerelease series, or increment the stable patch; never silently promote a prerelease. */
export function nextReleaseVersion(version: string): string {
  if (!semanticVersion.test(version)) throw new Error('Cannot increment an invalid semantic version.');
  const withoutBuild = version.split('+')[0];
  const dash = withoutBuild.indexOf('-');
  if (dash !== -1) {
    const core = withoutBuild.slice(0, dash), parts = withoutBuild.slice(dash + 1).split('.');
    const last = parts.at(-1)!;
    if (/^\d+$/.test(last)) parts[parts.length - 1] = String(BigInt(last) + 1n);
    else parts.push('1');
    return `${core}-${parts.join('.')}`;
  }
  const parts = withoutBuild.split('.');
  return `${parts[0]}.${parts[1]}.${BigInt(parts[2]) + 1n}`;
}
