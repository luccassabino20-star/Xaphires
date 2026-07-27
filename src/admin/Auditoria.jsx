import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";

// Ações que tocam dado de cliente ganham destaque. A trilha fica longa rápido, e o
// que interessa numa revisão é separar "alguém abriu os dados de um cliente" de
// "alguém fez login".
const SENSIVEIS = new Set(["abrir_quadros", "alterar_cartao", "alterar_papel", "listar_usuarios", "abrir_empresa"]);
const DESTRUTIVAS = new Set(["bloquear_empresa", "desativar_admin", "definir_plano"]);

export default function Auditoria() {
  const [entradas, setEntradas] = useState(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("");

  const carregar = useCallback(async () => {
    try {
      setEntradas((await api.auditoria({ limite: 500 })).entradas);
    } catch (e) {
      setErro(e.message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (erro) return <div className="adm-painel adm-erro">{erro}</div>;
  if (!entradas) return <div className="adm-painel">Carregando trilha...</div>;

  const visiveis = entradas.filter((e) =>
    !filtro.trim() ? true : `${e.acao} ${e.adminEmail} ${e.alvo || ""}`.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div className="adm-painel">
      <div className="adm-barra">
        <input className="adm-busca" placeholder="Filtrar por ação, admin ou alvo" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <button className="adm-btn" onClick={carregar}>
          Atualizar
        </button>
      </div>

      <p className="adm-fraco">
        Registro somente de leitura. Nada aqui pode ser editado ou apagado pela aplicação, inclusive por administradores.
      </p>

      <table className="adm-tabela">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Ação</th>
            <th>Quem</th>
            <th>Alvo</th>
            <th>Origem</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((e) => (
            <tr key={e.id}>
              <td className="adm-fraco adm-nowrap">{new Date(e.createdAt).toLocaleString("pt-BR")}</td>
              <td>
                <span
                  className={
                    "adm-acao" + (SENSIVEIS.has(e.acao) ? " sensivel" : "") + (DESTRUTIVAS.has(e.acao) ? " destrutiva" : "")
                  }
                >
                  {e.acao}
                </span>
              </td>
              <td className="adm-fraco">{e.adminEmail || "—"}</td>
              <td className="adm-fraco">{e.alvo || e.companyId || "—"}</td>
              <td className="adm-fraco">{e.ip || "—"}</td>
            </tr>
          ))}
          {visiveis.length === 0 && (
            <tr>
              <td colSpan={5} className="adm-fraco">
                Nada encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
