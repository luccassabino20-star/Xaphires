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

const ehPainel = window.location.pathname.replace(/\/+$/, "") === "/admin";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {ehPainel ? (
      <Suspense fallback={<div className="adm-carregando">Carregando painel...</div>}>
        <AdminApp />
      </Suspense>
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
