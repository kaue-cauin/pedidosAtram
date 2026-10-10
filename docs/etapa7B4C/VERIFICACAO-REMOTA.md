# Verificação remota — 7B.4C

PR Draft: https://github.com/kaue-cauin/pedidosAtram/pull/4.
CI completa PASS: https://github.com/kaue-cauin/pedidosAtram/actions/runs/38056376958.
**Checkout efetivamente executado: `f909190d04ec3a0f7db86aecb7754996f33e1104`.**
Job backend `114225639223`; todas as etapas concluídas, sem skips de gates.
Aceite técnico depende da revisão de produto; este registro não o concede.

## SHAs, diff e correção

Main conferida sem avanço: `f246d1b1f002b9b9094dd5cc937eefd19bd90d5a`.
Entrega local `f3599f977f7c911d8a439d9ee64a7da00a65e3e3` difere do código
local testado `1d9cea334a3ae2dbfc476f01bb00d535594370bd` somente em documentação/evidências.
Publicação inicial via Git Data: `1c0f0e8dcbe2c1ce9421aa07b1e0a4b06b478efc`,
com árvore idêntica `3f47beea24dd7ea77176b6beed4170a2bc282e61`.
O SHA mudou por metadados/histórico da publicação, não por conteúdo.
A tentativa https://github.com/kaue-cauin/pedidosAtram/actions/runs/38056271245
falhou antes de criar jobs: nenhum teste executado nessa tentativa.

Correção mínima do workflow: retirar IDs `job.services` do env do job e
colocá-los no env do passo C. Diff: 3 linhas adicionadas, 2 removidas.
Novo SHA publicado e testado: `f909190…`; todos os gates anteriores preservados.
Nenhuma alteração de código do executor/simulador/testes foi necessária na CI.
Este registro posterior acrescenta somente documentação e evidências; uma nova
CI do head final será registrada no PR, com seu SHA efetivo próprio.

## Resultados medidos

29 casos C PASS, 68 manifestos de perfis/subcasos PASS, 17 U de política + 4 U
com sockets/sinais reais PASS, zero fail/cancelled/skipped/todo nas suítes.
Preflight validou dois PostgreSQL 16 independentes, identificadores
`7695032695615074343` e `7695032699352457254`, e controles dos containers
explicitamente aprovados. Nenhum C foi substituído por mock ou skip.
I/R/P/O/E/V seguem a definição da matriz, e E exclui REGISTER+ADMIT.

| Caso | Resultado executado | I/R/P/O/E/V medidos |
|---|---|---|
| C01 | PASS; ambos perfis | 1/1/1/1/2/1 |
| C02 | PASS; ambos perfis | 1/1/1/1/2/1 |
| C03 | PASS; ambos perfis | 1/1/1/1/2/1 |
| C04 | PASS; ambos perfis | 0/0/0/0/0/0 |
| C05 | PASS; ambos perfis | 0/0/0/1/2/0 |
| C06 | PASS; ambos perfis | 0/0/0/1/2/1 |
| C07 | PASS; ambos perfis | 1/0/0/1/2/1 |
| C08 | PASS; ambos perfis | 1/1/1/1/2/1 |
| C09 | PASS; ambos perfis | 1/1/1/1/2/0 |
| C10 | PASS; ambos perfis | 1/1/1/1/3/2 |
| C11 | PASS; ambos perfis | 1/1/1/1/3/2 |
| C12 | PASS; ambos perfis | 0/0/0/1/2/0 |
| C13 | PASS; ambos perfis | 1/1/1/1/3/1 |
| C14 | PASS; ambos perfis | 0/0/0/0/0/0 |
| C15 | PASS; ambos perfis | 0/0/0/1/2/0 |
| C16 | PASS; ambos perfis | 1/1/1/1/3/1 |
| C17 | PASS; ambos perfis | 0/0/0/1/2/0 |
| C18 | PASS; ambos perfis | 0/0/0/0/0/0 |
| C19 | PASS; ambos perfis | 0/0/0/0/0/0 |
| C20 | PASS; ambos perfis | 0/0/0/1/2/0 |
| C21 | PASS; ambos perfis | 1/1/1/1/1/0 → 1/1/1/0/0/0 |
| C22 | PASS; ambos perfis | 0/0/0/1/2/1 |
| C23 | PASS; ambos perfis | 0/0/0/1/3/1 |
| C24 | PASS; ambos perfis | 1/2/0/1/2/1 |
| C25 | PASS; ambos perfis | 1/1/0/1/2/1 |
| C26 | PASS; ambos perfis (calibração) | 0/2/1/0/0/0; 0/2/2/0/0/0 |
| C27 | PASS; ambos perfis | 1/1/1/2/4/2 |
| C28 | PASS; ambos perfis | 1/1/1/1/2/1 |
| C29 | PASS; ambos perfis | 1/1/1/1/2/1 |

C20-normal-epoch-false/true PASS, 0/0/0/1/2/0 cada.
C22-membership-false/true PASS, 0/0/0/1/2/1 cada.
C25-500-effect, invalid e 200-no-id, cada um false/true PASS,
1/1/1/1/2/1 cada; C25 principal (500-empty) 1/1/0/1/2/1.
C26 não idempotente: 0/2/2/0/0/0; idempotente: 0/2/1/0/0/0.
C24 inclui uma chamada auxiliar e C26 duas por perfil, identificadas no manifesto.
C19 cobre hold/arquivo inválido/arquivo ausente; três processos por perfil,
zero efeitos. C28 mediu cinco rejeições pré-transação audit Δ=0 e cinco
denegações SQL audit Δ=5, em cada perfil, sem mudar o ledger.
O JSON de resultados identifica separadamente os 68 manifestos e seus hashes.

## Barreiras e interrupções comprovadas

C06: CAPABILITY_CLOSED=true, transportNotInvoked=true, exit code 0,
I/R/P=0 antes do NO_EFFECT durável. C09 e C17: SIGKILL enviado e exit
signal SIGKILL observado; boot novo não reconstrói despacho.
C12/C13: SIGSTOP, estado parado confirmado em /proc, vencimento pelo
clock_timestamp do PostgreSQL, ABANDON sem substituto, SIGCONT e exit.
O lease da fixture foi reduzido a 100 ms; o relógio não foi simulado.
C12 não despachou. C13 produziu um efeito antigo após expiração; este
resultado demonstra a janela residual, sem exactly-once ou fencing remoto.

C14–C16: stop/start reais do PostgreSQL da aplicação, preservando dados.
C16 reteve a prova local, sem declarar sucesso na indisponibilidade, e persistiu
a mesma prova após retorno, sem nova invocação. C24/C26/C29: reinício real do
simulador e seu PostgreSQL preservou rejeição/efeitos. C21: SIGKILL/quiescência,
RECOVERY_HOLD externo e pg_dump/pg_restore reais apenas no ledger descartável;
P=1 sobreviveu no banco independente e o hold bloqueou novo CONFIRM.
C22/C23 revalidaram sessão, membership e owner antes do transporte.

C10: timeout de transporte 50 ms, resposta atrasada 300 ms, mesma conexão;
INCONCLUSIVE antes de ACCEPTED, uma invocação. Lease da operação é 30 s
fora das fixtures C12/C13. Timeout, 500, consulta vazia e lease expirado
não estabelecem ausência de efeito e não autorizam substituição.

## Regressões, gates e evidências

7B.1: 19 PASS; 7B.2: 16 PASS (inclui migrations/SQL/auth/OAuth sintético);
7B.3: 24 PASS (inclui PostgreSQL/cache/paginação); B01–B24: 24 PASS.
Etapas 2–6 e check:data PASS; performance Node 7B.3: 36 cenários PASS.
Typecheck, lint, build e boundary PASS. Build offline: 121 checks/40 recursos,
sem publicação. B08/B20 e B11/B12 conservaram proteção de snapshots/role
restrita/isolation; B19 e C19–C21 exercitaram RECOVERY_HOLD; C18 conserva
READY abandonado, sem cancelamento automático.

Artefatos da execução:
- https://github.com/kaue-cauin/pedidosAtram/actions/runs/38056376958/artifacts/11671597281 (C/logs/68 manifestos)
- https://github.com/kaue-cauin/pedidosAtram/actions/runs/38056376958/artifacts/11671187437 (B01–B24)
- https://github.com/kaue-cauin/pedidosAtram/actions/runs/38056376958/artifacts/11671267574 (performance Node)

Cópia durável: [remoto-f909190.zip](evidencias/remoto-f909190.zip), com logs C/B,
job completo, manifestos originais e registro Pages. Índice legível:
[resultados-remotos-f909190.json](evidencias/resultados-remotos-f909190.json);
hashes em [manifesto-remoto-f909190.json](evidencias/manifesto-remoto-f909190.json).
Os hashes ZIP baixados coincidem com os digest SHA-256 dos artefatos GitHub.

A revisão do JSON/log de performance corrigiu a contagem documental: são
36 cenários medidos (6 tamanhos × 6 perfis de rede), não os 18 anteriormente
informados. Os relatórios originais sempre registraram 36; não houve alteração
ou nova aprovação de testes por essa correção.

## Limites preservados

Falhas/bloqueios locais permanecem registrados em VERIFICACAO.md e nos logs
originais; os passes remotos não os reescrevem. Nenhum caso C/B obrigatório
ficou pendente nesta execução remota. Houve TimeoutNegativeWarning durante C14;
a suíte terminou PASS, e o aviso está preservado no log, sem alteração para o ocultar.
Estes ensaios não homologam UI no navegador, infraestrutura de produção, Tiny,
recuperação operacional ou exactly-once externo. Há doubles somente nos U,
fake-indexeddb nos testes de modelo existentes; C crítico usa PostgreSQL/processos reais.
O manifesto é capturado antes da limpeza final; interrupções exigidas pelo caso
já constam nele. O simulador/DDL são exclusivos de laboratório.

Pages conferido disabled_manually; a última execução observada é de 09/10,
anterior a esta publicação. Branch/PR não acionam seu push da main. Nenhum
merge/auto-merge/deploy, reativação de Pages, comunicação real Tiny/Olist ou
mudança normativa/migration/permissão do ledger foi realizada.
