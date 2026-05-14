# Fluxos do Chatbot Operacional

Mensagem inicial:

```text
Ola, sou o Assistente Operacional. O que voce deseja fazer agora?
```

Opcoes iniciais:

1. Iniciar fiscalizacao
2. Ver minhas rotas
3. Registrar ocorrencia
4. Consultar funcionario
5. Abrir central de servicos
6. Ver mural de avisos
7. Ver pendencias
8. Finalizar atividade

## Fluxo de ocorrencia

| Etapa | Bot | Entrada esperada | Validacao |
| --- | --- | --- | --- |
| 1 | Qual tipo de ocorrencia deseja registrar? | Botao de tipo | Tipo obrigatorio |
| 2 | Qual servico esta relacionado? | Botao de servico | Servico obrigatorio |
| 3 | Informe a unidade | Botao ou texto | Unidade obrigatoria |
| 4 | Existe funcionario envolvido? | Sim/Nao | Opcional |
| 5 | Pesquisar funcionario | Texto e selecao | Funcionario precisa existir se selecionado |
| 6 | Descreva a ocorrencia | Texto livre | Descricao obrigatoria |
| 7 | Qual prioridade? | Baixa, Media, Alta, Critica | Prioridade obrigatoria |
| 8 | Resumo para confirmacao | Confirmar/Cancelar | Salva apenas apos confirmacao |
| 9 | Protocolo gerado | Resposta da API | Auditoria e historico criados |

Regras:

- Dados incompletos nao sao salvos.
- Alta ou critica gera tarefa de supervisor.
- Critica gera aviso automatico.
- Toda interacao relevante e auditada.

## Fluxo de rota

| Etapa | Bot | Entrada esperada | Resultado |
| --- | --- | --- | --- |
| 1 | Escolha a rota que deseja iniciar | Rota atribuida | Cria fiscalizacao |
| 2 | Pontos previstos | Botao de ponto | Abre checklist |
| 3 | Checklist obrigatorio | Formulario Sim/Nao | Salva ponto visitado |
| 4 | Ha ocorrencia? | Registrar ocorrencia ou proximo ponto | Integra ocorrencia |
| 5 | Todos os pontos visitados | Finalizar rota | Atualiza status |

Regras:

- Fiscal so inicia rota atribuida a ele.
- Cada ponto registra hora, checklist e evidencia textual.
- Finalizacao gera resumo e entra em relatorio.

## Fluxo de consulta de funcionario

| Etapa | Bot | Entrada esperada | Resultado |
| --- | --- | --- | --- |
| 1 | Digite nome, CPF, matricula, cargo, unidade ou posto | Texto | Busca em funcionarios |
| 2 | Resultado | Lista textual | Exibe cargo, servico, unidade, posto e status |

Regras:

- Fiscal visualiza funcionarios ativos.
- Supervisor tem escopo de equipe/area.
- Admin visualiza todos.

## Fluxo de central de servicos

| Etapa | Bot | Entrada esperada | Resultado |
| --- | --- | --- | --- |
| 1 | Ver meus servicos | Comando ou botao | Lista servicos |
| 2 | Concluir servico | Botao | PATCH no servico |
| 3 | Confirmacao | Resposta do servidor | Historico atualizado |

Regras:

- Supervisor altera apenas servicos atribuidos a ele.
- Admin pode acompanhar toda a central.

## Fluxo de mural e pendencias

- `Ver mural de avisos`: lista avisos por publico-alvo.
- `Ver pendencias`: consolida ocorrencias abertas e servicos nao resolvidos.
- `Finalizar atividade`: encerra fluxo corrente sem descartar registros ja confirmados.

## Evolucao recomendada

- Criar motor de fluxos versionado em banco.
- Registrar intents, slots, validadores e acoes por perfil.
- Permitir anexos reais no chat com storage assinado.
- Adicionar geolocalizacao com permissao do navegador.
- Adicionar fallback para atendimento humano quando o bot nao reconhecer comando.
