# Verificação da Etapa 1

Data: 02/10/2026. Escopo: estrutura visual e dados fictícios.

| Verificação executada | Resultado |
|---|---|
| Integridade de 900 produtos, 100 clientes, 5 vendedores e 3 listas | Aprovada |
| IDs/códigos/EANs únicos e dígitos verificadores dos EANs | Aprovada |
| Preços positivos em centavos e pesos coerentes em gramas | Aprovada |
| 10 itens: soma de 75 unidades e R$ 1.247,90 | Aprovada |
| Pesos do pedido: bruto 39,465 kg e líquido 36,405 kg | Aprovada |
| TypeScript (`tsc --noEmit`) | Sem erros |
| Build de produção Next.js 16.3.4 | Concluído; exportação estática em `out/` |
| Lista de cliente: seleção de Mercado Exemplo 2 | Nome e cidade atualizados para Santo André – SP |
| Aba Transportador / Volumes | Campos visíveis e controles disponíveis |
| Observações internas: mudar de aba e voltar | Texto mantido durante a sessão |
| Ações de etapas futuras | Desativadas, sem falso salvamento/envio |

## Conferência do layout

A prévia foi inspecionada no navegador usando um contêiner iframe temporário com cada dimensão. Não foi redimensionado o monitor físico. As capturas foram escaladas somente para observação; as dimensões internas foram verificadas pelo DOM. O contêiner de teste foi removido antes do build de produção.

| Viewport interno | Largura do documento | Resultado |
|---|---:|---|
| 1366 × 768 | 1351 px | Sem overflow horizontal da página; campos, linha de inserção e total visíveis |
| 1600 × 900 | 1585 px | Sem overflow horizontal da página; tabela com largura de 1027 px |
| 1920 × 1080 | 1905 px | Sem overflow horizontal da página; formulário e painel lateral legíveis |

Os 15 px de diferença são a barra de rolagem vertical. A página tem rolagem vertical para alcançar todos os 10 itens e as abas. Tabela e abas possuem área própria de rolagem horizontal em larguras menores. Não foi executada auditoria completa de acessibilidade nem teste de zoom de 200%.

A conferência de interação usou a prévia de desenvolvimento. O build estático do Next.js foi compilado separadamente com sucesso. Não se trata de um ensaio de carga nem de um benchmark de produção.

## Fora do escopo, por solicitação do usuário

- Autocomplete e fluxo Produto → Enter → Quantidade → Enter: Etapa 2.
- Inclusão/edição de itens e medições com 10, 50, 100, 150, 200 e 300 linhas: Etapas 2–3.
- Autosave, IndexedDB, recuperação de pedido e offline: Etapa 4.
- MockERPProvider, modal de revisão, envio e erros simulados: Etapa 5.
- Integração Tiny/Olist: não iniciada.

Não há métricas de latência ou garantias de performance com 200 itens nesta entrega. O teste de dados valida integridade; não mede velocidade percebida.
