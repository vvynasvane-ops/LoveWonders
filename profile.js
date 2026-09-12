import { requireAuth, db, doc, getDoc, setDoc, updateDoc, signOut, auth, collection, getDocs, query, where } from "./firebase-init.js";
import { encryptWithCode, decryptWithCode, generateIdCode } from "./crypto-utils.js";
import { fileToCompressedDataURL } from "./img-utils.js";
import { initTheme } from "./theme.js";
import { renderNav } from "./nav.js";
import { generateMemberNo, parseTags, loaderTrackHtml, loaderPhotoHtml, escapeHtml } from "./common.js";
import { startPresence } from "./presence.js";
import { showToast, savedToast, initNotifications } from "./notifications.js";

initTheme();
renderNav("profile");
document.body.insertAdjacentHTML("beforeend", loaderTrackHtml("Loading your profile"));

const bioEl = document.querySelector("#bio");
const nameEl = document.querySelector("#name");
const photoPreview = document.querySelector("#photo-preview");
const photoFileInput = document.querySelector("#photoFile");
const socialInputs = document.querySelectorAll("[data-social]");
const extraPhotosFile = document.querySelector("#extraPhotosFile");
const extraPhotosPreview = document.querySelector("#extra-photos-preview");
const uploadHint = document.querySelector(".upload-hint");
const codeValueEl = document.querySelector("#idcode-value");
const copyBtn = document.querySelector("#copy-code");
const renewBtn = document.querySelector("#renew-code");
const saveBtn = document.querySelector("#save-profile");
const saveAboutBtn = document.querySelector("#save-about");
const savePrivateBtn = document.querySelector("#save-private");
const saveTasteBtn = document.querySelector("#save-taste");
const logoutBtn = document.querySelector("#logout-btn");
const appreciationCard = document.querySelector("#appreciation-card");
const appreciationSummary = document.querySelector("#appreciation-summary");
const appreciationList = document.querySelector("#appreciation-list");
const clearAppreciationsBtn = document.querySelector("#clear-appreciations");

const ageEl = document.querySelector("#age");
const genderEl = document.querySelector("#gender");
const countryEl = document.querySelector("#country");
const cityEl = document.querySelector("#city");
const ethnicityEl = document.querySelector("#ethnicity");
const nationalityEl = document.querySelector("#nationality");
const relationshipIntentEl = document.querySelector("#relationship-intent");
const religionEl = document.querySelector("#religion");
const educationEl = document.querySelector("#education");
const occupationEl = document.querySelector("#occupation");
const languagesEl = document.querySelector("#languages");
const interestsEl = document.querySelector("#interests");
const showOnlineStatusEl = document.querySelector("#show-online-status");
const memberNoEl = document.querySelector("#memberno-value");
const copyMemberNoBtn = document.querySelector("#copy-memberno");
const prefAgeMin = document.querySelector("#pref-age-min");
const prefAgeMax = document.querySelector("#pref-age-max");
const prefCountry = document.querySelector("#pref-country");
const prefEthnicity = document.querySelector("#pref-ethnicity");
const prefNationality = document.querySelector("#pref-nationality");

let user, userRef, currentCode, currentPrivate = {}, pendingPhotoURL = null, currentPrefs = {};

function renderExtraPhotos() {
  const photos = currentPrivate.extraPhotos || [];
  extraPhotosPreview.innerHTML = photos.map((src, i) => `
    <div class="extra-photo-thumb">
      <img src="${src}" alt="">
      <button type="button" data-remove="${i}" title="Remove">×</button>
    </div>`).join("");
  extraPhotosPreview.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentPrivate.extraPhotos.splice(Number(btn.dataset.remove), 1);
      renderExtraPhotos();
    });
  });
}

async function load() {
  user = await requireAuth();
  startPresence(user.uid);
  userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  let data = snap.data();

  // The auth-time doc creation didn't happen (deleted doc, manual Firebase
  // Auth account, or an interrupted signup). Rebuild it here instead of
  // crashing, so this page — and the Save buttons below, which use
  // updateDoc() and require the doc to already exist — work again.
  if (!data) {
    data = {
      name: user.displayName || "New member",
      bio: "", photoURL: user.photoURL || "",
      age: null, gender: "", country: "", city: "", ethnicity: "", nationality: "",
      memberNo: generateMemberNo(),
      languages: [], relationshipIntent: "", religion: "", education: "", occupation: "", interests: [],
      showOnlineStatus: true,
      likes: [],
      preferences: { ageMin: null, ageMax: null, country: "", ethnicity: "", nationality: "" },
      idCode: generateIdCode(),
      idCodeUpdatedAt: Date.now(),
      privatePayload: null,
      ageConfirmed18: true,
      savedUsers: [], blockedUsers: [], likedBy: [],
      viewCount: 0, viewHistory: [],
      createdAt: Date.now()
    };
    await setDoc(userRef, data);
    showToast("We had to rebuild your profile record — please double-check your details below.", { type: "info" });
  }

  document.querySelector(".loader-page")?.remove();
  nameEl.value = data.name || "";
  bioEl.value = data.bio || "";
  pendingPhotoURL = data.photoURL || "";
  photoPreview.src = data.photoURL || placeholder();
  currentCode = data.idCode;
  codeValueEl.textContent = currentCode;

  ageEl.value = data.age || "";
  genderEl.value = data.gender || "";
  countryEl.value = data.country || "";
  cityEl.value = data.city || "";
  ethnicityEl.value = data.ethnicity || "";
  nationalityEl.value = data.nationality || "";
  relationshipIntentEl.value = data.relationshipIntent || "";
  religionEl.value = data.religion || "";
  educationEl.value = data.education || "";
  occupationEl.value = data.occupation || "";
  languagesEl.value = (data.languages || []).join(", ");
  interestsEl.value = (data.interests || []).join(", ");
  showOnlineStatusEl.checked = data.showOnlineStatus !== false;

  // Accounts created before member numbers existed won't have one yet — mint one now.
  let memberNo = data.memberNo;
  if (!memberNo) {
    memberNo = generateMemberNo();
    updateDoc(userRef, { memberNo }).catch(() => {});
  }
  memberNoEl.textContent = memberNo;

  const prefs = data.preferences || {};
  currentPrefs = prefs;
  prefAgeMin.value = prefs.ageMin || "";
  prefAgeMax.value = prefs.ageMax || "";
  prefCountry.value = prefs.country || "";
  prefEthnicity.value = prefs.ethnicity || "";
  prefNationality.value = prefs.nationality || "";

  initNotifications(user.uid, currentPrefs);
  loadAppreciations(user.uid, data.appreciationsClearedAt || 0);

  // We can decrypt our own private payload because we, the owner, always know our own code.
  if (data.privatePayload) {
    currentPrivate = (await decryptWithCode(currentCode, data.privatePayload)) || {};
  }
  socialInputs.forEach(inp => (inp.value = currentPrivate[inp.dataset.social] || ""));
  currentPrivate.extraPhotos = currentPrivate.extraPhotos || [];
  renderExtraPhotos();
}

/** Fetches this member's received appreciations (see discover.js's Appreciate
 * button) from the separate `appreciations` collection — not a field on this
 * user's own doc, since Firestore rules correctly don't let another member
 * write onto it directly. */
/** Fetches this member's received appreciations (see discover.js's Appreciate
 * button) from the separate `appreciations` collection — not a field on this
 * user's own doc, since Firestore rules correctly don't let another member
 * write onto it directly. `clearedAt` (my own doc's own field, so I can write
 * it myself) hides anything sent before the last time I hit "Clear all" —
 * the underlying docs stay put, only my own view of them changes. */
async function loadAppreciations(uid, clearedAt) {
  try {
    const snap = await getDocs(query(collection(db, "appreciations"), where("toUid", "==", uid)));
    let list = snap.docs.map(d => d.data());
    if (clearedAt) list = list.filter(a => (a.createdAt?.toMillis?.() || 0) > clearedAt);
    list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    renderAppreciations(list);
  } catch (err) {
    console.error("Couldn't load appreciations:", err);
  }
}

/** Shows the compliments other members have sent from Discover's Appreciate button, most recent first. */
function renderAppreciations(list) {
  if (!list.length) { appreciationCard.style.display = "none"; return; }
  appreciationCard.style.display = "block";
  appreciationSummary.textContent = `${list.length} member${list.length === 1 ? "" : "s"} ${list.length === 1 ? "has" : "have"} appreciated you.`;
  appreciationList.innerHTML = list.slice(0, 10).map(a => `
    <div class="appreciation-item">
      <div class="appreciation-from">${escapeHtml(a.fromName || "Someone")}</div>
      <div>${escapeHtml(a.text || "")}</div>
    </div>`).join("");
}

clearAppreciationsBtn.addEventListener("click", async () => {
  if (!confirm("Clear all appreciations from your profile? This only clears your view — it can't be undone.")) return;
  clearAppreciationsBtn.disabled = true;
  try {
    const clearedAt = Date.now();
    await updateDoc(userRef, { appreciationsClearedAt: clearedAt });
    renderAppreciations([]);
    showToast("Cleared.", { type: "success" });
  } catch (err) {
    console.error("Clear appreciations failed:", err);
    showToast("Couldn't clear those — try again.", { type: "error" });
  } finally {
    clearAppreciationsBtn.disabled = false;
  }
});

function placeholder() {
  return "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='100%' height='100%' fill='#161232'/></svg>`
  );
}

photoFileInput.addEventListener("change", async () => {
  const file = photoFileInput.files[0];
  if (!file) return;
  const hintText = uploadHint.textContent;
  uploadHint.innerHTML = loaderPhotoHtml() + ` <span style="vertical-align:middle;">Processing photo…</span>`;
  try {
    const dataUrl = await fileToCompressedDataURL(file, 480, 0.65);
    pendingPhotoURL = dataUrl;
    photoPreview.src = dataUrl;
    showToast("Photo ready — hit Save profile to keep it.", { type: "info" });
  } catch (err) {
    showToast(err.message || "Couldn't process that image.", { type: "error" });
  } finally {
    uploadHint.textContent = hintText;
  }
});

extraPhotosFile.addEventListener("change", async () => {
  const files = Array.from(extraPhotosFile.files || []);
  extraPhotosFile.value = "";
  if (!files.length) return;
  currentPrivate.extraPhotos = currentPrivate.extraPhotos || [];
  extraPhotosPreview.innerHTML = `<div class="loader-wrap" style="padding:12px;">${loaderPhotoHtml()}<div class="loader-label">Processing photos</div></div>`;
  for (const file of files.slice(0, 6 - currentPrivate.extraPhotos.length)) {
    try {
      const dataUrl = await fileToCompressedDataURL(file, 420, 0.55);
      currentPrivate.extraPhotos.push(dataUrl);
    } catch (err) {
      showToast(err.message || "Couldn't process one of those images.", { type: "error" });
    }
  }
  renderExtraPhotos();
  showToast("Photos ready — hit Save profile to keep them.", { type: "info" });
});

// All three "Save" buttons on this page (top-of-page profile, About you, and
// Private info) write the same full set of fields in one updateDoc — the
// fields are split across cards visually, but they all live on the same user
// doc, so there's no safe way to save just one card's slice without risking
// clobbering unsaved edits in another. Previously only the top button existed,
// so editing "About you" or the private/social fields gave no visible way to
// save from where you were actually editing — you had to know to scroll back
// up. Each card now has its own button wired to the same save, so whichever
// section someone is in, they can save from there; the button clicked is the
// one that shows the disabled/saved state.
async function saveProfile(label) {
  const buttons = [saveBtn, saveAboutBtn, savePrivateBtn];
  buttons.forEach(b => (b.disabled = true));
  try {
    const privateData = {
      instagram: qv("instagram"), tiktok: qv("tiktok"), snapchat: qv("snapchat"), whatsapp: qv("whatsapp"),
      extraPhotos: currentPrivate.extraPhotos || []
    };
    const encrypted = await encryptWithCode(currentCode, privateData);
    await updateDoc(userRef, {
      name: nameEl.value.trim(),
      bio: bioEl.value.trim(),
      photoURL: pendingPhotoURL || "",
      age: ageEl.value ? Number(ageEl.value) : null,
      gender: genderEl.value,
      country: countryEl.value.trim(),
      city: cityEl.value.trim(),
      ethnicity: ethnicityEl.value.trim(),
      nationality: nationalityEl.value.trim(),
      relationshipIntent: relationshipIntentEl.value,
      religion: religionEl.value,
      education: educationEl.value.trim(),
      occupation: occupationEl.value.trim(),
      languages: parseTags(languagesEl.value),
      interests: parseTags(interestsEl.value),
      showOnlineStatus: showOnlineStatusEl.checked,
      privatePayload: encrypted
    });
    savedToast(label);
  } finally {
    buttons.forEach(b => (b.disabled = false));
  }
}

saveBtn.addEventListener("click", () => saveProfile("Profile"));
saveAboutBtn.addEventListener("click", () => saveProfile("Details"));
savePrivateBtn.addEventListener("click", () => saveProfile("Private info"));

copyMemberNoBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(memberNoEl.textContent);
    showToast("Member number copied.", { type: "success" });
  } catch {
    showToast(memberNoEl.textContent, { type: "info" });
  }
});

saveTasteBtn.addEventListener("click", async () => {
  saveTasteBtn.disabled = true;
  try {
    currentPrefs = {
      ageMin: prefAgeMin.value ? Number(prefAgeMin.value) : null,
      ageMax: prefAgeMax.value ? Number(prefAgeMax.value) : null,
      country: prefCountry.value.trim(),
      ethnicity: prefEthnicity.value.trim(),
      nationality: prefNationality.value.trim()
    };
    await updateDoc(userRef, { preferences: currentPrefs });
    showToast("Taste saved — Discover will use it for your recommendations.", { type: "success" });
    // Re-arms the live match watcher with the freshly saved taste, so new-member
    // notifications on this page reflect it immediately, without a reload.
    initNotifications(user.uid, currentPrefs);
  } finally {
    saveTasteBtn.disabled = false;
  }
});

function qv(name) {
  return document.querySelector(`[data-social="${name}"]`).value.trim();
}

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentCode);
    showToast("Code copied.");
  } catch {
    showToast(currentCode); // clipboard blocked — at least show it clearly
  }
});

renewBtn.addEventListener("click", async () => {
  if (!confirm("Renewing your code will lock out everyone who only had the old one. Continue?")) return;
  const newCode = generateIdCode();
  const privateData = {
    instagram: qv("instagram"), tiktok: qv("tiktok"), snapchat: qv("snapchat"), whatsapp: qv("whatsapp"),
    extraPhotos: currentPrivate.extraPhotos || []
  };
  const encrypted = await encryptWithCode(newCode, privateData);
  await updateDoc(userRef, { idCode: newCode, idCodeUpdatedAt: Date.now(), privatePayload: encrypted });
  currentCode = newCode;
  codeValueEl.textContent = newCode;
  showToast("New code generated — share it fresh with whoever you trust.");
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

load().catch(err => {
  console.error("Profile load failed:", err);
  document.querySelector(".loader-page")?.remove();
  showToast("Couldn't load your profile — check your connection and refresh.", { type: "error" });
});
