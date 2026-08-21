import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../state/AuthContext.jsx";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { formatCents, reaisParaCents } from "../financeiro/dinheiro.js";

const VAZIO = { name: "", preco: "", duracao: "30" };

// Catálogo de procedimentos (tabela `procedures`) que já alimenta o seletor
// do formulário de agendamento - esta tela é só a gestão dele (criar, editar
// preço/duração, ativar/desativar). Edição não reescreve agendamentos já
// lançados: eles guardam nome/preço como snapshot próprio (ver repo.js).
export default function ServicosCatalogoView() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const showToast = useToast();
  const isMaster = user?.role === "master";
  const [servicos, setServicos] = useState(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [rascunho, setRascunho] = useState(VAZIO);

  async function carregar() {
    try {
      const dados = isMaster ? await api.scListAllProcedures() : await api.scListProcedures();
      setServicos(dados);
    } catch (e) {
      setErro(translateError(e, t));
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  async function criar(e) {
    e.preventDefault();
    if (!novo.name.trim()) return showToast(t("saudeClinicas.servicos.catalogo.nomeObrigatorio"));
    try {
      await api.scCreateProcedure({
        name: novo.name.trim(),
        priceCents: reaisParaCents(novo.preco) || 0,
        durationMin: Number(novo.duracao) || 30,
      });
      showToast(t("saudeClinicas.servicos.catalogo.criado"));
      setNovo(VAZIO);
      carregar();
    } catch (e2) {
      showToast(translateError(e2, t));
    }
  }

  function iniciarEdicao(s) {
    setEditandoId(s.id);
    setRascunho({ name: s.name, preco: String(s.price_cents / 100).replace(".", ","), duracao: String(s.duration_min) });
  }

  async function salvarEdicao(id) {
    if (!rascunho.name.trim()) return showToast(t("saudeClinicas.servicos.catalogo.nomeObrigatorio"));
    try {
      await api.scUpdateProcedure(id, {
        name: rascunho.name.trim(),
        priceCents: reaisParaCents(rascunho.preco) || 0,
        durationMin: Number(rascunho.duracao) || 30,
      });
      showToast(t("saudeClinicas.servicos.catalogo.atualizado"));
      setEditandoId(null);
      carregar();
    } catch (e) {
      showToast(translateError(e, t));
    }
  }

  async function alternarAtivo(s) {
    try {
      await api.scUpdateProcedure(s.id, { active: s.active ? 0 : 1 });
      carregar();
    } catch (e) {
      showToast(translateError(e, t));
    }
  }

  if (erro) return <div className="sc-error">{erro}</div>;

  return (
    <div className="sc-servicos-catalogo">
      <h3 className="sc-config-title">{t("saudeClinicas.servicos.catalogo.titulo")}</h3>

      {isMaster && (
        <form className="sc-servicos-form" onSubmit={criar}>
          <input
            type="text" placeholder={t("saudeClinicas.servicos.catalogo.nomePlaceholder")}
            value={novo.name} onChange={(e) => setNovo((n) => ({ ...n, name: e.target.value }))}
          />
          <input
            type="text" inputMode="decimal" placeholder={t("saudeClinicas.servicos.catalogo.preco")}
            value={novo.preco} onChange={(e) => setNovo((n) => ({ ...n, preco: e.target.value }))}
          />
          <input
            type="number" min={5} step={5} placeholder={t("saudeClinicas.servicos.catalogo.duracao")}
            value={novo.duracao} onChange={(e) => setNovo((n) => ({ ...n, duracao: e.target.value }))}
          />
          <button type="submit" className="btn-primary btn-small">{t("saudeClinicas.servicos.catalogo.adicionar")}</button>
        </form>
      )}

      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>{t("saudeClinicas.servicos.catalogo.nome")}</th>
              <th>{t("saudeClinicas.servicos.catalogo.preco")}</th>
              <th>{t("saudeClinicas.servicos.catalogo.duracao")}</th>
              {isMaster && <th>{t("saudeClinicas.servicos.catalogo.status")}</th>}
              {isMaster && <th>{t("saudeClinicas.servicos.catalogo.acoes")}</th>}
            </tr>
          </thead>
          <tbody>
            {!servicos || servicos.length === 0 ? (
              <tr><td colSpan={isMaster ? 5 : 3} className="sc-empty">{t("saudeClinicas.servicos.catalogo.semServicos")}</td></tr>
            ) : (
              servicos.map((s) => {
                const editando = editandoId === s.id;
                return (
                  <tr key={s.id}>
                    <td>{editando ? (
                      <input type="text" value={rascunho.name} onChange={(e) => setRascunho((r) => ({ ...r, name: e.target.value }))} />
                    ) : s.name}</td>
                    <td>{editando ? (
                      <input type="text" inputMode="decimal" value={rascunho.preco} onChange={(e) => setRascunho((r) => ({ ...r, preco: e.target.value }))} />
                    ) : formatCents(s.price_cents, i18n.language)}</td>
                    <td>{editando ? (
                      <input type="number" min={5} step={5} value={rascunho.duracao} onChange={(e) => setRascunho((r) => ({ ...r, duracao: e.target.value }))} />
                    ) : `${s.duration_min} min`}</td>
                    {isMaster && (
                      <td>
                        <span className={"sc-servicos-status" + (s.active ? " ativo" : " inativo")}>
                          {t(s.active ? "saudeClinicas.servicos.catalogo.ativo" : "saudeClinicas.servicos.catalogo.inativo")}
                        </span>
                      </td>
                    )}
                    {isMaster && (
                      <td className="sc-servicos-acoes">
                        {editando ? (
                          <>
                            <button type="button" className="btn-primary btn-small" onClick={() => salvarEdicao(s.id)}>{t("saudeClinicas.servicos.catalogo.salvar")}</button>
                            <button type="button" className="btn-ghost btn-small" onClick={() => setEditandoId(null)}>{t("saudeClinicas.servicos.catalogo.cancelar")}</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="btn-ghost btn-small" onClick={() => iniciarEdicao(s)}>{t("saudeClinicas.servicos.catalogo.editar")}</button>
                            <button type="button" className="btn-ghost btn-small" onClick={() => alternarAtivo(s)}>
                              {t(s.active ? "saudeClinicas.servicos.catalogo.desativar" : "saudeClinicas.servicos.catalogo.ativar")}
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
