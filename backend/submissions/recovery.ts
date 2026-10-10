import { readFile } from 'node:fs/promises';
import { fail } from '../security/errors.ts';
// External to PostgreSQL, fail closed. Restore runbook stops all clients before activating hold.
// No method here releases the gate: laboratory controller owns the file, not the runtime role.
export class RecoveryGate {
  readonly path:string; readonly environmentId:string; constructor(path:string,environmentId:string) {this.path=path;this.environmentId=environmentId;}
  async assertOpen() {
    try {
      const gate=JSON.parse(await readFile(this.path,'utf8'));
      if(gate.version!==1||gate.environmentId!==this.environmentId||gate.state!=='NORMAL'||typeof gate.epoch!=='string'||!gate.epoch||gate.windowStart!==null||gate.windowEnd!==null||gate.oldExecutorsStopped!==true) throw Error();
      return gate.epoch as string;
    } catch { return fail('RECOVERY_HOLD',503); }
  }
  async assertSame(epoch:string) {if(await this.assertOpen()!==epoch)fail('RECOVERY_HOLD',503);}
}
