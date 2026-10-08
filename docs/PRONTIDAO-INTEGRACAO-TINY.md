# Prontidão para integração controlada Tiny/Olist

## O MVP garante hoje

Busca local, uma linha ativa de entrada, totais incrementais, autosave com um escritor, recuperação local, revisão por conteúdo, barreira durável antes de criação, congelamento de tentativas e consulta após resposta ambígua. HTTP 400 tem correção explícita e histórico preservado; auth/rate limit repetem a identidade; 500/timeout bloqueiam nova criação até consulta. O Mock ERP tem transações e índices únicos, além de rejeições de conteúdo duráveis que impedem a criação tardia da identidade antiga.

Tudo isso é uma simulação por origem/perfil do navegador. O ledger do mock está em IndexedDB. Não é uma garantia de um sistema distribuído real, nem backup ou autorização por usuário. Limpar armazenamento elimina registros locais. A Etapa 6 não executa OAuth, chamadas ao Tiny ou pedidos reais.

## Contrato a implementar

| Método | Responsabilidade do futuro provider |
|---|---|
| getProducts | Carregar catálogo paginado; campos normalizados, status, código, EAN, marca, preço e pesos |
| getCustomers | Carregar cadastro local pesquisável; sincronização paginada/incremental quando suportada |
| getSellers | Resolver IDs e permissões de vendedores |
| getPriceLists | Resolver listas e preços; documentar validade e regras de atualização |
| validateOrder | Validar IDs, unidades, pagamento, descontos e demais regras; sem chamadas por tecla |
| createOrder | Vincular identidade ao conteúdo; retornar recibo verificável; distinguir rejeição comprovada de resultado ambíguo |
| findSubmission | Consultar o resultado da tentativa sem criar nada; não presumir que Tiny pesquisa nosso UUID |
| findRejection | Comprovar rejeição terminal de conteúdo, impedindo uma aceitação tardia; pode exigir ledger/intermediação própria |

Não há endpoints definidos aqui. A implementação deverá consultar o Swagger oficial vigente da API V3 antes de definir URLs, verbos, scopes, esquemas, paginação e códigos de retorno.

## Perguntas que a API deverá responder

1. Existe chave de idempotência nativa? Qual seu prazo de retenção e vínculo ao conteúdo?
2. É possível enviar uma referência externa única, consultá-la e exigir unicidade no destino?
3. Uma busca que não encontrou é autoritativa ou pode haver processamento atrasado/consistência eventual?
4. Como distinguir uma rejeição antes da criação de uma falha depois do commit?
5. Qual é o contrato de rate limit e Retry-After? Como são os scopes e renovação OAuth?
6. Como mapear condição de pagamento, lista de preço, natureza da operação, frete, vendedor, impostos e casas decimais?
7. Quais operações oferecem sincronização incremental, exclusões/inativos e versões de cadastro?
8. Como consultar recibo/ID do pedido e auditar o resultado em caso de resposta perdida?

## Backend necessário

Browser → nosso backend → ledger durável → Tiny API. Sem adicionar esse backend na Etapa 6.

Guardar `submissionId UNIQUE`, identidade do pedido, conteúdo/hash imutável, estado, TinyOrderId, rejeições, tentativas, timestamps e resultado de reconciliação. A unicidade por pedido deverá aceitar várias tentativas rejeitadas, mas apenas uma criação final. A correção arquiva uma rejeição terminal e gera outra identidade para conteúdo revisado. Replays do mesmo UUID precisam devolver o resultado original.

O backend guarda Client Secret e tokens; o navegador não recebe secrets. OAuth deverá ter autenticação do usuário, callbacks validados, renovação de tokens e autorização por empresa/operador. Não fornecer credenciais na configuração do Pages.

**Um ledger próprio é necessário quando o Tiny não fornece idempotência, mas, sozinho, não torna atômicos o commit remoto e o commit local.** Depois de um timeout, o ERP pode ter criado o pedido. Sem uma referência única verificável ou consulta confiável no destino, conservar UNKNOWN e exigir reconciliação/manual assistida; não repetir a criação por suposição. A garantia de não duplicar depende dessa resolução ou de bloquear indefinidamente a repetição ambígua. Não prometer exactly-once apenas por haver uma tabela local.

## Sincronização e limites

- Produtos e clientes: backend faz paginação, cache, limites e atualizações em background. Navegador usa snapshot local; nenhuma requisição por tecla. Catalogar inativos, versões e validade dos preços.
- Listas de preço: identificar regras e data de referência, sem mudar silenciosamente os preços de um pedido congelado. Alterações anteriores ao envio exigem revisão explícita.
- Envio: validar o snapshot, registrar intenção durável, chamar o ERP com timeout controlado, registrar recibo ou incerteza. A UI não aguarda rede para elaborar o pedido.
- Rate limit: respeitar Retry-After e orçamento por credencial/empresa. Backoff com limite e jitter no backend; não fazer novas criações automáticas de tentativas ambíguas.
- Reconciliação: consultar recibo/referência comprovável e conferir vínculo ao conteúdo. Não inferir ausência por um único timeout ou busca eventualmente consistente.

## Próxima fase sugerida

Primeiro validar essas capacidades na documentação oficial e em ambiente de testes da API. Depois construir backend e ledger, inicialmente em modo de leitura e sincronização. Só habilitar criação com contas/pedidos de teste, comparação dos dados, testes de resposta perdida e reconciliação comprovada. O ensaio com operadores deve ocorrer antes de uso comercial.
