import { lazy, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import LanguageSwitcher from "../components/LanguageSwitcher.jsx";
// Mesma Central de Perfil que AccountMenu.jsx usa em todo o resto do app -
// lazy pelo mesmo motivo de lá (métricas/preferências pesam mais que o modal
// simples que ela substituiu).
const ProfileHubModal = lazy(() => import("../components/ProfileHubModal.jsx"));
import ModuleIcon from "./ModuleIcon.jsx";
import LauncherSidebarIcon from "./LauncherSidebarIcon.jsx";
import MainDashboardView from "./MainDashboardView.jsx";
import { metaFor } from "./registry.js";
import { WHATSAPP_VENDAS_URL } from "../utils/contact.js";
import xaphiresLogo from "../assets/xaphires-logo.png";

// Estrutura da sidebar pedida pelo cliente, replicando a referência (Viver de
// IA) item a item. "dashboard" e "solucoes" são as duas VISTAS reais da tela
// principal (ver estado `vista` abaixo, e VISTAS_REAIS); "perfil" abre o
// modal que já existe no AccountMenu. O resto é vitrine "Em breve", mesmo
// padrão que o rail do Sidebar.jsx já usa para atalhos ainda não construídos.
// Formação/Mentorias/Certificados saíram da lista (pedido do cliente: menu
// principal só com o que tem alguma chance de virar link nos próximos passos
// do produto, não vitrine indefinida) - ver ehItemReal() para o que decide
// título de grupo escondido.
const SIDEBAR_GROUPS = [
  { key: "learn", items: ["dashboard", "consultor", "solucoes"] },
  { key: "tools", items: ["builder", "ferramentas"] },
  { key: "account", items: ["metricas", "perfil", "atualizacoes"] },
];

// "dashboard" e "solucoes" trocam o conteúdo principal (ver `vista`); "perfil"
// abre modal por cima, sem trocar vista nenhuma.
const VISTAS_REAIS = ["dashboard", "solucoes"];

// Único ponto que decide "item real" (clicável) vs. vitrine "Em breve" - usado
// tanto para desenhar o botão quanto para decidir se o título do grupo
// aparece (grupo sem nenhum item real esconde o título, ver JSX abaixo).
function ehItemReal(item) {
  return VISTAS_REAIS.includes(item) || item === "perfil";
}

// Abas de categoria da barra de Soluções, na mesma ordem da referência. Só
// entram como filtro clicável as que têm pelo menos um módulo real hoje
// (calculado em ModuleLauncher a partir de MODULE_META.category) - o resto
// (Atendimento, Saúde & Clínicas, RH, Modelos de IA) fica com o selo "Em
// breve": o Xaphires não tem pilar nessas áreas ainda, e uma aba que abre
// vazia pareceria bug, não "em construção".
//
// Marketing e Jurídico não têm aba própria de propósito - a barra não pode
// crescer sem limite (linha única, sem rolagem lateral pedida pelo cliente),
// então categoria com pouco uso entra direto em "outros". Qualquer categoria
// nova que apareça em registry.js e não estiver nesta lista cai em "outros"
// pelo mesmo motivo (ver categoriaDaAba abaixo) - crescer esta lista é decisão
// consciente, não automática. Os dois continuam visíveis como cartão dentro de
// "outros" (ver PILARES_PLACEHOLDER, abaixo) - só a aba própria que sumiu.
const CATEGORIES = ["todas", "vendas", "atendimento", "saude", "rh", "ia", "financeiro", "outros"];

// Categoria do módulo (registry.js) que não tem aba própria em CATEGORIES cai
// em "outros" - é o que evita a barra ganhar uma aba nova (e a rolagem
// lateral) a cada categoria que MODULE_META passar a usar.
function categoriaDaAba(category) {
  return CATEGORIES.includes(category) ? category : "outros";
}

// Pilares sem módulo real (não vêm de server/modules.js) que o cliente pediu
// para continuar aparecendo - entram como cartão travado dentro de "outros",
// mesmo tratamento visual de um módulo real ainda não habilitado (badge "Em
// breve", sem onClick). category "outros" já vem de MODULE_META; aqui só se
// fabrica o objeto no formato que o resto do componente espera de `modules`.
const PILARES_PLACEHOLDER = ["marketing", "juridico"].map((id) => ({ id, enabled: false }));

// Segunda linha da barra: só "todas" tem lista por trás (é a própria grade).
// "Minhas soluções"/"Favoritas" exigiriam favoritar/rastrear uso por módulo,
// recurso que não existe - ficam desabilitadas com "Em breve", em vez de
// fingir que filtram algo.
const VIEWS = ["todas", "minhas", "favoritas"];

// "Recentes" é a ordem que o servidor já manda (rank dos pilares); "A-Z" é
// alfabética de verdade. "Mais implementadas" exigiria uma métrica de adoção
// entre empresas que o Xaphires não calcula - fica desabilitada.
const SORTS = ["recentes", "az", "implementadas"];

function normalizar(texto) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Home da plataforma: um card por pilar. Módulo liberado (enabled) abre; módulo
// só de vitrine mostra "Em breve" e não é clicável. A decisão de enabled vem
// pronta do servidor (server/modules.js) — aqui só se desenha o que veio.
export default function ModuleLauncher({ modules, onOpen }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("todas");
  const [sortBy, setSortBy] = useState("recentes");
  // Vista principal do Hub: "dashboard" (resumo executivo) ou "solucoes" (a
  // grade de módulos, comportamento de sempre). Nasce em "dashboard" - é o
  // item do topo do menu, e agora é uma tela real, não só vitrine.
  const [vista, setVista] = useState("dashboard");

  // Módulos vindos do servidor + os pilares sem módulo real (Marketing,
  // Jurídico) que ainda assim precisam de cartão - ver PILARES_PLACEHOLDER.
  const todosOsModulos = useMemo(() => [...modules, ...PILARES_PLACEHOLDER], [modules]);

  // Categoria só é clicável se algum módulo real já mora nela - ver comentário
  // de CATEGORIES acima.
  const categoriasComConteudo = useMemo(() => {
    const set = new Set(["todas"]);
    todosOsModulos.forEach((m) => set.add(categoriaDaAba(metaFor(m.id).category)));
    return set;
  }, [todosOsModulos]);

  const modulesFiltrados = useMemo(() => {
    const q = normalizar(query.trim());
    let lista = todosOsModulos.filter((m) => {
      const meta = metaFor(m.id);
      if (activeCategory !== "todas" && categoriaDaAba(meta.category) !== activeCategory) return false;
      if (!q) return true;
      return normalizar(t(meta.labelKey)).includes(q) || normalizar(t(meta.descKey)).includes(q);
    });
    if (sortBy === "az") {
      lista = [...lista].sort((a, b) => t(metaFor(a.id).labelKey).localeCompare(t(metaFor(b.id).labelKey), "pt"));
    }
    return lista;
  }, [todosOsModulos, query, activeCategory, sortBy, t]);

  function abrirItemSidebar(id) {
    if (id === "perfil") setProfileOpen(true);
    else if (VISTAS_REAIS.includes(id)) setVista(id);
    // os demais itens ainda não têm destino - o botão fica desabilitado com
    // o selo "Em breve".
  }

  return (
    <div className="launcher-shell">
      <aside className="launcher-sidebar">
        <div className="launcher-sidebar-brand">
          <img className="landing-nav-icon" src={xaphiresLogo} alt="Xaphires" />
          <span>{t("auth.brandTitle")}</span>
        </div>
        <nav className="launcher-sidebar-nav">
          {SIDEBAR_GROUPS.map((group) => {
            const temItemReal = group.items.some(ehItemReal);
            return (
            <div className="launcher-sidebar-group" key={group.key}>
              {temItemReal && (
                <span className="launcher-sidebar-group-title">{t(`modules.launcher.sidebar.groups.${group.key}`)}</span>
              )}
              {group.items.map((item) => {
                const active = item === vista;
                const real = ehItemReal(item);
                return (
                  <button
                    type="button"
                    key={item}
                    className={"launcher-sidebar-item" + (active ? " active" : "") + (real ? "" : " disabled")}
                    onClick={real ? () => abrirItemSidebar(item) : undefined}
                    disabled={!real}
                    title={real ? undefined : t("modules.comingSoon")}
                  >
                    <LauncherSidebarIcon name={item} />
                    <span className="launcher-sidebar-item-label">{t(`modules.launcher.sidebar.items.${item}`)}</span>
                    {!real && <span className="launcher-sidebar-badge">{t("modules.comingSoon")}</span>}
                  </button>
                );
              })}
            </div>
            );
          })}
        </nav>

        <div className="launcher-sidebar-footer">
          <LanguageSwitcher className="launcher-sidebar-lang" />
          <span className="launcher-sidebar-lang-label">{t("language.title")}</span>
        </div>
      </aside>

      <div className="launcher-main">

        {vista === "dashboard" && <MainDashboardView modules={modules} onOpenModule={onOpen} />}

        {vista === "solucoes" && (
        <div className="launcher-body">
          <div className="launcher-heading-row">
            <div>
              <span className="launcher-eyebrow">{t("modules.launcher.eyebrow")}</span>
              <h1 className="launcher-title">{t("modules.launcher.title", { name: user?.name || "" })}</h1>
            </div>
            {/* Mesmo destino de vendas do card/banner "sob medida" abaixo - não existe
                página de documentação no produto, então o link auxiliar do canto
                superior direito (pedido no redesign do launcher) aponta pra um
                destino real em vez de uma "documentação" que não existe. */}
            <a className="launcher-heading-link" href={WHATSAPP_VENDAS_URL} target="_blank" rel="noopener noreferrer">
              {t("modules.launcher.headingLink")}
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
          <p className="launcher-subtitle">{t("modules.launcher.subtitle")}</p>

          <div className="launcher-toolbar">
            <div className="launcher-category-row">
              {CATEGORIES.map((cat) => {
                const hasContent = categoriasComConteudo.has(cat);
                return (
                  <button
                    type="button"
                    key={cat}
                    className={"launcher-category-tab" + (activeCategory === cat ? " active" : "")}
                    onClick={hasContent ? () => setActiveCategory(cat) : undefined}
                    disabled={!hasContent}
                    title={hasContent ? undefined : t("modules.comingSoon")}
                  >
                    {t(`modules.launcher.categories.${cat}`)}
                  </button>
                );
              })}
              <button type="button" className="launcher-category-tab launcher-more-filters" disabled title={t("modules.comingSoon")}>
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                {t("modules.launcher.moreFilters")}
              </button>
            </div>

            <div className="launcher-view-row">
              <div className="launcher-view-tabs">
                {VIEWS.map((view) => (
                  <button
                    type="button"
                    key={view}
                    className={"launcher-view-tab" + (view === "todas" ? " active" : "")}
                    disabled={view !== "todas"}
                    title={view === "todas" ? undefined : t("modules.comingSoon")}
                  >
                    {t(`modules.launcher.views.${view}`)}
                  </button>
                ))}
              </div>
              <div className="launcher-view-meta">
                <span className="launcher-result-count">{t("modules.launcher.resultCount", { count: modulesFiltrados.length })}</span>
                <label className="launcher-search">
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <path d="m21 21-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("modules.launcher.searchPlaceholder")}
                  />
                </label>
              </div>
            </div>

            <div className="launcher-sort-row">
              <span className="launcher-sort-label">{t("modules.launcher.sortLabel")}</span>
              {SORTS.map((sort, i) => (
                <span className="launcher-sort-item" key={sort}>
                  {i > 0 && <span className="launcher-sort-divider" aria-hidden="true" />}
                  <button
                    type="button"
                    className={"launcher-sort-btn" + (sortBy === sort ? " active" : "")}
                    onClick={sort !== "implementadas" ? () => setSortBy(sort) : undefined}
                    disabled={sort === "implementadas"}
                    title={sort === "implementadas" ? t("modules.comingSoon") : undefined}
                  >
                    {t(`modules.launcher.sorts.${sort}`)}
                  </button>
                </span>
              ))}
            </div>
          </div>

          {modulesFiltrados.length === 0 ? (
            <p className="launcher-no-results">{t("modules.launcher.noResults", { query })}</p>
          ) : (
            <div className="launcher-grid">
              {modulesFiltrados.map((m) => {
                const meta = metaFor(m.id);
                const clickable = m.enabled;
                // tagKey é o rótulo específico do card (ver comentário em
                // registry.js) - sem ele, cai no rótulo da própria categoria
                // de filtro, como antes.
                const categoria = meta.tagKey ? t(meta.tagKey) : t(`modules.launcher.categories.${categoriaDaAba(meta.category)}`);
                return (
                  <button
                    key={m.id}
                    className={"module-card" + (clickable ? "" : " module-card-locked")}
                    style={{ "--module-accent": meta.accent }}
                    onClick={clickable ? () => onOpen(m.id) : undefined}
                    disabled={!clickable}
                    title={clickable ? undefined : t("modules.comingSoon")}
                  >
                    <span className="module-card-head">
                      <span className="hub-card-icon">
                        <ModuleIcon name={meta.icon} size={22} />
                      </span>
                      <span className="module-card-tags">
                        <span className="module-card-tag">{categoria}</span>
                      </span>
                    </span>
                    <span className="module-card-name">{t(meta.labelKey)}</span>
                    <span className="module-card-desc">{t(meta.descKey)}</span>
                    <span className="module-card-footer">
                      {clickable ? (
                        <span className="module-card-open">
                          {t("modules.launcher.openCta")}
                          <svg viewBox="0 0 24 24" width="15" height="15">
                            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </span>
                      ) : (
                        <span className="module-card-badge">{t("modules.comingSoon")}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Não é um módulo do servidor (não tem plano nem componente por trás) -
              é a vitrine de serviço sob medida, sempre presente (não some com a
              busca), linkando pro mesmo WhatsApp de vendas da landing. Por isso é
              <a>, não <button> com onOpen: sai do app em vez de trocar de módulo. */}
          <a
            className="module-card module-card-custom"
            style={{ "--module-accent": "#101f47" }}
            href={WHATSAPP_VENDAS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="module-card-head">
              <span className="hub-card-icon">
                <ModuleIcon name="custom" size={22} />
              </span>
            </span>
            <span className="module-card-name">{t("modules.custom.name")}</span>
            <span className="module-card-desc">{t("modules.custom.desc")}</span>
            <span className="module-card-footer">
              <span className="module-card-seal">{t("modules.custom.seal")}</span>
            </span>
          </a>

          {/* Banner de CTA no rodapé, mesmo link de vendas do card acima - reforça o
              convite pra quem rolou a página inteira sem clicar no card. */}
          <div className="launcher-cta-banner">
            <div className="launcher-cta-text">
              <h2 className="launcher-cta-title">{t("modules.custom.bannerTitle")}</h2>
              <p className="launcher-cta-subtitle">{t("modules.custom.bannerText")}</p>
            </div>
            <a className="btn-primary launcher-cta-btn" href={WHATSAPP_VENDAS_URL} target="_blank" rel="noopener noreferrer">
              {t("modules.custom.bannerCta")}
            </a>
          </div>
        </div>
        )}
      </div>

      {profileOpen && (
        <Suspense fallback={null}>
          <ProfileHubModal onClose={() => setProfileOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
