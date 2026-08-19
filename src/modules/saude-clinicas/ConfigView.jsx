import { useTranslation } from "react-i18next";

const TIPOS_CLINICA = ["MULTIDISCIPLINAR", "ESTETICA", "BIOMEDICINA_ESTETICA", "NUTRICAO"];

// Configurações do módulo: hoje só a especialidade é de verdade (mesmo
// controle da sidebar, reaproveitado aqui - o pedido foi que aparecesse nos
// dois lugares). Nome/logotipo da clínica não têm schema ainda; entram como
// aviso "Em breve" em vez de campo morto que parece salvar e não salva nada.
export default function ConfigView({ clinicType, isMaster, onClinicTypeChange }) {
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
        <h3 className="sc-config-title">{t("saudeClinicas.config.dadosClinica")}</h3>
        <p className="sc-hint">{t("saudeClinicas.config.dadosClinicaEmBreve")}</p>
      </div>
    </div>
  );
}
