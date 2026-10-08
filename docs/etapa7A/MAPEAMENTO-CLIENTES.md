# Mapeamento de clientes/contatos

Verificado em **08/10/2026 (UTC)**. Escopo: descoberta documental; nenhuma chamada autenticada nem escrita no ERP. “Confirmado” significa publicado na fonte oficial, não homologado na conta Atram.

Fontes: `ListagemContatoModelResponse`, `BaseContatoModel`, `ObterContatoModelResponse`, `ContatoModel`, `EnderecoModel` em [contratos](CONTRATOS-VERIFICADOS.json). Todo contato não é necessariamente cliente: tipos e política de elegibilidade precisam ser verificados.

| Campo interno/interesse | Campo V3 | Transformação | Situação |
|---|---|---|---|
| id | id integer | ID ERP vinculado à empresa; string interna | Confirmado; não usar mock ID/código/documento |
| code | codigo | Preservar texto | Confirmado, pode ser null |
| name / razão social | nome | Exibir nome conforme tipoPessoa | Confirmado; ausência impede seleção comercial |
| fantasia | fantasia | Exibição opcional | Confirmado; não existe no Customer atual |
| taxId | cpfCnpj | Texto, preservar zeros | Confirmado; documento completo só quando necessário |
| status | situacao B/A/I/E | B e A ativos, I/E excluídos da seleção conforme política | Confirmado; não reutilizar enum de produto |
| endereço principal | endereco | Snapshot autorizado no pedido | Confirmado; estrutura EnderecoModel |
| cidade / UF | endereco.municipio / uf | Strings para Customer.city/state | Confirmado; null não vira local fictício |
| cobrança | enderecoCobranca no detalhe | Não presumir entrega | Confirmado, endereço alternativo de cobrança |
| entrega alternativa | endereçoEntrega no pedido | Seleção validada a definir | Coleção de endereços de entrega do contato NÃO CONFIRMADA |
| vendedor | vendedor → VendedorResponseModel | ID/contato do vendedor | Confirmado em lista e detalhe; resolver ID correto |
| lista de preço por cliente | nenhum campo encontrado | Regra externa/consulta adicional a confirmar | NÃO CONFIRMADO |
| condição de pagamento | nenhum campo encontrado | Política comercial a definir | NÃO CONFIRMADO |
| crédito | limiteCredito no detalhe | Só servidor se necessário; não inferir saldo/crédito disponível | Estrutura confirmada; enforcement não confirmado |
| tipo/CRM | tipos[], statusCrm | Elegibilidade cliente separada de situação de cadastro | Confirmado; regras Atram pendentes |

`contatos[]` e GET pessoas são pessoas de contato, não evidência de coleção de endereços alternativos. Detalhe contém campos pessoais sem finalidade neste MVP (família, nascimento, profissão etc.): não exportar DTO integral para navegador, IndexedDB ou relatórios públicos. Retornar projeção mínima para autocomplete: ID interno, código, nome autorizado, cidade/UF e documento mascarado quando necessário. O modelo atual exige taxId string: futura redução requer alteração explícita do contrato, sem inventar documento. PII integral somente em ação autorizada e política de retenção; limitar catálogo por empresa e operador.

Atualização por `dataAtualizacao` (não `dataAlteracao` usado em produtos); filtro situacao inclui excluídos. Cobertura de exclusões definitivas e confiabilidade incremental não comprovadas. Quarentena para ID ausente, nome vazio, UF inválida ou vendedor incompatível; não emitir pedido sem cliente validado. Nenhum dado real coletado nesta etapa.

### `ListagemContatoModelResponse`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `nome` | `string` | Não marcada | Sim |
| `codigo` | `string` | Não marcada | Sim |
| `fantasia` | `string` | Não marcada | Sim |
| `tipoPessoa` | `string ['J', 'F', 'E', 'X']` | Não marcada | Sim |
| `cpfCnpj` | `string` | Não marcada | Sim |
| `inscricaoEstadual` | `string` | Não marcada | Sim |
| `rg` | `string` | Não marcada | Sim |
| `telefone` | `string` | Não marcada | Sim |
| `celular` | `string` | Não marcada | Sim |
| `email` | `string` | Não marcada | Sim |
| `endereco` | `EnderecoModel` | Não marcada | Não/sem declaração |
| `id` | `integer` | Não marcada | Não/sem declaração |
| `vendedor` | `VendedorResponseModel` | Não marcada | Sim |
| `situacao` | `string ['B', 'A', 'I', 'E']` | Não marcada | Sim |
| `statusCrm` | `string ['L', 'P', 'C', 'I']` | Não marcada | Sim |
| `dataCriacao` | `string` | Não marcada | Sim |
| `dataAtualizacao` | `string` | Não marcada | Sim |
| `tipos` | `array<TipoContatoModel>` | Não marcada | Sim |
| `contatos` | `array<PessoaContatoModel>` | Não marcada | Sim |
### `EnderecoModel`

| Propriedade | Tipo/DTO | Presença obrigatória no schema | Aceita null declarado |
|---|---|---|---|
| `endereco` | `string` | Não marcada | Sim |
| `numero` | `string` | Não marcada | Sim |
| `complemento` | `string` | Não marcada | Sim |
| `bairro` | `string` | Não marcada | Sim |
| `municipio` | `string` | Não marcada | Sim |
| `cep` | `string` | Não marcada | Sim |
| `uf` | `string` | Não marcada | Sim |
| `pais` | `string` | Não marcada | Sim |
