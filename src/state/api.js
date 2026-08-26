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
// Os dois de baixo não precisam de sessão - é assim que alguém sem conta ainda
// acha a empresa do empregador e pede entrada nela.
export const getCompanyByCnpj = (cnpj) => request(`/auth/company-by-cnpj?cnpj=${encodeURIComponent(cnpj)}`);
export const sendJoinRequest = (data) =>
  request("/auth/join-request", { method: "POST", body: { ...data, locale: normalizeLanguage(i18n.language) } });

// ---------- Users ----------
export const listUsers = () => request("/users");
export const createUser = (data) => request("/users", { method: "POST", body: data });
export const renameUser = (id, data) => request(`/users/${id}`, { method: "PATCH", body: data });
export const resetUserPassword = (id, newPassword) =>
  request(`/users/${id}/reset-password`, { method: "POST", body: { newPassword } });
export const setUserRole = (id, role) => request(`/users/${id}/role`, { method: "POST", body: { role } });
// Concede/revoga o acesso ao módulo Financeiro (só o master chama). O master é
// recusado pelo servidor - ele acessa sempre.
export const setFinanceAccess = (id, allowed) =>
  request(`/users/${id}/finance-access`, { method: "POST", body: { allowed } });
export const deleteUser = (id) => request(`/users/${id}`, { method: "DELETE" });
export const getMyCompany = () => request("/users/company");
export const setCompanyCnpj = (cnpj) => request("/users/company", { method: "PATCH", body: { cnpj } });
export const listJoinRequests = () => request("/users/join-requests");
export const approveJoinRequest = (id) => request(`/users/join-requests/${id}/approve`, { method: "POST" });
export const rejectJoinRequest = (id) => request(`/users/join-requests/${id}/reject`, { method: "POST" });

// ---------- Perfil (o próprio usuário logado) ----------
// Espelha repo.js MAX_BIO_LENGTH no servidor: só para o textarea recusar
// digitar além disso, a autoridade continua sendo a validação do lado de lá.
export const MAX_BIO_LENGTH = 280;
export const updateMyProfile = (data) => request("/profile", { method: "PATCH", body: data });
export const removeMyAvatar = () => request("/profile/avatar", { method: "DELETE" });
// Upload não passa pelo request(): o corpo é multipart, montado pelo próprio
// navegador com o boundary correto - mesmo desenho de addFileAttachment.
export async function uploadMyAvatar(file) {
  const form = new FormData();
  form.append("file", file, file.name);
  let res;
  try {
    res = await fetch(`${BASE}/profile/avatar`, { method: "POST", body: form, credentials: "same-origin" });
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
// Endereço por CEP (ViaCEP, via proxy do servidor). Devolve { cep, logradouro,
// complemento, bairro, cidade, uf }.
export const buscarCep = (cep) => request(`/cep/${encodeURIComponent(String(cep).replace(/\D/g, ""))}`);
export const buscarCnpj = (cnpj) => request(`/cnpj/${encodeURIComponent(String(cnpj).replace(/\D/g, ""))}`);

// ---------- Chat ----------
export const listChatConversations = () => request("/chat/conversations");
export const createChatConversation = (userId) => request("/chat/conversations", { method: "POST", body: { userId } });
export const listChatMessages = (conversationId, afterId) => {
  const params = new URLSearchParams();
  if (conversationId) params.set("conversationId", conversationId);
  if (afterId) params.set("after", afterId);
  const qs = params.toString();
  return request(`/chat/messages${qs ? `?${qs}` : ""}`);
};
export const sendChatMessage = (body, conversationId) =>
  request("/chat/messages", { method: "POST", body: { body, conversationId } });
export const markChatRead = (conversationId, lastMessageId) =>
  request("/chat/read", { method: "POST", body: { conversationId, lastMessageId } });

// ---------- Módulos da plataforma ----------
// Catálogo dos pilares (Vendas & CRM, Financeiro...) já com enabled/available
// resolvidos pelo servidor. A casca (PlatformShell) consulta uma vez ao entrar
// para saber quais módulos abrir e quais mostrar como "Em breve".
export const getModules = () => request("/modules");

// ---------- Módulo Financeiro ----------
// Passa o locale para o servidor semear as categorias padrão na 1ª leitura (a
// empresa não guarda idioma, mesmo caso do quadro inicial).
export const finListCategorias = (locale) => request(`/financeiro/categorias?locale=${encodeURIComponent(locale || "pt")}`);
export const finCreateCategoria = (data) => request("/financeiro/categorias", { method: "POST", body: data });
export const finUpdateCategoria = (id, data) => request(`/financeiro/categorias/${id}`, { method: "PATCH", body: data });
export const finListLancamentos = (filtros = {}) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v);
  const s = qs.toString();
  return request("/financeiro/lancamentos" + (s ? `?${s}` : ""));
};
export const finCreateLancamento = (data) => request("/financeiro/lancamentos", { method: "POST", body: data });
export const finUpdateLancamento = (id, data) => request(`/financeiro/lancamentos/${id}`, { method: "PATCH", body: data });
export const finBaixarLancamento = (id, { paidAt, contaId } = {}) =>
  request(`/financeiro/lancamentos/${id}/baixar`, { method: "POST", body: { ...(paidAt ? { paidAt } : {}), ...(contaId ? { contaId } : {}) } });
export const finEstornarLancamento = (id) => request(`/financeiro/lancamentos/${id}/estornar`, { method: "POST" });
export const finDefinirConferido = (id, conferido) => request(`/financeiro/lancamentos/${id}/conferido`, { method: "PATCH", body: { conferido } });
export const finCriarMovimentoManual = (dados) => request("/financeiro/movimentacao/manual", { method: "POST", body: dados });
// Movimentação de uma conta num período - busca sob demanda (só ao clicar Filtrar).
export const finMovimentacao = ({ contaId, de, ate, estornados } = {}) => {
  const qs = new URLSearchParams({ contaId, de, ate });
  if (estornados) qs.set("estornados", "1");
  return request(`/financeiro/movimentacao?${qs.toString()}`);
};
export const finMudarStatus = (id, status) => request(`/financeiro/lancamentos/${id}/status`, { method: "PATCH", body: { status } });
export const finDesdobrarLancamento = (id, dados) => request(`/financeiro/lancamentos/${id}/desdobrar`, { method: "POST", body: dados });
export const finListImpostosAplicados = (id) => request(`/financeiro/lancamentos/${id}/impostos`);
export const finListApropriacoes = (id) => request(`/financeiro/lancamentos/${id}/apropriacoes`);
export const finDefinirApropriacoes = (id, itens) => request(`/financeiro/lancamentos/${id}/apropriacoes`, { method: "PUT", body: { itens } });
export const finAplicarImposto = (id, impostoId) => request(`/financeiro/lancamentos/${id}/impostos`, { method: "POST", body: { impostoId } });
export const finRemoverImpostoAplicado = (id, aplicadoId) => request(`/financeiro/lancamentos/${id}/impostos/${aplicadoId}`, { method: "DELETE" });
export const finDeleteLancamento = (id) => request(`/financeiro/lancamentos/${id}`, { method: "DELETE" });
export const finGetFluxo = (ano) => request(`/financeiro/fluxo?ano=${ano}`);
export const finGetDRE = (de, ate) => request(`/financeiro/dre?de=${de}&ate=${ate}`);
// Fluxo de Caixa em matriz (DRE de caixa por período) - visão alternativa ao
// /fluxo acima (que é só o resumo do ano corrente).
export const finFluxoCaixaMatriz = ({ view, referencia, contaId }) => {
  const p = new URLSearchParams({ view, referencia });
  if (contaId) p.set("contaId", contaId);
  return request(`/financeiro/fluxo-caixa/matriz?${p}`);
};
export const finFluxoCaixaLancamentos = ({ grupo, de, ate, contaId }) => {
  const p = new URLSearchParams({ grupo, de, ate });
  if (contaId) p.set("contaId", contaId);
  return request(`/financeiro/fluxo-caixa/lancamentos?${p}`);
};
// Mesmo desenho de scBaixarRelatorio (Saúde & Clínicas) - blob + link temporário; a
// matriz não passa pelo formato colunas/linhas genérico, então tem sua própria rota.
export async function finFluxoCaixaExport({ view, referencia, contaId, formato, lang }) {
  const p = new URLSearchParams({ view, referencia, formato });
  if (contaId) p.set("contaId", contaId);
  if (lang) p.set("lang", lang);
  let res;
  try {
    res = await fetch(`${BASE}/financeiro/fluxo-caixa/export?${p}`, { credentials: "same-origin" });
  } catch {
    throw erroDeRede();
  }
  if (!res.ok) {
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
  const disposicao = res.headers.get("Content-Disposition") || "";
  const casado = /filename="?([^";]+)"?/i.exec(disposicao);
  const nome = casado ? casado[1] : `fluxo-caixa.${formato}`;
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
// Fundação: cadastros de apoio e saldos por conta.
export const finListContas = () => request("/financeiro/contas");
export const finCreateConta = (data) => request("/financeiro/contas", { method: "POST", body: data });
export const finUpdateConta = (id, data) => request(`/financeiro/contas/${id}`, { method: "PATCH", body: data });
// Centro de custo hierárquico: cada empresa gerencia os SEUS (o painel da
// plataforma mantém a visão cross-empresa). Criar recebe { codigo, nome }; o
// código define a hierarquia (o pai é derivado dele). Editar muda só a descrição;
// mandar { ativo } ativa/desativa (cascata no servidor).
export const finListCentrosCusto = () => request("/financeiro/centros-custo");
export const finCreateCentroCusto = (data) => request("/financeiro/centros-custo", { method: "POST", body: data });
export const finUpdateCentroCusto = (id, data) => request(`/financeiro/centros-custo/${id}`, { method: "PATCH", body: data });
export const finDeleteCentroCusto = (id) => request(`/financeiro/centros-custo/${id}`, { method: "DELETE" });
export const finExcluirTodosCentros = () => request("/financeiro/centros-custo", { method: "DELETE" });
// Import em lote por planilha (FormData, fora do request() pelo boundary do
// multipart). Devolve { criados, ignorados, erros, resultados }.
export async function finImportarCentros(file) {
  const form = new FormData();
  form.append("file", file, file.name);
  let res;
  try {
    res = await fetch(`${BASE}/financeiro/centros-custo/importar`, { method: "POST", body: form, credentials: "same-origin" });
  } catch {
    throw erroDeRede();
  }
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Erro ${res.status}`);
    err.code = data?.code || null;
    err.status = res.status;
    throw err;
  }
  return data;
}
export async function finBaixarModeloCentros() {
  let res;
  try {
    res = await fetch(`${BASE}/financeiro/centros-custo/modelo`, { credentials: "same-origin" });
  } catch {
    throw erroDeRede();
  }
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-centros-custo.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
export async function finImportarCategorias(file) {
  const form = new FormData();
  form.append("file", file, file.name);
  let res;
  try {
    res = await fetch(`${BASE}/financeiro/categorias/importar`, { method: "POST", body: form, credentials: "same-origin" });
  } catch {
    throw erroDeRede();
  }
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Erro ${res.status}`);
    err.code = data?.code || null;
    err.status = res.status;
    throw err;
  }
  return data;
}
export async function finBaixarModeloCategorias() {
  let res;
  try {
    res = await fetch(`${BASE}/financeiro/categorias/modelo`, { credentials: "same-origin" });
  } catch {
    throw erroDeRede();
  }
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-classes.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
export const finListContatos = () => request("/financeiro/contatos");
export const finCreateContato = (data) => request("/financeiro/contatos", { method: "POST", body: data });
export const finUpdateContato = (id, data) => request(`/financeiro/contatos/${id}`, { method: "PATCH", body: data });
export const finGetSaldos = () => request("/financeiro/saldos");
export const finListImpostos = () => request("/financeiro/impostos");
export const finCreateImposto = (data) => request("/financeiro/impostos", { method: "POST", body: data });
export const finUpdateImposto = (id, data) => request(`/financeiro/impostos/${id}`, { method: "PATCH", body: data });
export const finListCodigosServico = () => request("/financeiro/codigos-servico");
export const finCreateCodigoServico = (data) => request("/financeiro/codigos-servico", { method: "POST", body: data });
export const finUpdateCodigoServico = (id, data) => request(`/financeiro/codigos-servico/${id}`, { method: "PATCH", body: data });

// ---------- Extrato bancário (PDF -> preview -> importar/Excel) ----------
// Preview: sobe o PDF (FormData, como o anexo de cartão - fora do request() para o
// boundary do multipart sair certo) e recebe as transações já parseadas, sem
// importar nada ainda.
export async function finExtratoPreview(file) {
  const form = new FormData();
  form.append("file", file, file.name);
  let res;
  try {
    res = await fetch(`${BASE}/financeiro/extrato/preview`, { method: "POST", body: form, credentials: "same-origin" });
  } catch {
    throw erroDeRede();
  }
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Erro ${res.status}`);
    err.code = data?.code || null;
    err.status = res.status;
    throw err;
  }
  return data;
}
export const finImportarExtrato = (contaId, transacoes) =>
  request("/financeiro/extrato/importar", { method: "POST", body: { contaId, transacoes } });
export async function finExtratoExcel(transacoes) {
  let res;
  try {
    res = await fetch(`${BASE}/financeiro/extrato/excel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ transacoes }),
    });
  } catch {
    throw erroDeRede();
  }
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* sem corpo */ }
    const err = new Error(data?.error || `Erro ${res.status}`);
    err.code = data?.code || null;
    throw err;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "extrato.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Saúde & Clínicas ----------
// Prefixo sc*, mesmo padrão do fin* do Financeiro.
export const scGetConfig = () => request("/saude-clinicas/config");
export const scSetClinicType = (clinicType) => request("/saude-clinicas/config", { method: "PUT", body: { clinicType } });
export const scSetTheme = (theme) => request("/saude-clinicas/config", { method: "PUT", body: { theme } });
export const scSetClinicName = (clinicName) => request("/saude-clinicas/config", { method: "PUT", body: { clinicName } });
export const scRemoverClinicLogo = () => request("/saude-clinicas/config/logo", { method: "DELETE" });
// Upload não passa pelo request() (corpo multipart) - mesmo desenho de scUploadPatientPhoto.
export async function scUploadClinicLogo(file) {
  const form = new FormData();
  form.append("file", file, file.name);
  let res;
  try {
    res = await fetch(`${BASE}/saude-clinicas/config/logo`, { method: "POST", body: form, credentials: "same-origin" });
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

export const scListPatients = () => request("/saude-clinicas/patients");
export const scCreatePatient = (data) => request("/saude-clinicas/patients", { method: "POST", body: data });
export const scUpdatePatient = (id, data) => request(`/saude-clinicas/patients/${id}`, { method: "PATCH", body: data });

export const scListAnamneseTemplates = () => request("/saude-clinicas/anamnesis-templates");
export const scCreateAnamneseTemplate = (data) => request("/saude-clinicas/anamnesis-templates", { method: "POST", body: data });
export const scUpdateAnamneseTemplate = (id, data) => request(`/saude-clinicas/anamnesis-templates/${id}`, { method: "PATCH", body: data });

export const scListAnamneseResponses = (patientId) =>
  request(`/saude-clinicas/anamnesis-responses${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ""}`);
export const scCreateAnamneseResponse = (templateId, patientId) =>
  request("/saude-clinicas/anamnesis-responses", { method: "POST", body: { templateId, patientId } });
export const scEnviarAnamneseResponse = (id) => request(`/saude-clinicas/anamnesis-responses/${id}/enviar`, { method: "POST" });
export const scAtualizarAnamneseResposta = (id, answers) =>
  request(`/saude-clinicas/anamnesis-responses/${id}`, { method: "PATCH", body: { answers } });

// Formulário público (o paciente, sem sessão) - fora de /saude-clinicas, mora
// em /public/anamnese no servidor (server/routes/anamnesePublica.js).
export const scGetAnamnesePublica = (companyId, token) => request(`/public/anamnese/${companyId}/${token}`);
export const scResponderAnamnesePublica = (companyId, token, answers) =>
  request(`/public/anamnese/${companyId}/${token}`, { method: "POST", body: { answers } });

// Captação: link fixo por template, para quem ainda não é paciente. URL só
// com o slug curto e opaco (mesma rota pública, mesmo servidor - ver
// server/routes/anamnesePublica.js e captacaoStore.js).
export const scGetAnamneseCaptacao = (slug) => request(`/public/anamnese/novo/${slug}`);
export const scResponderAnamneseCaptacao = (slug, answers) =>
  request(`/public/anamnese/novo/${slug}`, { method: "POST", body: { answers } });

// ---------- Agenda (Saúde & Clínicas) ----------
export const scGetDashboard = (from, to, professionalId) =>
  request(`/saude-clinicas/dashboard?from=${from}&to=${to}${professionalId ? `&professionalId=${professionalId}` : ""}`);

function filtrosDoRelatorioSc({ from, to, professionalId, groupBy, page, pageSize }) {
  const p = new URLSearchParams({ from, to });
  if (professionalId) p.set("professionalId", professionalId);
  if (groupBy) p.set("groupBy", groupBy);
  if (page) p.set("page", page);
  if (pageSize) p.set("pageSize", pageSize);
  return p;
}
export const scGetReport = (tipo, filtros) => request(`/saude-clinicas/reports/${tipo}?${filtrosDoRelatorioSc(filtros)}`);
export const scListComissoes = () => request("/saude-clinicas/commissions");
export const scSetComissao = (userId, commissionPct) => request(`/saude-clinicas/commissions/${userId}`, { method: "PUT", body: { commissionPct } });

// Mesmo desenho de baixarRelatorio (Kanban): busca o arquivo via fetch (não
// dá pra baixar arquivo binário com <a href> direto porque a rota exige
// sessão/cookie), monta um blob e simula o clique num link temporário. Nome
// do arquivo vem do Content-Disposition que o servidor já decidiu.
export async function scBaixarRelatorio(tipo, formato, filtros, lang) {
  const p = filtrosDoRelatorioSc(filtros);
  p.set("formato", formato);
  if (lang) p.set("lang", lang);
  let res;
  try {
    res = await fetch(`${BASE}/saude-clinicas/reports/${tipo}/export?${p}`, { credentials: "same-origin" });
  } catch {
    throw erroDeRede();
  }
  if (!res.ok) {
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
  const disposicao = res.headers.get("Content-Disposition") || "";
  const casado = /filename="?([^";]+)"?/i.exec(disposicao);
  const nome = casado ? casado[1] : `${tipo}.${formato}`;
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
export const scListProcedures = () => request("/saude-clinicas/procedures");
export const scListAllProcedures = () => request("/saude-clinicas/procedures/all");
export const scCreateProcedure = (dados) => request("/saude-clinicas/procedures", { method: "POST", body: dados });
export const scUpdateProcedure = (id, dados) => request(`/saude-clinicas/procedures/${id}`, { method: "PATCH", body: dados });

export const scListInsurancePlans = () => request("/saude-clinicas/insurance-plans");
export const scCreateInsurancePlan = (dados) => request("/saude-clinicas/insurance-plans", { method: "POST", body: dados });
export const scUpdateInsurancePlan = (id, dados) => request(`/saude-clinicas/insurance-plans/${id}`, { method: "PATCH", body: dados });
export const scListPlanPrices = (planId) => request(`/saude-clinicas/insurance-plans/${planId}/prices`);
export const scSetPlanPrice = (planId, procedureId, priceCents) =>
  request(`/saude-clinicas/insurance-plans/${planId}/prices/${procedureId}`, { method: "PUT", body: { priceCents } });

// ---------- Financeiro (Saúde & Clínicas) ----------
export const scFinListContas = () => request("/saude-clinicas/financeiro/contas");
export const scFinListAllContas = () => request("/saude-clinicas/financeiro/contas/all");
export const scFinCreateConta = (dados) => request("/saude-clinicas/financeiro/contas", { method: "POST", body: dados });
export const scFinUpdateConta = (id, dados) => request(`/saude-clinicas/financeiro/contas/${id}`, { method: "PATCH", body: dados });

export const scFinListCategorias = (tipo) => request(`/saude-clinicas/financeiro/categorias${tipo ? `?tipo=${tipo}` : ""}`);
export const scFinListAllCategorias = () => request("/saude-clinicas/financeiro/categorias/all");
export const scFinCreateCategoria = (dados) => request("/saude-clinicas/financeiro/categorias", { method: "POST", body: dados });
export const scFinUpdateCategoria = (id, dados) => request(`/saude-clinicas/financeiro/categorias/${id}`, { method: "PATCH", body: dados });
export const scFinDeleteCategoria = (id) => request(`/saude-clinicas/financeiro/categorias/${id}`, { method: "DELETE" });

export const scFinListAllSubcategorias = () => request("/saude-clinicas/financeiro/subcategorias/all");
export const scFinCreateSubcategoria = (categoriaId, dados) =>
  request(`/saude-clinicas/financeiro/categorias/${categoriaId}/subcategorias`, { method: "POST", body: dados });
export const scFinUpdateSubcategoriasLote = (ids, ativo) =>
  request("/saude-clinicas/financeiro/subcategorias/lote", { method: "PATCH", body: { ids, ativo } });
export const scFinDeleteSubcategoriasLote = (ids) =>
  request("/saude-clinicas/financeiro/subcategorias/lote", { method: "DELETE", body: { ids } });

export const scFinListCentrosCusto = () => request("/saude-clinicas/financeiro/centros-custo");
export const scFinListAllCentrosCusto = () => request("/saude-clinicas/financeiro/centros-custo/all");
export const scFinCreateCentroCusto = (dados) => request("/saude-clinicas/financeiro/centros-custo", { method: "POST", body: dados });
export const scFinUpdateCentroCusto = (id, dados) => request(`/saude-clinicas/financeiro/centros-custo/${id}`, { method: "PATCH", body: dados });

export const scFinListLancamentos = ({ tipo, contaId, de, ate } = {}) => {
  const p = new URLSearchParams();
  if (tipo) p.set("tipo", tipo);
  if (contaId) p.set("contaId", contaId);
  if (de) p.set("de", de);
  if (ate) p.set("ate", ate);
  return request(`/saude-clinicas/financeiro/lancamentos?${p}`);
};
export const scFinCreateLancamento = (dados) => request("/saude-clinicas/financeiro/lancamentos", { method: "POST", body: dados });
export const scFinUpdateLancamento = (id, dados) => request(`/saude-clinicas/financeiro/lancamentos/${id}`, { method: "PATCH", body: dados });
export const scFinDeleteLancamento = (id) => request(`/saude-clinicas/financeiro/lancamentos/${id}`, { method: "DELETE" });

export const scFinGetResumo = (de, ate) => request(`/saude-clinicas/financeiro/resumo?de=${de}&ate=${ate}`);
export const scListAppointments = (from, to) => request(`/saude-clinicas/appointments?from=${from}&to=${to}`);
export const scListPatientAppointments = (patientId) => request(`/saude-clinicas/patients/${patientId}/appointments`);
export const scListAppointmentLogs = (appointmentId) => request(`/saude-clinicas/appointments/${appointmentId}/logs`);
// Upload não passa pelo request() (corpo multipart) - mesmo desenho de uploadMyAvatar.
export async function scUploadPatientPhoto(patientId, file) {
  const form = new FormData();
  form.append("file", file, file.name);
  let res;
  try {
    res = await fetch(`${BASE}/saude-clinicas/patients/${patientId}/photo`, { method: "POST", body: form, credentials: "same-origin" });
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
export const scCreateAppointment = (data) => request("/saude-clinicas/appointments", { method: "POST", body: data });
export const scUpdateAppointment = (id, data) => request(`/saude-clinicas/appointments/${id}`, { method: "PATCH", body: data });
export const scListBlocks = (from, to) => request(`/saude-clinicas/blocks?from=${from}&to=${to}`);
export const scCreateBlock = (data) => request("/saude-clinicas/blocks", { method: "POST", body: data });
export const scDeleteBlock = (id) => request(`/saude-clinicas/blocks/${id}`, { method: "DELETE" });
export const scListWaitlist = () => request("/saude-clinicas/waitlist");
export const scCreateWaitlistEntry = (data) => request("/saude-clinicas/waitlist", { method: "POST", body: data });
export const scCancelarEspera = (id) => request(`/saude-clinicas/waitlist/${id}/cancelar`, { method: "POST" });
export const scConverterEspera = (id, data) => request(`/saude-clinicas/waitlist/${id}/converter`, { method: "POST", body: data });

// ---------- CRM ----------
export const crmListContacts = () => request("/crm/contacts");
export const crmCreateContact = (data) => request("/crm/contacts", { method: "POST", body: data });
export const crmUpdateContact = (id, data) => request(`/crm/contacts/${id}`, { method: "PATCH", body: data });

export const crmListStages = () => request("/crm/stages");
export const crmListOpportunities = () => request("/crm/opportunities");
export const crmCreateOpportunity = (data) => request("/crm/opportunities", { method: "POST", body: data });
export const crmUpdateOpportunity = (id, data) => request(`/crm/opportunities/${id}`, { method: "PATCH", body: data });
export const crmMoverOportunidade = (id, stageId) => request(`/crm/opportunities/${id}/mover`, { method: "POST", body: { stageId } });

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

// ---------- Agenda pessoal (Planejador) ----------
export const listPersonalTasks = () => request("/personal-tasks");
export const createPersonalTask = (data) => request("/personal-tasks", { method: "POST", body: data });
export const updatePersonalTask = (id, patch) => request(`/personal-tasks/${id}`, { method: "PATCH", body: patch });
export const deletePersonalTask = (id) => request(`/personal-tasks/${id}`, { method: "DELETE" });

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

// ---------- Xaphires Beauty ----------
// Prefixo xb*, mesmo padrão do sc* de Saúde & Clínicas.
export const xbGetConfig = () => request("/xaphires-beauty/config");

// Clientes
export const xbGetClients = () => request("/xaphires-beauty/clients");
export const xbCreateClient = (data) => request("/xaphires-beauty/clients", { method: "POST", body: data });
export const xbUpdateClient = (id, data) => request(`/xaphires-beauty/clients/${id}`, { method: "PATCH", body: data });
export const xbDeleteClient = (id) => request(`/xaphires-beauty/clients/${id}`, { method: "DELETE" });
export const xbGetClientRanking = (from, to) => request(`/xaphires-beauty/clients/ranking?from=${from}&to=${to}`);
export const xbGetUpcomingBirthdays = (days) => request(`/xaphires-beauty/clients/birthdays?days=${days}`);
export const xbGetClientAppointments = (id) => request(`/xaphires-beauty/clients/${id}/appointments`);

// Upload não passa pelo request() (corpo multipart) - mesmo desenho de scUploadPatientPhoto.
export async function xbUploadClientPhoto(clientId, file) {
  const form = new FormData();
  form.append("file", file, file.name);
  let res;
  try {
    res = await fetch(`${BASE}/xaphires-beauty/clients/${clientId}/photo`, { method: "POST", body: form, credentials: "same-origin" });
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

// Serviços
export const xbGetServices = () => request("/xaphires-beauty/services");
export const xbCreateService = (data) => request("/xaphires-beauty/services", { method: "POST", body: data });
export const xbUpdateService = (id, data) => request(`/xaphires-beauty/services/${id}`, { method: "PATCH", body: data });
export const xbDeleteService = (id) => request(`/xaphires-beauty/services/${id}`, { method: "DELETE" });
export const xbGetServiceRanking = (from, to) => request(`/xaphires-beauty/services/ranking?from=${from}&to=${to}`);

// Upload não passa pelo request() (corpo multipart) - mesmo desenho de xbUploadClientPhoto.
export async function xbUploadServicePhoto(serviceId, file) {
  const form = new FormData();
  form.append("file", file, file.name);
  let res;
  try {
    res = await fetch(`${BASE}/xaphires-beauty/services/${serviceId}/photo`, { method: "POST", body: form, credentials: "same-origin" });
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

// Agenda
export const xbGetAppointments = (from, to) => request(`/xaphires-beauty/appointments?from=${from}&to=${to}`);
export const xbCreateAppointment = (data) => request("/xaphires-beauty/appointments", { method: "POST", body: data });
export const xbSetAppointmentStatus = (id, status) =>
  request(`/xaphires-beauty/appointments/${id}/status`, { method: "PATCH", body: { status } });

// Profissionais + financeiro (Premium+)
export const xbGetStaff = () => request("/xaphires-beauty/staff");
export const xbCreateStaff = (data) => request("/xaphires-beauty/staff", { method: "POST", body: data });
export const xbUpdateStaff = (id, data) => request(`/xaphires-beauty/staff/${id}`, { method: "PATCH", body: data });
export const xbDeleteStaff = (id) => request(`/xaphires-beauty/staff/${id}`, { method: "DELETE" });

export const xbGetPayments = (from, to) => request(`/xaphires-beauty/payments?from=${from}&to=${to}`);
export const xbCreatePayment = (data) => request("/xaphires-beauty/payments", { method: "POST", body: data });

export const xbGetCommissions = (from, to) => request(`/xaphires-beauty/commissions?from=${from}&to=${to}`);
export const xbGetCommissionOverrides = () => request("/xaphires-beauty/commissions/overrides");
export const xbSetCommissionOverride = (staffId, serviceId, commissionRate) =>
  request("/xaphires-beauty/commissions/overrides", { method: "PUT", body: { staffId, serviceId, commissionRate } });
export const xbDeleteCommissionOverride = (staffId, serviceId) =>
  request(`/xaphires-beauty/commissions/overrides/${staffId}/${serviceId}`, { method: "DELETE" });
export const xbGetRevenueByMethod = (from, to) => request(`/xaphires-beauty/revenue-by-method?from=${from}&to=${to}`);
export const xbGetMonthlySummary = (year) => request(`/xaphires-beauty/monthly-summary?year=${year}`);

// Link público de agendamento (Profissional+)
export const xbGetBookingLink = () => request("/xaphires-beauty/booking-link");

// Formulário público (sem sessão) - visitante marcando o próprio horário.
export const xbPublicGetBooking = (slug) => request(`/public/xaphires-beauty/${slug}`);
export const xbPublicCreateBooking = (slug, data) => request(`/public/xaphires-beauty/${slug}`, { method: "POST", body: data });
