(function () {
  var counter = document.getElementById("visitor-count");
  var lastModified = document.getElementById("last-modified");

  function padCount(value) {
    return String(value).padStart(6, "0");
  }

  function setCounter(value) {
    counter.textContent = padCount(value);
  }

  if (counter) {
    fetch("/api/visit", {
      method: "POST",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store",
      keepalive: true
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Visitor counter request failed");
        }

        return response.json();
      })
      .then(function (data) {
        if (typeof data.count !== "number") {
          throw new Error("Visitor counter response was missing count");
        }

        setCounter(data.count);
      })
      .catch(function () {
        counter.textContent = "------";
        counter.title = "Visitor count unavailable until the Cloudflare Worker is deployed.";
      });
  }

  if (lastModified && document.lastModified) {
    lastModified.textContent = document.lastModified;
  }
})();
