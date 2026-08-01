import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMinutes } from "../state/MinutesContext.jsx";
import { useUsers } from "../state/UsersContext.jsx";
import { initials, colorForUser } from "../utils/members.js";
import { localeTag } from "../i18n/locale.js";
import MinuteModal from "../components/MinuteModal.jsx";
import MinutesGanttView from "../components/views/MinutesGanttView.jsx";

export default function MinutesScreen({ onToggleSidebar }) {
  const { t, i18n } = useTranslation();
  const { minutes, loading } = useMinutes();
  const { users } = useUsers();
  const [openId, setOpenId] = useState(undefined); // undefined = closed, null = new, string = editing
  const [view, setView] = useState("list"); // "list" | "gantt"

  function formatDate(iso) {
    if (!iso) return "-";
    return new Date(iso + "T00:00:00").toLocaleDateString(localeTag(i18n.language));
  }

  function authorName(authorId) {
    return users.find((u) => u.id === authorId)?.name || "-";
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-btn" onClick={onToggleSidebar} title={t("app.topbar.toggleSidebar")} aria-label={t("app.topbar.menu")}>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
            </svg>
          </button>
          <span className="board-title minutes-screen-title">{t("minutes.screen.title")}</span>
        </div>
        <div className="topbar-right">
          <button className="btn-primary" onClick={() => setOpenId(null)}>
            {t("minutes.screen.newMinute")}
          </button>
        </div>
      </header>

      <nav className="view-tabs">
        <button className={"view-tab" + (view === "list" ? " active" : "")} onClick={() => setView("list")}>
          {t("minutes.screen.viewList")}
        </button>
        <button className={"view-tab" + (view === "gantt" ? " active" : "")} onClick={() => setView("gantt")}>
          {t("minutes.screen.viewGantt")}
        </button>
      </nav>

      {loading && (
        <div className="view-scroll minutes-scroll">
          <div className="empty-state">{t("minutes.screen.loading")}</div>
        </div>
      )}

      {!loading && view === "list" && (
        <div className="view-scroll minutes-scroll">
          {minutes.length === 0 && <div className="empty-state">{t("minutes.screen.empty")}</div>}
          {minutes.length > 0 && (
            <div className="minutes-list">
              {minutes.map((m) => (
                <button key={m.id} className="minutes-row" onClick={() => setOpenId(m.id)}>
                  <span className="minutes-row-date">{formatDate(m.date)}</span>
                  <span className="minutes-row-title">{m.title}</span>
                  <span className="minutes-row-author">
                    <span className="avatar avatar-small" style={{ background: colorForUser(m.authorId) }}>
                      {initials(authorName(m.authorId))}
                    </span>
                    {authorName(m.authorId)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && view === "gantt" && (
        <MinutesGanttView onNewMinute={() => setOpenId(null)} onOpenMinute={(id) => setOpenId(id)} />
      )}

      {openId !== undefined && <MinuteModal minuteId={openId} onClose={() => setOpenId(undefined)} />}
    </>
  );
}
