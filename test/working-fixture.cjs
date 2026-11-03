const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Fixtures remain inside this checkout's excluded working area even in CI.
exports.workingFixture = function (name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid fixture name');
  const root = path.resolve(__dirname, '..'), working = path.join(root, 'working');
  const base = path.resolve(process.env.AGENT_WORKING_DIR || path.join(working, 'test-fixtures'));
  const relative = path.relative(working, base);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Test scratch must stay inside working/');
  const target = path.join(base, name);
  for (let current = target; ; current = path.dirname(current)) {
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Test scratch cannot use links or junctions'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (path.dirname(current) === current) break;
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  const destination = path.relative(root, target).replace(/\\/g, '/');
  execFileSync('git', ['--no-optional-locks', '-C', root, 'check-ignore', '--quiet', '--', destination], { env, windowsHide: true });
  if (execFileSync('git', ['--no-optional-locks', '-C', root, 'ls-files', '-z', '--', destination], { env, windowsHide: true }).length) throw new Error('Tracked files cannot be used as test scratch');
  return target;
};
