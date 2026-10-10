import http from 'node:http';
import https from 'node:https';
// Laboratory suite has no HTTP transport. PostgreSQL/pg_dump use loopback TCP separately.
function denied(){throw new Error('EXTERNAL_HTTP_FORBIDDEN_IN_7B4B');}
globalThis.fetch=denied;http.request=denied;http.get=denied;https.request=denied;https.get=denied;
