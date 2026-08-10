import { initials, colorForUser } from "../utils/members.js";

// Componente único para todo avatar do app: mostra a foto de perfil quando
// existe (user.avatarUrl, ver publicUser() no servidor) e cai para as
// iniciais com cor derivada do id quando não existe - mesmo desenho de
// sempre, só que com uma foto de verdade por cima quando há uma. className/
// style/demais props passam direto para o elemento renderizado (span sem
// foto, img com foto), então cada chamador continua controlando tamanho e
// posição do jeito que já fazia com "avatar avatar-small" de sempre.
export default function Avatar({ id, name, avatarUrl, className = "", style, ...rest }) {
  const classes = className ? `avatar ${className}` : "avatar";
  if (avatarUrl) {
    return <img className={classes} src={avatarUrl} alt="" style={style} {...rest} />;
  }
  return (
    <span className={classes} style={{ background: colorForUser(id), ...style }} {...rest}>
      {initials(name)}
    </span>
  );
}
