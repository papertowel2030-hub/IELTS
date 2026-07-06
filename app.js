/* ==========================================================================
   BandUp — preparation for the IELTS® exam
   Shared app engine (vanilla JS, no build, no backend)
   Handles: state (localStorage), sidebar/nav, Academic/General toggle,
   micro-lesson stepper, quizzes, streaks, progress. ADHD-first: one thing
   at a time, small wins, always-visible "what to do next".
   ========================================================================== */
(function () {
  "use strict";

  var KEY = "ielts.v1";

  /* ---- Site map (single source of truth for nav + progress) ------------ */
  var NAV = [
    { group: "Start", items: [
      { href: "index.html", label: "Home", ico: "🏠" }
    ]},
    { group: "Learn", items: [
      { href: "foundations.html", label: "Foundations", ico: "🧭" },
      { href: "listening.html",   label: "Listening",   ico: "🎧", skill: "listening" },
      { href: "reading.html",     label: "Reading",     ico: "📖", skill: "reading" },
      { href: "writing.html",     label: "Writing",     ico: "✍️", skill: "writing" },
      { href: "speaking.html",    label: "Speaking",    ico: "🗣️", skill: "speaking" }
    ]},
    { group: "Practice", items: [
      { href: "practice-reading.html", label: "Reading Practice", ico: "🧪" },
      { href: "study-plan.html",   label: "Study Plan",   ico: "🗓️" },
      { href: "error-log.html",    label: "Error Log",    ico: "📋" },
      { href: "flashcards.html",   label: "Flashcards",   ico: "🔁" },
      { href: "lexis-bank.html",   label: "Lexis Bank",   ico: "📚" },
      { href: "model-answers.html",label: "Model Answers",ico: "⭐" },
      { href: "timer.html",        label: "Focus Timer",  ico: "⏱️" }
    ]},
    { group: "Reference", items: [
      { href: "band-descriptors.html", label: "Band Descriptors", ico: "🎯" },
      { href: "diagnostic.html",       label: "Diagnostic",       ico: "🩺" },
      { href: "feedback.html",         label: "Feedback",         ico: "🔎" },
      { href: "book-speaking.html",    label: "Book Speaking",    ico: "📅" },
      { href: "sources.html",          label: "Research & Sources", ico: "🔬" }
    ]}
  ];

  var SKILLS = ["listening", "reading", "writing", "speaking"];

  /* ---- State ----------------------------------------------------------- */
  var defaults = {
    track: null,            // "academic" | "general"
    targetBand: null,       // e.g. 7
    setup: false,
    diagnostic: {},         // { listening: 6.5, ... }
    lessonsDone: {},        // { "listening:0": true }
    stepTotals: {},         // { listening: 8 }  (visible lessons for current track)
    tasksDone: {},          // { "w1-mon-1": true }
    errorLog: [],           // [{id,date,skill,source,q,mine,correct,reason,action,redo}]
    flash: {},              // { term: {box:1, due:ts, def:"", ex:""} }
    streak: { count: 0, last: null },
    timerSessions: 0
  };

  var state;
  function load() {
    try { state = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || "{}")); }
    catch (e) { state = Object.assign({}, defaults); }
    // ensure nested objects exist
    ["diagnostic","lessonsDone","stepTotals","tasksDone","flash"].forEach(function(k){
      if (!state[k] || typeof state[k] !== "object") state[k] = {};
    });
    if (!Array.isArray(state.errorLog)) state.errorLog = [];
    if (!state.streak) state.streak = { count: 0, last: null };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  load();

  /* ---- Helpers --------------------------------------------------------- */
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function touchStreak() {
    var s = state.streak;
    var t = todayStr();
    if (s.last === t) return;
    var y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    s.count = (s.last === y) ? (s.count + 1) : 1;
    s.last = t;
    save();
    renderSidebarProgress();
  }

  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    if (!t) { t = el("div", "toast"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(function () { t.classList.add("show"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  /* ---- Track (Academic / General) -------------------------------------- */
  function activeTrack() { return state.track || "general"; }
  function applyTrack() {
    document.body.setAttribute("data-active-track", activeTrack());
    $all(".track-toggle button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-track") === activeTrack());
    });
  }
  function setTrack(t) {
    state.track = t; save(); applyTrack();
    // stepper visibility may change
    document.dispatchEvent(new CustomEvent("track-changed", { detail: t }));
  }

  /* ---- Progress -------------------------------------------------------- */
  function skillProgress(skill) {
    var total = state.stepTotals[skill] || 0;
    var done = Object.keys(state.lessonsDone).filter(function (k) {
      return k.indexOf(skill + ":") === 0 && state.lessonsDone[k];
    }).length;
    return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
  }
  function overallLessonsDone() {
    return Object.keys(state.lessonsDone).filter(function (k) { return state.lessonsDone[k]; }).length;
  }

  /* ---- Sidebar / appbar rendering -------------------------------------- */
  function currentFile() {
    var p = location.pathname.split("/").pop();
    return p || "index.html";
  }
  function renderSidebar() {
    var sb = $("#sidebar");
    if (!sb) return;
    var cur = currentFile();
    var html = "";
    html += '<a class="brand" href="index.html"><span class="logo">B↑</span><span>BandUp<small>IELTS® prep · Academic & General</small></span></a>';
    // track toggle
    html += '<div><div class="track-toggle" role="tablist">' +
            '<button data-track="general">General</button>' +
            '<button data-track="academic">Academic</button></div>' +
            '<div class="track-caption">Choose your test — content adapts</div></div>';
    // nav groups
    NAV.forEach(function (g) {
      html += '<div class="nav-group"><div class="label">' + g.group + '</div>';
      g.items.forEach(function (it) {
        var active = it.href === cur ? " active" : "";
        var done = "";
        if (it.skill) {
          var pr = skillProgress(it.skill);
          if (pr.total && pr.done >= pr.total) done = '<span class="done">✓</span>';
          else if (pr.total) done = '<span class="done" style="color:var(--gray-400)">' + pr.done + "/" + pr.total + "</span>";
        }
        html += '<a class="nav-link' + active + '" href="' + it.href + '"><span class="ico">' + it.ico + '</span>' + it.label + done + '</a>';
      });
      html += '</div>';
    });
    // progress card
    html += '<div class="side-progress" id="side-progress"></div>';
    sb.innerHTML = html;

    $all(".track-toggle button", sb).forEach(function (b) {
      b.addEventListener("click", function () { setTrack(b.getAttribute("data-track")); });
    });
    renderSidebarProgress();
  }
  function renderSidebarProgress() {
    var box = $("#side-progress");
    if (!box) return;
    var streak = state.streak.count || 0;
    box.innerHTML =
      '<div class="row"><span>Lessons done</span><strong>' + overallLessonsDone() + '</strong></div>' +
      '<div class="row"><span>Day streak</span><span class="streak">' + (streak ? "🔥 " + streak : "—") + '</span></div>';
  }
  function renderAppbar() {
    var ab = $("#appbar");
    if (!ab) return;
    ab.innerHTML =
      '<button class="menu-btn" id="menu-btn" aria-label="Open menu">☰</button>' +
      '<span class="brand">BandUp</span><span class="spacer"></span>' +
      '<span class="streak" style="font-weight:700;color:var(--amber-ink)">' + (state.streak.count ? "🔥 " + state.streak.count : "") + '</span>';
    var mb = $("#menu-btn");
    if (mb) mb.addEventListener("click", function () { document.body.classList.toggle("nav-open"); });
    var scrim = $("#scrim");
    if (scrim) scrim.addEventListener("click", function () { document.body.classList.remove("nav-open"); });
    // close drawer when a nav link is tapped
    $all("#sidebar .nav-link").forEach(function (a) {
      a.addEventListener("click", function () { document.body.classList.remove("nav-open"); });
    });
  }

  /* ---- Micro-lesson stepper -------------------------------------------- */
  // Markup: <div class="stepper" data-skill="listening">
  //           <div class="lesson" data-title="..." data-time="4 min" [data-track="academic"]>...</div> ...
  //         </div>
  function initSteppers() {
    $all(".stepper").forEach(function (stp) {
      var skill = stp.getAttribute("data-skill") || "skill";
      var lessons = $all(".lesson", stp);
      lessons.forEach(function (l, i) { l.setAttribute("data-lid", skill + ":" + i); });

      // UI shell
      var head = el("div", "stepper-head");
      head.innerHTML = '<div class="progress"><span></span></div><span class="count"></span>';
      var stage = el("div", "stepper-stage");
      var nav = el("div", "stepper-nav");
      nav.innerHTML =
        '<button class="btn ghost prev">← Back</button>' +
        '<button class="btn primary next">Mark done &amp; next →</button>';
      var dots = el("div", "dot-row");
      lessons.forEach(function (l) { l.parentNode.removeChild(l); });
      stp.innerHTML = "";
      stp.appendChild(head); stp.appendChild(stage); stp.appendChild(nav); stp.appendChild(dots);

      var pos = 0;
      function visible() {
        var tr = activeTrack();
        return lessons.filter(function (l) {
          var lt = l.getAttribute("data-track");
          return !lt || lt === tr;
        });
      }
      function render() {
        var vis = visible();
        state.stepTotals[skill] = vis.length; save();
        if (pos >= vis.length) pos = vis.length - 1;
        if (pos < 0) pos = 0;
        var lesson = vis[pos];
        stage.innerHTML = "";
        // meta header
        var meta = el("div", "lesson-meta");
        var title = lesson.getAttribute("data-title") || "";
        var time = lesson.getAttribute("data-time");
        var lid = lesson.getAttribute("data-lid");
        var isDone = !!state.lessonsDone[lid];
        meta.innerHTML =
          '<span class="pill blue">Lesson ' + (pos + 1) + "</span>" +
          (time ? '<span class="badge-time">⏱ ' + time + "</span>" : "") +
          (isDone ? '<span class="pill green">✓ done</span>' : "");
        var card = el("div", "lesson-card");
        if (title) card.appendChild(el("h2", null, title));
        card.appendChild(meta);
        var body = el("div"); body.innerHTML = lesson.innerHTML; card.appendChild(body);
        stage.appendChild(card);
        // re-init quizzes inside this card
        initQuizzes(card);
        // progress
        var doneCount = vis.filter(function (l) { return state.lessonsDone[l.getAttribute("data-lid")]; }).length;
        $(".progress > span", head).style.width = Math.round(doneCount / vis.length * 100) + "%";
        $(".count", head).textContent = (pos + 1) + " / " + vis.length + "  ·  " + doneCount + " done";
        // dots
        dots.innerHTML = "";
        vis.forEach(function (l, i) {
          var d = el("button", "dot" + (i === pos ? " on" : "") + (state.lessonsDone[l.getAttribute("data-lid")] ? " done" : ""));
          d.setAttribute("aria-label", "Lesson " + (i + 1));
          d.addEventListener("click", function () { pos = i; render(); });
          dots.appendChild(d);
        });
        // nav buttons
        $(".prev", nav).disabled = pos === 0;
        var nextBtn = $(".next", nav);
        nextBtn.innerHTML = isDone
          ? (pos === vis.length - 1 ? "Finish ✓" : "Next →")
          : "Mark done &amp; next →";
        // scroll into view softly (not on first paint)
        renderSidebar();
      }
      $(".prev", nav).addEventListener("click", function () { if (pos > 0) { pos--; render(); window.scrollTo({top:0,behavior:"smooth"}); } });
      $(".next", nav).addEventListener("click", function () {
        var vis = visible();
        var lesson = vis[pos];
        var lid = lesson.getAttribute("data-lid");
        if (!state.lessonsDone[lid]) {
          state.lessonsDone[lid] = true; save(); touchStreak();
          var pr = skillProgress(skill);
          if (pr.total && pr.done >= pr.total) toast("🎉 " + skill.charAt(0).toUpperCase() + skill.slice(1) + " module complete!");
          else toast("Nice — lesson done ✓");
        }
        if (pos < vis.length - 1) { pos++; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
        else { render(); }
      });
      document.addEventListener("track-changed", function () { pos = 0; render(); });
      render();
    });
  }

  /* ---- Quizzes (instant feedback) -------------------------------------- */
  // Markup: <div class="quiz"><p class="q">...</p>
  //   <div class="opts">
  //     <button class="opt" data-correct="true">A</button> ...
  //   </div>
  //   <div class="explain">Why...</div></div>
  function initQuizzes(root) {
    $all(".quiz", root).forEach(function (q) {
      if (q.getAttribute("data-init")) return;
      q.setAttribute("data-init", "1");
      var opts = $all(".opt", q);
      var explain = $(".explain", q);
      opts.forEach(function (o) {
        o.addEventListener("click", function () {
          if (q.getAttribute("data-answered")) return;
          q.setAttribute("data-answered", "1");
          var correct = o.getAttribute("data-correct") === "true";
          o.classList.add(correct ? "correct" : "wrong");
          if (!correct) {
            opts.forEach(function (x) { if (x.getAttribute("data-correct") === "true") x.classList.add("correct"); });
          }
          opts.forEach(function (x) { x.disabled = true; });
          if (explain) { explain.classList.add("show", correct ? "ok" : "no"); }
          touchStreak();
        });
      });
    });
  }

  /* ---- Public API ------------------------------------------------------ */
  window.IELTS = {
    state: function () { return state; },
    save: save,
    get: function (k) { return state[k]; },
    set: function (k, v) { state[k] = v; save(); },
    track: activeTrack,
    setTrack: setTrack,
    skillProgress: skillProgress,
    overallLessonsDone: overallLessonsDone,
    skills: SKILLS,
    nav: NAV,
    touchStreak: touchStreak,
    toast: toast,
    reset: function () { localStorage.removeItem(KEY); load(); location.reload(); },
    refreshChrome: function () { renderSidebar(); renderAppbar(); applyTrack(); }
  };

  /* ---- Trademark disclaimer footer -------------------------------------- */
  function renderDisclaimer() {
    var host = $(".main-inner");
    if (!host || $(".tm-note", host)) return;
    var f = el("footer", "tm-note",
      "IELTS® is a registered trademark of the British Council, IDP: IELTS Australia and Cambridge English. " +
      "BandUp is an independent study resource and is neither affiliated with nor endorsed by them.");
    host.appendChild(f);
  }

  /* ---- Boot ------------------------------------------------------------ */
  function boot() {
    renderSidebar();
    renderAppbar();
    applyTrack();
    initSteppers();
    initQuizzes(document);
    renderDisclaimer();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
