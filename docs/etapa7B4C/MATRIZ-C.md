# Matriz implementada C01–C29 — expectativas, sem execução PostgreSQL local

I/R/P/O/E/V = entrada CREATE do executor / recebimentos persistidos pelo simulador /
pedidos criados / operações CREATE do ledger / delta de submission_events desde READY /
evidências duráveis. REGISTER + ADMIT não entram em E. Denegações auditadas são
contadas separadamente. Nenhuma operação LOOKUP é criada.

**Todas as contagens da tabela são esperadas, não medidas nesta entrega.**
C01–C29 não entraram no corpo dos testes: infraestrutura indisponível. Os valores
medidos são `null` no manifesto de preflight. São implementados em
`backend/tests/stage7b4c/execution.test.mjs`, normalmente nos dois modos.
C26 calibra separadamente não idempotente e idempotente.

| Caso | Preparação e falha/barreira | Resultado esperado | I/R/P/O/E/V |
|---|---|---|---|
| C01 | READY; sucesso normal, commits independentes | SUBMITTED; recibo exato durável | 1/1/1/1/2/1 |
| C02 | Dois processos, mesmo operador autorizado; 100 confirmações do mesmo comando/corpo/revisão | Um vencedor e uma capacidade; demais replays | 1/1/1/1/2/1 |
| C03 | C08; 1.000 replays exatos após timeout, em dois processos | UNKNOWN; zero acréscimo em todas as contagens | 1/1/1/1/2/1 |
| C04 | Falha injetada antes do commit da intenção; rollback confirmado | READY, zero despacho | 0/0/0/0/0/0 |
| C05 | Descartar ACK após commit da intenção no adapter do teste | Sem capacidade; supervisor registra ABANDON; UNKNOWN | 0/0/0/1/2/0 |
| C06 | Falha controlada após intenção e antes de consumir capacidade; fechamento/término demonstrados | ERROR/NO_EFFECT, snapshot ocupante | 0/0/0/1/2/1 |
| C07 | Invocar transporte, falha injetada antes de entregar; sem prova negativa no protocolo | UNKNOWN mesmo com P=0 conhecido só pelo harness | 1/0/0/1/2/1 |
| C08 | Simulador commita criação e descarta resposta | UNKNOWN, efeito externo persistente; nenhum reenvio | 1/1/1/1/2/1 |
| C09 | SIGKILL real do executor após commit externo e antes de commit da prova | Após restart, ABANDON/UNKNOWN; contador conserva efeito | 1/1/1/1/2/0 |
| C10 | Simulador cria e atrasa a resposta além do deadline; INCONCLUSIVE, depois resposta direta válida da mesma execução | UNKNOWN→SUBMITTED; duas provas preservadas | 1/1/1/1/3/2 |
| C11 | Após aceitação C01, observação contraditória injetada e classificada INCONCLUSIVE | SUBMITTED/recibo preservados, conflictHold; sem outro CREATE | 1/1/1/1/3/2 |
| C12 | SIGSTOP real antes da checagem final; lease vence; outro processo faz ABANDON; SIGCONT | Retomada bloqueada; UNKNOWN; lease não elege substituto | 0/0/0/1/2/0 |
| C13 | SIGSTOP após a última checagem e consumo da capacidade, antes da chamada; vence lease/ABANDON; SIGCONT | Efeito antigo ainda pode ocorrer; nenhum substituto; resposta válida tardia conclui | 1/1/1/1/3/1 |
| C14 | Parar realmente PostgreSQL da aplicação antes da confirmação; simulador continua ativo | Zero transporte; READY intacta após retorno | 0/0/0/0/0/0 |
| C15 | Parar realmente PostgreSQL após intenção e antes da revalidação | Zero transporte; após retorno, ABANDON/UNKNOWN | 0/0/0/1/2/0 |
| C16 | Parar PostgreSQL após efeito; recibo preservado no atestador; prova não commita | Sem sucesso durável durante falha; retorno: ABANDON e mesma prova concluem | 1/1/1/1/3/1 |
| C17 | SIGKILL depois da intenção e antes de transporte; boot de processo novo | Não recuperar capacidade; ABANDON/UNKNOWN, mesmo P=0 | 0/0/0/1/2/0 |
| C18 | Reiniciar com READY sem confirmação | READY abandonado permanece ocupante; nenhum cancelamento/CREATE | 0/0/0/0/0/0 |
| C19 | Gate RECOVERY_HOLD, ausente ou inválido antes do CONFIRM; subcasos separados | Confirmação negada; nenhuma capacidade | 0/0/0/0/0/0 |
| C20 | Ativar hold/mudar época após intenção e antes de checagem final | Zero despacho; ABANDON/UNKNOWN; não liberar gate | 0/0/0/1/2/0 |
| C21 | Backup do ledger em READY; criar externamente; quiescer, hold, restore real do backup; simulador intacto | READY antiga sob hold global; operação perdida documentada, sem CREATE novo | 1/1/1/0/0/0* |
| C22 | Revogar sessão/membership depois da intenção e antes de checagem; worker fecha capacidade não consumida comprovadamente | Zero transporte; ADMIN de fixture registra NO_EFFECT, sem restaurar sessão | 0/0/0/1/2/1 |
| C23 | ADMIN transfere owner após intenção e antes da checagem; fechamento seguro do worker antigo | Zero transporte; OWNER auditado, NO_EFFECT; novo owner não recebe capacidade antiga | 0/0/0/1/3/1 |
| C24 | Rejeição terminal com tombstone persistente; harness tenta entrega tardia da mesma submissão | ERROR/REJECTED_FINAL; ambas entregas sem efeito | 1/2/0/1/2/1** |
| C25 | HTTP 500 sintético sem efeito (a) e após efeito (b), sem prova terminal; corpos inválidos/200 sem ID são subcasos próprios | UNKNOWN nos dois perfis; status não libera CREATE | a: 1/1/0/1/2/1; b: 1/1/1/1/2/1 |
| C26 | Calibração direta do simulador não idempotente: duas chamadas iguais, sem executor/ledger; restart do simulador e seu PostgreSQL | Dois pedidos conservados; demonstrar ausência de deduplicação externa | 0/2/2/0/0/0** |
| C27 | Depois de C06, novo CONFIRM explícito, mesma tentativa/bytes, nova operação; sucesso | Antiga definitivamente fechada; só a segunda invoca transporte | 1/1/1/2/4/2 |
| C28 | Após C01: quatro bindings inválidos no classificador + schema inválido no repositório; depois três provas válidas em forma, com binding errado, e uma organização sem acesso; ADMIN tenta CONFIRM | Primeiros cinco: antes da transação, audit Δ=0; cinco denegações SQL: audit Δ=5. Recibo, bytes e evidências intactos | 1/1/1/1/2/1; auditoria separada |
| C29 | C08; reiniciar realmente simulador e seu PostgreSQL, depois executor; testar isoladamente o classificador com observação vazia, sem gravar outra evidência | Contador mantém P=1; aplicação não consulta o oráculo nem libera CREATE; classificador retorna INCONCLUSIVE para vazio | 1/1/1/1/2/1 |


C21 preserva contagens antes do restore 1/1/1/1/1/0 e, após restore,
1/1/1/0/0/0. O gate externo não entra em E; só o ledger descartável é restaurado.
C24 inclui uma chamada auxiliar; C26 inclui duas por modo, zero I, e uma fixture
sem intenção no ledger. Calibração idempotente: 0/2/1/0/0/0. Chamadas auxiliares
ficam identificadas nos manifestos; não são ocultadas em R.
C25 adicionalmente tem `invalid` e `200-no-id`, ambos 1/1/1/1/2/1 esperados.
C22 revoga sessão e membership em subcasos; C23 transfere responsabilidade.
C19 cobre hold/ausente/inválido; C20 distingue hold de mudança de época NORMAL.

C04 força falha do gate **dentro** da transação após o comando e antes do commit,
para testar rollback real. C05 perde somente o ACK no adapter, não a conexão física.
C06 fecha capacidade e espera exit do worker; C09/C17 exigem SIGKILL confirmado.
C12/C13 exigem SIGSTOP comprovado em `/proc`, lease expirado pelo relógio
PostgreSQL, ABANDON sem substituição e SIGCONT. Duração de lease da fixture: 100 ms.
C14–16 exigem stop/start real do serviço da aplicação; C24/C26/C29 exigem restart
real do PostgreSQL do simulador com retenção dos dados.

Aceite: todos os casos/subcasos, contagens, estados e ausência de segundo CREATE
incerto devem passar em PostgreSQL real com processos independentes e role
restrita. Manifestos precisam identificar SHA, barreiras, sinais, exits,
independência dos bancos e contagens antes/depois. B01–B24 e regressões 7B.1–3,
Etapas 2–6, typecheck/lint/build/boundary permanecem obrigatórios. Testes Node com
fake-indexeddb ou coordinator double não homologam interface no navegador.
