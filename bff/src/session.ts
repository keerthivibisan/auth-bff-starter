import session from "express-session";
import { config } from "./config";

/**
 * express-session config for the BFF.
 *
 * MemoryStore (the default) is fine for local development only — it leaks
 * memory and does not work across multiple processes/instances. For any
 * real deployment, swap in a shared store, e.g. `connect-redis`:
 *
 *   import RedisStore from "connect-redis";
 *   import { createClient } from "redis";
 *   const redisClient = createClient({ url: process.env.REDIS_URL });
 *   await redisClient.connect();
 *   store: new RedisStore({ client: redisClient })
 */
export const sessionMiddleware = session({
  name: config.session.cookieName,
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: config.session.cookieSameSite,
    maxAge: config.session.maxAgeMs,
    path: "/",
  },
});
