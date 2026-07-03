/* Register the service worker for offline capability. Non-critical: failures are ignored. */
if("serviceWorker" in navigator){
  window.addEventListener("load", function(){
    navigator.serviceWorker.register("/sw.js").catch(function(){});
  });
}
