import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const CHAVE_DISPENSADO = "xaphires-pwa-dismissed-at";
const DIAS_ATE_REAPARECER = 14;

function jaInstalado() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function ehIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function foiDispensadoRecentemente() {
  const em = Number(localStorage.getItem(CHAVE_DISPENSADO) || 0);
  if (!em) return false;
  const dias = (Date.now() - em) / (1000 * 60 * 60 * 24);
  return dias < DIAS_ATE_REAPARECER;
}

// Banner "Adicionar à Tela de Início": Android/Chrome dispara o prompt nativo
// (evento beforeinstallprompt, capturado aqui e guardado até o clique - o
// navegador só permite usá-lo uma vez e dentro de um gesto do usuário). iOS
// Safari não tem esse evento (nunca teve, em nenhuma versão) - lá só resta
// instruir o passo a passo manual do menu Compartilhar.
export default function InstallPwaBanner() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [mostrarIos, setMostrarIos] = useState(false);

  useEffect(() => {
    if (jaInstalado() || foiDispensadoRecentemente()) return;

    function aoDispararPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", aoDispararPrompt);

    // iOS: sem evento pra escutar, só a checagem direta de plataforma. Um
    // pequeno atraso evita que o banner brigue com a primeira pintura da tela.
    let timer;
    if (ehIos()) {
      timer = setTimeout(() => setMostrarIos(true), 2500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", aoDispararPrompt);
      clearTimeout(timer);
    };
  }, []);

  function dispensar() {
    localStorage.setItem(CHAVE_DISPENSADO, String(Date.now()));
    setDeferredPrompt(null);
    setMostrarIos(false);
  }

  async function instalarAndroid() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  if (deferredPrompt) {
    return (
      <div className="pwa-install-banner">
        <span className="pwa-install-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 3v13m0 0-4-4m4 4 4-4M5 21h14" />
          </svg>
        </span>
        <div className="pwa-install-text">
          <strong>{t("pwa.install.title")}</strong>
          <span>{t("pwa.install.androidDesc")}</span>
        </div>
        <button type="button" className="btn-primary pwa-install-btn" onClick={instalarAndroid}>
          {t("pwa.install.installBtn")}
        </button>
        <button type="button" className="pwa-install-close" onClick={dispensar} aria-label={t("pwa.install.close")}>
          ×
        </button>
      </div>
    );
  }

  if (mostrarIos) {
    return (
      <div className="pwa-install-banner pwa-install-banner-ios">
        <span className="pwa-install-icon pwa-install-icon-pulse" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 2v13m0-13 4 4m-4-4-4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
          </svg>
        </span>
        <div className="pwa-install-text">
          <strong>{t("pwa.install.iosTitle")}</strong>
          <span>
            1. {t("pwa.install.iosStep1")}
            <br />
            2. {t("pwa.install.iosStep2")}
          </span>
        </div>
        <button type="button" className="pwa-install-close" onClick={dispensar} aria-label={t("pwa.install.close")}>
          ×
        </button>
      </div>
    );
  }

  return null;
}
