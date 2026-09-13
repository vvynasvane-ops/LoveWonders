// ------------------------------------------------------------------
// Appearance settings — font, blur, and background image.
// Saved to localStorage (per device) and applied via CSS variables
// (see :root in styles.css) so every page picks them up the moment
// initAppearance() runs, same pattern as theme.js's accent/mode.
// ------------------------------------------------------------------
import { showToast } from "./notifications.js";

const root = document.documentElement;
const STORE_KEY = "lw-appearance";

const FONT_STACKS = {
  rajdhani: "'Rajdhani', -apple-system, sans-serif",
  poppins: "'Poppins', -apple-system, sans-serif",
  playfair: "'Playfair Display', Georgia, serif",
  quicksand: "'Quicksand', -apple-system, sans-serif"
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
export const BG_PRESET_LABELS = { none: "None (default)", aurora: "Aurora Deep", rose: "Rosé Dusk", bloom: "Midnight Bloom" };

const DEFAULTS = {
  family: "rajdhani", size: 16, weight: 400, spacing: 0, lineHeight: 1.5,
  blur: 10, bg: "none"
};

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; }
  catch { return { ...DEFAULTS }; }
}
function save(state) { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

function apply(state) {
  root.style.setProperty("--user-font-family", FONT_STACKS[state.family] || FONT_STACKS.rajdhani);
  root.style.setProperty("--user-font-size", state.size + "px");
  root.style.setProperty("--user-font-weight", state.weight);
  root.style.setProperty("--user-letter-spacing", state.spacing + "px");
  root.style.setProperty("--user-line-height", state.lineHeight);
  root.style.setProperty("--glass-blur", state.blur + "px");
  root.style.setProperty("--bg-preset-image", BG_PRESETS[state.bg] || BG_PRESETS.none);
}

/** Call once per page (alongside initTheme()) to apply saved appearance
 *  everywhere, and — on pages that have the controls in the DOM — wire
 *  them up live. Safe to call on pages without any of these elements. */
export function initAppearance() {
  const state = load();
  apply(state);

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
      apply(state);
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
      apply(state);
      if (label) label.textContent = state[key] + unit;
    });
    input.addEventListener("change", () => persistAndToast("Appearance"));
  });

  // Background image presets — a row of swatch buttons
  const bgButtons = document.querySelectorAll("[data-bg-preset]");
  if (bgButtons.length) {
    bgButtons.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.bgPreset === state.bg);
      btn.addEventListener("click", () => {
        state.bg = btn.dataset.bgPreset;
        apply(state);
        bgButtons.forEach(b => b.classList.toggle("active", b === btn));
        persistAndToast("Background");
      });
    });
  }

  // Reset to defaults
  const resetBtn = document.querySelector("#appearance-reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      Object.assign(state, DEFAULTS);
      apply(state);
      save(state);
      if (familySel) familySel.value = state.family;
      ranges.forEach(([id, key, unit]) => {
        const input = document.querySelector(`#${id}`);
        const label = document.querySelector(`#${id}-val`);
        if (input) input.value = state[key];
        if (label) label.textContent = state[key] + unit;
      });
      bgButtons.forEach(b => b.classList.toggle("active", b.dataset.bgPreset === "none"));
      showToast("Appearance reset to defaults", { type: "success", duration: 2000 });
    });
  }
}
