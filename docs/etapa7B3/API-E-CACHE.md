# API interna e consumo local

Backend separado do export estático. Nenhuma configuração real entra em NEXT_PUBLIC. Sem CORS permissivo, URL arbitrária ou endpoint para escrita comercial. Sessão HttpOnly, Host/Origin e CSRF seguem 7B.2; RBAC é consultado no PostgreSQL em cada requisição.

| Método/caminho | Acesso e parâmetros |
| --- | --- |
| GET /api/catalog/status, /manifest | Sessão; REAL somente ADMIN até política aprovada |
| GET /api/catalog/products, /customers, /sellers, /price-lists | `version` obrigatória; `offset` 0..10000; `limit` 1..100; mesma organização |
| GET /api/catalog/quarantine | ADMIN; version, offset; 100 motivos sanitizados por página |
| GET /api/admin/sync/jobs | ADMIN; até 50 jobs; progresso e falhas sanitizadas; quarentenas incluem validação de referências |
| GET /api/admin/sync/status | ADMIN; id do job; sem account key ou credenciais |
| POST /api/admin/sync/start | ADMIN + CSRF; mode FIXTURE/REAL, details opcional até 10 IDs |
| POST /api/admin/sync/step, /cancel, /resume | ADMIN + CSRF; id; ação explícita, sem startup automático |
| POST /api/admin/catalog/activate, /rollback | ADMIN + CSRF; version, expectedVersion, acknowledge explícito |

Parâmetros desconhecidos e repetidos são recusados. A transferência fixa a versão em todas as páginas; snapshots antigos SUPERSEDED continuam legíveis para leitura consistente/rollback autorizado. Staging não é exposto. A head é comparada e trocada numa transação, somente após COMPLETED e READY; anomalias exigem reconhecimento explícito.

## Cache e buscas

O cliente baixa até 50 registros/página, limita o conjunto a 10 mil e verifica SHA-256 por recurso e manifesto, contagens, IDs únicos, versão, organização e projeção. Só depois prepara o índice local e grava a versão e o ponteiro `prepared` atomicamente, sem modificar `heads`. `activate()` é assíncrono e troca explicitamente `heads` numa transação com CAS da versão ativa e da pendente; só após o commit altera o índice em memória. Transferência, validação, construção de índice, IndexedDB e ativação têm tempos separados.

IndexedDB usa banco e stores separados dos rascunhos/ledger, escopo organização + usuário + projeção + versão. Mantém a versão ativa, a anterior e no máximo uma preparada por escopo (até três). A leitura dos dois ponteiros usa a mesma transação. Versões existentes não podem ser sobrescritas. Falha de transferência/hash mantém a última versão íntegra. Concorrência usa comparação da head. Logout invalida downloads em andamento, limpa memória e cache do escopo; troca de organização passa pelo mesmo descarte. Busca não faz fetch.

Somente FIXTURE é persistido e recuperado offline nesta entrega. REAL permanece apenas em memória de ADMIN e bloqueado offline; retenção privada e política de acesso real ainda precisam de homologação. A validade é até uma hora da publicação, sem renovar uma versão velha por novo download. Falha 401/403 invalida a sessão local. Não se presume que catálogo offline indefinido seja comercialmente válido.

Após recarga, `recover()` restaura a ativa e também a pendente, sem aplicar esta última. Uma nova versão fica pending. Aplicação exige pesquisa vazia, sem seleção e sem edição. Os objetos são congelados. Itens/rascunhos/submissões existentes não são substituídos nem recalculados; a aplicação atual continua ligada ao MockERPProvider. O catálogo técnico não possui preço efetivo aprovado para criar pedidos reais.

## Diagnóstico

`/diagnostico-etapa7b3/` utiliza exclusivamente os 900 produtos mock e IndexedDB de diagnóstico. Permite preparar/aplicar/recuperar catálogo sintético, pesquisar por teclado e repetir a matriz de 10..300 itens com autosave durante transferência/indexação em background. Exporta JSON de catálogo separado do JSON de UI/autosave. Esta rota pode integrar o export estático após revisão; esta etapa não publica o GitHub Pages.

A prévia operacional REAL depende de hospedagem autenticada na mesma origem e da política comercial. Entregamos contrato, API e testes de integração; não conectamos o GitHub Pages ao backend comercial.

O contador validated indica transformação estrutural; quarantine inclui também divergências referenciais detectadas após a coleta. Um contato tecnicamente armazenável com vendedor inexistente permanece visível como BLOCKED e também conta como registro em quarentena. Esses indicadores não autorizam venda.

## Migração do cache v1 → v3

O formato v1 não registrava aprovação: seu head podia representar uma versão apenas baixada. Portanto não é possível reconstruir essa decisão com segurança. A migração conserva os registros, move o head legado para `prepared` e exige aplicação explícita. Não promove silenciosamente nenhuma versão legada; versões anteriores permanecem armazenadas até uma ativação bem-sucedida. Os rascunhos usam outro banco e não são alterados.

O epoch de logout é incrementado numa transação e permanece como tombstone, sem produtos ou credenciais. Preparações e ativações com epoch antigo são recusadas entre instâncias, mesmo quando a head era null. A migração de v2 mantém seus ponteiros ativos/preparados; só o head ambíguo v1 é movido para pendente.
