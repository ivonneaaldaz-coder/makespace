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
      ...(data.checkout && $("square-variation-id")?.value ? {squareVariationId:$("square-variation-id").value}: {})
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

async function verifySquare() {
  if(!ready) return;
  const url=$("checkout").value.trim();
  if(!url) return toast("Paste a Square link first");
  const button=$("verify-square");
  button.disabled=true;button.textContent="Checking Square…";
  try{
    const result=await call("action","square:inspectLink",{url});
    $("square-variation-id").value=result.variationId;
    $("square-link-status").textContent="Linked to Square: "+result.itemName+". Save to Cloud to enable attendance tracking.";
    toast("Square ticket matched successfully");
  }catch(err){
    $("square-variation-id").value="";
    $("square-link-status").textContent="Not connected: "+errorMessage(err);
  }finally{
    button.disabled=false;button.textContent="Verify with Square ↗";
  }
}
async function showAttendees(){
  if(!ready||!editing)return;
  const panel=$("attendees-panel");
  panel.hidden=false;
  panel.innerHTML='<p>Loading paid registrations…</p>';
  try{
    const data=await call("query","square:listAttendees",{eventId:editing});
    panel.innerHTML='<h3 style="font:400 32px Italiana,serif;margin:5px 0 16px">Attendees</h3>'+
      '<p><strong>'+data.seatsSold+'</strong> paid seats · <strong>'+data.seatsRemaining+
      '</strong> remaining of '+data.capacity+' · <strong>
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
initAttendeesUI();
window.makeSpaceCloud = { save: saveEvent, remove: removeEvent, duplicate: duplicateEvent,
  get connected() {return ready;}, reload: loadEvents };
init();
})();
+(data.revenueCents/100).toFixed(2)+'</strong> recorded gross revenue</p>'+
      (data.rows.length?'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'+
      '<thead><tr><th>Buyer</th><th>Seats</th><th>Payment</th><th>Confirmation</th></tr></thead><tbody>'+
      data.rows.map(r=>'<tr><td>'+escapeHTML(r.buyerName||r.buyerEmail||"Buyer not supplied")+
      '</td><td>'+r.quantity+'</td><td>'+escapeHTML(r.status)+
      '</td><td>'+escapeHTML(r.confirmationStatus)+'</td></tr>').join("")+
      '</tbody></table></div>':'<p>No paid bookings have been synced for this event yet.</p>')+
      '<p style="font-size:11px;margin-top:16px">These figures update after verified Square webhook delivery. Square remains the authoritative ticket inventory.</p>';
  }catch(err){panel.textContent="Could not load attendees: "+errorMessage(err);}
}
function initAttendeesUI(){
  const checkout=$("checkout");
  const parent=checkout.closest(".group");
  parent.insertAdjacentHTML("beforeend",'<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:9px">'+
    '<button class="btn secondary small" type="button" id="verify-square">Verify with Square ↗</button>'+
    '<span id="square-link-status" style="font-size:11px;color:#795962">Square tracking not connected yet</span></div>'+
    '<input type="hidden" id="square-variation-id">');
  $("verify-square").addEventListener("click",verifySquare);
  checkout.addEventListener("input",()=>{
    $("square-variation-id").value="";
    $("square-link-status").textContent="Link changed — verify again to connect tracking";
  });
  const duplicate=$("duplicate");
  duplicate.insertAdjacentHTML("beforebegin",'<button type="button" class="btn secondary small" id="show-attendees">View attendees</button>');
  $("show-attendees").addEventListener("click",showAttendees);
  $("editor-view").insertAdjacentHTML("beforeend",'<section id="attendees-panel" class="surface" hidden style="padding:26px;margin:18px 0;min-width:0"></section>');
  const oldOpen=window.openEditor;
  // Existing editor function is declared in the same global script; its fields
  // are populated synchronously before the click handler runs.
  document.addEventListener("click",ev=>{
    if(ev.target.closest("[data-edit]")||ev.target.closest("[data-caledit]")){
      $("attendees-panel").hidden=true;
      const id=ev.target.closest("[data-edit]")?.dataset.edit || ev.target.closest("[data-caledit]")?.dataset.caledit;
      const event=events.find(e=>e.id===id);
      $("square-variation-id").value=event?.squareVariationId||"";
      $("square-link-status").textContent=event?.squareVariationId?"Square variation linked":"Not linked to Square tracking";
    }
  });
  $("add").addEventListener("click",()=>{ $("square-variation-id").value=""; $("attendees-panel").hidden=true; });
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
  get connected() {return ready;}, reload: loadEvents };
init();
})();
