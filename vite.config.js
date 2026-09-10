import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // logo/ é rascunho de asset fora da árvore do app (nunca importado por
    // código nenhum) - editor de imagem gravando ali deixa o arquivo
    // brevemente travado, e o watcher do Vite derrubava o dev server inteiro
    // com EBUSY ao tentar abrir o handle. Não observar essa pasta.
    //
    // whatsapp-session/ guarda a credencial do Baileys por empresa
    // (server/services/whatsappService.js), dentro de server/data/companies/
    // <id>/, que por sua vez mora dentro da raiz do projeto que o Vite
    // observa por padrão. Antes disto rodar em Baileys, era o PERFIL DO
    // CHROMIUM do whatsapp-web.js (Puppeteer) ali - um perfil de navegador
    // reescreve Cookies/IndexedDB/journal o tempo todo, deu EBUSY (mesmo do
    // logo/ acima) e derrubou o dev server inteiro (client E server, por
    // causa do -k do concurrently) na primeira sessão conectada. Trocado
    // para Baileys (sem navegador), mas a pasta continua de fora por
    // precaução - os arquivos de credencial ainda são reescritos a cada
    // rotação de chave.
    watch: { ignored: ["**/logo/**", "**/whatsapp-session/**"] },
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      // Imagem do pop-up é servida pelo Express (server/app.js), fora de /api. Sem
      // este proxy ela carrega certo em produção (um processo só) e quebra só em
      // `npm run dev`, porque o Vite não sabe que esse caminho é do outro servidor.
      "/uploads": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
