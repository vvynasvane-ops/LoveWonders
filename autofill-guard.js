/*
 * Love Wonders — autofill guard (classic script, load right after appearance-core.js)
 *
 * Browsers and password managers love to drop your saved email / password into any
 * text box that "looks" like a login field (display name, search, city, PIN, ...).
 * This script makes every field opt OUT by default. Only inputs marked
 * data-allow-autofill (the real email + password on the login form) keep it.
 *
 * Layers, from gentle to stubborn:
 *  1. autocomplete="off" (or "new-password" on password boxes, which stops saved-password fill)
 *  2. opt-out flags for 1Password, LastPass, Bitwarden, Dashlane, Chrome "form-type"
 *  3. "lock until touched": a field is readonly until you tap/click/focus it. Browsers do not
 *     autofill readonly fields, and programmatic value-setting by the app still works.
 *  4. PIN boxes become masked numeric text boxes (-webkit-text-security) so they are no longer
 *     type=password and can never trigger the saved-password filler.
 *  5. A MutationObserver applies all of this to inputs the app creates later (chat, modals).
 */
(function () {
  "use strict";

  var SKIP_TYPES = { checkbox: 1, radio: 1, range: 1, file: 1, hidden: 1, button: 1, submit: 1, reset: 1, image: 1, color: 1 };
  var MASK_OK = (window.CSS && CSS.supports && (CSS.supports("-webkit-text-security", "disc") || CSS.supports("text-security", "disc")));
  var uid = 0;

  function shouldGuard(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA") return false;
    if (el.hasAttribute("data-allow-autofill")) return false;
    if (tag === "INPUT" && SKIP_TYPES[(el.getAttribute("type") || "text").toLowerCase()]) return false;
    return true;
  }

  function guard(el) {
    if (el.__lwGuarded) return;
    el.__lwGuarded = true;

    // PIN boxes: masked numeric text instead of type=password
    if (el.classList.contains("chat-pin-input") && MASK_OK) {
      el.type = "text";
      el.setAttribute("inputmode", "numeric");
      el.classList.add("masked-pin");
    }

    var isPw = (el.getAttribute("type") || "").toLowerCase() === "password";
    el.setAttribute("autocomplete", isPw ? "new-password" : "off");
    el.setAttribute("autocorrect", "off");
    el.setAttribute("data-lpignore", "true");        // LastPass
    el.setAttribute("data-1p-ignore", "true");       // 1Password
    el.setAttribute("data-bwignore", "true");        // Bitwarden
    el.setAttribute("data-dashlane-ignore", "true"); // Dashlane (best effort)
    el.setAttribute("data-form-type", "other");

    // a neutral name so heuristics keyed on name="email"/"user" have nothing to grab
    if (!el.getAttribute("name")) el.setAttribute("name", "lw-" + (el.id || "f") + "-" + (++uid));

    // lock until touched
    if (!el.readOnly && !el.disabled) {
      el.readOnly = true;
      el.__lwLocked = true;
      var unlock = function () { if (el.__lwLocked) { el.readOnly = false; el.__lwLocked = false; } };
      var relock = function () { if (!el.disabled && !el.readOnly) { el.readOnly = true; el.__lwLocked = true; } };
      el.addEventListener("pointerdown", unlock, true);
      el.addEventListener("touchstart", unlock, { capture: true, passive: true });
      el.addEventListener("focus", unlock, true);
      el.addEventListener("blur", relock, true);
    }
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (shouldGuard(root)) guard(root);
    var list = root.querySelectorAll ? root.querySelectorAll("input, textarea") : [];
    for (var i = 0; i < list.length; i++) if (shouldGuard(list[i])) guard(list[i]);
    // forms that are not the real login form
    if (root.tagName === "FORM" || (root.querySelectorAll && root.querySelector("form"))) {
      var forms = root.tagName === "FORM" ? [root] : root.querySelectorAll("form");
      for (var f = 0; f < forms.length; f++) {
        if (!forms[f].querySelector("[data-allow-autofill]")) forms[f].setAttribute("autocomplete", "off");
      }
    }
  }

  function start() {
    scan(document.documentElement);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) scan(added[j]);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Last line of defence: if a browser still pushes a value into a guarded field that the
    // person never touched, wipe it. Only fields the app does not fill itself (marked
    // data-autofill-wipe) are cleared this way, so profile data loaded from Firestore is safe.
    setTimeout(function () {
      var wipe = document.querySelectorAll("[data-autofill-wipe]");
      for (var i = 0; i < wipe.length; i++) {
        var el = wipe[i], hit = false;
        try { hit = el.matches(":-webkit-autofill") || el.matches(":autofill"); } catch (e) {}
        if (hit) el.value = "";
      }
    }, 600);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
