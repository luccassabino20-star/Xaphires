import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch, useBoardState } from "../state/BoardContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { useUsers } from "../state/UsersContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import { LABEL_COLORS } from "../utils/labels.js";
import { geocodeAddress, addLinkAttachment, addFileAttachment, removeCardAttachment, attachmentDownloadUrl, getPlan } from "../state/api.js";
import { uid } from "../utils/id.js";
import DatePicker from "./DatePicker.jsx";
import SubtaskItem from "./SubtaskItem.jsx";
import RecurrencesModal from "./RecurrencesModal.jsx";
import Avatar from "./Avatar.jsx";

function AttachmentFileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6z" />
    </svg>
  );
}
function AttachmentLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M3.9 12a4.1 4.1 0 0 1 4.1-4.1h4V6.1h-4a5.9 5.9 0 0 0 0 11.8h4v-1.8h-4A4.1 4.1 0 0 1 3.9 12zM8 13h8v-2H8zm8.1-6.9h-4v1.8h4a4.1 4.1 0 0 1 0 8.2h-4v1.8h4a5.9 5.9 0 0 0 0-11.8z" />
    </svg>
  );
}
function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UrgentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M5 3v18h2v-7h10.5l-2.5-4 2.5-4H7V3z" />
    </svg>
  );
}
function ImportantIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
    </svg>
  );
}
function StatusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16z" />
    </svg>
  );
}
function MembersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5z" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M2 11.5V4a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.41.59l8.5 8.5a2 2 0 0 1 0 2.82l-7.5 7.5a2 2 0 0 1-2.82 0l-8.5-8.5A2 2 0 0 1 2 11.5zM7 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm12 8v9H5v-9z" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />
    </svg>
  );
}
function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13">
      <path fill="currentColor" d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l7-7z" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15">
      <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zm17.71-10.04a1 1 0 0 0 0-1.42l-2.5-2.5a1 1 0 0 0-1.42 0l-1.96 1.96 3.75 3.75z" />
    </svg>
  );
}

export default function CardModal({ boardId, cardId, onClose, initialFocus }) {
  const { t, i18n } = useTranslation();
  const state = useBoardState();
  const dispatch = useBoardDispatch();
  const { user } = useAuth();
  const { users } = useUsers();
  const showToast = useToast();
  const board = state.boards.find((b) => b.id === boardId);
  const card = board?.cards[cardId];
  // Quem foi convidado só para ler abre o cartão e vê tudo, sem nada para mexer.
  // O papel vem do servidor no workspace; aqui só se desenha a consequência.
  const readOnly = board?.myRole === "viewer";
  // Só quem criou o cartão exclui, exceto dono do quadro (privado) ou master da
  // empresa. Cartão sem creatorId (anterior à regra, ou gerado por rotina
  // automática) continua excluível por qualquer um com acesso de escrita - quem
  // decide de verdade é o servidor (DELETE /api/cards/:id), isto só evita mostrar
  // um botão que ia falhar.
  const canDeleteCard =
    !card?.creatorId || card.creatorId === user.id || board?.myRole === "owner" || user.role === "master";

  const [title, setTitle] = useState(card?.title || "");
  const [description, setDescription] = useState(card?.description || "");
  const [checklistText, setChecklistText] = useState("");
  const [subtaskText, setSubtaskText] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [addressInput, setAddressInput] = useState(card?.location?.address || "");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [uploading, setUploading] = useState(false);
  // Teto de anexo do plano da empresa. Fica null até a consulta voltar; nesse
  // intervalo a checagem local é pulada e quem barra é o servidor.
  const [limiteAnexo, setLimiteAnexo] = useState(null);
  // Começa mostrando tudo (mesmo estado inicial da referência: "Recolher
  // campos vazios" é a ação ainda não tomada). Campo vazio some da grade só
  // depois que a pessoa recolhe - e aqui parte de dado real (tem valor ou não),
  // não de uma lista fixa de nomes de campo.
  const [hideEmpty, setHideEmpty] = useState(false);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const titleRef = useRef(null);
  const fileInputRef = useRef(null);
  const descriptionRef = useRef(null);

  // "+" na barra de ações rápidas do card (CardItem) abre já com o campo de
  // nova subtarefa aberto - roda só no mount porque o componente inteiro
  // remonta a cada troca de cardId (key={activeCardId} em AuthenticatedApp).
  useEffect(() => {
    if (initialFocus === "subtask" && !readOnly) setAddingSubtask(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let ativo = true;
    getPlan()
      .then((p) => ativo && setLimiteAnexo(p.maxAttachmentBytes ?? null))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    titleRef.current?.focus();
    // Cartão recém-criado pelo Gantt (ver BoardGanttView.jsx) nasce com um
    // título provisório - selecionar em vez de só focar faz a pessoa digitar
    // por cima em vez de emendar no que já estava lá.
    if (initialFocus === "title") titleRef.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!card) return null;

  // Os dois gravam no blur, que dispara mesmo sem edição: sem a guarda, abrir e
  // fechar o cartão como leitor mandaria um PATCH que a API recusa com 403.
  function commitTitle() {
    if (readOnly) return;
    const val = title.trim() || t("board.cardModal.untitled");
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { title: val } });
    setTitle(val);
  }
  function commitDescription() {
    if (readOnly) return;
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { description } });
  }
  function handleDueChange(iso) {
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { due: iso || null } });
  }
  function handleStartDateChange(iso) {
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { startDate: iso || null } });
  }
  async function handleLocateAddress(e) {
    e.preventDefault();
    const q = addressInput.trim();
    if (!q) {
      dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { location: null } });
      return;
    }
    setGeocoding(true);
    setGeocodeError("");
    try {
      const result = await geocodeAddress(q);
      dispatch({
        type: "UPDATE_CARD",
        boardId,
        cardId,
        patch: { location: { address: q, lat: result.lat, lng: result.lng } },
      });
    } catch (err) {
      setGeocodeError(translateError(err, t));
      dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { location: { address: q, lat: null, lng: null } } });
    } finally {
      setGeocoding(false);
    }
  }
  function toggleCompleted() {
    dispatch({ type: "TOGGLE_CARD_COMPLETED", boardId, cardId });
  }
  // Alternativa ao arrastar: essencial no toque, onde o board usa drag and drop
  // nativo do HTML5 e não existe arraste por dedo. Sempre entra no fim da lista
  // de destino - escolher a posição exata é o que o arraste ainda resolve melhor.
  function moveToList(e) {
    const toListId = e.target.value;
    const fromList = board.lists.find((l) => l.cardIds.includes(cardId));
    const toList = board.lists.find((l) => l.id === toListId);
    if (!fromList || !toList || fromList.id === toList.id) return;
    dispatch({
      type: "MOVE_CARD",
      boardId,
      cardId,
      fromListId: fromList.id,
      toListId: toList.id,
      toIndex: toList.cardIds.length,
      at: new Date().toISOString(),
    });
    dispatch({ type: "COMMIT_CARD_ORDER", boardId, listIds: [fromList.id, toList.id] });
    showToast(t("board.cardModal.movedToList", { list: toList.title }));
  }
  function toggleUrgent() {
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { urgent: !card.urgent } });
  }
  function toggleImportant() {
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { important: !card.important } });
  }
  function toggleLabel(labelId) {
    dispatch({ type: "TOGGLE_CARD_LABEL", boardId, cardId, labelId });
  }
  function toggleMember(memberId) {
    dispatch({ type: "TOGGLE_CARD_MEMBER", boardId, cardId, memberId });
  }
  function addChecklistItem(e) {
    e.preventDefault();
    const val = checklistText.trim();
    if (!val) return;
    dispatch({ type: "ADD_CHECKLIST_ITEM", boardId, cardId, text: val });
    setChecklistText("");
  }
  function toggleChecklistItem(index) {
    dispatch({ type: "TOGGLE_CHECKLIST_ITEM", boardId, cardId, index });
  }
  function removeChecklistItem(index) {
    dispatch({ type: "REMOVE_CHECKLIST_ITEM", boardId, cardId, index });
  }
  function addSubtask(e) {
    e.preventDefault();
    const val = subtaskText.trim();
    if (!val) {
      setAddingSubtask(false);
      return;
    }
    dispatch({ type: "ADD_SUBTASK", boardId, cardId, id: uid(), title: val });
    setSubtaskText("");
  }
  function toggleSubtask(subtaskId) {
    dispatch({ type: "TOGGLE_SUBTASK", boardId, cardId, subtaskId });
  }
  function updateSubtask(subtaskId, patch) {
    dispatch({ type: "UPDATE_SUBTASK", boardId, cardId, subtaskId, patch });
  }
  function removeSubtask(subtaskId) {
    dispatch({ type: "REMOVE_SUBTASK", boardId, cardId, subtaskId });
  }
  function deleteCard() {
    if (!confirm(t("board.cardModal.deleteCardConfirm"))) return;
    dispatch({ type: "DELETE_CARD", boardId, cardId });
    showToast(t("board.cardModal.cardDeletedToast"));
    onClose();
  }
  // Arquivar não pede confirmação: é reversível pelo modal de arquivados,
  // diferente de excluir.
  function archiveCard() {
    dispatch({ type: "ARCHIVE_CARD", boardId, cardId, at: new Date().toISOString() });
    showToast(t("board.cardModal.cardArchivedToast"));
    onClose();
  }

  async function submitLinkAttachment(e) {
    e.preventDefault();
    const url = linkUrl.trim();
    if (!url) return;
    try {
      const { attachments } = await addLinkAttachment(cardId, { url, name: linkName.trim() });
      dispatch({ type: "SET_CARD_ATTACHMENTS", boardId, cardId, attachments });
      setLinkUrl("");
      setLinkName("");
      setLinkFormOpen(false);
      showToast(t("board.cardModal.attachmentAdded"));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function handleFilePicked(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // O limite vem do plano. Esta checagem é conveniência: evita subir 200 MB
    // para o servidor recusar no fim. Quem manda é a verificação no servidor,
    // que aborta durante a transferência.
    if (limiteAnexo !== null && file.size > limiteAnexo) {
      showToast(t("board.cardModal.attachmentTooLarge", { mb: Math.round(limiteAnexo / 1024 / 1024) }));
      return;
    }
    setUploading(true);
    try {
      const { attachments } = await addFileAttachment(cardId, file);
      dispatch({ type: "SET_CARD_ATTACHMENTS", boardId, cardId, attachments });
      showToast(t("board.cardModal.attachmentAdded"));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveAttachment(attachmentId) {
    try {
      const { attachments } = await removeCardAttachment(cardId, attachmentId);
      dispatch({ type: "SET_CARD_ATTACHMENTS", boardId, cardId, attachments });
      showToast(t("board.cardModal.attachmentRemoved"));
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  const done = card.checklist.filter((i) => i.done).length;
  const pct = card.checklist.length ? Math.round((done / card.checklist.length) * 100) : 0;
  const subtasks = card.subtasks || [];
  const subtasksDone = subtasks.filter((s) => s.done).length;
  const subtasksPct = subtasks.length ? Math.round((subtasksDone / subtasks.length) * 100) : 0;
  const cardMembers = (card.memberIds || []).map((id) => users.find((m) => m.id === id)).filter(Boolean);
  const currentList = board.lists.find((l) => l.cardIds.includes(cardId));
  const hasDates = !!(card.startDate || card.due);
  const hasPriority = !!(card.urgent || card.important);
  const hasLabels = card.labels.length > 0;
  const hasLocation = !!card.location?.address;

  return (
    <>
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal card-detail-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>

        {/* Duas colunas com rolagem própria cada uma (ver index.css) - modal
            empilhado (versão anterior) passava fácil de 1200px de altura com
            checklist+anexos preenchidos e estourava a tela. */}
        <div className="card-detail-columns">
          <div className="card-detail-main">
            <div className="card-detail-breadcrumb">
              {board.title}
              {currentList && <> / {currentList.title}</>}
            </div>

            <span className="card-detail-type-badge">{t("board.cardModal.typeBadge")}</span>
            {card.createdAt && (
              <div className="card-detail-created-at">
                {t("board.cardModal.createdAt", { data: new Date(card.createdAt).toLocaleString(i18n.language) })}
              </div>
            )}

            <div className="modal-header card-detail-header">
              <input
                ref={titleRef}
                className="modal-title-input card-detail-title"
                value={title}
                spellCheck={false}
                readOnly={readOnly}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </div>

            {/* Sem IA neste app - o clique só leva pra descrição, que é a ação
                real mais próxima do que essa caixa sugere visualmente. */}
            {!readOnly && (
              <button type="button" className="ai-input-box" onClick={() => descriptionRef.current?.focus()}>
                <EditIcon /> {t("board.cardModal.descriptionShortcut")}
              </button>
            )}

            {readOnly && <div className="board-readonly-note">{t("board.cardModal.readOnlyNote")}</div>}

            <div className="modal-section">
              <label className="modal-label">{t("board.cardModal.description")}</label>
              <textarea
                ref={descriptionRef}
                className="modal-textarea"
                placeholder={t("board.cardModal.descriptionPlaceholder")}
                value={description}
                readOnly={readOnly}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={commitDescription}
              />
            </div>

            <div className="modal-section">
              <div className="subtasks-header">
                <label className="modal-label subtasks-label">{t("board.cardModal.subtasks")}</label>
                {subtasks.length > 0 && (
                  <div className="subtasks-progress">
                    <div className="subtasks-progress-bar">
                      <div className="subtasks-progress-fill" style={{ width: subtasksPct + "%" }} />
                    </div>
                    <span>
                      {subtasksDone}/{subtasks.length}
                    </span>
                  </div>
                )}
              </div>
              {subtasks.length > 0 && (
                <ul className="subtask-list">
                  {subtasks.map((s) => (
                    <SubtaskItem
                      key={s.id}
                      subtask={s}
                      users={users}
                      readOnly={readOnly}
                      onToggle={() => toggleSubtask(s.id)}
                      onUpdate={(patch) => updateSubtask(s.id, patch)}
                      onRemove={() => removeSubtask(s.id)}
                    />
                  ))}
                </ul>
              )}
              {!readOnly &&
                (addingSubtask ? (
                  <form className="subtask-add-form" onSubmit={addSubtask}>
                    <input
                      autoFocus
                      type="text"
                      placeholder={t("board.cardModal.addSubtaskPlaceholder")}
                      value={subtaskText}
                      onChange={(e) => setSubtaskText(e.target.value)}
                      onBlur={() => {
                        // Enter já submete (onSubmit); só blur sem texto fecha o
                        // campo sozinho, sem exigir clicar em algo pra cancelar.
                        if (!subtaskText.trim()) setAddingSubtask(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          // stopPropagation: sem isso o Escape fecha o campo E o
                          // modal do cartão juntos (o modal também ouve Escape,
                          // no document - mesmo problema já corrigido no popover
                          // do DatePicker).
                          e.stopPropagation();
                          setSubtaskText("");
                          setAddingSubtask(false);
                        }
                      }}
                    />
                  </form>
                ) : (
                  <button type="button" className="add-subtask-btn" onClick={() => setAddingSubtask(true)}>
                    + {t("board.cardModal.addSubtask")}
                  </button>
                ))}
            </div>

            <div className="modal-section">
              <label className="modal-label">{t("board.cardModal.checklist")}</label>
              {card.checklist.length > 0 && (
                <div className="checklist-progress">
                  <div className="checklist-progress-bar">
                    <div className="checklist-progress-fill" style={{ width: pct + "%" }} />
                  </div>
                  <span>{pct}%</span>
                </div>
              )}
              <ul className="checklist">
                {card.checklist.map((item, idx) => (
                  <li key={idx} className={"checklist-item" + (item.done ? " done" : "")}>
                    <input type="checkbox" checked={item.done} disabled={readOnly} onChange={() => toggleChecklistItem(idx)} />
                    <span>{item.text}</span>
                    {!readOnly && (
                      <button type="button" className="checklist-item-remove" onClick={() => removeChecklistItem(idx)}>
                        &times;
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {!readOnly && (
                <form className="checklist-add" onSubmit={addChecklistItem}>
                  <input
                    type="text"
                    placeholder={t("board.cardModal.addItemPlaceholder")}
                    value={checklistText}
                    onChange={(e) => setChecklistText(e.target.value)}
                  />
                  <button type="submit" className="btn-primary btn-small">
                    {t("common.add")}
                  </button>
                </form>
              )}
            </div>

            <div className="modal-section">
              <label className="modal-label">{t("board.cardModal.attachments")}</label>
              {card.attachments?.length > 0 && (
                <ul className="attachment-list">
                  {card.attachments.map((a) => (
                    <li key={a.id} className="attachment-item">
                      {a.type === "file" ? <AttachmentFileIcon /> : <AttachmentLinkIcon />}
                      <a
                        href={a.type === "file" ? attachmentDownloadUrl(cardId, a.id) : a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="attachment-name"
                        title={a.name}
                      >
                        {a.name}
                      </a>
                      {a.type === "file" && a.size != null && <span className="attachment-size">{formatBytes(a.size)}</span>}
                      {!readOnly && (
                        <button
                          type="button"
                          className="checklist-item-remove"
                          onClick={() => handleRemoveAttachment(a.id)}
                          aria-label={t("common.remove")}
                        >
                          &times;
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {/* Leitor continua baixando o que já está anexado; o que some é o que sobe.
                  Tirar do DOM, e não `hidden`: .attachment-actions declara display:flex,
                  que vence a regra display:none do atributo - os botões continuavam
                  aparecendo, e só o clique é que morria. */}
              {!readOnly && (
                <div className="attachment-actions">
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: "none" }}
                    onChange={handleFilePicked}
                  />
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? t("board.cardModal.uploading") : t("board.cardModal.attachFile")}
                  </button>
                  <button type="button" className="btn-secondary btn-small" onClick={() => setLinkFormOpen((o) => !o)}>
                    {t("board.cardModal.attachLink")}
                  </button>
                </div>
              )}
              {linkFormOpen && !readOnly && (
                <form className="checklist-add" style={{ marginTop: 8, flexWrap: "wrap" }} onSubmit={submitLinkAttachment}>
                  <input
                    type="text"
                    placeholder={t("board.cardModal.linkUrlPlaceholder")}
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    style={{ flex: "2 1 200px" }}
                  />
                  <input
                    type="text"
                    placeholder={t("board.cardModal.linkNamePlaceholder")}
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    style={{ flex: "1 1 140px" }}
                  />
                  <button type="submit" className="btn-primary btn-small">
                    {t("common.add")}
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="card-detail-sidebar">
            <div className="metadata-grid">
              <div className="metadata-row">
                <span className="metadata-row-label">
                  <StatusIcon /> {t("board.cardModal.status")}
                </span>
                <button
                  type="button"
                  className={"status-pill" + (card.completed ? " status-pill-success" : " status-pill-neutral")}
                  disabled={readOnly}
                  onClick={toggleCompleted}
                >
                  {card.completed ? t("board.cardModal.complete") : t("board.cardModal.statusOpen")}
                </button>
              </div>

              <div className="metadata-row">
                <span className="metadata-row-label">
                  <MembersIcon /> {t("board.cardModal.members")}
                </span>
                <div className="metadata-row-value">
                  <div className="member-avatars-row">
                    {cardMembers.map((m) => (
                      <Avatar key={m.id} id={m.id} name={m.name} avatarUrl={m.avatarUrl} title={m.name} />
                    ))}
                    {cardMembers.length === 0 && <span className="metadata-empty">{t("board.cardModal.empty")}</span>}
                    {!readOnly && (
                      <button type="button" className="avatar avatar-add" onClick={() => setMemberPickerOpen((o) => !o)}>
                        +
                      </button>
                    )}
                  </div>
                  {memberPickerOpen && (
                    <div className="member-picker">
                      {users.length === 0 && <div className="member-picker-empty">{t("board.cardModal.noUsersYet")}</div>}
                      {users.map((m) => (
                        <label key={m.id} className="member-picker-row">
                          <input type="checkbox" checked={(card.memberIds || []).includes(m.id)} onChange={() => toggleMember(m.id)} />
                          <Avatar id={m.id} name={m.name} avatarUrl={m.avatarUrl} className="avatar-small" />
                          <span>{m.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {(!hideEmpty || hasDates) && (
                <div className="metadata-row">
                  <span className="metadata-row-label">
                    <CalendarIcon /> {t("board.cardModal.datesLabel")}
                  </span>
                  <div className="metadata-row-value date-range">
                    <DatePicker
                      value={card.startDate}
                      onChange={handleStartDateChange}
                      label={t("board.cardModal.startDate")}
                      disabled={readOnly}
                      onOpenRecurrence={readOnly ? undefined : () => setRecurrenceOpen(true)}
                    />
                    <span className="date-range-arrow">→</span>
                    <DatePicker
                      value={card.due}
                      onChange={handleDueChange}
                      label={t("board.cardModal.dueDate")}
                      disabled={readOnly}
                      onOpenRecurrence={readOnly ? undefined : () => setRecurrenceOpen(true)}
                    />
                  </div>
                </div>
              )}

              {(!hideEmpty || hasPriority) && (
                <div className="metadata-row">
                  <span className="metadata-row-label">{t("board.cardModal.priority")}</span>
                  <div className="metadata-row-value priority-toggle-row priority-toggle-row-compact">
                    <button
                      type="button"
                      className={"priority-chip priority-chip-urgent" + (card.urgent ? " active" : "")}
                      disabled={readOnly}
                      onClick={toggleUrgent}
                    >
                      <UrgentIcon /> {t("board.cardModal.urgent")}
                    </button>
                    <button
                      type="button"
                      className={"priority-chip priority-chip-important" + (card.important ? " active" : "")}
                      disabled={readOnly}
                      onClick={toggleImportant}
                    >
                      <ImportantIcon /> {t("board.cardModal.important")}
                    </button>
                  </div>
                </div>
              )}

              {(!hideEmpty || hasLabels) && (
                <div className="metadata-row">
                  <span className="metadata-row-label">
                    <TagIcon /> {t("board.cardModal.labels")}
                  </span>
                  <div className="metadata-row-value label-picker">
                    {LABEL_COLORS.map((meta) => (
                      <button
                        key={meta.id}
                        type="button"
                        className={"label-chip" + (card.labels.includes(meta.id) ? " active" : "")}
                        style={{ background: meta.color }}
                        disabled={readOnly}
                        onClick={() => toggleLabel(meta.id)}
                      >
                        {card.labels.includes(meta.id) ? "✓" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(!hideEmpty || hasLocation) && (
                <div className="metadata-row">
                  <span className="metadata-row-label">
                    <PinIcon /> {t("board.cardModal.location")}
                  </span>
                  <div className="metadata-row-value">
                    {readOnly ? (
                      <div className="modal-readonly-value">{card.location?.address || t("board.cardModal.noLocation")}</div>
                    ) : (
                      <form className="location-form" onSubmit={handleLocateAddress}>
                        <input
                          type="text"
                          className="modal-date location-input"
                          placeholder={t("board.cardModal.addressPlaceholder")}
                          value={addressInput}
                          onChange={(e) => setAddressInput(e.target.value)}
                        />
                        <button type="submit" className="btn-primary btn-small" disabled={geocoding}>
                          {geocoding ? t("board.cardModal.locating") : t("board.cardModal.locate")}
                        </button>
                      </form>
                    )}
                    {geocodeError && <div className="auth-error" style={{ marginTop: 8 }}>{geocodeError}</div>}
                    {card.location?.lat != null && (
                      <div className="location-confirmed">
                        <PinIcon /> {t("board.cardModal.locationFound")}
                      </div>
                    )}
                    {card.location?.address && card.location?.lat == null && !geocoding && (
                      <div className="location-pending">{t("board.cardModal.locationPending")}</div>
                    )}
                  </div>
                </div>
              )}

              {!readOnly && (
                <div className="metadata-row">
                  <span className="metadata-row-label">
                    <ListIcon /> {t("board.cardModal.moveToList")}
                  </span>
                  <select className="modal-select metadata-row-value" value={currentList?.id || ""} onChange={moveToList}>
                    {board.lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button type="button" className="collapse-empty-toggle" onClick={() => setHideEmpty((v) => !v)}>
              <CollapseIcon />
              {hideEmpty ? t("board.cardModal.showEmpty") : t("board.cardModal.collapseEmpty")}
            </button>
          </div>
        </div>

        {!readOnly && (
          <div className="modal-footer card-detail-footer">
            <button className="btn-secondary" onClick={archiveCard}>
              {t("board.cardModal.archiveCard")}
            </button>
            {canDeleteCard && (
              <button className="btn-danger" onClick={deleteCard}>
                {t("board.cardModal.deleteCard")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
    {/* Sobrepõe o modal do cartão (mesmo z-index de .modal-overlay, mas
        depois no DOM => por cima). "Configurar recorrência" no DatePicker
        abre a mesma tela que o menu de dados do quadro abre - moldes de
        cartão recorrente são do quadro, não do cartão que estava aberto. */}
    {recurrenceOpen && board && <RecurrencesModal board={board} onClose={() => setRecurrenceOpen(false)} />}
    </>
  );
}
