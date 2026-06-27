/* ============================================================
   POWALIFTA — AI assistant config (EXAMPLE / template)

   The AI training assistant is a LOCAL-ONLY developer tool. It is
   wired into the dashboards on the `ai-chat` branch and refuses to
   run anywhere except localhost.

   To enable LIVE replies (Anthropic API):
     1. Copy this file to  ai-config.local.js  (already gitignored).
     2. Paste your key into `apiKey` below.
     3. Reload athlete.html / coach.html on localhost.

   With no key, the assistant runs in MOCK mode: it still answers
   using your real in-app data (logs, e1RM, program, roster) — it
   just computes the answers locally instead of calling a model.

   NEVER commit ai-config.local.js. NEVER deploy this branch.
   ============================================================ */
window.POWA_AI = {
  // Anthropic API key, starts with "sk-ant-". Leave blank for MOCK mode.
  apiKey: '',

  // Model used when a key is present.
  model: 'claude-sonnet-4-5',

  // Master switch. The assistant also independently checks that the
  // page is on localhost, so leaving this true is safe.
  enabled: true,

  // Max tokens for a live reply.
  maxTokens: 700
};
