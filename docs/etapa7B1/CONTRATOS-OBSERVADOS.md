# Contratos observados: separar simulação e conta real

Data: **08/10/2026**. Implementação e testes locais com dados sintéticos. **Nenhuma autenticação ou consulta de dados reais executada. Homologação operacional PENDENTE.**

O OpenAPI foi novamente obtido por GET público e comparado byte a byte por SHA-256 com a evidência 7A: **sem mudança**. Versão 3.1; 1.233.619 bytes; hash `4790f92277550d2b5999449f8bfd37cb8648fc9b12f6a1b464a6d135a6a818fd`. Fonte: https://erp.tiny.com.br/public-api/v3/swagger/swagger.json. [Recorte e matrizes da 7A](../etapa7A/MAPA-API-V3.md) continuam válidos documentalmente. Não houve comparação com respostas reais.

| Recurso/campos | Contrato documental | Teste local | Observação real |
|---|---|---|---|
| Produto id/sku/gtin/descricao/unidade/situacao/tipo/precos | Lista; GTIN/SKU textuais | Zeros preservados; number no GTIN reporta incompatibilidade; UN/outros/ausente separados | PENDENTE |
| Marca/pesos/variações | Somente detalhe e DTOs referenciados | Campos inspecionados sem conversão ou projeção para Product | PENDENTE |
| Cliente id/nome/codigo/situacao/tipos/vendedor/cidade/UF | Lista de contatos e referências | Tipos dos campos selecionados, contagens e redaction | PENDENTE |
| Vendedor | ID + contato e situação | Inspeção parcial da estrutura sem nome no relatório | PENDENTE |
| Lista | id/descricao/acrescimoDesconto | Inspeção de tipos, sem preço comercial derivado | PENDENTE |
| Lista detalhe | excecoes objeto pelo schema | Array sinaliza PRICE_EXCEPTIONS_CARDINALITY | PENDENTE |
| Empresa | cpfCnpj e identificação | Conta divergente bloqueia catálogo sem expor documento | PENDENTE |

A inspeção é uma **projeção estrutural parcial**, não um validador integral gerado de todos os DTOs. Campos não marcados required podem estar ausentes: o relatório distingue missing de null e tipo errado. IDs ausentes/inválidos impedem compatibilidade da amostra para os recursos de cadastro por requisito da POC, sem alegar required do ERP. Página vazia é válida, mas não fornece amostra de produto/contato. Envelope inválido, offset não zero ou mais de dez itens é bloqueado. Não inferir máximo de página 10: dez é limite voluntário desta POC.

## Conflitos documentais ainda não resolvidos

- Produto detalhe combina enums distintos para tipo em allOf (P/S versus K/S/V/F/M); a inspeção aceita união para observação e registra PRODUCT_TYPE_ALLOF_AMBIGUOUS, sem resolver semântica.
- Filtro GTIN integer versus retorno textual: POC não usa esse filtro nem converte EAN.
- Lista detalhe declara excecoes objeto, sem confirmar cardinalidade/retorno real.
- Ajuda anuncia consumo em info, mas schema examinado não tem esse campo; observar somente headers documentados.
- Situação de envio e número do pedido têm inconsistências já mapeadas; recursos não consultados pela POC.
- Unidade dos pesos, casas decimais, vigência de preços, lista por cliente e elegibilidade de contato não se comprovam por tipos de campo.

O modelo Product atual permanece unit='UN'; não foi ampliado com suposição. A POC conta UN/outros/ausentes sem publicar texto arbitrário de unidade. Unidades específicas de outros produtos deverão ser confirmadas em inspeção segura/administrativa antes da evolução na 7B.2. Não há conversão para caixa/kg/gramas nem regra para escolher promoção.
