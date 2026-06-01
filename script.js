(function () {
  var root = document.documentElement;
  var boringToggle = document.getElementById("boring-toggle");
  var counter = document.getElementById("visitor-count");
  var lastModified = document.getElementById("last-modified");
  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function padCount(value) {
    return String(value).padStart(6, "0");
  }

  function setCounter(value) {
    counter.textContent = padCount(value);
  }

  function isBoringMode() {
    return root.classList.contains("boring-mode");
  }

  function writeSiteMode(enabled) {
    try {
      localStorage.setItem("zachary-site-mode", enabled ? "boring" : "maximalist");
    } catch (error) {
      return;
    }
  }

  function syncModeToggle() {
    if (!boringToggle) {
      return;
    }

    var enabled = isBoringMode();
    boringToggle.setAttribute("aria-pressed", String(enabled));
    boringToggle.textContent = enabled ? "Restore Fancy Mode" : "Make Website Boring";
  }

  if (boringToggle) {
    syncModeToggle();
    boringToggle.addEventListener("click", function () {
      var enabled = !isBoringMode();
      root.classList.toggle("boring-mode", enabled);
      writeSiteMode(enabled);
      syncModeToggle();
    });
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

  if (!reduceMotion) {
    document.addEventListener("pointerdown", function (event) {
      if (event.button !== 0 || isBoringMode()) {
        return;
      }

      for (var index = 0; index < 8; index += 1) {
        var burst = document.createElement("span");
        var rotation = index * 45;
        var distance = 24 + (index % 3) * 8;

        burst.className = "click-burst";
        burst.style.left = event.clientX + "px";
        burst.style.top = event.clientY + "px";
        burst.style.setProperty("--burst-rotation", rotation + "deg");
        burst.style.setProperty("--burst-distance", distance + "px");

        if (index % 2 === 0) {
          burst.style.borderRadius = "50%";
        }

        document.body.appendChild(burst);

        window.setTimeout(function (node) {
          node.remove();
        }, 700, burst);
      }
    });
  }
})();
