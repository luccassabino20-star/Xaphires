import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { centsOuZero, formatPercent } from "./dinheiro.js";
import ContatosView from "./ContatosView.jsx";
import ContasCorrentesView from "./ContasCorrentesView.jsx";

// Cadastros de apoio do Financeiro, organizados em sidebar por categoria (o
// mesmo agrupamento do menu "Cadastros Básicos" do SIGIM). Só 6 itens são reais
// hoje - os outros aparecem no lugar certo da hierarquia como "Em breve",
// desabilitados: a informação já fica organizada antes de cada tela existir.
const GRUPOS_CADASTRO = [
  { id: "organizacional", itens: [
    { id: "empresa_unidades", live: false },
    { id: "centros", live: true },
    { id: "tabelas_basicas", live: false },
    { id: "feriados", live: false },
  ]},
  { id: "financeira", itens: [
    { id: "classes", live: true },
    { id: "formas_pagto", live: false },
    { id: "contas", live: true },
    { id: "indices", live: false },
  ]},
  { id: "fiscal", itens: [
    { id: "impostos", live: true },
    { id: "sped", live: true },
  ]},
  { id: "fornecedores", itens: [
    { id: "contatos", live: true },
    { id: "avaliacao_fornecedores", live: false },
    { id: "qualificacao_fornecedores", live: false },
  ]},
  { id: "operacional", itens: [
    { id: "tipos_movimento", live: false },
    { id: "tipos_compromisso", live: false },
    { id: "tipos_rateio", live: false },
    { id: "motivos_cancelamento", live: false },
  ]},
  { id: "taxas", itens: [
    { id: "taxas_desc", live: false },
    { id: "taxas_caract", live: false },
    { id: "taxas_regras", live: false },
  ]},
];

export default function CadastrosView({ onEmitirCobranca, onVerExtrato }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();
  const [selecionado, setSelecionado] = useState("contas");

  const [contas, setContas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [classes, setClasses] = useState([]);
  const [contatos, setContatos] = useState([]);
  const [impostos, setImpostos] = useState([]);
  const [codigosServico, setCodigosServico] = useState([]);
  const [erro, setErro] = useState("");

  async function carregar() {
    try {
      const [c1, c2, c3, c4, c5, c6] = await Promise.all([
        api.finListContas(), api.finListCentrosCusto(), api.finListCategorias(lang), api.finListContatos(),
        api.finListImpostos(), api.finListCodigosServico(),
      ]);
      setContas(c1); setCentros(c2); setClasses(c3); setContatos(c4); setImpostos(c5); setCodigosServico(c6); setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  // Cria um cadastro novo.
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
  // Edita um existente - mesmo aviso de sucesso do criar (o texto já é
  // genérico o bastante: "Cadastro salvo" vale para os dois). aoTerminar sai
  // do modo edição no formulário; para o toggle de ativo/inativo (que não usa
  // formulário) basta passar um no-op.
  async function editar(fn, id, dados, aoTerminar) {
    try {
      await fn(id, dados);
      showToast(t("financeiro.cad.criado"));
      aoTerminar();
      await carregar();
    } catch (e) {
      alert(translateError(e, t));
    }
  }
  // Exclusão de verdade do contato (diferente do resto do Financeiro, que só
  // desativa) - o servidor recusa com FIN_CONTATO_EM_USO se houver lançamento ou
  // cobrança referenciando o id; a mensagem traduzida já explica e sugere desativar.
  async function excluirContato(id) {
    await api.finDeleteContato(id);
    showToast(t("financeiro.contatos.excluido"));
    await carregar();
  }
  // Sem o wrapper de fn/dados/limpar do criar/editar genéricos acima: o modal de
  // contato (NovoContatoModal) chama isto direto e trata o erro inline no
  // formulário (a lista de sucesso do resto do Financeiro usa alert()/toast, mas
  // aqui o erro precisa aparecer perto do campo, não escondido atrás do modal).
  async function criarContato(dados) {
    await api.finCreateContato(dados);
    showToast(t("financeiro.cad.criado"));
    await carregar();
  }
  async function editarContato(id, dados) {
    await api.finUpdateContato(id, dados);
    showToast(t("financeiro.cad.criado"));
    await carregar();
  }
  // Mesmo desenho de criarContato/editarContato: o modal de conta bancária
  // (NovaContaBancariaModal) chama direto e mostra o erro inline.
  async function criarConta(dados) {
    await api.finCreateConta(dados);
    showToast(t("financeiro.cad.criado"));
    await carregar();
  }
  async function editarConta(id, dados) {
    await api.finUpdateConta(id, dados);
    showToast(t("financeiro.cad.criado"));
    await carregar();
  }

  return (
    <div className="fin-cad-layout">
      <nav className="fin-cad-nav">
        {GRUPOS_CADASTRO.map((g) => (
          <div className="fin-cad-grupo" key={g.id}>
            <div className="fin-cad-grupo-titulo">{t("financeiro.cad.grupos." + g.id)}</div>
            {g.itens.map((it) => (
              <button
                key={it.id}
                type="button"
                className={"fin-cad-item" + (selecionado === it.id ? " active" : "") + (!it.live ? " disabled" : "")}
                onClick={() => it.live && setSelecionado(it.id)}
                disabled={!it.live}
              >
                <span>{t("financeiro.cad." + it.id)}</span>
                {!it.live && <span className="fin-cad-em-breve">{t("modules.comingSoon")}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="fin-cad-content">
        {erro && <div className="fin-error">{erro}</div>}
        {selecionado === "contas" && (
          <ContasCorrentesView
            contas={contas}
            lang={lang}
            onCriar={criarConta}
            onEditar={editarConta}
            onVerExtrato={onVerExtrato}
          />
        )}
        {selecionado === "centros" && <SecaoCentros centros={centros} onCriar={criar} onEditar={editar} onChanged={carregar} />}
        {selecionado === "classes" && <SecaoClasses classes={classes} onCriar={criar} onEditar={editar} onChanged={carregar} />}
        {selecionado === "contatos" && (
          <ContatosView
            contatos={contatos}
            onCriar={criarContato}
            onEditar={editarContato}
            onExcluir={excluirContato}
            onEmitirCobranca={onEmitirCobranca}
          />
        )}
        {selecionado === "impostos" && <SecaoImpostos impostos={impostos} lang={lang} onCriar={criar} onEditar={editar} />}
        {selecionado === "sped" && <SecaoCodigosServico codigos={codigosServico} onCriar={criar} onEditar={editar} />}
      </div>
    </div>
  );
}

// Ordena uma lista plana pela árvore do código pontilhado (1.10 vem depois de
// 1.2, por isso a comparação é numérica nível a nível). Código vazio ou não
// numérico cai para o fim, ordenado por nome - assim classe sem código de plano
// de contas ainda aparece, só não entra na hierarquia. Centro de custo já chega
// ordenado do servidor; classe não, então precisa disto para a árvore ficar
// contígua (pai seguido dos filhos), sem o que o recolher escondia linhas soltas.
function ordenarPorCodigo(linhas) {
  const partes = (c) => String(c || "").split(".").map((n) => Number(n));
  const numerico = (c) => c && partes(c).every((n) => Number.isFinite(n));
  return [...linhas].sort((a, b) => {
    const na = numerico(a.codigo), nb = numerico(b.codigo);
    if (!na && !nb) return String(a.nome || "").localeCompare(String(b.nome || ""));
    if (!na) return 1;
    if (!nb) return -1;
    const pa = partes(a.codigo), pb = partes(b.codigo);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const da = pa[i] ?? -1, db = pb[i] ?? -1;
      if (da !== db) return da - db;
    }
    return 0;
  });
}

// Recolher/expandir uma árvore por código pontilhado, compartilhado por Centros
// de custo e Classes - os dois usam o mesmo esquema "pai.filho" (1.02 é pai de
// 1.02.01). Devolve só as linhas visíveis (escondendo descendentes de um nó
// recolhido), quem tem filho (ganha o +/-), o estado e o toggle. A lista já
// precisa vir ordenada pela árvore (ver ordenarPorCodigo).
function useArvoreColapsavel(linhas) {
  const [recolhidos, setRecolhidos] = useState(() => new Set());
  // Todos os códigos que EXISTEM como linha. Um pai só conta se estiver aqui: a
  // classe semeada usa "3.01"/"4.02" sem uma linha "3"/"4" (esses são só os
  // grupos lógicos receita/despesa), e tratar "3" como pai recolhível sumia com
  // a lista inteira. Centro de custo sempre tem a cadeia completa (o servidor
  // exige o pai antes do filho), então nada muda para ele.
  const codigos = useMemo(() => new Set(linhas.map((x) => String(x.codigo || ""))), [linhas]);
  // Ancestrais que existem como linha, do mais raso ao mais fundo.
  const ancestrais = (cod) => {
    const p = String(cod || "").split(".");
    const out = [];
    for (let i = 1; i < p.length; i++) {
      const a = p.slice(0, i).join(".");
      if (codigos.has(a)) out.push(a);
    }
    return out;
  };
  // Nós que têm filho (sintético), considerando só o pai que existe como linha.
  const comFilho = useMemo(() => {
    const set = new Set();
    for (const x of linhas) {
      const cod = String(x.codigo || "");
      const pai = cod.split(".").slice(0, -1).join(".");
      if (pai && codigos.has(pai)) set.add(pai);
    }
    return set;
  }, [linhas, codigos]);
  // Nós que têm ao menos um filho ANALÍTICO (folha). Folha = código que não é pai
  // de ninguém. São exatamente os nós que, recolhidos por padrão, escondem as
  // folhas e deixam só o esqueleto sintético à mostra - o resto dos sintéticos
  // (cujos filhos são sintéticos) nasce aberto, mostrando a estrutura.
  const comFilhoAnalitico = useMemo(() => {
    const set = new Set();
    for (const x of linhas) {
      const cod = String(x.codigo || "");
      if (comFilho.has(cod)) continue; // este é sintético, não é folha
      const pai = cod.split(".").slice(0, -1).join(".");
      if (pai && codigos.has(pai)) set.add(pai);
    }
    return set;
  }, [linhas, comFilho, codigos]);
  // A árvore NASCE mostrando só os sintéticos: na primeira carga (a lista começa
  // vazia e só popula depois do fetch) recolho os nós com filho analítico, então
  // as folhas ficam escondidas atrás do + do pai. Só uma vez - depois disso o
  // estado é do usuário, então recarregar ou incluir um centro não reabre o que
  // ele fechou nem fecha o que ele abriu.
  const inicializado = useRef(false);
  useEffect(() => {
    if (inicializado.current || comFilho.size === 0) return;
    inicializado.current = true;
    setRecolhidos(new Set(comFilhoAnalitico));
  }, [comFilho, comFilhoAnalitico]);
  const visiveis = linhas.filter((x) => !ancestrais(x.codigo).some((a) => recolhidos.has(a)));
  const toggle = (cod) => setRecolhidos((prev) => {
    const next = new Set(prev);
    next.has(cod) ? next.delete(cod) : next.add(cod);
    return next;
  });
  return {
    visiveis,
    temFilho: (cod) => comFilho.has(String(cod || "")),
    recolhido: (cod) => recolhidos.has(String(cod || "")),
    // Indentação pela profundidade REAL na árvore (ancestrais que existem), não
    // pela contagem de pontos - senão "3.01" sem um "3" apareceria indentado
    // como se pendurado num pai invisível.
    nivel: (cod) => ancestrais(cod).length,
    toggle,
  };
}

// Célula de código com o botão +/- de recolher (só em nó com filho; folha ganha
// um espaçador do mesmo tamanho para o texto alinhar) e a indentação por nível.
function CelulaCodigo({ arvore, x }) {
  const { t } = useTranslation();
  const cod = String(x.codigo || "");
  const nivel = x.nivel ?? arvore.nivel(cod);
  return (
    <span className="fin-cc-codigo" style={{ paddingLeft: nivel * 16 }}>
      {arvore.temFilho(cod) ? (
        <button
          type="button" className="fin-tree-toggle" onClick={() => arvore.toggle(cod)}
          aria-label={arvore.recolhido(cod) ? t("financeiro.cad.expandir") : t("financeiro.cad.recolher")}
          title={arvore.recolhido(cod) ? t("financeiro.cad.expandir") : t("financeiro.cad.recolher")}
        >
          {arvore.recolhido(cod) ? "+" : "−"}
        </button>
      ) : (
        <span className="fin-tree-spacer" aria-hidden="true" />
      )}
      {x.codigo || "-"}
    </span>
  );
}

// Centro de custo HIERÁRQUICO, editável pela própria empresa. O código define a
// árvore (ex.: 1.02.01) e o pai é derivado dele - o pai precisa existir antes, e
// ao ganhar um filho vira sintético (deixa de receber lançamento). O código não é
// editável (mudá-lo renomearia a subárvore). A tabela global é compartilhada com
// o painel da plataforma, mas cada empresa só enxerga/edita os seus.
function SecaoCentros({ centros, onCriar, onEditar, onChanged }) {
  const { t } = useTranslation();
  // Centro já chega ordenado pela árvore do servidor; o hook cuida do recolher.
  const arvore = useArvoreColapsavel(centros);
  const vazio = { codigo: "", nome: "" };
  const [f, setF] = useState(vazio);
  const [editandoId, setEditandoId] = useState(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [importErro, setImportErro] = useState("");
  // Confirmação INLINE (id do centro, ou "TUDO"): não usamos window.confirm porque
  // o navegador pode suprimir diálogos repetidos e cancelá-los em silêncio - aí o
  // "Excluir" parecia não fazer nada. Aqui o Sim/Não fica na própria tela.
  const [confirmar, setConfirmar] = useState(null);
  function editar(x) { setEditandoId(x.id); setF({ codigo: x.codigo || "", nome: x.nome }); }
  function cancelar() { setEditandoId(null); setF(vazio); }

  async function escolherExcel(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportErro(""); setResultado(null); setImportando(true);
    try {
      const r = await api.finImportarCentros(file);
      setResultado(r);
      onChanged?.();
    } catch (err) {
      setImportErro(translateError(err, t));
    } finally {
      setImportando(false);
    }
  }
  async function baixarModelo() {
    setImportErro("");
    try { await api.finBaixarModeloCentros(); } catch (err) { setImportErro(translateError(err, t)); }
  }
  async function fazerExcluir(x) {
    setConfirmar(null); setImportErro(""); setResultado(null);
    try { await api.finDeleteCentroCusto(x.id); onChanged?.(); } catch (err) { setImportErro(translateError(err, t)); }
  }
  async function fazerExcluirTudo() {
    setConfirmar(null); setImportErro(""); setResultado(null);
    try { await api.finExcluirTodosCentros(); onChanged?.(); } catch (err) { setImportErro(translateError(err, t)); }
  }
  const ConfirmInline = ({ onSim }) => (
    <span className="fin-cc-confirm">
      <span className="fin-cc-confirm-txt">{t("financeiro.cad.confirmar")}</span>
      <button type="button" className="btn-danger btn-small" onClick={onSim}>{t("financeiro.cad.sim")}</button>
      <button type="button" className="btn-ghost btn-small" onClick={() => setConfirmar(null)}>{t("financeiro.cad.nao")}</button>
    </span>
  );

  return (
    <div className="fin-cad-secao">
      <p className="fin-cad-hint">{t("financeiro.cad.centrosHint")}</p>

      <div className="fin-cc-import">
        <label className={"btn-secondary btn-small fin-importar-file" + (importando ? " is-disabled" : "")}>
          {importando ? t("financeiro.importar.lendo") : t("financeiro.cad.importarExcel")}
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={escolherExcel} disabled={importando} hidden />
        </label>
        <button type="button" className="btn-ghost btn-small" onClick={baixarModelo}>{t("financeiro.cad.baixarModelo")}</button>
        {centros.length > 0 && (
          confirmar === "TUDO" ? (
            <span className="fin-cc-excluir-tudo"><ConfirmInline onSim={fazerExcluirTudo} /></span>
          ) : (
            <button type="button" className="btn-ghost btn-small fin-cad-excluir fin-cc-excluir-tudo" onClick={() => setConfirmar("TUDO")}>{t("financeiro.cad.excluirTudo")}</button>
          )
        )}
      </div>
      {importErro && <div className="fin-error">{importErro}</div>}
      {resultado && (
        <div className="fin-cc-import-res">
          <div>{t("financeiro.cad.importResultado", { criados: resultado.criados, ignorados: resultado.ignorados, erros: resultado.erros })}</div>
          {resultado.erros > 0 && (
            <ul className="fin-cc-import-erros">
              {resultado.resultados.filter((r) => r.status === "erro").map((r) => (
                <li key={r.row}>{t("financeiro.cad.importLinha", { row: r.row, codigo: r.codigo })} - {translateError({ code: r.code, message: r.motivo }, t)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form
        className="fin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.nome.trim()) return;
          if (editandoId) onEditar(api.finUpdateCentroCusto, editandoId, { nome: f.nome.trim() }, cancelar);
          else onCriar(api.finCreateCentroCusto, { codigo: f.codigo.trim(), nome: f.nome.trim() }, () => setF(vazio));
        }}
      >
        <input
          type="text" placeholder={t("financeiro.cad.codigo")} value={f.codigo}
          disabled={!!editandoId} title={editandoId ? t("financeiro.cad.codigoTravado") : undefined}
          onChange={(e) => setF({ ...f, codigo: e.target.value })}
        />
        <input type="text" placeholder={t("financeiro.cad.nome")} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <button type="submit" className="btn-primary btn-small">{editandoId ? t("common.save") : t("financeiro.form.adicionar")}</button>
        {editandoId && <button type="button" className="btn-ghost btn-small" onClick={cancelar}>{t("common.cancel")}</button>}
      </form>
      <Tabela vazio={t("financeiro.vazio")} linhas={arvore.visiveis} colunas={[
        { h: t("financeiro.cad.codigo"), c: (x) => <CelulaCodigo arvore={arvore} x={x} /> },
        { h: t("financeiro.cad.nome"), c: (x) => x.nome },
        { h: t("financeiro.cad.tipo"), c: (x) => t("financeiro.cad." + (x.tipo === "sintetico" ? "sintetico" : "analitico")) },
        { h: "", c: (x) => confirmar === x.id ? (
          <ConfirmInline onSim={() => fazerExcluir(x)} />
        ) : (
          <AcoesCadastro x={x} onEditar={() => editar(x)} onToggle={() => onEditar(api.finUpdateCentroCusto, x.id, { ativo: !x.ativo }, () => {})} onExcluir={() => setConfirmar(x.id)} />
        ) },
      ]} />
    </div>
  );
}

function SecaoClasses({ classes, onCriar, onEditar, onChanged }) {
  const { t } = useTranslation();
  // O servidor devolve a classe por tipo/nome; para recolher a árvore do plano de
  // contas (4, 4.08, 4.08.01) reordeno por código aqui, no cliente.
  const ordenadas = useMemo(() => ordenarPorCodigo(classes), [classes]);
  const arvore = useArvoreColapsavel(ordenadas);
  const vazio = { nome: "", tipo: "despesa", codigo: "" };
  const [f, setF] = useState(vazio);
  const [editandoId, setEditandoId] = useState(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [importErro, setImportErro] = useState("");
  function editar(x) { setEditandoId(x.id); setF({ nome: x.nome, tipo: x.tipo, codigo: x.codigo || "" }); }
  function cancelar() { setEditandoId(null); setF(vazio); }
  async function escolherExcel(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportErro(""); setResultado(null); setImportando(true);
    try {
      const r = await api.finImportarCategorias(file);
      setResultado(r);
      onChanged?.();
    } catch (err) {
      setImportErro(translateError(err, t));
    } finally {
      setImportando(false);
    }
  }
  async function baixarModelo() {
    setImportErro("");
    try { await api.finBaixarModeloCategorias(); } catch (err) { setImportErro(translateError(err, t)); }
  }
  return (
    <div className="fin-cad-secao">
      <div className="fin-cc-import">
        <label className={"btn-secondary btn-small fin-importar-file" + (importando ? " is-disabled" : "")}>
          {importando ? t("financeiro.importar.lendo") : t("financeiro.cad.importarExcel")}
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={escolherExcel} disabled={importando} hidden />
        </label>
        <button type="button" className="btn-ghost btn-small" onClick={baixarModelo}>{t("financeiro.cad.baixarModelo")}</button>
      </div>
      {importErro && <div className="fin-error">{importErro}</div>}
      {resultado && (
        <div className="fin-cc-import-res">
          <div>{t("financeiro.cad.importResultado", { criados: resultado.criados, ignorados: resultado.ignorados, erros: resultado.erros })}</div>
          {resultado.erros > 0 && (
            <ul className="fin-cc-import-erros">
              {resultado.resultados.filter((r) => r.status === "erro").map((r) => (
                <li key={r.row}>{t("financeiro.cad.importLinha", { row: r.row, codigo: r.codigo })} - {translateError({ code: r.code, message: r.motivo }, t)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <form
        className="fin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.nome.trim()) return;
          const dados = { nome: f.nome.trim(), tipo: f.tipo, codigo: f.codigo };
          if (editandoId) onEditar(api.finUpdateCategoria, editandoId, dados, cancelar);
          else onCriar(api.finCreateCategoria, dados, () => setF(vazio));
        }}
      >
        <input type="text" placeholder={t("financeiro.cad.codigo")} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
        <input type="text" placeholder={t("financeiro.cad.nome")} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
          <option value="receita">{t("financeiro.dre.receitas")}</option>
          <option value="despesa">{t("financeiro.dre.despesas")}</option>
        </select>
        <button type="submit" className="btn-primary btn-small">{editandoId ? t("common.save") : t("financeiro.form.adicionar")}</button>
        {editandoId && <button type="button" className="btn-ghost btn-small" onClick={cancelar}>{t("common.cancel")}</button>}
      </form>
      <Tabela vazio={t("financeiro.vazio")} linhas={arvore.visiveis} colunas={[
        { h: t("financeiro.cad.codigo"), c: (x) => <CelulaCodigo arvore={arvore} x={x} /> },
        { h: t("financeiro.cad.nome"), c: (x) => x.nome },
        { h: t("financeiro.cad.tipo"), c: (x) => (x.tipo === "receita" ? t("financeiro.dre.receitas") : t("financeiro.dre.despesas")) },
        { h: "", c: (x) => <AcoesCadastro x={x} onEditar={() => editar(x)} onToggle={() => onEditar(api.finUpdateCategoria, x.id, { ativo: !x.ativo }, () => {})} /> },
      ]} />
    </div>
  );
}

function SecaoImpostos({ impostos, lang, onCriar, onEditar }) {
  const { t } = useTranslation();
  const vazio = { nome: "", codigo: "", aliquota: "", tipo: "retido" };
  const [f, setF] = useState(vazio);
  const [editandoId, setEditandoId] = useState(null);
  const rotuloTipo = (tp) => t(`financeiro.cad.imposto_tipo_${tp}`);
  function editar(x) { setEditandoId(x.id); setF({ nome: x.nome, codigo: x.codigo || "", aliquota: String((x.aliquota_centesimos || 0) / 100), tipo: x.tipo }); }
  function cancelar() { setEditandoId(null); setF(vazio); }
  return (
    <div className="fin-cad-secao">
      <form
        className="fin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.nome.trim()) return;
          const dados = { nome: f.nome.trim(), codigo: f.codigo, aliquotaCentesimos: centsOuZero(f.aliquota), tipo: f.tipo };
          if (editandoId) onEditar(api.finUpdateImposto, editandoId, dados, cancelar);
          else onCriar(api.finCreateImposto, dados, () => setF(vazio));
        }}
      >
        <input type="text" placeholder={t("financeiro.cad.codigo")} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
        <input type="text" placeholder={t("financeiro.cad.nome")} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <input type="number" step="0.01" min="0" max="100" placeholder={t("financeiro.cad.aliquota")} value={f.aliquota} onChange={(e) => setF({ ...f, aliquota: e.target.value })} />
        <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
          <option value="retido">{rotuloTipo("retido")}</option>
          <option value="acrescido">{rotuloTipo("acrescido")}</option>
        </select>
        <button type="submit" className="btn-primary btn-small">{editandoId ? t("common.save") : t("financeiro.form.adicionar")}</button>
        {editandoId && <button type="button" className="btn-ghost btn-small" onClick={cancelar}>{t("common.cancel")}</button>}
      </form>
      <Tabela vazio={t("financeiro.vazio")} linhas={impostos} colunas={[
        { h: t("financeiro.cad.codigo"), c: (x) => x.codigo || "-" },
        { h: t("financeiro.cad.nome"), c: (x) => x.nome },
        { h: t("financeiro.cad.aliquota"), c: (x) => formatPercent(x.aliquota_centesimos, lang), num: true },
        { h: t("financeiro.cad.tipo"), c: (x) => rotuloTipo(x.tipo) },
        { h: "", c: (x) => <AcoesCadastro x={x} onEditar={() => editar(x)} onToggle={() => onEditar(api.finUpdateImposto, x.id, { ativo: !x.ativo }, () => {})} /> },
      ]} />
    </div>
  );
}

function SecaoCodigosServico({ codigos, onCriar, onEditar }) {
  const { t } = useTranslation();
  const vazio = { codigo: "", descricao: "" };
  const [f, setF] = useState(vazio);
  const [editandoId, setEditandoId] = useState(null);
  function editar(x) { setEditandoId(x.id); setF({ codigo: x.codigo, descricao: x.descricao }); }
  function cancelar() { setEditandoId(null); setF(vazio); }
  return (
    <div className="fin-cad-secao">
      <p className="fin-cad-hint">{t("financeiro.cad.spedHint")}</p>
      <form
        className="fin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.codigo.trim() || !f.descricao.trim()) return;
          const dados = { codigo: f.codigo.trim(), descricao: f.descricao.trim() };
          if (editandoId) onEditar(api.finUpdateCodigoServico, editandoId, dados, cancelar);
          else onCriar(api.finCreateCodigoServico, dados, () => setF(vazio));
        }}
      >
        <input type="text" placeholder={t("financeiro.cad.codigo")} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
        <input type="text" placeholder={t("financeiro.cad.descricao")} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        <button type="submit" className="btn-primary btn-small">{editandoId ? t("common.save") : t("financeiro.form.adicionar")}</button>
        {editandoId && <button type="button" className="btn-ghost btn-small" onClick={cancelar}>{t("common.cancel")}</button>}
      </form>
      <Tabela vazio={t("financeiro.vazio")} linhas={codigos} colunas={[
        { h: t("financeiro.cad.codigo"), c: (x) => x.codigo },
        { h: t("financeiro.cad.descricao"), c: (x) => x.descricao },
        { h: "", c: (x) => <AcoesCadastro x={x} onEditar={() => editar(x)} onToggle={() => onEditar(api.finUpdateCodigoServico, x.id, { ativo: !x.ativo }, () => {})} /> },
      ]} />
    </div>
  );
}

// Botões de ação de uma linha de cadastro: Editar (carrega no formulário de
// cima) e Ativar/Desativar (soft-delete - nenhum cadastro do Financeiro tem
// exclusão de verdade, porque um lançamento antigo pode referenciar o id).
function AcoesCadastro({ x, onEditar, onToggle, onExcluir }) {
  const { t } = useTranslation();
  return (
    <span className="fin-cad-acoes">
      <button type="button" className="btn-ghost btn-small" onClick={onEditar}>{t("financeiro.cad.editar")}</button>
      <button type="button" className="btn-ghost btn-small" onClick={onToggle}>
        {x.ativo === 0 ? t("financeiro.cad.ativar") : t("financeiro.cad.desativar")}
      </button>
      {onExcluir && (
        <button type="button" className="btn-ghost btn-small fin-cad-excluir" onClick={onExcluir}>{t("financeiro.cad.excluir")}</button>
      )}
    </span>
  );
}

// Tabelinha genérica para as listas dos cadastros.
function Tabela({ linhas, colunas, vazio }) {
  return (
    <div className="fin-table-wrap">
      <table className="fin-table">
        <thead>
          <tr>{colunas.map((col, i) => <th key={col.h || i} className={col.num ? "fin-num" : undefined}>{col.h}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr><td colSpan={colunas.length} className="fin-empty">{vazio}</td></tr>
          ) : (
            linhas.map((x) => (
              <tr key={x.id} className={x.ativo === 0 ? "fin-row-pago" : ""}>
                {colunas.map((col, i) => <td key={col.h || i} className={col.num ? "fin-num" : undefined}>{col.c(x)}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
