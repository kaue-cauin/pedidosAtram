import { readConfig } from '../backend/config/env.ts';
import { database } from '../backend/db/client.ts';
import { AuthService } from '../backend/auth/service.ts';
import { TinyService } from '../backend/integrations/tiny/service.ts';
import { createBackendServer } from '../backend/server/http.ts';
import { BackendError } from '../backend/security/errors.ts';
let db,server;
try {
  const config=readConfig(process.env);db=database(config.databaseUrl);
  await db.client`SELECT id FROM organizations LIMIT 1`;
  const auth=new AuthService(db,config.sessionSeconds),tiny=new TinyService(db,config);
  server=createBackendServer(config,auth,tiny,e=>console.error(JSON.stringify(e)));
  server.on('error',()=>{console.error('BACKEND_START_FAILED');process.exitCode=1;void db.close();});
  server.listen(config.port,config.host,()=>console.log('BACKEND_STARTED'));
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
    server.close(()=>{void db.close();});setTimeout(()=>{server.closeAllConnections();void db.close();},10000).unref();
  });
}catch(e){console.error(e instanceof BackendError?e.code:'BACKEND_START_FAILED');process.exitCode=1;await db?.close();}
