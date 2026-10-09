# Homologação de navegador — Etapa 7B.3

Executada em 09/10/2026 UTC no preview fornecido pelo usuário: https://starlit-jelly-5d8ef0.netlify.app/diagnostico-etapa7b3/ . **Resultado: PARCIAL**, sem aprovação comercial ou homologação integral. Código esperado: `124e1dff8eb010b5f8049ff9fa53625de9c8f897`; o preview não expõe SHA de build, portanto a identidade do artefato não foi comprovada. Não houve alteração do preview, Pages, main ou backend.

Chrome remoto 154.0.0.0, user agent com plataforma Mac OS X 10_15_7; viewport exportado 1363 × 936, escala 1. CPU e RAM não disponíveis. Testes executados pela interface real, React e IndexedDB nativo. A UI mede modelo + commit DOM até useLayoutEffect; não mede pintura nem latência física da tecla. Persistência, transação IndexedDB e autosave são registrados separadamente; autosave inclui fila/debounce. Rede lenta/offline do diagnóstico são simulações, sem desligar a rede do navegador.

## Resultados nativos

| Ensaio | Resultado |
|---|---|
| 900 produtos, teclado/autocomplete | PASS: palavras em qualquer ordem (`gran zero`/`zero gran`), acentos (`acucar`), marca, código e GTIN `2000000000015`; setas, Enter e Escape |
| Inclusão por teclado | PASS: Enter seleciona produto, foca quantidade; Enter na quantidade insere item e devolve foco a Produto |
| 36 cenários, autosave e catálogo em background | PASS: 6 tamanhos × 6 redes simuladas; todos os rascunhos recuperados em conexão IndexedDB independente |
| Comparação autosave desligado/ligado | PASS: 48 lotes, 6 tamanhos × 2 modos × adicionar/quantidade/excluir/carregar tabela; todos os 24 lotes com autosave recuperados |
| Digitação durante armazenamento atrasado | PASS: 300 itens iniciais + 60 inclusões, atraso artificial de 1 s; 41 inclusões durante gravação em andamento, 2 gravações durante entrada e recuperação final |
| Falha de armazenamento e concorrência | PASS: alterações recuperadas; duas conexões concorrentes permitem somente uma gravação, impedindo sobrescrita |
| Catálogo A/B antes de aplicar | PASS: A ativa `f42d6a25-5bfb-4319-a0b8-4c0d1371efcc`, B preparada `dd387187-9a90-4d21-b40a-d22a6de7143c`; recarga e recover mantêm A ativa/B pendente |
| Catálogo depois de aplicar | PASS: aplicação explícita de B; recarga e recover mantêm B ativa/sem pendência |
| Aplicação com pesquisa/seleção | PASS: aplicação recusada; exigiu limpar pesquisa/seleção |
| Atualizações em background | PASS: nenhuma ativação automática; B continua ativa com nova versão pendente após reabrir aba |
| Rascunho após refresh | PASS: `HOMOLOGACAO-7B3-20261009`, 11 itens, incluindo Mel Silvestre 500 g, quantidade 7 |
| Fechar/reabrir aba | PASS: mesmo rascunho recuperado; B ativa e nova versão pendente recuperadas |
| Logout sintético | PASS: catálogo ativo/pendente removido, rascunho de 11 itens preservado |
| MockERPProvider | PASS: interface declara envio somente ao Mock ERP e retorna “Pedido enviado com sucesso” |

Resultados de UI p95 máximos por tamanho, entre as seis redes **simuladas**, autosave ligado:

| Itens | UI p95 máximo (ms) |
|---|---:|
| 10 | 24,8 |
| 50 | 2,4 |
| 100 | 2,1 |
| 150 | 1,6 |
| 200 | 3,7 |
| 300 | 3,3 |

Na matriz 36: máximo UI p95 24,8 ms, modelo 0,2 ms, IndexedDB 3,6 ms e autosave 311,3 ms. Na comparação 48: máximo UI p95 com autosave 14,1 ms; sem autosave 22,2 ms. Execuções sequenciais com aquecimento/carga distintos não demonstram que autosave melhora desempenho. Todos os máximos de UI ficaram abaixo do alvo de 50 ms; sem comparação causal com medições antigas da 7B.2 em outro ambiente.

Na digitação contínua: UI p95 3,9 ms, IndexedDB 5,5 ms, persistência com atraso 1009,6 ms e autosave 1884,4 ms. A interface continuou inserindo durante a espera da persistência. No último export de catálogo em background: máximos de transferência 385 ms, verificação 4,8 ms, índice 6,7 ms e preparação IndexedDB 33,7 ms; nenhuma ativação durante o benchmark. As medidas de ativação explícita não representam a latência do campo Produto.

## Pendências obrigatórias

1. **Offline real:** desligar rede via navegador/sistema, recarregar, recuperar e operar. O indicador “Aplicação disponível offline” e a simulação não comprovam esse ensaio.
2. **Reinício completo do navegador:** fechar processo e reabrir mantendo perfil, recuperar catálogo e rascunho. Apenas fechar/reabrir aba foi executado.
3. **Tráfego por tecla:** capturar Network/HAR e confirmar ausência de chamadas à API durante autocomplete. A busca local foi verificada pelo comportamento e arquitetura; não houve captura de requisições por tecla.

O navegador remoto não oferece controle de rede, reinício de processo nem captura de tráfego. DevTools não ficou acessível; a API de leitura DOM não disponibiliza performance de rede. Não foram usados Node ou fake-indexeddb para preencher essas lacunas. Validar também SHA de build do preview e repetir em notebook de referência identificado antes da homologação integral. Ensaios da futura interface autenticada/troca de organização seguem cobertos por contratos e testes PostgreSQL, não por este preview mock.

## Evidências

- [matriz-36.json](evidencias-browser/matriz-36.json): 36 cenários, método, ambiente e gravações.
- [comparacao-48.json](evidencias-browser/comparacao-48.json): 48 lotes e gravações.
- [digitacao-continua.json](evidencias-browser/digitacao-continua.json): entrada contínua e recuperação.
- [catalogo-background.json](evidencias-browser/catalogo-background.json): etapas de preparação.
- [autosave-nativo.jpg](evidencias-browser/autosave-nativo.jpg): captura real da interface e resultado de entrada contínua. Os passos manuais acima são observações da sessão, não logs contidos nos JSON de performance.

Nenhuma consulta, refresh, OAuth ou escrita no Tiny real. Flags reais continuam desabilitadas. PR #2 em rascunho; sem merge, publicação Pages/backend ou Etapa 7B.4. Pendências comerciais preservadas: rate limit atrás de proxy confiável, política de senhas, homologação OAuth persistente e backup/restauração PostgreSQL/chaves de criptografia.
