/* ---------- Secure account sync ----------
   Uses Supabase Auth + user_trips. Legacy share-code sync remains available
   until the project owner runs supabase-auth.sql and switches over.
*/

let disneyAuthClient = null;
let disneyAuthUser = null;
let disneyAuthTimer = null;
let disneyAuthLastSnapshot = "";

function getDisneyAuthClient() {
  if (disneyAuthClient) return disneyAuthClient;
  try {
    const config = typeof syncConfig !== "undefined" ? syncConfig : null;
    if (!config?.url || !config?.anonKey || !window.supabase) return null;
    disneyAuthClient = window.supabase.createClient(config.url, config.anonKey);
    return disneyAuthClient;
  } catch (_) { return null; }
}

function authSnapshot() {
  let packing = [];
  let family = [];
  try { packing = JSON.parse(localStorage.getItem("disneyPackingList") || "[]"); } catch (_) {}
  try { family = JSON.parse(localStorage.getItem("disneyFamilyProfiles") || "[]"); } catch (_) {}
  return JSON.stringify({
    days: typeof tripDays !== "undefined" ? tripDays : [],
    info: typeof tripInfo !== "undefined" ? tripInfo : {},
    family,
    packing,
  });
}

function installAuthUI() {
  if (document.getElementById("account-sync-btn")) return;
  const sync = document.getElementById("sync-content");
  if (!sync) return;
  const row = document.createElement("div");
  row.className = "account-sync-row";
  row.innerHTML = `<button type="button" class="btn" id="account-sync-btn">🔐 Secure account sync</button><span id="account-sync-label">Optional — sign in to protect and access your trip from any device.</span>`;
  sync.appendChild(row);

  const modal = document.createElement("div");
  modal.id = "account-sync-modal";
  modal.className = "modal-overlay hidden";
  modal.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="account-sync-title"><div class="modal-header"><h3 id="account-sync-title">🔐 Secure Cloud Account</h3><button type="button" class="icon-btn" id="account-sync-close" aria-label="Close">&times;</button></div><div class="modal-body"><p class="empty-hint">Sign in with a magic link. Your trip, family profiles and packing list will be tied to your account instead of a share code.</p><label for="account-email">Email address</label><input id="account-email" class="text-field" type="email" autocomplete="email" placeholder="you@example.com"><p id="account-sync-message" class="empty-hint"></p></div><div class="modal-footer"><button type="button" class="btn danger hidden" id="account-signout">Sign out</button><button type="button" class="btn primary" id="account-send-link">Send magic link</button></div></div></div>`;
  document.body.appendChild(modal);

  document.getElementById("account-sync-btn").addEventListener("click", openAccountSync);
  document.getElementById("account-sync-close").addEventListener("click", () => modal.classList.add("hidden"));
  document.getElementById("account-send-link").addEventListener("click", sendMagicLink);
  document.getElementById("account-signout").addEventListener("click", signOutDisneyAccount);
}

async function openAccountSync() {
  const modal = document.getElementById("account-sync-modal");
  const client = getDisneyAuthClient();
  if (!client) {
    modal.classList.remove("hidden");
    document.getElementById("account-sync-message").textContent = "Configure the Supabase URL and publishable/anon key in Cloud Sync first.";
    return;
  }
  const { data } = await client.auth.getUser();
  disneyAuthUser = data?.user || null;
  modal.classList.remove("hidden");
  document.getElementById("account-email").value = disneyAuthUser?.email || "";
  document.getElementById("account-signout").classList.toggle("hidden", !disneyAuthUser);
  document.getElementById("account-send-link").classList.toggle("hidden", !!disneyAuthUser);
  document.getElementById("account-sync-message").textContent = disneyAuthUser ? `Signed in as ${disneyAuthUser.email}.` : "";
}

async function sendMagicLink() {
  const client = getDisneyAuthClient();
  const email = document.getElementById("account-email").value.trim();
  const message = document.getElementById("account-sync-message");
  if (!client || !email) return;
  message.textContent = "Sending…";
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
  message.textContent = error ? `Could not send link: ${error.message}` : "Check your email for the secure sign-in link.";
}

async function loadAuthenticatedTrip() {
  const client = getDisneyAuthClient();
  if (!client || !disneyAuthUser) return false;
  const { data, error } = await client.rpc("get_my_trip");
  if (error || !data?.length) return false;
  const row = data[0];
  if (Array.isArray(row.trip_days)) {
    tripDays = normalizeTripDaysArray(row.trip_days);
    localStorage.setItem("disneyTripDays", JSON.stringify(tripDays));
  }
  if (row.trip_info) {
    tripInfo = { ...EMPTY_TRIP_INFO, ...row.trip_info };
    localStorage.setItem("disneyTripInfo", JSON.stringify(tripInfo));
  }
  if (Array.isArray(row.family)) localStorage.setItem("disneyFamilyProfiles", JSON.stringify(row.family));
  if (Array.isArray(row.packing)) localStorage.setItem("disneyPackingList", JSON.stringify(row.packing));
  if (typeof renderFamilyProfiles === "function") renderFamilyProfiles();
  if (typeof renderPackingList === "function") renderPackingList();
  if (typeof renderDaysList === "function") renderDaysList();
  if (typeof renderTripInfo === "function") renderTripInfo();
  if (typeof renderWeatherStrip === "function") renderWeatherStrip();
  if (typeof renderTodayPlan === "function") renderTodayPlan();
  disneyAuthLastSnapshot = authSnapshot();
  return true;
}

async function saveAuthenticatedTrip() {
  const client = getDisneyAuthClient();
  if (!client || !disneyAuthUser) return false;
  const family = (() => { try { return JSON.parse(localStorage.getItem("disneyFamilyProfiles") || "[]"); } catch (_) { return []; } })();
  const packing = (() => { try { return JSON.parse(localStorage.getItem("disneyPackingList") || "[]"); } catch (_) { return []; } })();
  const { error } = await client.rpc("upsert_my_trip", {
    p_days: typeof tripDays !== "undefined" ? tripDays : [],
    p_info: typeof tripInfo !== "undefined" ? tripInfo : {},
    p_family: family,
    p_packing: packing,
  });
  if (!error) disneyAuthLastSnapshot = authSnapshot();
  return !error;
}

function startAuthenticatedSync() {
  clearInterval(disneyAuthTimer);
  disneyAuthTimer = setInterval(async () => {
    if (!disneyAuthUser) return;
    const snapshot = authSnapshot();
    if (snapshot !== disneyAuthLastSnapshot) await saveAuthenticatedTrip();
  }, 2000);
}

async function signOutDisneyAccount() {
  const client = getDisneyAuthClient();
  if (client) await client.auth.signOut();
  disneyAuthUser = null;
  document.getElementById("account-sync-label").textContent = "Signed out — legacy share-code sync remains available.";
  document.getElementById("account-sync-modal")?.classList.add("hidden");
}

async function initAuthenticatedSync() {
  installAuthUI();
  const client = getDisneyAuthClient();
  if (!client) return;
  client.auth.onAuthStateChange(async (_event, session) => {
    disneyAuthUser = session?.user || null;
    const label = document.getElementById("account-sync-label");
    if (label) label.textContent = disneyAuthUser ? `🔐 Signed in as ${disneyAuthUser.email}` : "Optional — sign in to protect and access your trip from any device.";
    if (disneyAuthUser) {
      await loadAuthenticatedTrip();
      startAuthenticatedSync();
    }
  });
  const { data } = await client.auth.getSession();
  disneyAuthUser = data?.session?.user || null;
  if (disneyAuthUser) {
    await loadAuthenticatedTrip();
    startAuthenticatedSync();
  }
}

document.addEventListener("DOMContentLoaded", () => setTimeout(initAuthenticatedSync, 300));
