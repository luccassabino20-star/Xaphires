// Link de vendas via WhatsApp - único número, reaproveitado onde quer que o
// app precise oferecer "falar com vendas"/"pedir orçamento" (landing e o
// launcher de módulos, no card e no banner de soluções sob medida).
export const WHATSAPP_VENDAS_URL =
  "https://api.whatsapp.com/send?phone=5527988312023&text=Ol%C3%A1!%20Gostaria%20de%20receber%20mais%20informa%C3%A7%C3%B5es%20sobre%20os%20produtos%2Fservi%C3%A7os%20e%20solicitar%20um%20or%C3%A7amento.";

// Link genérico de WhatsApp para um número e texto quaisquer - usado pelo
// módulo Saúde & Clínicas para mandar o link de pré-anamnese ao paciente. Sem
// número, abre o WhatsApp Web/app com o texto pronto e a pessoa escolhe o
// contato na hora (útil quando o telefone do paciente não está cadastrado).
export function whatsappLink(phone, texto) {
  const digitos = String(phone || "").replace(/\D/g, "");
  const params = new URLSearchParams({ text: texto });
  return `https://api.whatsapp.com/send?${digitos ? `phone=${digitos}&` : ""}${params.toString()}`;
}
