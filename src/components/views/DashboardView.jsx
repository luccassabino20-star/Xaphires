import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { flattenCards } from "../../utils/boardCards.js";
import { LABEL_COLORS } from "../../utils/labels.js";
import { initials, colorForUser } from "../../utils/members.js";

function isOverdue(iso) {
  if (!iso) return false;
  return new Date(iso + "T23:59:59").getTime() < Date.now();
}

function BarRow({ label, count, max, color, avatar }) {
  const pct = max > 0 ? Math.max((count / max) * 100, count > 0 ? 4 : 0) : 0;
  return (
    <div className="dash-bar-row" title={`${label}: ${count}`}>
      <div className="dash-bar-label">
        {avatar}
        <span>{label}</span>
      </div>
      <div className="dash-bar-track">
        <div className="dash-bar-fill" style={{ width: pct + "%", background: color }} />
      </div>
      <div className="dash-bar-value">{count}</div>
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
    <div className="view-scroll">
      <div className="dash-stats-row">
        <div className="dash-stat-tile">
          <div className="dash-stat-label">{t("views.dashboard.totalCards")}</div>
          <div className="dash-stat-value">{total}</div>
        </div>
        <div className="dash-stat-tile">
          <div className="dash-stat-label">{t("views.dashboard.completed")}</div>
          <div className="dash-stat-value dash-stat-good">{completionPct}%</div>
          <div className="dash-stat-sub">{completedCount} / {total}</div>
        </div>
        <div className="dash-stat-tile">
          <div className="dash-stat-label">{t("views.dashboard.overdue")}</div>
          <div className={"dash-stat-value" + (overdueCount > 0 ? " dash-stat-critical" : "")}>{overdueCount}</div>
        </div>
        <div className="dash-stat-tile">
          <div className="dash-stat-label">{t("views.dashboard.unassigned")}</div>
          <div className="dash-stat-value">{unassignedCount}</div>
        </div>
      </div>

      <div className="dash-meter-card">
        <div className="dash-meter-header">
          <span>{t("views.dashboard.overallProgress")}</span>
          <span>{completionPct}%</span>
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
            <BarRow key={l.id} label={l.title} count={l.count} max={maxListCount} color="#4d7ea8" />
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
              color={colorForUser(m.id)}
              avatar={
                <span className="avatar avatar-small" style={{ background: colorForUser(m.id) }}>
                  {initials(m.name)}
                </span>
              }
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
              color={l.color}
              avatar={<span className="card-label" style={{ background: l.color, width: 20 }} />}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
