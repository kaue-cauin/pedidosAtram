# Verificação da Etapa 4

## Implementação

A entrada continua em memória. A fila é alimentada após a atualização React, sem aguardar IndexedDB no fluxo Enter. O autosave agrupa snapshots com debounce de 250 ms e limite de espera de 1.000 ms durante alterações contínuas; mantém um escritor e o último snapshot pendente.

IndexedDB armazena o pedido completo, schema/revisão/data. A revisão é conferida na transação para evitar sobrescrita entre abas. “Salvo localmente” só aparece após a conclusão da transação. Falhas retêm as alterações, permitem nova tentativa e exportação. Recuperação permite escolher rascunhos e mantém os anteriores ao iniciar um novo pedido de exemplo.

O build gera o service worker com recursos compilados e hash de versão. A instalação é completa ou falha; atualizações aguardam ativação pelo operador após salvar. O diagnóstico permite bloqueio da rede da aplicação no service worker para testar recarga e recuperação usando somente cache e IndexedDB.

## Testes automatizados locais

- `check:data`: 900 produtos, 100 clientes, 5 vendedores e 3 listas.
- `check:stage2`: 1.800 buscas exatas e roteiro por teclado/modelo preservado.
- `check:stage3`: 10.800 alterações, 75.642 verificações de totais.
- `check:stage4`: 26 verificações de schema, fila, debounce, escritor único, último snapshot, flush, falhas e nova tentativa.
- `typecheck` e build com `/pedidosAtram`: passaram.
- Runtime do service worker gerado, em VM, com bytes reais do build: 92 verificações para 40 recursos, incluindo rede indisponível, navegação com query e reinício do worker. Esse teste não substitui o navegador real.

## Medições no navegador

Verificação na versão publicada em andamento. O diagnóstico exporta os resultados independentes da UI e persistência e identifica as simulações de rede e armazenamento.

## Limites

UI mede modelo + React/DOM até `useLayoutEffect`, sem pintura física. IndexedDB mede a transação até `complete`; persistência inclui abertura e atraso artificial; autosave inclui fila/debounce. Amostras de gravação são contadas separadamente das amostras UI.

Somente a última transação concluída está garantida para recuperação. Sair normalmente tenta flush e pode avisar sobre alterações pendentes; encerramento forçado/queda de energia não garantem a gravação da janela pendente. Limpeza dos dados do site, perfil privado e políticas de espaço do navegador podem remover dados locais. Não há backup remoto ou sincronização com ERP. A linha ativa ainda não confirmada não faz parte do pedido salvo.
