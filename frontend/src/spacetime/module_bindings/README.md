# Generated SpacetimeDB bindings

Everything in this folder except this README is generated from `spacetimedb/server/src/index.ts`.
Do not edit it by hand. Regenerate after changing the module:

```bash
npm run generate:bindings          # needs the spacetime CLI on PATH
```

No CLI on Windows? The local server runs in Docker (`clockworklabs/spacetime`), which has one:

```bash
docker cp spacetimedb/server <container>:/tmp/stdb/server
docker exec <container> sh -c 'cd /tmp/stdb/server && spacetime build && spacetime generate --lang typescript --out-dir /tmp/stdb/bindings --js-path dist/bundle.js -y'
docker cp <container>:/tmp/stdb/bindings/. frontend/src/spacetime/module_bindings/
```

`spacetime build` runs `tsc`, which the container lacks; typecheck on the host
(`npx tsc --noEmit -p spacetimedb/server`) and replace `node_modules/.bin/tsc` in the container
copy with a script that exits 0.
