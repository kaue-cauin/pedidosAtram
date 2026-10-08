# Mapeamento documental de pedidos

Verificado em **08/10/2026 (UTC)**. Escopo: descoberta documental; nenhuma chamada autenticada nem escrita no ERP. “Confirmado” significa publicado na fonte oficial, não homologado na conta Atram.

## Operação examinada; proibida em 7A

`POST /pedidos`, operationId `CriarPedidoAction`, base `https://api.tiny.com.br/public-api/v3`. Corpo JSON obrigatório: `CriarPedidoModelRequest` (allOf `PedidoModel` + referências e itens). Sucesso documentado **200**, DTO `CriarPedidoModelResponse`: `id` integer e `numeroPedido` string. Erros: 400 (`ErrorDTO`), 401, 403, 404, 500, 503. Bearer; futura permissão de incluir/editar no módulo Pedidos, associação exata a confirmar. Nenhum header de idempotência declarado. [Referência oficial](https://api-docs.erp.olist.com/api-reference/pedidos/criar-pedido) e [recorte](CONTRATOS-VERIFICADOS.json).

O corpo é marcado required, mas **nenhuma propriedade dos DTOs transitivos da criação é marcada em required** no snapshot. `ProdutoRequestModel.id` é non-nullable: isso não equivale a presença obrigatória. Não inferir que o ERP aceita pedidos vazios. Requisitos de cliente, itens, data, natureza, pagamento e validações comerciais precisam de confirmação no servidor/suporte antes de qualquer escrita futura. A matriz abaixo separa presença do campo de equivalência semântica.

## Matriz de adaptação

Todas as linhas usam evidência `CriarPedidoModelRequest` e seu DTO transitivo indicado, verificados em 08/10/2026. “Não marcada” significa ausência de required no OpenAPI; os requisitos de negócio permanecem pendentes. Campos sem equivalente não devem ser descartados silenciosamente.

| Campo interno | Campo API / evidência | Transformação proposta | Obrigatório? | Situação |
|---|---|---|---|---|
| orderId | Sem equivalente declarado | Ledger próprio por empresa/pedido | Local | Não enviar como ID Tiny |
| submissionId | ecommerce.numeroPedidoEcommerce / EcommerceRequestModel | Candidato a referência estável; aprovar uso e comprimento | Não marcada | Sem unicidade ou retenção garantida |
| status, submission, history/events | Sem equivalente de auditoria local | Ledger; não serializar objetos internos | Local | Independentes da situação do ERP |
| customerId | idContato | Resolver ID ERP integer da empresa | Não marcada | Campo confirmado |
| sellerId | vendedor.id | Resolver ID de vendedor, não ID de contato por suposição | Não marcada | Campo confirmado |
| operation | naturezaOperacao.id | Texto atual precisa de tabela ID validada | Não marcada | Consulta de naturezas pendente |
| number | numeroOrdemCompra / PedidoModel, possível candidato | Número local NÃO é numeroPedido gerado pelo ERP; decidir significado | Não marcada | Não mapear automaticamente |
| priceListId | listaPreco.id | Resolver ID e versão/preço efetivo | Não marcada | Política comercial pendente |
| saleDate | data | YYYY-MM-DD validado | Não marcada | Campo confirmado |
| deliveryDate | dataEntrega ou dataPrevista | Decidir entrega efetiva versus prevista | Não marcada | Semântica pendente |
| shippingDate | dataEnvio | Exemplo YYYY-MM-DD HH:mm:ss; timezone pendente | Não marcada | Campo confirmado |
| warehouse | deposito.id | String de UI → ID de depósito autorizado | Não marcada | Campo confirmado |
| intermediary | intermediador.id | Resolver ID / campos específicos | Não marcada | Campo confirmado |
| customerFreightCents | valorFrete | Centavos → decimal com escala acordada | Não marcada | Confirmar quem paga e incidência no total |
| companyFreightCents | Sem segundo frete declarado | Custo interno separado | Local | Não somar automaticamente a valorFrete |
| expensesCents | valorOutrasDespesas | Centavos → decimal | Não marcada | Campo confirmado |
| generalDiscountBasisPoints | valorDesconto | Percentual → valor monetário após descontos de item | Não marcada | Fórmula/base/arredondamento pendentes |
| items[].productId | itens[].produto.id | ID ERP real; tipo P/S se necessário | Não marcada; id non-nullable | Não converter SKU/mock ID em ID |
| items[].quantity | itens[].quantidade | Decimal, unidade e escala validadas | Não marcada | Confirmação de múltiplos/precisão pendente |
| items[].unitPriceCents | itens[].valorUnitario | Centavos → decimal conforme regra de preço | Não marcada | Campo confirmado |
| items[].discountBasisPoints | Nenhum campo desconto no ItemPedidoRequestModel | Possível preço líquido; somente após validar regra | Sem equivalente | Não aplicar duplamente item + geral |
| items[].id, code, name, brand, unit, weights | Sem campos equivalentes, além de produto.id e infoAdicional | Snapshot local; validar unidade do produto | Local | Não serializar DTO interno diretamente |
| payment.method | pagamento.formaRecebimento.id | Resolver formas-recebimento; não formas-pagamento por nome | Não marcada | Equivalência comercial pendente |
| payment.channel | pagamento.meioPagamento.id | Resolver meios-recebimento com semântica confirmada | Não marcada | Nomes dos recursos/DTO divergem |
| payment.bank | Não há campo no pedido de criação examinado | Requisito de cobrança a confirmar | Sem equivalente | Não perder requisito silenciosamente |
| payment.category | pagamento.categoria.id | Resolver categoria receita/despesa | Não marcada | Campo confirmado |
| payment.terms | pagamento.parcelas[] | Gerar vencimentos/valores por regra comercial aprovada | Não marcada | Texto “15 30 45” não é payload |
| shipping.method | transportador.formaEnvio.id | Resolver forma de envio | Não marcada | Campo confirmado |
| shipping.freightType | transportador.formaFrete.id | Resolver formasFrete do detalhe de envio | Não marcada | Campo confirmado; tipo textual atual insuficiente |
| shipping.payer | transportador.fretePorConta | Mapear apenas enum R/D/T/3/4/S validado | Não marcada | Confirmar incidência financeira |
| shipping.carrier | transportador.id | Resolver transportadora real | Não marcada | Rota própria não localizada |
| shipping.trackingCode, trackingUrl | codigoRastreamento, urlRastreamento em transportador | Sanitizar e validar | Não marcada | Campos confirmados |
| shipping.volumes | Nenhum campo volumes neste DTO | Não inferir pela dimensão do produto | Sem equivalente | Pendente |
| shipping.sendToDispatch | Nenhuma flag no DTO | Futura ação separada, nunca automática | Sem equivalente | Fora de 7A |
| notes, internalNotes | observacoes, observacoesInternas | Texto com limites a confirmar | Não marcada | Campos confirmados |
| endereço de entrega (ainda não há em Order) | enderecoEntrega | endereço/numero: `enderecoNro`, município, UF, CEP etc. | Não marcada | Gap do modelo interno |
| consumidor final (ainda não há) | consumidorFinal | Referência/estrutura oficial, sem dedução de CPF/CNPJ | Não marcada | Regra pendente |
| status inicial ERP | situacao / PedidoModel | Estado comercial separado da máquina de submissão | Não marcada | Default e efeitos NÃO CONFIRMADOS |

## Validação, sucesso e efeitos

Não existe rota de dry-run/validate confirmada. `validateOrder` deverá validar localmente/servidor com snapshots e regras documentadas; não usar criação como teste de validação. Valores monetários V3 number/float, sem precisão nem limites de itens declarados. Verificar suporte a 300 itens, tamanho do corpo e casas decimais antes de habilitar escrita. Parcelas, categoria, forma de recebimento e meio possuem DTOs próprios abaixo; não inventar IDs ou defaults.

Recibo futuro requer id válido, vínculo ao pedido/empresa e conteúdo congelado. Consultar `GET /pedidos/{idPedido}` e comparar cliente, itens, valores, referência e situação. IDs de recibo são do ERP; payload/hash do ERPReceipt atual precisam ser registrados pelo backend, pois a resposta de criação não devolve o conteúdo canônico local.

Situações publicadas: 8 incompleto, 0 aberta, 3 aprovada, 4 preparando envio, 1 faturada, 7 pronto envio, 5 enviada, 6 entregue, 10 em devolução, 2 cancelada, 9 não entregue. `SUBMITTED` significa envio confirmado, não faturado/entregue. Default inicial não confirmado.

Há operações separadas de lançar estoque, lançar contas, gerar nota e produção no OpenAPI. Sua existência **não prova ausência de gatilhos na criação**: a ajuda de aplicativos descreve permissões de gatilhos para estoque/financeiro. Confirmar configuração da conta e efeitos fiscais/financeiros antes de qualquer POST futuro. Não chamar essas operações na POC. Nenhum pedido criado, alterado, aprovado ou faturado em 7A.

### `CriarPedidoModelRequest`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `dataPrevista` | `string` | Não marcada | Sim |
| `dataEnvio` | `string` | Não marcada | Sim |
| `observacoes` | `string` | Não marcada | Sim |
| `observacoesInternas` | `string` | Não marcada | Sim |
| `situacao` | `integer [8, 0, 3, 4, 1, 7, 5, 6, 10, 2, 9]` | Não marcada | Sim |
| `data` | `string` | Não marcada | Sim |
| `dataEntrega` | `string` | Não marcada | Sim |
| `numeroOrdemCompra` | `string` | Não marcada | Sim |
| `valorDesconto` | `number` | Não marcada | Sim |
| `valorFrete` | `number` | Não marcada | Sim |
| `valorOutrasDespesas` | `number` | Não marcada | Sim |
| `idContato` | `integer` | Não marcada | Sim |
| `listaPreco` | `ListaPrecoRequestModel` | Não marcada | Não/sem declaração |
| `naturezaOperacao` | `NaturezaOperacaoRequestModel` | Não marcada | Não/sem declaração |
| `vendedor` | `VendedorRequestModel` | Não marcada | Não/sem declaração |
| `enderecoEntrega` | `EnderecoEntregaPedidoModelRequest` | Não marcada | Não/sem declaração |
| `consumidorFinal` | `ConsumidorFinalRequestModel` | Não marcada | Não/sem declaração |
| `ecommerce` | `EcommerceRequestModel` | Não marcada | Não/sem declaração |
| `transportador` | `TransportadorRequestModel` | Não marcada | Não/sem declaração |
| `intermediador` | `IntermediadorRequestModel` | Não marcada | Não/sem declaração |
| `deposito` | `DepositoRequestModel` | Não marcada | Não/sem declaração |
| `pagamento` | `PedidoPagamentoRequestModel` | Não marcada | Não/sem declaração |
| `itens` | `array<ItemPedidoRequestModel>` | Não marcada | Não/sem declaração |
| `pagamentosIntegrados` | `array<PagamentoIntegradoModelRequest>` | Não marcada | Não/sem declaração |
### `PedidoModel`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `dataPrevista` | `string` | Não marcada | Sim |
| `dataEnvio` | `string` | Não marcada | Sim |
| `observacoes` | `string` | Não marcada | Sim |
| `observacoesInternas` | `string` | Não marcada | Sim |
| `situacao` | `integer [8, 0, 3, 4, 1, 7, 5, 6, 10, 2, 9]` | Não marcada | Sim |
| `data` | `string` | Não marcada | Sim |
| `dataEntrega` | `string` | Não marcada | Sim |
| `numeroOrdemCompra` | `string` | Não marcada | Sim |
| `valorDesconto` | `number` | Não marcada | Sim |
| `valorFrete` | `number` | Não marcada | Sim |
| `valorOutrasDespesas` | `number` | Não marcada | Sim |
### `ItemPedidoRequestModel`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `produto` | `ProdutoRequestModel` | Não marcada | Não/sem declaração |
| `quantidade` | `number` | Não marcada | Sim |
| `valorUnitario` | `number` | Não marcada | Sim |
| `infoAdicional` | `string` | Não marcada | Sim |
### `PedidoPagamentoRequestModel`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `formaRecebimento` | `FormaRecebimentoRequestModel` | Não marcada | Não/sem declaração |
| `meioPagamento` | `MeioPagamentoRequestModel` | Não marcada | Não/sem declaração |
| `parcelas` | `array<ParcelaModelRequest>` | Não marcada | Sim |
| `categoria` | `CategoriaReceitaDespesaRequestModel` | Não marcada | Não/sem declaração |
### `ParcelaModelRequest`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `dias` | `integer` | Não marcada | Sim |
| `data` | `string` | Não marcada | Sim |
| `valor` | `number` | Não marcada | Sim |
| `observacoes` | `string` | Não marcada | Sim |
| `formaRecebimento` | `FormaRecebimentoRequestModel` | Não marcada | Não/sem declaração |
| `meioPagamento` | `MeioPagamentoRequestModel` | Não marcada | Não/sem declaração |
### `ParcelaModel`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `dias` | `integer` | Não marcada | Sim |
| `data` | `string` | Não marcada | Sim |
| `valor` | `number` | Não marcada | Sim |
| `observacoes` | `string` | Não marcada | Sim |
### `TransportadorRequestModel`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `id` | `integer` | Não marcada | Sim |
| `fretePorConta` | `string ['R', 'D', 'T', '3', '4', 'S']` | Não marcada | Sim |
| `formaEnvio` | `FormaEnvioRequestModel` | Não marcada | Não/sem declaração |
| `formaFrete` | `FormaFreteRequestModel` | Não marcada | Não/sem declaração |
| `codigoRastreamento` | `string` | Não marcada | Sim |
| `urlRastreamento` | `string` | Não marcada | Sim |
### `EcommerceRequestModel`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `id` | `integer` | Não marcada | Sim |
| `numeroPedidoEcommerce` | `string` | Não marcada | Sim |
### `ConsumidorFinalRequestModel`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `cpfCnpj` | `string` | Não marcada | Sim |
| `clienteConsumidorFinal` | `boolean` | Não marcada | Não/sem declaração |
### `IntermediadorRequestModel`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `id` | `integer` | Não marcada | Sim |
### `CriarPedidoModelResponse`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `id` | `integer` | Não marcada | Não/sem declaração |
| `numeroPedido` | `string` | Não marcada | Não/sem declaração |
