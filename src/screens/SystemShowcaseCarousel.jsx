import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ModuleIcon from "../modules/ModuleIcon.jsx";

// Prints da interface do sistema, carrossel da home (ver InterfaceShowcase,
// abaixo). Preencha "src" com o caminho do arquivo (ex.: "/images/screenshot1.png",
// dentro de public/) quando tiver os prints prontos - enquanto "src" estiver
// vazio, o slide mostra um placeholder escuro numerado no lugar da imagem.
// O primeiro slide é a exceção: "mock" troca o placeholder por
// SystemShowcaseMock, uma UI estática desenhada em JSX/CSS (sem rota, sem
// estado real) só pra ilustrar a interface na landing enquanto não há print
// de verdade - ver comentário na própria função, abaixo.
// Chave de cada slide dobra de id de tradução do título na barra da janela
// (ver landing.showcase.slides.<key> nos locales) - por isso os nomes batem
// com os módulos reais que cada print vai mostrar, não "slide-1/2/3/4".
const interfaceScreenshots = [
  { key: "quadro", src: "", mock: true },
  { key: "financeiro", src: "" },
  { key: "saude", src: "" },
  { key: "vendas", src: "" },
];

// UI demonstrativa estática (dummy component): reproduz o "estilo dock"
// pedido pra landing - rail preto compacto com pílula âmbar em brilho no item
// ativo, topbar com seletor de workspace + busca, abas em pílula, colunas de
// cartões com barra de cor na base, e um drawer flutuante à direita. É só uma
// "foto" da interface pra vitrine: sem onClick, sem estado do quadro de
// verdade, sem rota - todo texto é fixo em português mesmo fora do locale
// pt (mesma lógica de um print de tela real: não teria como traduzir uma
// imagem por idioma, então esta também não tenta). Ícones reaproveitam
// ModuleIcon (mesmo desenho do rail e do launcher de verdade) só pra bater
// com a marca - o resto do conteúdo (nomes de coluna, cartões) é ilustrativo.
function SystemShowcaseMock() {
  const columns = [
    {
      title: "A Fazer",
      accent: "sky",
      cards: [
        { lines: 2, accent: "sky" },
        { lines: 1, accent: "amber" },
      ],
    },
    {
      title: "Em andamento",
      accent: "amber",
      cards: [{ lines: 2, accent: "amber" }],
    },
    {
      title: "Concluído",
      accent: "success",
      cards: [
        { lines: 1, accent: "success" },
        { lines: 1, accent: "success" },
      ],
    },
  ];

  return (
    <div className="landing-mock" aria-hidden="true">
      <aside className="landing-mock-dock">
        <span className="landing-mock-dock-logo">X</span>
        <nav className="landing-mock-dock-nav">
          <span className="landing-mock-dock-item active">
            <ModuleIcon name="quadro" size={16} />
          </span>
          <span className="landing-mock-dock-item">
            <ModuleIcon name="vendas" size={16} />
          </span>
          <span className="landing-mock-dock-item">
            <ModuleIcon name="layers" size={16} />
          </span>
          <span className="landing-mock-dock-item">
            <ModuleIcon name="saude" size={16} />
          </span>
        </nav>
      </aside>

      <div className="landing-mock-main">
        <header className="landing-mock-topbar">
          <button type="button" className="landing-mock-workspace" tabIndex={-1}>
            Xaphires
            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div className="landing-mock-search">
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m21 21-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>Buscar</span>
            <kbd>⌘K</kbd>
          </div>
        </header>

        <nav className="landing-mock-tabs">
          <span className="landing-mock-tab active">Meu quadro</span>
          <span className="landing-mock-tab">Todos os quadros</span>
          <span className="landing-mock-tab">Relatórios</span>
        </nav>

        <div className="landing-mock-body">
          <div className="landing-mock-columns">
            {columns.map((col) => (
              <div className="landing-mock-column" key={col.title}>
                <div className="landing-mock-column-head">
                  <span>{col.title}</span>
                  <span className={"landing-mock-column-dot " + col.accent} />
                </div>
                {col.cards.map((card, i) => (
                  <div className="landing-mock-card" key={i}>
                    <span className="landing-mock-card-bar" />
                    {card.lines > 1 && <span className="landing-mock-card-bar short" />}
                    <span className={"landing-mock-card-accent " + card.accent} />
                  </div>
                ))}
              </div>
            ))}
          </div>

          <aside className="landing-mock-drawer">
            <span className="landing-mock-drawer-bar" />
            <span className="landing-mock-drawer-bar short" />
            <span className="landing-mock-drawer-tag" />
            <div className="landing-mock-drawer-foot">
              <span className="landing-mock-drawer-avatar" />
              <span className="landing-mock-drawer-bar tiny" />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// Carrossel de prints da interface, substitui o antigo FeatureSwitcher (cards
// giratórios com miniaturas desenhadas à mão). Nativo (sem Swiper/Embla,
// mesmo hábito do resto do projeto de não trazer lib pra UI que dá pra
// desenhar direto) - troca de slide é so a classe "active", igual ao padrão
// que o próprio FeatureSwitcher já usava.
export default function InterfaceShowcase() {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);

  // Reagenda a cada troca, então um clique manual também reinicia a contagem.
  useEffect(() => {
    const id = setTimeout(() => setActive((a) => (a + 1) % interfaceScreenshots.length), 5000);
    return () => clearTimeout(id);
  }, [active]);

  const go = (delta) => setActive((a) => (a + delta + interfaceScreenshots.length) % interfaceScreenshots.length);

  return (
    <section className="landing-showcase">
      <div className="landing-showcase-intro landing-reveal">
        <h2>{t("landing.showcase.title")}</h2>
        <p>{t("landing.showcase.subtitle")}</p>
      </div>

      <div className="landing-showcase-carousel landing-reveal">
        <button type="button" className="landing-showcase-arrow prev" onClick={() => go(-1)} aria-label={t("landing.showcase.prevSlide")}>
          ‹
        </button>

        <div className="landing-showcase-frame">
          {interfaceScreenshots.map((shot, i) => (
            <div
              key={shot.key}
              className={"landing-showcase-slide" + (i === active ? " active" : "")}
              aria-hidden={i === active ? undefined : "true"}
            >
              <div className="landing-showcase-browser">
                {/* Window header: pontinhos à esquerda, título do módulo
                    centralizado, e um "espaçador" invisible à direita do
                    mesmo tamanho dos pontinhos - é o que mantém o título
                    realmente centralizado no meio da barra, não só entre os
                    pontinhos e a borda direita. */}
                <div className="landing-showcase-browser-bar">
                  <span className="landing-showcase-traffic-group">
                    <span className="landing-showcase-traffic red" />
                    <span className="landing-showcase-traffic yellow" />
                    <span className="landing-showcase-traffic green" />
                  </span>
                  <span className="landing-showcase-browser-title">{t(`landing.showcase.slides.${shot.key}`)}</span>
                  <span className="landing-showcase-browser-spacer" aria-hidden="true" />
                </div>
                <div className="landing-showcase-screen">
                  {shot.mock ? (
                    <SystemShowcaseMock />
                  ) : shot.src ? (
                    <img src={shot.src} alt={t(`landing.showcase.slides.${shot.key}`)} />
                  ) : (
                    <div className="landing-showcase-placeholder">
                      <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
                        <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4zM4 15l4.5-4.5 3 3L16 9l4 4" />
                        <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
                      </svg>
                      <span>{t("landing.showcase.placeholder", { n: i + 1 })}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="landing-showcase-arrow next" onClick={() => go(1)} aria-label={t("landing.showcase.nextSlide")}>
          ›
        </button>
      </div>

      <div className="landing-showcase-dots">
        {interfaceScreenshots.map((shot, i) => (
          <button
            type="button"
            key={shot.key}
            className={"landing-showcase-dot" + (i === active ? " active" : "")}
            onClick={() => setActive(i)}
            aria-label={t("landing.showcase.goToSlide", { n: i + 1 })}
            aria-current={i === active ? "true" : undefined}
          />
        ))}
      </div>
    </section>
  );
}
