/* ============================================================
   POWALIFTA — AI assistant config (OPTIONAL)

   You normally do NOT need this file. The assistant works out of the
   box: signed-in users get a live reply (via the JWT-gated `ai-chat`
   edge function, which holds the Gemini key SERVER-SIDE), and
   demo / signed-out visitors get local mock answers from real in-app
   data. No API key ever lives in the browser.

   This file only exists for optional, non-secret toggles. To use it,
   copy to `ai-config.local.js` (gitignored) OR a committed `ai-config.js`
   and load it before ai-chat.js. With no config file at all, the
   defaults below apply.

   The Gemini key is NEVER set here — it lives in the edge function's
   secrets (GEMINI_API_KEY). See edge-functions/ai-chat.ts.
   ============================================================ */
window.POWA_AI = {
  // Master switch. Set false to hide the assistant entirely on a page.
  enabled: true
};
