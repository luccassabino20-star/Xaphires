import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents, reaisParaCents } from "../financeiro/dinheiro.js";

const ABAS = ["categorias", "contas", "centros", "outras"];

// Configurações do Financeiro (Saúde & Clínicas): 4 portas de entrada
// (Categorias/Contas/Centros de custo/Outras), mesmo componente, só muda a
// aba inicial - mesmo padrão de CadastrosView (`selecionadoInicial`) do
// módulo Financeiro de verdade, aqui reimplementado do zero (sem importar
// nada de lá, ver o comentário em schema.js).
export default function FinanceiroConfigView({ abaInicial }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [aba, setAba] = useState(abaInicial || "contas");

  useEffect(() => { setAba(abaInicial || "contas"); }, [abaInicial]);

  return (
    <div className="sc-fin-config">
      <nav className="sc-toggle-group">
        {ABAS.map((a) => (
          <button key={a} type="button" className={"sc-toggle-btn" + (aba === a ? " active" : "")} onClick={() => setAba(a)}>
            {t(`saudeClinicas.financeiro.config.aba.${a}`)}
          </button>
        ))}
      </nav>

      {aba === "categorias" && <AbaCategorias t={t} showToast={showToast} />}
      {aba === "contas" && <AbaContas t={t} i18n={i18n} showToast={showToast} />}
      {aba === "centros" && <AbaCentros t={t} showToast={showToast} />}
      {aba === "outras" && <div className="sc-placeholder-pane">{t("saudeClinicas.financeiro.config.semOutras")}</div>}
    </div>
  );
}

function AbaCategorias({ t, showToast }) {
  const [lista, setLista] = useState(null);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("receita");

  async function carregar() {
    setLista(await api.scFinListAllCategorias());
  }
  useEffect(() => { carregar(); }, []); // eslint-disable-line

  async function criar(e) {
    e.preventDefault();
    if (!nome.trim()) return showToast(t("saudeClinicas.financeiro.config.nomeObrigatorio"));
    try {
      await api.scFinCreateCategoria({ nome: nome.trim(), tipo });
      setNome("");
      carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }
  async function alternar(item) {
    await api.scFinUpdateCategoria(item.id, { ativo: item.ativo ? 0 : 1 });
    carregar();
  }

  return (
    <div className="sc-fin-config-secao">
      <form className="sc-servicos-form" onSubmit={criar}>
        <input type="text" placeholder={t("saudeClinicas.financeiro.config.nomePlaceholder")} value={nome} onChange={(e) => setNome(e.target.value)} />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="receita">{t("saudeClinicas.financeiro.receita")}</option>
          <option value="despesa">{t("saudeClinicas.financeiro.despesa")}</option>
        </select>
        <button type="submit" className="btn-primary btn-small">{t("saudeClinicas.servicos.convenios.adicionar")}</button>
      </form>
      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead><tr><th>{t("saudeClinicas.financeiro.config.nome")}</th><th>{t("saudeClinicas.financeiro.tipo")}</th><th>{t("saudeClinicas.servicos.catalogo.status")}</th><th>{t("saudeClinicas.servicos.catalogo.acoes")}</th></tr></thead>
          <tbody>
            {!lista || lista.length === 0 ? (
              <tr><td colSpan={4} className="sc-empty">{t("saudeClinicas.financeiro.config.semItens")}</td></tr>
            ) : lista.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td>{t(`saudeClinicas.financeiro.${c.tipo}`)}</td>
                <td><span className={"sc-servicos-status" + (c.ativo ? " ativo" : " inativo")}>{t(c.ativo ? "saudeClinicas.servicos.catalogo.ativo" : "saudeClinicas.servicos.catalogo.inativo")}</span></td>
                <td><button type="button" className="btn-ghost btn-small" onClick={() => alternar(c)}>{t(c.ativo ? "saudeClinicas.servicos.catalogo.desativar" : "saudeClinicas.servicos.catalogo.ativar")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AbaContas({ t, i18n, showToast }) {
  const [lista, setLista] = useState(null);
  const [nome, setNome] = useState("");
  const [banco, setBanco] = useState("");
  const [saldo, setSaldo] = useState("");

  async function carregar() {
    setLista(await api.scFinListAllContas());
  }
  useEffect(() => { carregar(); }, []); // eslint-disable-line

  async function criar(e) {
    e.preventDefault();
    if (!nome.trim()) return showToast(t("saudeClinicas.financeiro.config.nomeObrigatorio"));
    try {
      await api.scFinCreateConta({ nome: nome.trim(), banco: banco.trim(), saldoInicialCents: reaisParaCents(saldo) || 0 });
      setNome(""); setBanco(""); setSaldo("");
      carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }
  async function alternar(item) {
    await api.scFinUpdateConta(item.id, { ativo: item.ativo ? 0 : 1 });
    carregar();
  }

  return (
    <div className="sc-fin-config-secao">
      <form className="sc-servicos-form" onSubmit={criar}>
        <input type="text" placeholder={t("saudeClinicas.financeiro.config.nomePlaceholder")} value={nome} onChange={(e) => setNome(e.target.value)} />
        <input type="text" placeholder={t("saudeClinicas.financeiro.config.banco")} value={banco} onChange={(e) => setBanco(e.target.value)} />
        <input type="text" inputMode="decimal" placeholder={t("saudeClinicas.financeiro.config.saldoInicial")} value={saldo} onChange={(e) => setSaldo(e.target.value)} />
        <button type="submit" className="btn-primary btn-small">{t("saudeClinicas.servicos.convenios.adicionar")}</button>
      </form>
      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead><tr><th>{t("saudeClinicas.financeiro.config.nome")}</th><th>{t("saudeClinicas.financeiro.config.banco")}</th><th>{t("saudeClinicas.financeiro.config.saldoInicial")}</th><th>{t("saudeClinicas.servicos.catalogo.status")}</th><th>{t("saudeClinicas.servicos.catalogo.acoes")}</th></tr></thead>
          <tbody>
            {!lista || lista.length === 0 ? (
              <tr><td colSpan={5} className="sc-empty">{t("saudeClinicas.financeiro.config.semItens")}</td></tr>
            ) : lista.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td>{c.banco || "-"}</td>
                <td>{formatCents(c.saldo_inicial_cents, i18n.language)}</td>
                <td><span className={"sc-servicos-status" + (c.ativo ? " ativo" : " inativo")}>{t(c.ativo ? "saudeClinicas.servicos.catalogo.ativo" : "saudeClinicas.servicos.catalogo.inativo")}</span></td>
                <td><button type="button" className="btn-ghost btn-small" onClick={() => alternar(c)}>{t(c.ativo ? "saudeClinicas.servicos.catalogo.desativar" : "saudeClinicas.servicos.catalogo.ativar")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AbaCentros({ t, showToast }) {
  const [lista, setLista] = useState(null);
  const [nome, setNome] = useState("");

  async function carregar() {
    setLista(await api.scFinListAllCentrosCusto());
  }
  useEffect(() => { carregar(); }, []); // eslint-disable-line

  async function criar(e) {
    e.preventDefault();
    if (!nome.trim()) return showToast(t("saudeClinicas.financeiro.config.nomeObrigatorio"));
    try {
      await api.scFinCreateCentroCusto({ nome: nome.trim() });
      setNome("");
      carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }
  async function alternar(item) {
    await api.scFinUpdateCentroCusto(item.id, { ativo: item.ativo ? 0 : 1 });
    carregar();
  }

  return (
    <div className="sc-fin-config-secao">
      <form className="sc-servicos-form" onSubmit={criar}>
        <input type="text" placeholder={t("saudeClinicas.financeiro.config.nomePlaceholder")} value={nome} onChange={(e) => setNome(e.target.value)} />
        <button type="submit" className="btn-primary btn-small">{t("saudeClinicas.servicos.convenios.adicionar")}</button>
      </form>
      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead><tr><th>{t("saudeClinicas.financeiro.config.nome")}</th><th>{t("saudeClinicas.servicos.catalogo.status")}</th><th>{t("saudeClinicas.servicos.catalogo.acoes")}</th></tr></thead>
          <tbody>
            {!lista || lista.length === 0 ? (
              <tr><td colSpan={3} className="sc-empty">{t("saudeClinicas.financeiro.config.semItens")}</td></tr>
            ) : lista.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td><span className={"sc-servicos-status" + (c.ativo ? " ativo" : " inativo")}>{t(c.ativo ? "saudeClinicas.servicos.catalogo.ativo" : "saudeClinicas.servicos.catalogo.inativo")}</span></td>
                <td><button type="button" className="btn-ghost btn-small" onClick={() => alternar(c)}>{t(c.ativo ? "saudeClinicas.servicos.catalogo.desativar" : "saudeClinicas.servicos.catalogo.ativar")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
