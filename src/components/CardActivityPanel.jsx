import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import { getCardActivities, addCardComment, updateCardComment, deleteCardComment } from "../state/api.js";
import { parseISO } from "../utils/datePicker.js";
import Avatar from "./Avatar.jsx";

// "há X minutos/horas/dias" - mesmo raciocínio do tempoRelativo() de
// AppointmentDetailModal.jsx (Saúde & Clínicas), mas local: são módulos
// diferentes e o texto não é grande o bastante pra justificar um util
// compartilhado entre eles.
function tempoRelativo(iso, t) {
  const diffMin = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 1) return t("board.cardModal.activity.justNow");
  if (diffMin < 60) return t("board.cardModal.activity.minutesAgo", { count: diffMin });
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return t("board.cardModal.activity.hoursAgo", { count: diffH });
  return t("board.cardModal.activity.daysAgo", { count: Math.round(diffH / 24) });
}

// Frase curta da linha de log - igual nos dois modos (completo e simplificado).
// O servidor nunca grava a frase pronta (ver registrarAtividadeCartao em
// repo.js), só previousValue/newValue crus, porque o app é i18n (pt/en/es) e
// quem traduz é sempre o cliente, por actionType.
function linhaAtividade(activity, t, i18n) {
  switch (activity.actionType) {
    case "COMMENT_ADDED":
      return t("board.cardModal.activity.COMMENT_ADDED_SHORT");
    case "DUE_DATE_SET":
      return activity.newValue
        ? t("board.cardModal.activity.DUE_DATE_SET", { date: parseISO(activity.newValue).toLocaleDateString(i18n.language) })
        : t("board.cardModal.activity.DATE_CLEARED");
    case "CARD_MOVED":
      return t("board.cardModal.activity.CARD_MOVED", { list: activity.newValue || "?" });
    case "CREATED":
      return t("board.cardModal.activity.CREATED", { list: activity.newValue || "?" });
    case "DESCRIPTION_CHANGED":
      return t("board.cardModal.activity.DESCRIPTION_CHANGED");
    default:
      return t("board.cardModal.activity.UNKNOWN");
  }
}

// Prévia curta pra não o feed inteiro virar um bloco de texto só porque
// alguém colou um relatório na descrição - 240 caracteres é o bastante pra
// dar contexto sem competir com o resto da coluna.
function encurtar(texto, limite = 240) {
  if (!texto) return texto;
  return texto.length > limite ? texto.slice(0, limite) + "…" : texto;
}

// Comentário como card próprio (texto + Editar/Excluir do autor), inline pra
// não precisar de outro arquivo só pra isto - a lógica de edição (form ou
// texto) é pequena o bastante pra caber aqui.
function ComentarioCard({ activity, mine, onEdit, onDelete }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(activity.newValue || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(activity.newValue || "");
  }, [activity.newValue]);

  async function salvar() {
    const val = text.trim();
    if (!val || saving) return;
    setSaving(true);
    try {
      await onEdit(val);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="card-comment-box card-comment-box-editing">
        <textarea className="modal-textarea card-comment-input" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <div className="description-save-actions">
          <button type="button" className="btn-primary btn-small" disabled={saving || !text.trim()} onClick={salvar}>
            {saving ? t("board.cardModal.descriptionEditor.saving") : t("common.save")}
          </button>
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={saving}
            onClick={() => {
              setText(activity.newValue || "");
              setEditing(false);
            }}
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-comment-box">
      <div className="card-comment-box-text">{activity.newValue}</div>
      {mine && (
        <div className="card-comment-box-actions">
          <button type="button" onClick={() => setEditing(true)}>
            {t("board.cardModal.activity.editComment")}
          </button>
          <button type="button" onClick={onDelete}>
            {t("board.cardModal.activity.deleteComment")}
          </button>
        </div>
      )}
    </div>
  );
}

export default function CardActivityPanel({ cardId, readOnly, refreshToken }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const showToast = useToast();
  const [activities, setActivities] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  // Visão completa por padrão: é a primeira vez que a pessoa vê o feed com
  // conteúdo, esconder de cara enterraria a novidade. Não persiste entre
  // aberturas do modal de propósito - é preferência de leitura da sessão, não
  // configuração (ver prefs em users, que é outra coisa).
  const [detalhado, setDetalhado] = useState(true);

  useEffect(() => {
    let ativo = true;
    setActivities(null);
    getCardActivities(cardId)
      .then((data) => ativo && setActivities(data.activities))
      .catch((err) => ativo && showToast(translateError(err, t)));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, refreshToken]);

  async function submitComment(e) {
    e.preventDefault();
    const text = commentText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const { activity } = await addCardComment(cardId, text);
      // Pessimista de propósito (ver addCardComment em api.js): só entra no
      // feed depois que o servidor confirmou, exatamente para não repetir o
      // problema do cartão "fantasma" que sumia sozinho.
      setActivities((prev) => [activity, ...(prev || [])]);
      setCommentText("");
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSending(false);
    }
  }

  async function editarComentario(activityId, text) {
    try {
      const { activity } = await updateCardComment(cardId, activityId, text);
      setActivities((prev) => prev.map((a) => (a.id === activityId ? activity : a)));
    } catch (err) {
      showToast(translateError(err, t));
      throw err;
    }
  }

  async function excluirComentario(activityId) {
    if (!confirm(t("board.cardModal.activity.deleteCommentConfirm"))) return;
    try {
      await deleteCardComment(cardId, activityId);
      setActivities((prev) => prev.filter((a) => a.id !== activityId));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  return (
    <div className="card-activity-panel">
      <div className="card-activity-header">
        <label className="modal-label">{t("board.cardModal.activity.title")}</label>
        {activities?.length > 0 && (
          <button type="button" className="card-activity-toggle" onClick={() => setDetalhado((v) => !v)}>
            {detalhado ? t("board.cardModal.activity.hideDetails") : t("board.cardModal.activity.showDetails")}
          </button>
        )}
      </div>

      {!readOnly && (
        <form className="card-comment-composer" onSubmit={submitComment}>
          <textarea
            className="modal-textarea card-comment-input"
            placeholder={t("board.cardModal.activity.commentPlaceholder")}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sozinho envia (comentário curto é o caso comum);
              // Shift+Enter quebra linha pra quem quer escrever um parágrafo.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitComment(e);
              }
            }}
          />
          <button type="submit" className="btn-primary btn-small" disabled={sending || !commentText.trim()}>
            {sending ? t("board.cardModal.activity.commentSending") : t("board.cardModal.activity.commentSubmit")}
          </button>
        </form>
      )}

      <ul className="card-activity-feed">
        {activities === null && <li className="card-activity-loading">{t("common.loading")}</li>}
        {activities?.length === 0 && <li className="card-activity-empty">{t("board.cardModal.activity.empty")}</li>}
        {activities?.map((a) => {
          const isComment = a.actionType === "COMMENT_ADDED";
          const isDescription = a.actionType === "DESCRIPTION_CHANGED";
          const mine = !!user && a.user?.id === user.id;
          return (
            <li key={a.id} className="card-activity-item">
              <Avatar
                id={a.user?.id || "auto"}
                name={a.user?.name || t("board.cardModal.activity.automation")}
                avatarUrl={a.user?.avatarUrl}
                className="avatar-small"
              />
              <div className="card-activity-body">
                <div className="card-activity-text">
                  <strong>{a.user?.name || t("board.cardModal.activity.automation")}</strong> {linhaAtividade(a, t, i18n)}
                </div>

                {detalhado && isComment && (
                  <ComentarioCard
                    activity={a}
                    mine={mine}
                    onEdit={(text) => editarComentario(a.id, text)}
                    onDelete={() => excluirComentario(a.id)}
                  />
                )}
                {detalhado && isDescription && a.newValue && <div className="card-activity-preview">{encurtar(a.newValue)}</div>}

                <div className="card-activity-time">
                  {tempoRelativo(a.createdAt, t)}
                  {isComment && a.previousValue && ` · ${t("board.cardModal.activity.edited")}`}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
