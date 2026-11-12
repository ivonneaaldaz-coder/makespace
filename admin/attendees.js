/* MAKE SPACE Studio Manager: optional Square linking and attendee reporting. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const safe = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const controls=$("checkout")?.closest(".group");
  if(!controls)return;
  controls.insertAdjacentHTML("beforeend",'<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn secondary small" id="verify-square">Verify with Square ↗</button><span id="square-verify-status" style="color:#806c71;font-size:11px">Link verification required for automated attendee tracking</span></div>');
  $("duplicate").insertAdjacentHTML("beforebegin",'<button type="button" class="btn secondary small" id="attendees-button">Attendees</button>');
  $("editor-view").insertAdjacentHTML("beforeend",'<section id="attendees-panel" class="surface" hidden style="padding:24px;margin:20px 0;min-width:0"></section>');
  let trackingUrl="";
  controls.insertAdjacentHTML("beforeend", '<div id="square-catalog-picker" hidden style="margin-top:12px"><label for="square-ticket" style="font-size:11px;font-weight:700;display:block;margin-bottom:6px">MATCH SQUARE CATALOG TICKET</label><select id="square-ticket" style="width:100%;padding:12px;background:#fff;border:1px solid #decfc8;border-radius:9px"><option value="">Choose the exact ticket used by this payment link</option></select><p style="font-size:11px;color:#806c71">Dashboard payment links cannot be inspected through Square’s API. Select the item used in that link and double-check its name and price.</p></div>');
  const getEvent=()=>typeof editing==="string"?events.find(e=>e.id===editing):null;
  const reset=()=>{
    const e=getEvent();
    trackingUrl=e?.checkout||"";
    window.makeSpaceSquareVariation=e?.squareVariationId||"";
    $("square-verify-status").textContent=window.makeSpaceSquareVariation?"Square ticket mapping saved":"Not verified for automatic attendee tracking";
    $("square-catalog-picker").hidden=true;
    $("attendees-panel").hidden=true;
    $("attendees-button").hidden=!e;
  };
  for(const id of ["rows","calgrid","add","cal-add"]){
    const el=$(id);
    el?.addEventListener("click",()=>setTimeout(reset,0));
  }
  document.querySelectorAll('.side-link').forEach(b=>b.addEventListener("click",()=>setTimeout(reset,0)));
  $("checkout").addEventListener("input",()=>{
    window.makeSpaceSquareVariation="";
    $("square-catalog-picker").hidden=true;
    $("square-verify-status").textContent="Changed link: verify again before saving";
  });
  $("verify-square").addEventListener("click",async()=>{
    if(!window.makeSpaceCloud?.connected)return;
    const url=$("checkout").value.trim();
    if(!url){$("square-verify-status").textContent="Paste a Square link first";return;}
    const btn=$("verify-square");btn.disabled=true;btn.textContent="Checking…";
    try{
      const match=await window.makeSpaceCloud.request("action","square:inspectLink",{url});
      trackingUrl=url;
      if(match.mode==="catalog"){
        window.makeSpaceSquareVariation="";
        const options=(match.tickets||[]).filter(t=>t.currency==="USD");
        $("square-ticket").innerHTML='<option value="">Choose the exact ticket used by this payment link</option>'+
          options.map(t=>'<option value="'+safe(t.variationId)+'">'+safe(t.name)+
            (t.priceCents===null?"":" · $"+(t.priceCents/100).toFixed(2))+'</option>').join("");
        $("square-catalog-picker").hidden=false;
        $("square-verify-status").textContent=options.length?
          "Dashboard link detected. Select its ticket from the catalog below.":
          "No catalog tickets were found. Check the Square account and catalog permissions.";
      }else{
        $("square-catalog-picker").hidden=true;
        window.makeSpaceSquareVariation=match.variationId;
        $("square-verify-status").textContent="Square API link matched: "+match.itemName+". Save to Cloud.";
      }
    }catch(err){
      window.makeSpaceSquareVariation="";
      $("square-verify-status").textContent=String(err.message||err).slice(0,150);
    }finally{btn.disabled=false;btn.textContent="Verify with Square ↗";}
  });
  $("square-ticket").addEventListener("change",()=>{
    const variationId=$("square-ticket").value;
    window.makeSpaceSquareVariation=variationId;
    $("square-verify-status").textContent=variationId?
      "Catalog ticket selected. Confirm this is the ticket and price on your Square Dashboard link, then Save to Cloud.":
      "Choose a catalog ticket to link attendance tracking.";
  });

  function downloadGuestCsv(e,d){
    const cell=value=>{
      let t=String(value??"").replace(/\r|\n/g," ");
      if(/^\s*[=+@-]/.test(t))t="'"+t;
      return '"'+t.replace(/"/g,'""')+'"';
    };
    const lines=[["Buyer","Email","Seats","Payment status","Confirmation","Paid USD","Date","Square payment ID"].map(cell).join(",")];
    for(const r of d.rows)lines.push([r.buyerName,r.buyerEmail,r.quantity,r.status,r.confirmationStatus,
      (r.amountCents/100).toFixed(2),new Date(r.createdAt).toISOString(),r.squarePaymentId].map(cell).join(","));
    const file=new Blob(["\uFEFF"+lines.join("\r\n")+"\r\n"],{type:"text/csv;charset=utf-8"});
    const link=document.createElement("a"),url=URL.createObjectURL(file);
    link.href=url;
    link.download="make-space-"+String(e.slug||e.title||"event").replace(/[^a-z0-9-]/gi,"-").slice(0,50)+"-guest-list.csv";
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  let latestGuestReport=null;
  let guestView="attendees";
  function renderBookingManager(event,report){
    const panel=$("attendees-panel");
    const bookings=report.bookings;
    const paid=bookings.filter(b=>b.status==="paid");
    const gross=paid.reduce((total,b)=>total+b.amountCents,0);
    const header='<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:14px">'+
      '<h3 style="font:400 34px Italiana,Georgia,serif;margin:0">Guest list</h3>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn secondary small" id="guest-view-attendees" aria-pressed="'+(guestView==="attendees")+'">Attendees</button>'+
      '<button type="button" class="btn secondary small" id="guest-view-bookings" aria-pressed="'+(guestView==="bookings")+'">Bookings</button>'+
      '<button type="button" class="btn secondary small" id="download-guest-csv">Export CSV ↓</button></div></div>'+
      '<p style="font-size:12px;margin-bottom:22px">'+report.paidSeats+' paid seats · '+report.identified+' named · '+report.checkedIn+
      ' checked in · $'+(gross/100).toFixed(2)+' gross</p>';
    const bookingsHtml=bookings.length?'<div style="overflow-x:auto"><table style="width:100%;text-align:left;font-size:12px;border-collapse:collapse"><thead>'+
      '<tr><th style="padding:10px">Purchaser</th><th style="padding:10px">Email</th><th style="padding:10px">Tickets</th><th style="padding:10px">Paid</th><th style="padding:10px">Payment</th></tr></thead><tbody>'+
      bookings.map(b=>'<tr><td style="padding:10px">'+safe(b.buyerName||"Name not provided")+'</td>'+
      '<td style="padding:10px">'+safe(b.buyerEmail||"Email unavailable")+'</td><td style="padding:10px">'+b.quantity+'</td>'+
      '<td style="padding:10px">$'+(b.amountCents/100).toFixed(2)+'</td><td style="padding:10px">'+safe(b.status)+(b.status==="paid"?'<button type="button" class="btn secondary small ms-guest-link" data-booking="'+safe(b.registrationId)+'">Copy guest link</button><button type="button" class="btn secondary small ms-revoke-link" data-booking="'+safe(b.registrationId)+'">Revoke</button>':'')+'</td></tr>').join("")+
      '</tbody></table></div>':'<p>No bookings recorded for this event.</p>';
    const attendeesHtml=paid.length?paid.map((b,index)=>
      '<section style="padding:19px 0;border-bottom:1px solid #dfcbc5"><div style="margin-bottom:12px;font-size:12px">'+
      '<strong>Booking '+(index+1)+'</strong> · '+b.quantity+' seat'+(b.quantity===1?"":"s")+
      ' · Purchaser: '+safe(b.buyerName||b.buyerEmail||"Not provided")+'</div>'+
      b.seats.map(seat=>{
        const rid=safe(b.registrationId),number=seat.seatNumber;
        return '<div class="ms-guest-row" data-registration="'+rid+'" data-seat="'+number+'" '+
          'style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end;margin:13px 0">'+
          '<label style="font-size:11px;display:grid;gap:6px;min-width:0">Guest '+number+
          '<input type="text" class="ms-guest-name" maxlength="100" autocomplete="off" placeholder="Name not provided" value="'+safe(seat.name)+
          '" style="min-width:0;width:100%;padding:11px;border:1px solid #d7c7c1;background:#fffaf5;color:#501923"></label>'+
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+
          '<button type="button" class="btn secondary small ms-save-guest">Save name</button>'+
          '<label style="display:flex;align-items:center;gap:7px;font-size:11px;white-space:nowrap">'+
          '<input type="checkbox" class="ms-checkin" '+(seat.checkedInAt?'checked ':'')+'style="accent-color:#501923"> Checked in</label></div></div>';
      }).join("")+'</section>').join(""):'<p>No paid attendees recorded for this event.</p>';
    panel.innerHTML=header+(guestView==="bookings"?bookingsHtml:attendeesHtml)+
      '<p style="font-size:11px;color:#806269;margin-top:18px">Names and check-ins are managed here. Square remains the payment source of truth. Blank names mean guest details have not been collected.</p>';
    $("guest-view-attendees").addEventListener("click",()=>{guestView="attendees";renderBookingManager(event,report)});
    $("guest-view-bookings").addEventListener("click",()=>{guestView="bookings";renderBookingManager(event,report)});
    $("download-guest-csv").addEventListener("click",()=>downloadAllSeats(event,report));
    panel.querySelectorAll(".ms-guest-row").forEach(row=>{
      const rid=row.dataset.registration,seatNumber=Number(row.dataset.seat);
      row.querySelector(".ms-save-guest").addEventListener("click",async()=>{
        const button=row.querySelector(".ms-save-guest");
        button.disabled=true;button.textContent="Saving…";
        try{
          await window.makeSpaceCloud.request("mutation","guests:saveGuest",{
            registrationId:rid,seatNumber,name:row.querySelector(".ms-guest-name").value
          });
          const refreshed=await window.makeSpaceCloud.request("query","guests:listForEvent",{eventId:event.id});
          latestGuestReport=refreshed;renderBookingManager(event,refreshed);
        }catch(err){button.textContent=String(err.message||err).slice(0,100);button.disabled=false;}
      });
      row.querySelector(".ms-checkin").addEventListener("change",async change=>{
        const checkbox=change.currentTarget;
        checkbox.disabled=true;
        try{
          await window.makeSpaceCloud.request("mutation","guests:setCheckIn",{
            registrationId:rid,seatNumber,checkedIn:checkbox.checked
          });
          const refreshed=await window.makeSpaceCloud.request("query","guests:listForEvent",{eventId:event.id});
          latestGuestReport=refreshed;renderBookingManager(event,refreshed);
        }catch(err){checkbox.checked=!checkbox.checked;checkbox.disabled=false;window.alert("Check-in not saved: "+String(err.message||err).slice(0,160))}
      });
    });
  }
  function downloadAllSeats(e,report){
    const encode=value=>{
      let t=String(value??"").replace(/\\r|\\n/g," ");
      if(/^\\s*[=+@-]/.test(t))t="'"+t;
      return '"'+t.replace(/"/g,'""')+'"';
    };
    const cols=["Attendee name","Seat number","Checked in","Purchaser","Purchaser email","Booking seats","Payment status","Payment reference"];
    const rows=[cols.map(encode).join(",")];
    for(const booking of report.bookings){
      for(const seat of booking.seats){
        rows.push([seat.name,seat.seatNumber,seat.checkedInAt?"Yes":"No",
          booking.buyerName,booking.buyerEmail,booking.quantity,booking.status,booking.squarePaymentId].map(encode).join(","));
      }
    }
    const blob=new Blob(["\\uFEFF"+rows.join("\\r\\n")+"\\r\\n"],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob),anchor=document.createElement("a");
    anchor.href=url;anchor.download="make-space-"+String(e.slug||"event").replace(/[^a-z0-9-]/gi,"-")+"-attendees.csv";
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $("attendees-button").addEventListener("click",async()=>{
    const e=getEvent();if(!e||!window.makeSpaceCloud?.connected)return;
    const panel=$("attendees-panel");panel.hidden=false;
    panel.textContent="Loading bookings and attendee seats…";
    guestView="attendees";
    try{
      const report=await window.makeSpaceCloud.request("query","guests:listForEvent",{eventId:e.id});
      latestGuestReport=report;
      renderBookingManager(e,report);
    }catch(err){panel.textContent="Could not load guest list: "+String(err.message||err).slice(0,200)}
  });
  reset();
})();