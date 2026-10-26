import * as https from 'node:https';
import type { GitHubRunner } from './github-review.js';

/** VS Code owns authentication. Tokens are request-local and never persisted.
 * The injectable request factory is an internal test boundary, not user config. */
export function createGitHubSessionRunner(getToken: () => Promise<string>, requestFactory: typeof https.request = https.request, timeoutMs = 30_000): GitHubRunner {
  return async request => {
    if (!(request.endpoint === 'user' || request.endpoint.startsWith('repos/')) || request.endpoint.startsWith('/')
      || request.endpoint.includes('://') || /[\x00-\x20#]/.test(request.endpoint) || !['GET', 'POST'].includes(request.method)) throw new Error('Invalid GitHub API endpoint.');
    let token: string;
    try { token = await getToken(); } catch { throw new Error('GitHub sign-in was cancelled or unavailable. Use Connect / switch GitHub; previous uploads and PRs are retained.'); }
    if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new Error('GitHub authentication is unavailable. Use Connect / switch GitHub.');
    const body = request.body === undefined ? undefined : JSON.stringify(request.body);
    return new Promise((resolve, reject) => {
      let settled = false; let responseStream: import('node:http').IncomingMessage | undefined;
      let req: import('node:http').ClientRequest | undefined;
      const finish = (error?: Error, value?: unknown) => { if (settled) return; settled = true; clearTimeout(deadline); if (error) { responseStream?.destroy(); req?.destroy(); reject(error); } else resolve(value); };
      const deadline = setTimeout(() => finish(new Error('GitHub request timed out.')), Math.max(1, Math.min(timeoutMs, 30_000)));
      try { req = requestFactory({ protocol: 'https:', hostname: 'api.github.com', port: 443, rejectUnauthorized: true, path: `/${request.endpoint}`, method: request.method,
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'SkillJetty', ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }) } }, response => {
        responseStream = response;
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) { finish(new Error(`GitHub API HTTP ${status}${status >= 300 && status < 400 ? ': redirect refused' : ''}`)); return; }
        const chunks: Buffer[] = []; let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          if (settled) return;
          bytes += chunk.length;
          if (bytes > 8 * 1024 * 1024) { finish(new Error('GitHub metadata exceeded the response limit.')); return; }
          chunks.push(Buffer.from(chunk));
        });
        response.on('error', () => finish(new Error('GitHub network response failed.')));
        response.on('end', () => {
          if (settled) return;
          try { const text = Buffer.concat(chunks).toString('utf8'); finish(undefined, text ? JSON.parse(text) : null); }
          catch { finish(new Error('GitHub returned invalid JSON metadata.')); }
        });
      });
      if (settled) { req.destroy(); return; }
      req.on('error', () => finish(new Error('GitHub network request failed.')));
      req.end(body);
      } catch { finish(new Error('GitHub network request could not start.')); }
    });
  };
}
