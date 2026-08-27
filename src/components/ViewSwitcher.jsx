import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../state/api.js";

const VIEW_IDS = ["board", "table", "calendar", "dashboard", "map", "matrix"];

export default function ViewSwitcher({ view, onChange }) {
  const { t } = useTranslation();
  // Começa com todas liberadas (em vez de vazio) para não piscar "sumindo" abas
  // que o plano de fato dá direito, enquanto a resposta não chega - getPlan()
  // já tem cache de 30s (api.js), então isso não vira uma segunda requisição
  // por componente que o consulta.
  const [allowed, setAllowed] = useState(VIEW_IDS);

  useEffect(() => {
    let ativo = true;
    api
      .getPlan()
      .then((p) => ativo && p.views && setAllowed(p.views))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <nav className="view-tabs">
      {VIEW_IDS.filter((id) => allowed.includes(id)).map((id) => (
        <button key={id} className={"view-tab" + (view === id ? " active" : "")} onClick={() => onChange(id)}>
          {t(`views.switcher.${id}`)}
        </button>
      ))}
    </nav>
  );
}
