// Persistência das campanhas de pop-up promocional da landing.
//
// Mora no banco do diretório (global): é conteúdo de marketing da plataforma, não
// dado de uma empresa cliente. Só uma campanha fica ativa por vez - ativar uma
// desativa as demais, então o pop-up da landing nunca precisa escolher entre duas
// "ligadas" ao mesmo tempo.

import crypto from "node:crypto";
import { getDirectoryDb } from "../directory.js";

const db = getDirectoryDb();

db.exec(`
  CREATE TABLE IF NOT EXISTS popup_campaigns (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT,
    coupon_code TEXT,
    button_label TEXT,
    active INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// image_url chegou depois da tabela original - addColumnIfMissing em vez de recriar
// o CREATE TABLE, senão quem já tinha campanhas gravadas perderia a tabela ao subir
// com o código novo (CREATE TABLE IF NOT EXISTS não adiciona coluna em tabela que já
// existe).
function addColumnIfMissing(tabela, nome, ddl) {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
  if (!colunas.includes(nome)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${ddl}`);
}
addColumnIfMissing("popup_campaigns", "image_url", "image_url TEXT");

function nowIso() {
  return new Date().toISOString();
}

// Data civil de hoje (YYYY-MM-DD) no fuso do servidor, comparada como string - mesmo
// padrão do `due` dos cartões e do relatório: sem passar por Date, que traria fuso
// para uma conta que só lida com dia civil.
function hojeCivil() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function linha(r) {
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    message: r.message || "",
    couponCode: r.coupon_code || "",
    buttonLabel: r.button_label || "",
    imageUrl: r.image_url || null,
    active: !!r.active,
    expiresAt: r.expires_at,
    // Calculado aqui, não guardado: expirar é uma função do relógio de agora, não um
    // estado que alguém escreveu. Guardado, ficaria errado no dia seguinte sem ação
    // nenhuma sobre a linha.
    expired: !!r.expires_at && r.expires_at < hojeCivil(),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listarPopups() {
  return db.prepare("SELECT * FROM popup_campaigns ORDER BY created_at DESC").all().map(linha);
}

export function acharPopup(id) {
  return linha(db.prepare("SELECT * FROM popup_campaigns WHERE id = ?").get(id));
}

// Nasce desativada de propósito: publicar é uma ação separada (ativarPopup), então
// dá para montar e revisar o conteúdo antes de qualquer visitante ver.
export function criarPopup({ title, message, couponCode, buttonLabel, expiresAt }) {
  const id = crypto.randomUUID();
  const agora = nowIso();
  db.prepare(
    `INSERT INTO popup_campaigns (id, title, message, coupon_code, button_label, active, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(
    id,
    title.trim(),
    message?.trim() || null,
    couponCode?.trim() || null,
    buttonLabel?.trim() || null,
    expiresAt || null,
    agora,
    agora
  );
  return acharPopup(id);
}

export function atualizarPopup(id, campos) {
  const atual = db.prepare("SELECT * FROM popup_campaigns WHERE id = ?").get(id);
  if (!atual) return null;
  db.prepare(
    `UPDATE popup_campaigns SET title = ?, message = ?, coupon_code = ?, button_label = ?, expires_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    campos.title !== undefined ? campos.title.trim() : atual.title,
    campos.message !== undefined ? campos.message?.trim() || null : atual.message,
    campos.couponCode !== undefined ? campos.couponCode?.trim() || null : atual.coupon_code,
    campos.buttonLabel !== undefined ? campos.buttonLabel?.trim() || null : atual.button_label,
    campos.expiresAt !== undefined ? campos.expiresAt || null : atual.expires_at,
    nowIso(),
    id
  );
  return acharPopup(id);
}

export function excluirPopup(id) {
  db.prepare("DELETE FROM popup_campaigns WHERE id = ?").run(id);
}

// Separado de atualizarPopup de propósito: o upload é multipart, não JSON, e chega
// pela rota de imagem - não faz sentido esse campo entrar no PATCH de texto.
export function definirImagemPopup(id, imageUrl) {
  db.prepare("UPDATE popup_campaigns SET image_url = ?, updated_at = ? WHERE id = ?").run(imageUrl || null, nowIso(), id);
  return acharPopup(id);
}

// Ativar uma campanha desativa todas as outras, na mesma transação: nunca existe um
// instante em que duas fiquem "active = 1" ao mesmo tempo, mesmo que o processo caia
// no meio.
export function ativarPopup(id) {
  const atual = db.prepare("SELECT id FROM popup_campaigns WHERE id = ?").get(id);
  if (!atual) return null;
  const agora = nowIso();
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE popup_campaigns SET active = 0, updated_at = ? WHERE active = 1 AND id != ?").run(agora, id);
    db.prepare("UPDATE popup_campaigns SET active = 1, updated_at = ? WHERE id = ?").run(agora, id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return acharPopup(id);
}

export function desativarPopup(id) {
  db.prepare("UPDATE popup_campaigns SET active = 0, updated_at = ? WHERE id = ?").run(nowIso(), id);
  return acharPopup(id);
}

// O que a landing recebe: a campanha ativa, e só se ainda não passou da validade.
// Expirada continua no banco (o painel mostra "expirada" e deixa reativar com uma
// data nova) - apagar sozinha tiraria do admin a chance de estender a promoção.
export function popupPublico() {
  const r = db.prepare("SELECT * FROM popup_campaigns WHERE active = 1 LIMIT 1").get();
  if (!r) return null;
  if (r.expires_at && r.expires_at < hojeCivil()) return null;
  return {
    id: r.id,
    title: r.title,
    message: r.message || "",
    couponCode: r.coupon_code || "",
    buttonLabel: r.button_label || "",
    imageUrl: r.image_url || null,
  };
}
