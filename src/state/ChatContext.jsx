import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as api from "./api.js";

const ChatContext = createContext(null);

// Espelha repo.js MAX_CHAT_BODY_LENGTH no servidor: só para limitar o campo antes
// de bater na API, a autoridade continua sendo a validação do lado de lá.
export const MAX_CHAT_BODY_LENGTH = 2000;

// Sem WebSocket no servidor (ver CLAUDE.md), então "tempo real" aqui é polling.
// O resumo das conversas (para o contador de não lidas) varre sempre, painel
// aberto ou fechado - é o que mantém o badge vivo sem custar caro, porque só traz
// a última mensagem de cada conversa, não o histórico inteiro. A conversa ativa
// varre rápido, mas só enquanto o painel está aberto.
const CONVERSATIONS_POLL_MS = 15000;
const ACTIVE_POLL_MS = 3000;

function keyFor(conversationId) {
  return conversationId || "general";
}

export function ChatProvider({ children }) {
  const [conversations, setConversations] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState(null); // null = geral
  const [messagesByKey, setMessagesByKey] = useState({});
  const [loadingActive, setLoadingActive] = useState(false);

  const lastIdByKey = useRef({});
  const loadedKeys = useRef(new Set());
  const openRef = useRef(open);
  openRef.current = open;
  const activeIdRef = useRef(activeConversationId);
  activeIdRef.current = activeConversationId;

  const refreshConversations = useCallback(async () => {
    try {
      const data = await api.listChatConversations();
      setConversations(data);
    } catch (err) {
      console.error("Falha ao buscar conversas do chat:", err);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
    const interval = setInterval(refreshConversations, CONVERSATIONS_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshConversations]);

  const markRead = useCallback(async (conversationId) => {
    const key = keyFor(conversationId);
    const lastMessageId = lastIdByKey.current[key] || null;
    setConversations((atual) => atual.map((c) => (keyFor(c.id) === key ? { ...c, unreadCount: 0 } : c)));
    try {
      await api.markChatRead(conversationId, lastMessageId);
    } catch (err) {
      console.error("Falha ao marcar o chat como lido:", err);
    }
  }, []);

  const loadHistory = useCallback(async (conversationId) => {
    const key = keyFor(conversationId);
    setLoadingActive(true);
    try {
      const data = await api.listChatMessages(conversationId);
      setMessagesByKey((atual) => ({ ...atual, [key]: data }));
      if (data.length > 0) lastIdByKey.current[key] = data[data.length - 1].id;
      loadedKeys.current.add(key);
    } catch (err) {
      console.error("Falha ao carregar o chat:", err);
    } finally {
      setLoadingActive(false);
    }
  }, []);

  const pollActive = useCallback(async () => {
    const conversationId = activeIdRef.current;
    const key = keyFor(conversationId);
    try {
      const novas = await api.listChatMessages(conversationId, lastIdByKey.current[key]);
      if (novas.length === 0) return;
      lastIdByKey.current[key] = novas[novas.length - 1].id;
      setMessagesByKey((atual) => ({ ...atual, [key]: [...(atual[key] || []), ...novas] }));
      if (openRef.current) markRead(conversationId);
    } catch (err) {
      console.error("Falha ao buscar mensagens do chat:", err);
    }
  }, [markRead]);

  // Ao abrir o painel, ou trocar de conversa com ele aberto: carrega o histórico se
  // ainda não tiver, e marca como lida na hora - não espera o próximo poll, senão o
  // badge ficaria aceso por até 3s depois da pessoa já estar olhando a conversa.
  useEffect(() => {
    if (!open) return;
    const key = keyFor(activeConversationId);
    if (!loadedKeys.current.has(key)) {
      loadHistory(activeConversationId).then(() => markRead(activeConversationId));
    } else {
      markRead(activeConversationId);
    }
  }, [open, activeConversationId, loadHistory, markRead]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(pollActive, ACTIVE_POLL_MS);
    return () => clearInterval(interval);
  }, [open, pollActive]);

  async function sendMessage(body) {
    const conversationId = activeConversationId;
    const created = await api.sendChatMessage(body, conversationId);
    const key = keyFor(conversationId);
    lastIdByKey.current[key] = created.id;
    setMessagesByKey((atual) => ({ ...atual, [key]: [...(atual[key] || []), created] }));
    // Sem isto a própria mensagem enviada ficava contando como não lida: nada mais
    // disparava markRead para ela, porque pollActive só marca lido quando encontra
    // mensagem NOVA vinda do poll, e esta já nasceu conhecida (lastIdByKey já
    // atualizado duas linhas acima).
    await markRead(conversationId);
    refreshConversations();
    return created;
  }

  async function startConversation(otherUserId) {
    const { id } = await api.createChatConversation(otherUserId);
    setActiveConversationId(id);
    await refreshConversations();
    return id;
  }

  function selectConversation(conversationId) {
    setActiveConversationId(conversationId || null);
  }

  function openChat() {
    setOpen(true);
  }
  function closeChat() {
    setOpen(false);
  }

  const totalUnread = conversations.reduce((n, c) => n + c.unreadCount, 0);
  const messages = messagesByKey[keyFor(activeConversationId)] || [];

  return (
    <ChatContext.Provider
      value={{
        conversations,
        open,
        activeConversationId,
        messages,
        loadingActive,
        totalUnread,
        openChat,
        closeChat,
        selectConversation,
        startConversation,
        sendMessage,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}
