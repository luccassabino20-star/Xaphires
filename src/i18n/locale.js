export const SUPPORTED_LANGUAGES = ["pt", "en", "es", "fr", "de"];

// pt é o idioma padrão e não leva prefixo na URL (a raiz do site é pt) - os
// demais entram como primeiro segmento (/en, /es, /fr, /de). Ver urlLocale.js.
export const DEFAULT_LOCALE = "pt";

export const LANGUAGE_LABELS = {
  pt: "Português",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
};

// Mapa de idioma (i18next) para BCP-47 completo, usado em Intl.DateTimeFormat/toLocaleDateString.
export const LOCALE_TAGS = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
};

// i18n.language às vezes traz a tag bruta do navegador (ex: "en-US", "es-AR"), não só o código de
// 2 letras. Normaliza para um dos idiomas suportados antes de usar como chave de lookup.
export function normalizeLanguage(lng) {
  const base = (lng || "").split("-")[0].toLowerCase();
  return SUPPORTED_LANGUAGES.includes(base) ? base : "pt";
}

export function localeTag(lng) {
  return LOCALE_TAGS[normalizeLanguage(lng)];
}
