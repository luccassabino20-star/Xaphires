// Rotas do CRM ("vendas-crm"). Schema, repo e rotas separados de propósito
// do Kanban genérico (repo.js/db.js principal) - "vendas-crm" hoje era só um
// apelido do quadro (ver server/modules.js e a migração em
// directory.js:migrarIdModuloQuadro); agora é um pilar com dado próprio, sem
// nenhuma relação com boards/lists/cards.
import { Router } from "express";
import { requireAuth, requireWritablePlan, requireModule } from "../../middleware.js";
import { ah } from "../../asyncHandler.js";
import {
  listContacts,
  insertContact,
  updateContact,
  listStages,
  listOpportunities,
  criarOportunidade,
  moverOportunidade,
  atualizarOportunidade,
  getStage,
} from "./repo.js";
import { seedStagesSeVazio } from "./seed.js";

const router = Router();
router.use(requireAuth, requireWritablePlan, requireModule("vendas-crm"));

// ---------- Contatos ----------

router.get(
  "/contacts",
  ah(async (req, res) => {
    res.json(listContacts());
  })
);

router.post(
  "/contacts",
  ah(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Informe o nome do contato", code: "CRM_CONTACT_NAME_REQUIRED" });
    }
    res.status(201).json(insertContact({ ...req.body, name: name.trim() }, req.user.id));
  })
);

router.patch(
  "/contacts/:id",
  ah(async (req, res) => {
    const atualizado = updateContact(req.params.id, req.body || {});
    if (!atualizado) return res.status(404).json({ error: "Contato não encontrado", code: "CRM_CONTACT_NOT_FOUND" });
    res.json(atualizado);
  })
);

// ---------- Funil ----------

router.get(
  "/stages",
  ah(async (req, res) => {
    seedStagesSeVazio();
    res.json(listStages());
  })
);

router.get(
  "/opportunities",
  ah(async (req, res) => {
    seedStagesSeVazio();
    res.json(listOpportunities());
  })
);

router.post(
  "/opportunities",
  ah(async (req, res) => {
    const { title, contactId, contactName } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Informe o título da oportunidade", code: "CRM_OPPORTUNITY_TITLE_REQUIRED" });
    }
    if (!contactId && (!contactName || !contactName.trim())) {
      return res.status(400).json({ error: "Informe o contato", code: "CRM_CONTACT_REQUIRED" });
    }
    seedStagesSeVazio();
    try {
      const criada = criarOportunidade({ ...req.body, title: title.trim() }, req.user.id);
      res.status(201).json(criada);
    } catch (err) {
      if (err.code) return res.status(400).json({ error: err.message, code: err.code });
      throw err;
    }
  })
);

router.patch(
  "/opportunities/:id",
  ah(async (req, res) => {
    const atualizada = atualizarOportunidade(req.params.id, req.body || {});
    if (!atualizada) return res.status(404).json({ error: "Oportunidade não encontrada", code: "CRM_OPPORTUNITY_NOT_FOUND" });
    res.json(atualizada);
  })
);

// Mover entre estágios (arrastar no funil).
router.post(
  "/opportunities/:id/mover",
  ah(async (req, res) => {
    const { stageId } = req.body || {};
    if (!stageId || !getStage(stageId)) {
      return res.status(400).json({ error: "Estágio inválido", code: "CRM_STAGE_NOT_FOUND" });
    }
    const movida = moverOportunidade(req.params.id, stageId);
    if (!movida) return res.status(404).json({ error: "Oportunidade não encontrada", code: "CRM_OPPORTUNITY_NOT_FOUND" });
    res.json(movida);
  })
);

export { router };
