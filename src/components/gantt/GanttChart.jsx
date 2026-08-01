import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import GanttToolbar from "./GanttToolbar.jsx";
import GanttSidebar from "./GanttSidebar.jsx";
import GanttTimeline from "./GanttTimeline.jsx";
import GanttLegend from "./GanttLegend.jsx";
import { buildGanttRows, flattenTasks } from "./GanttRows.js";
import { addDays, parseISO } from "./ganttDate.js";
import { localeTag } from "../../i18n/locale.js";
import { DAY_WIDTH_LEVELS, DEFAULT_ZOOM_INDEX } from "./ganttConstants.js";
import { ganttMockData } from "./ganttMockData.js";
import { buildGanttCsv, downloadCsv } from "./ganttExport.js";
import { GANTT_STATUS } from "./ganttStatus.js";

const MARCAS_DIACRITICAS = new RegExp("[\\u0300-\\u036f]", "g");
function normalizar(texto) {
  return (texto || "").normalize("NFD").replace(MARCAS_DIACRITICAS, "").toLowerCase();
}

// Componente desacoplado de propósito - não lê ata, cartão nem nenhuma outra
// entidade real do app diretamente (ver decisão registrada na conversa).
// groups/meta têm os dados de exemplo como default só para dar pra abrir e ver
// funcionando; quem integra de verdade (ver MinutesGanttView) passa os
// próprios dados por prop, e opcionalmente onTaskClick pra abrir algo real em
// vez do "peek" interno, e legendStatusKeys/legendIconKeys pra legenda não
// listar cor/ícone que aquele contexto nunca usa.
//
// onSave/onNew/onOpenSelected são os três pontos que dependem de quem integra
// (persistir uma tarefa arrastada, criar algo novo, abrir a "tarefa"
// selecionada em outro lugar do app) - sem eles os botões correspondentes
// ficam desabilitados ou só arquivam localmente. Imprimir, exportar e buscar
// não dependem de nada de fora, resolvidos aqui dentro.
export default function GanttChart({
  groups: initialGroups = ganttMockData.groups,
  meta = ganttMockData.meta,
  onTaskClick,
  onSave,
  onNew,
  onOpenSelected,
  legendStatusKeys,
  legendIconKeys,
  readOnly = false,
}) {
  const { t, i18n } = useTranslation();
  const tag = localeTag(i18n.language);
  const [groups, setGroups] = useState(initialGroups);
  const [savedGroups, setSavedGroups] = useState(initialGroups);
  const [dirtyIds, setDirtyIds] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [peekTask, setPeekTask] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);

  // groups é estado local pra permitir o drag/resize antes de salvar (ver
  // dirtyIds/onSave abaixo). Se quem chama passar um `groups` novo (ata
  // editada em outro lugar, refetch depois do próprio save etc.), a fonte de
  // verdade de fora tem que vencer - inclusive descartando arrasto não salvo,
  // senão o Gantt mostra dado velho misturado com o que acabou de chegar.
  useEffect(() => {
    setGroups(initialGroups);
    setSavedGroups(initialGroups);
    setDirtyIds(new Set());
    setSaveError(null);
  }, [initialGroups]);

  const dayWidth = DAY_WIDTH_LEVELS[zoomIndex];

  function toggleGroup(id) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateTask(taskId, patch) {
    if (readOnly) return; // defesa: GanttBar já não inicia o arrasto neste modo
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        tasks: group.tasks.map((task) => {
          if (task.id === taskId) return { ...task, ...patch };
          if (task.children?.some((c) => c.id === taskId)) {
            return { ...task, children: task.children.map((c) => (c.id === taskId ? { ...c, ...patch } : c)) };
          }
          return task;
        }),
      }))
    );
    setPeekTask((prev) => (prev && prev.id === taskId ? { ...prev, ...patch } : prev));
    setDirtyIds((prev) => new Set(prev).add(taskId));
  }

  const filteredGroups = useMemo(() => {
    const q = normalizar(searchQuery.trim());
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, tasks: g.tasks.filter((t) => normalizar(t.title).includes(q)) }))
      .filter((g) => g.tasks.length > 0);
  }, [groups, searchQuery]);

  const rows = useMemo(() => buildGanttRows(filteredGroups, collapsedIds), [filteredGroups, collapsedIds]);

  // Faixa de datas vem sempre dos dados inteiros (não filtrados), senão buscar
  // faria o eixo de tempo pular a cada tecla digitada.
  const { rangeStart, rangeEnd } = useMemo(() => {
    let min = null;
    let max = null;
    groups.forEach((g) =>
      g.tasks.forEach((t) => {
        [t, ...(t.children || [])].forEach((task) => {
          if (!task.start || !task.end) return;
          const s = parseISO(task.start);
          const e = parseISO(task.end);
          if (!min || s < min) min = s;
          if (!max || e > max) max = e;
        });
      })
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!min) min = addDays(today, -3);
    if (!max) max = addDays(today, 11);
    return { rangeStart: addDays(min, -3), rangeEnd: addDays(max, 3) };
  }, [groups]);

  const hasAnyData = groups.some((g) => g.tasks.length > 0);
  const dirty = dirtyIds.size > 0;

  async function handleSave() {
    if (!dirty || saving) return;
    const dirtyTasks = flattenTasks(groups).filter((task) => dirtyIds.has(task.id));
    setSaving(true);
    setSaveError(null);
    try {
      await onSave?.(dirtyTasks);
      setSavedGroups(groups);
      setDirtyIds(new Set());
    } catch (err) {
      setSaveError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleUndo() {
    if (!dirty) return;
    setGroups(savedGroups);
    setDirtyIds(new Set());
    setSaveError(null);
  }

  function handlePrint() {
    document.body.classList.add("gnt-printing");
    const limpar = () => {
      document.body.classList.remove("gnt-printing");
      window.removeEventListener("afterprint", limpar);
    };
    window.addEventListener("afterprint", limpar);
    window.print();
  }

  function handleExport() {
    const resolveStatus = (task) => {
      const meta = GANTT_STATUS[task.status] || GANTT_STATUS.notStarted;
      if (task.late) return t("gantt.status.lateFlag");
      return meta.labelKey ? t(meta.labelKey) : "";
    };
    const csv = buildGanttCsv(
      rows,
      [t("gantt.columns.group"), t("gantt.columns.activity"), t("gantt.columns.status"), t("gantt.columns.start"), t("gantt.columns.due")],
      resolveStatus
    );
    downloadCsv(`gantt-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  function handleAction(id) {
    if (readOnly && (id === "new" || id === "save" || id === "undo")) return;
    if (id === "new") return onNew?.();
    if (id === "open") return peekTask && onOpenSelected?.(peekTask);
    if (id === "save") return handleSave();
    if (id === "undo") return handleUndo();
    if (id === "print") return handlePrint();
    if (id === "export") return handleExport();
    if (id === "search") {
      setSearchOpen((prev) => {
        const next = !prev;
        if (!next) setSearchQuery("");
        return next;
      });
    }
  }

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  if (!hasAnyData) {
    return (
      <div className="view-scroll">
        <div className="view-placeholder">{t("gantt.emptyState")}</div>
      </div>
    );
  }

  return (
    <div className="gnt-root">
      <GanttToolbar
        zoomPct={Math.round((dayWidth / DAY_WIDTH_LEVELS[DEFAULT_ZOOM_INDEX]) * 100)}
        onZoomIn={() => setZoomIndex((i) => Math.min(i + 1, DAY_WIDTH_LEVELS.length - 1))}
        onZoomOut={() => setZoomIndex((i) => Math.max(i - 1, 0))}
        onZoomReset={() => setZoomIndex(DEFAULT_ZOOM_INDEX)}
        onAction={handleAction}
        dirty={dirty}
        saving={saving}
        hasSelection={!!peekTask}
        hasNew={!!onNew}
        searchOpen={searchOpen}
        readOnly={readOnly}
      />

      {searchOpen && (
        <div className="gnt-search-bar">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("gantt.toolbar.searchPlaceholder")}
          />
        </div>
      )}

      {saveError && <div className="gnt-save-error">{t("gantt.saveError", { erro: saveError })}</div>}

      {rows.length === 0 ? (
        <div className="gnt-body gnt-body-empty">
          <div className="view-placeholder">{t("gantt.noSearchResults")}</div>
        </div>
      ) : (
        <div className="gnt-body">
          <GanttSidebar rows={rows} onToggleGroup={toggleGroup} />
          <GanttTimeline
            rows={rows}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            dayWidth={dayWidth}
            tag={tag}
            onChangeTask={updateTask}
            onOpenTask={onTaskClick || setPeekTask}
            readOnly={readOnly}
          />
        </div>
      )}

      {!onTaskClick && peekTask && (
        <div className="gnt-peek">
          <div className="gnt-peek-title">{peekTask.title}</div>
          <div className="gnt-peek-dates">{peekTask.start} → {peekTask.end}</div>
          <button type="button" className="gnt-peek-close" onClick={() => setPeekTask(null)}>×</button>
        </div>
      )}

      <GanttLegend meta={meta} statusKeys={legendStatusKeys} iconKeys={legendIconKeys} />
    </div>
  );
}
