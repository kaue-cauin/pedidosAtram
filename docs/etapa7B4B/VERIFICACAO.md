# Etapa 7B.4B — evidências para revisão técnica

Data: 10/10/2026. Contrato: `submission-ledger-v1`.

**Status: CI completa aprovada; B01–B24: 24 passaram, 0 falhas, 0 ignorados.** Este relatório não concede aceite técnico, integração ou produção. O PR permanece Draft.

- PR: https://github.com/kaue-cauin/pedidosAtram/pull/3
- Branch: `feat/etapa-7b4b-ledger`.
- SHA de código e testes revisado: `2488b041a41ac5914f0cbece9a5826a5d04665a3`.
- CI desse SHA: https://github.com/kaue-cauin/pedidosAtram/actions/runs/38048402108
- Baseline main: `0dc5404cd913f7ad35653e422dab5b5ebb884953`.
- A CI faz checkout do head exato do PR e imprime `git rev-parse HEAD`; não atribui o resultado ao merge virtual.
- Commits posteriores exclusivamente documentais não modificam o código avaliado; o head final e sua CI ficam registrados no corpo do PR e na entrega.

## Implementação e migration

Uma migration aditiva: `backend/db/migrations/0003_submission_ledger.sql`, com entrada 3 no journal e snapshot Drizzle correspondente. Cria `submission_orders`, `order_submissions`, `submission_communications`, `submission_evidence` e `submission_events`; índices, FKs compostas, constraints diferidas, guardas de imutabilidade e funções de acesso/transição. Não há down migration nem importação de rascunhos.

Módulos em `backend/submissions/`: contratos/validação, matriz de estados, autorização, repositórios transacionais, proteção criptográfica, manutenção de envelopes e gate externo de recuperação. Não existem rotas novas nem executor CREATE. A confirmação grava somente intenção local. O binding é obrigatoriamente FIXTURE/SYNTHETIC, conta separada por organização e connectionId nulo.

Invariantes verificados: uma tentativa ocupante por âncora; uma intenção CREATE capaz por tentativa; bytes/destino imutáveis; replays por comando antes do CAS; revisões independentes; evidência vinculada para estado terminal/fechamento; UNKNOWN e conflito bloqueiam nova intenção; lease/finishedAt não liberam; arquivamento mantém tombstone; isolamento de organização e ownership revalidados.

Detalhes e runbook: [IMPLEMENTACAO.md](IMPLEMENTACAO.md).

## B01–B24 em PostgreSQL real

Ambiente: GitHub Actions, PostgreSQL 16.15, Node 24, `npm ci`, banco `atram_test_ci` em loopback, bancos descartáveis por teste e dados exclusivamente sintéticos. O provisionamento usa a conta de teste administrativa; o repositório usa uma role operacional nova e restrita. As injeções SQL administrativas são identificadas nos testes. HTTP é bloqueado na suíte nova por `no-network.mjs`; isso não é apresentado como firewall de infraestrutura homologado.

A CI inteira concluiu com sucesso no run identificado, incluindo todos os gates posteriores à suíte B.

| Caso | Resultado | Evidência exercitada / limite específico |
|---|---|---|
| B01 | PASS | Cadastro repetido e resposta descartada: mesma origem retorna uma âncora, sem transferir owner. |
| B02 | PASS | 100 admissões simultâneas idênticas: uma tentativa e um comando/evento. |
| B03 | PASS | Dois processos competem pela mesma âncora; segundo operador sem atribuição é negado; transferência explícita não desfaz ocupação. Default de acesso impede dar permissão simultânea implícita a dois operadores. |
| B04 | PASS | Reuso de commandId com ator, ação, recurso ou corpo diferente falha. |
| B05 | PASS | Replay original após revisão avançada mantém recibo; comando novo stale é rejeitado. |
| B06 | PASS | 49 pares da política enumerados; subset persistível e guardas SQL; pré-despacho com prova. Não inventa DRAFT/VALIDATING no banco. |
| B07 | PASS | UNKNOWN, lease vencido, abandono e finishedAt não autorizam segunda intenção. |
| B08 | PASS | Role restrita nega DML/leitura direta e manutenção; origem/snapshot/binding/recibo/histórico imutáveis; AAD e rotação real de envelopes preservam plaintext/hashes. |
| B09 | PASS | Seis vetores canônicos, arrays/Unicode e rejeição de schemas inválidos. |
| B10 | PASS | Revisão local não é autoridade; conteúdo divergente e revisão backend stale não sobrescrevem. |
| B11 | PASS | Tenant alheio não consulta/anexa prova; owner/FKs e ponteiro composto rejeitam vínculo cruzado. |
| B12 | PASS | Revogação concorrente na admissão e confirmação; sessão/membership/ownership rechecados, nenhuma intenção após revogação. |
| B13 | PASS | Resoluções administrativas concorrentes: uma vence CAS; replay não duplica; justificativa cifrada recuperada com AAD. |
| B14 | PASS | Arquivar somente rejeição final de conteúdo, revisão nova e conteúdo alterado; tentativa antiga não reexecuta. |
| B15 | PASS | Provas contraditórias, recibo externo duplicado e aceitação após arquivamento geram hold; terminal preservado; nova READY bloqueada. |
| B16 | PASS | Rollback antes do commit e perda de resposta injetada depois do commit; recuperação pelo mesmo comando. Não usa proxy de TCP nem crash físico do servidor PostgreSQL. |
| B17 | PASS | Processos reais reabrem READY e UNKNOWN; bytes/revisões/ocupação recuperados. READY abandonado não arquiva nem aceita outra tentativa. Não simula queda física de disco. |
| B18 | PASS | Porta indisponível, lock timeout no repositório e deadlock PostgreSQL real. Deadlock é provocado por transações administrativas controladas; não é caos distribuído em produção. |
| B19 | PASS | pg_dump/pg_restore reais perdem intenção posterior ao backup; gate externo sobrevive e bloqueia admissão/confirmação; arquivo inválido também bloqueia. |
| B20 | PASS | Role operacional não forja safeClosedAt nem apaga/trunca tombstones; SQL administrativo sem prova falha nas guardas. |
| B21 | PASS | FKs/constraints diferidas rejeitam ponteiros de outro pedido, estado ou evidência; teste aguarda COMMIT explícito. |
| B22 | PASS | Payload válido de 300 itens, limites de strings/bytes e rejeição sem commit parcial. Medição é de admissão PostgreSQL, não latência da UI. |
| B23 | PASS | Erro deliberado durante DDL em transação deixa schema anterior íntegro; readiness anterior funciona com schema aditivo e reaplicar migrations é idempotente. Rollback de aplicação não apaga ledger. |
| B24 | PASS | Sequência/ator/recibo, conteúdo sensível ausente dos eventos, erro sanitizado e auditoria de denegação; auditoria/fila paginadas e escopadas por tenant/role. |

B22 mediu 300 itens / 71.388 bytes / 12,55 ms de admissão nesta execução; amostra única de laboratório, sem inferência de SLA.

Fonte: `backend/tests/stage7b4b/ledger.test.mjs`. Trecho preservado: [postgresql-B01-B24.log](postgresql-B01-B24.log). Log integral da suíte no [artefato etapa7b4b-postgresql](https://github.com/kaue-cauin/pedidosAtram/actions/runs/38048402108/artifacts/11668912364) do run acima. As migrations são efetivamente aplicadas em cada fixture; B19 e B23 exercitam restauração e falha de migração, respectivamente.

## Três proteções exigidas na entrega

**Snapshots e role restrita.** Snapshot e request em BYTEA contêm envelopes AES-256-GCM, com digest do plaintext e AAD da organização/pedido/submissão/tipo/versões. Runtime não possui SELECT/DML/TRUNCATE nas cinco tabelas nem EXECUTE de manutenção; usa funções SECURITY DEFINER de owner separado e search_path fixo. Triggers também impedem alteração dos campos congelados. B08 testa essas negações com a role operacional, e rotação por conexão de manutenção separada. Superusuário não representa o modelo de ameaça operacional.

**RECOVERY_HOLD externo.** Arquivo do controlador fica fora do backup PostgreSQL. Ausência, erro de formato, ambiente errado, janela perdida aberta ou estado diferente de NORMAL impedem admissão/confirmação. B19 restaura backup real mais antigo e confirma o bloqueio após perder uma intenção no banco. O runbook exige interromper processos antigos e ativar hold antes do restore. O arquivo não é fencing distribuído, não detecta restore oculto e não encerra requisições externas. RPO/RTO e liberação operacional não estão homologados.

**READY abandonado.** Fechamento/reabertura de processo não altera estado, bytes nem ocupação. Não existe READY→DRAFT/cancelamento na v1. B17 recupera READY em processo novo, nega arquivamento e segunda admissão. B06 verifica bloqueio pré-despacho comprovado para ERROR sem liberar snapshot; B15 verifica que conflito tardio mantém nova READY bloqueada. Não há reenvio automático.

## Regressões e preservação do MVP

A CI completa executa 7B.2 e 7B.3 em PostgreSQL real, B01–B24, performance Node da 7B.3, dados e Etapas 2–6/7B.1, typecheck, lint, build e boundary. Todos esses gates passaram no run acima. 7B.2: 16/16; 7B.3: 24/24; 7B.1: 19/19; sem testes ignorados nessas suítes. Performance Node também passou e tem artefato próprio; não representa nova medição da UI.

Inspeção do diff contra a baseline: frontend, domínio legado, ERPProvider, MockERPProvider, coordenador existente, repositories locais, IndexedDB, arquivos públicos, lockfile e workflow Pages não foram alterados. No schema legado, somente reexport dos novos modelos; em package.json, somente o script novo. A CI mantém o build do MVP e o check que impede backend no bundle. Não houve nova homologação de navegador ou de digitação humana.

## As 12 verificações locais anteriores

Baseline local de 09/10/2026, SHA `0dc5404cd913f7ad35653e422dab5b5ebb884953`, Node 24.19.0. Todas tiveram exit code 0. Logs preservados em [baseline-logs](baseline-logs/); condições originais em [BASELINE.md](BASELINE.md). Dependências locais reutilizadas, sem repetir npm ci; CI executa instalação limpa.

| Verificação | Resultado local | Limitação |
|---|---|---|
| check:data | PASS | Valida dataset sintético (900 produtos), não dados comerciais. |
| check:stage2 | PASS | Busca/catálogo em Node; não mede interação humana no navegador. |
| check:stage3 | PASS | Cálculos e regressões de domínio; não substitui teste visual/teclado. |
| check:stage4 | PASS | Scheduler/autosave com adapter de teste; não prova durabilidade PostgreSQL. |
| check:stage5 | PASS | Fluxos do mock e 93 checks; não prova semântica externa Tiny. |
| check:stage6 | PASS | Correção/histórico/formatos locais e 143 checks; não testa ledger novo. |
| check:stage7b1 | PASS | OAuth/transportes sintéticos; nenhuma comunicação real autorizada. |
| check:stage7b2:unit | PASS | Quatro testes unitários; exclui integração PostgreSQL. |
| typecheck | PASS | Tipos estáticos; não executa transações. |
| lint | PASS | Regras estáticas; não comprova invariantes concorrentes. |
| build | PASS | Compila MVP; não é deploy nem homologação do build publicado. |
| check:backend-boundary | PASS | Inspeciona fronteira do bundle; não substitui teste de segurança abrangente. |

Essas 12 verificações eram somente baseline e não substituíam os testes de implementação então pendentes. B01–B24 e regressões PostgreSQL têm execução e evidências separadas acima. O ambiente local desta sessão não tinha PostgreSQL; a instalação foi bloqueada por permissões. Não foi usado mock para declarar sucesso de banco real.

## Histórico da CI e limites do parecer

- Baseline PostgreSQL anterior: https://github.com/kaue-cauin/pedidosAtram/actions/runs/37950949713 — sucesso.
- Primeira revisão completa verde (24/24 + regressões): https://github.com/kaue-cauin/pedidosAtram/actions/runs/38048177223 — SHA `63f7c263c551e1961627d656f82250e19e5d3333`.
- Revisões anteriores falharam e foram corrigidas: sintaxe não suportada pelo strip de TypeScript do Node, expressão CASE SQL, permissão do trigger diferido e testes que não aguardavam COMMIT implícito. Não foram ocultadas nem tratadas como sucesso.
- A autorização expressa posterior à rejeição automática permitiu publicar a branch e abrir o Draft. Nenhuma nova autorização para main/merge/deploy foi inferida.

Escopo continua exclusivamente de laboratório. Atestações de evidência são internas e sintéticas; não validam verdade externa nem contam chamadas de ERP. Os testes de simuladores não idempotentes, crash após efeito, 1.000 replays e reconciliação ponta a ponta pertencem a C/D e não foram iniciados. Não existe garantia de exactly-once externo ou deduplicação comercial entre identidades diferentes.

Resolução de conflito permanece conservadora: provas são preservadas e hold não possui override para reenvio. Investigação/liberação de incidente, política comercial de retenção, prioridades/SLA, RPO/RTO e KMS não estão homologados. Auditoria de denegação pós-rollback é best-effort se o banco estiver indisponível. Rotação cobre snapshots/requests/evidências; justificativas administrativas ainda exigem manter a chave original, sem alegação de aposentadoria integral de chaves.

Não houve merge, auto-merge, escrita direta na main, deploy/Pages, comunicação Tiny/Olist real ou início de 7B.4C–F/7C. Aceite técnico e autorização de integração permanecem com a revisão do usuário.
