import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { flattenCards } from "../../utils/boardCards.js";
import { LABEL_COLORS } from "../../utils/labels.js";
import Avatar from "../Avatar.jsx";

// Cor fixa (não var(--accent)) para a barra "por membro" - escolha deliberada
// do design, no mesmo espírito das 5 tags de cor do Planejador: identidade da
// pessoa já vem do avatar (colorForUser), a barra é só a métrica, e um roxo
// consistente lê melhor numa lista de várias pessoas do que N cores brigando.
const MEMBER_BAR_COLOR = "#8b5cf6";

function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </svg>
  );
}
function IconCheckCircle() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.8 10A10 10 0 1 1 17 3.4" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
function IconTrendingUp() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

function isOverdue(iso) {
  if (!iso) return false;
  return new Date(iso + "T23:59:59").getTime() < Date.now();
}

// pctOfTotal alimenta o número que aparece por cima do total ao passar o
// mouse na linha (ver .dash-bar-value-wrap no CSS) - "percentual do total",
// não "percentual do maior item" (que é o que `max` já mede pra largura da
// barra); os dois números respondem perguntas diferentes.
function BarRow({ label, count, max, total, color, avatar, labelChip }) {
  const pct = max > 0 ? Math.max((count / max) * 100, count > 0 ? 4 : 0) : 0;
  const pctOfTotal = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="dash-bar-row" title={`${label}: ${count} (${pctOfTotal}%)`}>
      <div className="dash-bar-label">
        {avatar}
        {labelChip ? (
          <span className="dash-label-chip" style={{ "--chip-color": color }}>
            {label}
          </span>
        ) : (
          <span>{label}</span>
        )}
      </div>
      <div className="dash-bar-track">
        <div className="dash-bar-fill" style={{ width: pct + "%", background: color }} />
      </div>
      <div className="dash-bar-value-wrap">
        <span className="dash-bar-value">{count}</span>
        <span className="dash-bar-pct">{pctOfTotal}%</span>
      </div>
    </div>
  );
}

export default function DashboardView({ board, users, searchQuery, memberFilter }) {
  const { t } = useTranslation();
  const LABEL_NAMES = t("views.dashboard.labelNames", { returnObjects: true });
  const cards = useMemo(() => flattenCards(board), [board]);
  const filtered = cards.filter((c) => {
    const matchesSearch = !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMember = !memberFilter || (c.memberIds || []).includes(memberFilter);
    return matchesSearch && matchesMember;
  });

  const total = filtered.length;
  const completedCount = filtered.filter((c) => c.completed).length;
  const completionPct = total ? Math.round((completedCount / total) * 100) : 0;
  const overdueCount = filtered.filter((c) => c.due && !c.completed && isOverdue(c.due)).length;
  const unassignedCount = filtered.filter((c) => !(c.memberIds && c.memberIds.length)).length;

  const perList = board.lists.map((l) => ({
    id: l.id,
    title: l.title,
    count: filtered.filter((c) => c.listId === l.id).length,
  }));
  const maxListCount = Math.max(1, ...perList.map((l) => l.count));

  const perMember = users
    .map((u) => ({ ...u, count: filtered.filter((c) => (c.memberIds || []).includes(u.id)).length }))
    .filter((u) => u.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxMemberCount = Math.max(1, ...perMember.map((m) => m.count));

  const perLabel = LABEL_COLORS.map((l) => ({ ...l, count: filtered.filter((c) => c.labels.includes(l.id)).length })).filter(
    (l) => l.count > 0
  );
  const maxLabelCount = Math.max(1, ...perLabel.map((l) => l.count));

  return (
    <div className="view-scroll dash-view-scroll">
      <div className="dash-stats-row">
        <div className="dash-stat-tile">
          <span className="dash-stat-icon dash-stat-icon-neutral">
            <IconLayers />
          </span>
          <div className="dash-stat-label">{t("views.dashboard.totalCards")}</div>
          <div className="dash-stat-value">{total}</div>
        </div>
        <div className="dash-stat-tile">
          <span className="dash-stat-icon dash-stat-icon-green">
            <IconCheckCircle />
          </span>
          <div className="dash-stat-label">{t("views.dashboard.completed")}</div>
          <div className="dash-stat-value-row">
            <span className="dash-stat-value dash-stat-good">{completionPct}%</span>
            <span className="dash-stat-pill dash-stat-pill-green">
              {completedCount}/{total}
            </span>
          </div>
        </div>
        <div className="dash-stat-tile">
          <span className="dash-stat-icon dash-stat-icon-red">
            <IconClock />
          </span>
          <div className="dash-stat-label">{t("views.dashboard.overdue")}</div>
          <div className={"dash-stat-value" + (overdueCount > 0 ? " dash-stat-critical" : "")}>{overdueCount}</div>
        </div>
        <div className="dash-stat-tile">
          <span className="dash-stat-icon dash-stat-icon-neutral">
            <IconUser />
          </span>
          <div className="dash-stat-label">{t("views.dashboard.unassigned")}</div>
          <div className="dash-stat-value">{unassignedCount}</div>
        </div>
      </div>

      <div className="dash-meter-card">
        <div className="dash-meter-header">
          <span className="dash-meter-title">
            <IconTrendingUp />
            {t("views.dashboard.overallProgress")}
          </span>
          <span className="dash-meter-header-right">
            <span className="dash-meter-pct">{completionPct}%</span>
            <span className="dash-meter-fraction">
              {completedCount}/{total}
            </span>
          </span>
        </div>
        <div className="dash-meter-track">
          <div className="dash-meter-fill" style={{ width: completionPct + "%" }} />
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-card">
          <div className="dash-card-title">{t("views.dashboard.cardsByList")}</div>
          {perList.length === 0 && <div className="dash-empty">{t("views.dashboard.noLists")}</div>}
          {perList.map((l) => (
            <BarRow key={l.id} label={l.title} count={l.count} max={maxListCount} total={total} color="var(--accent)" />
          ))}
        </div>

        <div className="dash-card">
          <div className="dash-card-title">{t("views.dashboard.cardsByMember")}</div>
          {perMember.length === 0 && <div className="dash-empty">{t("views.dashboard.noAssigned")}</div>}
          {perMember.map((m) => (
            <BarRow
              key={m.id}
              label={m.name}
              count={m.count}
              max={maxMemberCount}
              total={total}
              color={MEMBER_BAR_COLOR}
              avatar={<Avatar id={m.id} name={m.name} avatarUrl={m.avatarUrl} className="avatar-small" />}
            />
          ))}
        </div>

        <div className="dash-card">
          <div className="dash-card-title">{t("views.dashboard.cardsByLabel")}</div>
          {perLabel.length === 0 && <div className="dash-empty">{t("views.dashboard.noLabels")}</div>}
          {perLabel.map((l) => (
            <BarRow
              key={l.id}
              label={LABEL_NAMES[l.id] || l.id}
              count={l.count}
              max={maxLabelCount}
              total={total}
              color={l.color}
              labelChip
            />
          ))}
        </div>
      </div>
    </div>
  );
}
