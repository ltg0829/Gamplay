==> Deploying...
==> Setting WEB_CONCURRENCY=1 by default, based on available CPUs in the instance
==> Running 'node server.js'
node:internal/modules/cjs/loader:1386
  throw err;
  ^
Error: Cannot find module 'dotenv'
Require stack:
- /opt/render/project/src/server.js
    at Function._resolveFilename (node:internal/modules/cjs/loader:1383:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:1025:19)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1030:22)
    at Function._load (node:internal/modules/cjs/loader:1192:37)
    at TracingChannel.traceSync (node:diagnostics_channel:328:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:237:24)
    at Module.require (node:internal/modules/cjs/loader:1463:12)
    at require (node:internal/modules/helpers:147:16)
    at Object.<anonymous> (/opt/render/project/src/server.js:5:1)
    at Module._compile (node:internal/modules/cjs/loader:1706:14) {
  code: 'MODULE_NOT_FOUND',
  requireStack: [ '/opt/render/project/src/server.js' ]
}
Node.js v22.22.0
==> Exited with status 1
==> Common ways to troubleshoot your deploy: https://render.com/docs/troubleshooting-deploys
==> Running 'node server.js'
node:internal/modules/cjs/loader:1386
  throw err;
Menu
  ^
Error: Cannot find module 'dotenv'
Require stack:
- /opt/render/project/src/server.js
    at Function._resolveFilename (node:internal/modules/cjs/loader:1383:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:1025:19)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1030:22)
    at Function._load (node:internal/modules/cjs/loader:1192:37)
    at TracingChannel.traceSync (node:diagnostics_channel:328:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:237:24)
    at Module.require (node:internal/modules/cjs/loader:1463:12)
    at require (node:internal/modules/helpers:147:16)
    at Object.<anonymous> (/opt/render/project/src/server.js:5:1)
    at Module._compile (node:internal/modules/cjs/loader:1706:14) {
  code: 'MODULE_NOT_FOUND',
  requireStack: [ '/opt/render/project/src/server.js' ]
}
Node.js v22.22.0