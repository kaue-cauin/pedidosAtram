# Contratos observados: separar simulação e conta real

Data: **08/10/2026**. **Estado atual: implementação concluída e prova operacional de OAuth/leitura aprovada para os cinco recursos testados**, com base na evidência fornecida pelo responsável. Validação comercial completa e infraestrutura definitiva continuam pendentes. A entrega inicial precedeu essa homologação; seu histórico está identificado abaixo. Evidência: [HOMOLOGACAO-REAL.json](HOMOLOGACAO-REAL.json).

O OpenAPI foi novamente obtido por GET público e comparado byte a byte por SHA-256 com a evidência 7A: **sem mudança**. Versão 3.1; 1.233.619 bytes; hash `4790f92277550d2b5999449f8bfd37cb8648fc9b12f6a1b464a6d135a6a818fd`. Fonte: https://erp.tiny.com.br/public-api/v3/swagger/swagger.json. [Recorte e matrizes da 7A](../etapa7A/MAPA-API-V3.md) continuam válidos documentalmente. Na entrega inicial não houve comparação com respostas reais; a validação posterior dos campos selecionados está registrada abaixo.

| Recurso/campos | Contrato documental | Teste local | Observação real |
|---|---|---|---|
| Produto id/sku/gtin/descricao/unidade/situacao/tipo/precos | Lista; GTIN/SKU textuais | Zeros preservados; number no GTIN reporta incompatibilidade; UN/outros/ausente separados | 10 registros compatíveis; unidades other=10 |
| Marca/pesos/variações | Somente detalhe e DTOs referenciados | Campos inspecionados sem conversão ou projeção para Product | PENDENTE |
| Cliente id/nome/codigo/situacao/tipos/vendedor/cidade/UF | Lista de contatos e referências | Tipos dos campos selecionados, contagens e redaction | 10 contatos compatíveis; vendedor null em 7 |
| Vendedor | ID + contato e situação | Inspeção parcial da estrutura sem nome no relatório | 10 registros compatíveis; acesso confirmado |
| Lista | id/descricao/acrescimoDesconto | Inspeção de tipos, sem preço comercial derivado | 3 registros da primeira página compatíveis |
| Lista detalhe | excecoes objeto pelo schema | Array sinaliza PRICE_EXCEPTIONS_CARDINALITY | PENDENTE |
| Empresa | cpfCnpj e identificação | Conta divergente bloqueia catálogo sem expor documento | 1 registro compatível e conta verificada |

A inspeção é uma **projeção estrutural parcial**, não um validador integral gerado de todos os DTOs. Campos não marcados required podem estar ausentes: o relatório distingue missing de null e tipo errado. IDs ausentes/inválidos impedem compatibilidade da amostra para os recursos de cadastro por requisito da POC, sem alegar required do ERP. Página vazia é válida, mas não fornece amostra de produto/contato. Envelope inválido, offset não zero ou mais de dez itens é bloqueado. Não inferir máximo de página 10: dez é limite voluntário desta POC.

## Conflitos documentais ainda não resolvidos

- Produto detalhe combina enums distintos para tipo em allOf (P/S versus K/S/V/F/M); a inspeção aceita união para observação e registra PRODUCT_TYPE_ALLOF_AMBIGUOUS, sem resolver semântica.
- Filtro GTIN integer versus retorno textual: POC não usa esse filtro nem converte EAN.
- Lista detalhe declara excecoes objeto, sem confirmar cardinalidade/retorno real.
- Ajuda anuncia consumo em info, mas schema examinado não tem esse campo; observar somente headers documentados.
- Situação de envio e número do pedido têm inconsistências já mapeadas; recursos não consultados pela POC.
- Unidade dos pesos, casas decimais, vigência de preços, lista por cliente e elegibilidade de contato não se comprovam por tipos de campo.

O modelo Product atual permanece unit='UN'; não foi ampliado com suposição. A POC conta UN/outros/ausentes sem publicar texto arbitrário de unidade. Unidades específicas de outros produtos deverão ser confirmadas em inspeção segura/administrativa antes da evolução comercial na 7B.3. Não há conversão para caixa/kg/gramas nem regra para escolher promoção.

## Descobertas reais nas amostras — 08/10/2026

Evidência fornecida pelo responsável, [HOMOLOGACAO-REAL.json](HOMOLOGACAO-REAL.json). Os cinco recursos não apresentaram incompatibilidades nas **regras parciais selecionadas**: não é validação integral de DTOs nem de regras comerciais. Presença e null são conceitos distintos; não preencher contagens de null não fornecidas.

- **Empresa:** razaoSocial, cpfCnpj e fantasia presentes na amostra de um registro; comparação do documento esperado aprovada no servidor. Nenhum valor desses campos publicado.
- **Produtos:** dez registros com id, sku, gtin, descricao, unidade, situacao, tipo, precos, precos.preco e precos.precoPromocional presentes, zero IDs ausentes e zero incompatibilidades. unitCounts={UN:0, other:10, missing:0}. Os dez valores diferiam da string literal UN; isso não significa dez unidades distintas. Os valores não foram fornecidos. O tipo Product atual unit='UN' continua inalterado; identificar apresentações reais e regras de caixa/pacote/múltiplo na 7B.3, sem presumir conversão.
- **Preços:** presença de preco/precoPromocional não comprova promoção ativa, valor não nulo, prioridade da promoção ou preço comercial aplicável. Valores e contagens de null desses preços não foram fornecidos nesta evidência.
- **Contatos:** dez registros com os campos principais presentes. vendedor presente nos dez, null em sete; vendedor.id presente em três e ausente em sete, sem incompatibilidade. A amostra é de contatos, não dez clientes elegíveis. Não concluir que sete clientes da empresa não têm vendedor. Identificar tipos elegíveis e regra de cliente sem vendedor antes de mapear comercialmente.
- **Vendedores:** dez registros com id, contato, contato.id, contato.nome e situacao presentes/compatíveis. Acesso GET confirmado na configuração atual; IDs de vendedor e contato permanecem conceitos distintos, sem correspondência por nome.
- **Listas:** id, descricao e acrescimoDesconto presentes/compatíveis em três registros da primeira página. Sem total da conta comprovado; detalhe/exceções, listas por cliente, descontos/acréscimos efetivos e preços finais ainda não testados.

Os conflitos documentais acima, relativos a detalhes/filtros ou outros recursos, continuam pendentes. conflicts=[] nas listagens testadas não resolve o allOf do produto detalhe, a cardinalidade de excecoes ou as demais lacunas não consultadas. Não coletados detalhes de marca/pesos nem novas páginas. Não executar chamadas adicionais nesta consolidação.
