import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";

// Cadastro de centros de custo hierárquicos, multiempresa. Vive no painel da
// plataforma porque cross-empresa é exclusividade daqui - o cliente nunca vê os
// centros de outra empresa. A árvore é indentada pelo nível do código; o pai é
// derivado do próprio código (1.02.01 pertence a 1.02).
export default function CentrosCusto() {
  const [empresas, setEmpresas] = useState(null);
  const [companyId, setCompanyId] = useState("");
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState({ codigo: "", nome: "" });
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { companies } = await api.listarEmpresas();
        setEmpresas(companies);
        if (companies.length) setCompanyId(companies[0].id);
      } catch (e) {
        setErro(e.message);
      }
    })();
  }, []);

  const carregar = useCallback(async () => {
    if (!companyId) { setLista([]); return; }
    try {
      setLista((await api.listarCentrosCusto(companyId)).centros);
      setErro("");
    } catch (e) {
      setErro(e.message);
    }
  }, [companyId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function criar(e) {
    e.preventDefault();
    setErro("");
    try {
      await api.criarCentroCusto({ companyId, codigo: novo.codigo.trim(), nome: novo.nome.trim() });
      setNovo({ codigo: "", nome: "" });
      setCriando(false);
      await carregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  async function salvarEdicao(c) {
    setErro("");
    try {
      await api.editarCentroCusto(c.id, { nome: editNome });
      setEditId(null);
      await carregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  async function alternarAtivo(c) {
    const ativando = !c.ativo;
    const msg = ativando
      ? `Reativar ${c.codigo}?`
      : `Desativar ${c.codigo}?${c.tipo === "sintetico" ? " A subárvore inteira será desativada junto." : ""}`;
    if (!confirm(msg)) return;
    setErro("");
    try {
      await api.definirCentroAtivo(c.id, ativando);
      await carregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  async function excluir(c) {
    if (!confirm(`Excluir o centro ${c.codigo} e toda a subárvore? Os lançamentos que o usam perdem a apropriação de centro (não são apagados).`)) return;
    setErro("");
    try {
      await api.excluirCentroCusto(c.id);
      await carregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  async function excluirTudo() {
    if (!confirm(`Excluir TODOS os centros de custo de ${empresaNome}? Os lançamentos perdem a apropriação de centro (não são apagados). Não dá para desfazer.`)) return;
    setErro("");
    try {
      await api.excluirTodosCentros(companyId);
      await carregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  const empresaNome = empresas?.find((e) => e.id === companyId)?.name || "";

  if (!empresas) return <div className="adm-painel">{erro || "Carregando..."}</div>;

  return (
    <div className="adm-painel">
      {erro && <div className="adm-erro">{erro}</div>}

      <div className="adm-barra">
        <label className="adm-campo adm-campo-inline">
          <span>Empresa</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {empresas.length === 0 && <option value="">Nenhuma empresa</option>}
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <button className="adm-btn adm-btn-primario" onClick={() => setCriando((v) => !v)} disabled={!companyId}>
          {criando ? "Cancelar" : "Novo centro de custo"}
        </button>
        {lista && lista.length > 0 && (
          <button className="adm-btn adm-btn-fantasma adm-perigo-texto" onClick={excluirTudo}>Excluir tudo</button>
        )}
      </div>

      {criando && (
        <form className="adm-form-nova" onSubmit={criar}>
          <div className="adm-grade2">
            <label className="adm-campo">
              <span>Código hierárquico</span>
              <input value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} placeholder="1.02.01.01.01" required autoFocus />
            </label>
            <label className="adm-campo">
              <span>Descrição / Nome do centro</span>
              <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="PRAINHA DE VILA VELHA" required />
            </label>
          </div>
          <p className="adm-fraco">
            O pai é derivado do código: para "1.02.01" o pai "1.02" precisa já existir. Ao ganhar um filho, o pai vira sintético (deixa de receber lançamento); só analítico recebe lançamento.
          </p>
          <button className="adm-btn adm-btn-primario">Criar centro de custo</button>
        </form>
      )}

      <table className="adm-tabela">
        <thead>
          <tr>
            <th>Código</th>
            <th>Descrição</th>
            <th>Tipo</th>
            <th>Empresa</th>
            <th>Situação</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lista && lista.length === 0 && (
            <tr><td colSpan={6} className="adm-fraco adm-cc-vazio">Nenhum centro de custo cadastrado para esta empresa.</td></tr>
          )}
          {lista && lista.map((c) => (
            <tr key={c.id} className={c.ativo ? "" : "adm-cc-inativa"}>
              <td>
                <span className="adm-cc-codigo" style={{ paddingLeft: c.nivel * 18 }}>{c.codigo}</span>
              </td>
              <td>
                {editId === c.id ? (
                  <span className="adm-cc-edit">
                    <input value={editNome} onChange={(e) => setEditNome(e.target.value)} autoFocus />
                    <button type="button" className="adm-btn adm-btn-primario adm-btn-mini" onClick={() => salvarEdicao(c)}>Salvar</button>
                    <button type="button" className="adm-btn adm-btn-fantasma adm-btn-mini" onClick={() => setEditId(null)}>Cancelar</button>
                  </span>
                ) : c.nome}
              </td>
              <td>
                <span className={"adm-chip " + (c.tipo === "sintetico" ? "adm-chip-trialing" : "adm-chip-active")}>
                  {c.tipo === "sintetico" ? "Sintético" : "Analítico"}
                </span>
              </td>
              <td className="adm-fraco">{c.empresaNome || empresaNome}</td>
              <td>
                <span className={"adm-chip " + (c.ativo ? "adm-chip-active" : "adm-chip-expired")}>
                  {c.ativo ? "Ativo" : "Inativo"}
                </span>
              </td>
              <td className="adm-direita">
                <button className="adm-btn adm-btn-fantasma" onClick={() => { setEditId(c.id); setEditNome(c.nome); }}>Editar</button>
                <button className={"adm-btn adm-btn-fantasma" + (c.ativo ? " adm-perigo-texto" : "")} onClick={() => alternarAtivo(c)}>
                  {c.ativo ? "Desativar" : "Reativar"}
                </button>
                <button className="adm-btn adm-btn-fantasma adm-perigo-texto" onClick={() => excluir(c)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
