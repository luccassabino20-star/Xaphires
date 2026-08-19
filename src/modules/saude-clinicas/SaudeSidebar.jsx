import { useState } from "react";
import { useTranslation } from "react-i18next";
import CardIcon from "./CardIcon.jsx";

const TIPOS_CLINICA = ["MULTIDISCIPLINAR", "ESTETICA", "BIOMEDICINA_ESTETICA", "NUTRICAO"];

// Itens do menu. `real` decide se o item abre conteúdo de verdade; os que não
// têm tela ainda ficam desabilitados com o selo "Em breve" - mesmo tratamento
// de .fin-cad-item.disabled (CadastrosView do Financeiro) e dos cards
// travados do launcher, para não inventar uma segunda linguagem de "ainda não
// existe" dentro da própria plataforma. `usuarios` não troca de seção: abre um
// painel por cima (UsersPanel para master, TeamPanel para os demais - ver
// SaudeClinicasModule), então o clique nele não fica marcado como "ativo".
// `agenda` virou grupo com submenu (Semanal/Diária/Bloqueio/Matriz) em vez de
// seção única - `children` traz as sub-seções, e `sectionPrefix` é o que
// `SaudeClinicasModule` usa para decidir quais `section` pertencem ao grupo
// (pra ele abrir expandido quando qualquer uma das quatro estiver ativa).
const ITENS = [
  { id: "dashboard", icon: "dashboard", real: true },
  {
    id: "agenda", icon: "agenda", real: true, sectionPrefix: "agenda-",
    children: [
      { id: "agenda-semana", labelKey: "agendaSemanal" },
      { id: "agenda-dia", labelKey: "agendaDiaria" },
      { id: "agenda-bloqueio", labelKey: "bloqueioAgenda" },
      { id: "agenda-disponibilidade", labelKey: "matrizDisponibilidade" },
    ],
  },
  { id: "pacientes", icon: "pacientes", real: true },
  { id: "financeiro", icon: "financeiro", real: false },
  { id: "servicos", icon: "servicos", real: false },
  { id: "usuarios", icon: "usuarios", real: true, modal: true },
  { id: "config", icon: "config", real: true },
];

// Menu lateral de administração da clínica: fixo à esquerda, colapsável para
// só ícones. O seletor de especialidade mora no topo dela (some quando
// colapsada - um <select> não cabe bem só com ícone), e também aparece de
// novo dentro da seção Configurações, para quem prefere achar por lá.
export default function SaudeSidebar({ collapsed, onToggleCollapsed, activeSection, onSelectSection, clinicType, isMaster, onClinicTypeChange, onAbrirEquipe }) {
  const { t } = useTranslation();
  // Grupo com submenu começa aberto se a seção ativa já pertence a ele (ex.:
  // primeira renderização já em "agenda-semana", que é o default do módulo) -
  // sem isso a pessoa abriria a Agenda e veria o próprio item ativo escondido
  // dentro de um grupo fechado.
  const [grupoAberto, setGrupoAberto] = useState(() =>
    ITENS.filter((it) => it.children).map((it) => it.id).filter((id) =>
      ITENS.find((it) => it.id === id).children.some((c) => c.id === activeSection)
    )
  );

  function clicarItem(item) {
    if (!item.real) return;
    if (item.modal) return onAbrirEquipe();
    if (item.children) {
      setGrupoAberto((atual) => (atual.includes(item.id) ? atual.filter((id) => id !== item.id) : [...atual, item.id]));
      return;
    }
    onSelectSection(item.id);
  }

  return (
    <aside className={"sc-sidebar" + (collapsed ? " sc-sidebar-collapsed" : "")}>
      <button type="button" className="sc-sidebar-toggle" onClick={onToggleCollapsed} title={t(collapsed ? "saudeClinicas.sidebar.expandir" : "saudeClinicas.sidebar.recolher")}>
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
        </svg>
      </button>

      {!collapsed && clinicType && (
        <div className="sc-sidebar-specialty">
          <span className="sc-sidebar-specialty-label">{t("saudeClinicas.sidebar.especialidade")}</span>
          {isMaster ? (
            <select className="sc-clinictype-select" value={clinicType} onChange={(e) => onClinicTypeChange(e.target.value)}>
              {TIPOS_CLINICA.map((tp) => (
                <option key={tp} value={tp}>{t(`saudeClinicas.clinicType.${tp}`)}</option>
              ))}
            </select>
          ) : (
            <span className="sc-clinictype-label">{t(`saudeClinicas.clinicType.${clinicType}`)}</span>
          )}
        </div>
      )}

      <nav className="sc-sidebar-nav">
        {ITENS.map((item) => {
          const ehGrupoAtivo = item.children?.some((c) => c.id === activeSection);
          const aberto = grupoAberto.includes(item.id);
          return (
            <div key={item.id} className="sc-sidebar-group">
              <button
                type="button"
                className={"sc-sidebar-item" + (activeSection === item.id || ehGrupoAtivo ? " active" : "") + (!item.real ? " disabled" : "")}
                onClick={() => {
                  // Colapsada não tem espaço pro submenu - clique no grupo já
                  // navega direto pra primeira sub-seção, em vez de só abrir
                  // um leque que ninguém vai ver com a sidebar estreita.
                  if (item.children && collapsed) return onSelectSection(item.children[0].id);
                  clicarItem(item);
                }}
                disabled={!item.real}
                title={collapsed ? t(`saudeClinicas.sidebar.${item.id}`) : item.real ? undefined : t("modules.comingSoon")}
              >
                <span className="sc-sidebar-item-icon">
                  <CardIcon name={item.icon} size={19} />
                </span>
                {!collapsed && <span className="sc-sidebar-item-label">{t(`saudeClinicas.sidebar.${item.id}`)}</span>}
                {!collapsed && !item.real && <span className="sc-sidebar-item-badge">{t("modules.comingSoon")}</span>}
                {!collapsed && item.children && (
                  <svg className={"sc-sidebar-group-chevron" + (aberto ? " sc-sidebar-group-chevron-aberto" : "")} viewBox="0 0 24 24" width="13" height="13">
                    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </svg>
                )}
              </button>
              {!collapsed && item.children && aberto && (
                <div className="sc-sidebar-subnav">
                  {item.children.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      className={"sc-sidebar-subitem" + (activeSection === sub.id ? " active" : "")}
                      onClick={() => onSelectSection(sub.id)}
                    >
                      {t(`saudeClinicas.sidebar.${sub.labelKey}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
