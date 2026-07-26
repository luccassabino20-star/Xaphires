import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import * as api from "../state/api.js";

// Só avisa quando falta pouco — um aviso permanente vira ruído e para de ser lido.
const AVISO_A_PARTIR_DE = 3;

export default function PlanBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const showToast = useToast();
  const [plano, setPlano] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    api
      .getPlan()
      .then((p) => ativo && setPlano(p))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  if (!plano) return null;

  const vencido = plano.status === "expired";
  const emTeste = plano.status === "trialing";
  const acabando = emTeste && plano.daysLeft !== null && plano.daysLeft <= AVISO_A_PARTIR_DE;
  if (!vencido && !acabando) return null;

  const ehMaster = user?.role === "master";

  async function irParaBasico() {
    setSalvando(true);
    try {
      const atualizado = await api.setPlan("basic");
      setPlano(atualizado);
      showToast(t("plan.movedToBasic"));
    } catch (e) {
      showToast(translateError(e, t));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className={"plan-banner" + (vencido ? " expired" : "")}>
      <span className="plan-banner-text">
        {vencido
          ? t("plan.expiredMessage")
          : t("plan.trialEnding", { count: Math.max(plano.daysLeft, 0) })}
      </span>
      {vencido && ehMaster && (
        <button className="btn-secondary btn-small" onClick={irParaBasico} disabled={salvando}>
          {t("plan.continueOnBasic")}
        </button>
      )}
    </div>
  );
}
