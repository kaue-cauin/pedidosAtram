# Verificação da Etapa 7B.1

Data: **08/10/2026**. Base: `f5629f449f4b14c6dc66cb5bd9916de98fcc6f30`. Implementação isolada de prova de conexão/leitura sobre o projeto existente. **Implementação local concluída; homologação operacional na conta Atram PENDENTE.**

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

## Testes executados

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

Testes anteriores também passaram. Build estático: 37 recursos e 111 verificações de offline em VM. Busca em bundles estáticos não encontrou identificadores de segredo/admin ou classe OAuth da POC. Smoke do launcher sem pré-requisitos: CONFIG_PENDING, exit 1, antes de abrir servidor. Testes não necessitam credenciais; CI inclui check:stage7b1 e não deve receber credenciais reais. **Execução remota deste commit ainda pendente de confirmação; não confundir PASS local com CI remoto.**

Não repetido benchmark visual em navegador nesta subetapa porque a POC não é importada pela aplicação e os componentes críticos não foram alterados. As evidências e limites de performance das Etapas 3–6 continuam válidos como histórico; não declarar novas medidas reais de UI/rede/IndexedDB.

## Conta real: resultados não inventados

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

## Critérios de aceite

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
| 10. Regressões anteriores | ATENDIDO localmente; CI remoto pendente |
| 11. Nenhum pedido real | ATENDIDO |
| 12. MVP mock preservado | ATENDIDO: código do MVP inalterado, regressões/build aprovados |

## Pendências para homologação e próxima fase

Antes de fazer chamada autenticada, confirmar: conta autorizada, plano/API, usuário, permissões de leitura, ambiente seguro, redirect URI exata e autorização explícita para os GETs limitados. Configurar credenciais exclusivamente no ambiente seguro, fora do chat/Git. Confirmar suporte/exigência de PKCE e aceitação do callback loopback; se precisar HTTPS, rever o ambiente protegido antes de executar.

A regra de UNKNOWN e os riscos críticos de idempotência da 7A continuam intactos. A POC não testa nem habilita criação. Recomenda-se homologar esta conexão/leitura antes da 7B.2 e, após aprovação explícita, reutilizar transporte e observação no backend de leitura/catálogo. Não promover a POC local diretamente a backend de produção. **PARAR em 7B.1; 7B.2 não iniciada.**
