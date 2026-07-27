// Cliente da API do painel de plataforma.
//
// Separado de state/api.js de propósito: são duas sessões distintas, com cookies
// diferentes, e misturar os dois arquivos convidaria alguém a reaproveitar uma
// função do app aqui — o que abriria caminho para o painel chamar rota de cliente
// achando que está autenticado.

const BASE = "/api/admin";

async function req(caminho, { method = "GET", body } = {}) {
  const res = await fetch(BASE + caminho, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
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

export const login = (email, password) => req("/login", { method: "POST", body: { email, password } });
export const logout = () => req("/logout", { method: "POST" });
export const me = () => req("/me");

export const listarEmpresas = () => req("/companies");
export const verEmpresa = (id) => req(`/companies/${id}`);
export const criarEmpresa = (dados) => req("/companies", { method: "POST", body: dados });
export const editarEmpresa = (id, dados) => req(`/companies/${id}`, { method: "PATCH", body: dados });
export const definirPlano = (id, plan, expiresAt) => req(`/companies/${id}/plan`, { method: "POST", body: { plan, expiresAt } });
export const bloquear = (id, blocked, reason) => req(`/companies/${id}/block`, { method: "POST", body: { blocked, reason } });

export const verQuadros = (id) => req(`/companies/${id}/boards`);
export const alterarCartao = (id, cardId, patch) => req(`/companies/${id}/cards/${cardId}`, { method: "PATCH", body: patch });
export const definirPapel = (id, userId, role) => req(`/companies/${id}/users/${userId}/role`, { method: "POST", body: { role } });

export const metricas = () => req("/metrics");
export const auditoria = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return req(`/audit${q ? `?${q}` : ""}`);
};

export const listarAdmins = () => req("/admins");
export const criarAdmin = (dados) => req("/admins", { method: "POST", body: dados });
export const definirAdminAtivo = (id, active) => req(`/admins/${id}/active`, { method: "POST", body: { active } });
