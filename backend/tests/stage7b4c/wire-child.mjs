import '../stage7b4b/no-network.mjs';
import { UnixSyntheticTransport } from '../../submissions/lab/transport.ts';
const c = JSON.parse(process.env.WIRE_CHILD_CONFIG);
process.on('message', async (m) => { if (!m.start)
    return; try {
    for await (const observation of new UnixSyntheticTransport(c.path, c.timeoutMs, c.lateWindowMs, () => process.send({ invoked: true })).observe(c.binding))
        process.send({ observation });
    process.send({ result: true });
}
finally {
    process.disconnect();
} });
process.send({ ready: true, privilegedEnvironmentPresent: Boolean(process.env.BACKEND_TEST_DATABASE_URL || process.env.SIM_TEST_DATABASE_URL) });
