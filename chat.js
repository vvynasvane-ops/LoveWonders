import {
  db, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp,
  doc, setDoc, where
} from "./firebase-init.js";
import { loaderHtml, loaderStreamHtml } from "./common.js";

let unsubMessages = null;
let unsubTyping = null;
let typingTickInterval = null;
let lastTypingPingAt = 0;

export function threadId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtDay(ts) {
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yest)) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

/**
 * Mounts a full, real-messaging-style chat panel into `mountEl`.
 * otherUser: { name, photoURL } — used for the header and their bubbles' avatar.
 */
export function openChat(mountEl, myUid, otherUid, otherUser = {}) {
  closeChat();
  lastTypingPingAt = 0; // don't carry a previous conversation's throttle window into this one
  const otherName = otherUser.name || "them";
  const otherPhoto = otherUser.photoURL || placeholderAvatar();

  mountEl.innerHTML = `
    <div class="chat-wrap">
      <div class="chat-header">
        <img src="${otherPhoto}" alt="">
        <div>
          <div class="chat-header-name">${escapeHtml(otherName)}</div>
          <div class="chat-header-status"><span class="status-dot"></span>Active on Love Wonders</div>
        </div>
      </div>
      <div id="chat-log" class="chat-log"></div>
      <div id="chat-send-status" class="chat-send-status"></div>
      <div class="chat-input-row">
        <textarea id="chat-text" rows="1" placeholder="Message ${escapeHtml(otherName)}…"></textarea>
        <button id="chat-send" class="chat-send-btn" type="button" aria-label="Send" disabled>&#10148;</button>
      </div>
    </div>`;

  const tid = threadId(myUid, otherUid);
  const logEl = mountEl.querySelector("#chat-log");
  const input = mountEl.querySelector("#chat-text");
  const sendBtn = mountEl.querySelector("#chat-send");
  const sendStatus = mountEl.querySelector("#chat-send-status");

  // Auto-grow the textarea like a real chat input.
  const autoGrow = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 100) + "px"; };
  input.addEventListener("input", () => {
    autoGrow();
    sendBtn.disabled = !input.value.trim();
    // Throttle: writing a typing ping to Firestore on every single keystroke
    // was excessive (a full write per character) and did nothing to prevent
    // it. Once every 2s while actively typing is plenty to keep the other
    // side's indicator alive.
    const now = Date.now();
    if (now - lastTypingPingAt > 2000) {
      lastTypingPingAt = now;
      pingTyping(tid, myUid);
    }
  });

  // Mark this thread read by me as soon as I open it. This also has to be the
  // call that creates the thread doc on a brand-new conversation (before any
  // message has been sent) — it must include `participants`, because the
  // Firestore rules require request.resource.data.participants to allow the
  // write, and require resource.data.participants to allow the *read* the
  // typing-indicator listener below does. Without participants here, this
  // write silently failed (caught by .catch), the thread doc never got
  // created, and the typing listener's read on a nonexistent doc was denied.
  setDoc(doc(db, "threads", tid), {
    participants: [myUid, otherUid],
    [`lastRead.${myUid}`]: serverTimestamp()
  }, { merge: true }).catch(() => {});

  // `theirTypingUntil` is the local source of truth for whether to show the
  // indicator; syncTypingIndicator() paints it in or out of the DOM.
  // Two things used to break this:
  //  1. Every new/changed message replaced logEl's whole innerHTML, silently
  //     wiping out the indicator element until the *next* Firestore typing
  //     write happened to arrive — it wouldn't come back on its own.
  //  2. The indicator was only ever added/removed inside the typing
  //     listener's callback, which only fires when the typing doc field
  //     changes. If the other person stopped typing and never sent another
  //     keystroke, nothing re-ran the "has this gone stale?" check, so the
  //     indicator could stay stuck on screen forever.
  // Keeping the state in a variable and re-syncing it both after every
  // message render and on a 1s tick (below) fixes both.
  let theirTypingUntil = 0;
  function syncTypingIndicator() {
    const isTyping = Date.now() < theirTypingUntil;
    const existing = logEl.querySelector(".typing-indicator");
    if (isTyping && !existing) {
      logEl.insertAdjacentHTML("beforeend", `<div class="typing-indicator"><span></span><span></span><span></span></div>`);
      logEl.scrollTop = logEl.scrollHeight;
    } else if (!isTyping && existing) {
      existing.remove();
    }
  }

  logEl.innerHTML = loaderHtml("Loading messages");
  const q = query(collection(db, "threads", tid, "messages"), orderBy("createdAt", "asc"));
  unsubMessages = onSnapshot(
    q,
    snap => {
      const docs = snap.docs.map(d => d.data());
      logEl.innerHTML = renderLog(docs, myUid, otherPhoto) || emptyState(otherName);
      syncTypingIndicator();
      logEl.scrollTop = logEl.scrollHeight;
      // Keep the thread's read marker fresh while the panel stays open.
      if (docs.length) setDoc(doc(db, "threads", tid), { [`lastRead.${myUid}`]: serverTimestamp() }, { merge: true }).catch(() => {});
    },
    err => {
      // A failed listener (offline, a missing index, rules) used to leave the
      // panel stuck on its loading spinner forever — show a retry state instead.
      console.error("Chat message listener failed:", err);
      logEl.innerHTML = `<div class="chat-empty">Couldn't load this conversation. <button type="button" class="btn ghost small" id="chat-retry">Retry</button></div>`;
      const retryBtn = logEl.querySelector("#chat-retry");
      if (retryBtn) retryBtn.addEventListener("click", () => openChat(mountEl, myUid, otherUid, otherUser), { once: true });
    }
  );

  unsubTyping = onSnapshot(doc(db, "threads", tid), snap => {
    const data = snap.data();
    const theirTypingAt = data?.typing?.[otherUid]?.toMillis?.();
    theirTypingUntil = theirTypingAt ? theirTypingAt + 4000 : 0;
    syncTypingIndicator();
  }, err => console.error("Typing indicator listener failed:", err));

  // Ticks the indicator's expiry independently of Firestore events, so it
  // reliably disappears ~4s after their last keystroke even if they never
  // send another typing update or a message.
  typingTickInterval = setInterval(syncTypingIndicator, 1000);

  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = ""; autoGrow(); sendBtn.disabled = true;
    sendStatus.innerHTML = loaderStreamHtml();
    try {
      await Promise.all([
        addDoc(collection(db, "threads", tid, "messages"), { from: myUid, to: otherUid, text, createdAt: serverTimestamp() }),
        setDoc(doc(db, "threads", tid), {
          participants: [myUid, otherUid],
          lastText: text, lastFrom: myUid, lastAt: serverTimestamp(),
          [`lastRead.${myUid}`]: serverTimestamp()
        }, { merge: true })
      ]);
    } catch (err) {
      // Don't lose the message or brick the compose box on a failed send —
      // put the text back and let the person try again.
      console.error("Send failed:", err);
      input.value = text;
      autoGrow();
      showToast("Message didn't send — check your connection and try again.", { type: "error" });
    } finally {
      sendStatus.innerHTML = "";
      sendBtn.disabled = !input.value.trim();
    }
  };
  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
}

function pingTyping(tid, myUid) {
  setDoc(doc(db, "threads", tid), { [`typing.${myUid}`]: serverTimestamp() }, { merge: true }).catch(() => {});
}

function renderLog(docs, myUid, otherPhoto) {
  let html = "";
  let lastDay = "";
  docs.forEach((m, i) => {
    const dayLabel = m.createdAt ? fmtDay(m.createdAt) : "";
    if (dayLabel && dayLabel !== lastDay) {
      html += `<div class="date-divider">${dayLabel}</div>`;
      lastDay = dayLabel;
    }
    const mine = m.from === myUid;
    const next = docs[i + 1];
    const chainLast = !next || next.from !== m.from;
    html += `
      <div class="msg-row ${mine ? "mine" : "theirs"} ${chainLast ? "chain-last" : ""}">
        ${!mine ? `<img class="msg-avatar" src="${otherPhoto}" alt="">` : ""}
        <div class="msg ${mine ? "mine" : "theirs"}">
          ${escapeHtml(m.text)}
          <div class="msg-meta">
            <span>${fmtTime(m.createdAt)}</span>
            ${mine ? `<span class="msg-tick">&#10003;</span>` : ""}
          </div>
        </div>
      </div>`;
  });
  return html;
}

function emptyState(otherName) {
  return `<div class="chat-empty"><span class="lock-icon">&#10084;</span>Say hello to ${escapeHtml(otherName)} — this is the start of your conversation.</div>`;
}

function placeholderAvatar() {
  return "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='100%' height='100%' fill='#10282c'/></svg>`
  );
}

export function closeChat() {
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  if (unsubTyping) { unsubTyping(); unsubTyping = null; }
  if (typingTickInterval) { clearInterval(typingTickInterval); typingTickInterval = null; }
}

/**
 * Lists my conversation threads, most recent first. Used by the Messages inbox.
 * Returns an unsubscribe function; cb receives an array of thread docs.
 */
/**
 * Lists my conversation threads, most recent first. Used by the Messages inbox.
 * cb(list) fires on every update. onError(err), if given, fires if the listener
 * itself fails (e.g. a missing Firestore index, permissions, or being offline) —
 * without it, a failed listener used to leave the inbox stuck on its loading
 * state forever with only a console error to show for it.
 * Returns an unsubscribe function.
 */
export function listThreads(myUid, cb, onError) {
  const q = query(
    collection(db, "threads"),
    where("participants", "array-contains", myUid),
    orderBy("lastAt", "desc")
  );
  return onSnapshot(
    q,
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => {
      console.error("listThreads listener failed:", err);
      if (onError) onError(err);
    }
  );
}
