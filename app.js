const app = document.querySelector("#app");

const state = {
  token: localStorage.getItem("fiscalizapro.token"),
  user: null,
  view: localStorage.getItem("fiscalizapro.view") || "dashboard",
  flash: null,
  settings: null,
  filters: {
    dashboard: {
      enrollment: "",
      unit: "",
      position: "",
      company: ""
    },
    employees: {
      enrollment: "",
      search: "",
      cpf: "",
      position: "",
      unit: "",
      workPost: "",
      company: "",
      contract: "",
      serviceType: "",
      status: ""
    },
    occurrences: "",
    services: ""
  },
  selectedEmployeeId: "",
  editingEmployeeId: "",
  chatbot: {
    messages: [],
    flow: null,
    activeInspection: null,
    activeRoute: null
  }
};

const demoAccounts = [
  ["Admin", "admin@fiscalizapro.com", "Admin@123"],
  ["Fiscal", "fiscal@fiscalizapro.com", "Fiscal@123"],
  ["Supervisor", "supervisor@fiscalizapro.com", "Supervisor@123"],
  ["Consulta", "consulta@fiscalizapro.com", "Consulta@123"]
];

const menu = [
  ["dashboard", "Dashboard", "▦", ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["chatbot", "Chatbot Operacional", "◇", ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL"]],
  ["employees", "Funcionários", "☰", ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["routes", "Rotas", "⌖", ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["services", "Central de Serviços", "□", ["ADMIN_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["occurrences", "Ocorrências", "!", ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["notices", "Mural de Avisos", "◫", ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["movements", "Movimentações", "↔", ["ADMIN_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["reports", "Relatórios", "⇩", ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["users", "Usuários e Permissões", "◎", ["ADMIN_OPERACIONAL"]],
  ["settings", "Configurações", "⚙", ["ADMIN_OPERACIONAL"]]
];

const occurrenceTypes = [
  "Falta",
  "Atraso",
  "Posto descoberto",
  "Uniforme irregular",
  "Conduta inadequada",
  "Equipamento danificado",
  "Material insuficiente",
  "Falha na limpeza",
  "Falha na portaria",
  "Falha no CFTV",
  "Risco de segurança",
  "Reclamação do cliente",
  "Outro"
];

const serviceTypes = [
  "Vigilância patrimonial",
  "CFTV / monitoramento",
  "Portaria",
  "Limpeza",
  "Conservação",
  "Recepção",
  "Manutenção predial",
  "Jardinagem",
  "Apoio operacional",
  "Controle de acesso",
  "Serviços gerais"
];

const priorities = ["Baixa", "Média", "Alta", "Crítica"];

init();

async function init() {
  if (!state.token) {
    renderLogin();
    return;
  }

  try {
    const { user } = await api("/api/me");
    state.user = user;
    if (!allowedViews().some(([view]) => view === state.view)) {
      state.view = "dashboard";
    }
    renderApp();
  } catch {
    resetSession();
    renderLogin("Sua sessão expirou. Entre novamente.");
  }
}

function renderLogin(error = "") {
  app.innerHTML = `
    <main class="login-page">
      <section class="login-hero">
        <div class="brand-row"><span class="brand-mark">FP</span><span>FiscalizaPro</span></div>
        <div>
          <h1>Fiscalização operacional com chatbot, rastreabilidade e controle por perfil.</h1>
          <p>Uma base funcional para administrar serviços terceirizados, equipes, rotas, ocorrências, central de serviços, avisos e auditoria em ambientes com alto volume de dados.</p>
        </div>
      </section>
      <section class="login-panel">
        <h2>Acessar plataforma</h2>
        <div class="subtle">Use e-mail ou matrícula. A sessão respeita perfil, bloqueio por tentativas e autorização por rota.</div>
        ${error ? `<div class="error-banner">${h(error)}</div>` : ""}
        <form id="login-form">
          <div class="field">
            <label for="login">E-mail ou matrícula</label>
            <input id="login" name="login" autocomplete="username" required placeholder="admin@fiscalizapro.com">
          </div>
          <div class="field">
            <label for="password">Senha</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Digite sua senha">
          </div>
          <div class="row space-between">
            <label class="row"><input type="checkbox" name="remember" checked> Lembrar acesso</label>
            <button class="btn ghost small" type="button" data-action="recover-password">Recuperar senha</button>
          </div>
          <button class="btn primary" style="width:100%; margin-top:16px" type="submit">Entrar</button>
        </form>
        <div class="demo-grid">
          ${demoAccounts.map(([label, login, password]) => `<button class="btn small" data-action="demo-fill" data-login="${h(login)}" data-password="${h(password)}"><strong>${label}</strong><br><span class="subtle">${h(login)}</span></button>`).join("")}
        </div>
      </section>
    </main>
  `;
}

function renderApp() {
  localStorage.setItem("fiscalizapro.view", state.view);
  const nav = allowedViews();
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand-row"><span class="brand-mark">FP</span><span>FiscalizaPro</span></div>
        <div class="profile-box">
          <strong>${h(state.user.name)}</strong>
          <span>${roleLabel(state.user.role)} · ${h(state.user.area || "Área operacional")}</span>
        </div>
        <nav class="nav">
          ${nav.map(([view, label, icon]) => `<button class="${state.view === view ? "active" : ""}" data-view="${view}"><span>${icon}</span><span>${label}</span></button>`).join("")}
        </nav>
      </aside>
      <main class="main">
        <div id="content"></div>
      </main>
    </div>
  `;
  renderView();
}

async function renderView() {
  const content = document.querySelector("#content");
  if (!content) return;
  content.innerHTML = `<div class="panel">Carregando informações...</div>`;

  const renderers = {
    dashboard: renderDashboard,
    chatbot: renderChatbot,
    employees: renderEmployees,
    routes: renderRoutes,
    services: renderServices,
    occurrences: renderOccurrences,
    notices: renderNotices,
    movements: renderMovements,
    reports: renderReports,
    users: renderUsers,
    settings: renderSettings
  };

  try {
    await renderers[state.view](content);
  } catch (error) {
    content.innerHTML = pageHeader("Falha ao carregar", "Revise sua conexão local e tente novamente.") + `<div class="error-banner">${h(error.message || "Erro inesperado.")}</div>`;
  }
}

async function renderDashboard(content) {
  const dashboard = await api(`/api/dashboard${dashboardQuery()}`);
  const metrics = dashboard.metrics;
  content.innerHTML = `
    ${pageHeader("Painel de segurança patrimonial", "Indicadores operacionais por matrícula, centro de custo, cargo e empresa.")}
    ${flashHtml()}
    ${securityDashboardIntro(dashboard)}
    ${dashboardFilters(dashboard.filterOptions || {})}
    ${dashboardSummary(dashboard.summary)}
    <section class="grid cards">
      ${metric("Funcionários ativos", metrics.activeEmployees, "Base operacional liberada")}
      ${metric("Funcionários inativos", metrics.inactiveEmployees, "Histórico preservado")}
      ${metric("Admissões no mês", metrics.monthAdmissions, "Novas entradas")}
      ${metric("Demissões no mês", metrics.monthTerminations, "Baixas registradas")}
      ${metric("Rotas programadas", metrics.scheduledRoutes, "Planejamento")}
      ${metric("Rotas em andamento", metrics.runningRoutes, "Execução atual")}
      ${metric("Rotas atrasadas", metrics.delayedRoutes, "Exigem ação")}
      ${metric("Ocorrências abertas", metrics.openOccurrences, "Pendências operacionais")}
      ${metric("Ocorrências críticas", metrics.criticalOccurrences, "Prioridade máxima")}
      ${metric("Serviços abertos", metrics.openServices, "Central de serviços")}
      ${metric("Serviços vencidos", metrics.overdueServices, "Fora do prazo")}
      ${metric("Contratos a vencer", metrics.expiringContracts, "Próximos 30 dias")}
    </section>
    <section class="grid two" style="margin-top:16px">
      ${chartPanel("Funcionários por serviço", dashboard.charts.employeesByService)}
      ${chartPanel("Funcionários por unidade", dashboard.charts.employeesByUnit)}
      ${chartPanel("Ocorrências por tipo", dashboard.charts.occurrencesByType)}
      ${chartPanel("Rotas por status", dashboard.charts.routesByStatus)}
      ${chartPanel("Serviços por prioridade", dashboard.charts.servicesByPriority)}
      ${chartPanel("Ranking de unidades com ocorrências", dashboard.charts.topUnitsByOccurrences)}
    </section>
  `;
}

async function renderEmployees(content) {
  const query = employeeQuery();
  const { employees, summary, filterOptions } = await api(`/api/employees${query}`);
  const selected = employees.find((employee) => employee.id === state.selectedEmployeeId) || employees[0] || null;
  state.selectedEmployeeId = selected?.id || "";
  content.innerHTML = `
    ${pageHeader("Funcionários", "Consulta, filtros, edição e exportação da base operacional.")}
    ${flashHtml()}
    <section class="summary-strip">
      ${metric("Ativos", summary.totalActive, "Em operação")}
      ${metric("Inativos", summary.totalInactive, "Histórico")}
      ${metric("Empresas", summary.byCompany?.length || 0, "Com funcionários ativos")}
      ${metric("Contratos a vencer", summary.contractEnding, "Próximos 30 dias")}
    </section>
    <section class="panel quiet">
      <div class="row space-between">
        <h2>Funcionários</h2>
        <div class="row">
          <button class="btn small" data-action="download-report" data-type="employees" data-format="csv">CSV</button>
          <button class="btn small" data-action="download-report" data-type="employees" data-format="xlsx">XLSX</button>
          <button class="btn small" data-action="download-report" data-type="employees" data-format="pdf">PDF</button>
        </div>
      </div>
      ${employeeFilters(filterOptions || {})}
      ${state.user.role === "ADMIN_OPERACIONAL" ? importBox() : ""}
      <div class="employee-layout">
        ${employeeTable(employees)}
        ${employeeDetail(selected)}
      </div>
    </section>
    <section class="grid two" style="margin-top:16px">
      ${compactList("Empresas", summary.byCompany)}
      ${compactList("Centros de custo", summary.byUnit)}
      ${compactList("Cargos", summary.byPosition)}
      ${compactList("Filiais/Postos", summary.byWorkPost)}
    </section>
  `;
}

async function renderRoutes(content) {
  const [{ routes }, usersData] = await Promise.all([
    api("/api/routes"),
    state.user.role === "ADMIN_OPERACIONAL" ? api("/api/users") : Promise.resolve({ users: [] })
  ]);
  const routeUsers = usersData.users || [];
  content.innerHTML = `
    ${pageHeader("Rotas de fiscalização", "Planejamento, execução, checklist e status por fiscal e supervisor.")}
    ${flashHtml()}
    ${state.user.role === "ADMIN_OPERACIONAL" ? routeForm(null, routeUsers) : ""}
    <section class="grid two">
      ${routes.map((route) => routeCard(route, routeUsers)).join("") || empty("Nenhuma rota encontrada para o seu perfil.")}
    </section>
  `;
}

async function renderServices(content) {
  const query = state.filters.services ? `?search=${encodeURIComponent(state.filters.services)}` : "";
  const { serviceTasks } = await api(`/api/services${query}`);
  content.innerHTML = `
    ${pageHeader("Central de serviços", "Pendências operacionais, validações, reposições, movimentações e tratativas.")}
    ${flashHtml()}
    <section class="panel">
      <form class="toolbar" id="service-filter-form">
        <input class="search" name="search" value="${h(state.filters.services)}" placeholder="Filtrar por título, unidade, prioridade, responsável ou status">
        <button class="btn" type="submit">Filtrar</button>
        <button class="btn ghost" type="button" data-action="clear-service-filter">Limpar</button>
      </form>
      <div class="list">
        ${serviceTasks.map(serviceItem).join("") || empty("Nenhum serviço encontrado.")}
      </div>
    </section>
  `;
}

async function renderOccurrences(content) {
  const [occurrenceData, employeeData] = await Promise.all([
    api(`/api/occurrences${state.filters.occurrences ? `?search=${encodeURIComponent(state.filters.occurrences)}` : ""}`),
    api("/api/employees")
  ]);
  content.innerHTML = `
    ${pageHeader("Ocorrências", "Registros com protocolo, prioridade, evidências, histórico e tratativa.")}
    ${flashHtml()}
    <section class="grid two">
      <div class="panel">
        <h2>Registrar ocorrência</h2>
        <form id="occurrence-form">
          <div class="grid two">
            ${selectField("type", "Tipo", occurrenceTypes)}
            ${selectField("serviceRelated", "Serviço relacionado", serviceTypes)}
            ${inputField("unit", "Unidade", "Shopping Norte")}
            ${inputField("workPost", "Posto", "Portaria 1")}
            ${selectField("priority", "Prioridade", priorities)}
            ${employeeSelect(employeeData.employees)}
          </div>
          <div class="field"><label>Descrição</label><textarea name="description" required placeholder="Descreva o fato observado com clareza operacional"></textarea></div>
          <div class="field"><label>Localização</label><input name="location" placeholder="Opcional: unidade, coordenada ou referência"></div>
          <button class="btn primary" type="submit">Salvar ocorrência</button>
        </form>
      </div>
      <div class="panel">
        <form class="toolbar" id="occurrence-filter-form">
          <input class="search" name="search" value="${h(state.filters.occurrences)}" placeholder="Filtrar ocorrências">
          <button class="btn" type="submit">Filtrar</button>
        </form>
        <div class="list">${occurrenceData.occurrences.map(occurrenceItem).join("") || empty("Nenhuma ocorrência encontrada.")}</div>
      </div>
    </section>
  `;
}

async function renderNotices(content) {
  const { notices } = await api("/api/notices");
  content.innerHTML = `
    ${pageHeader("Mural de avisos", "Comunicados operacionais, eventos automáticos e confirmação de leitura.")}
    ${flashHtml()}
    <section class="grid ${state.user.role === "ADMIN_OPERACIONAL" ? "two" : ""}">
      <div class="panel">
        <div class="list">${notices.map(noticeItem).join("") || empty("Nenhum aviso publicado.")}</div>
      </div>
      ${state.user.role === "ADMIN_OPERACIONAL" ? `
      <div class="panel">
        <h2>Publicar aviso</h2>
        <form id="notice-form">
          ${inputField("title", "Título", "Comunicado operacional")}
          ${selectField("category", "Categoria", ["Admissões", "Demissões", "Contratos", "Rotas", "Ocorrências", "Comunicados", "Pendências"])}
          ${selectField("priority", "Prioridade", ["Normal", "Alta", "Crítica"])}
          <div class="field"><label>Mensagem</label><textarea name="body" required></textarea></div>
          <button class="btn primary" type="submit">Publicar</button>
        </form>
      </div>` : ""}
    </section>
  `;
}

async function renderMovements(content) {
  const [movementData, employeeData] = await Promise.all([api("/api/movements"), api("/api/employees")]);
  content.innerHTML = `
    ${pageHeader("Movimentações de funcionários", "Histórico completo de admissões, demissões, trocas de posto, escala e supervisor.")}
    ${flashHtml()}
    <section class="grid two">
      <div class="panel">
        <h2>Registrar movimentação</h2>
        <form id="movement-form">
          ${employeeSelect(employeeData.employees)}
          ${selectField("type", "Tipo de movimentação", ["Admissão", "Demissão", "Troca de posto", "Troca de escala", "Troca de supervisor", "Promoção", "Afastamento", "Retorno de afastamento", "Advertência operacional", "Substituição temporária", "Alteração de contrato", "Alteração de cargo"])}
          ${inputField("date", "Data", new Date().toISOString().slice(0, 10), "date")}
          ${inputField("newUnit", "Unidade nova", "Shopping Norte")}
          ${inputField("newPost", "Posto novo", "Portaria 1")}
          <div class="field"><label>Motivo</label><textarea name="reason" required></textarea></div>
          <button class="btn primary" type="submit">Registrar</button>
        </form>
      </div>
      <div class="panel">
        <div class="list">${movementData.movements.map(movementItem).join("") || empty("Nenhuma movimentação encontrada.")}</div>
      </div>
    </section>
  `;
}

async function renderReports(content) {
  const reports = [
    ["employees", "Funcionários ativos"],
    ["admissions", "Admissões"],
    ["terminations", "Demissões"],
    ["movements", "Movimentações"],
    ["routes", "Rotas"],
    ["inspections", "Fiscalizações"],
    ["occurrences", "Ocorrências"],
    ["services", "Serviços"],
    ["monthly", "Mensal consolidado"]
  ];
  content.innerHTML = `
    ${pageHeader("Relatórios", "Exportação operacional em CSV, XLSX e PDF com escopo por perfil.")}
    ${flashHtml()}
    <section class="panel">
      <div class="grid three">
        ${reports.map(([type, label]) => `
          <div class="item">
            <h3>${label}</h3>
            <p>Gerado com filtros de permissão e auditoria automática.</p>
            <div class="row">
              <button class="btn small" data-action="download-report" data-type="${type}" data-format="csv">CSV</button>
              <button class="btn small" data-action="download-report" data-type="${type}" data-format="xlsx">XLSX</button>
              <button class="btn small" data-action="download-report" data-type="${type}" data-format="pdf">PDF</button>
            </div>
          </div>`).join("")}
      </div>
    </section>
  `;
}

async function renderUsers(content) {
  const { users } = await api("/api/users");
  content.innerHTML = `
    ${pageHeader("Usuários e permissões", "Perfis, permissões e segregação de acesso por responsabilidade.")}
    ${flashHtml()}
    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Matrícula</th><th>Perfil</th><th>Status</th><th>Permissões</th></tr></thead>
          <tbody>
            ${users.map((user) => `<tr><td>${h(user.name)}</td><td>${h(user.email)}</td><td>${h(user.enrollment)}</td><td>${roleLabel(user.role)}</td><td>${badge(user.status)}</td><td>${h(user.permissions.join(", "))}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

async function renderSettings(content) {
  const [{ auditLogs }, settingsData] = await Promise.all([
    api("/api/audit"),
    api("/api/settings")
  ]);
  state.settings = settingsData.settings;
  content.innerHTML = `
    ${pageHeader("Configurações e auditoria", "Regras de segurança, sessão, upload, logs técnicos e logs de negócio.")}
    ${flashHtml()}
    <section class="grid two">
      <div class="panel">
        <h2>Chatbot e e-mails operacionais</h2>
        <form id="settings-form">
          <div class="field"><label>Mensagem inicial do chatbot</label><textarea name="chatbotWelcome" rows="4" required>${h(settingsData.settings.chatbotWelcome)}</textarea></div>
          <div class="field"><label>E-mails para registros operacionais</label><textarea name="notificationEmails" rows="4" required>${h((settingsData.settings.notificationEmails || []).join("\n"))}</textarea></div>
          <div class="row">
            <button class="btn primary" type="submit">Salvar configurações</button>
            <button class="btn" type="button" data-action="send-operational-summary">Enviar resumo agora</button>
          </div>
        </form>
        <h2 style="margin-top:18px">Políticas ativas</h2>
        <div class="list">
          ${policy("Sessão", "480 minutos por token local, invalidação no logout.")}
          ${policy("Login", "Bloqueio temporário após 5 tentativas incorretas.")}
          ${policy("Senha", "PBKDF2 com SHA-256, salt individual e comparação segura.")}
          ${policy("Importação", "Validação de obrigatórios, CPF/matrícula, deduplicação e histórico.")}
          ${policy("Auditoria", "Registro de login, importação, CRUD operacional, chatbot e exportação.")}
        </div>
      </div>
      <div class="panel">
        <h2>Fila de e-mails</h2>
        <div class="list">${(settingsData.emailOutbox || []).slice(0, 10).map(emailItem).join("") || empty("Nenhum e-mail operacional registrado.")}</div>
        <h2>Últimos logs</h2>
        <div class="list">${auditLogs.slice(0, 30).map(auditItem).join("")}</div>
      </div>
    </section>
  `;
}

async function renderChatbot(content) {
  const config = await api("/api/chatbot/config");
  ensureChatbotWelcome(config);
  content.innerHTML = `
    ${pageHeader("Chatbot operacional", "Interface guiada para fiscalização, ocorrências, rotas, serviços, consultas e avisos.")}
    ${flashHtml()}
    <section class="chat-layout">
      <div class="panel chat-window">
        <div class="messages" id="chat-messages">${renderMessages()}</div>
        <form class="chat-input" id="chat-input-form">
          <input name="message" autocomplete="off" placeholder="Digite um comando, nome, unidade ou observação">
          <button class="btn primary" type="submit">Enviar</button>
        </form>
      </div>
      <aside class="panel">
        <h2>Ações rápidas</h2>
        <div class="chips">
          ${quickAction("Iniciar fiscalização", "start-inspection")}
          ${quickAction("Ver minhas rotas", "show-routes")}
          ${quickAction("Registrar ocorrência", "start-occurrence")}
          ${quickAction("Consultar funcionário", "query-employee")}
          ${quickAction("Abrir central de serviços", "show-services")}
          ${quickAction("Ver mural de avisos", "show-notices")}
          ${quickAction("Ver pendências", "show-pending")}
          ${quickAction("Finalizar atividade", "finish-activity")}
        </div>
      </aside>
    </section>
  `;
  scrollChat();
}

function ensureChatbotWelcome(config = {}) {
  if (state.chatbot.messages.length > 0) return;
  pushBot(config.chatbotWelcome || "Olá, sou o Assistente Operacional. O que você deseja fazer agora?", [
    action("Iniciar fiscalização", "start-inspection"),
    action("Ver minhas rotas", "show-routes"),
    action("Registrar ocorrência", "start-occurrence"),
    action("Consultar funcionário", "query-employee"),
    action("Abrir central de serviços", "show-services"),
    action("Ver mural de avisos", "show-notices"),
    action("Ver pendências", "show-pending"),
    action("Finalizar atividade", "finish-activity")
  ]);
}

function renderMessages() {
  return state.chatbot.messages.map((message) => `
    <div class="message ${message.from}">
      <div class="bubble">${h(message.text)}</div>
      ${message.form ? renderChatForm(message.form) : ""}
      ${message.actions?.length ? `<div class="chips">${message.actions.map((item) => `<button class="chip" data-action="chat-action" data-chat-action="${h(item.action)}" data-value="${h(item.value ?? "")}">${h(item.label)}</button>`).join("")}</div>` : ""}
    </div>
  `).join("");
}

function renderChatForm(form) {
  if (form.type === "checklist") {
    return `
      <form class="chat-form" data-form="route-checklist" data-inspection-id="${h(form.inspectionId)}" data-point-id="${h(form.point.id)}">
        ${form.point.checklist.map((question, index) => `
          <div class="check-row">
            <strong>${h(question)}</strong>
            <label><input type="radio" name="q${index}" value="Sim" required> Sim</label>
            <label><input type="radio" name="q${index}" value="Nao" required> Não</label>
            <input type="hidden" name="question${index}" value="${h(question)}">
          </div>`).join("")}
        <div class="field"><label>Evidência ou observação</label><input name="evidence" placeholder="Ex.: foto anexada, livro conferido, portaria regular"></div>
        <button class="btn primary" type="submit">Salvar ponto visitado</button>
      </form>
    `;
  }
  return "";
}

async function handleChatAction(chatAction, value) {
  await logChat(chatAction);

  const flow = state.chatbot.flow;
  if (chatAction === "start-occurrence") return startOccurrenceFlow();
  if (chatAction === "start-inspection" || chatAction === "show-routes") return showRoutesInChat();
  if (chatAction === "query-employee") return askEmployeeQuery();
  if (chatAction === "show-services") return showServicesInChat();
  if (chatAction === "show-notices") return showNoticesInChat();
  if (chatAction === "show-pending") return showPendingInChat();
  if (chatAction === "finish-activity") return finishActivityInChat();

  if (flow?.name === "occurrence") {
    return handleOccurrenceFlow(chatAction, value);
  }

  if (chatAction === "chat-start-route") return startRouteInChat(value);
  if (chatAction === "chat-visit-point") return openChecklistInChat(value);
  if (chatAction === "chat-finish-inspection") return finishInspectionInChat();
  if (chatAction === "chat-complete-task") return completeTaskInChat(value);
}

function startOccurrenceFlow() {
  pushUser("Registrar ocorrencia");
  state.chatbot.flow = { name: "occurrence", step: "type", draft: {} };
  pushBot("Qual tipo de ocorrência deseja registrar?", occurrenceTypes.map((type) => action(type, "occ-type", type)));
  rerenderChat();
}

async function handleOccurrenceFlow(chatAction, value) {
  const flow = state.chatbot.flow;

  if (chatAction === "occ-type") {
    flow.draft.type = value;
    flow.step = "service";
    pushUser(value);
    pushBot("Qual serviço está relacionado a esta ocorrência?", serviceTypes.map((service) => action(service, "occ-service", service)));
    return rerenderChat();
  }

  if (chatAction === "occ-service") {
    flow.draft.serviceRelated = value;
    flow.step = "unit";
    pushUser(value);
    const { summary } = await api("/api/employees");
    const units = summary.byUnit.map((item) => item.label);
    pushBot("Informe a unidade. Voce pode escolher uma opcao ou digitar no campo abaixo.", units.map((unit) => action(unit, "occ-unit", unit)));
    return rerenderChat();
  }

  if (chatAction === "occ-unit") {
    flow.draft.unit = value;
    flow.step = "employee-decision";
    pushUser(value);
    pushBot("Existe funcionário envolvido?", [action("Sim, pesquisar funcionário", "occ-employee-yes"), action("Não há funcionário envolvido", "occ-employee-no")]);
    return rerenderChat();
  }

  if (chatAction === "occ-employee-yes") {
    flow.step = "employee-search";
    pushUser("Sim");
    pushBot("Digite nome, CPF ou matrícula do funcionário envolvido.");
    return rerenderChat();
  }

  if (chatAction === "occ-employee-no") {
    flow.step = "description";
    flow.draft.employeeId = "";
    pushUser("Não há funcionário envolvido");
    pushBot("Descreva a ocorrência com objetividade. Inclua posto, horário e impacto operacional.");
    return rerenderChat();
  }

  if (chatAction === "occ-employee-select") {
    const { employees } = await api(`/api/employees?search=${encodeURIComponent(value)}`);
    const employee = employees.find((candidate) => candidate.id === value);
    flow.draft.employeeId = employee?.id ?? "";
    flow.draft.employeeName = employee?.fullName ?? "";
    flow.step = "description";
    pushUser(employee?.fullName ?? "Funcionário selecionado");
    pushBot("Descreva a ocorrência com objetividade. Inclua posto, horário e impacto operacional.");
    return rerenderChat();
  }

  if (chatAction === "occ-priority") {
    flow.draft.priority = value;
    flow.step = "confirm";
    pushUser(value);
    pushBot(`Revise antes de salvar:\nTipo: ${flow.draft.type}\nServiço: ${flow.draft.serviceRelated}\nUnidade: ${flow.draft.unit}\nFuncionário: ${flow.draft.employeeName || "Não informado"}\nPrioridade: ${flow.draft.priority}\nDescrição: ${flow.draft.description}`, [
      action("Confirmar e gerar protocolo", "occ-confirm"),
      action("Cancelar", "occ-cancel")
    ]);
    return rerenderChat();
  }

  if (chatAction === "occ-confirm") {
    const { occurrence } = await api("/api/occurrences", {
      method: "POST",
      body: flow.draft
    });
    pushUser("Confirmar");
    pushBot(`Ocorrência salva com sucesso. Protocolo: ${occurrence.protocol}. O registro já está disponível para acompanhamento e auditoria.`, [
      action("Registrar outra ocorrência", "start-occurrence"),
      action("Ver pendências", "show-pending")
    ]);
    state.chatbot.flow = null;
    return rerenderChat();
  }

  if (chatAction === "occ-cancel") {
    state.chatbot.flow = null;
    pushUser("Cancelar");
    pushBot("Registro cancelado. Nenhuma informação incompleta foi salva.");
    return rerenderChat();
  }
}

async function showRoutesInChat() {
  pushUser("Ver minhas rotas");
  const { routes } = await api("/api/routes");
  if (!routes.length) {
    pushBot("Não encontrei rotas disponíveis para o seu perfil.");
  } else {
    pushBot("Escolha a rota que deseja iniciar:", routes.map((route) => action(`${route.name} · ${route.status}`, "chat-start-route", route.id)));
  }
  rerenderChat();
}

async function startRouteInChat(routeId) {
  const { inspection, route } = await api(`/api/routes/${routeId}/start`, { method: "POST", body: {} });
  state.chatbot.activeInspection = inspection;
  state.chatbot.activeRoute = route;
  pushUser(route.name);
  pushBot(`Rota iniciada: ${route.name}.\nPontos previstos: ${route.points.map((point) => point.name).join(", ")}.`, route.points.map((point) => action(`Visitar ${point.name}`, "chat-visit-point", point.id)));
  rerenderChat();
}

function openChecklistInChat(pointId) {
  const route = state.chatbot.activeRoute;
  const inspection = state.chatbot.activeInspection;
  const point = route?.points.find((candidate) => candidate.id === pointId);
  if (!point || !inspection) {
    pushBot("Não há rota ativa para preencher checklist.");
    return rerenderChat();
  }
  pushUser(`Visitar ${point.name}`);
  pushBot(`Checklist obrigatorio do ponto ${point.name}.`, [], {
    type: "checklist",
    inspectionId: inspection.id,
    point
  });
  rerenderChat();
}

async function saveChecklist(form) {
  const inspectionId = form.dataset.inspectionId;
  const pointId = form.dataset.pointId;
  const data = new FormData(form);
  const answers = [];
  for (const [key, value] of data.entries()) {
    if (key.startsWith("q")) {
      const index = key.slice(1);
      answers.push({
        question: data.get(`question${index}`),
        answer: value
      });
    }
  }
  const result = await api(`/api/inspections/${inspectionId}/visit-point`, {
    method: "POST",
    body: {
      pointId,
      answers,
      evidence: data.get("evidence")
    }
  });
  state.chatbot.activeInspection = result.inspection;
  const route = state.chatbot.activeRoute;
  const remaining = route.points.filter((point) => !result.inspection.visitedPoints.some((visited) => visited.pointId === point.id));
  pushUser("Checklist salvo");
  if (remaining.length) {
    pushBot("Ponto registrado. Deseja registrar ocorrência ou seguir para o próximo ponto?", [
      action("Registrar ocorrencia", "start-occurrence"),
      ...remaining.map((point) => action(`Visitar ${point.name}`, "chat-visit-point", point.id))
    ]);
  } else {
    pushBot("Todos os pontos foram visitados. Posso finalizar a rota e gerar o resumo operacional.", [
      action("Finalizar rota", "chat-finish-inspection"),
      action("Registrar ocorrência antes de finalizar", "start-occurrence")
    ]);
  }
  rerenderChat();
}

async function finishInspectionInChat() {
  const inspection = state.chatbot.activeInspection;
  if (!inspection) {
    pushBot("Não há fiscalização ativa para finalizar.");
    return rerenderChat();
  }
  const result = await api(`/api/inspections/${inspection.id}/finish`, { method: "POST", body: {} });
  pushUser("Finalizar rota");
  pushBot(`Rota finalizada com status: ${result.inspection.status}.\nPontos visitados: ${result.inspection.visitedCount}.\nO histórico ficou disponível nos relatórios e auditoria.`);
  state.chatbot.activeInspection = null;
  state.chatbot.activeRoute = null;
  rerenderChat();
}

function askEmployeeQuery() {
  pushUser("Consultar funcionário");
  state.chatbot.flow = { name: "employee-query", step: "search" };
  pushBot("Digite nome, CPF, matrícula, cargo, unidade ou posto para consultar funcionários ativos.");
  rerenderChat();
}

async function showServicesInChat() {
  pushUser("Abrir central de serviços");
  const { serviceTasks } = await api("/api/services");
  if (!serviceTasks.length) {
    pushBot("Não há serviços atribuídos ao seu perfil.");
  } else {
    pushBot(`Encontrei ${serviceTasks.length} servico(s):\n${serviceTasks.slice(0, 6).map((task) => `${task.title} · ${task.priority} · ${task.status}`).join("\n")}`, serviceTasks.filter((task) => task.status !== "Resolvido").slice(0, 6).map((task) => action(`Concluir ${task.title}`, "chat-complete-task", task.id)));
  }
  rerenderChat();
}

async function completeTaskInChat(taskId) {
  const { serviceTask } = await api(`/api/services/${taskId}`, {
    method: "PATCH",
    body: {
      status: "Resolvido",
      comment: "Resolvido via chatbot operacional."
    }
  });
  pushUser(`Concluir ${serviceTask.title}`);
  pushBot(`Serviço concluído: ${serviceTask.title}. O histórico foi atualizado.`);
  rerenderChat();
}

async function showNoticesInChat() {
  pushUser("Ver mural de avisos");
  const { notices } = await api("/api/notices");
  pushBot(notices.length ? notices.slice(0, 6).map((notice) => `${notice.priority} · ${notice.title}\n${notice.body}`).join("\n\n") : "Não há avisos publicados.");
  rerenderChat();
}

async function showPendingInChat() {
  pushUser("Ver pendências");
  const [occurrences, services] = await Promise.all([api("/api/occurrences"), api("/api/services")]);
  const openOccurrences = occurrences.occurrences.filter((item) => !["Resolvida", "Cancelada"].includes(item.status));
  const openServices = services.serviceTasks.filter((item) => !["Resolvido", "Cancelado"].includes(item.status));
  pushBot(`Pendências atuais:\nOcorrências abertas: ${openOccurrences.length}\nServiços em aberto: ${openServices.length}\n${openOccurrences.slice(0, 4).map((item) => `${item.protocol} · ${item.type} · ${item.priority}`).join("\n")}`);
  rerenderChat();
}

function finishActivityInChat() {
  pushUser("Finalizar atividade");
  state.chatbot.flow = null;
  pushBot("Atividade encerrada. Todas as ações salvas permanecem disponíveis no histórico e na auditoria.", [
    action("Iniciar nova fiscalização", "start-inspection"),
    action("Registrar ocorrencia", "start-occurrence")
  ]);
  rerenderChat();
}

async function handleChatInput(message) {
  const text = message.trim();
  if (!text) return;
  const normalized = normalize(text);
  const flow = state.chatbot.flow;
  pushUser(text);
  await logChat(text);

  if (flow?.name === "occurrence") {
    if (flow.step === "unit") {
      flow.draft.unit = text;
      flow.step = "employee-decision";
      pushBot("Existe funcionário envolvido?", [action("Sim, pesquisar funcionário", "occ-employee-yes"), action("Não há funcionário envolvido", "occ-employee-no")]);
    } else if (flow.step === "employee-search") {
      const { employees } = await api(`/api/employees?search=${encodeURIComponent(text)}`);
      if (!employees.length) {
        pushBot("Não encontrei funcionário com esse critério. Deseja continuar sem funcionario envolvido?", [action("Continuar sem funcionário", "occ-employee-no")]);
      } else {
        pushBot("Selecione o funcionário encontrado:", employees.slice(0, 8).map((employee) => action(`${employee.fullName} · ${employee.enrollment} · ${employee.unit}`, "occ-employee-select", employee.id)));
      }
    } else if (flow.step === "description") {
      flow.draft.description = text;
      flow.step = "priority";
      pushBot("Qual prioridade deve ser atribuída?", priorities.map((priority) => action(priority, "occ-priority", priority)));
    } else {
      pushBot("Use uma das opcoes para seguir com o registro sem inconsistencias.");
    }
    return rerenderChat();
  }

  if (flow?.name === "employee-query") {
    const { employees } = await api(`/api/employees?search=${encodeURIComponent(text)}`);
    pushBot(employees.length ? employees.slice(0, 8).map((employee) => `${employee.fullName} · ${employee.enrollment}\n${employee.position} · ${employee.serviceType}\n${employee.unit} / ${employee.workPost} · ${employee.status}`).join("\n\n") : "Não encontrei funcionários com esse critério.");
    state.chatbot.flow = null;
    return rerenderChat();
  }

  if (normalized.includes("ocorrencia") || normalized.includes("faltou") || normalized.includes("posto sem cobertura")) return startOccurrenceFlow();
  if (normalized.includes("rota") || normalized.includes("fiscalizacao")) return showRoutesInChat();
  if (normalized.includes("funcionario")) return askEmployeeQuery();
  if (normalized.includes("servico") || normalized.includes("central")) return showServicesInChat();
  if (normalized.includes("aviso") || normalized.includes("mural")) return showNoticesInChat();
  if (normalized.includes("pendencia")) return showPendingInChat();

  pushBot("Entendi. Posso conduzir a acao por um dos fluxos guiados abaixo.", [
    action("Iniciar fiscalizacao", "start-inspection"),
    action("Registrar ocorrencia", "start-occurrence"),
    action("Consultar funcionário", "query-employee"),
    action("Abrir central de serviços", "show-services")
  ]);
  rerenderChat();
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;

  if (target.dataset.view) {
    state.view = target.dataset.view;
    renderApp();
    return;
  }

  const actionName = target.dataset.action;
  if (!actionName) return;

  try {
    if (actionName === "demo-fill") {
      document.querySelector("#login").value = target.dataset.login;
      document.querySelector("#password").value = target.dataset.password;
      return;
    }

    if (actionName === "recover-password") {
      renderLogin("Fluxo de recuperação preparado para integração com e-mail corporativo.");
      return;
    }

    if (actionName === "logout") {
      await api("/api/auth/logout", { method: "POST", body: {} });
      resetSession();
      renderLogin();
      return;
    }

    if (actionName === "clear-employee-filter") {
      state.filters.employees = {
        enrollment: "",
        search: "",
        cpf: "",
        position: "",
        unit: "",
        workPost: "",
        company: "",
        contract: "",
        serviceType: "",
        status: ""
      };
      state.selectedEmployeeId = "";
      state.editingEmployeeId = "";
      renderView();
      return;
    }

    if (actionName === "clear-dashboard-filter") {
      state.filters.dashboard = {
        enrollment: "",
        unit: "",
        position: "",
        company: ""
      };
      renderView();
      return;
    }

    if (actionName === "employee-select") {
      state.selectedEmployeeId = target.dataset.id;
      state.editingEmployeeId = "";
      renderView();
      return;
    }

    if (actionName === "employee-edit") {
      state.selectedEmployeeId = target.dataset.id;
      state.editingEmployeeId = target.dataset.id;
      renderView();
      return;
    }

    if (actionName === "employee-cancel-edit") {
      state.editingEmployeeId = "";
      renderView();
      return;
    }

    if (actionName === "clear-service-filter") {
      state.filters.services = "";
      renderView();
      return;
    }

    if (actionName === "route-start") {
      await api(`/api/routes/${target.dataset.id}/start`, { method: "POST", body: {} });
      flash("Rota iniciada com sucesso.");
      renderView();
      return;
    }

    if (actionName === "route-cancel-edit") {
      renderView();
      return;
    }

    if (actionName === "task-status") {
      await api(`/api/services/${target.dataset.id}`, {
        method: "PATCH",
        body: { status: target.dataset.status, comment: "Atualizado pela interface operacional." }
      });
      flash("Serviço atualizado.");
      renderView();
      return;
    }

    if (actionName === "download-report") {
      await downloadReport(target.dataset.type, target.dataset.format);
      return;
    }

    if (actionName === "send-operational-summary") {
      const result = await api("/api/notifications/operational-summary", { method: "POST", body: {} });
      flash(`Resumo operacional registrado para ${result.notification.to.length} e-mail(s). Status: ${result.notification.status}.`);
      renderView();
      return;
    }

    if (actionName === "chat-action") {
      await handleChatAction(target.dataset.chatAction, target.dataset.value);
    }
  } catch (error) {
    flash(error.message, "error");
    renderView();
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);

  try {
    if (form.id === "login-form") {
      const result = await api("/api/auth/login", {
        method: "POST",
        body: {
          login: formData.get("login"),
          password: formData.get("password")
        },
        skipAuth: true
      });
      state.token = result.token;
      state.user = result.user;
      state.view = result.redirectTo;
      localStorage.setItem("fiscalizapro.token", state.token);
      renderApp();
      return;
    }

    if (form.id === "employee-filter-form") {
      state.filters.employees = {
        enrollment: formData.get("enrollment") || "",
        search: formData.get("search") || "",
        cpf: formData.get("cpf") || "",
        position: formData.get("position") || "",
        unit: formData.get("unit") || "",
        workPost: formData.get("workPost") || "",
        company: formData.get("company") || "",
        contract: formData.get("contract") || "",
        serviceType: formData.get("serviceType") || "",
        status: formData.get("status") || ""
      };
      state.selectedEmployeeId = "";
      state.editingEmployeeId = "";
      renderView();
      return;
    }

    if (form.id === "dashboard-filter-form") {
      state.filters.dashboard = {
        enrollment: formData.get("enrollment") || "",
        unit: formData.get("unit") || "",
        position: formData.get("position") || "",
        company: formData.get("company") || ""
      };
      renderView();
      return;
    }

    if (form.id === "employee-edit-form") {
      const body = Object.fromEntries(formData.entries());
      const { employee } = await api(`/api/employees/${form.dataset.id}`, { method: "PATCH", body });
      state.selectedEmployeeId = employee.id;
      state.editingEmployeeId = "";
      flash("Funcionário atualizado.");
      renderView();
      return;
    }

    if (form.id === "employee-import-form") {
      await importEmployees(form);
      renderView();
      return;
    }

    if (form.id === "route-create-form" || form.dataset.form === "route-edit-form") {
      const body = routePayloadFromForm(formData);
      if (form.dataset.form === "route-edit-form") {
        await api(`/api/routes/${form.dataset.id}`, { method: "PATCH", body });
        flash("Rota atualizada com sucesso.");
      } else {
        await api("/api/routes", { method: "POST", body });
        flash("Rota criada com sucesso.");
      }
      renderView();
      return;
    }

    if (form.id === "service-filter-form") {
      state.filters.services = formData.get("search");
      renderView();
      return;
    }

    if (form.id === "occurrence-filter-form") {
      state.filters.occurrences = formData.get("search");
      renderView();
      return;
    }

    if (form.id === "occurrence-form") {
      const body = Object.fromEntries(formData.entries());
      await api("/api/occurrences", { method: "POST", body });
      flash("Ocorrência registrada com protocolo automático.");
      renderView();
      return;
    }

    if (form.id === "notice-form") {
      await api("/api/notices", { method: "POST", body: Object.fromEntries(formData.entries()) });
      flash("Aviso publicado.");
      renderView();
      return;
    }

    if (form.id === "movement-form") {
      await api("/api/movements", { method: "POST", body: Object.fromEntries(formData.entries()) });
      flash("Movimentação registrada e histórico atualizado.");
      renderView();
      return;
    }

    if (form.id === "settings-form") {
      const result = await api("/api/settings", {
        method: "PATCH",
        body: {
          chatbotWelcome: formData.get("chatbotWelcome"),
          notificationEmails: splitFormList(formData.get("notificationEmails"))
        }
      });
      state.settings = result.settings;
      state.chatbot.messages = [];
      flash("Configurações operacionais atualizadas.");
      renderView();
      return;
    }

    if (form.id === "chat-input-form") {
      const input = form.querySelector("input[name='message']");
      await handleChatInput(input.value);
      input.value = "";
      return;
    }

    if (form.dataset.form === "route-checklist") {
      await saveChecklist(form);
    }
  } catch (error) {
    if (state.view === "chatbot") {
      pushBot(`Não consegui concluir a ação: ${error.message}`);
      rerenderChat();
    } else if (!state.user) {
      renderLogin(error.message);
    } else {
      flash(error.message, "error");
      renderView();
    }
  }
});

async function importEmployees(form) {
  const file = form.querySelector("input[type='file']").files[0];
  if (!file) {
    throw new Error("Selecione um arquivo CSV, TSV ou XLSX.");
  }

  let content;
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    content = await toBase64(await file.arrayBuffer());
  } else {
    content = await textFromFile(file);
  }

  const result = await api("/api/employees/import", {
    method: "POST",
    body: {
      fileName: file.name,
      content
    }
  });

  flash(`Importação concluída: ${result.batch.inserted} inseridos, ${result.batch.updated} atualizados, ${result.batch.errors} erros.`);
  if (result.batch.errors > 0) {
    flash(`Importação concluída com ${result.batch.errors} erro(s). ${result.batch.inserted} inseridos e ${result.batch.updated} atualizados.`, "error");
  }
}

function routePayloadFromForm(formData) {
  return {
    name: formData.get("name"),
    description: formData.get("description"),
    fiscalId: formData.get("fiscalId"),
    supervisorId: formData.get("supervisorId"),
    unit: formData.get("unit"),
    client: formData.get("client"),
    frequency: formData.get("frequency"),
    scheduledTime: formData.get("scheduledTime"),
    services: splitFormList(formData.get("services")),
    status: formData.get("status"),
    requiresPhoto: formData.has("requiresPhoto"),
    requiresGeolocation: formData.has("requiresGeolocation"),
    deadlineHours: Number(formData.get("deadlineHours") || 4),
    points: parseRoutePointsInput(formData.get("points")),
    observations: formData.get("observations")
  };
}

function parseRoutePointsInput(value) {
  return String(value || "").split(/\r?\n/).map((line, index) => {
    const [name, checklist = "Presença no posto; Uniforme e EPIs; Registro de ocorrências"] = line.split("|");
    return {
      order: index + 1,
      name: name.trim(),
      checklist: splitFormList(checklist)
    };
  }).filter((point) => point.name);
}

function splitFormList(value) {
  return String(value || "").split(/[;,\n]/).map((item) => item.trim()).filter(Boolean);
}

async function downloadReport(type, format) {
  const extra = type === "employees" ? employeeQuery().replace("?", "&") : "";
  const response = await fetch(`/api/reports/${type}?format=${format}${extra}`, {
    headers: {
      Authorization: `Bearer ${state.token}`
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "Não foi possível exportar o relatório.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${type}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (state.token && !options.skipAuth) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !options.skipAuth) {
      resetSession();
      renderLogin("Sua sessão expirou. Entre novamente.");
    }
    throw new Error(payload.message || payload.error || "Erro ao processar solicitação.");
  }
  return payload;
}

function allowedViews() {
  return menu.filter(([, , , roles]) => roles.includes(state.user.role));
}

function pageHeader(title, subtitle) {
  return `
    <header class="topbar">
      <div>
        <h1>${h(title)}</h1>
        <div class="subtle">${h(subtitle)}</div>
      </div>
      <div class="row">
        <button class="btn ghost" data-view="chatbot">Chatbot</button>
        <button class="btn" data-action="logout">Sair</button>
      </div>
    </header>
  `;
}

function metric(label, value, help) {
  return `<div class="metric"><span>${h(label)}</span><strong>${h(value)}</strong><small>${h(help)}</small></div>`;
}

function securityDashboardIntro(dashboard) {
  const activeFilters = Object.values(state.filters.dashboard).filter(Boolean).length;
  return `
    <section class="security-intro">
      <div>
        <span class="eyebrow">Segurança patrimonial</span>
        <h2>Visão operacional por posto, empresa e equipe</h2>
        <p>Monitore cobertura, movimentações, rotas e ocorrências com recorte direto da base de funcionários.</p>
      </div>
      <div class="security-kpis">
        <div><span>Filtros ativos</span><strong>${h(activeFilters)}</strong></div>
        <div><span>Base visível</span><strong>${h(dashboard.metrics.activeEmployees + dashboard.metrics.inactiveEmployees)}</strong></div>
        <div><span>Alertas</span><strong>${h(dashboard.summary?.attention?.length || 0)}</strong></div>
      </div>
    </section>
  `;
}

function dashboardSummary(summary) {
  if (!summary) return "";
  return `
    <section class="panel" style="margin-bottom:16px">
      <div class="row space-between">
        <div>
          <h2>Resumo operacional</h2>
          <p class="subtle">${h(summary.headline)}</p>
        </div>
        ${summary.attention?.length ? `<span class="badge danger">${h(summary.attention.length)} alerta(s)</span>` : `<span class="badge success">Operação estável</span>`}
      </div>
      <div class="grid three" style="margin-top:12px">
        ${(summary.cards || []).map((item) => `
          <article class="item">
            <h3>${h(item.label)}</h3>
            <strong>${h(item.value)}</strong>
            <p class="subtle">${h(item.detail)}</p>
          </article>
        `).join("")}
      </div>
      ${summary.attention?.length ? `<div class="list" style="margin-top:12px">${summary.attention.map((item) => `<div class="item">${h(item)}</div>`).join("")}</div>` : ""}
    </section>
  `;
}

function chartPanel(title, items) {
  return `<div class="panel"><h2>${h(title)}</h2>${barChart(items)}</div>`;
}

function dashboardQuery() {
  return queryFromFilters(state.filters.dashboard);
}

function dashboardFilters(options = {}) {
  const filters = state.filters.dashboard;
  return `
    <section class="operations-filter">
      <div>
        <h2>Filtro operacional</h2>
        <p class="subtle">Refine o painel por dados da relação de funcionários.</p>
      </div>
      <form class="filter-grid compact" id="dashboard-filter-form">
        ${selectWithOptions("enrollment", "Matrícula", options.enrollment, filters.enrollment)}
        ${selectWithOptions("unit", "Centro de custo", options.unit, filters.unit)}
        ${selectWithOptions("position", "Cargo", options.position, filters.position)}
        ${selectWithOptions("company", "Empresa", options.company, filters.company)}
        <button class="btn primary" type="submit">Aplicar</button>
        <button class="btn ghost" type="button" data-action="clear-dashboard-filter">Limpar</button>
      </form>
    </section>
  `;
}

function barChart(items) {
  if (!items?.length) return empty("Sem dados para o período.");
  const max = Math.max(...items.map((item) => item.value), 1);
  return `<div class="chart">${items.map((item) => `
    <div class="bar-row">
      <span>${h(item.label)}</span>
      <div class="bar-track"><div class="bar" style="width:${Math.max(5, (item.value / max) * 100)}%"></div></div>
      <strong>${h(item.value)}</strong>
    </div>`).join("")}</div>`;
}

function employeeQuery() {
  return queryFromFilters(state.filters.employees);
}

function queryFromFilters(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}

function employeeFilters(options = {}) {
  const filters = state.filters.employees;
  return `
    <form class="employee-filters filter-grid" id="employee-filter-form">
      ${selectWithOptions("enrollment", "Matrícula", options.enrollment, filters.enrollment)}
      ${selectWithOptions("unit", "Centro de custo", options.unit, filters.unit)}
      ${selectWithOptions("position", "Cargo", options.position, filters.position)}
      ${selectWithOptions("company", "Empresa", options.company, filters.company)}
      <input name="search" value="${h(filters.search)}" placeholder="Buscar geral">
      <input name="cpf" value="${h(filters.cpf)}" placeholder="CPF">
      <input name="serviceType" value="${h(filters.serviceType)}" placeholder="Serviço">
      <input name="workPost" value="${h(filters.workPost)}" placeholder="Filial/Posto">
      <input name="contract" value="${h(filters.contract)}" placeholder="Contrato">
      <select name="status">
        <option value="">Status</option>
        <option value="Ativo" ${filters.status === "Ativo" ? "selected" : ""}>Ativo</option>
        <option value="Inativo" ${filters.status === "Inativo" ? "selected" : ""}>Inativo</option>
      </select>
      <button class="btn primary" type="submit">Filtrar</button>
      <button class="btn ghost" type="button" data-action="clear-employee-filter">Limpar</button>
    </form>
  `;
}

function selectWithOptions(name, label, values = [], selected = "") {
  return `
    <label class="filter-field">
      <span>${h(label)}</span>
      <select name="${h(name)}">
        <option value="">Todos</option>
        ${(values || []).map((value) => `<option value="${h(value)}" ${String(value) === String(selected) ? "selected" : ""}>${h(value)}</option>`).join("")}
      </select>
    </label>
  `;
}

function employeeTable(employees) {
  if (!employees.length) return empty("Nenhum funcionário encontrado.");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Funcionário</th><th>CPF</th><th>Cargo</th><th>Centro de custo</th><th>Empresa</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${employees.map((employee) => `<tr>
            <td><strong>${h(employee.fullName)}</strong><br><span class="subtle">${h(employee.enrollment)} · ${h(employee.email || employee.phone || "")}</span></td>
            <td>${h(formatCpf(employee.cpf))}</td>
            <td>${h(employee.position)}</td>
            <td>${h(employee.unit)}</td>
            <td>${h(employee.company || employee.contract || "Não informado")}</td>
            <td>${badge(employee.status)}</td>
            <td><button class="btn small ${state.selectedEmployeeId === employee.id ? "primary" : ""}" data-action="employee-select" data-id="${h(employee.id)}">Ver</button></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function employeeDetail(employee) {
  if (!employee) return `<aside class="employee-detail">${empty("Selecione um funcionário para ver os dados.")}</aside>`;
  if (state.editingEmployeeId === employee.id && state.user.role === "ADMIN_OPERACIONAL") {
    return employeeEditForm(employee);
  }
  return `
    <aside class="employee-detail">
      <div class="row space-between">
        <div>
          <h2>${h(employee.fullName)}</h2>
          <p class="subtle">${h(employee.enrollment)} · ${h(formatCpf(employee.cpf))}</p>
        </div>
        ${state.user.role === "ADMIN_OPERACIONAL" ? `<button class="btn small" data-action="employee-edit" data-id="${h(employee.id)}">Editar</button>` : ""}
      </div>
      <div class="detail-grid">
        ${detail("Cargo", employee.position)}
        ${detail("Serviço", employee.serviceType)}
        ${detail("Centro de custo", employee.unit)}
        ${detail("Filial/Posto", employee.workPost)}
        ${detail("Empresa", employee.company)}
        ${detail("Contrato", employee.contract)}
        ${detail("Admissão", employee.admissionDate)}
        ${detail("Status", employee.status)}
        ${detail("Supervisor", employee.supervisorName)}
        ${detail("Telefone", employee.phone)}
        ${detail("E-mail", employee.email)}
        ${detail("Contrato até", employee.contractEndDate)}
      </div>
      ${employee.notes ? `<p class="subtle">${h(employee.notes)}</p>` : ""}
    </aside>
  `;
}

function employeeEditForm(employee) {
  return `
    <aside class="employee-detail">
      <div class="row space-between">
        <h2>Editar funcionário</h2>
        <button class="btn small ghost" type="button" data-action="employee-cancel-edit">Cancelar</button>
      </div>
      <form id="employee-edit-form" data-id="${h(employee.id)}">
        <div class="grid two">
          ${editField("fullName", "Nome", employee.fullName)}
          ${editField("enrollment", "Matrícula", employee.enrollment)}
          ${editField("cpf", "CPF", formatCpf(employee.cpf))}
          ${editField("position", "Cargo", employee.position)}
          ${editField("serviceType", "Serviço", employee.serviceType)}
          ${editField("unit", "Centro de custo", employee.unit)}
          ${editField("workPost", "Filial/Posto", employee.workPost)}
          ${editField("company", "Empresa", employee.company)}
          ${editField("contract", "Contrato", employee.contract)}
          ${editField("supervisorName", "Supervisor", employee.supervisorName)}
          ${editField("phone", "Telefone", employee.phone)}
          ${editField("email", "E-mail", employee.email, "email")}
          ${editField("admissionDate", "Admissão", employee.admissionDate, "date")}
          ${editField("contractEndDate", "Contrato até", employee.contractEndDate, "date")}
          ${selectField("status", "Status", ["Ativo", "Inativo"], employee.status)}
        </div>
        <div class="field"><label>Observações</label><textarea name="notes" rows="3">${h(employee.notes || "")}</textarea></div>
        <button class="btn primary" type="submit">Salvar funcionário</button>
      </form>
    </aside>
  `;
}

function editField(name, label, value = "", type = "text") {
  return `<div class="field"><label>${h(label)}</label><input name="${h(name)}" type="${h(type)}" value="${h(value || "")}"></div>`;
}

function detail(label, value) {
  return `<div class="detail-item"><span>${h(label)}</span><strong>${h(value || "Não informado")}</strong></div>`;
}

function compactList(title, items = []) {
  return `
    <section class="panel quiet">
      <h2>${h(title)}</h2>
      <div class="compact-list">${(items || []).slice(0, 8).map((item) => `<div><span>${h(item.label)}</span><strong>${h(item.value)}</strong></div>`).join("") || empty("Sem dados.")}</div>
    </section>
  `;
}

function importBox() {
  return `
    <form id="employee-import-form" class="import-inline">
      <h2>Importar planilha de funcionários</h2>
      <p class="subtle">Aceita XLSX, CSV ou TSV. Reconhece matrícula, nome, CPF, cargo, centro de custo, filial/posto, empresa, contrato, admissão, desligamento, telefone, e-mail e status.</p>
      <div class="row">
        <input type="file" name="file" accept=".csv,.tsv,.txt,.xlsx" required>
        <button class="btn primary" type="submit">Importar e validar</button>
      </div>
      <p class="subtle">Se CPF ou matrícula já existir, o registro é atualizado. Se não existir, o funcionário é criado.</p>
    </form>
  `;
}

function routeForm(route, users) {
  const isEdit = Boolean(route);
  const formId = isEdit ? "" : `id="route-create-form"`;
  const dataAttrs = isEdit ? `data-form="route-edit-form" data-id="${h(route.id)}"` : "";
  const title = isEdit ? "Editar rota" : "Criar nova rota";
  return `
    <form ${formId} ${dataAttrs} class="panel" style="margin-bottom:16px">
      <h2>${title}</h2>
      <div class="grid two">
        ${routeInput("name", "Nome da rota", route?.name || "", "Rota Shopping Norte")}
        ${routeInput("unit", "Unidade", route?.unit || "", "Shopping Norte")}
        ${selectField("fiscalId", "Fiscal", routeUserOptions(users, "FISCAL_OPERACIONAL"), route?.fiscalId)}
        ${selectField("supervisorId", "Supervisor", routeUserOptions(users, "SUPERVISOR_OPERACIONAL"), route?.supervisorId)}
        ${routeInput("scheduledTime", "Horário", route?.scheduledTime || "", "08:00", "time")}
        ${selectField("frequency", "Frequência", ["Diaria", "Semanal", "Quinzenal", "Mensal"], route?.frequency || "Diaria")}
        ${routeInput("client", "Cliente", route?.client || "", route?.unit || "Shopping Norte")}
        ${routeInput("deadlineHours", "Prazo em horas", route?.deadlineHours || 4, "4", "number")}
        ${isEdit ? selectField("status", "Status", ["Programada", "Em andamento", "Atrasada", "Concluida", "Cancelada"], route.status || "Programada") : ""}
      </div>
      <div class="field"><label>Descrição</label><input name="description" value="${h(route?.description || "")}" placeholder="Objetivo da fiscalização"></div>
      <div class="field"><label>Serviços</label><input name="services" value="${h((route?.services || []).join(", "))}" placeholder="Portaria, Vigilância patrimonial, CFTV"></div>
      <div class="field"><label>Pontos da rota</label><textarea name="points" rows="4" placeholder="Portaria 1 | Presença no posto; Uniforme; Livro de ocorrência&#10;CFTV | Equipamentos ligados; Registro de falhas">${h(routePointsText(route))}</textarea></div>
      <div class="field"><label>Observações</label><textarea name="observations" rows="2">${h(route?.observations || "")}</textarea></div>
      <div class="row">
        <label class="row"><input type="checkbox" name="requiresPhoto" ${route?.requiresPhoto ? "checked" : ""}> Exigir foto</label>
        <label class="row"><input type="checkbox" name="requiresGeolocation" ${route?.requiresGeolocation ? "checked" : ""}> Exigir geolocalização</label>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn primary" type="submit">${isEdit ? "Salvar alterações" : "Criar rota"}</button>
        ${isEdit ? `<button class="btn ghost" type="button" data-action="route-cancel-edit">Cancelar</button>` : ""}
      </div>
    </form>
  `;
}

function routeCard(route, users = []) {
  const canStart = ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL"].includes(state.user.role);
  const canEdit = state.user.role === "ADMIN_OPERACIONAL";
  return `
    <article class="item">
      <div class="row space-between">
        <h3>${h(route.name)}</h3>
        ${statusBadge(route.status)}
      </div>
      <p>${h(route.description)}</p>
      <p><strong>Unidade:</strong> ${h(route.unit)} · <strong>Fiscal:</strong> ${h(route.fiscalName)} · <strong>Horário:</strong> ${h(route.scheduledTime)}</p>
      <p><strong>Serviços:</strong> ${h((route.services || []).join(", "))}</p>
      <div class="list">
        ${(route.points || []).map((point) => `<div class="item"><strong>${point.order}. ${h(point.name)}</strong><br><span class="subtle">${h(point.checklist.join(" · "))}</span></div>`).join("")}
      </div>
      ${canStart ? `<button class="btn primary" data-action="route-start" data-id="${h(route.id)}">Iniciar rota</button>` : ""}
      ${canEdit ? routeForm(route, users) : ""}
    </article>
  `;
}

function serviceItem(task) {
  const canEdit = ["ADMIN_OPERACIONAL", "SUPERVISOR_OPERACIONAL"].includes(state.user.role);
  return `
    <article class="item">
      <div class="row space-between">
        <h3>${h(task.title)}</h3>
        <div class="row">${priorityBadge(task.priority)}${statusBadge(task.status)}</div>
      </div>
      <p>${h(task.description)}</p>
      <p><strong>Responsavel:</strong> ${h(task.responsibleName)} · <strong>Unidade:</strong> ${h(task.unit)} · <strong>Prazo:</strong> ${h(task.dueDate)}</p>
      ${canEdit ? `<div class="row">
        <button class="btn small" data-action="task-status" data-id="${h(task.id)}" data-status="Em andamento">Em andamento</button>
        <button class="btn small" data-action="task-status" data-id="${h(task.id)}" data-status="Aguardando validação">Aguardar validacao</button>
        <button class="btn small primary" data-action="task-status" data-id="${h(task.id)}" data-status="Resolvido">Resolver</button>
      </div>` : ""}
    </article>
  `;
}

function occurrenceItem(occurrence) {
  return `
    <article class="item">
      <div class="row space-between">
        <h3>${h(occurrence.protocol)} · ${h(occurrence.type)}</h3>
        <div class="row">${priorityBadge(occurrence.priority)}${statusBadge(occurrence.status)}</div>
      </div>
      <p>${h(occurrence.description)}</p>
      <p><strong>Unidade:</strong> ${h(occurrence.unit)} · <strong>Posto:</strong> ${h(occurrence.workPost || "Não informado")} · <strong>Fiscal:</strong> ${h(occurrence.fiscalName)}</p>
      <p class="subtle">${h(new Date(occurrence.dateTime).toLocaleString("pt-BR"))}</p>
    </article>
  `;
}

function noticeItem(notice) {
  return `
    <article class="item">
      <div class="row space-between">
        <h3>${h(notice.title)}</h3>
        <div class="row">${priorityBadge(notice.priority)}<span class="badge info">${h(notice.category)}</span></div>
      </div>
      <p>${h(notice.body)}</p>
      <p class="subtle">${h(notice.date)} · ${h(notice.authorName)} · ${notice.requiresReadConfirmation ? "Requer leitura" : "Leitura simples"}</p>
    </article>
  `;
}

function movementItem(movement) {
  return `
    <article class="item">
      <div class="row space-between">
        <h3>${h(movement.employeeName)} · ${h(movement.type)}</h3>
        ${statusBadge(movement.status)}
      </div>
      <p>${h(movement.reason)}</p>
      <p><strong>De:</strong> ${h(movement.previousUnit || "-")} / ${h(movement.previousPost || "-")} · <strong>Para:</strong> ${h(movement.newUnit || "-")} / ${h(movement.newPost || "-")}</p>
      <p class="subtle">${h(movement.date)}</p>
    </article>
  `;
}

function auditItem(log) {
  return `<article class="item"><h3>${h(log.action)}</h3><p>${h(log.details)}</p><p class="subtle">${h(log.actorName)} · ${h(log.entity)} · ${h(new Date(log.createdAt).toLocaleString("pt-BR"))}</p></article>`;
}

function emailItem(email) {
  return `
    <article class="item">
      <div class="row space-between">
        <h3>${h(email.subject)}</h3>
        ${statusBadge(email.status)}
      </div>
      <p>${h(email.category)} · ${h((email.to || []).join(", "))}</p>
      ${email.error ? `<p class="error-banner">${h(email.error)}</p>` : ""}
      <p class="subtle">${h(new Date(email.createdAt).toLocaleString("pt-BR"))}</p>
    </article>
  `;
}

function policy(title, body) {
  return `<article class="item"><h3>${h(title)}</h3><p>${h(body)}</p></article>`;
}

function inputField(name, label, placeholder, type = "text") {
  return `<div class="field"><label>${h(label)}</label><input name="${h(name)}" type="${h(type)}" ${type === "date" ? `value="${h(placeholder)}"` : `placeholder="${h(placeholder)}"`} required></div>`;
}

function routeInput(name, label, value = "", placeholder = "", type = "text") {
  return `<div class="field"><label>${h(label)}</label><input name="${h(name)}" type="${h(type)}" value="${h(value)}" placeholder="${h(placeholder)}" required></div>`;
}

function routeUserOptions(users, role) {
  return users
    .filter((user) => user.role === role && user.status === "Ativo")
    .map((user) => [user.id, `${user.name} · ${user.email}`]);
}

function routePointsText(route) {
  return (route?.points || [])
    .map((point) => `${point.name} | ${(point.checklist || []).join("; ")}`)
    .join("\n");
}

function selectField(name, label, values, selected = "") {
  return `<div class="field"><label>${h(label)}</label><select name="${h(name)}" required><option value="">Selecione</option>${values.map((option) => {
    const value = Array.isArray(option) ? option[0] : option;
    const text = Array.isArray(option) ? option[1] : option;
    return `<option value="${h(value)}" ${String(value) === String(selected) ? "selected" : ""}>${h(text)}</option>`;
  }).join("")}</select></div>`;
}

function employeeSelect(employees) {
  return `<div class="field"><label>Funcionário envolvido</label><select name="employeeId"><option value="">Não se aplica</option>${employees.map((employee) => `<option value="${h(employee.id)}">${h(employee.fullName)} · ${h(employee.enrollment)}</option>`).join("")}</select></div>`;
}

function badge(value) {
  return statusBadge(value);
}

function statusBadge(value) {
  const text = String(value || "Não informado");
  const key = normalize(text);
  const kind = key.includes("ativo") && !key.includes("inativo") || key.includes("resolvido") || key.includes("concluida") ? "success"
    : key.includes("atras") || key.includes("aguard") || key.includes("analise") || key.includes("andamento") || key.includes("programada") ? "warning"
      : key.includes("critica") || key.includes("cancel") || key.includes("inativo") ? "danger"
        : "info";
  return `<span class="badge ${kind}">${h(text)}</span>`;
}

function priorityBadge(value) {
  const text = String(value || "Normal");
  const kind = normalize(text).includes("critica") || normalize(text).includes("alta") ? "danger"
    : normalize(text).includes("media") || normalize(text).includes("normal") ? "warning"
      : "info";
  return `<span class="badge ${kind}">${h(text)}</span>`;
}

function empty(text) {
  return `<div class="empty">${h(text)}</div>`;
}

function quickAction(label, actionName) {
  return `<button class="chip" data-action="chat-action" data-chat-action="${h(actionName)}">${h(label)}</button>`;
}

function action(label, actionName, value = "") {
  return { label, action: actionName, value };
}

function pushBot(text, actions = [], form = null) {
  state.chatbot.messages.push({ from: "bot", text, actions, form, at: Date.now() });
}

function pushUser(text) {
  state.chatbot.messages.push({ from: "user", text, actions: [], at: Date.now() });
}

function rerenderChat() {
  const messages = document.querySelector("#chat-messages");
  if (messages) {
    messages.innerHTML = renderMessages();
    scrollChat();
  } else {
    renderView();
  }
}

function scrollChat() {
  requestAnimationFrame(() => {
    const messages = document.querySelector("#chat-messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  });
}

async function logChat(message) {
  try {
    await api("/api/chatbot/interactions", { method: "POST", body: { message } });
  } catch {
    // Auditoria de chatbot não deve bloquear a operação principal do fiscal.
  }
}

function flash(message, type = "success") {
  state.flash = { message, type };
}

function flashHtml() {
  if (!state.flash) return "";
  const html = `<div class="${state.flash.type === "error" ? "error-banner" : "success-banner"}">${h(state.flash.message)}</div>`;
  state.flash = null;
  return html;
}

function resetSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("fiscalizapro.token");
}

function roleLabel(role) {
  return {
    ADMIN_OPERACIONAL: "Admin Operacional",
    FISCAL_OPERACIONAL: "Fiscal Operacional",
    SUPERVISOR_OPERACIONAL: "Supervisor Operacional",
    USUARIO_CONSULTA: "Usuario Consulta"
  }[role] || role;
}

function formatCpf(cpf) {
  const digits = String(cpf || "").replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function h(value) {
  return displayText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function displayText(value) {
  return String(value ?? "")
    .replace(/\bOperacoes\b/g, "Operações")
    .replace(/\bUsuario\b/g, "Usuário")
    .replace(/\bVigilancia\b/g, "Vigilância")
    .replace(/\bManutencao\b/g, "Manutenção")
    .replace(/\bCondominios\b/g, "Condomínios")
    .replace(/\bMedia\b/g, "Média")
    .replace(/\bCritica\b/g, "Crítica")
    .replace(/\bFuncionario\b/g, "Funcionário")
    .replace(/\bFuncionarios\b/g, "Funcionários")
    .replace(/\bServico\b/g, "Serviço")
    .replace(/\bServicos\b/g, "Serviços")
    .replace(/\bOcorrencia\b/g, "Ocorrência")
    .replace(/\bOcorrencias\b/g, "Ocorrências")
    .replace(/\bRelatorio\b/g, "Relatório")
    .replace(/\bRelatorios\b/g, "Relatórios")
    .replace(/\bMatricula\b/g, "Matrícula")
    .replace(/\bNao\b/g, "Não")
    .replace(/\bProximos\b/g, "Próximos")
    .replace(/\bhistorico\b/g, "histórico")
    .replace(/\bHistorico\b/g, "Histórico");
}

async function toBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

async function textFromFile(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}
