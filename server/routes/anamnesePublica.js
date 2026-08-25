// Formulário de pré-anamnese que o PACIENTE preenche pelo celular, a partir de
// um link mandado por WhatsApp (server/modules/saude-clinicas/routes.js
// /anamnesis-responses/:id/enviar gera o token). Sem sessão nenhuma - por
// isso entra manualmente no runWithCompany, o mesmo escape do ALS que o
// upload de anexo em routes/cards.js já faz.
//
// Montada em app.js ANTES do verifyOrigin, junto do webhook de cobrança: o
// navegador do paciente, aberto de dentro do app do WhatsApp, pode não mandar
// Origin/Referer, e não há cookie de sessão para o CSRF proteger aqui de
// qualquer forma.
import { Router } from "express";
import { ah } from "../asyncHandler.js";
import { getCompany } from "../directory.js";
import { runWithCompany } from "../context.js";
import {
  getRespostaPorToken,
  getAnamneseTemplate,
  getPatient,
  responderAnamnese,
  criarPacienteERespostaPublica,
} from "../modules/saude-clinicas/repo.js";
import { rateLimit } from "../rateLimit.js";

const router = Router();

// Mesma janela do login: um token é só 24 bytes aleatórios (base64url), mas
// nada custa limitar a varredura por força bruta a partir de um IP.
const limitePublico = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyFn: (req) => `anamnese-publica:${req.ip}`,
  message: "Muitas tentativas. Aguarde alguns minutos.",
  code: "TOO_MANY_REQUESTS",
});

function parseFields(fields) {
  try {
    return typeof fields === "string" ? JSON.parse(fields) : fields;
  } catch {
    return [];
  }
}

router.get(
  "/:companyId/:token",
  limitePublico,
  ah(async (req, res) => {
    const { companyId, token } = req.params;
    // Mesma cautela do requireAuth: confere a empresa ANTES de entrar no
    // contexto, para não ressuscitar a pasta de uma empresa apagada.
    if (!getCompany(companyId)) {
      return res.status(404).json({ error: "Link inválido", code: "ANAMNESE_TOKEN_INVALIDO" });
    }
    runWithCompany(companyId, () => {
      const resposta = getRespostaPorToken(token);
      if (!resposta) return res.status(404).json({ error: "Link inválido ou expirado", code: "ANAMNESE_TOKEN_INVALIDO" });
      if (resposta.status === "respondido") {
        return res.status(409).json({ error: "Esta ficha já foi respondida", code: "ANAMNESE_JA_RESPONDIDA" });
      }
      const template = getAnamneseTemplate(resposta.template_id);
      const paciente = getPatient(resposta.patient_id);
      res.json({
        patientName: paciente?.name || "",
        templateName: template?.name || "",
        description: template?.description || "",
        fields: parseFields(template?.fields),
      });
    });
  })
);

router.post(
  "/:companyId/:token",
  limitePublico,
  ah(async (req, res) => {
    const { companyId, token } = req.params;
    if (!getCompany(companyId)) {
      return res.status(404).json({ error: "Link inválido", code: "ANAMNESE_TOKEN_INVALIDO" });
    }
    runWithCompany(companyId, () => {
      const atual = getRespostaPorToken(token);
      if (!atual) return res.status(404).json({ error: "Link inválido ou expirado", code: "ANAMNESE_TOKEN_INVALIDO" });
      if (atual.status === "respondido") {
        return res.status(409).json({ error: "Esta ficha já foi respondida", code: "ANAMNESE_JA_RESPONDIDA" });
      }
      responderAnamnese(token, req.body?.answers || {});
      res.json({ ok: true });
    });
  })
);

// ---------- Captação: link fixo por template, para gente que ainda não é
// paciente (ver AnamneseCaptacaoPage.jsx) ----------
//
// Diferente do link por resposta acima (um token por envio, achado por
// getRespostaPorToken), este é o mesmo link sempre - qualquer pessoa que
// abra cria o próprio cadastro de paciente ao enviar. Por isso a URL usa o
// id do template direto: não é segredo de acesso a um dado que já existe
// (não há resposta nenhuma até o POST), é só "qual formulário abrir".
//
// O nome do paciente vem da própria resposta: procura um campo do template
// com um destes ids, na ordem - convenção que a Anamnese Nutricional padrão
// já segue (ver seed.js). Template sem nenhum desses ids não tem como virar
// paciente sozinho, e a rota recusa antes de criar um cadastro sem nome.
const CAMPOS_DE_NOME = ["nome_completo", "nome"];

function extrairDadosPaciente(fields, answers) {
  const campoNome = fields.find((f) => CAMPOS_DE_NOME.includes(f.id));
  const nome = campoNome ? String(answers?.[campoNome.id] || "").trim() : "";
  const campoTelefone = fields.find((f) => f.id === "telefone" || f.type === "tel");
  const campoEmail = fields.find((f) => f.id === "email" || f.type === "email");
  const campoNascimento = fields.find((f) => f.id === "data_nascimento" || f.type === "date");
  const campoCpf = fields.find((f) => f.id === "cpf");
  return {
    nome,
    phone: campoTelefone ? answers?.[campoTelefone.id] || "" : "",
    email: campoEmail ? answers?.[campoEmail.id] || "" : "",
    birthDate: campoNascimento ? answers?.[campoNascimento.id] || null : null,
    cpf: campoCpf ? answers?.[campoCpf.id] || "" : "",
  };
}

router.get(
  "/novo/:companyId/:templateId",
  limitePublico,
  ah(async (req, res) => {
    const { companyId, templateId } = req.params;
    if (!getCompany(companyId)) {
      return res.status(404).json({ error: "Link inválido", code: "ANAMNESE_TOKEN_INVALIDO" });
    }
    runWithCompany(companyId, () => {
      const template = getAnamneseTemplate(templateId);
      if (!template || !template.active) {
        return res.status(404).json({ error: "Link inválido", code: "ANAMNESE_TOKEN_INVALIDO" });
      }
      res.json({
        templateName: template.name,
        description: template.description || "",
        fields: parseFields(template.fields),
      });
    });
  })
);

router.post(
  "/novo/:companyId/:templateId",
  limitePublico,
  ah(async (req, res) => {
    const { companyId, templateId } = req.params;
    if (!getCompany(companyId)) {
      return res.status(404).json({ error: "Link inválido", code: "ANAMNESE_TOKEN_INVALIDO" });
    }
    runWithCompany(companyId, () => {
      const template = getAnamneseTemplate(templateId);
      if (!template || !template.active) {
        return res.status(404).json({ error: "Link inválido", code: "ANAMNESE_TOKEN_INVALIDO" });
      }
      const answers = req.body?.answers || {};
      const { nome, ...resto } = extrairDadosPaciente(parseFields(template.fields), answers);
      if (!nome) {
        return res.status(400).json({ error: "Informe seu nome completo", code: "ANAMNESE_NOME_OBRIGATORIO" });
      }
      criarPacienteERespostaPublica({
        templateId,
        dadosPaciente: { name: nome, ...resto, referralSource: "Formulário público de captação" },
        answers,
      });
      res.json({ ok: true });
    });
  })
);

export { router };
