import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { rateLimit } from "../rateLimit.js";

const router = Router();
router.use(requireAuth);

// Busca de dados de empresa por CNPJ na BrasilAPI (pública, gratuita, sem chave).
// Proxy no servidor pelo mesmo motivo do CEP/geocode: quem aparece lá é o IP da
// instância, não o do usuário - sem um teto aqui, um cliente em laço leva a
// instância inteira a ser bloqueada. Alimenta o "Pesquisar empresa" do cadastro
// de cliente/fornecedor.
const cnpjLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 40,
  keyFn: (req) => req.user?.id || req.ip,
  message: "Muitas buscas de CNPJ em pouco tempo. Aguarde um instante e tente de novo.",
  code: "TOO_MANY_CNPJ_REQUESTS",
});

router.get("/:cnpj", cnpjLimit, async (req, res) => {
  const cnpj = String(req.params.cnpj || "").replace(/\D/g, "");
  if (cnpj.length !== 14) return res.status(400).json({ error: "CNPJ inválido", code: "CNPJ_LOOKUP_INVALID" });
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { "User-Agent": "cantiere-app/1.0 (local self-hosted instance)" },
    });
    // A BrasilAPI devolve 404 quando o CNPJ não existe na base.
    if (resp.status === 404) return res.status(404).json({ error: "CNPJ não encontrado", code: "CNPJ_NOT_FOUND" });
    if (!resp.ok) throw new Error(`BrasilAPI respondeu ${resp.status}`);
    const d = await resp.json();
    // Telefone vem como "DDD + número" colado (ddd_telefone_1); passamos cru, o
    // cliente decide a máscara. Cidade é `municipio`. Só devolvemos o que o
    // formulário de contato usa.
    res.json({
      nome: d.razao_social || "",
      fantasia: d.nome_fantasia || "",
      cep: (d.cep ? String(d.cep).replace(/\D/g, "") : ""),
      logradouro: d.logradouro || "",
      numero: d.numero ? String(d.numero) : "",
      complemento: d.complemento || "",
      bairro: d.bairro || "",
      cidade: d.municipio || "",
      uf: d.uf || "",
      telefone: d.ddd_telefone_1 ? String(d.ddd_telefone_1) : "",
      email: d.email || "",
    });
  } catch {
    res.status(502).json({ error: "Não foi possível buscar o CNPJ agora. Tente novamente.", code: "CNPJ_UNAVAILABLE" });
  }
});

export { router };
