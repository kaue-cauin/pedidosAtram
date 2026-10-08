# Mapeamento de produtos

Verificado em **08/10/2026 (UTC)**. Escopo: descoberta documental; nenhuma chamada autenticada nem escrita no ERP. “Confirmado” significa publicado na fonte oficial, não homologado na conta Atram.

Fontes: `GET /produtos` → `ListagemProdutosResponseModel`; `GET /produtos/{idProduto}` → `ObterProdutoModelResponse` e DTOs relacionados no [recorte](CONTRATOS-VERIFICADOS.json). A matriz é uma proposta de normalização, sem alterar os tipos atuais em 7A.

| Campo interno | Campo V3 / origem | Transformação proposta | Ausência / situação |
|---|---|---|---|
| id | id integer / lista e detalhe | Identidade por empresa + ID ERP; string interna identificada como ERP | Não usar mock ID, SKU ou EAN como ID; ausência bloqueia |
| code | sku string | Preservar texto e zeros | Não gerar código fictício; tratar duplicados no índice |
| ean | gtin string | Preservar texto/zeros | Vazio se ausente; não fabricar EAN |
| name | descricao | Texto para busca local normalizada | Sem descrição: impedir catálogo comercial até revisão |
| brand | marca no detalhe → MarcaResponseModel | Resolver ID/nome e exibir descrição | Não está na listagem; desconhecida visível, não marca fictícia |
| unit | unidade string | Preservar unidade, confirmar conversão | Modelo atual só aceita UN; bloquear demais até evolução deliberada em 7B |
| priceCents | precos.preco / precoPromocional | Conversão decimal exata a centavos conforme regra aprovada | Null ≠ zero; sem preço válido bloquear comercialização |
| preços por lista | lista detalhe: acrescimoDesconto, excecoes | Materializar snapshot por produto/lista no backend | Cardinalidade, prioridade da promoção e sinal/fórmula pendentes |
| status | situacao A/I/E | A ativo, I inativo; E tombstone/excluído | Não converter desconhecido em ativo |
| grossWeightGrams | dimensoes.pesoBruto (detalhe) | Converter somente após confirmar unidade física | Unidade kg/gramas NÃO explicitada no schema; não multiplicar por 1000 por suposição |
| netWeightGrams | dimensoes.pesoLiquido (detalhe) | Mesmo requisito; validar não negativo e relação pesos | Null ≠ zero; reportar incompletude |
| tipo comercial | tipo K/S/V/F/M, tipoVariacao N/P/V | Guardar metadados; conferir conflito allOf P/S | Modelo interno ainda não tem campo; não vender pai automaticamente |
| grade/variações | variacoes[], produtoPai no detalhe | IDs vendáveis por variação e SKU distintos | Não substituí-las pelo pai sem comprovar |
| caixa / múltiplo | unidadePorCaixa string | Guardar fonte; não deduzir MOQ ou regra de múltiplos | Mínimo, pacote e conversão pendentes |
| estoque | estoque em lista/detalhe; /estoque | Snapshot informativo por depósito | Não é reserva nem requisito de venda confirmado |
| validade do catálogo | dataCriacao/dataAlteracao | Timestamp original + versão do snapshot local | Timezone e precisão pendentes |

## Estratégia e auditoria comercial

Listagem fornece o catálogo básico; marca e pesos exigem enriquecimento em background e orçamento de chamadas. Não fazer GET detalhe ao selecionar cada produto. Ativar um snapshot só após resolver os campos comerciais obrigatórios. Quarentena para valores inválidos; preservar valor fonte e motivo. Arredondamento, escala monetária/quantidade e peso precisam ser fixados antes de normalizar. Preço promocional não implica automaticamente preço aplicável.

| Pergunta | Evidência / resposta | Situação |
|---|---|---|
| Preço do produto? | `precos.preco`, `precoPromocional` publicados | Confirmado estruturalmente; qual usar é decisão comercial |
| Preço por lista? | GET listas e detalhe; `/produtos?idListaPreco` filtra produtos com preço na lista | Confirmado; o filtro não garante retorno de preço efetivo calculado |
| Tabela/desconto por cliente? | Não aparece no ContatoModel examinado | NÃO CONFIRMADO; política Atram pendente |
| Alteração manual pelo vendedor? | Pedido tem `valorUnitario` | DTO admite valor; autorização/limites comerciais NÃO CONFIRMADOS |
| Quantidade mínima/múltiplo? | `unidadePorCaixa` existe, não regra MOQ | NÃO CONFIRMADO; decidir com operação |
| Unidade/caixa/pacote? | Unidade textual e caixa no detalhe | Conversões e apresentação vendável pendentes |
| Arredondamento? | Valores V3 number/float; precisão não declarada | NÃO CONFIRMADO; alinhar centavos e casas decimais com ERP |
| Desconto item/geral? | Item cria sem campo desconto; pedido tem `valorDesconto` | Não transportar basis points diretamente; ver matriz de pedidos |
| Data/versão do preço? | Datas de produto não provam vigência comercial | Política de revisão e validade pendente |

Guardar no pedido a versão de catálogo/lista usada, preço escolhido e regra aplicada; atualizar catálogo sem mudar silenciosamente itens de uma tentativa congelada. Repreço antes do envio exige revisão explícita.

### `ListagemProdutosResponseModel`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `id` | `integer` | Não marcada | Não/sem declaração |
| `sku` | `string` | Não marcada | Não/sem declaração |
| `descricao` | `string` | Não marcada | Não/sem declaração |
| `tipo` | `string ['K', 'S', 'V', 'F', 'M']` | Não marcada | Não/sem declaração |
| `situacao` | `string ['A', 'I', 'E']` | Não marcada | Não/sem declaração |
| `dataCriacao` | `string` | Não marcada | Sim |
| `dataAlteracao` | `string` | Não marcada | Sim |
| `unidade` | `string` | Não marcada | Não/sem declaração |
| `gtin` | `string` | Não marcada | Não/sem declaração |
| `precos` | `PrecoProdutoResponseModel` | Não marcada | Não/sem declaração |
| `estoque` | `EstoqueListagemResponseModel` | Não marcada | Não/sem declaração |
| `tipoVariacao` | `string ['N', 'P', 'V']` | Não marcada | Sim |
### `PrecoProdutoResponseModel`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `preco` | `number` | Não marcada | Sim |
| `precoPromocional` | `number` | Não marcada | Sim |
| `precoCusto` | `number` | Não marcada | Sim |
| `precoCustoMedio` | `number` | Não marcada | Sim |
### `DimensoesProdutoResponseModel`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `embalagem` | `EmbalagemResponseModel` | Não marcada | Não/sem declaração |
| `largura` | `number` | Não marcada | Sim |
| `altura` | `number` | Não marcada | Sim |
| `comprimento` | `number` | Não marcada | Sim |
| `diametro` | `number` | Não marcada | Sim |
| `pesoLiquido` | `number` | Não marcada | Sim |
| `pesoBruto` | `number` | Não marcada | Sim |
| `quantidadeVolumes` | `integer` | Não marcada | Sim |
### `ObterListaDePrecosModelResponse`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `id` | `integer` | Não marcada | Não/sem declaração |
| `descricao` | `string` | Não marcada | Sim |
| `acrescimoDesconto` | `number` | Não marcada | Sim |
| `excecoes` | `ExcecaoListaPrecoModel` | Não marcada | Não/sem declaração |
### `ExcecaoListaPrecoModel`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `idProduto` | `integer` | Não marcada | Sim |
| `codigo` | `string` | Não marcada | Sim |
| `preco` | `number` | Não marcada | Sim |
| `precoPromocional` | `number` | Não marcada | Sim |
