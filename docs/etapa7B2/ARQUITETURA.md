# Backend operacional 7B.2

Serviço Node 24 separado do Next export/GitHub Pages. Nenhuma importação de backend pela UI; caminho Produto → Enter → Quantidade → Enter continua em memória, IndexedDB e catálogo mock. A POC 7B.1 permanece independente. Não há provider de criação real nem ledger distribuído.

PostgreSQL via postgres.js e Drizzle ORM. `backend/drizzle.config.ts` aponta exclusivamente para o schema operacional; placeholder SQLite existente preservado. Migrations SQL e snapshots gerados/versionados pelo Drizzle Kit; execução explícita com journal e transação. Lock advisory serializa migradores; migrations nunca executadas no start HTTP. Revisar cada SQL antes de aplicar. Nunca usar db push para operação; rollback destrutivo exige plano de backup/restore e migration corretiva revisada.

Tabelas: organizations, users, organization_memberships (PK composta), sessions (FK composta de membership), erp_connections (única organização/provider), oauth_attempts (sessão, membership e versão da conexão), audit_events (escopo da organização), login_limits (contadores persistentes). UUID, timestamptz, checks de status/papel, FKs, índices por login/token/expiração/organização. Documento esperado cifrado e prova de identidade persistida como digest. Não há CNPJ fixo.

Referências técnicas: [Drizzle migrations](https://orm.drizzle.team/docs/migrations), [PostgreSQL locks](https://www.postgresql.org/docs/current/explicit-locking.html), [Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
