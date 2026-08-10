import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./state/AuthContext.jsx";
import { ToastProvider } from "./state/ToastContext.jsx";
import { ThemeProvider } from "./state/ThemeContext.jsx";
import "./i18n/index.js";
import "./index.css";

// O painel de plataforma é outra aplicação, servida no mesmo endereço sob /admin.
//
// Carregado por lazy de propósito: é ferramenta interna, usada por um punhado de
// pessoas, e não pode entrar no pacote que todo cliente baixa. O import dinâmico
// faz o Vite separá-lo num pedaço próprio, buscado só quando alguém abre /admin.
//
// Nada dos provedores do app envolve o painel — nem AuthProvider, nem i18n, nem
// tema. São duas sessões distintas, e compartilhar contexto convidaria a confundir
// "usuário logado" com "administrador logado".
const AdminApp = React.lazy(() => import("./admin/AdminApp.jsx"));
// Página isolada para olhar o componente de Gantt genérico (src/components/gantt)
// sem precisar de login - ele não lê nenhum dado real do app, então não faz
// sentido pendurar a rota atrás de AuthProvider. Mesmo padrão de lazy load do
// painel: ninguém além de quem for testar/integrar isto abre esse caminho.
const GanttChartDemo = React.lazy(() => import("./components/gantt/GanttChartDemo.jsx"));

const path = window.location.pathname.replace(/\/+$/, "");
const ehPainel = path === "/admin";
const ehGanttDemo = path === "/gantt-demo";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {ehPainel ? (
      <Suspense fallback={<div className="adm-carregando">Carregando painel...</div>}>
        <AdminApp />
      </Suspense>
    ) : ehGanttDemo ? (
      <ThemeProvider>
        <Suspense fallback={null}>
          <GanttChartDemo />
        </Suspense>
      </ThemeProvider>
    ) : (
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    )}
  </React.StrictMode>
);
