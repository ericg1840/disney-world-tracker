/* Keeps family profiles and packing data in sync with the legacy trip code.
   This layer is intentionally separate from the core trip payload so the
   existing database RPCs remain backward compatible. */

async function syncDisneyMetadataNow() {
  try {
    const config = typeof syncConfig !== "undefined" ? syncConfig : null;
    if (!config?.code || !config.url || !config.anonKey || !window.supabase) return false;
    const client = window.supabase.createClient(config.url, config.anonKey);
    const family = typeof loadFamilyProfiles === "function" ? loadFamilyProfiles() : [];
    let packing = [];
    try { packing = JSON.parse(localStorage.getItem("disneyPackingList") || "[]"); } catch (_) {}
    const { error } = await client.rpc("upsert_trip_metadata", {
      p_code: config.code,
      p_family: family,
      p_packing: packing,
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn("Disney metadata sync failed:", error);
    return false;
  }
}

async function pullDisneyMetadataNow() {
  try {
    const config = typeof syncConfig !== "undefined" ? syncConfig : null;
    if (!config?.code || !config.url || !config.anonKey || !window.supabase) return false;
    const client = window.supabase.createClient(config.url, config.anonKey);
    const { data, error } = await client.rpc("get_trip_metadata", { p_code: config.code });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return false;
    if (Array.isArray(row.family)) localStorage.setItem("disneyFamilyProfiles", JSON.stringify(row.family));
    if (Array.isArray(row.packing)) localStorage.setItem("disneyPackingList", JSON.stringify(row.packing));
    if (typeof renderFamilyProfiles === "function") renderFamilyProfiles();
    if (typeof renderPackingList === "function") renderPackingList();
    return true;
  } catch (error) {
    console.warn("Disney metadata pull failed:", error);
    return false;
  }
}

let disneyMetadataTimer = null;
function scheduleDisneyMetadataSync() {
  clearTimeout(disneyMetadataTimer);
  disneyMetadataTimer = setTimeout(syncDisneyMetadataNow, 700);
}

document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", (event) => {
    if (event.target.closest("#family-save-btn,#family-delete-btn,#save-day-btn,#connect-sync-btn")) {
      scheduleDisneyMetadataSync();
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("#packing-list input[type=checkbox]")) scheduleDisneyMetadataSync();
  });
  document.getElementById("packing-add-form")?.addEventListener("submit", scheduleDisneyMetadataSync);
  setTimeout(pullDisneyMetadataNow, 1500);
});
