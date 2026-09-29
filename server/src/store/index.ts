import type { AppConfig } from "../config.js";
import type { Store } from "./types.js";
import { JsonStore } from "./json.js";
import { SqlStore } from "./sql.js";

/** Build the store the config points at. `resolve` turns a config path into an absolute one. */
export function createStore(ds: AppConfig["dataSource"], resolve: (p: string) => string): Store {
  switch (ds.type) {
    case "sqlite": return SqlStore.sqlite(resolve(ds.sqlite.path));
    case "mysql": return SqlStore.mysql({ ...ds.mysql, port: Number(ds.mysql.port) || 3306 });
    default: return new JsonStore(resolve(ds.json.path));
  }
}

export type { Store } from "./types.js";
