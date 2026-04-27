import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverSource = fs.readFileSync(
  path.join(__dirname, '..', 'server.js'),
  'utf8'
);

test('server session config seeds low-latency standby defaults', () => {
  assert.match(serverSource, /type: 'server_vad'/);
  assert.match(serverSource, /threshold: 0\.88/);
  assert.match(serverSource, /silence_duration_ms: 550/);
  assert.match(serverSource, /create_response: false/);
  assert.match(serverSource, /interrupt_response: true/);
  assert.match(serverSource, /max_output_tokens: 180/);
  assert.match(serverSource, /speed: 1\.1/);
  assert.match(serverSource, /noise_reduction:\s*\{\s*type: 'far_field'/);
});
