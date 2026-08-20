import { useRef, useState } from "react";
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

// Configurações do módulo: especialidade + Aparência e Temas (cor de
// destaque escolhida pela clínica - ver applySaudeClinicasSchema para o
// porquê da coluna e SaudeClinicasModule para onde o data-sc-theme é
// aplicado) + Dados da clínica (nome e logo white-label - ver SaudeBrand em
// SaudeClinicasModule, é quem lê o que fica salvo aqui pro topo do módulo).
export default function ConfigView({ clinicType, theme, clinicName, logoUrl, isMaster, onClinicTypeChange, onThemeChange, onNameChange, onLogoChange, onLogoRemove }) {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [nome, setNome] = useState(clinicName);
  const [enviandoLogo, setEnviandoLogo] = useState(false);

  async function selecionarLogo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEnviandoLogo(true);
    try {
      await onLogoChange(file);
    } finally {
      setEnviandoLogo(false);
    }
  }

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
        <p className="sc-hint">{t("saudeClinicas.config.dadosClinicaHint")}</p>

        <div className="sc-config-logo-linha">
          <div className="sc-patient-foto-wrap sc-config-logo-wrap">
            {logoUrl ? (
              <img className="sc-config-logo-preview" src={logoUrl} alt="" />
            ) : (
              <span className="sc-detail-avatar sc-patient-foto-vazia">{(nome || "?").charAt(0).toUpperCase()}</span>
            )}
            {isMaster && (
              <button type="button" className="sc-patient-foto-botao" onClick={() => fileInputRef.current?.click()} disabled={enviandoLogo} title={t("saudeClinicas.config.editarLogo")}>
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m4 20 1-4L18 3l3 3L8 19l-4 1zM14 6l4 4" /></svg>
              </button>
            )}
          </div>
          <div className="sc-config-logo-info">
            <p className="sc-hint">{t("saudeClinicas.config.logoHint")}</p>
            {isMaster && logoUrl && (
              <button type="button" className="btn-ghost btn-small" onClick={onLogoRemove}>{t("saudeClinicas.config.removerLogo")}</button>
            )}
          </div>
          {isMaster && <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={selecionarLogo} />}
        </div>

        <label className="sc-patient-campo">
          <span className="sc-hint">{t("saudeClinicas.config.nomeClinica")}</span>
          {isMaster ? (
            <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} onBlur={() => nome !== clinicName && onNameChange(nome)} placeholder={t("saudeClinicas.config.nomeClinicaPlaceholder")} />
          ) : (
            <span className="sc-clinictype-label">{clinicName || "-"}</span>
          )}
        </label>
      </div>
    </div>
  );
}
