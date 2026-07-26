// ---------- Constants ----------

const WDW_LAT = 28.3852;
const WDW_LON = -81.5639;

const PARKS = [
  { id: "75ea578a-adc8-4116-a54d-dccb60765ef9", name: "Magic Kingdom", emoji: "🏰" },
  { id: "47f90d2c-e191-4239-a466-5892ef59a88b", name: "EPCOT", emoji: "🌐" },
  { id: "288747d1-8b4f-4a64-867e-ea7c9b27bad8", name: "Disney's Hollywood Studios", emoji: "🎬" },
  { id: "1c84a229-8862-4648-9c71-378ddd2c7693", name: "Disney's Animal Kingdom", emoji: "🌴" },
  { id: "b070cbc5-feaa-4b87-a8c1-f94cca037a18", name: "Typhoon Lagoon Water Park", emoji: "🌊" },
  { id: "ead53ea5-22e5-4095-9a83-8c29300d7c63", name: "Blizzard Beach Water Park", emoji: "❄️" },
];

const STORAGE_KEY = "disneyTripDays";
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
let activeDayId = null;
let activeParkItemsByPark = {}; // parkId -> { attractions, restaurants }
let activeLiveDataByPark = {}; // parkId -> Map(attractionId -> { status, waitTime })

// ---------- Persistence ----------

function loadTripDays() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return parsed.map((day) => ({
      ...day,
      parkIds: day.parkIds || (day.parkId ? [day.parkId] : []),
      parkId: undefined,
    }));
  } catch (e) {
    return [];
  }
}

function saveTripDays() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tripDays));
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

// ---------- Rendering: Days list ----------

function renderDaysList() {
  const container = document.getElementById("days-list");
  if (tripDays.length === 0) {
    container.innerHTML = '<p class="empty-hint">No trip days yet. Tap "+ Add Day" to add your first reservation day.</p>';
    return;
  }

  container.innerHTML = "";
  for (const day of tripDays) {
    const card = document.createElement("div");
    card.className = "day-card";
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
      <div class="dc-date">${formatDateDisplay(day.date)}</div>
      <div class="dc-weekday">${formatWeekday(day.date)}</div>
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
    banner.innerHTML = `🎉 <span class="cb-number">${daysUntil}</span> day${daysUntil === 1 ? "" : "s"} until your Disney trip!`;
  } else if (todayIso <= lastDate) {
    const totalDays = daysBetween(firstDate, lastDate) + 1;
    const dayNumber = daysBetween(firstDate, todayIso) + 1;
    banner.innerHTML = `✨ You're on <span class="cb-number">day ${dayNumber}</span> of ${totalDays} of your trip!`;
  } else {
    banner.innerHTML = `🎆 Hope you had a magical trip!`;
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

  container.innerHTML = sorted
    .map((day) => `
      <div class="weather-card" data-weather-date="${day.date}">
        <div class="wc-date">${formatDateDisplay(day.date)}</div>
        <div class="wc-icon">⏳</div>
        <div class="wc-na">Loading…</div>
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
        <div class="wc-date">${formatDateDisplay(day.date)}</div>
        <div class="wc-icon">${icon}</div>
        <div class="wc-temps"><span class="hi">${hi}°</span> / <span class="lo">${lo}°</span></div>
      `;
    } else {
      card.innerHTML = `
        <div class="wc-date">${formatDateDisplay(day.date)}</div>
        <div class="wc-icon">📅</div>
        <div class="wc-na">Forecast not yet available</div>
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
      day.attractionPicks = day.attractionPicks.filter((id) => !removeIds.has(id));
      day.restaurantPicks = day.restaurantPicks.filter((id) => !removeIds.has(id));
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
    renderPlannedSummary();
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

  renderPlannedSummary();
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

function renderPlannedSummary() {
  const day = tripDays.find((d) => d.id === activeDayId);
  const summaryEl = document.getElementById("planned-summary");
  const listEl = document.getElementById("planned-list");
  if (!day) return;

  const picks = [];
  for (const parkId of day.parkIds) {
    const items = activeParkItemsByPark[parkId];
    if (!items) continue;
    for (const item of items.attractions) {
      if (day.attractionPicks.includes(item.id)) picks.push({ ...item, field: "attractionPicks", emoji: "🎢" });
    }
    for (const item of items.restaurants) {
      if (day.restaurantPicks.includes(item.id)) picks.push({ ...item, field: "restaurantPicks", emoji: "🍽️" });
    }
  }

  if (picks.length === 0) {
    summaryEl.classList.add("hidden");
    listEl.innerHTML = "";
    return;
  }

  summaryEl.classList.remove("hidden");
  listEl.innerHTML = picks
    .map(
      (item) => `
        <li>
          <span>${item.emoji} ${item.name}</span>
          <button type="button" class="remove-pick" data-item-id="${item.id}" data-pick-field="${item.field}" aria-label="Remove ${item.name}">&times;</button>
        </li>
      `
    )
    .join("");

  listEl.querySelectorAll(".remove-pick").forEach((btn) => {
    btn.addEventListener("click", () => {
      removePick(btn.dataset.itemId, btn.dataset.pickField);
    });
  });
}

function removePick(itemId, field) {
  const day = tripDays.find((d) => d.id === activeDayId);
  if (!day) return;

  day[field] = day[field].filter((id) => id !== itemId);
  saveTripDays();

  const checkbox = document.querySelector(
    `#park-sections input[data-item-id="${itemId}"][data-pick-field="${field}"]`
  );
  if (checkbox) {
    checkbox.checked = false;
    checkbox.closest("li").classList.remove("picked");
  }

  renderPlannedSummary();
  renderDaysList();
  renderTodayPlan();
}

function renderItemList(listEl, items, pickField, liveMap) {
  const day = tripDays.find((d) => d.id === activeDayId);
  listEl.innerHTML = "";

  if (items.length === 0) {
    listEl.innerHTML = '<li class="no-results">Nothing found for this park.</li>';
    return;
  }

  for (const item of items) {
    const isPicked = day[pickField].includes(item.id);
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
    if (!day[field].includes(itemId)) day[field].push(itemId);
    li.classList.add("picked");
  } else {
    day[field] = day[field].filter((id) => id !== itemId);
    li.classList.remove("picked");
  }

  saveTripDays();
  renderPlannedSummary();
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
        if (day.attractionPicks.includes(item.id)) picks.push({ ...item, emoji: "🎢" });
      }
      for (const item of restaurants) {
        if (day.restaurantPicks.includes(item.id)) picks.push({ ...item, emoji: "🍽️" });
      }
    }
  } catch (e) {
    const emptyP = content.querySelector(".tp-empty");
    if (emptyP) emptyP.textContent = "Couldn't load park info right now.";
    return;
  }

  const groupsEl = document.createElement("div");
  if (picks.length === 0) {
    groupsEl.innerHTML = '<p class="tp-empty">Nothing planned yet — tap "View & edit" to add rides or restaurants.</p>';
  } else {
    groupsEl.className = "tp-groups";
    groupsEl.innerHTML = picks.map((item) => `<span class="tp-chip">${item.emoji} ${item.name}</span>`).join("");
  }

  const loadingP = content.querySelector(".tp-empty");
  if (loadingP) loadingP.replaceWith(groupsEl);
}

function bindTodayPlanOpenButtons() {
  document.querySelectorAll("[data-open-day]").forEach((btn) => {
    btn.addEventListener("click", () => openDayDetail(btn.dataset.openDay));
  });
}

// ---------- Init ----------

function init() {
  sortDays();
  renderDaysList();
  renderWeatherStrip();
  renderTodayPlan();
  renderCountdownBanner();
}

init();
