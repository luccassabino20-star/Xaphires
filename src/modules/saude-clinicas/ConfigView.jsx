import { useTranslation } from "react-i18next";

const TIPOS_CLINICA = ["MULTIDISCIPLINAR", "ESTETICA", "BIOMEDICINA_ESTETICA", "NUTRICAO"];

// Amostra de cada tema: só a cor de destaque (a que o CSS realmente troca via
// --accent, ver .sc[data-sc-theme] em index.css) - "escuro" mostra um par
// claro/escuro porque ali o que muda não é só o destaque, é a superfície
// inteira do módulo.
const TEMAS = [
  { id: "padrao", cor: "#3d3d46" },
  { id: "rosa", cor: "#d6547e" },
  { id: "azul", cor: "#2563eb" },
  { id: "verde", cor: "#16a34a" },
  { id: "roxo", cor: "#7c3aed" },
  { id: "escuro", cor: "#e5e5e5", corFundo: "#131313" },
];

// Configurações do módulo: especialidade (já existia) + Aparência e Temas
// (cor de destaque escolhida pela clínica - ver applySaudeClinicasSchema
// para o porquê da coluna e SaudeClinicasModule para onde o data-sc-theme é
// aplicado). Nome/logotipo da clínica não têm schema ainda; entram como
// aviso "Em breve" em vez de campo morto que parece salvar e não salva nada.
export default function ConfigView({ clinicType, theme, isMaster, onClinicTypeChange, onThemeChange }) {
  const { t } = useTranslation();

  return (
    <div className="sc-cad-secao">
      <div className="sc-config-card">
        <h3 className="sc-config-title">{t("saudeClinicas.config.especialidade")}</h3>
        <p className="sc-hint">{t("saudeClinicas.config.especialidadeHint")}</p>
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

      <div className="sc-config-card">
        <h3 className="sc-config-title">{t("saudeClinicas.config.aparencia")}</h3>
        <p className="sc-hint">{t("saudeClinicas.config.aparenciaHint")}</p>
        <div className="sc-tema-grid">
          {TEMAS.map((tm) => (
            <button
              key={tm.id}
              type="button"
              className={"sc-tema-swatch" + (theme === tm.id ? " active" : "")}
              style={{ "--sc-tema-cor": tm.cor, "--sc-tema-fundo": tm.corFundo || "#f3f4f6" }}
              onClick={() => isMaster && onThemeChange(tm.id)}
              disabled={!isMaster}
              title={t(`saudeClinicas.config.tema.${tm.id}`)}
            >
              <span className="sc-tema-swatch-amostra" />
              <span className="sc-tema-swatch-nome">{t(`saudeClinicas.config.tema.${tm.id}`)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sc-config-card">
        <h3 className="sc-config-title">{t("saudeClinicas.config.dadosClinica")}</h3>
        <p className="sc-hint">{t("saudeClinicas.config.dadosClinicaEmBreve")}</p>
      </div>
    </div>
  );
}
