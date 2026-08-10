import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";
import Empresas from "./Empresas.jsx";
import Metricas from "./Metricas.jsx";
import Auditoria from "./Auditoria.jsx";
import Admins from "./Admins.jsx";
import Popups from "./Popups.jsx";

// O painel é interno e tem um público só: quem opera a plataforma. Por isso os
// textos ficam em português direto no componente, sem passar pelo i18n do produto —
// traduzir uma ferramenta que só nós usamos seria trabalho sem leitor.

const ABAS = [
  { id: "empresas", nome: "Empresas" },
  { id: "metricas", nome: "Métricas" },
  { id: "popups", nome: "Pop-ups" },
  { id: "auditoria", nome: "Auditoria" },
  { id: "admins", nome: "Administradores" },
];

function Login({ onEntrar }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      onEntrar(await api.login(email, senha));
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="adm-login">
      <form className="adm-login-card" onSubmit={enviar}>
        <div className="adm-login-marca">Xaphires</div>
        <div className="adm-login-sub">Painel da plataforma</div>
        <label className="adm-campo">
          <span>E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="adm-campo">
          <span>Senha</span>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        {erro && <div className="adm-erro">{erro}</div>}
        <button className="adm-btn adm-btn-primario" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </button>
        <p className="adm-login-nota">
          Esta área é separada do aplicativo. Estar logado como cliente não dá acesso aqui.
        </p>
      </form>
    </div>
  );
}

export default function AdminApp() {
  const [admin, setAdmin] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState("empresas");

  const verificar = useCallback(async () => {
    try {
      setAdmin(await api.me());
    } catch {
      setAdmin(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    verificar();
  }, [verificar]);

  async function sair() {
    await api.logout().catch(() => {});
    setAdmin(null);
  }

  if (carregando) return <div className="adm-carregando">Carregando...</div>;
  if (!admin) return <Login onEntrar={setAdmin} />;

  return (
    <div className="adm-shell">
      <header className="adm-topo">
        <div className="adm-marca">
          Xaphires <span>plataforma</span>
        </div>
        <nav className="adm-abas">
          {ABAS.map((a) => (
            <button key={a.id} className={"adm-aba" + (aba === a.id ? " ativa" : "")} onClick={() => setAba(a.id)}>
              {a.nome}
            </button>
          ))}
        </nav>
        <div className="adm-conta">
          <span title={admin.email}>{admin.name}</span>
          <button className="adm-btn adm-btn-fantasma" onClick={sair}>
            Sair
          </button>
        </div>
      </header>

      {/* Aviso permanente, e não um alerta que se fecha: o painel lê e altera dados
          de clientes, e quem está operando precisa lembrar disso o tempo todo. */}
      <div className="adm-aviso">
        Tudo o que você abrir ou alterar aqui fica registrado na aba Auditoria, com seu nome, a empresa e o horário.
      </div>

      <main className="adm-conteudo">
        {aba === "empresas" && <Empresas />}
        {aba === "metricas" && <Metricas />}
        {aba === "popups" && <Popups />}
        {aba === "auditoria" && <Auditoria />}
        {aba === "admins" && <Admins euId={admin.id} />}
      </main>
    </div>
  );
}
