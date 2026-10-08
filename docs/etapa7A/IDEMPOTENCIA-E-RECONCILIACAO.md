# Idempotência e reconciliação

Verificado em **08/10/2026 (UTC)**. Escopo: descoberta documental; nenhuma chamada autenticada nem escrita no ERP. “Confirmado” significa publicado na fonte oficial, não homologado na conta Atram.

## Conclusão: RISCO CRÍTICO para escrita

O contrato examinado confirma envio e filtro por `ecommerce.numeroPedidoEcommerce`, mas **não comprova idempotência nativa, unicidade, consistência imediata nem rejeição sem efeitos**. A mesma garantia do MockERPProvider não pode ser prometida no Tiny. Até obter evidência suficiente, uma criação ambígua deve permanecer `UNKNOWN`, bloqueando nova criação e mudança de identidade.

Fontes específicas: `paths["/pedidos"].post`, `paths["/pedidos"].get.parameters`, `EcommerceRequestModel`, `EcommerceResponseModel`, `CriarPedidoModelResponse` e `ErrorDTO` no [recorte](CONTRATOS-VERIFICADOS.json); [documentação de criação](https://api-docs.erp.olist.com/api-reference/pedidos/criar-pedido). Não houve ensaio real.

| Questão | Evidência | Resposta / garantia |
|---|---|---|
| 1. Chave idempotente? | Nenhum header/parâmetro de idempotência na criação examinada | NÃO CONFIRMADA; ausência no schema não prova impossibilidade |
| 2. Referência externa? | ecommerce.numeroPedidoEcommerce string nullable | Campo confirmado; uso com UUID Atram depende de validação |
| 3. Unicidade imposta? | Sem constraint documentada | NÃO CONFIRMADA; campo e filtro não equivalem a índice único |
| 4. Busca por referência? | GET /pedidos query numeroPedidoEcommerce string | Confirmada estruturalmente; exatidão, escopo e colisões pendentes |
| 5. “Não encontrado” imediato confiável? | Sem janela de consistência/contrato negativo | NÃO CONFIRMADO; vazio/404 não libera reenvio |
| 6. Processamento assíncrono? | Resposta 200 com id; sem 202 documentado | NÃO CONFIRMADO; não inferir ausência de trabalho atrasado |
| 7. Criação seguida de timeout/erro? | Transporte pode perder resposta após commit | Risco distribuído; comportamento Tiny não testado/documentado |
| 8. Consulta por identificador externo? | Filtro de listagem + GET por ID obtido | Confirmada como pesquisa; não consulta idempotente autoritativa |
| 9. Rejeição comprovada sem criação? | ErrorDTO não traz prova terminal por identidade | NÃO CONFIRMADA; 400 isolado insuficiente |
| 10. Garantias efetivas? | DTO de recibo ID/número e GET de consulta | Não fornecem vínculo imutável chave→conteúdo nem exactly-once |

## Política conceitual do backend futuro

Ledger durável por empresa: `submissionId` único, pedido local, conteúdo canônico/hash congelado, versão de catálogo/preço, estado, tentativas, intenção/horário de despacho, ID ERP e evidências. Lock/lease e unicidade para evitar que dois operadores/workers despachem simultaneamente. Não usar retries automáticos HTTP de POST em cliente, proxy ou fila. Crash após despacho entra em recuperação ambígua, não reprocessamento cego.

O ledger impede repetição local concorrente, mas **não é uma transação conjunta com o ERP**. Entre criação remota e recibo local há janela de falha. Timeout/cancelamento não cancela processamento remoto. Um lock que expirou não autoriza outra criação. Preservar intenção e bloquear UNKNOWN também após restart.

Consulta por referência: verificar empresa, match exato, todos os resultados/páginas relevantes, ID, cliente, itens/quantidades, preço, totais e referência. Não confiar apenas em nome/número ou similaridade. Um candidato consistente pode virar recibo após verificação; conflito ou múltiplos candidatos exige intervenção e mantém bloqueio. Nenhum resultado não é prova de ausência; aguardar/consultar com backoff limitado e encaminhar reconciliação manual assistida. Webhook de venda pode ajudar a localizar resultado, mas não prova ausência nem unicidade.

A interface atual `findSubmission(...): receipt | null` precisa, futuramente, distinguir “não localizado / incerto” de “ausência comprovada”; jamais adaptar vazio de GET para autorização automática de nova criação. `findRejection` do mock tem tombstone durável que exclui aceitação tardia; não existe equivalente confirmado no Tiny. Nova identidade após correção de 400 só será segura quando a rejeição terminal estiver comprovada. Até lá manter payload e identidade congelados.

## Matriz de erros e certeza

| Resultado | Tratamento de GET | Tratamento de criação futura |
|---|---|---|
| Validação local antes de despacho | Corrigir entrada | Não houve requisição: seguro corrigir; registrar prova local |
| 400 ErrorDTO | Mostrar erro sanitizado, sem loop | Não presumir sem criação; UNKNOWN salvo prova autoritativa de rejeição |
| 401 | Uma renovação controlada; verificar módulo; reconectar | Sem replay automático por status; confirmar rejeição antes de repetir identidade |
| 403 | Corrigir permissão/usuário | Mesma cautela; não trocar identidade |
| 404 | Recurso ausente/rota a verificar | Consulta vazia/404 não prova inexistência de criação |
| 409 | Não listado na criação; tratar defensivamente | Semântica NÃO CONFIRMADA; reconciliar, não presumir duplicado |
| 429 | Pausar orçamento central com headers/backoff | Nenhum retry de criação sem comprovar rejeição antes de commit |
| 500/503/outros 5xx | Retry GET limitado e jitter | UNKNOWN; ERP pode ter persistido antes da falha |
| Timeout antes do envio comprovado | Retry GET limitado | Seguro somente com evidência de que nenhum byte foi despachado; timeout sozinho não prova |
| Timeout após envio / falha de rede | Retry GET limitado | UNKNOWN, mesmo se aparentar ocorrer “antes do recebimento” |
| 200 inválido/incompleto | Não ativar snapshot | Sem id/recibo válido: UNKNOWN, não transformar em sucesso ou nova criação |
| 200 recibo verificável | Validar schema/empresa | Persistir recibo; SUBMITTED após vínculo validado |

Nenhum status sozinho demonstra atomicidade. Não transplantar regra mock auth/429=rejected para provider real. Retenção de chave, colisões, comprimento da referência, consistência, efeitos de validação e ambiente seguro de homologação precisam de resposta oficial. Testar falha depois do commit somente numa futura fase explicitamente autorizada e em conta de teste; nunca provocar esse ensaio em produção em 7A.

## Critérios para habilitar escrita em fase futura

Obter contrato idempotente ou unicidade/consulta autoritativa no destino, ou aceitar formalmente bloqueio conservador e processo manual sem promessa exactly-once. Provar persistência de intenções, recovery de crash, isolamento por empresa, colisão de referência, concorrência e resposta perdida. A ausência dessas garantias bloqueia reenvio automático. A aprovação documental de 7A não aprova conexão nem criação real.
