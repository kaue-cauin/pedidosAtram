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

## Commit e CI publicados

Implementação inicial: `9b69004d0d1fb6da73636f0de09367463a81b1b8`. Ajuste de foco testado no navegador: `438e2bdf3842759e9f383f3ac1269c4ac623c6bb`. As medições de performance usam a implementação inicial; o segundo commit altera apenas foco e Tab do modal. O protocolo e a ergonomia foram repetidos com o ajuste publicado. O commit posterior deste relatório contém somente documentação/evidências sintéticas e não altera a aplicação.

GitHub Actions: runs 37723895931 e 37724291431 concluídos com sucesso, build e deploy. Ambos executaram npm ci, check:data/2/3/4/5/6, typecheck, lint sem warnings e build antes de publicar. Publicação: https://kaue-cauin.github.io/pedidosAtram/.

## Navegador e protocolo

Chrome 154 remoto, janela 1363×936, mesmo perfil usado nas medições da Etapa 5. IndexedDB real, bancos de diagnóstico isolados. `protocolo-browser.json`: PASS, 143 verificações. `regressao-browser-etapa5.json`: PASS, 76, todos os sete cenários e 20 replays concorrentes por cenário, um recibo único por criação. Inclui conexões separadas e corridas de identidade/pedido. A consulta não faz createOrder.

Os schemas 1/2/3 são verificados explicitamente pela suíte compartilhada Node/browser. Recuperação visual adicional de ETAPA5-HTTP400-FINAL preservou o recibo MOCK-17f9c5aa-6962-45c6-bda5-2d39e94edbd6 e estado terminal. Nenhum rascunho anterior foi removido.

## Performance

Todos os valores abaixo em ms, p95. Mesmos componentes do laboratório, 10 commits após dois aquecimentos. Cada lote com autosave recupera o snapshot usando outra conexão. As amostras de persistência são agrupadas pelo debounce e não têm a mesma contagem da UI. O arquivo original contém contagens e método.

| Itens | Etapa 5 UI | Baseline desta sessão UI | Etapa 6 UI (1ª / repetição) | IDB repetição | Autosave repetição |
|---:|---:|---:|---:|---:|---:|
| 10 | 2,4 | 4,9 | 1,6 / 0,7 | 1,7 | 252,2 |
| 50 | 0,7 | 2,0 | 0,7 / 0,8 | 1,5 | 251,9 |
| 100 | 0,8 | 0,8 | 0,9 / 0,8 | 1,6 | 252,0 |
| 150 | 1,4 | 0,9 | 0,9 / 1,2 | 1,8 | 268,5 |
| 200 | 0,9 | 11,1 | 0,8 / 1,0 | 1,9 | 252,3 |
| 300 | 0,8 | 0,8 | 1,4 / 1,0 | 3,5 | 254,1 |

| Itens | Quantidade UI p95 | Excluir UI p95 | Carregar UI p95 |
|---:|---:|---:|---:|
| 10 | 0,7 | 1,0 | 0,9 |
| 50 | 0,7 | 1,8 | 2,2 |
| 100 | 0,5 | 4,2 | 5,6 |
| 150 | 0,7 | 3,5 | 9,3 |
| 200 | 0,9 | 5,3 | 9,5 |
| 300 | 0,8 | 8,7 | 21,7 |

Busca pura do autocomplete no navegador: p95 0,1–0,2 ms em todos os tamanhos. Totais CPU: abaixo da resolução do relógio (0,0 ms reportado), não equivalem a custo zero. Não medem a apresentação completa da lista nem a latência física de teclado.

Nenhuma inclusão com autosave nos dois comparativos ultrapassou 1,6 ms p95; 200 itens: 0,8/1,0; 300: 1,4/1,0. Meta <50 ms atendida no laboratório. Nenhuma operação UI com autosave apresentou regressão sustentada de 2× frente à Etapa 5. As linhas continuam sem virtualização.

Investigação de picos: primeira medição de IDB em alteração de quantidade com 300 itens foi 11,1 ms, contra 2,6 na Etapa 5; repetição caiu para 2,2. No comparativo CPU/commit sem autosave, inclusão com 300 foi 2,7 ms (baseline desta sessão 0,9), e repetição retornou a 0,9. Busca permanece no limite do relógio. Os módulos de busca/reducer/fila não foram alterados. Esses picos não se repetiram; ambos os arquivos permanecem disponíveis, sem escolher apenas a melhor execução. Autosave contém debounce e variação de agendamento; não bloqueia Enter. Comparação em navegador remoto não controla carga de hardware e não é um SLA.

Rede simulada 0/50/100/300/1000 ms e indisponível: 36 lotes, UI inclusão máxima p95 6,9 ms, todos recuperados. `performance-network.json`. Simulação não altera Wi-Fi/navigator.onLine. Teste adicional do service worker bloqueou rede da aplicação, devolveu HTML do cache com 200 e recurso não cacheado com 503; pedido continuou editável e foi recuperado após recarga.

Teste de digitação contínua: 60 inclusões a partir de 300 itens, gravação artificialmente atrasada em 1.000 ms. UI p95 3,1 ms; duas gravações concluídas durante a entrada, 38 inclusões enquanto o escritor aguardava; persistência p95 1.017,3 ms; último snapshot recuperado. `performance-continuous.json`. Demonstra sobreposição entre digitação e gravação, preservando o escritor único.

## Ergonomia e roteiro final executado

Automação pelos controles publicados, sem acesso ao estado interno/IndexedDB para fabricar resultados:

- Novo pedido ETAPA6-TECLADO-30; F2 e seleção de cliente por Enter; 30 novas inclusões de códigos 100001–100030 por Produto → Enter → Quantidade → Enter. 30/30 retornos ao foco Produto, 40 linhas incluindo as 10 de exemplo. O intervalo de automação foi 9,819 s e inclui transporte das chamadas; não é tempo de operador humano.
- Editar, duplicar e excluir pelos botões com Enter; Ctrl+S; recarga e recuperação. A primeira recarga foi imediata enquanto ainda salvava e recuperou a última transação anterior (a mudança de pagamento não havia concluído). Repetido aguardando confirmação de gravação: pagamento 15 30 45 e 41 linhas, incluindo uma nova inclusão offline, recuperados corretamente. Essa janela pendente é uma limitação explícita do encerramento assíncrono.
- Rede bloqueada pelo service worker, inclusão, salvo localmente, reload, recuperação; rede reativada ao final. A mesma condição de pagamento persistiu.
- Ctrl+Enter abre resumo com cliente, vendedor, itens/quantidade, total, pagamento e frete; Escape cancela e devolve foco a product-entry. Alteração posterior de quantidade, nova revisão e sucesso. Recibo salvo/reaberto. F2/F4, setas e Escape verificados também na prévia.
- Primeiro ensaio detectou foco inicial em área rolável e possibilidade de Tab alcançar body. Corrigido com foco explícito em Voltar à edição e ciclo de Tab/Shift+Tab no modal. Reteste: foco inicial no botão e navegação dentro do diálogo.
- ETAPA6-400: ERROR de validação, Corrigir pedido, DRAFT, alteração de pagamento, revisão e envio; rejeição f290da88-efc7-43c6-a287-429f68f1d8a8 arquivada, nova identidade d3ef21c2-1bf8-47f8-b6cb-8b6b681fe8b6, um recibo final. Histórico e payload antigo preservados.
- ETAPA6-429: revisão desabilitada antes do prazo, liberada após retryAt, sucesso com identidade d213616c-78c1-4e01-9909-38041df43499 preservada. Sem repetição automática.
- ETAPA6-TIMEOUT-APOS: UNKNOWN, revisão desabilitada e campos inert; reload/recuperação em UNKNOWN; consulta terminou SUBMITTED, recibo MOCK-e36308fb-b73c-4cce-9c8a-67dc335c1a3d. Consulta não criou outro pedido.
- Falha de persistência, nova tentativa e concorrência no laboratório: PASS, snapshot preservado; duas conexões concorrentes permitiram uma única gravação da revisão.

`layout-browser.json`: 12 combinações de 10/100/200/300 itens × 1366×768, 1600×900 e 1920×1080 em iframe isolado. Todas com número correto de linhas, modal/rodapé dentro do viewport, sem overflow horizontal do documento e foco interno; tabela com rolagem própria. Área útil desconta bordas/barra de rolagem. Isso valida CSS/contenção, não três monitores físicos. A prévia não grava nem cria pedidos e sua confirmação fica desabilitada.

O teste com pessoas reais ainda NÃO foi executado. `ROTEIRO-OPERADOR-ETAPA-6.md` tem ficha de tempos, mouse, erros, perdas de foco e dúvidas para a equipe completar no equipamento de trabalho. A verificação técnica não é aprovação de campo.

## Limites e próximos passos

Mock local, sem Tiny, backend ou OAuth real. Durabilidade limitada à última transação concluída e ao perfil/origem do navegador. O laboratório mede commit DOM, não pintura nem latência física de teclado. Prévia por iframe não substitui monitor físico nem operador real. O roteiro de campo está em ROTEIRO-OPERADOR-ETAPA-6.md; teste humano ainda pendente. A próxima fase deve confirmar garantias da API oficial e projetar ledger/backend antes de criar pedidos reais; um ledger isolado não elimina o timeout ambíguo em uma API sem idempotência/consulta confiável.

## Inventário de arquivos

Lista completa de criados (A) e alterados (M) contra a Etapa 5 em `etapa6/arquivos.txt`, incluindo evidências JSON. Destaques criados: ledger de rejeições, suíte/check/diagnóstico da Etapa 6, prévias de layout, verificação, roteiro de operador e prontidão Tiny. Alterados: tipos/domínio, coordinator/provider/mock, repositório/hook, painel/workspace/CSS, offline, atalhos, checks anteriores, README, package e workflow. Lockfile e dependências inalterados.
