# Verificação da Etapa 7A — descoberta técnica Tiny/Olist V3

Data: **08/10/2026**. Base revisada: `66bd55afe1ba91624658dd1e2e762cd057c147da`. Entrega exclusivamente documental sobre o repositório existente; aplicação, dependências, provider mock e workflow preservados. Não há TinyERPProvider, rota de POST, backend, migração ou início da Etapa 7B.

## Resultado de aceite

**Análise documental concluída, com lacunas explicitamente identificadas. Conexão real e homologação de escrita não aprovadas.** O escopo permite concluir investigação sem credenciais; isso não transforma testes autenticados pendentes em testes aprovados.

| Critério | Resultado | Evidência / limite |
|---|---|---|
| Examinar V3 verificavelmente | Atendido | Swagger → initializer → OpenAPI público, hash e recorte de contratos |
| Confirmar endpoints críticos ou marcar pendências | Atendido | Mapa de GETs; POST somente estudado; natureza/transportadora/consumo pendentes |
| Fluxo OAuth e requisitos | Atendido documentalmente | URLs oficiais, expiração, refresh, state/callback; PKCE/revogação pendentes |
| Mapear produtos e clientes | Atendido | Matrizes de campos, detalhe versus lista, privacidade e unidade atual UN |
| Compreender DTO de criação | Atendido documentalmente | Matriz completa, required ausente, parcelas/frete/recibo, lacunas de semântica |
| Levantar permissões e limites | Atendido documentalmente | Leitura por módulo, quotas publicadas por conta e headers; plano Atram desconhecido |
| Projetar sincronização | Atendido | Staging, versão/ativação, incremental melhor esforço e reconciliação completa |
| Documentar idempotência e riscos | Atendido | RISCO CRÍTICO: sem unicidade/ausência autoritativa comprovadas; UNKNOWN bloqueado |
| Recomendar arquitetura | Atendido | B: frontend/API Node no mesmo domínio, sem executar migração |
| Nenhuma escrita real | Atendido | Somente GET público de documentação; 0 chamadas autenticadas, 0 escritas ERP |
| Testes anteriores passando | Atendido localmente | Nove comandos abaixo; execução remota do commit documental ainda não observada |
| OAuth/leitura na conta | Pendente, não executado | Sem runtime seguro e credenciais autorizadas |
| Plano/módulos/quotas da Atram | Pendente | Sem consulta à conta; números públicos não são limites efetivos |
| Política comercial e contrato idempotente | Pendente | Decisão da empresa e esclarecimento oficial, indispensáveis antes de escrita |

## Documentos e evidências

- [Mapa da API](etapa7A/MAPA-API-V3.md): caminhos, parâmetros, DTOs, status e inconsistências.
- [OAuth e permissões](etapa7A/OAUTH-E-PERMISSOES.md): fluxo, proteção de segredos e roteiro da POC pendente.
- [Produtos](etapa7A/MAPEAMENTO-PRODUTOS.md), [clientes](etapa7A/MAPEAMENTO-CLIENTES.md) e [pedidos](etapa7A/MAPEAMENTO-PEDIDOS.md): matrizes de origem, transformação, obrigatoriedade e situação.
- [Idempotência](etapa7A/IDEMPOTENCIA-E-RECONCILIACAO.md): dez perguntas, certeza dos erros e bloqueio de ambiguidades.
- [Rate limit e sincronização](etapa7A/RATE-LIMIT-E-SINCRONIZACAO.md): capacidade hipotética para dez operadores, paginação e webhooks.
- [Decisões de arquitetura](etapa7A/DECISOES-ARQUITETURA.md): alternativas A/B, recomendação, responsáveis e gates de próxima fase.
- [Recorte OpenAPI](etapa7A/CONTRATOS-VERIFICADOS.json): contratos públicos selecionados e referências transitivas; sem texto descritivo integral nem dados reais.
- [Regressão local](etapa7A/REGRESSAO.json): resultados, durações e limitações.

## Principais achados

Endpoints confirmados: produtos/lista e detalhe, contatos/lista e detalhe/tipos, vendedores, marcas, listas de preços/lista e detalhe, formas de pagamento/recebimento, meios de recebimento, formas de envio/detalhe, depósitos, estoque, intermediadores, categorias receita/despesa, contas bancárias, pedidos/lista e detalhe e info. O recorte inclui o POST de pedidos **como evidência documental**, não como operação executável da aplicação.

Campos confirmados: ID, SKU, descrição, GTIN textual, unidade, preços/status do produto; marca e pesos no detalhe; cliente com código/nome/fantasia/documento/endereço/situação/vendedor; criação com IDs referenciados, itens/quantidade/valorUnitario, pagamento/parcelas, frete, observações, referência externa e recibo ID/número. Equivalência comercial não deriva apenas da existência do campo.

Não confirmados: unidade dos pesos, preço efetivo/cliente e arredondamento, obrigatoriedade de negócio, máximo de página/itens, estabilidade de paginação, vigência de preços, PKCE/revogação, quota da conta, unicidade e consistência da referência externa. Erros 400/401/429 não têm prova documental de ausência de criação. O schema /info não comprova consumo; há conflito entre ajuda e contrato. Outros conflitos: tipo produto em allOf, filtro GTIN integer, situação envio e exceções de lista com cardinalidade ambígua.

Nenhum teste OAuth/refresh/leitura real ou ensaio de idempotência no Tiny realizado. Não foram coletados CPF/CNPJ, endereços, pedidos ou tokens reais. A referência externa com filtro de busca existe, mas **não permite prometer exactly-once**. Recibo perdido deve permanecer UNKNOWN até reconciliação positiva verificável ou resolução autoritativa.

## Regressões executadas

Node.js 24, mesmo código da Etapa 6. Lint com zero warnings exigido pelo script.

| Comando | Resultado | Duração local (s) |
|---|---|---:|
| `npm run check:data` | PASS | 0.79 |
| `npm run check:stage2` | PASS | 0.70 |
| `npm run check:stage3` | PASS | 1.74 |
| `npm run check:stage4` | PASS | 0.69 |
| `npm run check:stage5` | PASS | 0.48 |
| `npm run check:stage6` | PASS | 0.79 |
| `npm run typecheck` | PASS | 5.84 |
| `npm run lint` | PASS | 11.35 |
| `npm run build` | PASS | 34.92 |

Etapa 3: 75.642 assertions e 10.800 operações em tamanhos 10/50/100/150/200/300; Etapa 4: 26 verificações da fila; Etapa 5: 93; Etapa 6: 143; build estático e 111 verificações do service worker em VM com 37 recursos. Estes são testes locais de regressão, não novas medições de latência visual, IndexedDB real ou redes em navegador. As evidências browser das etapas anteriores continuam em seus relatórios; nenhuma alteração de código justifica substituí-las nesta entrega.

CI remoto: na consulta após a publicação documental não havia workflow/check-run associado ao novo commit. A [última execução verde](https://github.com/kaue-cauin/pedidosAtram/actions/runs/37766536618) verifica a base `66bd55a`; o código executável é idêntico. **Não declarar CI desta entrega como aprovado.** O workflow existente permanece habilitado no arquivo para push/main e workflow_dispatch, sem modificações. Uma nova execução remota continua pendente.

Não criado `check:stage7a`: não houve código de POC. CI público não recebe nem utiliza credenciais de produção. A verificação de links locais e referências de schemas confirma consistência dos documentos selecionados, não comportamento do servidor ERP.

## Próximo passo condicionado

A empresa precisa definir conta/plano, usuário de leitura, runtime/callback seguro, política de preço/unidade/pagamento e processo conservador de reconciliação. Recomendação para 7B: primeiro OAuth e GET controlados, backend de leitura e catálogo local; criação só em fase explicitamente autorizada após resolver integridade/idempotência. **Encerrar 7A e aguardar aprovação explícita da 7B.**
