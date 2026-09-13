import {
  auth, db, googleProvider, onAuthStateChanged, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
  doc, setDoc, getDoc, serverTimestamp
} from "./firebase-init.js";
import { generateIdCode } from "./crypto-utils.js";
import { generateMemberNo, loaderBlobHtml, addPasswordToggle } from "./common.js";
import { showToast } from "./notifications.js";

const form = document.querySelector("#auth-form");
const tabLogin = document.querySelector("#tab-login");
const tabSignup = document.querySelector("#tab-signup");
const nameField = document.querySelector("#name-field");
const ageField = document.querySelector("#age-consent-field");
const ageCheckbox = document.querySelector("#age-consent");
const submitBtn = document.querySelector("#auth-submit");
const errorBox = document.querySelector("#auth-error");
const forgotLink = document.querySelector("#forgot-link");
addPasswordToggle(document.querySelector("#password"));
let mode = "login";

function setMode(next) {
  mode = next;
  tabLogin.classList.toggle("active", mode === "login");
  tabSignup.classList.toggle("active", mode === "signup");
  nameField.style.display = mode === "signup" ? "block" : "none";
  ageField.style.display = mode === "signup" ? "block" : "none";
  submitBtn.textContent = mode === "signup" ? "Create account" : "Log in";
  errorBox.textContent = "";
}
tabLogin.addEventListener("click", () => setMode("login"));
tabSignup.addEventListener("click", () => setMode("signup"));

/** Signing up requires confirming you're 18+. Returns true if it's OK to proceed. */
function checkAgeConsent() {
  if (mode !== "signup") return true;
  if (!ageCheckbox.checked) {
    errorBox.textContent = "Please confirm you're 18 or older to create an account.";
    return false;
  }
  return true;
}

/** Creates the Firestore profile doc for a brand-new user, with a fresh ID code. */
async function ensureProfileDoc(user, displayName) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      name: displayName || user.displayName || "New member",
      bio: "",
      photoURL: user.photoURL || "",
      age: null, gender: "", country: "", city: "", ethnicity: "", nationality: "",
      memberNo: generateMemberNo(),
      languages: [], relationshipIntent: "", religion: "", education: "", occupation: "", interests: [],
      showOnlineStatus: true,
      lastActive: serverTimestamp(),
      likes: [],
      preferences: { ageMin: null, ageMax: null, country: "", ethnicity: "", nationality: "" },
      idCode: generateIdCode(),
      idCodeUpdatedAt: Date.now(),
      privatePayload: null, // encrypted blob: social links + extra photos, set once the user fills those in
      ageConfirmed18: true,
      savedUsers: [],
      blockedUsers: [],
      likedBy: [],
      viewCount: 0,
      viewHistory: [],
      createdAt: Date.now()
    });
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.textContent = "";
  if (!checkAgeConsent()) return;
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const name = document.querySelector("#name").value.trim();
  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.innerHTML = loaderBlobHtml();
  try {
    if (mode === "signup") {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await ensureProfileDoc(cred.user, name);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    window.location.href = "discover.html";
  } catch (err) {
    errorBox.textContent = friendlyError(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
});

document.querySelector("#google-btn").addEventListener("click", async (e) => {
  errorBox.textContent = "";
  if (!checkAgeConsent()) return;
  const googleBtn = e.currentTarget;
  const originalLabel = googleBtn.textContent;
  googleBtn.disabled = true;
  googleBtn.innerHTML = loaderBlobHtml();
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureProfileDoc(cred.user);
    window.location.href = "discover.html";
  } catch (err) {
    errorBox.textContent = friendlyError(err);
  } finally {
    googleBtn.disabled = false;
    googleBtn.textContent = originalLabel;
  }
});

forgotLink.addEventListener("click", async (e) => {
  e.preventDefault();
  errorBox.textContent = "";
  const email = document.querySelector("#email").value.trim();
  if (!email) { errorBox.textContent = "Enter your email above first, then tap \"Forgot password?\"."; return; }
  try {
    await sendPasswordResetEmail(auth, email);
    showToast("Password reset email sent — check your inbox.", { type: "success" });
  } catch (err) {
    errorBox.textContent = friendlyError(err);
  }
});

function friendlyError(err) {
  const code = err.code || "";
  if (code.includes("wrong-password") || code.includes("user-not-found") || code.includes("invalid-credential")) return "Email or password is incorrect.";
  if (code.includes("email-already-in-use")) return "That email already has an account — try logging in instead.";
  if (code.includes("weak-password")) return "Password should be at least 6 characters.";
  if (code.includes("invalid-email")) return "That doesn't look like a valid email address.";
  return "Something went wrong. Please try again.";
}

// If already signed in, skip straight past the auth screen.
onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = "discover.html";
});
