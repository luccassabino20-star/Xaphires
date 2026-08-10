import { Router } from "express";
import { popupPublico } from "../admin/popupStore.js";

// Único endpoint público (sem sessão de cliente nem de admin) deste arquivo: a
// landing chama isso antes de qualquer login para saber se tem campanha no ar.
// `popupPublico()` já filtra por ativa e não expirada, e não devolve a data de
// validade nem nenhum outro campo que só interessa ao painel.
const router = Router();

router.get("/", (req, res) => {
  res.json({ popup: popupPublico() });
});

export { router };
