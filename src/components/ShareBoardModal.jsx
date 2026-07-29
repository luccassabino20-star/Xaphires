import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUsers } from "../state/UsersContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { useBoardRefetch } from "../state/BoardContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import * as api from "../state/api.js";
import { translateError } from "../utils/errors.js";
import { initials, colorForUser } from "../utils/members.js";

// Gestão de acesso de um quadro privado. Só o dono chega aqui — o botão que abre
// este modal não aparece para convidado —, mas quem manda é o servidor: as rotas
// de permissão exigem o dono, e este componente é só a casca.
export default function ShareBoardModal({ board, onClose }) {
  const { t } = useTranslation();
  const { users } = useUsers();
  const { user } = useAuth();
  const refetchBoards = useBoardRefetch();
  const showToast = useToast();

  const [permissions, setPermissions] = useState(null); // null = ainda carregando
  const [busyUserId, setBusyUserId] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [papelNovo, setPapelNovo] = useState("editor");

  useEffect(() => {
    api
      .listBoardPermissions(board.id)
      .then((data) => setPermissions(data.permissions))
      .catch((err) => setErro(translateError(err, t)));
  }, [board.id, t]);

  // Só quem ainda não tem acesso entra na busca, e nunca a própria pessoa: repetir
  // quem já está na lista de cima só geraria cliques que não fazem nada.
  const comAcesso = useMemo(() => new Set((permissions || []).map((p) => p.userId)), [permissions]);
  const candidatos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return users
      .filter((u) => u.id !== user.id && !comAcesso.has(u.id))
      .filter((u) => !termo || u.name.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo));
  }, [users, user.id, comAcesso, busca]);

  // Toda escrita aqui devolve a lista já atualizada pelo servidor, e o workspace é
  // recarregado junto: quem entra ou sai muda o `sharedWith` que a barra lateral usa.
  // Devolve se deu certo — o aviso de sucesso não pode sair quando a chamada falhou.
  async function aplicar(acao, userId) {
    setBusyUserId(userId);
    setErro("");
    try {
      const data = await acao();
      setPermissions(data.permissions);
      await refetchBoards();
      return true;
    } catch (err) {
      setErro(translateError(err, t));
      return false;
    } finally {
      setBusyUserId(null);
    }
  }

  async function adicionar(alvo) {
    if (await aplicar(() => api.grantBoardPermission(board.id, alvo.id, papelNovo), alvo.id)) {
      showToast(t("board.share.addedToast", { name: alvo.name }));
    }
  }
  function trocarPapel(permissao, role) {
    return aplicar(() => api.grantBoardPermission(board.id, permissao.userId, role), permissao.userId);
  }
  async function remover(permissao) {
    if (!confirm(t("board.share.removeConfirm", { name: permissao.name }))) return;
    if (await aplicar(() => api.revokeBoardPermission(board.id, permissao.userId), permissao.userId)) {
      showToast(t("board.share.removedToast", { name: permissao.name }));
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>
        <div className="modal-header">
          <h2 className="members-modal-title">{t("board.share.title", { title: board.title })}</h2>
        </div>
        <div className="modal-body">
          <p className="share-hint">{t("board.share.hint")}</p>
          {erro && <div className="auth-error">{erro}</div>}

          {permissions === null ? (
            <div className="share-empty">{t("common.loading")}</div>
          ) : (
            <ul className="share-list">
              {permissions.map((p) => (
                <li key={p.userId} className="share-row">
                  <span className="avatar avatar-small" style={{ background: colorForUser(p.userId) }}>
                    {initials(p.name)}
                  </span>
                  <span className="share-person">
                    <span className="share-name">{p.name}</span>
                    <span className="share-email">{p.email}</span>
                  </span>
                  {p.role === "owner" ? (
                    <span className="role-badge master">{t("board.share.roleOwner")}</span>
                  ) : (
                    <>
                      <select
                        className="share-role-select"
                        value={p.role}
                        disabled={busyUserId === p.userId}
                        onChange={(e) => trocarPapel(p, e.target.value)}
                      >
                        <option value="editor">{t("board.share.roleEditor")}</option>
                        <option value="viewer">{t("board.share.roleViewer")}</option>
                      </select>
                      <button
                        className="btn-danger btn-small"
                        disabled={busyUserId === p.userId}
                        onClick={() => remover(p)}
                      >
                        {t("board.share.remove")}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="sidebar-divider" />

          <div className="share-add">
            <div className="share-add-head">
              <input
                type="text"
                className="share-search"
                placeholder={t("board.share.searchPlaceholder")}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <select className="share-role-select" value={papelNovo} onChange={(e) => setPapelNovo(e.target.value)}>
                <option value="editor">{t("board.share.roleEditor")}</option>
                <option value="viewer">{t("board.share.roleViewer")}</option>
              </select>
            </div>
            {candidatos.length === 0 ? (
              <div className="share-empty">{t("board.share.noCandidates")}</div>
            ) : (
              <ul className="share-list">
                {candidatos.map((u) => (
                  <li key={u.id} className="share-row">
                    <span className="avatar avatar-small" style={{ background: colorForUser(u.id) }}>
                      {initials(u.name)}
                    </span>
                    <span className="share-person">
                      <span className="share-name">{u.name}</span>
                      <span className="share-email">{u.email}</span>
                    </span>
                    <button className="btn-primary btn-small" disabled={busyUserId === u.id} onClick={() => adicionar(u)}>
                      {t("board.share.add")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
