/* =====================================================================
   Armar página: constructor por elementos (docs/editor.md, pestaña
   "Armar página"). Cada elemento tiene su formulario; el Markdown se
   genera solo, con los componentes de fotos del sitio. Usa los helpers
   que editor.js expone en window.Bitacora.
   ===================================================================== */
(function () {
  "use strict";

  var KEY_DRAFT = "bitacora.constructor";
  var MAX_FILE = 10 * 1024 * 1024;

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
    archivos:   { nombre: "Archivos",        data: function () { return { files: [] }; } }
  };

  var ESTRUCTURAS = {
    tec: [["titulo", { text: "Objetivo" }], ["texto", {}], ["datos", {}], ["titulo", { text: "Referencias" }], ["texto", {}],
          ["titulo", { text: "Proceso" }], ["carrete", {}], ["parametros", {}], ["titulo", { text: "Resultados" }],
          ["resultado", { ok: true }], ["resultado", { ok: false }], ["comparar", {}], ["hero", {}],
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
    var nextId = 1;
    var previewTimer = null;
    var ORIGEN = null; // ruta de la página abierta desde el repositorio

    function log(msg, err) { var el = $("bc-log"); el.textContent = msg; el.classList.toggle("err", !!err); }
    function uid() { return "b" + (nextId++) + "-" + Date.now().toString(36); }

    /* --- cabecera --- */
    function fillSections() {
      var sel = $("bc-seccion"), prev = sel.value;
      sel.innerHTML = "";
      B.groups().forEach(function (g) { var o = document.createElement("option"); o.value = g.name; o.textContent = g.name; sel.appendChild(o); });
      var n = document.createElement("option"); n.value = "__nueva__"; n.textContent = "Sección nueva…"; sel.appendChild(n);
      if (prev) sel.value = prev;
      if (!sel.value && B.groups().length) sel.value = B.groups()[0].name;
    }
    fillSections();
    setInterval(function () { if ($("bc-seccion").options.length !== B.groups().length + 1) fillSections(); }, 2000);

    function group() {
      var v = $("bc-seccion").value;
      if (v === "__nueva__") { var name = $("bc-seccion-nueva").value.trim(); return { name: name, folder: B.slugify(name) || "seccion", nueva: true }; }
      return B.groups().filter(function (g) { return g.name === v; })[0] || { name: v, folder: B.slugify(v) };
    }
    function slug() { return B.slugify($("bc-titulo").value) || "pagina"; }
    function pagePath() { return ORIGEN || ("docs/" + group().folder + "/" + slug() + ".md"); }
    function updateRuta() { $("bc-ruta").textContent = pagePath(); }

    ["bc-titulo", "bc-semana", "bc-seccion-nueva"].forEach(function (id) { $(id).addEventListener("input", function () { updateRuta(); changed(); }); });
    $("bc-seccion").addEventListener("change", function () {
      $("bc-seccion-nueva").style.display = this.value === "__nueva__" ? "block" : "none";
      updateRuta(); changed();
    });

    /* --- rutas de imágenes y archivos --- */
    function imgRepoPath(im) { return "docs/images/" + group().folder + "/" + slug() + "/" + im.name; }
    function fileRepoPath(f) { return "docs/files/" + group().folder + "/" + slug() + "/" + f.name; }
    function rel(repoPath) { return B.relToImages(pagePath()) + repoPath.replace(/^docs\//, ""); }

    /* --- bloques --- */
    function add(type, extra, silent) {
      var d = TIPOS[type].data();
      Object.keys(extra || {}).forEach(function (k) { d[k] = extra[k]; });
      var b = { id: uid(), type: type, data: d };
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
      var el = root.querySelector('[data-id="' + id + '"]');
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      var f = el.querySelector("input, textarea");
      if (f) f.focus({ preventScroll: true });
    }

    root.querySelectorAll("#bc-paleta button[data-add]").forEach(function (btn) {
      btn.addEventListener("click", function () { add(btn.dataset.add); });
    });
    [["bc-plantilla-tec", "tec"], ["bc-plantilla-dis", "dis"], ["bc-plantilla-inn", "inn"], ["bc-plantilla-pro", "pro"]].forEach(function (pair) {
      $(pair[0]).addEventListener("click", function () {
        if (blocks.length && !confirm("¿Reemplazar los elementos actuales por esta estructura?")) return;
        blocks = [];
        ESTRUCTURAS[pair[1]].forEach(function (e) { add(e[0], e[1], true); });
        render(); changed();
        log("Estructura cargada. Completá los elementos y quitá los que no uses.");
      });
    });

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
      box.appendChild(grid); box.appendChild(drop); box.appendChild(fi);
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
      var drop = el("div", "be-drop", "Arrastrá los archivos acá (.f3d, .stl, .scad, .ino, .pdf…), o hacé clic");
      var fi = el("input"); fi.type = "file"; fi.multiple = true; fi.style.display = "none";
      drop.addEventListener("click", function () { fi.click(); });
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
      drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });
      fi.addEventListener("change", function () { addFiles(fi.files); fi.value = ""; });
      function addFiles(files) {
        Array.prototype.forEach.call(files, function (file) {
          if (file.size > MAX_FILE) { alert(file.name + " pesa " + B.fmtSize(file.size) + ". Más de 10 MB: consultá opciones de compresión o almacenamiento antes de subirlo."); return; }
          file.arrayBuffer().then(function (buf) {
            var name = B.slugify(file.name.replace(/\.[^.]+$/, "")) + (file.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
            var f = { id: uid(), name: name, desc: "", bytes: new Uint8Array(buf) };
            b.data.files.push(f);
            idbPut(f.id, f.bytes, file.type || "application/octet-stream");
            draw(); changed();
          });
        });
      }
      var list = el("div", "bc-rows");
      function draw() {
        list.innerHTML = "";
        b.data.files.forEach(function (f, i) {
          var row = el("div", "bc-row");
          var nm = el("span", "bc-filename", B.escapeHtml(f.name) + (f.bytes ? " · " + B.fmtSize(f.bytes.length) : " · ya en el repositorio"));
          row.appendChild(nm);
          row.appendChild(input(f.desc, "Descripción (editable original, exportación…)", function (v) { f.desc = v; }));
          var rm = el("button", "small", "×"); rm.type = "button"; rm.addEventListener("click", function () { b.data.files.splice(i, 1); draw(); changed(); });
          row.appendChild(rm);
          list.appendChild(row);
        });
      }
      draw();
      box.appendChild(list); box.appendChild(drop); box.appendChild(fi);
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
      }
      return w;
    }

    function render() {
      var box = $("bc-bloques");
      box.innerHTML = "";
      if (!blocks.length) { box.appendChild(el("p", "be-kv bc-vacio", "Todavía no hay elementos. Elegí uno arriba, o empezá con una estructura.")); return; }
      blocks.forEach(function (b, i) {
        var card = el("div", "bc-bloque"); card.dataset.id = b.id;
        var head = el("div", "bc-bloque-head");
        head.appendChild(el("span", "bc-num", String(i + 1)));
        head.appendChild(el("span", "bc-tipo", TIPOS[b.type].nombre));
        var btns = el("span", "bc-bloque-btns");
        var up = el("button", "small", "↑"); up.type = "button"; up.title = "Subir"; up.addEventListener("click", function () { move(b.id, -1); });
        var dn = el("button", "small", "↓"); dn.type = "button"; dn.title = "Bajar"; dn.addEventListener("click", function () { move(b.id, 1); });
        var rm = el("button", "small", "×"); rm.type = "button"; rm.title = "Quitar"; rm.addEventListener("click", function () { remove(b.id); });
        btns.appendChild(up); btns.appendChild(dn); btns.appendChild(rm);
        head.appendChild(btns);
        card.appendChild(head);
        card.appendChild(form(b));
        box.appendChild(card);
      });
    }

    /* --- Markdown --- */
    function imgLine(im) { return "![" + (im.caption || "") + "](" + rel(imgRepoPath(im)) + ")"; }
    function md() {
      var titulo = $("bc-titulo").value.trim() || "Sin título";
      var out = ["---", "title: " + B.yamlQuote(titulo), "---", "", "# " + titulo, ""];
      var meta = [$("bc-semana").value.trim(), group().name].filter(Boolean).join(" · ");
      if (meta) out.push('<p class="meta">' + B.escapeHtml(meta) + "</p>", "");
      var partes = [];
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
          case "archivos": if (d.files.length) out.push(d.files.map(function (f) { return "- [" + f.name + "](" + rel(fileRepoPath(f)) + ")" + (f.desc ? " · " + f.desc : ""); }).join("\n"), ""); break;
        }
        partes.push({ type: b.type, nivel: b.type === "titulo" ? (d.nivel === "h3" ? 3 : 2) : 0, out: out });
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
        titulo: $("bc-titulo").value, semana: $("bc-semana").value, seccion: group().name,
        bloques: blocks.map(function (b) {
          var d = {};
          Object.keys(b.data).forEach(function (k) {
            if (k === "imgs") d.imgs = b.data.imgs.map(function (im) { return { name: im.name, caption: im.caption || "", repoPath: imgRepoPath(im) }; });
            else if (k === "files") d.files = b.data.files.map(function (f) { return { name: f.name, desc: f.desc || "", repoPath: fileRepoPath(f) }; });
            else d[k] = b.data[k];
          });
          return { type: b.type, data: d };
        })
      };
    }

    /* --- vista previa --- */
    function previewImages() {
      var list = [];
      blocks.forEach(function (b) { (b.data.imgs || []).forEach(function (im) { if (im.url) list.push({ rel: rel(imgRepoPath(im)), url: im.url }); }); });
      return list;
    }
    function renderPreview() {
      var box = $("bc-preview");
      if (!blocks.length && !$("bc-titulo").value) { box.innerHTML = '<p class="be-kv">La página se va armando acá.</p>'; return; }
      B.renderMd(md().replace(/<!-- bloques:[^>]*-->/, ""), previewImages(), B.pageUrl(B.cfg.site, pagePath())).then(function (html) { box.innerHTML = html; })
        .catch(function (e) { box.innerHTML = '<p class="be-kv">' + B.escapeHtml(e.message) + "</p>"; });
    }
    function changed() {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(function () { renderPreview(); saveDraft(); }, 350);
    }

    /* --- borrador --- */
    function saveDraft() {
      try {
        var d = serialize();
        d.origen = ORIGEN;
        d.bloques.forEach(function (b, i) {
          if (b.data.imgs) b.data.imgs.forEach(function (im, k) { var src = blocks[i].data.imgs[k]; im.id = src.id; im.hasBytes = !!src.bytes; im.url = src.bytes ? null : src.url; im.type = src.type; });
          if (b.data.files) b.data.files.forEach(function (f, k) { var src = blocks[i].data.files[k]; f.id = src.id; f.hasBytes = !!src.bytes; });
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
      fillSections();
      if (d.seccion) {
        if (B.groups().some(function (g) { return g.name === d.seccion; })) $("bc-seccion").value = d.seccion;
        else { $("bc-seccion").value = "__nueva__"; $("bc-seccion-nueva").value = d.seccion; $("bc-seccion-nueva").style.display = "block"; }
      }
      blocks = [];
      var pending = [];
      (d.bloques || []).forEach(function (bb) {
        if (!TIPOS[bb.type]) return;
        var b = add(bb.type, {}, true);
        Object.keys(bb.data).forEach(function (k) {
          if (k === "imgs") {
            b.data.imgs = bb.data.imgs.map(function (im) {
              var o = { id: im.id || uid(), name: im.name, caption: im.caption || "", bytes: null, url: im.url || (B.cfg.site + (im.repoPath || "").replace(/^docs\//, "")), type: im.type };
              if (fromDraft && im.hasBytes) pending.push(idbGet(o.id).then(function (r) { if (r) { o.bytes = r.bytes; o.url = URL.createObjectURL(new Blob([r.bytes], { type: r.type })); } }));
              return o;
            });
          } else if (k === "files") {
            b.data.files = bb.data.files.map(function (f) {
              var o = { id: f.id || uid(), name: f.name, desc: f.desc || "", bytes: null, repoPath: f.repoPath };
              if (fromDraft && f.hasBytes) pending.push(idbGet(o.id).then(function (r) { if (r) o.bytes = r.bytes; }));
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
      B.openNewText(pagePath(), md(), group(), $("bc-titulo").value.trim());
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
      if (!g.name) { log("Poné el nombre de la sección nueva.", true); return; }
      var path = pagePath();
      var btn = this; btn.disabled = true;
      log("Revisando el repositorio…");
      B.loadNav().then(function () { return B.gh.exists(path); }).then(function (exists) {
        if (exists && !ORIGEN && !confirm("Ya existe " + path + ". ¿La reemplazo?")) throw new Error("Cancelado.");
        var files = [{ path: path, text: md() }];
        blocks.forEach(function (b) {
          (b.data.imgs || []).forEach(function (im) { if (im.bytes) files.push({ path: imgRepoPath(im), bytes: im.bytes }); });
          (b.data.files || []).forEach(function (f) { if (f.bytes) files.push({ path: fileRepoPath(f), bytes: f.bytes }); });
        });
        var y = B.navInsert(B.navYaml(), g.name, titulo, path.replace(/^docs\//, ""));
        if (y !== B.navYaml()) files.push({ path: "mkdocs.yml", text: y });
        var msg = (exists ? "Actualizo" : "Nueva página") + ": " + titulo + "\n\nArmada desde el editor de la bitácora.";
        return B.gh.commit(files, msg, function (s) { log(s + "…"); });
      }).then(function (c) {
        B.clearNav();
        ORIGEN = path;
        blocks.forEach(function (b) {
          (b.data.imgs || []).forEach(function (im) { im.bytes = null; });
          (b.data.files || []).forEach(function (f) { f.bytes = null; });
        });
        idbClear(); saveDraft(); render();
        log("Publicado en el commit " + c.sha.slice(0, 7) + ". GitHub Actions reconstruye el sitio en uno o dos minutos.\n→ " + B.pageUrl(B.cfg.site, path) + "\n→ https://github.com/" + B.cfg.owner + "/" + B.cfg.repo + "/actions");
        B.reloadTree();
      }).catch(function (e) { log("No se publicó: " + e.message, true); }).then(function () { btn.disabled = false; });
    });

    window.BitacoraConstructor = {
      load: function (json, path) {
        if (blocks.length && !confirm("¿Reemplazar lo que hay en Armar página por esta página?")) return;
        loadData(json, path, false);
        saveDraft();
        log("Página cargada desde el repositorio. Las fotos que ya están subidas no hace falta volver a cargarlas.");
      }
    };

    updateRuta();
    restoreDraft();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  if (!window.__bitacoraConstructorPoll) window.__bitacoraConstructorPoll = setInterval(init, 500);
})();
