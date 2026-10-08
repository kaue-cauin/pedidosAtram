'use client';
import { useState } from 'react';
import { runSubmissionBrowserChecks } from '@/services/submission-browser-checks';
export function SubmissionLab() {
 const [busy,setBusy]=useState(false); const [report,setReport]=useState<Awaited<ReturnType<typeof runSubmissionBrowserChecks>>>(); const [error,setError]=useState('');
 async function run() { setBusy(true);setError('');try {setReport(await runSubmissionBrowserChecks());}catch(e){setError((e as Error).message);}finally{setBusy(false);} }
 function download() {const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='verificacao-browser-etapa5.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <section className="submission-panel"><h2>Integridade e idempotência com IndexedDB real</h2><p>Sucesso, HTTP 400/401/429/500 e timeout antes/depois da criação. Cada caso recupera o registro salvo, consulta a tentativa e testa 20 chamadas concorrentes em conexões independentes. Pedidos operacionais não são alterados.</p><button className="button primary" disabled={busy} onClick={()=>{void run();}}>{busy?'Executando testes…':'Executar matriz da Etapa 5'}</button><div role="status">{error && <p>{error}</p>}{report && <><p><strong>{report.result} · {report.checks} verificações</strong></p><button className="button secondary" onClick={download}>Baixar relatório da Etapa 5</button><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(report,null,2)}</pre></>}</div></section>;
}
