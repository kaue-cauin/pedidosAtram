# Mapa da API Tiny/Olist V3

Verificado em **08/10/2026 (UTC)**. Escopo: descoberta documental; nenhuma chamada autenticada nem escrita no ERP. “Confirmado” significa publicado na fonte oficial, não homologado na conta Atram.

## Evidência e limites da investigação

A própria [interface Swagger](https://erp.tiny.com.br/public-api/v3/swagger/index.html) referencia `swagger-initializer.js`, que define `url: "swagger.json"`. O [OpenAPI publicado](https://erp.tiny.com.br/public-api/v3/swagger/swagger.json) foi obtido por GET público: OpenAPI `3.0.0`, título `Olist ERP API v3`, versão declarada `3.1`, 138 caminhos, 218 operações. SHA-256 `4790f92277550d2b5999449f8bfd37cb8648fc9b12f6a1b464a6d135a6a818fd`; 1233619 bytes. O [recorte de contratos](CONTRATOS-VERIFICADOS.json) conserva tipos, enums, obrigatoriedade e referências sem dados de clientes. O arquivo integral ficou apenas no ambiente de investigação; o hash permite detectar mudanças. A versão `3.1` do arquivo não equivale a uma versão de cadastro ou à revisão do changelog.

Base de recursos: `https://api.tiny.com.br/public-api/v3`. Cada operação selecionada exige `bearerAuth` (HTTP Bearer); não há scopes individuais declarados no OpenAPI. Permissões mínimas: leitura no módulo correspondente e usuário com acesso, conforme [configuração oficial de aplicativos](https://ajuda.olist.com/hubs-e-plataformas-via-api/aplicativos-api-v3-configuracoes-e-utilizacao). A associação exata de cada rota ao módulo na conta é **NÃO CONFIRMADA** sem acesso autorizado. Não interpretar `scope=openid` como permissão de escrita ou de todos os módulos.

## Prioridade dos recursos

| Recurso | Necessidade | Situação |
|---|---|---|
| Produtos e detalhes | Indispensável: IDs, apresentação, preço, status | GETs confirmados; detalhe necessário para marca/pesos |
| Contatos e tipos | Indispensável: cliente válido | Listagem contém contatos de vários tipos; filtrar clientes localmente após validar tipos |
| Vendedores e listas de preço | Indispensável conforme política comercial | GETs confirmados; vínculo cliente→lista não confirmado |
| Recebimentos, meios e parcelas | Indispensável conforme cobrança | Não confundir forma de pagamento com forma de recebimento |
| Envio, frete, intermediador, depósito | Condicional à operação | GETs confirmados; strings atuais precisam virar IDs |
| Estoque | Futuro/condicional à política de venda | Consulta não reserva nem garante disponibilidade na criação |
| Marcas | Enriquecimento do catálogo | Confirmado; produto detalhado também traz marca |
| Natureza de operação | Condicional fiscal/comercial | DTO de referência por ID confirmado; nenhuma rota GET própria localizada neste snapshot |
| Transportadoras | Condicional ao frete | `transportador.id` no pedido; rota GET própria não localizada; investigar contato/tipos na conta |
| Pedidos existentes | Reconciliação; somente leitura em 7A | GET por ID e filtro externo confirmados |
| Empresa/consumo | Identificar conta | `/info` tem cadastro da empresa; consumo NÃO está no schema examinado |

## Operações e contratos

Em todas as linhas abaixo a data é 08/10/2026 e a evidência específica é `paths[caminho].get` no [OpenAPI](https://erp.tiny.com.br/public-api/v3/swagger/swagger.json) e no recorte JSON. Os GETs não têm corpo documentado. IDs de path são inteiros obrigatórios; queries listadas são opcionais salvo indicação. `limit` tem default 100, `offset` default 0 quando presentes; **máximo NÃO CONFIRMADO**, sem `maximum`. Listagens com paginação retornam `itens` e `paginacao` (`limit`, `offset`, `total`). Não impor esse envelope a depósitos ou meios de recebimento: seguir seu DTO.

### `GET /produtos` — `ListarProdutosAction`

Permissão proposta: leitura, módulo `Produtos`; vínculo exato pendente. Parâmetros: `nome` (query, string, opcional); `codigo` (query, string, opcional); `gtin` (query, integer, opcional); `situacao` (query, tipo não declarado ['A', 'I', 'E'], opcional); `dataCriacao` (query, string, opcional); `dataAlteracao` (query, string, opcional); `idListaPreco` (query, integer, opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListagemProdutosResponseModel>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /produtos/{idProduto}` — `ObterProdutoAction`

Permissão proposta: leitura, módulo `Produtos`; vínculo exato pendente. Parâmetros: `idProduto` (path, integer, obrigatório).

Resposta 200: `ObterProdutoModelResponse`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /contatos` — `ListarContatosAction`

Permissão proposta: leitura, módulo `Contatos`; vínculo exato pendente. Parâmetros: `nome` (query, string, opcional); `codigo` (query, string, opcional); `situacao` (query, tipo não declarado ['B', 'A', 'I', 'E'], opcional); `idVendedor` (query, integer, opcional); `cpfCnpj` (query, string, opcional); `celular` (query, string, opcional); `dataCriacao` (query, string, opcional); `dataAtualizacao` (query, string, opcional); `orderBy` (query, tipo não declarado ['asc', 'desc'], opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListagemContatoModelResponse>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /contatos/{idContato}` — `ObterContatoAction`

Permissão proposta: leitura, módulo `Contatos`; vínculo exato pendente. Parâmetros: `idContato` (path, integer, obrigatório).

Resposta 200: `ObterContatoModelResponse`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /contatos/tipos` — `ListarTiposDeContatosAction`

Permissão proposta: leitura, módulo `Contatos`; vínculo exato pendente. Parâmetros: `nome` (query, string, opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListarTiposDeContatosModelResponse>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /vendedores` — `ListarVendedoresAction`

Permissão proposta: leitura, módulo `Vendedores`; vínculo exato pendente. Parâmetros: `nome` (query, string, opcional); `codigo` (query, string, opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListagemVendedoresModelResponse>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /marcas` — `ListarMarcasAction`

Permissão proposta: leitura, módulo `Marcas`; vínculo exato pendente. Parâmetros: `descricao` (query, string, opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListagemMarcasResponseModel>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /listas-precos` — `ListarListasDePrecosAction`

Permissão proposta: leitura, módulo `Lista de Preços`; vínculo exato pendente. Parâmetros: `nome` (query, string, opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListagemListaDePrecosModelResponse>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /listas-precos/{idListaDePreco}` — `ObterListaDePrecosAction`

Permissão proposta: leitura, módulo `Lista de Preços`; vínculo exato pendente. Parâmetros: `idListaDePreco` (path, integer, obrigatório); `idProduto` (query, integer, opcional).

Resposta 200: `ObterListaDePrecosModelResponse`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /formas-pagamento` — `ListarFormasPagamentoAction`

Permissão proposta: leitura, módulo `Formas de pagamento`; vínculo exato pendente. Parâmetros: `nome` (query, string, opcional); `situacao` (query, tipo não declarado [1, 2], opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListagemFormasPagamentoResponseModel>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /formas-pagamento/{idFormaPagamento}` — `ObterFormaPagamentoAction`

Permissão proposta: leitura, módulo `Formas de pagamento`; vínculo exato pendente. Parâmetros: `idFormaPagamento` (path, integer, obrigatório).

Resposta 200: `ObterFormaPagamentoResponseModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /formas-recebimento` — `ListarFormasRecebimentoAction`

Permissão proposta: leitura, módulo `Formas de recebimento`; vínculo exato pendente. Parâmetros: `nome` (query, string, opcional); `situacao` (query, tipo não declarado [1, 2], opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListagemFormasRecebimentoResponseModel>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /formas-recebimento/{idFormaRecebimento}` — `ObterFormaRecebimentoAction`

Permissão proposta: leitura, módulo `Formas de recebimento`; vínculo exato pendente. Parâmetros: `idFormaRecebimento` (path, integer, obrigatório).

Resposta 200: `ObterFormaRecebimentoResponseModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /meios-recebimento` — `ListarMeiosRecebimentoAction`

Permissão proposta: leitura, módulo `Meios de recebimento`; vínculo exato pendente. Parâmetros: `tipo` (query, tipo não declarado ['banco', 'gateway'], opcional); `banco` (query, tipo não declarado ['001', '033', '041', '104', '104_SIGCB', '237', '341', '399', '748', '756', '004', '422', '136', '091', '197', '077', '509', '509_GUEST', 'OUTRO'], opcional); `gateway` (query, tipo não declarado [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 99], opcional); `situacao` (query, tipo não declarado [1, 2], opcional).

Resposta 200: `itens: array<MeioRecebimentoResponseModel>`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /formas-envio` — `ListarFormasEnvioAction`

Permissão proposta: leitura, módulo `Logistica`; vínculo exato pendente. Parâmetros: `nome` (query, string, opcional); `tipo` (query, tipo não declarado [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35], opcional); `situacao` (query, tipo não declarado [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35], opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListagemFormasEnvioResponseModel>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /formas-envio/{idFormaEnvio}` — `ObterFormaEnvioAction`

Permissão proposta: leitura, módulo `Logistica`; vínculo exato pendente. Parâmetros: `idFormaEnvio` (path, integer, obrigatório).

Resposta 200: `ObterFormaEnvioResponseModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /depositos` — `ListarDepositosAction`

Permissão proposta: leitura, módulo `Depósitos`; vínculo exato pendente. Parâmetros: nenhum.

Resposta 200: `array<DetalheDepositoResponseModel>` (array direto); HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /depositos/{idDeposito}` — `ObterDepositoAction`

Permissão proposta: leitura, módulo `Depósitos`; vínculo exato pendente. Parâmetros: `idDeposito` (path, integer, obrigatório).

Resposta 200: `DetalheDepositoResponseModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /estoque` — `ListarEstoqueAction`

Permissão proposta: leitura, módulo `Estoque`; vínculo exato pendente. Parâmetros: `dataAlteracao` (query, string, opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListagemEstoqueItemResponseModel>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /estoque/{idProduto}` — `ObterProdutoEstoqueAction`

Permissão proposta: leitura, módulo `Estoque`; vínculo exato pendente. Parâmetros: `idProduto` (path, integer, obrigatório).

Resposta 200: `ObterEstoqueProdutoModelResponse`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /intermediadores` — `ListarIntermediadoresAction`

Permissão proposta: leitura, módulo `Intermediadores`; vínculo exato pendente. Parâmetros: `nome` (query, string, opcional); `cnpj` (query, string, opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListagemIntermediadoresResponseModel>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /categorias-receita-despesa` — `ListarCategoriasReceitaDespesaAction`

Permissão proposta: leitura, módulo `Categorias de receita e despesa`; vínculo exato pendente. Parâmetros: `descricao` (query, string, opcional); `grupo` (query, string, opcional); `orderBy` (query, tipo não declarado ['asc', 'desc'], opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListagemCategoriasReceitaDespesaResponseModel>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /contas-bancarias` — `ListarContasBancariasAction`

Permissão proposta: leitura, módulo `Contas Bancárias`; vínculo exato pendente. Parâmetros: `descricao` (query, string, opcional); `banco` (query, tipo não declarado ['001', '033', '041', '104', '104_SIGCB', '237', '341', '399', '748', '756', '004', '422', '136', '091', '197', '077', '509', '509_GUEST', 'OUTRO'], opcional); `orderBy` (query, tipo não declarado ['asc', 'desc'], opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListagemContasBancariasResponseModel>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /pedidos` — `ListarPedidosAction`

Permissão proposta: leitura, módulo `Pedidos`; vínculo exato pendente. Parâmetros: `numero` (query, integer, opcional); `nomeCliente` (query, string, opcional); `codigoCliente` (query, string, opcional); `cpfCnpj` (query, string, opcional); `dataInicial` (query, string, opcional); `dataFinal` (query, string, opcional); `dataAtualizacao` (query, string, opcional); `situacao` (query, tipo não declarado [8, 0, 3, 4, 1, 7, 5, 6, 10, 2, 9], opcional); `numeroPedidoEcommerce` (query, string, opcional); `idVendedor` (query, integer, opcional); `marcadores` (query, array<string>, opcional); `origemPedido` (query, integer [0, 1], opcional); `orderBy` (query, tipo não declarado ['asc', 'desc'], opcional); `limit` (query, integer, opcional); `offset` (query, integer, opcional).

Resposta 200: `itens: array<ListagemPedidoModelResponse>`; `paginacao: PaginatedResultModel`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /pedidos/{idPedido}` — `ObterPedidoAction`

Permissão proposta: leitura, módulo `Pedidos`; vínculo exato pendente. Parâmetros: `idPedido` (path, integer, obrigatório).

Resposta 200: `ObterPedidoModelResponse`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

### `GET /info` — `ObterInfoContaAction`

Permissão proposta: leitura, módulo `Dados da empresa`; vínculo exato pendente. Parâmetros: nenhum.

Resposta 200: `ObterInfoContaModelResponse`; HTTP documentados: 200, 400, 404, 403, 503, 401, 500. DTO de 400: `ErrorDTO` (`mensagem`, `detalhes[]` com campo/mensagem). Outros corpos de erro não garantidos. Campos: referências transitivas em `schemas` do recorte; presença obrigatória apenas se `required` existir, null apenas se declarado.

## Inconsistências e lacunas

- `ObterProdutoModelResponse` compõe `ProdutoResponseModel` e repete `tipo` com outro enum (base P/S; detalhe K/S/V/F/M). A composição allOf é ambígua: validar amostra antes de gerar um cliente rígido.
- `gtin` é string na resposta, mas integer no filtro de produtos: não converter EAN do catálogo em número nem perder zeros.
- Query `situacao` em `/formas-envio` repete o enum de tipos 0–35; detalhe declara situação 1/2 com type string e enum numérico. Não deduzir um filtro correto desse conflito.
- `numeroPedido` é string na criação e integer no detalhe. Normalizar para string internamente, validar ambos os contratos.
- Listas de preço declaram `excecoes` como objeto único, não array. Cardinalidade e significado precisam de confirmação.
- `required` ausente não prova que o servidor aceite omissões. Nem 200 sem `required` garante resposta completa.
- 429/409, Retry-After, validação sem efeitos e idempotência não são garantidos pelos códigos enumerados nas operações. Ver os documentos de riscos e limites.
- `/info` não declara plano, saldo, consumo ou limite. A central de ajuda anuncia informações de uso, mas esse contrato não as comprova. Usar os headers documentados e confirmar conta/contrato com suporte.

Não houve consulta autenticada nem validação de comportamento real, inclusividade de datas (exceto estoque descrito como >=), timezone, máximo de página, ordenação estável ou disponibilidade dos cadastros na Atram.
