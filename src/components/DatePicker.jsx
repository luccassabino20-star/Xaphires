import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "../state/ToastContext.jsx";
import { localeTag, normalizeLanguage } from "../i18n/locale.js";
import { parseISO, toISO, addDays, today0, sameDay, weekdayLabels, nextWeekend, nextWeek, buildMonthGrid } from "../utils/datePicker.js";

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15">
      <path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm12 8v9H5v-9z" />
    </svg>
  );
}
function ChevronIcon({ dir }) {
  const d = dir === "left" ? "M15.5 5 8.5 12l7 7 1.4-1.4L11.3 12l5.6-5.6z" : "M8.5 5l7 7-7 7-1.4-1.4L12.7 12 7.1 6.4z";
  return (
    <svg viewBox="0 0 24 24" width="15" height="15">
      <path fill="currentColor" d={d} />
    </svg>
  );
}

// Datepicker próprio, sem lib externa - Vanilla JS/React puro (useState +
// Date nativo), estilo Todoist/ClickUp: dois campos (início/vencimento) que
// abrem o mesmo popover (atalhos + calendário), um componente por campo.
// "Configurar recorrência" abre outra tela, de outro escopo (moldes de
// cartão recorrente são do quadro inteiro, não da data de um cartão só) -
// por isso o componente não sabe abri-la sozinho. Quem chama passa
// `onOpenRecurrence` quando faz sentido no contexto (cartão, que tem quadro);
// sem o prop, o botão só explica onde o recurso vive (caso da subtarefa, que
// não é candidata a virar molde).
export default function DatePicker({ value, onChange, label, disabled, compact = false, onOpenRecurrence }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const lang = normalizeLanguage(i18n.language);
  const tag = localeTag(i18n.language);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const rootRef = useRef(null);
  const popoverRef = useRef(null);

  const selected = value ? parseISO(value) : null;
  const [viewDate, setViewDate] = useState(() => selected || today0());

  useEffect(() => {
    if (open) setViewDate(selected || today0());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Popover vai por portal em document.body, posição fixa calculada a partir
  // do gatilho - o modal de cartão tem coluna com rolagem própria (ver
  // .card-detail-sidebar em index.css), e um popover posicionado relativo ao
  // pai ficaria cortado nas bordas dessa coluna estreita. Fixed + portal
  // escapa de qualquer overflow:hidden/auto de ancestral.
  const POPOVER_WIDTH = 490;
  useLayoutEffect(() => {
    if (!open) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12);
    setCoords({ top: rect.bottom + 6, left: Math.max(left, 12) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (rootRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key !== "Escape") return;
      // Fase de captura + stopPropagation: sem isso, o Escape fecha o popover
      // E o modal do cartão juntos - os dois ouvem keydown no document, e o
      // modal (registrado primeiro, no mount) fecharia antes deste handler
      // (registrado depois, só quando o popover abre) ter chance de agir.
      // Capture roda antes de bubble no mesmo alvo, então isto sempre vence.
      e.stopPropagation();
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const today = today0();
  const weekdays = useMemo(() => weekdayLabels(lang, tag), [lang, tag]);
  const grid = useMemo(() => buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth()), [viewDate]);
  const monthLabel = useMemo(() => {
    const raw = new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" }).format(viewDate);
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [viewDate, tag]);

  const presets = useMemo(() => {
    const shortWeekday = (d) => new Intl.DateTimeFormat(tag, { weekday: "short" }).format(d).replace(".", "");
    const shortDate = (d) => new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" }).format(d).replace(".", "");
    const list = [
      { key: "today", date: today, dateLabel: shortWeekday(today) },
      { key: "tomorrow", date: addDays(today, 1), dateLabel: shortWeekday(addDays(today, 1)) },
      { key: "weekend", date: nextWeekend(today) },
      { key: "nextWeek", date: nextWeek(today) },
      { key: "twoWeeks", date: addDays(today, 14) },
      { key: "fourWeeks", date: addDays(today, 28) },
      { key: "eightWeeks", date: addDays(today, 56) },
    ];
    return list.map((p) => ({ ...p, dateLabel: p.dateLabel || shortDate(p.date) }));
  }, [today, tag]);

  function commit(date) {
    onChange(date ? toISO(date) : null);
    setOpen(false);
  }

  function changeMonth(delta) {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  return (
    <div className="datepicker" ref={rootRef}>
      <button
        type="button"
        className={"datepicker-trigger" + (compact ? " datepicker-trigger-compact" : "") + (open ? " open" : "") + (selected ? " has-value" : "")}
        disabled={disabled}
        title={compact ? label : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <CalendarIcon />
        {/* Modo compacto (badge de subtarefa): sem data, só o ícone - o rótulo
            completo vira title (tooltip) em vez de texto, pra não alargar a
            pílula numa linha que já tem outros badges ao lado. Com data, mês/
            dia sem ano - o ano quase nunca importa numa subtarefa de prazo
            curto, e sobra mais espaço na linha. */}
        <span>
          {selected
            ? new Intl.DateTimeFormat(tag, compact ? { day: "2-digit", month: "2-digit" } : { day: "2-digit", month: "2-digit", year: "numeric" }).format(selected)
            : compact ? "" : label}
        </span>
      </button>

      {open && coords && createPortal(
        <div className="datepicker-popover" ref={popoverRef} style={{ top: coords.top, left: coords.left }}>
          <div className="datepicker-presets">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                className={"datepicker-preset" + (selected && sameDay(selected, p.date) ? " active" : "")}
                onClick={() => commit(p.date)}
              >
                <span>{t(`datePicker.presets.${p.key}`)}</span>
                <span className="datepicker-preset-date">{p.dateLabel}</span>
              </button>
            ))}
            <button
              type="button"
              className="datepicker-preset datepicker-recurrence"
              onClick={() => {
                if (onOpenRecurrence) {
                  onOpenRecurrence();
                } else {
                  showToast(t("datePicker.recurrenceHint"));
                }
                setOpen(false);
              }}
            >
              <span>{t("datePicker.recurrence")}</span>
              <span className="datepicker-preset-date">›</span>
            </button>
            {selected && (
              <button type="button" className="datepicker-clear" onClick={() => commit(null)}>
                {t("datePicker.clear")}
              </button>
            )}
          </div>

          <div className="datepicker-calendar">
            <div className="datepicker-cal-header">
              <span className="datepicker-cal-month">{monthLabel}</span>
              <button type="button" className="datepicker-today-btn" onClick={() => setViewDate(today0())}>
                {t("datePicker.today")}
              </button>
              <button type="button" className="datepicker-nav-btn" onClick={() => changeMonth(-1)} aria-label="Anterior">
                <ChevronIcon dir="left" />
              </button>
              <button type="button" className="datepicker-nav-btn" onClick={() => changeMonth(1)} aria-label="Próximo">
                <ChevronIcon dir="right" />
              </button>
            </div>

            <div className="datepicker-weekdays">
              {weekdays.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>

            <div className="datepicker-days">
              {grid.map(({ date, inMonth }) => {
                const isSelected = selected && sameDay(selected, date);
                const isToday = sameDay(date, today);
                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    className={
                      "datepicker-day" +
                      (inMonth ? "" : " outside") +
                      (isSelected ? " selected" : "") +
                      (isToday && !isSelected ? " today" : "")
                    }
                    onClick={() => commit(date)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
