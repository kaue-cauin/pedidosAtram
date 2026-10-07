# Atram Comercial — entrada rápida de pedidos, Etapa 2

Esta versão continua a Etapa 1 e implementa autocomplete local, navegação por teclado e inclusão/correção dos itens. Os dados são fictícios. **Atualizar a página descarta as alterações desta sessão.** Autosave e recuperação serão implementados na Etapa 4; não há integração com Tiny/Olist.

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
npm run build
```

O build Next.js exporta a aplicação estática para `out/`. Para servir a prévia compilada, se Python estiver instalado: `python -m http.server 8000 --directory out`; abra http://localhost:8000. Não abra `index.html` diretamente como arquivo.

## Teste do fluxo

1. Pressione F2, digite `mercado`, navegue com ↑/↓ e pressione Enter. O foco irá para Produto.
2. Digite `gran zero`, Enter, `10`, Enter.
3. Digite `whey choc`, Enter, `4`, Enter.
4. Digite `acucar coco`, Enter, `12`, Enter.
5. Digite `far aveia`, Enter, `5`, Enter.
6. Confira os itens e os totais. Após cada inclusão, Produto recebe o foco e a quantidade volta a 1.

Com os primeiros resultados do catálogo Padrão e os 10 itens iniciais, esse roteiro termina em **14 linhas, 106 unidades e R$ 1.999,80**.

- F4 foca Produto em qualquer parte da tela.
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
- `OrderWorkspace`: estado dos itens em memória. A digitação fica dentro de `ItemEntry`; somente confirmar uma alteração atualiza a tabela e o resumo.
- `domain/totals.ts`: cálculo local ao alterar itens. A totalização ainda percorre as linhas; medições e eventual estratégia incremental pertencem à Etapa 3.
- `domain/mock-data.ts`: 900 produtos, 100 clientes, 5 vendedores e 3 listas de preço. Gerados deterministicamente ao carregar o módulo. `npm run mock:export` exporta JSON para `outputs/`.
- `integrations/ERPProvider.ts`: contrato reservado. MockERPProvider/envio na Etapa 5; TinyERPProvider somente em fase futura.

Preservada a stack e o lockfile da Etapa 1: React, TypeScript, Next.js, Tailwind e componentes do starter. Nenhuma dependência nova. A infraestrutura opcional de Vinext/hospedagem já existente não é necessária para executar `dev:next`.

## Limites e sequência

Campos gerais e abas continuam demonstrativos. Lista de preço não recalcula preços; frete/despesas/desconto geral permanecem fixos. Salvar, pré-visualizar pedido e enviar continuam desativados. Ctrl+S e Ctrl+Enter não foram interceptados enquanto essas ações não existem. O autocomplete não usa rede; isso não garante recarga da aplicação offline, que pertence à Etapa 4.

Etapa 3: medir inclusão, edição, exclusão, renderização e totais com 10/50/100/150/200/300 itens. Etapa 4: IndexedDB, fila de autosave, recuperação e offline. Etapa 5: revisão/envio simulado e erros. Etapa 6: refinamento com operadores reais.

Consulte `docs/VERIFICACAO-ETAPA-2.md` para resultados e limites de verificação. O benchmark de busca pura não comprova tempo visual abaixo de 50 ms nem desempenho constante da tabela.

## GitHub Pages

O workflow `.github/workflows/pages.yml` verifica e publica a branch `main`. Em Settings → Pages, a fonte deve ser **GitHub Actions**. Endereço previsto: https://kaue-cauin.github.io/pedidosAtram/

O build de publicação define `NEXT_PUBLIC_BASE_PATH=/pedidosAtram`; a execução local usa a raiz por padrão. Ao renomear o repositório ou usar domínio próprio, ajuste essa variável no workflow. Não há tokens, `.env.local` ou dados reais no processo de publicação.
