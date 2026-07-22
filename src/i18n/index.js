import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import pt from "./locales/pt.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import { SUPPORTED_LANGUAGES } from "./locale.js";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { pt: { translation: pt }, en: { translation: en }, es: { translation: es } },
    supportedLngs: SUPPORTED_LANGUAGES,
    load: "languageOnly",
    fallbackLng: "pt",
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "kanban-language",
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

export default i18n;
