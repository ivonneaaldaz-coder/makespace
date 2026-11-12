/* One event workspace, two focused tabs. Keeps existing attendee queries unchanged. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const editor=$("editor-view"),body=editor?.querySelector(".editorbody"),head=editor?.querySelector(".editorhead");
const attendees=$("attendees-button"),panel=$("attendees-panel");
if(!editor||!body||!head||!attendees||!panel)return;
const tabs=document.createElement("div");
tabs.className="ms-workspace-tabs";
tabs.setAttribute("role","tablist");
tabs.setAttribute("aria-label","Experience workspace");
tabs.innerHTML='<button id="ms-tab-details" type="button" class="ms-workspace-tab" role="tab" aria-selected="true" aria-controls="ms-details-panel">Event details</button><button id="ms-tab-attendees" type="button" class="ms-workspace-tab" role="tab" aria-selected="false" aria-controls="attendees-panel">Attendees</button>';
head.insertAdjacentElement("afterend",tabs);
body.id="ms-details-panel";body.setAttribute("role","tabpanel");
panel.setAttribute("role","tabpanel");
panel.classList.add("ms-tab-panel");
const detailTab=$("ms-tab-details"),guestTab=$("ms-tab-attendees");
attendees.hidden=true; // The tab replaces the floating old button.
function activate(which){
  const isGuest=which==="attendees";
  if(isGuest&&(!editing||!events.some(e=>e.id===editing)))return;
  detailTab.setAttribute("aria-selected",String(!isGuest));
  guestTab.setAttribute("aria-selected",String(isGuest));
  guestTab.disabled=!editing;
  editor.classList.toggle("ms-attendees-active",isGuest);
  body.hidden=isGuest;
  panel.hidden=!isGuest;
  if(isGuest){
    const event=events.find(e=>e.id===editing);
    $("editor-title").textContent=event?.title||"Attendees";
    editor.querySelector(".editorhead .subtitle").textContent="Bookings, tickets, and guest check-in.";
    attendees.click(); // Reuses the existing authenticated query/renderer.
  }else{
    $("editor-title").textContent=editing?"Edit experience":"New experience";
    editor.querySelector(".editorhead .subtitle").textContent="Edit the details and save securely to your Studio Manager.";
  }
}
detailTab.addEventListener("click",()=>activate("details"));
guestTab.addEventListener("click",()=>activate("attendees"));
window.makeSpaceResetWorkspace=()=>activate("details");
activate("details");
})();