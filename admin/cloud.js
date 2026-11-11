/* MAKE SPACE Studio Manager — Clerk + Convex, development.
   Security is enforced in Convex mutations; the UI gate is presentation only.
   No administrator can self-enroll. */
(() => {
"use strict";
const CONVEX = "https://deafening-clam-741.convex.cloud";
const PUBLISHABLE_KEY = "pk_test_YWN0dWFsLXNuaXBlLTEzMzUuY2xlcmsuYWNjb3VudHMuZGV2JA";
const $ = (id) => document.getElementById(id);
let clerk, ready = false, currentUserToken = "";
const gate = $("access-gate");
const status = $("access-message");
const signin = $("clerk-sign-in");
const accessRequest = $("access-request");

function errorMessage(e) {
  const msg = String(e?.message || e || "Unknown error");
  return msg.replace(/\s*\[Request ID:.*$/s, "").slice(0, 340);
}
function setGate(message) { gate.hidden = false; $("studio-app").hidden = true; status.textContent = message; }
function showStudio() { gate.hidden = true; $("studio-app").hidden = false; }
function setRequest(token) {
  accessRequest.hidden = false;
  $("access-token").textContent = token;
  $("copy-access").onclick = () => navigator.clipboard.writeText(token);
}
async function clerkReady() {
  if (window.Clerk) return window.Clerk;
  return await new Promise((resolve, reject) => {
    let count = 0;
    const test = () => {
      if (window.Clerk) return resolve(window.Clerk);
      if (++count >= 100) return reject(Error("Clerk could not load. Check your connection or content blocker."));
      setTimeout(test, 100);
    };
    test();
  });
}
async function token() {
  const t = await clerk.session?.getToken();
  if (!t) throw Error("Sign in to continue");
  return t;
}
async function call(kind, path, args = {}) {
  let response;
  try {
    response = await fetch(CONVEX + "/api/" + kind, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + await token() },
      body: JSON.stringify({ path, args, format: "json" }),
      cache: "no-store"
    });
  } catch (err) {
    throw Error("Network/CORS error contacting Convex. Check your connection and try again.");
  }
  const body = await response.text();
  let json;
  try { json = JSON.parse(body); }
  catch { throw Error("Convex HTTP " + response.status + " returned non-JSON response"); }
  if (!response.ok || json.status !== "success") {
    const message = json.errorMessage || json.message || json.error || json.code ||
      ("Convex returned status " + String(json.status || "unknown"));
    throw Error("Convex HTTP " + response.status + ": " + String(message).slice(0, 320));
  }
  return json.value;
}
function intoEditor(e) {
  return {
    id: e._id, title: e.title, slug: e.slug, date: e.date, category: e.category,
    status: e.status === "sold_out" ? "sold-out" : e.status,
    time: e.time, duration: e.duration, venue: e.venue, price: e.priceCents / 100,
    capacity: e.capacity, description: e.description, image: e.imageExternalUrl || "",
    imageStorageId: e.imageStorageId || null, squareVariationId: e.squareVariationId || "", imageData: "",
    checkout: e.checkoutUrl || "", notes: e.notes, featured: e.featured
  };
}
async function loadEvents() {
  events = (await call("query", "events:listAdmin")).map(intoEditor);
  go("events");
}
async function upload(dataUrl) {
  if (!dataUrl?.startsWith("data:image/jpeg;base64,")) return null;
  const uploadUrl = await call("mutation", "media:generateUploadUrl");
  const blob = await (await fetch(dataUrl)).blob();
  const response = await fetch(uploadUrl, {
    method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob
  });
  if (!response.ok) throw Error("Image upload failed");
  return (await response.json()).storageId;
}
async function saveEvent(e) {
  e.preventDefault();
  if (!ready) return;
  if (!$("event-form").reportValidity()) return;
  const data = readForm();
  if (data.checkout) {
    try {
      const payment = new URL(data.checkout);
      if (payment.protocol !== "https:" ||
          !["square.link", "checkout.square.site"].includes(payment.hostname.toLowerCase()) ||
          payment.username || payment.password) {
        return toast("Use a Square-hosted checkout link from square.link or checkout.square.site");
      }
    } catch { return toast("Enter a valid Square payment link"); }
  }
  const prior = editing ? events.find(x => x.id === editing) : null;
  const slug = prior?.slug || data.title.toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g,"");
  if (!slug) return toast("Use a title containing letters or numbers");
  const submitButton = $("event-form").querySelector('[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Saving…";
  try {
    const imageStorageId = imageData ? await upload(imageData) : prior?.imageStorageId || undefined;
    const formEvent = {
      title: data.title, slug,
      category: data.category === "Ceramics" || data.category === "Social" ||
        data.category === "Collaboration" || data.category === "Private event" ? data.category : "Social",
      status: data.status === "sold-out" ? "sold_out" : data.status,
      date: data.date, time: data.time || "11:00", timezone: "America/Chicago",
      duration: data.duration, venue: data.venue,
      priceCents: Math.round(data.price * 100), capacity: data.capacity,
      description: data.description, featured: data.featured, notes: data.notes,
      ...(imageStorageId ? { imageStorageId } : {}),
      ...(data.image ? { imageExternalUrl: data.image } : {}),
      checkoutUrl: data.checkout || "",
      ...(data.checkout && window.makeSpaceSquareVariation ? { squareVariationId:window.makeSpaceSquareVariation } : {})
    };
    await call("mutation", "events:upsert", { ...(editing ? {id: editing} : {}), event: formEvent });
    imageData = "";
    await loadEvents();
    toast("Saved securely to Convex");
  } catch (err) { toast("Not saved: " + errorMessage(err)); }
  finally { submitButton.disabled = false; submitButton.textContent = "Save to cloud"; }
}
async function removeEvent() {
  if (!ready || !editing) return;
  if (!confirm("Permanently delete this event from Convex?")) return;
  try {
    await call("mutation", "events:remove", { id: editing });
    await loadEvents(); toast("Event deleted");
  } catch (err) { toast(errorMessage(err)); }
}
async function duplicateEvent() {
  if (!ready || !editing) return;
  const e = events.find(x => x.id === editing);
  if (!e) return;
  try {
    await call("mutation", "events:upsert", { event: {
      title: e.title + " (Copy)", slug: e.slug + "-copy-" + Date.now().toString(36),
      category: e.category, status: "draft", date: e.date, time: e.time || "11:00",
      timezone: "America/Chicago", duration: e.duration, venue: e.venue,
      priceCents: Math.round(e.price * 100), capacity: e.capacity,
      description: e.description, featured: false, notes: e.notes,
      ...(e.imageStorageId ? {imageStorageId: e.imageStorageId} : {}),
      ...(e.image ? {imageExternalUrl:e.image} : {}),
      ...(e.checkout ? {checkoutUrl:e.checkout} : {})
    }});
    await loadEvents(); toast("Draft duplicate saved");
  } catch(err) { toast(errorMessage(err)); }
}
function showSignedOut() {
  ready = false;
  setGate("Sign in to manage MAKE SPACE events.");
  accessRequest.hidden = true;
  signin.replaceChildren();
  clerk.mountSignIn(signin, { routing: "hash" });
}
async function updateAuth() {
  if (!clerk.session || !clerk.user) return showSignedOut();
  setGate("Checking your access…");
  try {
    const who = await call("query", "session:whoAmI");
    if (!who) return showSignedOut();
    if (!who.authorized) {
      ready = false;
      setGate("Your sign-in works. This account needs approval before it can manage events.");
      setRequest(who.tokenIdentifier);
      $("access-signout").hidden = false;
      return;
    }
    ready = true;
    currentUserToken = who.tokenIdentifier;
    await loadEvents();
    showStudio();
    $("auth-chip").textContent = "Connected · " + (who.role || "admin");
    $("studio-signout").hidden = false;
  } catch (err) {
    ready = false;
    setGate("Unable to connect: " + errorMessage(err));
  }
}
async function init() {
  setGate("Connecting to Clerk…");
  try {
    clerk = await clerkReady();
    await clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
    await updateAuth();
    clerk.addListener(({session, user}) => {
      if (!session || !user) {
        if (ready) location.reload();
        else showSignedOut();
      } else if (!ready) updateAuth();
    });
  } catch (err) {
    setGate("Authentication unavailable: " + errorMessage(err));
  }
}
$("access-signout").onclick = () => clerk?.signOut().then(() => location.reload());
$("studio-signout").onclick = () => clerk?.signOut().then(() => location.reload());
window.makeSpaceCloud = { save: saveEvent, remove: removeEvent, duplicate: duplicateEvent,
  request: call,
  get connected() {return ready;}, reload: loadEvents };
init();
})();
