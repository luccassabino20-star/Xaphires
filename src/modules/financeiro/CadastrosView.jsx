import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents, reaisParaCents } from "./dinheiro.js";

// Cadastros de apoio do Financeiro (a fundação): contas correntes, centros de
// custo, classes de receita/despesa e contatos. Cada seção é uma lista + um
// formulário de inclusão. Edição fina (inativar etc.) fica para depois - aqui é o
// suficiente para alimentar os selects do lançamento e os saldos.
const SUBABAS = ["contas", "centros", "classes", "contatos"];

export default function CadastrosView() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();
  const [sub, setSub] = useState("contas");

  const [contas, setContas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [classes, setClasses] = useState([]);
  const [contatos, setContatos] = useState([]);
  const [erro, setErro] = useState("");

  async function carregar() {
    try {
      const [c1, c2, c3, c4] = await Promise.all([
        api.finListContas(), api.finListCentrosCusto(), api.finListCategorias(lang), api.finListContatos(),
      ]);
      setContas(c1); setCentros(c2); setClasses(c3); setContatos(c4); setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  async function criar(fn, dados, limpar) {
    try {
      await fn(dados);
      showToast(t("financeiro.cad.criado"));
      limpar();
      await carregar();
    } catch (e) {
      alert(translateError(e, t));
    }
  }

  return (
    <div className="fin-cadastros">
      <nav className="fin-subtabs">
        {SUBABAS.map((s) => (
          <button key={s} className={"fin-subtab" + (sub === s ? " active" : "")} onClick={() => setSub(s)}>
            {t(`financeiro.cad.${s}`)}
          </button>
        ))}
      </nav>
      {erro && <div className="fin-error">{erro}</div>}

      {sub === "contas" && <SecaoContas contas={contas} lang={lang} onCriar={criar} />}
      {sub === "centros" && <SecaoCentros centros={centros} onCriar={criar} />}
      {sub === "classes" && <SecaoClasses classes={classes} onCriar={criar} />}
      {sub === "contatos" && <SecaoContatos contatos={contatos} onCriar={criar} />}
    </div>
  );
}

function SecaoContas({ contas, lang, onCriar }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ nome: "", banco: "", agencia: "", numero: "", saldo: "" });
  return (
    <div className="fin-cad-secao">
      <form
        className="fin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.nome.trim()) return;
          onCriar(api.finCreateConta, { nome: f.nome.trim(), banco: f.banco, agencia: f.agencia, numero: f.numero, saldoInicialCents: reaisParaCents(f.saldo) || 0 }, () => setF({ nome: "", banco: "", agencia: "", numero: "", saldo: "" }));
        }}
      >
        <input type="text" placeholder={t("financeiro.contas.nome")} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <input type="text" placeholder={t("financeiro.contas.banco")} value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })} />
        <input type="text" placeholder={t("financeiro.cad.agencia")} value={f.agencia} onChange={(e) => setF({ ...f, agencia: e.target.value })} />
        <input type="text" placeholder={t("financeiro.cad.numero")} value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} />
        <input type="number" step="0.01" placeholder={t("financeiro.contas.saldoInicial")} value={f.saldo} onChange={(e) => setF({ ...f, saldo: e.target.value })} />
        <button type="submit" className="btn-primary btn-small">{t("financeiro.form.adicionar")}</button>
      </form>
      <Tabela vazio={t("financeiro.contas.vazio")} linhas={contas} colunas={[
        { h: t("financeiro.contas.nome"), c: (x) => x.nome },
        { h: t("financeiro.contas.banco"), c: (x) => x.banco || "-" },
        { h: t("financeiro.contas.saldoInicial"), c: (x) => formatCents(x.saldo_inicial_cents, lang), num: true },
      ]} />
    </div>
  );
}

function SecaoCentros({ centros, onCriar }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ nome: "", codigo: "" });
  return (
    <div className="fin-cad-secao">
      <form className="fin-form" onSubmit={(e) => { e.preventDefault(); if (!f.nome.trim()) return; onCriar(api.finCreateCentroCusto, { nome: f.nome.trim(), codigo: f.codigo }, () => setF({ nome: "", codigo: "" })); }}>
        <input type="text" placeholder={t("financeiro.cad.codigo")} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
        <input type="text" placeholder={t("financeiro.cad.nome")} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <button type="submit" className="btn-primary btn-small">{t("financeiro.form.adicionar")}</button>
      </form>
      <Tabela vazio={t("financeiro.vazio")} linhas={centros} colunas={[
        { h: t("financeiro.cad.codigo"), c: (x) => x.codigo || "-" },
        { h: t("financeiro.cad.nome"), c: (x) => x.nome },
      ]} />
    </div>
  );
}

function SecaoClasses({ classes, onCriar }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ nome: "", tipo: "despesa", codigo: "" });
  return (
    <div className="fin-cad-secao">
      <form className="fin-form" onSubmit={(e) => { e.preventDefault(); if (!f.nome.trim()) return; onCriar(api.finCreateCategoria, { nome: f.nome.trim(), tipo: f.tipo, codigo: f.codigo }, () => setF({ nome: "", tipo: "despesa", codigo: "" })); }}>
        <input type="text" placeholder={t("financeiro.cad.codigo")} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
        <input type="text" placeholder={t("financeiro.cad.nome")} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
          <option value="receita">{t("financeiro.dre.receitas")}</option>
          <option value="despesa">{t("financeiro.dre.despesas")}</option>
        </select>
        <button type="submit" className="btn-primary btn-small">{t("financeiro.form.adicionar")}</button>
      </form>
      <Tabela vazio={t("financeiro.vazio")} linhas={classes} colunas={[
        { h: t("financeiro.cad.codigo"), c: (x) => x.codigo || "-" },
        { h: t("financeiro.cad.nome"), c: (x) => x.nome },
        { h: t("financeiro.cad.tipo"), c: (x) => (x.tipo === "receita" ? t("financeiro.dre.receitas") : t("financeiro.dre.despesas")) },
      ]} />
    </div>
  );
}

function SecaoContatos({ contatos, onCriar }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ nome: "", tipo: "fornecedor", doc: "", email: "", telefone: "" });
  const rotuloTipo = (tp) => t(`financeiro.cad.tipo_${tp}`);
  return (
    <div className="fin-cad-secao">
      <form className="fin-form" onSubmit={(e) => { e.preventDefault(); if (!f.nome.trim()) return; onCriar(api.finCreateContato, { ...f, nome: f.nome.trim() }, () => setF({ nome: "", tipo: "fornecedor", doc: "", email: "", telefone: "" })); }}>
        <input type="text" placeholder={t("financeiro.cad.nome")} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
          <option value="fornecedor">{rotuloTipo("fornecedor")}</option>
          <option value="cliente">{rotuloTipo("cliente")}</option>
          <option value="ambos">{rotuloTipo("ambos")}</option>
        </select>
        <input type="text" placeholder={t("financeiro.cad.doc")} value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })} />
        <input type="text" placeholder={t("financeiro.cad.email")} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input type="text" placeholder={t("financeiro.cad.telefone")} value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} />
        <button type="submit" className="btn-primary btn-small">{t("financeiro.form.adicionar")}</button>
      </form>
      <Tabela vazio={t("financeiro.vazio")} linhas={contatos} colunas={[
        { h: t("financeiro.cad.nome"), c: (x) => x.nome },
        { h: t("financeiro.cad.tipo"), c: (x) => rotuloTipo(x.tipo) },
        { h: t("financeiro.cad.doc"), c: (x) => x.doc || "-" },
      ]} />
    </div>
  );
}

// Tabelinha genérica para as listas dos cadastros.
function Tabela({ linhas, colunas, vazio }) {
  return (
    <div className="fin-table-wrap">
      <table className="fin-table">
        <thead>
          <tr>{colunas.map((col) => <th key={col.h} className={col.num ? "fin-num" : undefined}>{col.h}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr><td colSpan={colunas.length} className="fin-empty">{vazio}</td></tr>
          ) : (
            linhas.map((x) => (
              <tr key={x.id} className={x.ativo === 0 ? "fin-row-pago" : ""}>
                {colunas.map((col) => <td key={col.h} className={col.num ? "fin-num" : undefined}>{col.c(x)}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
