# Etapa 7B.3 — correções para segunda revisão

Base revisada: `ede17bd`. Branch exclusivo: `etapa-7b3-catalogo`; PR #2 permanece em rascunho. Homologação visual pendente.

## Reprodução e correção do cache

Executamos a sequência A ativa → preparar B → reconstruir LocalCatalog → recover no código original, em cópia isolada do commit: `prematureActivation: true`, versão recuperada B e pending null. Confirma-se o defeito apontado. Esse ensaio usa fake-indexeddb, não navegador.

O formato v3 inclui `prepared` e um epoch de logout persistido. A nova store `prepared` separa download validado de aprovação. Preparar B não modifica o head A. Ativar usa uma única transação readwrite de versions/heads/prepared, CAS dos dois ponteiros e validação de geração local. Erro/abort deixa A e B intactas. A memória muda depois do commit. Recuperação lê ambos os ponteiros numa transação; restaura A/index e B/índice pendente separadamente. A versão anterior é mantida; versões existentes não podem ser sobrescritas e preparações substituídas são removidas. Logout invalida operações em andamento e limpa os ponteiros e versões do escopo, preservando rascunhos.

Os testes cobrem A/B antes/depois de aplicar, abort antes e após a escrita da nova head, ativação concorrente, preparações concorrentes, logout durante recuperação/download, downloads interrompidos/corrompidos, troca de escopo, expiração, REAL sem persistência e migração conservadora do cache legado. O v1 não distinguia aprovação; seu head migra para pendente, exigindo ação explícita, com os registros preservados.

## Reprodução e correção OAuth

O caminho original fixava token_version no job e rejeitava o token_version incrementado pela própria renovação. Separámos o ciclo da conexão (`connection_generation`) da revisão das credenciais (`token_version`). A renovação legítima conserva a geração e mantém CAS de revisão/lease. Desconexão, troca de conta e invalidação mudam geração e revisão. Jobs continuam vinculados também ao hash da conta verificada.

A migração PostgreSQL 0002 preenche a geração com a revisão existente para compatibilidade dos vínculos antigos. Páginas, detalhes, conclusão e ativação/rollback verificam a geração/conta em transações. Uma resposta antiga não restaura credenciais; um 401 de revisão antiga não revoga a revisão renovada.

Novos testes usam PostgreSQL real do CI, duas conexões de banco/instâncias TinyService e provedor OAuth injetado/simulado. Sincronizam 75 produtos em três páginas, renovam após duas páginas e concluem restantes sem CONNECTION_CHANGED. Exercitam refresh concorrente único, lease de job, respostas tardias após disconnect/configure, 200 e 401 antigos após refresh, desconexão entre a última página e a conclusão, refresh tardio após disconnect e recusa de ativar um snapshot de conexão desfeita. Nenhuma chamada chega ao Tiny real.

## Evidência de validação

Primeiro commit de correção: `cccfef6a658c688e4775aaecd51e670a299436d5`. CI PostgreSQL/Regressões: https://github.com/kaue-cauin/pedidosAtram/actions/runs/37866673109 . Esse commit contém quatro testes de cliente e três novos testes PostgreSQL (quatro no refinamento final); os refinamentos subsequentes acrescentam leitura atômica e teste de migração/concorrência. O código refinado `ad3631ad3543121ba3e5d37b68c873c1a5108cb3` passou nos workflows push e PR: https://github.com/kaue-cauin/pedidosAtram/actions/runs/37867165617 e https://github.com/kaue-cauin/pedidosAtram/actions/runs/37867169297 . Logs do job `113616529779` confirmam PostgreSQL 16.15 real, **24/24 testes 7B.3**, **16/16 7B.2**, **19/19 7B.1**, regressões de dados/Etapas 2–6, typecheck, lint, build e boundary aprovados. A matriz Node CI passou em 36 cenários: modelo+schedule p95 máximo 0,067 ms, busca 0,603 ms, todos recuperados. Não são resultados de navegador. O refinamento final de testes também simula abort após a escrita da nova head, confirmando rollback de A/B.

Build local passou (export estático, 40 arquivos offline, 121 verificações VM); typecheck e lint passaram; boundary passou. O benchmark Node/emulador repetido passou nos 36 cenários, com modelo+schedule p95 máximo 0,226 ms, busca 20,241 ms e todos os rascunhos recuperados. A primeira tentativa falhou no limite de busca de 50 ms; causa não determinada. Não substitui medições de navegador.

## Navegador: impedimento observado

Chrome remoto disponibilizado, porém o diagnóstico local retornou `net::ERR_CONNECTION_REFUSED`. O build e servidor estático não ficaram acessíveis à superfície de navegador. **Nenhum resultado de teclado, UI/React, IndexedDB nativo, ausência de API por tecla observada em rede, offline real ou reabertura foi obtido.** Todos esses itens permanecem pendentes na matriz PERFORMANCE-E-NAVEGADOR.md. Evidência automatizada de busca local/rascunho não significa homologação visual.

## Limites preservados

Main e workflow Pages não foram alterados; backend não foi publicado; Tiny/OAuth/leitura/refresh reais permanecem desabilitados por padrão; nenhuma credencial real configurada; nenhuma consulta/escrita no Tiny; não iniciada 7B.4. MockERPProvider e os contratos de autocomplete, autosave, rascunhos e offline permanecem nas regressões. Antes de implantação comercial: rate limit seguro atrás de proxy, política de senhas, homologação OAuth persistente, backup/restauração PostgreSQL e chaves de criptografia.

O epoch de logout é incrementado numa transação e permanece como tombstone, sem produtos ou credenciais. Preparações e ativações com epoch antigo são recusadas entre instâncias, mesmo quando a head era null. A migração de v2 mantém seus ponteiros ativos/preparados; só o head ambíguo v1 é movido para pendente.
