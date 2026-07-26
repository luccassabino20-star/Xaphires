// Limitador de requisições em memória (janela fixa). Suficiente para uma instância única.
// Se um dia o app rodar em vários processos, isto precisa virar um store compartilhado.
const buckets = new Map();

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key);
  }
}, 60_000);
sweeper.unref();

let counter = 0;

export function rateLimit({ windowMs, max, keyFn, message, code }) {
  const prefix = `rl${counter++}:`;

  const middleware = (req, res, next) => {
    const key = prefix + keyFn(req);
    const now = Date.now();
    const entry = buckets.get(key);

    if (!entry || now >= entry.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: message, code });
    }
    next();
  };

  // Permite zerar o contador quando a tentativa deu certo (ex.: login bem-sucedido).
  middleware.reset = (req) => buckets.delete(prefix + keyFn(req));
  return middleware;
}

export function clearRateLimits() {
  buckets.clear();
}
