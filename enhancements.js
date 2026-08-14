/* ---------- Disney Tracker Enhancements ----------
   Adds the next-generation planning layer without replacing the existing
   trip model. Designed to be safe to roll out alongside the legacy UI.
*/

const ENHANCEMENT_KEY = "disneyTrackerEnhancements";
const METADATA_TABLE = "trip_metadata";
let enhancementLastSyncCode = null;
let enhancementSyncTimer = null;

function enhancementFamily() {
  try { return typeof loadFamilyProfiles === "function" ? loadFamilyProfiles() : []; }
  catch (_) { return []; }
}

function enhancementPacking() {
  try { return Array.isArray(window.packingList) ? window.packingList : []; }
  catch (_) { return []; }
}

function enhancementEscape(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function enhancementConfig() {
  try { return typeof syncConfig !== "undefined" ? syncConfig : null; }
  catch (_) { return null; }
}

function enhancementClient() {
  const config = enhancementConfig();
  if (!config?.url || !config?.anonKey || !window.supabase) return null;
  try {
    return window.supabase.createClient(config.url, config.anonKey);
  } catch (_) { return null; }
}

function setEnhancementStatus(text, kind = "ok") {
  const el = document.getElementById("enhancement-sync-status");
  if (!el) return;
  el.className = `enhancement-sync-status ${kind}`;
  el.textContent = text;
}

async function pushTripMetadata() {
  const config = enhancementConfig();
  const client = enhancementClient();
  if (!config?.code || !client) return false;
  try {
    const payload = {
      code: config.code,
      family: enhancementFamily(),
      packing: enhancementPacking(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from(METADATA_TABLE).upsert(payload, { onConflict: "code" });
    if (error) throw error;
    enhancementLastSyncCode = config.code;
    setEnhancementStatus("☁️ Synced", "ok");
    return true;
  } catch (error) {
    console.warn("Trip metadata sync unavailable:", error);
    setEnhancementStatus("⚠️ Trip saved on this device; cloud extras unavailable", "warn");
    return false;
  }
}

async function pullTripMetadata() {
  const config = enhancementConfig();
  const client = enhancementClient();
  if (!config?.code || !client) return false;
  try {
    const { data, error } = await client.from(METADATA_TABLE).select("family,packing").eq("code", config.code).maybeSingle();
    if (error) throw error;
    if (!data) return false;
    if (Array.isArray(data.family)) localStorage.setItem("disneyFamilyProfiles", JSON.stringify(data.family));
    if (Array.isArray(data.packing)) localStorage.setItem("disneyPackingList", JSON.stringify(data.packing));
    if (typeof renderFamilyProfiles === "function") renderFamilyProfiles();
    if (typeof renderPackingList === "function") renderPackingList();
    enhancementLastSyncCode = config.code;
    setEnhancementStatus("☁️ Synced", "ok");
    return true;
  } catch (error) {
    console.warn("Trip metadata pull unavailable:", error);
    return false;
  }
}

function scheduleMetadataSync() {
  clearTimeout(enhancementSyncTimer);
  enhancementSyncTimer = setTimeout(pushTripMetadata, 500);
}

function installSyncStatus() {
  const sync = document.getElementById("sync-content");
  if (!sync || document.getElementById("enhancement-sync-status")) return;
  const status = document.createElement("div");
  status.id = "enhancement-sync-status";
  status.className = "enhancement-sync-status idle";
  status.textContent = "☁️ Local changes are saved automatically";
  sync.appendChild(status);
}

function installDashboard() {
  if (document.getElementById("smart-dashboard")) return;
  const main = document.querySelector("main");
  const weather = document.getElementById("weather-strip");
  if (!main || !weather) return;
  const section = document.createElement("section");
  section.id = "smart-dashboard";
  section.className = "smart-dashboard";
  section.innerHTML = `
    <div class="smart-dashboard-head">
      <div><span class="eyebrow">✨ TRIP COMMAND CENTER</span><h2 id="smart-title">Your Disney Day</h2><p id="smart-subtitle">Select a trip day to see your plan.</p></div>
      <button type="button" class="btn primary" id="smart-build-day">✨ Build My Day</button>
    </div>
    <div id="smart-stats" class="smart-stats"></div>
    <div id="smart-timeline" class="smart-timeline"></div>
  `;
  weather.insertAdjacentElement("afterend", section);
  document.getElementById("smart-build-day")?.addEventListener("click", buildSmartDay);
  renderSmartDashboard();
}

function currentTripDay() {
  if (typeof tripDays === "undefined" || !tripDays.length) return null;
  const today = typeof isoDate === "function" ? isoDate(new Date()) : "";
  return tripDays.find(d => d.date === today) || tripDays[0];
}

function selectedCount(day) {
  if (!day) return 0;
  return (day.attractionPicks?.length || 0) + (day.restaurantPicks?.length || 0) + (day.showPicks?.length || 0);
}

function profileRideMessage(name) {
  const inches = typeof getHeightRequirement === "function" ? getHeightRequirement(name) : null;
  if (!inches) return "Everyone can consider this attraction";
  const family = enhancementFamily().filter(p => p.height);
  if (!family.length) return `Minimum height ${inches}\"`;
  const tooShort = family.filter(p => Number(p.height) < inches);
  if (!tooShort.length) return `✅ Everyone meets the ${inches}\" minimum`;
  const names = tooShort.map(p => p.name).join(", ");
  return `📏 ${names} ${tooShort.length === 1 ? "is" : "are"} below ${inches}\"`;
}

function renderSmartDashboard() {
  const title = document.getElementById("smart-title");
  const subtitle = document.getElementById("smart-subtitle");
  const stats = document.getElementById("smart-stats");
  const timeline = document.getElementById("smart-timeline");
  if (!title || !stats || !timeline) return;
  const day = currentTripDay();
  if (!day) {
    title.textContent = "Your Disney Day";
    subtitle.textContent = "Add a trip day to start building your itinerary.";
    stats.innerHTML = "";
    timeline.innerHTML = `<div class="smart-empty">🏰 Your personalized Disney command center will appear here.</div>`;
    return;
  }
  const parks = (day.parkIds || []).map(id => typeof parkById === "function" ? parkById(id) : null).filter(Boolean);
  title.textContent = `${parks.map(p => p.emoji + " " + p.name).join(" · ") || "Plan Your Day"}`;
  subtitle.textContent = typeof formatDateDisplay === "function" ? formatDateDisplay(day.date) : day.date;
  const family = enhancementFamily();
  stats.innerHTML = [
    ["🎢", day.attractionPicks?.length || 0, "rides"],
    ["🍽️", day.restaurantPicks?.length || 0, "meals"],
    ["🎆", day.showPicks?.length || 0, "shows"],
    ["👨‍👩‍👧‍👦", family.length, "family"],
  ].map(s => `<div class="smart-stat"><span>${s[0]}</span><strong>${s[1]}</strong><small>${s[2]}</small></div>`).join("");

  const picks = typeof collectDayPicks === "function" ? collectDayPicks(day) : [];
  const timed = picks.filter(p => p.time).sort((a,b) => a.time.localeCompare(b.time));
  const untimed = picks.filter(p => !p.time);
  const rows = [...timed, ...untimed];
  timeline.innerHTML = rows.length ? rows.map((p, i) => `
    <div class="smart-timeline-row">
      <div class="smart-time">${p.time ? enhancementEscape(typeof formatReservationTime === "function" ? formatReservationTime(p.time) : p.time) : (i === 0 ? "START" : "ANYTIME")}</div>
      <div class="smart-line"><span></span></div>
      <div class="smart-event"><strong>${p.emoji} ${enhancementEscape(p.name)}</strong><small>${p.kind === "attraction" ? profileRideMessage(p.name) : p.kind === "restaurant" ? "🍽️ Reservation" : "🎆 Show / entertainment"}</small></div>
    </div>`).join("") : `<div class="smart-empty">Pick some rides, restaurants or shows below and your timeline will appear here.</div>`;
}

function buildSmartDay() {
  const day = currentTripDay();
  if (!day) { alert("Add a trip day first."); return; }
  if (typeof openDayDetail === "function") openDayDetail(day.id);
  setTimeout(() => {
    const target = document.getElementById("itinerary-sections");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 350);
}

function installDayTimeline() {
  const modalBody = document.querySelector("#day-detail-modal .modal-body");
  if (!modalBody || document.getElementById("smart-day-timeline")) return;
  const block = document.createElement("div");
  block.id = "smart-day-timeline";
  block.className = "smart-day-timeline";
  block.innerHTML = `<div class="smart-day-timeline-head"><h4>✨ Smart Timeline</h4><span>Sorted by time</span></div><div id="smart-day-timeline-content"></div>`;
  modalBody.insertBefore(block, document.getElementById("park-empty-hint"));
}

function renderDayTimeline() {
  const el = document.getElementById("smart-day-timeline-content");
  if (!el || typeof tripDays === "undefined") return;
  const day = tripDays.find(d => d.id === (typeof activeDayId !== "undefined" ? activeDayId : null));
  if (!day || typeof collectDayPicks !== "function") { el.innerHTML = ""; return; }
  const picks = collectDayPicks(day).sort((a,b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  el.innerHTML = picks.length ? picks.map(p => `
    <div class="smart-mini-row"><span class="smart-mini-time">${p.time ? enhancementEscape(formatReservationTime(p.time)) : "Anytime"}</span><span>${p.emoji} ${enhancementEscape(p.name)}</span>${p.kind === "attraction" ? `<small>${enhancementEscape(profileRideMessage(p.name))}</small>` : ""}</div>`).join("") : `<p class="empty-hint">Choose items below to build your timeline.</p>`;
}

function enhanceRideLists() {
  document.querySelectorAll("#park-sections .item-list li").forEach(li => {
    const nameEl = li.querySelector(".item-name");
    if (!nameEl || li.dataset.enhanced === "1") return;
    const height = typeof getHeightRequirement === "function" ? getHeightRequirement(nameEl.textContent.trim()) : null;
    if (!height) return;
    const note = document.createElement("small");
    note.className = "family-fit-note";
    note.textContent = profileRideMessage(nameEl.textContent.trim());
    nameEl.parentElement.appendChild(note);
    li.dataset.enhanced = "1";
  });
}

function installEnhancementStyles() {
  if (document.getElementById("enhancement-styles")) return;
  const style = document.createElement("style");
  style.id = "enhancement-styles";
  style.textContent = `
    .smart-dashboard{margin:22px 0;padding:22px;border-radius:20px;background:linear-gradient(135deg,#fff,#fff8e8);border:1px solid rgba(245,184,66,.35);box-shadow:0 8px 30px rgba(0,0,0,.08)}
    .smart-dashboard-head{display:flex;align-items:center;justify-content:space-between;gap:18px}.smart-dashboard h2{margin:4px 0}.smart-dashboard p{margin:0;opacity:.65}.eyebrow{font-size:.72rem;font-weight:800;letter-spacing:.12em;opacity:.6}
    .smart-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.smart-stat{padding:12px;border-radius:14px;background:#fff;border:1px solid rgba(0,0,0,.07);display:grid;grid-template-columns:auto 1fr;column-gap:8px}.smart-stat span{grid-row:span 2;font-size:1.3rem}.smart-stat strong{font-size:1.15rem}.smart-stat small{opacity:.55}
    .smart-timeline{display:grid;gap:0}.smart-timeline-row{display:grid;grid-template-columns:70px 18px 1fr;min-height:55px}.smart-time{font-size:.75rem;font-weight:800;text-align:right;padding:4px 8px 0 0;opacity:.65}.smart-line{position:relative}.smart-line:before{content:"";position:absolute;left:8px;top:0;bottom:0;width:2px;background:rgba(245,184,66,.35)}.smart-line span{position:absolute;top:7px;left:3px;width:12px;height:12px;border-radius:50%;background:#f5b842;border:2px solid #fff;box-shadow:0 0 0 1px rgba(245,184,66,.5)}.smart-event{padding:3px 0 16px 10px;display:grid;gap:3px}.smart-event small{opacity:.6}.smart-empty{padding:18px;text-align:center;opacity:.65;background:rgba(255,255,255,.65);border-radius:14px}.family-fit-note{display:block;font-size:.72rem;opacity:.62;margin-top:2px}.enhancement-sync-status{margin-top:8px;font-size:.78rem}.enhancement-sync-status.ok{color:#277a4a}.enhancement-sync-status.warn{color:#9a6410}.enhancement-sync-status.idle{opacity:.6}
    .smart-day-timeline{margin:16px 0;padding:14px;border:1px solid rgba(245,184,66,.3);border-radius:16px;background:rgba(255,248,232,.6)}.smart-day-timeline-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.smart-day-timeline-head h4{margin:0}.smart-day-timeline-head span{font-size:.75rem;opacity:.55}.smart-mini-row{display:grid;grid-template-columns:70px 1fr auto;gap:10px;align-items:center;padding:8px 0;border-top:1px solid rgba(0,0,0,.06)}.smart-mini-time{font-weight:800;font-size:.78rem}.smart-mini-row small{font-size:.7rem;opacity:.55;text-align:right}
    @media(max-width:600px){.smart-dashboard-head{align-items:flex-start;flex-direction:column}.smart-dashboard-head .btn{width:100%}.smart-stats{grid-template-columns:repeat(2,1fr)}.smart-mini-row{grid-template-columns:62px 1fr}.smart-mini-row small{grid-column:2;text-align:left}}
  `;
  document.head.appendChild(style);
}

function hookEnhancementEvents() {
  document.addEventListener("change", event => {
    if (event.target.matches("#packing-list input, #packing-add-form input")) scheduleMetadataSync();
    if (event.target.matches("#park-sections input[type=checkbox], #itinerary-sections input")) {
      setTimeout(() => { enhanceRideLists(); renderSmartDashboard(); renderDayTimeline(); scheduleMetadataSync(); }, 50);
    }
  });
  document.addEventListener("click", event => {
    if (event.target.closest("#save-trip-info-btn,#save-day-btn,#connect-sync-btn,#disconnect-sync-btn")) {
      setTimeout(() => { renderSmartDashboard(); renderDayTimeline(); scheduleMetadataSync(); }, 150);
    }
  });
  const observer = new MutationObserver(() => { enhanceRideLists(); renderDayTimeline(); });
  observer.observe(document.body, { childList: true, subtree: true });
}

function initEnhancements() {
  installEnhancementStyles();
  installSyncStatus();
  installDashboard();
  installDayTimeline();
  hookEnhancementEvents();
  enhanceRideLists();
  renderSmartDashboard();
  renderDayTimeline();
  // Give the existing app time to restore its sync configuration before
  // attempting metadata sync. This keeps the enhancement layer optional.
  setTimeout(async () => {
    if (enhancementConfig()?.code) {
      await pullTripMetadata();
      renderSmartDashboard();
    }
  }, 1200);
}

document.addEventListener("DOMContentLoaded", initEnhancements);
