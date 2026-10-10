// Read-only validation of implementation. Outputs stay local; never starts CI/deploy.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = 'test-results/7b4c';
await mkdir(root, { recursive: true });
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
const checks = [['L01', 'check:data'], ['L02', 'check:stage2'], ['L03', 'check:stage3'], ['L04', 'check:stage4'], ['L05', 'check:stage5'], ['L06', 'check:stage6'], ['L07', 'check:stage7b1'], ['L08', 'check:stage7b2:unit'], ['L09', 'typecheck'], ['L10', 'lint'], ['L11', 'build'], ['L12', 'check:backend-boundary'], ['U01-U14-U19-U21', 'check:stage7b4c:unit'], ['U15-U18', 'check:stage7b4c:wire'], ['C01-C29', 'check:stage7b4c']];
const results = [];
async function run(label, args) { let output = ''; const start = new Date().toISOString(), child = spawn('node', args, { env: { ...process.env, NEXT_PUBLIC_BASE_PATH: '/pedidosAtram', NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] }); child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); const { exitCode, signal } = await new Promise(resolve => { child.once('exit', (exitCode, signal) => resolve({ exitCode, signal })); child.once('error', () => resolve({ exitCode: null, signal: 'SPAWN_ERROR' })); }); const log = label + '.log'; await writeFile(root + '/' + log, output); const row = { label, command: ['node', ...args], sha, dirtyAtStart: Boolean(dirty), start, end: new Date().toISOString(), exitCode, signal, log, logHash: createHash('sha256').update(output).digest('hex') }; results.push(row); console.log(label + ': ' + (exitCode === 0 ? 'PASS' : 'FAIL/BLOCKED') + ' (exit ' + exitCode + ')'); }
const npm = execFileSync('which', ['npm'], { encoding: 'utf8' }).trim();
for (const [label, script] of checks)
    await run(label, [npm, 'run', script]);
await run('7B3-unit', ['--test', 'backend/tests/stage7b3/client.test.mjs', 'backend/tests/stage7b3/mappers.test.mjs', 'backend/tests/stage7b3/pagination.test.mjs']);
const original = await readFile('docs/etapa7B3/PERFORMANCE-NODE.json');
try {
    await run('7B3-performance-node', [npm, 'run', 'check:stage7b3:performance']);
    await writeFile(root + '/performance-node.json', await readFile('docs/etapa7B3/PERFORMANCE-NODE.json'));
}
finally {
    await writeFile('docs/etapa7B3/PERFORMANCE-NODE.json', original);
}
await writeFile(root + '/local-checks.json', JSON.stringify({ sha, dirtyAtStart: Boolean(dirty), results, postgresqlCases: 'NOT_EXECUTED_UNLESS_PREFLIGHT_AND_SUITE_SUCCEED', browserHomologation: false, remoteCiExecuted: false }, null, 2));
process.exitCode = results.some(r => r.exitCode !== 0) ? 1 : 0;
