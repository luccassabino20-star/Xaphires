import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";

// Troca da própria senha, dentro do painel. Sem isto, uma conta criada com senha
// provisória por outra pessoa ficaria com essa senha para sempre.
function TrocarSenha() {
  const [aberto, setAberto] = useState(false);
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [msg, setMsg] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setMsg(null);
    setEnviando(true);
    try {
      await api.trocarSenha(atual, nova);
      setAtual("");
      setNova("");
      setAberto(false);
      setMsg({ tipo: "ok", texto: "Senha alterada." });
    } catch (err) {
      setMsg({ tipo: "erro", texto: err.message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="adm-secao">
      <h3>Minha senha</h3>
      {msg && <div className={msg.tipo === "ok" ? "adm-fraco" : "adm-erro"}>{msg.texto}</div>}
      {!aberto ? (
        <button className="adm-btn" onClick={() => setAberto(true)}>
          Trocar minha senha
        </button>
      ) : (
        <form className="adm-grade2" onSubmit={enviar}>
          <label className="adm-campo">
            <span>Senha atual</span>
            <input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} required autoFocus />
          </label>
          <label className="adm-campo">
            <span>Nova senha (mínimo 10 caracteres)</span>
            <input type="password" minLength={10} value={nova} onChange={(e) => setNova(e.target.value)} required />
          </label>
          <div className="adm-botoes">
            <button className="adm-btn adm-btn-primario" disabled={enviando}>
              {enviando ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" className="adm-btn adm-btn-fantasma" onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function Admins({ euId }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState({ name: "", email: "", password: "" });

  const carregar = useCallback(async () => {
    try {
      setLista((await api.listarAdmins()).admins);
    } catch (e) {
      setErro(e.message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar(e) {
    e.preventDefault();
    setErro("");
    try {
      await api.criarAdmin(novo);
      setNovo({ name: "", email: "", password: "" });
      setCriando(false);
      await carregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  async function alternar(a) {
    const ativando = !a.active;
    if (!confirm(`${ativando ? "Reativar" : "Desativar"} o acesso de ${a.email}?`)) return;
    try {
      await api.definirAdminAtivo(a.id, ativando);
      await carregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  if (!lista) return <div className="adm-painel">{erro || "Carregando..."}</div>;

  return (
    <div className="adm-painel">
      {erro && <div className="adm-erro">{erro}</div>}

      <TrocarSenha />

      <div className="adm-barra">
        <p className="adm-fraco">
          Cada conta aqui enxerga os dados de todos os clientes. Desativar tira o acesso na hora, sem esperar a sessão expirar.
        </p>
        <button className="adm-btn adm-btn-primario" onClick={() => setCriando((v) => !v)}>
          {criando ? "Cancelar" : "Novo administrador"}
        </button>
      </div>

      {criando && (
        <form className="adm-form-nova" onSubmit={criar}>
          <div className="adm-grade2">
            <label className="adm-campo">
              <span>Nome</span>
              <input value={novo.name} onChange={(e) => setNovo({ ...novo, name: e.target.value })} required autoFocus />
            </label>
            <label className="adm-campo">
              <span>E-mail</span>
              <input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} required />
            </label>
          </div>
          <label className="adm-campo">
            <span>Senha (mínimo 10 caracteres)</span>
            <input
              type="password"
              minLength={10}
              value={novo.password}
              onChange={(e) => setNovo({ ...novo, password: e.target.value })}
              required
            />
          </label>
          <button className="adm-btn adm-btn-primario">Criar administrador</button>
        </form>
      )}

      <table className="adm-tabela">
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Situação</th>
            <th>Último acesso</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lista.map((a) => (
            <tr key={a.id}>
              <td>
                {a.name}
                {a.id === euId && <span className="adm-chip">você</span>}
              </td>
              <td className="adm-fraco">{a.email}</td>
              <td>
                <span className={"adm-chip " + (a.active ? "adm-chip-active" : "adm-chip-expired")}>
                  {a.active ? "Ativo" : "Desativado"}
                </span>
              </td>
              <td className="adm-fraco">{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString("pt-BR") : "nunca"}</td>
              <td className="adm-direita">
                {a.id !== euId && (
                  <button className={"adm-btn adm-btn-fantasma" + (a.active ? " adm-perigo-texto" : "")} onClick={() => alternar(a)}>
                    {a.active ? "Desativar" : "Reativar"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
