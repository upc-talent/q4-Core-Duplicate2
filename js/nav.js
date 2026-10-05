/* United Pharmacy — shared top navigation.
   One source of truth for all three pages. Each page has:
     <header class="snav" id="site-nav" data-active="home|act1|act2"></header>
     <script src="js/nav.js"></script>
   The logo (upc-white.png, in the site root) sits centred above the pills on every page.

   The Refresh pill doesn't know what a page shows; it fires a "upc:refresh"
   event on document and the page decides what to reload. A page calls
   UPCNav.done() when it has finished, which stops the spinner. */
(function () {
  "use strict";
  var host = document.getElementById("site-nav");
  if (!host) return;

  var active = host.getAttribute("data-active");
  var LINKS = [
    { id: "home", href: "index.html", label: "Home" },
    { id: "act1", href: "activity1-dashboard.html", label: "Activity 1 Dashboard" },
    { id: "act2", href: "activity2-dashboard.html", label: "Activity 2 Dashboard" }
  ];

  var pills = LINKS.map(function (l) {
    var on = l.id === active;
    return '<a class="snav-pill' + (on ? " active" : "") + '" href="' + l.href + '"' + (on ? ' aria-current="page"' : "") + ">" + l.label + "</a>";
  }).join("");

  host.innerHTML =
    '<a class="snav-logo" href="index.html" aria-label="United Pharmacy — home">' +
      '<img src="upc-white.png" alt="United Pharmacy" width="153" height="40">' +
    "</a>" +
    '<nav class="snav-pills" aria-label="Main">' + pills +
      '<button class="snav-pill snav-refresh" type="button" title="Refresh">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>' +
        "Refresh" +
      "</button>" +
    "</nav>";

  var btn = host.querySelector(".snav-refresh");
  var timer = null;
  function stop(delay) {
    clearTimeout(timer);
    timer = setTimeout(function () { btn.classList.remove("busy"); }, delay);
  }
  btn.addEventListener("click", function () {
    btn.classList.add("busy");
    stop(4000);   // safety net in case a page never calls done()
    document.dispatchEvent(new CustomEvent("upc:refresh"));
  });

  window.UPCNav = { done: function () { stop(500); } };
})();
