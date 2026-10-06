# Atram Comercial — entrada de pedidos, Etapa 1

Entrega limitada à **estrutura visual, tela de pedido e dados fictícios**, conforme a instrução de executar somente a primeira etapa. Não é o MVP funcional completo e não deve receber pedidos reais.

## O que está disponível

- Interface original, inspirada na organização da referência: menu verde escuro, formulário, uma única linha de inserção, tabela central e painel de totais.
- 900 produtos ativos, 100 clientes, 5 vendedores e 3 listas de preço fictícios.
- Seleção de cliente e vendedor, campos de formulário e abas exploráveis.
- 10 itens de demonstração e totais calculados a partir dos dados: **75 unidades, R$ 1.247,90**. Os números da imagem não foram copiados porque não correspondiam à soma das linhas.
- Áreas de pagamento, transporte e observações. O detalhamento dos impostos pode ser expandido e permanece zerado.
- Estados desativados, com explicação, para salvar, pré-visualizar, enviar, adicionar, editar, duplicar, excluir e gerar parcelas.

O cliente é selecionado em uma lista simples nesta entrega. O campo de produto é somente a estrutura visual de um futuro autocomplete. Mudar a lista de preço nesta prévia não recalcula o pedido. Fretes, despesas e desconto geral são somente leitura para manter os totais coerentes com a demonstração.

**As alterações não são persistidas. Atualizar a página restaura os dados de demonstração.** Não existe envio, conexão com Tiny/Olist ou simulação de salvamento.

## Requisitos e execução

- Node.js **24 LTS** (o gerador e as verificações usam suporte nativo a TypeScript).
- npm e as versões fixadas no `package-lock.json`.
- Navegador atual. Prioridade de layout: desktop e notebook.

```bash
npm ci
cp .env.example .env.local
npm run dev:next
```

Acesse o endereço indicado pelo comando. `dev:next` usa o Next.js padrão. `npm run dev` é a prévia supervisionada opcional do ambiente, usando Vinext. Para uma versão estática de produção:

```bash
npm run typecheck
npm run check:data
npm run build
```

A saída estática fica em `out/`. É possível hospedá-la em qualquer servidor de arquivos estáticos. Não há backend de negócio, banco de dados ou segredo necessário nesta etapa.

## Stack

TypeScript, React, Next.js (App Router), Tailwind CSS e componentes acessíveis Radix/Shadcn já fornecidos na base do projeto. Os ícones são do Lucide. O manifesto e o lockfile registram as versões exatas. A ferramenta Vinext do ambiente de prévia também está presente na base; a versão de produção usa o build estático do Next.js.

## Estrutura de código

```text
app/                       Página, layout pt-BR, estilos e metadados
components/order/          Componentes específicos da tela de pedido
components/ui/             Primitivas acessíveis fornecidas pelo starter
domain/mock-data.ts        Geração determinística dos dados fictícios
domain/totals.ts           Totalização da demonstração
types/order.ts             Modelos de produto, cliente, item e pedido
integrations/ERPProvider.ts Contrato reservado para integrações futuras
utils/format.ts            Formatação brasileira de dinheiro e peso
scripts/check-mock-data.mjs Verificação de integridade dos dados
scripts/export-mock-data.mjs Exportação opcional do catálogo e cadastros
```

Os arquivos adicionais `build/`, `scripts/`, `lib/`, `db/` e `hooks/` trazem infraestrutura da base de hospedagem. Recursos de banco e conectores dessa base não são usados pela aplicação. Não foram criados serviços, repositórios ou hooks de negócio vazios.

## Decisões de arquitetura

1. **Componentes:** `OrderWorkspace` compõe a navegação, cabeçalho, dados, cliente, datas, itens, resumo e abas. `ItemEntry` é isolado para receber o autocomplete na Etapa 2. `ItemRow` contém somente células e ações visuais.
2. **Dados:** valores monetários em centavos, pesos em gramas e descontos em pontos-base (100 = 1%). O pedido tem UUID, `submissionId` reservado e os estados conceituais pedidos no documento. O UUID atual é apenas da fixture; pedidos novos deverão receber `crypto.randomUUID()`.
3. **Estado:** estado React local somente onde a visualização depende dele (cliente, seletores, abas); campos simples mantêm seu valor no DOM. Não há estado global ou requisição durante a edição dos campos.
4. **Busca futura:** o catálogo está disponível localmente. Na Etapa 2, normalizar texto uma vez e procurar todos os termos por nome, código, EAN e marca, sem rede.
5. **Renderização futura:** isolar a digitação em `ItemEntry`; introduzir estado de pedido e referências estáveis ao implementar inclusão. Memoização e virtualização dependerão das medições da Etapa 3.
6. **IndexedDB futuro:** repositório local, fila em background, recuperação e indicador honesto de estado na Etapa 4. Nada disso está implementado ou garantido agora.
7. **ERPProvider:** somente a interface tipada foi preparada. `MockERPProvider` será implementado na Etapa 5. Um futuro `TinyERPProvider` deverá respeitar a mesma fronteira, com OAuth2 e segredos no backend. A interface visual não deve conhecer endpoints ou payloads específicos do Tiny.
8. **Performance:** medições de autocomplete, inclusão, edição, exclusão, renderização e totais com 10/50/100/150/200/300 itens pertencem às Etapas 2–3. Não há resultados inventados ou alegação de resposta abaixo de 50 ms nesta entrega.

## Dados fictícios

Os 900 produtos são gerados deterministicamente: 30 alimentos × 10 marcas fictícias × 3 tamanhos. Os EANs usam prefixo interno 200 e dígito verificador correto; não representam códigos comerciais registrados. Os documentos dos clientes usam um marcador inválido, para evitar dados pessoais reais. Nomes, preços, pesos e vendedores são fictícios.

Os dados são gerados ao carregar o módulo; não é necessário executar seed ou banco. Para obter um JSON inspecionável:

```bash
npm run mock:export
```

Saída: `outputs/mock-data.json` (ignorada pelo Git, regenerável).

## Verificações e próximos testes

```bash
npm run check:data
npm run typecheck
npm run build
```

O check de dados verifica contagens, unicidade de IDs/códigos/EANs, dígitos verificadores, preços/pesos, referências e consistência dos totais de demonstração. Consulte `docs/VERIFICACAO-ETAPA-1.md` para os resultados efetivamente obtidos.

Checklist visual: 1920×1080, 1600×900 e 1366×768; legibilidade de campos e tabela; acesso às abas; seleção dos clientes; foco visível; zoom de 200%; ausência de rolagem horizontal na página (tabela e abas têm contenção própria quando necessário).

**Como testar 200 itens:** ainda não aplicável. Nesta etapa a tabela tem 10 linhas estáticas e o botão Adicionar está desativado. Na Etapa 2 será entregue o fluxo Produto → Enter → Quantidade → Enter. Na Etapa 3 será adicionada uma ferramenta para carregar as seis quantidades de teste e registrar tempos reais. A tabela atual não foi submetida a benchmarks de pedidos grandes.

## Sequência acordada

- Etapa 1: esta entrega.
- Etapa 2: autocomplete local, teclado e inclusão/correção de itens.
- Etapa 3: tabela grande, totalização incremental e medições reais.
- Etapa 4: autosave, IndexedDB, recuperação e offline.
- Etapa 5: provider mock, revisão e simulação de envio/erros.
- Etapa 6: refinamentos de ergonomia com uso real.

A integração real com Tiny/Olist depende da aprovação posterior do MVP. Não está iniciada.
