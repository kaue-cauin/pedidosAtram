# Verificação da Etapa 6

## Ambiente e baseline

Base: e15040a4a14cf4ca43270b49c6a50dff17f63c72, Etapa 5. Node 24, React 19, Next 16, TypeScript 5.9, Chrome remoto 154. Stack, lockfile e dependências preservados. Os documentos das Etapas 1–5 foram lidos antes da alteração. Baseline dos checks e dos dois laboratórios do navegador em `docs/etapa6/baseline-*`.

## Implementação

400: rejeição terminal durável vinculada à identidade e ao payload; consulta antes de corrigir; arquivamento imutável da tentativa; DRAFT somente depois da gravação do arquivo; nova identidade apenas após alteração e nova confirmação. Recibo e rejeição usam a mesma transação: rejeição impede criação tardia e recibo já criado impede correção.

401: erro de autenticação com identidade e conteúdo congelados. 429: identidade preservada, bloqueio até retryAt no domínio e UI. 500/timeouts: UNKNOWN e consulta obrigatória; consulta nunca cria. SUBMITTING recuperado exige reconciliação. SUBMITTED terminal. Nenhum reenvio automático.

Schema 3 adiciona histórico e eventos locais. Leitura explícita de 1/2/3; escrita em 3 sem migração destrutiva. Registros desconhecidos/inválidos são preservados e rejeitados na leitura/gravação. Mensagens antigas de 400 não são interpretadas como prova de rejeição. O banco Mock mantém seus recibos anteriores ao upgrade e ganha store de rejeições.

Teclado com listeners estáveis e callbacks atuais, modal nativo com Escape/foco restaurado, resumo comercial e detalhes recolhidos. Autosave, memoização, catálogo local e totais incrementais preservados.

## Verificações locais

check:data, check:stage2, check:stage3, check:stage4, check:stage5, check:stage6, typecheck, lint e build: PASS. Etapa 3: 75.642 verificações / 10.800 mutações; Etapa 4: 26; Etapa 5: 93; Etapa 6: 143. Build offline: 111 verificações / 37 recursos. Lint: zero erros e warnings, sem desabilitações amplas. Relatório do protocolo em `etapa6/protocolo.json`.

## Verificação publicada

A validação final de navegador, performance, ergonomia, compatibilidade e CI está em execução. Os resultados e o commit testado serão preenchidos após a publicação da implementação. Não considerar este registro parcial como aceite final.

## Limites e próximos passos

Mock local, sem Tiny, backend ou OAuth real. Durabilidade limitada à última transação concluída e ao perfil/origem do navegador. O laboratório mede commit DOM, não pintura nem latência física de teclado. Prévia por iframe não substitui monitor físico nem operador real. O roteiro de campo está em ROTEIRO-OPERADOR-ETAPA-6.md; teste humano ainda pendente. A próxima fase deve confirmar garantias da API oficial e projetar ledger/backend antes de criar pedidos reais; um ledger isolado não elimina o timeout ambíguo em uma API sem idempotência/consulta confiável.
