/* =====================================================================
   Editor de bitácora · docs/editor.md
   Escribe entradas con la estructura de la guía, comprime imágenes y
   publica directo al repositorio con la API de GitHub (un solo commit).
   Solo funciona con un token personal del dueño del repositorio.
   ===================================================================== */
(function () {
  "use strict";

  var API = "https://api.github.com";
  var MARKED_SRC = "https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js";
  var KEY_TOKEN = "bitacora.token";
  var KEY_DRAFT = "bitacora.borrador";
  var MAX_SIDE = 1600;

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */
  function $(id) { return document.getElementById(id); }

  function slugify(s) {
    return (s || "")
      .toString()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  function today() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    return bytesToB64(bytes);
  }

  function bytesToB64(bytes) {
    var bin = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function b64ToUtf8(b64) {
    var bin = atob(b64.replace(/\n/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function yamlQuote(s) {
    return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  function relToImages(pagePath) {
    // pagePath: docs/tecnicos/entrada.md → "../" por cada carpeta debajo de docs
    var parts = pagePath.replace(/^docs\//, "").split("/");
    var depth = parts.length - 1;
    return new Array(depth + 1).join("../");
  }

  function dirname(p) {
    var i = p.lastIndexOf("/");
    return i < 0 ? "" : p.slice(0, i);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function loadMarked() {
    if (window.marked) return Promise.resolve(window.marked);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = MARKED_SRC;
      s.onload = function () { resolve(window.marked); };
      s.onerror = function () { reject(new Error("No pude cargar la vista previa (sin conexión)")); };
      document.head.appendChild(s);
    });
  }

  function renderMd(md, images) {
    return loadMarked().then(function (marked) {
      var body = md.replace(/^---[\s\S]*?---\n/, "");
      var html = marked.parse(body);
      (images || []).forEach(function (im) {
        html = html.split(im.rel).join(im.url);
      });
      return html;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Imágenes: redimensionar y comprimir en el navegador                 */
  /* ------------------------------------------------------------------ */
  function processImage(file) {
    var keepOriginal = /gif|svg/.test(file.type);
    if (keepOriginal) {
      return file.arrayBuffer().then(function (buf) {
        return { name: safeName(file.name), bytes: new Uint8Array(buf), type: file.type, url: URL.createObjectURL(file) };
      });
    }
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
        var c = document.createElement("canvas");
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        var isPng = file.type === "image/png";
        var mime = isPng ? "image/png" : "image/jpeg";
        c.toBlob(function (blob) {
          if (!blob) return reject(new Error("No pude procesar " + file.name));
          blob.arrayBuffer().then(function (buf) {
            var base = safeName(file.name).replace(/\.[^.]+$/, "");
            resolve({
              name: base + (isPng ? ".png" : ".jpg"),
              bytes: new Uint8Array(buf),
              type: mime,
              url: URL.createObjectURL(blob),
              w: c.width, h: c.height
            });
          });
        }, mime, 0.85);
        URL.revokeObjectURL(url);
      };
      img.onerror = function () { reject(new Error("Formato no soportado: " + file.name)); };
      img.src = url;
    });
  }

  function safeName(name) {
    var ext = (name.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
    var base = slugify(name.replace(/\.[^.]+$/, "")) || "imagen";
    return base + ext;
  }

  function fmtSize(n) {
    return n > 1024 * 1024 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB";
  }

  /* ------------------------------------------------------------------ */
  /* GitHub API                                                          */
  /* ------------------------------------------------------------------ */
  function GitHub(cfg) {
    this.cfg = cfg;
    this.token = null;
    this.user = null;
  }

  GitHub.prototype.api = function (path, opts) {
    opts = opts || {};
    var headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (this.token) headers.Authorization = "Bearer " + this.token;
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch(API + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 204) return {};
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var msg = (data && data.message) || r.statusText;
          var err = new Error(r.status + " · " + msg);
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  };

  GitHub.prototype.repoPath = function () {
    return "/repos/" + this.cfg.owner + "/" + this.cfg.repo;
  };

  GitHub.prototype.verify = function () {
    var self = this;
    return self.api("/user").then(function (u) {
      self.user = u.login;
      return self.api(self.repoPath());
    }).then(function (repo) {
      if (!repo.permissions || !repo.permissions.push) {
        throw new Error("El token no tiene permiso de escritura sobre " + self.cfg.owner + "/" + self.cfg.repo);
      }
      return self.user;
    });
  };

  GitHub.prototype.getText = function (path) {
    return this.api(this.repoPath() + "/contents/" + encodePath(path) + "?ref=" + this.cfg.branch)
      .then(function (f) { return { text: b64ToUtf8(f.content), sha: f.sha }; });
  };

  GitHub.prototype.exists = function (path) {
    return this.api(this.repoPath() + "/contents/" + encodePath(path) + "?ref=" + this.cfg.branch)
      .then(function () { return true; }, function (e) { if (e.status === 404) return false; throw e; });
  };

  GitHub.prototype.tree = function () {
    return this.api(this.repoPath() + "/git/trees/" + this.cfg.branch + "?recursive=1")
      .then(function (t) { return t.tree.filter(function (e) { return e.type === "blob"; }).map(function (e) { return e.path; }); });
  };

  /* files: [{path, text} | {path, bytes} | {path, remove:true}] → un commit */
  GitHub.prototype.commit = function (files, message, onStep) {
    var self = this, base = self.repoPath(), parentSha, baseTree;
    onStep = onStep || function () {};
    return self.api(base + "/git/ref/heads/" + self.cfg.branch).then(function (ref) {
      parentSha = ref.object.sha;
      return self.api(base + "/git/commits/" + parentSha);
    }).then(function (c) {
      baseTree = c.tree.sha;
      var entries = [];
      return files.reduce(function (p, f) {
        return p.then(function () {
          if (f.remove) {
            entries.push({ path: f.path, mode: "100644", type: "blob", sha: null });
            return;
          }
          onStep("Subiendo " + f.path);
          var body = f.bytes
            ? { content: bytesToB64(f.bytes), encoding: "base64" }
            : { content: f.text, encoding: "utf-8" };
          return self.api(base + "/git/blobs", { method: "POST", body: body }).then(function (b) {
            entries.push({ path: f.path, mode: "100644", type: "blob", sha: b.sha });
          });
        });
      }, Promise.resolve()).then(function () { return entries; });
    }).then(function (entries) {
      onStep("Armando el commit");
      return self.api(base + "/git/trees", { method: "POST", body: { base_tree: baseTree, tree: entries } });
    }).then(function (t) {
      return self.api(base + "/git/commits", { method: "POST", body: { message: message, tree: t.sha, parents: [parentSha] } });
    }).then(function (c) {
      return self.api(base + "/git/refs/heads/" + self.cfg.branch, { method: "PATCH", body: { sha: c.sha, force: false } })
        .then(function () { return c; });
    });
  };

  function encodePath(p) {
    return p.split("/").map(encodeURIComponent).join("/");
  }

  /* ------------------------------------------------------------------ */
  /* mkdocs.yml: leer secciones del nav e insertar páginas               */
  /* ------------------------------------------------------------------ */
  function navBlock(yaml) {
    var lines = yaml.split("\n");
    var start = -1, end = lines.length;
    for (var i = 0; i < lines.length; i++) {
      if (start < 0 && /^nav:\s*$/.test(lines[i])) { start = i; continue; }
      if (start >= 0 && i > start && /^\S/.test(lines[i])) { end = i; break; }
    }
    return { lines: lines, start: start, end: end };
  }

  function navGroups(yaml) {
    var nb = navBlock(yaml), groups = [];
    if (nb.start < 0) return groups;
    for (var i = nb.start + 1; i < nb.end; i++) {
      var m = nb.lines[i].match(/^  - (.+?):\s*$/);
      if (!m) continue;
      var name = m[1].replace(/^["']|["']$/g, "");
      var folder = null;
      for (var j = i + 1; j < nb.end; j++) {
        if (!/^ {6}/.test(nb.lines[j])) break;
        var c = nb.lines[j].match(/^ {6}- .+?:\s*(\S+)\s*$/);
        if (c) { folder = dirname(c[1]); break; }
      }
      groups.push({ name: name, line: i, folder: folder });
    }
    return groups;
  }

  function navInsert(yaml, groupName, title, relPath) {
    var nb = navBlock(yaml);
    if (nb.start < 0) throw new Error("No encontré el bloque nav: en mkdocs.yml");
    if (yaml.indexOf(": " + relPath) >= 0) return yaml; // ya está en el menú
    var entry = "      - " + yamlQuote(title) + ": " + relPath;
    var groups = navGroups(yaml);
    var g = groups.filter(function (x) { return x.name === groupName; })[0];
    var lines = nb.lines;
    if (g) {
      var k = g.line + 1;
      while (k < nb.end && /^ {6}/.test(lines[k])) k++;
      lines.splice(k, 0, entry);
    } else {
      // sección nueva: antes de "Editor" si existe, si no al final del nav
      var pos = nb.end;
      for (var i = nb.start + 1; i < nb.end; i++) {
        if (/^  - Editor:/.test(lines[i])) { pos = i; break; }
      }
      lines.splice(pos, 0, "  - " + yamlQuote(groupName) + ":", entry);
    }
    return lines.join("\n");
  }

  /* ------------------------------------------------------------------ */
  /* Markdown de la entrada                                              */
  /* ------------------------------------------------------------------ */
  function buildMarkdown(f, images, pagePath) {
    var rel = relToImages(pagePath);
    var out = [];
    out.push("---");
    out.push("title: " + yamlQuote(f.titulo));
    out.push("---");
    out.push("");
    out.push("# " + f.titulo);
    out.push("");
    var meta = [f.semana, f.fecha, f.seccion].filter(Boolean).join(" · ");
    if (meta) { out.push('<p class="meta">' + escapeHtml(meta) + "</p>"); out.push(""); }

    var proceso = f.proceso || "";
    var used = {};
    images.forEach(function (im) { if (proceso.indexOf(im.rel) >= 0) used[im.rel] = true; });
    var sueltas = images.filter(function (im) { return !used[im.rel]; });

    function section(h, body) {
      if (!body || !body.trim()) return;
      out.push("## " + h); out.push(""); out.push(body.trim()); out.push("");
    }

    section("Introducción", f.intro);
    section("Investigación y referencias", f.investigacion);
    if (proceso.trim() || sueltas.length) {
      out.push("## Proceso paso a paso"); out.push("");
      if (proceso.trim()) { out.push(proceso.trim()); out.push(""); }
      sueltas.forEach(function (im) { out.push(figure(im)); out.push(""); });
    }
    if ((f.ok || "").trim() || (f.fail || "").trim()) {
      out.push("## Resultados"); out.push("");
      if ((f.ok || "").trim()) { out.push("### Lo que funcionó"); out.push(""); out.push(f.ok.trim()); out.push(""); }
      if ((f.fail || "").trim()) { out.push("### Lo que falló"); out.push(""); out.push(f.fail.trim()); out.push(""); }
    }
    section("Reflexión", f.reflexion);
    section("Archivos", f.archivos);
    section("Atribución y uso de IA", f.ia);
    return out.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function figure(im) {
    return '<figure markdown>\n  ![' + (im.caption || im.name) + "](" + im.rel + ")\n  <figcaption>" + escapeHtml(im.caption || "") + "</figcaption>\n</figure>";
  }

  /* ------------------------------------------------------------------ */
  /* Interfaz                                                            */
  /* ------------------------------------------------------------------ */
  function init() {
    var root = $("bitacora-editor");
    if (!root || root.dataset.ready) return;
    root.dataset.ready = "1";

    var cfg = {
      owner: root.dataset.owner,
      repo: root.dataset.repo,
      branch: root.dataset.branch || "main",
      site: root.dataset.site || ""
    };
    var gh = new GitHub(cfg);
    var navYaml = null;       // texto de mkdocs.yml
    var groups = [];          // secciones del menú
    var imgsNueva = [];       // imágenes de la entrada nueva
    var imgsEdit = [];        // imágenes para el archivo en edición
    var editFile = null;      // {path, sha}
    var treePaths = [];

    /* --- paneles --- */
    root.querySelectorAll(".be-toolbar [data-panel]").forEach(function (b) {
      b.addEventListener("click", function () {
        root.querySelectorAll(".be-toolbar [data-panel]").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        root.querySelectorAll(".be-panel").forEach(function (p) { p.classList.toggle("active", p.dataset.panel === b.dataset.panel); });
      });
    });

    function log(id, msg, err) {
      var el = $(id);
      el.textContent = msg;
      el.classList.toggle("err", !!err);
    }

    function setStatus(txt, on) {
      var s = $("be-status");
      s.textContent = txt;
      s.classList.toggle("on", !!on);
    }

    /* --- token --- */
    function storedToken() {
      try { return localStorage.getItem(KEY_TOKEN) || sessionStorage.getItem(KEY_TOKEN); } catch (e) { return null; }
    }
    function storeToken(t, remember) {
      try {
        localStorage.removeItem(KEY_TOKEN); sessionStorage.removeItem(KEY_TOKEN);
        (remember ? localStorage : sessionStorage).setItem(KEY_TOKEN, t);
      } catch (e) { /* modo privado */ }
    }

    function connect(token) {
      gh.token = token;
      setStatus("Conectando…", false);
      return gh.verify().then(function (login) {
        setStatus("Conectado · " + login, true);
        log("be-log3", "Conectado como " + login + " con permiso de escritura en " + cfg.owner + "/" + cfg.repo + ".");
        return loadNav().then(loadTree);
      }).catch(function (e) {
        gh.token = null;
        setStatus("Sin conexión", false);
        log("be-log3", "No pude conectar: " + e.message, true);
      });
    }

    $("be-conectar").addEventListener("click", function () {
      var t = $("be-token").value.trim();
      if (!t) { log("be-log3", "Pegá el token primero.", true); return; }
      storeToken(t, $("be-recordar").checked);
      connect(t);
    });

    $("be-olvidar").addEventListener("click", function () {
      try { localStorage.removeItem(KEY_TOKEN); sessionStorage.removeItem(KEY_TOKEN); } catch (e) { /* nada */ }
      gh.token = null; gh.user = null;
      $("be-token").value = "";
      setStatus("Sin conexión", false);
      log("be-log3", "Token borrado de este navegador.");
    });

    /* --- nav / secciones --- */
    function fillSections() {
      var sel = $("be-seccion");
      var prev = sel.value;
      sel.innerHTML = "";
      groups.forEach(function (g) {
        var o = document.createElement("option");
        o.value = g.name; o.textContent = g.name; sel.appendChild(o);
      });
      var n = document.createElement("option");
      n.value = "__nueva__"; n.textContent = "Sección nueva…"; sel.appendChild(n);
      if (prev) sel.value = prev;
      if (!sel.value && groups.length) sel.value = groups[0].name;
      updateRuta();
    }

    function loadNav() {
      return gh.getText("mkdocs.yml").then(function (f) {
        navYaml = f.text;
        groups = navGroups(navYaml).filter(function (g) { return g.folder; });
        fillSections();
      });
    }

    // Sin conexión, igual ofrecemos las secciones conocidas del sitio
    groups = [
      { name: "Tecnología y Fabricación", folder: "tecnicos" },
      { name: "Diseño", folder: "diseno" },
      { name: "Innovación", folder: "innovacion" },
      { name: "Proyecto Integrador", folder: "proyecto" },
      { name: "Referencias", folder: "ref" }
    ];
    fillSections();

    $("be-seccion").addEventListener("change", function () {
      $("be-seccion-nueva").style.display = this.value === "__nueva__" ? "block" : "none";
      updateRuta();
    });
    $("be-seccion-nueva").addEventListener("input", updateRuta);

    function currentGroup() {
      var v = $("be-seccion").value;
      if (v === "__nueva__") {
        var name = $("be-seccion-nueva").value.trim();
        return { name: name, folder: slugify(name), nueva: true };
      }
      return groups.filter(function (g) { return g.name === v; })[0] || { name: v, folder: slugify(v) };
    }

    function pagePath() {
      var g = currentGroup();
      var slug = $("be-slug").value.trim() || slugify($("be-titulo").value) || "entrada";
      return "docs/" + (g.folder || "bitacora") + "/" + slug + ".md";
    }

    function updateRuta() {
      $("be-ruta").textContent = pagePath();
      // actualizar rutas relativas de las imágenes
      imgsNueva.forEach(function (im) { im.rel = imageRel(im, pagePath(), currentGroup()); });
    }

    function imageRel(im, pPath, g) {
      var slug = pPath.replace(/^.*\//, "").replace(/\.md$/, "");
      im.repoPath = "docs/images/" + (g.folder || "bitacora") + "/" + slug + "/" + im.name;
      return relToImages(pPath) + im.repoPath.replace(/^docs\//, "");
    }

    /* --- borrador --- */
    var fields = ["titulo", "fecha", "semana", "slug", "intro", "investigacion", "proceso", "ok", "fail", "reflexion", "archivos", "ia", "seccion-nueva"];
    function readForm() {
      var f = {};
      fields.forEach(function (k) { f[k] = $("be-" + k).value; });
      f.seccion = currentGroup().name;
      return f;
    }
    function saveDraft() {
      try {
        var f = readForm(); f.seccionSel = $("be-seccion").value;
        localStorage.setItem(KEY_DRAFT, JSON.stringify(f));
      } catch (e) { /* nada */ }
    }
    function restoreDraft() {
      try {
        var f = JSON.parse(localStorage.getItem(KEY_DRAFT) || "null");
        if (!f) return;
        fields.forEach(function (k) { if (f[k] != null) $("be-" + k).value = f[k]; });
        if (f.seccionSel) { $("be-seccion").value = f.seccionSel; $("be-seccion").dispatchEvent(new Event("change")); }
      } catch (e) { /* nada */ }
    }
    fields.forEach(function (k) { $("be-" + k).addEventListener("input", saveDraft); });
    $("be-seccion").addEventListener("change", saveDraft);
    $("be-titulo").addEventListener("input", function () {
      if (!$("be-slug").dataset.manual) $("be-slug").value = slugify(this.value);
      updateRuta();
    });
    $("be-slug").addEventListener("input", function () { this.dataset.manual = this.value ? "1" : ""; updateRuta(); });
    if (!$("be-fecha").value) $("be-fecha").value = today();
    restoreDraft();
    updateRuta();

    $("be-limpiar").addEventListener("click", function () {
      if (!confirm("¿Borrar el formulario y las imágenes cargadas?")) return;
      fields.forEach(function (k) { $("be-" + k).value = ""; });
      $("be-slug").dataset.manual = "";
      $("be-fecha").value = today();
      imgsNueva = []; renderImages("be-images", imgsNueva, "be-proceso");
      try { localStorage.removeItem(KEY_DRAFT); } catch (e) { /* nada */ }
      $("be-preview").style.display = "none";
      log("be-log", "Formulario vacío.");
    });

    /* --- imágenes --- */
    function setupDrop(dropId, inputId, list, listId, textareaId, relFn) {
      var drop = $(dropId), input = $(inputId);
      drop.addEventListener("click", function () { input.click(); });
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
      drop.addEventListener("drop", function (e) {
        e.preventDefault(); drop.classList.remove("over");
        addFiles(e.dataTransfer.files);
      });
      input.addEventListener("change", function () { addFiles(input.files); input.value = ""; });

      function addFiles(files) {
        Array.prototype.forEach.call(files, function (file) {
          if (!/^image\//.test(file.type)) return;
          processImage(file).then(function (im) {
            im.caption = "";
            im.original = file.size;
            if (list.some(function (x) { return x.name === im.name; })) {
              im.name = im.name.replace(/(\.[^.]+)$/, "-" + Date.now().toString(36) + "$1");
            }
            im.rel = relFn(im);
            list.push(im);
            renderImages(listId, list, textareaId);
          }).catch(function (e) { alert(e.message); });
        });
      }
    }

    function renderImages(listId, list, textareaId) {
      var box = $(listId);
      box.innerHTML = "";
      list.forEach(function (im, i) {
        var fig = document.createElement("figure");
        fig.innerHTML =
          '<img src="' + im.url + '" alt="">' +
          "<figcaption>" + escapeHtml(im.name) + " · " + fmtSize(im.bytes.length) +
          (im.original ? " (antes " + fmtSize(im.original) + ")" : "") + "</figcaption>" +
          '<input type="text" placeholder="Pie de foto" value="' + escapeHtml(im.caption || "") + '" style="margin-top:.4rem">' +
          '<button type="button" class="small">Insertar en el texto</button>' +
          '<button type="button" class="small">Quitar</button>';
        var inp = fig.querySelector("input");
        inp.addEventListener("input", function () { im.caption = inp.value; });
        var btns = fig.querySelectorAll("button");
        btns[0].addEventListener("click", function () { insertAtCursor($(textareaId), "\n" + figure(im) + "\n"); });
        btns[1].addEventListener("click", function () { list.splice(i, 1); renderImages(listId, list, textareaId); });
        box.appendChild(fig);
      });
    }

    function insertAtCursor(ta, text) {
      var s = ta.selectionStart || ta.value.length, e = ta.selectionEnd || s;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
      ta.selectionStart = ta.selectionEnd = s + text.length;
      ta.focus();
      ta.dispatchEvent(new Event("input"));
    }

    setupDrop("be-drop", "be-files", imgsNueva, "be-images", "be-proceso", function (im) {
      return imageRel(im, pagePath(), currentGroup());
    });
    setupDrop("be-drop2", "be-files2", imgsEdit, "be-images2", "be-contenido", function (im) {
      var p = editFile ? editFile.path : "docs/x.md";
      var dir = dirname(p).replace(/^docs\/?/, "") || "inicio";
      im.repoPath = "docs/images/" + dir + "/" + im.name;
      return relToImages(p) + im.repoPath.replace(/^docs\//, "");
    });

    /* --- vista previa / copiar / descargar --- */
    function currentMarkdown() {
      return buildMarkdown(readForm(), imgsNueva, pagePath());
    }

    $("be-previsualizar").addEventListener("click", function () {
      var box = $("be-preview");
      renderMd(currentMarkdown(), imgsNueva).then(function (html) {
        box.innerHTML = html; box.style.display = "block";
        box.scrollIntoView({ behavior: "smooth", block: "start" });
      }).catch(function (e) { log("be-log", e.message, true); });
    });

    $("be-copiar").addEventListener("click", function () {
      navigator.clipboard.writeText(currentMarkdown()).then(function () {
        log("be-log", "Markdown copiado. Pegalo en " + pagePath() + " y agregá la página al nav de mkdocs.yml.");
      }, function () { log("be-log", "No pude copiar; usá Descargar .md.", true); });
    });

    $("be-descargar").addEventListener("click", function () {
      var blob = new Blob([currentMarkdown()], { type: "text/markdown" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = pagePath().replace(/^.*\//, "");
      a.click();
      log("be-log", "Descargado. Las imágenes cargadas no van en el .md: subilas a mano a " + (imgsNueva[0] ? dirname(imgsNueva[0].repoPath) : "docs/images/…") + ".");
    });

    /* --- publicar entrada nueva --- */
    $("be-publicar").addEventListener("click", function () {
      var f = readForm();
      if (!f.titulo.trim()) { log("be-log", "Falta el título.", true); return; }
      if (!gh.token) { log("be-log", "Primero conectá tu cuenta (pestaña Mi cuenta). Mientras tanto podés copiar o descargar el Markdown.", true); return; }
      var g = currentGroup();
      if (!g.name) { log("be-log", "Poné el nombre de la sección nueva.", true); return; }
      var path = pagePath();
      var btn = this; btn.disabled = true;
      log("be-log", "Revisando el repositorio…");

      var chain = loadNav().then(function () { return gh.exists(path); }).then(function (exists) {
        if (exists && !confirm("Ya existe " + path + ". ¿La reemplazo?")) throw new Error("Cancelado.");
        updateRuta();
        var md = buildMarkdown(f, imgsNueva, path);
        var files = [{ path: path, text: md }];
        imgsNueva.forEach(function (im) { files.push({ path: im.repoPath, bytes: im.bytes }); });
        var newYaml = navInsert(navYaml, g.name, f.titulo.trim(), path.replace(/^docs\//, ""));
        if (newYaml !== navYaml) files.push({ path: "mkdocs.yml", text: newYaml });
        var msg = (exists ? "Actualizo" : "Nueva entrada") + ": " + f.titulo.trim() + "\n\nPublicado desde el editor de la bitácora.";
        return gh.commit(files, msg, function (s) { log("be-log", s + "…"); });
      });

      chain.then(function (c) {
        navYaml = null;
        var url = cfg.site + path.replace(/^docs\//, "").replace(/\.md$/, "/");
        log("be-log", "Publicado en el commit " + c.sha.slice(0, 7) + ". GitHub Actions reconstruye el sitio en uno o dos minutos.\n→ " + url + "\n→ https://github.com/" + cfg.owner + "/" + cfg.repo + "/actions");
        try { localStorage.removeItem(KEY_DRAFT); } catch (e) { /* nada */ }
        imgsNueva.splice(0, imgsNueva.length); renderImages("be-images", imgsNueva, "be-proceso");
        return loadTree();
      }).catch(function (e) {
        log("be-log", "No se publicó: " + e.message, true);
      }).then(function () { btn.disabled = false; });
    });

    /* --- editar archivo existente --- */
    var EDITABLE = /\.(md|yml|yaml|css|js|txt|html|csv|svg)$/i;

    function loadTree() {
      if (!gh.token) return Promise.resolve();
      return gh.tree().then(function (paths) {
        treePaths = paths.filter(function (p) { return (p.indexOf("docs/") === 0 || p === "mkdocs.yml") && EDITABLE.test(p); }).sort();
        var sel = $("be-archivo");
        var prev = sel.value;
        sel.innerHTML = '<option value="">Elegí un archivo…</option>';
        treePaths.forEach(function (p) {
          var o = document.createElement("option"); o.value = p; o.textContent = p; sel.appendChild(o);
        });
        if (prev && treePaths.indexOf(prev) >= 0) sel.value = prev;
      }).catch(function (e) { log("be-log2", "No pude listar los archivos: " + e.message, true); });
    }

    $("be-recargar").addEventListener("click", function () {
      if (!gh.token) { log("be-log2", "Conectate primero (pestaña Mi cuenta).", true); return; }
      loadTree().then(function () { log("be-log2", "Lista actualizada."); });
    });

    $("be-archivo").addEventListener("change", function () {
      var p = this.value;
      editFile = null; $("be-contenido").value = ""; $("be-ver").style.display = "none";
      imgsEdit.splice(0, imgsEdit.length); renderImages("be-images2", imgsEdit, "be-contenido");
      $("be-preview2").style.display = "none";
      if (!p) return;
      log("be-log2", "Cargando " + p + "…");
      gh.getText(p).then(function (f) {
        editFile = { path: p, sha: f.sha };
        $("be-contenido").value = f.text;
        $("be-mensaje").value = "Edito " + p;
        if (/^docs\/.*\.md$/.test(p)) {
          var u = cfg.site + p.replace(/^docs\//, "").replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "/");
          $("be-ver").href = u; $("be-ver").style.display = "inline-block";
        }
        log("be-log2", p + " cargado (" + fmtSize(new TextEncoder().encode(f.text).length) + ").");
      }).catch(function (e) { log("be-log2", "No pude cargar: " + e.message, true); });
    });

    $("be-previsualizar2").addEventListener("click", function () {
      var box = $("be-preview2");
      if (!editFile || !/\.md$/i.test(editFile.path)) { log("be-log2", "La vista previa es solo para archivos .md.", true); return; }
      renderMd($("be-contenido").value, imgsEdit).then(function (html) {
        box.innerHTML = html; box.style.display = "block";
      }).catch(function (e) { log("be-log2", e.message, true); });
    });

    $("be-guardar").addEventListener("click", function () {
      if (!editFile) { log("be-log2", "Elegí un archivo primero.", true); return; }
      var btn = this; btn.disabled = true;
      var files = [{ path: editFile.path, text: $("be-contenido").value }];
      imgsEdit.forEach(function (im) { files.push({ path: im.repoPath, bytes: im.bytes }); });
      var msg = ($("be-mensaje").value.trim() || "Edito " + editFile.path) + "\n\nEditado desde la bitácora.";
      gh.commit(files, msg, function (s) { log("be-log2", s + "…"); }).then(function (c) {
        log("be-log2", "Guardado en el commit " + c.sha.slice(0, 7) + ". El sitio se reconstruye en uno o dos minutos.");
        imgsEdit.splice(0, imgsEdit.length); renderImages("be-images2", imgsEdit, "be-contenido");
        if (editFile.path === "mkdocs.yml") navYaml = null;
        return loadTree();
      }).catch(function (e) {
        log("be-log2", "No se guardó: " + e.message, true);
      }).then(function () { btn.disabled = false; });
    });

    $("be-borrar").addEventListener("click", function () {
      if (!editFile) { log("be-log2", "Elegí un archivo primero.", true); return; }
      if (editFile.path === "mkdocs.yml" || /\/index\.md$/.test("/" + editFile.path.replace(/^docs\//, ""))) {
        log("be-log2", "Ese archivo no se borra desde acá.", true); return;
      }
      if (!confirm("¿Borrar " + editFile.path + " del repositorio? Si está en el menú, sacalo también de mkdocs.yml.")) return;
      var p = editFile.path, btn = this; btn.disabled = true;
      gh.commit([{ path: p, remove: true }], "Borro " + p + "\n\nEditado desde la bitácora.").then(function (c) {
        log("be-log2", "Borrado en el commit " + c.sha.slice(0, 7) + ".");
        editFile = null; $("be-contenido").value = ""; $("be-archivo").value = "";
        return loadTree();
      }).catch(function (e) {
        log("be-log2", "No se borró: " + e.message, true);
      }).then(function () { btn.disabled = false; });
    });

    /* --- arranque --- */
    var t = storedToken();
    if (t) { $("be-token").value = t; connect(t); }
  }

  // Arranque. Con la carga instantánea del tema, la página cambia sin
  // recargar: se vuelve a intentar cada medio segundo y init() no hace
  // nada si el editor no está en la página o ya se inicializó.
  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(init);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  if (!window.__bitacoraEditorPoll) {
    window.__bitacoraEditorPoll = setInterval(init, 500);
  }
})();
