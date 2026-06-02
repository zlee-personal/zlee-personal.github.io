(function () {
  var root = document.documentElement;
  var boringToggle = document.getElementById("boring-toggle");
  var modeHelp = document.querySelector(".mode-help");
  var modeTooltip = document.querySelector(".mode-tooltip");
  var heroGrid = document.querySelector(".hero-grid");
  var aboutWindow = document.querySelector(".about-window");
  var photoCard = document.querySelector(".photo-card");
  var navHeading = document.getElementById("nav-heading");
  var counter = document.getElementById("visitor-count");
  var lastModified = document.getElementById("last-modified");
  var fancyTitle = "Zachary Lee's Research Zone";
  var boringTitle = "Zachary Lee";
  var fancyTooltip = "If you do not appreciate some of this website's bolder stylistic choices, click this button to toggle to a more traditional format.";
  var boringTooltip = "Click here to toggle back to the fun website theme.";
  var heroBalanceFrame = 0;
  var heroResizeObserver = null;
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

  function canBalanceHero() {
    return Boolean(
      heroGrid &&
      aboutWindow &&
      photoCard &&
      window.matchMedia &&
      !window.matchMedia("(max-width: 860px)").matches
    );
  }

  function balanceHeroColumns() {
    var enabled = isBoringMode();

    if (!canBalanceHero()) {
      if (heroGrid) {
        heroGrid.style.removeProperty("--hero-photo-track");
        heroGrid.style.removeProperty("--hero-card-height");
      }
      return;
    }

    heroGrid.style.removeProperty("--hero-card-height");

    var gridWidth = heroGrid.clientWidth;
    var columnGap = parseFloat(window.getComputedStyle(heroGrid).columnGap) || 0;
    var minAboutWidth = enabled ? 470 : 430;
    var minPhotoWidth = enabled ? 230 : 235;
    var maxPhotoWidth = Math.min(
      enabled ? 365 : 420,
      gridWidth * (enabled ? 0.36 : 0.44),
      gridWidth - columnGap - minAboutWidth
    );

    if (gridWidth <= 0 || maxPhotoWidth < minPhotoWidth) {
      heroGrid.style.removeProperty("--hero-photo-track");
      heroGrid.style.removeProperty("--hero-card-height");
      return;
    }

    var bestWidth = minPhotoWidth;
    var bestScore = Infinity;
    var steps = 22;

    for (var index = 0; index <= steps; index += 1) {
      var candidate = minPhotoWidth + ((maxPhotoWidth - minPhotoWidth) * index / steps);
      heroGrid.style.setProperty("--hero-photo-track", Math.round(candidate) + "px");

      var aboutHeight = aboutWindow.getBoundingClientRect().height;
      var photoHeight = photoCard.getBoundingClientRect().height;
      var score = Math.abs(aboutHeight - photoHeight);

      if (score < bestScore) {
        bestScore = score;
        bestWidth = candidate;
      }
    }

    heroGrid.style.setProperty("--hero-photo-track", Math.round(bestWidth) + "px");

    var matchedHeight = Math.ceil(Math.max(
      aboutWindow.getBoundingClientRect().height,
      photoCard.getBoundingClientRect().height
    ));

    heroGrid.style.setProperty("--hero-card-height", matchedHeight + "px");
  }

  function scheduleHeroBalance() {
    if (!heroGrid) {
      return;
    }

    window.cancelAnimationFrame(heroBalanceFrame);
    heroBalanceFrame = window.requestAnimationFrame(balanceHeroColumns);
  }

  function syncModeToggle() {
    var enabled = isBoringMode();

    document.title = enabled ? boringTitle : fancyTitle;

    if (modeHelp) {
      modeHelp.setAttribute("aria-label", enabled ? boringTooltip : fancyTooltip);
    }

    if (modeTooltip) {
      modeTooltip.textContent = enabled ? boringTooltip : fancyTooltip;
    }

    if (navHeading) {
      navHeading.textContent = enabled ? "Navigation" : "Directory";
    }

    if (!boringToggle) {
      return;
    }

    boringToggle.setAttribute("aria-pressed", String(enabled));
    boringToggle.textContent = enabled ? "Fun Mode" : "Boring Mode";
    scheduleHeroBalance();
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

  if (heroGrid) {
    scheduleHeroBalance();
    window.addEventListener("resize", scheduleHeroBalance);
    window.addEventListener("load", scheduleHeroBalance);

    if (window.ResizeObserver) {
      heroResizeObserver = new ResizeObserver(scheduleHeroBalance);
      heroResizeObserver.observe(heroGrid);
    }

    var heroImage = heroGrid.querySelector("img");
    if (heroImage && !heroImage.complete) {
      heroImage.addEventListener("load", scheduleHeroBalance, { once: true });
    }
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
