import fs from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createToken, publicUser, verifyPassword } from "./auth.js";
import { parseDelimited } from "./csv.js";
import { parseXlsx } from "./xlsx.js";
import { exportCsv, exportPdf, exportXlsx } from "./exporters.js";

const require = createRequire(import.meta.url);
const bundledData = require("./app-data.json");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeEnv = globalThis.process?.env ?? {};
const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const flatPublicDir = rootDir;
const dataFile = path.join(rootDir, "data", "app-data.json");
const flatDataFile = path.join(rootDir, "app-data.json");
const isVercel = Boolean(runtimeEnv.VERCEL);
const port = Number(runtimeEnv.PORT ?? 4173);

const sessions = new Map();
const failedLogins = new Map();
const jsonLimitBytes = 16 * 1024 * 1024;
let cachedData = null;
const defaultNotificationEmails = [
  "gestao@argosvig.com.br",
  "operacao.adm@argosvig.com.br",
  "apoio.operacional@argosvig.com.br",
  "supervisor.adm@argosvig.com.br"
];
const defaultChatbotWelcome = "Olá, sou o Assistente Operacional. O que você deseja fazer agora?";
const operationalCompanies = ["Argosvig", "Flash", "Impacto", "Prime", "Aliança", "Pegasus"];

const reportDefinitions = {
  employees: {
    title: "Relatorio de funcionarios",
    collection: "employees",
    headers: [
      ["enrollment", "Matricula"],
      ["fullName", "Nome completo"],
      ["cpf", "CPF"],
      ["position", "Cargo"],
      ["serviceType", "Servico"],
      ["unit", "Unidade"],
      ["workPost", "Posto"],
      ["status", "Status"],
      ["supervisorName", "Supervisor"],
      ["company", "Empresa"],
      ["contract", "Contrato"]
    ]
  },
  admissions: {
    title: "Relatorio de admissoes",
    collection: "employeeMovements",
    filter: (row) => row.type === "Admissao",
    headers: [
      ["employeeName", "Funcionario"],
      ["type", "Movimentacao"],
      ["date", "Data"],
      ["newUnit", "Unidade"],
      ["newPost", "Posto"],
      ["reason", "Motivo"],
      ["status", "Status"]
    ]
  },
  terminations: {
    title: "Relatorio de demissoes",
    collection: "employeeMovements",
    filter: (row) => row.type === "Demissao",
    headers: [
      ["employeeName", "Funcionario"],
      ["type", "Movimentacao"],
      ["date", "Data"],
      ["previousUnit", "Unidade anterior"],
      ["previousPost", "Posto anterior"],
      ["reason", "Motivo"],
      ["status", "Status"]
    ]
  },
  movements: {
    title: "Relatorio de movimentacoes",
    collection: "employeeMovements",
    headers: [
      ["employeeName", "Funcionario"],
      ["type", "Movimentacao"],
      ["date", "Data"],
      ["previousUnit", "Unidade anterior"],
      ["newUnit", "Unidade nova"],
      ["previousPost", "Posto anterior"],
      ["newPost", "Posto novo"],
      ["status", "Status"]
    ]
  },
  routes: {
    title: "Relatorio de rotas",
    collection: "routes",
    headers: [
      ["name", "Rota"],
      ["fiscalName", "Fiscal"],
      ["supervisorName", "Supervisor"],
      ["unit", "Unidade"],
      ["frequency", "Frequencia"],
      ["scheduledTime", "Horario"],
      ["status", "Status"]
    ]
  },
  inspections: {
    title: "Relatorio de fiscalizacoes",
    collection: "inspections",
    headers: [
      ["routeName", "Rota"],
      ["fiscalName", "Fiscal"],
      ["startedAt", "Inicio"],
      ["finishedAt", "Fim"],
      ["status", "Status"],
      ["visitedCount", "Pontos visitados"]
    ]
  },
  occurrences: {
    title: "Relatorio de ocorrencias",
    collection: "occurrences",
    headers: [
      ["protocol", "Protocolo"],
      ["type", "Tipo"],
      ["unit", "Unidade"],
      ["workPost", "Posto"],
      ["priority", "Prioridade"],
      ["status", "Status"],
      ["fiscalName", "Fiscal"],
      ["supervisorName", "Supervisor"],
      ["dateTime", "Data e hora"]
    ]
  },
  services: {
    title: "Relatorio de servicos",
    collection: "serviceTasks",
    headers: [
      ["title", "Servico"],
      ["category", "Categoria"],
      ["priority", "Prioridade"],
      ["responsibleName", "Responsavel"],
      ["unit", "Unidade"],
      ["dueDate", "Prazo"],
      ["status", "Status"]
    ]
  },
  monthly: {
    title: "Relatorio mensal consolidado",
    custom: true,
    headers: [
      ["metric", "Indicador"],
      ["value", "Valor"]
    ]
  }
};

export async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await routeApi(request, response, url);
      return;
    }

    await serveStatic(request, response, url);
  } catch (error) {
    if (error instanceof HandledResponse) {
      return;
    }
    console.error(error);
    sendJson(response, 500, {
      error: "Erro interno",
      message: "Nao foi possivel processar a solicitacao. Tente novamente ou acione o administrador."
    });
  }
}

if (isMainModule()) {
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`FiscalizaPro rodando em http://localhost:${port}`);
  });
}

async function routeApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    await login(request, response);
    return;
  }

  const context = await requireAuth(request, response);
  if (!context) {
    return;
  }

  const { user, data } = context;

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = getBearerToken(request);
    sessions.delete(token);
    audit(data, user, "auth.logout", "User", user.id, "Sessao encerrada.");
    await writeData(data);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/me") {
    sendJson(response, 200, { user: publicUser(user) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/chatbot/config") {
    ensureOperationalConfig(data);
    sendJson(response, 200, {
      chatbotWelcome: data.settings.chatbotWelcome
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/dashboard") {
    sendJson(response, 200, buildDashboard(data, user, url.searchParams));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/users") {
    requireRole(user, ["ADMIN_OPERACIONAL"], response);
    sendJson(response, 200, { users: data.users.map(publicUser) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/employees") {
    const scopedEmployees = scopeEmployees(data.employees, user);
    const employees = applyListFilters(scopedEmployees, url.searchParams);
    sendJson(response, 200, {
      employees,
      summary: summarizeEmployees(employees, data.settings),
      filterOptions: buildEmployeeFilterOptions(scopedEmployees)
    });
    return;
  }

  if (request.method === "GET" && matchPath(url.pathname, "/api/employees/:id")) {
    const employee = scopeEmployees(data.employees, user).find((candidate) => candidate.id === pathId(url.pathname, 3));
    if (!employee) {
      sendJson(response, 404, { error: "Funcionario nao encontrado", message: "O funcionario solicitado nao existe ou nao esta no seu escopo." });
      return;
    }
    sendJson(response, 200, { employee });
    return;
  }

  if (request.method === "PATCH" && matchPath(url.pathname, "/api/employees/:id")) {
    requireRole(user, ["ADMIN_OPERACIONAL"], response);
    await updateEmployee(request, response, data, user, pathId(url.pathname, 3));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/employees/import") {
    requireRole(user, ["ADMIN_OPERACIONAL"], response);
    await importEmployees(request, response, data, user);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/routes") {
    sendJson(response, 200, { routes: scopeRoutes(data.routes, user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/routes") {
    requireRole(user, ["ADMIN_OPERACIONAL"], response);
    await createRoute(request, response, data, user);
    return;
  }

  if (request.method === "PATCH" && matchPath(url.pathname, "/api/routes/:id")) {
    requireRole(user, ["ADMIN_OPERACIONAL"], response);
    await updateRoute(request, response, data, user, pathId(url.pathname, 3));
    return;
  }

  if (request.method === "POST" && matchPath(url.pathname, "/api/routes/:id/start")) {
    await startRoute(request, response, data, user, pathId(url.pathname, 3));
    return;
  }

  if (request.method === "POST" && matchPath(url.pathname, "/api/inspections/:id/visit-point")) {
    await visitInspectionPoint(request, response, data, user, pathId(url.pathname, 3));
    return;
  }

  if (request.method === "POST" && matchPath(url.pathname, "/api/inspections/:id/finish")) {
    await finishInspection(request, response, data, user, pathId(url.pathname, 3));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/occurrences") {
    sendJson(response, 200, { occurrences: applyListFilters(scopeOccurrences(data.occurrences, user), url.searchParams) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/occurrences") {
    await createOccurrence(request, response, data, user);
    return;
  }

  if (request.method === "PATCH" && matchPath(url.pathname, "/api/occurrences/:id")) {
    await updateOccurrence(request, response, data, user, pathId(url.pathname, 3));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/services") {
    sendJson(response, 200, { serviceTasks: applyListFilters(scopeServiceTasks(data.serviceTasks, user), url.searchParams) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/services") {
    await createServiceTask(request, response, data, user);
    return;
  }

  if (request.method === "PATCH" && matchPath(url.pathname, "/api/services/:id")) {
    await updateServiceTask(request, response, data, user, pathId(url.pathname, 3));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/notices") {
    const notices = data.notices.filter((notice) => notice.targetAudience.includes(user.role) || user.role === "ADMIN_OPERACIONAL");
    sendJson(response, 200, { notices });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/notices") {
    requireRole(user, ["ADMIN_OPERACIONAL"], response);
    await createNotice(request, response, data, user);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/movements") {
    sendJson(response, 200, { movements: applyListFilters(scopeMovements(data.employeeMovements, data.employees, user), url.searchParams) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/movements") {
    await createMovement(request, response, data, user);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/audit") {
    requireRole(user, ["ADMIN_OPERACIONAL"], response);
    sendJson(response, 200, { auditLogs: data.auditLogs.slice(-300).reverse() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/settings") {
    requireRole(user, ["ADMIN_OPERACIONAL"], response);
    ensureOperationalConfig(data);
    sendJson(response, 200, {
      settings: data.settings,
      emailOutbox: (data.emailOutbox || []).slice(-50).reverse()
    });
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/settings") {
    requireRole(user, ["ADMIN_OPERACIONAL"], response);
    await updateSettings(request, response, data, user);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/notifications/operational-summary") {
    requireRole(user, ["ADMIN_OPERACIONAL"], response);
    await sendOperationalSummary(response, data, user);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/chatbot/interactions") {
    const body = await readJson(request);
    audit(data, user, "chatbot.interaction", "Chatbot", "operational-assistant", body.message ?? "Interacao registrada.");
    await writeData(data);
    sendJson(response, 201, { ok: true });
    return;
  }

  if (request.method === "GET" && matchPath(url.pathname, "/api/reports/:type")) {
    await exportReport(request, response, data, user, pathId(url.pathname, 3), url.searchParams);
    return;
  }

  sendJson(response, 404, {
    error: "Nao encontrado",
    message: "A rota solicitada nao existe."
  });
}

async function login(request, response) {
  const body = await readJson(request);
  const loginId = String(body.login ?? body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const now = Date.now();
  const state = failedLogins.get(loginId) ?? { count: 0, firstFailureAt: now };

  if (state.count >= 5 && now - state.firstFailureAt < 15 * 60 * 1000) {
    sendJson(response, 423, {
      error: "Acesso temporariamente bloqueado",
      message: "Muitas tentativas incorretas. Aguarde 15 minutos ou solicite recuperacao de senha."
    });
    return;
  }

  const data = await readData();
  const user = data.users.find((candidate) =>
    candidate.status === "Ativo" &&
    (candidate.email.toLowerCase() === loginId || candidate.enrollment.toLowerCase() === loginId)
  );

  if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    failedLogins.set(loginId, {
      count: now - state.firstFailureAt > 15 * 60 * 1000 ? 1 : state.count + 1,
      firstFailureAt: now - state.firstFailureAt > 15 * 60 * 1000 ? now : state.firstFailureAt
    });
    audit(data, null, "auth.login_failed", "User", loginId, "Tentativa de login invalida.");
    await writeData(data);
    sendJson(response, 401, {
      error: "Credenciais invalidas",
      message: "E-mail, matricula ou senha invalidos."
    });
    return;
  }

  failedLogins.delete(loginId);
  const token = createToken();
  const sessionMinutes = data.settings?.sessionMinutes ?? 480;
  sessions.set(token, {
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + sessionMinutes * 60 * 1000
  });

  audit(data, user, "auth.login", "User", user.id, "Login realizado com sucesso.");
  await writeData(data);
  sendJson(response, 200, {
    token,
    user: publicUser(user),
    redirectTo: defaultViewForRole(user.role)
  });
}

async function requireAuth(request, response) {
  const token = getBearerToken(request);
  const session = sessions.get(token);

  if (!session || session.expiresAt < Date.now()) {
    if (token) {
      sessions.delete(token);
    }
    sendJson(response, 401, {
      error: "Sessao invalida",
      message: "Sua sessao expirou. Faca login novamente."
    });
    return null;
  }

  const data = await readData();
  const user = data.users.find((candidate) => candidate.id === session.userId && candidate.status === "Ativo");

  if (!user) {
    sendJson(response, 401, {
      error: "Usuario indisponivel",
      message: "Usuario nao encontrado ou inativo."
    });
    return null;
  }

  return { data, user };
}

async function importEmployees(request, response, data, user) {
  const body = await readJson(request);
  const fileName = String(body.fileName ?? "importacao.csv");
  const lowerName = fileName.toLowerCase();
  let rows;

  if (lowerName.endsWith(".xlsx")) {
    rows = parseXlsx(Buffer.from(String(body.content ?? ""), "base64"));
  } else if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv") || lowerName.endsWith(".txt")) {
    rows = parseDelimited(String(body.content ?? ""));
  } else {
    sendJson(response, 400, {
      error: "Formato invalido",
      message: "Envie um arquivo CSV, TSV ou XLSX."
    });
    return;
  }

  const batch = {
    id: id("imp"),
    fileName,
    importedBy: user.id,
    importedByName: user.name,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    status: "Processando",
    totalRows: rows.length,
    inserted: 0,
    updated: 0,
    ignored: 0,
    active: 0,
    inactive: 0,
    recentAdmissions: 0,
    contractEnding: 0,
    errors: 0
  };

  const rowErrors = [];
  const notices = [];

  rows.forEach((row) => {
    const normalized = normalizeEmployeeRow(row);
    const validation = validateEmployee(normalized);

    if (validation.length > 0) {
      batch.errors += 1;
      rowErrors.push({
        id: id("ier"),
        importBatchId: batch.id,
        rowNumber: row._rowNumber,
        errors: validation,
        raw: row
      });
      return;
    }

    const existing = data.employees.find((employee) =>
      employee.deletedAt == null &&
      ((normalizeCpf(employee.cpf) && normalizeCpf(normalized.cpf) && normalizeCpf(employee.cpf) === normalizeCpf(normalized.cpf)) ||
        clean(employee.enrollment) === clean(normalized.enrollment))
    );

    if (existing) {
      const before = { ...existing };
      Object.assign(existing, normalized, {
        id: existing.id,
        updatedAt: new Date().toISOString(),
        deletedAt: null
      });
      batch.updated += 1;
      createMovementFromDiff(data, before, existing, user);
    } else {
      const employee = {
        id: id("emp"),
        ...normalized,
        updatedAt: new Date().toISOString(),
        deletedAt: null
      };
      data.employees.push(employee);
      batch.inserted += 1;
      data.employeeMovements.push({
        id: id("mov"),
        employeeId: employee.id,
        employeeName: employee.fullName,
        type: employee.status === "Inativo" ? "Demissao" : "Admissao",
        date: employee.status === "Inativo" ? employee.terminationDate : employee.admissionDate,
        registeredBy: user.id,
        reason: "Importacao de planilha",
        previousUnit: "",
        newUnit: employee.unit,
        previousPost: "",
        newPost: employee.workPost,
        notes: `Arquivo: ${fileName}`,
        status: "Confirmada"
      });
      if (employee.status === "Ativo") {
        notices.push(autoNotice("Admissoes", `${employee.fullName} admitido`, `${employee.fullName} foi admitido em ${formatDate(employee.admissionDate)} para o cargo de ${employee.position}.`, "Normal"));
      }
    }

    if (normalized.status === "Ativo") {
      batch.active += 1;
    } else {
      batch.inactive += 1;
      notices.push(autoNotice("Demissoes", `${normalized.fullName} desligado`, `${normalized.fullName} teve desligamento registrado em ${formatDate(normalized.terminationDate)}.`, "Normal"));
    }

    if (withinDays(normalized.admissionDate, 30)) {
      batch.recentAdmissions += 1;
    }

    if (futureWithinDays(normalized.contractEndDate, data.settings?.contractWarningDays ?? 30)) {
      batch.contractEnding += 1;
    }
  });

  if (batch.contractEnding > 0) {
    notices.push(autoNotice("Contratos", "Contratos proximos do vencimento", `Existem ${batch.contractEnding} funcionarios com contrato proximo do termino.`, "Alta"));
  }

  batch.finishedAt = new Date().toISOString();
  batch.status = batch.errors > 0 ? "Concluido com erros" : "Concluido";
  data.importBatches.push(batch);
  data.importErrors.push(...rowErrors);
  data.notices.push(...notices);
  audit(data, user, "employees.import", "ImportBatch", batch.id, `Importacao ${fileName}: ${batch.inserted} inseridos, ${batch.updated} atualizados, ${batch.errors} erros.`);
  await notifyOperationalRecord(data, user, "Importacao", `Importacao de funcionarios: ${fileName}`, [
    `Arquivo: ${fileName}`,
    `Total de linhas: ${batch.totalRows}`,
    `Inseridos: ${batch.inserted}`,
    `Atualizados: ${batch.updated}`,
    `Ignorados: ${batch.ignored}`,
    `Erros: ${batch.errors}`,
    `Ativos no arquivo: ${batch.active}`,
    `Inativos no arquivo: ${batch.inactive}`
  ]);
  await writeData(data);

  sendJson(response, 201, {
    batch,
    errors: rowErrors.slice(0, 100),
    noticesCreated: notices.length,
    summary: summarizeEmployees(data.employees, data.settings)
  });
}

async function updateEmployee(request, response, data, user, employeeId) {
  const body = await readJson(request);
  const employee = data.employees.find((candidate) => candidate.id === employeeId && candidate.deletedAt == null);
  if (!employee) {
    sendJson(response, 404, { error: "Funcionario nao encontrado", message: "O funcionario solicitado nao existe." });
    return;
  }

  const before = { ...employee };
  const allowed = [
    "enrollment",
    "fullName",
    "cpf",
    "position",
    "serviceType",
    "unit",
    "workPost",
    "shiftScale",
    "workHours",
    "admissionDate",
    "terminationDate",
    "status",
    "supervisorName",
    "company",
    "contract",
    "contractEndDate",
    "phone",
    "email",
    "notes"
  ];

  allowed.forEach((key) => {
    if (body[key] != null) {
      employee[key] = key === "company" ? normalizeCompany(body[key], employee)
        : key === "cpf" ? normalizeCpf(body[key])
        : key.endsWith("Date") ? normalizeDate(body[key])
          : key === "email" ? clean(body[key]).toLowerCase()
            : clean(body[key]);
    }
  });

  const validation = validateEmployee(employee);
  if (validation.length > 0) {
    Object.assign(employee, before);
    sendValidation(response, validation);
    return;
  }

  employee.updatedAt = new Date().toISOString();
  createMovementFromDiff(data, before, employee, user);
  audit(data, user, "employees.update", "Employee", employee.id, `Funcionario atualizado: ${employee.fullName}.`);
  await notifyOperationalRecord(data, user, "Funcionario", `Funcionario atualizado: ${employee.fullName}`, [
    `Funcionario: ${employee.fullName}`,
    `CPF: ${employee.cpf}`,
    `Cargo: ${employee.position}`,
    `Centro de custo: ${employee.unit}`,
    `Filial/Posto: ${employee.workPost}`,
    `Empresa: ${employee.company}`,
    `Contrato: ${employee.contract}`,
    `Status: ${employee.status}`
  ]);
  await writeData(data);
  sendJson(response, 200, { employee });
}

async function createRoute(request, response, data, user) {
  const body = await readJson(request);
  const validation = required(body, ["name", "fiscalId", "supervisorId", "unit", "scheduledTime"]);
  if (validation.length > 0) {
    sendValidation(response, validation);
    return;
  }

  const routeData = normalizeRoutePayload(body, data);
  const route = {
    id: id("rot"),
    ...routeData,
    status: "Programada",
    createdAt: new Date().toISOString()
  };
  data.routes.push(route);
  data.notices.push(autoNotice("Rotas", `Nova rota criada: ${route.name}`, `A rota ${route.name} foi criada para ${route.unit}.`, "Normal"));
  audit(data, user, "routes.create", "Route", route.id, `Rota criada: ${route.name}.`);
  await notifyOperationalRecord(data, user, "Rota", `Rota criada: ${route.name}`, routeEmailLines(route));
  await writeData(data);
  sendJson(response, 201, { route });
}

async function updateRoute(request, response, data, user, routeId) {
  const body = await readJson(request);
  const route = data.routes.find((candidate) => candidate.id === routeId);
  if (!route) {
    sendJson(response, 404, { error: "Rota nao encontrada", message: "A rota solicitada nao existe." });
    return;
  }

  const validation = required(body, ["name", "fiscalId", "supervisorId", "unit", "scheduledTime"]);
  if (validation.length > 0) {
    sendValidation(response, validation);
    return;
  }

  const routeData = normalizeRoutePayload(body, data);
  Object.assign(route, routeData, {
    status: clean(body.status) || route.status || "Programada",
    updatedAt: new Date().toISOString()
  });
  audit(data, user, "routes.update", "Route", route.id, `Rota atualizada: ${route.name}.`);
  await notifyOperationalRecord(data, user, "Rota", `Rota atualizada: ${route.name}`, routeEmailLines(route));
  await writeData(data);
  sendJson(response, 200, { route });
}

async function startRoute(request, response, data, user, routeId) {
  const route = data.routes.find((candidate) => candidate.id === routeId);
  if (!route) {
    sendJson(response, 404, { error: "Rota nao encontrada", message: "A rota solicitada nao existe." });
    return;
  }

  if (user.role === "FISCAL_OPERACIONAL" && route.fiscalId !== user.id) {
    sendJson(response, 403, { error: "Acesso negado", message: "Esta rota nao esta atribuida ao fiscal logado." });
    return;
  }

  route.status = "Em andamento";
  const inspection = {
    id: id("ins"),
    routeId: route.id,
    routeName: route.name,
    fiscalId: user.id,
    fiscalName: user.name,
    supervisorId: route.supervisorId,
    supervisorName: route.supervisorName,
    unit: route.unit,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    status: "Em andamento",
    visitedPoints: [],
    visitedCount: 0,
    checklistAnswers: [],
    occurrences: []
  };
  data.inspections.push(inspection);
  audit(data, user, "routes.start", "Inspection", inspection.id, `Fiscalizacao iniciada: ${route.name}.`);
  await notifyOperationalRecord(data, user, "Rota", `Fiscalizacao iniciada: ${route.name}`, [
    `Rota: ${route.name}`,
    `Unidade: ${route.unit}`,
    `Fiscal: ${inspection.fiscalName}`,
    `Supervisor: ${inspection.supervisorName}`,
    `Inicio: ${inspection.startedAt}`
  ]);
  await writeData(data);
  sendJson(response, 201, { inspection, route });
}

async function visitInspectionPoint(request, response, data, user, inspectionId) {
  const body = await readJson(request);
  const inspection = data.inspections.find((candidate) => candidate.id === inspectionId);
  if (!inspection) {
    sendJson(response, 404, { error: "Fiscalizacao nao encontrada", message: "A fiscalizacao solicitada nao existe." });
    return;
  }

  if (user.role === "FISCAL_OPERACIONAL" && inspection.fiscalId !== user.id) {
    sendJson(response, 403, { error: "Acesso negado", message: "Esta fiscalizacao pertence a outro fiscal." });
    return;
  }

  const route = data.routes.find((candidate) => candidate.id === inspection.routeId);
  const point = route?.points.find((candidate) => candidate.id === body.pointId);

  if (!point) {
    sendJson(response, 400, { error: "Ponto invalido", message: "Selecione um ponto valido da rota." });
    return;
  }

  inspection.visitedPoints = inspection.visitedPoints.filter((visited) => visited.pointId !== point.id);
  inspection.visitedPoints.push({
    pointId: point.id,
    pointName: point.name,
    visitedAt: new Date().toISOString(),
    location: clean(body.location ?? ""),
    evidence: clean(body.evidence ?? "")
  });
  inspection.visitedCount = inspection.visitedPoints.length;
  inspection.checklistAnswers = inspection.checklistAnswers.filter((answer) => answer.pointId !== point.id);
  inspection.checklistAnswers.push({
    pointId: point.id,
    pointName: point.name,
    answers: Array.isArray(body.answers) ? body.answers : []
  });

  audit(data, user, "routes.visit_point", "Inspection", inspection.id, `Ponto visitado: ${point.name}.`);
  await notifyOperationalRecord(data, user, "Rota", `Ponto visitado: ${point.name}`, [
    `Rota: ${inspection.routeName}`,
    `Ponto: ${point.name}`,
    `Fiscal: ${inspection.fiscalName}`,
    `Visitados: ${inspection.visitedCount}`,
    `Localizacao: ${clean(body.location) || "Nao informada"}`
  ]);
  await writeData(data);
  sendJson(response, 200, { inspection });
}

async function finishInspection(request, response, data, user, inspectionId) {
  const inspection = data.inspections.find((candidate) => candidate.id === inspectionId);
  if (!inspection) {
    sendJson(response, 404, { error: "Fiscalizacao nao encontrada", message: "A fiscalizacao solicitada nao existe." });
    return;
  }

  const route = data.routes.find((candidate) => candidate.id === inspection.routeId);
  const hasOccurrence = data.occurrences.some((occurrence) => occurrence.routeId === route?.id || inspection.occurrences.includes(occurrence.id));
  inspection.finishedAt = new Date().toISOString();
  inspection.status = hasOccurrence ? "Concluida com ocorrencia" : "Concluida";

  if (route) {
    route.status = inspection.status;
  }

  audit(data, user, "routes.finish", "Inspection", inspection.id, `Fiscalizacao finalizada: ${inspection.status}.`);
  await notifyOperationalRecord(data, user, "Rota", `Fiscalizacao finalizada: ${inspection.routeName}`, [
    `Rota: ${inspection.routeName}`,
    `Unidade: ${inspection.unit}`,
    `Fiscal: ${inspection.fiscalName}`,
    `Supervisor: ${inspection.supervisorName}`,
    `Status: ${inspection.status}`,
    `Pontos visitados: ${inspection.visitedCount}`,
    `Inicio: ${inspection.startedAt}`,
    `Fim: ${inspection.finishedAt}`
  ]);
  await writeData(data);
  sendJson(response, 200, { inspection, route });
}

async function createOccurrence(request, response, data, user) {
  const body = await readJson(request);
  const validation = required(body, ["type", "description", "serviceRelated", "unit", "priority"]);
  if (validation.length > 0) {
    sendValidation(response, validation);
    return;
  }

  const employee = body.employeeId ? data.employees.find((candidate) => candidate.id === body.employeeId) : null;
  const supervisor = data.users.find((candidate) => candidate.id === body.supervisorId)
    ?? data.users.find((candidate) => candidate.role === "SUPERVISOR_OPERACIONAL");
  const protocol = nextProtocol(data);
  const occurrence = {
    id: id("occ"),
    protocol,
    type: clean(body.type),
    description: clean(body.description),
    serviceRelated: clean(body.serviceRelated),
    unit: clean(body.unit),
    workPost: clean(body.workPost),
    employeeId: employee?.id ?? "",
    employeeName: employee?.fullName ?? clean(body.employeeName),
    fiscalId: user.role === "FISCAL_OPERACIONAL" ? user.id : clean(body.fiscalId ?? user.id),
    fiscalName: user.role === "FISCAL_OPERACIONAL" ? user.name : clean(body.fiscalName ?? user.name),
    supervisorId: supervisor?.id ?? "",
    supervisorName: supervisor?.name ?? "",
    routeId: clean(body.routeId),
    dateTime: new Date().toISOString(),
    priority: clean(body.priority),
    status: body.priority === "Critica" ? "Critica" : "Aberta",
    photos: Array.isArray(body.photos) ? body.photos : [],
    location: clean(body.location),
    comments: [],
    history: [
      {
        dateTime: new Date().toISOString(),
        actorId: user.id,
        action: "Ocorrencia registrada"
      }
    ]
  };

  data.occurrences.push(occurrence);

  if (["Alta", "Critica"].includes(occurrence.priority)) {
    const task = {
      id: id("tsk"),
      title: `Validar ocorrencia ${occurrence.protocol}`,
      description: occurrence.description,
      category: "Validar ocorrencia",
      priority: occurrence.priority,
      responsibleId: occurrence.supervisorId,
      responsibleName: occurrence.supervisorName,
      dueDate: addDays(new Date(), occurrence.priority === "Critica" ? 1 : 2).slice(0, 10),
      status: "Aberto",
      attachments: [],
      comments: [],
      history: [
        {
          dateTime: new Date().toISOString(),
          actorId: user.id,
          action: "Servico gerado automaticamente"
        }
      ],
      employeeId: occurrence.employeeId,
      unit: occurrence.unit,
      routeId: occurrence.routeId,
      occurrenceId: occurrence.id
    };
    data.serviceTasks.push(task);
  }

  if (occurrence.priority === "Critica") {
    data.notices.push(autoNotice("Ocorrencias", `Ocorrencia critica ${occurrence.protocol}`, `${occurrence.type} em ${occurrence.unit}: ${occurrence.description}`, "Critica"));
  }

  audit(data, user, "occurrences.create", "Occurrence", occurrence.id, `Ocorrencia registrada: ${occurrence.protocol}.`);
  await writeData(data);
  sendJson(response, 201, { occurrence });
}

async function updateOccurrence(request, response, data, user, occurrenceId) {
  const body = await readJson(request);
  const occurrence = data.occurrences.find((candidate) => candidate.id === occurrenceId);
  if (!occurrence) {
    sendJson(response, 404, { error: "Ocorrencia nao encontrada", message: "A ocorrencia solicitada nao existe." });
    return;
  }

  if (user.role === "FISCAL_OPERACIONAL" && occurrence.fiscalId !== user.id) {
    sendJson(response, 403, { error: "Acesso negado", message: "Fiscal pode alterar apenas ocorrencias proprias." });
    return;
  }

  const allowed = ["status", "priority", "description"];
  allowed.forEach((key) => {
    if (body[key] != null) {
      occurrence[key] = clean(body[key]);
    }
  });
  occurrence.history.push({
    dateTime: new Date().toISOString(),
    actorId: user.id,
    action: `Ocorrencia atualizada: ${Object.keys(body).join(", ")}`
  });
  audit(data, user, "occurrences.update", "Occurrence", occurrence.id, `Ocorrencia atualizada: ${occurrence.protocol}.`);
  await writeData(data);
  sendJson(response, 200, { occurrence });
}

async function createServiceTask(request, response, data, user) {
  const body = await readJson(request);
  const validation = required(body, ["title", "category", "priority", "responsibleId", "dueDate", "unit"]);
  if (validation.length > 0) {
    sendValidation(response, validation);
    return;
  }

  const responsible = data.users.find((candidate) => candidate.id === body.responsibleId);
  const task = {
    id: id("tsk"),
    title: clean(body.title),
    description: clean(body.description),
    category: clean(body.category),
    priority: clean(body.priority),
    responsibleId: clean(body.responsibleId),
    responsibleName: responsible?.name ?? "",
    dueDate: clean(body.dueDate),
    status: "Aberto",
    attachments: [],
    comments: [],
    history: [
      {
        dateTime: new Date().toISOString(),
        actorId: user.id,
        action: "Servico criado"
      }
    ],
    employeeId: clean(body.employeeId),
    unit: clean(body.unit),
    routeId: clean(body.routeId),
    occurrenceId: clean(body.occurrenceId)
  };
  data.serviceTasks.push(task);
  audit(data, user, "services.create", "ServiceTask", task.id, `Servico criado: ${task.title}.`);
  await writeData(data);
  sendJson(response, 201, { serviceTask: task });
}

async function updateServiceTask(request, response, data, user, taskId) {
  const body = await readJson(request);
  const task = data.serviceTasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    sendJson(response, 404, { error: "Servico nao encontrado", message: "O servico solicitado nao existe." });
    return;
  }

  if (user.role === "SUPERVISOR_OPERACIONAL" && task.responsibleId !== user.id) {
    sendJson(response, 403, { error: "Acesso negado", message: "Supervisor pode alterar apenas servicos atribuidos a ele." });
    return;
  }

  ["status", "priority", "dueDate", "description"].forEach((key) => {
    if (body[key] != null) {
      task[key] = clean(body[key]);
    }
  });
  if (body.comment) {
    task.comments.push({
      id: id("com"),
      actorId: user.id,
      actorName: user.name,
      text: clean(body.comment),
      createdAt: new Date().toISOString()
    });
  }
  task.history.push({
    dateTime: new Date().toISOString(),
    actorId: user.id,
    action: `Servico atualizado: ${Object.keys(body).join(", ")}`
  });
  audit(data, user, "services.update", "ServiceTask", task.id, `Servico atualizado: ${task.title}.`);
  await writeData(data);
  sendJson(response, 200, { serviceTask: task });
}

async function createNotice(request, response, data, user) {
  const body = await readJson(request);
  const validation = required(body, ["title", "category", "body", "priority"]);
  if (validation.length > 0) {
    sendValidation(response, validation);
    return;
  }

  const notice = {
    id: id("not"),
    title: clean(body.title),
    category: clean(body.category),
    date: new Date().toISOString().slice(0, 10),
    authorId: user.id,
    authorName: user.name,
    targetAudience: Array.isArray(body.targetAudience) && body.targetAudience.length > 0 ? body.targetAudience : ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL"],
    priority: clean(body.priority),
    body: clean(body.body),
    attachments: [],
    requiresReadConfirmation: Boolean(body.requiresReadConfirmation),
    readBy: []
  };
  data.notices.push(notice);
  audit(data, user, "notices.create", "Notice", notice.id, `Aviso publicado: ${notice.title}.`);
  await writeData(data);
  sendJson(response, 201, { notice });
}

async function createMovement(request, response, data, user) {
  const body = await readJson(request);
  const validation = required(body, ["employeeId", "type", "date", "reason"]);
  if (validation.length > 0) {
    sendValidation(response, validation);
    return;
  }

  const employee = data.employees.find((candidate) => candidate.id === body.employeeId);
  if (!employee) {
    sendJson(response, 404, { error: "Funcionario nao encontrado", message: "Selecione um funcionario valido." });
    return;
  }

  const movement = {
    id: id("mov"),
    employeeId: employee.id,
    employeeName: employee.fullName,
    type: clean(body.type),
    date: clean(body.date),
    registeredBy: user.id,
    reason: clean(body.reason),
    previousUnit: clean(body.previousUnit ?? employee.unit),
    newUnit: clean(body.newUnit ?? employee.unit),
    previousPost: clean(body.previousPost ?? employee.workPost),
    newPost: clean(body.newPost ?? employee.workPost),
    notes: clean(body.notes),
    status: clean(body.status ?? "Confirmada")
  };
  data.employeeMovements.push(movement);

  if (movement.newUnit) {
    employee.unit = movement.newUnit;
  }
  if (movement.newPost) {
    employee.workPost = movement.newPost;
  }
  employee.updatedAt = new Date().toISOString();
  audit(data, user, "movements.create", "EmployeeMovement", movement.id, `Movimentacao registrada: ${movement.type}.`);
  await notifyOperationalRecord(data, user, "Movimentacao", `Movimentacao registrada: ${movement.employeeName}`, [
    `Funcionario: ${movement.employeeName}`,
    `Tipo: ${movement.type}`,
    `Data: ${movement.date}`,
    `Motivo: ${movement.reason}`,
    `De: ${movement.previousUnit || "-"} / ${movement.previousPost || "-"}`,
    `Para: ${movement.newUnit || "-"} / ${movement.newPost || "-"}`,
    `Registrado por: ${user.name}`
  ]);
  await writeData(data);
  sendJson(response, 201, { movement, employee });
}

async function exportReport(request, response, data, user, reportType, searchParams) {
  const definition = reportDefinitions[reportType];
  if (!definition) {
    sendJson(response, 404, { error: "Relatorio nao encontrado", message: "Tipo de relatorio invalido." });
    return;
  }

  let records;
  if (definition.custom && reportType === "monthly") {
    const dashboard = buildDashboard(data, user);
    records = [
      { metric: "Funcionarios ativos", value: dashboard.metrics.activeEmployees },
      { metric: "Funcionarios inativos", value: dashboard.metrics.inactiveEmployees },
      { metric: "Admissoes no mes", value: dashboard.metrics.monthAdmissions },
      { metric: "Demissoes no mes", value: dashboard.metrics.monthTerminations },
      { metric: "Rotas programadas", value: dashboard.metrics.scheduledRoutes },
      { metric: "Rotas atrasadas", value: dashboard.metrics.delayedRoutes },
      { metric: "Ocorrencias abertas", value: dashboard.metrics.openOccurrences },
      { metric: "Servicos abertos", value: dashboard.metrics.openServices },
      { metric: "Servicos vencidos", value: dashboard.metrics.overdueServices }
    ];
  } else {
    records = scopeCollection(data, definition.collection, user).filter(definition.filter ?? (() => true));
  }

  records = applyListFilters(records, searchParams);
  const headers = definition.headers.map(([key, label]) => ({ key, label }));
  const format = searchParams.get("format") ?? "json";
  audit(data, user, "reports.export", "Report", reportType, `Relatorio exportado: ${definition.title} (${format}).`);
  await notifyOperationalRecord(data, user, "Exportacao", `Exportacao de relatorio: ${definition.title}`, [
    `Relatorio: ${definition.title}`,
    `Formato: ${format}`,
    `Registros exportados: ${records.length}`,
    `Solicitante: ${user.name}`
  ]);
  await writeData(data);

  if (format === "csv") {
    sendBuffer(response, 200, exportCsv(records, headers), "text/csv; charset=utf-8", `${reportType}.csv`);
    return;
  }

  if (format === "xlsx") {
    sendBuffer(response, 200, exportXlsx(records, headers, definition.title), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${reportType}.xlsx`);
    return;
  }

  if (format === "pdf") {
    sendBuffer(response, 200, exportPdf(records, headers, definition.title), "application/pdf", `${reportType}.pdf`);
    return;
  }

  sendJson(response, 200, { title: definition.title, records, headers });
}

async function updateSettings(request, response, data, user) {
  const body = await readJson(request);
  ensureOperationalConfig(data);

  if (body.chatbotWelcome != null) {
    data.settings.chatbotWelcome = clean(body.chatbotWelcome) || defaultChatbotWelcome;
  }

  if (body.notificationEmails != null) {
    const emails = normalizeEmails(Array.isArray(body.notificationEmails) ? body.notificationEmails : splitList(body.notificationEmails));
    if (emails.length === 0) {
      sendJson(response, 422, {
        error: "Validacao",
        message: "Informe ao menos um e-mail valido para notificacoes operacionais."
      });
      return;
    }
    data.settings.notificationEmails = emails;
  }

  audit(data, user, "settings.update", "Settings", "operational", "Configuracoes operacionais atualizadas.");
  await writeData(data);
  sendJson(response, 200, {
    settings: data.settings,
    emailOutbox: (data.emailOutbox || []).slice(-50).reverse()
  });
}

async function sendOperationalSummary(response, data, user) {
  ensureOperationalConfig(data);
  const dashboard = buildDashboard(data, user);
  const recentImports = [...(data.importBatches || [])].slice(-25).reverse();
  const recentExports = [...(data.auditLogs || [])].filter((log) => log.action === "reports.export").slice(-25).reverse();
  const recentRoutes = [...(data.auditLogs || [])].filter((log) => String(log.action).startsWith("routes.")).slice(-50).reverse();
  const recentMovements = [...(data.employeeMovements || [])].slice(-50).reverse();

  const lines = [
    "Resumo do dashboard",
    `Funcionarios ativos: ${dashboard.metrics.activeEmployees}`,
    `Funcionarios inativos: ${dashboard.metrics.inactiveEmployees}`,
    `Rotas programadas: ${dashboard.metrics.scheduledRoutes}`,
    `Rotas em andamento: ${dashboard.metrics.runningRoutes}`,
    `Rotas atrasadas: ${dashboard.metrics.delayedRoutes}`,
    `Ocorrencias abertas: ${dashboard.metrics.openOccurrences}`,
    `Servicos vencidos: ${dashboard.metrics.overdueServices}`,
    "",
    "Ultimas rotas",
    ...recentRoutes.map((log) => `- ${formatDateTime(log.createdAt)} | ${log.actorName} | ${log.details}`),
    "",
    "Ultimas importacoes",
    ...recentImports.map((batch) => `- ${formatDateTime(batch.finishedAt || batch.startedAt)} | ${batch.fileName} | ${batch.inserted} inseridos, ${batch.updated} atualizados, ${batch.errors} erros`),
    "",
    "Ultimas exportacoes",
    ...recentExports.map((log) => `- ${formatDateTime(log.createdAt)} | ${log.actorName} | ${log.details}`),
    "",
    "Ultimas movimentacoes de funcionarios",
    ...recentMovements.map((movement) => `- ${movement.date} | ${movement.employeeName} | ${movement.type} | ${movement.reason}`)
  ];

  const notification = await notifyOperationalRecord(data, user, "Resumo operacional", "FiscalizaPro - registros operacionais", lines);
  audit(data, user, "notifications.summary", "Email", notification.id, "Resumo operacional enviado para a lista configurada.");
  await writeData(data);
  sendJson(response, 201, { notification });
}

function buildDashboard(data, user, searchParams = new URLSearchParams()) {
  ensureOperationalConfig(data);
  const scopedEmployees = scopeEmployees(data.employees, user);
  const employees = applyListFilters(scopedEmployees, searchParams);
  const employeeIds = new Set(employees.map((employee) => employee.id));
  const filteredUnits = new Set(employees.map((employee) => clean(employee.unit)).filter(Boolean));
  const hasEmployeeFilters = hasOperationalFilters(searchParams);
  const routes = scopeRoutes(data.routes, user).filter((route) => !hasEmployeeFilters || filteredUnits.size === 0 || filteredUnits.has(clean(route.unit)));
  const occurrences = scopeOccurrences(data.occurrences, user).filter((occurrence) => !hasEmployeeFilters || filteredUnits.size === 0 || filteredUnits.has(clean(occurrence.unit)));
  const serviceTasks = scopeServiceTasks(data.serviceTasks, user).filter((task) => !hasEmployeeFilters || filteredUnits.size === 0 || filteredUnits.has(clean(task.unit)) || employeeIds.has(task.employeeId));
  const movements = scopeMovements(data.employeeMovements, data.employees, user).filter((movement) => !hasEmployeeFilters || employeeIds.has(movement.employeeId));
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const admissionMovements = movements.filter((movement) => normalizedKey(movement.type) === "admissao");
  const terminationMovements = movements.filter((movement) => normalizedKey(movement.type) === "demissao");
  const metrics = {
    activeEmployees: employees.filter((employee) => employee.status === "Ativo").length,
    inactiveEmployees: employees.filter((employee) => employee.status === "Inativo").length,
    monthAdmissions: admissionMovements.filter((movement) => String(movement.date).startsWith(month)).length,
    monthTerminations: terminationMovements.filter((movement) => String(movement.date).startsWith(month)).length,
    scheduledRoutes: routes.filter((route) => route.status === "Programada").length,
    runningRoutes: routes.filter((route) => route.status === "Em andamento").length,
    finishedRoutes: routes.filter((route) => route.status.startsWith("Concluida")).length,
    delayedRoutes: routes.filter((route) => route.status === "Atrasada").length,
    openOccurrences: occurrences.filter((occurrence) => !["Resolvida", "Cancelada"].includes(occurrence.status)).length,
    criticalOccurrences: occurrences.filter((occurrence) => occurrence.priority === "Critica" || occurrence.status === "Critica").length,
    openServices: serviceTasks.filter((task) => ["Aberto", "Em andamento", "Aguardando validacao"].includes(task.status)).length,
    overdueServices: serviceTasks.filter((task) => isOverdue(task.dueDate) && !["Resolvido", "Cancelado"].includes(task.status)).length,
    finishedServices: serviceTasks.filter((task) => task.status === "Resolvido").length,
    expiringContracts: employees.filter((employee) => futureWithinDays(employee.contractEndDate, data.settings?.contractWarningDays ?? 30)).length
  };

  return {
    metrics,
    summary: buildDashboardSummary(metrics, data, { employees, routes, occurrences, serviceTasks, movements }),
    filters: Object.fromEntries([...searchParams.entries()].filter(([key]) => !["format", "path"].includes(key))),
    filterOptions: buildEmployeeFilterOptions(scopedEmployees),
    charts: {
      employeesByService: groupCount(employees.filter((employee) => employee.status === "Ativo"), "serviceType"),
      employeesByUnit: groupCount(employees.filter((employee) => employee.status === "Ativo"), "unit"),
      occurrencesByType: groupCount(occurrences, "type"),
      occurrencesByMonth: groupByMonth(occurrences, "dateTime"),
      routesByStatus: groupCount(routes, "status"),
      servicesByPriority: groupCount(serviceTasks, "priority"),
      admissionsTerminations: [
        { label: "Admissoes", value: admissionMovements.length },
        { label: "Demissoes", value: terminationMovements.length }
      ],
      topUnitsByOccurrences: topN(groupCount(occurrences, "unit"), 5),
      supervisorsByPending: topN(groupCount(serviceTasks.filter((task) => !["Resolvido", "Cancelado"].includes(task.status)), "responsibleName"), 5),
      monthlyInspections: groupByMonth(data.inspections, "startedAt")
    }
  };
}

function buildDashboardSummary(metrics, data, scoped) {
  const totalEmployees = metrics.activeEmployees + metrics.inactiveEmployees;
  const totalRoutes = scoped.routes.length;
  const healthyRoutes = Math.max(0, totalRoutes - metrics.delayedRoutes);
  const totalOperationalIssues = metrics.openOccurrences + metrics.openServices + metrics.delayedRoutes;
  const lastImport = [...(data.importBatches || [])].sort((a, b) => String(b.finishedAt || b.startedAt).localeCompare(String(a.finishedAt || a.startedAt)))[0];
  const lastExport = [...(data.auditLogs || [])].filter((log) => log.action === "reports.export").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];

  return {
    headline: totalOperationalIssues > 0
      ? `${totalOperationalIssues} pendencias operacionais exigem acompanhamento.`
      : "Operacao sem pendencias criticas no escopo atual.",
    cards: [
      {
        label: "Base de funcionarios",
        value: totalEmployees,
        detail: `${metrics.activeEmployees} ativos e ${metrics.inactiveEmployees} inativos`
      },
      {
        label: "Saude das rotas",
        value: `${healthyRoutes}/${totalRoutes}`,
        detail: `${metrics.runningRoutes} em andamento e ${metrics.delayedRoutes} atrasadas`
      },
      {
        label: "Movimentacoes do mes",
        value: metrics.monthAdmissions + metrics.monthTerminations,
        detail: `${metrics.monthAdmissions} admissoes e ${metrics.monthTerminations} demissoes`
      },
      {
        label: "Alertas abertos",
        value: totalOperationalIssues,
        detail: `${metrics.openOccurrences} ocorrencias, ${metrics.openServices} servicos e ${metrics.delayedRoutes} rotas atrasadas`
      },
      {
        label: "Contratos a vencer",
        value: metrics.expiringContracts,
        detail: `Janela de ${data.settings?.contractWarningDays ?? 30} dias`
      },
      {
        label: "Ultima troca de dados",
        value: lastImport ? formatDate(lastImport.finishedAt || lastImport.startedAt) : "Sem importacao",
        detail: lastExport ? `Ultima exportacao: ${formatDateTime(lastExport.createdAt)}` : "Nenhuma exportacao registrada"
      }
    ],
    attention: [
      metrics.criticalOccurrences > 0 ? `${metrics.criticalOccurrences} ocorrencia(s) critica(s) aberta(s).` : "",
      metrics.overdueServices > 0 ? `${metrics.overdueServices} servico(s) vencido(s).` : "",
      metrics.delayedRoutes > 0 ? `${metrics.delayedRoutes} rota(s) atrasada(s).` : "",
      metrics.expiringContracts > 0 ? `${metrics.expiringContracts} contrato(s) proximo(s) do vencimento.` : ""
    ].filter(Boolean)
  };
}

function summarizeEmployees(employees, settings = {}) {
  const active = employees.filter((employee) => employee.status === "Ativo" && employee.deletedAt == null);
  return {
    totalActive: active.length,
    totalInactive: employees.filter((employee) => employee.status === "Inativo" && employee.deletedAt == null).length,
    recentAdmissions: active.filter((employee) => withinDays(employee.admissionDate, 30)).length,
    experience: active.filter((employee) => withinDays(employee.admissionDate, settings.experienceDays ?? 90)).length,
    contractEnding: active.filter((employee) => futureWithinDays(employee.contractEndDate, settings.contractWarningDays ?? 30)).length,
    byService: groupCount(active, "serviceType"),
    byUnit: groupCount(active, "unit"),
    bySupervisor: groupCount(active, "supervisorName"),
    byCompany: groupCount(active, "company"),
    byContract: groupCount(active, "contract"),
    byPosition: groupCount(active, "position"),
    byWorkPost: groupCount(active, "workPost")
  };
}

function buildEmployeeFilterOptions(employees) {
  return {
    enrollment: uniqueOptions(employees, "enrollment"),
    unit: uniqueOptions(employees, "unit"),
    position: uniqueOptions(employees, "position"),
    company: operationalCompanies,
    workPost: uniqueOptions(employees, "workPost"),
    contract: uniqueOptions(employees, "contract"),
    serviceType: uniqueOptions(employees, "serviceType"),
    status: uniqueOptions(employees, "status")
  };
}

function uniqueOptions(records, key) {
  return [...new Set(records.map((record) => clean(record[key])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .slice(0, 200);
}

function hasOperationalFilters(searchParams) {
  return [...searchParams.entries()].some(([key, value]) => value && !["format", "path"].includes(key));
}

function normalizeEmployeeRow(row) {
  const position = clean(row.position ?? row.cargo ?? row.funcao);
  const status = normalizeStatus(row.status || row.statusTratamento, row.terminationDate);
  const unit = clean(row.unit ?? row.centroDeCusto ?? row.costCenter ?? row.departamento ?? row.lotacao ?? row.filial) || "Unidade nao informada";
  const workPost = clean(row.workPost ?? row.posto ?? row.filial ?? row.base ?? row.setor);
  const serviceType = clean(row.serviceType ?? row.tipoDeServico ?? row.service ?? inferServiceType(position));
  const enrollment = clean(row.enrollment) || `CPF-${normalizeCpf(row.cpf) || row._rowNumber}`;
  return {
    enrollment,
    fullName: clean(row.fullName) || `Funcionario ${enrollment || normalizeCpf(row.cpf) || row._rowNumber}`,
    cpf: normalizeCpf(row.cpf),
    position: position || "Nao informado",
    serviceType,
    unit,
    workPost,
    shiftScale: clean(row.shiftScale),
    workHours: clean(row.workHours),
    admissionDate: normalizeDate(row.admissionDate),
    terminationDate: normalizeDate(row.terminationDate),
    status,
    supervisorId: "",
    supervisorName: clean(row.supervisorName),
    company: normalizeCompany(row.company ?? row.empresa ?? row.empregador, { enrollment, unit, workPost, contract: row.contract ?? row.contrato }),
    contract: clean(row.contract ?? row.contrato ?? row.centroDeCusto),
    contractEndDate: normalizeDate(row.contractEndDate),
    phone: clean(row.phone),
    email: clean(row.email).toLowerCase(),
    notes: clean(row.notes)
  };
}

function inferServiceType(position) {
  const value = clean(position).toLowerCase();
  if (value.includes("vigil")) return "Vigilancia patrimonial";
  if (value.includes("port")) return "Portaria";
  if (value.includes("limp") || value.includes("auxiliar")) return "Servicos gerais";
  if (value.includes("insp")) return "Inspecao operacional";
  if (value.includes("monitor") || value.includes("cftv")) return "CFTV / monitoramento";
  if (value.includes("manut")) return "Manutencao predial";
  return clean(position) || "Apoio operacional";
}

function normalizeCompany(value, context = {}) {
  const candidates = [
    clean(value),
    clean(context.enrollment),
    clean(context.unit),
    clean(context.workPost),
    clean(context.contract)
  ].filter(Boolean);

  for (const candidate of candidates) {
    const company = companyFromText(candidate);
    if (company) return company;
  }

  return "";
}

function companyFromText(value) {
  const normalized = normalizedKey(value);
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);

  if (/^(ar|arg|av)\d*$/.test(compact)) return "Argosvig";
  if (/^(fl)\d*$/.test(compact)) return "Flash";
  if (/^(im|imp)\d*$/.test(compact)) return "Impacto";
  if (/^(pr|pri)\d*$/.test(compact)) return "Prime";
  if (/^(al|ali)\d*$/.test(compact)) return "Aliança";
  if (/^(pg|peg)\d*$/.test(compact)) return "Pegasus";

  if (["argosvig", "argos", "arg"].some((alias) => compact.includes(alias)) || tokens.some((token) => ["ar", "av"].includes(token))) return "Argosvig";
  if (compact.includes("flash") || tokens.includes("fl")) return "Flash";
  if (compact.includes("impacto") || tokens.some((token) => ["im", "imp"].includes(token))) return "Impacto";
  if (compact.includes("prime") || tokens.some((token) => ["pr", "pri"].includes(token))) return "Prime";
  if (compact.includes("alianca") || tokens.some((token) => ["al", "ali"].includes(token))) return "Aliança";
  if (compact.includes("pegasus") || tokens.some((token) => ["pg", "peg"].includes(token))) return "Pegasus";

  if (compact === "a") return "Argosvig";
  if (compact === "f") return "Flash";
  if (compact === "i") return "Impacto";
  if (compact === "p") return "Prime";

  return "";
}

function validateEmployee(employee) {
  const errors = [];
  if (!employee.enrollment) errors.push("Matricula obrigatoria.");
  if (!employee.fullName) errors.push("Nome completo obrigatorio.");
  if (!employee.position) errors.push("Cargo obrigatorio.");
  if (!employee.serviceType) errors.push("Tipo de servico obrigatorio.");
  if (!employee.unit) errors.push("Unidade obrigatoria.");
  if (!employee.status) errors.push("Status obrigatorio.");
  if (employee.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email)) errors.push("E-mail invalido.");
  return errors;
}

function createMovementFromDiff(data, before, after, user) {
  if (before.status !== after.status && after.status === "Inativo") {
    data.employeeMovements.push({
      id: id("mov"),
      employeeId: after.id,
      employeeName: after.fullName,
      type: "Demissao",
      date: after.terminationDate || new Date().toISOString().slice(0, 10),
      registeredBy: user.id,
      reason: "Atualizacao por importacao de planilha",
      previousUnit: before.unit,
      newUnit: "",
      previousPost: before.workPost,
      newPost: "",
      notes: "Status alterado para inativo",
      status: "Confirmada"
    });
  }

  if (before.unit !== after.unit || before.workPost !== after.workPost) {
    data.employeeMovements.push({
      id: id("mov"),
      employeeId: after.id,
      employeeName: after.fullName,
      type: "Troca de posto",
      date: new Date().toISOString().slice(0, 10),
      registeredBy: user.id,
      reason: "Atualizacao por importacao de planilha",
      previousUnit: before.unit,
      newUnit: after.unit,
      previousPost: before.workPost,
      newPost: after.workPost,
      notes: "",
      status: "Confirmada"
    });
  }
}

function normalizeRoutePayload(body, data) {
  const fiscal = data.users.find((candidate) => candidate.id === body.fiscalId);
  const supervisor = data.users.find((candidate) => candidate.id === body.supervisorId);
  return {
    name: clean(body.name),
    description: clean(body.description),
    fiscalId: clean(body.fiscalId),
    fiscalName: fiscal?.name ?? "",
    supervisorId: clean(body.supervisorId),
    supervisorName: supervisor?.name ?? "",
    unit: clean(body.unit),
    client: clean(body.client ?? body.unit),
    frequency: clean(body.frequency ?? "Diaria"),
    weekDays: Array.isArray(body.weekDays) ? body.weekDays.map(clean).filter(Boolean) : splitList(body.weekDays),
    scheduledTime: clean(body.scheduledTime),
    services: Array.isArray(body.services) ? body.services.map(clean).filter(Boolean) : splitList(body.services),
    requiresPhoto: Boolean(body.requiresPhoto),
    requiresGeolocation: Boolean(body.requiresGeolocation),
    deadlineHours: Math.max(1, Number(body.deadlineHours ?? 4) || 4),
    points: normalizeRoutePoints(body.points),
    observations: clean(body.observations)
  };
}

function normalizeRoutePoints(points) {
  const source = Array.isArray(points) ? points : parseRoutePoints(points);
  return source.map((point, index) => ({
    id: clean(point.id) || id("poi"),
    order: Number(point.order ?? index + 1),
    name: clean(point.name) || `Ponto ${index + 1}`,
    locationHint: clean(point.locationHint),
    checklist: Array.isArray(point.checklist)
      ? point.checklist.map(clean).filter(Boolean)
      : splitList(point.checklist)
  })).filter((point) => point.name);
}

function parseRoutePoints(value) {
  return String(value ?? "").split(/\r?\n/).map((line) => {
    const [name, checklist = "Presenca no posto; Uniforme e EPIs; Registro de ocorrencias"] = line.split("|");
    return {
      name,
      checklist: splitList(checklist)
    };
  }).filter((point) => clean(point.name));
}

function splitList(value) {
  return String(value ?? "").split(/[;,\n]/).map(clean).filter(Boolean);
}

function scopeCollection(data, collection, user) {
  if (collection === "employees") return scopeEmployees(data.employees, user);
  if (collection === "routes") return scopeRoutes(data.routes, user);
  if (collection === "occurrences") return scopeOccurrences(data.occurrences, user);
  if (collection === "serviceTasks") return scopeServiceTasks(data.serviceTasks, user);
  if (collection === "employeeMovements") return scopeMovements(data.employeeMovements, data.employees, user);
  if (collection === "inspections") return data.inspections.filter((inspection) => user.role !== "FISCAL_OPERACIONAL" || inspection.fiscalId === user.id);
  return data[collection] ?? [];
}

function scopeEmployees(employees, user) {
  const visible = employees.filter((employee) => employee.deletedAt == null);
  if (user.role === "SUPERVISOR_OPERACIONAL") {
    return visible.filter((employee) => employee.supervisorId === user.id || employee.supervisorName === user.name || employee.status === "Ativo");
  }
  if (user.role === "FISCAL_OPERACIONAL") {
    return visible.filter((employee) => employee.status === "Ativo");
  }
  return visible;
}

function scopeRoutes(routes, user) {
  if (user.role === "FISCAL_OPERACIONAL") {
    return routes.filter((route) => route.fiscalId === user.id);
  }
  if (user.role === "SUPERVISOR_OPERACIONAL") {
    return routes.filter((route) => route.supervisorId === user.id);
  }
  if (user.role === "USUARIO_CONSULTA") {
    return routes.filter((route) => route.status !== "Cancelada");
  }
  return routes;
}

function scopeOccurrences(occurrences, user) {
  if (user.role === "FISCAL_OPERACIONAL") {
    return occurrences.filter((occurrence) => occurrence.fiscalId === user.id);
  }
  if (user.role === "SUPERVISOR_OPERACIONAL") {
    return occurrences.filter((occurrence) => occurrence.supervisorId === user.id);
  }
  if (user.role === "USUARIO_CONSULTA") {
    return occurrences.filter((occurrence) => occurrence.status !== "Cancelada");
  }
  return occurrences;
}

function scopeServiceTasks(tasks, user) {
  if (user.role === "SUPERVISOR_OPERACIONAL") {
    return tasks.filter((task) => task.responsibleId === user.id);
  }
  if (user.role === "FISCAL_OPERACIONAL") {
    return tasks.filter((task) => task.status !== "Cancelado");
  }
  if (user.role === "USUARIO_CONSULTA") {
    return tasks.filter((task) => task.status !== "Cancelado");
  }
  return tasks;
}

function scopeMovements(movements, employees, user) {
  if (user.role === "SUPERVISOR_OPERACIONAL") {
    const employeeIds = new Set(scopeEmployees(employees, user).map((employee) => employee.id));
    return movements.filter((movement) => employeeIds.has(movement.employeeId));
  }
  if (user.role === "FISCAL_OPERACIONAL") {
    return movements.filter((movement) => movement.status === "Confirmada");
  }
  return movements;
}

function applyListFilters(records, searchParams) {
  let result = [...records];
  const search = clean(searchParams.get("search")).toLowerCase();
  if (search) {
    const normalizedSearch = normalizedKey(search);
    const cpfSearch = normalizeCpf(search);
    result = result.filter((record) => Object.values(record).some((value) => normalizedKey(value).includes(normalizedSearch)) ||
      (cpfSearch && normalizeCpf(record.cpf).includes(cpfSearch)));
  }

  for (const [key, value] of searchParams.entries()) {
    if (["search", "format", "path"].includes(key) || !value) {
      continue;
    }
    const fields = filterFieldsFor(key);
    const expected = normalizedKey(key === "company" || key === "empresa" ? normalizeCompany(value) : value);
    const expectedCpf = normalizeCpf(value);
    const exact = isExactFilterKey(key);
    result = result.filter((record) => fields.some((field) => {
      if (field === "cpf") {
        return expectedCpf ? normalizeCpf(record[field]).includes(expectedCpf) : normalizedKey(record[field]).includes(expected);
      }
      const actual = normalizedKey(field === "company" ? normalizeCompany(record[field]) : record[field]);
      return exact ? actual === expected : actual.includes(expected);
    }));
  }

  return result;
}

function isExactFilterKey(key) {
  return [
    "enrollment",
    "unit",
    "position",
    "company",
    "status",
    "serviceType",
    "workPost",
    "contract",
    "centroDeCusto",
    "costCenter",
    "filial",
    "cargo",
    "empresa",
    "contrato",
    "posto"
  ].includes(key);
}

function filterFieldsFor(key) {
  const aliases = {
    centroDeCusto: ["unit", "contract"],
    costCenter: ["unit", "contract"],
    filial: ["workPost", "unit"],
    cargo: ["position"],
    empresa: ["company"],
    contrato: ["contract"],
    posto: ["workPost"]
  };
  return aliases[key] || [key];
}

function required(body, fields) {
  return fields.filter((field) => !clean(body[field])).map((field) => `Campo obrigatorio: ${field}.`);
}

function requireRole(user, roles, response) {
  if (!roles.includes(user.role)) {
    sendJson(response, 403, {
      error: "Acesso negado",
      message: "Seu perfil nao possui permissao para esta acao."
    });
    throw new HandledResponse();
  }
}

function sendValidation(response, errors) {
  sendJson(response, 422, {
    error: "Validacao",
    message: "Revise os campos obrigatorios antes de salvar.",
    errors
  });
}

function audit(data, user, action, entity, entityId, details) {
  data.auditLogs.push({
    id: id("aud"),
    actorId: user?.id ?? "anonymous",
    actorName: user?.name ?? "Anonimo",
    action,
    entity,
    entityId,
    details,
    ip: "local",
    createdAt: new Date().toISOString()
  });
}

function nextProtocol(data) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = data.occurrences.filter((occurrence) => String(occurrence.protocol).includes(date)).length + 1;
  return `OCO-${date}-${String(count).padStart(4, "0")}`;
}

function autoNotice(category, title, body, priority) {
  return {
    id: id("not"),
    title,
    category,
    date: new Date().toISOString().slice(0, 10),
    authorId: "system",
    authorName: "FiscalizaPro",
    targetAudience: ["ADMIN_OPERACIONAL", "FISCAL_OPERACIONAL", "SUPERVISOR_OPERACIONAL"],
    priority,
    body,
    attachments: [],
    requiresReadConfirmation: priority === "Alta" || priority === "Critica",
    readBy: []
  };
}

function ensureOperationalConfig(data) {
  data.settings = data.settings || {};
  data.settings.chatbotWelcome = clean(data.settings.chatbotWelcome) || defaultChatbotWelcome;
  data.settings.notificationEmails = normalizeEmails(data.settings.notificationEmails || defaultNotificationEmails);
  if (data.settings.notificationEmails.length === 0) {
    data.settings.notificationEmails = [...defaultNotificationEmails];
  }
  data.emailOutbox = Array.isArray(data.emailOutbox) ? data.emailOutbox : [];
}

function normalizeEmails(values) {
  return [...new Set((Array.isArray(values) ? values : splitList(values))
    .map((email) => clean(email).toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
}

function routeEmailLines(route) {
  return [
    `Rota: ${route.name}`,
    `Unidade: ${route.unit}`,
    `Cliente: ${route.client}`,
    `Fiscal: ${route.fiscalName}`,
    `Supervisor: ${route.supervisorName}`,
    `Frequencia: ${route.frequency}`,
    `Horario: ${route.scheduledTime}`,
    `Status: ${route.status}`,
    `Pontos: ${(route.points || []).map((point) => point.name).join(", ") || "Nao informados"}`
  ];
}

async function notifyOperationalRecord(data, user, category, subject, lines) {
  ensureOperationalConfig(data);
  const notification = {
    id: id("mail"),
    category,
    to: [...data.settings.notificationEmails],
    subject,
    body: [
      subject,
      "",
      `Categoria: ${category}`,
      `Responsavel: ${user?.name ?? "FiscalizaPro"}`,
      `Data/hora: ${formatDateTime(new Date().toISOString())}`,
      "",
      ...(Array.isArray(lines) ? lines : [String(lines ?? "")])
    ].join("\n"),
    status: "Pendente de provedor",
    provider: runtimeEnv.RESEND_API_KEY ? "resend" : "outbox",
    error: "",
    createdAt: new Date().toISOString(),
    sentAt: ""
  };

  if (runtimeEnv.RESEND_API_KEY) {
    try {
      const result = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${runtimeEnv.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: runtimeEnv.EMAIL_FROM || "FiscalizaPro <onboarding@resend.dev>",
          to: notification.to,
          subject: notification.subject,
          text: notification.body
        })
      });
      const payload = await result.json().catch(() => ({}));
      notification.status = result.ok ? "Enviado" : "Falha";
      notification.sentAt = result.ok ? new Date().toISOString() : "";
      notification.providerMessageId = payload.id || "";
      notification.error = result.ok ? "" : (payload.message || payload.error || "Falha no envio pelo provedor.");
    } catch (error) {
      notification.status = "Falha";
      notification.error = error.message || "Falha no envio pelo provedor.";
    }
  }

  data.emailOutbox.push(notification);
  return notification;
}

function groupCount(records, key) {
  const map = new Map();
  records.forEach((record) => {
    const label = clean(record[key] ?? "Nao informado") || "Nao informado";
    map.set(label, (map.get(label) ?? 0) + 1);
  });
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function groupByMonth(records, key) {
  const map = new Map();
  records.forEach((record) => {
    const label = String(record[key] ?? "").slice(0, 7) || "Sem data";
    map.set(label, (map.get(label) ?? 0) + 1);
  });
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
}

function topN(records, size) {
  return records.slice(0, size);
}

function defaultViewForRole(role) {
  if (role === "FISCAL_OPERACIONAL") return "chatbot";
  if (role === "SUPERVISOR_OPERACIONAL") return "services";
  return "dashboard";
}

function normalizeCpf(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 10 ? digits.padStart(11, "0") : digits;
}

function normalizeStatus(status, terminationDate) {
  const value = clean(status).toLowerCase();
  if (terminationDate || ["inativo", "desligado", "demitido", "demissao", "demissão"].includes(value)) {
    return "Inativo";
  }
  return "Ativo";
}

function normalizeDate(value) {
  const raw = clean(value);
  if (!raw) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + serial);
    return excelEpoch.toISOString().slice(0, 10);
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString().slice(0, 10);
}

function withinDays(dateValue, days) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const diff = Date.now() - date.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function futureWithinDays(dateValue, days) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const diff = date.getTime() - Date.now();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function isOverdue(dateValue) {
  if (!dateValue) return false;
  const today = new Date().toISOString().slice(0, 10);
  return String(dateValue).slice(0, 10) < today;
}

function formatDate(dateValue) {
  if (!dateValue) return "data nao informada";
  const [year, month, day] = String(dateValue).slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(dateValue) {
  if (!dateValue) return "data nao informada";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizedKey(value) {
  return clean(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function id(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function matchPath(pathname, pattern) {
  const actual = pathname.split("/").filter(Boolean);
  const expected = pattern.split("/").filter(Boolean);
  return actual.length === expected.length && expected.every((segment, index) => segment.startsWith(":") || segment === actual[index]);
}

function pathId(pathname, index) {
  return pathname.split("/").filter(Boolean)[index - 1];
}

async function readData() {
  if (cachedData) {
    return cachedData;
  }
  const file = await fileExists(dataFile) ? dataFile : flatDataFile;
  try {
    cachedData = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    cachedData = structuredClone(bundledData);
  }
  return cachedData;
}

async function writeData(data) {
  cachedData = data;
  if (isVercel) {
    return;
  }
  const file = await fileExists(dataFile) ? dataFile : flatDataFile;
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > jsonLimitBytes) {
      throw new Error("Payload acima do limite permitido.");
    }
  }
  return body ? JSON.parse(body) : {};
}

function getBearerToken(request) {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function sendBuffer(response, statusCode, buffer, contentType, fileName) {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": buffer.length,
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-store"
  });
  response.end(buffer);
}

async function serveStatic(request, response, url) {
  const safePath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const staticDir = await fileExists(path.join(publicDir, "index.html")) ? publicDir : flatPublicDir;
  const resolvedPath = path.normalize(path.join(staticDir, safePath));

  if (!resolvedPath.startsWith(staticDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(resolvedPath);
    response.writeHead(200, {
      "Content-Type": contentType(resolvedPath),
      "Cache-Control": "no-store"
    });
    response.end(file);
  } catch {
    const fallback = await fs.readFile(path.join(staticDir, "index.html"));
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(fallback);
  }
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === __filename;
}

class HandledResponse extends Error {}
