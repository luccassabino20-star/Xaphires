import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch } from "../state/BoardContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import * as api from "../state/api.js";

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return archived;
    return archived.filter((c) => c.title.toLowerCase().includes(q));
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
            <label className="archive-rule-toggle">
              <input
                type="checkbox"
                checked={ligada}
                disabled={!automacaoLiberada}
                onChange={(e) => salvarRegra(e.target.checked, dias)}
              />
              <span>{t("board.archive.autoLabel")}</span>
            </label>
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
            <p className="archive-rule-hint">
              {temAutomacao === false
                ? t("board.archive.autoPlanRequired")
                : ligada
                  ? t("board.archive.autoOnHint", { days: Number(dias) || board.autoArchiveDays })
                  : t("board.archive.autoOffHint")}
            </p>
          </div>

          {archived.length > 0 && (
            <input
              className="archive-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("board.archive.searchPlaceholder")}
            />
          )}

          {archived.length === 0 ? (
            <p className="archive-empty">{t("board.archive.empty")}</p>
          ) : filtered.length === 0 ? (
            <p className="archive-empty">{t("board.archive.noResults")}</p>
          ) : (
            <ul className="archive-list">
              {filtered.map((card) => (
                <li className="archive-item" key={card.id}>
                  <div className="archive-item-info">
                    <span className="archive-item-title">{card.title}</span>
                    <span className="archive-item-meta">
                      {card.fromTitle
                        ? t("board.archive.fromList", { list: card.fromTitle })
                        : t("board.archive.fromDeletedList")}
                      {card.archivedAt && ` · ${formatArchivedAt(card.archivedAt, i18n.language)}`}
                    </span>
                  </div>
                  <div className="archive-item-actions">
                    <button className="btn-secondary btn-small" onClick={() => restore(card)}>
                      {t("board.archive.restore")}
                    </button>
                    <button className="btn-danger btn-small" onClick={() => remove(card)}>
                      {t("board.archive.delete")}
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
