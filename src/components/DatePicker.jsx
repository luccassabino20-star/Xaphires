import { useEffect, useMemo, useRef, useState } from "react";
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
// abrem o mesmo popover (atalhos + calendário), um componente por campo. Ver
// decisão sobre "Configurar recorrência" abaixo: não fica funcional aqui
// dentro, porque cartão recorrente é outra tela, de outro escopo (o quadro
// inteiro, não uma data de um cartão só).
export default function DatePicker({ value, onChange, label, disabled }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const lang = normalizeLanguage(i18n.language);
  const tag = localeTag(i18n.language);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selected = value ? parseISO(value) : null;
  const [viewDate, setViewDate] = useState(() => selected || today0());

  useEffect(() => {
    if (open) setViewDate(selected || today0());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
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
        className={"datepicker-trigger" + (open ? " open" : "") + (selected ? " has-value" : "")}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <CalendarIcon />
        <span>{selected ? new Intl.DateTimeFormat(tag, { day: "2-digit", month: "2-digit", year: "numeric" }).format(selected) : label}</span>
      </button>

      {open && (
        <div className="datepicker-popover">
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
                showToast(t("datePicker.recurrenceHint"));
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
        </div>
      )}
    </div>
  );
}
