/**
 * Start People Manager: read config.json, open the data source, listen.
 * By default only this computer can connect (127.0.0.1); Settings → General →
 * "Allow other devices on my network" listens on every interface instead
 * (takes effect after a restart).
 */
import { createApp, VERSION } from "./app.js";
import { Config } from "./config.js";
import { networkUrls } from "./security.js";

const config = new Config();
const { app, service } = await createApp(config);
const c = config.get();
const port = Number(process.env.PORT) || c.server.port;
const host = c.server.allowNetwork ? "0.0.0.0" : "127.0.0.1";

const server = app.listen(port, host, async () => {
  const ds = await service.store.status();
  console.log(`People Manager ${VERSION} — http://localhost:${port}`);
  if (c.server.allowNetwork) for (const u of networkUrls(port)) console.log(`  on your network: ${u}`);
  console.log(`  config: ${config.file}`);
  console.log(`  data:   ${c.dataSource.type} — ${ds.message}`);
  console.log(`  login:  ${c.security.loginEnabled ? "on" : "off"}`);
});
server.on("error", (e: NodeJS.ErrnoException) => {
  console.error(e.code === "EADDRINUSE" ? `Port ${port} is already in use — is People Manager already running? (./PEOPLE.sh --status)` : e.message);
  process.exit(1);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} — shutting down…`);
  server.close();
  await service.store.close().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (e) => console.error("[unhandled]", e));
