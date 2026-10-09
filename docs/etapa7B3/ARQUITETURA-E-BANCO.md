# Arquitetura e migração

```
backend/catalog/              PostgreSQL, jobs, quota, leitor, mapeadores e API
repositories/catalog-cache   IndexedDB isolado e head local atômica
services/catalog-client      download versionado, integridade, índice e ativação
services/catalog-fixture     dados sintéticos para diagnóstico
app/diagnostico-etapa7b3      busca e matriz de autosave, sem Tiny
```

Migration incremental `0001_serious_grandmaster.sql`, após a migration 0000 da 7B.2. Não usa `drizzle-kit push`. Gera sete tabelas: catalog_snapshots, catalog_heads, catalog_entries, catalog_quarantine, sync_jobs, sync_budgets, sync_watermarks. A chave única composta dos snapshots deve existir antes das FKs; a ordem da migration foi validada em PostgreSQL 16. Aplicação repetida não recria as tabelas.

FKs compostas protegem organização/snapshot e organização/solicitante. Índices parciais admitem uma head ACTIVE por organização/provider e um job ativo por organização. A revisão da head é positiva. Check constraints limitam estados e contadores. O orçamento identifica a conta pelo hash da identidade verificada; não replica documento real nos jobs.

O repositório só altera entradas BUILDING. READY/ACTIVE/SUPERSEDED são imutáveis quanto a registros. Ativação exige sessão/admin ainda válidos no commit, job COMPLETED, snapshot READY, organização correspondente e head esperada. Uma transação curta substitui a head e marca a anterior SUPERSEDED. Contagens, desaparecimentos, quarentenas e alterações de preço/unidade/status exigem reconhecimento explícito. Rollback permite uma versão SUPERSEDED da mesma organização e registra auditoria.

Checksums SHA-256 são calculados sobre JSON canônico com chaves ordenadas; recursos são ordenados por ID ERP textual. Integridade de transferência/cache não substitui autenticação TLS, auditoria ou aprovação comercial. Manifesto registra data, versão, modo, contagens, completude, checksums, cache e compatibilidade TECHNICAL_ONLY.

Migrations são aplicadas explicitamente pelo script existente. Readiness agora exige as 15 tabelas. Não executa GETs Tiny. Sem implantação do backend, migrations em banco comercial ou mudanças no workflow do Pages nesta entrega.

## Operação local em Windows

Node 24+, PostgreSQL 16 em loopback; Docker não é obrigatório. Usar banco exclusivamente sintético com prefixo `atram_test`, usuário descartável e variáveis no terminal local, sem colocar arquivos com senhas no git:

```powershell
$env:BACKEND_TEST_DATABASE_URL = 'postgresql://test_runner:SENHA_SINTETICA_LOCAL@127.0.0.1:5432/atram_test_local'
$env:BACKEND_TEST_DATABASE_APPROVED = 'yes'
npm ci
npm run check:stage7b2
npm run check:stage7b3
npm run check:stage7b3:performance
```

Os testes criam/removem bancos com UUID sob esse banco de controle. Recusam host remoto, nome fora do prefixo e ausência de aprovação sintética. Nunca usar DATABASE_URL comercial como banco de teste. Para backend local, seguir os comandos de bootstrap/migrate/start e segurança da 7B.2; flags de OAuth/read/refresh/sync/detail e fixture permanecem `no` no exemplo.

A API usa cookie/CSRF existentes: login local, copiar apenas o csrfToken da sessão no cliente administrativo local, POST com Origin igual ao BACKEND_ORIGIN e X-CSRF-Token. `start` → `step` explícito por página → consultar status → revisar anomalias → `activate` com versão anterior esperada. Sem worker automático nesta etapa. Não copiar credenciais ou respostas privadas para chats, logs ou relatórios.
