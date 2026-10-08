import { readConfig, POCError } from '../integrations/tiny-poc/config.ts';
import { createPOCServer } from '../integrations/tiny-poc/server.ts';
try {
  const config = readConfig(process.env);
  const server = createPOCServer(config);
  server.on('error', () => { console.error('POC_START_FAILED'); process.exitCode = 1; server.close(); });
  server.listen(Number(new URL(config.redirectUri).port), '127.0.0.1', () => {
    console.log('POC local de leitura iniciada em 127.0.0.1. Sessão máxima: 30 minutos.');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
} catch (error) {
  console.error(error instanceof POCError ? error.kind : 'POC_START_FAILED'); process.exitCode = 1;
}
