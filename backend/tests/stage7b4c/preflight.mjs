import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { checkInfrastructure } from './control.mjs';
await mkdir('test-results/7b4c', { recursive: true });
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
try {
    const infrastructure = await checkInfrastructure();
    await writeFile('test-results/7b4c/preflight.json', JSON.stringify({ sha, status: 'READY', ...infrastructure }, null, 2));
    console.log('7B.4C infrastructure verified: two independent test PostgreSQL instances and disposable interruption controls');
}
catch {
    await writeFile('test-results/7b4c/preflight.json', JSON.stringify({ sha, status: 'BLOCKED', reason: 'REAL_POSTGRESQL_AND_APPROVED_INTERRUPTION_CONTROLS_UNAVAILABLE', cases: Array.from({ length: 29 }, (_, i) => ({ id: 'C' + String(i + 1).padStart(2, '0'), status: 'NOT_EXECUTED', counts: null })) }, null, 2));
    console.error('7B.4C BLOCKED: real PostgreSQL, pg_dump/pg_restore and approved disposable Docker controls required. C01–C29 NOT EXECUTED.');
    process.exitCode = 1;
}
