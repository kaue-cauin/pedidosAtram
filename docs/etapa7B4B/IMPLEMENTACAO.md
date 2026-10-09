# Etapa 7B.4B — acompanhamento de implementação

Status: preparação; implementação e homologação pendentes. Escopo autorizado: persistência PostgreSQL e contratos de repositório, exclusivamente fixtures sintéticas. PR Draft, sem merge ou deploy.

Baseline: `0dc5404cd913f7ad35653e422dab5b5ebb884953`, main remota e checkout conferidos em 2026-10-09. Contrato normativo: CONTRATOS-ETAPA-7B4A.md, submission-ledger-v1, aceito pela gestão no documento de autorização desta fase.

## Estratégia de proteção antes da migration

Usar AES-256-GCM do Vault existente para cifrar os bytes UTF-8 canônicos, com AAD específica contendo organização, pedido, submissão, tipo de conteúdo, versões e hash. O hash SHA-256 permanece do plaintext canônico. O DTO sintético tem versão e hash próprios. Evidências recebem domínio AAD distinto e conteúdo validado. Não persistir payload plaintext em logs, eventos ou recibos de comandos.

Imutabilidade lógica inclui bytes, hashes e binding. Rotação de chaves exige uma operação privilegiada separada, que abra e confira o conteúdo com a chave antiga e recifre os mesmos bytes. A role operacional não terá UPDATE livre de envelopes. Rotação deve ser testada sem alterar os hashes e sem declarar homologação comercial do Vault.

## Recuperação

RECOVERY_HOLD deve ser verificado fora do banco restaurado; ausência ou invalidade do gate bloqueia por padrão. O laboratório precisa demonstrar restauração antiga com gate ativo e proibir admissão/intenções. Readiness SQL não libera recuperação. Não há infraestrutura de produção homologada.

## READY abandonado

READY admitido permanece ocupante e imutável até confirmação explícita ou falha pré-despacho comprovada. Fechar a tela não cancela nem libera a âncora. Não será acrescentada transição READY→DRAFT.

## Verificação

Registrar baseline, B01–B24 individualmente e regressões. Resultados históricos não substituem execução desta branch. O ambiente local não dispõe de PostgreSQL; usar serviço PostgreSQL real da CI, sem credenciais comerciais. Não implementar executor, simulador externo, rotas comerciais ou UI.
