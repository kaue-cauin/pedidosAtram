# Atram Comercial — entrada rápida de pedidos, Etapa 5

Esta versão inclui as Etapas 1–5: entrada rápida, tabela grande, autosave em IndexedDB, recuperação, cache offline e envio idempotente ao Mock ERP. Os dados são fictícios; não há integração com Tiny/Olist. O pedido é salvo neste navegador, sem upload ou sincronização entre dispositivos.

## Executar

Requisitos: Node.js 24 LTS, npm e navegador atual.

```bash
npm ci
cp .env.example .env.local
npm run dev:next
```

Abra o endereço indicado no terminal. No Windows, copie `.env.example` para `.env.local` pelo Explorador ou com `Copy-Item .env.example .env.local` no PowerShell.

```bash
npm run typecheck
npm run check:data
npm run check:stage2
npm run check:stage3
npm run check:stage4
npm run check:stage5
npm run build
```

O build Next.js exporta a aplicação estática para `out/`. Para servir a prévia compilada, se Python estiver instalado: `python -m http.server 8000 --directory out`; abra http://localhost:8000. Não abra `index.html` diretamente como arquivo.

## Teste do fluxo

1. Caso apareça a recuperação, continue um rascunho ou comece um novo pedido de exemplo (10 itens). Pressione F2, digite `mercado`, navegue com ↑/↓ e pressione Enter. O foco irá para Produto.
2. Digite `gran zero`, Enter, `10`, Enter.
3. Digite `whey choc`, Enter, `4`, Enter.
4. Digite `acucar coco`, Enter, `12`, Enter.
5. Digite `far aveia`, Enter, `5`, Enter.
6. Confira os itens e os totais. Após cada inclusão, Produto recebe o foco e a quantidade volta a 1.

Com os primeiros resultados do catálogo Padrão e os 10 itens iniciais, esse roteiro termina em **14 linhas, 106 unidades e R$ 1.999,80**.

- F4 foca Produto em qualquer parte da tela.
- Ctrl+S (ou Cmd+S) salva o rascunho imediatamente, sem bloquear a próxima inclusão.
- ↑/↓ percorrem sugestões; Enter seleciona; Esc fecha a lista. Uma nova busca ou seta reabre a lista.
- Tab acessa preço, desconto e botão Adicionar. Quantidade aceita vírgula ou ponto e até três casas decimais; preço e desconto, duas. Não use separador de milhar.
- Editar carrega o item na mesma linha de entrada e foca Quantidade; Enter aplica a alteração. Esc fora da lista de sugestões ou Cancelar edição cancela.
- Duplicar cria uma linha independente; Excluir remove a linha. As ações são botões acessíveis por Tab/Enter.
- Produtos repetidos permanecem em linhas independentes. As sugestões exibem marca, código, unidade e preço para distinguir embalagens e marcas.

## Implementação

- `components/order/local-autocomplete.tsx`: componente compartilhado de sugestões para produtos e clientes, com semântica combobox/listbox e seleção por teclado.
- `components/order/order-items.tsx`: uma única linha ativa; tabela simples, sem autocomplete por linha.
- `domain/search.ts`: índice normalizado construído uma vez, busca de múltiplos termos em qualquer ordem, sem acentos/maiúsculas e com prioridade para código/EAN exatos. Máximo de 12 sugestões; refine os termos para localizar outras opções.
- `domain/item-entry.ts`: validação numérica e criação de itens. Dinheiro em centavos; descontos em pontos-base; pesos em gramas.
- `OrderWorkspace`: estado dos itens em memória, independente da fila de persistência. A digitação fica dentro de `ItemEntry`; somente confirmar uma alteração atualiza a tabela e o resumo.
- `domain/order-state.ts`: reducer puro com totais incrementais. Quantidades e pesos são arredondados a milésimos para impedir resíduos acumulados; dinheiro permanece em centavos. Somente os itens alterados ganham nova referência. `domain/totals.ts` permanece como cálculo independente de referência nos testes.
- `domain/mock-data.ts`: 900 produtos, 100 clientes, 5 vendedores e 3 listas de preço. Gerados deterministicamente ao carregar o módulo. `npm run mock:export` exporta JSON para `outputs/`.
- `integrations/ERPProvider.ts`: contrato de validação, criação idempotente e consulta. MockERPProvider implementado na Etapa 5; TinyERPProvider somente em fase futura.

Preservada a stack e o lockfile da Etapa 1: React, TypeScript, Next.js, Tailwind e componentes do starter. Nenhuma dependência nova. A infraestrutura opcional de Vinext/hospedagem já existente não é necessária para executar `dev:next`.

## Limites e sequência

Cliente selecionado, vendedor, campos gerais, datas, pagamento, transporte e observações são editáveis e persistidos com os itens confirmados. Lista de preço não recalcula preços; frete/despesas/desconto geral e impostos permanecem fixos. Ctrl+Enter abre a revisão para o envio simulado. Após confirmar, o pedido fica bloqueado para edição. A entrada ainda não confirmada (produto/quantidade antes de Enter) não integra o rascunho.

Etapa 3 implementada: comparação Base × Otimizado com 10/50/100/150/200/300 itens. Etapa 4 implementada: IndexedDB, fila de autosave, recuperação e offline. Etapa 5 implementada: revisão, envio simulado, consulta, idempotência e erros. Etapa 6: refinamento com operadores reais.

Consulte `docs/VERIFICACAO-ETAPA-3.md` para resultados e limites de verificação. O benchmark de busca pura não comprova tempo visual abaixo de 50 ms.

## GitHub Pages

O workflow `.github/workflows/pages.yml` verifica e publica a branch `main`. Em Settings → Pages, a fonte deve ser **GitHub Actions**. Endereço previsto: https://kaue-cauin.github.io/pedidosAtram/

O build de publicação define `NEXT_PUBLIC_BASE_PATH=/pedidosAtram`; a execução local usa a raiz por padrão. Ao renomear o repositório ou usar domínio próprio, ajuste essa variável no workflow. Não há tokens, `.env.local` ou dados reais no processo de publicação.

## Diagnóstico da Etapa 3 (comparação anterior)

O comparativo anterior está em `/diagnostico-etapa3/`, acessível pelo diagnóstico principal. O laboratório usa um pedido separado: não substitui o pedido da tela principal.

- Escolha 10/50/100/150/200/300 linhas para testar manualmente o teclado.
- Clique **Executar comparação completa** e mantenha a aba visível. O modo padrão mede CPU e commit. A opção de medir quadros pode levar vários minutos em navegadores remotos. É possível interromper.
- Base desativa a memoização das linhas e recalcula os totais; Otimizado usa `React.memo`, callbacks estáveis e atualização incremental. É uma comparação controlada do mesmo componente, não uma reprodução byte a byte do build da Etapa 2.
- Busca e totais: 200 amostras de CPU. Operações: 10 amostras medidas após 2 aquecimentos. Commit mede do início da atualização ao `useLayoutEffect`; a medição opcional de frame usa dois `requestAnimationFrame`, aproximação de oportunidade de apresentação, não tempo exato de pintura nem latência física de teclado.
- Exportação JSON inclui amostras agregadas, navegador, data e tamanho da janela; não faz upload.
- Durante a execução os controles do pedido de teste ficam bloqueados. Ao terminar, seus itens e modo anteriores são restaurados.

A tabela mantém todas as linhas no DOM, com rolagem interna e cabeçalho fixo. Não há virtualização. Adicionar ou alterar quantidade preserva as referências das outras linhas; excluir no meio renumera as posteriores, que voltam a renderizar. O array ainda exige cópia/busca O(n), embora a atualização dos totais use apenas os itens alterados.

`npm run check:stage3 -- --report` regenera `docs/performance-node-etapa3.json`. O teste compara os totais incrementais a um cálculo independente após 10.800 alterações, incluindo quantidades fracionárias, descontos e exclusão de todas as linhas.

## Persistência e recuperação da Etapa 4

- A inclusão atualiza o modelo em memória e o DOM antes da gravação. `schedule()` só guarda uma referência ao último snapshot e agenda um timer; não serializa nem acessa IndexedDB na pilha do evento Enter.
- `services/autosave-queue.ts`: debounce de 250 ms, limite de espera de 1.000 ms durante digitação contínua, um único escritor e substituição dos snapshots pendentes pelo mais recente. Uma gravação lenta não impede alterações em memória; elas entram no próximo snapshot.
- `repositories/draft-repository.ts`: banco `atram-pedidos-v1`, store `drafts`, schema versão 2 (lê também os rascunhos da versão 1). “Salvo” só é emitido após `transaction.complete`; usa durabilidade estrita quando suportada. A revisão esperada é conferida atomicamente na mesma transação para impedir sobrescrita por outra aba.
- Ao reabrir, escolha o rascunho que deseja continuar. Começar outro pedido cria um UUID novo e mantém os anteriores. Os totais são reconstruídos a partir dos itens recuperados.
- Falha de gravação mantém o último snapshot pendente e apresenta erro, botão de nova tentativa e exportação JSON. Falha de leitura não substitui registros existentes; é possível continuar apenas em memória e exportar uma cópia.
- Ao ocultar/sair da página, a fila tenta gravar imediatamente. Se houver alterações pendentes, o navegador pode pedir confirmação ao sair. Fechamento forçado, queda de energia ou encerramento antes de “Salvo localmente” podem perder a janela ainda não confirmada: o que se recupera é a última transação concluída. Não prometemos gravação assíncrona garantida no encerramento.
- IndexedDB é local por origem/perfil de navegador. Limpar os dados do site, modo privado e políticas de espaço do navegador podem remover os rascunhos. A exportação produz uma cópia legível em JSON; ainda não há importação, backup remoto ou sincronização com servidor.

## Offline

O build gera `out/sw.js` com uma lista e versão derivadas dos recursos compilados. Instalação só termina quando HTML, JavaScript, CSS e demais arquivos necessários estiverem no cache. Aguarde **Aplicação disponível offline** antes de testar recarga sem rede. É preciso pelo menos um primeiro acesso online. O cache offline não roda no servidor de desenvolvimento; use o build de produção em HTTPS ou localhost.

A instalação busca HTML com versão na URL e ignora o cache HTTP; confere que os arquivos referenciados pertencem à mesma versão do build antes de armazenar. Assim, uma página antiga não é misturada a arquivos novos durante publicação.

Uma atualização fica aguardando e aparece como **Salvar e atualizar aplicação**. A atualização só é ativada depois de drenar a fila com sucesso, seguida de recarga. O service worker mantém também o cache anterior para arquivos de abas abertas. Nenhuma gravação do pedido depende do estado de conexão. Voltar à rede não envia nada ao ERP nesta etapa.

## Diagnóstico da Etapa 4

No topo de `/diagnostico/`:

1. **Comparar UI com autosave** repete 10/50/100/150/200/300 itens, com autosave desligado e ligado, para inclusão, quantidade, exclusão e carregamento. São 10 commits após 2 aquecimentos, com reset da fixture fora da amostra da UI. Mantém o debounce normal; amostras de gravação são contadas separadamente porque a fila agrupa alterações.
2. **Testar rede lenta e offline simulados** repete inclusão com os seis tamanhos e autosave ligado, junto de uma operação de rede simulada independente (0/50/100/300/1000 ms ou indisponível). O atraso dessa operação nunca é aguardado no fluxo de entrada. Não muda o estado físico de conexão do navegador.
3. **Atraso artificial de persistência** (0/50/100/300/1000 ms) torna o escritor lento, separadamente da rede. Permite digitar manualmente enquanto uma gravação espera. **Simular falha** mantém as alterações pendentes; desligue e tente salvar novamente.
4. **Testar falha e recuperação** confirma retenção do snapshot, nova tentativa, leitura por outra conexão e proteção contra duas gravações concorrentes da mesma revisão.
5. **Bloquear rede da aplicação para teste** faz o service worker devolver somente recursos em cache e bloquear recursos não armazenados com 503. O bloqueio permanece entre recargas e afeta as abas deste aplicativo. Abra o pedido, altere, aguarde salvo, recarregue e recupere. Reative a rede pelo diagnóstico ao terminar. Isso testa a aplicação sem acesso à rede, sem mudar as configurações do navegador.

Medições independentes: **UI** = modelo + React/DOM até `useLayoutEffect`, sem pintura; **IndexedDB** = transação até `complete`; **Persistência** = abertura + atraso artificial + transação; **Autosave** = última alteração enfileirada até conclusão, incluindo debounce/fila. Um autosave de ~250 ms não significa que Enter esperou 250 ms. Valores de CPU próximos de zero podem estar abaixo da resolução do relógio. O laboratório usa o banco separado `atram-diagnostico-etapa4-v1`.

**Testar digitação contínua (gravação 1 s)** faz 60 inclusões a partir de 300 itens, com intervalo de 50 ms e atraso de armazenamento de 1.000 ms. Registra gravações concluídas durante a entrada e inclusões enquanto o escritor estava ocupado; lê o último snapshot em outra conexão após terminar. **Salvar pendências agora** permite nova tentativa após desligar uma falha simulada.

O comparativo anterior Base × Otimizado continua disponível na página separada `/diagnostico-etapa3/`. Consulte `docs/VERIFICACAO-ETAPA-4.md` para evidências e limites dos testes desta etapa.


## Envio seguro da Etapa 5

Use **Revisar e enviar ao Mock ERP** ou Ctrl+Enter. A confirmação salva a identidade e a cópia imutável antes da criação; bloqueia alterações a partir desse momento. O seletor de cenário permite testar sucesso, HTTP 400/401/429/500 e os dois timeouts. Trata-se de simulação local, sem envio a um ERP real.

Se aparecer **Resultado desconhecido**, escolha **Consultar resultado no ERP**. Um timeout depois da criação recupera o recibo original. Um resultado não encontrado permite revisar e confirmar de novo com o mesmo `submissionId`; não há repetição automática. O mock mantém índices únicos por tentativa e pedido, em banco separado do rascunho.

`npm run check:stage5` verifica o protocolo. `/diagnostico-etapa5/` testa a matriz com IndexedDB real, conexões independentes, conflitos e falhas de gravação. Consulte `docs/VERIFICACAO-ETAPA-5.md` para resultados e limites. A integração real exigirá idempotência e consulta implementadas no servidor do ERP ou em um intermediário durável.
