import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import AccountMenu from "../components/AccountMenu.jsx";
import LanguageSwitcher from "../components/LanguageSwitcher.jsx";
import ProfileModal from "../components/ProfileModal.jsx";
import ModuleIcon from "./ModuleIcon.jsx";
import LauncherSidebarIcon from "./LauncherSidebarIcon.jsx";
import { metaFor } from "./registry.js";
import { WHATSAPP_VENDAS_URL } from "../utils/contact.js";

// Estrutura da sidebar pedida pelo cliente, replicando a referência (Viver de
// IA) item a item. Só "solucoes" (a grade de módulos, abaixo) e "perfil" (o
// modal que já existe no AccountMenu) apontam pra algo real hoje - o resto é
// vitrine "Em breve", mesmo padrão que o rail do Sidebar.jsx já usa para
// atalhos ainda não construídos. Ligar um item novo é trocar seu "action".
const SIDEBAR_GROUPS = [
  { key: "learn", items: ["dashboard", "consultor", "solucoes", "formacao", "mentorias"] },
  { key: "tools", items: ["builder", "ferramentas", "certificados"] },
  { key: "account", items: ["metricas", "perfil", "atualizacoes"] },
];

// Abas de categoria da barra de Soluções, na mesma ordem da referência. Só
// entram como filtro clicável as que têm pelo menos um módulo real hoje
// (calculado em ModuleLauncher a partir de MODULE_META.category) - o resto
// (Marketing, Atendimento, Saúde & Clínicas, RH, Modelos de IA, Jurídico) fica
// com o selo "Em breve": o Xaphires não tem pilar nessas áreas ainda, e uma
// aba que abre vazia pareceria bug, não "em construção".
const CATEGORIES = ["todas", "vendas", "marketing", "atendimento", "saude", "rh", "ia", "financeiro", "juridico", "outros"];

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

  // Categoria só é clicável se algum módulo real já mora nela - ver comentário
  // de CATEGORIES acima.
  const categoriasComConteudo = useMemo(() => {
    const set = new Set(["todas"]);
    modules.forEach((m) => set.add(metaFor(m.id).category));
    return set;
  }, [modules]);

  const modulesFiltrados = useMemo(() => {
    const q = normalizar(query.trim());
    let lista = modules.filter((m) => {
      const meta = metaFor(m.id);
      if (activeCategory !== "todas" && meta.category !== activeCategory) return false;
      if (!q) return true;
      return normalizar(t(meta.labelKey)).includes(q) || normalizar(t(meta.descKey)).includes(q);
    });
    if (sortBy === "az") {
      lista = [...lista].sort((a, b) => t(metaFor(a.id).labelKey).localeCompare(t(metaFor(b.id).labelKey), "pt"));
    }
    return lista;
  }, [modules, query, activeCategory, sortBy, t]);

  function abrirItemSidebar(id) {
    if (id === "perfil") setProfileOpen(true);
    // "solucoes" já é a própria tela (sem navegação); os demais itens ainda
    // não têm destino - o botão fica desabilitado com o selo "Em breve".
  }

  return (
    <div className="launcher-shell">
      <aside className="launcher-sidebar">
        <div className="launcher-sidebar-brand">
          <span className="landing-nav-icon">X</span>
          <span>{t("auth.brandTitle")}</span>
        </div>
        <nav className="launcher-sidebar-nav">
          {SIDEBAR_GROUPS.map((group) => (
            <div className="launcher-sidebar-group" key={group.key}>
              <span className="launcher-sidebar-group-title">{t(`modules.launcher.sidebar.groups.${group.key}`)}</span>
              {group.items.map((item) => {
                const active = item === "solucoes";
                const real = active || item === "perfil";
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
          ))}
        </nav>
      </aside>

      <div className="launcher-main">
        <header className="launcher-top">
          <div className="launcher-top-actions">
            <LanguageSwitcher />
            <AccountMenu />
          </div>
        </header>

        <div className="launcher-body">
          <span className="launcher-eyebrow">{t("modules.launcher.eyebrow")}</span>
          <h1 className="launcher-title">{t("modules.launcher.title", { name: user?.name || "" })}</h1>
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
                return (
                  <button
                    key={m.id}
                    className={"module-card" + (clickable ? "" : " module-card-locked")}
                    style={{ "--module-accent": meta.accent }}
                    onClick={clickable ? () => onOpen(m.id) : undefined}
                    disabled={!clickable}
                    title={clickable ? undefined : t("modules.comingSoon")}
                  >
                    <span className="module-card-icon">
                      <ModuleIcon name={meta.icon} size={22} />
                    </span>
                    <span className="module-card-name">{t(meta.labelKey)}</span>
                    <span className="module-card-desc">{t(meta.descKey)}</span>
                    <span className="module-card-footer">
                      {clickable ? (
                        <span className="module-card-open">
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
            <span className="module-card-icon">
              <ModuleIcon name="custom" size={22} />
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
      </div>

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
