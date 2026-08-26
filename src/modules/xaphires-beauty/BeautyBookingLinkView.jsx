import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";

// Link público de agendamento (Fase 4, Profissional+): gera/mostra o slug
// fixo da empresa (server/modules/xaphires-beauty/agendaSlugStore.js) e
// oferece copiar - mesmo padrão de "copiar link de captação" em
// AnamneseView.jsx (Saúde & Clínicas), incluindo o fallback de mostrar o
// link para copiar à mão quando o clipboard não está disponível (contexto
// sem https, por exemplo).
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

  if (!canUse) {
    return (
      <div className="sc-empty" style={{ padding: 40 }}>
        {t("modules.xaphiresBeauty.online.bloqueado", { plano: t("plan.names.professional") })}
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
    <div className="sc-cad-secao">
      <p className="xb-online-intro">{t("modules.xaphiresBeauty.online.explicacao")}</p>
      {erro && <div className="sc-error">{erro}</div>}
      {slug && (
        <div className="sc-form" style={{ alignItems: "center" }}>
          <button type="button" className="btn-primary btn-small" onClick={copiar}>
            {t("modules.xaphiresBeauty.online.copiarLink")}
          </button>
          {mostrarLink && <input type="text" readOnly value={url} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 240 }} />}
        </div>
      )}
    </div>
  );
}
