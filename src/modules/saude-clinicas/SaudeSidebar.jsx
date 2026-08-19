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
const ITENS = [
  { id: "dashboard", icon: "dashboard", real: true },
  { id: "agenda", icon: "agenda", real: true },
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

  function clicarItem(item) {
    if (!item.real) return;
    if (item.modal) return onAbrirEquipe();
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
        {ITENS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={"sc-sidebar-item" + (activeSection === item.id ? " active" : "") + (!item.real ? " disabled" : "")}
            onClick={() => clicarItem(item)}
            disabled={!item.real}
            title={collapsed ? t(`saudeClinicas.sidebar.${item.id}`) : item.real ? undefined : t("modules.comingSoon")}
          >
            <span className="sc-sidebar-item-icon">
              <CardIcon name={item.icon} size={19} />
            </span>
            {!collapsed && <span className="sc-sidebar-item-label">{t(`saudeClinicas.sidebar.${item.id}`)}</span>}
            {!collapsed && !item.real && <span className="sc-sidebar-item-badge">{t("modules.comingSoon")}</span>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
