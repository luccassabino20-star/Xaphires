import { SUPPORTED_LANGUAGES, DEFAULT_LOCALE, LOCALE_TAGS } from "./locale.js";
import { pathForLocale, parseLocaleFromPath } from "./urlLocale.js";

const SITE = "https://xaphires.com";

// Chamado uma vez no boot e de novo sempre que o idioma muda (troca manual
// no LanguageSwitcher). Mantém o <html lang>, o canonical, o og:url e o bloco
// de hreflang alternates em sincronia com a URL atual - só a raiz de cada
// idioma (/, /en, /es, /fr, /de) participa hoje, não as sub-páginas da
// landing (pricing/soluções/etc.), que continuam sendo estado interno sem
// URL própria. Ver comentário de urlLocale.js sobre o porquê de não ter lib
// de rotas por trás disto.
export function syncSeoTags(locale) {
  const { rest } = parseLocaleFromPath(window.location.pathname);

  document.documentElement.lang = LOCALE_TAGS[locale] || LOCALE_TAGS[DEFAULT_LOCALE];

  const canonicalHref = SITE + pathForLocale(locale, rest);
  setLinkHref("link[rel='canonical']", canonicalHref);
  setMetaContent("meta[property='og:url']", canonicalHref);

  // hreflang não depende do idioma atual - é sempre o conjunto completo de
  // alternativas, mais x-default apontando pro idioma padrão (pt).
  removeExistingHreflangTags();
  const alternates = [...SUPPORTED_LANGUAGES.map((lng) => [LOCALE_TAGS[lng], pathForLocale(lng, rest)]), ["x-default", pathForLocale(DEFAULT_LOCALE, rest)]];
  alternates.forEach(([hreflang, path]) => {
    const link = document.createElement("link");
    link.rel = "alternate";
    link.hreflang = hreflang;
    link.href = SITE + path;
    link.setAttribute("data-hreflang-alt", "1");
    document.head.appendChild(link);
  });
}

function setLinkHref(selector, href) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute("href", href);
}

function setMetaContent(selector, content) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute("content", content);
}

function removeExistingHreflangTags() {
  document.querySelectorAll("link[data-hreflang-alt]").forEach((el) => el.remove());
}
