export const SUPPORTED_LANGUAGES = ["pt", "en", "es"];

export const LANGUAGE_LABELS = {
  pt: "Português",
  en: "English",
  es: "Español",
};

// Mapa de idioma (i18next) para BCP-47 completo, usado em Intl.DateTimeFormat/toLocaleDateString.
export const LOCALE_TAGS = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
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
