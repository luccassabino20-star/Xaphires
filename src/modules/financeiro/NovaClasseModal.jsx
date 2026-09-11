import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import SearchSelect from "./SearchSelect.jsx";

function IconLayers({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2.5 8 12 13l9.5-5z" />
      <path d="m2.5 12 9.5 5 9.5-5" />
      <path d="m2.5 16 9.5 5 9.5-5" />
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

// Raiz por tipo financeiro: convenção do plano de contas semeado (3=receita,
// 4=despesa operacional) mais 5, que este modal introduz para custo direto/CPV -
// só uma convenção de código, "custo" nunca existiu (nem precisa) como valor de
// `tipo` no servidor, que segue receita/despesa (ver financeiro_categorias no
// schema). A lista (CadastrosView) classifica "custo" olhando o código começar
// com 5, então manter essa raiz aqui é o que faz o dado nascer já no balde certo.
const RAIZ_POR_TIPO = { receita: "3", despesaOperacional: "4", custoDireto: "5" };

// Deriva o tipo financeiro (para pré-selecionar o segmentado) de uma classe já
// existente: só existe tipo receita/despesa no banco, então despesa vira
// "custoDireto" quando o código começa com 5 - mesmo critério de classeGrupo()
// em CadastrosView.jsx, duplicado aqui porque o modal não recebe a lista toda.
function tipoFinanceiroDe(classe) {
  if (!classe) return "receita";
  if (classe.tipo === "receita") return "receita";
  return String(classe.codigo || "").trim().startsWith("5") ? "custoDireto" : "despesaOperacional";
}

// Sugere o primeiro código livre dentro de um prefixo (raiz ou classe pai),
// olhando só o nível imediatamente abaixo (sem pular pra neto). Zero-padded a 2
// dígitos, no mesmo estilo do plano semeado (3.01, 4.02...). Primeiro GAP, não
// max+1: o plano semeado reserva ".99" para "Outras receitas/despesas", e
// max+1 sugeriria ".100" em vez de preencher o buraco entre ".04" e ".99".
function sugerirCodigo(prefixo, classes) {
  const usados = new Set(
    classes
      .map((c) => String(c.codigo || ""))
      .filter((c) => c.startsWith(prefixo + ".") && !c.slice(prefixo.length + 1).includes("."))
      .map((c) => parseInt(c.slice(prefixo.length + 1), 10))
      .filter((n) => Number.isFinite(n))
  );
  let proximo = 1;
  while (usados.has(proximo)) proximo++;
  return `${prefixo}.${String(proximo).padStart(2, "0")}`;
}

// Modal de cadastro/edição de Classe (Plano de Contas / Categorias DRE): mesmo
// esqueleto visual de NovaCobrancaModal.jsx. `classes` é a lista completa, para
// montar o autocomplete de classe pai e sugerir o próximo código; `paiInicial`
// pré-seleciona o pai quando aberto via "Adicionar subclasse" na linha da árvore.
export default function NovaClasseModal({ classe, classes, paiInicial, onClose, onCriar, onEditar }) {
  const { t } = useTranslation();
  const editando = !!classe;

  const paiAtual = useMemo(() => {
    if (!classe?.codigo) return null;
    const partes = String(classe.codigo).split(".");
    if (partes.length < 2) return null;
    const codPai = partes.slice(0, -1).join(".");
    return classes.find((c) => c.codigo === codPai) || null;
  }, [classe, classes]);

  const [paiId, setPaiId] = useState(() => (editando ? paiAtual?.id || "" : paiInicial?.id || ""));
  const [tipoFinanceiro, setTipoFinanceiro] = useState(() => tipoFinanceiroDe(editando ? classe : paiInicial));
  const [nome, setNome] = useState(classe?.nome || "");
  const [codigo, setCodigo] = useState(() => {
    if (editando) return classe.codigo || "";
    const pai = paiInicial || null;
    const prefixo = pai ? pai.codigo : RAIZ_POR_TIPO[tipoFinanceiroDe(paiInicial)];
    return sugerirCodigo(prefixo, classes);
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Sem pai (raiz): o financeiro escolhido decide o balde (3/4/5), então trocar o
  // segmentado ainda sugere um código novo. Com pai, quem manda é o pai - o
  // segmentado fica travado (ver JSX) para não nascer uma árvore inconsistente
  // (filho de receita marcado como custo).
  function escolherPai(id) {
    setPaiId(id);
    const pai = classes.find((c) => c.id === id) || null;
    if (pai) {
      setTipoFinanceiro(tipoFinanceiroDe(pai));
      setCodigo(sugerirCodigo(pai.codigo, classes));
    } else if (!editando) {
      setCodigo(sugerirCodigo(RAIZ_POR_TIPO[tipoFinanceiro], classes));
    }
  }
  function escolherTipoFinanceiro(tp) {
    setTipoFinanceiro(tp);
    if (!editando && !paiId) setCodigo(sugerirCodigo(RAIZ_POR_TIPO[tp], classes));
  }

  const opcoesPai = classes
    .filter((c) => c.id !== classe?.id) // não pode ser pai de si mesma
    .map((c) => ({ id: c.id, label: `${c.codigo ? c.codigo + " - " : ""}${c.nome}` }));

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!nome.trim()) { setErro(t("financeiro.cad.nome") + " *"); return; }
    const dados = {
      nome: nome.trim(),
      codigo: codigo.trim(),
      tipo: tipoFinanceiro === "receita" ? "receita" : "despesa",
    };
    setSalvando(true);
    try {
      if (editando) await onEditar(classe.id, dados);
      else await onCriar(dados);
      onClose();
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal cobr-form-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        <div className="cobr-form-header">
          <span className="cobr-form-header-icon"><IconLayers size={20} /></span>
          <div>
            <h2 className="cobr-form-title">{t(editando ? "financeiro.cad.classesModalEditarTitulo" : "financeiro.cad.classesModalNovoTitulo")}</h2>
            <p className="cobr-form-subtitle">{t("financeiro.cad.classesModalSubtitulo")}</p>
          </div>
        </div>

        <form className="cobr-form-body" onSubmit={salvar}>
          <label className="cobr-field">
            <span>{t("financeiro.cad.classesClassePai")}</span>
            <SearchSelect
              value={paiId}
              onChange={escolherPai}
              options={opcoesPai}
              allLabel={t("financeiro.cad.classesClassePaiRaiz")}
              placeholder={t("financeiro.cad.classesClassePaiPlaceholder")}
            />
          </label>

          <div className="cobr-field">
            <span>{t("financeiro.cad.classesTipoFinanceiro")}</span>
            <div className={"timing-toggle classes-tipo-toggle" + (paiId ? " is-disabled" : "")}>
              {["receita", "despesaOperacional", "custoDireto"].map((tp) => (
                <button
                  key={tp}
                  type="button"
                  className={"timing-toggle-btn" + (tipoFinanceiro === tp ? " active" : "")}
                  onClick={() => !paiId && escolherTipoFinanceiro(tp)}
                  disabled={!!paiId}
                  title={paiId ? t("financeiro.cad.classesCodigoSugerido") : undefined}
                >
                  {t(`financeiro.cad.classesTipo${tp === "receita" ? "Receita" : tp === "despesaOperacional" ? "DespesaOperacional" : "CustoDireto"}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="cobr-form-grid">
            <label className="cobr-field">
              <span>{t("financeiro.cad.codigo")}</span>
              <input
                type="text" value={codigo}
                disabled={editando} title={editando ? t("financeiro.cad.codigoTravado") : undefined}
                onChange={(e) => setCodigo(e.target.value)}
              />
            </label>
            <label className="cobr-field">
              <span>{t("financeiro.cad.nome")}</span>
              <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus />
            </label>
          </div>
          {!editando && <p className="classes-codigo-hint">{t("financeiro.cad.classesCodigoSugerido")}</p>}

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
