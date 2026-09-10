import { useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import { centsAssinado } from "./dinheiro.js";
import { BANCOS, rotuloBanco, BANCOS_DESTAQUE, inicialBanco, corBanco } from "./bancos.js";

function IconBank({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10 12 4l9 6" />
      <path d="M4 10h16v9H4z" />
      <path d="M9 13v4M15 13v4" />
    </svg>
  );
}
function IconInfo({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Separa "12345-6" em { numero: "12345", digito: "6" } - o schema só tem uma
// coluna `numero`, então dígito é um campo só de digitação que o submit junta
// de volta (ver salvar() abaixo). Sem hífen reconhecível, tudo vira `numero`.
function separarNumero(bruto) {
  const s = String(bruto || "");
  const m = /^(.+)-(\w{1,2})$/.exec(s);
  return m ? { numero: m[1], digito: m[2] } : { numero: s, digito: "" };
}

const VAZIO = { nome: "", banco: "", tipo: "conta_corrente", agencia: "", numero: "", digito: "", saldo: "", saldoData: hojeCivil(), principal: false };

// Modal "Nova Conta Bancária": mesmo esqueleto visual de NovoContatoModal.jsx
// (header com ícone, premiumModalIn, CTA escuro). O seletor de banco é visual
// (badge de iniciais, sem logo real - não há asset de marca neste projeto),
// com "Outro banco" caindo no select FEBRABAN completo que já existia.
export default function NovaContaBancariaModal({ conta, tipos, onClose, onSalvar }) {
  const { t } = useTranslation();
  const editando = !!conta;
  const [f, setF] = useState(() => {
    if (!conta) return VAZIO;
    const { numero, digito } = separarNumero(conta.numero);
    const destaque = BANCOS_DESTAQUE.some((b) => b.nome === conta.banco);
    return {
      nome: conta.nome, banco: conta.banco || "", tipo: conta.tipo || "conta_corrente",
      agencia: conta.agencia || "", numero, digito,
      saldo: String((conta.saldo_inicial_cents || 0) / 100), saldoData: conta.saldo_inicial_data || hojeCivil(),
      principal: !!conta.principal,
      _outro: !destaque && !!conta.banco,
    };
  });
  const [bancoOutroSel, setBancoOutroSel] = useState(() => {
    if (!conta?.banco) return "";
    const conhecido = BANCOS.some((b) => rotuloBanco(b) === conta.banco);
    return conhecido ? conta.banco : "__outro__";
  });
  const [bancoOutroTexto, setBancoOutroTexto] = useState(() => {
    if (!conta?.banco) return "";
    const conhecido = BANCOS.some((b) => rotuloBanco(b) === conta.banco) || BANCOS_DESTAQUE.some((b) => b.nome === conta.banco);
    return conhecido ? "" : conta.banco;
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const mostrarOutro = f._outro;
  const usandoTextoLivre = bancoOutroSel === "__outro__";

  function escolherDestaque(nome) {
    setF({ ...f, banco: nome, _outro: false });
  }
  function abrirOutro() {
    setF({ ...f, banco: "", _outro: true });
  }

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!f.nome.trim()) { setErro(t("financeiro.tesouraria.erroNome")); return; }
    const banco = mostrarOutro ? (usandoTextoLivre ? bancoOutroTexto.trim() : bancoOutroSel) : f.banco;
    const numeroCompleto = f.digito ? `${f.numero}-${f.digito}` : f.numero;
    setSalvando(true);
    try {
      await onSalvar({
        nome: f.nome.trim(), banco, tipo: f.tipo, agencia: f.agencia, numero: numeroCompleto,
        saldoInicialCents: centsAssinado(f.saldo), saldoInicialData: f.saldoData, principal: f.principal,
      });
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal contato-form-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        <div className="cobr-form-header">
          <span className="cobr-form-header-icon"><IconBank size={20} /></span>
          <div>
            <h2 className="cobr-form-title">{t(editando ? "financeiro.tesouraria.modal.tituloEditar" : "financeiro.tesouraria.modal.tituloNovo")}</h2>
            <p className="cobr-form-subtitle">{t("financeiro.tesouraria.modal.subtitulo")}</p>
          </div>
        </div>

        <form className="cobr-form-body" onSubmit={salvar}>
          <div className="cobr-field">
            <span>{t("financeiro.tesouraria.modal.escolhaBanco")}</span>
            <div className="contas-banco-picker">
              {BANCOS_DESTAQUE.map((b) => (
                <button
                  key={b.nome}
                  type="button"
                  className={"contas-banco-opcao" + (!mostrarOutro && f.banco === b.nome ? " selected" : "")}
                  onClick={() => escolherDestaque(b.nome)}
                >
                  <span className="contas-banco-opcao-badge" style={{ background: corBanco(b.nome) }}>{inicialBanco(b.nome)}</span>
                  {b.nome}
                </button>
              ))}
              <button type="button" className={"contas-banco-opcao" + (mostrarOutro ? " selected" : "")} onClick={abrirOutro}>
                <span className="contas-banco-opcao-badge contas-banco-opcao-badge-outro">?</span>
                {t("financeiro.contas.bancoOutro")}
              </button>
            </div>
          </div>

          {mostrarOutro && (
            <div className="cobr-form-grid">
              <label className="cobr-field">
                <span>{t("financeiro.contas.bancoEscolha")}</span>
                <select value={bancoOutroSel} onChange={(e) => setBancoOutroSel(e.target.value)}>
                  <option value="">{t("financeiro.contas.bancoEscolha")}</option>
                  {BANCOS.map((b) => <option key={b.codigo} value={rotuloBanco(b)}>{rotuloBanco(b)}</option>)}
                  <option value="__outro__">{t("financeiro.contas.bancoOutro")}</option>
                </select>
              </label>
              {usandoTextoLivre && (
                <label className="cobr-field">
                  <span>{t("financeiro.contas.bancoOutroPlaceholder")}</span>
                  <input type="text" value={bancoOutroTexto} onChange={(e) => setBancoOutroTexto(e.target.value)} />
                </label>
              )}
            </div>
          )}

          <label className="cobr-field">
            <span>{t("financeiro.tesouraria.modal.apelido")}</span>
            <input type="text" placeholder={t("financeiro.tesouraria.modal.apelidoPlaceholder")} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          </label>

          <div className="cobr-form-grid">
            <label className="cobr-field">
              <span>{t("financeiro.cad.tipo")}</span>
              <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                {tipos.map((tp) => <option key={tp} value={tp}>{t(`financeiro.tesouraria.tipo.${tp}`)}</option>)}
              </select>
            </label>
            <label className="cobr-field">
              <span>{t("financeiro.cad.agencia")}</span>
              <input type="text" value={f.agencia} onChange={(e) => setF({ ...f, agencia: e.target.value })} />
            </label>
            <label className="cobr-field">
              <span>{t("financeiro.cad.numero")}</span>
              <input type="text" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} />
            </label>
            <label className="cobr-field">
              <span>{t("financeiro.tesouraria.modal.digito")}</span>
              <input type="text" maxLength={2} value={f.digito} onChange={(e) => setF({ ...f, digito: e.target.value })} />
            </label>
            <label className="cobr-field">
              <span>{t("financeiro.contas.saldoInicial")}</span>
              <span className="cobr-valor-wrap">
                <span className="cobr-valor-prefixo">R$</span>
                <input type="text" inputMode="decimal" placeholder="0,00" value={f.saldo} onChange={(e) => setF({ ...f, saldo: e.target.value })} />
              </span>
            </label>
            <label className="cobr-field">
              <span>{t("financeiro.tesouraria.modal.dataSaldo")}</span>
              <input type="date" value={f.saldoData} onChange={(e) => setF({ ...f, saldoData: e.target.value })} />
            </label>
          </div>

          <label className="contas-principal-toggle">
            <span className="addon-toggle">
              <input type="checkbox" checked={f.principal} onChange={(e) => setF({ ...f, principal: e.target.checked })} />
              <span className="addon-toggle-track"><span className="addon-toggle-thumb" /></span>
            </span>
            {t("financeiro.tesouraria.modal.contaPrincipal")}
          </label>

          {erro && <p className="cobr-form-erro"><IconInfo /> {erro}</p>}

          <div className="cobr-form-footer">
            <button type="button" className="recurrence-btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="recurrence-btn-primary" disabled={salvando}>
              {salvando ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
