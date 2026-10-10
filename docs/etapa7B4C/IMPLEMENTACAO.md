# Etapa 7B.4C — execução simulada local

Baseline autorizada: `f246d1b1f002b9b9094dd5cc937eefd19bd90d5a`.
Branch local exclusiva: `feat/etapa-7b4c-execucao-simulada`.
A comparação GitHub baseline/main em 10/10/2026 retornou `identical`, zero
commits/arquivos. A proposta aprovada está preservada em
`PROPOSTA-ETAPA-7B4C.md`; seu status histórico “não implementada” descreve
somente a preparação anterior. O contrato está copiado fielmente em
`../etapa7B4A/CONTRATOS-ETAPA-7B4A.md`, com origem/hash em `ORIGEM.md`.

Implementação local, **sem aceite de PostgreSQL nesta execução**. Consulte
`VERIFICACAO.md` e `MATRIZ-C.md` para resultados reais, pendências e contagens.
Nenhuma branch/PR foi publicada, CI remota executada, integração ou deploy
realizado. O arquivo de Pages não foi editado e sua reativação continua vedada.

## Executor e despacho

`LabExecutor.execute()` é chamada explícita; não existe scheduler, fila de
CREATE, retomada de intenção no boot ou endpoint. A intenção é confirmada
pelo repositório existente antes de qualquer transporte. Somente o ACK de um
CONFIRM inédito (`replay=false`, `result=RECORDED`) cria capacidade privada,
volátil e vinculada à chamada/processo. Recibo recuperado, replay, restart e
ACK perdido não criam capacidade. Não há exportação, serialização, spool,
transferência por IPC ou clonagem dessa capacidade.

A época autorizada é capturada antes do CONFIRM e conservada; outra época NORMAL
não é adotada após o ACK. A validação interna faz replay exato de CONFIRM e leitura sob os locks SQL
existentes. Revalida sessão, papel OPERADOR, organização, ownership, holds,
operação/execução/autoria, estado SUBMITTING, potencial de efeito e lease.
Abre envelopes com AAD, confere hashes/bytes e binding FIXTURE/SYNTHETIC,
conta `lab:<org>`, geração 1 e versões aprovadas. A role restrita continua sem
SELECT/DML direto no ledger; nenhum GRANT ou comando SQL novo foi adicionado.

O deadline monotônico nasce na amostragem de `clock_timestamp()` PostgreSQL;
o tempo de query, abertura dos envelopes, gate e commit é descontado
conservadoramente. O processo verifica gate/época e deadline antes de consumir
sincronamente a capacidade uma vez. O transporte só existe como tarefa após
esse consumo e não tem retries, redirects ou destinos fornecidos pelo pedido.

O estado consumido não é recuperável. Falha depois dele deixa incerteza, mesmo
se I/R/P medidos pelo harness forem zero. Falha controlada antes dele pode
fechar a capacidade UNUSED→CLOSED; somente este caminho definitivamente
encerrado, sem tarefa de transporte criada ou callback de envio pendente,
produz NO_EFFECT. A flag `executionFenced=true` registra o mecanismo de
fechamento; não é o mecanismo nem uma promessa de fencing remoto.

## Janela residual e tempos distintos

Barreiras IPC: INTENT_ACKED, VALIDATED, CAPABILITY_CONSUMED,
TRANSPORT_INVOKED, OBSERVATION, EVIDENCE_COMMITTED, CAPABILITY_CLOSED.
O contador I usa a entrada efetiva de `transport.observe`, não o nome de uma
barreira. A capacidade não é enviada pelo IPC. O IPC leva somente identidades/barreiras
e resultados sintéticos ao supervisor confiável; o request vai só ao socket.

C12 suspende antes da revalidação. Lease vencido/UNKNOWN impede transporte na
retomada. C13 suspende **após a última checagem e o consumo**, antes da entrada
no transporte. A execução antiga ainda pode criar; outra nunca a substitui.
Não se promete exactly-once externo, cancelamento atômico ou proteção contra
root/executor malicioso. O laboratório confia no executor conforme e no socket
privado do harness. C12/C13 usam duração de lease de fixture de 100 ms e relógio
real PostgreSQL; não alteram o lease de 30 segundos do contrato implementado.

Timeout de transporte é deadline de observação (padrão 1 s). Gera INCONCLUSIVE
e mantém a mesma conexão brevemente para resposta tardia (padrão 3 s, limite
15 s). Não renova/vençe lease e não reenvia. Lease vencido impede um despacho
que ainda passe pela checagem, mas não cancela um que já a ultrapassou. Timeout,
HTTP 500 sintético e consulta vazia não provam ausência de efeito.

## Evidência e ADMIN de fixture

`LabAttestor` mantém o ADMIN existente, reautenticado em SQL. Não possui método
CONFIRM/execute nem restaura sessão revogada do operador. A política exige
binding completo; resposta inválida não vira prova terminal. ACCEPTED exige
resposta direta 200 com ID; REJECTED_FINAL exige resposta controlada 400 com
tombstone persistente que serializa rejeição/criação e barra entregas futuras.
Não existe política terminal por status HTTP isolado. O simulador é a origem
sintética confiável; esses campos não comprovam capacidades de Tiny/Olist.

Evidência, evento e projeção são commitados pelo ledger existente antes de
conclusão durável. Falha do commit não retorna sucesso durável: retorna prova
local pendente e commandId/evidenceId estáveis ao supervisor confiável. É
permitido repetir somente a persistência dessa observação, nunca transporte.
Sem a observação sobrevivente, permanece SUBMITTING/UNKNOWN; ABANDON é ato
supervisionado separado. Não há recuperação automática.

Provas válidas tardias usam revisão informativa antiga como previsto em v1;
contradição preserva recibo terminal e ativa conflictHold. C28 separa entradas
rejeitadas antes da transação (zero auditoria SQL) de denegações autenticadas
no SQL (auditoria SUBMISSION_DENIED após rollback). Não se mudou essa regra.

## Dois PostgreSQL e fronteira do simulador

`SimulatorStore` só aceita banco loopback `atram_test_sim*`. DDL está no próprio
harness, não nas migrations. Recebimentos R são commitados separadamente dos
efeitos P. `sim_effects` não possui UNIQUE por pedido/submissão/operação: modo
normal não idempotente cria por entrega. Modo idempotente serializa e compara
bytes. Tombstone de rejeição compartilha a serialização da criação e permanece
após restart. `PostgreSQLERPLedger` é adapter de laboratório para a interface
existente; não substitui IndexedDBERPLedger/MockERPProvider.

O simulador não lê o banco da aplicação. O executor não consulta contadores. Os processos filhos recebem somente a
configuração própria e PATH, sem herdar URLs administrativas da aplicação ou
do simulador presentes no ambiente do harness.
Acesso privilegiado, calibração direta e controle IPC são exclusivamente do
harness. Os dois serviços têm system_identifiers distintos, bancos/pools e
credenciais sintéticas próprios. O preflight exige isso e controles explícitos
para interromper somente containers postgres:16 descartáveis do ensaio.

C14–16 param realmente o PostgreSQL da aplicação via Docker, preservando o
simulador. C24/C26/C29 reiniciam o segundo serviço preservando armazenamento.
C09/C12/C13/C17 usam sinais reais, com confirmação de SIGSTOP via `/proc` e
espera do exit por SIGKILL. Falhas BEFORE_COMMIT, LOST_ACK e perfis de resposta
são **injeções**, não interrupções reais de processos/serviços.

C21 faz backup/restore real **somente do banco descartável do teste**. Mata o
executor e simulador antes, ativa RECOVERY_HOLD fora dos bancos e restaura o
ledger antigo; efeitos externos permanecem. Mantém hold e manifesto das
contagens antes/depois. Não implementa inventário, liberação/reconciliação D/E
nem procedimento automático de recuperação de ambientes comerciais.

## Escopo preservado e workflow

Nenhuma migration do ledger, permissão, norma, frontend, MockERPProvider,
IndexedDB, autosave, entrada rápida ou rota pública foi modificada. READY sem
confirmar continua ocupante; não há cancelamento automático. A suíte B anterior
permanece necessária para proteção criptográfica e role restrita.

A edição local autorizada de `backend.yml` adiciona apenas o segundo serviço,
C01–C29 e artifact always com logs/manifests/SHA. Gates anteriores permanecem.
Não se acrescentou deploy nem se tocou Pages. **Esta edição não é CI executada.**
A futura execução remota exige autorização separada de publicação e CI.
