# Coleta técnica controlada

A 7B.3 não altera a POC de primeira página. O leitor próprio admite apenas GET dos quatro caminhos fixos, com `limit` e `offset` validados. Não recebe URLs externas. Transporte: resposta JSON até 1 MiB, timeout incluindo corpo, redirect bloqueado, sem cache de credenciais.

A sincronização usa um job por organização, quatro recursos e staging separado do catálogo ativo. Página e checkpoint são gravados na mesma transação. IDs repetidos dentro/entre páginas, total alterado, página curta antes do fim, offset inesperado e limites excedidos interrompem a coleta. O número recebido deve cobrir exatamente o total informado por recurso. A coleção sintética de 900 registros exige 36 páginas com limite 25, mais as páginas dos demais recursos.

Isso não prova uma fotografia atômica do ERP: mudanças durante paginação por offset podem produzir omissões mesmo com total estável. Nenhuma publicação automática nem aprovação comercial decorre da coleta. Desaparecimentos em relação à versão ativa exigem revisão explícita.

## Leases e recuperação

Leases de execução de 30 segundos usam UUID e comparação no commit. Uma segunda instância não assume uma execução viva. Cancelamento limpa a execução; respostas tardias são descartadas. Sessão, RBAC, organização e vínculo da conexão são verificados novamente antes de persistir, com bloqueios no commit. Reautenticação, desconexão ou reconfiguração invalidam a execução ligada à versão da conexão.

Após lease abandonado, a retomada explicitamente reinicia o staging e a cobertura; não continua cegamente do offset antigo. O progresso anterior permanece observável até essa decisão. O snapshot ativo continua disponível. Falhas finais deixam staging INCOMPLETE, sem alteração da head. COMPLETED é diferente de ACTIVE e de aprovação comercial.

## Quota

PostgreSQL coordena a identidade verificada da conta, compartilhada entre organizações e instâncias. Uma leitura por vez, intervalo mínimo de 4 segundos e reserva de duas chamadas quando a quota informada estiver próxima do fim. 15 chamadas/minuto é um orçamento conservador desta aplicação, **não** a quota homologada da Atram. Outros aplicativos podem consumir a mesma quota.

`Retry-After`, remaining e reset são persistidos. Espera pelo orçamento não consome tentativa de HTTP; 429 após uma requisição consome tentativa. Falhas transitórias usam backoff limitado com jitter, até três tentativas por padrão. Não há loop ilimitado de retries. O `/info` usa a mesma coordenação no runtime composto e prioridade sobre o consumo do saldo reservado. Reconciliação de pedidos permanece futura.

## Ativação e operação

Migrations não executam GET no Tiny. O startup não inicia jobs. Todos os flags reais e o modo fixture estão desabilitados por padrão. Administração autenticada inicia e avança cada página por ação explícita. Nenhum token/DTO integral é retornado pelo catálogo. A fase real exige homologação adicional, fora dos testes sintéticos.
