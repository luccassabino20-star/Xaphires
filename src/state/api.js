import i18n from "../i18n/index.js";
import { normalizeLanguage } from "../i18n/locale.js";

const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Erro ${res.status}`);
    err.code = data?.code || null;
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- Auth ----------
export const getMe = () => request("/auth/me");
export const registerCompany = (data) =>
  request("/auth/register-company", { method: "POST", body: { ...data, locale: normalizeLanguage(i18n.language) } });
export const login = (data) => request("/auth/login", { method: "POST", body: data });
export const logout = () => request("/auth/logout", { method: "POST" });
export const changePassword = (data) => request("/auth/change-password", { method: "POST", body: data });

// ---------- Users ----------
export const listUsers = () => request("/users");
export const createUser = (data) => request("/users", { method: "POST", body: data });
export const renameUser = (id, data) => request(`/users/${id}`, { method: "PATCH", body: data });
export const resetUserPassword = (id, newPassword) =>
  request(`/users/${id}/reset-password`, { method: "POST", body: { newPassword } });
export const setUserRole = (id, role) => request(`/users/${id}/role`, { method: "POST", body: { role } });
export const deleteUser = (id) => request(`/users/${id}`, { method: "DELETE" });

// ---------- Boards ----------
export const getWorkspace = () => request("/boards");
export const createBoard = (data) => request("/boards", { method: "POST", body: data });
export const renameBoard = (id, title) => request(`/boards/${id}`, { method: "PATCH", body: { title } });
export const setBoardBackground = (id, background) => request(`/boards/${id}`, { method: "PATCH", body: { background } });
export const setAutoArchiveDays = (id, autoArchiveDays) =>
  request(`/boards/${id}`, { method: "PATCH", body: { autoArchiveDays } });
export const deleteBoard = (id) => request(`/boards/${id}`, { method: "DELETE" });
export const clearBoard = (id) => request(`/boards/${id}/clear`, { method: "POST" });
export const createList = (boardId, data) => request(`/boards/${boardId}/lists`, { method: "POST", body: data });
export const setListOrder = (boardId, orderedListIds) =>
  request(`/boards/${boardId}/list-order`, { method: "PUT", body: { orderedListIds } });

// ---------- Lists ----------
export const renameList = (id, title) => request(`/lists/${id}`, { method: "PATCH", body: { title } });
export const setListColor = (id, color) => request(`/lists/${id}`, { method: "PATCH", body: { color } });
export const setListStuckHours = (id, stuckHours) => request(`/lists/${id}`, { method: "PATCH", body: { stuckHours } });
export const deleteList = (id) => request(`/lists/${id}`, { method: "DELETE" });
export const clearListCards = (id) => request(`/lists/${id}/clear`, { method: "POST" });
export const setCardOrder = (listId, cardIds) => request(`/lists/${listId}/card-order`, { method: "PUT", body: { cardIds } });
export const createCard = (listId, data) => request(`/lists/${listId}/cards`, { method: "POST", body: data });

// ---------- Cards ----------
export const updateCard = (id, patch) => request(`/cards/${id}`, { method: "PATCH", body: patch });
export const deleteCard = (id) => request(`/cards/${id}`, { method: "DELETE" });
export const archiveCard = (id) => request(`/cards/${id}/archive`, { method: "POST" });
export const unarchiveCard = (id) => request(`/cards/${id}/unarchive`, { method: "POST" });
export const archiveCompletedCards = (listId) => request(`/lists/${listId}/archive-completed`, { method: "POST" });

// ---------- Card attachments ----------
export const addLinkAttachment = (cardId, data) => request(`/cards/${cardId}/attachments/link`, { method: "POST", body: data });
// Upload de arquivo não passa pelo request(): o corpo é multipart, montado pelo
// próprio navegador com o boundary correto, e o arquivo vai em streaming.
export async function addFileAttachment(cardId, file) {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch(`${BASE}/cards/${cardId}/attachments/file`, {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* sem corpo */
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Erro ${res.status}`);
    err.code = data?.code || null;
    err.status = res.status;
    throw err;
  }
  return data;
}
export const removeCardAttachment = (cardId, attachmentId) =>
  request(`/cards/${cardId}/attachments/${attachmentId}`, { method: "DELETE" });
export const attachmentDownloadUrl = (cardId, attachmentId) => `${BASE}/cards/${cardId}/attachments/${attachmentId}/download`;

// ---------- Geocoding ----------
export const geocodeAddress = (q) => request(`/geocode?q=${encodeURIComponent(q)}`);

// ---------- Meeting Minutes (Atas) ----------
export const listMinutes = () => request("/minutes");
export const createMinute = (data) => request("/minutes", { method: "POST", body: data });
export const updateMinute = (id, patch) => request(`/minutes/${id}`, { method: "PATCH", body: patch });
export const deleteMinute = (id) => request(`/minutes/${id}`, { method: "DELETE" });

// ---------- Plano ----------
// Cache curto do resumo do plano. CardModal, ArchiveModal e ListMenu consultam
// isto de forma independente ao abrir, e sem cache eram três requisições iguais
// quase simultâneas. A janela é curta de propósito: o resumo carrega dias
// restantes e status, que não podem congelar pela sessão inteira.
const PLAN_TTL_MS = 30_000;
let planoCache = null; // { em, promessa }

export function getPlan() {
  const agora = Date.now();
  if (planoCache && agora - planoCache.em < PLAN_TTL_MS) return planoCache.promessa;
  // Falha não fica em cache: senão um erro de rede passageiro travaria a consulta
  // por 30 segundos.
  const promessa = request("/plan").catch((err) => {
    planoCache = null;
    throw err;
  });
  planoCache = { em: agora, promessa };
  return promessa;
}

export function setPlan(plan) {
  return request("/plan", { method: "POST", body: { plan } }).then((resumo) => {
    planoCache = null;
    return resumo;
  });
}

// ---------- Cartões recorrentes ----------
export const listRecurrences = (boardId) => request(`/recurrences/board/${boardId}`);
export const createRecurrence = (boardId, data) =>
  request(`/recurrences/board/${boardId}`, { method: "POST", body: data });
export const updateRecurrence = (id, patch) => request(`/recurrences/${id}`, { method: "PATCH", body: patch });
export const deleteRecurrence = (id) => request(`/recurrences/${id}`, { method: "DELETE" });
