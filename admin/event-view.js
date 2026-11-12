/* MAKE SPACE read-only event view. Editing stays explicit. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const editor=$("editor-view"),tabs=editor?.querySelector(".ms-workspace-tabs"),form=editor?.querySelector(".editorbody");
const guestPanel=$("attendees-panel");
if(!editor||!form)return;
const card=document.createElement("section");
card.id="ms-readonly-view";card.className="surface";card.hidden=true;
card.setAttribute("aria-label","Experience overview");
card.style.cssText="padding:clamp(22px,3vw,42px);margin:0;min-width:0";
form.insertAdjacentElement("afterend",card);
const style=document.createElement("style");
style.textContent=`
#ms-readonly-view[hidden]{display:none!important}
#ms-readonly-view .ms-overview-kicker{font:700 10px "DM Sans",sans-serif;letter-spacing:.14em;color:#795b63;text-transform:uppercase}
#ms-readonly-view h3{font:400 clamp(32px,4vw,48px)/1.05 "Italiana",Georgia,serif;color:#501923;letter-spacing:-.035em;margin:12px 0 10px}
#ms-readonly-view .ms-overview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 30px;margin:28px 0;border-top:1px solid #e0d2ca;padding-top:24px}
#ms-readonly-view .ms-overview-item span{display:block;font:700 10px "DM Sans",sans-serif;letter-spacing:.09em;text-transform:uppercase;color:#866f73;margin-bottom:9px}
#ms-readonly-view .ms-overview-item strong{font:400 14px/1.5 "DM Sans",sans-serif;color:#3f3033;overflow-wrap:anywhere}
#ms-readonly-view .ms-overview-notes{white-space:pre-wrap;overflow-wrap:anywhere;font:400 13px/1.65 "DM Sans",sans-serif}
#ms-readonly-view .ms-overview-photo{display:block;max-width:100%;width:100%;max-height:400px;object-fit:cover;margin:24px 0}
#ms-readonly-view .ms-overview-actions{display:flex;flex-wrap:wrap;align-items:center;gap:13px;margin-top:32px}
@media(max-width:560px){#ms-readonly-view .ms-overview-grid{grid-template-columns:1fr;gap:18px}}
`;
document.head.appendChild(style);
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const field=(name,value)=>'<div class="ms-overview-item"><span>'+esc(name)+'</span><strong>'+esc(value||"Not set")+'</strong></div>';
function showReadOnly(){
 const e=events.find(x=>x.id===editing);
 if(!e)return;
 window.makeSpaceResetWorkspace?.();
 editor.classList.remove("ms-attendees-active");
 tabs&&(tabs.hidden=true);
 form.hidden=true;
 guestPanel&&(guestPanel.hidden=true);
 card.hidden=false;
 $("editor-title").textContent=e.title;
 editor.querySelector(".editorhead .subtitle").textContent="Experience overview";
 const price=Number(e.price||0);
 const fields=field("Date",typeof displayDate==="function"?displayDate(e.date):e.date)+field("Time",e.time||"TBD")+
   field("Venue",e.venue)+field("Experience type",e.category)+field("Ticket price","$"+price.toFixed(2))+
   field("Capacity",e.capacity+" guests")+field("Duration",e.duration+" minutes")+field("Status",e.status);
 card.innerHTML='<div class="ms-overview-kicker">EVENT OVERVIEW</div><h3>'+esc(e.title)+'</h3>'+
   '<div class="ms-overview-grid">'+fields+'</div>'+
   (e.description?'<div class="ms-overview-item"><span>Description</span><p class="ms-overview-notes">'+esc(e.description)+'</p></div>':"")+
   (e.notes?'<div class="ms-overview-item"><span>Internal notes · admins only</span><p class="ms-overview-notes">'+esc(e.notes)+'</p></div>':"")+
   '<div class="ms-overview-actions"><button type="button" class="btn" id="ms-overview-edit">Edit experience</button>'+
   '<button type="button" class="btn secondary" id="ms-overview-attendees">Attendees</button></div>';
 $("ms-overview-edit").addEventListener("click",()=>{openEditor(e.id)});
 $("ms-overview-attendees").addEventListener("click",()=>{openEditor(e.id);$("ms-tab-attendees")?.click()});
}
window.makeSpaceShowReadOnly=showReadOnly;

window.makeSpaceHideReadOnly=()=>{
  card.hidden=true;
  tabs&&(tabs.hidden=false);
  form.hidden=editor.classList.contains("ms-attendees-active");
};
editor.querySelectorAll(".ms-workspace-tab").forEach(tab=>tab.addEventListener("click",()=>window.makeSpaceHideReadOnly()));
const originalReset=window.makeSpaceResetWorkspace;
window.makeSpaceResetWorkspace=()=>{
 window.makeSpaceHideReadOnly();
 originalReset?.();
};
})();
