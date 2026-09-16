// Renders the same 4-item nav into two places: the horizontal bar under the
// topbar (#nav-mount, used on wide screens) and a slide-in left sidebar
// (#side-mount, inside #app-sidebar) that pops open from a hamburger button
// on small screens instead of pinning a nav bar to the top or bottom of the
// viewport. One source of truth (ITEMS) so every page, and every form the
// nav takes, stays in sync automatically.

const ITEMS = [
  { id: "discover", href: "discover.html", label: "Discover", icon: "⌕" },
  { id: "messages", href: "messages.html", label: "Messages", icon: "✉" },
  { id: "profile", href: "profile.html", label: "Profile", icon: "☺" },
  { id: "settings", href: "settings.html", label: "Theme", icon: "☰" }
];

// The unread-message badge is driven by a live Firestore listener in
// notifications.js (watchForNewResponses), which can call setMessagesBadge()
// from any page, at any time — including before renderNav() has painted
// anything on a slow connection. Keeping the last known count here (not just
// in the DOM) means whichever happens first — the listener firing or the
// nav painting — the badge still ends up correct instead of racing. It's
// now painted onto every ".appnav-msg-badge" in the page (there can be two —
// one in the top nav, one in the sidebar nav — instead of just one).
let lastCount = 0;

function itemsMarkup(activeId) {
  return ITEMS.map(item => `
    <a class="appnav-item ${item.id === activeId ? "active" : ""}" href="${item.href}">
      <span class="appnav-icon-wrap">
        <span class="appnav-icon">${item.icon}</span>
        ${item.id === "messages" ? `<span class="appnav-badge appnav-msg-badge" hidden></span>` : ""}
      </span>
      <span class="appnav-label">${item.label}</span>
    </a>`).join("");
}

/** Call once per page load to paint both forms of the nav and wire the sidebar. */
export function renderNav(activeId) {
  const topMount = document.querySelector("#nav-mount");
  const sideMount = document.querySelector("#side-mount");
  if (topMount) topMount.innerHTML = `<nav class="appnav">${itemsMarkup(activeId)}</nav>`;
  if (sideMount) sideMount.innerHTML = `<nav class="sidenav">${itemsMarkup(activeId)}</nav>`;

  paintBadge();
  syncTopbarHeightVar();
  initSidebar();
}

// The nav row sticks directly under the top bar (see #nav-mount in
// styles.css, which reads --topbar-h). The top bar's real height shifts
// with font-size/weight settings and viewport width, so it's measured
// live rather than hardcoded — kept in sync on load and on resize.
function syncTopbarHeightVar() {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;
  const set = () => document.documentElement.style.setProperty("--topbar-h", `${topbar.offsetHeight}px`);
  set();
  window.addEventListener("resize", set);
  if (window.ResizeObserver) new ResizeObserver(set).observe(topbar);
}

/**
 * Sets the live "new messages" count on the Messages nav item, from any page.
 * Safe to call before renderNav() has mounted anything, or on a page with no
 * #nav-mount/#side-mount at all — the count is kept either way so the next
 * renderNav() paints it correctly. This is what keeps Messages "always
 * pinging for new": the badge is wired to notifications.js's live thread
 * listener, not to a one-time check, so it updates in real time on whichever
 * page is open, in whichever form of the nav is currently visible.
 */
export function setMessagesBadge(count) {
  lastCount = count;
  paintBadge();
}

function paintBadge() {
  document.querySelectorAll(".appnav-msg-badge").forEach(el => {
    if (lastCount > 0) {
      el.hidden = false;
      el.textContent = lastCount > 9 ? "9+" : String(lastCount);
    } else {
      el.hidden = true;
    }
  });
}

// ---- off-canvas sidebar (small screens) -----------------------------------
// Wired once per page load: the hamburger (#menu-toggle) opens #app-sidebar
// with a dimmed backdrop (#sidebar-overlay); the backdrop, the sidebar's own
// close (×) button, clicking a nav link inside it, or Escape all close it
// again. On wide screens the sidebar/backdrop/hamburger are hidden by CSS
// (see styles.css), so this wiring is simply inert there — the original
// horizontal #nav-mount bar is what's visible instead.
function initSidebar() {
  const toggle = document.querySelector("#menu-toggle");
  const sidebar = document.querySelector("#app-sidebar");
  const overlay = document.querySelector("#sidebar-overlay");
  const closeBtn = document.querySelector("#sidebar-close");
  if (!toggle || !sidebar || !overlay) return;
  if (toggle.dataset.bound) return; // guard in case renderNav() runs more than once
  toggle.dataset.bound = "1";

  let hideOverlayTimer = null;

  const open = () => {
    clearTimeout(hideOverlayTimer);
    overlay.hidden = false;
    // Force layout so the opacity transition below actually runs instead of
    // jump-cutting (removing [hidden] and adding .open in the same frame
    // would otherwise get coalesced by the browser).
    void overlay.offsetWidth;
    sidebar.classList.add("open");
    overlay.classList.add("open");
    sidebar.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("sidebar-locked");
  };

  const close = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
    sidebar.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("sidebar-locked");
    hideOverlayTimer = setTimeout(() => { overlay.hidden = true; }, 250);
  };

  toggle.addEventListener("click", () => {
    if (sidebar.classList.contains("open")) close(); else open();
  });
  overlay.addEventListener("click", close);
  if (closeBtn) closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && sidebar.classList.contains("open")) close();
  });
  sidebar.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
}
