# Arquitetura FiscalizaPro

## Visao geral

FiscalizaPro foi desenhado para operacoes com mais de 1000 funcionarios terceirizados, alto volume de registros e necessidade de auditoria. A primeira versao deste repositorio e uma base funcional local; a arquitetura alvo de producao e modular, com frontend moderno, backend por dominios e PostgreSQL relacional.

## Camadas

| Camada | Implementacao local | Alvo de producao |
| --- | --- | --- |
| Frontend | SPA em `public/app.js` | React ou Next.js com componentes de design system |
| API | Node HTTP nativo em `src/server/index.js` | NestJS modular com REST ou GraphQL |
| Autenticacao | Token opaco em memoria e PBKDF2 | JWT/opaque token, Redis, MFA opcional |
| Persistencia | `data/app-data.json` | PostgreSQL com indices e historico |
| Arquivos | Referencias mockadas | Object storage com URL assinada |
| Relatorios | CSV/XLSX/PDF simples | Jobs assíncronos, filas e templates corporativos |
| Auditoria | `auditLogs` em JSON | Tabela particionada e trilha imutavel |

## Dominios

- **Identity & Access**: usuarios, perfis, permissoes, sessao, bloqueio de login.
- **Employees**: funcionarios, importacao, deduplicacao, status, historico.
- **Movements**: admissao, demissao, troca de posto, escala, supervisor, contrato e cargo.
- **Routes & Inspections**: rotas, pontos, checklist, evidencias, inicio e finalizacao.
- **Occurrences**: protocolo, tipo, prioridade, unidade, posto, funcionario, fotos e historico.
- **Service Center**: tarefas de supervisor, prazos, prioridade, status, comentarios.
- **Notices**: comunicados manuais e eventos automaticos.
- **Reports**: extracoes por filtros e formato.
- **Audit**: logs de negocio e seguranca.
- **Dashboard**: agregacoes calculadas por escopo de permissao.

## Perfis e autorizacao

| Perfil | Escopo principal |
| --- | --- |
| Admin Operacional | Acesso total, configuracao, importacao, usuarios, relatorios e auditoria |
| Fiscal Operacional | Rotas atribuidas, chatbot, ocorrencias proprias, funcionarios ativos e avisos |
| Supervisor Operacional | Servicos atribuidos, equipe, ocorrencias da area, movimentacoes e dashboards limitados |
| Usuario Consulta | Visualizacao autorizada, sem edicao |

O backend local aplica escopo nos endpoints de funcionarios, rotas, ocorrencias, servicos e movimentacoes. Em producao, recomenda-se uma camada RBAC/ABAC combinando perfil, unidade, contrato, area, hierarquia e status do recurso.

## Entidades principais

- `User`
- `Role`
- `Permission`
- `Employee`
- `EmployeeMovement`
- `ServiceType`
- `Route`
- `RoutePoint`
- `RouteChecklist`
- `Inspection`
- `Occurrence`
- `ServiceTask`
- `Notice`
- `ImportBatch`
- `ImportError`
- `AuditLog`
- `Attachment`
- `DashboardMetric`

## Relacionamentos essenciais

- `User` pertence a um `Role`.
- `Role` possui muitas `Permission`.
- `Employee` pertence a um `ServiceType`, unidade, empresa e supervisor.
- `EmployeeMovement` pertence a um `Employee` e registra o responsavel.
- `Route` possui muitos `RoutePoint` e checklist por ponto.
- `Inspection` executa uma `Route` e registra pontos visitados.
- `Occurrence` pode estar vinculada a `Employee`, `Route`, `Inspection` e `ServiceTask`.
- `ServiceTask` pode estar vinculada a ocorrencia, funcionario, unidade e rota.
- `Notice` possui publico-alvo e leitura opcional por usuario.
- `ImportBatch` possui muitos `ImportError` e pode gerar movimentacoes e avisos.
- `AuditLog` referencia usuario, entidade, acao e detalhes.
- `Attachment` pode ser associado a ocorrencia, servico, rota, fiscalizacao ou movimentacao.

## Regras de negocio

- Funcionario duplicado deve ser identificado por CPF ou matricula.
- Funcionario inativo precisa de data de demissao.
- Alteracao de unidade, posto ou status cria movimentacao.
- Ocorrencia sempre gera protocolo unico.
- Ocorrencia de prioridade alta ou critica gera tarefa de supervisor.
- Ocorrencia critica gera aviso automatico.
- Rota so pode ser executada pelo fiscal atribuido, salvo perfil administrador.
- Ponto de rota exige checklist antes de conclusao.
- Importacao nunca salva linha incompleta; erros ficam vinculados ao lote.
- Todas as acoes sensiveis geram auditoria.

## Validacoes

- Campos obrigatorios por entidade.
- E-mail com formato valido.
- CPF com 11 digitos numericos.
- Status limitado aos valores de dominio.
- Datas normalizadas em ISO `YYYY-MM-DD`.
- Upload limitado a CSV, TSV, TXT e XLSX.
- Relatorios respeitam escopo de autorizacao.

## Escalabilidade

- Usar paginacao obrigatoria em listas grandes.
- Criar indices por status, unidade, supervisor, fiscal, contrato, datas e protocolo.
- Processar importacoes grandes em jobs assíncronos.
- Separar consultas analiticas do dashboard em views materializadas ou tabelas agregadas.
- Particionar auditoria por mes.
- Usar storage externo para anexos.
- Cachear permissoes e dados de sessao em Redis.

## Tratamento de erros

- API retorna mensagens claras com `error`, `message` e `errors` quando aplicavel.
- Chatbot nao salva fluxo incompleto.
- Importacao retorna lote, contadores e ate 100 erros detalhados.
- Sessao expirada redireciona para login.
- Perfil sem permissao recebe `403`.

## Fronteira desta primeira versao

A base local e funcional para validacao de produto, processos e UX. Para producao, substitua JSON por PostgreSQL, adicione testes, observabilidade, filas, armazenamento de anexos e hardening de infraestrutura.
