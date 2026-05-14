# API FiscalizaPro

Base local:

```text
http://localhost:4173/api
```

Todas as rotas protegidas usam:

```http
Authorization: Bearer <token>
```

## Autenticacao

### POST `/auth/login`

```json
{
  "login": "admin@fiscalizapro.com",
  "password": "Admin@123"
}
```

Resposta:

```json
{
  "token": "opaque-token",
  "user": {
    "id": "usr-admin-001",
    "name": "Mariana Costa",
    "role": "ADMIN_OPERACIONAL"
  },
  "redirectTo": "dashboard"
}
```

### POST `/auth/logout`

Encerra a sessao e registra auditoria.

### GET `/me`

Retorna usuario logado e permissoes efetivas.

## Dashboard

### GET `/dashboard`

Retorna:

- `metrics`: cards principais.
- `charts`: series para graficos.

O resultado ja vem filtrado pelo perfil do usuario.

## Funcionarios

### GET `/employees?search=texto&status=Ativo`

Retorna funcionarios e resumo operacional.

### POST `/employees/import`

Importa CSV, TSV, TXT ou XLSX.

CSV/TXT:

```json
{
  "fileName": "funcionarios.csv",
  "content": "Matricula;Nome completo;CPF;Cargo;Tipo de servico;Unidade;Status\nVIG010;Nome;12345678909;Vigilante;Vigilancia patrimonial;Shopping Norte;Ativo"
}
```

XLSX:

```json
{
  "fileName": "funcionarios.xlsx",
  "content": "<base64>"
}
```

Resposta:

```json
{
  "batch": {
    "inserted": 1,
    "updated": 0,
    "errors": 0
  },
  "errors": [],
  "noticesCreated": 1
}
```

## Rotas e fiscalizacoes

### GET `/routes`

Lista rotas no escopo do perfil.

### POST `/routes`

Cria rota. Restrito ao admin operacional.

### POST `/routes/:id/start`

Inicia fiscalizacao da rota e cria `Inspection`.

### POST `/inspections/:id/visit-point`

```json
{
  "pointId": "pt-001",
  "answers": [
    {
      "question": "Funcionario presente?",
      "answer": "Sim"
    }
  ],
  "evidence": "Foto anexada no posto."
}
```

### POST `/inspections/:id/finish`

Finaliza a fiscalizacao e atualiza status da rota.

## Ocorrencias

### GET `/occurrences?search=texto`

Lista ocorrencias conforme perfil.

### POST `/occurrences`

```json
{
  "type": "Posto descoberto",
  "description": "Posto ficou sem cobertura por 30 minutos.",
  "serviceRelated": "Portaria",
  "unit": "Condominios Serra",
  "workPost": "Bloco B",
  "employeeId": "emp-003",
  "priority": "Alta",
  "location": "Condominios Serra"
}
```

Resposta inclui protocolo:

```json
{
  "occurrence": {
    "protocol": "OCO-20260514-0001",
    "status": "Aberta"
  }
}
```

### PATCH `/occurrences/:id`

Atualiza `status`, `priority` ou `description` com historico.

## Central de servicos

### GET `/services?search=texto`

Lista tarefas conforme perfil.

### POST `/services`

Cria tarefa de supervisor.

### PATCH `/services/:id`

```json
{
  "status": "Resolvido",
  "comment": "Pendencia encerrada com reposicao validada."
}
```

## Mural

### GET `/notices`

Lista avisos por publico-alvo.

### POST `/notices`

Restrito ao admin operacional.

## Movimentacoes

### GET `/movements`

Lista historico conforme perfil.

### POST `/movements`

Registra movimentacao e atualiza unidade/posto quando informado.

## Auditoria

### GET `/audit`

Restrito ao admin operacional. Retorna os ultimos 300 logs.

## Chatbot

### POST `/chatbot/interactions`

Registra interacoes relevantes do assistente operacional.

```json
{
  "message": "Registrar ocorrencia"
}
```

## Relatorios

### GET `/reports/:type?format=csv|xlsx|pdf|json`

Tipos:

- `employees`
- `admissions`
- `terminations`
- `movements`
- `routes`
- `inspections`
- `occurrences`
- `services`
- `monthly`

Exemplo:

```text
/api/reports/occurrences?format=xlsx
```
