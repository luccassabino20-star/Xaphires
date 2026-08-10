import { useEffect, useState } from "react";
import * as api from "./api.js";

const SITUACAO = { active: "Ativa", trialing: "Em teste", grace: "Em aberto", expired: "Vencida", blocked: "Bloqueada" };

function reais(cents) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}

export default function Metricas() {
  const [m, setM] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.metricas().then(setM).catch((e) => setErro(e.message));
  }, []);

  if (erro) return <div className="adm-painel adm-erro">{erro}</div>;
  if (!m) return <div className="adm-painel">Carregando métricas...</div>;

  // Barras proporcionais ao maior valor, e não a um teto fixo: com uma empresa
  // grande e várias pequenas, escala fixa esmagaria todas as outras contra o zero.
  const maxCartoes = Math.max(1, ...m.porEmpresa.map((e) => e.cartoes));

  return (
    <div className="adm-painel">
      <div className="adm-cartoes">
        {[
          ["Empresas", m.empresas.total],
          ["Ativas", m.empresas.ativas],
          ["Em teste", m.empresas.emTeste],
          ["Vencidas", m.empresas.vencidas],
          ["Bloqueadas", m.empresas.bloqueadas],
        ].map(([rotulo, valor]) => (
          <div className="adm-cartao" key={rotulo}>
            <div className="adm-cartao-valor">{valor}</div>
            <div className="adm-cartao-rotulo">{rotulo}</div>
          </div>
        ))}
      </div>

      <div className="adm-cartoes">
        {[
          ["Usuários", m.totais.usuarios],
          ["Quadros", m.totais.quadros],
          ["Cartões ativos", m.totais.cartoes],
          ["Cartões com anexo", m.totais.anexos],
        ].map(([rotulo, valor]) => (
          <div className="adm-cartao" key={rotulo}>
            <div className="adm-cartao-valor">{valor}</div>
            <div className="adm-cartao-rotulo">{rotulo}</div>
          </div>
        ))}
      </div>

      <div className="adm-secao">
        <h3>Recebido</h3>
        <div className="adm-cartoes">
          <div className="adm-cartao">
            <div className="adm-cartao-valor">{reais(m.receita.totalPagoCents)}</div>
            <div className="adm-cartao-rotulo">total confirmado</div>
          </div>
          <div className="adm-cartao">
            <div className="adm-cartao-valor">{m.receita.pagamentosPagos}</div>
            <div className="adm-cartao-rotulo">pagamentos pagos</div>
          </div>
          <div className="adm-cartao">
            <div className="adm-cartao-valor">{m.receita.pagamentosPendentes}</div>
            <div className="adm-cartao-rotulo">pendentes</div>
          </div>
          <div className="adm-cartao">
            <div className="adm-cartao-valor">{m.receita.pagamentosFalhos}</div>
            <div className="adm-cartao-rotulo">não aprovados</div>
          </div>
        </div>
      </div>

      <div className="adm-secao">
        <h3>Uso por empresa</h3>
        <table className="adm-tabela">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Situação</th>
              <th className="adm-direita">Usuários</th>
              <th className="adm-direita">Quadros</th>
              <th className="adm-direita">Cartões</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            {[...m.porEmpresa]
              .sort((a, b) => b.cartoes - a.cartoes)
              .map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>
                    <span className={"adm-chip adm-chip-" + e.status}>{SITUACAO[e.status] || e.status}</span>
                  </td>
                  <td className="adm-direita">{e.usuarios}</td>
                  <td className="adm-direita">{e.quadros}</td>
                  <td className="adm-direita">{e.cartoes}</td>
                  <td>
                    <div className="adm-barra-trilho">
                      <div className="adm-barra-preenchida" style={{ width: `${Math.max((e.cartoes / maxCartoes) * 100, e.cartoes ? 3 : 0)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
