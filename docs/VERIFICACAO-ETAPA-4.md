# Verificação da Etapa 4

## Resultado

Autosave em fila, IndexedDB, recuperação e cache offline implementados. A inclusão continua em memória; nenhum handler de Enter aguarda gravação ou rede. A fila mantém um escritor, debounce de 250 ms, limite de espera de 1.000 ms quando o escritor está livre e somente o snapshot pendente mais recente. Atualizações do indicador usam uma assinatura própria e não atualizam a tabela.

Falhas conservam o snapshot e permitem nova tentativa/exportação. A revisão é conferida na mesma transação para evitar sobrescrita entre abas. “Salvo localmente” só aparece após `transaction.complete`, com durabilidade estrita quando suportada. Recuperação recompõe os totais a partir dos itens. Novos pedidos têm UUID independente e preservam os anteriores.

## Ambiente e método

Navegador remoto, user agent Chrome 154/Mac, janela 1363 × 936 e escala 1. As medições e a recuperação final foram feitas no Pages com o código `f75ba313f79033542f3b47e721a212ef6f7cd050`, em 7 de outubro de 2026 à noite (8 de outubro em UTC). As rodadas de rede e atraso de armazenamento foram feitas com `843778b936c0ce3103f114314f03fabbf813fe80`, cuja fila tem o mesmo comportamento; a versão final adiciona timestamp de conclusão e teste contínuo. O comparativo anterior fica em uma página separada para não compartilhar IDs dos campos com o laboratório de autosave.

- UI: início da alteração → modelo + React/DOM até `useLayoutEffect`. Não mede pixels, pintura física ou latência do dispositivo de teclado.
- IndexedDB: início da transação → `complete`.
- Persistência: abertura do banco + atraso artificial + transação.
- Autosave: última alteração do snapshot enfileirado → conclusão, incluindo fila/debounce. Não representa espera do operador.
- Cada operação tem 10 commits medidos após 2 aquecimentos, com fixture restaurada fora da amostra. Mantemos o debounce normal. Alterações são agrupadas: nesta rodada, cada lote medido gerou uma gravação. O valor p95 da gravação com uma amostra é apenas o valor desse lote; não caracteriza uma distribuição robusta.

Com 10 amostras, o p95 de UI é sensível a ruído. O objetivo é verificar separação e ausência de degradação importante, não garantir desempenho em qualquer hardware.

## Inclusão com 10 a 300 itens

Tempos em ms. UI é p95; IndexedDB e autosave são a gravação do lote agrupado. A última coluna usa atraso artificial de armazenamento de 1.000 ms.

| Itens | UI autosave desligado | UI autosave ligado | IndexedDB normal | Autosave normal | UI armazenamento lento |
| --- | --- | --- | --- | --- | --- |
| 10 | 2,9 | 0,9 | 1,4 | 252,0 | 0,6 |
| 50 | 1,9 | 1,6 | 1,3 | 251,8 | 0,9 |
| 100 | 1,2 | 0,7 | 1,7 | 252,1 | 0,9 |
| 150 | 1,7 | 1,0 | 4,1 | 255,2 | 0,9 |
| 200 | 1,0 | 0,9 | 2,4 | 252,8 | 1,6 |
| 300 | 3,2 | 1,1 | 2,7 | 253,0 | 3,1 |

Com 300 itens no comparativo final: **UI 1,1 ms; IndexedDB 2,7 ms; autosave 253,0 ms**. O autosave inclui o debounce; o Enter não esperou esses 253 ms. Na rodada com armazenamento lento, UI ficou em 3,1 ms, persistência em 1.004,9 ms e autosave em 1.255,3 ms.

A comparação também mediu alteração de quantidade, exclusão e carregamento. O maior p95 da UI com autosave ligado foi 15,2 ms na rodada normal e 20,4 ms na rodada com atraso de armazenamento. Inclusão/quantidade renderizam somente a linha alterada; exclusão no meio renumera as posteriores e carregamento renderiza todas.

- [Comparativo final, 48 linhas de resultados](performance-browser-etapa4.json)
- [Armazenamento com atraso de 1 segundo, 48 linhas](performance-storage-lento-etapa4.json)

## Digitação enquanto grava

60 inclusões a partir de 300 itens, com intervalo de 50 ms e atraso do escritor de 1.000 ms. Resultado:

- UI p95: **3,1 ms**.
- **2 gravações concluíram durante a entrada**.
- **37 inclusões aconteceram enquanto o escritor estava ocupado**.
- IndexedDB p95: 3,3 ms; persistência p95: 1.017,3 ms.
- Após terminar, outra conexão recuperou exatamente o último snapshot, com 360 itens.

Também testamos o fluxo real Produto → Enter → Quantidade → Enter: 10 inclusões a partir de 300 linhas, com autosave ligado e atraso de armazenamento de 1.000 ms. Iniciamos as inclusões seguintes durante uma gravação. Todas as 10 terminaram com foco em Produto; chegaram a 310 linhas, sem erros. A gravação e leitura independente das pendências passaram.

[Resultado contínuo exportado](performance-continuo-etapa4.json).

## Rede lenta e offline

Foram 36 lotes de inclusão: seis tamanhos × rede simulada online/50/100/300/1000 ms/offline, com autosave ligado. A operação de rede simulada corre em paralelo; o fluxo de entrada não a aguarda. O maior p95 da UI foi 4,5 ms, e todos os lotes com autosave recuperaram o snapshot por outra conexão.

[Resultados de rede simulada](performance-network-etapa4.json).

Verificação adicional no navegador real, com bloqueio da rede da aplicação pelo service worker:

1. Página principal veio do cache com 200 e marcador de teste; recurso não armazenado foi bloqueado com 503.
2. Recarregamos a página e recuperamos o pedido.
3. Incluímos um item offline, aguardamos salvo, fechamos a aba e reabrimos o endereço. Os itens e totais recuperados eram idênticos: 12 linhas, 78,234 unidades, R$ 1.304,56.
4. Na versão final, recuperamos também número, cliente Mercado Exemplo 2, vendedor Bruno Lima, datas, condição 15/30/45, transportadora, rastreamento, 3 volumes, expedição e observações.
5. Começar um novo pedido de exemplo preservou o rascunho anterior; ambos apareceram na lista de recuperação.
6. Reativamos a rede da aplicação ao terminar.

O teste bloqueia requisições da aplicação no service worker; não desliga a conexão física do navegador. Fechamos/reabrimos a aba, não encerramos o processo do navegador nem simulamos queda de energia.

[Registro funcional](verificacao-funcional-etapa4.json) · [Captura da recuperação](etapa4-recuperacao.jpg).

## Falhas, concorrência e atualização

No IndexedDB real, uma falha simulada manteve as alterações pendentes. Nova tentativa gravou e uma conexão independente recuperou o pedido. Duas conexões tentaram gravar a mesma revisão: exatamente uma foi aceita e a outra rejeitada, sem sobrescrita. O estado final foi restaurado e lido corretamente.

A atualização da aplicação foi ativada por **Salvar e atualizar aplicação** e manteve o rascunho. O teste identificou HTML antigo vindo do cache HTTP durante instalação; corrigimos isso buscando HTML com uma versão na URL, ignorando o cache HTTP e validando seus arquivos contra o manifesto do build. Instalação inconsistente falha e seu cache é removido. O build limpa arquivos estáticos antigos antes de gerar o manifesto. O hash inclui também o runtime do service worker.

## Testes automatizados

- `check:data`: 900 produtos, 100 clientes, 5 vendedores, 3 listas.
- `check:stage2`: 1.800 buscas exatas e roteiro de quatro inclusões preservado.
- `check:stage3`: 10.800 alterações, 75.642 verificações de totais.
- `check:stage4`: 26 verificações de schema, fila, debounce, escritor único, último snapshot, flush, falhas e nova tentativa.
- TypeScript e build de produção com `/pedidosAtram`: passaram.
- Teste do runtime do service worker em VM, usando bytes reais do build: 81 verificações para 28 recursos, cobrindo rede indisponível, recursos em cache, query na navegação, reinício do worker, atualização explícita e rejeição de HTML incompatível. Integração no navegador testada separadamente, como acima.

O workflow executa essas verificações antes da publicação. A medição em Node não é usada como prova de pintura no navegador.

## Limites e próxima etapa

Recuperação garante a última transação concluída. Ao sair normalmente, tentamos flush e avisamos se houver alterações pendentes; encerramento forçado/queda de energia antes de “Salvo” podem perder a janela ainda não gravada. A linha ativa ainda não confirmada não integra o pedido salvo.

Dados pertencem à origem/perfil deste navegador. Limpar os dados do site, modo privado e políticas de espaço podem remover rascunhos. A exportação produz uma cópia JSON; não há importação, backup remoto ou sincronização com ERP. O primeiro acesso precisa estar online e concluir a preparação do cache antes de recarregar offline.

As medições ficaram abaixo de 50 ms até o commit do DOM, inclusive durante gravações lentas. A pintura final e os computadores dos operadores continuam como validação de campo. Sem evidência nesta execução para introduzir virtualização ou dependências novas.

Etapa 5: revisão, MockERPProvider, envio e cenários de erro. Nenhuma integração real com Tiny/Olist foi introduzida.
