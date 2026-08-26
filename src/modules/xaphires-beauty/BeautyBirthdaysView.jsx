import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyEmptyState from "./BeautyEmptyState.jsx";
import Avatar from "../../components/Avatar.jsx";

// "Aniversariantes" como item próprio do menu (redesenho): mesma API já
// usada como métrica rápida na tela de Clientes (Fase 5) - aqui é uma
// listagem própria, com janela de dias ajustável.
export default function BeautyBirthdaysView() {
  const { t } = useTranslation();
  const [dias, setDias] = useState(30);
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api
      .xbGetUpcomingBirthdays(dias)
      .then(setLista)
      .catch((e) => setErro(translateError(e, t)));
  }, [dias, t]);

  return (
    <div>
      <div className="beauty-page-head">
        <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.aniversariantes")}</h2>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={7}>{t("modules.xaphiresBeauty.aniversariantes.proximos", { count: 7 })}</option>
          <option value={30}>{t("modules.xaphiresBeauty.aniversariantes.proximos", { count: 30 })}</option>
          <option value={60}>{t("modules.xaphiresBeauty.aniversariantes.proximos", { count: 60 })}</option>
        </select>
      </div>

      {erro && <div className="beauty-error">{erro}</div>}

      <div className="beauty-card">
        {lista === null ? (
          <p className="beauty-cell-muted" style={{ padding: 20 }}>{t("common.loading")}</p>
        ) : lista.length === 0 ? (
          <BeautyEmptyState title={t("modules.xaphiresBeauty.aniversariantes.vazio")} />
        ) : (
          <div className="beauty-list">
            <div className="beauty-list-head">
              <span style={{ flex: 1.4 }}>{t("modules.xaphiresBeauty.clientes.nome")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.clientes.telefone")}</span>
              <span style={{ flex: 1 }}>{t("modules.xaphiresBeauty.aniversariantes.faltam")}</span>
            </div>
            {lista.map((c) => (
              <div className="beauty-list-row" key={c.id}>
                <span className="beauty-cell-primary" style={{ flex: 1.4, display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar id={c.id} name={c.name} />
                  {c.name}
                </span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>{c.phone || "—"}</span>
                <span className="beauty-cell-muted" style={{ flex: 1 }}>
                  {c.diasAte === 0 ? t("modules.xaphiresBeauty.aniversariantes.hoje") : t("modules.xaphiresBeauty.aniversariantes.emDias", { count: c.diasAte })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
