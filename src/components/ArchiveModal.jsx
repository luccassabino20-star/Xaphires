import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch } from "../state/BoardContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import * as api from "../state/api.js";

// Mesmo molde de ícone do resto do app (viewBox 24x24, stroke fino) - ver
// RecurrencesModal.jsx/admin/icons.jsx. Sem lib nova só para os traços daqui.
function IconSearch({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function IconInfo({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconArchiveBox({ size = 26 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h18v4H3z" />
      <path d="M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  );
}
function IconRestore({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}
function IconTrash({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-.7 13.1a2 2 0 0 1-2 1.9H8.7a2 2 0 0 1-2-1.9L6 6" />
    </svg>
  );
}

function formatArchivedAt(iso, locale) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

export default function ArchiveModal({ board, onClose }) {
  const { t, i18n } = useTranslation();
  const dispatch = useBoardDispatch();
  const showToast = useToast();
  const [query, setQuery] = useState("");

  // null = regra desligada. O campo de dias guarda o último valor digitado mesmo
  // com a regra desligada, para religar não obrigar a digitar de novo.
  const ligada = !!board.autoArchiveDays;
  const [dias, setDias] = useState(String(board.autoArchiveDays || 7));

  // O direito à automação vem do plano. Enquanto não chega, o controle fica
  // desabilitado — melhor do que habilitar e o servidor recusar depois do clique.
  const [temAutomacao, setTemAutomacao] = useState(null);
  useEffect(() => {
    let ativo = true;
    api
      .getPlan()
      .then((p) => ativo && setTemAutomacao(!!p.canUseAutoArchive))
      .catch(() => ativo && setTemAutomacao(false));
    return () => {
      ativo = false;
    };
  }, []);
  const automacaoLiberada = temAutomacao === true;

  function salvarRegra(ativa, valorDias) {
    const n = Number(valorDias);
    if (ativa && (!Number.isInteger(n) || n < 1 || n > 365)) {
      showToast(t("board.archive.autoInvalid"));
      return;
    }
    dispatch({ type: "SET_AUTO_ARCHIVE_DAYS", boardId: board.id, days: ativa ? n : null });
  }

  // O cartão arquivado continua em board.cards, apenas fora de list.cardIds.
  // Os mais recentes primeiro: o que se procura no arquivo quase sempre é o último.
  const archived = useMemo(() => {
    const listTitleById = new Map(board.lists.map((l) => [l.id, l.title]));
    return Object.values(board.cards)
      .filter((c) => c.archived)
      .map((c) => ({ ...c, fromTitle: listTitleById.get(c.archivedFrom) || null }))
      .sort((a, b) => String(b.archivedAt || "").localeCompare(String(a.archivedAt || "")));
  }, [board]);

  // Busca por nome OU pela lista de origem (ex: digitar "concluído" acha todo
  // cartão arquivado que veio daquela coluna, sem precisar saber o título).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return archived;
    return archived.filter(
      (c) => c.title.toLowerCase().includes(q) || (c.fromTitle || "").toLowerCase().includes(q)
    );
  }, [archived, query]);

  function restore(card) {
    dispatch({ type: "UNARCHIVE_CARD", boardId: board.id, cardId: card.id });
    showToast(t("board.archive.restoredToast", { title: card.title }));
  }

  function remove(card) {
    if (!confirm(t("board.archive.deleteConfirm", { title: card.title }))) return;
    dispatch({ type: "DELETE_CARD", boardId: board.id, cardId: card.id });
    showToast(t("board.archive.deletedToast"));
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal archive-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>
        <div className="modal-header">
          <svg viewBox="0 0 24 24" width="20" height="20" className="modal-icon">
            <path
              fill="currentColor"
              d="M3 4h18v4H3zm1 6h16v10H4zm5 2v2h6v-2z"
            />
          </svg>
          <h2 className="archive-modal-title">{t("board.archive.title")}</h2>
        </div>

        <div className="modal-body">
          <div className="archive-rule">
            <div className="archive-rule-row">
              <button
                type="button"
                role="switch"
                aria-checked={ligada}
                aria-label={t("board.archive.autoLabel")}
                className={"archive-toggle" + (ligada ? " on" : "")}
                disabled={!automacaoLiberada}
                onClick={() => salvarRegra(!ligada, dias)}
              >
                <span className="archive-toggle-thumb" />
              </button>
              <span className="archive-rule-label">{t("board.archive.autoLabel")}</span>
              <div className="archive-rule-days">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={dias}
                  disabled={!ligada || !automacaoLiberada}
                  onChange={(e) => setDias(e.target.value)}
                  onBlur={() => ligada && salvarRegra(true, dias)}
                />
                <span>{t("board.archive.autoDaysSuffix")}</span>
              </div>
            </div>
            <p className="archive-rule-hint">
              <IconInfo />
              <span>
                {temAutomacao === false
                  ? t("board.archive.autoPlanRequired")
                  : ligada
                    ? t("board.archive.autoOnHint", { days: Number(dias) || board.autoArchiveDays })
                    : t("board.archive.autoOffHint")}
              </span>
            </p>
          </div>

          {archived.length > 0 && (
            <span className="archive-search-wrap">
              <IconSearch />
              <input
                className="archive-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("board.archive.searchPlaceholder")}
              />
            </span>
          )}

          {archived.length === 0 ? (
            <div className="archive-empty">
              <span className="archive-empty-icon">
                <IconArchiveBox />
              </span>
              <p className="archive-empty-title">{t("board.archive.emptyTitle")}</p>
              <p className="archive-empty-sub">{t("board.archive.empty")}</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="archive-no-results">{t("board.archive.noResults")}</p>
          ) : (
            <ul className="archive-list">
              {filtered.map((card) => (
                <li className="archive-item" key={card.id}>
                  <div className="archive-item-info">
                    <div className="archive-item-heading">
                      <span className="archive-item-title">{card.title}</span>
                      <span className="archive-item-badge">
                        {card.fromTitle ? card.fromTitle : t("board.archive.fromDeletedList")}
                      </span>
                    </div>
                    {card.archivedAt && (
                      <span className="archive-item-meta">{formatArchivedAt(card.archivedAt, i18n.language)}</span>
                    )}
                  </div>
                  <div className="archive-item-actions">
                    <button className="archive-action-btn" onClick={() => restore(card)}>
                      <IconRestore /> {t("board.archive.restore")}
                    </button>
                    <button className="archive-action-btn danger" onClick={() => remove(card)}>
                      <IconTrash /> {t("board.archive.delete")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
