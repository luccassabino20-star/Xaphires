import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MovimentacaoView from "./MovimentacaoView.jsx";

// Extrato (Transações > Extrato, no menu Finanças) é a Movimentação de sempre
// - o extrato por conta, com baixa e estorno (ver a nota "baixaEmMovimentacao"
// nos locales). Importar extrato bancário (PDF) é uma ação secundária, não um
// item de menu próprio no novo desenho: fica um clique daqui, em vez de perder
// a tela que já existia.
export default function ExtratoView() {
  const { t } = useTranslation();
  return (
    <div className="fin-extrato">
      <div className="fin-extrato-topo">
        <Link to="importar" className="btn-secondary btn-small">{t("financeiro.importar.abrir")}</Link>
      </div>
      <MovimentacaoView />
    </div>
  );
}
