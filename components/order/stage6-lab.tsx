'use client';
import { useState } from 'react';
import { runStage6Checks } from '@/services/stage6-checks';
import { IndexedDBERPLedger } from '@/integrations/erp-ledger';
import { DraftRepository } from '@/repositories/draft-repository';
export function Stage6Lab(){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const [report,setReport]=useState<Awaited<ReturnType<typeof runStage6Checks>>>();
 async function run(){setBusy(true);setError('');try{setReport(await runStage6Checks(async()=>{
  const name='atram-stage6-test-'+crypto.randomUUID();const ledger=new IndexedDBERPLedger(name+'-erp'),repo=new DraftRepository(name+'-draft');
  return {ledger,save:async(order,revision)=>(await repo.save(order,revision)).revision,read:async()=>{const [record]=await repo.list();return record?{order:record.order,revision:record.revision}:undefined;},close:async()=>{await ledger.close();await repo.close();indexedDB.deleteDatabase(name+'-erp');indexedDB.deleteDatabase(name+'-draft');}};
 }));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function download(){const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='verificacao-browser-etapa6.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <section className="submission-panel"><h2>Correção, histórico e recuperação</h2><p>Executa a máquina de estados com IndexedDB real, em bancos isolados. Testa 400 corrigível, 401, 429, 500, timeouts, histórico imutável, falha ao arquivar e corrida entre rejeição/criação. Nenhum pedido operacional é modificado.</p><button className="button primary" disabled={busy} onClick={()=>{void run();}}>{busy?'Executando…':'Executar verificações da Etapa 6'}</button><div role="status">{error&&<p className="draft-error">{error}</p>}{report&&<><p><strong>{report.result} · {report.checks} verificações</strong></p><button className="button secondary" onClick={download}>Baixar relatório da Etapa 6</button><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(report,null,2)}</pre></>}</div></section>;
}
