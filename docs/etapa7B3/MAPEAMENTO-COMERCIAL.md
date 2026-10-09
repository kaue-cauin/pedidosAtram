# Catálogo técnico e validação comercial

Identidade é organização + provider TINY + ID ERP textual, nunca SKU, GTIN, nome ou documento. IDs numéricos do JSON são preservados como lexemas antes de conversão para ponto flutuante; strings mantêm zeros. SKU/GTIN duplicados são permitidos como atributos, sem mesclar produtos.

| Recurso | Projeção | Estado comercial real |
| --- | --- | --- |
| Produtos | ID, SKU, GTIN, descrição, unidade original, estado, tipo, preços fonte e metadados | PENDING; I/E BLOCKED; UNKNOWN não ativo |
| Contatos | ID, código, nome/fantasia, cidade/UF, tipos, vendedor por ID | Classificação pendente; não implica cliente elegível |
| Vendedores | ID vendedor separado de ID contato, nome, situação | PENDING; política de acesso real pendente |
| Listas | ID, descrição, ajuste decimal, fórmula null | PENDING; não aplicar desconto pelo nome |

Campos privados de contato — documentos, emails, telefones, endereço detalhado e demais campos do DTO — não são copiados para catálogo, cache nem relatório. REAL é inspecionável apenas por ADMIN até aprovação da política de projeção. Nenhuma exceção promove REAL para uso comercial automaticamente.

## Precisão, unidades e pesos

DECIMAL_LEXEME_V1 conserva original, normalizado, escala, origem, tipo e validação. Expoentes limitados a 18, sem arredondamento, centavos ou escolha automática de promoção. Valores financeiros Number fracionários já transformados são recusados: o leitor deve preservar o lexema. Null não vira zero. A moeda, escala de operação, prioridade de promoção e fórmula de lista precisam de aprovação.

Unidade de venda original é textual. `Product.unit` aceita string; os mocks continuam UN e nenhum cálculo foi alterado. Regra de conversão é independente e permanece null. Peso físico não é unidade de venda: detalhe conserva o decimal original e unidade UNKNOWN; não multiplica por mil nem inventa gramas. Preço efetivo e peso em gramas não são materializados sem regra aprovada.

Produto pai/variação/kit não recebe aprovação automática. Status desconhecido nunca é ativo. Descrição inválida, identidade inválida ou estrutura incompatível bloqueiam/quarentenam. Ausência de preço conserva registro técnico pendente.

Vendedor null é UNASSIGNED. ID existente no conjunto completo é RESOLVED. Referência inexistente é UNKNOWN_REFERENCE, BLOCKED e gera quarentena. Não escolher o primeiro vendedor. O ID do vendedor não é substituído pelo ID do contato associado.

## Detalhes e atualização

Enriquecimento tem fase controlada no checkpoint, fila explícita de até dez IDs por job, flag próprio desabilitado e o mesmo orçamento por conta. Nada consulta detalhe ao digitar/selecionar. Progresso é persistido, respostas atrasadas são invalidadas e o catálogo ativo continua disponível. Detalhe ausente não apaga campo anterior. Exceções de listas com contrato não homologado interrompem a fase sem ativação.

Watermarks por recurso, semântica verificada e janela de sobreposição estão modelados para a evolução incremental. Nesta entrega executa-se full controlado: timezone, precisão e cobertura de exclusões não foram homologados, portanto nenhum filtro incremental real é habilitado. Ausência em delta não significa exclusão. A retomada de offset abandonado reinicia a cobertura.

Aprovação de preço/unidade/peso, elegibilidade de clientes, apresentação vendável, listas e permissões de vendedores permanece comercialmente pendente. FIXTURE/SYNTHETIC_ONLY distingue demonstração de autorização real. Conteúdo de pedidos existentes e tentativas congeladas nunca é recalculado pelo catálogo.
