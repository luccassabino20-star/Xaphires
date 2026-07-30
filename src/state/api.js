import i18n from "../i18n/index.js";
import { normalizeLanguage } from "../i18n/locale.js";

const BASE = "/api";

/**
 * O fetch() só rejeita quando a requisição não chegou a acontecer: servidor fora do
 * ar, porta errada, rede caída. Não é resposta de erro - é ausência de resposta, e
 * por isso não tem status nem corpo com `code` para o translateError usar.
 *
 * Sem esta conversão o erro sobe com a mensagem crua do navegador ("Failed to
 * fetch"), que aparece em inglês no meio de um app traduzido em três idiomas e não
 * diz a quem lê o que fazer. Vira código estável, e a tradução mora em
 * `errors.NETWORK_UNREACHABLE` como a de qualquer erro da API.
 */
function erroDeRede() {
  const err = new Error("Não foi possível falar com o servidor");
  err.code = "NETWORK_UNREACHABLE";
  return err;
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw erroDeRede();
  }
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

// ---------- Pop-up promocional da landing ----------
// Único endpoint chamado antes de qualquer sessão existir - por isso mora aqui e
// não atrás de AuthProvider. Falha aqui não pode virar toast: é conteúdo de
// marketing opcional, e quem chama (LandingScreen) já ignora o erro em silêncio.
export const getPopupAtivo = () => request("/popup");

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

// ---------- Compartilhamento de quadro privado ----------
// Adicionar e trocar o papel de alguém é a mesma chamada: o servidor grava por
// (quadro, usuário), então repetir com outro papel troca em vez de duplicar.
export const listBoardPermissions = (boardId) => request(`/boards/${boardId}/permissions`);
export const grantBoardPermission = (boardId, userId, role) =>
  request(`/boards/${boardId}/permissions`, { method: "POST", body: { userId, role } });
export const revokeBoardPermission = (boardId, userId) =>
  request(`/boards/${boardId}/permissions/${userId}`, { method: "DELETE" });

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
  // Mesmo tratamento do request(): sem ele, servidor fora do ar no meio de um
  // upload mostra "Failed to fetch" cru. Aqui o caso é ainda mais provável, porque
  // a transferência é longa - dá tempo de a conexão cair durante o envio.
  let res;
  try {
    res = await fetch(`${BASE}/cards/${cardId}/attachments/file`, {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
  } catch {
    throw erroDeRede();
  }
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

// ---------- Cobrança ----------
// Toda rota que mexe na assinatura invalida o cache do plano: o resumo carrega
// status e vencimento, e depois de pagar eles mudaram.
function invalidandoPlano(promessa) {
  return promessa.then((r) => {
    planoCache = null;
    return r;
  });
}

export const getBilling = () => request("/billing");

// `card` só leva número quando o provedor é o simulado. Com provedor real, os dados
// do cartão são tokenizados no navegador pelo SDK dele e aqui vai só o token — o
// número do cartão nunca deve trafegar pela nossa API.
export const subscribe = (data) => invalidandoPlano(request("/billing/subscribe", { method: "POST", body: data }));

export const setPaymentMethod = (data) => invalidandoPlano(request("/billing/method", { method: "PUT", body: data }));

export const cancelSubscription = () => invalidandoPlano(request("/billing/cancel", { method: "POST" }));

// Pergunta ao gateway se uma cobrança pendente já foi paga, sem depender do webhook.
export const checkPayment = (id) => invalidandoPlano(request(`/billing/payments/${id}/check`, { method: "POST" }));

// Só funciona no provedor simulado; com provedor real o servidor devolve 404.
export const devConfirmPayment = (id) => invalidandoPlano(request(`/billing/dev/confirm/${id}`, { method: "POST" }));

// ---------- Cartões recorrentes ----------
export const listRecurrences = (boardId) => request(`/recurrences/board/${boardId}`);
export const createRecurrence = (boardId, data) =>
  request(`/recurrences/board/${boardId}`, { method: "POST", body: data });
export const updateRecurrence = (id, patch) => request(`/recurrences/${id}`, { method: "PATCH", body: patch });
export const deleteRecurrence = (id) => request(`/recurrences/${id}`, { method: "DELETE" });

// ---------- Relatórios ----------

// Os filtros viram query string num só lugar, para o contador e o download nunca
// pedirem coisas diferentes: se divergissem, o número na tela deixaria de descrever
// o arquivo que o botão baixa.
function filtrosDoRelatorio({ boardIds, memberId, status }) {
  const p = new URLSearchParams();
  // Vazio (ou ausente) significa "todos os quadros" pros dois lados - mesmo
  // contrato de antes, só que agora a lista pode ter mais de um id.
  if (boardIds && boardIds.length > 0) p.set("boardIds", boardIds.join(","));
  // memberId ausente significa "todos os responsáveis" para o servidor, então o
  // vazio do seletor não pode virar `memberId=` na URL.
  if (memberId) p.set("memberId", memberId);
  if (status) p.set("status", status);
  return p;
}

export const contarCartoesDoRelatorio = (filtros) => request(`/reports/contagem?${filtrosDoRelatorio(filtros)}`);

/**
 * Baixa o relatório gerado pelo servidor.
 *
 * Vai por fetch e não por <a href> ou window.open de propósito: com FRONTEND_URL
 * definida a API mora em outra origem, e só o fetch com `credentials` leva o cookie
 * de sessão junto. Um href simples baixaria uma página de erro 401 com nome de
 * planilha, e o usuário só descobriria ao abrir o arquivo.
 */
export async function baixarRelatorio({ formato, lang, ...filtros }) {
  const p = filtrosDoRelatorio(filtros);
  if (lang) p.set("lang", lang);
  let res;
  try {
    res = await fetch(`${BASE}/reports/${formato}?${p}`, { credentials: "same-origin" });
  } catch {
    throw erroDeRede();
  }
  if (!res.ok) {
    // O corpo do erro é JSON mesmo numa rota que responde arquivo, então dá para
    // traduzir pelo code como no `request()`. Resposta ilegível vira erro genérico
    // em vez de estourar o JSON.parse por cima do erro real.
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* resposta sem corpo JSON */
    }
    const err = new Error(data?.error || `Erro ${res.status}`);
    err.code = data?.code || null;
    err.status = res.status;
    throw err;
  }

  // O nome do arquivo é o que o servidor decidiu no Content-Disposition - ele já
  // monta um nome sem acento e com a data. Cai para um padrão só se o cabeçalho não
  // vier, o que acontece atrás de proxy que o remove.
  const disposicao = res.headers.get("Content-Disposition") || "";
  const casado = /filename="?([^";]+)"?/i.exec(disposicao);
  const nome = casado ? casado[1] : `relatorio.${formato}`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
