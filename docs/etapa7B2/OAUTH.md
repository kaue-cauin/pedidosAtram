# OAuth persistente e leitura

Reutilizados da 7B.1: URLs oficiais fixas, transporte limitado (deadline de headers e corpo, bytes/JSON, sem redirects/retries), parsing de tokens e observação sanitizada dos cinco recursos. Não foi copiado o servidor local da POC. Seu fluxo e testes permanecem independentes.

ADMIN configura documento esperado por endpoint protegido (valor permanece cifrado e nunca retornado). POST start exige flag OAuth, sessão/RBAC/CSRF. Gera state 256 bits e PKCE S256; tentativa tem hash de state, verifier cifrado por tenant, usuário, sessão, expiração de cinco minutos e versão da conexão. Nova tentativa invalida as anteriores e tokens antigos. Callback exato da origem configurada; por padrão novo path/porta 8790. Não reaproveitar cadastro do callback POC 8787 automaticamente. Responsável deve cadastrar URI nova antes de uma futura homologação autorizada, sem postar Client Secret no chat.

Callback consome tentativa atomicamente sob row lock, confere sessão/membership ADMIN ativos e expiração. Verifier apagado ao consumir. Troca code no servidor com PKCE, valida resposta e instala tokens cifrados se versão/conexão/sessão ainda válidas. Chegada tardia após logout/desconexão/reauth não instala tokens. Estado permanece CONNECTING, oauthConnected=true e accountVerified=false: nenhum GET /info automático. POST verify-account, somente com flag de leitura explicitamente autorizada, compara documento esperado no servidor; somente correspondência e campos selecionados válidos permitem CONNECTED. ACCOUNT_MISMATCH limpa tokens. 403 preserva evidência de OAuth, sem afirmar acesso ao recurso.

Flags TINY_BACKEND_OAUTH_ENABLED, READ_ENABLED e REFRESH_ENABLED são no por padrão. Tests usam fetcher sintético injetado. Não foram executados OAuth, refresh, GET autenticado ou escrita reais nesta implementação. Homologação real 7B.1 é histórica e não homologa a infraestrutura nova.

## Refresh entre instâncias

1. SELECT FOR UPDATE da conexão, scoped por organização, em transação curta.
2. Se access ainda tem >30 segundos, usar somente no servidor. Se vencendo, conferir flag e refresh/token expiry conhecidos.
3. Claim de UUID refresh_lease e prazo 30s persistidos; request externo fora da transação, deadline 10s. Outro processo recebe REFRESH_BUSY/409, não dispara refresh paralelo.
4. Tokens rotacionados são cifrados e instalados numa única atualização atômica com CAS de token_version, lease, prazo e estado. Sem essa correspondência, OPERATION_STALE.
5. Desconectar, configurar empresa e reautorizar incrementam versão e limpam leases; resposta antiga não pode restaurar conexão.
6. Refresh com falha de rede/timeout pode ter consumido o token remotamente: REAUTH_REQUIRED, sem retry automático. Lease abandonada/expirada também exige nova autorização; não assumir takeover seguro da credencial.
7. Sem rotação, preservar prazo anterior do refresh (ou mínimo se provedor informar prazo menor); não estender. Refresh rotacionado sem prazo informado fica com validade desconhecida e não é reutilizado depois do access vencer. Prazo inicial ausente também não recebe TTL inventado.

Renovação é lazy, apenas numa operação de leitura autorizada perto do vencimento; não há job contínuo nem refresh por qualquer erro HTTP. Falha 401 exige reconexão, 403 não dispara refresh, 429 pausa compartilhada (Retry-After/headers, limitada a uma hora), 500/timeout não provocam retries. Tokens nunca são retornados ao cliente.

ReadGateway prepara somente info/products/contacts/sellers/priceLists com paths fixos, limit=10 e offset=0. Somente verify-account tem endpoint HTTP nesta etapa; demais métodos ficam internos para evolução. Sem detalhes/paginação integral/jobs/catálogo real. Leitura serializada por lease persistente por conexão; versão impede aproveitar respostas de conexão anterior. Sem escrituras Tiny na allowlist. POST ao endpoint OAuth de tokens é troca/refresh de credencial, não criação de dados comerciais. Desconexão é local, não revogação no provedor; revogação real permanece pendente.
