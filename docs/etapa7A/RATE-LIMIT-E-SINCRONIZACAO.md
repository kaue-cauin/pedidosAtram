# Rate limit e sincronização

Verificado em **08/10/2026 (UTC)**. Escopo: descoberta documental; nenhuma chamada autenticada nem escrita no ERP. “Confirmado” significa publicado na fonte oficial, não homologado na conta Atram.

## Limites publicados versus conta Atram

Fontes: [limites V3](https://api-docs.erp.olist.com/documentacao/comecando/limites-de-consulta), [tabela de planos na ajuda](https://ajuda.olist.com/hubs-e-plataformas-via-api/aplicativos-api-v3-configuracoes-e-utilizacao) e OpenAPI selecionado. Limites são por minuto, separados por leitura/escrita e **compartilhados por conta entre aplicativos**.

| Plano(s) publicado(s) | GET/min | Escritas/min |
|---|---:|---:|
| Construa / Crescer | 30 | 30 |
| Parceiros | 30 | 30 |
| Evoluir / Impulsione | 60 | 60 |
| Domine | 120 | 100 |
| Protagonize / Potencializar | 140 | 100 |

Esses números são referência publicada, **não limite confirmado da Atram**. Plano, extensão, módulos, consumo por outros aplicativos e quotas efetivas pendentes. A documentação define `X-RateLimit-Limit` por minuto, `X-RateLimit-Remaining` saldo e `X-RateLimit-Reset` segundos até reset. `/info` examinado não contém quota/consumo. Ajuda e schema não coincidem nesse ponto.

Código específico 429 não consta nas respostas selecionadas do Swagger; a página de limites afirma erro ao exceder, sem fixar código. Tratar 429 defensivamente, mas marcar comportamento efetivo **NÃO CONFIRMADO**. `Retry-After` não confirmado; usar quando presente/válido, senão headers X-RateLimit e backoff com jitter e teto. Não interpretar Reset como epoch. Sem headers confiáveis, pausar de modo conservador. Escritas em 7A: **zero**, inclusive no CI.

## Capacidade planejada: dez operadores

Hipóteses de dimensionamento, não medições: página de 100 (default, máximo ainda desconhecido), 900 produtos, 1.000 contatos, 100 vendedores, 100 listas; um detalhe por produto para marca/pesos; um detalhe por lista. Uma sincronização central atende todos os dez operadores. Dígitos, pesquisa e inclusão: **0 chamadas ERP**. Manter reserva para outros aplicativos, reconciliação e falhas.

| Atividade central | GETs estimados | Frequência de planejamento |
|---|---:|---|
| Listas iniciais produtos + contatos | 9 + 10 = 19 | Uma carga completa |
| Vendedores + listas | 1 + 1 = 2 | Uma carga completa |
| Detalhes produtos + listas | 900 + 100 = 1.000 | Inicial; reduzir por mudanças comprovadas |
| Depósitos/envio/recebimentos | Não estimado sem tamanho da conta | Após definir campos indispensáveis |
| Incremental exemplo: 30 produtos + 20 contatos + detalhes | 2 páginas + 30 + 20 = 52 | Por ciclo de 15 minutos, média 3,47/min |
| Dez operadores digitando | 0 | Sempre local |
| Consulta de envio ambíguo | 2–3 por investigação como hipótese | Prioridade e teto próprios; não garantia |

Se apenas 50% da quota publicada ficar disponível para integração: carga de 1.021 GETs exige pelo menos 68,1 min com orçamento 15/min; 34,1 min a 30/min; 17,1 min a 60/min; 14,6 min a 70/min. São mínimos teóricos sem latência/retries/demais cadastros; não prometer tempo real. Ler quotas efetivas e coordenar orçamento no backend, concorrência inicial baixa (1–2 GETs), prioridades e custo por endpoint. Não multiplicar 52 chamadas por dez operadores; média não autoriza burst de 52 num minuto. Ajustar ciclo e carga se outros apps consumirem reserva.

## Contratos de paginação/incremental

| Recurso | Página | Atualização / ordenação | Inativos/exclusões e limite |
|---|---|---|---|
| Produtos | limit/offset; itens+paginacao | dataCriacao, dataAlteracao; sem orderBy | situacao A/I/E; máximo e cobertura de delete físico não confirmados |
| Contatos | limit/offset; itens+paginacao | dataCriacao, dataAtualizacao; orderBy asc/desc sem chave declarada | B/A/I/E; máximo e delete físico não confirmados |
| Vendedores/marcas/listas | limit/offset | Sem filtro de atualização/ordenação nos GETs selecionados | Reconciliação completa; status varia por DTO |
| Recebimentos/pagamento/envio | Seguir parâmetros de cada rota no mapa | Não assumir incremental | Habilitado/desabilitado conforme DTO; inconsistência query situação envio |
| Depósitos | Array direto; sem paginação declarada | Sem incremental | Ver ativo/situação no DTO; não assumir envelope |
| Estoque | limit/offset | dataAlteracao com >= explicitamente descrito | Não substitui inventário nem confirma reserva |
| Pedidos | limit/offset | dataInicial, dataFinal, dataAtualizacao; orderBy direção | Consulta por referência; não usar como catálogo por tecla |

Página máxima, timezone, granularidade, semântica de intervalo das datas, empate de ordenação, snapshot/cursor e estabilidade durante paginação **NÃO CONFIRMADOS**. O default 100 não é máximo 100. `paginacao.total` é observado por resposta, não contrato de snapshot. Registro pode mudar enquanto páginas são lidas; offset pode pular/repetir. Deduplicar por ID resolve repetições, não omissões.

## Projeto conceitual

Inicial: backend coleta páginas em área staging, observa orçamento, valida envelope/IDs/status/preço e detalhe, deduplica e verifica cobertura; publica snapshot versionado por ativação atômica apenas após completar a carga. No navegador, receber snapshot e criar índices locais em background, manter última versão íntegra. Campos sem dados necessários vão para quarentena. Se carga falhar, não apagar catálogo vigente.

Posterior: filtros de atualização com janela sobreposta conservadora (valor a definir após confirmar timestamp), watermarks só após ciclo completo e detalhes validados; atualizar tombstones I/E, preservar hash/versionamento. Sem snapshot consistente, declarar incremental como melhor esforço e fazer reconciliação completa periódica com orçamento. Cadastros sem filtro usam comparação completa de IDs/conteúdo. Ausência numa página falha não exclui cadastro; remoção por ausência exige varredura integral bem-sucedida e confirmação da semântica de exclusão. Manter rascunhos/tentativas referenciando versão antiga até revisão.

## Webhooks confirmados, cobertura limitada

[Webhooks oficiais](https://api-docs.erp.olist.com/documentacao/webhooks/webhooks): extensão Webhooks em planos específicos; configurar por conta, não por aplicativo. Eventos publicados: vendas criadas/alteradas, pedido enviado, lançamentos de estoque e notas autorizadas. ACK 200 e até dez tentativas com espera progressiva em incrementos de cinco minutos. **Não há webhook de atualização geral de produto/cliente confirmado nessa página**.

Payload, assinatura/autenticação de origem, identificador único, ordem e disponibilidade no plano Atram NÃO CONFIRMADOS. Tratar evento como pista; deduplicar e buscar estado via GET com orçamento. Não confiar evento sem autenticação, não usá-lo para liberar nova criação por ausência e não enviar segredos na URL. Não configurar webhook em 7A. “Gatilhos” de estoque/financeiro do ERP são outro recurso, não webhook.
