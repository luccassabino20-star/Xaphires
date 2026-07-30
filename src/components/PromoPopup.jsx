import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../state/api.js";

// Pop-up promocional configurado no painel da plataforma (Popups.jsx / popupStore.js
// no servidor). Busca uma vez, ao montar a landing - sem polling, porque a campanha
// não muda no meio de uma visita.
export default function PromoPopup({ onEnter }) {
  const { t } = useTranslation();
  const [popup, setPopup] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    api
      .getPopupAtivo()
      .then((r) => {
        if (cancelado || !r.popup) return;
        setPopup(r.popup);
        setAberto(true);
      })
      .catch(() => {
        // Silencioso de propósito: é conteúdo de marketing opcional. Uma falha aqui
        // (rede, servidor fora do ar) não pode virar erro na cara de quem só queria
        // ver a landing.
      });
    return () => {
      cancelado = true;
    };
  }, []);

  if (!popup || !aberto) return null;

  async function copiarCupom() {
    try {
      await navigator.clipboard.writeText(popup.couponCode);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de clipboard (contexto não seguro, navegador antigo): o código
      // já está visível e selecionável na tela, então a pessoa copia na mão.
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) setAberto(false);
      }}
    >
      <div className="modal modal-narrow promo-popup">
        <button className="modal-close" onClick={() => setAberto(false)} aria-label={t("common.close")}>
          &times;
        </button>
        {popup.imageUrl && <img className="promo-popup-image" src={popup.imageUrl} alt="" />}
        <h2 className="promo-popup-title">{popup.title}</h2>
        {popup.message && <p className="promo-popup-message">{popup.message}</p>}
        {popup.couponCode && (
          <div className="promo-popup-coupon">
            <span className="promo-popup-coupon-code">{popup.couponCode}</span>
            <button type="button" className="btn-secondary btn-small" onClick={copiarCupom}>
              {copiado ? t("landing.promoPopup.copied") : t("landing.promoPopup.copy")}
            </button>
          </div>
        )}
        <button
          className="btn-primary promo-popup-cta"
          onClick={() => {
            setAberto(false);
            onEnter();
          }}
        >
          {popup.buttonLabel || t("landing.promoPopup.defaultButton")}
        </button>
      </div>
    </div>
  );
}
