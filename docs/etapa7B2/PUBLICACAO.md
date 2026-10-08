# Etapa 7B.2 — merge e publicação da demonstração

Verificação em 08/10/2026. Integração do PR #1 e publicação do site estático autorizadas explicitamente pelo responsável. Aceite técnico da 7B.2; implantação comercial e homologação real continuam pendentes.

## Versão e workflows

- PR: https://github.com/kaue-cauin/pedidosAtram/pull/1
- Commit de merge: `47eb6cdd41bc3c5de8437b27ff6fefcec852b093`.
- Backend PostgreSQL na main: https://github.com/kaue-cauin/pedidosAtram/actions/runs/37850739850 — **success**.
- Publicar GitHub Pages na main: https://github.com/kaue-cauin/pedidosAtram/actions/runs/37850739824 — build e deploy **success**.
- Demonstração: https://kaue-cauin.github.io/pedidosAtram/

Backend: 16 testes com PostgreSQL real temporário, 16 aprovados, zero falhas/skips. Regressões das etapas 2–6, dados mock, 19 casos da POC 7B.1, typecheck, lint, build estático, 111 verificações offline e separação backend/browser aprovados. Workflow do backend executa testes; não implanta serviço. Pages publica somente `out/`.

## Verificação no navegador

Chrome 154 no navegador remoto de teste; dados fictícios. Interface funcional com catálogo de 900 produtos. Busca local `gran zero` retorna Granola Zero Açúcar; `acucar` encontra resultados com Açúcar. Fluxo Produto → Enter → quantidade → Enter adiciona item. Rascunho de 11 itens recuperado após recarga. A atualização oferecida pelo service worker foi aplicada por “Salvar e atualizar aplicação” e preservou esse rascunho.

Comparação de autosave: 10/50/100/150/200/300 itens, ligado/desligado, adicionar/quantidade/excluir/carregar tabela; 48 lotes, recuperação OK nos 24 com autosave. Com autosave ligado, adicionar apresentou UI p95 entre 0,8 e 10,5 ms. A seguir, rede simulada Online/50/100/300/1000 ms/Offline: 36 lotes com autosave, dez amostras por lote após aquecimento; todos recuperados por conexão independente ao IndexedDB. UI p95 de inclusão entre 0,6 e 18,9 ms; IndexedDB p95 entre 2,0 e 11,6 ms. Autosave inclui debounce de 250 ms; sua duração não é espera do operador. Evidência exportada da segunda matriz: [AUTOSAVE-POS-MERGE.json](AUTOSAVE-POS-MERGE.json).

Os tempos medem modelo e commit React/DOM, sem pintura. Rede da matriz é simulada, não throttling externo; não equivale a benchmark em todos os equipamentos dos operadores. Primeira matriz foi executada durante a publicação; interface/persistência têm conteúdo idêntico ao publicado, confirmado por diff vazio dos respectivos diretórios contra a 7B.1. A segunda matriz, atualização do cache, matriz Mock e recarga offline foram concluídas após a publicação.

Teste adicional de offline: bloqueio pelo service worker da aplicação confirmou página armazenada com HTTP 200 e cabeçalho de teste, e recurso não armazenado bloqueado com HTTP 503. Com bloqueio ativo, autocomplete sem acentos, inclusão e gravação funcionaram. Pedido de 12 itens e última quantidade 3 recuperados após recarga real da página. Rede reativada ao terminar. Não foi simulado fechamento de todo o navegador nem queda do sistema operacional nesta verificação.

MockERPProvider: **PASS, 76 verificações** com IndexedDB real, ledger fictício separado e conexões independentes. Sucesso, 400/401/429/500, timeout antes/depois da criação, criação concorrente e falhas locais antes/depois do commit do ERP simulado. Nos cenários com recibo, 20 replays concorrentes produziram um único recibo. [MOCK-POS-MERGE.json](MOCK-POS-MERGE.json) e [evidência visual](MOCK-POS-MERGE.jpg).

## Limites preservados

Backend separado, sem implantação pública. Defaults `TINY_BACKEND_OAUTH_ENABLED=no`, `TINY_BACKEND_READ_ENABLED=no` e `TINY_BACKEND_REFRESH_ENABLED=no`; ausência de `yes` mantém cada capacidade desligada. Credenciais reais não configuradas. Nenhuma consulta, escrita, autorização OAuth ou renovação real Tiny executada nesta publicação. Interface continua usando mocks e IndexedDB; sem API por tecla. Nenhuma implementação da 7B.3 iniciada.

## Pendências obrigatórias antes da implantação comercial

| Pendência | Evidência exigida para liberação |
| --- | --- |
| Rate limit atrás de proxy | Definir proxies confiáveis e isolamento do backend; tratar IP real sem confiar em headers arbitrários; validar limites compartilhados e capacidade sem agregar indevidamente todos os operadores no IP do proxy. |
| Política de senhas | Aprovar requisitos, troca inicial, reset/recuperação e revogação; revisar procedimento administrativo e proteção das contas. Hoje: mínimo 12 caracteres, máximo 256 bytes e scrypt; sem fluxo de troca obrigatória/email/MFA. |
| OAuth persistente | Homologação autorizada da conta/aplicativo/callback, identidade, persistência após restart, expiração, revogação, refresh rotacionado e concorrência entre instâncias. Mocks e CI não substituem homologação real. |
| Backup e restauração | Definir retenção, RPO/RTO, backups protegidos do PostgreSQL, guarda separada e recuperação das versões do keyring; ensaiar restauração conjunta banco/chaves em ambiente isolado e comprovar decifragem e operação. |

Detalhes: [SEGURANCA.md](SEGURANCA.md), [OAUTH.md](OAUTH.md), [WINDOWS.md](WINDOWS.md) e [relatório técnico](../VERIFICACAO-ETAPA-7B2.md). Essas pendências não foram liberadas por esta publicação da demonstração.
