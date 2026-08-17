import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import pt from "./locales/pt.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import { SUPPORTED_LANGUAGES } from "./locale.js";
import { parseLocaleFromPath } from "./urlLocale.js";

// A URL manda quando já tem prefixo explícito (/en, /es, /fr, /de) - é a
// única fonte que sobrevive a link compartilhado e a rastreamento de
// buscador, então tem prioridade sobre o que o LanguageDetector (localStorage
// depois Accept-Language do navegador) decidiria sozinho. Sem prefixo (raiz),
// o detector continua no comando como antes - main.jsx alinha a URL com o
// que ele resolver, ver comentário lá.
const { locale: urlLocale } = parseLocaleFromPath(window.location.pathname);

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      de: { translation: de },
    },
    supportedLngs: SUPPORTED_LANGUAGES,
    load: "languageOnly",
    fallbackLng: "pt",
    ...(urlLocale ? { lng: urlLocale } : {}),
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "kanban-language",
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

// Chegar direto numa URL com prefixo (link compartilhado, ou buscador) é uma
// escolha explícita de idioma tão válida quanto clicar no seletor - grava no
// mesmo localStorage que o LanguageDetector usa, pra uma visita futura à raiz
// (sem prefixo) já lembrar disso.
if (urlLocale) {
  try {
    window.localStorage.setItem("kanban-language", urlLocale);
  } catch {
    // localStorage indisponível (modo privado restrito, etc.) - a URL
    // continua funcionando, só não fica memorizado pra próxima visita.
  }
}

export default i18n;
