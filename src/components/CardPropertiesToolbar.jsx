import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LABEL_COLORS } from "../utils/labels.js";
import { parseISO } from "../utils/datePicker.js";
import { geocodeAddress } from "../state/api.js";
import { translateError } from "../utils/errors.js";
import DatePicker from "./DatePicker.jsx";
import Avatar from "./Avatar.jsx";
import PropertyPopover from "./PropertyPopover.jsx";
import AddPropertyMenu from "./AddPropertyMenu.jsx";
import {
  PlusIcon,
  TagIcon,
  CalendarIcon,
  MembersIcon,
  PinIcon,
  UrgentIcon,
  ImportantIcon,
  ChecklistIcon,
  CloseIcon,
  AttachmentFileIcon,
  ChevronDownIcon,
} from "./cardIcons.jsx";

// Barra de propriedades do cartão (topo do modal, abaixo do título). Substitui
// a antiga grade de metadados fixa: propriedade vazia não aparece na tela,
// só pelo "+ Adicionar" - as 5 mais usadas (Etiquetas, Checklist, Membros,
// Data de entrega, Local) ficam fixas mesmo vazias, por serem atalho, não
// "propriedade ativa"; Prioridade só vira pílula depois de ter valor.
//
// Um popover flutuante por vez (openPopover), nunca dois - reaproveita o
// mesmo PropertyPopover pra todos, mudando só o conteúdo e o elemento-âncora.
export default function CardPropertiesToolbar({
  boardId,
  cardId,
  card,
  users,
  readOnly,
  dispatch,
  onOpenRecurrence,
  onDueChanged,
  checklist,
  attachments,
  lists,
  currentListId,
  onMoveToList,
}) {
  const { t, i18n } = useTranslation();
  const [openPopover, setOpenPopover] = useState(null);
  const [addressInput, setAddressInput] = useState(card.location?.address || "");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");
  const pillRefs = useRef({});
  const addBtnRef = useRef(null);

  function togglePopover(key) {
    if (readOnly) return;
    setOpenPopover((cur) => (cur === key ? null : key));
  }
  function closePopover() {
    setOpenPopover(null);
  }
  // Propriedade sem pílula fixa ainda (Prioridade sem valor) abre ancorada no
  // próprio botão "+" - a pílula dela só nasce depois que ganha valor.
  function anchorFor(key) {
    return pillRefs.current[key] || addBtnRef.current;
  }
  function registerPill(key) {
    return (el) => {
      pillRefs.current[key] = el;
    };
  }

  function onSelectFromMenu(key) {
    if (key === "checklist") {
      checklist.onToggle();
      closePopover();
      return;
    }
    if (key === "attachments") {
      attachments.onToggle();
      closePopover();
      return;
    }
    setOpenPopover(key);
  }

  function toggleLabel(labelId) {
    dispatch({ type: "TOGGLE_CARD_LABEL", boardId, cardId, labelId });
  }
  function toggleMember(memberId) {
    dispatch({ type: "TOGGLE_CARD_MEMBER", boardId, cardId, memberId });
  }
  function handleDueChange(iso) {
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { due: iso || null } });
    onDueChanged?.();
  }
  function handleStartDateChange(iso) {
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { startDate: iso || null } });
  }
  function toggleUrgent() {
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { urgent: !card.urgent } });
  }
  function toggleImportant() {
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { important: !card.important } });
  }
  function clearDue(e) {
    e.stopPropagation();
    handleDueChange(null);
  }
  function clearLocation(e) {
    e.stopPropagation();
    setAddressInput("");
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { location: null } });
  }
  function clearPriority(e) {
    e.stopPropagation();
    dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { urgent: false, important: false } });
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
      dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { location: { address: q, lat: result.lat, lng: result.lng } } });
    } catch (err) {
      setGeocodeError(translateError(err, t));
      dispatch({ type: "UPDATE_CARD", boardId, cardId, patch: { location: { address: q, lat: null, lng: null } } });
    } finally {
      setGeocoding(false);
    }
  }

  const cardMembers = (card.memberIds || []).map((id) => users.find((m) => m.id === id)).filter(Boolean);
  const hasLabels = card.labels.length > 0;
  const hasPriority = !!(card.urgent || card.important);
  const hasLocation = !!card.location?.address;
  const hasDue = !!card.due;
  const activeLabelMeta = LABEL_COLORS.filter((meta) => card.labels.includes(meta.id));

  const currentList = lists?.find((l) => l.id === currentListId);

  return (
    <div className="property-toolbar">
      {/* ---------- Mover para lista - mesma pílula dos outros, não o <select>
          nativo de antes, pra ter a mesma identidade visual e caber alinhada
          nesta linha (era uma linha própria, separada, abaixo do título). --------- */}
      {!readOnly && lists && (
        <>
          <button ref={registerPill("list")} type="button" className="property-pill property-pill-active" onClick={() => togglePopover("list")}>
            {currentList?.title || t("board.cardModal.moveToList")}
            <ChevronDownIcon />
          </button>
          <PropertyPopover anchorEl={pillRefs.current.list} open={openPopover === "list"} onClose={closePopover}>
            <div className="property-popover-title">{t("board.cardModal.moveToList")}</div>
            <div className="list-picker-menu">
              {lists.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={"list-picker-item" + (l.id === currentListId ? " active" : "")}
                  onClick={() => {
                    onMoveToList(l.id);
                    closePopover();
                  }}
                >
                  {l.title}
                </button>
              ))}
            </div>
          </PropertyPopover>
        </>
      )}

      {!readOnly && (
        <button
          ref={addBtnRef}
          type="button"
          className="property-pill property-pill-add"
          onClick={() => togglePopover("add")}
        >
          <PlusIcon /> {t("board.cardModal.propertiesToolbar.addButton")}
        </button>
      )}
      <PropertyPopover anchorEl={addBtnRef.current} open={openPopover === "add"} onClose={closePopover}>
        <AddPropertyMenu onSelect={onSelectFromMenu} />
      </PropertyPopover>

      {/* ---------- Etiquetas ---------- */}
      <button ref={registerPill("labels")} type="button" className={"property-pill" + (hasLabels ? " property-pill-active" : "")} onClick={() => togglePopover("labels")}>
        <TagIcon />
        {hasLabels ? (
          <span className="property-pill-dots">
            {activeLabelMeta.map((meta) => (
              <span key={meta.id} className="property-pill-dot" style={{ background: meta.color }} />
            ))}
          </span>
        ) : (
          t("board.cardModal.labels")
        )}
      </button>
      <PropertyPopover anchorEl={pillRefs.current.labels} open={openPopover === "labels"} onClose={closePopover}>
        <div className="property-popover-title">{t("board.cardModal.labels")}</div>
        <div className="label-picker property-popover-label-grid">
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
      </PropertyPopover>

      {/* ---------- Checklist: não é popover, alterna a seção inteira abaixo
          (é uma lista com formulário próprio, não cabe num popover pequeno). --------- */}
      <button
        type="button"
        className={"property-pill" + (checklist.total > 0 ? " property-pill-active" : "")}
        onClick={checklist.onToggle}
      >
        <ChecklistIcon /> {checklist.total > 0 ? `${checklist.done}/${checklist.total}` : t("board.cardModal.checklist")}
      </button>

      {/* ---------- Membros ---------- */}
      <button ref={registerPill("members")} type="button" className={"property-pill" + (cardMembers.length > 0 ? " property-pill-active" : "")} onClick={() => togglePopover("members")}>
        <MembersIcon />
        {cardMembers.length > 0 ? (
          <span className="member-avatars-row property-pill-avatars">
            {cardMembers.map((m) => (
              <Avatar key={m.id} id={m.id} name={m.name} avatarUrl={m.avatarUrl} className="avatar-small" title={m.name} />
            ))}
          </span>
        ) : (
          t("board.cardModal.members")
        )}
      </button>
      <PropertyPopover anchorEl={pillRefs.current.members} open={openPopover === "members"} onClose={closePopover}>
        <div className="property-popover-title">{t("board.cardModal.members")}</div>
        <div className="member-picker property-popover-member-list">
          {users.length === 0 && <div className="member-picker-empty">{t("board.cardModal.noUsersYet")}</div>}
          {users.map((m) => (
            <label key={m.id} className="member-picker-row">
              <input type="checkbox" checked={(card.memberIds || []).includes(m.id)} onChange={() => toggleMember(m.id)} />
              <Avatar id={m.id} name={m.name} avatarUrl={m.avatarUrl} className="avatar-small" />
              <span>{m.name}</span>
            </label>
          ))}
        </div>
      </PropertyPopover>

      {/* ---------- Datas (início + entrega juntas, ver menu.dates) ---------- */}
      <button ref={registerPill("dates")} type="button" className={"property-pill" + (hasDue || card.startDate ? " property-pill-active" : "")} onClick={() => togglePopover("dates")}>
        <CalendarIcon />
        {hasDue
          ? parseISO(card.due).toLocaleDateString(i18n.language, { day: "2-digit", month: "short" })
          : card.startDate
          ? parseISO(card.startDate).toLocaleDateString(i18n.language, { day: "2-digit", month: "short" })
          : t("board.cardModal.dueDate")}
        {hasDue && (
          <span className="property-pill-clear" onClick={clearDue} role="button" aria-label={t("common.remove")}>
            <CloseIcon />
          </span>
        )}
      </button>
      <PropertyPopover anchorEl={pillRefs.current.dates} open={openPopover === "dates"} onClose={closePopover}>
        <div className="property-popover-title">{t("board.cardModal.datesLabel")}</div>
        <div className="date-range">
          <DatePicker
            value={card.startDate}
            onChange={handleStartDateChange}
            label={t("board.cardModal.startDate")}
            disabled={readOnly}
            onOpenRecurrence={readOnly ? undefined : onOpenRecurrence}
          />
          <span className="date-range-arrow">→</span>
          <DatePicker
            value={card.due}
            onChange={handleDueChange}
            label={t("board.cardModal.dueDate")}
            disabled={readOnly}
            onOpenRecurrence={readOnly ? undefined : onOpenRecurrence}
          />
        </div>
      </PropertyPopover>

      {/* ---------- Local ---------- */}
      <button ref={registerPill("location")} type="button" className={"property-pill" + (hasLocation ? " property-pill-active" : "")} onClick={() => togglePopover("location")}>
        <PinIcon />
        {hasLocation ? <span className="property-pill-truncate">{card.location.address}</span> : t("board.cardModal.location")}
        {hasLocation && (
          <span className="property-pill-clear" onClick={clearLocation} role="button" aria-label={t("common.remove")}>
            <CloseIcon />
          </span>
        )}
      </button>
      <PropertyPopover anchorEl={pillRefs.current.location} open={openPopover === "location"} onClose={closePopover}>
        <div className="property-popover-title">{t("board.cardModal.location")}</div>
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
              autoFocus
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
      </PropertyPopover>

      {/* ---------- Prioridade: só vira pílula depois de ter valor - até lá só
          existe dentro do "+ Adicionar" (ver AddPropertyMenu). --------- */}
      {hasPriority && (
        <>
          <button ref={registerPill("priority")} type="button" className="property-pill property-pill-active" onClick={() => togglePopover("priority")}>
            {card.urgent && <UrgentIcon />}
            {card.important && <ImportantIcon />}
            {[card.urgent && t("board.cardModal.urgent"), card.important && t("board.cardModal.important")].filter(Boolean).join(" · ")}
            <span className="property-pill-clear" onClick={clearPriority} role="button" aria-label={t("common.remove")}>
              <CloseIcon />
            </span>
          </button>
          <PropertyPopover anchorEl={pillRefs.current.priority} open={openPopover === "priority"} onClose={closePopover}>
            <div className="property-popover-title">{t("board.cardModal.priority")}</div>
            <div className="priority-toggle-row">
              <button type="button" className={"priority-chip priority-chip-urgent" + (card.urgent ? " active" : "")} disabled={readOnly} onClick={toggleUrgent}>
                <UrgentIcon /> {t("board.cardModal.urgent")}
              </button>
              <button type="button" className={"priority-chip priority-chip-important" + (card.important ? " active" : "")} disabled={readOnly} onClick={toggleImportant}>
                <ImportantIcon /> {t("board.cardModal.important")}
              </button>
            </div>
          </PropertyPopover>
        </>
      )}

      {/* ---------- Anexos: mesma lógica do Checklist, alterna a seção. Só
          vira pílula fixa depois de ter algum anexo - até lá é só menu. --------- */}
      {attachments.count > 0 && (
        <button type="button" className="property-pill property-pill-active" onClick={attachments.onToggle}>
          <AttachmentFileIcon /> {attachments.count}
        </button>
      )}
    </div>
  );
}
