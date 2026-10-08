# Etapa 5 — revisão, Mock ERP e idempotência

## Contrato e fluxo

A confirmação passa por uma revisão explícita. O pedido ganha um `submissionId` aleatório e uma cópia canônica imutável de todos os dados comerciais. O estado `SUBMITTING`, a identidade e a cópia são gravados no rascunho antes de qualquer chamada de criação. A fila de autosave mantém um único escritor; a confirmação aguarda a transação completa. Uma falha nessa barreira impede a chamada ao ERP.

A digitação continua em memória durante a elaboração. Canonização, validação do envio e chamadas ao mock acontecem apenas na revisão/confirmação. Após a primeira confirmação, os campos e itens ficam bloqueados, inclusive em `ERROR`. Essa escolha conservadora evita corrigir um conteúdo que talvez já tenha sido aceito. Para trabalhar em outro pedido, reabra a aplicação e escolha começar um novo exemplo; o registro anterior é preservado.

O MockERPProvider usa um banco IndexedDB separado do rascunho. Uma transação atômica tem índices únicos por `submissionId` e por `orderId`. Repetir a mesma identidade e o mesmo conteúdo retorna o recibo existente. Mudar o conteúdo ou gerar outra identidade para o mesmo pedido causa conflito, sem substituir o recibo.

| Situação | Estado inicial | Próximo passo |
|---|---|---|
| Sucesso | SUBMITTED | Recibo persistido, pedido bloqueado |
| HTTP 400/401 | ERROR | Revisão e confirmação da mesma tentativa |
| HTTP 429 | ERROR | Respeitar Retry-After, revisar a mesma tentativa |
| HTTP 500 | UNKNOWN | Consultar antes de tentar novamente |
| Timeout antes da criação | UNKNOWN | Consultar; se não encontrado, confirmar com a mesma identidade |
| Timeout após criação | UNKNOWN | Consultar e recuperar o recibo; nenhuma nova criação |
| Reload com SUBMITTING | SUBMITTING | Consultar o resultado; reenvio bloqueado |
| Falha ao persistir antes da chamada | Sem chamada ao ERP | Salvar/exportar e recuperar antes de continuar |
| Falha ao persistir depois da aceitação | SUBMITTING durável | Recuperar e consultar o recibo |

Consultar nunca cria pedidos. Uma consulta indisponível mantém `UNKNOWN`. Um resultado não encontrado permite uma confirmação manual, sem gerar outra identidade. Toda repetição consulta primeiro; não há reenvio automático. O bloqueio de operação impede duplo clique na mesma sessão; revisão de armazenamento impede sobrescrita por uma aba desatualizada. Os índices do mock também protegem chamadas em conexões independentes.

## Persistência e compatibilidade

Rascunhos da Etapa 4 (`schemaVersion: 1`) permanecem legíveis. Novas gravações usam envelope 2. Registros congelados são validados contra a cópia canônica e não podem trocar de identidade, conteúdo ou regredir de SUBMITTED. Dados inválidos não são substituídos silenciosamente. O envio fica indisponível quando o operador escolhe trabalhar apenas em memória.

## Verificação

`npm run check:stage5`: 93 verificações, incluindo matriz de sete cenários, recuperação do estado durável, 100 chamadas concorrentes, conflito de conteúdo/identidade, HTTP 500 após commit, chegada tardia após consulta não encontrada, offline, revisão alterada e falhas antes/depois da aceitação. Resultado em `verificacao-protocolo-etapa5.json`.

As verificações anteriores de dados, entrada rápida, totais, fila e offline continuam executadas no CI. A compilação estática inclui `/diagnostico-etapa5/` no cache offline. O diagnóstico da Etapa 5 executa a matriz em IndexedDB real, recupera registros em nova conexão, repete 20 chamadas por caso em conexões independentes e tenta sobrescritas conflitantes. Testa também falhas locais antes/depois da chamada. O relatório pode ser baixado pela própria tela.

## Limites do alcance

Este é um ERP simulado no navegador; nenhum ERP real é chamado. A garantia vale enquanto seu registro de recibos é preservado. Limpar armazenamento, trocar de perfil/dispositivo ou remover esse banco elimina a memória de idempotência do mock. Uma integração real deverá implementar o contrato no servidor: identidade durável, unicidade atômica, vínculo com conteúdo e consulta confiável. Uma aplicação de navegador, isoladamente, não pode garantir ausência de duplicação em um ERP que não ofereça esse contrato.

A revisão guarda uma cópia adicional do pedido apenas no momento da confirmação. A elaboração conserva o caminho de inclusão em memória e a fila de autosave da Etapa 4. As limitações de gravações ainda pendentes no fechamento forçado e de armazenamento local descritas na Etapa 4 continuam válidas.


## Evidências da versão publicada

Na versão `1ddd516`, a matriz em Chrome 154 passou em 76 verificações com IndexedDB real. Sete cenários terminaram em SUBMITTED com a mesma identidade; os dois casos de falha na persistência também recuperaram corretamente. O relatório está em `verificacao-browser-etapa5.json`. A criação concorrente antes de qualquer recibo também passou: 20 chamadas com a mesma identidade retornaram um único recibo; 20 identidades diferentes para o mesmo pedido aceitaram apenas uma, preservando o índice único.

Teste manual pela interface: pedido `ETAPA5-TIMEOUT-APOS`, dez itens. Confirmação com timeout após criação → UNKNOWN; reenvio desabilitado e campos inertes. Refresh e recuperação mantiveram `cbd970a9-de24-493b-9cb9-f262392745b4`. Consulta → SUBMITTED e recibo `MOCK-aae3a4cb-9c59-4921-82cb-7c55de457bc3`; novo refresh preservou ambos. A captura desse resultado foi anexada privadamente, sem publicação no repositório público.

Repetição do laboratório de entrada na versão da Etapa 5, autosave ligado, dez amostras por operação após aquecimento:

| Itens | Inclusão UI p95 (ms) | IndexedDB p95 (ms) | Autosave p95 (ms) | Recuperação |
|---:|---:|---:|---:|---|
| 10 | 2,4 | 1,3 | 251,7 | OK |
| 50 | 0,7 | 1,5 | 251,9 | OK |
| 100 | 0,8 | 1,5 | 253,4 | OK |
| 150 | 1,4 | 1,6 | 251,9 | OK |
| 200 | 0,9 | 2,5 | 252,8 | OK |
| 300 | 0,8 | 3,7 | 259,3 | OK |

O relatório completo `performance-browser-etapa5.json` contém inclusão, quantidade, exclusão e carregamento, com autosave ligado/desligado. A UI mede modelo e commit React/DOM até useLayoutEffect; não mede pintura ou a latência física do teclado. O laboratório compartilha os componentes de entrada e o repositório, mas tem sua própria fixture; não mede todos os elementos da página principal. A cópia imutável do envio não é produzida por esse caminho de digitação.

Os novos módulos de envio passam no ESLint. O lint global ainda aponta regras React de referências em renderização e atualização em efeito nos componentes existentes da Etapa 4 (`use-draft-order`, `persistence-lab`, `use-offline`); não é um check do CI e não foi apresentado como aprovado. Typecheck, build e os testes de cada etapa são os checks executados no CI.
