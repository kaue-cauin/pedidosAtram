# Evidências locais — Etapa 7B.4C

Implementação em branch local exclusiva `feat/etapa-7b4c-execucao-simulada`.
Baseline: `f246d1b1f002b9b9094dd5cc937eefd19bd90d5a`. GitHub main foi conferida
como `identical`, sem avanço. Código efetivamente executado: **`1d9cea334a3ae2dbfc476f01bb00d535594370bd`**,
checkout limpo no início dos checks. O commit posterior de entrega registra
somente documentação/evidências; não atribuímos testes a esse novo SHA.

**A implementação está disponível para revisão, sem aceite C/PostgreSQL.**
Não houve publicação de branch, PR ou execução de CI remota. Não houve merge,
deploy, recuperação operacional, alteração da main, reativação do Pages,
comunicação real Tiny/Olist ou avanço D/E/F/7C. A edição local do workflow é
configuração preparada, não uma CI executada.

## As 12 verificações locais

Todas foram efetivamente executadas nesse SHA, exit 0. Logs, comandos,
horários e SHA-256 estão em `evidencias/local-checks.json` e nos arquivos L*.log.

| ID | Comando npm | Resultado | Limite da evidência |
|---|---|---|---|
| L01 | check:data | PASS; 900 produtos/100 clientes sintéticos | Integridade do mock; sem banco externo |
| L02 | check:stage2 | PASS; 1.800 lookups, 1.000 buscas | Modelo Node; sem teclado/renderização |
| L03 | check:stage3 | PASS; 75.642 assertions | Modelo Node; sem navegador |
| L04 | check:stage4 | PASS; 26 checks | Autosave/modelo; IndexedDB emulado |
| L05 | check:stage5 | PASS; 93 checks | Mock/idempotência MVP; não é execução C |
| L06 | check:stage6 | PASS; 143 checks | Histórico/modelo MVP; não é PostgreSQL C |
| L07 | check:stage7b1 | PASS; 19 testes | OAuth/transporte com fixtures locais; nenhum Tiny real |
| L08 | check:stage7b2:unit | PASS; 4 testes | Segurança/configuração; regressões SQL pendentes |
| L09 | typecheck | PASS | Tipos TypeScript; não executa SQL/testes C |
| L10 | lint | PASS; zero warnings | Análise estática; não prova durabilidade |
| L11 | build | PASS; offline 121 checks/40 recursos | Build estático e service-worker em VM; sem deploy/navegador |
| L12 | check:backend-boundary | PASS | Fronteira de fonte/build; não prova RBAC SQL nesta versão |

Além disso: **17 testes U (U01–U14, U19–U21) PASS**, 9 testes unitários
7B.3 PASS e performance 7B.3 Node PASS em 18 cenários. Modelos com coordinator
double/fake-indexeddb e timers sintéticos não constituem homologação de UI ou
PostgreSQL real. O relatório Node anterior da 7B.3 foi preservado; o relatório
novo está somente nas evidências desta etapa.

S01: sintaxe Node de 10 arquivos mjs PASS. S02: YAML e preservação literal dos
21 steps/gates anteriores, triggers, permissões e primeiro PostgreSQL PASS;
outros workflows (incluindo Pages) byte a byte inalterados. S03: contrato byte
idêntico ao aprovado e ausência de mudanças em migrations/permissões do ledger,
frontend, IndexedDB, MockERPProvider e entrada rápida PASS. Tudo isso é
inspeção de fonte/configuração, não teste PostgreSQL.

## Bloqueios reais, sem passes substitutos

- `check:stage7b4c` foi invocado e terminou exit 1 no preflight. Não existe
  PostgreSQL/Docker utilizável neste ambiente; tentativa de instalação falhou
  por permissões do sistema. Dois serviços reais, pg_dump/pg_restore e controles
  de interrupção explícitos são requisitos. **C01–C29 não entraram nos corpos
  dos testes**; `preflight.json` marca todos NOT_EXECUTED com `counts:null`.
- U15–U17 foram tentados e falharam no listen Unix com EPERM, antes de seus
  cenários de transporte. Não comprovam timeout, resposta tardia ou crash após
  efeito. U18 falhou com ENOENT em `/proc/<pid>/status`: o sinal foi solicitado,
  mas o estado STOP não pôde ser verificado. Resultado dos quatro: FAIL,
  infraestrutura; nenhuma aprovação parcial desses cenários.
- U20 passou com processo filho independente, ambiente sem URLs administrativas,
  SIGKILL enviado e exit com signal SIGKILL observado. Isso comprova isolamento
  e término **sem transporte/CREATE/PostgreSQL**, não C09/C13/C17. O manifesto
  `U20-process-isolation.json` preserva ready/isolation/signal/exit. O manifesto
  U18 preserva sua falha e o término por SIGKILL durante limpeza.
- B01–B24, regressões PostgreSQL 7B.2/7B.3, aplicação das migrations existentes
  em banco real e C01–C29 permanecem pendentes no SHA desta implementação.
  O aceite B informado para a baseline não foi reapresentado como teste novo.
- Nenhuma interface foi homologada no navegador nesta entrega.

## Contagens e barreiras

**Contagens C medidas I/R/P/O/E/V: null em todos os casos, não zero.**
A tabela `MATRIZ-C.md` contém apenas expectativas completas por caso/subcaso,
com preparação, falha, estado e contagens. I usa entrada efetiva no transporte;
R/P usam commits no banco independente. O/E/V são duráveis no ledger. Chamadas
auxiliares e auditoria de denegação são separadas.

C28 corrigido: cinco rejeições pré-transação, audit Δ=0; cinco denegações SQL
(três bindings, organização sem acesso e ADMIN tentando CONFIRM), audit Δ=5
esperado. Ledger esperado inalterado 1/1/1/1/2/1. Esses valores ainda não foram
medidos em PostgreSQL. Nenhuma norma/permissão foi modificada para os atingir.

U08 demonstra fechamento da capacidade antes de consumo e ausência de
invocação num coordinator double. U09 não permite NO_EFFECT após consumo;
U11 desconta tempo de validação/commit; U19 bloqueia mudança de época entre
intenção e ACK. U14 demonstra a janela residual **somente no modelo local**.
C12/C13 continuam pendentes com SIGSTOP/SIGCONT, lease real e dois bancos.
Lease expirado, timeout, HTTP 500 ou resultado vazio jamais elegem substituto.
Não se promete exactly-once externo nem fencing remoto por boolean.

Proteção dos snapshots/role restrita, índices de exclusão, ABANDON/UNKNOWN,
monotonicidade SUBMITTED e RECOVERY_HOLD externo usam a implementação v1
anterior preservada. Nova validação abre envelopes com AAD e vincula hashes,
conta/geração/identidades; sua integração SQL ainda requer ensaio real. Não há
novo ledger DDL, permissões, UI, rota pública, nova fila ou cancelamento READY.

## Diff e reprodução autorizada

`evidencias/IMPLEMENTACAO.patch` é o diff **baseline→1d9cea334a3ae2dbfc476f01bb00d535594370bd**, incluindo
código, suíte, configuração local e documentação existente nesse SHA.
`diff-stat.txt` resume os arquivos. O registro final acrescenta somente esta
documentação e evidências, que podem ser conferidas com `git diff 1d9cea334a3ae2dbfc476f01bb00d535594370bd HEAD`.
O manifesto dos arquivos preserva hashes; local-checks vincula os logs ao SHA.

Preparado para ambiente de teste Linux/Node 24 com sockets Unix, PIDs em /proc,
dois containers oficiais postgres:16 independentes, clientes PostgreSQL e
credenciais exclusivamente sintéticas. O preflight valida nomes atram_test*,
loopback, system_identifiers diferentes, IDs/imagens/portas dos containers e
aprovação explícita de interrupção; não aceita infraestrutura desconhecida.
`npm run check:stage7b4c` executará preflight, U/wire e C; não transforma ausência
de infraestrutura em skip aprovado. O workflow conserva gates B/regressões e
arquiva C com `if: always()`. Nenhuma CI remota foi executada aqui.

Validação PostgreSQL completa é necessária antes do aceite técnico C. Branch,
PR e CI remota dependem de autorização separada; este trabalho não as executa.
