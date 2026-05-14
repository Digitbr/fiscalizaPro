# FiscalizaPro

FiscalizaPro e uma base funcional para fiscalizacao operacional de empresas prestadoras de servicos terceirizados. A primeira versao roda localmente sem dependencias externas, com servidor Node nativo, SPA responsiva, autenticacao por perfil, dados mockados persistidos em JSON, importacao de planilhas, chatbot operacional, dashboard, relatorios e auditoria.

## Como rodar localmente

Requisitos:

- Node.js 20 ou superior.
- No Windows PowerShell, use `npm.cmd` caso `npm.ps1` esteja bloqueado pela politica de execucao.

Comandos:

```powershell
npm.cmd run dev
```

Abra:

```text
http://localhost:4173
```

## Usuarios de teste

| Perfil | Login | Senha |
| --- | --- | --- |
| Admin Operacional | `admin@fiscalizapro.com` | `Admin@123` |
| Fiscal Operacional | `fiscal@fiscalizapro.com` | `Fiscal@123` |
| Supervisor Operacional | `supervisor@fiscalizapro.com` | `Supervisor@123` |
| Usuario Consulta | `consulta@fiscalizapro.com` | `Consulta@123` |

## Funcionalidades implementadas

- Login com e-mail ou matricula, sessao local, bloqueio por tentativas e senha PBKDF2.
- Controle por perfil para admin, fiscal, supervisor e consulta.
- Dashboard com indicadores e graficos por escopo de permissao.
- Chatbot operacional hibrido com mensagens, botoes, formularios e validacao antes de salvar.
- Fluxo guiado para ocorrencias com protocolo automatico.
- Fluxo de rota com inicio, checklist por ponto e finalizacao.
- Consulta de funcionarios pelo chatbot.
- Central de servicos com atualizacao de status e historico.
- Funcionarios com filtros e importacao CSV, TSV, Google Sheets exportado e XLSX simples.
- Deduplicacao por CPF ou matricula, validacao de obrigatorios e historico de movimentacoes.
- Mural de avisos manual e avisos automaticos gerados pela importacao.
- Movimentacoes de funcionarios.
- Relatorios exportaveis em CSV, XLSX e PDF simples.
- Logs de auditoria para login, importacao, chatbot, CRUD operacional e exportacao.

## Estrutura do projeto

```text
.
├── data/
│   └── app-data.json              # Base mockada persistida localmente
├── docs/
│   ├── api.md                     # Contratos REST iniciais
│   ├── architecture.md            # Arquitetura, dominios e regras
│   ├── chatbot-flows.md           # Fluxos guiados do assistente operacional
│   └── database.sql               # Modelagem PostgreSQL de producao
├── public/
│   ├── app.js                     # SPA responsiva
│   ├── index.html
│   └── styles.css
├── src/server/
│   ├── auth.js                    # Senha, token e RBAC
│   ├── csv.js                     # Parser CSV/TSV e export CSV
│   ├── exporters.js               # Exportadores CSV/XLSX/PDF
│   ├── index.js                   # Servidor HTTP e APIs
│   └── xlsx.js                    # Parser XLSX basico sem dependencia
└── package.json
```

## Importacao de funcionarios

Campos reconhecidos na planilha:

- Matricula
- Nome completo
- CPF
- Cargo
- Tipo de servico
- Unidade
- Posto de trabalho
- Escala
- Horario
- Data de admissao
- Data de demissao
- Status
- Supervisor responsavel
- Empresa contratada
- Contrato vinculado
- Data fim contrato
- Telefone
- E-mail
- Observacoes

Regras aplicadas:

- `Matricula`, `Nome completo`, `CPF`, `Cargo`, `Tipo de servico`, `Unidade` e `Status` sao obrigatorios.
- CPF deve ter 11 digitos.
- Funcionario inativo precisa de data de demissao.
- Duplicidades sao resolvidas por CPF ou matricula.
- Atualizacoes criam movimentacoes quando ha alteracao de status, unidade ou posto.
- Admissoes, demissoes e contratos proximos do vencimento geram avisos automaticos.

## Proximos passos de producao

- Substituir persistencia JSON por PostgreSQL usando o schema de `docs/database.sql`.
- Separar backend em NestJS por dominios: Auth, Employees, Routes, Inspections, Occurrences, Services, Notices, Reports e Audit.
- Usar storage externo para anexos e evidencias com URL assinada.
- Trocar sessoes em memoria por tokens JWT/opaque token em Redis.
- Adicionar testes automatizados unitarios, integracao e e2e.
- Integrar provedor de e-mail para recuperacao de senha.
- Evoluir chatbot para motor de fluxos versionado com intents, slots e politicas por perfil.
