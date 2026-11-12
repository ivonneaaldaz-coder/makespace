/* MAKE SPACE Studio Manager: optional Square linking and attendee reporting. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const safe = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const controls=$("checkout")?.closest(".group");
  if(!controls)return;
  controls.insertAdjacentHTML("beforeend",'<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn secondary small" id="verify-square">Link ticket</button><span id="square-verify-status" style="color:#806c71;font-size:11px">Link a ticket to track bookings automatically</span></div>');
  $("editor-view").insertAdjacentHTML("beforeend",'<button type="button" id="attendees-button" hidden style="display:none" tabindex="-1">Load attendees</button>');
  $("editor-view").insertAdjacentHTML("beforeend",'<section id="attendees-panel" class="surface" hidden style="padding:24px;margin:20px 0;min-width:0"></section>');
  controls.insertAdjacentHTML("beforeend", '<div id="square-catalog-picker" hidden style="margin-top:12px"><label for="square-ticket" style="font-size:11px;font-weight:700;display:block;margin-bottom:6px">SELECT THE TICKET</label><select id="square-ticket" style="width:100%;padding:12px;background:#fff;border:1px solid #decfc8;border-radius:9px"><option value="">Select the ticket for this event</option></select><p style="font-size:11px;color:#806c71">Choose the matching Square ticket and price.</p></div>');
  let savedVariation="",savedCheckout="",requestNumber=0;
  const picker=$("square-catalog-picker");
  picker.insertAdjacentHTML("beforeend",'<button type="button" class="btn secondary small" id="square-ticket-cancel" style="margin-top:10px">Cancel</button>');
  const status=$("square-verify-status"),button=$("verify-square");
  const getEvent=()=>typeof editing==="string"?events.find(e=>e.id===editing):null;
  const describe=async(variationId,number)=>{
    try{
      const ticket=await window.makeSpaceCloud.request("action","square:describeTicket",{variationId});
      if(number!==requestNumber||getEvent()?.squareVariationId!==variationId)return;
      status.textContent=ticket
        ?"Linked to: "+ticket.name+(ticket.priceCents===null?"":" · $"+(ticket.priceCents/100).toFixed(2))
        :"Ticket linked · details unavailable in Square";
    }catch{
      if(number===requestNumber)status.textContent="Ticket linked · details unavailable";
    }
  };
  function reset(){
    requestNumber++;
    const event=getEvent();
    savedCheckout=event?.checkout||"";
    savedVariation=event?.squareVariationId||"";
    window.makeSpaceSquareVariation=savedVariation;
    picker.hidden=true;
    button.textContent=savedVariation?"Change ticket":"Link ticket";
    status.textContent=savedVariation?"Loading linked ticket…":"No ticket linked";
    if(savedVariation&&window.makeSpaceCloud?.connected)void describe(savedVariation,requestNumber);
    if(document.querySelector('#ms-tab-attendees[aria-selected="true"]')===null)$("attendees-panel").hidden=true;
    $("attendees-button").hidden=true;
  }
  for(const id of ["rows","calgrid","add","cal-add"]){
    $(id)?.addEventListener("click",()=>setTimeout(reset,0));
  }
  document.querySelectorAll(".side-link").forEach(item=>item.addEventListener("click",()=>setTimeout(reset,0)));
  $("checkout").addEventListener("input",()=>{
    requestNumber++;
    window.makeSpaceSquareVariation="";
    picker.hidden=true;
    button.textContent="Link ticket";
    status.textContent="Payment link changed · link the ticket again";
  });
  function cancelChange(){
    requestNumber++;
    $("checkout").value=savedCheckout;
    window.makeSpaceSquareVariation=savedVariation;
    picker.hidden=true;
    button.textContent=savedVariation?"Change ticket":"Link ticket";
    status.textContent=savedVariation?"Loading linked ticket…":"No ticket linked";
    if(savedVariation&&window.makeSpaceCloud?.connected)void describe(savedVariation,requestNumber);
  }
  $("square-ticket-cancel").addEventListener("click",cancelChange);
  button.addEventListener("click",async()=>{
    if(!window.makeSpaceCloud?.connected)return;
    const url=$("checkout").value.trim();
    if(!url){status.textContent="Add your Square payment link first";return;}
    const thisRequest=++requestNumber;
    button.disabled=true;button.textContent="Loading tickets…";
    try{
      const result=await window.makeSpaceCloud.request("action","square:inspectLink",{url});
      if(thisRequest!==requestNumber)return;
      if(result.mode==="catalog"){
        const options=(result.tickets||[]).filter(ticket=>ticket.currency==="USD");
        $("square-ticket").innerHTML='<option value="">Select the ticket for this event</option>'+
          options.map(ticket=>'<option value="'+safe(ticket.variationId)+'">'+safe(ticket.name)+
            (ticket.priceCents===null?"":" · $"+(ticket.priceCents/100).toFixed(2))+'</option>').join("");
        const current=window.makeSpaceSquareVariation;
        $("square-ticket").value=options.some(ticket=>ticket.variationId===current)?current:"";
        picker.hidden=false;
        status.textContent=options.length?"Select a ticket, then save. Or cancel to keep the existing one.":"No Square tickets found.";
      }else{
        window.makeSpaceSquareVariation=result.variationId;
        picker.hidden=false;
        $("square-ticket").innerHTML='<option value="'+safe(result.variationId)+'">'+safe(result.itemName)+'</option>';
        $("square-ticket").value=result.variationId;
        status.textContent="Ticket selected · click Save to finish";
      }
    }catch(err){
      if(thisRequest===requestNumber)status.textContent=String(err.message||err).slice(0,150);
    }finally{
      button.disabled=false;
      button.textContent=window.makeSpaceSquareVariation?"Change ticket":"Link ticket";
    }
  });
  $("square-ticket").addEventListener("change",()=>{
    const value=$("square-ticket").value;
    window.makeSpaceSquareVariation=value;
    status.textContent=value?"Ticket selected · click Save to finish":"Select a ticket, or Cancel.";
    button.textContent=value?"Change ticket":"Link ticket";
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


  function csvDownload(event,report){
    const cell=value=>{
      let t=String(value??"").replace(/\r|\n/g," ");
      if(/^\s*[=+@-]/.test(t))t="'"+t;
      return '"'+t.replace(/"/g,'""')+'"';
    };
    const rows=[["Purchaser / booking contact","Email","Tickets purchased","Checked in","Paid USD","Payment status","Square payment ID"].map(cell).join(",")];
    for(const b of report.bookings){
      const count=b.seats.filter(seat=>seat.checkedInAt).length;
      rows.push([b.buyerName||"Not provided",b.buyerEmail,b.quantity,count,(b.amountCents/100).toFixed(2),b.status,b.squarePaymentId].map(cell).join(","));
    }
    const blob=new Blob(["\uFEFF"+rows.join("\r\n")+"\r\n"],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="make-space-"+String(event.slug||"event").replace(/[^a-z0-9-]/gi,"-")+"-guest-list.csv";
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function loadAttendees(event){
    const query=(path)=>window.makeSpaceCloud.request("query",path,{eventId:event.id});
    const deadline=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error("Timed out")),ms))]);
    try{
      return await deadline(query("guests:listForEvent"),7000);
    }catch(err){
      const original=await deadline(query("square:listAttendees"),10000);
      return {eventTitle:original.eventTitle,capacity:original.capacity,paidSeats:original.seatsSold,isFallback:true,
        bookings:original.rows.map(r=>({
          registrationId:r._id,buyerName:r.buyerName,buyerEmail:r.buyerEmail,quantity:r.quantity,
          amountCents:r.amountCents,status:r.status,squarePaymentId:r.squarePaymentId,
          seats:Array.from({length:r.quantity},(_,i)=>({seatNumber:i+1,name:"",checkedInAt:null}))
        }))};
    }
  }
  function renderBookingManager(event,report){
    const panel=$("attendees-panel");
    const active=report.bookings.filter(b=>b.status==="paid");
    const total=active.reduce((sum,b)=>sum+b.quantity,0);
    const attended=active.reduce((sum,b)=>sum+b.seats.filter(seat=>seat.checkedInAt).length,0);
    const revenue=active.reduce((sum,b)=>sum+b.amountCents,0);
    const header='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">'+
      '<h3 style="font:400 34px Italiana,Georgia,serif;margin:0">Guest list</h3>'+
      '<button type="button" class="btn secondary small" id="download-guest-csv">Export CSV ↓</button></div>'+
      '<p style="font-size:12px;margin:14px 0 24px">'+active.length+' booking'+(active.length===1?'':'s')+
      ' · '+total+' guest'+(total===1?'':'s')+' · '+attended+' attended · $'+(revenue/100).toFixed(2)+' gross</p>';
    const items=active.length?active.map(b=>{
      const present=b.seats.filter(seat=>seat.checkedInAt).length;
      const single=b.quantity===1;
      const controls=single?
        '<div class="ms-attended-toggle" aria-label="Attended?"><span style="font-size:11px;white-space:nowrap">Attended?</span>'+
        '<button type="button" class="btn secondary small ms-mark-yes" aria-pressed="'+(present===1)+'" '+(report.isFallback?'disabled':'')+'>Yes</button>'+
        '<button type="button" class="btn secondary small ms-mark-no" aria-pressed="'+(present===0)+'" '+(report.isFallback?'disabled':'')+'>No</button></div>':
        '<div class="ms-group-count"><span style="font-size:11px;white-space:nowrap">Checked in</span>'+
        '<button type="button" class="btn secondary small ms-check-minus" aria-label="Check out one guest" '+(present===0||report.isFallback?'disabled':'')+'>−</button>'+
        '<strong style="font-size:13px;white-space:nowrap">'+present+' of '+b.quantity+'</strong>'+
        '<button type="button" class="btn secondary small ms-check-plus" aria-label="Check in one guest" '+(present>=b.quantity||report.isFallback?'disabled':'')+'>+</button></div>';
      return '<div class="ms-booking-checkin" data-registration="'+safe(b.registrationId)+'">'+
        '<div><strong style="font-size:15px">'+safe(b.buyerName||b.buyerEmail||"Purchaser not named")+'</strong>'+
        '<p style="font-size:12px;color:#765d63;margin:6px 0;overflow-wrap:anywhere">'+safe(b.buyerEmail||"Email unavailable")+'</p>'+
        '<p style="font-size:12px;margin:6px 0">'+b.quantity+' guest'+(single?'':'s')+' on this booking</p></div>'+
        controls+'</div>';
    }).join(""):'<p>No paid bookings for this event yet.</p>';
    panel.innerHTML=header+(report.isFallback?'<p role="status" style="font-size:12px;color:#806269">Showing paid bookings. Check-in is temporarily unavailable.</p>':'')+items+
      '<p style="font-size:11px;color:#806269;margin-top:18px">Guests can check in under the purchaser’s name. Attendance never exceeds the number of tickets purchased.</p>';
    $("download-guest-csv").addEventListener("click",()=>csvDownload(event,report));
    panel.querySelectorAll(".ms-booking-checkin").forEach(row=>{
      const booking=active.find(b=>b.registrationId===row.dataset.registration);
      if(!booking||report.isFallback)return;
      async function changeAttendance(direction){
        const seat=direction==="plus"?booking.seats.find(seat=>!seat.checkedInAt):[...booking.seats].reverse().find(seat=>seat.checkedInAt);
        if(!seat)return;
        row.querySelectorAll("button").forEach(button=>button.disabled=true);
        try{
          await window.makeSpaceCloud.request("mutation","guests:setCheckIn",{
            registrationId:booking.registrationId,seatNumber:seat.seatNumber,checkedIn:direction==="plus"
          });
          const updated=await window.makeSpaceCloud.request("query","guests:listForEvent",{eventId:event.id});
          if(document.querySelector('#ms-tab-attendees[aria-selected="true"]'))renderBookingManager(event,updated);
        }catch(error){
          alert("Attendance could not be saved: "+String(error.message||error).slice(0,160));
          renderBookingManager(event,report);
        }
      }
      const single=booking.quantity===1;
      if(single){
        row.querySelector(".ms-mark-yes").addEventListener("click",()=>changeAttendance("plus"));
        row.querySelector(".ms-mark-no").addEventListener("click",()=>changeAttendance("minus"));
      }else{
        row.querySelector(".ms-check-plus").addEventListener("click",()=>changeAttendance("plus"));
        row.querySelector(".ms-check-minus").addEventListener("click",()=>changeAttendance("minus"));
      }
    });
  }
  $("attendees-button").addEventListener("click",async()=>{
    const e=getEvent();if(!e||!window.makeSpaceCloud?.connected)return;
    const panel=$("attendees-panel");panel.hidden=false;
    panel.textContent="Loading paid bookings…";
    try{
      // The previously verified Square query is the primary source for purchasers.
      const square=await window.makeSpaceCloud.request("query","square:listAttendees",{eventId:e.id});
      if(getEvent()?.id!==e.id)return;
      const report={eventTitle:square.eventTitle,capacity:square.capacity,
        paidSeats:square.seatsSold,isFallback:true,
        bookings:square.rows.map(r=>({
          registrationId:r._id,buyerName:r.buyerName,buyerEmail:r.buyerEmail,
          quantity:r.quantity,amountCents:r.amountCents,status:r.status,
          squarePaymentId:r.squarePaymentId,
          seats:Array.from({length:r.quantity},(_,i)=>({seatNumber:i+1,name:"",checkedInAt:null}))
        }))};
      renderBookingManager(e,report);
      // If the optional check-in query fails, retain the verified purchaser list.
      try{
        const complete=await Promise.race([
          window.makeSpaceCloud.request("query","guests:listForEvent",{eventId:e.id}),
          new Promise((_,reject)=>setTimeout(()=>reject(Error("Check-in timed out")),7000))
        ]);
        if(getEvent()?.id===e.id&&document.querySelector('#ms-tab-attendees[aria-selected="true"]'))renderBookingManager(e,complete);
      }catch{/* Purchaser list remains visible. */}
    }catch(err){
      panel.innerHTML='<p role="alert">Could not load paid bookings: '+safe(String(err.message||err).slice(0,200))+'</p><button type="button" class="btn secondary small" id="retry-attendees">Retry</button>';
      $("retry-attendees").onclick=()=>$("attendees-button").click();
    }
  });
  reset();
})();