# Pendências comerciais e operacionais

Data: **08/10/2026**. Implementação e testes locais com dados sintéticos. **Nenhuma autenticação ou consulta de dados reais executada. Homologação operacional PENDENTE.**

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
| Conta, plano, usuário, ambiente/callback e autorização | Administrador/técnico | Homologação 7B.1 bloqueada até confirmação |

Recomendação para 7B.2: após aprovação explícita e homologação de OAuth/GETs reais, reutilizar os módulos de transporte/configuração/validação parcial, evoluir autorização/sessões de produção e planejar catálogo por snapshots. Não promover o servidor local Basic ou gates de ambiente a backend definitivo sem revisão. Cache e sincronização deverão preservar a inclusão em memória e testes 10/50/100/150/200/300 com autosave e rede lenta/offline. PostgreSQL, sincronização completa, pedidos reais e migração não fazem parte da 7B.1. **Parar ao concluir esta subetapa.**
