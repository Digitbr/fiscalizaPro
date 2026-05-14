const headerAliases = {
  matricula: "enrollment",
  "matrícula": "enrollment",
  nome: "fullName",
  "nome completo": "fullName",
  cpf: "cpf",
  cargo: "position",
  "tipo de servico": "serviceType",
  "tipo de serviço": "serviceType",
  servico: "serviceType",
  "serviço": "serviceType",
  unidade: "unit",
  posto: "workPost",
  "posto de trabalho": "workPost",
  escala: "shiftScale",
  horario: "workHours",
  "horário": "workHours",
  "data de admissao": "admissionDate",
  "data de admissão": "admissionDate",
  admissao: "admissionDate",
  "admissão": "admissionDate",
  "data de demissao": "terminationDate",
  "data de demissão": "terminationDate",
  demissao: "terminationDate",
  "demissão": "terminationDate",
  status: "status",
  supervisor: "supervisorName",
  "supervisor responsavel": "supervisorName",
  "supervisor responsável": "supervisorName",
  empresa: "company",
  "empresa contratada": "company",
  contrato: "contract",
  "contrato vinculado": "contract",
  "fim do contrato": "contractEndDate",
  "data fim contrato": "contractEndDate",
  telefone: "phone",
  email: "email",
  "e-mail": "email",
  observacoes: "notes",
  "observações": "notes"
};

export function parseDelimited(text) {
  const cleanText = String(text ?? "").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(cleanText);
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < cleanText.length; index += 1) {
    const char = cleanText[index];
    const next = cleanText[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows.slice(1).map((values, rowIndex) => {
    const record = { _rowNumber: rowIndex + 2 };
    headers.forEach((header, columnIndex) => {
      if (!header) {
        return;
      }
      record[header] = values[columnIndex] ?? "";
    });
    return record;
  });
}

export function normalizeHeader(header) {
  const normalized = String(header ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  return headerAliases[normalized] ?? normalized.replace(/\s+([a-z])/g, (_, letter) => letter.toUpperCase());
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  return candidates
    .map((candidate) => ({
      candidate,
      count: firstLine.split(candidate).length - 1
    }))
    .sort((a, b) => b.count - a.count)[0].candidate;
}

export function toCsv(records, headers) {
  const escape = (value) => {
    const stringValue = value == null ? "" : String(value);
    if (/[",\n\r;]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const lines = [headers.map((header) => escape(header.label)).join(";")];
  records.forEach((record) => {
    lines.push(headers.map((header) => escape(record[header.key])).join(";"));
  });

  return lines.join("\n");
}
