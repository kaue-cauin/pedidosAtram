# API interna

Todas as rotas usam Host exato e respostas no-store. Não há CORS permissivo. POST exige Origin configurada, JSON com allowlist de campos e (exceto login) CSRF. Organização vem exclusivamente da sessão. correlationId é gerado pelo servidor; nenhum erro bruto do banco/provedor é devolvido.

| Método e rota | Acesso | Campos / finalidade |
|---|---|---|
| GET /api/health | Público, Host autorizado | healthy, sem internals |
| GET /api/ready | Público, Host autorizado | ready boolean; 503 se dependência/schema indisponível |
| POST /api/auth/login | Público, limitado, Origin | login, password, organizationId opcional; membership conferido após senha |
| POST /api/auth/logout | Todos autenticados + CSRF | {} revoga sessão |
| GET /api/auth/me | ADMIN/OPERADOR/VENDEDOR | identidade, organização, papel e CSRF; sem token da sessão |
| GET /api/organization/current | ADMIN/OPERADOR/VENDEDOR | somente organização da sessão |
| GET /api/admin/users | ADMIN | até 100 membros da própria organização |
| POST /api/admin/users | ADMIN + CSRF | login, password, role; sem organizationId |
| POST /api/admin/users/:id/deactivate | ADMIN + CSRF | {}; escopo conferido no banco, revoga sessões |
| POST /api/admin/users/:id/reset-password | ADMIN + CSRF | password; mesmo escopo, revoga sessões |
| GET /api/admin/audit | ADMIN | últimos 100 eventos da organização |
| GET /api/erp/tiny/status | ADMIN | status sanitizado; OAuth e identidade separados |
| POST /api/erp/tiny/configure-account | ADMIN + CSRF | expectedDocument; cifrado no servidor, jamais retornado |
| POST /api/erp/tiny/oauth/start | ADMIN + CSRF + flag OAuth | {}; authorizationUrl oficial com state/PKCE |
| GET /api/erp/tiny/oauth/callback | ADMIN com sessão original, state e tentativa válida | redirect 303 fixo ao status; código nunca renderizado |
| POST /api/erp/tiny/disconnect | ADMIN + CSRF | {}; revogação local, sem promessa de revogação no provedor |
| POST /api/erp/tiny/verify-account | ADMIN + CSRF + flag leitura | {}; somente GET /info e comparação do documento cifrado |

GETs privados não aceitam query params. Nenhum proxy arbitrário, relatório privado público, endpoint de sincronização integral ou criação de pedido. OPERADOR e VENDEDOR têm somente /auth/me, /auth/logout e /organization/current nesta etapa; preparar pedido no mock não depende do backend. OAuth callback é a única exceção de navegação cross-site; sessão/state/expiração/uso único permanecem obrigatórios. Cliente futuro deve POST start via fetch e navegar para authorizationUrl, usando mesma origem controlada. O Pages não é esse cliente operacional.

Erros usam `{error:{code,correlationId}}`, sem exception/SQL/URL/corpo. 401 sessão/credenciais inválidas; 403 origem/CSRF/papel; 400 entrada; 404 recurso fora do escopo; 409 operação concorrente; 429 login/rate; 503 serviço/configuração indisponível. Saúde não comprova homologação Tiny.
