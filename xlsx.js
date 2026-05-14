import zlib from "node:zlib";
import { normalizeHeader } from "./csv.js";

export function parseXlsx(buffer) {
  const files = unzip(buffer);
  const sheetName = pickFirstWorksheet(files);
  const worksheetXml = files.get(sheetName);

  if (!worksheetXml) {
    throw new Error("A planilha XLSX nao contem uma aba de dados valida.");
  }

  const sharedStrings = parseSharedStrings(files.get("xl/sharedStrings.xml") ?? "");
  const rows = parseWorksheet(worksheetXml, sharedStrings);

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row, rowIndex) => {
    const record = { _rowNumber: rowIndex + 2 };
    headers.forEach((header, columnIndex) => {
      if (header) {
        record[header] = row[columnIndex] ?? "";
      }
    });
    return record;
  });
}

function unzip(buffer) {
  const files = new Map();
  const eocdOffset = findSignature(buffer, 0x06054b50, Math.max(0, buffer.length - 70000));

  if (eocdOffset < 0) {
    throw new Error("Arquivo XLSX invalido: diretorio ZIP nao encontrado.");
  }

  const centralDirectoryRecords = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  let offset = centralDirectoryOffset;

  for (let index = 0; index < centralDirectoryRecords; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Arquivo XLSX invalido: entrada ZIP corrompida.");
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let content;

    if (method === 0) {
      content = compressed;
    } else if (method === 8) {
      content = zlib.inflateRawSync(compressed);
    } else {
      throw new Error(`Metodo de compressao XLSX nao suportado: ${method}.`);
    }

    files.set(fileName, content.toString("utf8"));
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return files;
}

function findSignature(buffer, signature, startAt = 0) {
  for (let index = buffer.length - 4; index >= startAt; index -= 1) {
    if (buffer.readUInt32LE(index) === signature) {
      return index;
    }
  }
  return -1;
}

function pickFirstWorksheet(files) {
  const workbook = files.get("xl/workbook.xml");
  const relationships = files.get("xl/_rels/workbook.xml.rels");

  if (workbook && relationships) {
    const firstSheet = workbook.match(/<sheet[^>]*r:id="([^"]+)"/);
    if (firstSheet) {
      const relation = new RegExp(`<Relationship[^>]*Id="${escapeRegExp(firstSheet[1])}"[^>]*Target="([^"]+)"`).exec(relationships);
      if (relation) {
        return relation[1].startsWith("/")
          ? relation[1].replace(/^\//, "")
          : `xl/${relation[1]}`.replace(/\/\.\//g, "/");
      }
    }
  }

  return [...files.keys()].find((fileName) => /^xl\/worksheets\/sheet\d+\.xml$/.test(fileName));
}

function parseSharedStrings(xml) {
  const strings = [];
  const stringMatches = xml.matchAll(/<si[\s\S]*?<\/si>/g);

  for (const match of stringMatches) {
    const parts = [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
    strings.push(parts.join(""));
  }

  return strings;
}

function parseWorksheet(xml, sharedStrings) {
  const rows = [];
  const rowMatches = xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g);

  for (const rowMatch of rowMatches) {
    const row = [];
    const cellMatches = rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g);

    for (const cellMatch of cellMatches) {
      const attributes = cellMatch[1];
      const content = cellMatch[2];
      const reference = attributes.match(/r="([A-Z]+)\d+"/);
      const type = attributes.match(/t="([^"]+)"/)?.[1];
      const columnIndex = reference ? columnLettersToIndex(reference[1]) : row.length;
      let value = "";

      if (type === "s") {
        const index = Number(content.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? 0);
        value = sharedStrings[index] ?? "";
      } else if (type === "inlineStr") {
        value = [...content.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join("");
      } else {
        value = decodeXml(content.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      }

      row[columnIndex] = value;
    }

    rows.push(row.map((value) => value ?? ""));
  }

  return rows;
}

function columnLettersToIndex(letters) {
  return letters.split("").reduce((accumulator, letter) => accumulator * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
