import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardDispatch } from "../../state/BoardContext.jsx";
import { flattenCards } from "../../utils/boardCards.js";
import { LABEL_COLORS } from "../../utils/labels.js";
import { weekdayNames, monthNames, toISODate, buildGrid, occurrencesInRange } from "../../utils/calendarGrid.js";
import { uid } from "../../utils/id.js";
import * as api from "../../state/api.js";

export default function CalendarView({ board, users, searchQuery, memberFilter, onOpenCard }) {
  const { t, i18n } = useTranslation();
  const dispatch = useBoardDispatch();
  const readOnly = board.myRole === "viewer";
  const WEEKDAYS = useMemo(() => weekdayNames(i18n.language), [i18n.language]);
  const MONTH_NAMES = useMemo(() => monthNames(i18n.language), [i18n.language]);
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [recorrencias, setRecorrencias] = useState([]);
  const [addingDate, setAddingDate] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");

  // Autocontido, como o RecurrencesModal - a view não recebe recorrência por
  // prop porque nenhuma outra view precisa dela. GET não é bloqueado por
  // plano (só criar é, ver exigePlano em routes/recurrences.js), então uma
  // empresa que caiu de plano ainda vê a prévia das regras que já existiam.
  useEffect(() => {
    if (!board?.id) return;
    let cancelado = false;
    api
      .listRecurrences(board.id)
      .then((r) => {
        if (!cancelado) setRecorrencias(r.recurrences);
      })
      .catch(() => {
        if (!cancelado) setRecorrencias([]);
      });
    return () => {
      cancelado = true;
    };
  }, [board?.id]);

  const cards = useMemo(() => flattenCards(board), [board]);
  const filtered = cards.filter((c) => {
    const matchesSearch = !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMember = !memberFilter || (c.memberIds || []).includes(memberFilter);
    return matchesSearch && matchesMember;
  });

  const cardsByDate = useMemo(() => {
    const map = {};
    filtered.forEach((c) => {
      if (!c.due) return;
      (map[c.due] ||= []).push(c);
    });
    return map;
  }, [filtered]);

  const grid = useMemo(() => buildGrid(monthDate), [monthDate]);
  const todayIso = toISODate(new Date());

  // Prévia das próximas ocorrências das rotinas automáticas, para o mês visível.
  // Só a partir de hoje: dia passado sem cartão real é ocorrência que a rotina já
  // deu como perdida (ver runRecurrences em repo.js, que gera no máximo um
  // cartão por regra) - mostrar fantasma ali pareceria tarefa esquecida, não
  // prévia. E some sozinha na data em que vira cartão de verdade: mesmo
  // título/coluna já é a mesma ocorrência, mostrar as duas duplicaria.
  const rotinasByDate = useMemo(() => {
    const map = {};
    if (grid.length === 0) return map;
    const inicio = new Date(Math.max(grid[0].date, new Date(todayIso)));
    const fim = grid[grid.length - 1].date;
    if (inicio > fim) return map;
    for (const regra of recorrencias) {
      if (!regra.active) continue;
      for (const iso of occurrencesInRange(regra, inicio, fim)) {
        const jaVirouCartaoDeVerdade = (cardsByDate[iso] || []).some(
          (c) => c.title === regra.title && c.listId === regra.listId
        );
        if (jaVirouCartaoDeVerdade) continue;
        (map[iso] ||= []).push(regra);
      }
    }
    return map;
  }, [recorrencias, grid, cardsByDate, todayIso]);

  function goToday() {
    const now = new Date();
    setMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
  }
  function goPrev() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function goNext() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  // Cartão pertence a uma lista, e o "+" do dia não sabe de qual - cai sempre
  // na primeira do quadro. Não abre o cartão de verdade: o "+" é para criar
  // rápido, título e data já bastam, e quem quiser editar o resto clica no
  // chip como qualquer outro cartão do calendário.
  function handleQuickAdd(iso) {
    const titulo = draftTitle.trim();
    setDraftTitle("");
    setAddingDate(null);
    if (!titulo) return;
    const list = board.lists[0];
    if (!list) return;
    const id = uid();
    dispatch({ type: "ADD_CARD", boardId: board.id, listId: list.id, id, title: titulo });
    dispatch({ type: "UPDATE_CARD", boardId: board.id, cardId: id, patch: { due: iso } });
  }

  return (
    <div className="view-scroll">
      <div className="calendar-header">
        <div className="calendar-title">
          {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
        </div>
        <div className="calendar-nav">
          <button className="btn-ghost btn-small" onClick={goToday}>
            {t("views.calendar.today")}
          </button>
          <button className="icon-btn" onClick={goPrev} aria-label={t("views.calendar.prevMonth")}>
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" /></svg>
          </button>
          <button className="icon-btn" onClick={goNext} aria-label={t("views.calendar.nextMonth")}>
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4L13.2 12z" /></svg>
          </button>
        </div>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
        {grid.map(({ date, inMonth }) => {
          const iso = toISODate(date);
          const dayCards = cardsByDate[iso] || [];
          const dayRotinas = rotinasByDate[iso] || [];
          const total = dayCards.length + dayRotinas.length;
          const isToday = iso === todayIso;
          return (
            <div key={iso} className={"calendar-cell" + (inMonth ? "" : " outside") + (isToday ? " today" : "")}>
              <div className="calendar-day-num-row">
                <span className="calendar-day-num">{date.getDate()}</span>
                {!readOnly && board.lists.length > 0 && (
                  <button
                    type="button"
                    className="planner-day-add"
                    aria-label={t("views.calendar.quickAdd")}
                    onClick={() => {
                      setAddingDate(iso);
                      setDraftTitle("");
                    }}
                  >
                    +
                  </button>
                )}
              </div>
              <div className="calendar-day-cards">
                {dayCards.slice(0, 4).map((c) => {
                  const labelMeta = c.labels?.length ? LABEL_COLORS.find((l) => l.id === c.labels[0]) : null;
                  return (
                    <button
                      key={c.id}
                      className={"calendar-card-chip" + (c.completed ? " completed" : "")}
                      style={labelMeta ? { borderLeftColor: labelMeta.color } : undefined}
                      onClick={() => onOpenCard(c.id)}
                      title={c.title}
                    >
                      {c.title}
                    </button>
                  );
                })}
                {dayRotinas.slice(0, Math.max(0, 4 - dayCards.length)).map((r) => (
                  // Só prévia: sem cartão ainda, então sem onClick de abrir. Estilo
                  // tracejado + opacidade reduzida (inline, não classe nova - CSS
                  // deste projeto tem regra de especificidade e variável
                  // inexistente derruba a declaração inteira em silêncio, e isto
                  // não foi conferido no navegador) para diferenciar de cartão real
                  // sem depender só de cor.
                  <div
                    key={"rotina-" + r.id + "-" + iso}
                    className="calendar-card-chip"
                    style={{ opacity: 0.6, borderStyle: "dashed", cursor: "default" }}
                    title={t("views.calendar.routinePreview", { title: r.title })}
                  >
                    {r.title}
                  </div>
                ))}
                {total > 4 && <div className="calendar-more">{t("views.calendar.more", { count: total - 4 })}</div>}
              </div>
              {addingDate === iso && (
                <form className="planner-inline-add" onSubmit={(e) => e.preventDefault()}>
                  <input
                    autoFocus
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onBlur={() => handleQuickAdd(iso)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleQuickAdd(iso);
                      }
                      if (e.key === "Escape") setAddingDate(null);
                    }}
                    placeholder={t("board.listColumn.cardTitlePlaceholder")}
                  />
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
