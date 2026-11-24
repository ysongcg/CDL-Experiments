/*
 * ManyNumbers – AMS task (web version)
 * Port of the AMS part of manynumbers_ams_visualmemory_v2025.0301B (PsychoPy 2022.2.5).
 *
 * Flow (same as PsychoPy):
 *   confirm info -> instructions -> 2 sample trials (each repeated once if wrong, with feedback)
 *   -> Ready -> practice (6 trials with feedback; second round if <=60% correct)
 *   -> 3 test blocks (block order shuffled, trials shuffled, no feedback) -> End
 *
 * Trial: fixation cross until space/tap -> dot image 2 s -> rectangle mask until response.
 *        Responses accepted from 0.3 s after image onset, no time limit.
 *        S / left half of screen = blue (left);  L / right half of screen = yellow (right).
 */
(function () {
  "use strict";

  // ------------------------------------------------------------------ settings
  const IMAGE_DIR = "";            // folder holding the PNGs, relative to index.html, e.g. "images/"
  const STIM_DURATION_MS = 2000;   // image_a duration; mask (image_b) appears at the same time
  const RESPONSE_START_MS = 300;   // 'response' keyboard starts at 0.3 s
  const FEEDBACK_TEXT_DELAY_MS = 200;
  const TAP_GUARD_MS = 300;        // ignore taps this soon after a screen appears (stops double taps skipping screens)
  const PRACTICE_PASS_PCT = 60;    // practice passes if % correct > 60
  const EXP_NAME = "manynumbers_ams_web";
  const SOURCE_EXP = "manynumbers_ams_visualmemory_v2025.0301B";
  const WEB_VERSION = "2026.11.24";
  const BACKUP_KEY = "manynumbers_ams_backup";

  const MASK_IMG = "amstask_rectangles2.png";
  const READY_IMG = "practice_image3.png";
  const BLOCK_IMGS = ["block1_image.png", "block2_image.png", "block3_image.png"];
  const END_IMG = "end_image.png";

  const D = window.AMS_DATA;
  const T = D.text;
  const isTouchPrimary = window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const CONTINUE_TEXT = isTouchPrimary ? "Please tap the screen." : T.gen_space_continue;

  // ------------------------------------------------------------------ DOM / layout
  const $ = (id) => document.getElementById(id);
  const stage = $("stage");

  function updateUnits() {
    // PsychoPy 'height' units: 1 = window height. Stimuli are 1.30 wide, so on narrow
    // (portrait / tablet) screens shrink the unit so the dot images still fit the width.
    const u = Math.min(window.innerHeight, window.innerWidth / 1.4);
    document.documentElement.style.setProperty("--u", u + "px");
  }
  window.addEventListener("resize", updateUnits);
  window.addEventListener("orientationchange", () => setTimeout(updateUnits, 300));
  updateUnits();

  function clearStage() { stage.innerHTML = ""; }

  function place(node, y) {
    node.classList.add("el");
    node.style.top = `calc(50% - ${y} * var(--u))`;
    stage.appendChild(node);
    return node;
  }
  function addText(str, y, h, opts = {}) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    d.style.fontSize = `calc(${h} * var(--u))`;
    d.style.width = `calc(${opts.wrap || 1} * var(--u))`;
    d.style.color = opts.color || "#000";
    return place(d, y);
  }
  function addImage(name, y, w, h) {
    const img = IMG[name] || Object.assign(new Image(), { src: IMAGE_DIR + name });
    img.style.width = `calc(${w} * var(--u))`;
    img.style.height = `calc(${h} * var(--u))`;
    img.classList.remove("hidden");
    return place(img, y);
  }
  function addFixation() {
    const d = document.createElement("div");
    d.className = "fixation";
    return place(d, 0);
  }

  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ------------------------------------------------------------------ input
  // One pending "waiter" at a time. Keyboard: keys listed in waiter.keys.
  // Pointer (mouse / touch / pen): waiter.pointer(event) returns a key name or null.
  let waiter = null;
  let quitOpen = false;
  let aborted = false;

  function waitInput({ keys = [], pointer = null, notBefore = 0, pointerNotBefore = null }) {
    return new Promise((resolve) => {
      waiter = { keys, pointer, notBefore, pointerNotBefore: pointerNotBefore ?? notBefore, resolve };
    });
  }
  function keyName(e) {
    if (e.key === " " || e.code === "Space") return "space";
    if (e.code && e.code.startsWith("Key")) return e.code.slice(3).toLowerCase();
    return (e.key || "").toLowerCase();
  }
  document.addEventListener("keydown", (e) => {
    if (stage.style.display !== "block") return;
    const k = keyName(e);
    if (k === "space") e.preventDefault();
    if (k === "escape") { e.preventDefault(); if (!aborted && !finished) openQuit(); return; }
    if (quitOpen || e.repeat || !waiter) return;
    if (waiter.keys.includes(k) && e.timeStamp >= waiter.notBefore) {
      const w = waiter; waiter = null;
      w.resolve({ key: k, t: e.timeStamp, method: "keyboard" });
    }
  });
  stage.addEventListener("pointerdown", (e) => {
    if (quitOpen || !waiter || !waiter.pointer) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.timeStamp < waiter.pointerNotBefore) return;
    const k = waiter.pointer(e);
    if (!k) return;
    e.preventDefault();
    const w = waiter; waiter = null;
    w.resolve({ key: k, t: e.timeStamp, method: e.pointerType || "mouse" });
  });
  document.addEventListener("contextmenu", (e) => { if (stage.style.display === "block") e.preventDefault(); });
  document.addEventListener("dblclick", (e) => e.preventDefault());

  /** Wait for space bar or a tap/click anywhere (PsychoPy: keyboard with keyList=['space']). */
  async function waitContinue(extraKeys = []) {
    const now = performance.now();
    return waitInput({
      keys: ["space", ...extraKeys],
      pointer: () => "space",
      notBefore: now,
      pointerNotBefore: now + TAP_GUARD_MS,
    });
  }

  // ------------------------------------------------------------------ quit
  $("quitBtn").addEventListener("click", () => { if (!aborted && !finished) openQuit(); });
  $("resumeBtn").addEventListener("click", closeQuit);
  $("stopBtn").addEventListener("click", () => { closeQuit(); abortSession(); });
  function openQuit() { quitOpen = true; $("overlay").style.display = "flex"; }
  function closeQuit() { quitOpen = false; $("overlay").style.display = "none"; }

  // ------------------------------------------------------------------ helpers
  function shuffle(a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }
  function pad(n, w = 2) { return String(n).padStart(w, "0"); }
  function psychopyDateStr(d = new Date()) {
    // same format as psychopy.data.getDateStr(): 2025-04-01_15h30.59.123
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
      `${pad(d.getHours())}h${pad(d.getMinutes())}.${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }

  // ------------------------------------------------------------------ data
  let session = null;
  let rows = [];
  let expStart = 0;
  let finished = false;

  const TRIAL_META_COLS = ["phase", "block_position", "block_file", "trial_in_loop",
    "sample_repeat", "practice_round"];
  const RESPONSE_COLS = ["response.keys", "response.corr", "response.rt", "rt_from_stim_onset",
    "response_method", "choice_right1", "stim_onset_s", "mask_onset_after_stim_ms",
    "feedback_text", "practice_round_pct_correct"];

  function addRow(meta, trial, resp, extra = {}) {
    const row = Object.assign({}, session, meta, trial, resp, extra);
    rows.push(row);
    saveBackup(false);
    return row;
  }

  function buildCSV(totalTime) {
    const sessionCols = Object.keys(session);
    const stimCols = [];
    const fixed = new Set([...sessionCols, ...TRIAL_META_COLS, ...RESPONSE_COLS, "totaltime_exp"]);
    rows.forEach((r) => Object.keys(r).forEach((k) => {
      if (!fixed.has(k) && !stimCols.includes(k)) stimCols.push(k);
    }));
    const cols = [...sessionCols, ...TRIAL_META_COLS, ...stimCols, ...RESPONSE_COLS, "totaltime_exp"];
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(",")];
    rows.forEach((r) => {
      const rr = Object.assign({}, r, { totaltime_exp: totalTime ?? "" });
      lines.push(cols.map((c) => esc(rr[c])).join(","));
    });
    return "﻿" + lines.join("\r\n") + "\r\n";
  }

  function fileName(complete) {
    const pid = String(session.participant).replace(/[^\w.-]+/g, "_");
    return `${pid}_${EXP_NAME}_${session.date}${complete ? "" : "_INCOMPLETE"}.csv`;
  }

  function downloadText(name, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }

  // Backup in the browser after every trial, so data survive a crash / closed tab.
  function saveBackup(complete, totalTime) {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify({
        name: fileName(complete), csv: buildCSV(totalTime),
        pid: session.participant, date: session.date, n: rows.length,
      }));
    } catch (e) { /* storage full or blocked: ignore */ }
  }

  function saveAndDownload(complete) {
    const totalTime = complete ? ((performance.now() - expStart) / 1000).toFixed(3) : "";
    const csv = buildCSV(totalTime);
    saveBackup(complete, totalTime);
    downloadText(fileName(complete), csv);
    return { csv, name: fileName(complete) };
  }

  // ------------------------------------------------------------------ preload
  // Images load in two steps: the ones needed up to the end of practice load before the task
  // starts; the 48 test images load in the background during instructions / samples / practice.
  const IMG = {};
  function firstImages() {
    const names = new Set([MASK_IMG, READY_IMG, BLOCK_IMGS[0]]);
    D.samples.forEach((s) => s.trials.forEach((t) => names.add(t.visual_stimuli)));
    D.practice.trials.forEach((t) => names.add(t.visual_stimuli));
    return [...names];
  }
  function testImages(ageGroup) {
    const first = new Set(firstImages());
    const names = new Set([BLOCK_IMGS[1], BLOCK_IMGS[2], END_IMG]);
    D.blocks[ageGroup].forEach((b) => b.trials.forEach((t) => names.add(t.visual_stimuli)));
    return [...names].filter((n) => !first.has(n));
  }
  /** Load (and decode) images. onProgress(done, total) is called after each one. */
  function preload(names, onProgress = () => {}) {
    let done = 0;
    const missing = [];
    return Promise.all(names.map((n) => new Promise((resolve) => {
      const img = new Image();
      img.draggable = false;
      img.onload = async () => {
        try { await img.decode(); } catch (e) { /* ignore */ }
        IMG[n] = img; done++; onProgress(done, names.length); resolve();
      };
      img.onerror = () => { missing.push(n); done++; onProgress(done, names.length); resolve(); };
      img.src = IMAGE_DIR + n;
    }))).then(() => missing);
  }
  let testLoad = null; // { promise, done, total }

  /** Show a loading screen; returns a function that updates it. */
  function loadingScreen(total) {
    clearStage();
    const msg = addText(`Loading images… 0 / ${total}`, 0, 0.04, { wrap: 1.2 });
    msg.id = "loading";
    return (done, tot) => { msg.textContent = `Loading images… ${done} / ${tot}`; };
  }

  /** Ask whether to go on when images are missing. Resolves true = continue. */
  function missingImagesScreen(missing) {
    clearStage();
    const box = addText("", 0.05, 0.03, { wrap: 1.3 });
    box.innerHTML = `<b>${missing.length} image(s) could not be loaded</b> from "${IMAGE_DIR || "./"}":` +
      `<div class="missing">${missing.map((m) => "• " + m).join("<br>")}</div>`;
    return new Promise((resolve) => {
      const mk = (label, x, v) => {
        const b = document.createElement("button");
        b.className = "btn endbtn"; b.textContent = label;
        b.style.top = `calc(50% + 0.38 * var(--u))`;
        b.style.left = `calc(50% + ${x} * var(--u))`;
        b.addEventListener("click", () => resolve(v));
        stage.appendChild(b);
      };
      mk("Back", -0.15, false);
      mk("Continue anyway", 0.15, true);
    });
  }

  /** Before the test blocks: wait for the background download if it hasn't finished. */
  async function ensureTestImages() {
    if (!testLoad) return true;
    let missing;
    if (testLoad.finished) {
      missing = await testLoad.promise;
    } else {
      const update = loadingScreen(testLoad.total);
      update(testLoad.done, testLoad.total);
      testLoad.onProgress = update;
      missing = await testLoad.promise;
    }
    if (missing.length) return missingImagesScreen(missing);
    return true;
  }

  // ------------------------------------------------------------------ screens
  async function confirmScreen() {
    clearStage();
    addText(T.ams_general_welcome, 0.3, 0.05, { wrap: 1.2 });
    addText(T.ams_text_pid + session.participant, 0.15, 0.05, { wrap: 1.2 });
    addText(T.ams_text_age + session.age_group, 0.0, 0.05, { wrap: 1.2 });
    addText(isTouchPrimary
      ? "Tap Confirm if this information is correct, or Back if there are any errors."
      : T.ams_confirm_info, -0.30, 0.035, { wrap: 1.2 });
    const mk = (label, primary, y, x) => {
      const b = document.createElement("button");
      b.className = "btn endbtn" + (primary ? " primary" : "");
      b.textContent = label;
      b.style.top = `calc(50% - ${y} * var(--u))`;
      b.style.left = `calc(50% + ${x} * var(--u))`;
      stage.appendChild(b);
      return b;
    };
    const back = mk("Back", false, -0.42, -0.12);
    const ok = mk("Confirm", true, -0.42, 0.12);
    return new Promise((resolve) => {
      const onKey = (e) => {
        if (quitOpen) return;
        const k = keyName(e);
        if (k === "space") { e.preventDefault(); done(true); }
        else if (k === "escape") { e.preventDefault(); e.stopImmediatePropagation(); done(false); }
      };
      const done = (v) => { document.removeEventListener("keydown", onKey, true); resolve(v); };
      document.addEventListener("keydown", onKey, true);
      ok.addEventListener("click", () => done(true));
      back.addEventListener("click", () => done(false));
    });
  }

  async function textScreen(str, { h = 0.05, color = "#000", prompt = true, y = 0, wrap = 1 } = {}) {
    clearStage();
    addText(str, y, h, { color, wrap });
    if (prompt) addText(CONTINUE_TEXT, -0.35, 0.05, { wrap: 1.2 });
    await waitContinue();
  }

  async function readyScreen(imgName, imgY, promptY, extraText) {
    clearStage();
    addImage(imgName, imgY, 0.5, 0.5);
    if (extraText) addText(extraText, -0.30, 0.035, { wrap: 1.2 });
    addText(CONTINUE_TEXT, promptY, 0.05, { wrap: 1.2 });
    await waitContinue();
  }

  async function fixationScreen() {
    clearStage();
    addFixation();
    addText(T.ams_point, -0.35, 0.05, { wrap: 1.2 });
    await waitContinue();
  }

  /** Dot_Arrays routine. Returns the response fields for the data file. */
  async function dotTrial(trial) {
    clearStage();
    const stim = addImage(trial.visual_stimuli, 0, 1.30, 0.65);
    const mask = addImage(MASK_IMG, 0, 1.30, 0.65);
    mask.classList.add("hidden");
    stim.classList.add("hidden");

    // show the image on the next frame and take that frame's time as onset
    let onset = await raf();
    stim.classList.remove("hidden");
    onset = await raf(); // first frame on which the image is painted (approx.)

    let maskAfter = null;
    let running = true;
    const tick = (ts) => {
      if (!running || aborted) return;
      if (maskAfter === null && ts - onset >= STIM_DURATION_MS - 8) {
        stim.classList.add("hidden");
        mask.classList.remove("hidden");
        maskAfter = ts - onset;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const respStart = onset + RESPONSE_START_MS;
    const r = await waitInput({
      keys: ["s", "l"],
      pointer: (e) => (e.clientX < window.innerWidth / 2 ? "s" : "l"),
      notBefore: respStart,
    });
    running = false;
    clearStage();

    const corr = r.key === String(trial.correct_shift) ? 1 : 0;
    return {
      "response.keys": r.key,
      "response.corr": corr,
      "response.rt": ((r.t - respStart) / 1000).toFixed(4),       // like PsychoPy: from response start (0.3 s)
      "rt_from_stim_onset": ((r.t - onset) / 1000).toFixed(4),
      "response_method": r.method,
      "choice_right1": r.key === "l" ? 1 : 0,
      "stim_onset_s": ((onset - expStart) / 1000).toFixed(4),
      "mask_onset_after_stim_ms": maskAfter === null ? "" : Math.round(maskAfter),
    };
  }

  /** Feedback_Sample / Feedback_Practice: same dot image again, text after 0.2 s, space/tap to go on. */
  async function feedbackScreen(trial, resp) {
    let fb = T.feedback_incorrect_neutral;
    if (resp["response.keys"] === "s" && resp["response.corr"]) fb = T.feedback_correct_blue;
    if (resp["response.keys"] === "l" && resp["response.corr"]) fb = T.feedback_correct_yellow;
    clearStage();
    addImage(trial.visual_stimuli, 0, 1.30, 0.65);
    const txt = addText(fb, -0.4, 0.03, { wrap: 1.25 });
    txt.classList.add("hidden");
    const p = waitContinue();
    setTimeout(() => txt.classList.remove("hidden"), FEEDBACK_TEXT_DELAY_MS);
    await p;
    return fb;
  }

  // ------------------------------------------------------------------ phases
  async function runSamples() {
    // sample_loop: the two sample sheets in random order.
    // sample_trial_loop (nReps=2): repeat the sample once unless it was answered correctly.
    for (const s of shuffle(D.samples)) {
      for (let rep = 1; rep <= 2; rep++) {
        const trials = shuffle(s.trials);
        let nCorr = 0;
        for (let i = 0; i < trials.length; i++) {
          const t = trials[i];
          await fixationScreen();
          const resp = await dotTrial(t);
          const fb = await feedbackScreen(t, resp);
          nCorr += resp["response.corr"];
          addRow({ phase: "sample", block_file: s.file, trial_in_loop: i + 1, sample_repeat: rep }, t, resp,
            { feedback_text: fb });
        }
        if (nCorr === trials.length) break;
      }
    }
  }

  async function runPractice() {
    // practice_loop (nReps=2) around 'practice' (6 trials, random order, with feedback).
    // check_practice: stop after a round with > 60 % correct.
    // repeat_instructions shown after a round that did not pass.
    // NOTE: the PsychoPy script compared (round 2 % - round 1 %) > 60 for the second round.
    // Here round 2 is judged on its own %; this only decides whether the reminder screen
    // appears after round 2. Practice ends after 2 rounds either way, as in PsychoPy.
    for (let round = 1; round <= 2; round++) {
      const trials = shuffle(D.practice.trials);
      let nCorr = 0;
      const roundRows = [];
      for (let i = 0; i < trials.length; i++) {
        const t = trials[i];
        await fixationScreen();
        const resp = await dotTrial(t);
        const fb = await feedbackScreen(t, resp);
        nCorr += resp["response.corr"];
        roundRows.push(addRow({ phase: "practice", block_file: D.practice.file, trial_in_loop: i + 1,
          practice_round: round }, t, resp, { feedback_text: fb }));
      }
      const pct = Math.floor((nCorr / trials.length) * 100);
      roundRows.forEach((r) => { r.practice_round_pct_correct = pct; });
      saveBackup(false);
      if (pct > PRACTICE_PASS_PCT) break;
      await textScreen(T.ams_text_2, { h: 0.05, color: "#fff", prompt: false, wrap: 1.2 });
    }
  }

  async function runBlock(block, position) {
    const trials = shuffle(block.trials);
    for (let i = 0; i < trials.length; i++) {
      const t = trials[i];
      await fixationScreen();
      const resp = await dotTrial(t);
      addRow({ phase: "test", block_position: position, block_file: block.file, trial_in_loop: i + 1 }, t, resp);
    }
  }

  async function endScreen() {
    finished = true;
    $("quitBtn").style.display = "none";
    const { name } = saveAndDownload(true);
    clearStage();
    addImage(END_IMG, 0.05, 0.5, 0.5);
    addText((T.ams_end_ams || "Great job!").split("\n")[0], -0.30, 0.05, { wrap: 1.2 });
    addText(`Data saved as ${name}`, -0.37, 0.022, { wrap: 1.4 });
    endButtons(-0.44);
  }

  function endButtons(y) {
    const again = document.createElement("button");
    again.className = "btn endbtn";
    again.textContent = "Download data again";
    again.style.top = `calc(50% - ${y} * var(--u))`;
    again.style.left = `calc(50% - 0.16 * var(--u))`;
    again.addEventListener("click", () => downloadText(...lastDownload()));
    const fresh = document.createElement("button");
    fresh.className = "btn endbtn";
    fresh.textContent = "New participant";
    fresh.style.top = `calc(50% - ${y} * var(--u))`;
    fresh.style.left = `calc(50% + 0.16 * var(--u))`;
    fresh.addEventListener("click", () => location.reload());
    stage.append(again, fresh);
  }
  function lastDownload() {
    try {
      const b = JSON.parse(localStorage.getItem(BACKUP_KEY));
      if (b) return [b.name, b.csv];
    } catch (e) { /* fall through */ }
    return [fileName(finished && !aborted), buildCSV("")];
  }

  function abortSession() {
    if (aborted || finished) return;
    aborted = true;
    waiter = null;
    $("quitBtn").style.display = "none";
    const { name } = saveAndDownload(false);
    clearStage();
    addText("Task stopped.", 0.1, 0.05, { wrap: 1.2 });
    addText(`${rows.length} trials saved as ${name}`, 0.0, 0.025, { wrap: 1.4 });
    endButtons(-0.2);
  }

  // ------------------------------------------------------------------ main
  async function runTask() {
    expStart = performance.now();

    // mn_confirm_age (without date of birth)
    const ok = await confirmScreen();
    if (!ok) { location.reload(); return; }

    // Instructions
    clearStage();
    addText(T.ams_taskInst, 0, 0.0375, { wrap: 1.1 });
    addText(CONTINUE_TEXT, -0.35, 0.05, { wrap: 1.2 });
    await waitContinue();

    await runSamples();
    await readyScreen(READY_IMG, 0, -0.35);
    await runPractice();

    // block order: random.shuffle(file) in the PsychoPy script
    const blocks = shuffle(D.blocks[session.age_group]);
    session.block_order = blocks.map((b) => b.file.replace(/^.*_(b\d)\.xlsx$/, "$1")).join("-");
    rows.forEach((r) => { r.block_order = session.block_order; });

    // test images normally finished loading during practice; if not, wait here
    if (!(await ensureTestImages())) { abortSession(); return; }

    await readyScreen(BLOCK_IMGS[0], 0.05, -0.40, T.ams_nofeedback);
    await runBlock(blocks[0], 1);
    await readyScreen(BLOCK_IMGS[1], 0, -0.40);
    await runBlock(blocks[1], 2);
    await readyScreen(BLOCK_IMGS[2], 0, -0.40);
    await runBlock(blocks[2], 3);

    await endScreen();
  }

  function enterFullscreen() {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn) { try { const p = fn.call(el); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
  }

  async function start() {
    const pid = $("pid").value.trim();
    const age = $("age").value;
    const err = $("setupErr");
    if (!pid) { err.textContent = T.error_pid || "The ParticipantID box is empty."; return; }
    if (!age) { err.textContent = "Please choose an age group."; return; }
    err.textContent = "";

    session = {
      participant: pid,
      age_group: age,
      date: psychopyDateStr(),
      expName: EXP_NAME,
      source_experiment: SOURCE_EXP,
      version: "web",
      web_version: WEB_VERSION,
      language: T.language || "english",
      block_order: "",
      test_images_loaded_s: "",
      screen_size: `${screen.width}x${screen.height}`,
      window_size: `${window.innerWidth}x${window.innerHeight}`,
      device_pixel_ratio: window.devicePixelRatio || 1,
      touch_primary: isTouchPrimary ? 1 : 0,
      user_agent: navigator.userAgent,
    };
    rows = [];

    enterFullscreen();
    $("setup").style.display = "none";
    stage.style.display = "block";
    $("quitBtn").style.display = "block";
    await sleep(350);
    updateUnits();
    session.window_size = `${window.innerWidth}x${window.innerHeight}`;

    // 1) images needed until the end of practice
    const first = firstImages();
    const missing = await preload(first, loadingScreen(first.length));
    if (missing.length && !(await missingImagesScreen(missing))) { location.reload(); return; }

    // 2) test images keep loading in the background while the child does samples / practice
    const rest = testImages(age);
    testLoad = { done: 0, total: rest.length, finished: false, onProgress: null };
    testLoad.promise = preload(rest, (done, total) => {
      testLoad.done = done;
      if (testLoad.onProgress) testLoad.onProgress(done, total);
    }).then((m) => {
      testLoad.finished = true;
      const v = ((performance.now() - expStart) / 1000).toFixed(1);
      session.test_images_loaded_s = v;
      rows.forEach((r) => { r.test_images_loaded_s = v; });
      return m;
    });

    runTask();
  }

  // ------------------------------------------------------------------ setup page
  $("startBtn").addEventListener("click", start);
  $("pid").addEventListener("keydown", (e) => { if (e.key === "Enter") start(); });
  try {
    const b = JSON.parse(localStorage.getItem(BACKUP_KEY));
    if (b && b.csv) {
      const btn = $("recoverBtn");
      btn.style.display = "inline-block";
      btn.textContent = `Download last session's data (${b.pid}, ${b.n} trials)`;
      btn.addEventListener("click", () => downloadText(b.name, b.csv));
    }
  } catch (e) { /* ignore */ }

  // expose a few things for testing in the console
  window.AMS_DEBUG = { get rows() { return rows; }, get session() { return session; } };
})();
