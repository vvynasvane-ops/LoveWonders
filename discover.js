import {
  requireAuth, db, auth, signOut, collection, getDocs, doc, getDoc, updateDoc, addDoc,
  serverTimestamp, arrayUnion, arrayRemove
} from "./firebase-init.js";
import { decryptWithCode } from "./crypto-utils.js";
import { openChat, closeChat } from "./chat.js";
import { initTheme } from "./theme.js";
import { renderNav } from "./nav.js";
import { escapeHtml, placeholderPhoto, personCardHtml, isOnlineNow, activityLabel, tagsHtml, loaderHtml, loaderTrackHtml } from "./common.js";
import { matchScore, hasPreferences } from "./recommend.js";
import { startPresence } from "./presence.js";
import { showToast, initNotifications } from "./notifications.js";

initTheme();
renderNav("discover");
document.body.insertAdjacentHTML("beforeend", loaderTrackHtml("Loading Discover"));

const grid = document.querySelector("#grid");
const recommendedGrid = document.querySelector("#recommended-grid");
const likesGrid = document.querySelector("#likes-grid");
const noLikes = document.querySelector("#no-likes");
const noResults = document.querySelector("#no-results");
const noRecommended = document.querySelector("#no-recommended");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const filtersToggleBtn = document.querySelector("#filters-toggle-btn");
const filtersPanel = document.querySelector("#filters-panel");
const applyFiltersBtn = document.querySelector("#apply-filters");
const clearFiltersBtn = document.querySelector("#clear-filters");
const savePresetBtn = document.querySelector("#save-preset");
const presetList = document.querySelector("#preset-list");
const detail = document.querySelector("#detail-overlay");
const detailBody = document.querySelector("#detail-body");
const closeDetailBtn = document.querySelector("#close-detail");
const logoutBtn = document.querySelector("#logout-btn");

let me, myData, everyone = [];
let filters = { ageMin: null, ageMax: null, gender: "", country: "", ethnicity: "", nationality: "", language: "", religion: "", intent: "", onlineOnly: false, hasPhoto: false };

async function load() {
  grid.innerHTML = loaderHtml("Scanning for matches");
  recommendedGrid.innerHTML = loaderHtml();
  me = await requireAuth();
  startPresence(me.uid);
  const meSnap = await getDoc(doc(db, "users", me.uid));
  myData = meSnap.data() || {};
  document.querySelector(".loader-page")?.remove();
  const blocked = new Set(myData.blockedUsers || []);

  const snap = await getDocs(collection(db, "users"));
  everyone = [];
  snap.forEach(d => {
    if (d.id === me.uid || blocked.has(d.id)) return;
    everyone.push({ uid: d.id, ...d.data() });
  });

  render();
  renderPresets();
  initNotifications(me.uid, myData.preferences);
}

function passesFilters(p) {
  if (filters.ageMin && (!p.age || p.age < filters.ageMin)) return false;
  if (filters.ageMax && (!p.age || p.age > filters.ageMax)) return false;
  if (filters.gender && p.gender !== filters.gender) return false;
  if (filters.country && norm(p.country) !== norm(filters.country)) return false;
  if (filters.ethnicity && norm(p.ethnicity) !== norm(filters.ethnicity)) return false;
  if (filters.nationality && norm(p.nationality) !== norm(filters.nationality)) return false;
  if (filters.language && !(p.languages || []).some(l => norm(l).includes(norm(filters.language)))) return false;
  if (filters.religion && p.religion !== filters.religion) return false;
  if (filters.intent && p.relationshipIntent !== filters.intent) return false;
  if (filters.onlineOnly && !(isOnlineNow(p.lastActive) && p.showOnlineStatus !== false)) return false;
  if (filters.hasPhoto && !p.photoURL) return false;
  return true;
}
function norm(v) { return (v || "").toString().trim().toLowerCase(); }

function matchesSearch(p, term) {
  if (!term) return true;
  const hay = `${p.name || ""} ${p.bio || ""} ${p.city || ""} ${p.country || ""} ${p.memberNo || ""}`.toLowerCase();
  return hay.includes(term);
}

function sortList(list) {
  const sorted = [...list];
  if (sortSelect.value === "active") {
    sorted.sort((a, b) => msOf(b.lastActive) - msOf(a.lastActive));
  } else {
    sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  return sorted;
}
function msOf(ts) {
  if (!ts) return 0;
  return ts.toMillis ? ts.toMillis() : (ts instanceof Date ? ts.getTime() : ts);
}

function isLiked(uid) { return (myData.likes || []).includes(uid); }

function render() {
  const term = searchInput.value.trim().toLowerCase();
  const visible = sortList(everyone.filter(p => passesFilters(p) && matchesSearch(p, term)));

  if (hasPreferences(myData.preferences)) {
    const scored = visible
      .map(p => ({ p, score: matchScore(myData.preferences, p) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    recommendedGrid.style.display = scored.length ? "grid" : "none";
    noRecommended.style.display = scored.length ? "none" : "block";
    recommendedGrid.innerHTML = scored.map(x => personCardHtml(x.p.uid, x.p, true, isLiked(x.p.uid))).join("");
    attachCardHandlers(recommendedGrid, visible);
  } else {
    recommendedGrid.style.display = "none";
    recommendedGrid.innerHTML = "";
    noRecommended.style.display = "block";
  }

  const liked = everyone.filter(p => isLiked(p.uid));
  likesGrid.style.display = liked.length ? "grid" : "none";
  noLikes.style.display = liked.length ? "none" : "block";
  likesGrid.innerHTML = liked.map(p => personCardHtml(p.uid, p, false, true)).join("");
  attachCardHandlers(likesGrid, liked);

  grid.innerHTML = visible.map(p => personCardHtml(p.uid, p, false, isLiked(p.uid))).join("");
  attachCardHandlers(grid, visible);
  noResults.style.display = visible.length ? "none" : "block";
}

function attachCardHandlers(container, list) {
  container.querySelectorAll(".person-card").forEach(card => {
    card.addEventListener("click", (e) => {
      const likeBtn = e.target.closest(".card-like-btn");
      if (likeBtn) { e.stopPropagation(); toggleLike(likeBtn.dataset.likeUid); return; }
      const p = list.find(x => x.uid === card.dataset.uid);
      if (p) openDetail(p.uid, p);
    });
  });
}

async function toggleLike(uid) {
  const liked = isLiked(uid);
  myData.likes = myData.likes || [];
  if (liked) myData.likes = myData.likes.filter(u => u !== uid);
  else myData.likes.push(uid);
  render();
  await updateDoc(doc(db, "users", me.uid), { likes: liked ? arrayRemove(uid) : arrayUnion(uid) });
  if (!liked) {
    const other = everyone.find(p => p.uid === uid);
    if (other && (other.likes || []).includes(me.uid)) showToast(`It's a mutual like with ${other.name || "them"}!`, { type: "match" });
    else showToast("Liked.", { type: "success" });
  } else {
    showToast("Removed from likes.", { type: "info" });
  }
}

searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);
filtersToggleBtn.addEventListener("click", () => {
  filtersPanel.style.display = filtersPanel.style.display === "none" ? "block" : "none";
});
function readFiltersFromForm() {
  return {
    ageMin: Number(document.querySelector("#f-age-min").value) || null,
    ageMax: Number(document.querySelector("#f-age-max").value) || null,
    gender: document.querySelector("#f-gender").value,
    country: document.querySelector("#f-country").value.trim(),
    ethnicity: document.querySelector("#f-ethnicity").value.trim(),
    nationality: document.querySelector("#f-nationality").value.trim(),
    language: document.querySelector("#f-language").value.trim(),
    religion: document.querySelector("#f-religion").value,
    intent: document.querySelector("#f-intent").value,
    onlineOnly: document.querySelector("#f-online").checked,
    hasPhoto: document.querySelector("#f-has-photo").checked
  };
}
function writeFiltersToForm(f) {
  document.querySelector("#f-age-min").value = f.ageMin || "";
  document.querySelector("#f-age-max").value = f.ageMax || "";
  document.querySelector("#f-gender").value = f.gender || "";
  document.querySelector("#f-country").value = f.country || "";
  document.querySelector("#f-ethnicity").value = f.ethnicity || "";
  document.querySelector("#f-nationality").value = f.nationality || "";
  document.querySelector("#f-language").value = f.language || "";
  document.querySelector("#f-religion").value = f.religion || "";
  document.querySelector("#f-intent").value = f.intent || "";
  document.querySelector("#f-online").checked = !!f.onlineOnly;
  document.querySelector("#f-has-photo").checked = !!f.hasPhoto;
}
applyFiltersBtn.addEventListener("click", () => {
  filters = readFiltersFromForm();
  render();
});
clearFiltersBtn.addEventListener("click", () => {
  ["#f-age-min", "#f-age-max", "#f-country", "#f-ethnicity", "#f-nationality", "#f-language"].forEach(sel => (document.querySelector(sel).value = ""));
  document.querySelector("#f-gender").value = "";
  document.querySelector("#f-religion").value = "";
  document.querySelector("#f-intent").value = "";
  document.querySelector("#f-online").checked = false;
  document.querySelector("#f-has-photo").checked = false;
  filters = { ageMin: null, ageMax: null, gender: "", country: "", ethnicity: "", nationality: "", language: "", religion: "", intent: "", onlineOnly: false, hasPhoto: false };
  render();
});

// ---- saved filter presets (per-device, via localStorage) ----
function presetsKey() { return `lw-presets-${me.uid}`; }
function loadPresets() { try { return JSON.parse(localStorage.getItem(presetsKey())) || []; } catch { return []; } }
function savePresets(list) { localStorage.setItem(presetsKey(), JSON.stringify(list)); }
function renderPresets() {
  const presets = loadPresets();
  presetList.innerHTML = presets.map((p, i) => `
    <span class="chip preset-chip" data-apply="${i}">${escapeHtml(p.name)} <button type="button" data-remove="${i}" title="Delete">&times;</button></span>
  `).join("");
  presetList.querySelectorAll("[data-apply]").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-remove]")) return;
      const p = presets[Number(el.dataset.apply)];
      if (!p) return;
      writeFiltersToForm(p.filters);
      searchInput.value = p.term || "";
      filters = p.filters;
      filtersPanel.style.display = "block";
      render();
      showToast(`Applied "${p.name}".`, { type: "info" });
    });
  });
  presetList.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const list = loadPresets();
      list.splice(Number(btn.dataset.remove), 1);
      savePresets(list);
      renderPresets();
    });
  });
}
savePresetBtn.addEventListener("click", () => {
  const name = prompt("Name this filter preset (e.g. \"Nearby & serious\"):");
  if (!name) return;
  const list = loadPresets();
  list.push({ name: name.trim().slice(0, 30), filters: readFiltersFromForm(), term: searchInput.value.trim() });
  savePresets(list);
  renderPresets();
  showToast("Preset saved.", { type: "success" });
});

function openDetail(uid, p) {
  detail.style.display = "flex";
  const meta = [p.age ? `${p.age}` : "", [p.city, p.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const activity = activityLabel(p.lastActive);
  const factRows = [
    p.relationshipIntent ? ["Looking for", intentLabel(p.relationshipIntent)] : null,
    p.religion ? ["Religion", religionLabel(p.religion)] : null,
    p.education ? ["Education", p.education] : null,
    p.occupation ? ["Occupation", p.occupation] : null
  ].filter(Boolean);
  const mutualLike = (myData.likes || []).includes(uid) && (p.likes || []).includes(me.uid);

  detailBody.innerHTML = `
    <div class="detail-wrap">
      <div>
        <img class="person-photo" style="border-radius:var(--radius-lg);" src="${p.photoURL || placeholderPhoto()}" alt="">
        <h2 style="margin-top:14px;">${escapeHtml(p.name || "Member")}</h2>
        ${meta ? `<p class="muted" style="font-size:13px;">${escapeHtml(meta)}</p>` : ""}
        ${activity && p.showOnlineStatus !== false ? `<p class="muted" style="font-size:12px;">${escapeHtml(activity)}</p>` : ""}
        ${p.memberNo ? `<p class="muted" style="font-size:12px;">Member No. ${escapeHtml(p.memberNo)}</p>` : ""}
        <div style="display:flex; gap:10px; align-items:center; margin-top:10px;">
          <button type="button" class="like-btn ${mutualLike || isLiked(uid) ? "liked" : ""}" id="detail-like-btn" data-like-uid="${uid}" title="${isLiked(uid) ? "Unlike" : "Like"}">${isLiked(uid) ? "&#10084;" : "&#9825;"}</button>
          ${mutualLike ? `<span class="mutual-like-note">&#10084; It's a mutual like!</span>` : ""}
        </div>
      </div>
      <div>
        <p>${escapeHtml(p.bio || "No bio yet.")}</p>
        ${factRows.length ? `<div class="filters-card" style="margin-top:4px;">${factRows.map(([k, v]) => `<div><label class="mt-0" style="margin:0 0 2px;">${escapeHtml(k)}</label><div style="font-size:14px;">${escapeHtml(v)}</div></div>`).join("")}</div>` : ""}
        ${(p.languages && p.languages.length) ? `<div style="margin-top:10px;"><label class="mt-0" style="margin:0 0 4px;">Languages</label>${tagsHtml(p.languages)}</div>` : ""}
        ${(p.interests && p.interests.length) ? `<div style="margin-top:10px;"><label class="mt-0" style="margin:0 0 4px;">Interests</label>${tagsHtml(p.interests)}</div>` : ""}

        <div id="lock-panel" class="lock-panel">
          <p><span class="lock-icon">&#9679;</span> <strong>Locked.</strong> Enter their code to see social links and more photos.</p>
          <div style="display:flex; gap:10px; margin-top:10px;">
            <input id="code-input" type="text" placeholder="9-character code" maxlength="9" style="flex:1;">
            <button id="unlock-btn" class="btn subtle">Unlock</button>
          </div>
          <p id="unlock-error" style="color:#d98a71; font-size:12px; min-height:16px; margin-top:6px;"></p>
        </div>

        <div id="unlocked-content"></div>

        <div class="gilt-rule"></div>
        <h3>Message</h3>
        <div id="chat-mount"></div>

        <div class="gilt-rule"></div>
        <div style="display:flex; gap:10px;">
          <button id="block-btn" class="btn ghost small" type="button">Block</button>
          <button id="report-btn" class="btn ghost small" type="button">Report</button>
        </div>
        <p id="safety-note" class="muted" style="font-size:12px; margin-top:6px;"></p>
      </div>
    </div>`;

  document.querySelector("#detail-like-btn").addEventListener("click", async () => {
    await toggleLike(uid);
    openDetail(uid, everyone.find(x => x.uid === uid) || p);
  });

  document.querySelector("#unlock-btn").addEventListener("click", async () => {
    const code = document.querySelector("#code-input").value.trim();
    const err = document.querySelector("#unlock-error");
    err.textContent = "";
    if (!code) { err.textContent = "Enter a code first."; return; }

    const fresh = await getDoc(doc(db, "users", uid));
    const data = fresh.data();
    if (!data.privatePayload) { err.textContent = "This member hasn't added private info yet."; return; }

    const decrypted = await decryptWithCode(code, data.privatePayload);
    if (!decrypted) { err.textContent = "That code didn't work."; return; }

    document.querySelector("#lock-panel").classList.add("unlocked");
    document.querySelector("#lock-panel").innerHTML = `<p><span class="lock-icon">&#9679;</span> <strong>Unlocked.</strong></p>`;
    renderUnlocked(decrypted);
    showToast("Unlocked.", { type: "success" });
  });

  document.querySelector("#block-btn").addEventListener("click", async () => {
    if (!confirm(`Block ${p.name || "this member"}? You won't see each other in Discover anymore.`)) return;
    await updateDoc(doc(db, "users", me.uid), { blockedUsers: arrayUnion(uid) });
    everyone = everyone.filter(x => x.uid !== uid);
    detail.style.display = "none";
    closeChat();
    render();
    showToast("Blocked.", { type: "success" });
  });

  document.querySelector("#report-btn").addEventListener("click", async () => {
    const reason = prompt("What's the issue? (a short reason helps us review it)");
    if (reason === null) return;
    await addDoc(collection(db, "reports"), {
      reportedUid: uid, reporterUid: me.uid, reason: reason.trim() || "No reason given", createdAt: serverTimestamp()
    });
    document.querySelector("#safety-note").textContent = "Thanks — this has been reported for review. You can also reach us directly at artyourtaste@gmail.com.";
    showToast("Report submitted.", { type: "success" });
  });

  openChat(document.querySelector("#chat-mount"), me.uid, uid, { name: p.name, photoURL: p.photoURL });
}

function intentLabel(v) {
  return { dating: "Dating", serious: "Serious relationship", marriage: "Marriage", friendship: "Friendship" }[v] || v;
}
function religionLabel(v) {
  return { christian: "Christian", muslim: "Muslim", traditional: "Traditional / spiritual", other: "Other", none: "None" }[v] || v;
}

function renderUnlocked(data) {
  const mount = document.querySelector("#unlocked-content");
  const links = ["instagram", "tiktok", "snapchat", "whatsapp"]
    .filter(k => data[k])
    .map(k => `<a href="#" onclick="return false;">${k}: ${escapeHtml(data[k])}</a>`)
    .join("");
  const photos = (data.extraPhotos || []).map(url => `<img src="${url}" alt="">`).join("");
  mount.innerHTML = `
    ${links ? `<div class="social-row">${links}</div>` : `<p class="muted" style="font-size:13px;">No social links added.</p>`}
    ${photos ? `<div class="photo-strip">${photos}</div>` : ""}`;
}

closeDetailBtn.addEventListener("click", () => {
  detail.style.display = "none";
  closeChat();
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

load().catch(err => {
  console.error("Discover load failed:", err);
  document.querySelector(".loader-page")?.remove();
  grid.innerHTML = `<p class="muted">Couldn't load Discover — check your connection and refresh.</p>`;
});
