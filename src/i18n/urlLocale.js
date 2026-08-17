import { SUPPORTED_LANGUAGES, DEFAULT_LOCALE } from "./locale.js";

// pt (padrão) mora na raiz, sem prefixo - só os demais idiomas entram como
// primeiro segmento da URL. Mesmo espírito do window.location.pathname que
// main.jsx já usa pra decidir /admin e /gantt-demo: comparação de string
// direta, sem lib de rotas - o app nunca teve uma, e introduzir uma só pra
// isto pesaria mais do que resolve.
const URL_LOCALES = SUPPORTED_LANGUAGES.filter((l) => l !== DEFAULT_LOCALE);

// Separa o prefixo de idioma (se houver) do resto do caminho. "locale" vem
// null quando a URL não tem prefixo (raiz = pt, ou uma rota como /admin que
// não participa disso).
export function parseLocaleFromPath(pathname) {
  const clean = (pathname || "/").replace(/\/+$/, "");
  const segments = clean.split("/").filter(Boolean);
  if (segments.length > 0 && URL_LOCALES.includes(segments[0])) {
    return { locale: segments[0], rest: "/" + segments.slice(1).join("/") };
  }
  return { locale: null, rest: clean || "/" };
}

// Inverso: monta a URL para um idioma + resto do caminho. pt nunca leva
// prefixo, os demais sempre levam.
export function pathForLocale(locale, rest = "/") {
  const cleanRest = rest && rest !== "/" ? rest : "";
  if (!locale || locale === DEFAULT_LOCALE) return cleanRest || "/";
  return `/${locale}${cleanRest}`;
}
