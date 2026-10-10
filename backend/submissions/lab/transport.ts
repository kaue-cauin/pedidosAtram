import net from 'node:net';
import { bindingSchema, publicBinding, type DispatchBinding, type Observation, type SyntheticTransport } from './contracts.ts';
// Test-only local Unix socket. No URL/headers/provider from an order, HTTP redirect,
// retry middleware, connection fallback or resume. Timeout is NOT lease expiration.
export class UnixSyntheticTransport implements SyntheticTransport {
    readonly path: string;
    readonly timeoutMs: number;
    readonly lateWindowMs: number;
    readonly onInvoke?: () => void;
    constructor(path: string, timeoutMs = 1000, lateWindowMs = 3000, onInvoke?: () => void) {
        if (!path.startsWith('/') || Buffer.byteLength(path) > 100 || timeoutMs < 1 || lateWindowMs < timeoutMs || lateWindowMs > 15000)
            throw Error('LAB_TRANSPORT_CONFIG');
        this.path = path;
        this.timeoutMs = timeoutMs;
        this.lateWindowMs = lateWindowMs;
        this.onInvoke = onInvoke;
    }
    async *observe(b: DispatchBinding): AsyncIterable<Observation> {
        bindingSchema.parse(publicBinding(b));
        const queue: Observation[] = [];
        let wake: () => void = () => { }, ended = false, buffer = '', uncertain = false, received = false;
        const push = (o: Observation) => { queue.push(o); wake(); };
        const fail = (reason: 'TRANSPORT_TIMEOUT' | 'TRANSPORT_CLOSED' | 'INVALID_RESPONSE') => { if (!uncertain) {
            uncertain = true;
            push({ type: 'uncertain', reason });
        } };
        this.onInvoke?.();
        const socket = net.createConnection({ path: this.path });
        const deadline = setTimeout(() => fail('TRANSPORT_TIMEOUT'), this.timeoutMs);
        // Keep the same socket briefly for a direct late response, never send again.
        const final = setTimeout(() => { fail('TRANSPORT_CLOSED'); socket.destroy(); }, this.lateWindowMs);
        socket.once('connect', () => socket.write(JSON.stringify({ binding: publicBinding(b), request: b.request }) + '\n'));
        socket.on('data', chunk => {
            if (received)
                return;
            buffer += chunk.toString('utf8');
            if (Buffer.byteLength(buffer) > 65536) {
                fail('INVALID_RESPONSE');
                socket.destroy();
                return;
            }
            const index = buffer.indexOf('\n');
            if (index < 0)
                return;
            received = true;
            clearTimeout(deadline);
            clearTimeout(final);
            try {
                push({ type: 'response', response: JSON.parse(buffer.slice(0, index)) });
            }
            catch {
                fail('INVALID_RESPONSE');
            }
            socket.destroy(); // Receipt is complete; no unbounded half-open peer wait.
        });
        socket.on('error', () => fail('TRANSPORT_CLOSED'));
        socket.on('close', () => { if (!received && !uncertain)
            fail('TRANSPORT_CLOSED'); ended = true; wake(); });
        try {
            while (!ended || queue.length) {
                if (queue.length) {
                    yield queue.shift()!;
                    continue;
                }
                await new Promise<void>(resolve => { wake = resolve; });
            }
        }
        finally {
            clearTimeout(deadline);
            clearTimeout(final);
            socket.destroy();
        }
    }
}
