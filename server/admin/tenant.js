// Acesso do painel aos dados de uma empresa cliente.
//
// ESTE É O ÚNICO CAMINHO. Nenhuma rota do painel deve chamar runWithCompany
// diretamente, nem abrir getCompanyDb por conta própria. A razão é simples: aqui o
// registro de auditoria acontece ANTES do acesso, no mesmo lugar que concede o
// acesso. Não dá para ler os dados de um cliente e esquecer de registrar, porque a
// função que lê é a que registra.
//
// Quem quiser adicionar uma rota nova que toque em dado de cliente usa
// `comAcessoAEmpresa`. Se aparecer um runWithCompany solto em routes/admin.js, a
// garantia se perde e a trilha passa a ter buracos silenciosos.

import { runWithCompany } from "../context.js";
import { acharEmpresa, registrar } from "./store.js";

// Executa `fn` dentro do contexto da empresa, deixando registro do que foi feito.
//
// `acao` deve descrever a intenção em termos de negócio ("abrir_quadros",
// "alterar_cartao"), e não o verbo HTTP: quem lê a trilha depois quer saber o que
// aconteceu, não qual método foi usado.
export async function comAcessoAEmpresa(req, companyId, acao, fn, { alvo, detalhe } = {}) {
  const empresa = acharEmpresa(companyId);
  if (!empresa) {
    const err = new Error("Empresa não encontrada");
    err.code = "COMPANY_NOT_FOUND";
    err.status = 404;
    throw err;
  }

  // Registra antes de executar. Se `fn` falhar no meio, o registro fica de qualquer
  // forma — o que importa para auditoria é que houve tentativa de acesso, não se
  // ela deu certo.
  registrar({
    adminId: req.admin?.id,
    adminEmail: req.admin?.email,
    acao,
    companyId,
    alvo,
    detalhe,
    ip: req.ip,
  });

  return runWithCompany(companyId, async () => fn(empresa));
}

// Registro de ação que não entra no banco de uma empresa (criar empresa, bloquear,
// mexer em admin da plataforma). Mesma trilha, sem abrir contexto.
export function auditar(req, acao, { companyId, alvo, detalhe } = {}) {
  registrar({
    adminId: req.admin?.id,
    adminEmail: req.admin?.email,
    acao,
    companyId,
    alvo,
    detalhe,
    ip: req.ip,
  });
}
