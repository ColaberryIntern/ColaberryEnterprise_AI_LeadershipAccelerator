/**
 * The Open House sheet, shared by the sign-up form and its confirmation page.
 *
 * It lived inside `OpenHouseSignupPage` until the confirmation moved onto its own
 * URL (`/open-house/lead`). Two pages that are one flow to the visitor must not
 * drift apart visually, and a copied stylesheet is how that drift starts - so it
 * is one exported constant with two importers rather than two copies.
 *
 * Still an inline `<style>` rather than a CSS file, deliberately: these pages are
 * the ad landing surface, they render standalone outside the app shell, and the
 * sheet shipping in the same chunk as the page means there is no second request
 * between the click and the first paint.
 */
export const CBOH_CSS = `
.cboh-root{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
  background:#F8F8F7;font-family:'Roboto',system-ui,-apple-system,'Segoe UI',sans-serif;color:#2B2B2B}
.cboh-card{width:100%;max-width:440px;background:#fff;border:1px solid #E4E4E3;border-radius:24px;
  box-shadow:0 12px 30px rgba(26,26,26,.10),0 3px 8px rgba(26,26,26,.06);padding:34px 32px;box-sizing:border-box}
.cboh-brand{display:flex;align-items:center;gap:11px;margin-bottom:22px}
.cboh-mark{border-radius:9px;display:block}
.cboh-wordmark{font-family:'Quicksand',system-ui,sans-serif;font-weight:700;font-size:22px;color:#1A1A1A}
.cboh-c{color:#FB2832}
.cboh-head{margin-bottom:18px}
.cboh-badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:#C20E1E;background:rgba(251,40,50,.12);border-radius:999px;padding:4px 11px;margin-bottom:10px}
.cboh-title{font-size:27px;font-weight:700;color:#1A1A1A;margin:0 0 8px;letter-spacing:-.01em}
.cboh-text{font-size:14.5px;color:#6B6B6B;line-height:1.55;margin:0}
.cboh-when{display:flex;flex-direction:column;gap:3px;padding:13px 15px;border-radius:14px;
  background:#F4F7F8;border:1px solid #DCE6EA;margin-bottom:4px}
.cboh-when--tbd{background:#F8F8F7;border-color:#E4E4E3}
.cboh-when-main{font-size:15.5px;font-weight:700;color:#1F4E63}
.cboh-when-sub{font-size:13px;color:#6B6B6B}
.cboh-form{display:flex;flex-direction:column;margin-top:8px}
.cboh-label{font-size:13px;font-weight:700;color:#2B2B2B;margin:12px 0 6px}
.cboh-input{border:1px solid #D8D8D8;border-radius:12px;padding:12px 15px;font-size:15px;font-family:inherit;
  background:#fff;color:#2B2B2B;outline:none;transition:border-color .15s,box-shadow .15s}
.cboh-input:focus{border-color:#367895;box-shadow:0 0 0 3px rgba(54,120,149,.22)}
.cboh-input:disabled{background:#F1F1F0}
.cboh-why{margin:6px 0 0;font-size:12.5px;color:#8A8A8A;line-height:1.45}
.cboh-consent{display:flex;align-items:flex-start;gap:9px;margin:16px 0 0;font-size:13px;
  line-height:1.5;color:#6B6B6B;cursor:pointer}
.cboh-check{width:16px;height:16px;margin:1px 0 0;flex:0 0 auto;accent-color:#FB2832;cursor:pointer}
.cboh-check:focus-visible{outline:3px solid #367895;outline-offset:2px}
.cboh-error{margin-top:12px;font-size:13.5px;color:#C20E1E;background:rgba(251,40,50,.08);
  border:1px solid rgba(251,40,50,.28);border-radius:10px;padding:9px 12px}
.cboh-btn{margin-top:18px;background:#FB2832;color:#fff;border:none;border-radius:999px;padding:13px 22px;
  font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;transition:filter .15s;min-height:48px}
.cboh-btn:hover:not(:disabled){filter:brightness(.95)}
.cboh-btn:disabled{opacity:.6;cursor:default}
.cboh-btn-block{display:block;width:100%;box-sizing:border-box;text-align:center;text-decoration:none}
.cboh-btn:focus-visible{outline:3px solid #367895;outline-offset:2px}
.cboh-fine{margin:10px 0 0;font-size:12.5px;color:#8A8A8A;text-align:center;line-height:1.45}
.cboh-foot{margin:20px 0 0;text-align:center;font-size:14px;color:#6B6B6B}
.cboh-link{color:#2E6A86;font-weight:700;text-decoration:none}
.cboh-link:hover{text-decoration:underline}
@media (max-width:420px){.cboh-card{padding:26px 20px;border-radius:18px}.cboh-title{font-size:24px}}
`;
