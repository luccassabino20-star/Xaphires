import "dotenv/config";
import { app } from "./app.js";
import { closeAllDbs } from "./db.js";
import { migrateLegacyIfNeeded } from "./migrateLegacy.js";
import { migrarIdModuloQuadro } from "./directory.js";
import { iniciarBillingCron } from "./jobs/billingCron.js";

migrateLegacyIfNeeded();
migrarIdModuloQuadro();
iniciarBillingCron();

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  console.log(`Xaphires API rodando em http://localhost:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    closeAllDbs();
    server.close(() => process.exit(0));
  });
}
