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

const PERIOD_SECTIONS = [
  { id: "morning", label: "🌅 Morning" },
  { id: "afternoon", label: "☀️ Afternoon" },
  { id: "evening", label: "🌆 Evening" },
  { id: "", label: "📋 Unscheduled" },
];

const STORAGE_KEY = "disneyTripDays";
const TRIP_INFO_KEY = "disneyTripInfo";
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

// ---------- Persistence ----------

function normalizePicks(picks) {
  return (picks || []).map((p) =>
    typeof p === "string" ? { id: p, period: "", time: "", lightningLane: false } : p
  );
}

function loadTripDays() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return parsed.map((day) => ({
      ...day,
      parkIds: day.parkIds || (day.parkId ? [day.parkId] : []),
      parkId: undefined,
      attractionPicks: normalizePicks(day.attractionPicks),
      restaurantPicks: normalizePicks(day.restaurantPicks),
    }));
  } catch (e) {
    return [];
  }
}

function saveTripDays() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tripDays));
}

function loadTripInfo() {
  const empty = { resort: "", confirmation: "", checkIn: "", checkOut: "" };
  try {
    const raw = localStorage.getItem(TRIP_INFO_KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch (e) {
    return empty;
  }
}

function saveTripInfo() {
  localStorage.setItem(TRIP_INFO_KEY, JSON.stringify(tripInfo));
}

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

function setParkCache(parkId, attractions, restaurants) {
  localStorage.setItem(
    PARK_CACHE_PREFIX + parkId,
    JSON.stringify({ timestamp: Date.now(), attractions, restaurants })
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

function groupPicksByPeriod(picks) {
  const groups = { morning: [], afternoon: [], evening: [], "": [] };
  for (const p of picks) {
    (groups[p.period] || groups[""]).push(p);
  }
  return groups;
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

function openTripInfoModal() {
  document.getElementById("trip-info-resort").value = tripInfo.resort || "";
  document.getElementById("trip-info-confirmation").value = tripInfo.confirmation || "";
  document.getElementById("trip-info-checkin").value = tripInfo.checkIn || "";
  document.getElementById("trip-info-checkout").value = tripInfo.checkOut || "";
  openModal("trip-info-modal");
}

document.getElementById("save-trip-info-btn").addEventListener("click", () => {
  tripInfo = {
    resort: document.getElementById("trip-info-resort").value.trim(),
    confirmation: document.getElementById("trip-info-confirmation").value.trim(),
    checkIn: document.getElementById("trip-info-checkin").value,
    checkOut: document.getElementById("trip-info-checkout").value,
  };
  saveTripInfo();
  closeModal("trip-info-modal");
  renderTripInfo();
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
      (day.restaurantPicks ? day.restaurantPicks.length : 0);

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

  const existingDates = new Set(tripDays.map((d) => d.date));
  for (const dateStr of dateRange(startVal, endVal)) {
    if (existingDates.has(dateStr)) continue;
    tripDays.push({
      id: uid(),
      date: dateStr,
      parkIds: [],
      attractionPicks: [],
      restaurantPicks: [],
    });
  }

  sortDays();
  saveTripDays();
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

  document.getElementById("filter-input").value = "";

  renderParkPicker(day);
  renderParkSectionsForDay(day);

  openModal("day-detail-modal");
}

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
      ]);
      day.attractionPicks = day.attractionPicks.filter((p) => !removeIds.has(p.id));
      day.restaurantPicks = day.restaurantPicks.filter((p) => !removeIds.has(p.id));
    }
  }

  saveTripDays();
  renderParkPicker(day);
  renderParkSectionsForDay(day);
  renderDaysList();
  renderWeatherStrip();
  renderTodayPlan();
}

document.getElementById("filter-input").addEventListener("input", (e) => {
  applyFilter(e.target.value);
});

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
    return { attractions: cached.attractions, restaurants: cached.restaurants };
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

  setParkCache(parkId, attractions, restaurants);
  return { attractions, restaurants };
}

async function fetchLiveData(parkId) {
  const liveMap = new Map();
  try {
    const res = await fetch(`https://api.themeparks.wiki/v1/entity/${parkId}/live`);
    if (!res.ok) throw new Error("Failed to load live data");
    const data = await res.json();
    for (const item of data.liveData || []) {
      if (item.entityType !== "ATTRACTION") continue;
      liveMap.set(item.id, {
        status: item.status,
        waitTime: item.queue && item.queue.STANDBY ? item.queue.STANDBY.waitTime : null,
      });
    }
  } catch (e) {
    // Live data is best-effort — leave the map empty on failure.
  }
  return liveMap;
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

async function renderParkSectionsForDay(day) {
  const sectionsEl = document.getElementById("park-sections");
  const emptyHint = document.getElementById("park-empty-hint");
  const filterInput = document.getElementById("filter-input");
  const refreshBtn = document.getElementById("refresh-wait-times-btn");

  if (day.parkIds.length === 0) {
    sectionsEl.innerHTML = "";
    emptyHint.classList.remove("hidden");
    filterInput.classList.add("hidden");
    refreshBtn.classList.add("hidden");
    renderItinerary();
    return;
  }

  emptyHint.classList.add("hidden");
  filterInput.classList.remove("hidden");
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
          </div>
        </div>
      `;
    })
    .join("");

  await Promise.all(day.parkIds.map((parkId) => loadAndRenderParkSection(parkId)));

  renderItinerary();
  applyFilter(filterInput.value);
}

async function loadAndRenderParkSection(parkId) {
  const sectionEl = document.querySelector(`.park-section[data-park-id="${parkId}"]`);
  if (!sectionEl) return;

  let attractions, restaurants;
  if (activeParkItemsByPark[parkId]) {
    ({ attractions, restaurants } = activeParkItemsByPark[parkId]);
  } else {
    try {
      ({ attractions, restaurants } = await fetchParkItems(parkId));
      activeParkItemsByPark[parkId] = { attractions, restaurants };
    } catch (e) {
      sectionEl.querySelectorAll(".item-list").forEach((ul) => {
        ul.innerHTML = '<li class="no-results">Couldn\'t load park info. Check your connection.</li>';
      });
      return;
    }
  }

  let liveMap = activeLiveDataByPark[parkId];
  if (!liveMap) {
    liveMap = await fetchLiveData(parkId);
    activeLiveDataByPark[parkId] = liveMap;
  }

  // The modal may have moved on (park removed, day closed) while this was fetching.
  const day = tripDays.find((d) => d.id === activeDayId);
  const stillCurrent = document.querySelector(`.park-section[data-park-id="${parkId}"]`);
  if (!day || !stillCurrent || !day.parkIds.includes(parkId)) return;

  renderItemList(stillCurrent.querySelector('[data-list="attractions"]'), attractions, "attractionPicks", liveMap);
  renderItemList(stillCurrent.querySelector('[data-list="restaurants"]'), restaurants, "restaurantPicks", null);
  stillCurrent.querySelector('[data-count="attractions"]').textContent = `(${attractions.length})`;
  stillCurrent.querySelector('[data-count="restaurants"]').textContent = `(${restaurants.length})`;
}

function renderItemList(listEl, items, pickField, liveMap) {
  const day = tripDays.find((d) => d.id === activeDayId);
  listEl.innerHTML = "";

  if (items.length === 0) {
    listEl.innerHTML = '<li class="no-results">Nothing found for this park.</li>';
    return;
  }

  for (const item of items) {
    const isPicked = day[pickField].some((p) => p.id === item.id);
    const li = document.createElement("li");
    li.dataset.itemName = item.name.toLowerCase();
    if (isPicked) li.classList.add("picked");

    const badge = liveMap ? buildWaitBadge(liveMap.get(item.id)) : "";

    li.innerHTML = `
      <label>
        <input type="checkbox" data-item-id="${item.id}" data-pick-field="${pickField}" ${isPicked ? "checked" : ""}>
        <span>${item.name}</span>
        ${badge}
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
      day[field].push({ id: itemId, period: "", time: "", lightningLane: false });
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

function applyFilter(query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll("#park-sections .item-list li").forEach((li) => {
    if (!li.dataset.itemName) return;
    li.style.display = li.dataset.itemName.includes(q) ? "" : "none";
  });
}

// ---------- Itinerary (editable: period, time, Lightning Lane) ----------

function collectDayPicks(day) {
  const picks = [];
  for (const parkId of day.parkIds) {
    const items = activeParkItemsByPark[parkId];
    if (!items) continue;
    for (const item of items.attractions) {
      const pick = day.attractionPicks.find((p) => p.id === item.id);
      if (pick) picks.push({ ...item, ...pick, field: "attractionPicks", emoji: "🎢", isAttraction: true });
    }
    for (const item of items.restaurants) {
      const pick = day.restaurantPicks.find((p) => p.id === item.id);
      if (pick) picks.push({ ...item, ...pick, field: "restaurantPicks", emoji: "🍽️", isAttraction: false });
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
  const groups = groupPicksByPeriod(picks);

  sectionsEl.innerHTML = PERIOD_SECTIONS.filter((s) => groups[s.id].length > 0)
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
  const timePlaceholder = item.isAttraction ? "Return time" : "Reservation time";
  const llToggle = item.isAttraction
    ? `<label class="itin-ll"><input type="checkbox" class="itin-ll-input" ${item.lightningLane ? "checked" : ""}> ⚡ LL</label>`
    : "";

  return `
    <div class="itin-row" data-item-id="${item.id}" data-pick-field="${item.field}">
      <button type="button" class="remove-pick" data-item-id="${item.id}" data-pick-field="${item.field}" aria-label="Remove ${item.name}">&times;</button>
      <div class="itin-row-main">
        <span>${item.emoji} <span class="itin-name">${item.name}</span></span>
        ${llToggle}
      </div>
      <div class="itin-row-controls">
        <select class="itin-period">
          <option value="" ${!item.period ? "selected" : ""}>Unscheduled</option>
          <option value="morning" ${item.period === "morning" ? "selected" : ""}>🌅 Morning</option>
          <option value="afternoon" ${item.period === "afternoon" ? "selected" : ""}>☀️ Afternoon</option>
          <option value="evening" ${item.period === "evening" ? "selected" : ""}>🌆 Evening</option>
        </select>
        <input type="text" class="itin-time" placeholder="${timePlaceholder}">
      </div>
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
    // Set via property, not a template attribute, so quotes/special chars in
    // user-typed times can't break the surrounding markup.
    timeInput.value = pick.time || "";
    timeInput.addEventListener("change", () => {
      updatePick(itemId, field, { time: timeInput.value });
    });

    const periodSelect = row.querySelector(".itin-period");
    periodSelect.addEventListener("change", () => {
      updatePick(itemId, field, { period: periodSelect.value });
      renderItinerary(); // moves the row to a different section
    });

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

  if (day.parkIds.length === 0) {
    content.innerHTML = `
      <p class="tp-empty">No park picked for today yet.</p>
      <button type="button" class="tp-link-btn" data-open-day="${day.id}">Choose a park →</button>
    `;
    bindTodayPlanOpenButtons();
    return;
  }

  const parks = day.parkIds.map(parkById).filter(Boolean);
  content.innerHTML = `
    <div class="tp-park-row">
      <span class="tp-park-name">${parks.map((p) => `${p.emoji} ${p.name}`).join(" + ")}</span>
      <button type="button" class="tp-link-btn" data-open-day="${day.id}">View & edit →</button>
    </div>
    <p class="tp-empty">Loading your plans…</p>
  `;
  bindTodayPlanOpenButtons();

  const picks = [];
  try {
    for (const parkId of day.parkIds) {
      const { attractions, restaurants } = await fetchParkItems(parkId);
      for (const item of attractions) {
        const pick = day.attractionPicks.find((p) => p.id === item.id);
        if (pick) picks.push({ ...item, ...pick, emoji: "🎢", isAttraction: true });
      }
      for (const item of restaurants) {
        const pick = day.restaurantPicks.find((p) => p.id === item.id);
        if (pick) picks.push({ ...item, ...pick, emoji: "🍽️", isAttraction: false });
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
    const groups = groupPicksByPeriod(picks);
    resultEl.className = "tp-itinerary";
    resultEl.innerHTML = PERIOD_SECTIONS.filter((s) => groups[s.id].length > 0)
      .map(
        (s) => `
          <div class="tp-period-group">
            <div class="tp-period-label">${s.label}</div>
            <div class="tp-groups">
              ${groups[s.id]
                .map((item) => {
                  const timeStr = item.time ? ` · ${escapeHtml(item.time)}` : "";
                  const llStr = item.lightningLane ? " ⚡" : "";
                  return `<span class="tp-chip">${item.emoji} ${item.name}${timeStr}${llStr}</span>`;
                })
                .join("")}
            </div>
          </div>
        `
      )
      .join("");
  }

  const loadingP = content.querySelector(".tp-empty");
  if (loadingP) loadingP.replaceWith(resultEl);
}

function bindTodayPlanOpenButtons() {
  document.querySelectorAll("[data-open-day]").forEach((btn) => {
    btn.addEventListener("click", () => openDayDetail(btn.dataset.openDay));
  });
}

// ---------- Init ----------

function init() {
  sortDays();
  renderTripInfo();
  renderDaysList();
  renderWeatherStrip();
  renderTodayPlan();
  renderCountdownBanner();
}

init();
