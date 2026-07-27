// ---------- Constants ----------

const WDW_LAT = 28.3852;
const WDW_LON = -81.5639;

// `name` is the short label shown in the UI — the full names ("Disney's
// Hollywood Studios") are too wide for chips and toggles on a phone.
const PARKS = [
  { id: "75ea578a-adc8-4116-a54d-dccb60765ef9", name: "Magic Kingdom", emoji: "🏰" },
  { id: "47f90d2c-e191-4239-a466-5892ef59a88b", name: "EPCOT", emoji: "🌐" },
  { id: "288747d1-8b4f-4a64-867e-ea7c9b27bad8", name: "Hollywood Studios", emoji: "🎬" },
  { id: "1c84a229-8862-4648-9c71-378ddd2c7693", name: "Animal Kingdom", emoji: "🌴" },
  { id: "b070cbc5-feaa-4b87-a8c1-f94cca037a18", name: "Typhoon Lagoon", emoji: "🌊" },
  { id: "ead53ea5-22e5-4095-9a83-8c29300d7c63", name: "Blizzard Beach", emoji: "❄️" },
];

const OTHER_RESORT_VALUE = "__other__";

// No API provides this list, so it's hand-maintained — current as of the
// 2026 WDW resort lineup. "Other / not listed" covers off-site stays.
const RESORT_GROUPS = [
  {
    label: "Value Resorts",
    resorts: [
      "Disney's All-Star Movies Resort",
      "Disney's All-Star Music Resort",
      "Disney's All-Star Sports Resort",
      "Disney's Art of Animation Resort",
      "Disney's Pop Century Resort",
    ],
  },
  {
    label: "Moderate Resorts",
    resorts: [
      "Disney's Caribbean Beach Resort",
      "Disney's Coronado Springs Resort",
      "Disney's Port Orleans Resort – French Quarter",
      "Disney's Port Orleans Resort – Riverside",
    ],
  },
  {
    label: "Deluxe Resorts",
    resorts: [
      "Disney's Animal Kingdom Lodge",
      "Disney's Beach Club Resort",
      "Disney's BoardWalk Inn",
      "Disney's Contemporary Resort",
      "Disney's Grand Floridian Resort & Spa",
      "Disney's Polynesian Village Resort",
      "Disney's Riviera Resort",
      "Disney's Wilderness Lodge",
      "Disney's Yacht Club Resort",
    ],
  },
  {
    label: "Deluxe Villas (DVC)",
    resorts: [
      "Disney's Animal Kingdom Villas – Jambo House",
      "Disney's Animal Kingdom Villas – Kidani Village",
      "Bay Lake Tower at Disney's Contemporary Resort",
      "Disney's BoardWalk Villas",
      "Copper Creek Villas & Cabins at Disney's Wilderness Lodge",
      "Disney's Old Key West Resort",
      "Disney's Saratoga Springs Resort & Spa",
      "The Villas at Disney's Grand Floridian Resort & Spa",
      "The Villas at Disney's Wilderness Lodge",
    ],
  },
  {
    label: "Other Walt Disney World Resorts",
    resorts: [
      "Disney's Fort Wilderness Resort & Campground",
      "Walt Disney World Swan",
      "Walt Disney World Swan Reserve",
      "Walt Disney World Dolphin",
      "Shades of Green",
    ],
  },
];

// Shared by the itinerary editor and Today's Plan — both group picks by
// type (rides -> shows -> dining) rather than time-of-day.
const TYPE_SECTIONS = [
  { id: "attraction", label: "🎢 Rides & Attractions" },
  { id: "show", label: "🎆 Shows, Parades & Fireworks" },
  { id: "restaurant", label: "🍽️ Restaurants" },
];

const STORAGE_KEY = "disneyTripDays";
const TRIP_INFO_KEY = "disneyTripInfo";
const EMPTY_TRIP_INFO = { resort: "", confirmation: "", checkIn: "", checkOut: "" };
const PARK_CACHE_PREFIX = "disneyParkCache_";
const PARK_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// WMO weather code -> [emoji, label]
const WEATHER_CODES = {
  0: ["☀️", "Clear sky"],
  1: ["🌤️", "Mostly clear"],
  2: ["⛅", "Partly cloudy"],
  3: ["☁️", "Overcast"],
  45: ["🌫️", "Fog"],
  48: ["🌫️", "Fog"],
  51: ["🌦️", "Light drizzle"],
  53: ["🌦️", "Drizzle"],
  55: ["🌦️", "Heavy drizzle"],
  61: ["🌧️", "Light rain"],
  63: ["🌧️", "Rain"],
  65: ["🌧️", "Heavy rain"],
  71: ["🌨️", "Light snow"],
  73: ["🌨️", "Snow"],
  75: ["🌨️", "Heavy snow"],
  80: ["🌦️", "Rain showers"],
  81: ["🌧️", "Rain showers"],
  82: ["⛈️", "Violent showers"],
  95: ["⛈️", "Thunderstorm"],
  96: ["⛈️", "Thunderstorm w/ hail"],
  99: ["⛈️", "Thunderstorm w/ hail"],
};

// ---------- State ----------

let tripDays = loadTripDays();
let tripInfo = loadTripInfo();
let activeDayId = null;
let activeParkItemsByPark = {}; // parkId -> { attractions, restaurants }
let activeLiveDataByPark = {}; // parkId -> Map(attractionId -> { status, waitTime })
let parkHoursByPark = {}; // parkId -> Map(date -> { openingTime, closingTime }) — module-wide, not reset per modal open

// ---------- Persistence ----------

function normalizePicks(picks) {
  return (picks || []).map((p) => (typeof p === "string" ? { id: p, time: "", lightningLane: false } : p));
}

// Shared by loading from localStorage and pulling from the cloud — both are
// just "an array of day objects from somewhere else" that need the same
// shape guarantees.
function normalizeTripDaysArray(parsed) {
  return (parsed || []).map((day) => ({
    ...day,
    parkIds: day.parkIds || (day.parkId ? [day.parkId] : []),
    parkId: undefined,
    attractionPicks: normalizePicks(day.attractionPicks),
    restaurantPicks: normalizePicks(day.restaurantPicks),
    showPicks: normalizePicks(day.showPicks),
    notes: day.notes || "",
  }));
}

function loadTripDays() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeTripDaysArray(raw ? JSON.parse(raw) : []);
  } catch (e) {
    return [];
  }
}

function saveTripDays() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tripDays));
  scheduleCloudPush();
}

function loadTripInfo() {
  try {
    const raw = localStorage.getItem(TRIP_INFO_KEY);
    return raw ? { ...EMPTY_TRIP_INFO, ...JSON.parse(raw) } : { ...EMPTY_TRIP_INFO };
  } catch (e) {
    return { ...EMPTY_TRIP_INFO };
  }
}

function saveTripInfo() {
  localStorage.setItem(TRIP_INFO_KEY, JSON.stringify(tripInfo));
  scheduleCloudPush();
}

// ---------- Cloud Sync ----------
//
// No login: each trip is keyed by a random "sync code" entered on every
// device, like an unlisted share link. The Supabase table has row-level
// security with no policies (default deny) — the only access path is two
// RPC functions (get_trip/upsert_trip) that always require the caller to
// already know the specific code, so the public anon key can't be used to
// list or guess other people's trips. See supabase-setup.sql.

const SYNC_CONFIG_KEY = "disneySyncConfig"; // { url, anonKey, code }
const SYNC_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/l

let syncConfig = loadSyncConfig();
let supabaseClient = null;
let cloudPushTimer = null;

function loadSyncConfig() {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveSyncConfig() {
  if (syncConfig) {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(syncConfig));
  } else {
    localStorage.removeItem(SYNC_CONFIG_KEY);
  }
}

function generateSyncCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SYNC_CODE_ALPHABET[b % SYNC_CODE_ALPHABET.length]).join("");
}

function getSupabaseClient() {
  if (!syncConfig || !syncConfig.url || !syncConfig.anonKey) return null;
  if (!supabaseClient) {
    try {
      // Throws on a malformed URL, and window.supabase won't exist at all
      // if the CDN script was blocked or the device is offline.
      supabaseClient = window.supabase.createClient(syncConfig.url, syncConfig.anonKey);
    } catch (e) {
      console.error("Couldn't create Supabase client:", e);
      return null;
    }
  }
  return supabaseClient;
}

// Fire-and-forget, debounced so a burst of picks/edits collapses into one
// network call instead of one per click. Failures are best-effort — the
// local copy (already saved by the caller) stays the source of truth on
// this device either way.
function scheduleCloudPush() {
  if (!syncConfig || !syncConfig.code) return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(() => {
    pushToCloud();
  }, 800);
}

async function pushToCloud() {
  const client = getSupabaseClient();
  if (!client || !syncConfig.code) return false;
  try {
    const { error } = await client.rpc("upsert_trip", {
      p_code: syncConfig.code,
      p_days: tripDays,
      p_info: tripInfo,
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Cloud sync push failed:", e);
    return false;
  }
}

// Returns true if a row for this code existed and was loaded, false if the
// code is brand new (nothing to pull yet) or the request failed.
async function pullFromCloud() {
  const client = getSupabaseClient();
  if (!client || !syncConfig.code) return false;
  try {
    const { data, error } = await client.rpc("get_trip", { p_code: syncConfig.code });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return false;

    tripDays = normalizeTripDaysArray(row.trip_days || []);
    tripInfo = { ...EMPTY_TRIP_INFO, ...(row.trip_info || {}) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tripDays));
    localStorage.setItem(TRIP_INFO_KEY, JSON.stringify(tripInfo));
    return true;
  } catch (e) {
    console.error("Cloud sync pull failed:", e);
    return false;
  }
}

function renderSyncSection() {
  const content = document.getElementById("sync-content");
  if (syncConfig && syncConfig.code) {
    content.innerHTML = `
      <div class="trip-info-card">
        <div>
          <div class="ti-resort">☁️ Cloud sync on</div>
          <div class="ti-details">Code: <strong>${escapeHtml(syncConfig.code)}</strong> — enter this on your other device</div>
        </div>
        <button type="button" class="tp-link-btn" id="open-sync-btn">Manage</button>
      </div>
    `;
  } else {
    content.innerHTML = `
      <div class="trip-info-empty">
        <p>☁️ View this trip on your phone & laptop</p>
        <button type="button" class="btn primary" id="open-sync-btn">Set up sync</button>
      </div>
    `;
  }
  document.getElementById("open-sync-btn").addEventListener("click", openSyncModal);
}

function setSyncStatusMsg(message) {
  document.getElementById("sync-status-msg").textContent = message;
}

function openSyncModal() {
  document.getElementById("sync-url").value = syncConfig ? syncConfig.url : "";
  document.getElementById("sync-anon-key").value = syncConfig ? syncConfig.anonKey : "";
  document.getElementById("sync-code-input").value = syncConfig ? syncConfig.code : "";
  setSyncStatusMsg("");
  document.getElementById("disconnect-sync-btn").classList.toggle("hidden", !syncConfig);
  openModal("sync-modal");
}

document.getElementById("generate-sync-code-btn").addEventListener("click", () => {
  document.getElementById("sync-code-input").value = generateSyncCode();
});

document.getElementById("connect-sync-btn").addEventListener("click", async () => {
  const url = document.getElementById("sync-url").value.trim();
  const anonKey = document.getElementById("sync-anon-key").value.trim();
  const code = document.getElementById("sync-code-input").value.trim().toUpperCase();

  if (!url || !anonKey || !code) {
    setSyncStatusMsg("Please fill in all three fields.");
    return;
  }

  syncConfig = { url, anonKey, code };
  supabaseClient = null; // force re-init against the (possibly new) config

  setSyncStatusMsg("Connecting…");
  const pulled = await pullFromCloud();

  if (pulled) {
    saveSyncConfig();
    setSyncStatusMsg("Connected! Loaded your existing trip from the cloud.");
    renderAll();
  } else if (getSupabaseClient()) {
    // Either a brand-new code, or the pull failed — either way, try pushing
    // this device's current data up so the code has something behind it.
    const pushed = await pushToCloud();
    if (pushed) {
      saveSyncConfig();
      setSyncStatusMsg("Connected! This device's trip is now saved to the cloud.");
    } else {
      setSyncStatusMsg("Couldn't reach Supabase — double-check the URL and anon key.");
      syncConfig = null;
      return;
    }
  } else {
    setSyncStatusMsg("Couldn't connect — double-check the URL and anon key.");
    syncConfig = null;
    return;
  }

  renderSyncSection();
  setTimeout(() => closeModal("sync-modal"), 1400);
});

document.getElementById("disconnect-sync-btn").addEventListener("click", () => {
  syncConfig = null;
  saveSyncConfig();
  supabaseClient = null;
  renderSyncSection();
  closeModal("sync-modal");
});

function getParkCache(parkId) {
  try {
    const raw = localStorage.getItem(PARK_CACHE_PREFIX + parkId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > PARK_CACHE_TTL_MS) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function setParkCache(parkId, attractions, restaurants, shows) {
  localStorage.setItem(
    PARK_CACHE_PREFIX + parkId,
    JSON.stringify({ timestamp: Date.now(), attractions, restaurants, shows })
  );
}

// ---------- Helpers ----------

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1).trimEnd() + "…";
}

function parseIsoDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateDisplay(dateStr) {
  return parseIsoDate(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatWeekday(dateStr) {
  return parseIsoDate(dateStr).toLocaleDateString(undefined, { weekday: "long" });
}

function formatWeekdayShort(dateStr) {
  return parseIsoDate(dateStr).toLocaleDateString(undefined, { weekday: "short" });
}

function formatMonthDay(dateStr) {
  return parseIsoDate(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatShowTime(isoString) {
  return new Date(isoString).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// <input type="time"> stores "HH:MM" in 24-hour form regardless of locale —
// reformat that for display (e.g. "18:30" -> "6:30 PM").
function formatReservationTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function daysBetween(aIso, bIso) {
  const a = parseIsoDate(aIso);
  const b = parseIsoDate(bIso);
  return Math.round((b - a) / 86400000);
}

function parkById(parkId) {
  return PARKS.find((p) => p.id === parkId);
}

function sortDays() {
  tripDays.sort((a, b) => a.date.localeCompare(b.date));
}

function groupPicksByKind(picks) {
  const groups = { attraction: [], show: [], restaurant: [] };
  for (const p of picks) {
    (groups[p.kind] || groups.attraction).push(p);
  }
  return groups;
}

function buildTodayPlanChipText(item) {
  if (item.kind === "attraction") {
    // Rides just get a Lightning Lane flag, if set — no time, since return
    // times are per-trip planning detail, not a glance-and-go summary.
    return `${item.emoji} ${item.name}${item.lightningLane ? " ⚡" : ""}`;
  }
  // Shows already carry a display-formatted time string; restaurants store
  // a raw "HH:MM" from the time picker that still needs formatting.
  const displayTime = item.kind === "restaurant" ? formatReservationTime(item.time) : item.time;
  const timeStr = displayTime ? ` · ${escapeHtml(displayTime)}` : "";
  return `${item.emoji} ${item.name}${timeStr}`;
}

// ---------- Rendering: Trip info (resort & confirmation) ----------

function renderTripInfo() {
  const content = document.getElementById("trip-info-content");
  const hasInfo = tripInfo.resort || tripInfo.confirmation || tripInfo.checkIn || tripInfo.checkOut;

  if (!hasInfo) {
    content.innerHTML = `
      <div class="trip-info-empty">
        <p>🏨 Add your resort & confirmation info</p>
        <button type="button" class="btn primary" id="edit-trip-info-btn">+ Add</button>
      </div>
    `;
  } else {
    const dateRangeStr =
      tripInfo.checkIn && tripInfo.checkOut
        ? `${formatDateDisplay(tripInfo.checkIn)} – ${formatDateDisplay(tripInfo.checkOut)}`
        : "";
    const detailParts = [];
    if (tripInfo.confirmation) detailParts.push(`Confirmation #${escapeHtml(tripInfo.confirmation)}`);
    if (dateRangeStr) detailParts.push(dateRangeStr);

    content.innerHTML = `
      <div class="trip-info-card">
        <div>
          ${tripInfo.resort ? `<div class="ti-resort">🏨 ${escapeHtml(tripInfo.resort)}</div>` : ""}
          ${detailParts.length ? `<div class="ti-details">${detailParts.join(" · ")}</div>` : ""}
        </div>
        <button type="button" class="tp-link-btn" id="edit-trip-info-btn">Edit</button>
      </div>
    `;
  }

  document.getElementById("edit-trip-info-btn").addEventListener("click", openTripInfoModal);
}

function populateResortSelect() {
  const select = document.getElementById("trip-info-resort-select");
  const optgroupsHtml = RESORT_GROUPS.map(
    (group) => `
      <optgroup label="${escapeHtml(group.label)}">
        ${group.resorts.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("")}
      </optgroup>
    `
  ).join("");
  select.innerHTML = `
    <option value="">Select a resort…</option>
    ${optgroupsHtml}
    <option value="${OTHER_RESORT_VALUE}">Other / not listed</option>
  `;
}

document.getElementById("trip-info-resort-select").addEventListener("change", (e) => {
  const otherInput = document.getElementById("trip-info-resort-other");
  if (e.target.value === OTHER_RESORT_VALUE) {
    otherInput.classList.remove("hidden");
    otherInput.focus();
  } else {
    otherInput.classList.add("hidden");
  }
});

function openTripInfoModal() {
  const select = document.getElementById("trip-info-resort-select");
  const otherInput = document.getElementById("trip-info-resort-other");
  const knownResorts = RESORT_GROUPS.flatMap((g) => g.resorts);

  if (tripInfo.resort && knownResorts.includes(tripInfo.resort)) {
    select.value = tripInfo.resort;
    otherInput.value = "";
    otherInput.classList.add("hidden");
  } else if (tripInfo.resort) {
    select.value = OTHER_RESORT_VALUE;
    otherInput.value = tripInfo.resort;
    otherInput.classList.remove("hidden");
  } else {
    select.value = "";
    otherInput.value = "";
    otherInput.classList.add("hidden");
  }

  document.getElementById("trip-info-confirmation").value = tripInfo.confirmation || "";
  document.getElementById("trip-info-checkin").value = tripInfo.checkIn || "";
  document.getElementById("trip-info-checkout").value = tripInfo.checkOut || "";
  openModal("trip-info-modal");
}

document.getElementById("save-trip-info-btn").addEventListener("click", () => {
  const select = document.getElementById("trip-info-resort-select");
  const otherInput = document.getElementById("trip-info-resort-other");
  const resort = select.value === OTHER_RESORT_VALUE ? otherInput.value.trim() : select.value;

  const previousCheckIn = tripInfo.checkIn;
  const previousCheckOut = tripInfo.checkOut;

  tripInfo = {
    resort,
    confirmation: document.getElementById("trip-info-confirmation").value.trim(),
    checkIn: document.getElementById("trip-info-checkin").value,
    checkOut: document.getElementById("trip-info-checkout").value,
  };
  saveTripInfo();

  // Check-in/check-out double as a quick-start for trip days — but only
  // when those dates actually changed. Re-saving unrelated fields (e.g. a
  // confirmation number edit) with the same dates would otherwise silently
  // resurrect a day the user deliberately deleted.
  const datesChanged = tripInfo.checkIn !== previousCheckIn || tripInfo.checkOut !== previousCheckOut;
  if (datesChanged && tripInfo.checkIn && tripInfo.checkOut && tripInfo.checkOut >= tripInfo.checkIn) {
    addMissingTripDays(tripInfo.checkIn, tripInfo.checkOut);
  }

  closeModal("trip-info-modal");
  renderTripInfo();
  renderDaysList();
  renderWeatherStrip();
  renderTodayPlan();
  renderCountdownBanner();
});

// ---------- Rendering: Days list ----------

function renderDaysList() {
  const container = document.getElementById("days-list");
  if (tripDays.length === 0) {
    container.innerHTML = '<p class="empty-hint">No trip days yet. Tap "+ Add Day" to add your first reservation day.</p>';
    return;
  }

  const todayIso = isoDate(new Date());

  container.innerHTML = "";
  for (const day of tripDays) {
    const isToday = day.date === todayIso;
    const card = document.createElement("div");
    card.className = isToday ? "day-card is-today" : "day-card";
    card.dataset.dayId = day.id;

    const parks = day.parkIds.map(parkById).filter(Boolean);
    const pickCount =
      (day.attractionPicks ? day.attractionPicks.length : 0) +
      (day.restaurantPicks ? day.restaurantPicks.length : 0) +
      (day.showPicks ? day.showPicks.length : 0);

    const parksHtml =
      parks.length > 0
        ? parks.map((p) => `<span class="dc-park">${p.emoji} ${p.name}</span>`).join(" ")
        : `<span class="dc-park none">No park selected</span>`;

    card.innerHTML = `
      <button type="button" class="day-card-delete" aria-label="Delete ${formatDateDisplay(day.date)}">&times;</button>
      <div class="dc-head">
        <span class="dc-date">${formatMonthDay(day.date)}</span>
        <span class="dc-weekday">${formatWeekday(day.date)}</span>
        ${isToday ? '<span class="dc-today-tag">Today</span>' : ""}
      </div>
      <div class="dc-parks">${parksHtml}</div>
      ${pickCount > 0 ? `<div class="dc-picks">${pickCount} item${pickCount === 1 ? "" : "s"} planned</div>` : ""}
      ${day.notes && day.notes.trim() ? `<div class="dc-notes">📝 ${escapeHtml(truncate(day.notes.trim(), 60))}</div>` : ""}
    `;

    card.addEventListener("click", () => openDayDetail(day.id));
    card.querySelector(".day-card-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteDay(day.id);
    });
    container.appendChild(card);
  }
}

function deleteDay(dayId) {
  const day = tripDays.find((d) => d.id === dayId);
  if (!day) return;

  const confirmed = window.confirm(
    `Delete ${formatWeekday(day.date)}, ${formatDateDisplay(day.date)} from your trip?`
  );
  if (!confirmed) return;

  tripDays = tripDays.filter((d) => d.id !== dayId);
  saveTripDays();
  renderDaysList();
  renderWeatherStrip();
  renderTodayPlan();
  renderCountdownBanner();
}

// ---------- Rendering: Countdown banner ----------

function renderCountdownBanner() {
  const banner = document.getElementById("countdown-banner");

  if (tripDays.length === 0) {
    banner.classList.add("hidden");
    return;
  }

  const sorted = [...tripDays].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = sorted[0].date;
  const lastDate = sorted[sorted.length - 1].date;
  const todayIso = isoDate(new Date());

  banner.classList.remove("hidden");

  if (todayIso < firstDate) {
    const daysUntil = daysBetween(todayIso, firstDate);
    banner.innerHTML = `🎉 <span class="cb-number">${daysUntil}</span> day${daysUntil === 1 ? "" : "s"} to go`;
  } else if (todayIso <= lastDate) {
    const totalDays = daysBetween(firstDate, lastDate) + 1;
    const dayNumber = daysBetween(firstDate, todayIso) + 1;
    banner.innerHTML = `✨ Day <span class="cb-number">${dayNumber}</span> of ${totalDays}`;
  } else {
    banner.innerHTML = `🎆 Hope it was magical!`;
  }
}

// ---------- Rendering: Weather strip ----------

async function renderWeatherStrip() {
  const container = document.getElementById("weather-strip");

  if (tripDays.length === 0) {
    container.innerHTML = '<p class="empty-hint">Add trip days below to see the forecast.</p>';
    return;
  }

  const sorted = [...tripDays].sort((a, b) => a.date.localeCompare(b.date));
  const startDate = sorted[0].date;
  const endDate = sorted[sorted.length - 1].date;
  const todayIso = isoDate(new Date());

  const cardHeader = (day) => `
    <div class="wc-day">${day.date === todayIso ? "Today" : formatWeekdayShort(day.date)}</div>
    <div class="wc-date">${formatMonthDay(day.date)}</div>
  `;

  container.innerHTML = sorted
    .map((day) => `
      <div class="weather-card ${day.date === todayIso ? "is-today" : ""}" data-weather-date="${day.date}">
        ${cardHeader(day)}
        <div class="wc-icon">⏳</div>
      </div>
    `)
    .join("");

  let forecast = null;
  try {
    forecast = await fetchWeatherForecast(startDate, endDate);
  } catch (e) {
    forecast = null;
  }

  for (const day of sorted) {
    const card = container.querySelector(`[data-weather-date="${day.date}"]`);
    if (!card) continue;

    const idx = forecast ? forecast.time.indexOf(day.date) : -1;
    if (forecast && idx !== -1) {
      const code = forecast.weathercode[idx];
      const [icon] = WEATHER_CODES[code] || ["❔", "Unknown"];
      const hi = Math.round(forecast.tempMax[idx]);
      const lo = Math.round(forecast.tempMin[idx]);
      card.innerHTML = `
        ${cardHeader(day)}
        <div class="wc-icon">${icon}</div>
        <div class="wc-temps"><span class="hi">${hi}°</span> / <span class="lo">${lo}°</span></div>
      `;
    } else {
      card.innerHTML = `
        ${cardHeader(day)}
        <div class="wc-icon">📅</div>
        <div class="wc-na">No forecast yet</div>
      `;
    }
  }
}

async function fetchWeatherForecast(startDate, endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxForecastDate = new Date(today);
  maxForecastDate.setDate(maxForecastDate.getDate() + 15);

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", WDW_LAT);
  url.searchParams.set("longitude", WDW_LON);
  url.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("timezone", "America/New_York");
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate < isoDate(maxForecastDate) ? endDate : isoDate(maxForecastDate));

  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather fetch failed");
  const data = await res.json();

  return {
    time: data.daily.time,
    weathercode: data.daily.weathercode,
    tempMax: data.daily.temperature_2m_max,
    tempMin: data.daily.temperature_2m_min,
  };
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------- Add Day Modal ----------

function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

document.getElementById("add-day-btn").addEventListener("click", () => {
  document.getElementById("new-day-start").value = "";
  document.getElementById("new-day-end").value = "";
  showAddDayError("");
  openModal("add-day-modal");
});

function showAddDayError(message) {
  const el = document.getElementById("add-day-error");
  el.textContent = message;
  el.classList.toggle("hidden", !message);
}

function dateRange(startStr, endStr) {
  const start = parseIsoDate(startStr);
  const end = parseIsoDate(endStr);
  const dates = [];
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(isoDate(d));
  }
  return dates;
}

// Shared by "+ Add Day" and the resort check-in/check-out autofill — skips
// dates that already exist, so calling it repeatedly is safe (idempotent).
function addMissingTripDays(startStr, endStr) {
  const existingDates = new Set(tripDays.map((d) => d.date));
  let added = false;
  for (const dateStr of dateRange(startStr, endStr)) {
    if (existingDates.has(dateStr)) continue;
    tripDays.push({
      id: uid(),
      date: dateStr,
      parkIds: [],
      attractionPicks: [],
      restaurantPicks: [],
      showPicks: [],
      notes: "",
    });
    added = true;
  }
  if (added) {
    sortDays();
    saveTripDays();
  }
  return added;
}

document.getElementById("confirm-add-day").addEventListener("click", () => {
  const startVal = document.getElementById("new-day-start").value;
  const endVal = document.getElementById("new-day-end").value;

  if (!startVal || !endVal) {
    showAddDayError("Please pick both a first and last day.");
    return;
  }
  if (endVal < startVal) {
    showAddDayError("Last day must be on or after the first day.");
    return;
  }

  addMissingTripDays(startVal, endVal);
  closeModal("add-day-modal");
  renderDaysList();
  renderWeatherStrip();
  renderTodayPlan();
  renderCountdownBanner();
});

// ---------- Day Detail Modal ----------

function openDayDetail(dayId) {
  activeDayId = dayId;
  activeParkItemsByPark = {};
  activeLiveDataByPark = {};

  const day = tripDays.find((d) => d.id === dayId);
  if (!day) return;

  document.getElementById("detail-date-title").textContent =
    `${formatWeekday(day.date)}, ${formatDateDisplay(day.date)}`;

  document.getElementById("day-notes").value = day.notes || "";

  renderParkPicker(day);
  renderParkSectionsForDay(day);

  openModal("day-detail-modal");
}

document.getElementById("day-notes").addEventListener("change", (e) => {
  const day = tripDays.find((d) => d.id === activeDayId);
  if (!day) return;
  day.notes = e.target.value;
  saveTripDays();
  renderDaysList();
  renderTodayPlan();
});

function renderParkPicker(day) {
  const picker = document.getElementById("park-picker");
  picker.innerHTML = PARKS.map(
    (p) => `
      <button type="button" class="park-toggle ${day.parkIds.includes(p.id) ? "selected" : ""}" data-park-id="${p.id}">
        ${p.emoji} ${p.name}
      </button>
    `
  ).join("");

  picker.querySelectorAll(".park-toggle").forEach((btn) => {
    btn.addEventListener("click", () => togglePark(btn.dataset.parkId));
  });
}

function togglePark(parkId) {
  const day = tripDays.find((d) => d.id === activeDayId);
  if (!day) return;

  const idx = day.parkIds.indexOf(parkId);
  if (idx === -1) {
    day.parkIds.push(parkId);
  } else {
    day.parkIds.splice(idx, 1);
    const items = activeParkItemsByPark[parkId];
    if (items) {
      const removeIds = new Set([
        ...items.attractions.map((a) => a.id),
        ...items.restaurants.map((r) => r.id),
        ...items.shows.map((s) => s.id),
      ]);
      day.attractionPicks = day.attractionPicks.filter((p) => !removeIds.has(p.id));
      day.restaurantPicks = day.restaurantPicks.filter((p) => !removeIds.has(p.id));
      day.showPicks = day.showPicks.filter((p) => !removeIds.has(p.id));
    }
  }

  saveTripDays();
  renderParkPicker(day);
  renderParkSectionsForDay(day);
  renderDaysList();
  renderWeatherStrip();
  renderTodayPlan();
}

document.getElementById("refresh-wait-times-btn").addEventListener("click", () => {
  const day = tripDays.find((d) => d.id === activeDayId);
  if (!day) return;
  activeLiveDataByPark = {};
  renderParkSectionsForDay(day);
});

document.getElementById("save-day-btn").addEventListener("click", () => {
  saveTripDays();
  closeModal("day-detail-modal");
  renderDaysList();
  renderWeatherStrip();
  renderTodayPlan();
  renderCountdownBanner();
});

document.querySelectorAll(".close-modal").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

// ---------- Park content (rides & restaurants) ----------

async function fetchParkItems(parkId) {
  const cached = getParkCache(parkId);
  if (cached) {
    return { attractions: cached.attractions, restaurants: cached.restaurants, shows: cached.shows || [] };
  }

  const res = await fetch(`https://api.themeparks.wiki/v1/entity/${parkId}/children`);
  if (!res.ok) throw new Error("Failed to load park data");
  const data = await res.json();
  const children = data.children || [];

  const attractions = children
    .filter((c) => c.entityType === "ATTRACTION")
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const restaurants = children
    .filter((c) => c.entityType === "RESTAURANT")
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const shows = children
    .filter((c) => c.entityType === "SHOW")
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  setParkCache(parkId, attractions, restaurants, shows);
  return { attractions, restaurants, shows };
}

async function fetchLiveData(parkId) {
  const attractionLive = new Map();
  const showLive = new Map();
  try {
    const res = await fetch(`https://api.themeparks.wiki/v1/entity/${parkId}/live`);
    if (!res.ok) throw new Error("Failed to load live data");
    const data = await res.json();
    for (const item of data.liveData || []) {
      if (item.entityType === "ATTRACTION") {
        attractionLive.set(item.id, {
          status: item.status,
          waitTime: item.queue && item.queue.STANDBY ? item.queue.STANDBY.waitTime : null,
        });
      } else if (item.entityType === "SHOW") {
        showLive.set(item.id, {
          status: item.status,
          showtimes: item.showtimes || [],
        });
      }
    }
  } catch (e) {
    // Live data is best-effort — leave the maps empty on failure.
  }
  return { attractionLive, showLive };
}

// Disney only publishes operating hours roughly a month out, so a day
// further out than that will just have no entry in the returned map.
async function fetchParkHours(parkId) {
  if (parkHoursByPark[parkId]) return parkHoursByPark[parkId];

  const hoursByDate = new Map();
  try {
    const res = await fetch(`https://api.themeparks.wiki/v1/entity/${parkId}/schedule`);
    if (!res.ok) throw new Error("Failed to load park schedule");
    const data = await res.json();
    for (const entry of data.schedule || []) {
      if (entry.type !== "OPERATING" || hoursByDate.has(entry.date)) continue;
      hoursByDate.set(entry.date, { openingTime: entry.openingTime, closingTime: entry.closingTime });
    }
  } catch (e) {
    // Best-effort — an empty map just means no hours get shown.
  }

  parkHoursByPark[parkId] = hoursByDate;
  return hoursByDate;
}

function formatParkHoursText(hoursByDate, dateStr) {
  const entry = hoursByDate.get(dateStr);
  if (!entry || !entry.openingTime || !entry.closingTime) return null;
  return `${formatShowTime(entry.openingTime)} – ${formatShowTime(entry.closingTime)}`;
}

function buildWaitBadge(live) {
  if (!live) return "";

  if (live.status === "CLOSED" || live.status === "REFURBISHMENT") {
    return `<span class="wait-badge wait-closed">Closed</span>`;
  }
  if (live.status === "DOWN") {
    return `<span class="wait-badge wait-closed">Temp. down</span>`;
  }
  if (typeof live.waitTime === "number") {
    const cls = live.waitTime >= 45 ? "wait-busy" : "wait-open";
    return `<span class="wait-badge ${cls}">${live.waitTime} min</span>`;
  }
  return `<span class="wait-badge wait-open">Open</span>`;
}

// Plain text (no markup) — shared by the browsing-list badge, the
// itinerary row, and Today's Plan, which each wrap it differently.
function formatShowTimesText(live) {
  if (!live) return "Showtime not available";
  if (live.status === "CLOSED" || live.status === "REFURBISHMENT") return "Not scheduled today";
  if (!live.showtimes || live.showtimes.length === 0) return "No showtime listed";
  return live.showtimes.map((s) => formatShowTime(s.startTime)).join(" · ");
}

function buildShowSubtitle(live) {
  if (!live) return "";

  const text = formatShowTimesText(live);
  const hasTimes = Boolean(live.showtimes && live.showtimes.length > 0) && live.status !== "CLOSED" && live.status !== "REFURBISHMENT";

  if (!hasTimes) {
    return `<span class="show-times show-times-muted">${text}</span>`;
  }
  return `<span class="show-times" title="Reflects today's schedule — check My Disney Experience closer to your date">🕐 ${text}</span>`;
}

async function renderParkSectionsForDay(day) {
  const sectionsEl = document.getElementById("park-sections");
  const emptyHint = document.getElementById("park-empty-hint");
  const refreshBtn = document.getElementById("refresh-wait-times-btn");

  if (day.parkIds.length === 0) {
    sectionsEl.innerHTML = "";
    emptyHint.classList.remove("hidden");
    refreshBtn.classList.add("hidden");
    renderItinerary();
    return;
  }

  emptyHint.classList.add("hidden");
  refreshBtn.classList.remove("hidden");

  sectionsEl.innerHTML = day.parkIds
    .map((parkId) => {
      const park = parkById(parkId);
      return `
        <div class="park-section" data-park-id="${parkId}">
          <h3 class="park-section-title">${park.emoji} ${park.name}</h3>
          <div class="lists-grid">
            <div class="list-column">
              <h4>🎢 Rides & Attractions <span class="count-badge" data-count="attractions"></span></h4>
              <ul class="item-list" data-list="attractions"><li class="no-results">Loading…</li></ul>
            </div>
            <div class="list-column">
              <h4>🍽️ Restaurants <span class="count-badge" data-count="restaurants"></span></h4>
              <ul class="item-list" data-list="restaurants"><li class="no-results">Loading…</li></ul>
            </div>
            <div class="list-column">
              <h4 title="Showtimes reflect today's schedule">🎆 Shows, Parades & Fireworks <span class="count-badge" data-count="shows"></span></h4>
              <ul class="item-list" data-list="shows"><li class="no-results">Loading…</li></ul>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  await Promise.all(day.parkIds.map((parkId) => loadAndRenderParkSection(parkId)));

  renderItinerary();
}

async function loadAndRenderParkSection(parkId) {
  const sectionEl = document.querySelector(`.park-section[data-park-id="${parkId}"]`);
  if (!sectionEl) return;

  let attractions, restaurants, shows;
  if (activeParkItemsByPark[parkId]) {
    ({ attractions, restaurants, shows } = activeParkItemsByPark[parkId]);
  } else {
    try {
      ({ attractions, restaurants, shows } = await fetchParkItems(parkId));
      activeParkItemsByPark[parkId] = { attractions, restaurants, shows };
    } catch (e) {
      sectionEl.querySelectorAll(".item-list").forEach((ul) => {
        ul.innerHTML = '<li class="no-results">Couldn\'t load park info. Check your connection.</li>';
      });
      return;
    }
  }

  let live = activeLiveDataByPark[parkId];
  if (!live) {
    live = await fetchLiveData(parkId);
    activeLiveDataByPark[parkId] = live;
  }

  const hoursByDate = await fetchParkHours(parkId);

  // The modal may have moved on (park removed, day closed) while this was fetching.
  const day = tripDays.find((d) => d.id === activeDayId);
  const stillCurrent = document.querySelector(`.park-section[data-park-id="${parkId}"]`);
  if (!day || !stillCurrent || !day.parkIds.includes(parkId)) return;

  const titleEl = stillCurrent.querySelector(".park-section-title");
  if (titleEl) {
    const hoursText = formatParkHoursText(hoursByDate, day.date);
    const hoursSpan = document.createElement("span");
    hoursSpan.className = "park-hours";
    hoursSpan.textContent = hoursText || "Hours not posted yet";
    titleEl.appendChild(hoursSpan);
  }

  renderItemList(stillCurrent.querySelector('[data-list="attractions"]'), attractions, "attractionPicks", (item) =>
    buildWaitBadge(live.attractionLive.get(item.id))
  );
  renderItemList(stillCurrent.querySelector('[data-list="restaurants"]'), restaurants, "restaurantPicks", null);
  renderItemList(stillCurrent.querySelector('[data-list="shows"]'), shows, "showPicks", (item) =>
    buildShowSubtitle(live.showLive.get(item.id))
  );
  stillCurrent.querySelector('[data-count="attractions"]').textContent = `(${attractions.length})`;
  stillCurrent.querySelector('[data-count="restaurants"]').textContent = `(${restaurants.length})`;
  stillCurrent.querySelector('[data-count="shows"]').textContent = `(${shows.length})`;
}

function renderItemList(listEl, items, pickField, renderExtra) {
  const day = tripDays.find((d) => d.id === activeDayId);
  listEl.innerHTML = "";

  if (items.length === 0) {
    listEl.innerHTML = '<li class="no-results">Nothing found for this park.</li>';
    return;
  }

  // Shows get their (long) showtime string under the name; rides get a
  // short wait-time pill inline after it — same markup, different slot.
  const isShowList = pickField === "showPicks";

  for (const item of items) {
    const isPicked = day[pickField].some((p) => p.id === item.id);
    const li = document.createElement("li");
    if (isPicked) li.classList.add("picked");

    const extra = renderExtra ? renderExtra(item) : "";

    li.innerHTML = `
      <label>
        <input type="checkbox" data-item-id="${item.id}" data-pick-field="${pickField}" ${isPicked ? "checked" : ""}>
        <span class="item-text">
          <span class="item-name">${item.name}</span>
          ${isShowList ? extra : ""}
        </span>
        ${!isShowList ? extra : ""}
      </label>
    `;
    listEl.appendChild(li);
  }

  listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", handlePickToggle);
  });
}

function handlePickToggle(e) {
  const day = tripDays.find((d) => d.id === activeDayId);
  if (!day) return;

  const itemId = e.target.dataset.itemId;
  const field = e.target.dataset.pickField;
  const li = e.target.closest("li");

  if (e.target.checked) {
    if (!day[field].some((p) => p.id === itemId)) {
      day[field].push({ id: itemId, time: "", lightningLane: false });
    }
    li.classList.add("picked");
  } else {
    day[field] = day[field].filter((p) => p.id !== itemId);
    li.classList.remove("picked");
  }

  saveTripDays();
  renderItinerary();
  renderDaysList();
  renderTodayPlan();
}

// ---------- Itinerary (editable: period, time, Lightning Lane) ----------

function collectDayPicks(day) {
  const picks = [];
  for (const parkId of day.parkIds) {
    const items = activeParkItemsByPark[parkId];
    if (!items) continue;
    for (const item of items.attractions) {
      const pick = day.attractionPicks.find((p) => p.id === item.id);
      if (pick) picks.push({ ...item, ...pick, field: "attractionPicks", emoji: "🎢", kind: "attraction" });
    }
    for (const item of items.restaurants) {
      const pick = day.restaurantPicks.find((p) => p.id === item.id);
      if (pick) picks.push({ ...item, ...pick, field: "restaurantPicks", emoji: "🍽️", kind: "restaurant" });
    }
    for (const item of items.shows) {
      const pick = day.showPicks.find((p) => p.id === item.id);
      if (pick) {
        const live = activeLiveDataByPark[parkId] && activeLiveDataByPark[parkId].showLive.get(item.id);
        picks.push({
          ...item,
          ...pick,
          field: "showPicks",
          emoji: "🎆",
          kind: "show",
          showTimesText: formatShowTimesText(live),
        });
      }
    }
  }
  return picks;
}

function renderItinerary() {
  const day = tripDays.find((d) => d.id === activeDayId);
  const wrapEl = document.getElementById("itinerary");
  const sectionsEl = document.getElementById("itinerary-sections");
  if (!day) return;

  const picks = collectDayPicks(day);

  if (picks.length === 0) {
    wrapEl.classList.add("hidden");
    sectionsEl.innerHTML = "";
    return;
  }

  wrapEl.classList.remove("hidden");
  const groups = groupPicksByKind(picks);

  sectionsEl.innerHTML = TYPE_SECTIONS.filter((s) => groups[s.id].length > 0)
    .map(
      (s) => `
        <div class="itin-section">
          <h5 class="itin-section-title">${s.label}</h5>
          <div class="itin-rows">
            ${groups[s.id].map(renderItinRow).join("")}
          </div>
        </div>
      `
    )
    .join("");

  bindItineraryRowEvents();
}

function renderItinRow(item) {
  // Each type shows only the control that's actually meaningful for it:
  // rides get a Lightning Lane flag (no time — nothing to schedule),
  // restaurants get a time field (no scheduling dropdown), shows get their
  // real showtime read-only (no controls at all).
  let controls = "";
  let mainExtra = "";

  if (item.kind === "attraction") {
    mainExtra = `<label class="itin-ll"><input type="checkbox" class="itin-ll-input" ${item.lightningLane ? "checked" : ""}> ⚡ LL</label>`;
  } else if (item.kind === "restaurant") {
    controls = `<input type="time" class="itin-time">`;
  } else if (item.kind === "show") {
    controls = `<span class="itin-show-time" title="Reflects today's schedule — check My Disney Experience closer to your date">🕐 ${item.showTimesText}</span>`;
  }

  return `
    <div class="itin-row" data-item-id="${item.id}" data-pick-field="${item.field}">
      <button type="button" class="remove-pick" data-item-id="${item.id}" data-pick-field="${item.field}" aria-label="Remove ${item.name}">&times;</button>
      <div class="itin-row-main">
        <span>${item.emoji} <span class="itin-name">${item.name}</span></span>
        ${mainExtra}
      </div>
      ${controls ? `<div class="itin-row-controls">${controls}</div>` : ""}
    </div>
  `;
}

function bindItineraryRowEvents() {
  const day = tripDays.find((d) => d.id === activeDayId);
  if (!day) return;

  document.querySelectorAll("#itinerary-sections .itin-row").forEach((row) => {
    const itemId = row.dataset.itemId;
    const field = row.dataset.pickField;
    const pick = day[field].find((p) => p.id === itemId);
    if (!pick) return;

    const timeInput = row.querySelector(".itin-time");
    if (timeInput) {
      // Set via property, not a template attribute — also more robust than
      // interpolating into the HTML string for a value the browser owns.
      timeInput.value = pick.time || "";
      timeInput.addEventListener("change", () => {
        updatePick(itemId, field, { time: timeInput.value });
      });
    }

    const llInput = row.querySelector(".itin-ll-input");
    if (llInput) {
      llInput.addEventListener("change", () => {
        updatePick(itemId, field, { lightningLane: llInput.checked });
      });
    }

    row.querySelector(".remove-pick").addEventListener("click", () => removePick(itemId, field));
  });
}

function updatePick(itemId, field, changes) {
  const day = tripDays.find((d) => d.id === activeDayId);
  if (!day) return;
  const pick = day[field].find((p) => p.id === itemId);
  if (!pick) return;
  Object.assign(pick, changes);
  saveTripDays();
  renderDaysList();
  renderTodayPlan();
}

function removePick(itemId, field) {
  const day = tripDays.find((d) => d.id === activeDayId);
  if (!day) return;

  day[field] = day[field].filter((p) => p.id !== itemId);
  saveTripDays();

  const checkbox = document.querySelector(
    `#park-sections input[data-item-id="${itemId}"][data-pick-field="${field}"]`
  );
  if (checkbox) {
    checkbox.checked = false;
    checkbox.closest("li").classList.remove("picked");
  }

  renderItinerary();
  renderDaysList();
  renderTodayPlan();
}

// ---------- Rendering: Today's Plan ----------

async function renderTodayPlan() {
  const section = document.getElementById("today-plan-section");
  const content = document.getElementById("today-plan-content");
  const todayIso = isoDate(new Date());
  const day = tripDays.find((d) => d.date === todayIso);

  if (!day) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  document.getElementById("today-plan-title").textContent = `Today's Plan — ${formatDateDisplay(day.date)}`;

  const notesHtml =
    day.notes && day.notes.trim() ? `<p class="tp-notes">📝 ${escapeHtml(day.notes)}</p>` : "";

  if (day.parkIds.length === 0) {
    content.innerHTML = `
      ${notesHtml}
      <p class="tp-empty">No park picked for today yet.</p>
      <button type="button" class="tp-link-btn" data-open-day="${day.id}">Choose a park →</button>
    `;
    bindTodayPlanOpenButtons();
    return;
  }

  const parks = day.parkIds.map(parkById).filter(Boolean);
  const parkNamesHtml = (
    await Promise.all(
      parks.map(async (p) => {
        const hoursByDate = await fetchParkHours(p.id);
        const hoursText = formatParkHoursText(hoursByDate, day.date);
        return `${p.emoji} ${p.name} <span class="tp-park-hours">${hoursText || "hours not posted yet"}</span>`;
      })
    )
  ).join(" + ");

  content.innerHTML = `
    <div class="tp-park-row">
      <span class="tp-park-name">${parkNamesHtml}</span>
      <button type="button" class="tp-link-btn" data-open-day="${day.id}">View & edit →</button>
    </div>
    ${notesHtml}
    <p class="tp-empty">Loading your plans…</p>
  `;
  bindTodayPlanOpenButtons();

  const picks = [];
  try {
    for (const parkId of day.parkIds) {
      const { attractions, restaurants, shows } = await fetchParkItems(parkId);
      for (const item of attractions) {
        const pick = day.attractionPicks.find((p) => p.id === item.id);
        if (pick) picks.push({ ...item, ...pick, emoji: "🎢", kind: "attraction", field: "attractionPicks" });
      }
      for (const item of restaurants) {
        const pick = day.restaurantPicks.find((p) => p.id === item.id);
        if (pick) picks.push({ ...item, ...pick, emoji: "🍽️", kind: "restaurant", field: "restaurantPicks" });
      }
      const pickedShows = shows.filter((item) => day.showPicks.some((p) => p.id === item.id));
      if (pickedShows.length > 0) {
        const { showLive } = await fetchLiveData(parkId);
        for (const item of pickedShows) {
          const pick = day.showPicks.find((p) => p.id === item.id);
          const live = showLive.get(item.id);
          picks.push({
            ...item,
            ...pick,
            emoji: "🎆",
            kind: "show",
            field: "showPicks",
            time: formatShowTimesText(live),
          });
        }
      }
    }
  } catch (e) {
    const emptyP = content.querySelector(".tp-empty");
    if (emptyP) emptyP.textContent = "Couldn't load park info right now.";
    return;
  }

  const resultEl = document.createElement("div");
  if (picks.length === 0) {
    resultEl.innerHTML = '<p class="tp-empty">Nothing planned yet — tap "View & edit" to add rides or restaurants.</p>';
  } else {
    const groups = groupPicksByKind(picks);
    resultEl.className = "tp-itinerary";
    resultEl.innerHTML = TYPE_SECTIONS.filter((s) => groups[s.id].length > 0)
      .map(
        (s) => `
          <div class="tp-period-group">
            <div class="tp-period-label">${s.label}</div>
            <div class="tp-groups">
              ${groups[s.id]
                .map(
                  (item) => `
                    <span class="tp-chip">
                      ${buildTodayPlanChipText(item)}
                      <button type="button" class="tp-chip-remove" data-item-id="${item.id}" data-pick-field="${item.field}" aria-label="Remove ${item.name}">&times;</button>
                    </span>
                  `
                )
                .join("")}
            </div>
          </div>
        `
      )
      .join("");

    resultEl.querySelectorAll(".tp-chip-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        removeTodayPlanPick(btn.dataset.itemId, btn.dataset.pickField);
      });
    });
  }

  const loadingP = content.querySelector(".tp-empty");
  if (loadingP) loadingP.replaceWith(resultEl);
}

// Lets you tap a chip in Today's Plan to mark it done (e.g. rode it
// already) without opening the day modal. Operates on whichever day is
// "today" directly, since the modal isn't necessarily open here.
function removeTodayPlanPick(itemId, field) {
  const todayIso = isoDate(new Date());
  const day = tripDays.find((d) => d.date === todayIso);
  if (!day) return;

  day[field] = day[field].filter((p) => p.id !== itemId);
  saveTripDays();
  renderDaysList();
  renderTodayPlan();
}

function bindTodayPlanOpenButtons() {
  document.querySelectorAll("[data-open-day]").forEach((btn) => {
    btn.addEventListener("click", () => openDayDetail(btn.dataset.openDay));
  });
}

// ---------- Init ----------

const WALT_QUOTES = [
  "All our dreams can come true, if we have the courage to pursue them.",
  "It's kind of fun to do the impossible.",
  "The way to get started is to quit talking and begin doing.",
  "If you can dream it, you can do it.",
  "Around here, however, we don't look backwards for very long. We keep moving forward, opening up new doors and doing new things, because we're curious… and curiosity keeps leading us down new paths.",
  "I always like to look on the optimistic side of life.",
  "Laughter is timeless. Imagination has no age. And dreams are forever.",
  "When you believe in a thing, believe in it all the way, implicitly and unquestionable.",
  "Times and conditions change so rapidly that we must keep our aim constantly focused on the future.",
  "First, think. Second, believe. Third, dream. And finally, dare.",
  "The more you like yourself, the less you are like anyone else, which makes you unique.",
  "You can design and create, and build the most wonderful place in the world. But it takes people to make the dream a reality.",
  "Get a good idea and stay with it. Dog it, and work at it until it's done right.",
  "Of all of our inventions for mass communication, pictures still speak the most universally understood language.",
  "A person should set his goals as early as he can and devote all his energy and talent to getting there.",
  "Disneyland will never be completed. It will continue to grow as long as there is imagination left in the world.",
];

function renderWaltQuote() {
  const el = document.getElementById("walt-quote");
  if (!el) return;
  const todayIso = isoDate(new Date());
  let hash = 0;
  for (let i = 0; i < todayIso.length; i++) {
    hash = (hash * 31 + todayIso.charCodeAt(i)) >>> 0;
  }
  const quote = WALT_QUOTES[hash % WALT_QUOTES.length];
  el.textContent = `"${quote}" — Walt Disney`;
}

function renderAll() {
  sortDays();
  renderTripInfo();
  renderDaysList();
  renderWeatherStrip();
  renderTodayPlan();
  renderCountdownBanner();
}

async function init() {
  populateResortSelect();
  renderSyncSection();
  renderWaltQuote();
  renderAll();

  // If sync was already set up on a previous visit, pull the latest before
  // the user starts editing — another device may have changed things since.
  if (syncConfig && syncConfig.code) {
    const pulled = await pullFromCloud();
    if (pulled) renderAll();
  }
}

init();
