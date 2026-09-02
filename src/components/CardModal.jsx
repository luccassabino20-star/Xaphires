import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch, useBoardState } from "../state/BoardContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { useUsers } from "../state/UsersContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import {
  addLinkAttachment,
  addFileAttachment,
  removeCardAttachment,
  attachmentDownloadUrl,
  getPlan,
  updateCardDescription,
} from "../state/api.js";
import { uid } from "../utils/id.js";
import SubtaskItem from "./SubtaskItem.jsx";
import RecurrencesModal from "./RecurrencesModal.jsx";
import CardDescriptionEditor from "./CardDescriptionEditor.jsx";
import CardActivityPanel from "./CardActivityPanel.jsx";
import CardPropertiesToolbar from "./CardPropertiesToolbar.jsx";
import { AttachmentFileIcon, AttachmentLinkIcon } from "./cardIcons.jsx";

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [checklistText, setChecklistText] = useState("");
  const [subtaskText, setSubtaskText] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [uploading, setUploading] = useState(false);
  // Teto de anexo do plano da empresa. Fica null até a consulta voltar; nesse
  // intervalo a checagem local é pulada e quem barra é o servidor.
  const [limiteAnexo, setLimiteAnexo] = useState(null);
  // Seção some quando vazia (mesmo espírito das pílulas da toolbar de
  // propriedades) - mas começa aberta se já tem conteúdo, pra não esconder
  // dado que a pessoa já tinha. Pílula de Checklist/Anexos (CardPropertiesToolbar)
  // só alterna esse booleano; o formulário de adicionar continua sendo o
  // desta seção mesmo, ela é grande demais pra caber num popover pequeno.
  const [checklistOpen, setChecklistOpen] = useState((card?.checklist?.length || 0) > 0);
  const [attachmentsOpen, setAttachmentsOpen] = useState((card?.attachments?.length || 0) > 0);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  // Incrementar refaz a busca do feed de atividades (ver CardActivityPanel).
  // Só precisa disso pra due date e mover de lista: os dois continuam otimistas
  // (dispatch + PATCH fire-and-forget, ver sync.js), então não existe uma
  // promise aqui pra esperar antes de recarregar - o setTimeout abaixo dá
  // tempo do servidor gravar a atividade antes do refetch. Não é garantia
  // dura, é a mesma folga otimista que o resto do modal já convive.
  const [activityRefresh, setActivityRefresh] = useState(0);
  const titleRef = useRef(null);
  const fileInputRef = useRef(null);
  // Não confiar só no useRef(true) inicial: o StrictMode do React roda o
  // efeito duas vezes em dev (monta, desmonta, monta de novo, ver CLAUDE.md
  // sobre a mesma pegadinha na auditoria do painel) - a segunda montagem
  // reaproveita a MESMA ref, então sem o `= true` aqui dentro ela ficava presa
  // em `false` (herdado da desmontagem simulada) pelo resto da vida real do
  // componente, e o setTimeout abaixo nunca mais disparava o refresh.
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  function agendarRefreshAtividade() {
    setTimeout(() => {
      if (montado.current) setActivityRefresh((n) => n + 1);
    }, 800);
  }

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
  // Pessimista de propósito, diferente do resto do modal: só entra no estado
  // (e portanto na tela) depois que o servidor confirmou. É a trava pedida
  // para a descrição - nada de reducer otimista aqui, então nada pra desfazer
  // se o PATCH falhar. Erro deixa o rascunho como está no editor (a pessoa não
  // perde o que escreveu) e mostra toast.
  async function commitDescription(text) {
    if (readOnly) return;
    await updateCardDescription(cardId, text)
      .then(() => {
        dispatch({ type: "SET_CARD_DESCRIPTION_LOCAL", boardId, cardId, description: text });
        setActivityRefresh((n) => n + 1);
      })
      .catch((err) => {
        showToast(translateError(err, t));
        throw err;
      });
  }
  function toggleCompleted() {
    dispatch({ type: "TOGGLE_CARD_COMPLETED", boardId, cardId });
  }
  // Alternativa ao arrastar: essencial no toque, onde o board usa drag and drop
  // nativo do HTML5 e não existe arraste por dedo. Sempre entra no fim da lista
  // de destino - escolher a posição exata é o que o arraste ainda resolve melhor.
  function moveToList(toListId) {
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
    agendarRefreshAtividade();
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
  const currentList = board.lists.find((l) => l.cardIds.includes(cardId));

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
            {/* Linha 1: breadcrumb + badge de categoria à esquerda, status à
                direita, na mesma altura - status sobe pra cá (era embaixo do
                título, junto de "mover para lista") porque é a informação mais
                importante do card, não um metadado a mais. */}
            <div className="card-detail-topline">
              <div className="card-detail-topline-left">
                <span className="card-detail-breadcrumb">
                  {board.title}
                  {currentList && <> / {currentList.title}</>}
                </span>
                <span className="card-detail-type-badge">{t("board.cardModal.typeBadge")}</span>
              </div>
              <button
                type="button"
                className={"status-pill" + (card.completed ? " status-pill-success" : " status-pill-neutral")}
                disabled={readOnly}
                onClick={toggleCompleted}
              >
                {card.completed ? t("board.cardModal.complete") : t("board.cardModal.statusOpen")}
              </button>
            </div>

            {/* Linha 2: título em destaque, com a data de criação discreta
                logo abaixo - juntos, formam o "cartão de identidade" do card,
                separados da barra de ações que vem a seguir. */}
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
            {card.createdAt && (
              <div className="card-detail-created-at">
                {t("board.cardModal.createdAt", { data: new Date(card.createdAt).toLocaleString(i18n.language) })}
              </div>
            )}

            {readOnly && <div className="board-readonly-note">{t("board.cardModal.readOnlyNote")}</div>}

            {/* Toolbar de propriedades rápidas: cada pílula abre o popover da
                própria propriedade (ver CardPropertiesToolbar.jsx). Propriedade
                vazia não aparece em lugar nenhum além daqui - substitui a
                antiga grade fixa de metadados (status/membros/datas/
                prioridade/etiquetas/local). "Mover para lista" mora aqui
                também agora (era um <select> nativo, numa linha própria) -
                mesma pílula, mesma linha, mesma identidade visual dos outros. */}
            <CardPropertiesToolbar
              boardId={boardId}
              cardId={cardId}
              card={card}
              users={users}
              readOnly={readOnly}
              dispatch={dispatch}
              onOpenRecurrence={() => setRecurrenceOpen(true)}
              onDueChanged={agendarRefreshAtividade}
              checklist={{ done, total: card.checklist.length, open: checklistOpen, onToggle: () => setChecklistOpen((v) => !v) }}
              attachments={{ count: card.attachments?.length || 0, open: attachmentsOpen, onToggle: () => setAttachmentsOpen((v) => !v) }}
              lists={board.lists}
              currentListId={currentList?.id}
              onMoveToList={moveToList}
            />

            <CardDescriptionEditor description={card.description} onSave={commitDescription} readOnly={readOnly} />

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

            {checklistOpen && (
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
            )}

            {attachmentsOpen && (
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
            )}
          </div>

          <div className="card-detail-sidebar">
            <CardActivityPanel cardId={cardId} readOnly={readOnly} refreshToken={activityRefresh} />
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
