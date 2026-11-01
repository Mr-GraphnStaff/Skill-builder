const test = require('node:test');
const assert = require('node:assert/strict');
const { readNativeRepositorySettings, PREVIEW_REPOSITORY_KEY: remoteKey, PREVIEW_LOCAL_REPOSITORY_KEY: localKey } = require('../out/native-settings.js');
function reader(values, scope = 'workspaceValue') {
  return { inspect: key => Object.hasOwn(values, key) ? { [scope]: values[key] } : { defaultValue: '' }, get: key => values[key] ?? '' };
}
test('unset native repository fields preserve the distinction from an explicit disconnect', () => {
  assert.deepEqual(readNativeRepositorySettings(reader({})), {});
  assert.deepEqual(readNativeRepositorySettings(reader({ [remoteKey]: '', [localKey]: '' })), { repositoryUrl: '', localRepositoryPath: '' });
});
test('native reader uses effective values and preserves channel-specific key names', () => {
  assert.match(remoteKey, /^prerelease\./); assert.match(localKey, /^prerelease\./);
  const values = { [remoteKey]: 'https://github.com/example/skills', [localKey]: 'C:/AI-Work/Skills-Repository', repositoryUrl: 'https://github.com/unrelated/stable' };
  assert.deepEqual(readNativeRepositorySettings(reader(values)), { repositoryUrl: values[remoteKey], localRepositoryPath: values[localKey] });
  assert.deepEqual(readNativeRepositorySettings(reader(values, 'globalValue')), { repositoryUrl: values[remoteKey], localRepositoryPath: values[localKey] });
});
test('invalid explicit native values cannot become an unset fallback', () => {
  for (const value of [1, false, [], {}]) {
    assert.throws(() => readNativeRepositorySettings(reader({ [remoteKey]: value })), /must be text/);
    assert.throws(() => readNativeRepositorySettings(reader({ [localKey]: value })), /must be text/);
  }
});
