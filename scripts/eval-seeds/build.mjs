#!/usr/bin/env node
// Gera os seed.sh autocontidos dos evals a partir de fontes únicas (o runner de evals não garante
// de onde o scaffold_script roda, então nada de "source" entre arquivos).
// node scripts/eval-seeds/build.mjs        → escreve
// node scripts/eval-seeds/build.mjs --check → falha se algum seed.sh estiver desatualizado (usado no npm test)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(HERE, "../..");
const app = readFileSync(join(HERE, "app.sh"), "utf8").replace(/^#!.*\n/, "").replace(/^set -euo pipefail\n/m, "");

const SPEC_10 = readFileSync(join(HERE, "spec-10.md"), "utf8");
const DS_README = readFileSync(join(HERE, "design-readme.md"), "utf8");

export const SEEDS = {
  "evals/design-system-ponteiro/seed.sh": app,
  "evals/prototipo-timer/seed.sh": `${app}
mkdir -p docs/specs docs/design
cat > docs/design/README.md <<'EOF'
${DS_README.trimEnd()}
EOF
cat > docs/specs/10-timer-iniciar-parar.md <<'EOF'
${SPEC_10.trimEnd()}
EOF
`,
};

const header = (src) => `#!/usr/bin/env bash
# GERADO por scripts/eval-seeds/build.mjs — não edite à mão.
set -euo pipefail
${src.trimStart()}`;

const check = process.argv.includes("--check");
let stale = [];
for (const [rel, body] of Object.entries(SEEDS)) {
  const path = join(ROOT, rel);
  const want = header(body);
  if (check) { if (!existsSync(path) || readFileSync(path, "utf8") !== want) stale.push(rel); }
  else writeFileSync(path, want);
}
if (stale.length) { console.error(`seed.sh desatualizado: ${stale.join(", ")}. Rode: node scripts/eval-seeds/build.mjs`); process.exit(1); }
