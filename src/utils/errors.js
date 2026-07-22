// Traduz um erro vindo da API: usa o código estável (err.code) quando existe uma
// tradução para ele, e cai para a mensagem em português enviada pelo servidor caso contrário.
export function translateError(err, t) {
  if (err?.code) {
    const key = `errors.${err.code}`;
    if (t(key, { defaultValue: "" })) return t(key);
  }
  return err?.message || t("errors.INTERNAL_ERROR");
}
