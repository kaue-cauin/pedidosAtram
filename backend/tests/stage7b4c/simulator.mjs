import '../stage7b4b/no-network.mjs';
import net from 'node:net';
import { SimulatorStore } from './simulator-store.ts';
import {MAX_WIRE_BYTES} from '../../submissions/lab/contracts.ts';
const config = JSON.parse(process.env.SIM_WORKER_CONFIG), store = new SimulatorStore(config.url);
const paused = new Map();
let sequence = 0;
async function barrier(name, data = {}) { const n = ++sequence; process.send?.({ barrier: name, n, ...data }); if (config.pause === name)
    await new Promise(resolve => paused.set(n, resolve)); }
process.on('message', m => { if (m.release)
    paused.get(m.release)?.(); });
const server = net.createServer(socket => {
    let buffer = '', handled = false;
    socket.on('error', () => { });
    socket.on('data', async (chunk) => {
        if (handled)
            return;
        buffer += chunk.toString();
        if (Buffer.byteLength(buffer) > MAX_WIRE_BYTES) {
            socket.destroy();
            return;
        }
        const i = buffer.indexOf('\n');
        if (i < 0)
            return;
        handled = true;
        try {
            const { binding, request } = JSON.parse(buffer.slice(0, i));
            await barrier('SIM_BEFORE_RECEIVE');
            await store.receive(binding, request);
            await barrier('SIM_RECEIVED', { executionId: binding.executionId });
            if (config.profile === '500-empty') {
                socket.end(JSON.stringify({ binding, status: 500, kind: 'INCONCLUSIVE' }) + '\n');
                return;
            }
            const response = await store.effect(binding, request, config.idempotent === true, config.profile === 'reject');
            await barrier('SIM_EFFECT_COMMITTED', { externalId: response.externalId ?? null });
            if (config.profile === 'lost') {
                socket.destroy();
                return;
            }
            if (config.profile === 'delay')
                await new Promise(resolve => setTimeout(resolve, config.delayMs ?? 200));
            if (config.profile === '500-effect') {
                response.status = 500;
                response.kind = 'INCONCLUSIVE';
                delete response.externalId;
            }
            if (config.profile === 'invalid') {
                socket.end('{bad\n');
                return;
            }
            if (config.profile === '200-no-id') {
                delete response.externalId;
            }
            socket.end(JSON.stringify(response) + '\n');
        }
        catch {
            socket.destroy();
            process.send?.({ error: 'SIM_OPERATION_FAILED' });
        }
    });
});
server.listen(config.path, () => process.send?.({ ready: true }));
process.on('SIGTERM', () => { server.close(); void store.close().finally(() => process.exit(0)); });
