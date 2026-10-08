# Verificação da Etapa 7B.1

Data: **08/10/2026**. Base: `f5629f449f4b14c6dc66cb5bd9916de98fcc6f30`. Implementação isolada de prova de conexão/leitura sobre o projeto existente. **Estado atual: implementação concluída e prova operacional de autenticação/leitura real aprovada para os cinco recursos testados**, conforme resultados fornecidos pelo responsável. Mapeamentos comerciais completos e infraestrutura definitiva continuam pendentes. A implementação inicial antecedeu a sessão real; esse histórico foi preservado abaixo.

## Entrega

- [Arquitetura e roteiro seguro](etapa7B1/ARQUITETURA-POC.md).
- [OAuth implementado/testado localmente](etapa7B1/OAUTH-VALIDADO.md).
- [Consultas e controles locais](etapa7B1/CONSULTAS-LEITURA.md).
- [Contratos documentais versus observações](etapa7B1/CONTRATOS-OBSERVADOS.md).
- [Permissões e limites](etapa7B1/PERMISSOES-E-LIMITES.md).
- [Pendências comerciais](etapa7B1/PENDENCIAS-COMERCIAIS.md).
- [Evidência pública de especificação](etapa7B1/EVIDENCIAS-PUBLICAS.json) e [regressão local](etapa7B1/REGRESSAO-LOCAL.json).

Código criado: `integrations/tiny-poc/{config,transport,oauth,contracts,read-client,server}.ts`; scripts `tiny-poc.mjs` e `check-stage-7b1.mjs`. Alterados somente configuração de scripts, README, exemplo inerte de ambiente e workflow para incluir check:stage7b1. Não alterados componentes do MVP, Product, domínio, totais, autosave, repositórios de rascunho ou MockERPProvider. Nenhuma dependência adicionada; lockfile preservado.

## OAuth e segurança

Authorization code no servidor, state/cookie de sessão de uso único e prazo de cinco minutos, callback exato, S256 condicionado a confirmação do suporte, tokens em memória privada, parsing estrito, refresh autorizado/serializado e desconexão. Respostas/corpos sensíveis não são registrados. Nenhum endpoint de revogação inventado. A sessão local dura 30 minutos: com access token real de quatro horas, refresh normal não será exercido nessa janela; a implementação de refresh foi validada com mocks, não com o provedor.

Serviço somente em loopback, controles autenticados, Host exato, proteção de origem nas ações/relatório; callback com cookie/state. /status é leitura autenticada sem efeitos para a cadeia de redirect OAuth, sem CORS público. Nenhum endpoint público de diagnóstico ou DTO integral exposto. Credencial própria de controle local não é token/Client Secret ERP. Encerrar remove a conexão local; não equivale a revogar no provedor.

Cliente só faz GETs em base/paths fixos e allowlist explícita, até oito por processo, primeira página com dez itens, timeout incluindo corpo, limite de bytes, redirects bloqueados e sem retries automáticos. /info precisa corresponder ao documento esperado no servidor antes de consultas aos cadastros. Desconexão mantém orçamento gasto. Nenhuma rota genérica de ERP, consulta a pedidos, escrita de dados, PostgreSQL, catálogo real, migração ou sincronização completa adicionada.

## Testes executados na implementação inicial (histórico)

| Comando | Resultado | Duração do lote local (s) |
|---|---|---:|
| `npm run check:data` | PASS | 0.53 |
| `npm run check:stage2` | PASS | 0.51 |
| `npm run check:stage3` | PASS | 2.71 |
| `npm run check:stage4` | PASS | 0.75 |
| `npm run check:stage5` | PASS | 0.44 |
| `npm run check:stage6` | PASS | 0.58 |
| `npm run check:stage7b1` | PASS | 0.78 |
| `npm run typecheck` | PASS | 5.10 |
| `npm run lint` | PASS | 12.76 |
| `npm run build` | PASS | 33.63 |

Suíte específica final: **19 testes, 19 aprovados**. A adição final de teste de redirect real em loopback foi executada novamente após o lote completo; lint também repetido após esse ajuste de teste. Cobertura: pré-requisitos ausentes, callback inseguro, state/cookie/URI inválidos, replay e concorrência, PKCE condicional, resposta/token inválido, expiração, refresh serializado/expirado/falha, encerramento em voo, ordem de conta, identidade divergente, allowlist/budget, paginação/tipos/conflitos, códigos 401/403/429/500, network/timeout/JSON/corpo, quotas, Host/CSRF/autenticação e privacidade. HTTP real local testa serviço e bloqueio de redirecionamento; toda comunicação OAuth/Tiny nesses testes foi substituída por mocks.

Testes anteriores também passaram. Build estático: 37 recursos e 111 verificações de offline em VM. Busca em bundles estáticos não encontrou identificadores de segredo/admin ou classe OAuth da POC. Smoke do launcher sem pré-requisitos: CONFIG_PENDING, exit 1, antes de abrir servidor. Testes não necessitam credenciais; CI inclui check:stage7b1 e não deve receber credenciais reais. **CI remoto confirmado:** [run 37805884471](https://github.com/kaue-cauin/pedidosAtram/actions/runs/37805884471), commit de código `d54552c218d160a77b453c2cebd54f4a735e0458`, conclusão success em build e deploy. Executou os dez comandos, incluindo a suíte final de 19 testes. Publicação no Pages permanece a demonstração mock; o serviço Node não é hospedado pelo Pages. O commit posterior deste relatório altera somente documentação/evidência, sem mudar o código verificado.

Não repetido benchmark visual em navegador nesta subetapa porque a POC não é importada pela aplicação e os componentes críticos não foram alterados. As evidências e limites de performance das Etapas 3–6 continuam válidos como histórico; não declarar novas medidas reais de UI/rede/IndexedDB.

## Conta real: estado na entrega inicial, antes da sessão fornecida (histórico)

| Verificação | Resultado |
|---|---|
| Especificação V3 pública | Reobtida; SHA-256 idêntico à 7A, sem mudança relevante |
| Página oficial OAuth/limites | Reconsultada; URLs/headers documentais mantidos |
| Metadata pública OIDC / PKCE | Timeout no GET de descoberta, sem resultado; suporte ainda não confirmado |
| Conexão OAuth/autorização/token/refresh real | NÃO EXECUTADOS |
| GET /info/produtos/contatos/vendedores/listas-precos reais | ZERO, bloqueados por pré-requisitos pendentes |
| Detalhes opcionais reais | NÃO EXECUTADOS |
| Recursos acessíveis/não acessíveis na Atram | NÃO DETERMINADOS, não afirmar falha de permissão |
| Divergência OpenAPI versus retorno real | NÃO DETERMINADA; conflitos documentais da 7A permanecem |
| Quota efetiva / headers reais | NÃO OBSERVADOS; confirmar plano/administrador |
| Dados pessoais ou tokens em relatórios/Git | Nenhum dado real coletado/configurado |
| Pedidos criados/alterados, financeiro, estoque ou fiscal | ZERO operações de escrita |

Preço efetivo, lista por cliente, descontos, unidades/múltiplos, peso físico e arredondamento seguem pendentes. POC preserva strings/zeros e só observa estrutura, sem transformar em Product ou regra comercial. Tipos incompletos ou inconsistentes não passam silenciosamente como catálogo comercial validado. Validação é parcial dos campos selecionados, não schema integral de todos os DTOs nem homologação de negócio.

## Critérios de aceite na entrega inicial (histórico)

| Critério | Estado |
|---|---|
| 1. Serviço protegido de POC | ATENDIDO localmente |
| 2. OAuth implementado | ATENDIDO; suporte PKCE do provedor pendente |
| 3. Testes locais OAuth | ATENDIDO |
| 4. Cliente de leitura isolado | ATENDIDO |
| 5. Segredos protegidos | ATENDIDO no projeto/testes; nenhuma credencial real configurada |
| 6. Consultas reais bem-sucedidas ou bloqueios documentados | ATENDIDO como bloqueio explícito, não sucesso real |
| 7. Retornos validados | ATENDIDO em mocks/campos selecionados; resposta real PENDENTE |
| 8. Conflitos de schema registrados | ATENDIDO documentalmente; confirmação real PENDENTE |
| 9. Limites efetivos registrados quando disponíveis | PENDENTE: não disponíveis sem conta/autorização |
| 10. Regressões anteriores | ATENDIDO localmente e no CI do commit de código d54552c |
| 11. Nenhum pedido real | ATENDIDO |
| 12. MVP mock preservado | ATENDIDO: código do MVP inalterado, regressões/build aprovados |

## Orientação na entrega inicial (histórico)

Antes de fazer chamada autenticada, confirmar: conta autorizada, plano/API, usuário, permissões de leitura, ambiente seguro, redirect URI exata e autorização explícita para os GETs limitados. Configurar credenciais exclusivamente no ambiente seguro, fora do chat/Git. Confirmar suporte/exigência de PKCE e aceitação do callback loopback; se precisar HTTPS, rever o ambiente protegido antes de executar.

A regra de UNKNOWN e os riscos críticos de idempotência da 7A continuam intactos. A POC não testa nem habilita criação. Recomenda-se homologar esta conexão/leitura antes da 7B.2 e, após aprovação explícita, reutilizar transporte e observação no backend de leitura/catálogo. Não promover a POC local diretamente a backend de produção. **PARAR em 7B.1; 7B.2 não iniciada.**

## Homologação operacional posterior à implementação inicial — 08/10/2026

**Etapa 7B.1 — Implementação concluída e prova operacional de autenticação/leitura real aprovada para os cinco recursos testados. Mapeamentos comerciais completos e infraestrutura operacional definitiva permanecem pendentes.**

Origem: resultados e procedimento fornecidos pelo responsável pela empresa durante sua sessão local autorizada, consolidados nesta data. A IA não extraiu nem observou independentemente as respostas na conta Tiny. [HOMOLOGACAO-REAL.json](etapa7B1/HOMOLOGACAO-REAL.json) registra exclusivamente métricas, campos/contagens e resumo da sessão. Nenhuma consulta real adicional executada por esta consolidação.

### OAuth, conta e orçamento

O responsável relatou cadastro do aplicativo e credenciais em arquivo local protegido, redirect URI `http://127.0.0.1:8787/oauth/callback`, anúncio OIDC de plain/S256, uso de S256, login/autorização na página oficial Tiny e conexão confirmada no /status. Callback específico aceito; nenhuma hospedagem pública testada. /info aprovou a comparação do documento esperado somente no servidor. Estado final fornecido:

```json
{"connected":true,"accountVerified":true,"usedGETs":5,"remainingGETs":3,"busy":false}
```

O orçamento final é **cinco de oito GETs, três restantes**, referente ao resumo da sessão bem-sucedida fornecida. Houve tentativa 403 anterior, registrada separadamente; a correlação de processos/contadores não foi informada. Não afirmar que desconectar/reautorizar zera orçamento: o código continua preservando chamadas despachadas por processo. Não somar a tentativa anterior ao contador final informado nem ocultá-la como se nunca tivesse ocorrido.

### Resultados dos cinco endpoints

| Recurso | Endpoint GET | HTTP | Resultado | Duração individual (ms) | Amostra | IDs ausentes | Compatível / conflitos |
|---|---|---:|---|---:|---:|---:|---|
| info | /info | 200 | OK | 362,64 | 1 | 0 | true / [] |
| products | /produtos | 200 | OK | 518,98 | 10 | 0 | true / [] |
| contacts | /contatos | 200 | OK | 859,85 | 10 | 0 | true / [] |
| sellers | /vendedores | 200 | OK | 458,56 | 10 | 0 | true / [] |
| priceLists | /listas-precos | 200 | OK | 389,18 | 3 | 0 | true / [] |

São cinco observações individuais. Não constituem benchmark, média representativa, SLA ou capacidade para dez operadores. Compatibilidade significa apenas as regras parciais da POC aplicadas às amostras; não valida DTOs integralmente, a base toda ou políticas comerciais. Não acrescentar nulls/valores de campos não fornecidos.

### Incidente de permissão: 403 resolvido

OAuth estava conectado, mas GET /info retornou 403 PERMISSION_DENIED. Segundo o responsável, leitura de **Informações da Conta** não estava habilitada. Habilitou essa permissão, revisou configuração local e autorizou OAuth novamente. A consulta posterior passou a 200 OK, compatible=true, accountVerified=true. Não confundir credencial inválida com permissão de módulo nem assumir que OAuth bem-sucedido dá acesso a todos os recursos.

GET /vendedores funcionou após habilitação de leitura de Usuários na configuração relatada, mas essa sequência não isola a permissão causal. Registrar somente: **Acesso GET /vendedores confirmado na configuração atual da conta; associação exata da permissão ainda não isolada.** Não provocar novos erros removendo permissões nesta fase.

### Descobertas e limites comerciais

- **Empresa:** os três campos selecionados estavam presentes e compatíveis; identidade da conta aprovada, sem publicar documento ou razão social.
- **Produtos:** dez com os dez campos selecionados presentes/compatíveis; unitCounts={UN:0, other:10, missing:0}. Nenhum valor era exatamente UN; não implica dez unidades diferentes entre si. Valores de unidade não recebidos. Identificar apresentações reais e regras de caixa/pacote/múltiplo na 7B.3; Product.unit permanece UN, sem alteração nesta tarefa.
- **Preços:** preco e precoPromocional presentes não comprovam promoção ativa, preço efetivo ou regra de prioridade. Não foram fornecidos valores nem contagens de null desses preços; política comercial continua pendente.
- **Contatos:** dez com campos principais presentes; vendedor null em sete, vendedor.id presente em três e ausente em sete, sem incompatibilidade. Não são necessariamente clientes elegíveis; não concluir que sete clientes da empresa não têm vendedor. Identificar tipos de cliente e regra de vínculo/ausência por IDs, sem correspondência por nome.
- **Vendedores:** dez com campos selecionados compatíveis e acesso confirmado nesta configuração. Associação exata da permissão ainda não isolada.
- **Listas:** três registros compatíveis da primeira página. Sem total da conta demonstrado. Detalhe/exceções, associação a cliente, acréscimo/desconto, combinação com promoções e arredondamento continuam para 7B.3.

Não observada incompatibilidade nas regras selecionadas dos cinco recursos. Isso não resolve os conflitos documentais da 7A sobre produto detalhe/exceções de listas ou recursos não testados. Headers de quota não foram fornecidos; quota efetiva/plano exato/capacidade sob carga não estabelecidos. Orçamento de oito GETs é proteção da POC, não limite Tiny por minuto.

### Segurança e alcance da evidência

Conforme declaração do responsável, Client Secret ficou no ambiente local, tokens não foram enviados ao chat, a POC permaneceu em 127.0.0.1:8787 e nenhuma escrita de dados ERP foi executada. A evidência recebida e os documentos alterados contêm somente nomes técnicos de campos, contagens e métricas, sem credenciais, CNPJ real, nomes, preços, endereços ou IDs reais. Nenhuma resposta comercial integral foi fornecida. Não houve auditoria forense de computador, arquivos ou armazenamento do usuário.

A sessão local tem limite configurado de 30 minutos. Desconectar/encerrar remove a sessão local; não foi comprovada revogação remota. Refresh real, expiração natural, recuperação após indisponibilidade, autenticação multiusuário e hospedagem operacional não testados. Mocks continuam sendo evidência local, sem substituir homologação desses comportamentos. Esta consolidação não usou credenciais, não iniciou o serviço real, não executou OAuth/GETs reais nem operações de escrita.

### Critérios atuais: concluído, parcial e pendente

| Estado | Escopo |
|---|---|
| CONCLUÍDO | Implementação OAuth e testes locais; autenticação real relatada; configuração S256 funcional; callback específico; identidade da conta; GET info/produtos/contatos/vendedores/listas-precos; validação estrutural parcial das amostras; proteção de credenciais na arquitetura; ausência de escrita relatada e nenhuma operação adicional nesta consolidação |
| PARCIAL | Mapeamento de produto/contato, vínculo de vendedor, listas e compatibilidade de campos selecionados; sem validação comercial completa ou de toda a base |
| PENDENTE | Sincronização integral, páginas adicionais, detalhes reais de produto/lista, preço por cliente e política comercial, unidades/pesos/conversões, quotas sob carga, refresh/expiração reais, multiusuário e hospedagem operacional, PostgreSQL, ledger, criação/idempotência/reconciliação reais |

O aceite da autenticação/leitura dos cinco recursos está aprovado com base na evidência declarada do responsável. Não é liberação para produção ou integração de escrita. Critérios de conexão básica foram atendidos; pendências acima não foram promovidas a concluídas.

### Regressão desta consolidação documental

Nenhum código funcional, fluxo OAuth, MockERPProvider, componente de entrada, autosave, banco ou configuração de execução foi alterado. Foram repetidos os dez comandos solicitados, sem credenciais reais, com resultados efetivamente executados:

| Comando | Resultado | Duração local (s) |
|---|---|---:|
| `npm run check:data` | PASS | 0.46 |
| `npm run check:stage2` | PASS | 0.53 |
| `npm run check:stage3` | PASS | 1.51 |
| `npm run check:stage4` | PASS | 0.59 |
| `npm run check:stage5` | PASS | 0.42 |
| `npm run check:stage6` | PASS | 0.55 |
| `npm run check:stage7b1` | PASS | 0.67 |
| `npm run typecheck` | PASS | 3.48 |
| `npm run lint` | PASS | 10.13 |
| `npm run build` | PASS | 27.09 |

19 testes da POC aprovados; build estático e 111 verificações offline em VM, 37 recursos. [REGRESSAO-CONSOLIDACAO.json](etapa7B1/REGRESSAO-CONSOLIDACAO.json) guarda resultados deste lote; REGRESSAO-LOCAL.json e EVIDENCIAS-PUBLICAS.json permanecem snapshots históricos identificados. Sem novos benchmarks visuais de navegador. Publicação do MVP mock no Pages preservada. O CI já aprovado do código está registrado no histórico; não declarar execução remota nova sem observá-la.

### Próxima etapa recomendada, não iniciada

**7B.2 — Backend operacional, autenticação e PostgreSQL**, após aprovação explícita. Reutilizar os módulos TypeScript isolados e as descobertas da sessão, tokens só no backend, isolamento por organização, autenticação de operadores e cache local sem rede por tecla. Preservar desempenho em pedidos grandes, ausência de escrita real Tiny e tratamento conservador de UNKNOWN. Política comercial/mapeamentos completos ficam para 7B.3. Nenhuma infraestrutura nova foi criada nesta consolidação. **7B.2 não iniciada; parar após consolidar a 7B.1.**
