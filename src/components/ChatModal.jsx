import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useChat, MAX_CHAT_BODY_LENGTH } from "../state/ChatContext.jsx";
import { useUsers } from "../state/UsersContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { translateError } from "../utils/errors.js";
import { initials, colorForUser } from "../utils/members.js";

export default function ChatModal({ onClose }) {
  const { t, i18n } = useTranslation();
  const {
    conversations,
    activeConversationId,
    selectConversation,
    startConversation,
    messages,
    loadingActive,
    sendMessage,
  } = useChat();
  const { users } = useUsers();
  const { user } = useAuth();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [picking, setPicking] = useState(false);
  const [busca, setBusca] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, activeConversationId]);

  function nomeDe(authorId) {
    if (authorId === user.id) return t("chat.you");
    return users.find((u) => u.id === authorId)?.name || t("chat.unknownAuthor");
  }
  function horaDe(iso) {
    return new Date(iso).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
  }
  function tituloConversa(conv) {
    if (conv.kind === "general") return t("chat.generalTitle");
    return users.find((u) => u.id === conv.otherUserId)?.name || t("chat.unknownAuthor");
  }

  // Quem já tem conversa direta some da lista de candidatos - reabrir é clicar na
  // conversa já existente, não criar outra.
  const candidatos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const jaConversando = new Set(conversations.filter((c) => c.kind === "direct").map((c) => c.otherUserId));
    return users
      .filter((u) => u.id !== user.id && !jaConversando.has(u.id))
      .filter((u) => !termo || u.name.toLowerCase().includes(termo));
  }, [users, user.id, conversations, busca]);

  async function escolher(u) {
    try {
      await startConversation(u.id);
      setPicking(false);
      setBusca("");
    } catch (err) {
      setErro(translateError(err, t));
    }
  }

  async function enviar(e) {
    e.preventDefault();
    const corpo = texto.trim();
    if (!corpo || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await sendMessage(corpo);
      setTexto("");
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal chat-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>
        <div className="modal-header">
          <h2 className="members-modal-title">{t("chat.title")}</h2>
        </div>
        <div className="chat-body">
          <div className="chat-sidebar">
            <button className="btn-ghost btn-small chat-new-btn" onClick={() => setPicking((p) => !p)}>
              {t("chat.newConversation")}
            </button>
            {picking && (
              <div className="chat-picker">
                <input
                  type="text"
                  className="share-search"
                  placeholder={t("board.share.searchPlaceholder")}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  autoFocus
                />
                <ul className="chat-picker-list">
                  {candidatos.length === 0 && <li className="share-empty">{t("chat.noCandidates")}</li>}
                  {candidatos.map((u) => (
                    <li key={u.id} className="chat-picker-item" onClick={() => escolher(u)}>
                      <span className="avatar avatar-small" style={{ background: colorForUser(u.id) }}>
                        {initials(u.name)}
                      </span>
                      <span>{u.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="chat-conversation-list">
              {conversations.map((conv) => {
                const active = (conv.id || null) === (activeConversationId || null);
                const titulo = tituloConversa(conv);
                return (
                  <li
                    key={conv.id || "general"}
                    className={"chat-conversation-item" + (active ? " active" : "")}
                    onClick={() => selectConversation(conv.id)}
                  >
                    {conv.kind === "direct" ? (
                      <span className="avatar avatar-small" style={{ background: colorForUser(conv.otherUserId) }}>
                        {initials(titulo)}
                      </span>
                    ) : (
                      <span className="avatar avatar-small chat-general-icon">#</span>
                    )}
                    <span className="chat-conversation-info">
                      <span className="chat-conversation-name">{titulo}</span>
                      {conv.lastMessage && <span className="chat-conversation-preview">{conv.lastMessage.body}</span>}
                    </span>
                    {conv.unreadCount > 0 && (
                      <span className="chat-unread-pill">{conv.unreadCount > 9 ? "9+" : conv.unreadCount}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="chat-main">
            <div className="chat-messages" ref={scrollRef}>
              {loadingActive && <div className="share-empty">{t("common.loading")}</div>}
              {!loadingActive && messages.length === 0 && <div className="share-empty">{t("chat.empty")}</div>}
              {messages.map((m) => {
                const mine = m.authorId === user.id;
                return (
                  <div key={m.id} className={"chat-message" + (mine ? " chat-message-mine" : "")}>
                    {!mine && (
                      <span className="avatar avatar-small" style={{ background: colorForUser(m.authorId) }}>
                        {initials(nomeDe(m.authorId))}
                      </span>
                    )}
                    <div className="chat-bubble">
                      {!mine && <div className="chat-bubble-author">{nomeDe(m.authorId)}</div>}
                      <div className="chat-bubble-body">{m.body}</div>
                      <div className="chat-bubble-time">{horaDe(m.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {erro && <div className="auth-error">{erro}</div>}
            <form className="chat-input-row" onSubmit={enviar}>
              <input
                type="text"
                className="chat-input"
                placeholder={t("chat.placeholder")}
                value={texto}
                maxLength={MAX_CHAT_BODY_LENGTH}
                onChange={(e) => setTexto(e.target.value)}
                autoFocus
              />
              <button className="btn-primary btn-small" type="submit" disabled={enviando || !texto.trim()}>
                {t("chat.send")}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
