import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/AuthContext.jsx";
import * as adminApi from "../admin/api.js";
import Empresas from "../admin/Empresas.jsx";
import Metricas from "../admin/Metricas.jsx";
import Auditoria from "../admin/Auditoria.jsx";
import Admins from "../admin/Admins.jsx";

// Painel da plataforma dentro do app, para quem administra a plataforma.
//
// A informação vem toda da API do painel (/api/admin), que continua exigindo a
// sessão de administrador. Estar logado no app NÃO basta — e é isso que mantém a
// barreira de pé mesmo com as duas coisas na mesma tela.
//
// Na primeira abertura, pede a senha. É elevação, no espírito do `sudo`: você não
// digita a senha o dia todo, digita na hora em que vai fazer algo que exige mais.
// Uma sessão de cliente roubada não abre isto, porque ela não carrega a elevação.
//
// Os componentes vêm de src/admin/ sem alteração: foram escritos independentes da
// casca justamente para servirem aqui e na página /admin.

const ABAS = [
  { id: "empresas", nome: "Empresas" },
  { id: "metricas", nome: "Métricas" },
  { id: "auditoria", nome: "Auditoria" },
  { id: "admins", nome: "Administradores" },
];

export default function PlataformaModal({ onClose }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [admin, setAdmin] = useState(null);
  const [verificando, setVerificando] = useState(true);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [aba, setAba] = useState("empresas");

  // Já existe sessão de administrador válida? Se sim, entra direto — a elevação
  // dura 4 horas e não faz sentido pedir a senha a cada abertura do modal.
  const verificar = useCallback(async () => {
    try {
      setAdmin(await adminApi.me());
    } catch {
      setAdmin(null);
    } finally {
      setVerificando(false);
    }
  }, []);

  useEffect(() => {
    verificar();
  }, [verificar]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function elevar(e) {
    e.preventDefault();
    setErro("");
    setEntrando(true);
    try {
      // O e-mail vem da sessão do app, não de um campo: quem está aqui já se
      // identificou. O que falta provar é que sabe a senha de administrador.
      setAdmin(await adminApi.login(user.email, senha));
      setSenha("");
    } catch (err) {
      setErro(err.message);
    } finally {
      setEntrando(false);
    }
  }

  async function encerrarElevacao() {
    await adminApi.logout().catch(() => {});
    setAdmin(null);
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* adm-shell traz a paleta própria do painel. Dentro do modal ela isola o
          visual do painel do tema do app, que pode estar claro ou escuro. */}
      <div className="modal adm-shell plataforma-modal">
        <div className="plataforma-topo">
          <div className="adm-marca">
            Cantiere <span>plataforma</span>
          </div>
          {admin && (
            <nav className="adm-abas">
              {ABAS.map((a) => (
                <button key={a.id} className={"adm-aba" + (aba === a.id ? " ativa" : "")} onClick={() => setAba(a.id)}>
                  {a.nome}
                </button>
              ))}
            </nav>
          )}
          <div className="plataforma-acoes">
            {admin && (
              <button className="adm-btn adm-btn-fantasma" onClick={encerrarElevacao} title="Encerra o acesso de administrador sem sair do app">
                Encerrar acesso
              </button>
            )}
            <button className="adm-btn adm-btn-fantasma" onClick={onClose}>
              {t("common.close")}
            </button>
          </div>
        </div>

        {verificando && <div className="adm-carregando">Verificando acesso...</div>}

        {!verificando && !admin && (
          <form className="plataforma-elevacao" onSubmit={elevar}>
            <h3>Confirme sua senha de administrador</h3>
            <p className="adm-fraco">
              Este painel usa um cadastro separado do seu login do app. Entrar aqui libera o acesso por 4 horas.
            </p>
            <label className="adm-campo">
              <span>Administrador</span>
              <input value={user?.email || ""} disabled />
            </label>
            <label className="adm-campo">
              <span>Senha de administrador</span>
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoFocus />
            </label>
            {erro && <div className="adm-erro">{erro}</div>}
            <button className="adm-btn adm-btn-primario" disabled={entrando}>
              {entrando ? "Verificando..." : "Abrir painel"}
            </button>
          </form>
        )}

        {admin && (
          <>
            <div className="adm-aviso">
              Tudo o que você abrir ou alterar aqui fica registrado na aba Auditoria, com seu nome, a empresa e o horário.
            </div>
            <div className="plataforma-conteudo">
              {aba === "empresas" && <Empresas />}
              {aba === "metricas" && <Metricas />}
              {aba === "auditoria" && <Auditoria />}
              {aba === "admins" && <Admins euId={admin.id} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
