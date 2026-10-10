# Atram Comercial — contratos da Etapa 7B.4A

**Entrega documental para aceite da gestão de produto. Não autoriza a implementação da 7B.4B.**

Data: 09/10/2026, America/Sao_Paulo. Versão do contrato: proposta `submission-ledger-v1`. Baseline local e main remota conferidas: `0dc5404cd913f7ad35653e422dab5b5ebb884953`. Repositório: [pedidosAtram](https://github.com/kaue-cauin/pedidosAtram/tree/0dc5404cd913f7ad35653e422dab5b5ebb884953).

Base: documento aprovado `PLANEJAMENTO-ETAPA-7B4.md`, versão atual consultada integralmente. Esta fase especifica regras futuras; não cria tabelas, rotas, migrations, código de produção ou testes de integração. Nada foi alterado no repositório, Pages ou Tiny/Olist. Contratos normativos abaixo valem para o futuro caminho backend de laboratório, não como descrição de funcionalidades já implementadas.

## 1. Decisões incorporadas e alcance

| Classificação | Conteúdo |
|---|---|
| Aprovado expressamente | Executar somente 7B.4A; preservar MVP e contratos anteriores; monólito modular; infraestrutura exclusivamente sintética; não iniciar 7B.4B/7C |
| Obrigatório pela autorização | UNKNOWN bloqueado até prova conclusiva; nenhum reenvio automático por timeout, HTTP genérico, lease ou consulta vazia; nenhuma nova criação enquanto execução antiga puder produzir efeito |
| Orientação de produto incorporada | ADMIN consulta/resolve pendências da organização; OPERADOR prepara/confirma pedidos autorizados; VENDEDOR acessa somente pedidos sob sua responsabilidade |
| Formalização técnica para aceite deste documento | Identidade e revisões das seções 2–4; contratos de comandos, evidência, imutabilidade e recuperação; preservação do mock por caminho separado |
| Recomendação ainda não aprovada operacionalmente | Responsáveis, tempos de atendimento/escalonamento, retenção, RPO/RTO, compartilhamento de conta ERP, extensão dos poderes de ADMIN/VENDEDOR e valores finais de limites |

A aprovação da arquitetura não aprovou automaticamente todos os números ou políticas sugeridos no planejamento. O quadro da seção 12 identifica os pontos que precisam de confirmação. Nenhuma dúvida operacional concede licença para despachar resultado incerto.

Garantia delimitada: o backend coordena submissões **do mesmo pedido autoritativo**, impede execuções concorrentes e replays inseguros e preserva prova. Não garante deduplicação comercial entre pedidos com identidades distintas nem execução externa exatamente uma vez sem contrato externo comprovado. Um sistema externo pode aceitar e perder a resposta; PostgreSQL não torna seu commit atômico com o ERP.

## 2. Identidade, revisão e concorrência

### 2.1 Identificadores

| Campo | Autoridade e regra |
|---|---|
| `localOrderId` | Valor `Order.orderId` no IndexedDB atual. Identifica o rascunho/origem local; não comprova organização, ownership ou existência backend |
| `authoritativeOrderId` | UUID atribuído pelo servidor a uma âncora na organização autenticada. É o `order_id` das futuras tabelas; distinto semanticamente e, nesta proposta, também em valor do localOrderId |
| `originLocalOrderId` | Identidade local original vinculada à âncora, imutável. Unicidade organização/origem evita que repetir o cadastro do mesmo rascunho crie outra âncora. Não é uma credencial de acesso |
| `submissionId` | UUID estável gerado/persistido pelo cliente antes da admissão; servidor valida e vincula à organização/âncora. Identifica um snapshot/destino, não uma chamada de rede. Não muda depois de timeout |
| `commandId` | UUID por comando lógico, reutilizado no retry HTTP. Unicidade na organização, com tipo, recurso, ator e digest da requisição registrados. Um operador diferente usa seu próprio comando, mas continua disputando a mesma âncora/submissão. Novo commandId não libera outra criação |
| `operationId` / `executionId` | UUIDs do servidor para comunicação e executor. Um comando confirm pode apontar para uma comunicação já existente; não atribuir nova execução em cada replay |
| ID externo | Identidade retornada pelo simulador/ERP, vinculada à conta e à prova. Número comercial apresentado não substitui esse ID |

Cadastro futuro de âncora é uma operação de identidade, sem upload contínuo de rascunhos. Cliente guarda a associação local→backend em envelope de laboratório separado. Retry do cadastro usa o mesmo commandId/originLocalOrderId; perda da resposta não gera novo UUID autoritativo. Se a origem já existe, retornar sua âncora somente após autorização por recurso; não transferir ownership a quem adivinhou o UUID.

Dois operadores identificam o mesmo pedido mediante **a mesma referência backend obtida por consulta autorizada ou compartilhamento explícito**, incluindo a origem local. Não atribuir identidade por cliente/valor/data nem sincronizar rascunhos colaborativamente. Para o laboratório, uma fixture/exportação explícita entrega a mesma origem e referência aos dois operadores; alterações locais divergentes competem na admissão. Uma cópia com outro localOrderId não é anexada silenciosamente à âncora: conflito exige recuperar a origem correta ou revisar uma importação ainda DRAFT antes de congelá-la. Snapshots já iniciados nunca são reescritos para ajustar identidade.

O payload canônico legado continua contendo o **orderId local original**. O envelope backend acrescenta authoritativeOrderId e organização derivada da sessão; não substitui esse campo dentro de bytes já revisados. Servidor exige `payload.orderId = originLocalOrderId` da âncora. Recibo mock continua usando esse valor legado; as FKs backend usam authoritativeOrderId. Isso evita quebrar `assertSubmissionIntegrity` e os recibos aprovados.

### 2.2 Revisões

Três contadores independentes, sem uso intercambiável:

- `sourceLocalRevision`: revisão CAS do IndexedDB, informativa no backend. Dois browsers podem ter valores iguais para conteúdos diferentes.
- `orderRevision`: servidor inicia em 0 ao cadastrar âncora; admissão nova exige expectedOrderRevision atual e incrementa para 1. Arquivamento/correção incrementa de novo; nova admissão incrementa novamente. Replay exato não incrementa. Não mede cada tecla nem muda por leitura/ownership.
- `ledgerRevision`: começa em 1 ao admitir a tentativa; incrementa em cada transição ou mudança de guardas decisória, na mesma transação dos eventos. LOOKUP solicitado/concluído, conflito e resolução mudam a revisão; GET/replay não. `anchorRevision` separado protege mudança de ownership/ponteiros, sem alterar o snapshot.

Exemplo: âncora orderRevision=0 → admissão A=1; rejeição e arquivamento=2 → admissão B=3. Não aceitar B com expected=1. A conserva orderRevision=1 para sempre. expectedLedgerRevision da confirmação não é sourceLocalRevision.

Replay autenticado é reconhecido **antes** de comparar revisão atual: o comando existente precisa ter o mesmo ator, recurso e corpo/digest original, inclusive expected revision. Pode devolver seu recibo original e a projeção atual mesmo se a revisão avançou. Novo comando com revisão antiga dá 409. Reutilização de commandId em outro recurso/tipo/conteúdo/ator dá conflito sanitizado, sem executar.

### 2.3 Invariantes

| ID | Regra obrigatória |
|---|---|
| I01 | Toda identidade, FK, consulta, CAS e evento tem organizationId proveniente da sessão, nunca autoridade do corpo |
| I02 | Uma âncora tem no máximo uma tentativa ocupante; SUBMITTED/UNKNOWN/SUBMITTING não liberam o pedido |
| I03 | Mesma submissionId tem exatamente uma âncora, revisão de admissão, conteúdo e destino; conflito não sobrescreve |
| I04 | Bytes/hashes/versões/binding congelados na admissão; conteúdo iniciado não é editável |
| I05 | Intenção e autorização duráveis precedem qualquer chamada externa; transação não inclui rede |
| I06 | CREATE inconclusivo ou ainda capaz de efeito impede outro CREATE, qualquer que seja a chave/comando/processo |
| I07 | Lease vencido indica abandono, não ausência de efeito. Fencing local não cancela requisição já no sistema externo |
| I08 | SUBMITTED exige evidência vinculada e commit durável; sucesso HTTP do nosso backend não equivale a sucesso ERP |
| I09 | UNKNOWN só é resolvido por prova; lookup vazio e decurso de tempo não são provas negativas |
| I10 | Arquivamento permite nova tentativa somente após rejeição definitiva de conteúdo e ausência de execução antiga capaz de efeito |
| I11 | Eventos/evidências não se apagam ou se editam para liberar unicidade. Respostas antigas não restauram sessão/credenciais/conexão |
| I12 | Digitação, autocomplete, totais e autosave não dependem do ledger/rede; offline não envia automaticamente ao reconectar |

Pedidos diferentes que representam a mesma venda continuam um risco comercial. Não bloquear duas vendas legítimas porque seu hash coincide. Não oferecer “duplicar UNKNOWN para reenviar” como escape. Cadastro compartilhado completo e deduplicação semântica permanecem fora do escopo.

## 3. Matriz formal dos sete estados

### 3.1 Autoridade e matriz completa

DRAFT/VALIDATING são preparação local; READY local é revisão transitória. A tentativa backend nasce em READY somente quando admitida. Não criar artificialmente linhas backend DRAFT/VALIDATING para todo rascunho. Estado local pode estar SUBMITTING enquanto o backend ainda está READY por perda de confirmação: consulta e envelope explicam essa diferença, sem projetar READY inválido no IndexedDB legado.

Destino nas colunas; `—` proibido; `P` preparação; `F` falha pré-despacho; `X` intenção; `A` aceitação; `R` prova sem efeito; `U` incerteza; `C` arquivar/corrigir **projeção do pedido**, não reescrever tentativa; `S` mesma situação sem novo CREATE. Cada célula permitida depende das regras abaixo. Esta matriz é normativa para o novo backend; o mock atual conserva seu comportamento homologado.

| Origem \ destino | DRAFT | VALIDATING | READY | SUBMITTING | SUBMITTED | ERROR | UNKNOWN |
|---|---|---|---|---|---|---|---|
| DRAFT | S | P | — | — | — | — | — |
| VALIDATING | P | S | P | — | — | — | — |
| READY | — | — | S | X | — | F | — |
| SUBMITTING | — | — | — | S | A | R | U |
| SUBMITTED | — | — | — | — | S | — | — |
| ERROR | C | — | — | X | A | S | U |
| UNKNOWN | — | — | — | — | A | R | S |

READY admitido não pode voltar a DRAFT para editar/cancelar. Revogação de preparação exigiria um novo protocolo; excluída da v1. Admissão deverá ocorrer somente depois da revisão/confirmar do operador, reduzindo esse intervalo. ERROR→SUBMITTING é **novo comando explícito**, mesma tentativa, bytes e binding; nunca replay automático de HTTP.

### 3.2 Eventos, pré-condições e prova

| Código / transição | Pré-condição | Evento/evidência durável |
|---|---|---|
| P: DRAFT→VALIDATING | Pedido editável; revisão local capturada | Preparação local; nenhum CREATE/backend obrigatório |
| P: VALIDATING→DRAFT | Validação falhou ou conteúdo mudou antes da admissão | Mensagens locais; rever conteúdo |
| P: VALIDATING→READY | Schema/negócio válidos e revisão mostrada | READY transitório local; admissão cria `ADMITTED` backend com bytes, versões, ator e ordem revisões |
| F: READY→ERROR | Falha de confirmação comprovadamente anterior à intenção/possível efeito | `PRE_DISPATCH_BLOCKED`, código e prova NO_EFFECT; snapshot não libera automaticamente |
| X: READY/ERROR→SUBMITTING | Permissão, CAS, binding, flags sintéticas, recovery gate liberado, nenhuma operação capaz/incerta; ERROR tem prova segura e prazo cumprido | `DISPATCH_INTENT`, execução única; commit confirmado antes da rede |
| A: SUBMITTING/UNKNOWN/ERROR→SUBMITTED | Aceitação exata compatível, ID externo e checks, sem contradição pendente | `ACCEPTANCE_COMMITTED` + evidenceId; recibo e estado no mesmo commit |
| R: SUBMITTING/UNKNOWN→ERROR | Prova NO_EFFECT ou REJECTED_FINAL e nenhuma execução antiga capaz; não inferida de HTTP/lookup vazio | `NO_EFFECT_PROVEN` ou `REJECTION_PROVEN`; reason/retryAt/operationId |
| U: SUBMITTING→UNKNOWN | Timeout, comunicação abandonada, resposta inválida, banco falhou após possível envio | `OUTCOME_UNCERTAIN`; preservar intenção e bloqueio |
| U: ERROR→UNKNOWN | Prova usada para ERROR perdeu validade/consulta de correção falhou ou contradição sem aceitação resolvida | `EVIDENCE_INVALIDATED`/`CONFLICT_DETECTED`; nenhum retry |
| C: ERROR→DRAFT da projeção | REJECTED_FINAL de conteúdo, checks renovados, nenhum CREATE antigo capaz, CAS e autorização | `REJECTION_ARCHIVED`; releasedAt + revisão da âncora + histórico; tentativa antiga continua ERROR e não despacha |
| S: auto-transição | GET/replay não muda revisão; LOOKUP/nota/prova nova pode gerar evento sem criar | `LOOKUP_REQUESTED/COMPLETED`, `NOTE_ADDED`, `CONFLICT_DETECTED` quando aplicável |

Estados recuperáveis: READY aguarda confirmação explícita; ERROR seguro permite retry explícito da mesma tentativa ou correção de conteúdo; SUBMITTING abandonado vira UNKNOWN; UNKNOWN permite só investigação/resolução. SUBMITTED é terminal. ERROR arquivado é terminal **para despacho**, não licença para ignorar evidência contraditória posterior.

Se aparecer aceitação depois de uma rejeição arquivada, guardar prova, colocar âncora e todas as tentativas relacionadas em guarda de conflito e abrir incidente; nenhum novo CREATE. Se já houve nova tentativa, investigar ambas. Só ADMIN pode confirmar aceitação histórica comprovada por protocolo de incidente, sem reativar CREATE antigo. Refinamento do planejamento: “arquivado terminal” proíbe execução e edição, mas não suprime a verdade de um efeito externo posteriormente comprovado. Não afirmar prevenção absoluta quando a prova externa de rejeição era falsa.

SUBMITTED com evidência posterior contraditória **não regride** para UNKNOWN: mantém estado/recibo, recebe conflictHold e bloqueio administrativo; não substituir o ID pelo candidato mais recente. Resolução de conflito exige prova e auditoria, não last-write-wins. Requisição inválida rejeitada antes de admissão deixa DRAFT, não inventa ERROR backend.

## 4. Resultado, evidências e autorização de nova execução

### 4.1 Semântica interna

| Resultado | Significado | Consequência |
|---|---|---|
| `NO_EFFECT` | Nosso transporte comprovadamente não foi invocado; execução definitivamente encerrada, sem possibilidade futura | ERROR; retry explícito pode ser elegível |
| `REJECTED_FINAL` | Rejeição de submissão comprovada exclui criação passada **e aceitação tardia**; comunicação encerrada | ERROR; conteúdo rejeitado permite arquivamento/correção |
| `ACCEPTED` | Recibo/evidência identificam efeito exato na conta/destino/execução | SUBMITTED após commit |
| `INCONCLUSIVE` | Nenhuma prova suficiente, inclusive candidato ausente, timeout, corpo incompleto ou intenção abandonada | UNKNOWN; bloqueio de CREATE |
| `CONFLICT` | Evidências incompatíveis, conta/bytes divergentes, múltiplos candidatos ou IDs contraditórios | UNKNOWN + conflictHold; se já SUBMITTED manter terminal + hold |

Não usar uma única flag `rejected` para representar essas distinções. Comunicação separa outcome, `potentialEffect` e `safeClosedAt`. safeClosedAt é prova da extinção da possibilidade, não finishedAt/leaseUntil. Finishing um timeout não fecha seu potencial efeito. Uma aceitação conhecida já bloqueia novas criações pela tentativa/pedido, mesmo com comunicação encerrada.

Classificação é do servidor/política de evidência, nunca enviada pelo cliente como autoridade. HTTP 400/401/429 não basta para REJECTED_FINAL; no mock controlado pode haver prova contratual. HTTP 500, timeout antes ou depois percebido e sucesso sem ID são INCONCLUSIVE. Retry-After define quando investigar/confirmar um ERROR seguro, não autoriza replay de CREATE. Refresh legítimo não implica retry de escrita.

### 4.2 Estrutura e validade de evidência

Evidência contém organização, âncora, submissionId, operationId/executionId quando houver, origem, observedAt/receivedAt do servidor, conta/geração, IDs externos, hashes/versões, checks executados, referência protegida dos detalhes e autoria/justificativa manual. Não guardar Authorization, cookies ou tokens. Payload bruto arbitrário não pode ser anexado como prova sem validar schema, tamanho e acesso.

Aceitação de resposta direta exige comunicação registrada, identidade/conta compatíveis e recibo completo. Lookup exige identificação inequívoca e dados compatíveis com o snapshot/mapper. Similaridade de cliente/data/total não comprova identidade. Ausência, 404, paginação incompleta ou atraso de indexação não comprovam não execução. Um candidato único não é garantia de unicidade externa.

O contrato interno de reconciliação retorna ACCEPTED/REJECTED_FINAL/INCONCLUSIVE/CONFLICT e evidências, em vez de atribuir a `null` a certeza de ausência. A 7B.4 consulta somente simuladores. Capacidade da API Tiny real continua não homologada; não acrescentar pressuposto de Idempotency-Key, filtros conclusivos ou referência comercial única. A consulta pública histórica citada no planejamento não autoriza acesso real nem comprova garantias de execução.

Uma prova negativa somente pode liberar a operação se excluir também executores suspensos/requisições antigas pendentes. Abortar socket/processo ou ver lease vencido não comprova rejeição de requisição já aceita externamente. Administrador não pode substituir prova por “acredito que não foi”.

## 5. Compatibilidade e vetores de contrato

### 5.1 Fronteira com o MVP

| Contrato atual | Regra de introdução futura |
|---|---|
| `SubmissionCoordinator.reconcile()` | Mock mantém null→ERROR/not-found aprovado. O backend usa serviço conservador separado; não conectar seu INCONCLUSIVE a esse ramo. Não usar `submit()` atual como máquina backend sem adapter/política específica |
| `ERPProvider` / `ERPFailure` | Fachada permanece inalterada; comentário de atomic binding não prova capacidade Tiny. DTO interno de execução/evidência enriquece certeza, sem estender silenciosamente significado de rejected/null |
| `MockERPProvider` / `ERPLedger` | Reutilizar cenários e interface para simulador idempotente; distinguir ledger do ERP fictício do ledger da aplicação. Simulador não idempotente tem contrato próprio de laboratório, não viola a promessa do ERPLedger atual |
| `assertOrderTransition` | Continua protegendo formatos locais/histórico/recibo. Não representa matriz completa nem autorização backend; regras novas operam em módulo separado e em constraints de banco |
| `validateDraft` / IndexedDB 1/2/3 | Sem alteração nesta fase. DRAFT/SUBMITTING/SUBMITTED/ERROR/UNKNOWN são persistíveis; READY/VALIDATING backend não são gravados como status legado. Dados antigos não são apagados nem promovidos automaticamente |
| Bytes canônicos | `submissionPayload` ordena recursivamente chaves, preserva ordem dos arrays e strings, exclui somente status/submissionId/submission/submissionHistory/submissionEvents. Não presumir RFC 8785, normalização Unicode ou DTO comercial Tiny |
| `connection_generation` | Binding captura connectionId, organização, provider, conta verificada e geração. token_version pode variar por refresh sem invalidar identidade. Troca/desconexão muda geração; nunca remapear tentativa para conta nova |
| Autosave/catálogo | Fila local e catálogo A/B intocados. Envelope de laboratório só escrito após revisão/consulta, fora do caminho de entrada; no Pages, provider mock permanece padrão |

Interface de laboratório futura precisa guardar, em namespace separado, associação autoritativa, mode, revisões, binding, commandIds e status durável. Ela não chama reconcile legado para interpretar ausência backend e não importa UNKNOWN/SUBMITTED mock como tentativa real. Validar projeção com os contratos legados; se um estado backend não cabe com segurança, manter status local congelado e apresentar detalhe pelo envelope. A 7B.4B não implementa esse adapter de UI, previsto em fase posterior.

### 5.2 Bytes, hashes e admissibilidade

Contrato `legacy-order-canonical-v1`: serialização efetiva de submissionPayload na baseline, UTF-8, SHA-256 em hex minúsculo; sem newline final nos bytes, sem BOM. Hash é índice de integridade, não assinatura nem chave de deduplicação comercial. Replay exige **bytes iguais**, contexto igual e versão igual, não apenas hash. Novas admissões rejeitam undefined, campos desconhecidos, objetos não JSON, NaN/Infinity, números de preço fora de safe integer e formato inválido antes da canonicalização; não “corrigir” snapshots antigos.

Vetores abaixo foram **calculados nesta fase com Node v24.19.0 chamando a função existente e SHA-256**, sem escrever código de produção. V01–V05 são recortes mínimos de serialização, não pedidos válidos para admissão. V06 é pedido mock completo existente. Essa verificação documental não equivale a testes PostgreSQL, concorrência, integração ou navegador.

| ID | Bytes canônicos esperados | UTF-8 | SHA-256 |
|---|---|---:|---|
| V01 | `{"items":[{"productId":"p-1","quantity":1}],"notes":"ação","orderId":"o-1"}` | 77 | `717c5a8b9c62219481aa56487bde85c6b5dc2d08d8ccb45c948f7ccbc8484b74` |
| V02 | Exatos bytes de V01, mesmo alterando ordem das chaves e campos excluídos de controle | 77 | `717c5a8b9c62219481aa56487bde85c6b5dc2d08d8ccb45c948f7ccbc8484b74` |
| V03 | `{"items":[{"productId":"p-1","quantity":2}],"notes":"ação","orderId":"o-1"}` | 77 | `1397986323d03313dc61d49c3e522d5c14d32d4531d00407fabb1a25d387b599` |
| V04 | `{"items":[],"notes":"é","orderId":"o-1"}`; é = U+00E9 | 41 | `f338760ebf241e0e8661919f7ab176675a1f710cc71e5d77fc8e4eddceb2b228` |
| V05 | Mesmo recorte, notes = U+0065 U+0301, visualmente é | 42 | `d0c7498df8b44e32ef1ee7d3827dd601612c0e1db63bd9f27ed7003f01e58b67` |
| V06 | submissionPayload de `demoOrder` exportado por domain/mock-data.ts no SHA fixado, sem override | 3025 | `21bef1a4ecbeb24f23b348fc2ef8e2c98edff14b081cf4ece389ba2ce0e16d55` |

V02 usa notes/items/orderId em ordem inversa, com status UNKNOWN, submissionId s-1, submission payload ignored e history/events vazios; todos esses controles excluídos não mudam V01. Arrays invertidos mudam bytes; UTF-8 não normaliza V04/V05. Não alterar canonicalizador para tornar equivalentes sem nova versão e revisão explícita. business_hash cobre bytes legados; request_hash cobre bytes do DTO sintético congelado, com mapperVersion separada.

### 5.3 Vetores normativos de identidade/replay (testes futuros)

| ID | Entrada/concorrência | Resultado obrigatório |
|---|---|---|
| V07 | org A, âncora O, origin L, submission S, bytes P, expectedOrderRevision 0; registrar duas vezes | Uma tentativa em revisão1; segunda retorna associação existente, sem CREATE |
| V08 | Mesmos S/O/L/P, revisão backend já avançou; replay do commandId original com corpo original | Recibo do comando + estado atual; sem incremento/evento/CREATE novo |
| V09 | Mesmo S, P alterado ou O/destino/versão diferente | 409; preservar P original, sem novo efeito |
| V10 | O com S ocupante; outra aba registra T | 409 ORDER_OCCUPIED; não importar snapshot T sobre S |
| V11 | org B reutiliza strings O/S de A | Nunca acessa A; recursos só existem no namespace B, autorização independente |
| V12 | Dois novos confirm com mesma ledgerRevision em processos distintos | Um registra intenção; outro recebe execução atual ou conflito, sem segunda chamada |
| V13 | UNKNOWN, novo commandId e lease expirado | CREATE bloqueado; só consultar/reconciliar |
| V14 | ERROR REJECTED_FINAL arquivado em revisão2; nova admissão expected1 | 409; expected2 e conteúdo corrigido admite revisão3; antiga nunca despacha |
| V15 | Mesmo binding, token_version incrementou por refresh | Identidade preservada; mudança só em geração/conta invalida despacho |
| V16 | Dois orderIds autoritativos distintos com P semelhante | Não fundir vendas; registrar limite de duplicidade comercial |

## 6. Contratos das APIs futuras

Nomes de rotas propostos para implementação posterior. B implementará primeiramente repositórios/transações; a disponibilidade HTTP e execução simulada terão autorização própria. Todos os POST usam sessão, Origin/Host e CSRF existentes. Campos desconhecidos ou organização/papel/modo/URL/headers arbitrários são rejeitados; modo FIXTURE definido no servidor. IDs de destino selecionáveis apenas dentre fixtures autorizadas.

### 6.1 Envelope comum

Comandos recebem commandId, versão de contrato e revisão esperada pertinente; servidor computa requestDigest sobre o comando validado, registra ator e alvo. Resposta contém commandReceipt (commandId, tipo, recurso, resultado durável original, operationId se houver), projection (estado **atual**, revisões, certeza, conflictHold, nextAction) e correlationId. Replay pode ter projection mais recente; nunca apresentar recibo inicial 202 como aceitação ERP.

200 = recurso/comando existente ou consulta; 201 = cadastro/admissão inédita; 202 = operação duravelmente registrada, resultado pendente; 409 = conflito de bytes/revisão/ocupação; 401/403 = sessão/permissão/CSRF; 404 uniforme = recurso fora do escopo/inexistente; 413 = tamanho; 422 = validação de negócio; 503 = banco/serviço indisponível. HTTP 500/503/timeout não informa certeza de efeito ERP. Resposta de falha contém código sanitizado e orientação para consultar a **mesma identidade**, sem rotacioná-la.

| Operação proposta | Entrada específica e efeito |
|---|---|
| POST `/api/submission-orders` | originLocalOrderId + commandId; cria/recupera âncora autorizada e ownership derivado. Não admite snapshot nem chama provider |
| POST `/api/submission-orders/{orderId}/submissions` | submissionId, expectedOrderRevision, sourceLocalRevision, canonicalVersion, bytes revisados/hash, alvo fixture permitido. Revalidar schema/origem/hash; congelar DTO sintético/mapper; admitir READY em transação. Repetição exata por S retorna existente; divergence dá409 |
| POST `/api/submissions/{submissionId}/confirm` | expectedLedgerRevision; nenhum payload novo. READY ou ERROR seguro pode registrar execução. Repetição consulta o mesmo commandReceipt/operação; UNKNOWN/SUBMITTED nunca originam CREATE |
| GET `/api/submissions/{submissionId}` | Projeção autorizada; nenhum despacho, nenhuma consulta ERP implícita. Recurso alheio não vaza IDs, bytes ou estado |
| POST `/api/submissions/{submissionId}/reconcile` | expectedLedgerRevision; registra uma LOOKUP e vínculo idempotente. Uma investigação ativa por tentativa; replay retorna mesma operação. Somente simulador nesta etapa |
| POST `/api/submissions/{submissionId}/archive-rejection` | expectedLedgerRevision e expectedOrderRevision; REJECTED_FINAL de conteúdo + ausência de execução capaz. Libera âncora atomicamente, conserva snapshot/tombstone; nova revisão requer conteúdo alterado, como mock |
| POST `/api/admin/submissions/{submissionId}/resolve` | expectedLedgerRevision, evidenceIds válidos, decisão ACCEPTED ou REJECTED_FINAL, justificativa limitada. ADMIN; serviço verifica prova e CAS. Não existe decisão “reenviar apesar de dúvida” |
| POST `/api/admin/submission-orders/{orderId}/owner` | novo membro ativo da mesma organização, expectedAnchorRevision, justificativa. Não altera binding/bytes/autoria histórica nem reinicia comunicação |

Registro de comando deve ser atômico com evento/efeito local. GET não executa comandos. Reconcile permite retry limitado de **LOOKUP**, com nova operação identificada após falha; um replay do mesmo comando não refaz rede. Client HTTP pode repetir admissão/confirm usando mesma chave; executor CREATE jamais usa middleware de retry automático.

Confirm de ERROR requer comando novo e explícito, prova sem efeito válida, safeClosedAt em todas as execuções anteriores, retryAt cumprido, flags/autoridade/binding válidos e ausência de conflito. Novos commandIds em SUBMITTING devolvem a execução ativa sem despachar; em SUBMITTED devolvem recibo; em UNKNOWN devolvem bloqueio com ação consultar. Corrigir nunca reutiliza submissionId arquivada.

## 7. Autorização, ownership e auditoria

### 7.1 Política mínima, sem poderes implícitos

| Ação | ADMIN | OPERADOR | VENDEDOR |
|---|---|---|---|
| Consultar pedido/status permitido | Toda organização | Pedidos explicitamente autorizados | Somente sob sua responsabilidade |
| Cadastrar/preparar/confirmar | Não concedido só pelo papel de resolver; delegação operacional pendente | Sim, no escopo permitido | Poder de envio não inferido de “acesso”; pendente de confirmação de produto |
| Reconciliar/encaminhar | Sim | No recurso permitido, consulta simulada | Consulta/encaminhamento próprios; poder de iniciar trabalho backend pendente |
| Resolver conflito/arquivar prova administrativa | Sim, com evidência/CAS | Não pode forçar resolução | Não |
| Transferir ownership | Sim, membro ativo, motivo/CAS | Não | Não |

Para retirar ambiguidade técnica enquanto essas extensões não forem decididas: **deny por padrão** nas células pendentes. No laboratório, OPERADOR só opera âncoras de que é owner ou que lhe foram explicitamente delegadas. A primeira versão não exige tabela de ACL geral: ownership + transferência administrativa; compartilhamento amplo entre operadores exige decisão separada, não presumir “qualquer pedido da organização”. Âncora criada pelo operador tem owner=Principal.userId. Fixture administrativa pode ser atribuída explicitamente com auditoria.

VENDEDOR responsável é usuário da membership, não simples sellerId comercial do payload. Nome do vendedor/dados HTTP não conferem ownership. ADMIN pode consultar/resolver toda sua organização, mas não organizações vizinhas. Troca de owner não transfere autoria da confirmação nem remove trava; mudança durante READY/ERROR exige reautorização do próximo comando, durante intenção não cancela efeito possível.

### 7.2 Revogação e concorrência de autorização

Autenticar pelo mecanismo atual; revalidar sessão, usuário, organização, membership/papel e recurso dentro da transação decisória, com locks compartilhados dos registros de autorização; repetir checagem antes da invocação do transporte. A intenção registra ator/sessionId, sem token. Replay exige sessão atual autorizada: usuário revogado não lê resultado usando commandId antigo.

Ponto de linearização da permissão é commit da intenção. Revogação concluída antes dele impede autorização; após esse commit a execução pode já estar em curso. Não prometer cancelamento atômico entre revogação e chamada externa: a janela entre última checagem e efeito existe. Detecção de revogação antes da chamada impede aquela execução; para classificá-la NO_EFFECT, executor deve encerrar com prova sem chamada. Processo perdido/suspenso sem essa prova mantém UNKNOWN. Logout não remove ledger, não restabelece sessão e não permite retry; resposta vinculada de uma execução já autorizada pode ser registrada internamente para preservar a verdade.

### 7.3 Auditoria

Registrar transições, admissões, confirmação, lookups, conflito, ownership, resolução/arquivamento, gate de recuperação e negativas relevantes. Evento: organização/recurso, sequência, comando, ator ou SYSTEM, correlação, data do banco, estado anterior/posterior, código/motivo e evidenceId. Eventos de commandId possuem digest e recibo durável original. Eventos de resultado interno usam identidade própria vinculada à operação, não reaproveitam o commandId HTTP.

Transição + prova + evento + recibo local no mesmo commit. Append-only e sem DELETE/UPDATE pela role operacional; política de expurgo futura não pode apagar tombstone que habilitaria replay. Negativa anterior à existência da tentativa utiliza audit_events existente, sanitizada. Auditoria protege contra role operacional, não contra superusuário/root; acessos privilegiados e backups precisam de governança separada.

## 8. Execução, reconciliação e recuperação

### 8.1 Intenção e exclusão

Comando confirm registra comunicação com DISPATCH_INTENT, operationId/executionId, estado SUBMITTING e potentialEffect=true, tudo em commit curto. Só o executor dessa intenção, após ACK do commit e checagens, pode fazer uma chamada. Não retomar CREATE de intenção encontrada no boot; outro processo só observa/reconcilia. O transporte não reenviará POST por redirect ou retry oculto. O pool/driver não deve repetir transação que inclui rede.

Revalidação/fencing usa execução exata, revisão e binding; locks/constraints elegem um executor entre instâncias. Se lease expira, classificar abandono para UNKNOWN e manter potentialEffect. Uma instância suspensa pode retomar antes da última checagem ou depois dela; portanto nunca dar segunda execução por expiração. Estado UNKNOWN normalmente faz a checagem tardia falhar, mas não elimina janela já autorizada externa. Só prova de extinção de **todas** as execuções capazes permite outro CREATE.

### 8.2 Protocolo por fronteira de falha

| Situação | Recuperação obrigatória |
|---|---|
| Queda antes do commit da intenção, rollback confirmado | Nenhum transporte; READY ou ERROR pré-despacho. Nova confirmação explícita é possível se não houver intenção anterior |
| Commit intenção pode ter ocorrido, sem ACK ao executor | Executor não chama transporte. Recuperar por chave; intenção existente vira conservadoramente UNKNOWN se não houver encerramento seguro. Não redispatchar |
| Commit concluído, resposta HTTP ao cliente perdida | Cliente consulta/replay da mesma chave; comando/operação existentes, não outro CREATE |
| Suspensão depois da intenção | Abandono→UNKNOWN; bloqueio persiste. Retomada só pode registrar resultado válido ou comprovar encerramento sem efeito, não disputar nova execução |
| Queda após possível criação | UNKNOWN; investigar vínculo exato no simulador. Não converter ausência em ERROR seguro |
| PostgreSQL falha depois de efeito externo | Recibo pode ser conhecido em memória, mas não declarar confirmação durável sem commit. Quando banco retorna, anexar prova à execução ou reconciliar; não repetir CREATE |
| Resposta tardia após lookup/outro processo | Guardar evidenceId append-only; aplicar política sob lock da âncora/operação exata. CAS stale não descarta prova; reavaliar estado atual sem sobrescrever recibo terminal |
| Conta/generation trocada | Sem despacho anterior: ERROR seguro/binding bloqueado, não remapear. Com intenção: UNKNOWN. Evidência velha permanece na tentativa antiga; aceitação histórica exige ADMIN/prova; nenhuma restauração de tokens |
| Reinício normal do backend | READY não envia; SUBMITTING sem resultado é verificado e classificado; ERROR/UNKNOWN/SUBMITTED preservados; somente LOOKUP elegível pode ser retomado, nunca CREATE |
| Restore anterior a submissões | Gate global de recuperação e interrupção dos executores antigos; não confiar em “registro inexistente”. Reconstituir janela perdida antes de liberar operação; ver abaixo |

NO_EFFECT só é seguro quando o transporte não foi invocado e a execução deixou de poder ser invocada no futuro. “Processo morreu” depois de enviar não satisfaz isso. Prova tombstone REJECTED_FINAL no simulador deve excluir também aceitação tardia da chave. Risco residual de rejeição externa falsa vai para incidente, não pode ser ocultado pelo modelo.

### 8.3 Reconciliação

1. Registrar comando LOOKUP idempotente, deadline e execução separados do CREATE. Bloquear consultas concorrentes redundantes; comunicação anterior incerta continua impedindo envio.
2. Consultar apenas conta/destino congelados, usando simulador. Guardar escopo, resultado, paginação quando aplicável e checks; nenhum candidato não vira prova negativa.
3. Sob lock/CAS, anexar evidência e concluir ACCEPTED ou REJECTED_FINAL somente com os critérios da seção4. Caso contrário, manter UNKNOWN/hold e próxima ação administrativa.
4. Consultas interrompidas podem ser retomadas por nova operação identificada/backoff; elas não criam pedidos. Replay do comando antigo apenas informa sua situação.
5. Resolução manual repete os checks, exige evidência/justificativa e não permite override de dúvida. Duas resoluções divergentes competem por ledgerRevision; uma vence e outra recebe409.

### 8.4 Restauração e janela perdida

Restore de backup é diferente de restart. O gate deve ser acionado pelo procedimento de restauração/deployment **fora do estado restaurado do banco**; uma flag NORMAL dentro de backup antigo não protege. Operação começa em RECOVERY_HOLD antes de conectar executores. Desligar/isolar instâncias antigas e registrar ponto restaurado, intervalo potencialmente perdido, chaves e conta/destino. Se não for possível provar limite da janela ou encerrar executores antigos, bloquear todos os despachos afetados.

Reunir backups/WAL disponíveis, manifestos de operação e envelopes locais como pistas; dado local não prova efeito externo. Recuperar ledger/provas de fontes íntegras ou reconciliar no simulador independente. Quando o backup não contém a tentativa, reconstituir sua identidade/evidência sob comando administrativo; **não admitir como novo READY** para “tentar novamente”. Tombstones de perda/hold de âncora impedem evasão por ausência de linha; casos sem identidade enumerável exigem hold da organização/ambiente.

Liberação do gate exige checklist técnico de integridade/chaves, inventário da janela, resultados provados ou bloqueios persistentes para cada caso incerto e aprovação administrativa auditada. Não declarar que o sistema detecta automaticamente todo restore antigo: garantia depende desse runbook e controle externo de inicialização, a testar. RPO/RTO não definidos; restaurar e obter readiness SQL não significa estar seguro para criar.

## 9. Simuladores necessários em fases posteriores

Dois adaptadores distintos: (a) ERPLedger PostgreSQL idempotente preserva recibos/rejeições aprovados; (b) simulador não idempotente cria **um efeito por chamada**, inclusive mesma submissionId, sem unique em chave/pedido. Ambos são sintéticos, sem credenciais/rotas Tiny, com armazenamento independente do ledger da aplicação.

Simulador não idempotente registra em commit separado: effectId, contador por chamada, conta fixture, bytes recebidos, requestId e instante; não devolve consulta conclusiva por padrão. Controle de laboratório permite pausar antes de receber, antes/depois de criar, antes de responder e atrasar resposta. O harness observa efeitos reais do simulador, mas aplicação recebe somente o contrato configurado, não um “oráculo” secreto de teste.

Perfis: timeout antes sem prova visível (UNKNOWN mesmo com contador zero); timeout após efeito (UNKNOWN com contador1); consulta sempre inconclusiva; rejeição definitiva com tombstone que impeça aceitação tardia; resposta/candidato conflitante; conta trocada; resposta atrasada. Separar número de CREATE recebidos de efeitos criados: um teste de idempotência do ERP não comprova que nosso backend chamou apenas uma vez.

Prova futura: dois processos backend, 100 confirmações concorrentes e 1000 replays depois do timeout devem conservar uma intenção ocupante e nenhum segundo CREATE. Crash/restart e suspensão usam barreiras determinísticas; não sleeps como prova. As fases B/C terão gates separados: B prova persistência sem rede; C prova efeitos do simulador. Nenhum desses testes foi executado agora.

## 10. Plano restrito para 7B.4B — não executar

### 10.1 Modelo indispensável

Conservar as cinco tabelas propostas; identidade e recibos de comandos enriquecem âncora/eventos, sem um segundo ledger/outbox. B não necessita executor, UI, simulador externo nem scheduler.

| Tabela conceitual | Dados/constraints mínimos |
|---|---|
| `submission_orders` | PK org/order; FK organization; UNIQUE org/originLocalOrderId; origem imutável; owner/member FK composta; orderRevision/anchorRevision; current/accepted ponteiros FKs org/order/submission; conflictHold/recoveryHold; timestamps |
| `order_submissions` | PK org/submission; UNIQUE org/order/submission; FK âncora; snapshot bytes/hash/versões, revisões, binding e modo; estado/certeza/recibo; UNIQUE parcial org/order onde releasedAt nulo; released só ERROR rejeição arquivada; destino sintético permitido, REAL inexecutável |
| `submission_communications` | PK org/operation; FK org/order/submission; UNIQUE org/submission/sequence e executionId no contexto; tipo/outcome/potentialEffect/safeClosedAt; UNIQUE parcial CREATE por submissão enquanto potentialEffect=true ou outcome inconclusivo; lease não participa da liberação |
| `submission_events` | PK org/event; FK recurso; UNIQUE org/submission/seq para tentativas; commandId opcional com UNIQUE org/commandId, tipo/recurso/ator/digest/recibo durável. Eventos de cadastro/ownership podem referenciar só âncora, com CHECK de contexto explícito; sequência de auditoria da âncora com UNIQUE org/order/eventSequence inclui todos os eventos, alocada sob lock da âncora. Uma linha âncora de comando, demais eventos vinculados sem reutilizar commandId |
| `submission_evidence` | PK org/evidence; FK composta tentativa/operação quando aplicável; fonte/binding/digest/checks/conclusão/autoria/justificativa protegidos; append-only; referência usada em transição deve apontar ao mesmo tenant/pedido/tentativa |

Cross-table constraints: aceitar referência exige estado SUBMITTED e evidência ACCEPTED compatível; arquivar exige REJECTED_FINAL conteúdo, nenhum CREATE capaz e hold ausente. FKs sozinhas não provam essas relações; transições guardadas no banco e testes SQL direto. FK connectionId futura exige UNIQUE org/id em erp_connections, sem alterar seu provider=TINY; fixture usa connectionId nulo, identidade de simulador obrigatória. Binding REAL pode ser modelado para futuro, sem execução nem configuração real.

Unicidade externa: org/provider/targetAccount/externalOrderId quando comprovado. Não habilitar compartilhamento da mesma conta ERP entre organizações antes de decisão; fixture evita compartilhamento por padrão. Ordem/digest nunca são chave global de deduplicação de venda.

Bytes BYTEA UTF-8 são autoridade imutável; JSONB derivado opcional não os substitui. Guardar hash validado no caminho de admissão e testar recálculo. Cifra/AAD pode envolver bytes em repouso: digest é do plaintext canônico; rotação de envelope criptográfico não altera conteúdo. Decidir estratégia de proteção antes da migration autorizada, usando a infraestrutura de vault existente sem alegar sua homologação de payload comercial.

### 10.2 Proteção de banco e locks

Imutáveis desde admissão: organização, order/submission/origem, orderRevision, bytes/hashes, canonical/contract/mapperVersion, destino/conta/conexão/generation, autoria inicial. role operacional não pode apagar eventos/evidências/intenção ou editar snapshot; triggers/regras guardadas impedem também SQL direto. Campos atualizáveis restringem-se a estado/metadados/revisão por transição válida com evento/evidência. SUBMITTED é monotônico, releasedAt não se desfaz; comunicação safeClosedAt exige prova, não update livre. Checks locais não substituem verificação de relações/evento no mesmo commit. Não usar superusuário nos testes de proteção operacional.

Ordem única de locks: registros de autorização (organização→usuário(s) ordenados→membership(s) ordenadas→sessão) → conexão/fixture quando necessária → âncora → submissão → comunicação → anexar evidências/eventos. Repositórios SYSTEM omitem sessão mas mantêm mesma ordem restante. Evitar ordem inversa em callbacks/ownership/refresh; alinhar previamente com módulos existentes. Updates concorrentes de segurança/conexão devem usar ordem compatível ou ser serializados antes do módulo novo. Guardas autônomas de isolamento cobrem todas as queries.

READ COMMITTED + row locks/constraints/CAS basta à escala inicial. Cadastro inexistente usa INSERT/unique e recuperação controlada do conflito antes de lock da âncora; não confiar em SELECT de linha ausente. Deadlock/serialization retry somente de transação **puramente local**, com commandId preservado; nunca embutir transporte. Duração/lock timeout limitados e mensuráveis, valores finais técnicos em B.

Transações indispensáveis: cadastrar âncora+comando; admitir snapshot+revisão+ponteiro+evento; persistir intenção simulada sem despacho; aplicar resultado/prova+transição+evento; anexar lookup+comando; arquivar rejeição+liberação+revisões; ownership; resolução/hold. B testa esses commits diretamente, sem invocar ERP.

Índices mínimos além das uniques/FKs: org/order/createdAt para histórico; org/state/updatedAt para pendências; org/owner para escopo; org/submission/sequence para comunicações/eventos; intenção CREATE incerta para recovery; org/provider/conta/ID externo para vínculo. Paginar fila/auditoria. Não indexar payload completo ou adicionar infraestrutura distribuída.

### 10.3 Migração, rollback e arquivos previstos

Migrations apenas aditivas após autorização: criar tabelas/guardas/índices e FK composta necessária, sem importar mock ou alterar formatos IndexedDB. Migration numa transação quando suportada e validada pelo runner; planejar locks/tempo e backup do ambiente de teste. Nenhum DDL foi produzido nesta fase.

Rollback de aplicação: desligar módulo/flags do laboratório, conservar tabelas/provas e executar versão compatível; não DROP nem truncar para “voltar”. Se houver intenção registrada, manter hold mesmo com módulo desligado. Migration falha antes de commit deve deixar schema antigo íntegro; incompatibilidade estrutural interrompe avanço. Restore segue seção8.4, não migração reversa. B não despacha, mas não assumir que ambientes posteriores estarão sem efeitos.

| Arquivo/módulo futuro | Alteração prevista em B |
|---|---|
| backend/db/schema.ts e backend/db/migrations | Modelo aditivo, índices/FKs/checks/guardas, metadados de migration; sem alterar tabelas legadas sem necessidade |
| backend/submissions/contracts.ts (novo) | Tipos internos de identidade/certeza/command/projection; versões e validação de envelopes |
| backend/submissions/policy.ts (novo) | Matriz completa e pré-condições; critérios de prova/correção/hold |
| backend/submissions/repository.ts (novo) | Comandos locais idempotentes, locks/CAS, snapshots, eventos e evidências |
| backend/submissions/authorization.ts (novo) | Autoridade por recurso, revalidação e ownership; reutilizar AuthService |
| backend/security/crypto.ts / errors.ts | Reutilizar; extensão específica de cifra/códigos só se necessária e testada, sem credenciais reais |
| backend/tests/stage7b4b/* (novo) | PostgreSQL real, barreiras e assertions de constraints/transações |
| scripts e workflow de CI backend | Executar suíte B e regressões, banco isolado; nenhuma publicação backend |
| backend/server/http.ts, services/hooks/UI | Rotas/adapter/executor são posteriores; B não muda fluxo homologado ou limite HTTP global |

Nomes novos são plano, não arquivos criados. Não iniciar API completa/executor ao implementar persistência B. Separar futuras fases C/D/E para evitar expansão do gate.

## 11. Matriz de testes e bloqueios de aprovação

**Planejados para 7B.4B, não executados.** PostgreSQL real de CI, role operacional restrita, dois processos/pools onde necessário, fixtures sintéticas e egress externo bloqueado. Um assert em memória não substitui essas evidências.

| ID | Teste B | Bloqueio de aceite |
|---|---|---|
| B01 | Cadastro repetido/perda de resposta, mesma origem | Uma âncora; revisão e ownership consistentes |
| B02 | 100 admissões simultâneas mesma S/corpo/comando | Uma tentativa/comando; nenhum evento duplicado |
| B03 | IDs/chaves distintas para mesma âncora, dois operadores/processos | Uma ocupante; perdedora409, sem sobrescrita |
| B04 | commandId reaproveitado em outro tipo/recurso/ator/corpo | Conflito; nenhuma alteração; sem vazar resultado |
| B05 | Replay original após ledgerRevision avançar vs comando stale novo | Replay seguro; novo stale409 |
| B06 | Enumerar 49 pares no contrato; subset persistível no banco e preparação local na política | Proibidos bloqueados; transições válidas exigem provas/events; não criar DRAFT/VALIDATING backend artificialmente |
| B07 | UNKNOWN, lease vencido, finishedAt, ABANDONED | Nenhum método de persistência cria segunda intenção capaz |
| B08 | Mutação SQL direta em snapshot/origem/binding/recibo terminal/history | Rejeição pela role/guardas do banco; bytes intactos |
| B09 | V01–V06 e arrays/números/Unicode/schema inválido | Hash/bytes exatamente especificados; admissão inválida rejeitada |
| B10 | LocalRevision igual e conteúdo diferente; backend revision stale | Não atribuir autoridade à revisão local;409 |
| B11 | Tenant B adivinha IDs A; FKs/queries/owner/conexão/evidence | Nenhum vínculo/leitura/mutação cruzada |
| B12 | Sessão/membership/owner revogados durante admissão/intenção | Linearização definida; nenhuma autorização de comando posterior à revogação |
| B13 | Resolução/correção concorrentes e replay administrativo | Uma decisão consistente; provas/eventos/CAS atômicos |
| B14 | Arquivar ERROR seguro, nova revisão, replay de tentativa liberada | Antiga jamais registra nova intenção; nova revisão exige conteúdo alterado |
| B15 | Rejeição contradita/aceitação atrasada/recibo externo já usado | Hold/incidente, sem regredir terminal nem trocar ID livremente |
| B16 | Commit rollback/sem ACK antes e depois de efetivar | Recuperação por chave, nenhum efeito inventado; eventos/transições juntos |
| B17 | Reinício real de processo preservando banco | Estado, snapshot, comandos, revisões e guardas recuperados |
| B18 | Bancodown/locktimeout/deadlock durante comandos locais | Rollback consistente; erro sanitizado; retry local não duplica |
| B19 | Restore antigo + gate externo ativo | Nenhum novo READY/confirm contorna hold; janela perdida explícita |
| B20 | SQL operacional altera safeClosedAt sem prova ou remove tombstone | Bloqueado; constraints não dependem de lease |
| B21 | FK circular/current/accepted aponta a outro pedido/estado/evidência | Rejeitado; ponteiros coerentes após rollback |
| B22 | Payload300 e limites de strings/tamanho de admissão | Fixture válida preservada, excesso rejeitado sem commit parcial; medição não é UI benchmark |
| B23 | Migration aditiva interrompida e rollback de aplicação | Schema antigo íntegro ou novo compatível; ledger nunca apagado |
| B24 | Auditoria/commandReceipt/anonimização de logs | Ator/seq/prova íntegros; segredos ausentes, acesso escopado |

Regressões como gate de B: Etapas2–6, 7B.1/7B.2/7B.3, typecheck, lint, build, boundary e suítes PostgreSQL existentes. Snapshot da árvore frontend e exports deve permanecer funcionalmente equivalente; mudanças backend não entram no bundle. Não atribuir CI aprovado antes de execução na branch futura.

Gates de C, ainda fora de B: simulador não idempotente independente, 1000 replays, timeout antes/depois, crash após efeito, DB down após efeito, suspensão/lease, resposta tardia e troca de conta. B prova que o banco impede segunda intenção; C precisa provar contagem de chamadas/efeitos. Não antecipar homologação de ponta a ponta apenas por B verde.

Performance: B preserva frontend e testes atuais; na futura fachada E repetir 36 cenários, 48 lotes, 900 produtos e 10/50/100/150/200/300 itens, autosave ligado, catálogo background, teclado, recarga/reabertura/offline real e Network sem busca por tecla. Registrar UI e persistência separadas, mesma máquina baseline/comparação. Alvo histórico <50ms; critério adicional >20% e >5ms de regressão continua proposta para aceite, não medição atual.

### Verificação realmente realizada na 7B.4A

- Leitura da versão atual do planejamento e inspeção dos contratos/fontes da baseline.
- Conferência remota/local do SHA e ausência de mudanças no checkout.
- Cálculo dos seis vetores canônicos/SHA-256 com função existente, Node24.19.0.
- Revisão documental da matriz, fronteiras de crash, replays, FKs, compatibilidade e escopo das fases.

Não executados nesta fase: PostgreSQL, CI nova, regressões completas, simuladores novos, benchmark ou homologação no navegador. Os resultados históricos da 7B.2/7B.3 permanecem históricos, incluindo 36 cenários/48 lotes e ressalva de identidade não comprovada do build Netlify. Nenhuma confirmação retroativa de build foi inventada.

## 12. Operação pendente, mensagens e encerramento para revisão

### 12.1 Fila administrativa e decisões pendentes

Fila proposta: UNKNOWN e conflictHold da organização, mais SUBMITTING abandonado e casos de restore; ordenar por risco de conflito/janela de perda, depois idade. Cada registro mostra submissão/pedido, owner, destino sintético, última evidência/consulta, idade, motivo sanitizado, responsável e próxima ação. Paginação e filtros simples; uma atribuição administrativa não cria comunicação ERP.

| Tema | Proposta | Autoridade necessária |
|---|---|---|
| Responsável principal/substituto | Dois usuários ADMIN nominais por organização, cobertura em ausência | Gestão designa pessoas; não há nomes aprovados |
| Atendimento/escalonamento | Definir janela de atendimento, alerta por idade e encaminhamento ao substituto/gestão | Gestão define prazo/SLA; nenhum número já aprovado |
| Escalonamento de conflito | Incidente prioritário, hold imediato, preservar ambas provas; não retry emergencial | Guarda técnica obrigatória; responsável/tempo operacionais pendentes |
| Limites de payload | Até300 itens, bytes bounded por rota/admissão, sugestão inicial1MiB, strings/profundidade limitadas e413 | Medir fixture em B; tabela exata de limites na especificação autorizada; gestão valida limites de notas/itens |
| Proteção de dados | Dados pessoais só necessários; cifra/AAD e least privilege; logs sem payload/tokens | Técnica fecha mecanismo; gestão valida classificação/acessos |
| Retenção/expurgo | Separar provas detalhadas de tombstones mínimos; não apagar o bloqueio de replay | Gestão/assessoria define política; nenhum prazo assumido |
| Backup/restore | Ledger+evidências+keyring/WAL conforme estratégia; ensaio independente e gate externo | Gestão define RPO/RTO e responsabilidade; técnica detalha procedimento |
| Poder de envio de ADMIN/VENDEDOR e escopo OPERADOR | Deny em células pendentes; owner/transferência explícita na primeira versão | Confirmar política antes das rotas de operação |
| Mesma conta ERP em organizações distintas | Não habilitar enquanto regra de exclusividade/IDs não aprovada | Produto/segurança, antes de REAL |
| Cancelamento de READY admitido | Fora da v1; confirmar apenas na revisão final | Produto deve pedir protocolo específico se necessário |

Questões operacionais não tornam a fase B autorização implícita de produção. Rate limit atrás de proxy, política de senhas, OAuth persistente homologado e backup/restauração de PostgreSQL/chaves continuam pendências comerciais anteriores.

### 12.2 Mensagens ao operador

| Situação | Mensagem proposta |
|---|---|
| UNKNOWN | “Resultado não confirmado. Não envie novamente. Consulte a submissão ou encaminhe para revisão.” |
| SUBMITTING | “Envio registrado; aguardando confirmação. Fechar a tela não cancela a operação.” |
| ERROR seguro | “Falha confirmada sem criação. Revise a orientação antes de confirmar novamente com a mesma submissão.” |
| Rejeição de conteúdo | “Conteúdo rejeitado e confirmado. Arquive a tentativa antes de corrigir e revisar.” |
| Conflito de operador/revisão | “Este pedido já tem outra revisão ou submissão. Suas alterações locais foram preservadas; consulte o registro atual.” |
| Backend indisponível | “Pedido salvo localmente. Confirmação indisponível; consulte a mesma submissão quando o serviço retornar.” |
| Offline | “Sem conexão. Continue montando o rascunho; nenhum envio será feito automaticamente ao reconectar.” |
| Restore/hold | “Envios temporariamente bloqueados para verificar operações anteriores. Não copie pedidos pendentes para contornar o bloqueio.” |

Mostrar IDs, timestamps e próxima ação segura; ocultar stack, credenciais e dados alheios. A mensagem não substitui autoridade durável do ledger nem autorização.

### 12.3 Critério de prontidão da 7B.4A

Este documento fecha o significado de identidade, revisão, replay, intenção, estado, evidência, concorrência, binding e recuperação. No caminho conservador, qualquer situação não coberta por prova segura termina em bloqueio/UNKNOWN, nunca em permissão implícita de CREATE. Matriz completa e vetores fornecem base para implementar/testar persistência B; decisões operacionais pendentes estão nomeadas com defaults restritivos.

**Pronto para revisão documental, não homologado comercialmente nem implementado.** Solicita-se aceite dos contratos técnicos e confirmação ou manutenção dos defaults restritivos nas pendências de produto. A implementação da 7B.4B exige autorização separada; não avançar automaticamente.

### Fontes e rastreabilidade

Código no SHA fixado: types/order.ts; domain/submission.ts e mock-data.ts; services/submission-coordinator.ts; integrations/ERPProvider.ts, MockERPProvider.ts e erp-ledger.ts; repositories/draft-repository.ts; backend/auth/service.ts; backend/server/http.ts; backend/db/schema.ts; backend/integrations/tiny/service.ts (binding/refresh); package.json; scripts/check-stage-5.mjs. Arquitetura/autosave/catálogo e evidências anteriores: planejamento aprovado e documentos 7B.2/7B.3 da baseline. Não foram acessadas credenciais ou APIs Tiny reais.

O documento-base permanece preservado como histórico aprovado. Esta formalização distingue refinamentos técnicos e restrições de execução das propostas operacionais ainda abertas; não altera comportamento do MVP. Nenhuma branch, migration, PR, publicação ou etapa7C foi criada.

## Laudo técnico para a gestão de produto

**Objeto:** formalização de contratos e garantias da Etapa7B.4A, exclusivamente documental.

**Parecer:** favorável ao aceite documental, sujeito à revisão da gestão de produto. Os contratos definem autoridade por organização/pedido, revisões distintas, snapshot/destino imutáveis, confirmação idempotente separada de CREATE, bloqueio de UNKNOWN, prova de resultado, concorrência e recuperação conservadora. Não foi identificada, na revisão documental, regra que autorize nova criação enquanto uma execução anterior ainda possa produzir efeito.

**Evidências desta entrega:** baseline local/remota conferida; planejamento vigente lido; código dos contratos inspecionado; seis vetores canônicos e hashes calculados com a função existente. O checkout permanece limpo. Nenhum teste PostgreSQL, CI nova, benchmark ou homologação de navegador foi executado nesta fase; esses ensaios constam como gates futuros e não são apresentados como aprovados.

**Limitações materiais:** coordenação aplica-se à mesma identidade autoritativa; pedidos distintos da mesma venda exigem tratamento comercial. Sem garantia externa comprovada, execução exatamente uma vez não é assegurada. Restore antigo depende de gate operacional externo e investigação da janela perdida. Política de acesso ampliada, responsáveis/SLA, retenção e RPO/RTO permanecem pendentes, com defaults restritivos definidos.

**Encaminhamento ao gerente de produto:** revisar e aceitar ou ajustar os contratos e as pendências da seção12. A aprovação da 7B.4A não libera produção, Tiny real ou integração comercial. A implementação da 7B.4B deve receber autorização explícita separada e cumprir sua matriz de testes antes de avançar.

**Conclusão da atividade:** documentação entregue para revisão; código, migrations, main, PRs, Pages, backend e credenciais preservados. Não iniciadas 7B.4B/7C. Este é um parecer técnico do projeto, não certificação independente ou garantia comercial do ERP.
