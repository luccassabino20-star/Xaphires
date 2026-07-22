import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, normalizeLanguage } from "../i18n/locale.js";

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.7 15.7 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.93 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14a8.1 8.1 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4zm.81 2h2.95c.34 1.25.8 2.45 1.38 3.56A8.03 8.03 0 0 1 5.07 16zm2.95-8H5.07a8.03 8.03 0 0 1 4.33-3.56A15.7 15.7 0 0 0 8.02 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66a14.53 14.53 0 0 1 0-4h4.68a14.53 14.53 0 0 1 0 4zm.3 5.56c.58-1.11 1.04-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.1 8.1 0 0 1 0 4z"
      />
    </svg>
  );
}

export default function LanguageSwitcher({ className }) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const current = normalizeLanguage(i18n.language);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className={"language-switcher" + (className ? " " + className : "")}>
      <button
        ref={btnRef}
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        title={t("language.title")}
        aria-label={t("language.ariaLabel")}
      >
        <GlobeIcon />
      </button>
      {open && (
        <div className="dropdown language-dropdown" ref={ref}>
          {SUPPORTED_LANGUAGES.map((lng) => (
            <div
              key={lng}
              className={"dropdown-item" + (current === lng ? " active" : "")}
              onClick={() => {
                i18n.changeLanguage(lng);
                setOpen(false);
              }}
            >
              <span>{LANGUAGE_LABELS[lng]}</span>
              {current === lng && <span className="theme-check">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
