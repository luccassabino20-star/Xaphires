import { scGetAnamnesePublica, scResponderAnamnesePublica } from "../../state/api.js";
import AnamneseFormularioEtapas from "./AnamneseFormularioEtapas.jsx";

// Ficha já existente (rascunho/enviada), respondida pelo PACIENTE a partir
// do link de WhatsApp - achada pelo share_token de uma resposta específica.
// Ver AnamneseCaptacaoPage.jsx para o outro caso (link fixo, gente que ainda
// não é paciente). O wizard em si mora em AnamneseFormularioEtapas.jsx,
// compartilhado pelos dois.
export default function AnamnesePublicPage({ companyId, token }) {
  return (
    <AnamneseFormularioEtapas
      carregar={() => scGetAnamnesePublica(companyId, token)}
      enviar={(respostas) => scResponderAnamnesePublica(companyId, token, respostas)}
    />
  );
}
