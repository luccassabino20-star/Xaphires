import { Router } from "express";
import { requireAuth, requireMaster } from "../middleware.js";
import { hashPassword } from "../auth.js";
import { ah } from "../asyncHandler.js";
import * as directory from "../directory.js";
import { normalizarDoc, docValido } from "../doc.js";
import { listJoinRequestsForCompany, getJoinRequest, deleteJoinRequest } from "../joinRequestStore.js";
import {
  listUsers,
  publicUser,
  getUserById,
  insertUser,
  updateUser,
  deleteUser,
  setPassword,
  setUserRole,
  scrubUserFromCards,
  deletePrivateBoardsByOwner,
  countUsers,
} from "../repo.js";
import { canAddUser, getPlan } from "../plans.js";

const router = Router();
router.use(requireAuth);

// Registradas antes de "/:id" de propósito: "/:id" casa com qualquer segmento
// único, incluindo literalmente "company" ou "join-requests" - se essas rotas
// entrassem depois, uma request para /company nunca chegaria aqui, cairia no
// :id tratando "company" como um id de usuário.
router.get(
  "/company",
  requireMaster,
  ah(async (req, res) => {
    const company = directory.getCompany(req.companyId);
    res.json({ name: company?.name || "", cnpj: company?.cnpj || null });
  })
);

router.patch(
  "/company",
  requireMaster,
  ah(async (req, res) => {
    const cnpj = normalizarDoc(req.body?.cnpj);
    if (!docValido(cnpj)) return res.status(400).json({ error: "CNPJ ou CPF inválido", code: "CNPJ_INVALID" });
    const donoAtual = directory.getCompanyIdForCnpj(cnpj);
    if (donoAtual && donoAtual !== req.companyId)
      return res.status(409).json({ error: "Esse CNPJ ou CPF já está em uso por outra empresa", code: "CNPJ_IN_USE" });
    const company = directory.setCompanyCnpj(req.companyId, cnpj);
    res.json({ name: company.name, cnpj: company.cnpj });
  })
);

router.get(
  "/join-requests",
  requireMaster,
  ah(async (req, res) => {
    res.json(listJoinRequestsForCompany(req.companyId));
  })
);

router.post(
  "/join-requests/:id/approve",
  requireMaster,
  ah(async (req, res) => {
    const pedido = getJoinRequest(req.params.id);
    // company_id !== req.companyId não pode virar 403/404 diferentes: um master
    // não tem como saber se o id existe numa empresa alheia, e diferenciar os dois
    // casos daria essa informação de graça.
    if (!pedido || pedido.company_id !== req.companyId)
      return res.status(404).json({ error: "Solicitação não encontrada", code: "JOIN_REQUEST_NOT_FOUND" });

    const company = directory.getCompany(req.companyId);
    if (!canAddUser(company, countUsers())) {
      const limite = getPlan(company?.plan).maxUsers;
      return res.status(403).json({
        error: `Seu plano permite até ${limite} usuários. Mude de plano para adicionar mais.`,
        code: "PLAN_USER_LIMIT",
        maxUsers: limite,
      });
    }
    // Corrida: o e-mail pode ter sido cadastrado em outro lugar entre o pedido e
    // agora (outra empresa aprovou primeiro, ou a pessoa se cadastrou direto).
    if (directory.getCompanyIdForEmail(pedido.email)) {
      deleteJoinRequest(pedido.id);
      return res.status(409).json({ error: "Este e-mail já está em uso", code: "EMAIL_ALREADY_REGISTERED" });
    }

    try {
      directory.addUserToDirectory(pedido.email, req.companyId);
    } catch {
      deleteJoinRequest(pedido.id);
      return res.status(409).json({ error: "Este e-mail já está em uso", code: "EMAIL_ALREADY_REGISTERED" });
    }
    let user;
    try {
      user = await insertUser({
        name: pedido.name,
        email: pedido.email,
        passwordHash: pedido.password_hash,
        role: "member",
      });
    } catch (err) {
      directory.removeUserFromDirectory(pedido.email);
      throw err;
    }
    deleteJoinRequest(pedido.id);
    res.status(201).json(publicUser(user));
  })
);

router.post(
  "/join-requests/:id/reject",
  requireMaster,
  ah(async (req, res) => {
    const pedido = getJoinRequest(req.params.id);
    if (!pedido || pedido.company_id !== req.companyId)
      return res.status(404).json({ error: "Solicitação não encontrada", code: "JOIN_REQUEST_NOT_FOUND" });
    deleteJoinRequest(pedido.id);
    res.json({ ok: true });
  })
);

router.get(
  "/",
  ah(async (req, res) => {
    res.json((await listUsers()).map(publicUser));
  })
);

router.post(
  "/",
  requireMaster,
  ah(async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      return res
        .status(400)
        .json({ error: "Preencha nome, e-mail e uma senha com pelo menos 6 caracteres", code: "VALIDATION_MISSING_FIELDS" });
    }
    if (directory.getCompanyIdForEmail(email)) {
      return res
        .status(409)
        .json({ error: "E-mail já cadastrado (pode já pertencer a outra empresa)", code: "EMAIL_ALREADY_REGISTERED_OTHER_COMPANY" });
    }
    // Limite do plano, checado antes de qualquer escrita — se passasse daqui, o
    // e-mail já teria entrado no diretório e sobraria lixo a limpar.
    const company = directory.getCompany(req.companyId);
    if (!canAddUser(company, countUsers())) {
      const limite = getPlan(company?.plan).maxUsers;
      return res.status(403).json({
        error: `Seu plano permite até ${limite} usuários. Mude de plano para adicionar mais.`,
        code: "PLAN_USER_LIMIT",
        maxUsers: limite,
      });
    }
    try {
      directory.addUserToDirectory(email, req.companyId);
    } catch {
      return res
        .status(409)
        .json({ error: "E-mail já cadastrado (pode já pertencer a outra empresa)", code: "EMAIL_ALREADY_REGISTERED_OTHER_COMPANY" });
    }
    let user;
    try {
      user = await insertUser({
        name: name.trim(),
        email: email.trim(),
        passwordHash: hashPassword(password),
        role: "member",
      });
    } catch (err) {
      directory.removeUserFromDirectory(email);
      throw err;
    }
    res.status(201).json(publicUser(user));
  })
);

router.patch(
  "/:id",
  requireMaster,
  ah(async (req, res) => {
    const target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: "Usuário não encontrado", code: "USER_NOT_FOUND" });
    const { name, email } = req.body || {};
    const emailChanged = email && email.trim().toLowerCase() !== target.email.toLowerCase();
    if (emailChanged && directory.getCompanyIdForEmail(email)) {
      return res.status(409).json({ error: "E-mail já em uso", code: "EMAIL_IN_USE" });
    }
    const updated = await updateUser(target.id, { name, email });
    if (emailChanged) directory.updateUserDirectoryEmail(target.email, updated.email);
    res.json(publicUser(updated));
  })
);

router.post(
  "/:id/role",
  requireMaster,
  ah(async (req, res) => {
    const target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: "Usuário não encontrado", code: "USER_NOT_FOUND" });
    const { role } = req.body || {};
    if (role !== "master" && role !== "member") {
      return res.status(400).json({ error: "Papel inválido", code: "INVALID_ROLE" });
    }
    const updated = await setUserRole(target.id, role);
    res.json(publicUser(updated));
  })
);

router.post(
  "/:id/reset-password",
  requireMaster,
  ah(async (req, res) => {
    const target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: "Usuário não encontrado", code: "USER_NOT_FOUND" });
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "A nova senha deve ter ao menos 6 caracteres", code: "PASSWORD_TOO_SHORT" });
    }
    await setPassword(target.id, hashPassword(newPassword));
    res.json({ ok: true });
  })
);

router.delete(
  "/:id",
  requireMaster,
  ah(async (req, res) => {
    const target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: "Usuário não encontrado", code: "USER_NOT_FOUND" });
    if (target.role === "master")
      return res.status(400).json({ error: "Não é possível excluir o usuário master", code: "CANNOT_DELETE_MASTER" });
    await deletePrivateBoardsByOwner(target.id);
    await deleteUser(target.id);
    await scrubUserFromCards(target.id);
    directory.removeUserFromDirectory(target.email);
    res.json({ ok: true });
  })
);

export { router };
