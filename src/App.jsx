import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./state/AuthContext.jsx";
import { BoardProvider } from "./state/BoardContext.jsx";
import { UsersProvider } from "./state/UsersContext.jsx";
import { ChatProvider } from "./state/ChatContext.jsx";
import AuthScreen from "./screens/AuthScreen.jsx";
import LandingScreen from "./screens/LandingScreen.jsx";
import PlatformShell from "./PlatformShell.jsx";
import { syncSeoTags } from "./i18n/seo.js";
import { normalizeLanguage } from "./i18n/locale.js";

export default function App() {
  const { t, i18n } = useTranslation();
  const { loading, user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  // Uma vez no boot: a troca manual (LanguageSwitcher) já chama syncSeoTags
  // sozinha, isto cobre a primeira carga (URL com prefixo, ou detecção
  // automática que main.jsx já alinhou com a URL antes deste componente
  // montar).
  useEffect(() => {
    syncSeoTags(normalizeLanguage(i18n.language));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <div className="app-loading">{t("common.loading")}</div>;
  }
  if (!user) {
    if (!showAuth) return <LandingScreen onEnter={() => setShowAuth(true)} />;
    return <AuthScreen onBack={() => setShowAuth(false)} />;
  }

  return (
    <BoardProvider>
      <UsersProvider>
        <ChatProvider>
          <PlatformShell />
        </ChatProvider>
      </UsersProvider>
    </BoardProvider>
  );
}
