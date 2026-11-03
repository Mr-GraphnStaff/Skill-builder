import * as fs from 'node:fs';
import * as path from 'node:path';
import { listWorkbenchSkills, type FileDigest, type WorkbenchRelease } from './skill-workbench.js';
import { readSkillIdentity, semanticVersion, compareReleaseVersions, nextReleaseVersion } from './skill-identity.js';
import { suggestReleaseVersion } from './workbench-library.js';
import { readGuidedFile } from './guided-workspace.js';
import { runWorkbenchJob } from './workbench-jobs.js';
import type { GuidedState } from './guided-contract.js';
import { assertWorkbenchPath } from './workbench-boundary.js';
import { existingWorkspaceForPath } from './workspace-selection.js';
import { readPluginReleaseMetadata } from './plugin-release.js';

export type ExportOptions = NonNullable<GuidedState['exportOptions']>;
export type ExportMember = { id: string; name: string; version: string; files: FileDigest[] };
export type ExportPreview = { options: ExportOptions; members: ExportMember[] };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function exportJobBoundary(root: string): { boundaryRoot: string; requireManaged: boolean } {
  const existing = existingWorkspaceForPath(root);
  return { boundaryRoot: root, requireManaged: !existing || path.relative(existing.dataRoot, path.resolve(root)) !== '' };
}

/** Suggest from this plugin's receipts only; do not audit every package to show a default. */
export function suggestPluginVersion(root: string, name: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64 || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(name)) return '1.0.0';
  const folder = assertWorkbenchPath(root, path.join(root, 'plugin-releases', name));
  if (!fs.existsSync(folder)) return '1.0.0';
  const versions = fs.readdirSync(folder).filter(number => semanticVersion.test(number)).sort(compareReleaseVersions);
  const latest = versions.at(-1);
  if (!latest) return '1.0.0';
  const previous = readPluginReleaseMetadata(assertWorkbenchPath(root, path.join(folder, latest)), false, 8 * 1024 * 1024).version;
  let next = nextReleaseVersion(previous);
  while (versions.includes(next)) next = nextReleaseVersion(next);
  return next;
}

export function initialExportOptions(root: string, activeId: string, version: string, mode: ExportOptions['mode'] = 'portable'): ExportOptions {
  const skills = listWorkbenchSkills(root), active = skills.find(item => item.id === activeId);
  if (!active) throw new Error('Choose an active skill.');
  const identity = readSkillIdentity(readGuidedFile(active, 'SKILL.md'));
  return { mode, pluginName: active.name, pluginDescription: identity.description ?? '', pluginVersion: mode === 'portable' ? '1.0.0' : suggestPluginVersion(root, active.name), pluginVersionSource: 'suggested',
    pluginAuthor: '', pluginLicense: '', pluginIcon: '', pluginPrivacyPolicyUrl: '', pluginDocumentationUrl: '', pluginSupportUrl: '', geminiZip: false,
    members: skills.map(skill => ({ id: skill.id, name: skill.name, ...(skill.id === activeId ? { version } : {}), selected: skill.id === activeId })) };
}

export function readExportOptions(root: string, activeId: string, previous: ExportOptions, input: Record<string, unknown>, strict = true): ExportOptions {
  const text = (key: string, fallback = '') => {
    const value = input[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || value.length > 2048 || /[\0\r\n]/.test(value)) throw new Error(`Invalid ${key}.`);
    return value.trim();
  };
  const mode = text('exportMode', previous.mode);
  if (!['portable', 'plugin', 'both'].includes(mode)) throw new Error('Choose Portable skill, Claude plugin, or Both.');
  const ids = input.pluginMembers ?? previous.members.filter(item => item.selected).map(item => item.id);
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('Select distinct skills from this workbench.');
  const skills = listWorkbenchSkills(root);
  if (!ids.includes(activeId) || ids.some(id => !skills.some(skill => skill.id === id))) throw new Error('Keep the current skill selected and choose other existing drafts in this workbench.');
  const geminiZip = input.geminiZip ?? previous.geminiZip;
  if (typeof geminiZip !== 'boolean') throw new Error('Choose whether to export a Gemini ZIP.');
  const pluginName = text('pluginName', previous.pluginName), requestedVersion = text('pluginVersion', previous.pluginVersion);
  const suggested = previous.pluginVersionSource === 'suggested' && requestedVersion === previous.pluginVersion;
  const pluginVersion = suggested && (pluginName !== previous.pluginName || (previous.mode === 'portable' && mode !== 'portable')) ? suggestPluginVersion(root, pluginName) : requestedVersion;
  const options: ExportOptions = { mode: mode as ExportOptions['mode'], pluginName,
    pluginDescription: text('pluginDescription', previous.pluginDescription), pluginVersion, pluginVersionSource: suggested ? 'suggested' : 'explicit',
    pluginAuthor: text('pluginAuthor', previous.pluginAuthor), pluginLicense: text('pluginLicense', previous.pluginLicense), geminiZip,
    pluginIcon: text('pluginIcon', previous.pluginIcon), pluginPrivacyPolicyUrl: text('pluginPrivacyPolicyUrl', previous.pluginPrivacyPolicyUrl),
    pluginDocumentationUrl: text('pluginDocumentationUrl', previous.pluginDocumentationUrl), pluginSupportUrl: text('pluginSupportUrl', previous.pluginSupportUrl),
    members: skills.map(skill => ({ id: skill.id, name: skill.name, version: previous.members.find(item => item.id === skill.id)?.version, selected: ids.includes(skill.id) })) };
  if (strict && mode !== 'portable') {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.pluginName) || options.pluginName.length > 64 || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(options.pluginName)) throw new Error('Use a safe kebab-case plugin name of at most 64 characters.');
    if (!semanticVersion.test(options.pluginVersion) || !options.pluginDescription) throw new Error('Enter a plugin version (for example 1.0.0) and description.');
  }
  return options;
}

export async function captureExportPreview(root: string, activeId: string, options: ExportOptions, activeVersion: string): Promise<ExportPreview> {
  const members: ExportMember[] = [];
  const skills = listWorkbenchSkills(root);
  for (const choice of options.members.filter(item => item.selected && (options.mode !== 'portable' || item.id === activeId))) {
    const skill = skills.find(item => item.id === choice.id);
    if (!skill) throw new Error('A selected skill is no longer an active draft. Review the bundle again.');
    const snapshot = await runWorkbenchJob({ kind: 'snapshot', root, skill }, exportJobBoundary(root));
    const matching = snapshot.releases.find(item => {
      const manifest = JSON.parse(fs.readFileSync(path.join(item.directory, 'release.json'), 'utf8'));
      return same(manifest.files, snapshot.validation.files);
    });
    const version = choice.id === activeId ? activeVersion : matching?.version ?? suggestReleaseVersion(skill, snapshot.releases.map(item => item.version));
    members.push({ id: choice.id, name: skill.name, version, files: snapshot.validation.files });
  }
  return { options: { ...options, members: options.members.map(choice => ({ ...choice, version: members.find(item => item.id === choice.id)?.version ?? choice.version })) }, members };
}

export function exportCompatibility(preview: ExportPreview): NonNullable<NonNullable<GuidedState['publish']>['compatibility']> {
  const reports: NonNullable<NonNullable<GuidedState['publish']>['compatibility']> = [];
  if (preview.options.mode !== 'portable') {
    const issues = preview.members.flatMap(member => member.files.filter(file => file.size >= 5 * 1024 * 1024)
      .map(file => `Directory blocker: skills/${member.name}/${file.path} is ${(file.size / 1024 / 1024).toFixed(2)} MiB; the public directory requires files below 5 MiB. Original bytes will be preserved.`));
    if (!preview.options.pluginLicense) issues.push('Directory blocker: supply authorized licensing terms or a root LICENSE. Private plugin packaging remains available.');
    if (!preview.options.pluginIcon) issues.push('Directory metadata: select an icon path inside the plugin (for example ./skills/name/assets/logo.png).');
    issues.push('Public-directory checks are separate from private organization export. Portal validation, name availability, policy review and security scanning are required and have not run. Review data handling, launcher versions and privacy policy applicability manually.');
    reports.push({ target: 'Claude public directory (local preflight)', tested: false, issues });
  }
  if (!preview.options.geminiZip) return reports;
  const supported = new Set(['.docx','.pdf','.rtf','.tex','.log','.md','.rst','.txt','.markdown','.odt','.csv','.ods','.xlsx','.odp','.pptx','.jpg','.png','.svg','.gif','.heic','.ico','.jpeg','.tif','.webp','.py','.sh','.ipynb','.js','.css','.html','.htm','.env','.json','.toml','.xml','.yaml','.yml']);
  const issues = preview.members.flatMap(member => member.files.filter(file => !file.path.endsWith('/') && !supported.has(path.basename(file.path).toLowerCase() === '.env' ? '.env' : path.extname(file.path).toLowerCase()))
    .map(file => `${member.name}: ${file.path} is not a documented Gemini App file type.`));
  for (const member of preview.members) if (member.files.reduce((total, file) => total + file.size, 0) > 100 * 1024 * 1024) issues.push(`${member.name}: exceeds the Gemini App 100 MB limit.`);
  issues.push('Gemini App export has not been tested in your account. Scripts cannot make external website requests; Workspace Studio, Cloud Enterprise and CLI are separate targets.');
  return [...reports, { target: 'Gemini App', tested: false, issues }];
}

/** Capture all requested artifacts before any caller can upload one. */
export async function prepareExportPlan(root: string, activeId: string, reviewed: ExportPreview, version: string, changelog: string,
  repository?: string): Promise<{ submissions: WorkbenchRelease[]; artifacts: NonNullable<NonNullable<GuidedState['receipt']>['artifacts']>; compatibility: ReturnType<typeof exportCompatibility> }> {
  const fresh = await captureExportPreview(root, activeId, reviewed.options, version);
  if (!same(fresh.members, reviewed.members)) throw new Error('A selected skill or its saved versions changed. Review a fresh export summary before submitting. Nothing was uploaded.');
  const portable: WorkbenchRelease[] = [];
  const artifacts: NonNullable<NonNullable<GuidedState['receipt']>['artifacts']> = [];
  let compatibility = exportCompatibility(fresh);
  for (const member of reviewed.members) {
    const releases = await runWorkbenchJob({ kind: 'library', root, skillName: member.name }, exportJobBoundary(root));
    const existing = releases.find(item => item.version === member.version);
    let release = existing ? await runWorkbenchJob({ kind: 'verifyRelease', directory: existing.directory }, exportJobBoundary(root)) : undefined;
    const notes = member.id === activeId ? changelog : `Member snapshot ${member.name} ${member.version} for plugin ${reviewed.options.pluginName}.`;
    if (release && !same(release.manifest.files, member.files)) throw new Error(`Saved ${member.name} ${member.version} has different bytes. Choose a new version or explicitly prepare that skill first.`);
    if (!release) release = await runWorkbenchJob({ kind: 'prepareRelease', root, id: member.id, version: member.version, changelog: notes }, exportJobBoundary(root));
    if (!same(release.manifest.files, member.files)) throw new Error('The draft changed during packaging. Prepared files are retained; nothing was uploaded.');
    portable.push(release);
    if (reviewed.options.mode !== 'plugin') artifacts.push({ label: `Portable skill: ${member.name} ${member.version}`, kind: 'portable', version: member.version, path: release.packagePath, directory: release.directory, status: 'prepared' });
  }
  const submissions = reviewed.options.mode !== 'plugin' ? [...portable] : [];
  if (reviewed.options.mode !== 'portable') {
    const options = reviewed.options;
    const plugin = await runWorkbenchJob({ kind: 'preparePlugin', root, options: { name: options.pluginName, description: options.pluginDescription,
      version: options.pluginVersion, author: options.pluginAuthor || undefined, license: options.pluginLicense || undefined, repository,
      icon: options.pluginIcon || undefined, privacyPolicyUrl: options.pluginPrivacyPolicyUrl || undefined,
      documentationUrl: options.pluginDocumentationUrl || undefined, supportUrl: options.pluginSupportUrl || undefined,
      members: portable.map(release => ({ directory: release.directory })), changelog } }, exportJobBoundary(root));
    submissions.push(plugin);
    artifacts.push({ label: `Claude plugin: ${plugin.skillName} ${plugin.version}`, kind: 'plugin', version: plugin.version, path: plugin.packagePath, directory: plugin.directory, status: 'prepared' });
    const readiness = await runWorkbenchJob({ kind: 'pluginReadiness', directory: plugin.directory }, exportJobBoundary(root));
    compatibility = compatibility.filter(report => !report.target.startsWith('Claude public directory'));
    compatibility.push({ target: 'Claude public directory (local preflight)', tested: false,
      issues: readiness.checks.map(check => `${check.result.toUpperCase()}: ${check.message}${check.paths?.length ? ` (${check.paths.join(', ')})` : ''}`) });
  }
  if (reviewed.options.geminiZip) for (const release of portable) {
    const gemini = await runWorkbenchJob({ kind: 'prepareGemini', root, directory: release.directory }, exportJobBoundary(root));
    artifacts.push({ label: `Gemini App ZIP: ${release.skillName} ${release.version}`, kind: 'gemini', version: release.version, path: gemini.packagePath, directory: gemini.directory, status: 'prepared' });
  }
  // Reverify every submission after all other local packaging has completed.
  for (const release of submissions) await runWorkbenchJob({ kind: 'verifyExport', directory: release.directory }, exportJobBoundary(root));
  return { submissions, artifacts, compatibility };
}
