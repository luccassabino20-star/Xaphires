import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../state/api.js";

function isOverdue(card) {
  if (!card.due) return false;
  const allDone = card.checklist && card.checklist.length > 0 && card.checklist.every((i) => i.done);
  if (allDone) return false;
  return new Date(card.due + "T23:59:59").getTime() < Date.now();
}

export default function TaskTicker({ board, onOpenCard }) {
  const { t } = useTranslation();
  // Letreiro é só a partir do Intermediário (ver canUseTaskTicker em
  // plans.js) - começa liberado pra não pipocar sumindo num plano que tem
  // direito, enquanto a resposta não chega (getPlan() já cacheia 30s).
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    let ativo = true;
    api
      .getPlan()
      .then((p) => ativo && setAllowed(p.canUseTaskTicker !== false))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  if (!board || !allowed) return null;

  const listTitleById = new Map(board.lists.map((l) => [l.id, l.title]));
  const pending = board.lists
    .flatMap((list) => list.cardIds.map((cardId) => ({ card: board.cards[cardId], listTitle: listTitleById.get(list.id) })))
    .filter((entry) => entry.card && !entry.card.completed);

  if (pending.length === 0) return null;

  const duration = Math.max(18, pending.length * 4.5);

  function renderItems(keyPrefix, ariaHidden) {
    return pending.map(({ card, listTitle }) => (
      <button
        key={`${keyPrefix}-${card.id}`}
        type="button"
        className="task-ticker-item"
        tabIndex={ariaHidden ? -1 : 0}
        aria-hidden={ariaHidden || undefined}
        onClick={() => onOpenCard(card.id)}
      >
        {card.urgent && <span className="task-ticker-flag urgent" title={t("board.cardItem.urgent")} />}
        {card.important && <span className="task-ticker-flag important" title={t("board.cardItem.important")} />}
        <span className={"task-ticker-title" + (isOverdue(card) ? " overdue" : "")}>{card.title}</span>
        {listTitle && <span className="task-ticker-list">{listTitle}</span>}
      </button>
    ));
  }

  return (
    <div className="task-ticker">
      <span className="task-ticker-label">{t("app.taskTicker.pending", { count: pending.length })}</span>
      <div className="task-ticker-track">
        <div className="task-ticker-content" style={{ animationDuration: `${duration}s` }}>
          {renderItems("a", false)}
        </div>
        <div className="task-ticker-content" style={{ animationDuration: `${duration}s` }} aria-hidden="true">
          {renderItems("b", true)}
        </div>
      </div>
    </div>
  );
}
