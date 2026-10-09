import { readConfig } from '../backend/config/env.ts';
import { database } from '../backend/db/client.ts';
import { ready } from '../backend/db/readiness.ts';
import { AuthService } from '../backend/auth/service.ts';
import { TinyService } from '../backend/integrations/tiny/service.ts';
import { createBackendServer } from '../backend/server/http.ts';
import { BackendError } from '../backend/security/errors.ts';
import { AccountBudget } from '../backend/catalog/budget.ts';
import { CatalogRepository } from '../backend/catalog/repository.ts';
import { CatalogController } from '../backend/catalog/controller.ts';
let db,server;
try {
  const config=readConfig(process.env);db=database(config.databaseUrl);
  await ready(db);
  const auth=new AuthService(db,config.sessionSeconds),tiny=new TinyService(db,config,fetch,10000,new AccountBudget(db,config.sync?.intervalMs));
  server=createBackendServer(config,auth,tiny,e=>console.error(JSON.stringify(e)),new CatalogController(new CatalogRepository(db),config,tiny));
  server.on('error',()=>{console.error('BACKEND_START_FAILED');process.exitCode=1;void db.close();});
  server.listen(config.port,config.host,()=>console.log('BACKEND_STARTED'));
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
    server.close(()=>{void db.close();});setTimeout(()=>{server.closeAllConnections();void db.close();},10000).unref();
  });
}catch(e){console.error(e instanceof BackendError?e.code:'BACKEND_START_FAILED');process.exitCode=1;await db?.close();}
