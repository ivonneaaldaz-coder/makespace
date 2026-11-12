/* MAKE SPACE: native accessible dialog with branded presentation, no deletion without confirmation. */
(()=>{
"use strict";
const css=document.createElement("style");
css.id="ms-delete-dialog-style";
css.textContent=`
.ms-delete-dialog{border:1px solid #cdb7b3;background:#f7f0e9;color:#35272a;padding:0;width:min(460px,calc(100vw - 36px));max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 24px 80px #17070b4d}
.ms-delete-dialog::backdrop{background:#220c14aa;backdrop-filter:blur(3px)}
.ms-delete-dialog .ms-dialog-inner{padding:36px}
.ms-delete-dialog .ms-dialog-kicker{font:700 10px "DM Sans",sans-serif;letter-spacing:.15em;color:#8f5b67}
.ms-delete-dialog h2{font:400 clamp(38px,7vw,52px)/1.02 "Italiana",Georgia,serif;color:#501923;letter-spacing:-.02em;margin:13px 0 20px}
.ms-delete-dialog p{font:400 13px/1.65 "DM Sans",sans-serif;color:#65545a;margin:0 0 15px}
.ms-delete-dialog .ms-dialog-name{font-weight:700;color:#501923;overflow-wrap:anywhere}
.ms-delete-dialog .ms-dialog-note{border-left:2px solid #aa6e79;padding-left:13px}
.ms-delete-dialog .ms-dialog-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:10px;margin-top:30px}
.ms-delete-dialog button{font:700 10px "DM Sans",sans-serif;letter-spacing:.07em;text-transform:uppercase;border-radius:999px;padding:12px 20px;cursor:pointer}
.ms-delete-dialog .ms-dialog-cancel{background:transparent;color:#501923;border:1px solid #9e7880}
.ms-delete-dialog .ms-dialog-confirm{background:#501923;color:#fffaf5;border:1px solid #501923}
.ms-delete-dialog button:focus-visible{outline:3px solid #ae8793;outline-offset:3px}
@media(max-width:480px){.ms-delete-dialog .ms-dialog-inner{padding:26px}}
`;
document.head.appendChild(css);
const dialog=document.createElement("dialog");
dialog.className="ms-delete-dialog";
dialog.setAttribute("aria-labelledby","ms-delete-title");
dialog.setAttribute("aria-describedby","ms-delete-explanation");
dialog.innerHTML='<div class="ms-dialog-inner"><div class="ms-dialog-kicker">MAKE SPACE · STUDIO MANAGER</div>'+
'<h2 id="ms-delete-title">Delete this experience?</h2>'+
'<p class="ms-dialog-name" id="ms-delete-event-name"></p>'+
'<p id="ms-delete-explanation">This will permanently remove the experience from Studio Manager and the public calendar. This cannot be undone.</p>'+
'<p class="ms-dialog-note">Experiences with recorded bookings cannot be deleted, to protect payment and attendance history.</p>'+
'<div class="ms-dialog-actions"><button type="button" class="ms-dialog-cancel">Keep experience</button>'+
'<button type="button" class="ms-dialog-confirm">Delete experience</button></div></div>';
document.body.appendChild(dialog);
const name=dialog.querySelector("#ms-delete-event-name");
let resolver=null;
function settle(value){
  if(!resolver)return;
  const done=resolver;resolver=null;dialog.close();done(value);
}
dialog.querySelector(".ms-dialog-cancel").addEventListener("click",()=>settle(false));
dialog.querySelector(".ms-dialog-confirm").addEventListener("click",()=>settle(true));
dialog.addEventListener("cancel",event=>{if(resolver){event.preventDefault();settle(false)}});
dialog.addEventListener("click",event=>{if(event.target===dialog)settle(false)});
window.makeSpaceConfirmDelete=eventName=>{
  if(!dialog.showModal)return Promise.resolve(window.confirm('Delete "'+eventName+'"? This cannot be undone.'));
  if(resolver)return Promise.resolve(false);
  name.textContent=eventName;
  return new Promise(resolve=>{resolver=resolve;dialog.showModal();dialog.querySelector(".ms-dialog-cancel").focus()});
};
})();