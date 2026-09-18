'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let count = 0;
let failures = 0;
for (const dir of ['', 'api', 'functions', 'scripts', 'scripts/emulator']) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    if (!/\.(js|cjs)$/.test(name)) continue;
    const file = path.join(root, dir, name);
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    count++;
    if (result.status !== 0) { failures++; console.error(result.stderr); }
  }
}
console.log(`${count} JavaScript files checked; ${failures} syntax failures.`);
process.exitCode = failures ? 1 : 0;
