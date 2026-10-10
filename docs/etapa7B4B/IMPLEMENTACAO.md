# Etapa 7B.4B — persistência durável de laboratório

Contrato: `submission-ledger-v1`. Escopo autorizado em 09/10/2026: PostgreSQL, repositórios e testes sintéticos. PR Draft #3, sem integração real, executor, UI ou deploy. Os resultados e o SHA homologado constarão do relatório de verificação; este documento descreve a implementação, não substitui as evidências.

## Fronteira e modelo

Uma migration aditiva, `0003_submission_ledger.sql`, cria cinco tabelas. A âncora nasce com identidade do servidor, origem local única na organização e owner derivado da sessão. A tentativa nasce READY após admissão. Nenhum rascunho IndexedDB é importado, alterado ou apagado.

| Tabela | Garantias principais |
|---|---|
| submission_orders | PK organização/pedido; origem única e imutável; ownership; revisões de pedido/âncora; ponteiros current/accepted; holds |
| order_submissions | Snapshot/DTO cifrados; hashes e versões imutáveis; uma ocupante por pedido; recibo externo único por organização/conta; revisão do ledger; tombstone de arquivamento |
| submission_communications | Intenção local CREATE/LOOKUP; execução única; sequência; potentialEffect; fechamento somente com evidência; lease não libera unicidade |
| submission_events | Sequência da âncora; ator/sessão; digest e recibo original do comando; append-only |
| submission_evidence | Prova sintética vinculada à tentativa/operação/execução, hashes e conta; detalhes cifrados; autoria; observação durável |

As referências entre pedido, tentativa, comunicação, evento e evidência são compostas por organização e recurso. Constraints diferidas verificam os ponteiros circulares e o vínculo da aceitação/fechamento ao terminar a transação. A unicidade parcial de ocupação ignora lease. Eventos e tombstones não podem ser removidos para liberar um pedido.

As declarações Drizzle e seu snapshot refletem as colunas. Checks, triggers e funções privilegiadas são complementos SQL mantidos manualmente; qualquer migration futura precisa preservar esses complementos. Não usar `drizzle push` para substituir as garantias SQL.

## Proteção definida antes da migration

A estratégia preliminar foi registrada no primeiro commit do PR, antes do DDL. Snapshot canônico e DTO sintético são UTF-8 protegidos por AES-256-GCM do Vault existente, armazenados em BYTEA. O digest SHA-256 corresponde ao plaintext, e não ao envelope aleatório. AAD inclui organização, pedido, submissão, tipo, versões e digest; evidências incluem também evidenceId.

A comparação de uma admissão repetida abre os envelopes existentes **sob lock da âncora**, compara os bytes exatos e reutiliza o envelope. Hash não é chave de deduplicação de venda. Não há normalização Unicode; a serialização legada é preservada.

`maintenance.ts` usa uma conexão de manutenção separada: abre com a chave antiga, valida hash, recifra e abre novamente os mesmos bytes antes do CAS do envelope antigo. A função `submission_rotate` não é concedida à role operacional. A rotação grava evento, preservando identidade, hashes, revisão decisória e evidências lógicas; o material cifrado pode mudar. A chave antiga não pode ser descartada antes de inventário e verificação de todos os envelopes/backups dependentes. O laboratório não homologa um KMS nem proteção comercial de dados.

## Acesso ao PostgreSQL

A role operacional é NOSUPERUSER/NOCREATEDB/NOCREATEROLE, não é dona das tabelas/funções e não recebe SELECT/INSERT/UPDATE/DELETE/TRUNCATE nas cinco tabelas. Recebe somente USAGE do schema e EXECUTE das funções públicas do repositório:

```sql
GRANT EXECUTE ON FUNCTION submission_read(uuid,uuid,uuid),
 submission_command(uuid,uuid,text,jsonb) TO role_operacional_do_laboratorio;
```

O provisionador deve impedir CREATE no schema público e não conceder membership da role de migration à role operacional. As funções SECURITY DEFINER são de propriedade da role de migration, possuem search_path fixo e referências qualificadas. Helpers internos e manutenção têm EXECUTE revogado de PUBLIC. Testes usam uma role nova restrita por banco; superusuário só provisiona o ambiente e injeta falhas administrativas controladas.

A sessão deriva do AuthService; SQL revalida organização, usuários, memberships, sessão e owner. ADMIN consulta/resolve/arquiva/transfere, mas não recebe envio por implicação. OPERADOR prepara/confirma somente pedidos próprios. VENDEDOR consulta somente próprios, sem envio. Compartilhamento amplo permanece pendente; B03 testa concorrência de processos para o mesmo owner e transferência explícita para um segundo operador, que nunca ganha acesso por conhecer um UUID.

## Transações, comandos e certeza

READ COMMITTED, locks compartilhados de autorização, locks de âncora/tentativa e advisory lock da identidade do comando. Usuários de uma transferência são bloqueados em ordem. Lock timeout: 3 segundos; statement timeout: 10 segundos. Não há rede dentro da transação nem retry de CREATE. Um deadlock/timeout retorna erro sanitizado e o chamador consulta/reutiliza a mesma identidade.

Replay compara ator, ação, recurso e digest antes de CAS. Retorna o recibo original e a projeção atual, sem novo evento ou revisão. A admissão congela bytes/hash/mapper/conta sintética. `sourceLocalRevision` não é autoridade sobre a revisão do servidor. IDs distintos disputando uma âncora ocupada recebem conflito.

`confirm` registra somente intenção, operação e execução locais; não existe método que execute transporte. UNKNOWN e execuções potencialmente capazes permanecem bloqueados. ABANDONED, finishedAt e lease vencido não são prova de ausência. NO_EFFECT exige prova de não invocação e executor impedido; REJECTED_FINAL exige exclusão de efeito passado e futuro. Conteúdo só é liberado por arquivamento administrativo de rejeição final de conteúdo, com CAS, prova e ausência de execução capaz.

`recordLabEvidence` é uma entrada **interna de atestação sintética**, não um endpoint que aceita classificação do cliente. B verifica persistência, vínculos, política e atomicidade dessas atestações. A veracidade de respostas de um sistema externo e a política de reconciliação serão responsabilidades das fases C/D. Evidência tardia é armazenada mesmo com revisão informativa antiga; contradições põem hold, preservam recibo terminal e não autorizam reenvio. Não há override administrativo para reenviar apesar da dúvida.

## READY abandonado

Fechar a tela ou reiniciar processo não altera READY. Continua ocupante, com bytes imutáveis. Não há cancelamento READY→DRAFT. A operação interna `blockBeforeIntent` exige READY sem qualquer intenção CREATE e registra prova NO_EFFECT antes de ERROR; não arquiva nem libera o snapshot. A confirmação explícita posterior mantém a mesma tentativa. Protocolos de cancelamento dependem de nova decisão de produto.

## RECOVERY_HOLD externo e restauração

O gate reside em um arquivo do controlador de laboratório, fora do PostgreSQL restaurado. Ausência, arquivo inválido, ambiente incorreto, janela perdida aberta ou estado diferente de NORMAL bloqueiam admissão e confirmação. Epoch é verificado antes e depois da transação; mudança detectada antes do commit provoca rollback. O runtime só lê o gate; não há método de liberação neste módulo.

Runbook obrigatório:

1. Interromper e isolar todos os processos/executores antigos e impedir novas entradas.
2. O controlador externo escreve RECOVERY_HOLD com identificação do ambiente, ponto restaurado e intervalo potencialmente perdido **antes** do restore.
3. Restaurar o banco e as chaves compatíveis. Readiness SQL não libera operação.
4. Inventariar a janela perdida; restaurar provas íntegras ou manter holds persistentes por pedido/organização. Identidades não enumeráveis mantêm o hold global.
5. Somente depois de revisão administrativa documentada, integridade das chaves e prova de encerramento dos executores, o controlador pode emitir nova epoch NORMAL. Sem essa prova, permanece bloqueado.

A checagem de arquivo não detecta automaticamente restore omitido pelo operador, não é lock distribuído de produção e não cancela uma chamada externa já autorizada. O runbook exige quiescência antes do restore; o intervalo final entre checagem e COMMIT não é apresentado como fencing distribuído. B19 usa pg_dump/pg_restore reais em banco descartável, perde uma intenção posterior ao backup e demonstra que o gate externo continua bloqueando. RPO/RTO e recuperação operacional de produção **não estão homologados**.

## Limites de laboratório e compatibilidade

Admissão: até 300 itens, 1 MiB de bytes canônicos, IDs até 128 caracteres, strings usuais até 512, unidade até 32, observações até 16.384 caracteres cada. Schema estrito rejeita campos desconhecidos, quantidades inválidas, preços não inteiros/fora da faixa segura e bytes não canônicos. São limites técnicos de laboratório sujeitos à revisão de produto; nenhum endpoint comercial ou limite HTTP global foi alterado.

MVP, ERPProvider, MockERPProvider, frontend, IndexedDB e digitação permanecem fora do módulo. Rollback de aplicação desliga/omite o módulo e preserva tabelas e provas. Não há down migration, DROP ou truncamento operacional. B23 injeta falha na migration aditiva, verifica rollback do DDL e compatibilidade da readiness antiga.

## Execução e limitações dos testes

`npm run check:stage7b4b` exige BACKEND_TEST_DATABASE_APPROVED=yes e banco atram_test* em loopback. CI usa PostgreSQL 16, bancos descartáveis, roles restritas, dois processos quando indicado e nenhuma credencial comercial. O teste de restore também requer pg_dump/pg_restore compatíveis. HTTP é bloqueado na suíte nova. As 12 verificações locais anteriores são baseline; não substituem B01–B24 nem nova homologação de navegador.

Os limites materiais continuam: coordenação somente da mesma identidade autoritativa; sem deduplicação semântica entre vendas distintas; sem exactly-once externo; sem política comercial de retenção, SLA, RPO/RTO ou liberação automática de fases posteriores.
