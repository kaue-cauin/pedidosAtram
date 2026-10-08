# Verificação da Etapa 7B.2 — 08/10/2026

**Implementação técnica e testes automatizados concluídos; homologação operacional com Tiny real e liberação de produção pendentes.** Branch dedicada `etapa-7b2-backend`, base homologada `9687ae785cb191037b6bf4eb7c57b868375b106d`, código validado `7b06b95d3fa109526ef9bbc3fee40c20c10ba9e9`. A principal foi preservada durante desenvolvimento/validação. Esta entrega encerra somente 7B.2; não inicia 7B.3/7B.4/7C.

## Entrega e decisões

[Arquitetura](etapa7B2/ARQUITETURA.md), [segurança/autenticação/RBAC](etapa7B2/SEGURANCA.md), [OAuth/refresh](etapa7B2/OAUTH.md), [endpoints e matriz de autorização](etapa7B2/ENDPOINTS.md), [instalação Windows/PowerShell](etapa7B2/WINDOWS.md), [evidência dos testes](etapa7B2/REGRESSAO.json) e [inventário](etapa7B2/ARQUIVOS.json).

Inspecionados README, relatórios 5/6/7A/7B.1, MockERPProvider/ERPProvider, ledger IndexedDB simulado, estados/idempotência/UNKNOWN, POC Tiny, package/lock, Next export, placeholder SQLite e workflows. Homologação real 7B.1 confirmada no histórico atual. Mantidos contratos/MVP/POC/histórico intactos. Sem duplicar servidor da POC nem migrar frontend. Transporte, parsing e observações da POC reutilizados por imports exclusivamente do backend.

Node 24 independente em `backend/` e launcher `scripts/backend.mjs`. Configuração própria `.env.backend.local`, exemplo inerte, sem ler `.env.tiny-poc.local`. PostgreSQL com schema Drizzle específico e migrations SQL versionadas; SQLite original preservado. Schema/migrations via ORM, consultas operacionais tagged SQL parametrizadas para locks/transações/CAS. Pools separados (8+2, limite total dez) porque adaptador Drizzle altera serializers/parsers de datas; não misturar Date nativo do driver com o contrato de strings do ORM. Driver novo: postgres.js 3.4.7, única dependência adicionada; metadados anteriores do lock preservados.

## Modelo de banco e migrations

| Tabela | Garantia |
|---|---|
| organizations | UUID, estado e timestamps; sem ID/documento fixo da Atram |
| users | login normalizado global único, scrypt com salt, status; sem senha clara |
| organization_memberships | PK organização/usuário, FK, papel/status com checks |
| sessions | hash único do segredo e CSRF; FK composta membership; prazo/revogação |
| erp_connections | única organização/TINY, tokens cifrados, identidade separada, versão, leases/pause e estado |
| oauth_attempts | hash state único, verifier cifrado, sessão/usuário/org/versão/prazo/consumo |
| audit_events | escopo, ação/resultado/ator/correlação/timestamp, sem payload secreto |
| login_limits | contadores persistentes por digest IP/login compartilhados entre instâncias |

Migration `backend/db/migrations/0000_regular_taskmaster.sql` e meta/snapshot/journal. Aplicada em banco vazio e repetida idempotentemente no CI. Constraints/FKs/índices/checks, transações e rollback testados. Migrations são comando explícito, serializado por advisory lock; não rodar DDL automaticamente no start e não usar db push. Política de alterações destrutivas: revisar SQL, backup/restore comprovado, plano de manutenção e migration corretiva; rollback destrutivo não automático. Banco instalado nativamente no Windows é suportado; Compose sintético é opcional.

## Autenticação, organização e sessões

Scrypt assíncrono N=2^17/r=8/p=1, salt 16 bytes e comparação segura, sem dependência nativa de Argon2. Bootstrap primeiro ADMIN por CLI com senha oculta/confirmada, sem credencial padrão/cadastro público. Admin cria/reset/desativa membros por API. Login genérico para credenciais incorretas/usuário desconhecido/inativo/membership inválido. Contadores PostgreSQL IP/login e limite de dois KDFs em voo por instância. Token de sessão aleatório 256 bits, somente hash no banco, expiração absoluta configurável e revogação/logout; status de user/org/membership e papel conferidos em cada request.

Cookie HttpOnly/SameSite=Lax, Secure e __Host em HTTPS; HTTP exclusivamente loopback com flag. Host/Origin rígidos, POST com CSRF, sem CORS permissivo, logs/erros sanitizados e correlationId. ADMIN administra somente sua organização; OPERADOR/VENDEDOR têm me/logout/organization/current. Organização não vem de URL/payload; IDs de outra empresa não autorizam acesso. Identidade global compartilhada não pode ser resetada/desativada pelo administrador de um só tenant. Auditoria da própria organização, sem senhas/tokens/códigos/documentos.

## OAuth e criptografia

Conexão pertence à organização. State/S256, tentativa cinco minutos vinculada à sessão/usuário/org/versão; consumo atomicamente sob row lock e verifier apagado. Tokens persistidos somente se versão/estado/sessão autorizada ainda válidos. Callback configurable/exato na origem; novo default `http://127.0.0.1:8790/api/erp/tiny/oauth/callback` não foi cadastrado/consultado na conta Tiny pelo assistente.

AES-256-GCM, IV aleatório, tag e AAD organização/tipo/versão; keyring fora PostgreSQL/Git, falha segura sem chave ou com conteúdo adulterado. Access/refresh/verifier/documento esperado cifrados; prova de identidade como digest, nunca documento retornado. Manter chaves antigas para envelopes/backups; novas gravações usam ativa. Recriptografia em massa não implementada; procedimento de manutenção documentado, sem promessa de rotação automática de toda a base.

OAuth armazenado não basta: permanece CONNECTING/accountVerified=false até ação ADMIN verify-account explicitamente autorizada. GET /info compara documento no servidor; só após sucesso estrutural/identidade vira CONNECTED. Conta divergente limpa tokens. 403 preserva credenciais/evidência OAuth, bloqueando recurso; 401 exige reconexão. Flags OAuth/leitura/refresh reais=no por padrão. Allowlist só info/products/contacts/sellers/priceLists; quatro consultas de cadastro são métodos internos preparatórios, não job integral/proxy público. Sem detalhes comerciais nem paginação integral.

Refresh: lease PostgreSQL 30s por conexão, requisição externa fora da transação/deadline 10s, instalação atômica com token_version/lease/prazo/estado. Concorrentes recebem REFRESH_BUSY; não renovam em paralelo. Desconexão/nova configuração/autorização incrementam versão e invalidam resposta antiga. Falha de refresh ou lease abandonada → REAUTH_REQUIRED, sem reutilizar automaticamente token possivelmente consumido. Sem rotação não estende prazo antigo; prazo desconhecido não é inventado. Read lease e cooldown de quota também persistentes. Sem redis/microserviços.

## Verificação e resultados

**[CI completo aprovado — run 37829648536](https://github.com/kaue-cauin/pedidosAtram/actions/runs/37829648536)** no código `7b06b95`: PostgreSQL 16.15 real temporário, Node 24.21, dados exclusivamente sintéticos. Suíte 7B.2: **16 casos, 16 PASS, zero falhas/skips** (quatro unitários e doze integração/operação). Também executou todos os comandos anteriores, typecheck, lint, build e boundary.

Cobertura: migrations/constraints/FKs/rollback, dados em novo processo, servidor Node real em processo filho e reinício com sessão persistida, readiness/falha de banco, login válido/inválido/ausente/inativo, expiração/revogação/logout/reset, token inválido, RBAC/CSRF/Host/Origin, rate limit, duas organizações e IDs/payloads adulterados; state inválido/expirado/replay/callback inválido/denial/token inválido; callbacks concorrentes e logout em voo; S256; refresh rotacionado/sem rotação/expirado/desconhecido, dez concorrentes em duas instâncias, resposta antiga depois da nova autorização/desconexão, lease abandonada; 401/403/429/500, malformed JSON, network/timeout, empresa divergente; AES-GCM/IV/AAD/adulteração/keyring/chave errada/ausente e dados secretos não claros em registros/logs/respostas.

Durante desenvolvimento o CI encontrou duas integrações relevantes, corrigidas antes do aceite: FK qualificada public exigiu banco temporário completo em vez de schema alternativo; adaptador Drizzle e cliente SQL compartilhados conflitaram nos conversores de data. Houve também ajustes no teste Host (fetch ignorava override; teste passou a HTTP direto) e lint. Execuções anteriores falharam e não são a evidência final; última suíte aprovada mantém testes/strict TypeScript/lint anteriores.

| Comando obrigatório | Local | CI PostgreSQL |
|---|---|---|
| check:data | PASS | PASS |
| check:stage2 | PASS | PASS |
| check:stage3 | PASS | PASS |
| check:stage4 | PASS | PASS |
| check:stage5 | PASS | PASS |
| check:stage6 | PASS | PASS |
| check:stage7b1 | PASS, 19 casos | PASS, 19 casos |
| check:stage7b2 | Unidade PASS; integração local não executada | PASS, 16 casos com banco real |
| typecheck | PASS | PASS |
| lint | PASS, zero warnings | PASS, zero warnings |
| build | PASS | PASS |
| check:backend-boundary | PASS | PASS |

No sandbox local não foi possível executar PostgreSQL sob usuário de sistema não-root; a integração obrigatória foi executada e aprovada no PostgreSQL real do CI, sem substituí-lo por mocks. Configuração de testes exige URL distinta loopback/atram_test* e aprovação sintética; cria/drop somente bancos temporários por caso. Cleanup também executado. Instruções Windows incluem criação de role/banco, migrations, bootstrap e suíte, sem exigir Docker.

Regressão de 10/50/100/150/200/300 itens em check:stage3; autosave/fila em stage4 e protocolos 5/6. UI/estado/catálogo local/totais/IndexedDB/MockERPProvider não foram alterados. **Não foi repetido benchmark visual/browser/IndexedDB nesta entrega**; não há novas métricas de latência UI nem reclassificação das evidências antigas. Build /pedidosAtram estático, service worker com 37 recursos e 111 checks offline em VM. Scanner confirmou nenhum import do backend pela UI ou conteúdo privado selecionado nos bundles; verificação não é auditoria forense universal. Pages continua demo mock; este backend não é hospedado lá.

## Aceite técnico e pendências

Atendidos com testes: serviço independente/reinício, PostgreSQL/migrations/durabilidade, bootstrap/auth/RBAC/revogação/isolamento, conexão por organização, criptografia/chave fora do banco, OAuth/state/PKCE/replay, refresh distribuído/versionamento/desconexão tardia, endpoints sanitizados, regressão/static/offline/boundary e versionamento. Não há criação/escrita de dados comerciais Tiny nem ledger definitivo. Nenhuma operação real Tiny adicional executada (OAuth=0, GET autenticado=0, refresh=0, escrita=0).

Pendente de homologação operacional: execução Windows no equipamento do responsável, callback/aplicativo novo autorizado, OAuth persistente/refresh/expiração/revogação reais, plano/quotas efetivas, infraestrutura HTTPS/backup/restore e host/chaves protegidos, testes com operadores. Não implantado backend comercial/publicamente. Senhas/reset ainda administrados manualmente, sem email/MFA/troca obrigatória; impor fluxo de troca/recuperação e revisar hardening antes de produção. Rate limit de IP atrás de proxy agrega tráfego do proxy; configurar rede e capacidade sem confiar cegamente em forwarded headers. Guardar chaves separadas dos backups e manter versões antigas até migração comprovada. Digest de identidade não equivale a anonimização contra correlação; não expor esse campo.

7B.3: sincronização/catálogo staging/cache/ativação e regras comerciais de produtos/unidades/pesos, contatos/vendedores/listas/preço. 7B.4: ledger durável, submissão/idempotência/reconciliação, preservando UNKNOWN conservador. 7C/escrita real exige autorização posterior. **Etapa 7B.2 tecnicamente concluída; aguardar aprovação do responsável para a próxima etapa.**
