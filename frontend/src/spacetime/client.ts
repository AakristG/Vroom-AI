/**
 * Frontend connection to SpacetimeDB for realtime call/session state.
 *
 * Uses the official TypeScript client SDK (`spacetimedb` on npm, see package.json) and the
 * generated bindings in ./module_bindings (see that folder's README -- it's a placeholder
 * until you run `spacetime generate`).
 *
 * Docs: https://spacetimedb.com/docs/clients/typescript
 */
import { DbConnection } from './module_bindings';

const SPACETIMEDB_URL = import.meta.env.VITE_SPACETIMEDB_URL ?? 'http://127.0.0.1:3000';
const SPACETIMEDB_MODULE_NAME = import.meta.env.VITE_SPACETIMEDB_MODULE_NAME ?? 'toyota-fs-dev';

let connection: InstanceType<typeof DbConnection> | null = null;

/** Connect once and subscribe to the tables the dashboard needs. Safe to call multiple times
 * (returns the existing connection) -- call this from a top-level effect in App.tsx once you've
 * generated real bindings. */
export function connectToSpacetimeDB() {
  if (connection) return connection;

  connection = DbConnection.builder()
    .withUri(SPACETIMEDB_URL)
    .withDatabaseName(SPACETIMEDB_MODULE_NAME)
    .onConnect((ctx: any) => {
      // Subscribe to the tables the dashboard renders. Adjust the SQL once you have real
      // bindings and know your exact table/column names from spacetimedb/server/src/index.ts.
      ctx.subscriptionBuilder?.().subscribe([
        'SELECT * FROM call_session',
        'SELECT * FROM call_message',
      ]);
    })
    .onConnectError((_ctx: any, error: Error) => {
      // eslint-disable-next-line no-console
      console.error('SpacetimeDB connection error:', error);
    })
    .build();

  return connection;
}
