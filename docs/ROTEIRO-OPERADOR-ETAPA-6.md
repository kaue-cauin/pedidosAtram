# Teste com operador — Atram, Etapa 6

Este roteiro é para alguém da equipe executar no próprio computador. Todos os dados e envios são fictícios. Não usar um pedido comercial real nesta versão. Não há telemetria remota.

Operador: __________  Data: __________  Navegador: __________
Resolução: __________  Pedido de teste: __________
Início: __________  Fim: __________  Tempo total: __________

1. Abrir a aplicação, escolher começar um novo pedido de exemplo e dar um número ao teste.
2. F2, pesquisar e selecionar o cliente; conferir vendedor e data.
3. F4. Inserir **30 produtos novos**, com Produto → Enter → Quantidade → Enter. Usar códigos 100001 a 100030; variar quantidades entre 1 e 10. Também experimentar `gran zero`, `whey choc`, `acucar coco`, `far aveia`.
4. Editar três quantidades, excluir dois produtos e duplicar um produto. Conferir os totais.
5. Na aba Pagamento, alterar a condição para `15 30 45`.
6. Ctrl+Enter: conferir cliente, vendedor, quantidade, valor, pagamento e frete. Tab/Shift+Tab devem ficar no modal.
7. Escape: fechar; verificar que o foco voltou ao campo/botão que abriu a revisão.
8. Alterar mais um item e revisar novamente. Escolher Sucesso normal em Simular resultado do ERP; confirmar.
9. Conferir número e data do recibo. Recarregar, recuperar o pedido e verificar que permanece finalizado.

## Recuperação e falhas

- Novo exemplo: salvar, recarregar e continuar. Confirmar itens e pagamento.
- Pelo diagnóstico de desempenho, bloquear a rede da aplicação. Inserir um produto, aguardar salvo, recarregar e recuperar. Reativar a rede. Esse teste não desliga o Wi-Fi do computador.
- Novo exemplo: simular Rejeição de conteúdo (400); confirmar. Escolher **Corrigir pedido**, alterar o pagamento, selecionar Sucesso normal, revisar e confirmar. O histórico deve mostrar a rejeição anterior.
- Novo exemplo: simular Limite de requisições (429). Enquanto aguarda, o botão de revisão deve estar desabilitado. Após o horário, selecionar Sucesso normal e confirmar a mesma tentativa.
- Novo exemplo: simular Timeout depois da criação. Recarregar e recuperar. O pedido precisa estar bloqueado, com ação **Consultar resultado no ERP**. Consultar deve recuperar o recibo e finalizar.

## Registro local de observações

| Medida | Resultado |
|---|---|
| Tempo para inserir 30 produtos | |
| Uso do mouse (quantas ações) | |
| Erros de digitação | |
| Perdas de foco (em qual ação) | |
| Campos que precisou revisitar | |
| Travamentos percebidos | |
| Botões ou mensagens confusos | |
| Entendeu quando estava salvo? | |
| Entendeu o resultado desconhecido? | |
| Entendeu como corrigir 400? | |

Dúvidas do operador: __________________________________________________
Ações repetitivas que poderiam ser eliminadas: _________________________
Sugestões: ___________________________________________________________

A automação de teclado não substitui este teste com uma pessoa real. A aprovação de campo exige completar este registro no equipamento de trabalho.
