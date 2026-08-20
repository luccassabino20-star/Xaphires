import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents } from "./dinheiro.js";
import FluxoCaixaLancamentosModal from "./FluxoCaixaLancamentosModal.jsx";

const GRUPOS_RECEITA = ["receita_atendimento", "receita_produtos", "receita_outras"];
const GRUPOS_DESPESA = ["despesa_operacional", "despesa_financeira", "despesa_pessoal", "despesa_impostos", "despesa_outras"];

function primeiroDiaMesCivil(civil) {
  return civil.slice(0, 7) + "-01";
}
// Mesmo horário local do resto do módulo (repo.hojeCivil no servidor) - sem
// toISOString(), que parsearia em UTC e podia adiantar/atrasar um dia perto da
// virada.
function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Desloca `civil` em `n` meses, preservando o dia (grampeado ao último dia do mês
// alvo) - mesma aritmética de addMesesCivil no servidor (repo.js).
function addMesesCivil(civil, n) {
  const [y, m, d] = civil.split("-").map(Number);
  const alvo = new Date(y, m - 1 + n, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ultimoDia)).padStart(2, "0")}`;
}
// "diario" já rotula o dia (DD); "mensal" formata a chave YYYY-MM como "ago/26" no
// idioma de quem olha - mesmo raciocínio de nomesMeses em FluxoView.jsx.
function labelColuna(coluna, view, lang) {
  if (view === "diario") return coluna.label;
  const [ano, mes] = coluna.key.split("-").map(Number);
  const fmt = new Intl.DateTimeFormat(lang, { month: "short", year: "2-digit" });
  return fmt.format(new Date(ano, mes - 1, 1)).replace(".", "");
}

// Matriz DRE de caixa - uma linha por grupo fixo, uma coluna por mês/dia. Sobre o
// MESMO livro-razão das outras abas (financeiro_lancamentos/categorias/contas);
// não é uma segunda fonte de dinheiro, só outra apresentação (ver
// server/modules/financeiro/calculos.js montarFluxoCaixaMatriz).
export default function FluxoCaixaMatrizView() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();

  const [contas, setContas] = useState([]);
  const [contaId, setContaId] = useState("");
  const [view, setView] = useState("mensal");
  const [referencia, setReferencia] = useState(() => primeiroDiaMesCivil(hojeCivil()));
  const [matriz, setMatriz] = useState(null);
  const [erro, setErro] = useState("");
  const [drill, setDrill] = useState(null); // { grupo, grupoLabel, colunaLabel, de, ate }
  const [mapeando, setMapeando] = useState(false);
  // Reclassificar uma classe em "Mapear categorias" muda como os MESMOS
  // lançamentos se somam nos grupos, mas não mexe em view/referencia/contaId - sem
  // este contador a matriz continuaria mostrando a distribuição antiga até a
  // pessoa trocar de mês/conta por outro motivo. Incrementado só ao fechar o painel.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api.finListContas().then(setContas).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .finFluxoCaixaMatriz({ view, referencia, contaId: contaId || null })
      .then((m) => { setMatriz(m); setErro(""); })
      .catch((e) => setErro(translateError(e, t)));
  }, [view, referencia, contaId, refreshKey, t]);

  function trocarView(v) {
    setView(v);
    setReferencia((r) => primeiroDiaMesCivil(r));
  }

  async function exportar(formato) {
    try {
      await api.finFluxoCaixaExport({ view, referencia, contaId: contaId || null, formato, lang });
    } catch (e) {
      showToast(translateError(e, t));
    }
  }

  const gT = (grupo) => t(`financeiro.fluxoCaixa.grupo.${grupo}`);

  function abrirDrill(grupo, coluna) {
    setDrill({ grupo, grupoLabel: gT(grupo), colunaLabel: labelColuna(coluna, matriz.view, lang), de: coluna.de, ate: coluna.ate });
  }

  const periodoLabel = useMemo(() => {
    if (!matriz || !matriz.colunas.length) return "";
    if (view === "diario") {
      const [ano, mes] = referencia.split("-").map(Number);
      return new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(new Date(ano, mes - 1, 1));
    }
    const primeira = labelColuna(matriz.colunas[0], matriz.view, lang);
    const ultima = labelColuna(matriz.colunas[matriz.colunas.length - 1], matriz.view, lang);
    return `${primeira} – ${ultima}`;
  }, [matriz, view, referencia, lang]);

  return (
    <div className="fin-matriz">
      <div className="fin-matriz-topo">
        <select className="fin-matriz-select" value={contaId} onChange={(e) => setContaId(e.target.value)}>
          <option value="">{t("financeiro.fluxoCaixa.contaTodas")}</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>

        <div className="fin-matriz-toggle">
          <button type="button" className={"fin-matriz-toggle-btn" + (view === "mensal" ? " active" : "")} onClick={() => trocarView("mensal")}>
            {t("financeiro.fluxoCaixa.mensal")}
          </button>
          <button type="button" className={"fin-matriz-toggle-btn" + (view === "diario" ? " active" : "")} onClick={() => trocarView("diario")}>
            {t("financeiro.fluxoCaixa.diario")}
          </button>
        </div>

        <div className="fin-matriz-nav">
          <button type="button" className="btn-ghost btn-small" onClick={() => setReferencia((r) => addMesesCivil(r, -1))}>‹</button>
          <span className="fin-matriz-periodo">{periodoLabel}</span>
          <button type="button" className="btn-ghost btn-small" onClick={() => setReferencia((r) => addMesesCivil(r, 1))}>›</button>
        </div>

        <div className="fin-matriz-topo-acoes">
          <button type="button" className="btn-ghost btn-small" onClick={() => setMapeando(true)}>
            {t("financeiro.fluxoCaixa.mapearCategorias")}
          </button>
          <button type="button" className="btn-secondary btn-small" onClick={() => exportar("csv")}>{t("financeiro.fluxoCaixa.exportarCsv")}</button>
          <button type="button" className="btn-secondary btn-small" onClick={() => exportar("pdf")}>{t("financeiro.fluxoCaixa.exportarPdf")}</button>
          <button type="button" className="btn-secondary btn-small" onClick={() => exportar("xlsx")}>{t("financeiro.fluxoCaixa.exportarExcel")}</button>
        </div>
      </div>

      {erro && <div className="fin-error">{erro}</div>}

      {matriz && (
        <div className="fin-matriz-table-wrap">
          <table className="fin-matriz-table">
            <thead>
              <tr>
                <th className="fin-matriz-th-rotulo">{t("financeiro.fluxoCaixa.periodoColuna")}</th>
                {matriz.colunas.map((c) => (
                  <th key={c.key} className="fin-num">{labelColuna(c, matriz.view, lang)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <SecaoLinha label={t("financeiro.fluxoCaixa.secao.receitas")} colspan={matriz.colunas.length + 1} tom="receita" />
              {matriz.receitas.map((r) => (
                <LinhaGrupo key={r.grupo} tom="receita" label={gT(r.grupo)} linha={r} colunas={matriz.colunas} lang={lang} onClickCelula={(c) => abrirDrill(r.grupo, c)} />
              ))}
              <LinhaTotal label={t("financeiro.fluxoCaixa.totalReceitas")} valores={matriz.totalReceitas} colunas={matriz.colunas} lang={lang} tom="receita" />

              <SecaoLinha label={t("financeiro.fluxoCaixa.secao.despesas")} colspan={matriz.colunas.length + 1} tom="despesa" />
              {matriz.despesas.map((r) => (
                <LinhaGrupo key={r.grupo} tom="despesa" label={gT(r.grupo)} linha={r} colunas={matriz.colunas} lang={lang} onClickCelula={(c) => abrirDrill(r.grupo, c)} />
              ))}
              <LinhaTotal label={t("financeiro.fluxoCaixa.totalDespesas")} valores={matriz.totalDespesas} colunas={matriz.colunas} lang={lang} tom="despesa" />

              <SecaoLinha label={t("financeiro.fluxoCaixa.secao.transferencias")} colspan={matriz.colunas.length + 1} />
              {matriz.transferencias.map((r) => (
                <LinhaGrupo key={r.grupo} label={gT(r.grupo)} linha={r} colunas={matriz.colunas} lang={lang} onClickCelula={(c) => abrirDrill(r.grupo, c)} />
              ))}

              <SecaoLinha label={t("financeiro.fluxoCaixa.secao.resumo")} colspan={matriz.colunas.length + 1} />
              <LinhaTotal label={t("financeiro.fluxoCaixa.resumo.geracaoCaixa")} valores={matriz.resumo.geracaoCaixa} colunas={matriz.colunas} lang={lang} sinalizado />
              <LinhaTotal label={t("financeiro.fluxoCaixa.resumo.saldoAnterior")} valores={matriz.resumo.saldoAnterior} colunas={matriz.colunas} lang={lang} sinalizado />
              <LinhaTotal label={t("financeiro.fluxoCaixa.resumo.saldoFinal")} valores={matriz.resumo.saldoFinal} colunas={matriz.colunas} lang={lang} sinalizado destaque />
            </tbody>
          </table>
        </div>
      )}

      {drill && (
        <FluxoCaixaLancamentosModal
          grupo={drill.grupo}
          grupoLabel={drill.grupoLabel}
          colunaLabel={drill.colunaLabel}
          de={drill.de}
          ate={drill.ate}
          contaId={contaId || null}
          onClose={() => setDrill(null)}
        />
      )}

      {mapeando && <MapearCategoriasModal onClose={() => { setMapeando(false); setRefreshKey((k) => k + 1); }} />}
    </div>
  );
}

function SecaoLinha({ label, colspan, tom }) {
  return (
    <tr className={"fin-matriz-secao" + (tom ? ` fin-matriz-tom-${tom}` : "")}>
      <td colSpan={colspan}>{label}</td>
    </tr>
  );
}

function LinhaGrupo({ label, linha, colunas, lang, tom, onClickCelula }) {
  return (
    <tr className={"fin-matriz-linha" + (tom ? ` fin-matriz-tom-${tom}` : "")}>
      <td className="fin-matriz-th-rotulo">{label}</td>
      {colunas.map((c) => {
        const v = linha.valores[c.key] || 0;
        return (
          <td key={c.key} className="fin-num fin-matriz-celula" onClick={() => onClickCelula(c)} role="button" tabIndex={0}>
            {formatCents(v, lang)}
          </td>
        );
      })}
    </tr>
  );
}

function LinhaTotal({ label, valores, colunas, lang, tom, sinalizado, destaque }) {
  return (
    <tr className={"fin-matriz-total" + (tom ? ` fin-matriz-tom-${tom}` : "") + (destaque ? " fin-matriz-total-destaque" : "")}>
      <td className="fin-matriz-th-rotulo">{label}</td>
      {colunas.map((c) => {
        const v = valores[c.key] || 0;
        const cor = sinalizado ? (v >= 0 ? " fin-matriz-positivo" : " fin-matriz-negativo") : "";
        return (
          <td key={c.key} className={"fin-num" + cor}>{formatCents(v, lang)}</td>
        );
      })}
    </tr>
  );
}

// Painel "Mapear categorias": lista as classes já cadastradas (aba Cadastros) e
// deixa classificar cada uma num dos 8 grupos fixos do DRE de caixa. Reaproveita
// os endpoints de classe que já existem (finListCategorias/finUpdateCategoria/
// finCreateCategoria) - o campo grupoDre é só mais um atributo da classe.
function MapearCategoriasModal({ onClose }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [categorias, setCategorias] = useState(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState({ nome: "", tipo: "receita", grupoDre: "" });

  async function carregar() {
    try {
      setCategorias(await api.finListCategorias(i18n.language));
      setErro("");
    } catch (e) {
      setErro(translateError(e, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  async function mudarGrupo(id, grupoDre) {
    try {
      await api.finUpdateCategoria(id, { grupoDre: grupoDre || null });
      await carregar();
    } catch (e) {
      showToast(translateError(e, t));
    }
  }

  async function adicionar(e) {
    e.preventDefault();
    if (!novo.nome.trim()) return;
    try {
      await api.finCreateCategoria({ nome: novo.nome.trim(), tipo: novo.tipo, grupoDre: novo.grupoDre || null });
      setNovo({ nome: "", tipo: "receita", grupoDre: "" });
      await carregar();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  const gruposDoTipo = (tipo) => (tipo === "receita" ? GRUPOS_RECEITA : GRUPOS_DESPESA);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal fin-matriz-categorias-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
        <h3 className="fin-matriz-modal-titulo">{t("financeiro.fluxoCaixa.categorias.titulo")}</h3>
        <p className="fin-matriz-hint">{t("financeiro.fluxoCaixa.categorias.hint")}</p>

        {erro && <div className="fin-error">{erro}</div>}

        {!categorias ? (
          <p className="fin-matriz-hint">{t("common.loading")}</p>
        ) : (
          <div className="fin-matriz-categorias-lista">
            {categorias.map((cat) => (
              <div key={cat.id} className="fin-matriz-categoria-linha">
                <span className={"fin-badge" + (cat.tipo === "receita" ? " fin-matriz-tom-receita" : " fin-matriz-tom-despesa")}>
                  {t(`financeiro.fluxoCaixa.categorias.tipo${cat.tipo === "receita" ? "Receita" : "Despesa"}`)}
                </span>
                <span className="fin-matriz-categoria-nome">{cat.nome}</span>
                <select value={cat.grupo_dre || ""} onChange={(e) => mudarGrupo(cat.id, e.target.value)}>
                  <option value="">{t("financeiro.fluxoCaixa.categorias.semGrupo")}</option>
                  {gruposDoTipo(cat.tipo).map((g) => (
                    <option key={g} value={g}>{t(`financeiro.fluxoCaixa.grupo.${g}`)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        <form className="fin-matriz-categoria-nova" onSubmit={adicionar}>
          <h4 className="fin-matriz-categoria-nova-titulo">{t("financeiro.fluxoCaixa.categorias.novaCategoria")}</h4>
          <div className="fin-matriz-categoria-nova-linha">
            <input
              type="text"
              placeholder={t("financeiro.fluxoCaixa.categorias.nomePlaceholder")}
              value={novo.nome}
              onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))}
            />
            <select value={novo.tipo} onChange={(e) => setNovo((n) => ({ ...n, tipo: e.target.value, grupoDre: "" }))}>
              <option value="receita">{t("financeiro.fluxoCaixa.categorias.tipoReceita")}</option>
              <option value="despesa">{t("financeiro.fluxoCaixa.categorias.tipoDespesa")}</option>
            </select>
            <select value={novo.grupoDre} onChange={(e) => setNovo((n) => ({ ...n, grupoDre: e.target.value }))}>
              <option value="">{t("financeiro.fluxoCaixa.categorias.semGrupo")}</option>
              {gruposDoTipo(novo.tipo).map((g) => (
                <option key={g} value={g}>{t(`financeiro.fluxoCaixa.grupo.${g}`)}</option>
              ))}
            </select>
            <button type="submit" className="btn-primary btn-small">{t("financeiro.fluxoCaixa.categorias.adicionar")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
