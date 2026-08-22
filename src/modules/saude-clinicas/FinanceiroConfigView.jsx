import { Fragment, useEffect, useState } from "react";
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

// Árvore Categoria > Subcategoria (categoria carrega o tipo, subcategoria só
// tem nome - ver o comentário em schema.js). O checkbox de cada subcategoria
// é seleção para a ação em lote (ativar/desativar várias de uma vez), não um
// atalho individual - decisão explícita do usuário; para uma só, seleciona
// ela sozinha e usa o mesmo botão de lote.
function AbaCategorias({ t, showToast }) {
  const [categorias, setCategorias] = useState(null);
  const [subcategorias, setSubcategorias] = useState([]);
  const [novaCategoriaAberta, setNovaCategoriaAberta] = useState(false);
  const [nomeCategoria, setNomeCategoria] = useState("");
  const [tipoCategoria, setTipoCategoria] = useState("receita");
  const [subcategoriaAberta, setSubcategoriaAberta] = useState(null);
  const [nomeSubcategoria, setNomeSubcategoria] = useState("");
  const [selecionadas, setSelecionadas] = useState(() => new Set());

  async function carregar() {
    const [cats, subs] = await Promise.all([api.scFinListAllCategorias(), api.scFinListAllSubcategorias()]);
    setCategorias(cats);
    setSubcategorias(subs);
  }
  useEffect(() => { carregar(); }, []); // eslint-disable-line

  async function criarCategoria(e) {
    e.preventDefault();
    if (!nomeCategoria.trim()) return showToast(t("saudeClinicas.financeiro.config.nomeObrigatorio"));
    try {
      await api.scFinCreateCategoria({ nome: nomeCategoria.trim(), tipo: tipoCategoria });
      setNomeCategoria("");
      setNovaCategoriaAberta(false);
      carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }
  async function alternarCategoria(item) {
    await api.scFinUpdateCategoria(item.id, { ativo: item.ativo ? 0 : 1 });
    carregar();
  }
  async function excluirCategoria(item) {
    await api.scFinDeleteCategoria(item.id);
    carregar();
  }
  async function criarSubcategoria(categoriaId) {
    if (!nomeSubcategoria.trim()) return showToast(t("saudeClinicas.financeiro.config.nomeObrigatorio"));
    try {
      await api.scFinCreateSubcategoria(categoriaId, { nome: nomeSubcategoria.trim() });
      setNomeSubcategoria("");
      setSubcategoriaAberta(null);
      carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }
  function alternarSelecao(id) {
    setSelecionadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }
  async function aplicarLote(ativo) {
    await api.scFinUpdateSubcategoriasLote([...selecionadas], ativo);
    setSelecionadas(new Set());
    carregar();
  }
  async function excluirLote() {
    await api.scFinDeleteSubcategoriasLote([...selecionadas]);
    setSelecionadas(new Set());
    carregar();
  }

  if (!categorias) return <div className="sc-empty">{t("common.loading")}</div>;

  return (
    <div className="sc-fin-config-secao sc-fin-cat-tree">
      <div className="sc-fin-cat-topo">
        <button type="button" className="sc-fin-cat-nova-btn" onClick={() => setNovaCategoriaAberta((v) => !v)}>
          {t("saudeClinicas.financeiro.config.novaCategoria")}
        </button>
      </div>

      {novaCategoriaAberta && (
        <form className="sc-servicos-form" onSubmit={criarCategoria}>
          <input type="text" autoFocus placeholder={t("saudeClinicas.financeiro.config.nomePlaceholder")} value={nomeCategoria} onChange={(e) => setNomeCategoria(e.target.value)} />
          <select value={tipoCategoria} onChange={(e) => setTipoCategoria(e.target.value)}>
            <option value="receita">{t("saudeClinicas.financeiro.receita")}</option>
            <option value="despesa">{t("saudeClinicas.financeiro.despesa")}</option>
          </select>
          <button type="submit" className="btn-primary btn-small">{t("saudeClinicas.servicos.convenios.adicionar")}</button>
        </form>
      )}

      {selecionadas.size > 0 && (
        <div className="sc-fin-subcat-bulkbar">
          <span>{t("saudeClinicas.financeiro.config.selecionadas", { count: selecionadas.size })}</span>
          <button type="button" className="btn-ghost btn-small" onClick={() => aplicarLote(1)}>{t("saudeClinicas.financeiro.config.ativarSelecionadas")}</button>
          <button type="button" className="btn-ghost btn-small" onClick={() => aplicarLote(0)}>{t("saudeClinicas.financeiro.config.desativarSelecionadas")}</button>
          <button type="button" className="btn-ghost btn-small sc-fin-subcat-excluir" onClick={excluirLote}>{t("saudeClinicas.financeiro.config.excluirSelecionadas")}</button>
          <button type="button" className="btn-ghost btn-small" onClick={() => setSelecionadas(new Set())}>{t("saudeClinicas.financeiro.config.cancelarSelecao")}</button>
        </div>
      )}

      <div className="sc-table-wrap">
        <table className="sc-table sc-fin-cat-table">
          <thead>
            <tr>
              <th>{t("saudeClinicas.financeiro.config.nome")}</th>
              <th>{t("saudeClinicas.financeiro.tipo")}</th>
              <th>{t("saudeClinicas.servicos.catalogo.acoes")}</th>
            </tr>
          </thead>
          <tbody>
            {categorias.length === 0 ? (
              <tr><td colSpan={3} className="sc-empty">{t("saudeClinicas.financeiro.config.semItens")}</td></tr>
            ) : categorias.map((cat) => {
              const subs = subcategorias.filter((s) => s.categoria_id === cat.id);
              return (
                <Fragment key={cat.id}>
                  <tr className="sc-fin-cat-row">
                    <td><strong>{cat.nome}</strong></td>
                    <td>{t(`saudeClinicas.financeiro.${cat.tipo}`)}</td>
                    <td className="sc-fin-cat-acoes">
                      <button type="button" className="btn-ghost btn-small" onClick={() => alternarCategoria(cat)}>
                        {t(cat.ativo ? "saudeClinicas.servicos.catalogo.desativar" : "saudeClinicas.servicos.catalogo.ativar")}
                      </button>
                      <button type="button" className="btn-ghost btn-small sc-fin-subcat-excluir" onClick={() => excluirCategoria(cat)}>
                        {t("common.delete")}
                      </button>
                    </td>
                  </tr>
                  {subs.map((sub) => (
                    <tr key={sub.id} className="sc-fin-subcat-row">
                      <td colSpan={3}>
                        <label className="sc-fin-subcat-label">
                          <input type="checkbox" checked={selecionadas.has(sub.id)} onChange={() => alternarSelecao(sub.id)} />
                          <span className="sc-fin-subcat-nome">{sub.nome}</span>
                          {!sub.ativo && <span className="sc-servicos-status inativo">{t("saudeClinicas.servicos.catalogo.inativo")}</span>}
                        </label>
                      </td>
                    </tr>
                  ))}
                  <tr className="sc-fin-subcat-add-row">
                    <td colSpan={3}>
                      {subcategoriaAberta === cat.id ? (
                        <form className="sc-fin-subcat-add-form" onSubmit={(e) => { e.preventDefault(); criarSubcategoria(cat.id); }}>
                          <input
                            type="text" autoFocus placeholder={t("saudeClinicas.financeiro.config.nomeSubcategoriaPlaceholder")}
                            value={nomeSubcategoria} onChange={(e) => setNomeSubcategoria(e.target.value)}
                          />
                          <button type="submit" className="btn-primary btn-small">{t("saudeClinicas.servicos.convenios.adicionar")}</button>
                          <button type="button" className="btn-ghost btn-small" onClick={() => { setSubcategoriaAberta(null); setNomeSubcategoria(""); }}>
                            {t("common.cancel")}
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button" className="sc-fin-subcat-add-trigger"
                          onClick={() => { setSubcategoriaAberta(cat.id); setNomeSubcategoria(""); }}
                        >
                          {t("saudeClinicas.financeiro.config.adicionarSubcategoria")}
                        </button>
                      )}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
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
