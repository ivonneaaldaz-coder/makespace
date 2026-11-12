/* MAKE SPACE: one predictable entrance for every public image/card.
   Static and dynamically injected content use the same observer and duration. */
(()=>{
"use strict";
if(!("IntersectionObserver" in window) ||
   window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;

// Animate whole event cards rather than just their inner images. The card's
// existing image-hover animation remains independent of the entrance.
const selector=[
  ".hero img.float",
  ".event-grid > .event",
  ".gallery img",
  ".private-grid > img",
  ".about-grid > img",
  ".experience-image",
  ".private-events img.photo",
  ".photo",
  ".bodygrid img",
  ".private img",
  ".about img",
  ".event-image"
].join(",");
const seen=new WeakSet();
let leftRight=0;
const observer=new IntersectionObserver(entries=>{
  for(const entry of entries){
    if(!entry.isIntersecting)continue;
    const node=entry.target;
    node.classList.add("ms-motion-visible");
    observer.unobserve(node);
  }
},{threshold:0.1,rootMargin:"0px 0px -28px 0px"});
function scan(){
  document.querySelectorAll(selector).forEach(node=>{
    if(seen.has(node) || node.closest(".event-grid > .event") && node.matches("img"))return;
    seen.add(node);
    const rect=node.getBoundingClientRect();
    // Direction follows composition (left / right) but every target gets
    // precisely the same 32px, 850ms entrance treatment.
    const direction=rect.left+rect.width/2 > window.innerWidth/2 ? "right":"left";
    node.classList.add("ms-motion-item","ms-motion-"+direction);
    observer.observe(node);
    leftRight++;
  });
}
scan();
let scheduled=false;
const changes=new MutationObserver(()=>{
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;scan()});
});
changes.observe(document.body,{childList:true,subtree:true});
window.addEventListener("pageshow",()=>scan());
})();
