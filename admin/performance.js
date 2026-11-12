/* MAKE SPACE — admin-only financial overview.
 * Historical gross is price × tickets unless overridden; Square gross is
 * verified, non-refunded payments. Costs are entered manually.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const money=cents=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(cents/100);
let latest=[];
const dropdown=$("ms-performance-year");
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function render(){
 const year=dropdown.value;
 const shown=latest.filter(r=>(year==="all"||r.date.slice(0,4)===year)&&r.hasFinancialData);
 const sum=key=>shown.reduce((n,r)=>n+r[key],0);
 $("ms-perf-events").textContent=shown.length.toLocaleString();
 $("ms-perf-tickets").textContent=sum("tickets").toLocaleString();
 $("ms-perf-revenue").textContent=money(sum("revenueCents"));
 $("ms-perf-expenses").textContent=money(sum("expensesCents"));
 $("ms-perf-profit").textContent=money(sum("profitCents"));
 $("ms-performance-rows").innerHTML=shown.length?
  [...shown].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>
    '<tr><td>'+safe(r.title)+(r.historical?'<small style="display:block;color:#8c7379">Historical</small>':'<small style="display:block;color:#8c7379">Square</small>')+'</td>'+
    '<td>'+safe(r.date)+'</td><td>'+r.tickets.toLocaleString()+(r.historical&&r.attendees!==null?' / '+r.attendees.toLocaleString()+' attended':'')+'</td>'+
    '<td>'+money(r.revenueCents)+'</td><td>'+money(r.expensesCents)+'</td><td>'+money(r.profitCents)+'</td></tr>'
  ).join(""):'<tr><td colspan="6">No event financials recorded for this period yet.</td></tr>';
}
async function refresh(){
 if(!window.makeSpaceCloud?.connected)return;
 try{
  latest=await window.makeSpaceCloud.request("query","events:performance",{});
  const prior=dropdown.value;
  const years=[...new Set(latest.map(r=>r.date.slice(0,4)))].sort((a,b)=>b.localeCompare(a));
  dropdown.innerHTML='<option value="all">All years</option>'+years.map(y=>'<option value="'+safe(y)+'">'+safe(y)+'</option>').join("");
  dropdown.value=years.includes(prior)?prior:"all";
  render();
 }catch(err){
  $("ms-performance-rows").innerHTML='<tr><td colspan="6">Performance is temporarily unavailable. Refresh to try again.</td></tr>';
 }
}
dropdown.addEventListener("change",render);
window.makeSpaceRefreshPerformance=refresh;
window.makeSpaceEventPerformance=id=>latest.find(r=>r.id===id)||null;
const history=$("historical"),fields=$("ms-history-fields"),square=$("ms-square-link-group");
const number=id=>Math.max(0,Number($(id).value)||0);
function updateHistory(){
 const selected=history.checked;
 fields.hidden=!selected;
 square.hidden=selected;
 // Historical events are never public or featured.
 $("status").disabled=selected;
 $("featured").disabled=selected;
 if(selected){$("status").value="draft";$("featured").checked=false;}
 const calc=Math.round(number("ticketsSold")*number("price")*100);
 const custom=$("actualRevenue").value.trim();
 const gross=custom===""?calc:Math.round(number("actualRevenue")*100);
 const expenses=Math.round(number("expenses")*100);
 $("ms-history-gross").textContent=money(gross);
 $("ms-history-profit").textContent=money(gross-expenses);
}
history.addEventListener("change",updateHistory);
for(const id of ["ticketsSold","attendeesActual","expenses","actualRevenue","price"]){
 $(id).addEventListener("input",updateHistory);
}
window.makeSpaceHistoryFill=e=>{
 history.checked=!!e.historical;
 $("ticketsSold").value=e.ticketsSold??0;
 $("attendeesActual").value=e.attendeesActual??0;
 $("expenses").value=((e.expensesCents??0)/100).toFixed(2);
 $("actualRevenue").value=e.actualRevenueCents==null?"":(e.actualRevenueCents/100).toFixed(2);
 updateHistory();
};
updateHistory();
if(window.makeSpaceCloud?.connected)void refresh();
})();
