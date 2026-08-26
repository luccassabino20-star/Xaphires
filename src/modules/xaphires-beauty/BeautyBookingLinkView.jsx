import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import BeautyIcon from "./BeautyIcon.jsx";

// Link público de agendamento (Profissional+): gera/mostra o slug fixo da
// empresa (server/modules/xaphires-beauty/agendaSlugStore.js) e oferece
// copiar - mesmo padrão de "copiar link de captação" em AnamneseView.jsx
// (Saúde & Clínicas), incluindo o fallback de mostrar o link para copiar à
// mão quando o clipboard não está disponível (contexto sem https, por
// exemplo).
export default function BeautyBookingLinkView({ canUse }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [slug, setSlug] = useState(null);
  const [erro, setErro] = useState("");
  const [mostrarLink, setMostrarLink] = useState(false);

  useEffect(() => {
    if (!canUse) return;
    api
      .xbGetBookingLink()
      .then((r) => setSlug(r.slug))
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, [canUse]);

  const titulo = (
    <div className="beauty-page-head">
      <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.online")}</h2>
    </div>
  );

  if (!canUse) {
    return (
      <div>
        {titulo}
        <div className="beauty-card">
          <div className="beauty-lock-card">
            <BeautyIcon name="online" size={30} />
            <span>{t("modules.xaphiresBeauty.online.bloqueado", { plano: t("plan.names.professional") })}</span>
          </div>
        </div>
      </div>
    );
  }

  const url = slug ? `${window.location.origin}/beauty-agendar/${slug}` : "";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("modules.xaphiresBeauty.online.copiado"));
      setMostrarLink(false);
    } catch {
      setMostrarLink(true);
    }
  }

  return (
    <div>
      {titulo}
      <div className="beauty-card" style={{ padding: 28 }}>
        <p className="xb-online-intro">{t("modules.xaphiresBeauty.online.explicacao")}</p>
        {erro && <div className="beauty-error" style={{ padding: "8px 0" }}>{erro}</div>}
        {slug && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn-primary" onClick={copiar}>
              {t("modules.xaphiresBeauty.online.copiarLink")}
            </button>
            {mostrarLink && (
              <input
                type="text"
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="beauty-date-input"
                style={{ flex: 1, minWidth: 260 }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
