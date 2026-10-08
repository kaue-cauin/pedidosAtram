# Verificação da Etapa 3

Código verificado: `1dd07cd3978235be85c6cd598f2c955c34bc6eda`. Teste no GitHub Pages em 8 de outubro de 2026, 01:25 UTC (7 de outubro, 22:25 em São Paulo).

## Resultado

A tabela utiliza linhas memoizadas, callbacks estáveis e totais incrementais. Adicionar ou editar um item renderiza apenas a linha alterada. O foco volta imediatamente ao campo Produto após confirmar; editar foca Quantidade. A tabela tem rolagem interna e cabeçalho fixo, mantendo todas as linhas no DOM.

O laboratório separado em `/diagnostico/` compara Base e Otimizado com 10, 50, 100, 150, 200 e 300 linhas. Base desativa a memoização e recalcula os totais; é uma comparação controlada, não uma reprodução exata da Etapa 2.

## Medição no navegador publicado

Chrome 154, janela 1363 × 936, escala 1, navegador remoto. Cada operação tem 10 amostras após 2 aquecimentos; busca e totais têm 200 amostras de CPU. Os números abaixo são p95 em milissegundos até o commit do DOM (`useLayoutEffect`).

| Itens | Adicionar Base | Adicionar Otimizado | Quantidade Otimizado | Excluir Otimizado | Carregar Otimizado |
| --- | --- | --- | --- | --- | --- |
| 10 | 1,5 | 1,4 | 0,9 | 1,1 | 1,6 |
| 50 | 3,5 | 1,7 | 0,7 | 1,8 | 2,2 |
| 100 | 5,2 | 1,4 | 2,3 | 2,8 | 3,3 |
| 150 | 6,6 | 1,0 | 0,9 | 4,8 | 5,4 |
| 200 | 8,6 | 1,2 | 1,0 | 6,6 | 9,8 |
| 300 | 27,6 | 4,0 | 2,6 | 7,0 | 21,8 |

Com 300 itens, adicionar passou de 27,6 ms para 4,0 ms e renderizou somente uma linha. Com 200 itens, a inclusão levou 1,2 ms. Excluir no meio renumera as linhas posteriores; carregar a tabela inteira renderiza todas. Essas operações continuam crescendo com a quantidade de linhas. A cópia/busca no array também continua O(n).

Arquivo exportado: [performance-browser-etapa3.json](performance-browser-etapa3.json). O p95 com apenas 10 amostras é sensível a ruído e não deve ser tratado como garantia de desempenho.

A opção de medir quadros ficou desativada. Os resultados não medem pintura final, latência física do teclado nem desempenho dos computadores dos operadores. Valores de CPU iguais a zero decorrem da resolução do relógio. A meta visual de 50 ms ainda precisa ser validada no equipamento de uso; os commits medidos ficaram abaixo dela. Não há evidência suficiente nesta execução para exigir virtualização.

## Verificação funcional e numérica

- `npm run check:stage3`: 10.800 alterações e 75.642 verificações, comparando os totais incrementais ao cálculo independente. Inclui quantidades fracionárias, descontos, IDs duplicados, alterações sem efeito e exclusão de todos os itens.
- `npm run check:data`, `npm run check:stage2`, `npm run typecheck` e build estático passaram. O workflow do Pages executa essas verificações antes de publicar.
- No navegador publicado, carregamos 300 linhas e fizemos 30 inclusões por Produto → Enter → Quantidade → Enter. Todas terminaram com foco em Produto e a tabela chegou a 330 linhas.
- Edição com quantidade `1,234`, duplicação e exclusão também passaram; ao final, o campo Produto manteve o foco.

[Captura do teste com 330 linhas](etapa3-pedido-330.jpg).

Medição complementar de CPU em Node: [performance-node-etapa3.json](performance-node-etapa3.json). Ela não mede o DOM.

## Próxima etapa

Etapa 4: persistência em IndexedDB, autosave, recuperação e suporte offline. Nesta versão, recarregar descarta o pedido em memória; salvar e enviar continuam desativados. Não há integração com Tiny/Olist.
