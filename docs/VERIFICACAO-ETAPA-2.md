# Verificação — Etapa 2

Data: 07/10/2026. Escopo: autocomplete local, navegação por teclado implementada, inclusão, edição, duplicação, exclusão e totais em memória.

## Resultados executados

- Build de produção: aprovado (`npm run build`), exportação estática em `out/`.
- TypeScript: aprovado (`npm run typecheck`).
- Integridade dos dados: aprovada (`npm run check:data`): 900 produtos, 100 clientes, 5 vendedores, EANs e códigos únicos, totais da demonstração consistentes.
- Testes de busca e regras de entrada: aprovados (`npm run check:stage2`). Incluem 1.800 consultas exatas por código/EAN, trechos fora de ordem, acentos/maiúsculas, marca, ausência de resultados, limite de 12 sugestões, cliente, quantidade fracionária, rejeição de valores inválidos e desconto acima de 100%, total com desconto e roteiro de quatro inclusões.
- Roteiro `gran zero → 10`, `whey choc → 4`, `acucar coco → 12`, `far aveia → 5`: regras de dados confirmam 14 linhas, 106 unidades e R$ 1.999,80, incluindo as 10 linhas iniciais.

## Medição de busca

1.000 consultas no catálogo de 900 produtos, executadas em Node com `performance.now()`, índice já construído:

| Medida | Tempo |
|---|---:|
| Mediana | 0,037 ms |
| Percentil 95 | 0,147 ms |

São medições da função de busca, dependentes do ambiente. Não incluem eventos de teclado, React, pintura, layout ou construção inicial do índice. Não representam benchmark de latência percebida.

## Limites da verificação

A infraestrutura de navegador exigida pelo fluxo deste ambiente não está disponível. Não houve teste visual nem automação de teclado em navegador nesta entrega. Os checks de dados não comprovam os eventos de foco. O roteiro abaixo deve ser executado na prévia local antes da aprovação da ergonomia.

1. Nos tamanhos 1366×768, 1600×900 e 1920×1080, verificar posicionamento das sugestões e ausência de corte/rolagem horizontal da página.
2. F2, `mercado`, ↓/↑, Enter: cliente selecionado e foco em Produto.
3. Executar as quatro inclusões do roteiro; verificar foco em Quantidade após seleção e em Produto após inclusão.
4. Buscar por código, EAN e marca; Esc fecha sem selecionar; Tab acessa os demais campos.
5. Informar quantidade zero, texto inválido e desconto 101: nenhuma linha deve ser inserida.
6. Editar um item, alterar quantidade e aplicar; cancelar outra edição; duplicar e excluir. Conferir totais e foco.
7. Inserir 30–50 linhas seguidas para avaliação pelo operador. Quantificar os pedidos de 10/50/100/150/200/300 itens na Etapa 3.
8. Atualizar a página: retorna à demonstração, comportamento esperado até implementar persistência na Etapa 4.

## Decisões e riscos restantes

A busca e a edição não fazem chamadas de rede. A digitação está isolada em ItemEntry. Confirmar uma alteração atualiza o array de itens e recalcula os totais; não foi introduzida virtualização ou memoização sem medição. A atualização de toda a tabela e o cálculo linear dos totais são pontos a medir na Etapa 3, sem alegar desempenho constante com 200 itens.

O pedido permanece em memória; outras seções continuam demonstrativas. Nenhuma credencial real, envio ou conexão ao Tiny/Olist foi adicionada.
