import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// Cor determinística a partir do texto (mesmo espírito de corBanco() em
// bancos.js, mas genérico - sem depender de um catálogo de bancos). Usado só
// no avatar de iniciais do autocomplete de contato.
const CORES_AVATAR = ["#2563eb", "#7c3aed", "#db2777", "#d97706", "#059669", "#0891b2", "#dc2626", "#4f46e5"];
function corAvatar(texto) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return CORES_AVATAR[h % CORES_AVATAR.length];
}
function iniciais(texto) {
  const partes = texto.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

// Select pesquisável: um controle com lupa que abre um campo de busca e filtra a
// lista. Usado onde a lista pode crescer (cliente/fornecedor, classe, centro de
// custo) e o <select> nativo não deixa procurar. Guarda só o id; o rótulo vem em
// options=[{ id, label }]. allLabel é a opção "nenhum" (value ""), sempre no topo.
//
// options pode opcionalmente trazer `sublabel` (ex.: CPF/CNPJ do contato) - a
// busca passa a casar também contra ele, e cada item ganha um avatar de
// iniciais + duas linhas. Sem sublabel, o comportamento é idêntico ao de
// sempre (usado por classe/centro/conta, que não têm essa informação).
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
    if (!s) return options;
    return options.filter((o) => o.label.toLowerCase().includes(s) || (o.sublabel || "").toLowerCase().includes(s));
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

  // avatarChar/avatarColor deixam a opção forçar um indicador próprio (ex.: seta
  // colorida de receita/despesa em vez de iniciais) - sem eles, cai no padrão de
  // iniciais + cor por hash, usado pelo autocomplete de contato.
  function Avatar({ texto, avatarChar, avatarColor }) {
    return <span className="fin-ss-avatar" style={{ background: avatarColor || corAvatar(texto) }}>{avatarChar || iniciais(texto)}</span>;
  }

  return (
    <div className={"fin-ss" + (open ? " open" : "")} ref={ref}>
      <button type="button" className="fin-ss-control" onClick={() => setOpen((o) => !o)}>
        {selected?.sublabel ? <Avatar texto={selected.label} avatarChar={selected.avatarChar} avatarColor={selected.avatarColor} /> : lupa}
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
                <button type="button" className={"fin-ss-opt" + (o.id === value ? " sel" : "") + (o.sublabel ? " fin-ss-opt-rico" : "")} onClick={() => pick(o.id)}>
                  {o.sublabel ? (
                    <>
                      <Avatar texto={o.label} avatarChar={o.avatarChar} avatarColor={o.avatarColor} />
                      <span className="fin-ss-opt-textos">
                        <span className="fin-ss-opt-nome">{o.label}</span>
                        <span className="fin-ss-opt-sub">{o.sublabel}</span>
                      </span>
                    </>
                  ) : o.label}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="fin-ss-empty">{t("financeiro.semResultado")}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
