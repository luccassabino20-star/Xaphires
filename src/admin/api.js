// Cliente da API do painel de plataforma.
//
// Separado de state/api.js de propósito: são duas sessões distintas, com cookies
// diferentes, e misturar os dois arquivos convidaria alguém a reaproveitar uma
// função do app aqui — o que abriria caminho para o painel chamar rota de cliente
// achando que está autenticado.

const BASE = "/api/admin";

async function tratarResposta(res) {
  let dados = null;
  try {
    dados = await res.json();
  } catch {
    /* sem corpo */
  }
  if (!res.ok) {
    const err = new Error(dados?.error || `Erro ${res.status}`);
    err.code = dados?.code || null;
    err.status = res.status;
    throw err;
  }
  return dados;
}

async function req(caminho, { method = "GET", body } = {}) {
  // O fetch() só rejeita quando a requisição não chegou a acontecer: servidor fora
  // do ar, porta errada, rede caída. Sem esta conversão sobe o "Failed to fetch" cru
  // do navegador, que não diz a quem lê o que fazer.
  //
  // A mensagem vai inteira aqui, e não como `code` para traduzir depois: o painel
  // não passa pelo i18n - os componentes mostram err.message direto na tela, e os
  // textos são só em português de propósito, por ser ferramenta interna.
  let res;
  try {
    res = await fetch(BASE + caminho, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    const err = new Error("O servidor não respondeu. Verifique se ele está em execução e tente de novo.");
    err.code = "NETWORK_UNREACHABLE";
    throw err;
  }
  return tratarResposta(res);
}

// Upload de arquivo: FormData, e por isso não passa pelo req() acima - com
// Content-Type forçado para json/undefined ali, o boundary do multipart nunca sairia
// certo. O navegador define o Content-Type sozinho (com boundary) quando o body é um
// FormData, então o cabeçalho fica de fora daqui de propósito.
async function reqUpload(caminho, arquivo) {
  const form = new FormData();
  form.append("file", arquivo);
  let res;
  try {
    res = await fetch(BASE + caminho, { method: "POST", body: form, credentials: "same-origin" });
  } catch {
    const err = new Error("O servidor não respondeu. Verifique se ele está em execução e tente de novo.");
    err.code = "NETWORK_UNREACHABLE";
    throw err;
  }
  return tratarResposta(res);
}

export const login = (email, password) => req("/login", { method: "POST", body: { email, password } });
export const logout = () => req("/logout", { method: "POST" });
export const me = () => req("/me");

export const listarEmpresas = () => req("/companies");
export const verEmpresa = (id) => req(`/companies/${id}`);
export const criarEmpresa = (dados) => req("/companies", { method: "POST", body: dados });
export const editarEmpresa = (id, dados) => req(`/companies/${id}`, { method: "PATCH", body: dados });
export const definirPlano = (id, plan, expiresAt) => req(`/companies/${id}/plan`, { method: "POST", body: { plan, expiresAt } });
export const bloquear = (id, blocked, reason) => req(`/companies/${id}/block`, { method: "POST", body: { blocked, reason } });
export const definirDesconto = (id, discountCents) => req(`/companies/${id}/discount`, { method: "POST", body: { discountCents } });
export const definirLimites = (id, maxUsersOverride, maxAttachmentBytesOverride) =>
  req(`/companies/${id}/limits`, { method: "POST", body: { maxUsersOverride, maxAttachmentBytesOverride } });
export const prorrogarTeste = (id, days) => req(`/companies/${id}/extend-trial`, { method: "POST", body: { days } });

export const verQuadros = (id) => req(`/companies/${id}/boards`);
export const alterarCartao = (id, cardId, patch) => req(`/companies/${id}/cards/${cardId}`, { method: "PATCH", body: patch });
export const definirPapel = (id, userId, role) => req(`/companies/${id}/users/${userId}/role`, { method: "POST", body: { role } });
export const definirEmailUsuario = (id, userId, email) =>
  req(`/companies/${id}/users/${userId}/email`, { method: "POST", body: { email } });

export const metricas = () => req("/metrics");
export const auditoria = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return req(`/audit${q ? `?${q}` : ""}`);
};

export const trocarSenha = (senhaAtual, novaSenha) => req("/senha", { method: "POST", body: { senhaAtual, novaSenha } });

export const listarAdmins = () => req("/admins");
export const criarAdmin = (dados) => req("/admins", { method: "POST", body: dados });
export const definirAdminAtivo = (id, active) => req(`/admins/${id}/active`, { method: "POST", body: { active } });

export const listarPopups = () => req("/popups");
export const criarPopup = (dados) => req("/popups", { method: "POST", body: dados });
export const editarPopup = (id, dados) => req(`/popups/${id}`, { method: "PATCH", body: dados });
export const definirPopupAtivo = (id, active) => req(`/popups/${id}/active`, { method: "POST", body: { active } });
export const excluirPopup = (id) => req(`/popups/${id}`, { method: "DELETE" });
export const enviarImagemPopup = (id, arquivo) => reqUpload(`/popups/${id}/image`, arquivo);
export const removerImagemPopup = (id) => req(`/popups/${id}/image`, { method: "DELETE" });
