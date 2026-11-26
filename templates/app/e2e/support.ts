// Apoio aos testes de aceite. Use o `test` daqui: cada teste começa com o banco zerado.
import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ banco: void }>({
  banco: [
    async ({ request }, use) => {
      const r = await request.post("/api/e2e/reset");
      // 404 = app sem banco ainda (nenhuma story com dados): segue sem reset.
      if (!r.ok() && r.status() !== 404) throw new Error(`Reset do banco falhou: ${r.status()}`);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
