/* ---------- Mobile quick navigation ---------- */
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("mobile-nav")) return;
  const nav = document.createElement("nav");
  nav.id = "mobile-nav";
  nav.setAttribute("aria-label", "Quick navigation");
  nav.innerHTML = `
    <button data-target="smart-dashboard">✨<span>Home</span></button>
    <button data-target="days-list">📅<span>Trip</span></button>
    <button data-target="family-section">👨‍👩‍👧‍👦<span>Family</span></button>
    <button data-target="packing-section">🎒<span>Packing</span></button>`;
  document.body.appendChild(nav);
  nav.addEventListener("click", event => {
    const button = event.target.closest("button[data-target]");
    if (!button) return;
    document.getElementById(button.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    nav.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
  });
  const style = document.createElement("style");
  style.textContent = `#mobile-nav{display:none}@media(max-width:700px){#mobile-nav{display:grid;grid-template-columns:repeat(4,1fr);position:fixed;z-index:1000;bottom:0;left:0;right:0;padding:7px max(8px,env(safe-area-inset-left)) calc(7px + env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-right));background:rgba(255,255,255,.96);backdrop-filter:blur(12px);border-top:1px solid rgba(0,0,0,.1);box-shadow:0 -5px 20px rgba(0,0,0,.08)}#mobile-nav button{border:0;background:transparent;padding:5px 2px;display:grid;gap:2px;justify-items:center;font:inherit;font-size:1.05rem;cursor:pointer;border-radius:10px}#mobile-nav button span{font-size:.65rem;font-weight:700;opacity:.65}#mobile-nav button.active{background:rgba(245,184,66,.18)}body{padding-bottom:74px}}`;
  document.head.appendChild(style);
});
