# Pendências comerciais e operacionais

Data: **08/10/2026**. **Estado atual: implementação concluída e prova operacional de OAuth/leitura aprovada para os cinco recursos testados**, com base na evidência fornecida pelo responsável. Validação comercial completa e infraestrutura definitiva continuam pendentes. A entrega inicial precedeu essa homologação; seu histórico está identificado abaixo. Evidência: [HOMOLOGACAO-REAL.json](HOMOLOGACAO-REAL.json).

Nenhuma regra comercial foi deduzida dos mocks ou do schema. Não houve mudança de preços ou unidades do MVP.

| Pendência | Decisão/evidência necessária | Impacto futuro |
|---|---|---|
| Preço base versus promocional | Comercial e configuração ERP | Não escolher preço automaticamente |
| Lista por cliente, desconto e precedência de exceção | Comercial + GETs autorizados/suporte | Não inferir pela existência de tabela |
| Override por vendedor e alçadas | Política da empresa | Não autorizar preço arbitrário |
| Unidade UN/CX/KG/pacote e múltiplo/mínimo | Cadastro real, fornecedor e comercial | Evolução de Product deliberada; não converter ainda |
| Peso bruto/líquido e unidade física | Evidência administrativa/contrato ERP | Não supor kg→gramas |
| Escala monetária, quantidade e arredondamento | Comercial/financeiro + ERP | Não introduzir centavos ou casas decimais sem regra |
| Elegibilidade de contatos como clientes | Tipos da conta e política comercial | Não vender para todo contato ativo |
| Pagamento, parcelas, banco, categoria, natureza/frete | Financeiro/operação | Resolver IDs e semântica antes de envio |
| Idempotência, unicidade e reconciliação | Garantia oficial/processo conservador | UNKNOWN bloqueado; sem promessa exactly-once |
| Plano/quotas e permissões mínimas para fases futuras | Administrador/técnico | OAuth/callback e cinco GETs homologados na sessão fornecida; plano e quotas exatos não demonstrados |

Recomendação para 7B.2 — backend operacional, autenticação e PostgreSQL: após aprovação explícita, reutilizar a prova de OAuth/GETs relatada e os módulos isolados, evoluir autorização por organização e autenticação de operadores, mantendo tokens somente no backend e nenhuma escrita real no Tiny. A política comercial e mapeamentos completos ficam na 7B.3. Não promover o servidor local Basic ou gates de ambiente a backend definitivo sem revisão. Cache e sincronização deverão preservar a inclusão em memória e testes 10/50/100/150/200/300 com autosave e rede lenta/offline. PostgreSQL, sincronização completa, pedidos reais e migração não fazem parte da 7B.1. **Parar ao concluir esta subetapa.**

## Pendências atualizadas após a prova real

Leitura confirmada não resolve política comercial. Dez produtos classificados como other exigem identificar unidades reais, normalização sem conversões presumidas e preservação da apresentação comercial. Preço promocional presente não demonstra promoção ativa. Três listas da amostra exigem confirmar regra de acréscimo/desconto, associação ao cliente, exceções, combinação com promoções e arredondamento. Sete contatos com vendedor null não são prova de sete clientes sem vendedor: identificar elegibilidade e vínculo por IDs, com regra explícita para cliente sem vendedor.

Mapeamentos de produto/cliente, associação de vendedor e listas estão **parcialmente validados estruturalmente**, sem aprovação comercial completa. Detalhes de produto/lista, pesos e conversões, preço efetivo por cliente, condições de pagamento e regras de desconto continuam pendentes para 7B.3. Nenhum cálculo definitivo adicionado.

7B.1 aprovada para autenticação/leitura dos cinco recursos; infraestrutura definitiva, multiusuário, PostgreSQL, ledger, criação/idempotência/reconciliação reais não homologados. UNKNOWN deve continuar conservador em fases futuras. **7B.2 não iniciada.**
