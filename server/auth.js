import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function loadOrCreateSecret() {
  const dataDir = process.env.KANBAN_DATA_DIR || path.join(process.cwd(), "server", "data");
  const secretPath = path.join(dataDir, "jwt-secret.txt");
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, "utf-8").trim();
  const secret = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(secretPath, secret, "utf-8");
  return secret;
}

export const JWT_SECRET = process.env.JWT_SECRET || loadOrCreateSecret();
export const COOKIE_NAME = "kanban_token";

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}
export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}
export function signToken(user, companyId) {
  return jwt.sign({ sub: user.id, role: user.role, companyId }, JWT_SECRET, { expiresIn: "7d" });
}
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
