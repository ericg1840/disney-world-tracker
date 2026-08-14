/* ---------- Automatic Day Planner ----------
   Creates a practical first-pass itinerary from the user's selected items.
   It never invents attraction wait times. Dining times are distributed only
   when the user has left them blank; shows remain anchored to published times.
*/

function plannerCurrentDay() {
  if (typeof tripDays === "undefined" || !tripDays.length) return null;
  const today = typeof isoDate === "function" ? isoDate(new Date()) : "";
  return tripDays.find(d => d.date === today) || tripDays[0];
}

function plannerInstallUI() {
  if (document.getElementById("advanced-planner-btn")) return;
  const dashboard = document.getElementById("smart-dashboard");
  if (!dashboard) return;
  const button = document.createElement("button");
  button.type = "button";
  button.id = "advanced-planner-btn";
  button.className = "btn planner-secondary-btn";
  button.textContent = "🪄 Optimize My Day";
  dashboard.querySelector(".smart-dashboard-head")?.appendChild(button);

  const modal = document.createElement("div");
  modal.id = "planner-modal";
  modal.className = "modal-overlay hidden";
  modal.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="planner-title"><div class="modal-header"><h3 id="planner-title">🪄 Build My Day</h3><button type="button" class="icon-btn" id="planner-close">&times;</button></div><div class="modal-body"><p class="empty-hint">We'll organize your selected items into a realistic day. Existing dining times are preserved.</p><label for="planner-arrival">Park arrival</label><input type="time" id="planner-arrival" value="08:30"><label for="planner-departure">Park departure</label><input type="time" id="planner-departure" value="21:00"><label class="planner-check"><input type="checkbox" id="planner-break" checked> Add a suggested afternoon hotel/rest break</label><div id="planner-preview" class="planner-preview"></div></div><div class="modal-footer"><button type="button" class="btn" id="planner-preview-btn">Preview</button><button type="button" class="btn primary" id="planner-apply-btn">Build Itinerary</button></div></div>`;
  document.body.appendChild(modal);
  button.addEventListener("click", openPlanner);
  document.getElementById("planner-close").addEventListener("click", closePlanner);
  document.getElementById("planner-preview-btn").addEventListener("click", renderPlannerPreview);
  document.getElementById("planner-apply-btn").addEventListener("click", applyPlanner);
}

function openPlanner() {
  const day = plannerCurrentDay();
  if (!day) { alert("Add a trip day first."); return; }
  if (!day.parkIds?.length) { alert("Choose a park for this day first."); return; }
  document.getElementById("planner-modal")?.classList.remove("hidden");
  renderPlannerPreview();
}

function closePlanner() { document.getElementById("planner-modal")?.classList.add("hidden"); }

function minutesFromTime(value) {
  const [h,m] = value.split(":").map(Number);
  return h * 60 + m;
}
function timeFromMinutes(total) {
  const normalized = Math.max(0, Math.min(1439, total));
  return `${String(Math.floor(normalized / 60)).padStart(2,"0")}:${String(normalized % 60).padStart(2,"0")}`;
}

function plannerItems(day) {
  const picks = typeof collectDayPicks === "function" ? collectDayPicks(day) : [];
  return picks.sort((a,b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    if (a.kind === "restaurant" && b.kind !== "restaurant") return 1;
    if (b.kind === "restaurant" && a.kind !== "restaurant") return -1;
    return a.name.localeCompare(b.name);
  });
}

function plannerSuggestion(day) {
  const arrival = document.getElementById("planner-arrival").value || "08:30";
  const departure = document.getElementById("planner-departure").value || "21:00";
  const items = plannerItems(day);
  const start = minutesFromTime(arrival);
  const end = minutesFromTime(departure);
  const available = Math.max(60, end - start);
  const untimed = items.filter(i => !i.time);
  const timed = items.filter(i => i.time);
  const suggestions = [];
  const slotSize = untimed.length ? Math.max(30, Math.floor(available / (untimed.length + 1))) : 0;
  let cursor = start + 20;

  for (const item of timed) suggestions.push({ ...item, suggestedTime: item.time, locked: true });
  for (const item of untimed) {
    let suggested = cursor;
    if (item.kind === "restaurant") suggested = Math.max(suggested, start + 180);
    suggestions.push({ ...item, suggestedTime: timeFromMinutes(suggested), locked: false });
    cursor += slotSize;
  }
  suggestions.sort((a,b) => a.suggestedTime.localeCompare(b.suggestedTime));
  const breakAt = document.getElementById("planner-break")?.checked && available >= 420 ? timeFromMinutes(start + Math.floor(available * .45)) : null;
  return { arrival, departure, suggestions, breakAt };
}

function renderPlannerPreview() {
  const day = plannerCurrentDay();
  const el = document.getElementById("planner-preview");
  if (!day || !el) return;
  const plan = plannerSuggestion(day);
  if (!plan.suggestions.length) {
    el.innerHTML = `<p class="empty-hint">Select some rides, restaurants or shows first.</p>`;
    return;
  }
  el.innerHTML = plan.suggestions.map(item => `<div class="planner-row"><strong>${item.suggestedTime}</strong><span>${item.emoji} ${item.name}</span><small>${item.locked ? "Existing time" : "Suggested"}</small></div>`).join("") + (plan.breakAt ? `<div class="planner-break">🏨 ${plan.breakAt} — Suggested hotel/rest break</div>` : "");
}

function applyPlanner() {
  const day = plannerCurrentDay();
  if (!day) return;
  const plan = plannerSuggestion(day);
  const byId = new Map(plan.suggestions.map(item => [item.id, item.suggestedTime]));
  for (const field of ["restaurantPicks", "attractionPicks"]) {
    for (const pick of day[field] || []) {
      if (byId.has(pick.id) && field === "restaurantPicks") pick.time = byId.get(pick.id);
    }
  }
  if (typeof saveTripDays === "function") saveTripDays();
  if (typeof renderDaysList === "function") renderDaysList();
  if (typeof renderTodayPlan === "function") renderTodayPlan();
  if (typeof renderSmartDashboard === "function") renderSmartDashboard();
  closePlanner();
  if (typeof openDayDetail === "function") openDayDetail(day.id);
}

function plannerStyles() {
  if (document.getElementById("planner-styles")) return;
  const style = document.createElement("style");
  style.id = "planner-styles";
  style.textContent = `.planner-secondary-btn{margin-left:8px}.planner-preview{margin-top:14px;display:grid;gap:5px}.planner-row{display:grid;grid-template-columns:70px 1fr auto;gap:8px;align-items:center;padding:8px;border-radius:10px;background:rgba(0,0,0,.035)}.planner-row strong{font-size:.8rem}.planner-row small{font-size:.7rem;opacity:.55}.planner-break{margin:8px 0;padding:10px;border-radius:10px;background:rgba(245,184,66,.12);font-size:.85rem}.planner-check{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;gap:8px;margin-top:14px}.planner-check input{width:auto!important}@media(max-width:600px){.planner-secondary-btn{margin:8px 0 0;width:100%}.planner-row{grid-template-columns:60px 1fr}.planner-row small{grid-column:2}}`;
  document.head.appendChild(style);
}

document.addEventListener("DOMContentLoaded", () => setTimeout(() => { plannerStyles(); plannerInstallUI(); }, 400));
