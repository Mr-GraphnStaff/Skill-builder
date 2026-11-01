/** Native repository choices are private to the public pre-release channel. */
export const PREVIEW_REPOSITORY_KEY = 'prerelease.repositoryUrl';
export const PREVIEW_LOCAL_REPOSITORY_KEY = 'prerelease.localRepositoryPath';
export type NativeRepositorySettings = { repositoryUrl?: string; localRepositoryPath?: string };
type Inspection = { globalValue?: unknown; workspaceValue?: unknown; workspaceFolderValue?: unknown };
export type NativeSettingsReader = {
  inspect<T>(key: string): Inspection | undefined;
  get<T>(key: string): T | undefined;
};
export function isExplicitSetting(settings: NativeSettingsReader, key: string): boolean {
  const value = settings.inspect<unknown>(key);
  return !!value && [value.globalValue, value.workspaceValue, value.workspaceFolderValue].some(item => item !== undefined);
}
export function readNativeRepositorySettings(settings: NativeSettingsReader): NativeRepositorySettings {
  const result: NativeRepositorySettings = {};
  for (const [key, field] of [[PREVIEW_REPOSITORY_KEY, 'repositoryUrl'], [PREVIEW_LOCAL_REPOSITORY_KEY, 'localRepositoryPath']] as const) {
    if (!isExplicitSetting(settings, key)) continue;
    const value = settings.get<unknown>(key);
    if (typeof value !== 'string') throw new Error(`SkillJetty ${field === 'repositoryUrl' ? 'Repository URL' : 'Local Repository Path'} must be text. Open Extension Settings to correct it.`);
    result[field] = value;
  }
  return result;
}
