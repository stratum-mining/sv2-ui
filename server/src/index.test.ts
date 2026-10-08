import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('CORS middleware does not allow arbitrary cross-origin requests', () => {
  const source = readFileSync(path.join(__dirname, 'index.ts'), 'utf8');
  assert.doesNotMatch(
    source,
    /app\.use\(\s*cors\(\s*\)\s*\)/,
    'index.ts mounts cors() with no options, which reflects arbitrary ' +
      'request Origins and enables cross-origin state-mutating requests ' +
      'to the unauthenticated management API.',
  );
});

test('every mutating control route sits behind the session middleware', () => {
  const source = readFileSync(path.join(__dirname, 'index.ts'), 'utf8');
  assert.match(source, /Authentication required/);
  assert.match(source, /sessions\.isValid\(getSessionToken\(req\)\)/);
});

test('a factory reset removes the Telegram pairing', () => {
  const source = readFileSync(path.join(__dirname, 'index.ts'), 'utf8');
  const handlerStart = source.indexOf("app.post('/api/reset'");
  const resetHandler = source.slice(handlerStart, source.indexOf('sessions.destroyAll()', handlerStart));
  assert.match(
    resetHandler,
    /telegramService\.disconnect\(\)/,
    'A reset that leaves telegram.json keeps the previous owner paired, so ' +
      'their chat receives alerts about the next setup.',
  );
});
