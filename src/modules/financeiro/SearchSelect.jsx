import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// Select pesquisável: um controle com lupa que abre um campo de busca e filtra a
// lista. Usado onde a lista pode crescer (cliente/fornecedor, classe, centro de
// custo) e o <select> nativo não deixa procurar. Guarda só o id; o rótulo vem em
// options=[{ id, label }]. allLabel é a opção "nenhum" (value ""), sempre no topo.
export default function SearchSelect({ value, onChange, options = [], allLabel, placeholder }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => o.id === value) || null;

  // Fecha ao clicar fora e ao apertar Esc - dropdown solto precisa dos dois.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }, [options, q]);

  function pick(id) { onChange(id); setOpen(false); setQ(""); }

  function onKeyDown(e) {
    if (e.key === "Escape") { setOpen(false); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered.length) pick(filtered[0].id); }
  }

  const lupa = (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14" />
    </svg>
  );

  return (
    <div className={"fin-ss" + (open ? " open" : "")} ref={ref}>
      <button type="button" className="fin-ss-control" onClick={() => setOpen((o) => !o)}>
        {lupa}
        <span className={"fin-ss-label" + (selected ? "" : " fin-ss-placeholder")}>{selected ? selected.label : allLabel}</span>
        <svg className="fin-ss-chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z" /></svg>
      </button>
      {open && (
        <div className="fin-ss-pop">
          <div className="fin-ss-search">
            {lupa}
            <input ref={inputRef} type="text" value={q} placeholder={placeholder || t("financeiro.pesquisar")} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} />
          </div>
          <ul className="fin-ss-list">
            {allLabel !== undefined && (
              <li>
                <button type="button" className={"fin-ss-opt" + (!value ? " sel" : "")} onClick={() => pick("")}>{allLabel}</button>
              </li>
            )}
            {filtered.map((o) => (
              <li key={o.id}>
                <button type="button" className={"fin-ss-opt" + (o.id === value ? " sel" : "")} onClick={() => pick(o.id)}>{o.label}</button>
              </li>
            ))}
            {filtered.length === 0 && <li className="fin-ss-empty">{t("financeiro.semResultado")}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
