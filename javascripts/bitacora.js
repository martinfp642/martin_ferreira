/* =====================================================================
   Componentes de la bitácora: carrete, galería, comparar y visor.
   Convierte las imágenes escritas en Markdown dentro de
   <div class="carrete|galeria|comparar|hero-shot" markdown> en figuras
   con pie de foto (el texto alternativo), agrega flechas y contador al
   carrete y abre cualquier foto en grande al tocarla.
   ===================================================================== */
(function () {
  "use strict";

  function figurize(box) {
    Array.prototype.slice.call(box.children).forEach(function (child) {
      if (child.tagName === "FIGURE") return;
      var imgs = child.tagName === "IMG" ? [child] : Array.prototype.slice.call(child.querySelectorAll("img"));
      if (!imgs.length) return;
      // Varias imágenes en líneas seguidas quedan en un mismo párrafo:
      // una figura por imagen, en el mismo orden.
      imgs.forEach(function (img) {
        var fig = document.createElement("figure");
        box.insertBefore(fig, child);
        fig.appendChild(img);
        if (img.alt) {
          var cap = document.createElement("figcaption");
          cap.textContent = img.alt;
          fig.appendChild(cap);
        }
      });
      if (child.parentNode === box) box.removeChild(child);
    });
  }

  function setupCarrete(box) {
    box.dataset.ready = "1";
    figurize(box);
    var slides = box.querySelectorAll("figure");
    var wrap = document.createElement("div");
    wrap.className = "carrete-wrap";
    box.parentNode.insertBefore(wrap, box);
    wrap.appendChild(box);
    if (slides.length < 2) return;

    var nav = document.createElement("div");
    nav.className = "carrete-nav";
    var prev = document.createElement("button");
    prev.type = "button"; prev.textContent = "‹"; prev.setAttribute("aria-label", "Anterior");
    var next = document.createElement("button");
    next.type = "button"; next.textContent = "›"; next.setAttribute("aria-label", "Siguiente");
    var dots = document.createElement("div");
    dots.className = "carrete-puntos";
    var counter = document.createElement("span");
    counter.className = "carrete-contador";
    nav.appendChild(prev); nav.appendChild(next); nav.appendChild(dots); nav.appendChild(counter);
    wrap.appendChild(nav);

    var dotEls = [];
    slides.forEach(function (_, i) {
      var d = document.createElement("span");
      d.addEventListener("click", function () { go(i); });
      dots.appendChild(d); dotEls.push(d);
    });

    function current() {
      return Math.round(box.scrollLeft / box.clientWidth);
    }
    function go(i) {
      i = (i + slides.length) % slides.length;
      box.scrollTo({ left: i * box.clientWidth, behavior: "smooth" });
    }
    function update() {
      var i = current();
      counter.textContent = (i + 1) + " / " + slides.length;
      dotEls.forEach(function (d, k) { d.classList.toggle("activo", k === i); });
    }
    prev.addEventListener("click", function () { go(current() - 1); });
    next.addEventListener("click", function () { go(current() + 1); });
    box.addEventListener("scroll", function () { window.requestAnimationFrame(update); });
    update();
  }

  function setupGrid(box) {
    box.dataset.ready = "1";
    figurize(box);
  }

  /* --- visor --- */
  function openLightbox(img) {
    var lb = document.createElement("figure");
    lb.className = "lightbox";
    var big = document.createElement("img");
    big.src = img.currentSrc || img.src;
    big.alt = img.alt || "";
    lb.appendChild(big);
    if (img.alt) {
      var cap = document.createElement("figcaption");
      cap.textContent = img.alt;
      lb.appendChild(cap);
    }
    var close = document.createElement("button");
    close.type = "button"; close.className = "lightbox-cerrar"; close.textContent = "×";
    close.setAttribute("aria-label", "Cerrar");
    lb.appendChild(close);
    function remove() {
      if (lb.parentNode) lb.parentNode.removeChild(lb);
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") remove(); }
    lb.addEventListener("click", remove);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(lb);
  }

  function setupZoom(root) {
    root.querySelectorAll(".carrete img, .galeria img, .comparar img, .hero-shot img").forEach(function (img) {
      if (img.dataset.zoom) return;
      img.dataset.zoom = "1";
      img.addEventListener("click", function (e) {
        e.preventDefault();
        openLightbox(img);
      });
    });
  }

  /* Ficha de datos: "**Clave**: valor" → quita el ":" que queda suelto */
  function setupDatos(box) {
    box.dataset.ready = "1";
    box.querySelectorAll("li > strong").forEach(function (st) {
      var t = st.nextSibling;
      if (t && t.nodeType === 3) t.nodeValue = t.nodeValue.replace(/^\s*[:·-]\s*/, "");
    });
  }

  function init() {
    var root = document.querySelector(".md-typeset");
    if (!root) return;
    root.querySelectorAll(".datos:not([data-ready])").forEach(setupDatos);
    root.querySelectorAll(".carrete:not([data-ready])").forEach(setupCarrete);
    root.querySelectorAll(".galeria:not([data-ready]), .comparar:not([data-ready]), .hero-shot:not([data-ready])").forEach(setupGrid);
    setupZoom(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  // Con la carga instantánea del tema la página cambia sin recargar.
  if (!window.__bitacoraPoll) {
    window.__bitacoraPoll = setInterval(init, 500);
  }
})();
