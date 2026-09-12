// ============================================================
// Shared notification system for Love Wonders.
//
// Three pieces, all drop-in-safe for the existing pages:
//   1. showToast(msg, opts)   — stacked, themed toasts. Same call
//      signature as every page's old local showToast(msg), so
//      swapping the import is the only change needed at call sites.
//   2. renderBell(uid)        — a persistent notification bell +
//      history, backed by localStorage (per member), rendered into
//      any page that has a #notif-mount element.
//   3. watchForTasteMatches() — a live Firestore listener that
//      raises a notification (in-app + browser Notification, if
//      permitted) the moment a brand-new member joins who scores
//      against the signed-in member's taste preferences.
// ============================================================

import { db, collection, onSnapshot, query, where, doc, getDoc } from "./firebase-init.js";
import { matchScore, hasPreferences } from "./recommend.js";

const SESSION_KEY = "lw-session-start";
const SEEN_KEY = "lw-seen-new-users";
const MSG_SESSION_KEY = "lw-msg-session-start";
const SEEN_THREADS_KEY = "lw-seen-thread-replies";

let toastRoot = null;
function ensureToastRoot() {
  if (toastRoot && document.body.contains(toastRoot)) return toastRoot;
  toastRoot = document.querySelector("#toast-root");
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.id = "toast-root";
    toastRoot.className = "toast-root";
    document.body.appendChild(toastRoot);
  }
  return toastRoot;
}

const ICONS = { success: "&#10003;", match: "&#10022;", error: "!", info: "&#9670;" };

/** Stacked, auto-dismissing toast. opts: { type: "info"|"success"|"match"|"error", duration, icon } */
export function showToast(msg, opts = {}) {
  const root = ensureToastRoot();
  const type = opts.type || "info";
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${opts.icon || ICONS[type] || ICONS.info}</span><span class="toast-msg"></span>`;
  el.querySelector(".toast-msg").textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  const life = opts.duration || 3200;
  const dismiss = () => {
    el.classList.remove("show");
    el.classList.add("hide");
    setTimeout(() => el.remove(), 320);
  };
  const timer = setTimeout(dismiss, life);
  el.addEventListener("click", () => { clearTimeout(timer); dismiss(); });
  return el;
}

/** The "priority" confirmation — every save action gets one of these. */
export function savedToast(what = "Changes") {
  showToast(`${what} saved`, { type: "success" });
}

function notifKey(uid) { return `lw-notifications-${uid}`; }
function loadNotifs(uid) { try { return JSON.parse(localStorage.getItem(notifKey(uid))) || []; } catch { return []; } }
function saveNotifs(uid, list) { localStorage.setItem(notifKey(uid), JSON.stringify(list.slice(0, 30))); }

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

function addNotification(uid, notif) {
  const list = loadNotifs(uid);
  list.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, read: false, at: Date.now(), ...notif });
  saveNotifs(uid, list);
  renderBell(uid);
}

/** Renders the bell + dropdown into #notif-mount, if the current page has one. Safe to call repeatedly. */
export function renderBell(uid) {
  const mount = document.querySelector("#notif-mount");
  if (!mount) return;
  const list = loadNotifs(uid);
  const unread = list.filter(n => !n.read).length;

  mount.innerHTML = `
    <button id="notif-bell-btn" class="notif-bell" type="button" aria-label="Notifications" aria-expanded="false">
      <span class="notif-bell-icon">&#128276;</span>
      ${unread ? `<span class="notif-badge">${unread > 9 ? "9+" : unread}</span>` : ""}
    </button>
    <div id="notif-panel" class="notif-panel">
      <div class="notif-panel-head">
        <span>Notifications</span>
        ${list.length ? `<button id="notif-clear" type="button">Clear all</button>` : ""}
      </div>
      <div class="notif-list">
        ${list.length ? list.map(n => `
          <a class="notif-item ${n.read ? "" : "unread"}" href="${n.href || "#"}" data-id="${n.id}">
            <span class="notif-item-icon">${n.icon || "&#10022;"}</span>
            <span class="notif-item-body">
              <span class="notif-item-title" data-title></span>
              <span class="notif-item-time">${timeAgo(n.at)}</span>
            </span>
          </a>`).join("") : `<p class="notif-empty">Nothing yet — new messages and taste matches will show up here.</p>`}
      </div>
    </div>`;

  // Titles are set as text (not interpolated into the template) so a member's stored
  // name can never be read back as HTML.
  list.forEach(n => {
    const t = mount.querySelector(`[data-id="${n.id}"] [data-title]`);
    if (t) t.textContent = n.title;
  });

  const btn = mount.querySelector("#notif-bell-btn");
  const panel = mount.querySelector("#notif-panel");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = !panel.classList.contains("open");
    panel.classList.toggle("open", opening);
    btn.setAttribute("aria-expanded", String(opening));
    if (opening && unread) {
      setTimeout(() => {
        saveNotifs(uid, loadNotifs(uid).map(n => ({ ...n, read: true })));
        const badge = mount.querySelector(".notif-badge");
        if (badge) badge.remove();
      }, 900);
    }
  });
  document.addEventListener("click", (e) => {
    if (!mount.contains(e.target)) panel.classList.remove("open");
  });
  const clearBtn = mount.querySelector("#notif-clear");
  if (clearBtn) clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    saveNotifs(uid, []);
    renderBell(uid);
  });
}

// Kept live so a page can call watchForTasteMatches(...) again after the member
// edits their taste mid-session (e.g. Save taste) without stacking a second
// Firestore listener — only one listener is ever attached per page load.
let watcherArmed = false;
let latestPrefs = null;

/**
 * Live-watches new signups for the rest of this tab's session and raises a match
 * notification (in-app bell + toast, plus a real browser Notification if permitted)
 * the moment someone who fits the signed-in member's taste preferences joins.
 * Safe to call repeatedly (e.g. right after taste preferences are saved) — it
 * always matches against the most recently passed-in preferences, but only ever
 * attaches one underlying listener.
 */
export function watchForTasteMatches(uid, myPrefs) {
  latestPrefs = myPrefs;
  if (!hasPreferences(myPrefs) || watcherArmed) return;
  watcherArmed = true;

  if (!sessionStorage.getItem(SESSION_KEY)) sessionStorage.setItem(SESSION_KEY, String(Date.now()));
  const sessionStart = Number(sessionStorage.getItem(SESSION_KEY));

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }

  let seen;
  try { seen = new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY)) || []); } catch { seen = new Set(); }

  onSnapshot(query(collection(db, "users")), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type !== "added") return;
      const d = change.doc;
      if (d.id === uid || seen.has(d.id)) return;
      const data = d.data();
      const createdMs = typeof data.createdAt === "number" ? data.createdAt : (data.createdAt?.toMillis ? data.createdAt.toMillis() : 0);
      // Firestore replays every existing doc as an "added" change on first load —
      // only react to accounts actually created after this tab session began.
      if (!createdMs || createdMs < sessionStart - 2 * 60 * 1000) return;
      seen.add(d.id);
      sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));

      const score = matchScore(latestPrefs, { ...data, uid: d.id });
      if (score <= 0) return;

      const name = data.name || "A new member";
      addNotification(uid, { title: `${name} just joined and matches your taste`, icon: "&#10022;", href: "discover.html" });
      showToast(`New match: ${name} fits your taste`, { type: "match", duration: 4400 });

      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("Love Wonders — new match", {
            body: `${name} just joined and matches your taste preferences.`,
            icon: "favicon.jpg"
          });
        } catch { /* some browsers restrict this — the in-app toast/bell still cover it */ }
      }
    });
  });
}

/** Call once per authenticated page, right after load(): renders the bell and arms the live watcher. */
export function initNotifications(uid, myPrefs) {
  renderBell(uid);
  watchForTasteMatches(uid, myPrefs);
  watchForNewResponses(uid);
}

// Kept live for the same reason as watcherArmed above — only one listener
// per tab, safe to call initNotifications() again mid-session.
let msgWatcherArmed = false;
const senderNameCache = new Map(); // uid -> name, so a busy conversation doesn't re-fetch it per message

/**
 * Live-watches this member's message threads for the rest of this tab's session
 * and raises a notification (in-app bell + toast, plus a real browser
 * Notification if permitted) the moment someone "reaches out" — whether
 * that's the *first* message in a brand-new thread they started, or a
 * *reply* back after this member messaged them first. Either way, what
 * matters is: the latest message in the thread is from the other person,
 * and it's new since this tab opened. Points at messages.html, where the
 * inbox's "New" filter (see messages.js) lists exactly these threads.
 */
export function watchForNewResponses(uid) {
  if (msgWatcherArmed) return;
  msgWatcherArmed = true;

  if (!sessionStorage.getItem(MSG_SESSION_KEY)) sessionStorage.setItem(MSG_SESSION_KEY, String(Date.now()));
  const sessionStart = Number(sessionStorage.getItem(MSG_SESSION_KEY));

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }

  // threadId -> lastAt (ms) we've already notified for, so a thread's other
  // unrelated field changes (e.g. lastRead ticking while the chat is open)
  // don't re-fire a notification for the same incoming message.
  let seen;
  try { seen = new Map(JSON.parse(sessionStorage.getItem(SEEN_THREADS_KEY)) || []); } catch { seen = new Map(); }

  const q = query(collection(db, "threads"), where("participants", "array-contains", uid));
  onSnapshot(q, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "removed") return;
      const data = change.doc.data();
      // Only their incoming messages count as "reaching out" — not our own sends,
      // and not a thread that only just got created with no message yet.
      if (!data.lastFrom || data.lastFrom === uid) return;

      const lastAtMs = data.lastAt?.toMillis ? data.lastAt.toMillis() : 0;
      // Firestore replays every existing doc as an "added" change on first load —
      // only react to messages that actually landed after this tab session began,
      // same guard as watchForTasteMatches uses for new signups.
      if (!lastAtMs || lastAtMs < sessionStart - 2 * 60 * 1000) return;

      const already = seen.get(change.doc.id);
      if (already && already >= lastAtMs) return;
      seen.set(change.doc.id, lastAtMs);
      sessionStorage.setItem(SEEN_THREADS_KEY, JSON.stringify([...seen]));

      const otherUid = data.lastFrom;
      const announce = (name) => {
        addNotification(uid, { title: `${name} sent you a message`, icon: "&#128172;", href: "messages.html" });
        showToast(`New message from ${name}`, { type: "match", duration: 4400 });
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("Love Wonders — new message", {
              body: `${name} sent you a message.`,
              icon: "favicon.jpg"
            });
          } catch { /* some browsers restrict this — the in-app toast/bell still cover it */ }
        }
      };

      if (senderNameCache.has(otherUid)) {
        announce(senderNameCache.get(otherUid));
      } else {
        getDoc(doc(db, "users", otherUid)).then(userSnap => {
          const name = userSnap.data()?.name || "Someone";
          senderNameCache.set(otherUid, name);
          announce(name);
        }).catch(() => announce("Someone"));
      }
    });
  });
}
