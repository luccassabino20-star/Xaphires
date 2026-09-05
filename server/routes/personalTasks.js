import { Router } from "express";
import { ah } from "../asyncHandler.js";
import * as repo from "../repo.js";
import { getCompany } from "../directory.js";
import { canUsePersonalPlanner } from "../plans.js";
import { zoomConfigurado, criarReuniaoZoom } from "../integrations/zoom.js";

const router = Router();

// O Planejador é recurso do Profissional para cima. A leitura (e o excluir)
// ficam liberados para quem caiu de plano continuar vendo e podendo apagar o
// que já criou - mesmo padrão de recurrences.js.
function exigePlano(req, res, next) {
  if (canUsePersonalPlanner(getCompany(req.companyId)?.plan)) return next();
  return res.status(403).json({
    error: "O planejador pessoal está disponível a partir do plano Pro.",
    code: "PLAN_FEATURE_PERSONAL_PLANNER",
  });
}

const PRIORITIES = ["low", "medium", "high"];
const TYPES = ["event", "task", "focus", "vacation"];
const COLORS = ["teal", "blue", "purple", "amber", "rose"];
const LABEL_MAX = 40;
// Rótulo do ícone na aba Reuniões - não trava o valor do link em si (é
// possível colar qualquer URL), só decide qual logo mostrar. "custom" cobre
// Teams e qualquer outro link colado à mão.
const VIDEO_PROVIDERS = ["zoom", "meet", "teams", "custom"];
const VIDEO_LINK_MAX = 500;

// Sempre a agenda de quem está logado - não há id de usuário no corpo nem na
// URL para ninguém escolher tarefa de outra pessoa, e toda consulta já nasce
// filtrada por req.user.id.
function validar(body) {
  if (!body?.title?.trim()) return { error: "Título obrigatório", code: "TITLE_REQUIRED" };
  if (!body?.due || !/^\d{4}-\d{2}-\d{2}$/.test(body.due)) {
    return { error: "Escolha uma data", code: "DUE_REQUIRED" };
  }
  if (body.priority !== undefined && !PRIORITIES.includes(body.priority)) {
    return { error: "Prioridade inválida", code: "PRIORITY_INVALID" };
  }
  if (body.type !== undefined && !TYPES.includes(body.type)) {
    return { error: "Tipo inválido", code: "TYPE_INVALID" };
  }
  // startTime só é exigido quando o bloco tem horário (allDay:false) - a
  // grade semanal manda os dois juntos; o mês/lista não mandam nenhum dos
  // dois, e continuam "sem horário" (ver createPersonalTask/updatePersonalTask).
  if (body.startTime !== undefined && body.startTime !== null && !/^\d{2}:\d{2}$/.test(body.startTime)) {
    return { error: "Horário inválido", code: "START_TIME_INVALID" };
  }
  if (
    body.durationMin !== undefined &&
    body.durationMin !== null &&
    (!Number.isInteger(body.durationMin) || body.durationMin < 5 || body.durationMin > 1440)
  ) {
    return { error: "Duração inválida", code: "DURATION_INVALID" };
  }
  if (body.label !== undefined && body.label.length > LABEL_MAX) {
    return { error: "Etiqueta muito longa", code: "LABEL_TOO_LONG" };
  }
  if (body.color !== undefined && body.color !== null && !COLORS.includes(body.color)) {
    return { error: "Cor inválida", code: "COLOR_INVALID" };
  }
  if (body.videoLink !== undefined && body.videoLink !== null && body.videoLink !== "") {
    if (body.videoLink.length > VIDEO_LINK_MAX) return { error: "Link muito longo", code: "VIDEO_LINK_TOO_LONG" };
    if (!/^https:\/\/.+/i.test(body.videoLink)) return { error: "O link da vídeochamada precisa começar com https://", code: "VIDEO_LINK_INVALID" };
  }
  if (body.videoProvider !== undefined && body.videoProvider !== null && !VIDEO_PROVIDERS.includes(body.videoProvider)) {
    return { error: "Provedor de vídeochamada inválido", code: "VIDEO_PROVIDER_INVALID" };
  }
  return null;
}

// Id vindo de outro usuário não bate na consulta filtrada por user_id, então
// cai no 404 em vez de vazar a existência da tarefa alheia.
function ownedOr404(req, res, next) {
  const tarefa = repo.getPersonalTask(req.params.id);
  if (!tarefa || tarefa.userId !== req.user.id) {
    return res.status(404).json({ error: "Tarefa não encontrada", code: "PERSONAL_TASK_NOT_FOUND" });
  }
  next();
}

router.get(
  "/",
  ah(async (req, res) => {
    repo.runPersonalTaskAutoArchive(req.user.id);
    res.json({
      tasks: repo.listPersonalTasks(req.user.id),
      canUse: canUsePersonalPlanner(getCompany(req.companyId)?.plan),
    });
  })
);

router.post(
  "/",
  exigePlano,
  ah(async (req, res) => {
    const erro = validar(req.body);
    if (erro) return res.status(400).json(erro);
    const criada = repo.createPersonalTask(req.user.id, {
      title: req.body.title.trim(),
      due: req.body.due,
      priority: req.body.priority,
      type: req.body.type,
      allDay: req.body.allDay,
      startTime: req.body.startTime,
      durationMin: req.body.durationMin,
      label: req.body.label,
      color: req.body.color,
      tentative: req.body.tentative,
      videoLink: req.body.videoLink,
      videoProvider: req.body.videoProvider,
    });
    res.status(201).json(criada);
  })
);

router.patch(
  "/:id",
  ownedOr404,
  exigePlano,
  ah(async (req, res) => {
    const camposValidaveis = [
      "title",
      "due",
      "priority",
      "type",
      "startTime",
      "durationMin",
      "label",
      "color",
      "videoLink",
      "videoProvider",
    ];
    if (camposValidaveis.some((campo) => req.body?.[campo] !== undefined)) {
      const atual = repo.getPersonalTask(req.params.id);
      const erro = validar({
        title: req.body.title ?? atual.title,
        due: req.body.due ?? atual.due,
        priority: req.body.priority ?? atual.priority,
        type: req.body.type ?? atual.type,
        allDay: req.body.allDay,
        startTime: req.body.startTime !== undefined ? req.body.startTime : atual.startTime,
        durationMin: req.body.durationMin !== undefined ? req.body.durationMin : atual.durationMin,
        label: req.body.label ?? atual.label,
        color: req.body.color !== undefined ? req.body.color : atual.color,
        videoLink: req.body.videoLink !== undefined ? req.body.videoLink : atual.videoLink,
        videoProvider: req.body.videoProvider !== undefined ? req.body.videoProvider : atual.videoProvider,
      });
      if (erro) return res.status(400).json(erro);
    }
    const atualizada = repo.updatePersonalTask(req.params.id, req.body || {});
    res.json(atualizada);
  })
);

router.delete(
  "/:id",
  ownedOr404,
  ah(async (req, res) => {
    repo.deletePersonalTask(req.params.id);
    res.json({ ok: true });
  })
);

// Gera a sala pelo Zoom via OAuth Server-to-Server (ver
// server/integrations/zoom.js) e já grava o link na própria tarefa - o
// front chama isso quando a pessoa clica "Gerar link do Zoom" em vez de
// colar um link manual. 501 (não 500) quando o servidor não tem credencial:
// não é erro nosso, é recurso não configurado nesta instalação, mesmo
// espírito do "fake" da cobrança - sem credencial, não finge que gerou.
router.post(
  "/:id/video-link/zoom",
  ownedOr404,
  exigePlano,
  ah(async (req, res) => {
    if (!zoomConfigurado()) {
      return res.status(501).json({
        error: "A integração com o Zoom não está configurada neste servidor. Peça ao administrador para definir ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID e ZOOM_CLIENT_SECRET.",
        code: "ZOOM_NOT_CONFIGURED",
      });
    }
    const atual = repo.getPersonalTask(req.params.id);
    try {
      const reuniao = await criarReuniaoZoom({
        topic: atual.title,
        due: atual.due,
        startTime: atual.startTime,
        durationMin: atual.durationMin,
      });
      const atualizada = repo.updatePersonalTask(req.params.id, { videoLink: reuniao.joinUrl, videoProvider: "zoom" });
      res.json(atualizada);
    } catch (err) {
      console.error("[zoom] falha ao criar reunião:", err.message);
      res.status(502).json({ error: "Não foi possível criar a reunião no Zoom agora.", code: "ZOOM_CREATE_FAILED" });
    }
  })
);

export { router };
