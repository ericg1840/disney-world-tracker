// ---------- Family Profiles ----------
// Small, dependency-free family profile module. Profiles are intentionally
// stored separately for now so this feature can ship without changing the
// existing trip sync payload. The next sync migration will move these into
// the authenticated trip record.

const FAMILY_STORAGE_KEY = "disneyFamilyProfiles";

const DEFAULT_FAMILY = [];

function loadFamilyProfiles() {
  try {
    const raw = localStorage.getItem(FAMILY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : DEFAULT_FAMILY;
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (error) {
    console.error("Could not load family profiles:", error);
    return [];
  }
}

function saveFamilyProfiles(profiles) {
  localStorage.setItem(FAMILY_STORAGE_KEY, JSON.stringify(profiles));
}

function familyId() {
  return crypto.randomUUID();
}

function familyEscape(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function familyHeightLabel(height) {
  if (!height) return "Height not set";
  return `${height} in`;
}

function renderFamilyProfiles() {
  const list = document.getElementById("family-list");
  const count = document.getElementById("family-count");
  if (!list) return;

  const profiles = loadFamilyProfiles();
  if (count) count.textContent = `${profiles.length} ${profiles.length === 1 ? "person" : "people"}`;

  if (!profiles.length) {
    list.innerHTML = `
      <div class="family-empty">
        <span class="family-empty-icon">👨‍👩‍👧‍👦</span>
        <div>
          <strong>Add your family</strong>
          <p>Save each person's height so the tracker can help identify which attractions work for everyone.</p>
        </div>
      </div>`;
    return;
  }

  list.innerHTML = profiles.map((person) => `
    <article class="family-card" data-family-id="${familyEscape(person.id)}">
      <div class="family-avatar" aria-hidden="true">${familyEscape(person.emoji || "👤")}</div>
      <div class="family-card-main">
        <strong>${familyEscape(person.name)}</strong>
        <span>${familyHeightLabel(person.height)}</span>
      </div>
      <button type="button" class="family-edit-btn" data-family-edit="${familyEscape(person.id)}" aria-label="Edit ${familyEscape(person.name)}">Edit</button>
      <button type="button" class="family-delete-btn" data-family-delete="${familyEscape(person.id)}" aria-label="Remove ${familyEscape(person.name)}">&times;</button>
    </article>
  `).join("");
}

function openFamilyForm(profile = null) {
  const modal = document.getElementById("family-modal");
  if (!modal) return;
  document.getElementById("family-edit-id").value = profile?.id || "";
  document.getElementById("family-name").value = profile?.name || "";
  document.getElementById("family-height").value = profile?.height || "";
  document.getElementById("family-emoji").value = profile?.emoji || "👤";
  document.getElementById("family-modal-title").textContent = profile ? "Edit Family Member" : "Add Family Member";
  modal.classList.remove("hidden");
  document.getElementById("family-name").focus();
}

function closeFamilyForm() {
  document.getElementById("family-modal")?.classList.add("hidden");
}

function saveFamilyForm() {
  const name = document.getElementById("family-name").value.trim();
  const height = Number(document.getElementById("family-height").value);
  const emoji = document.getElementById("family-emoji").value.trim() || "👤";
  const editId = document.getElementById("family-edit-id").value;

  if (!name) {
    document.getElementById("family-name").focus();
    return;
  }
  if (height && (height < 20 || height > 90)) {
    document.getElementById("family-height").focus();
    return;
  }

  const profiles = loadFamilyProfiles();
  if (editId) {
    const index = profiles.findIndex((person) => person.id === editId);
    if (index !== -1) profiles[index] = { ...profiles[index], name, height: height || null, emoji };
  } else {
    profiles.push({ id: familyId(), name, height: height || null, emoji });
  }

  saveFamilyProfiles(profiles);
  closeFamilyForm();
  renderFamilyProfiles();
}

function deleteFamilyProfile(id) {
  const profiles = loadFamilyProfiles();
  const person = profiles.find((item) => item.id === id);
  if (!person) return;
  if (!window.confirm(`Remove ${person.name} from your family profiles?`)) return;
  saveFamilyProfiles(profiles.filter((item) => item.id !== id));
  renderFamilyProfiles();
}

function installFamilyStyles() {
  if (document.getElementById("family-module-styles")) return;
  const style = document.createElement("style");
  style.id = "family-module-styles";
  style.textContent = `
    .family-section{margin:24px 0;padding:20px;border-radius:18px;background:var(--card-bg,#fff);box-shadow:0 4px 18px rgba(0,0,0,.08)}
    .family-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
    .family-heading-wrap{display:flex;align-items:baseline;gap:10px}.family-count{font-size:.85rem;opacity:.65}
    .family-list{display:grid;gap:10px}.family-card{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid rgba(0,0,0,.09);border-radius:14px;background:rgba(255,255,255,.7)}
    .family-avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:rgba(245,184,66,.16);font-size:1.4rem;flex:0 0 auto}
    .family-card-main{display:grid;gap:2px;flex:1}.family-card-main span{font-size:.85rem;opacity:.65}
    .family-edit-btn,.family-delete-btn{border:0;background:transparent;cursor:pointer;padding:8px;border-radius:8px}.family-edit-btn{font-weight:700}.family-delete-btn{font-size:1.3rem;opacity:.55}.family-edit-btn:hover,.family-delete-btn:hover{background:rgba(0,0,0,.06);opacity:1}
    .family-empty{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px dashed rgba(0,0,0,.18);border-radius:14px}.family-empty-icon{font-size:1.8rem}.family-empty p{margin:4px 0 0;opacity:.68;font-size:.9rem}
    .family-form-grid{display:grid;gap:12px}.family-form-grid label{display:grid;gap:6px}.family-form-grid input{width:100%;box-sizing:border-box}
  `;
  document.head.appendChild(style);
}

function initFamilyProfiles() {
  installFamilyStyles();
  renderFamilyProfiles();

  document.getElementById("add-family-btn")?.addEventListener("click", () => openFamilyForm());
  document.getElementById("family-save-btn")?.addEventListener("click", saveFamilyForm);
  document.getElementById("family-cancel-btn")?.addEventListener("click", closeFamilyForm);
  document.getElementById("family-list")?.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-family-edit]");
    const remove = event.target.closest("[data-family-delete]");
    const profiles = loadFamilyProfiles();
    if (edit) openFamilyForm(profiles.find((person) => person.id === edit.dataset.familyEdit));
    if (remove) deleteFamilyProfile(remove.dataset.familyDelete);
  });
}

document.addEventListener("DOMContentLoaded", initFamilyProfiles);
