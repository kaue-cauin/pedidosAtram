import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readConfig } from '../backend/config/env.ts';
import { database } from '../backend/db/client.ts';
import { AuthService } from '../backend/auth/service.ts';
import { BackendError } from '../backend/security/errors.ts';
async function hidden(label) {
  if(!stdin.isTTY || !stdin.setRawMode)throw new BackendError('SECURE_TERMINAL_REQUIRED');
  stdout.write(label);stdin.setRawMode(true);stdin.resume();
  return new Promise((resolve,reject)=>{
    let value='';
    const finish=(err)=>{stdin.off('data',receive);stdin.setRawMode(false);stdin.pause();stdout.write('\n');if(err)reject(err);else resolve(value);};
    const receive=(bytes)=>{for(const char of bytes.toString('utf8')){
      if(char==='\u0003'){finish(new BackendError('CANCELLED'));return;}
      if(char==='\r'||char==='\n'){finish();return;}
      if(char==='\u007f'||char==='\b')value=value.slice(0,-1);
      else if(char>=' ')value+=char;
      if(value.length>256){finish(new BackendError('PASSWORD_POLICY'));return;}
    }};stdin.on('data',receive);
  });
}
let db;
try {
  if(process.argv[2]!=='bootstrap')throw new BackendError('USE_BOOTSTRAP');
  const config=readConfig(process.env);db=database(config.databaseUrl);const auth=new AuthService(db,config.sessionSeconds);
  const rl=createInterface({input:stdin,output:stdout});
  const name=await rl.question('Organização: '),login=await rl.question('Login do primeiro administrador: ');rl.close();
  const password=await hidden('Senha (mínimo 12 caracteres; entrada oculta): '),confirmation=await hidden('Repita a senha: ');
  if(password!==confirmation)throw new BackendError('PASSWORD_MISMATCH');
  const created=await auth.bootstrap(name,login,password);console.log('ADMIN_CREATED organizationId='+created.organizationId);
} catch(e){console.error(e instanceof BackendError?e.code:'ADMIN_OPERATION_FAILED');process.exitCode=1;}finally{await db?.close();}
