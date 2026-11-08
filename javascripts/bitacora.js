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
      if (img.closest(".be-preview")) return; // en la vista previa del editor el doble clic lleva al texto
      img.addEventListener("click", function (e) {
        e.preventDefault();
        openLightbox(img);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Visor de piezas STL                                                 */
  /*   <div class="stl" data-src="../files/x/pieza.stl" data-nombre="pieza.stl" data-pie="…"></div> */
  /* ------------------------------------------------------------------ */
  var THREE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (window.__threeP) return window.__threeP;
    window.__threeP = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = THREE_SRC;
      s.onload = function () { resolve(window.THREE); };
      s.onerror = function () { window.__threeP = null; reject(new Error("No pude cargar el visor 3D (sin conexión)")); };
      document.head.appendChild(s);
    });
    return window.__threeP;
  }

  /* STL binario o ASCII → posiciones (Float32Array) */
  function parseSTL(buffer) {
    var bytes = new Uint8Array(buffer);
    var head = "";
    for (var h = 0; h < Math.min(80, bytes.length); h++) head += String.fromCharCode(bytes[h]);
    var dv = new DataView(buffer);
    var binary = buffer.byteLength >= 84;
    if (binary) {
      var n = dv.getUint32(80, true);
      if (buffer.byteLength !== 84 + n * 50) binary = /^\s*solid/i.test(head) ? false : binary;
    }
    var pos;
    if (binary && buffer.byteLength >= 84) {
      var count = dv.getUint32(80, true);
      if (84 + count * 50 > buffer.byteLength) count = Math.floor((buffer.byteLength - 84) / 50);
      pos = new Float32Array(count * 9);
      var off = 84, k = 0;
      for (var i = 0; i < count; i++) {
        off += 12; // normal
        for (var v = 0; v < 9; v++) { pos[k++] = dv.getFloat32(off, true); off += 4; }
        off += 2;
      }
      return pos;
    }
    var text = new TextDecoder().decode(bytes);
    var out = [];
    var re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g, m;
    while ((m = re.exec(text))) out.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    return new Float32Array(out);
  }

  function fmtMm(n) { return (Math.round(n * 10) / 10).toString().replace(".", ","); }

  function setupStl(box) {
    box.dataset.ready = "1";
    var src = box.dataset.src, nombre = box.dataset.nombre || src.replace(/^.*\//, ""), pie = box.dataset.pie || "";
    box.innerHTML =
      '<div class="stl-lienzo"><div class="stl-estado">Pieza 3D · se carga al verla</div></div>' +
      '<div class="stl-barra">' +
      '<span class="stl-nombre"></span><span class="stl-dims"></span>' +
      '<span class="stl-botones"><button type="button" data-a="ajustar" title="Centrar y ajustar">⌂</button>' +
      '<button type="button" data-a="alambre" title="Ver en alambre">⌗</button>' +
      '<button type="button" data-a="girar" title="Girar solo">↻</button>' +
      '<a class="stl-descarga" download>Descargar STL</a></span>' +
      "</div>" + (pie ? '<figcaption class="stl-pie"></figcaption>' : "");
    box.querySelector(".stl-nombre").textContent = nombre;
    box.querySelector(".stl-descarga").href = candidatos(src)[0];
    if (pie) box.querySelector(".stl-pie").textContent = pie;
    var lienzo = box.querySelector(".stl-lienzo"), estado = box.querySelector(".stl-estado");
    var started = false;

    // Las páginas se publican como carpetas (/seccion/pagina/), así que una ruta
    // escrita como en Markdown (../files/x.stl) necesita un nivel más. Se prueban las dos.
    function candidatos(ruta) {
      if (/^(https?:|\/|blob:|data:)/.test(ruta)) return [ruta];
      var a, b;
      try { a = new URL(ruta, location.href).href; b = new URL("../" + ruta, location.href).href; } catch (e) { return [ruta]; }
      return a === b ? [a] : [b, a];
    }
    function bajar(lista) {
      return fetch(lista[0]).then(function (r) {
        if (r.ok) { box.querySelector(".stl-descarga").href = lista[0]; return r.arrayBuffer(); }
        if (lista.length > 1) return bajar(lista.slice(1));
        throw new Error("No encontré " + nombre + " (" + r.status + ")");
      });
    }
    function start() {
      if (started) return; started = true;
      estado.textContent = "Cargando pieza…";
      Promise.all([loadThree(), bajar(candidatos(src))])
        .then(function (r) { try { build(r[0], r[1]); } catch (e) { estado.textContent = "No pude mostrar la pieza: " + e.message; estado.classList.add("error"); } })
        .catch(function (e) { estado.textContent = e.message; estado.classList.add("error"); started = false; });
    }

    function build(THREE, buffer) {
      var pos = parseSTL(buffer);
      if (!pos.length) { estado.textContent = "El archivo no parece un STL válido."; return; }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      var bb = geo.boundingBox, size = new THREE.Vector3(); bb.getSize(size);
      var center = new THREE.Vector3(); bb.getCenter(center);
      geo.translate(-center.x, -center.y, -bb.min.z);
      box.querySelector(".stl-dims").textContent = fmtMm(size.x) + " × " + fmtMm(size.y) + " × " + fmtMm(size.z) + " mm · " + ((pos.length / 9) | 0) + " caras";

      var scene = new THREE.Scene();
      scene.background = new THREE.Color(0xffffff);
      var mat = new THREE.MeshPhongMaterial({ color: 0xdedede, specular: 0x333333, shininess: 18, flatShading: true, side: THREE.DoubleSide });
      var mesh = new THREE.Mesh(geo, mat);
      var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), new THREE.LineBasicMaterial({ color: 0x000000 }));
      var grupo = new THREE.Group(); grupo.add(mesh); grupo.add(edges);
      // Z arriba (como en CAD): rotamos el grupo para que Z del STL sea Y de la escena
      grupo.rotation.x = -Math.PI / 2;
      scene.add(grupo);
      var maxDim = Math.max(size.x, size.y, size.z) || 1;
      var grid = new THREE.GridHelper(maxDim * 2.2, 11, 0x000000, 0xd9d9d9);
      grid.position.y = -0.01;
      scene.add(grid);
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      var luz = new THREE.DirectionalLight(0xffffff, 0.8); luz.position.set(1, 2, 1.5); scene.add(luz);
      var luz2 = new THREE.DirectionalLight(0xffffff, 0.35); luz2.position.set(-1.5, 0.8, -1); scene.add(luz2);

      var w = lienzo.clientWidth || 600, hgt = lienzo.clientHeight || 450;
      var camera = new THREE.PerspectiveCamera(40, w / hgt, maxDim / 100, maxDim * 50);
      var renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      } catch (e) {
        estado.textContent = "Este navegador no permite gráficos 3D (WebGL). Podés descargar el STL con el botón de abajo.";
        estado.classList.add("error");
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, hgt);
      lienzo.innerHTML = "";
      lienzo.appendChild(renderer.domElement);

      var orbita = { theta: Math.PI / 4, phi: Math.PI / 3.2, dist: maxDim * 2.6, target: new THREE.Vector3(0, size.z / 2, 0) };
      function colocar() {
        camera.position.set(
          orbita.target.x + orbita.dist * Math.sin(orbita.phi) * Math.sin(orbita.theta),
          orbita.target.y + orbita.dist * Math.cos(orbita.phi),
          orbita.target.z + orbita.dist * Math.sin(orbita.phi) * Math.cos(orbita.theta));
        camera.lookAt(orbita.target);
        renderer.render(scene, camera);
      }
      function ajustar() { orbita.theta = Math.PI / 4; orbita.phi = Math.PI / 3.2; orbita.dist = maxDim * 2.6; colocar(); }
      ajustar();

      /* órbita con mouse y táctil */
      var dragging = false, lx = 0, ly = 0, pinch = 0;
      var el = renderer.domElement;
      el.style.touchAction = "none";
      el.addEventListener("pointerdown", function (e) { dragging = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); });
      el.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        orbita.theta -= (e.clientX - lx) * 0.01; orbita.phi -= (e.clientY - ly) * 0.01;
        orbita.phi = Math.max(0.05, Math.min(Math.PI - 0.05, orbita.phi));
        lx = e.clientX; ly = e.clientY; colocar();
      });
      el.addEventListener("pointerup", function () { dragging = false; });
      el.addEventListener("pointercancel", function () { dragging = false; });
      el.addEventListener("wheel", function (e) { e.preventDefault(); orbita.dist *= e.deltaY > 0 ? 1.1 : 0.9; orbita.dist = Math.max(maxDim * 0.5, Math.min(maxDim * 20, orbita.dist)); colocar(); }, { passive: false });
      el.addEventListener("touchstart", function (e) { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
      el.addEventListener("touchmove", function (e) {
        if (e.touches.length === 2 && pinch) { var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); orbita.dist *= pinch / d; pinch = d; colocar(); }
      }, { passive: true });

      var girando = false;
      function loop() { if (!girando) return; orbita.theta += 0.01; colocar(); requestAnimationFrame(loop); }
      box.querySelector('[data-a="ajustar"]').addEventListener("click", ajustar);
      box.querySelector('[data-a="alambre"]').addEventListener("click", function () { mat.wireframe = !mat.wireframe; this.setAttribute("aria-pressed", mat.wireframe ? "true" : "false"); colocar(); });
      box.querySelector('[data-a="girar"]').addEventListener("click", function () { girando = !girando; this.setAttribute("aria-pressed", girando ? "true" : "false"); if (girando) loop(); });

      function resize() {
        var nw = lienzo.clientWidth, nh = lienzo.clientHeight;
        if (!nw || !nh) return;
        camera.aspect = nw / nh; camera.updateProjectionMatrix();
        renderer.setSize(nw, nh); colocar();
      }
      if (window.ResizeObserver) new ResizeObserver(resize).observe(lienzo); else window.addEventListener("resize", resize);
    }

    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "200px" });
      io.observe(box);
    } else {
      start();
    }
    lienzo.addEventListener("click", start);
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
    root.querySelectorAll(".stl:not([data-ready])").forEach(setupStl);
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
