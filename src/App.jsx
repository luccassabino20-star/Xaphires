import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./state/AuthContext.jsx";
import { BoardProvider } from "./state/BoardContext.jsx";
import { UsersProvider } from "./state/UsersContext.jsx";
import { ChatProvider } from "./state/ChatContext.jsx";
import AuthScreen from "./screens/AuthScreen.jsx";
import LandingScreen from "./screens/LandingScreen.jsx";
import PlatformShell from "./PlatformShell.jsx";

export default function App() {
  const { t } = useTranslation();
  const { loading, user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

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
