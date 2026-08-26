import { useTranslation } from "react-i18next";
import BeautyEmptyState from "./BeautyEmptyState.jsx";

// Placeholder genérico para os itens do menu pedidos no redesenho (Fichas de
// anamnese, Despesas, Minha assinatura, Configurações) que ainda não têm
// tela por trás - mesmo espírito do "Em breve" que o launcher já usa pros
// módulos futuros da plataforma, não uma tela quebrada nem um link morto.
export default function BeautyComingSoonView({ titleKey }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="beauty-page-head">
        <h2 className="beauty-page-title">{t(titleKey)}</h2>
      </div>
      <div className="beauty-card">
        <BeautyEmptyState title={t("modules.xaphiresBeauty.emBreve.titulo")} text={t("modules.xaphiresBeauty.emBreve.texto")} />
      </div>
    </div>
  );
}
