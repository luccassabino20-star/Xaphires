// CSV/PDF da lista de Clientes & Fornecedores. Mesmas três regras de "abrir no
// Excel com dois cliques" do resto do projeto (separador ; , BOM UTF-8, CRLF) e a
// mesma neutralização de fórmula do server/reports/csv.js - nome/e-mail de contato
// é texto digitado por usuário. Fonte única dos números: montarExportContatos()
// decide as linhas, CSV e PDF só desenham.
import PDFDocument from "pdfkit";
import { dataHoraExibicaoSP, dataHoraLocaleSP } from "../../timezone.js";

const BOM = "﻿";
const SEP = ";";
const EOL = "\r\n";
const GATILHO_DE_FORMULA = /^[=+\-@\t\r]/;

function celula(valor) {
  let texto = valor === null || valor === undefined ? "" : String(valor);
  if (GATILHO_DE_FORMULA.test(texto)) texto = `'${texto}`;
  if (texto.includes('"') || texto.includes(SEP) || texto.includes("\n") || texto.includes("\r")) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}
function linha(campos) {
  return campos.map(celula).join(SEP);
}

const ROTULOS = {
  pt: {
    titulo: "Clientes & Fornecedores",
    colNome: "Nome", colDoc: "Documento", colTipo: "Tipo", colEmail: "E-mail", colTelefone: "Telefone", colCidade: "Cidade/UF", colStatus: "Status",
    tipo: { cliente: "Cliente", fornecedor: "Fornecedor", ambos: "Parceiro" },
    ativo: "Ativo", inativo: "Inativo",
    geradoEm: "Gerado em", vazio: "Nenhum contato cadastrado",
  },
  en: {
    titulo: "Customers & Suppliers",
    colNome: "Name", colDoc: "Document", colTipo: "Type", colEmail: "Email", colTelefone: "Phone", colCidade: "City/State", colStatus: "Status",
    tipo: { cliente: "Customer", fornecedor: "Supplier", ambos: "Partner" },
    ativo: "Active", inativo: "Inactive",
    geradoEm: "Generated on", vazio: "No contacts registered",
  },
  es: {
    titulo: "Clientes & Proveedores",
    colNome: "Nombre", colDoc: "Documento", colTipo: "Tipo", colEmail: "Correo", colTelefone: "Teléfono", colCidade: "Ciudad/Estado", colStatus: "Estado",
    tipo: { cliente: "Cliente", fornecedor: "Proveedor", ambos: "Socio" },
    ativo: "Activo", inativo: "Inactivo",
    geradoEm: "Generado el", vazio: "Ningún contacto registrado",
  },
};

function rotulos(idioma) {
  return ROTULOS[idioma] || ROTULOS.pt;
}

// Uma linha por contato, já com os textos resolvidos - CSV e PDF iteram a mesma
// lista, para nunca discordar sobre o que é "Parceiro" ou o que entra no arquivo.
export function montarExportContatos(contatos, idioma) {
  const t = rotulos(idioma);
  return contatos.map((c) => ({
    nome: c.nome,
    doc: c.doc || "-",
    tipo: t.tipo[c.tipo] || c.tipo,
    email: c.email || "-",
    telefone: c.telefone || "-",
    cidadeUf: c.cidade ? `${c.cidade}${c.uf ? " - " + c.uf : ""}` : "-",
    status: c.ativo ? t.ativo : t.inativo,
  }));
}

export function gerarContatosCsv(linhas, idioma) {
  const t = rotulos(idioma);
  const saida = [linha([t.colNome, t.colDoc, t.colTipo, t.colEmail, t.colTelefone, t.colCidade, t.colStatus])];
  if (!linhas.length) {
    saida.push(linha([t.vazio]));
  } else {
    for (const l of linhas) saida.push(linha([l.nome, l.doc, l.tipo, l.email, l.telefone, l.cidadeUf, l.status]));
  }
  saida.push("");
  saida.push(linha([t.geradoEm, dataHoraLocaleSP(new Date(), idioma === "en" ? "en-US" : idioma === "es" ? "es-ES" : "pt-BR")]));
  return Buffer.from(BOM + saida.join(EOL) + EOL, "utf8");
}

const COR = { tinta: "#111827", suave: "#6b7280", linha: "#e5e7eb", faixa: "#f9fafb", cabecalho: "#1f2937", branco: "#ffffff" };
const MARGEM = 36;
const ALTURA_LINHA = 20;
const COLUNAS = [
  { chave: "nome", peso: 2.2 },
  { chave: "doc", peso: 1.3 },
  { chave: "tipo", peso: 1 },
  { chave: "email", peso: 2 },
  { chave: "telefone", peso: 1.2 },
  { chave: "cidadeUf", peso: 1.3 },
  { chave: "status", peso: 1 },
];

function truncar(doc, texto, largura) {
  const valor = String(texto ?? "");
  if (doc.widthOfString(valor) <= largura) return valor;
  let corte = valor;
  while (corte.length > 1 && doc.widthOfString(corte + "…") > largura) corte = corte.slice(0, -1);
  return corte + "…";
}

export async function gerarContatosPdf(linhas, idioma) {
  const t = rotulos(idioma);
  const doc = new PDFDocument({ layout: "landscape", size: "A4", margin: MARGEM, bufferPages: true });
  const pedacos = [];
  const pronto = new Promise((resolve, reject) => {
    doc.on("data", (p) => pedacos.push(p));
    doc.on("end", () => resolve(Buffer.concat(pedacos)));
    doc.on("error", reject);
  });

  const larguraUtil = doc.page.width - MARGEM * 2;
  const somaPesos = COLUNAS.reduce((s, c) => s + c.peso, 0);
  const larguras = COLUNAS.map((c) => (c.peso / somaPesos) * larguraUtil);
  const cabecalhos = [t.colNome, t.colDoc, t.colTipo, t.colEmail, t.colTelefone, t.colCidade, t.colStatus];

  function cabecalhoPagina() {
    doc.rect(MARGEM, MARGEM, larguraUtil, 44).fill(COR.cabecalho);
    doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(16).text(t.titulo, MARGEM + 14, MARGEM + 10);
    doc.font("Helvetica").fontSize(9).text(`${t.geradoEm}: ${dataHoraExibicaoSP()}`, MARGEM + 14, MARGEM + 29);
    return MARGEM + 58;
  }
  function cabecalhoDaTabela(yy) {
    doc.rect(MARGEM, yy, larguraUtil, ALTURA_LINHA).fill(COR.cabecalho);
    doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(8.5);
    let x = MARGEM;
    cabecalhos.forEach((h, i) => {
      doc.text(h, x + 6, yy + 6, { width: larguras[i] - 10, lineBreak: false });
      x += larguras[i];
    });
    return yy + ALTURA_LINHA;
  }

  let y = cabecalhoDaTabela(cabecalhoPagina());
  if (!linhas.length) {
    doc.fillColor(COR.suave).font("Helvetica").fontSize(9).text(t.vazio, MARGEM + 6, y + 6);
  }
  linhas.forEach((l, i) => {
    if (y + ALTURA_LINHA > doc.page.height - MARGEM - 20) {
      doc.addPage();
      y = cabecalhoDaTabela(cabecalhoPagina());
    }
    if (i % 2 === 1) doc.rect(MARGEM, y, larguraUtil, ALTURA_LINHA).fill(COR.faixa);
    doc.font("Helvetica").fontSize(8.5);
    let x = MARGEM;
    COLUNAS.forEach((c) => {
      doc.fillColor(COR.tinta).text(truncar(doc, l[c.chave], (c.peso / somaPesos) * larguraUtil - 10), x + 6, y + 6, { width: (c.peso / somaPesos) * larguraUtil - 10, lineBreak: false });
      x += (c.peso / somaPesos) * larguraUtil;
    });
    doc.moveTo(MARGEM, y + ALTURA_LINHA).lineTo(MARGEM + larguraUtil, y + ALTURA_LINHA).lineWidth(0.3).stroke(COR.linha);
    y += ALTURA_LINHA;
  });

  const faixa = doc.bufferedPageRange();
  for (let i = 0; i < faixa.count; i++) {
    doc.switchToPage(faixa.start + i);
    doc.page.margins.bottom = 0;
    doc.fillColor(COR.suave).font("Helvetica").fontSize(8).text(`Xaphires`, MARGEM, doc.page.height - MARGEM - 6, { width: larguraUtil, align: "right", lineBreak: false });
  }

  doc.end();
  return pronto;
}
