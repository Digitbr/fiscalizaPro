const app = document.querySelector("#app");

const state = {
  token: localStorage.getItem("fiscalizapro.token"),
  user: null,
  view: localStorage.getItem("fiscalizapro.view") || "dashboard",
  flash: null,
  filters: {
    employees: "",
    occurrences: "",
    services: ""
  },
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
  ["employees", "Funcionarios", "☰", ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["routes", "Rotas", "⌖", ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["services", "Central de Servicos", "□", ["ADMIN_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["occurrences", "Ocorrencias", "!", ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["notices", "Mural de Avisos", "◫", ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["movements", "Movimentacoes", "↔", ["ADMIN_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["reports", "Relatorios", "⇩", ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL", "USUARIO_CONSULTA"]],
  ["users", "Usuarios e Permissoes", "◎", ["ADMIN_OPERACIONAL"]],
  ["settings", "Configuracoes", "⚙", ["ADMIN_OPERACIONAL"]]
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
  "Risco de seguranca",
  "Reclamacao do cliente",
  "Outro"
];

const serviceTypes = [
  "Vigilancia patrimonial",
  "CFTV / monitoramento",
  "Portaria",
  "Limpeza",
  "Conservacao",
  "Recepcao",
  "Manutencao predial",
  "Jardinagem",
  "Apoio operacional",
  "Controle de acesso",
  "Servicos gerais"
];

const priorities = ["Baixa", "Media", "Alta", "Critica"];

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
    renderLogin("Sua sessao expirou. Entre novamente.");
  }
}

function renderLogin(error = "") {
  app.innerHTML = `
    <main class="login-page">
      <section class="login-hero">
        <div class="brand-row"><span class="brand-mark">FP</span><span>FiscalizaPro</span></div>
        <div>
          <h1>Fiscalizacao operacional com chatbot, rastreabilidade e controle por perfil.</h1>
          <p>Uma base funcional para administrar servicos terceirizados, equipes, rotas, ocorrencias, central de servicos, avisos e auditoria em ambientes com alto volume de dados.</p>
        </div>
      </section>
      <section class="login-panel">
        <h2>Acessar plataforma</h2>
        <div class="subtle">Use e-mail ou matricula. A sessao respeita perfil, bloqueio por tentativas e autorizacao por rota.</div>
        ${error ? `<div class="error-banner">${h(error)}</div>` : ""}
        <form id="login-form">
          <div class="field">
            <label for="login">E-mail ou matricula</label>
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
          <span>${roleLabel(state.user.role)} · ${h(state.user.area || "Area operacional")}</span>
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
  content.innerHTML = `<div class="panel">Carregando informacoes...</div>`;

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
    content.innerHTML = pageHeader("Falha ao carregar", "Revise sua conexao local e tente novamente.") + `<div class="error-banner">${h(error.message || "Erro inesperado.")}</div>`;
  }
}

async function renderDashboard(content) {
  const dashboard = await api("/api/dashboard");
  const metrics = dashboard.metrics;
  content.innerHTML = `
    ${pageHeader("Dashboard gerencial", "Indicadores consolidados com escopo aplicado ao perfil logado.")}
    ${flashHtml()}
    <section class="grid cards">
      ${metric("Funcionarios ativos", metrics.activeEmployees, "Base operacional liberada")}
      ${metric("Funcionarios inativos", metrics.inactiveEmployees, "Historico preservado")}
      ${metric("Admissoes no mes", metrics.monthAdmissions, "Novas entradas")}
      ${metric("Demissoes no mes", metrics.monthTerminations, "Baixas registradas")}
      ${metric("Rotas programadas", metrics.scheduledRoutes, "Planejamento")}
      ${metric("Rotas em andamento", metrics.runningRoutes, "Execucao atual")}
      ${metric("Rotas atrasadas", metrics.delayedRoutes, "Exigem acao")}
      ${metric("Ocorrencias abertas", metrics.openOccurrences, "Pendencias operacionais")}
      ${metric("Ocorrencias criticas", metrics.criticalOccurrences, "Prioridade maxima")}
      ${metric("Servicos abertos", metrics.openServices, "Central de servicos")}
      ${metric("Servicos vencidos", metrics.overdueServices, "Fora do prazo")}
      ${metric("Contratos a vencer", metrics.expiringContracts, "Proximos 30 dias")}
    </section>
    <section class="grid two" style="margin-top:16px">
      ${chartPanel("Funcionarios por servico", dashboard.charts.employeesByService)}
      ${chartPanel("Funcionarios por unidade", dashboard.charts.employeesByUnit)}
      ${chartPanel("Ocorrencias por tipo", dashboard.charts.occurrencesByType)}
      ${chartPanel("Rotas por status", dashboard.charts.routesByStatus)}
      ${chartPanel("Servicos por prioridade", dashboard.charts.servicesByPriority)}
      ${chartPanel("Ranking de unidades com ocorrencias", dashboard.charts.topUnitsByOccurrences)}
    </section>
  `;
}

async function renderEmployees(content) {
  const query = state.filters.employees ? `?search=${encodeURIComponent(state.filters.employees)}` : "";
  const { employees, summary } = await api(`/api/employees${query}`);
  content.innerHTML = `
    ${pageHeader("Funcionarios", "Controle de ativos, inativos, contratos, experiencia e movimentacoes.")}
    ${flashHtml()}
    <section class="grid cards">
      ${metric("Ativos", summary.totalActive, "Funcionarios em operacao")}
      ${metric("Desligados", summary.totalInactive, "Historico mantido")}
      ${metric("Admissoes recentes", summary.recentAdmissions, "Ultimos 30 dias")}
      ${metric("Em experiencia", summary.experience, "Janela configuravel")}
      ${metric("Contrato a vencer", summary.contractEnding, "Proximos 30 dias")}
    </section>
    <section class="panel" style="margin-top:16px">
      <form class="toolbar" id="employee-filter-form">
        <input class="search" name="search" value="${h(state.filters.employees)}" placeholder="Filtrar por nome, CPF, matricula, cargo, unidade, supervisor ou contrato">
        <button class="btn" type="submit">Filtrar</button>
        <button class="btn ghost" type="button" data-action="clear-employee-filter">Limpar</button>
      </form>
      ${state.user.role === "ADMIN_OPERACIONAL" ? importBox() : ""}
      ${employeeTable(employees)}
    </section>
  `;
}

async function renderRoutes(content) {
  const { routes } = await api("/api/routes");
  content.innerHTML = `
    ${pageHeader("Rotas de fiscalizacao", "Planejamento, execucao, checklist e status por fiscal e supervisor.")}
    ${flashHtml()}
    <section class="grid two">
      ${routes.map(routeCard).join("") || empty("Nenhuma rota encontrada para o seu perfil.")}
    </section>
  `;
}

async function renderServices(content) {
  const query = state.filters.services ? `?search=${encodeURIComponent(state.filters.services)}` : "";
  const { serviceTasks } = await api(`/api/services${query}`);
  content.innerHTML = `
    ${pageHeader("Central de servicos", "Pendencias operacionais, validacoes, reposicoes, movimentacoes e tratativas.")}
    ${flashHtml()}
    <section class="panel">
      <form class="toolbar" id="service-filter-form">
        <input class="search" name="search" value="${h(state.filters.services)}" placeholder="Filtrar por titulo, unidade, prioridade, responsavel ou status">
        <button class="btn" type="submit">Filtrar</button>
        <button class="btn ghost" type="button" data-action="clear-service-filter">Limpar</button>
      </form>
      <div class="list">
        ${serviceTasks.map(serviceItem).join("") || empty("Nenhum servico encontrado.")}
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
    ${pageHeader("Ocorrencias", "Registros com protocolo, prioridade, evidencias, historico e tratativa.")}
    ${flashHtml()}
    <section class="grid two">
      <div class="panel">
        <h2>Registrar ocorrencia</h2>
        <form id="occurrence-form">
          <div class="grid two">
            ${selectField("type", "Tipo", occurrenceTypes)}
            ${selectField("serviceRelated", "Servico relacionado", serviceTypes)}
            ${inputField("unit", "Unidade", "Shopping Norte")}
            ${inputField("workPost", "Posto", "Portaria 1")}
            ${selectField("priority", "Prioridade", priorities)}
            ${employeeSelect(employeeData.employees)}
          </div>
          <div class="field"><label>Descricao</label><textarea name="description" required placeholder="Descreva o fato observado com clareza operacional"></textarea></div>
          <div class="field"><label>Localizacao</label><input name="location" placeholder="Opcional: unidade, coordenada ou referencia"></div>
          <button class="btn primary" type="submit">Salvar ocorrencia</button>
        </form>
      </div>
      <div class="panel">
        <form class="toolbar" id="occurrence-filter-form">
          <input class="search" name="search" value="${h(state.filters.occurrences)}" placeholder="Filtrar ocorrencias">
          <button class="btn" type="submit">Filtrar</button>
        </form>
        <div class="list">${occurrenceData.occurrences.map(occurrenceItem).join("") || empty("Nenhuma ocorrencia encontrada.")}</div>
      </div>
    </section>
  `;
}

async function renderNotices(content) {
  const { notices } = await api("/api/notices");
  content.innerHTML = `
    ${pageHeader("Mural de avisos", "Comunicados operacionais, eventos automaticos e confirmacao de leitura.")}
    ${flashHtml()}
    <section class="grid ${state.user.role === "ADMIN_OPERACIONAL" ? "two" : ""}">
      <div class="panel">
        <div class="list">${notices.map(noticeItem).join("") || empty("Nenhum aviso publicado.")}</div>
      </div>
      ${state.user.role === "ADMIN_OPERACIONAL" ? `
      <div class="panel">
        <h2>Publicar aviso</h2>
        <form id="notice-form">
          ${inputField("title", "Titulo", "Comunicado operacional")}
          ${selectField("category", "Categoria", ["Admissoes", "Demissoes", "Contratos", "Rotas", "Ocorrencias", "Comunicados", "Pendencias"])}
          ${selectField("priority", "Prioridade", ["Normal", "Alta", "Critica"])}
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
    ${pageHeader("Movimentacoes de funcionarios", "Historico completo de admissoes, demissoes, trocas de posto, escala e supervisor.")}
    ${flashHtml()}
    <section class="grid two">
      <div class="panel">
        <h2>Registrar movimentacao</h2>
        <form id="movement-form">
          ${employeeSelect(employeeData.employees)}
          ${selectField("type", "Tipo de movimentacao", ["Admissao", "Demissao", "Troca de posto", "Troca de escala", "Troca de supervisor", "Promocao", "Afastamento", "Retorno de afastamento", "Advertencia operacional", "Substituicao temporaria", "Alteracao de contrato", "Alteracao de cargo"])}
          ${inputField("date", "Data", new Date().toISOString().slice(0, 10), "date")}
          ${inputField("newUnit", "Unidade nova", "Shopping Norte")}
          ${inputField("newPost", "Posto novo", "Portaria 1")}
          <div class="field"><label>Motivo</label><textarea name="reason" required></textarea></div>
          <button class="btn primary" type="submit">Registrar</button>
        </form>
      </div>
      <div class="panel">
        <div class="list">${movementData.movements.map(movementItem).join("") || empty("Nenhuma movimentacao encontrada.")}</div>
      </div>
    </section>
  `;
}

async function renderReports(content) {
  const reports = [
    ["employees", "Funcionarios ativos"],
    ["admissions", "Admissoes"],
    ["terminations", "Demissoes"],
    ["movements", "Movimentacoes"],
    ["routes", "Rotas"],
    ["inspections", "Fiscalizacoes"],
    ["occurrences", "Ocorrencias"],
    ["services", "Servicos"],
    ["monthly", "Mensal consolidado"]
  ];
  content.innerHTML = `
    ${pageHeader("Relatorios", "Exportacao operacional em CSV, XLSX e PDF com escopo por perfil.")}
    ${flashHtml()}
    <section class="panel">
      <div class="grid three">
        ${reports.map(([type, label]) => `
          <div class="item">
            <h3>${label}</h3>
            <p>Gerado com filtros de permissao e auditoria automatica.</p>
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
    ${pageHeader("Usuarios e permissoes", "Perfis, permissoes e segregacao de acesso por responsabilidade.")}
    ${flashHtml()}
    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Matricula</th><th>Perfil</th><th>Status</th><th>Permissoes</th></tr></thead>
          <tbody>
            ${users.map((user) => `<tr><td>${h(user.name)}</td><td>${h(user.email)}</td><td>${h(user.enrollment)}</td><td>${roleLabel(user.role)}</td><td>${badge(user.status)}</td><td>${h(user.permissions.join(", "))}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

async function renderSettings(content) {
  const { auditLogs } = await api("/api/audit");
  content.innerHTML = `
    ${pageHeader("Configuracoes e auditoria", "Regras de seguranca, sessao, upload, logs tecnicos e logs de negocio.")}
    ${flashHtml()}
    <section class="grid two">
      <div class="panel">
        <h2>Politicas ativas</h2>
        <div class="list">
          ${policy("Sessao", "480 minutos por token local, invalidacao no logout.")}
          ${policy("Login", "Bloqueio temporario apos 5 tentativas incorretas.")}
          ${policy("Senha", "PBKDF2 com SHA-256, salt individual e comparacao segura.")}
          ${policy("Importacao", "Validacao de obrigatorios, CPF/matricula, deduplicacao e historico.")}
          ${policy("Auditoria", "Registro de login, importacao, CRUD operacional, chatbot e exportacao.")}
        </div>
      </div>
      <div class="panel">
        <h2>Ultimos logs</h2>
        <div class="list">${auditLogs.slice(0, 30).map(auditItem).join("")}</div>
      </div>
    </section>
  `;
}

async function renderChatbot(content) {
  ensureChatbotWelcome();
  content.innerHTML = `
    ${pageHeader("Chatbot operacional", "Interface guiada para fiscalizacao, ocorrencias, rotas, servicos, consultas e avisos.")}
    ${flashHtml()}
    <section class="chat-layout">
      <div class="panel chat-window">
        <div class="messages" id="chat-messages">${renderMessages()}</div>
        <form class="chat-input" id="chat-input-form">
          <input name="message" autocomplete="off" placeholder="Digite um comando, nome, unidade ou observacao">
          <button class="btn primary" type="submit">Enviar</button>
        </form>
      </div>
      <aside class="panel">
        <h2>Acoes rapidas</h2>
        <div class="chips">
          ${quickAction("Iniciar fiscalizacao", "start-inspection")}
          ${quickAction("Ver minhas rotas", "show-routes")}
          ${quickAction("Registrar ocorrencia", "start-occurrence")}
          ${quickAction("Consultar funcionario", "query-employee")}
          ${quickAction("Abrir central de servicos", "show-services")}
          ${quickAction("Ver mural de avisos", "show-notices")}
          ${quickAction("Ver pendencias", "show-pending")}
          ${quickAction("Finalizar atividade", "finish-activity")}
        </div>
      </aside>
    </section>
  `;
  scrollChat();
}

function ensureChatbotWelcome() {
  if (state.chatbot.messages.length > 0) return;
  pushBot("Ola, sou o Assistente Operacional. O que voce deseja fazer agora?", [
    action("Iniciar fiscalizacao", "start-inspection"),
    action("Ver minhas rotas", "show-routes"),
    action("Registrar ocorrencia", "start-occurrence"),
    action("Consultar funcionario", "query-employee"),
    action("Abrir central de servicos", "show-services"),
    action("Ver mural de avisos", "show-notices"),
    action("Ver pendencias", "show-pending"),
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
            <label><input type="radio" name="q${index}" value="Nao" required> Nao</label>
            <input type="hidden" name="question${index}" value="${h(question)}">
          </div>`).join("")}
        <div class="field"><label>Evidencia ou observacao</label><input name="evidence" placeholder="Ex.: foto anexada, livro conferido, portaria regular"></div>
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
  pushBot("Qual tipo de ocorrencia deseja registrar?", occurrenceTypes.map((type) => action(type, "occ-type", type)));
  rerenderChat();
}

async function handleOccurrenceFlow(chatAction, value) {
  const flow = state.chatbot.flow;

  if (chatAction === "occ-type") {
    flow.draft.type = value;
    flow.step = "service";
    pushUser(value);
    pushBot("Qual servico esta relacionado a esta ocorrencia?", serviceTypes.map((service) => action(service, "occ-service", service)));
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
    pushBot("Existe funcionario envolvido?", [action("Sim, pesquisar funcionario", "occ-employee-yes"), action("Nao ha funcionario envolvido", "occ-employee-no")]);
    return rerenderChat();
  }

  if (chatAction === "occ-employee-yes") {
    flow.step = "employee-search";
    pushUser("Sim");
    pushBot("Digite nome, CPF ou matricula do funcionario envolvido.");
    return rerenderChat();
  }

  if (chatAction === "occ-employee-no") {
    flow.step = "description";
    flow.draft.employeeId = "";
    pushUser("Nao ha funcionario envolvido");
    pushBot("Descreva a ocorrencia com objetividade. Inclua posto, horario e impacto operacional.");
    return rerenderChat();
  }

  if (chatAction === "occ-employee-select") {
    const { employees } = await api(`/api/employees?search=${encodeURIComponent(value)}`);
    const employee = employees.find((candidate) => candidate.id === value);
    flow.draft.employeeId = employee?.id ?? "";
    flow.draft.employeeName = employee?.fullName ?? "";
    flow.step = "description";
    pushUser(employee?.fullName ?? "Funcionario selecionado");
    pushBot("Descreva a ocorrencia com objetividade. Inclua posto, horario e impacto operacional.");
    return rerenderChat();
  }

  if (chatAction === "occ-priority") {
    flow.draft.priority = value;
    flow.step = "confirm";
    pushUser(value);
    pushBot(`Revise antes de salvar:\nTipo: ${flow.draft.type}\nServico: ${flow.draft.serviceRelated}\nUnidade: ${flow.draft.unit}\nFuncionario: ${flow.draft.employeeName || "Nao informado"}\nPrioridade: ${flow.draft.priority}\nDescricao: ${flow.draft.description}`, [
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
    pushBot(`Ocorrencia salva com sucesso. Protocolo: ${occurrence.protocol}. O registro ja esta disponivel para acompanhamento e auditoria.`, [
      action("Registrar outra ocorrencia", "start-occurrence"),
      action("Ver pendencias", "show-pending")
    ]);
    state.chatbot.flow = null;
    return rerenderChat();
  }

  if (chatAction === "occ-cancel") {
    state.chatbot.flow = null;
    pushUser("Cancelar");
    pushBot("Registro cancelado. Nenhuma informacao incompleta foi salva.");
    return rerenderChat();
  }
}

async function showRoutesInChat() {
  pushUser("Ver minhas rotas");
  const { routes } = await api("/api/routes");
  if (!routes.length) {
    pushBot("Nao encontrei rotas disponiveis para o seu perfil.");
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
    pushBot("Nao ha rota ativa para preencher checklist.");
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
    pushBot("Ponto registrado. Deseja registrar ocorrencia ou seguir para o proximo ponto?", [
      action("Registrar ocorrencia", "start-occurrence"),
      ...remaining.map((point) => action(`Visitar ${point.name}`, "chat-visit-point", point.id))
    ]);
  } else {
    pushBot("Todos os pontos foram visitados. Posso finalizar a rota e gerar o resumo operacional.", [
      action("Finalizar rota", "chat-finish-inspection"),
      action("Registrar ocorrencia antes de finalizar", "start-occurrence")
    ]);
  }
  rerenderChat();
}

async function finishInspectionInChat() {
  const inspection = state.chatbot.activeInspection;
  if (!inspection) {
    pushBot("Nao ha fiscalizacao ativa para finalizar.");
    return rerenderChat();
  }
  const result = await api(`/api/inspections/${inspection.id}/finish`, { method: "POST", body: {} });
  pushUser("Finalizar rota");
  pushBot(`Rota finalizada com status: ${result.inspection.status}.\nPontos visitados: ${result.inspection.visitedCount}.\nO historico ficou disponivel nos relatorios e auditoria.`);
  state.chatbot.activeInspection = null;
  state.chatbot.activeRoute = null;
  rerenderChat();
}

function askEmployeeQuery() {
  pushUser("Consultar funcionario");
  state.chatbot.flow = { name: "employee-query", step: "search" };
  pushBot("Digite nome, CPF, matricula, cargo, unidade ou posto para consultar funcionarios ativos.");
  rerenderChat();
}

async function showServicesInChat() {
  pushUser("Abrir central de servicos");
  const { serviceTasks } = await api("/api/services");
  if (!serviceTasks.length) {
    pushBot("Nao ha servicos atribuidos ao seu perfil.");
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
  pushBot(`Servico concluido: ${serviceTask.title}. O historico foi atualizado.`);
  rerenderChat();
}

async function showNoticesInChat() {
  pushUser("Ver mural de avisos");
  const { notices } = await api("/api/notices");
  pushBot(notices.length ? notices.slice(0, 6).map((notice) => `${notice.priority} · ${notice.title}\n${notice.body}`).join("\n\n") : "Nao ha avisos publicados.");
  rerenderChat();
}

async function showPendingInChat() {
  pushUser("Ver pendencias");
  const [occurrences, services] = await Promise.all([api("/api/occurrences"), api("/api/services")]);
  const openOccurrences = occurrences.occurrences.filter((item) => !["Resolvida", "Cancelada"].includes(item.status));
  const openServices = services.serviceTasks.filter((item) => !["Resolvido", "Cancelado"].includes(item.status));
  pushBot(`Pendencias atuais:\nOcorrencias abertas: ${openOccurrences.length}\nServicos em aberto: ${openServices.length}\n${openOccurrences.slice(0, 4).map((item) => `${item.protocol} · ${item.type} · ${item.priority}`).join("\n")}`);
  rerenderChat();
}

function finishActivityInChat() {
  pushUser("Finalizar atividade");
  state.chatbot.flow = null;
  pushBot("Atividade encerrada. Todas as acoes salvas permanecem disponiveis no historico e na auditoria.", [
    action("Iniciar nova fiscalizacao", "start-inspection"),
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
      pushBot("Existe funcionario envolvido?", [action("Sim, pesquisar funcionario", "occ-employee-yes"), action("Nao ha funcionario envolvido", "occ-employee-no")]);
    } else if (flow.step === "employee-search") {
      const { employees } = await api(`/api/employees?search=${encodeURIComponent(text)}`);
      if (!employees.length) {
        pushBot("Nao encontrei funcionario com esse criterio. Deseja continuar sem funcionario envolvido?", [action("Continuar sem funcionario", "occ-employee-no")]);
      } else {
        pushBot("Selecione o funcionario encontrado:", employees.slice(0, 8).map((employee) => action(`${employee.fullName} · ${employee.enrollment} · ${employee.unit}`, "occ-employee-select", employee.id)));
      }
    } else if (flow.step === "description") {
      flow.draft.description = text;
      flow.step = "priority";
      pushBot("Qual prioridade deve ser atribuida?", priorities.map((priority) => action(priority, "occ-priority", priority)));
    } else {
      pushBot("Use uma das opcoes para seguir com o registro sem inconsistencias.");
    }
    return rerenderChat();
  }

  if (flow?.name === "employee-query") {
    const { employees } = await api(`/api/employees?search=${encodeURIComponent(text)}`);
    pushBot(employees.length ? employees.slice(0, 8).map((employee) => `${employee.fullName} · ${employee.enrollment}\n${employee.position} · ${employee.serviceType}\n${employee.unit} / ${employee.workPost} · ${employee.status}`).join("\n\n") : "Nao encontrei funcionarios com esse criterio.");
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
    action("Consultar funcionario", "query-employee"),
    action("Abrir central de servicos", "show-services")
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
      renderLogin("Fluxo de recuperacao preparado para integracao com e-mail corporativo.");
      return;
    }

    if (actionName === "logout") {
      await api("/api/auth/logout", { method: "POST", body: {} });
      resetSession();
      renderLogin();
      return;
    }

    if (actionName === "clear-employee-filter") {
      state.filters.employees = "";
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

    if (actionName === "task-status") {
      await api(`/api/services/${target.dataset.id}`, {
        method: "PATCH",
        body: { status: target.dataset.status, comment: "Atualizado pela interface operacional." }
      });
      flash("Servico atualizado.");
      renderView();
      return;
    }

    if (actionName === "download-report") {
      await downloadReport(target.dataset.type, target.dataset.format);
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
      state.filters.employees = formData.get("search");
      renderView();
      return;
    }

    if (form.id === "employee-import-form") {
      await importEmployees(form);
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
      flash("Ocorrencia registrada com protocolo automatico.");
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
      flash("Movimentacao registrada e historico atualizado.");
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
      pushBot(`Nao consegui concluir a acao: ${error.message}`);
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
    content = await file.text();
  }

  const result = await api("/api/employees/import", {
    method: "POST",
    body: {
      fileName: file.name,
      content
    }
  });

  flash(`Importacao concluida: ${result.batch.inserted} inseridos, ${result.batch.updated} atualizados, ${result.batch.errors} erros.`);
}

async function downloadReport(type, format) {
  const response = await fetch(`/api/reports/${type}?format=${format}`, {
    headers: {
      Authorization: `Bearer ${state.token}`
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "Nao foi possivel exportar o relatorio.");
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
      renderLogin("Sua sessao expirou. Entre novamente.");
    }
    throw new Error(payload.message || payload.error || "Erro ao processar solicitacao.");
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

function chartPanel(title, items) {
  return `<div class="panel"><h2>${h(title)}</h2>${barChart(items)}</div>`;
}

function barChart(items) {
  if (!items?.length) return empty("Sem dados para o periodo.");
  const max = Math.max(...items.map((item) => item.value), 1);
  return `<div class="chart">${items.map((item) => `
    <div class="bar-row">
      <span>${h(item.label)}</span>
      <div class="bar-track"><div class="bar" style="width:${Math.max(5, (item.value / max) * 100)}%"></div></div>
      <strong>${h(item.value)}</strong>
    </div>`).join("")}</div>`;
}

function employeeTable(employees) {
  if (!employees.length) return empty("Nenhum funcionario encontrado.");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Matricula</th><th>Nome</th><th>CPF</th><th>Cargo</th><th>Servico</th><th>Unidade</th><th>Posto</th><th>Status</th><th>Supervisor</th><th>Contrato</th></tr></thead>
        <tbody>
          ${employees.map((employee) => `<tr>
            <td>${h(employee.enrollment)}</td>
            <td><strong>${h(employee.fullName)}</strong><br><span class="subtle">${h(employee.email)}</span></td>
            <td>${h(formatCpf(employee.cpf))}</td>
            <td>${h(employee.position)}</td>
            <td>${h(employee.serviceType)}</td>
            <td>${h(employee.unit)}</td>
            <td>${h(employee.workPost)}</td>
            <td>${badge(employee.status)}</td>
            <td>${h(employee.supervisorName)}</td>
            <td>${h(employee.contract)}<br><span class="subtle">${h(employee.contractEndDate || "Sem data")}</span></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function importBox() {
  return `
    <form id="employee-import-form" class="panel" style="margin-bottom:16px">
      <h2>Importar planilha</h2>
      <p class="subtle">Aceita CSV, TSV, Google Sheets exportado e XLSX simples. Deduplica por CPF ou matricula e cria historico automaticamente.</p>
      <div class="row">
        <input type="file" name="file" accept=".csv,.tsv,.txt,.xlsx" required>
        <button class="btn primary" type="submit">Importar e validar</button>
      </div>
    </form>
  `;
}

function routeCard(route) {
  const canStart = ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL"].includes(state.user.role);
  return `
    <article class="item">
      <div class="row space-between">
        <h3>${h(route.name)}</h3>
        ${statusBadge(route.status)}
      </div>
      <p>${h(route.description)}</p>
      <p><strong>Unidade:</strong> ${h(route.unit)} · <strong>Fiscal:</strong> ${h(route.fiscalName)} · <strong>Horario:</strong> ${h(route.scheduledTime)}</p>
      <p><strong>Servicos:</strong> ${h((route.services || []).join(", "))}</p>
      <div class="list">
        ${(route.points || []).map((point) => `<div class="item"><strong>${point.order}. ${h(point.name)}</strong><br><span class="subtle">${h(point.checklist.join(" · "))}</span></div>`).join("")}
      </div>
      ${canStart ? `<button class="btn primary" data-action="route-start" data-id="${h(route.id)}">Iniciar rota</button>` : ""}
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
        <button class="btn small" data-action="task-status" data-id="${h(task.id)}" data-status="Aguardando validacao">Aguardar validacao</button>
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
      <p><strong>Unidade:</strong> ${h(occurrence.unit)} · <strong>Posto:</strong> ${h(occurrence.workPost || "Nao informado")} · <strong>Fiscal:</strong> ${h(occurrence.fiscalName)}</p>
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

function policy(title, body) {
  return `<article class="item"><h3>${h(title)}</h3><p>${h(body)}</p></article>`;
}

function inputField(name, label, placeholder, type = "text") {
  return `<div class="field"><label>${h(label)}</label><input name="${h(name)}" type="${h(type)}" ${type === "date" ? `value="${h(placeholder)}"` : `placeholder="${h(placeholder)}"`} required></div>`;
}

function selectField(name, label, values) {
  return `<div class="field"><label>${h(label)}</label><select name="${h(name)}" required><option value="">Selecione</option>${values.map((value) => `<option value="${h(value)}">${h(value)}</option>`).join("")}</select></div>`;
}

function employeeSelect(employees) {
  return `<div class="field"><label>Funcionario envolvido</label><select name="employeeId"><option value="">Nao se aplica</option>${employees.map((employee) => `<option value="${h(employee.id)}">${h(employee.fullName)} · ${h(employee.enrollment)}</option>`).join("")}</select></div>`;
}

function badge(value) {
  return statusBadge(value);
}

function statusBadge(value) {
  const text = String(value || "Nao informado");
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
    // Auditoria de chatbot nao deve bloquear a operacao principal do fiscal.
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
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function h(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
