/* ---------------- 数学 · 竖式闯关（离线版） ---------------- */
// 引擎与桌面版 static/vertical.js 保持一致（有测试校验两边相同）：
// 四关：不进位加 → 不退位减 → 进位加 → 退位减，每关 5 题（题目和结果都是两位数）。
// 逐列高亮 + 数字键盘填本列结果；进位小 1 / 退位点由孩子亲手点上去；答错不落位，晃动后重试。

const VERTICAL_QUESTIONS = 5;

const v$ = (sel) => document.querySelector(sel);
const vEl = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "onclick") node.addEventListener("click", v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
};

/* ----- 题库 ----- */

function vQ(a, op, b) {
  return { id: `${a}${op}${b}`, a, op, b, ans: op === "+" ? a + b : a - b };
}

function buildVNoCarryAdd() {
  const pool = [];
  for (let ta = 1; ta <= 9; ta++)
    for (let tb = 1; ta + tb <= 9; tb++)
      for (let oa = 0; oa <= 9; oa++)
        for (let ob = 0; oa + ob <= 9; ob++)
          pool.push(vQ(ta * 10 + oa, "+", tb * 10 + ob));
  return pool;
}

function buildVNoBorrowSub() {
  const pool = [];
  for (let a = 20; a <= 99; a++)
    for (let b = 10; b < a; b++)
      if (a % 10 >= b % 10 && a - b >= 10) pool.push(vQ(a, "-", b));
  return pool;
}

function buildVCarryAdd() {
  const pool = [];
  for (let a = 10; a <= 89; a++)
    for (let b = 10; b <= 99 - a; b++)
      if ((a % 10) + (b % 10) >= 10) pool.push(vQ(a, "+", b));
  return pool;
}

function buildVBorrowSub() {
  const pool = [];
  for (let a = 20; a <= 99; a++)
    for (let b = 10; b < a; b++)
      if (a % 10 < b % 10 && a - b >= 10) pool.push(vQ(a, "-", b));
  return pool;
}

function shuffledV(items, rng = Math.random) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const VERTICAL_LEVELS = [
  {
    id: "add-plain", no: 1, title: "不进位加法", sample: "45 + 32",
    intro: "数位对齐，从个位算起，个位相加不满十。",
    pool: buildVNoCarryAdd,
  },
  {
    id: "sub-plain", no: 2, title: "不退位减法", sample: "67 - 25",
    intro: "从个位减起，个位够减不用借。",
    pool: buildVNoBorrowSub,
  },
  {
    id: "add-carry", no: 3, title: "进位加法", sample: "45 + 37",
    intro: "个位满十向十位进 1，小 1 自己点上去。",
    pool: buildVCarryAdd,
  },
  {
    id: "sub-borrow", no: 4, title: "退位减法", sample: "52 - 38",
    intro: "个位不够减借 1 当 10，退位点自己点。",
    pool: buildVBorrowSub,
  },
];

/* ----- 步骤引擎 ----- */

function buildVerticalSteps(q) {
  const ta = Math.floor(q.a / 10), oa = q.a % 10;
  const tb = Math.floor(q.b / 10), ob = q.b % 10;
  const steps = [];
  if (q.op === "+") {
    const ones = oa + ob;
    steps.push({ type: "col", col: "ones", expect: ones, hint: `先算个位：${oa} + ${ob} = ?` });
    if (ones >= 10) {
      steps.push({
        type: "carry",
        hint: `${oa} + ${ob} = ${ones}，个位写 ${ones % 10}，向十位进 1 —— 点上面的小格子，把小 1 记上去`,
      });
      steps.push({
        type: "col", col: "tens", expect: ta + tb + 1,
        hint: `再算十位，别忘了进位的 1：${ta} + ${tb} + 1 = ?`,
      });
    } else {
      steps.push({ type: "col", col: "tens", expect: ta + tb, hint: `再算十位：${ta} + ${tb} = ?` });
    }
  } else if (oa >= ob) {
    steps.push({ type: "col", col: "ones", expect: oa - ob, hint: `先算个位：${oa} - ${ob} = ?` });
    steps.push({ type: "col", col: "tens", expect: ta - tb, hint: `再算十位：${ta} - ${tb} = ?` });
  } else {
    steps.push({
      type: "borrow",
      hint: `个位 ${oa} - ${ob} 不够减 —— 点十位的 ${ta}，打退位点，借 1 当 10`,
    });
    steps.push({
      type: "col", col: "ones", expect: (oa + 10) - ob,
      hint: `借 1 当 10，个位变成 ${oa + 10}：${oa + 10} - ${ob} = ?`,
    });
    steps.push({
      type: "col", col: "tens", expect: (ta - 1) - tb,
      hint: `十位借走 1 变成 ${ta - 1}：${ta - 1} - ${tb} = ?`,
    });
  }
  return steps;
}

function newVerticalRound(level, rng = Math.random) {
  return {
    level, rng,
    questions: shuffledV(level.pool(), rng).slice(0, VERTICAL_QUESTIONS),
    qIndex: 0, results: [], finished: false, startedAt: Date.now(),
  };
}

/* ----- 视图 ----- */

let vState = null;
let vAdvanceTimer = null;

function vShow(view) {
  document.querySelectorAll("#view-math .m-subview").forEach((n) => n.classList.toggle("hidden", n.id !== view));
}

function vGoHome() {
  if (vState && !vState.finished && !confirm("这一关还没做完，确定退出吗？")) return;
  clearTimeout(vAdvanceTimer);
  document.querySelectorAll("#view-math .m-subview").forEach((n) => n.classList.add("hidden"));
  v$("#m-home").classList.remove("hidden");
  renderVHome();
}

function renderVHome() {
  const box = v$("#m-levels");
  box.replaceChildren();
  for (const lv of VERTICAL_LEVELS) {
    box.append(vEl("button", { class: "m-card m-level", onclick: () => startVLevel(lv) }, [
      vEl("span", { class: "m-no" }, String(lv.no)),
      vEl("div", {}, [
        vEl("b", {}, lv.title),
        vEl("p", {}, `${lv.sample} · ${lv.intro}`),
      ]),
    ]));
  }
}

function startVLevel(level) {
  if (vState && !vState.finished &&
      !confirm(`「${vState.level.title}」还没做完，重新开始「${level.title}」吗？`)) return;
  clearTimeout(vAdvanceTimer);
  vState = newVerticalRound(level);
  vShow("v-quiz");
  loadVQuestion();
}

function vCell(row, col) {
  return document.querySelector(`#vsum .vcell[data-row="${row}"][data-col="${col}"]`);
}

function vClearHot() {
  document.querySelectorAll("#vsum .vcell").forEach((c) => {
    c.classList.remove("vhot", "vpulse", "vtarget");
    c.onclick = null;
  });
}

function renderVSum(q) {
  const box = v$("#vsum");
  box.replaceChildren();
  const ta = Math.floor(q.a / 10), oa = q.a % 10;
  const tb = Math.floor(q.b / 10), ob = q.b % 10;
  const cell = (cls, row, col, text) =>
    vEl("div", { class: `vcell ${cls}`, "data-row": row, "data-col": col }, text == null ? "" : text);
  box.append(
    cell("small", "mark", "op"),
    cell("small vmark", "mark", "tens"),
    cell("small vmark", "mark", "ones"),
    cell("", "a", "op"),
    cell("vdigit", "a", "tens", String(ta)),
    cell("vdigit", "a", "ones", String(oa)),
    cell("vop", "b", "op", q.op),
    cell("vdigit", "b", "tens", String(tb)),
    cell("vdigit", "b", "ones", String(ob)),
    vEl("div", { class: "vline" }),
    cell("", "ans", "op"),
    cell("vans", "ans", "tens"),
    cell("vans", "ans", "ones")
  );
}

function loadVQuestion() {
  const s = vState;
  s.q = s.questions[s.qIndex];
  s.steps = buildVerticalSteps(s.q);
  s.stepIndex = 0;
  s.mistakes = 0;
  s.buffer = "";
  v$("#v-count").textContent = `第 ${s.qIndex + 1} / ${s.questions.length} 题`;
  v$("#v-fill").style.width = `${Math.round((s.qIndex / s.questions.length) * 100)}%`;
  v$("#v-eq").textContent = `${s.q.a} ${s.q.op} ${s.q.b} = ?`;
  v$("#v-eq").classList.remove("vdone");
  v$("#v-card").classList.remove("vdone");
  renderVSum(s.q);
  renderVStep();
}

function renderVStep() {
  const s = vState;
  const step = s.steps[s.stepIndex];
  vClearHot();
  v$("#v-hint").textContent = step.hint;
  if (step.type === "col") {
    for (const row of ["mark", "a", "b", "ans"]) {
      const c = vCell(row, step.col);
      if (c) c.classList.add("vhot");
    }
    vCell("ans", step.col).classList.add("vtarget");
    s.buffer = "";
    vRenderBuffer();
    v$("#v-keypad").classList.remove("dim");
  } else if (step.type === "carry") {
    const c = vCell("mark", "tens");
    c.classList.add("vhot", "vpulse");
    c.onclick = vPlaceCarry;
    v$("#v-keypad").classList.add("dim");
  } else {
    const c = vCell("a", "tens");
    c.classList.add("vhot", "vpulse");
    c.onclick = vPlaceBorrow;
    v$("#v-keypad").classList.add("dim");
  }
}

function vRenderBuffer() {
  const s = vState;
  const step = s.steps[s.stepIndex];
  if (!step || step.type !== "col") return;
  const target = vCell("ans", step.col);
  if (target.classList.contains("vfilled")) return;
  target.textContent = s.buffer;
}

function vKey(d) {
  const s = vState;
  if (!s || s.finished) return;
  const step = s.steps && s.steps[s.stepIndex];
  if (!step || step.type !== "col") return;
  if (s.buffer.length >= String(step.expect).length) return;
  s.buffer += String(d);
  vRenderBuffer();
  if (s.buffer.length === String(step.expect).length) {
    if (Number(s.buffer) === step.expect) {
      const target = vCell("ans", step.col);
      target.textContent = step.col === "ones" && step.expect >= 10
        ? String(step.expect % 10)
        : s.buffer;
      target.classList.add("vfilled", "vpop");
      target.classList.remove("vtarget");
      vAdvance();
    } else {
      s.mistakes++;
      const target = vCell("ans", step.col);
      target.classList.add("vshake", "vwrong");
      setTimeout(() => target.classList.remove("vshake", "vwrong"), 420);
      s.buffer = "";
      setTimeout(vRenderBuffer, 400);
    }
  }
}

function vBackspace() {
  const s = vState;
  if (!s) return;
  s.buffer = "";
  vRenderBuffer();
}

function vPlaceCarry() {
  const s = vState;
  const step = s.steps[s.stepIndex];
  if (!s || !step || step.type !== "carry") return;
  const c = vCell("mark", "tens");
  c.textContent = "1";
  c.classList.remove("vpulse");
  c.classList.add("vpop");
  c.onclick = null;
  vAdvance();
}

function vPlaceBorrow() {
  const s = vState;
  const step = s.steps[s.stepIndex];
  if (!s || !step || step.type !== "borrow") return;
  const q = s.q;
  const ta = Math.floor(q.a / 10), oa = q.a % 10;
  vCell("a", "tens").classList.add("vdot");
  const mt = vCell("mark", "tens");
  const mo = vCell("mark", "ones");
  mt.textContent = String(ta - 1);
  mo.textContent = String(oa + 10);
  mt.classList.add("vpop");
  mo.classList.add("vpop");
  vCell("a", "tens").classList.remove("vpulse");
  vCell("a", "tens").onclick = null;
  vAdvance();
}

function vAdvance() {
  const s = vState;
  s.stepIndex++;
  if (s.stepIndex >= s.steps.length) vQuestionDone();
  else renderVStep();
}

function vQuestionDone() {
  const s = vState;
  s.results.push({ q: s.q, mistakes: s.mistakes });
  vClearHot();
  v$("#v-keypad").classList.add("dim");
  v$("#v-eq").textContent = `${s.q.a} ${s.q.op} ${s.q.b} = ${s.q.ans} ✓`;
  v$("#v-eq").classList.add("vdone");
  v$("#v-card").classList.add("vdone");
  v$("#v-hint").textContent = s.mistakes === 0 ? "🎉 一次全对，真棒！" : "做出来了，继续下一题！";
  vAdvanceTimer = setTimeout(() => {
    s.qIndex++;
    if (s.qIndex >= s.questions.length) renderVDone();
    else loadVQuestion();
  }, 1100);
}

function renderVDone() {
  const s = vState;
  s.finished = true;
  const total = s.questions.length;
  const perfect = s.results.filter((r) => r.mistakes === 0).length;
  const misses = s.results.reduce((n, r) => n + r.mistakes, 0);
  const stars = perfect === total ? 3 : perfect >= total - 2 ? 2 : 1;
  const actions = [
    vEl("button", { class: "secondary", onclick: vGoHome }, "返回关卡"),
    vEl("button", { class: "primary", onclick: () => startVLevel(s.level) }, "再来一轮"),
  ];
  const idx = VERTICAL_LEVELS.findIndex((l) => l.id === s.level.id);
  if (idx >= 0 && idx < VERTICAL_LEVELS.length - 1) {
    actions.push(vEl("button", { class: "primary", onclick: () => startVLevel(VERTICAL_LEVELS[idx + 1]) }, "下一关 →"));
  }
  const kids = [
    vEl("div", { class: "vstars" }, [0, 1, 2].map((i) => vEl("span", { class: i < stars ? "von" : "voff" }, "★"))),
    vEl("h2", {}, `「${s.level.title}」通关！`),
    vEl("p", {}, `共 ${total} 题，一次全对 ${perfect} 题，总共错 ${misses} 次。`),
    vEl("div", { class: "summary-grid" }, [
      vEl("div", {}, [vEl("b", {}, `${perfect} / ${total}`), vEl("span", {}, "一次全对")]),
      vEl("div", {}, [vEl("b", {}, `${misses}`), vEl("span", {}, "总共错几次")]),
    ]),
    vEl("div", { class: "hz-chip-row" }, s.results.map((r) =>
      vEl("span", { class: `chip m-chip${r.mistakes ? " m-chip-miss" : ""}` },
        `${r.q.a} ${r.q.op} ${r.q.b} = ${r.q.ans}${r.mistakes ? ` ✗${r.mistakes}` : " ✓"}`))),
    vEl("div", { class: "hz-summary-actions" }, actions),
  ];
  const box = v$("#v-done");
  box.replaceChildren();
  box.append(vEl("div", { class: "summary" }, kids));
  vShow("v-done");
}

if (typeof document !== "undefined") {
  const pad = v$("#v-keypad");
  for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9, "del", 0]) {
    const key = vEl("button", { class: `vkey${d === "del" ? " del" : ""}`, type: "button" },
      d === "del" ? "⌫" : String(d));
    key.addEventListener("click", () => (d === "del" ? vBackspace() : vKey(d)));
    pad.appendChild(key);
  }
  v$("#v-back").addEventListener("click", vGoHome);
  document.addEventListener("keydown", (e) => {
    if (!document.querySelector("#view-math") || !document.querySelector("#view-math").classList.contains("active")) return;
    if (v$("#v-quiz").classList.contains("hidden")) return;
    if (e.key >= "0" && e.key <= "9") vKey(Number(e.key));
    else if (e.key === "Backspace") vBackspace();
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    VERTICAL_QUESTIONS,
    VERTICAL_LEVELS,
    buildVNoCarryAdd,
    buildVNoBorrowSub,
    buildVCarryAdd,
    buildVBorrowSub,
    buildVerticalSteps,
    newVerticalRound,
  };
}
