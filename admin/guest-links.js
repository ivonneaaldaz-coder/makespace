/* MAKE SPACE booking-specific guest links. Only Studio Manager admins can issue/revoke. */
(()=>{
"use strict";
document.addEventListener("click",async e=>{
 const button=e.target.closest(".ms-guest-link,.ms-revoke-link");
 if(!button||!window.makeSpaceCloud?.connected)return;
 const registrationId=button.dataset.booking;
 if(!registrationId)return;
 const isRevoke=button.classList.contains("ms-revoke-link");
 if(isRevoke&&!confirm("Revoke this booking's guest registration link?"))return;
 button.disabled=true;
 try{
   if(isRevoke){
     await window.makeSpaceCloud.request("mutation","guests:setGuestLink",{registrationId});
     button.textContent="Revoked";
   }else{
     const secret=crypto.getRandomValues(new Uint8Array(32));
     const token=Array.from(secret,byte=>byte.toString(16).padStart(2,"0")).join("");
     const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
     const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
     await window.makeSpaceCloud.request("mutation","guests:setGuestLink",{registrationId,hash});
     const link=new URL("/guests/",location.origin);
     link.hash=token;
     await navigator.clipboard.writeText(link.toString());
     button.textContent="Copied!";
   }
 }catch(err){alert("Could not update guest link: "+String(err.message||err).slice(0,200))}
 finally{button.disabled=false;}
});
})();