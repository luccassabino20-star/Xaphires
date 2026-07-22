import { Router } from "express";
import { requireAuth, requireMaster } from "../middleware.js";
import { hashPassword } from "../auth.js";
import { ah } from "../asyncHandler.js";
import * as directory from "../directory.js";
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
} from "../repo.js";

const router = Router();
router.use(requireAuth);

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
