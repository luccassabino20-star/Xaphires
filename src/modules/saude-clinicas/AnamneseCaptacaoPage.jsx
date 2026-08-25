import { scGetAnamneseCaptacao, scResponderAnamneseCaptacao } from "../../state/api.js";
import AnamneseFormularioEtapas from "./AnamneseFormularioEtapas.jsx";

// Link FIXO por template (não por resposta) - pra gente que ainda não é
// paciente cadastrado. A clínica compartilha o mesmo link à vontade (redes
// sociais, WhatsApp, bio do Instagram); quem abre e envia cria o próprio
// cadastro de paciente na hora (server/routes/anamnesePublica.js, rota
// .../novo, extrai nome/telefone/e-mail/data de nascimento das respostas
// pelos ids convencionados no template - ver extrairDadosPaciente lá).
export default function AnamneseCaptacaoPage({ slug }) {
  return (
    <AnamneseFormularioEtapas
      carregar={() => scGetAnamneseCaptacao(slug)}
      enviar={(respostas) => scResponderAnamneseCaptacao(slug, respostas)}
    />
  );
}
