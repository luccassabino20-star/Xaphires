import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents, liquidoDoLancamento } from "./dinheiro.js";
import { rotuloConta, detalheConta } from "./rotulo.js";
import SearchSelect from "./SearchSelect.jsx";
import LancamentoManualModal from "./LancamentoManualModal.jsx";

// "Hoje" e "primeiro dia do mês" em data civil YYYY-MM-DD no horário local - os
// mesmos formatos que o <input type="date"> produz e que o backend espera.
function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inicioDoMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// Movimentação = o EXTRATO de uma conta, agora com FILTRO MANUAL por período: a
// tela não busca nada ao entrar nem ao trocar a conta. O usuário escolhe conta e
// intervalo e clica em Filtrar; só então vêm a lista e os cinco saldos, todos
// calculados no servidor (calculos.montarMovimentacao) - o cliente só desenha.
export default function MovimentacaoView() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);

  const [contatos, setContatos] = useState([]);
  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(true); // carga inicial (só cadastros)
  const [erro, setErro] = useState("");

  // Filtros do formulário (o que o usuário está montando).
  const [contaId, setContaId] = useState("");
  const [de, setDe] = useState(inicioDoMes());
  const [ate, setAte] = useState(hojeCivil());
  const [incluirEstornados, setIncluirEstornados] = useState(false);

  // Resultado da última busca e os filtros que a geraram (o "aplicado"). Guardo os
  // filtros aplicados à parte para que conferir/estornar rebusquem com eles, e não
  // com o formulário que o usuário talvez já tenha começado a mudar.
  const [resultado, setResultado] = useState(null);
  const [aplicado, setAplicado] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [manualAberto, setManualAberto] = useState(false);

  async function carregarCadastros() {
    setCarregando(true);
    try {
      const [cts, cos] = await Promise.all([api.finListContatos(), api.finListContas()]);
      setContatos(cts); setContas(cos); setErro("");
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregarCadastros(); /* eslint-disable-next-line */ }, []);

  const contatoById = useMemo(() => Object.fromEntries(contatos.map((c) => [c.id, c])), [contatos]);
  const contasAtivas = useMemo(() => contas.filter((c) => c.ativo === 1), [contas]);
  const contaOpts = useMemo(() => contasAtivas.map((c) => ({ id: c.id, label: rotuloConta(c) })), [contasAtivas]);
  const contaSel = useMemo(() => contasAtivas.find((c) => c.id === contaId) || null, [contasAtivas, contaId]);
  useEffect(() => { if (!contaId && contasAtivas.length) setContaId(contasAtivas[0].id); }, [contasAtivas, contaId]);

  const nomeContraparte = (l) => contatoById[l.contato_id]?.nome || l.contraparte || "-";

  // Busca sob demanda: valida e chama a API. Usada pelo botão Filtrar (com o
  // formulário atual) e pelas ações da tabela (com os filtros já aplicados).
  async function buscar(filtros) {
    if (!filtros.contaId) { setErro(t("financeiro.mov.selecioneConta")); return; }
    if (!filtros.de || !filtros.ate) { setErro(t("financeiro.mov.informePeriodo")); return; }
    if (filtros.de > filtros.ate) { setErro(t("financeiro.mov.periodoInvalido")); return; }
    setBuscando(true);
    try {
      const r = await api.finMovimentacao(filtros);
      setResultado(r);
      setAplicado(filtros);
      setErro("");
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setBuscando(false);
    }
  }
  function filtrar(e) {
    e?.preventDefault();
    buscar({ contaId, de, ate, estornados: incluirEstornados });
  }
  async function refiltrar() { if (aplicado) await buscar(aplicado); }

  async function estornar(l) {
    setErro("");
    try { await api.finEstornarLancamento(l.id); await refiltrar(); } catch (e) { setErro(translateError(e, t)); }
  }
  async function alternarConferido(l) {
    setErro("");
    try { await api.finDefinirConferido(l.id, l.conferido !== 1); await refiltrar(); } catch (e) { setErro(translateError(e, t)); }
  }

  if (carregando) return <div className="fin-loading">{t("common.loading")}</div>;

  const cards = resultado ? [
    { k: "saldoAnterior", v: resultado.saldoAnterior, cls: "" },
    { k: "creditos", v: resultado.creditos, cls: "fin-receber" },
    { k: "debitos", v: resultado.debitos, cls: "fin-pagar" },
    { k: "saldoAtual", v: resultado.saldoAtual, cls: resultado.saldoAtual < 0 ? "fin-pagar" : "fin-receber" },
    { k: "saldoConferido", v: resultado.saldoConferido, cls: resultado.saldoConferido < 0 ? "fin-pagar" : "fin-receber" },
  ] : [];

  return (
    <div className="fin-movimentacao">
      {/* Barra de filtros: conta, período, estornados e o botão de busca. */}
      <form className="fin-mov-filtros" onSubmit={filtrar}>
        <label className="fin-field fin-mov-conta">
          <span>{t("financeiro.contas.nome")}</span>
          {contasAtivas.length === 0 ? (
            <span className="fin-cad-hint">{t("financeiro.importar.semContas")}</span>
          ) : (
            <SearchSelect value={contaId} onChange={setContaId} options={contaOpts} allLabel={t("financeiro.baixa.semConta")} />
          )}
        </label>
        <label className="fin-field">
          <span>{t("financeiro.mov.dataInicio")}</span>
          <input type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="fin-field">
          <span>{t("financeiro.mov.dataFim")}</span>
          <input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} />
        </label>
        {/* Checkbox e botões não têm label em cima: um span vazio reserva a mesma
            altura de label dos campos, para o controle alinhar na mesma linha. */}
        <label className="fin-field fin-mov-check-field">
          <span aria-hidden="true">&nbsp;</span>
          <span className="fin-mov-check">
            <input type="checkbox" checked={incluirEstornados} onChange={(e) => setIncluirEstornados(e.target.checked)} />
            {t("financeiro.mov.incluirEstornados")}
          </span>
        </label>
        <div className="fin-field fin-mov-acao">
          <span aria-hidden="true">&nbsp;</span>
          <button type="submit" className="btn-primary fin-mov-filtrar" disabled={buscando || contasAtivas.length === 0}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2" d="M10 4a6 6 0 104.9 9.5l4.8 4.8m-4.9-4.8A6 6 0 0010 4z" />
            </svg>
            {buscando ? t("common.loading") : t("financeiro.mov.filtrar")}
          </button>
        </div>
        <div className="fin-field fin-mov-acao">
          <span aria-hidden="true">&nbsp;</span>
          <button type="button" className="btn-secondary fin-mov-manual" onClick={() => setManualAberto(true)}>
            + {t("financeiro.manual.titulo")}
          </button>
        </div>
      </form>

      {contaSel && (detalheConta(contaSel) || contaSel.banco) && (
        <div className="fin-conta-detalhe fin-mov-conta-info">
          {[contaSel.banco, detalheConta(contaSel)].filter(Boolean).join(" · ")}
        </div>
      )}

      {erro && <div className="fin-error">{erro}</div>}

      {manualAberto && (
        <LancamentoManualModal
          onClose={() => setManualAberto(false)}
          onCriado={() => { if (aplicado) refiltrar(); }}
        />
      )}

      {/* Antes da primeira busca, só um convite - nada carrega sozinho. */}
      {!resultado && !erro && (
        <div className="fin-empty fin-mov-prompt">{t("financeiro.mov.filtrePrompt")}</div>
      )}

      {resultado && (
        <>
          <div className="fin-mov-cards">
            {cards.map((c) => (
              <div key={c.k} className="fin-mov-card">
                <span className="fin-mov-card-lbl">{t("financeiro.mov." + c.k)}</span>
                <strong className={"fin-mov-card-val " + c.cls}>{formatCents(c.v, lang)}</strong>
              </div>
            ))}
          </div>

          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th className="fin-mov-conf-col">{t("financeiro.mov.conf")}</th>
                  <th>{t("financeiro.col.titulo")}</th>
                  <th>{t("financeiro.mov.data")}</th>
                  <th>{t("financeiro.col.contraparte")}</th>
                  <th>{t("financeiro.col.descricao")}</th>
                  <th className="fin-num">{t("financeiro.col.valor")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {resultado.movimentos.length === 0 ? (
                  <tr><td colSpan={7} className="fin-empty">{t("financeiro.mov.extratoVazio")}</td></tr>
                ) : (
                  resultado.movimentos.map((l) => (
                    <tr key={l.id} className={l.estornado ? "fin-mov-estornado" : ""}>
                      <td className="fin-mov-conf-col">
                        {l.estornado ? (
                          <span className="fin-mov-tag">{t("financeiro.mov.estornado")}</span>
                        ) : (
                          <input
                            type="checkbox" checked={l.conferido === 1}
                            onChange={() => alternarConferido(l)}
                            title={t("financeiro.mov.conferir")} aria-label={t("financeiro.mov.conferir")}
                          />
                        )}
                      </td>
                      <td>{l.numero}</td>
                      <td>{l.data}</td>
                      <td>{nomeContraparte(l)}</td>
                      <td>{l.descricao || "-"}</td>
                      <td className={"fin-num " + (l.tipo === "receber" ? "fin-receber" : "fin-pagar")}>
                        {l.tipo === "receber" ? "+" : "-"} {formatCents(liquidoDoLancamento(l), lang)}
                      </td>
                      <td className="fin-row-actions">
                        {!l.estornado && (
                          <button className="btn-ghost btn-small" onClick={() => estornar(l)}>{t("financeiro.acao.estornar")}</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
