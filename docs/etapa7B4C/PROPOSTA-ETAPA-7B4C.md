# Atram Comercial — preparação técnica da 7B.4C

Data: 10/10/2026, America/Sao_Paulo. Proposta para revisão de produto. **Não implementada; nenhum teste C executado.** A 7B.4B foi encerrada tecnicamente pela gestão no escopo de laboratório.

## 1. Baseline e referências

Main conferida pelo plugin GitHub: `f246d1b1f002b9b9094dd5cc937eefd19bd90d5a`. A comparação desse SHA com `main` retornou identical, zero commits e zero arquivos alterados. Não há avanço a avaliar. O checkout de inspeção está no head aprovado `244c3a1e4bbf9c42a405c9bcb906533ea66d67d3`, cuja árvore é idêntica à do merge; está limpo.

- [PR #3 integrado](https://github.com/kaue-cauin/pedidosAtram/pull/3).
- [CI pós-merge aprovada](https://github.com/kaue-cauin/pedidosAtram/actions/runs/38051229038).
- [Registro pós-merge e limitações](https://github.com/kaue-cauin/pedidosAtram/pull/3#issuecomment-6097400652).
- [IMPLEMENTACAO.md](https://github.com/kaue-cauin/pedidosAtram/blob/f246d1b1f002b9b9094dd5cc937eefd19bd90d5a/docs/etapa7B4B/IMPLEMENTACAO.md) e [VERIFICACAO.md](https://github.com/kaue-cauin/pedidosAtram/blob/f246d1b1f002b9b9094dd5cc937eefd19bd90d5a/docs/etapa7B4B/VERIFICACAO.md).

Esses dois documentos versionados descrevem seu momento pré-integração. O registro do PR e o encerramento comunicado pela gestão atualizam o estado da etapa; suas restrições técnicas permanecem válidas.

Foram localizados e lidos os documentos externos **PLANEJAMENTO-ETAPA-7B4.md** e **CONTRATOS-ETAPA-7B4A(1).md**, de 09/10/2026. Não estão no repositório. O segundo contém a especificação normativa `submission-ledger-v1`, incluindo as seções 7.2, 8.1–8.4 e 9. Nenhuma referência indispensável ficou sem acesso nesta preparação. Recomendo versionar uma cópia identificada dos contratos aprovados na futura branch de implementação, sem incorporar mudanças normativas. O nome “proposta” no documento histórico não concede autorização nova: o aceite informado pela gestão é a referência de aprovação.

Pages conferido novamente: workflow 377535715, estado `disabled_manually`. Não foi reativado. Nenhuma alteração, branch, commit, PR, migration, CI nova ou publicação foi feita nesta preparação. B01–B24 e regressões citados são evidências da integração anterior.

## 2. Arquitetura mínima recomendada

**Executor explícito no processo que obtém a confirmação inédita, transporte sintético de uma única invocação, simulador em processo e PostgreSQL independentes, e atestador interno de laboratório.** Sem fila adicional, scheduler de CREATE, UI ou HTTP público.

O executor consome a intenção já durável imediatamente após sua confirmação. Não busca intenções antigas para enviá-las. Isso segue o contrato aprovado: uma intenção encontrada no boot permite observação/abandono, nunca retomar CREATE.

### Executor e exclusão

`SubmissionRepository.confirm()` já persiste a comunicação CREATE, operationId/executionId, autoria, lease e SUBMITTING antes de retornar. A unicidade `submission_one_capable` ignora o lease. O recibo distingue confirmação inédita (`replay=false`, `result=RECORDED`) de replay e operação existente (`result=EXISTING`).

Somente a chamada interna que recebeu o ACK da confirmação inédita poderá gerar uma capacidade volátil, privada e não serializável de despacho. Vincular a capacidade ao processo, organização/pedido/submissão, operação/execução e época do gate. Consumir uma vez; não exportar em resposta, IPC ou arquivo; não reconstruir de leitura/recibo recuperado. O worker não bifurca nem transfere essa capacidade. Duas chamadas locais com a mesma capacidade também devem competir por consumo síncrono, antes de qualquer await do transporte.

Um replay recupera informação, nunca essa capacidade. ACK de commit perdido não gera capacidade. Crash a perde definitivamente. Este desenho prefere bloquear uma intenção potencialmente nunca enviada a redispará-la sem prova. A segurança pressupõe executores conformes ao módulo, não proteção contra root ou código malicioso com acesso direto ao simulador.

Adicionar ao repositório somente uma validação interna de despacho, usando as funções SQL existentes na mesma transação: replay exato do CONFIRM original, para revalidar papel OPERADOR/autoridade sob locks, seguido de `submission_read` para checar operação e projeção atuais. Não criar novo comando/evento nessa validação. Revalidar sessão, organização, usuário, membership, ownership, holds, ausência de arquivamento, estado SUBMITTING, operação/execução autorizadas, lease não vencido, binding FIXTURE/SYNTHETIC, conta/geração e hashes. Consultar o relógio PostgreSQL para a avaliação do lease. Abrir os envelopes com AAD e comparar os bytes/hashes originais; não remapear payload.

### Simulador independente

Usar um segundo serviço PostgreSQL de teste, banco/pool/credenciais próprios, fora do backup e da falha do ledger. O simulador só conhece o pacote sintético recebido; não lê tabelas da aplicação. Cada efeito é commitado antes de responder. Reinícios de executor, simulador e PostgreSQL de teste preservam os volumes durante o ensaio; a destruição do ambiente de CI não representa retenção operacional.

Dois adaptadores separados:

1. **PostgreSQLERPLedger** de laboratório: implementar a interface existente de recibos/rejeições, preservando binding e unicidade do mock. Não substituir o IndexedDBERPLedger ou o MockERPProvider do MVP.
2. **Simulador não idempotente**: contrato próprio, cria um pedido por CREATE recebido no perfil normal, mesmo repetindo submissionId, operationId e bytes. Não implementar a interface ERPLedger que promete deduplicação. Seu schema de efeitos não tem UNIQUE por submissão/pedido/operação. Uma calibração externa ao executor demonstrará dois efeitos para duas chamadas iguais.

Persistir recebimentos CREATE e efeitos em registros separados: requestId/effectId, identidade sintética da conta, bytes/hash, IDs de correlação e instante. Não contar apenas recibos deduplicados. Recebimento durável sem efeito também precisa ser observável.

Perfis determinísticos: aceitar; perder resposta antes da entrega; criar e perder resposta; HTTP 500 com/sem criação; resposta inválida; atraso; rejeição final com tombstone; resposta contraditória. Transporte restrito a socket local do laboratório, sem destino fornecido pelo payload, redirects ou retry automático. Um status 500 é campo do protocolo sintético e não implica uma rota HTTP pública. Se for usado HTTP nos testes, exclusivamente loopback com configuração fixa e isolada, sem adicionar rotas ao servidor comercial.

O harness tem credenciais administrativas de teste para contar efeitos e controlar barreiras. O executor não recebe essas contagens nem consulta o armazenamento externo como oráculo. Consultas auxiliares e controle por IPC/socket são exclusivos dos testes. Não haverá pesquisa/reconciliação operacional, endpoints administrativos ou UI da 7B.4D/E.

### Atestador e persistência

Uma política nova valida observações de transporte antes de chamar `recordLabEvidence`; nenhuma flag enviada pelo cliente vira prova. Reutilizar fonte LAB_ATTESTATION, criptografia e transações existentes. IDs de observação/evidenceId e commandId interno de persistência ficam estáveis em retries puramente locais. Replay não repete transporte nem evento.

A implementação atual só permite EVIDENCE/ABANDON a ADMIN e autentica a sessão em SQL. Recomendo manter essa regra: o atestador de teste usa **ADMIN de fixture explicitamente atribuído**, independente da sessão do operador. Registrar sua autoria real e o produtor sintético nos detalhes cifrados. Ele não confirma CREATE nem substitui o operador revogado. Não conceder SYSTEM, superusuário ou bypass de RBAC ao executor. Se o atestador também estiver indisponível/revogado, conservar a incerteza até poder registrar a prova; não afirmar sucesso. Essa escolha precisa de aprovação de produto.

## 3. Sequência e fronteiras de falha

1. Harness admite READY sob a identidade autorizada; snapshot e request permanecem cifrados e imutáveis.
2. Confirmação explícita: transação existente grava intenção/IDs/estado/evento. Transporte ainda não foi invocado.
3. Só após ACK do commit inédito, a chamada vencedora recebe a capacidade local. Resultado desconhecido do commit ou replay não a recebe.
4. Revalidação transacional descrita acima; gate externo NORMAL e mesma época antes/depois. Nenhuma rede durante a transação.
5. Nova checagem do gate e do deadline, consumo único da capacidade e uma invocação de transporte. Marcar a fronteira de entrada do transporte para os ensaios. Qualquer possibilidade de envio após essa fronteira será tratada como incerta até prova.
6. Simulador registra recebimento e, quando aplicável, criação em commit independente. Pode falhar antes de devolver resposta.
7. Política valida resposta e vínculo completo. Atestador grava evidência + evento + resultado/estado atomicamente. Somente após ACK desse commit existe confirmação durável SUBMITTED. Sucesso externo conhecido apenas em memória não é sucesso durável da aplicação.
8. Timeout/500/corpo incompleto gera INCONCLUSIVE; abandono supervisionado gera UNKNOWN. Não escolher novo commandId ou submissionId para repetir CREATE. Persistência indisponível pode deixar SUBMITTING no banco até a recuperação; a intenção já bloqueia outra execução. A projeção de consumo deve tratar essa pendência como resultado não confirmado.

**Processo suspenso.** Antes da última checagem, lease vencido/UNKNOWN/hold/revogação impedem o despacho na retomada. Se a suspensão ocorrer depois da última checagem, uma chamada antiga ainda pode produzir efeito, mesmo após o lease. O laboratório demonstrará essa janela. Outra instância nunca recebe autorização para criar: aguarda prova ou mantém UNKNOWN. Não afirmar fencing remoto, cancelamento atômico ou exactly-once externo.

**NO_EFFECT demonstrável.** Exige fechamento da capacidade ainda não consumida, transporte não invocado e encerramento do caminho proprietário sem callback/tarefa/requisição pendente. O supervisor aguarda término real do worker quando necessário; replay/boot não podem reconstruir a capacidade. O relatório identifica a barreira e o mecanismo de fechamento. Se houve consumo da capacidade, falha abrupta, dúvida sobre tarefa pendente ou pedido possivelmente entregue, usar UNKNOWN. SIGKILL depois de possível envio não é prova negativa. Contador zero conhecido pelo harness não é prova para a aplicação.

**ACCEPTED.** Recibo de resposta direta do simulador com externalId, vínculo exato de conta/geração/pedido/submissão/operação/execução, bytes/hash/versão e fonte validada. Gravar antes de declarar sucesso. Outra conta/hash/ID incompleto é observação inválida/inconclusiva, nunca aceitação. Recibo perdido num crash não será recuperado automaticamente por leitura do banco do simulador nesta fase.

**REJECTED_FINAL.** Protocolo controlado exige commit de tombstone no simulador, sob a mesma serialização que a criação: nenhum efeito anterior compatível e toda entrega tardia da submissão rejeitada bloqueada. Validar resposta/prova vinculada e terminal. HTTP 400/401/429/500 sozinho não basta. O perfil de rejeição deliberadamente oferece essa garantia; o perfil não idempotente normal não a oferece. Rejeição falsa ou contraditória põe hold; não ocultar risco. Correção/arquivamento operacional fica fora de C.

**Resposta tardia e contradição.** Prova válida tardia é preservada mesmo com revisão informativa antiga, usando o comportamento já aprovado. Aceitação compatível pode concluir UNKNOWN; contradição mantém recibo terminal e põe conflictHold. Evidência inválida não é promovida a ACCEPTED. Não criar nova execução para obter uma resposta.

**Banco indisponível.** Antes do ACK da intenção, zero transporte. Após intenção e antes de revalidação, zero novo transporte e bloqueio conservador. Depois de efeito, não declarar sucesso nem reenviar; quando voltar, pode repetir apenas a persistência da mesma observação ainda disponível. Se a observação morreu com o processo, manter UNKNOWN. Não haverá spool/outbox de reenvio.

**Restore.** Primeiro quiescer/isolar workers e requisições antigas; controlador ativa RECOVERY_HOLD fora dos dois bancos; depois restaurar somente o ledger. Simulador conserva efeitos. Nem readiness nem linha ausente autorizam envio. Gate ausente/inválido/época divergente também bloqueia. Este protocolo não detecta restore oculto nem cancela chamadas já admitidas; sem prova de quiescência e inventário, hold global permanece. Não implementar liberação de hold ou reconstituição/reconciliação operacional de D.

## 4. Matriz C01–C29 proposta

Todos os casos abaixo são **planejados**. Usar PostgreSQL real, role restrita no ledger, processos independentes e barreiras por IPC. Dois serviços PostgreSQL permitem derrubar o da aplicação sem derrubar o simulador. Rodar os casos pertinentes nos dois perfis; a segurança contra reenvio deve passar especialmente no não idempotente.

Contagens: **I/R/P/O/E/V** = invocações de CREATE pelo executor / CREATE recebidos pelo simulador / pedidos externos criados / operações CREATE duráveis / novos eventos `submission_events` / evidências duráveis. Fixture padrão: uma READY, com REGISTER e ADMIT já existentes; E é o delta após essa preparação. READ, validação por replay e replays não adicionam E. Auditoria de denegação em `audit_events` é contada separadamente. Só ações de OWNER/CONFIRM/ABANDON/EVIDENCE efetivamente commitadas entram em E. Nenhuma operação LOOKUP é criada nesta matriz.

| Caso | Preparação e falha/barreira | Resultado esperado | I/R/P/O/E/V |
|---|---|---|---|
| C01 | READY; sucesso normal, commits independentes | SUBMITTED; recibo exato durável | 1/1/1/1/2/1 |
| C02 | Dois processos, mesmo operador autorizado; 100 confirmações do mesmo comando/corpo/revisão | Um vencedor e uma capacidade; demais replays | 1/1/1/1/2/1 |
| C03 | C08; 1.000 replays exatos após timeout, em dois processos | UNKNOWN; zero acréscimo em todas as contagens | 1/1/1/1/2/1 |
| C04 | Falha injetada antes do commit da intenção; rollback confirmado | READY, zero despacho | 0/0/0/0/0/0 |
| C05 | Descartar ACK após commit da intenção no adapter do teste | Sem capacidade; supervisor registra ABANDON; UNKNOWN | 0/0/0/1/2/0 |
| C06 | Falha controlada após intenção e antes de consumir capacidade; fechamento/término demonstrados | ERROR/NO_EFFECT, snapshot ocupante | 0/0/0/1/2/1 |
| C07 | Invocar transporte, falha injetada antes de entregar; sem prova negativa no protocolo | UNKNOWN mesmo com P=0 conhecido só pelo harness | 1/0/0/1/2/1 |
| C08 | Simulador commita criação e descarta resposta | UNKNOWN, efeito externo persistente; nenhum reenvio | 1/1/1/1/2/1 |
| C09 | SIGKILL real do executor após commit externo e antes de commit da prova | Após restart, ABANDON/UNKNOWN; contador conserva efeito | 1/1/1/1/2/0 |
| C10 | Simulador cria e atrasa a resposta além do deadline; INCONCLUSIVE, depois resposta direta válida da mesma execução | UNKNOWN→SUBMITTED; duas provas preservadas | 1/1/1/1/3/2 |
| C11 | Após aceitação C01, observação contraditória injetada e classificada INCONCLUSIVE | SUBMITTED/recibo preservados, conflictHold; sem outro CREATE | 1/1/1/1/3/2 |
| C12 | SIGSTOP real antes da checagem final; lease vence; outro processo faz ABANDON; SIGCONT | Retomada bloqueada; UNKNOWN; lease não elege substituto | 0/0/0/1/2/0 |
| C13 | SIGSTOP após a última checagem e consumo da capacidade, antes da chamada; vence lease/ABANDON; SIGCONT | Efeito antigo ainda pode ocorrer; nenhum substituto; resposta válida tardia conclui | 1/1/1/1/3/1 |
| C14 | Parar realmente PostgreSQL da aplicação antes da confirmação; simulador continua ativo | Zero transporte; READY intacta após retorno | 0/0/0/0/0/0 |
| C15 | Parar realmente PostgreSQL após intenção e antes da revalidação | Zero transporte; após retorno, ABANDON/UNKNOWN | 0/0/0/1/2/0 |
| C16 | Parar PostgreSQL após efeito; recibo preservado no atestador; prova não commita | Sem sucesso durável durante falha; retorno: ABANDON e mesma prova concluem | 1/1/1/1/3/1 |
| C17 | SIGKILL depois da intenção e antes de transporte; boot de processo novo | Não recuperar capacidade; ABANDON/UNKNOWN, mesmo P=0 | 0/0/0/1/2/0 |
| C18 | Reiniciar com READY sem confirmação | READY abandonado permanece ocupante; nenhum cancelamento/CREATE | 0/0/0/0/0/0 |
| C19 | Gate RECOVERY_HOLD, ausente ou inválido antes do CONFIRM; subcasos separados | Confirmação negada; nenhuma capacidade | 0/0/0/0/0/0 |
| C20 | Ativar hold/mudar época após intenção e antes de checagem final | Zero despacho; ABANDON/UNKNOWN; não liberar gate | 0/0/0/1/2/0 |
| C21 | Backup do ledger em READY; criar externamente; quiescer, hold, restore real do backup; simulador intacto | READY antiga sob hold global; operação perdida documentada, sem CREATE novo | 1/1/1/0/0/0* |
| C22 | Revogar sessão/membership depois da intenção e antes de checagem; worker fecha capacidade não consumida comprovadamente | Zero transporte; ADMIN de fixture registra NO_EFFECT, sem restaurar sessão | 0/0/0/1/2/1 |
| C23 | ADMIN transfere owner após intenção e antes da checagem; fechamento seguro do worker antigo | Zero transporte; OWNER auditado, NO_EFFECT; novo owner não recebe capacidade antiga | 0/0/0/1/3/1 |
| C24 | Rejeição terminal com tombstone persistente; harness tenta entrega tardia da mesma submissão | ERROR/REJECTED_FINAL; ambas entregas sem efeito | 1/2/0/1/2/1** |
| C25 | HTTP 500 sintético sem efeito (a) e após efeito (b), sem prova terminal; corpos inválidos/200 sem ID são subcasos próprios | UNKNOWN nos dois perfis; status não libera CREATE | a: 1/1/0/1/2/1; b: 1/1/1/1/2/1 |
| C26 | Calibração direta do simulador não idempotente: duas chamadas iguais, sem executor/ledger; restart do simulador e seu PostgreSQL | Dois pedidos conservados; demonstrar ausência de deduplicação externa | 0/2/2/0/0/0** |
| C27 | Depois de C06, novo CONFIRM explícito, mesma tentativa/bytes, nova operação; sucesso | Antiga definitivamente fechada; só a segunda invoca transporte | 1/1/1/2/4/2 |
| C28 | Após C01, tentar anexar prova com outra organização/conta/hash/execução; subcasos separados | Negação sanitizada; recibo/bytes originais intactos; nenhuma evidência falsa | 1/1/1/1/2/1; audit_events +1 por tentativa |
| C29 | C08; reiniciar realmente simulador e seu PostgreSQL, depois executor; testar isoladamente o classificador com observação vazia, sem gravar outra evidência | Contador mantém P=1; aplicação não consulta o oráculo nem libera CREATE; classificador retorna INCONCLUSIVE para vazio | 1/1/1/1/2/1 |

\* C21 conta o ledger **restaurado**: a operação/evento CONFIRM posterior ao backup foi perdida. Antes do restore havia O=1 e E=1, V=0; o efeito externo permanece P=1. Manifesto do ensaio preserva ambos os conjuntos. A inspeção posterior não cria evidência/conclusão nova; o hold é externo e não entra em E.

\** C24 tem uma chamada auxiliar do harness, além da única invocação do executor; C26 tem duas chamadas auxiliares e nenhuma do executor. Registrar separadamente os emissores, sem esconder chamadas em R. O tombstone de C24 precisa sobreviver ao restart; P continua zero após a entrega tardia. C26 prova o comportamento normal sem tombstone ou idempotência.

C05/C07/C08/C11/C25 e a observação vazia C29 são injeções controladas, não quedas físicas de rede/servidor. C09/C12/C13/C14–C17/C21/C29 usam sinais/paradas/restauração reais identificados. Não usar sleeps como única prova da ordem: barreiras confirmam cada fronteira; para lease vencido, confirmar o vencimento no relógio PostgreSQL. C13 tem liberação determinística para produzir o efeito antigo e evidenciar a limitação, sem chamá-la de proteção remota.

Cada caso também deve verificar snapshot/AAD/bytes, IDs estáveis, potentialEffect/safeClosedAt, revisões, original commandReceipt, eventos sequenciais, autoria e ausência de chamadas Tiny. Não criar evidência negativa a partir de contagem administrativa do simulador. C29 não implementa LOOKUP/reconciliação: apenas prova que uma observação vazia não é autorização de execução.

### Critérios de aceite

- Todos os casos C e B01–B24 passam no SHA efetivamente executado, com contagens verificáveis e nenhum teste crítico ignorado.
- Uma execução incerta impede novo CREATE inclusive com mil replays e simulador não idempotente. Lease/finishedAt/ABANDON não fecham potentialEffect.
- C01/C10/C16 comprovam que SUBMITTED depende de prova e commit; C06/C24 comprovam os mecanismos de fechamento/rejeição, não apenas booleanos.
- C13 demonstra a janela residual: efeito antigo possível, segunda chamada bloqueada. Se a gestão exigir cancelamento absoluto após lease/revogação, essa alternativa não atende e precisa de novo desenho aprovado.
- Regredir 7B.1, 7B.2, 7B.3, dados e Etapas 2–6; executar typecheck, lint, build, boundary e performance Node já existente. Preservar frontend/MockERPProvider/IndexedDB/autosave/entrada rápida por diff e regressões. Não atribuir a Node nova homologação de navegador.
- Relatório por C, logs com SHA, artefatos de contagens dos dois armazenamentos e manifestos de processos/barreiras; dados exclusivamente sintéticos, sem payloads/credenciais comerciais.
- Pages suspenso; nenhuma implantação. Produção, SLA, RPO/RTO, exactly-once e Tiny continuam fora do aceite.

## 5. Arquivos previstos, apenas para futura implementação

| Caminho previsto | Alteração mínima |
|---|---|
| `backend/submissions/lab/executor.ts` | CONFIRM inédito→capacidade local única→revalidação→uma chamada; não consumir fila/boot |
| `backend/submissions/lab/transport.ts` | Protocolo sintético restrito, sem retry/redirect/destino arbitrário |
| `backend/submissions/lab/evidence-policy.ts` | Validar observações, fechamento e provas antes da atestação existente |
| `backend/submissions/lab/observer.ts` | Observação/ABANDON autenticados pelo ADMIN de fixture; nunca CREATE/reconciliação operacional |
| `backend/submissions/repository.ts` | Método interno de revalidação transacional usando SQL existente; proteger fronteira de atestação |
| `backend/tests/stage7b4c/{fixtures,worker,simulator,barriers}.mjs` | Dois bancos/processos independentes, falhas e contadores; DDL exclusivo de fixture do simulador |
| `backend/tests/stage7b4c/postgresql-erp-ledger.ts` | Adapter idempotente da interface existente, apenas no laboratório |
| `backend/tests/stage7b4c/execution.test.mjs` | Matriz C01–C29, sinais reais e manifestos |
| `package.json` | Script `check:stage7b4c`; preservar scripts existentes |
| `docs/etapa7B4C/{PROPOSTA,IMPLEMENTACAO,VERIFICACAO}.md` | Proposta aprovada, garantias, resultados/SHA e limitações, quando autorizados |
| `docs/etapa7B4A/CONTRATOS-ETAPA-7B4A.md` | Cópia identificada do contrato aprovado, sem modificar seu conteúdo normativo |

**Nenhuma migration nova do ledger é prevista nesta alternativa.** O simulador exige DDL próprio de bancos descartáveis, não migrations da aplicação. Não modificar `0003_submission_ledger.sql`, o schema/constraints/roles do ledger, canonicalizador, snapshots ou contratos legados. Se a implementação descobrir que precisa de claim persistente adicional, ator SYSTEM ou mudanças de grants, interromper e apresentar o diff/desenho para revisão; não introduzir silenciosamente migration ou poder novo.

O workflow backend precisaria de um segundo serviço PostgreSQL, execução da suíte C e upload de logs/manifestos para automatizar o gate. A proibição vigente de editar workflows permanece: essa mudança só pode ocorrer com autorização específica. Como alternativa sem edição, validar C em ambiente isolado autorizado com logs completos, mantendo a CI existente para regressões e declarando que C não foi executada nela. Pages não é parte de nenhuma alternativa.

## 6. Decisões para aprovação de produto

1. Aprovar executor explícito e capacidade efêmera: perder ACK/processo pode deixar UNKNOWN indefinido mesmo sem efeito. Não implementar consumidor que retome intenção no boot.
2. Aceitar a janela C13 e o bloqueio conservador; sem promessa de fencing externo/exactly-once. Exigir garantia mais forte implica proposta separada, não alterar `submission-ledger-v1` silenciosamente.
3. Aprovar atestador ADMIN de fixture, atribuição explícita e produtor em detalhes cifrados, sem elevar privilégios do operador ou implementar SYSTEM.
4. Aprovar dois PostgreSQL de teste e o adapter idempotente + simulador não idempotente separados, com consultas/controles apenas no harness.
5. Escolher gate C automatizado por alteração limitada do workflow backend, ou execução isolada sem editar workflows. Recomendo automatização limitada; requer autorização expressa.
6. Aprovar cópia versionada do contrato externo e a matriz C01–C29. Não há mudança normativa proposta; qualquer alteração exigirá destaque, revisão e nova aprovação.

Não é necessário reabrir decisões de identidade, estados, snapshot, permissões comerciais, READY sem cancelamento, recuperação conservadora ou preservação do MVP. As escolhas acima completam somente a execução de laboratório.

## 7. Texto proposto para autorização, ainda não aprovado

> Autorizo exclusivamente a implementação da Etapa 7B.4C — Execução simulada, a partir da main `f246d1b1f002b9b9094dd5cc937eefd19bd90d5a`, conforme esta proposta e o contrato `submission-ledger-v1`, em branch local separada. Se a main tiver avançado, apresentar avaliação das alterações antes de implementar sobre outra base.
>
> Aprovo o executor explícito com capacidade única não recuperável por replay/boot, o bloqueio conservador de intenção incerta, a janela residual de execução antiga demonstrada em C13, o atestador ADMIN de fixture sem privilégios de CREATE, os dois PostgreSQL descartáveis de teste e os simuladores idempotente e não idempotente. Autorizo o DDL exclusivamente dos bancos sintéticos do simulador, os testes C01–C29 e as regressões pertinentes. Não autorizo nova migration do ledger nem mudança normativa silenciosa.
>
> Autorizo especificamente a edição local e limitada de `.github/workflows/backend.yml` para adicionar o segundo PostgreSQL de teste, a suíte C e seus artefatos, preservando os gates atuais e sem acrescentar deploy. Essa autorização não inclui o workflow Pages, nem sua reativação. Se essa edição não for aprovada, a implementação deverá manter o workflow intacto e apresentar execução isolada de C, identificando a limitação de CI.
>
> Autorizo a documentação técnica e a cópia identificada do contrato aprovado na branch local. Não autorizo publicar a branch, abrir PR, merge, auto-merge, alteração direta da main, deploy, reativação/publicação Pages, implantação de backend/PostgreSQL, comunicação real Tiny/Olist, recuperação automática ou início da 7B.4D/E/F ou 7C. A publicação para revisão dependerá de autorização separada. O aceite da 7B.4C dependerá da revisão do SHA, testes, contagens, artefatos e limitações.

Este texto é uma proposta para a gestão. A autorização atual cobre somente esta preparação; nenhuma implementação ou edição de workflow foi realizada.
