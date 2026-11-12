/* Accessible scroll reveals for public MAKE SPACE pages; no dependency. */
(()=>{
"use strict";
if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
if(!("IntersectionObserver" in window))return;
const selectors=[".experience-image",".float",".gallery img",".photo",".event img",".private img",
  "#experience-detail .details",".calendarpanel",".head .lead"];
const seen=new WeakSet();
const observer=new IntersectionObserver(items=>{
  for(const item of items){
    if(!item.isIntersecting)continue;
    item.target.classList.add("ms-visible");
    observer.unobserve(item.target);
  }
},{threshold:.08,rootMargin:"0px 0px -20px 0px"});
function scan(){
 const nodes=document.querySelectorAll(selectors.join(","));
 for(const node of nodes){
  if(seen.has(node))continue;
  seen.add(node);
  if(node.matches(".experience-image,.float,.gallery img,.photo,.event img,.private img")){
   node.classList.add("ms-swipe-in");
   const box=node.getBoundingClientRect();
   if(box.left>innerWidth*.48)node.classList.add("ms-right");
  }else node.classList.add("ms-reveal");
  observer.observe(node);
 }
}
scan();
const mutation=new MutationObserver(()=>scan());
mutation.observe(document.body,{subtree:true,childList:true});
})();
