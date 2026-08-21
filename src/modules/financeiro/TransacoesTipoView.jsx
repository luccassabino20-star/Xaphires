import { useState } from "react";
import { useTranslation } from "react-i18next";
import LancamentosView from "./LancamentosView.jsx";
import TitulosView from "./TitulosView.jsx";

// Receitas e Despesas (Transações, no menu Finanças) são a mesma dupla de
// telas que já existia (Lançamentos = lançar um título novo; Títulos = achar,
// filtrar e baixar o que já existe), só que cada uma agora abre já restrita a
// um tipo - `tipoFixo` desce para as duas, que escondem o próprio seletor/
// filtro de tipo para a pessoa não escapar do contexto da tela onde está.
export default function TransacoesTipoView({ tipo }) {
  const { t } = useTranslation();
  const [modo, setModo] = useState("consultar");

  return (
    <div className="fin-transacoes-tipo">
      <div className="fin-toggle-group">
        <button type="button" className={"fin-toggle-btn" + (modo === "consultar" ? " active" : "")} onClick={() => setModo("consultar")}>
          {t("financeiro.transacoes.consultar")}
        </button>
        <button type="button" className={"fin-toggle-btn" + (modo === "novo" ? " active" : "")} onClick={() => setModo("novo")}>
          {t("financeiro.transacoes.novo")}
        </button>
      </div>

      {modo === "consultar" ? <TitulosView tipoFixo={tipo} /> : <LancamentosView tipoFixo={tipo} />}
    </div>
  );
}
