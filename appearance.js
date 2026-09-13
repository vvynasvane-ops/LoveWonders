// ------------------------------------------------------------------
// Appearance settings — font, whole-page background blur, and
// background image (curated presets or a photo from the user's own
// device). Saved to localStorage (per device) and applied via CSS
// variables (see :root in styles.css), same pattern as theme.js's
// accent/mode, so every page picks them up the moment
// initAppearance() runs.
// ------------------------------------------------------------------
import { showToast } from "./notifications.js";

const root = document.documentElement;
const STORE_KEY = "lw-appearance";
const CUSTOM_BG_KEY = "lw-appearance-bg-custom"; // kept separate from the settings blob — it's much bigger

const FONT_STACKS = {
  rajdhani: "'Rajdhani', -apple-system, sans-serif",
  poppins: "'Poppins', -apple-system, sans-serif",
  playfair: "'Playfair Display', Georgia, serif",
  quicksand: "'Quicksand', -apple-system, sans-serif",
  nunito: "'Nunito', -apple-system, sans-serif",
  dancing: "'Dancing Script', cursive",
  merriweather: "'Merriweather', Georgia, serif",
  spacegrotesk: "'Space Grotesk', -apple-system, sans-serif"
};
export const FONT_LABELS = {
  rajdhani: "Rajdhani (default)",
  poppins: "Poppins — clean & modern",
  playfair: "Playfair Display — elegant serif",
  quicksand: "Quicksand — soft & friendly",
  nunito: "Nunito — warm & rounded",
  dancing: "Dancing Script — romantic script",
  merriweather: "Merriweather — classic reading serif",
  spacegrotesk: "Space Grotesk — sleek & techy"
};

// Gradient-only "photos" tuned to the app's own palette — no external
// images to fetch, license, or have fail to load. Each is picked to fit
// a romance app rather than being generically decorative.
const BG_PRESETS = {
  none: "none",
  aurora: `radial-gradient(ellipse 60% 50% at 18% 15%, hsl(265 85% 42% / .38), transparent 60%),
           radial-gradient(ellipse 55% 45% at 82% 25%, hsl(189 85% 45% / .3), transparent 60%),
           radial-gradient(ellipse 70% 55% at 50% 95%, hsl(265 80% 22% / .45), transparent 65%)`,
  rose: `radial-gradient(ellipse 60% 50% at 20% 12%, hsl(332 78% 46% / .35), transparent 60%),
         radial-gradient(ellipse 55% 50% at 85% 78%, hsl(18 82% 50% / .28), transparent 60%),
         radial-gradient(ellipse 70% 55% at 50% 100%, hsl(285 55% 28% / .4), transparent 65%)`,
  bloom: `radial-gradient(circle at 14% 82%, hsl(302 82% 46% / .32), transparent 45%),
          radial-gradient(circle at 86% 14%, hsl(255 78% 46% / .32), transparent 45%),
          radial-gradient(circle at 50% 50%, hsl(200 75% 40% / .16), transparent 62%)`
};
export const BG_PRESET_LABELS = { none: "None (default)", aurora: "Aurora Deep", rose: "Rosé Dusk", bloom: "Midnight Bloom", custom: "Your photo" };

// Quick font-color swatches tuned to read well on the app's dark AND light
// modes. "" means "no override" — follow the theme's own text color (which
// still changes with dark/light mode and stays in sync with the accent).
const FONT_COLOR_PRESETS = {
  "": "Theme default",
  "#eef0ff": "Starlight white",
  "#c9c2ff": "Soft lavender",
  "#8fe9ff": "Cyan glow",
  "#ffc2e0": "Rosé pink",
  "#ffe3a1": "Nebula gold"
};
export { FONT_COLOR_PRESETS };

const DEFAULTS = {
  family: "rajdhani", size: 16, weight: 400, spacing: 0, lineHeight: 1.5,
  blur: 10, bg: "none", color: ""
};

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; }
  catch { return { ...DEFAULTS }; }
}
function save(state) { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

function apply(state, customDataUrl) {
  root.style.setProperty("--user-font-family", FONT_STACKS[state.family] || FONT_STACKS.rajdhani);
  root.style.setProperty("--user-font-size", state.size + "px");
  root.style.setProperty("--user-font-weight", state.weight);
  root.style.setProperty("--user-letter-spacing", state.spacing + "px");
  root.style.setProperty("--user-line-height", state.lineHeight);
  root.style.setProperty("--user-font-color", state.color || "var(--text)");
  // This blurs the whole fixed background layer (body::before in
  // styles.css), not just the strip of it that happens to sit behind a
  // card — a slider that only softened whatever was directly under a
  // panel looked like it wasn't doing anything most of the time.
  root.style.setProperty("--glass-blur", state.blur + "px");

  // Background: a photo from the user's own device gets two layers (see
  // body::before/::after in styles.css) — a blurred, full-bleed "ambient"
  // copy behind, and a sharp, uncropped, `contain`-sized copy in front so
  // the photo itself is never zoomed, cropped, or stretched, just centered
  // and scaled to fit the screen. The 3 built-in presets are gradients, so
  // they only ever use the single ambient layer, same as before.
  const isCustomPhoto = state.bg === "custom" && !!customDataUrl;
  const ambientImage = isCustomPhoto ? `url("${customDataUrl}")` : (BG_PRESETS[state.bg] || BG_PRESETS.none);
  root.style.setProperty("--bg-preset-image", ambientImage);
  root.style.setProperty("--bg-photo-image", isCustomPhoto ? `url("${customDataUrl}")` : "none");
  root.style.setProperty("--bg-ambient-blur", isCustomPhoto ? "46px" : "0px");
}

/** Downscales an uploaded photo before it goes anywhere near localStorage
 *  (device storage quotas are typically 5–10MB total, shared with
 *  everything else the app stores) — long edge capped at 1600px, saved
 *  as a compressed JPEG data URL. */
function downscaleImage(file, maxEdge = 1600, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => { img.src = reader.result; };
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    reader.readAsDataURL(file);
  });
}

/** Call once per page (alongside initTheme()) to apply saved appearance
 *  everywhere, and — on pages that have the controls in the DOM — wire
 *  them up live. Safe to call on pages without any of these elements. */
export function initAppearance() {
  const state = load();
  let customDataUrl = null;
  try { customDataUrl = localStorage.getItem(CUSTOM_BG_KEY); } catch {}
  apply(state, customDataUrl);

  const persistAndToast = (label) => {
    save(state);
    showToast(`${label} saved`, { type: "success", duration: 1800 });
  };

  // Font family
  const familySel = document.querySelector("#appearance-font-family");
  if (familySel) {
    familySel.value = state.family;
    familySel.addEventListener("change", () => {
      state.family = familySel.value;
      apply(state, customDataUrl);
      persistAndToast("Font");
    });
  }

  // Range-style controls: id -> [stateKey, unitSuffix for the live readout]
  const ranges = [
    ["appearance-font-size", "size", "px"],
    ["appearance-font-weight", "weight", ""],
    ["appearance-letter-spacing", "spacing", "px"],
    ["appearance-line-height", "lineHeight", ""],
    ["appearance-blur", "blur", "px"]
  ];
  ranges.forEach(([id, key, unit]) => {
    const input = document.querySelector(`#${id}`);
    const label = document.querySelector(`#${id}-val`);
    if (!input) return;
    input.value = state[key];
    if (label) label.textContent = state[key] + unit;
    input.addEventListener("input", () => {
      state[key] = key === "lineHeight" ? parseFloat(input.value) : Number(input.value);
      apply(state, customDataUrl);
      if (label) label.textContent = state[key] + unit;
    });
    input.addEventListener("change", () => persistAndToast("Appearance"));
  });

  // Font color — a native color picker plus a row of quick preset swatches
  const colorInput = document.querySelector("#appearance-font-color");
  const colorPresetBtns = document.querySelectorAll("[data-font-color]");
  function markActiveColorPreset() {
    colorPresetBtns.forEach(b => b.classList.toggle("active", (b.dataset.fontColor || "") === (state.color || "")));
  }
  if (colorInput) {
    colorInput.value = state.color || "#eef0ff";
    colorInput.addEventListener("input", () => {
      state.color = colorInput.value;
      apply(state, customDataUrl);
      markActiveColorPreset();
    });
    colorInput.addEventListener("change", () => persistAndToast("Font color"));
  }
  if (colorPresetBtns.length) {
    colorPresetBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        state.color = btn.dataset.fontColor || "";
        if (colorInput && state.color) colorInput.value = state.color;
        apply(state, customDataUrl);
        markActiveColorPreset();
        persistAndToast("Font color");
      });
    });
    markActiveColorPreset();
  }

  // Background image presets — a row of swatch buttons
  const bgButtons = document.querySelectorAll("[data-bg-preset]");
  const customSwatch = document.querySelector("#bg-custom-swatch");
  const customThumbIcon = document.querySelector("#bg-custom-thumb-icon");
  function markActiveSwatch() {
    bgButtons.forEach(b => b.classList.toggle("active", b.dataset.bgPreset === state.bg));
    if (customSwatch) customSwatch.classList.toggle("active", state.bg === "custom");
  }
  function paintCustomThumb() {
    if (!customSwatch) return;
    if (customDataUrl) {
      customSwatch.style.backgroundImage = `url("${customDataUrl}")`;
      customSwatch.style.backgroundSize = "cover";
      customSwatch.style.backgroundPosition = "center";
      if (customThumbIcon) customThumbIcon.style.display = "none";
    } else {
      customSwatch.style.backgroundImage = "none";
      if (customThumbIcon) customThumbIcon.style.display = "block";
    }
  }
  if (bgButtons.length) {
    bgButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        state.bg = btn.dataset.bgPreset;
        apply(state, customDataUrl);
        markActiveSwatch();
        persistAndToast("Background");
      });
    });
    markActiveSwatch();
  }

  // Background image from the user's own device
  const bgUpload = document.querySelector("#appearance-bg-upload");
  if (bgUpload) {
    paintCustomThumb();
    bgUpload.addEventListener("change", async () => {
      const file = bgUpload.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) { showToast("Pick an image file.", { type: "error" }); return; }
      try {
        const dataUrl = await downscaleImage(file);
        localStorage.setItem(CUSTOM_BG_KEY, dataUrl);
        customDataUrl = dataUrl;
        state.bg = "custom";
        apply(state, customDataUrl);
        markActiveSwatch();
        paintCustomThumb();
        save(state);
        showToast("Background photo saved to this device.", { type: "success" });
      } catch (err) {
        console.error("Background upload failed:", err);
        // Most likely cause: localStorage quota exceeded even after
        // downscaling (an old custom photo plus a new one, on a device
        // already near its storage limit).
        showToast("Couldn't save that photo — try a smaller image.", { type: "error" });
      } finally {
        bgUpload.value = "";
      }
    });
  }

  // Reset to defaults
  const resetBtn = document.querySelector("#appearance-reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      Object.assign(state, DEFAULTS);
      customDataUrl = null;
      try { localStorage.removeItem(CUSTOM_BG_KEY); } catch {}
      apply(state, customDataUrl);
      save(state);
      if (familySel) familySel.value = state.family;
      ranges.forEach(([id, key, unit]) => {
        const input = document.querySelector(`#${id}`);
        const label = document.querySelector(`#${id}-val`);
        if (input) input.value = state[key];
        if (label) label.textContent = state[key] + unit;
      });
      if (colorInput) colorInput.value = "#eef0ff";
      markActiveColorPreset();
      markActiveSwatch();
      paintCustomThumb();
      showToast("Appearance reset to defaults", { type: "success", duration: 2000 });
    });
  }
}
