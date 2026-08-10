// Cria o primeiro administrador da plataforma.
//
//   node server/admin/criarAdmin.js "Nome" email@dominio.com
//
// A senha é pedida no terminal e não vai por argumento, porque argumento de linha
// de comando fica no histórico do shell e aparece na lista de processos para
// qualquer outro usuário da máquina.
//
// Existe como comando, e não como tela de "primeiro acesso" na web, de propósito:
// uma rota pública que cria super admin enquanto não houver nenhum é uma corrida
// que se perde uma vez só, para sempre. Quem cria admin precisa ter acesso ao
// servidor.

import "dotenv/config";
import readline from "node:readline";
import { Writable } from "node:stream";
import * as store from "./store.js";
import { hashSenha } from "./auth.js";

const [, , nome, email] = process.argv;

if (!nome || !email) {
  console.error('Uso: node server/admin/criarAdmin.js "Nome Completo" email@dominio.com');
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("E-mail inválido.");
  process.exit(1);
}
if (store.acharAdminPorEmail(email)) {
  console.error(`Já existe um administrador com o e-mail ${email}.`);
  process.exit(1);
}

// UMA interface para as duas perguntas: criar uma por pergunta faz a primeira
// consumir o fluxo e a segunda esperar para sempre.
//
// E `terminal` acompanha a realidade da entrada. Com terminal de verdade, precisa
// ser true para o eco da senha poder ser suprimido. Com entrada redirecionada não
// há eco a esconder, e forçar true faz o readline tratar um cano como se fosse
// teclado — a segunda pergunta nunca recebe nada. Era o que impedia este script de
// ser testado sem alguém digitando.
// Dois modos, porque terminal e cano se comportam de formas diferentes.
//
// No terminal, pergunta uma de cada vez com o eco suprimido, que é o que esconde a
// senha de quem estiver olhando a tela.
//
// Com entrada redirecionada, lê o fluxo INTEIRO de uma vez e separa as linhas. A
// tentativa óbvia — perguntar uma de cada vez também aqui — perde a segunda linha:
// quem escreve no cano manda tudo junto e fecha, o readline emite as duas linhas em
// sequência, e a segunda chega antes de a segunda pergunta existir. Sem eco a
// esconder, ler tudo antes é mais simples e não tem corrida.
const interativo = process.stdin.isTTY === true;

let rl = null;
function encerrar(codigo) {
  rl?.close();
  process.exit(codigo);
}

async function lerSenhas() {
  if (!interativo) {
    let bruto = "";
    for await (const pedaco of process.stdin) bruto += pedaco;
    const linhas = bruto.split(/\r?\n/);
    return [(linhas[0] || "").trim(), (linhas[1] || "").trim()];
  }

  const mudo = new Writable({
    write(chunk, enc, cb) {
      cb();
    },
  });
  rl = readline.createInterface({ input: process.stdin, output: mudo, terminal: true });
  const perguntar = (rotulo) =>
    new Promise((resolve) => {
      process.stdout.write(rotulo);
      rl.question("", (r) => {
        process.stdout.write("\n");
        resolve(r.trim());
      });
    });
  return [await perguntar("Senha (mínimo 10 caracteres): "), await perguntar("Repita a senha: ")];
}

const [senha, confirmacao] = await lerSenhas();
if (!senha || senha.length < 10) {
  console.error("A senha precisa ter pelo menos 10 caracteres.");
  encerrar(1);
}
if (senha !== confirmacao) {
  console.error("As senhas não conferem.");
  encerrar(1);
}

const admin = store.criarAdmin({ email, name: nome, passwordHash: hashSenha(senha) });
store.registrar({
  adminId: admin.id,
  adminEmail: admin.email,
  acao: "criar_admin_inicial",
  alvo: admin.email,
  detalhe: { via: "linha de comando" },
});

console.log(`\nAdministrador criado: ${admin.name} <${admin.email}>`);
console.log(`Total de administradores: ${store.contarAdmins()}`);
console.log("\nAcesse o painel em /admin");
process.exit(0);
