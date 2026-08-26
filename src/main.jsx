import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./state/AuthContext.jsx";
import { ToastProvider } from "./state/ToastContext.jsx";
import { ThemeProvider } from "./state/ThemeContext.jsx";
import i18n from "./i18n/index.js";
import { normalizeLanguage, DEFAULT_LOCALE } from "./i18n/locale.js";
import { parseLocaleFromPath, pathForLocale } from "./i18n/urlLocale.js";
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
// Formulário público de pré-anamnese, aberto pelo PACIENTE a partir de um link
// de WhatsApp - sem login, sem os providers do app (mesmo isolamento do
// painel/demo acima). O componente extrai companyId/token do próprio path.
const AnamnesePublicPage = React.lazy(() => import("./modules/saude-clinicas/AnamnesePublicPage.jsx"));
// Link fixo de captação (mesmo isolamento acima): quem ainda não é paciente
// preenche e cria o próprio cadastro ao enviar - ver AnamneseCaptacaoPage.jsx.
const AnamneseCaptacaoPage = React.lazy(() => import("./modules/saude-clinicas/AnamneseCaptacaoPage.jsx"));
// Link fixo de agendamento online do Xaphires Beauty (Fase 4, mesmo
// isolamento acima): o visitante marca o próprio horário sem login.
const BeautyPublicBookingPage = React.lazy(() => import("./modules/xaphires-beauty/BeautyPublicBookingPage.jsx"));
// Protótipo visual "Xaphires Beauty" (produto separado do Xaphires real -
// ver comentário no topo de prototypes/xaphiresBeauty/featuresConfig.js).
// Mesmo isolamento do GanttChartDemo: sem login, sem dado real por trás.
const XaphiresBeautyPrototype = React.lazy(() => import("./prototypes/xaphiresBeauty/XaphiresBeautyPrototype.jsx"));

const path = window.location.pathname.replace(/\/+$/, "");
const ehPainel = path === "/admin";
const ehGanttDemo = path === "/gantt-demo";
const ehXaphiresBeauty = path === "/xaphires-beauty";
const anamnesePublicaMatch = path.match(/^\/anamnese\/([^/]+)\/([^/]+)$/);
const anamneseCaptacaoMatch = path.match(/^\/anamnese-novo\/([^/]+)$/);
const beautyAgendarMatch = path.match(/^\/beauty-agendar\/([^/]+)$/);

// Sem prefixo de idioma na URL (ex.: alguém chegou em "/" direto): alinha a
// URL com o idioma que o i18next já resolveu em i18n/index.js (localStorage
// salvo, ou Accept-Language do navegador na primeira visita) - só troca a
// URL, nunca o idioma em si, pra não conflitar com o que o LanguageDetector
// já decidiu. replaceState, não pushState, pra a detecção automática não
// empurrar uma entrada a mais no histórico (o botão "voltar" não deveria
// alternar idioma sozinho).
if (!ehPainel && !ehGanttDemo && !ehXaphiresBeauty && !anamnesePublicaMatch && !anamneseCaptacaoMatch && !beautyAgendarMatch) {
  const { locale: urlLocale, rest } = parseLocaleFromPath(path);
  if (!urlLocale) {
    const resolved = normalizeLanguage(i18n.language);
    if (resolved !== DEFAULT_LOCALE) {
      const novoPath = pathForLocale(resolved, rest) + window.location.search + window.location.hash;
      window.history.replaceState(null, "", novoPath);
    }
  }
}

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
    ) : ehXaphiresBeauty ? (
      <ThemeProvider>
        <Suspense fallback={null}>
          <XaphiresBeautyPrototype />
        </Suspense>
      </ThemeProvider>
    ) : anamnesePublicaMatch ? (
      <ThemeProvider>
        <Suspense fallback={null}>
          <AnamnesePublicPage companyId={anamnesePublicaMatch[1]} token={anamnesePublicaMatch[2]} />
        </Suspense>
      </ThemeProvider>
    ) : anamneseCaptacaoMatch ? (
      <ThemeProvider>
        <Suspense fallback={null}>
          <AnamneseCaptacaoPage slug={anamneseCaptacaoMatch[1]} />
        </Suspense>
      </ThemeProvider>
    ) : beautyAgendarMatch ? (
      <ThemeProvider>
        <Suspense fallback={null}>
          <BeautyPublicBookingPage slug={beautyAgendarMatch[1]} />
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
