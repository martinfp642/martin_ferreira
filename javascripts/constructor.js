/* =====================================================================
   Armar página: constructor por elementos (docs/editor.md, pestaña
   "Armar página"). Cada elemento tiene su formulario; el Markdown se
   genera solo, con los componentes de fotos del sitio. Usa los helpers
   que editor.js expone en window.Bitacora.
   ===================================================================== */
(function () {
  "use strict";

  var KEY_DRAFT = "bitacora.constructor";
  var AVISO_FILE = 10 * 1024 * 1024;   // la guía pide consultar a partir de acá
  var MAX_FILE = 50 * 1024 * 1024;     // GitHub rechaza archivos de más de 100 MB

  /* ------------------------------------------------------------------ */
  /* IndexedDB para guardar las fotos del borrador                       */
  /* ------------------------------------------------------------------ */
  function idb() {
    return new Promise(function (resolve, reject) {
      var r = indexedDB.open("bitacora", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("blobs"); };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }
  function idbPut(id, bytes, type) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction("blobs", "readwrite");
        tx.objectStore("blobs").put({ bytes: bytes, type: type }, id);
        tx.oncomplete = res; tx.onerror = function () { rej(tx.error); };
      });
    }).catch(function () { /* sin IndexedDB: el borrador no guarda fotos */ });
  }
  function idbGet(id) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction("blobs").objectStore("blobs").get(id);
        q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { rej(q.error); };
      });
    }).catch(function () { return null; });
  }
  function idbClear() {
    return idb().then(function (db) {
      return new Promise(function (res) { var tx = db.transaction("blobs", "readwrite"); tx.objectStore("blobs").clear(); tx.oncomplete = res; });
    }).catch(function () { /* nada */ });
  }

  /* ------------------------------------------------------------------ */
  /* Definición de elementos                                             */
  /* ------------------------------------------------------------------ */
  var TIPOS = {
    titulo:     { nombre: "Título",          data: function () { return { text: "", nivel: "h2" }; } },
    texto:      { nombre: "Texto",           data: function () { return { text: "" }; } },
    imagen:     { nombre: "Imagen",          data: function () { return { imgs: [], grande: false }; } },
    carrete:    { nombre: "Carrete",         data: function () { return { imgs: [] }; } },
    galeria:    { nombre: "Galería",         data: function () { return { imgs: [], cols: "tres" }; } },
    comparar:   { nombre: "Antes / después", data: function () { return { imgs: [], a: "Antes", b: "Después" }; } },
    hero:       { nombre: "Hero shot",       data: function () { return { imgs: [] }; } },
    datos:      { nombre: "Ficha de datos",  data: function () { return { rows: [{ k: "Máquina / técnica", v: "" }, { k: "Materiales", v: "" }, { k: "Software", v: "" }, { k: "Tiempo", v: "" }] }; } },
    parametros: { nombre: "Tabla",           data: function () { return { cols: ["Parámetro", "Valor", "Nota"], rows: [["", "", ""]] }; } },
    linea:      { nombre: "Línea de tiempo", data: function () { return { rows: [{ k: "Semana 1", v: "" }, { k: "Semana 2", v: "" }] }; } },
    resultado:  { nombre: "Resultado",       data: function () { return { ok: true, text: "" }; } },
    nota:       { nombre: "Nota",            data: function () { return { titulo: "Nota", text: "", tipo: "note" }; } },
    video:      { nombre: "Video",           data: function () { return { url: "" }; } },
    codigo:     { nombre: "Código",          data: function () { return { lang: "", text: "" }; } },
    archivos:   { nombre: "Archivos",        data: function () { return { files: [] }; } },
    pieza3d:    { nombre: "Pieza 3D",        data: function () { return { files: [], caption: "", descarga: true }; } }
  };

  var ICONOS = { titulo: "H", texto: "¶", imagen: "▣", carrete: "⧉", galeria: "▦", comparar: "◧", hero: "▬", datos: "☰", parametros: "⊞", linea: "⋮", resultado: "✓", nota: "!", video: "▶", codigo: "</>", archivos: "⇩", pieza3d: "⬡" };

  /* Esquemas dibujados de cada plantilla (líneas negras, como el sitio) */
  function wire(parts) {
    var y = 6, out = [];
    parts.forEach(function (pt) {
      switch (pt) {
        case "h": out.push('<rect x="6" y="' + y + '" width="46" height="8" fill="#000"/>'); y += 12; break;
        case "t": out.push('<rect x="6" y="' + y + '" width="88" height="2"/><rect x="6" y="' + (y + 4) + '" width="70" height="2"/>'); y += 10; break;
        case "s": out.push('<rect x="6" y="' + y + '" width="30" height="3" fill="#000"/><rect x="6" y="' + (y + 5) + '" width="88" height="1"/>'); y += 10; break;
        case "d": out.push('<rect x="6" y="' + y + '" width="88" height="14" fill="none" stroke="#000" stroke-width="1.5"/><line x1="50" y1="' + y + '" x2="50" y2="' + (y + 14) + '" stroke="#000"/><line x1="6" y1="' + (y + 7) + '" x2="94" y2="' + (y + 7) + '" stroke="#000"/>'); y += 18; break;
        case "c": out.push('<rect x="6" y="' + y + '" width="88" height="26" fill="none" stroke="#000" stroke-width="1.5"/><rect x="8" y="' + (y + 2) + '" width="84" height="18" fill="#000" opacity=".15"/><rect x="10" y="' + (y + 22) + '" width="3" height="2" fill="#000"/><rect x="15" y="' + (y + 22) + '" width="3" height="2" fill="none" stroke="#000" stroke-width=".8"/>'); y += 30; break;
        case "g": out.push('<rect x="6" y="' + y + '" width="27" height="16" fill="#000" opacity=".2"/><rect x="36" y="' + y + '" width="27" height="16" fill="#000" opacity=".2"/><rect x="66" y="' + y + '" width="28" height="16" fill="#000" opacity=".2"/><rect x="6" y="' + y + '" width="88" height="16" fill="none" stroke="#000" stroke-width="1.5"/>'); y += 20; break;
        case "cmp": out.push('<rect x="6" y="' + y + '" width="43" height="16" fill="#000" opacity=".2"/><rect x="51" y="' + y + '" width="43" height="16" fill="#000" opacity=".35"/><rect x="6" y="' + y + '" width="88" height="16" fill="none" stroke="#000" stroke-width="1.5"/><rect x="6" y="' + y + '" width="14" height="4" fill="#000"/><rect x="51" y="' + y + '" width="18" height="4" fill="#000"/>'); y += 20; break;
        case "hero": out.push('<rect x="6" y="' + y + '" width="88" height="22" fill="#000" opacity=".3"/><rect x="6" y="' + y + '" width="88" height="22" fill="none" stroke="#000" stroke-width="1.5"/>'); y += 26; break;
        case "ok": out.push('<rect x="6" y="' + y + '" width="12" height="5" fill="#000"/><rect x="21" y="' + (y + 1) + '" width="50" height="2"/><rect x="6" y="' + (y + 8) + '" width="12" height="5" fill="none" stroke="#000" stroke-width="1"/><rect x="21" y="' + (y + 9) + '" width="40" height="2"/>'); y += 17; break;
        case "l": out.push('<line x1="10" y1="' + y + '" x2="10" y2="' + (y + 16) + '" stroke="#000" stroke-width="1.5"/><rect x="8" y="' + (y + 1) + '" width="4" height="4" fill="#000"/><rect x="16" y="' + (y + 2) + '" width="50" height="2"/><rect x="8" y="' + (y + 9) + '" width="4" height="4" fill="#000"/><rect x="16" y="' + (y + 10) + '" width="40" height="2"/>'); y += 20; break;
        case "v": out.push('<rect x="6" y="' + y + '" width="88" height="18" fill="none" stroke="#000" stroke-width="1.5"/><polygon points="46,' + (y + 4) + ' 46,' + (y + 14) + ' 56,' + (y + 9) + '" fill="#000"/>'); y += 22; break;
        case "f": out.push('<rect x="6" y="' + y + '" width="3" height="3" fill="#000"/><rect x="12" y="' + (y + 0.5) + '" width="40" height="2"/><rect x="6" y="' + (y + 6) + '" width="3" height="3" fill="#000"/><rect x="12" y="' + (y + 6.5) + '" width="30" height="2"/>'); y += 13; break;
        case "tbl": out.push('<rect x="6" y="' + y + '" width="88" height="12" fill="none" stroke="#000" stroke-width="1"/><rect x="6" y="' + y + '" width="88" height="4" fill="#000"/><line x1="36" y1="' + y + '" x2="36" y2="' + (y + 12) + '" stroke="#000"/><line x1="66" y1="' + y + '" x2="66" y2="' + (y + 12) + '" stroke="#000"/>'); y += 16; break;
      }
    });
    return '<svg viewBox="0 0 100 ' + Math.max(y + 2, 60) + '" xmlns="http://www.w3.org/2000/svg" fill="#000">' + out.join("") + "</svg>";
  }

  var PLANTILLAS = [
    { k: "tec", nombre: "Tecnología y Fabricación", desc: "Objetivo, ficha de datos, proceso en carrete, tabla de parámetros, resultados, antes/después, hero shot, archivos.", wire: ["h", "t", "d", "s", "c", "tbl", "s", "ok", "cmp", "hero", "f"] },
    { k: "dis", nombre: "Diseño", desc: "Brief, referencias en galería, bocetos en carrete, iteraciones comparadas, resultado.", wire: ["h", "t", "d", "s", "g", "s", "c", "cmp", "hero", "ok", "f"] },
    { k: "inn", nombre: "Innovación", desc: "Problema, investigación en línea de tiempo, ideas en galería, prueba en carrete, aprendizajes.", wire: ["h", "t", "s", "l", "s", "g", "s", "c", "ok", "f"] },
    { k: "pro", nombre: "Proyecto Integrador", desc: "Avance semanal: hero shot, estado, línea de tiempo, lo que hice, decisiones, video.", wire: ["h", "hero", "d", "s", "t", "l", "s", "c", "ok", "v", "f"] },
    { k: "ref", nombre: "Referencias", desc: "Un recurso: qué es, para qué me sirvió, cómo lo usé, licencia.", wire: ["h", "d", "s", "t", "s", "t", "g", "s", "t"] },
    { k: "vacia", nombre: "Vacía", desc: "Empezar de cero y agregar elementos a mano.", wire: ["h", "t"] }
  ];

  var ESTRUCTURAS = {
    tec: [["titulo", { text: "Objetivo" }], ["texto", {}], ["datos", {}], ["titulo", { text: "Referencias" }], ["texto", {}],
          ["titulo", { text: "Proceso" }], ["carrete", {}], ["parametros", {}], ["titulo", { text: "Resultados" }],
          ["resultado", { ok: true }], ["resultado", { ok: false }], ["comparar", {}], ["hero", {}],
          ["titulo", { text: "Pieza 3D" }], ["pieza3d", {}],
          ["titulo", { text: "Reflexión" }], ["texto", {}], ["titulo", { text: "Archivos" }], ["archivos", {}],
          ["titulo", { text: "Atribución y uso de IA" }], ["texto", {}]],
    dis: [["titulo", { text: "Brief" }], ["texto", {}], ["datos", { rows: [{ k: "Usuario", v: "" }, { k: "Restricciones", v: "" }, { k: "Entregable", v: "" }, { k: "Herramientas", v: "" }] }],
          ["titulo", { text: "Referencias e inspiración" }], ["galeria", {}], ["titulo", { text: "Bocetos" }], ["carrete", {}],
          ["titulo", { text: "Iteraciones" }], ["texto", {}], ["comparar", { a: "Versión 1", b: "Versión 2" }],
          ["titulo", { text: "Resultado" }], ["hero", {}], ["resultado", { ok: true }], ["resultado", { ok: false }],
          ["titulo", { text: "Reflexión" }], ["texto", {}], ["titulo", { text: "Archivos" }], ["archivos", {}],
          ["titulo", { text: "Atribución y uso de IA" }], ["texto", {}]],
    inn: [["titulo", { text: "Problema o pregunta" }], ["texto", {}], ["titulo", { text: "Investigación" }], ["linea", {}],
          ["titulo", { text: "Ideas" }], ["galeria", { cols: "dos" }], ["titulo", { text: "Prueba" }], ["carrete", {}],
          ["titulo", { text: "Qué aprendí" }], ["resultado", { ok: true }], ["resultado", { ok: false }],
          ["titulo", { text: "Próximo paso" }], ["texto", {}], ["titulo", { text: "Archivos y atribución" }], ["archivos", {}], ["texto", {}]],
    ref: [["datos", { rows: [{ k: "Enlace", v: "" }, { k: "Autoría", v: "" }, { k: "Licencia", v: "" }, { k: "Lo usé en", v: "" }] }],
          ["titulo", { text: "Qué es" }], ["texto", {}], ["titulo", { text: "Para qué me sirvió" }], ["texto", {}],
          ["titulo", { text: "Cómo lo usé" }], ["galeria", { cols: "dos" }], ["titulo", { text: "Ojo con" }], ["texto", {}]],
    vacia: [],
    pro: [["hero", {}], ["datos", { rows: [{ k: "Estado", v: "" }, { k: "Esta semana", v: "" }, { k: "Bloqueos", v: "" }, { k: "Siguiente", v: "" }] }],
          ["titulo", { text: "Dónde estoy" }], ["texto", {}], ["titulo", { text: "Línea de tiempo" }], ["linea", {}],
          ["titulo", { text: "Lo que hice esta semana" }], ["carrete", {}], ["titulo", { text: "Decisiones" }], ["texto", {}],
          ["titulo", { text: "Resultados" }], ["resultado", { ok: true }], ["resultado", { ok: false }], ["video", {}],
          ["titulo", { text: "Archivos" }], ["archivos", {}], ["titulo", { text: "Atribución y uso de IA" }], ["texto", {}]]
  };

  /* ------------------------------------------------------------------ */
  function init() {
    var B = window.Bitacora;
    var root = document.getElementById("be-constructor");
    if (!B || !root || root.dataset.ready) return;
    root.dataset.ready = "1";

    var $ = function (id) { return document.getElementById(id); };
    var blocks = [];
    var ultimasPartes = [];
    var nextId = 1;
    var previewTimer = null;
    var ORIGEN = null; // ruta de la página abierta desde el repositorio

    function log(msg, err) { var el = $("bc-log"); el.textContent = msg; el.classList.toggle("err", !!err); }
    function uid() { return "b" + (nextId++) + "-" + Date.now().toString(36); }

    /* --- cabecera y ubicación en el menú --- */
    var ubic = B.makeUbicacion($("bc-ubic"), {
      groups: function () { return B.groups(); },
      navYaml: function () { return B.navYaml(); },
      getTitle: function () { return $("bc-titulo").value; },
      onChange: function () { updateRuta(); changed(); }
    });
    B.onNavLoaded(function () { ubic.fillSections(); ubic.refresh(); updateRuta(); });
    function fillSections() { ubic.fillSections(); }

    function group() { return ubic.group(); }
    function slug() { return ubic.slug(); }
    function pagePath() { return ORIGEN || ubic.path(); }
    function updateRuta() {
      ubic.refresh();
      var r = root.querySelector("#bc-ubic .ubic-ruta");
      if (r && ORIGEN) r.textContent = ORIGEN + " (página existente: se reemplaza al publicar)";
    }

    ["bc-titulo", "bc-semana"].forEach(function (id) { $(id).addEventListener("input", function () { updateRuta(); changed(); }); });

    /* --- rutas de imágenes y archivos --- */
    function carpeta() { var g = group(); return g.folder || "inicio"; }
    function imgRepoPath(im) { return im.fijo && im.repoPath ? im.repoPath : "docs/images/" + carpeta() + "/" + slug() + "/" + im.name; }
    function fileRepoPath(f) { return f.fijo && f.repoPath ? f.repoPath : "docs/files/" + carpeta() + "/" + slug() + "/" + f.name; }
    function rel(repoPath) { return B.relToImages(pagePath()) + repoPath.replace(/^docs\//, ""); }

    /* --- bloques --- */
    function add(type, extra, silent) {
      var d = TIPOS[type].data();
      Object.keys(extra || {}).forEach(function (k) { d[k] = extra[k]; });
      var b = { id: uid(), type: type, data: d, open: true };
      blocks.push(b);
      if (!silent) { render(); focusBlock(b.id); changed(); }
      return b;
    }
    function remove(id) { blocks = blocks.filter(function (b) { return b.id !== id; }); render(); changed(); }
    function move(id, dir) {
      var i = blocks.findIndex(function (b) { return b.id === id; });
      var j = i + dir;
      if (i < 0 || j < 0 || j >= blocks.length) return;
      var t = blocks[i]; blocks[i] = blocks[j]; blocks[j] = t;
      render(); changed();
      focusBlock(id);
    }
    function focusBlock(id) {
      var card = root.querySelector('[data-id="' + id + '"]');
      if (!card) return;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      var f = card.querySelector(".bc-form input, .bc-form textarea");
      if (f) f.focus({ preventScroll: true });
    }

    root.querySelectorAll("#bc-paleta button[data-add]").forEach(function (btn) {
      btn.addEventListener("click", function () { add(btn.dataset.add); });
    });
    (function () {
      var box = $("bc-plantillas");
      var t = el("div", "bc-plantillas-titulo", "Empezar con una plantilla");
      box.appendChild(t);
      var grid = el("div", "bc-plantillas-grid");
      var secciones = { tec: "Tecnología y Fabricación", dis: "Diseño", inn: "Innovación", pro: "Proyecto Integrador", ref: "Referencias" };
      PLANTILLAS.forEach(function (pl) {
        var card = el("button", "bc-plantilla");
        card.type = "button";
        card.innerHTML = '<span class="bc-plantilla-wire">' + wire(pl.wire) + '</span><span class="bc-plantilla-nombre">' + pl.nombre + '</span><span class="bc-plantilla-desc">' + pl.desc + "</span>";
        card.addEventListener("click", function () {
          if (blocks.length && !confirm("¿Reemplazar los elementos actuales por la plantilla \u201c" + pl.nombre + "\u201d?")) return;
          blocks = []; ORIGEN = null;
          ESTRUCTURAS[pl.k].forEach(function (e) { add(e[0], e[1], true); });
          if (secciones[pl.k] && B.groups().some(function (g) { return g.name === secciones[pl.k]; })) { ubic.set(secciones[pl.k]); updateRuta(); }
          grid.querySelectorAll(".bc-plantilla").forEach(function (c) { c.classList.toggle("activa", c === card); });
          render(); changed();
          log(pl.k === "vacia" ? "Página vacía: agregá elementos desde la paleta." : "Plantilla \u201c" + pl.nombre + "\u201d cargada. Completá los elementos y quitá los que no uses.");
          $("bc-bloques").scrollIntoView({ behavior: "smooth", block: "start" });
        });
        grid.appendChild(card);
      });
      box.appendChild(grid);
    })();

    /* --- ajustar foto: rotar, recortar, acercar, blanco y negro --- */
    function ajustarFoto(im, done) {
      if (!im.orig) im.orig = { bytes: im.bytes, url: im.url, type: im.type, name: im.name };
      var st = { rot: 0, aspect: 0, zoom: 1, x: 50, y: 50, bn: false };
      var ov = el("div", "bc-ajuste");
      ov.innerHTML =
        '<div class="bc-ajuste-caja">' +
        '<div class="bc-ajuste-titulo">Ajustar foto <span class="bc-ajuste-nombre"></span></div>' +
        '<div class="bc-ajuste-lienzo"><canvas></canvas></div>' +
        '<div class="bc-ajuste-ctl">' +
        '<div class="bc-ajuste-grupo"><span>Rotar</span><button type="button" data-rot="-90">⟲ 90°</button><button type="button" data-rot="90">⟳ 90°</button></div>' +
        '<div class="bc-ajuste-grupo"><span>Recorte</span><button type="button" data-asp="0" aria-pressed="true">Libre</button><button type="button" data-asp="1.3333">4:3</button><button type="button" data-asp="1.5">3:2</button><button type="button" data-asp="1.7778">16:9</button><button type="button" data-asp="1">1:1</button><button type="button" data-asp="0.75">3:4</button></div>' +
        '<div class="bc-ajuste-grupo"><span>Acercar</span><input type="range" min="1" max="3" step="0.05" value="1" data-k="zoom"></div>' +
        '<div class="bc-ajuste-grupo"><span>Horizontal</span><input type="range" min="0" max="100" value="50" data-k="x"></div>' +
        '<div class="bc-ajuste-grupo"><span>Vertical</span><input type="range" min="0" max="100" value="50" data-k="y"></div>' +
        '<div class="bc-ajuste-grupo"><label class="be-check"><input type="checkbox" data-k="bn"> Blanco y negro</label></div>' +
        '</div>' +
        '<div class="be-actions"><button type="button" class="primary" data-act="ok">Aplicar</button><button type="button" data-act="orig">Volver a la original</button><button type="button" data-act="no">Cancelar</button></div>' +
        "</div>";
      ov.querySelector(".bc-ajuste-nombre").textContent = im.name;
      document.body.appendChild(ov);
      var canvas = ov.querySelector("canvas"), ctx = canvas.getContext("2d");
      var img = new Image();

      function geom(full) {
        // imagen rotada
        var rot = ((st.rot % 360) + 360) % 360;
        var sw = img.naturalWidth, sh = img.naturalHeight;
        var rw = rot % 180 ? sh : sw, rh = rot % 180 ? sw : sh;
        // recorte
        var cw = rw / st.zoom, ch = rh / st.zoom;
        if (st.aspect) { if (cw / ch > st.aspect) cw = ch * st.aspect; else ch = cw / st.aspect; }
        var cx = (rw - cw) * st.x / 100, cy = (rh - ch) * st.y / 100;
        var scale = full ? Math.min(1, 1600 / Math.max(cw, ch)) : Math.min(1, 480 / Math.max(cw, ch));
        return { rot: rot, rw: rw, rh: rh, cw: cw, ch: ch, cx: cx, cy: cy, scale: scale };
      }
      function draw(target, full) {
        var g = geom(full), c = target.getContext("2d");
        target.width = Math.round(g.cw * g.scale); target.height = Math.round(g.ch * g.scale);
        c.save();
        c.filter = st.bn ? "grayscale(1)" : "none";
        c.scale(g.scale, g.scale);
        c.translate(-g.cx, -g.cy);
        c.translate(g.rw / 2, g.rh / 2);
        c.rotate(g.rot * Math.PI / 180);
        c.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        c.restore();
      }
      function refresh() { draw(canvas, false); }
      img.onload = refresh;
      img.src = im.url;

      ov.querySelectorAll("[data-rot]").forEach(function (b) { b.addEventListener("click", function () { st.rot += parseInt(b.dataset.rot, 10); refresh(); }); });
      ov.querySelectorAll("[data-asp]").forEach(function (b) {
        b.addEventListener("click", function () {
          st.aspect = parseFloat(b.dataset.asp);
          ov.querySelectorAll("[data-asp]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
          refresh();
        });
      });
      ov.querySelectorAll("input[data-k]").forEach(function (i) {
        i.addEventListener("input", function () { st[i.dataset.k] = i.type === "checkbox" ? i.checked : parseFloat(i.value); refresh(); });
      });
      function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
      ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
      ov.querySelector('[data-act="no"]').addEventListener("click", close);
      ov.querySelector('[data-act="orig"]').addEventListener("click", function () {
        im.bytes = im.orig.bytes; im.url = im.orig.url; im.type = im.orig.type; im.name = im.orig.name;
        if (im.bytes) idbPut(im.id, im.bytes, im.type);
        close(); done();
      });
      ov.querySelector('[data-act="ok"]').addEventListener("click", function () {
        var out = document.createElement("canvas");
        draw(out, true);
        var isPng = im.type === "image/png";
        out.toBlob(function (blob) {
          if (!blob) { alert("No pude procesar la foto."); return; }
          blob.arrayBuffer().then(function (buf) {
            im.bytes = new Uint8Array(buf);
            im.type = blob.type;
            im.url = URL.createObjectURL(blob);
            im.name = im.name.replace(/\.[^.]+$/, "") + (isPng ? ".png" : ".jpg");
            idbPut(im.id, im.bytes, im.type);
            close(); done();
          });
        }, isPng ? "image/png" : "image/jpeg", 0.85);
      });
    }

    /* --- formularios por tipo --- */
    function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
    function field(labelTxt, input, hint) {
      var w = el("div", "be-field");
      var l = el("label"); l.textContent = labelTxt;
      if (hint) { var sm = el("small"); sm.textContent = hint; l.appendChild(sm); }
      w.appendChild(l); w.appendChild(input);
      return w;
    }
    function input(value, placeholder, onInput, type) {
      var i = el("input"); i.type = type || "text"; i.value = value || ""; i.placeholder = placeholder || "";
      i.addEventListener("input", function () { onInput(i.value); changed(); });
      return i;
    }
    function textarea(value, placeholder, onInput, rows) {
      var t = el("textarea"); t.value = value || ""; t.placeholder = placeholder || ""; t.style.minHeight = (rows || 4) * 1.6 + "rem";
      t.addEventListener("input", function () { onInput(t.value); changed(); });
      return t;
    }
    function select(options, value, onChange) {
      var s = el("select");
      options.forEach(function (o) { var op = el("option"); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); });
      s.value = value;
      s.addEventListener("change", function () { onChange(s.value); changed(); });
      return s;
    }

    function imagesUI(b, max, labels) {
      var box = el("div", "bc-imgs");
      var drop = el("div", "be-drop", max === 1 ? "Arrastrá la foto acá, o hacé clic" : "Arrastrá las fotos acá, o hacé clic");
      var fi = el("input"); fi.type = "file"; fi.accept = "image/*"; fi.multiple = max !== 1; fi.style.display = "none";
      drop.addEventListener("click", function () { fi.click(); });
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
      drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });
      fi.addEventListener("change", function () { addFiles(fi.files); fi.value = ""; });
      function addFiles(files) {
        var list = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type); });
        if (max && b.data.imgs.length + list.length > max) list = list.slice(0, Math.max(0, max - b.data.imgs.length));
        list.forEach(function (file) {
          B.processImage(file).then(function (im) {
            im.id = uid(); im.caption = labels && labels[b.data.imgs.length] ? labels[b.data.imgs.length] : "";
            if (b.data.imgs.some(function (x) { return x.name === im.name; })) im.name = im.name.replace(/(\.[^.]+)$/, "-" + Date.now().toString(36) + "$1");
            b.data.imgs.push(im);
            idbPut(im.id, im.bytes, im.type);
            renderImgs(); changed();
          }).catch(function (e) { alert(e.message); });
        });
      }
      var grid = el("div", "be-images");
      function renderImgs() {
        grid.innerHTML = "";
        b.data.imgs.forEach(function (im, i) {
          var fig = el("figure");
          var img = el("img"); img.src = im.url; img.alt = ""; fig.appendChild(img);
          var cap = el("figcaption"); cap.textContent = im.name + (im.bytes ? " · " + B.fmtSize(im.bytes.length) : " · ya en el repositorio"); fig.appendChild(cap);
          var ci = el("input"); ci.type = "text"; ci.placeholder = labels ? labels[i] || "Etiqueta" : "Pie de foto"; ci.value = im.caption || ""; ci.style.marginTop = ".4rem";
          ci.addEventListener("input", function () { im.caption = ci.value; changed(); });
          fig.appendChild(ci);
          var row = el("div", "bc-imgbtns");
          var aj = el("button", "small", "Ajustar"); aj.type = "button"; aj.title = "Rotar, recortar, blanco y negro";
          aj.addEventListener("click", function () { ajustarFoto(im, function () { renderImgs(); changed(); }); });
          row.appendChild(aj);
          var up = el("button", "small", "↑"); up.type = "button"; up.addEventListener("click", function () { if (i > 0) { b.data.imgs.splice(i - 1, 0, b.data.imgs.splice(i, 1)[0]); renderImgs(); changed(); } });
          var dn = el("button", "small", "↓"); dn.type = "button"; dn.addEventListener("click", function () { if (i < b.data.imgs.length - 1) { b.data.imgs.splice(i + 1, 0, b.data.imgs.splice(i, 1)[0]); renderImgs(); changed(); } });
          var rm = el("button", "small", "×"); rm.type = "button"; rm.addEventListener("click", function () { b.data.imgs.splice(i, 1); renderImgs(); changed(); });
          row.appendChild(up); row.appendChild(dn); row.appendChild(rm);
          fig.appendChild(row);
          grid.appendChild(fig);
        });
        drop.style.display = max && b.data.imgs.length >= max ? "none" : "block";
      }
      renderImgs();
      var elegir = el("button", "small", "Elegir del repositorio"); elegir.type = "button";
      elegir.addEventListener("click", function () {
        B.elegirMaterial({ tipo: "imagen", multiple: max !== 1 }, function (items) {
          items.forEach(function (it) {
            if (max && b.data.imgs.length >= max) return;
            if (b.data.imgs.some(function (x) { return x.repoPath === it.path; })) return;
            b.data.imgs.push({ id: uid(), name: it.name, caption: labels && labels[b.data.imgs.length] ? labels[b.data.imgs.length] : it.name.replace(/\.[^.]+$/, "").replace(/-/g, " "), bytes: null, url: it.url, repoPath: it.path, fijo: true });
          });
          renderImgs(); changed();
        });
      });
      box.appendChild(grid); box.appendChild(drop); box.appendChild(elegir); box.appendChild(fi);
      return box;
    }

    function rowsUI(b, kPlaceholder, vPlaceholder) {
      var box = el("div", "bc-rows");
      function draw() {
        box.innerHTML = "";
        b.data.rows.forEach(function (r, i) {
          var row = el("div", "bc-row");
          row.appendChild(input(r.k, kPlaceholder, function (v) { r.k = v; }));
          row.appendChild(input(r.v, vPlaceholder, function (v) { r.v = v; }));
          var rm = el("button", "small", "×"); rm.type = "button"; rm.addEventListener("click", function () { b.data.rows.splice(i, 1); draw(); changed(); });
          row.appendChild(rm);
          box.appendChild(row);
        });
        var addb = el("button", "small", "+ Fila"); addb.type = "button";
        addb.addEventListener("click", function () { b.data.rows.push({ k: "", v: "" }); draw(); changed(); box.querySelectorAll("input")[b.data.rows.length * 2 - 2].focus(); });
        box.appendChild(addb);
      }
      draw();
      return box;
    }

    function tableUI(b) {
      var box = el("div", "bc-rows");
      function draw() {
        box.innerHTML = "";
        var head = el("div", "bc-row bc-row-3");
        b.data.cols.forEach(function (c, ci) { head.appendChild(input(c, "Columna", function (v) { b.data.cols[ci] = v; })); });
        head.appendChild(el("span"));
        box.appendChild(head);
        b.data.rows.forEach(function (r, i) {
          var row = el("div", "bc-row bc-row-3");
          r.forEach(function (c, ci) { row.appendChild(input(c, "", function (v) { r[ci] = v; })); });
          var rm = el("button", "small", "×"); rm.type = "button"; rm.addEventListener("click", function () { b.data.rows.splice(i, 1); draw(); changed(); });
          row.appendChild(rm);
          box.appendChild(row);
        });
        var addb = el("button", "small", "+ Fila"); addb.type = "button";
        addb.addEventListener("click", function () { b.data.rows.push(["", "", ""]); draw(); changed(); });
        box.appendChild(addb);
      }
      draw();
      return box;
    }

    function filesUI(b) {
      var box = el("div", "bc-files");
      var drop = el("div", "be-drop", "Arrastrá los archivos acá (.f3d, .stl, .scad, .ino, .pdf…), o hacé clic · hasta 50 MB");
      var fi = el("input"); fi.type = "file"; fi.multiple = true; fi.style.display = "none";
      drop.addEventListener("click", function () { fi.click(); });
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
      drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });
      fi.addEventListener("change", function () { addFiles(fi.files); fi.value = ""; });
      function addFiles(files) {
        Array.prototype.forEach.call(files, function (file) {
          if (file.size > MAX_FILE) { alert(file.name + " pesa " + B.fmtSize(file.size) + ". Más de 50 MB no entra en el repositorio: subilo a Google Drive y agregá el enlace."); return; }
          if (file.size > AVISO_FILE && !confirm(file.name + " pesa " + B.fmtSize(file.size) + ". La guía pide consultar antes de subir más de 10 MB al repositorio; la alternativa es Google Drive con un enlace. ¿Subirlo igual a GitHub?")) return;
          file.arrayBuffer().then(function (buf) {
            var name = B.slugify(file.name.replace(/\.[^.]+$/, "")) + (file.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
            var f = { id: uid(), name: name, desc: "", bytes: new Uint8Array(buf) };
            b.data.files.push(f);
            idbPut(f.id, f.bytes, file.type || "application/octet-stream");
            draw(); changed();
          });
        });
      }
      /* enlace externo: Google Drive, YouTube, Thingiverse… */
      var linkBox = el("div", "bc-link");
      var lName = el("input"); lName.type = "text"; lName.placeholder = "Nombre (ej.: soporte.f3d en Drive)";
      var lUrl = el("input"); lUrl.type = "url"; lUrl.placeholder = "https://drive.google.com/…";
      var lBtn = el("button", "small", "+ Agregar enlace"); lBtn.type = "button";
      lBtn.addEventListener("click", function () {
        var url = lUrl.value.trim();
        if (!/^https?:\/\//.test(url)) { alert("Pegá la dirección completa del enlace (empieza con https://)."); return; }
        var name = lName.value.trim() || url.replace(/^https?:\/\//, "").split("/")[0];
        b.data.files.push({ id: uid(), name: name, desc: "", url: url, bytes: null });
        lName.value = ""; lUrl.value = "";
        draw(); changed();
      });
      linkBox.appendChild(lName); linkBox.appendChild(lUrl); linkBox.appendChild(lBtn);
      var linkHint = el("div", "hint be-kv", "Para archivos grandes o videos: subilos a Google Drive, compartilos con \u201ccualquier persona con el enlace\u201d y pegá el enlace acá.");

      var list = el("div", "bc-rows");
      function draw() {
        list.innerHTML = "";
        b.data.files.forEach(function (f, i) {
          var row = el("div", "bc-row");
          var tag = f.url ? (/drive\.google|docs\.google/.test(f.url) ? "Drive" : "Enlace") : (f.bytes ? B.fmtSize(f.bytes.length) : "en el repositorio");
          var nm = el("span", "bc-filename", B.escapeHtml(f.name) + ' <span class="tag">' + tag + "</span>");
          if (f.url) { var a = el("a"); a.href = f.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = " ↗"; nm.appendChild(a); }
          row.appendChild(nm);
          row.appendChild(input(f.desc, f.url ? "Descripción (qué es, licencia)" : "Descripción (editable original, exportación…)", function (v) { f.desc = v; }));
          var rm = el("button", "small", "×"); rm.type = "button"; rm.addEventListener("click", function () { b.data.files.splice(i, 1); draw(); changed(); });
          row.appendChild(rm);
          list.appendChild(row);
        });
      }
      draw();
      var elegir = el("button", "small", "Elegir del repositorio"); elegir.type = "button";
      elegir.addEventListener("click", function () {
        B.elegirMaterial({ tipo: "archivo", multiple: true }, function (items) {
          items.forEach(function (it) {
            if (b.data.files.some(function (x) { return x.repoPath === it.path; })) return;
            b.data.files.push({ id: uid(), name: it.name, desc: "", bytes: null, repoPath: it.path, fijo: true });
          });
          draw(); changed();
        });
      });
      box.appendChild(list); box.appendChild(drop); box.appendChild(elegir); box.appendChild(fi); box.appendChild(linkBox); box.appendChild(linkHint);
      return box;
    }

    function stlUI(b) {
      var box = el("div", "bc-files");
      var drop = el("div", "be-drop", "Arrastrá el archivo .stl acá, o hacé clic · hasta 50 MB");
      var fi = el("input"); fi.type = "file"; fi.accept = ".stl,model/stl,application/sla"; fi.style.display = "none";
      drop.addEventListener("click", function () { fi.click(); });
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
      drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); addFile(e.dataTransfer.files[0]); });
      fi.addEventListener("change", function () { addFile(fi.files[0]); fi.value = ""; });
      function addFile(file) {
        if (!file) return;
        if (!/\.stl$/i.test(file.name)) { alert("Elegí un archivo .stl"); return; }
        if (file.size > MAX_FILE) { alert(file.name + " pesa " + B.fmtSize(file.size) + ". Más de 50 MB no entra en el repositorio."); return; }
        if (file.size > AVISO_FILE && !confirm(file.name + " pesa " + B.fmtSize(file.size) + ". La guía pide consultar antes de subir más de 10 MB. ¿Subirlo igual?")) return;
        file.arrayBuffer().then(function (buf) {
          var name = B.slugify(file.name.replace(/\.[^.]+$/, "")) + ".stl";
          var f = { id: uid(), name: name, desc: "", bytes: new Uint8Array(buf), url: URL.createObjectURL(new Blob([buf], { type: "model/stl" })) };
          b.data.files = [f];
          idbPut(f.id, f.bytes, "model/stl");
          draw(); changed();
        });
      }
      var list = el("div", "bc-rows");
      function draw() {
        list.innerHTML = "";
        b.data.files.forEach(function (f, i) {
          var row = el("div", "bc-row");
          row.appendChild(el("span", "bc-filename", B.escapeHtml(f.name) + ' <span class="tag">' + (f.bytes ? B.fmtSize(f.bytes.length) : "en el repositorio") + "</span>"));
          var rm = el("button", "small", "×"); rm.type = "button"; rm.addEventListener("click", function () { b.data.files.splice(i, 1); draw(); changed(); });
          row.appendChild(el("span")); row.appendChild(rm);
          list.appendChild(row);
        });
        drop.style.display = b.data.files.length ? "none" : "block";
      }
      draw();
      var elegir = el("button", "small", "Elegir del repositorio"); elegir.type = "button";
      elegir.addEventListener("click", function () {
        B.elegirMaterial({ tipo: "stl", multiple: false }, function (items) {
          var it = items[0];
          b.data.files = [{ id: uid(), name: it.name, desc: "", bytes: null, url: it.url, repoPath: it.path, fijo: true }];
          draw(); changed();
        });
      });
      box.appendChild(list); box.appendChild(drop); box.appendChild(elegir); box.appendChild(fi);
      return box;
    }

    function form(b) {
      var d = b.data, w = el("div", "bc-form");
      switch (b.type) {
        case "titulo":
          w.appendChild(field("Texto del título", input(d.text, "Ej.: Proceso", function (v) { d.text = v; })));
          w.appendChild(field("Nivel", select([["h2", "Sección (H2)"], ["h3", "Subsección (H3)"]], d.nivel, function (v) { d.nivel = v; })));
          break;
        case "texto":
          w.appendChild(field("Texto", textarea(d.text, "Escribí con naturalidad. **negrita**, _cursiva_ y [enlace](https://…) si hacen falta.", function (v) { d.text = v; }, 5), "Podés pegar varios párrafos."));
          break;
        case "imagen":
          w.appendChild(imagesUI(b, 1));
          w.appendChild(field("Tamaño", select([["0", "Normal"], ["1", "Ancho completo, con marco"]], d.grande ? "1" : "0", function (v) { d.grande = v === "1"; })));
          break;
        case "carrete":
          w.appendChild(imagesUI(b, 0));
          break;
        case "galeria":
          w.appendChild(imagesUI(b, 0));
          w.appendChild(field("Columnas", select([["dos", "Dos"], ["tres", "Tres"], ["", "Automático"]], d.cols, function (v) { d.cols = v; })));
          break;
        case "comparar":
          w.appendChild(field("Etiquetas", (function () { var r = el("div", "bc-row"); r.appendChild(input(d.a, "Antes", function (v) { d.a = v; })); r.appendChild(input(d.b, "Después", function (v) { d.b = v; })); return r; })()));
          w.appendChild(imagesUI(b, 2, [d.a, d.b]));
          break;
        case "hero":
          w.appendChild(imagesUI(b, 1));
          break;
        case "datos":
          w.appendChild(rowsUI(b, "Dato (ej.: Materiales)", "Valor"));
          break;
        case "parametros":
          w.appendChild(tableUI(b));
          break;
        case "linea":
          w.appendChild(rowsUI(b, "Semana 1", "Qué pasó"));
          break;
        case "resultado":
          w.appendChild(field("Tipo", select([["1", "Éxito · lo que funcionó"], ["0", "Falló · lo que no funcionó"]], d.ok ? "1" : "0", function (v) { d.ok = v === "1"; })));
          w.appendChild(field("Texto", textarea(d.text, d.ok ? "Qué salió bien." : "Qué salió mal y qué creo que pasó.", function (v) { d.text = v; }, 3)));
          break;
        case "nota":
          w.appendChild(field("Título", input(d.titulo, "Nota", function (v) { d.titulo = v; })));
          w.appendChild(field("Tipo", select([["note", "Nota"], ["tip", "Consejo"], ["warning", "Atención"], ["quote", "Cita"]], d.tipo, function (v) { d.tipo = v; })));
          w.appendChild(field("Texto", textarea(d.text, "", function (v) { d.text = v; }, 3)));
          break;
        case "video":
          w.appendChild(field("Dirección del video", input(d.url, "https://www.youtube.com/watch?v=…", function (v) { d.url = v; }), "YouTube o Vimeo. El video no se sube al repositorio."));
          break;
        case "codigo":
          w.appendChild(field("Lenguaje", input(d.lang, "python, javascript, openscad…", function (v) { d.lang = v; })));
          w.appendChild(field("Código", (function () { var t = textarea(d.text, "", function (v) { d.text = v; }, 6); t.className = "code"; t.style.minHeight = "8rem"; return t; })()));
          break;
        case "archivos":
          w.appendChild(filesUI(b));
          break;
        case "pieza3d":
          w.appendChild(stlUI(b));
          w.appendChild(field("Pie", input(d.caption, "Qué es la pieza, medidas, material previsto", function (v) { d.caption = v; })));
          w.appendChild((function () { var l = el("label", "be-check"); var c = el("input"); c.type = "checkbox"; c.checked = d.descarga !== false; c.addEventListener("change", function () { d.descarga = c.checked; changed(); }); l.appendChild(c); l.appendChild(document.createTextNode(" Agregar enlace de descarga debajo del visor")); return l; })());
          break;
      }
      return w;
    }

    function resumen(b) {
      var d = b.data, n;
      switch (b.type) {
        case "titulo": return d.text || "(sin texto)";
        case "texto": return d.text ? d.text.replace(/\s+/g, " ").slice(0, 80) + (d.text.length > 80 ? "…" : "") : "(vacío)";
        case "imagen": case "hero": return d.imgs[0] ? (d.imgs[0].caption || d.imgs[0].name) : "(sin foto)";
        case "carrete": case "galeria": n = d.imgs.length; return n ? n + (n === 1 ? " foto" : " fotos") : "(sin fotos)";
        case "comparar": return (d.a || "Antes") + " / " + (d.b || "Después") + " · " + d.imgs.length + " de 2 fotos";
        case "datos": case "linea": n = d.rows.filter(function (r) { return r.k.trim() && r.v.trim(); }).length; return n + (n === 1 ? " fila" : " filas");
        case "parametros": n = d.rows.filter(function (r) { return r.some(function (c) { return c.trim(); }); }).length; return d.cols.join(" · ") + " · " + n + (n === 1 ? " fila" : " filas");
        case "resultado": return (d.ok ? "Éxito · " : "Falló · ") + (d.text ? d.text.slice(0, 60) : "(vacío)");
        case "nota": return d.titulo + (d.text ? " · " + d.text.slice(0, 50) : "");
        case "video": return d.url || "(sin dirección)";
        case "codigo": return (d.lang || "código") + (d.text ? " · " + d.text.split("\n").length + " líneas" : " · (vacío)");
        case "archivos": n = d.files.length; return n ? n + (n === 1 ? " archivo" : " archivos") : "(sin archivos)";
        case "pieza3d": return d.files[0] ? d.files[0].name + (d.caption ? " · " + d.caption : "") : "(sin archivo .stl)";
      }
      return "";
    }

    function duplicate(id) {
      var i = blocks.findIndex(function (b) { return b.id === id; });
      if (i < 0) return;
      var src = blocks[i];
      var copy = { id: uid(), type: src.type, data: JSON.parse(JSON.stringify(src.data, function (k, v) { return k === "bytes" || k === "url" ? undefined : v; })) };
      (copy.data.imgs || []).forEach(function (im, k) { im.id = uid(); im.bytes = src.data.imgs[k].bytes; im.url = src.data.imgs[k].url; im.type = src.data.imgs[k].type; });
      (copy.data.files || []).forEach(function (f, k) { f.id = uid(); f.bytes = src.data.files[k].bytes; });
      copy.open = true;
      blocks.splice(i + 1, 0, copy);
      render(); changed(); focusBlock(copy.id);
    }

    function addAfter(id, type) {
      var i = blocks.findIndex(function (b) { return b.id === id; });
      var b = { id: uid(), type: type, data: TIPOS[type].data(), open: true };
      blocks.splice(i + 1, 0, b);
      render(); changed(); focusBlock(b.id);
    }

    var dragId = null;
    function render() {
      var box = $("bc-bloques");
      box.innerHTML = "";
      updateCounter();
      if (!blocks.length) { box.appendChild(el("p", "be-kv bc-vacio", "Todavía no hay elementos. Elegí uno arriba, o empezá con una estructura.")); return; }
      blocks.forEach(function (b, i) {
        if (b.open == null) b.open = true;
        var card = el("div", "bc-bloque" + (b.open ? "" : " plegado")); card.dataset.id = b.id;
        var head = el("div", "bc-bloque-head");
        head.draggable = true;
        head.title = "Clic: plegar o desplegar · arrastrar: mover";
        head.appendChild(el("span", "bc-num", String(i + 1)));
        head.appendChild(el("span", "bc-ico bc-ico-head", ICONOS[b.type]));
        head.appendChild(el("span", "bc-tipo", TIPOS[b.type].nombre));
        var sum = el("span", "bc-resumen"); sum.textContent = resumen(b); head.appendChild(sum);
        var btns = el("span", "bc-bloque-btns");
        var up = el("button", "small", "↑"); up.type = "button"; up.title = "Subir"; up.addEventListener("click", function (e) { e.stopPropagation(); move(b.id, -1); });
        var dn = el("button", "small", "↓"); dn.type = "button"; dn.title = "Bajar"; dn.addEventListener("click", function (e) { e.stopPropagation(); move(b.id, 1); });
        var dup = el("button", "small", "⧉"); dup.type = "button"; dup.title = "Duplicar"; dup.addEventListener("click", function (e) { e.stopPropagation(); duplicate(b.id); });
        var rm = el("button", "small", "×"); rm.type = "button"; rm.title = "Quitar"; rm.addEventListener("click", function (e) { e.stopPropagation(); if (resumen(b).indexOf("(") === 0 || confirm("¿Quitar este elemento?")) remove(b.id); });
        var tg = el("button", "small", b.open ? "▾" : "▸"); tg.type = "button"; tg.title = b.open ? "Plegar" : "Desplegar";
        btns.appendChild(up); btns.appendChild(dn); btns.appendChild(dup); btns.appendChild(rm); btns.appendChild(tg);
        head.appendChild(btns);
        head.addEventListener("click", function () { b.open = !b.open; render(); });
        head.addEventListener("dragstart", function (e) { dragId = b.id; card.classList.add("arrastrando"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", b.id); } catch (x) { /* nada */ } });
        head.addEventListener("dragend", function () { dragId = null; render(); });
        card.addEventListener("dragover", function (e) { if (!dragId || dragId === b.id) return; e.preventDefault(); card.classList.add("destino"); });
        card.addEventListener("dragleave", function () { card.classList.remove("destino"); });
        card.addEventListener("drop", function (e) {
          e.preventDefault(); card.classList.remove("destino");
          if (!dragId || dragId === b.id) return;
          var from = blocks.findIndex(function (x) { return x.id === dragId; });
          var moved = blocks.splice(from, 1)[0];
          var to = blocks.findIndex(function (x) { return x.id === b.id; });
          blocks.splice(to + (from < to ? 1 : 0), 0, moved);
          dragId = null; render(); changed();
        });
        card.appendChild(head);
        if (b.open) {
          card.appendChild(form(b));
          var foot = el("div", "bc-bloque-foot");
          var lab = el("span", "bc-foot-label", "Agregar debajo");
          var sel = el("select");
          sel.appendChild(el("option", null, "Elegir elemento…"));
          Object.keys(TIPOS).forEach(function (t) { var o = el("option"); o.value = t; o.textContent = TIPOS[t].nombre; sel.appendChild(o); });
          sel.addEventListener("change", function () { if (sel.value) addAfter(b.id, sel.value); });
          foot.appendChild(lab); foot.appendChild(sel);
          var plegar = el("button", "small", "Plegar"); plegar.type = "button"; plegar.addEventListener("click", function () { b.open = false; render(); });
          foot.appendChild(plegar);
          card.appendChild(foot);
        }
        box.appendChild(card);
      });
    }

    function updateCounter() {
      var c = $("bc-contador");
      if (!c) return;
      var fotos = 0, archivos = 0;
      blocks.forEach(function (b) { fotos += (b.data.imgs || []).length; archivos += (b.data.files || []).length; });
      c.textContent = blocks.length + (blocks.length === 1 ? " elemento" : " elementos") + " · " + fotos + (fotos === 1 ? " foto" : " fotos") + (archivos ? " · " + archivos + (archivos === 1 ? " archivo" : " archivos") : "");
    }

    /* --- Markdown --- */
    function imgLine(im) { return "![" + (im.caption || "") + "](" + rel(imgRepoPath(im)) + ")"; }
    function md() {
      var titulo = $("bc-titulo").value.trim() || "Sin título";
      var out = ["---", "title: " + B.yamlQuote(titulo), "---", "", "# " + titulo, ""];
      var semana = $("bc-semana").value.trim(), gname = group().name || "";
      var meta = (gname && semana.indexOf(gname) >= 0) ? semana : [semana, gname].filter(Boolean).join(" · ");
      if (meta) out.push('<p class="meta">' + B.escapeHtml(meta) + "</p>", "");
      var partes = [];
      ultimasPartes = partes;
      blocks.forEach(function (b) {
        var out = [];
        var d = b.data, imgs = d.imgs || [];
        switch (b.type) {
          case "titulo": if (d.text.trim()) out.push((d.nivel === "h3" ? "### " : "## ") + d.text.trim(), ""); break;
          case "texto": if (d.text.trim()) out.push(d.text.trim(), ""); break;
          case "imagen":
            if (imgs[0]) out.push(d.grande
              ? '<figure class="hero-shot" markdown>\n' + imgLine(imgs[0]) + "\n</figure>"
              : "<figure markdown>\n  " + imgLine(imgs[0]) + "\n  <figcaption>" + B.escapeHtml(imgs[0].caption || "") + "</figcaption>\n</figure>", "");
            break;
          case "carrete": if (imgs.length) out.push('<div class="carrete" markdown>', "", imgs.map(imgLine).join("\n"), "", "</div>", ""); break;
          case "galeria": if (imgs.length) out.push('<div class="galeria' + (d.cols ? " " + d.cols : "") + '" markdown>', "", imgs.map(imgLine).join("\n"), "", "</div>", ""); break;
          case "comparar":
            if (imgs.length >= 2) out.push('<div class="comparar" markdown>', "", "![" + (d.a || "Antes") + "](" + rel(imgRepoPath(imgs[0])) + ")", "![" + (d.b || "Después") + "](" + rel(imgRepoPath(imgs[1])) + ")", "", "</div>", "");
            break;
          case "hero": if (imgs[0]) out.push('<figure class="hero-shot" markdown>\n' + imgLine(imgs[0]) + "\n</figure>", ""); break;
          case "datos": {
            var rows = d.rows.filter(function (r) { return r.k.trim() && r.v.trim(); });
            if (rows.length) out.push('<div class="datos" markdown>', "", rows.map(function (r) { return "- **" + r.k.trim() + "**: " + r.v.trim(); }).join("\n"), "", "</div>", "");
            break;
          }
          case "parametros": {
            var rows2 = d.rows.filter(function (r) { return r.some(function (c) { return c.trim(); }); });
            if (rows2.length) out.push("| " + d.cols.join(" | ") + " |", "| " + d.cols.map(function () { return "---"; }).join(" | ") + " |", rows2.map(function (r) { return "| " + r.join(" | ") + " |"; }).join("\n"), "");
            break;
          }
          case "linea": {
            var rows3 = d.rows.filter(function (r) { return r.k.trim() && r.v.trim(); });
            if (rows3.length) out.push('<div class="linea" markdown>', "", rows3.map(function (r) { return "- **" + r.k.trim() + "** · " + r.v.trim(); }).join("\n"), "", "</div>", "");
            break;
          }
          case "resultado": if (d.text.trim()) out.push('<span class="' + (d.ok ? "ok" : "fail") + '">' + (d.ok ? "éxito" : "falló") + "</span> " + d.text.trim(), ""); break;
          case "nota": if (d.text.trim()) out.push("!!! " + d.tipo + ' "' + (d.titulo || "").replace(/"/g, "'") + '"', "    " + d.text.trim().replace(/\n/g, "\n    "), ""); break;
          case "video": {
            var u = d.url.trim(); if (!u) break;
            var m = u.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,})/), vm = u.match(/vimeo\.com\/(\d+)/);
            var src = m ? "https://www.youtube.com/embed/" + m[1] : vm ? "https://player.vimeo.com/video/" + vm[1] : u;
            out.push('<div class="video"><iframe src="' + src + '" title="Video" allowfullscreen></iframe></div>', "");
            break;
          }
          case "codigo": if (d.text.trim()) out.push("```" + (d.lang || ""), d.text.replace(/\s+$/, ""), "```", ""); break;
          case "archivos": if (d.files.length) out.push(d.files.map(function (f) { return "- [" + f.name + "](" + (f.url ? f.url : rel(fileRepoPath(f))) + ")" + (f.desc ? " · " + f.desc : ""); }).join("\n"), ""); break;
          case "pieza3d":
            if (d.files[0]) {
              var sf = d.files[0], srel = rel(fileRepoPath(sf));
              out.push('<div class="stl" data-src="' + srel + '" data-nombre="' + B.escapeHtml(sf.name) + '"' + (d.caption ? ' data-pie="' + B.escapeHtml(d.caption) + '"' : "") + "></div>", "");
              if (d.descarga !== false) out.push("- [" + sf.name + "](" + srel + ") · archivo STL para imprimir", "");
            }
            break;
        }
        partes.push({ id: b.id, type: b.type, nivel: b.type === "titulo" ? (d.nivel === "h3" ? 3 : 2) : 0, out: out });
      });
      // Un título sin contenido hasta el siguiente título del mismo nivel o superior no se escribe
      partes.forEach(function (pt, i) {
        if (pt.type !== "titulo" || !pt.out.length) return;
        var tiene = false;
        for (var j = i + 1; j < partes.length; j++) {
          if (partes[j].type === "titulo" && partes[j].nivel <= pt.nivel) break;
          if (partes[j].out.length) { tiene = true; break; }
        }
        if (!tiene) pt.out = [];
      });
      partes.forEach(function (pt) { out.push.apply(out, pt.out); });
      out.push("<!-- bloques:" + B.utf8ToB64(JSON.stringify(serialize())) + " -->", "");
      return out.join("\n").replace(/\n{3,}/g, "\n\n");
    }

    function serialize() {
      return {
        v: 1,
        titulo: $("bc-titulo").value, semana: $("bc-semana").value, seccion: group().name, ubic: ubic.value(),
        bloques: blocks.map(function (b) {
          var d = {};
          Object.keys(b.data).forEach(function (k) {
            if (k === "imgs") d.imgs = b.data.imgs.map(function (im) { return { name: im.name, caption: im.caption || "", repoPath: imgRepoPath(im), fijo: !!im.fijo }; });
            else if (k === "files") d.files = b.data.files.map(function (f) { return (f.url && !/^blob:/.test(f.url) && !f.bytes && !f.fijo && b.type !== "pieza3d") ? { name: f.name, desc: f.desc || "", url: f.url } : { name: f.name, desc: f.desc || "", repoPath: fileRepoPath(f), fijo: !!f.fijo }; });
            else d[k] = b.data[k];
          });
          return { type: b.type, data: d, open: b.open !== false };
        })
      };
    }

    /* --- vista previa --- */
    function previewImages() {
      var list = [];
      blocks.forEach(function (b) {
        (b.data.imgs || []).forEach(function (im) { if (im.url) list.push({ rel: rel(imgRepoPath(im)), url: im.url }); });
        if (b.type === "pieza3d") (b.data.files || []).forEach(function (f) { if (f.url && f.bytes) list.push({ rel: rel(fileRepoPath(f)), url: f.url }); });
      });
      return list;
    }
    function renderPreview() {
      var box = $("bc-preview");
      if (!blocks.length && !$("bc-titulo").value) { box.innerHTML = '<p class="be-kv">La página se va armando acá.</p>'; return; }
      B.renderMd(md().replace(/<!-- bloques:[^>]*-->/, ""), previewImages(), B.mdBase(B.cfg.site, pagePath())).then(function (html) { box.innerHTML = html; })
        .catch(function (e) { box.innerHTML = '<p class="be-kv">' + B.escapeHtml(e.message) + "</p>"; });
    }
    function changed() {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(function () {
        renderPreview(); saveDraft(); updateCounter();
        blocks.forEach(function (b) {
          var card = root.querySelector('[data-id="' + b.id + '"] .bc-resumen');
          if (card) card.textContent = resumen(b);
        });
      }, 350);
    }

    /* --- borrador --- */
    function saveDraft() {
      try {
        var d = serialize();
        d.origen = ORIGEN;
        d.bloques.forEach(function (b, i) {
          if (b.data.imgs) b.data.imgs.forEach(function (im, k) { var src = blocks[i].data.imgs[k]; im.id = src.id; im.hasBytes = !!src.bytes; im.url = src.bytes ? null : src.url; im.type = src.type; });
          if (b.data.files) b.data.files.forEach(function (f, k) { var src = blocks[i].data.files[k]; f.id = src.id; f.hasBytes = !!src.bytes; if (src.url && !/^blob:/.test(src.url)) f.url = src.url; });
        });
        localStorage.setItem(KEY_DRAFT, JSON.stringify(d));
      } catch (e) { /* nada */ }
    }
    function restoreDraft() {
      var d;
      try { d = JSON.parse(localStorage.getItem(KEY_DRAFT) || "null"); } catch (e) { d = null; }
      if (!d) { renderPreview(); return; }
      loadData(d, d.origen, true);
    }

    function loadData(d, origen, fromDraft) {
      ORIGEN = origen || null;
      $("bc-titulo").value = d.titulo || "";
      $("bc-semana").value = d.semana || "";
      if (d.ubic) ubic.restore(d.ubic);
      else if (d.seccion !== undefined) ubic.set(d.seccion, origen ? origen.replace(/^.*\//, "").replace(/\.md$/, "") : null);
      blocks = [];
      var pending = [];
      (d.bloques || []).forEach(function (bb) {
        if (!TIPOS[bb.type]) return;
        var b = add(bb.type, {}, true);
        b.open = bb.open !== false;
        Object.keys(bb.data).forEach(function (k) {
          if (k === "imgs") {
            b.data.imgs = bb.data.imgs.map(function (im) {
              var o = { id: im.id || uid(), name: im.name, caption: im.caption || "", bytes: null, url: im.url || (B.cfg.site + (im.repoPath || "").replace(/^docs\//, "")), type: im.type, repoPath: im.repoPath, fijo: !!im.fijo };
              if (fromDraft && im.hasBytes) pending.push(idbGet(o.id).then(function (r) { if (r) { o.bytes = r.bytes; o.url = URL.createObjectURL(new Blob([r.bytes], { type: r.type })); } }));
              return o;
            });
          } else if (k === "files") {
            b.data.files = bb.data.files.map(function (f) {
              var o = { id: f.id || uid(), name: f.name, desc: f.desc || "", bytes: null, repoPath: f.repoPath, url: f.url || null, fijo: !!f.fijo };
              if (o.fijo && b.type === "pieza3d" && !o.url) o.url = B.cfg.site + (o.repoPath || "").replace(/^docs\//, "");
              if (fromDraft && f.hasBytes) pending.push(idbGet(o.id).then(function (r) { if (r) { o.bytes = r.bytes; if (/\.stl$/i.test(o.name)) o.url = URL.createObjectURL(new Blob([r.bytes], { type: "model/stl" })); } }));
              return o;
            });
          } else b.data[k] = bb.data[k];
        });
      });
      Promise.all(pending).then(function () { render(); updateRuta(); renderPreview(); });
    }

    /* --- salidas --- */
    $("bc-copiar").addEventListener("click", function () {
      navigator.clipboard.writeText(md()).then(function () { log("Markdown copiado."); }, function () { log("No pude copiar; usá Descargar .md.", true); });
    });
    $("bc-descargar").addEventListener("click", function () {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([md()], { type: "text/markdown" }));
      a.download = pagePath().replace(/^.*\//, ""); a.click();
      log("Descargado. Las fotos y archivos no van en el .md: con Publicar se suben solos.");
    });
    $("bc-abrir-texto").addEventListener("click", function () {
      if (!$("bc-titulo").value.trim()) { log("Poné un título primero.", true); return; }
      B.openNewText(pagePath(), md(), group(), $("bc-titulo").value.trim(), ubic.value());
    });
    $("bc-limpiar").addEventListener("click", function () {
      if (!confirm("¿Vaciar todos los elementos y las fotos cargadas?")) return;
      blocks = []; ORIGEN = null;
      $("bc-titulo").value = ""; $("bc-semana").value = "";
      try { localStorage.removeItem(KEY_DRAFT); } catch (e) { /* nada */ }
      idbClear();
      render(); updateRuta(); renderPreview();
      log("Vacío.");
    });

    $("bc-publicar").addEventListener("click", function () {
      var titulo = $("bc-titulo").value.trim();
      if (!titulo) { log("Falta el título de la página.", true); return; }
      if (!blocks.length) { log("Agregá al menos un elemento.", true); return; }
      if (!B.gh.token) { log("Para publicar hace falta conectar tu cuenta (pestaña Mi cuenta). Mientras tanto podés copiar o descargar el Markdown.", true); return; }
      var g = group();
      if (g.nueva && !g.name) { log("Poné el nombre de la sección nueva.", true); return; }
      var path = pagePath();
      var btn = this; btn.disabled = true; btn.textContent = "Publicando…";
      log("Revisando el repositorio…");
      B.loadNav().then(function () { return B.gh.exists(path); }).then(function (exists) {
        if (exists && !ORIGEN && !confirm("Ya existe " + path + ". ¿La reemplazo?")) throw new Error("Cancelado.");
        var files = [{ path: path, text: md() }];
        blocks.forEach(function (b) {
          (b.data.imgs || []).forEach(function (im) { if (im.bytes) files.push({ path: imgRepoPath(im), bytes: im.bytes }); });
          (b.data.files || []).forEach(function (f) { if (f.bytes) files.push({ path: fileRepoPath(f), bytes: f.bytes }); });
        });
        var y = B.navInsertAt(B.navYaml(), ubic.insertOpts(titulo, path.replace(/^docs\//, "")));
        if (y !== B.navYaml()) files.push({ path: "mkdocs.yml", text: y });
        var msg = (exists ? "Actualizo" : "Nueva página") + ": " + titulo + "\n\nArmada desde el editor de la bitácora.";
        return B.gh.commit(files, msg, function (s) { log(s + "…"); });
      }).then(function (c) {
        B.clearNav();
        ORIGEN = path;
        blocks.forEach(function (b) {
          (b.data.imgs || []).forEach(function (im) { im.bytes = null; });
          (b.data.files || []).forEach(function (f) { if (f.bytes) { f.bytes = null; if (b.type === "pieza3d") f.url = B.cfg.site + fileRepoPath(f).replace(/^docs\//, ""); } });
          (b.data.imgs || []).forEach(function (im) { if (!im.fijo) { im.repoPath = imgRepoPath(im); im.fijo = true; } });
          (b.data.files || []).forEach(function (f) { if (!f.fijo && !f.url) { f.repoPath = fileRepoPath(f); f.fijo = true; } });
        });
        idbClear(); saveDraft(); render();
        log("Publicado en el commit " + c.sha.slice(0, 7) + ". GitHub Actions reconstruye el sitio en uno o dos minutos.\n→ " + B.pageUrl(B.cfg.site, path) + "\n→ https://github.com/" + B.cfg.owner + "/" + B.cfg.repo + "/actions");
        B.reloadTree();
      }).catch(function (e) { log("No se publicó: " + e.message, true); }).then(function () { btn.disabled = false; btn.textContent = "Publicar en el sitio"; });
    });


    /* ------------------------------------------------------------------ */
    /* Importar cualquier Markdown del sitio como elementos                */
    /* ------------------------------------------------------------------ */
    function resolverRuta(rel, pagePath) {
      // ../images/x/y.jpg relativo al .md → docs/images/x/y.jpg
      if (/^(https?:|\/|blob:|data:)/.test(rel)) return null;
      var partes = pagePath.split("/"); partes.pop();
      rel.split("/").forEach(function (seg) {
        if (seg === "..") partes.pop(); else if (seg && seg !== ".") partes.push(seg);
      });
      return partes.join("/");
    }
    function imagenDesde(alt, rel, pagePath) {
      var repo = resolverRuta(rel, pagePath);
      return { id: uid(), name: rel.replace(/^.*\//, ""), caption: alt || "", bytes: null, url: repo ? B.cfg.site + repo.replace(/^docs\//, "") : rel, repoPath: repo || rel, fijo: true };
    }
    var RE_IMG = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
    var RE_LINK = /^-\s+\[([^\]]+)\]\(([^)\s]+)\)\s*(?:·\s*(.*))?$/;

    function importarMarkdown(mdText, pagePath) {
      var text = mdText.replace(/\r\n/g, "\n");
      var titulo = "", meta = "";
      var fm = text.match(/^---\n([\s\S]*?)\n---\n/);
      if (fm) { var t = fm[1].match(/^title:\s*(.+)$/m); if (t) titulo = t[1].trim().replace(/^["']|["']$/g, ""); text = text.slice(fm[0].length); }
      var lines = text.split("\n"), i = 0, nuevos = [], buffer = [];

      function flushTexto() {
        var t = buffer.join("\n").replace(/^\n+|\n+$/g, "");
        buffer = [];
        if (t.trim()) nuevos.push({ type: "texto", data: { text: t } });
      }
      function push(type, data) { flushTexto(); nuevos.push({ type: type, data: data }); }
      function hastaCierre(re) { // devuelve las líneas hasta la que cumple re (sin incluirla) y avanza
        var out = [];
        while (i < lines.length && !re.test(lines[i])) { out.push(lines[i]); i++; }
        i++; return out;
      }
      function imagenes(bloque) { return bloque.map(function (l) { return l.trim().match(RE_IMG); }).filter(Boolean).map(function (m) { return imagenDesde(m[1], m[2], pagePath); }); }

      while (i < lines.length) {
        var l = lines[i], tl = l.trim(), m;
        if (!titulo && (m = tl.match(/^#\s+(.+)$/))) { titulo = m[1].trim(); i++; continue; }
        if ((m = tl.match(/^#\s+(.+)$/)) && nuevos.length === 0 && !buffer.join("").trim()) { i++; continue; }
        if ((m = tl.match(/^<p class="meta">([\s\S]*?)<\/p>$/))) { meta = m[1].replace(/<[^>]+>/g, ""); i++; continue; }
        if (/^<!-- bloques:/.test(tl)) { i++; continue; }
        if ((m = tl.match(/^(#{2,3})\s+(.+)$/))) { push("titulo", { text: m[2].trim(), nivel: m[1].length === 3 ? "h3" : "h2" }); i++; continue; }
        if (/^<div class="carrete"/.test(tl)) { i++; push("carrete", { imgs: imagenes(hastaCierre(/^<\/div>/)) }); continue; }
        if ((m = tl.match(/^<div class="galeria\s*(dos|tres)?"/))) { i++; push("galeria", { imgs: imagenes(hastaCierre(/^<\/div>/)), cols: m[1] || "" }); continue; }
        if (/^<div class="comparar"/.test(tl)) { i++; var ci = imagenes(hastaCierre(/^<\/div>/)); push("comparar", { imgs: ci, a: ci[0] ? ci[0].caption || "Antes" : "Antes", b: ci[1] ? ci[1].caption || "Después" : "Después" }); continue; }
        if (/^<figure class="hero-shot"/.test(tl)) { i++; push("hero", { imgs: imagenes(hastaCierre(/^<\/figure>/)).slice(0, 1) }); continue; }
        if (/^<figure( markdown)?>$/.test(tl)) { i++; var fi = imagenes(hastaCierre(/^<\/figure>/)); if (fi[0]) push("imagen", { imgs: fi.slice(0, 1), grande: false }); continue; }
        if (/^<div class="datos"/.test(tl)) {
          i++; var rows = hastaCierre(/^<\/div>/).map(function (x) { return x.trim().match(/^-\s+\*\*(.+?)\*\*\s*:?\s*(.*)$/); }).filter(Boolean).map(function (x) { return { k: x[1], v: x[2].replace(/\[ver abajo\]\(#archivos\)/i, "ver abajo") }; });
          push("datos", { rows: rows }); continue;
        }
        if (/^<div class="linea"/.test(tl)) {
          i++; var rl = hastaCierre(/^<\/div>/).map(function (x) { return x.trim().match(/^-\s+\*\*(.+?)\*\*\s*[·:-]?\s*(.*)$/); }).filter(Boolean).map(function (x) { return { k: x[1], v: x[2] }; });
          push("linea", { rows: rl }); continue;
        }
        if ((m = tl.match(/^<div class="stl"([^>]*)><\/div>$/))) {
          var a = function (n) { var r = m[1].match(new RegExp(n + '="([^"]*)"')); return r ? r[1] : ""; };
          var src = a("data-src"), repo = resolverRuta(src, pagePath);
          push("pieza3d", { files: [{ id: uid(), name: a("data-nombre") || src.replace(/^.*\//, ""), desc: "", bytes: null, url: repo ? B.cfg.site + repo.replace(/^docs\//, "") : src, repoPath: repo || src, fijo: true }], caption: a("data-pie"), descarga: false });
          i++;
          // enlace de descarga justo debajo
          while (i < lines.length && !lines[i].trim()) i++;
          if (i < lines.length && RE_LINK.test(lines[i].trim()) && /\.stl\)/.test(lines[i])) { nuevos[nuevos.length - 1].data.descarga = true; i++; }
          continue;
        }
        if (/^<div class="video(-proceso)?"/.test(tl)) {
          var vb = [l]; if (!/<\/div>/.test(l)) { i++; vb = vb.concat(hastaCierre(/<\/div>/)); } else i++;
          var vm = vb.join("\n").match(/src="([^"]+)"/);
          push("video", { url: vm ? vm[1] : "" }); continue;
        }
        if ((m = tl.match(/^<span class="(ok|fail)">[^<]*<\/span>\s*(.*)$/))) { push("resultado", { ok: m[1] === "ok", text: m[2].replace(/^_|_$/g, "") }); i++; continue; }
        if ((m = tl.match(/^(!!!|\?\?\?)\s+(\w+)\s*(?:"([^"]*)")?\s*$/))) {
          i++; var nb = [];
          while (i < lines.length && (/^ {4}/.test(lines[i]) || !lines[i].trim())) { if (lines[i].trim()) nb.push(lines[i].replace(/^ {4}/, "")); else if (nb.length) nb.push(""); i++; }
          push("nota", { titulo: m[3] || m[2], tipo: m[2], text: nb.join("\n").replace(/\n+$/, "") }); continue;
        }
        if ((m = tl.match(/^```(\w*)\s*$/))) { i++; var cb = hastaCierre(/^```/); push("codigo", { lang: m[1] || "", text: cb.join("\n") }); continue; }
        if (/^\|.*\|\s*$/.test(tl) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1].trim())) {
          var celdas = function (row) { return row.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim().replace(/^\*\*|\*\*$/g, "").replace(/^`|`$/g, ""); }); };
          var cols = celdas(l); i += 2; var trows = [];
          while (i < lines.length && /^\|.*\|\s*$/.test(lines[i].trim())) { trows.push(celdas(lines[i])); i++; }
          while (cols.length < 3) cols.push(""); trows = trows.map(function (r) { while (r.length < cols.length) r.push(""); return r.slice(0, cols.length); });
          push("parametros", { cols: cols.slice(0, 3), rows: trows.map(function (r) { return r.slice(0, 3); }) }); continue;
        }
        if (RE_LINK.test(tl)) {
          var files = [];
          while (i < lines.length && (m = lines[i].trim().match(RE_LINK))) {
            var rp = resolverRuta(m[2], pagePath);
            files.push(rp ? { id: uid(), name: m[2].replace(/^.*\//, ""), desc: (m[3] || "").trim() || m[1], bytes: null, repoPath: rp, fijo: true } : { id: uid(), name: m[1], desc: (m[3] || "").trim(), url: m[2], bytes: null });
            i++;
          }
          push("archivos", { files: files }); continue;
        }
        if ((m = tl.match(RE_IMG))) { push("imagen", { imgs: [imagenDesde(m[1], m[2], pagePath)], grande: false }); i++; continue; }
        buffer.push(l); i++;
      }
      flushTexto();
      return { titulo: titulo, meta: meta, bloques: nuevos };
    }

    function cargarDesdeMarkdown(mdText, pagePath) {
      var r = importarMarkdown(mdText, pagePath);
      ORIGEN = pagePath;
      $("bc-titulo").value = r.titulo || pagePath.replace(/^.*\//, "").replace(/\.md$/, "");
      $("bc-semana").value = r.meta || "";
      var folder = (pagePath.match(/^docs\/([^/]+)\//) || [])[1];
      var g = B.groups().filter(function (x) { return x.folder === folder; })[0];
      ubic.set(g ? g.name : (folder ? null : null), pagePath.replace(/^.*\//, "").replace(/\.md$/, ""));
      blocks = [];
      r.bloques.forEach(function (bb) {
        var b = add(bb.type, {}, true);
        Object.keys(bb.data).forEach(function (k) { b.data[k] = bb.data[k]; });
        b.open = bb.type !== "texto" || (bb.data.text || "").length < 400;
      });
      render(); updateRuta(); renderPreview(); saveDraft();
      log("Página importada: " + r.bloques.length + " elementos. Los textos quedaron tal cual; las fotos y archivos ya publicados no hace falta volver a cargarlos. Al publicar se reemplaza la página " + pagePath.replace(/^docs\//, "") + ".");
    }

    /* abrir una página existente en el constructor */
    (function () {
      var sel = $("bc-abrir"), btn = $("bc-abrir-btn");
      if (!sel) return;
      function fill() {
        var prev = sel.value;
        sel.innerHTML = '<option value="">Abrir una página existente…</option>';
        (B.paginas ? B.paginas() : []).forEach(function (p) { var o = document.createElement("option"); o.value = p; o.textContent = p.replace(/^docs\//, ""); sel.appendChild(o); });
        if (prev) sel.value = prev;
      }
      fill();
      setInterval(function () { if (sel.options.length !== (B.paginas ? B.paginas().length : 0) + 1) fill(); }, 2000);
      btn.addEventListener("click", function () {
        var p = sel.value;
        if (!p) { log("Elegí la página en la lista.", true); return; }
        if (blocks.length && !confirm("¿Reemplazar lo que hay en Armar página por \u201c" + p.replace(/^docs\//, "") + "\u201d?")) return;
        log("Cargando " + p + "…");
        B.gh.getText(p).then(function (f) {
          var m = f.text.match(/<!-- bloques:([A-Za-z0-9+/=]+) -->/);
          if (m) { try { loadData(JSON.parse(B.b64ToUtf8(m[1])), p, false); saveDraft(); log("Página cargada con sus elementos originales."); return; } catch (e) { /* se importa */ } }
          cargarDesdeMarkdown(f.text, p);
        }).catch(function (e) { log("No pude cargar: " + e.message, true); });
      });
    })();

    window.BitacoraConstructor = {
      importar: function (mdText, path) {
        if (blocks.length && !confirm("¿Reemplazar lo que hay en Armar página por esta página?")) return;
        cargarDesdeMarkdown(mdText, path);
      },
      load: function (json, path) {
        if (blocks.length && !confirm("¿Reemplazar lo que hay en Armar página por esta página?")) return;
        loadData(json, path, false);
        saveDraft();
        log("Página cargada desde el repositorio. Las fotos que ya están subidas no hace falta volver a cargarlas.");
      }
    };

    /* doble clic en la vista previa: abrir y enfocar el elemento que la genera */
    $("bc-preview").addEventListener("dblclick", function (e) {
      var el = B.objetivoDe(e.target), claves = B.clavesDe(el), hallado = null;
      for (var k = 0; k < claves.length && !hallado; k++) {
        var c = claves[k];
        for (var i = 0; i < ultimasPartes.length; i++) {
          var txt = ultimasPartes[i].out.join("\n");
          if ((c.ruta && txt.indexOf(c.ruta) >= 0) || (c.texto && B.normalizar(txt).indexOf(c.texto) >= 0)) { hallado = ultimasPartes[i].id; break; }
        }
      }
      if (!hallado) { log("Ese elemento no corresponde a ningún bloque (puede ser el título o la línea de metadatos de arriba)."); $("bc-titulo").focus(); return; }
      var b = blocks.filter(function (x) { return x.id === hallado; })[0];
      if (b && !b.open) { b.open = true; render(); }
      focusBlock(hallado);
      var card = root.querySelector('[data-id="' + hallado + '"]');
      if (card) { card.classList.remove("destacado"); void card.offsetWidth; card.classList.add("destacado"); }
      e.preventDefault();
    });

    $("bc-previa-toggle").addEventListener("click", function () {
      var off = $("bc-work").classList.toggle("sin-previa");
      this.textContent = off ? "Mostrar" : "Ocultar";
      try { localStorage.setItem("bitacora.previa", off ? "0" : "1"); } catch (e) { /* nada */ }
    });
    try { if (localStorage.getItem("bitacora.previa") === "0") { $("bc-work").classList.add("sin-previa"); $("bc-previa-toggle").textContent = "Mostrar"; } } catch (e) { /* nada */ }

    updateRuta();
    restoreDraft();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  if (!window.__bitacoraConstructorPoll) window.__bitacoraConstructorPoll = setInterval(init, 500);
})();
