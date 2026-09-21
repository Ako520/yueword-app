/* ---------------- 数学 · 拆解填空（凑十法 / 破十法，离线版） ---------------- */
//   进位加法拆成“凑十”几小题、退位减法拆成“破十”几小题，一格一格填：
//   一次只亮一个空，答对锁定亮下一行，答错晃动重试；最后一空永远是“把答案填回原题”。
//   凑十一档带推导（8+▢=10、5−2=3，复用“几加几等于 10”和 10 以内减法），二档撤掉推导直接拆数；
//   破十一档先拆 13=10+3，二档两步搞定。档位、范围（9 加几、十几减 9…）开始前选，记在 localStorage。
//   现有「20以内进位·退位」直答卡也可选只加 / 只减 / 分段（配置同样记在 localStorage）。

const DECOMP_QUESTIONS = 10;
const DECOMP_CONFIG_KEY = "yueword-decomp-config-v1";

const d$ = (sel) => document.querySelector(sel);
const dEl = (tag, attrs = {}, children = []) => {
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

function dQ(a, op, b) {
  return { id: `${a}${op}${b}`, a, op, b, ans: op === "+" ? a + b : op === "-" ? a - b : a * b };
}

/* 大数在前（a ≥ b）的进位加法：凑十法书写统一为“看大数、拆小数” */
function buildDecompAddPool() {
  const pool = [];
  for (let a = 2; a <= 9; a++)
    for (let b = Math.max(2, 11 - a); b <= a; b++)
      pool.push(dQ(a, "+", b));
  return pool;
}

/* 退位减法：被减数 11~18、减数 2~9、个位不够减（与口算题池一致） */
function buildDecompSubPool() {
  const pool = [];
  for (let b = 2; b <= 9; b++)
    for (let o = 1; o <= Math.min(8, b - 1); o++)
      pool.push(dQ(10 + o, "-", b));
  return pool;
}

const DECOMP_ADD_RANGES = [
  { id: "9", label: "9 加几", match: (q) => q.a === 9 },
  { id: "8", label: "8 加几", match: (q) => q.a === 8 },
  { id: "76", label: "7、6 加几", match: (q) => q.a === 7 || q.a === 6 },
  { id: "all", label: "全部混合", match: () => true },
];
const DECOMP_SUB_RANGES = [
  { id: "9", label: "十几减 9", match: (q) => q.b === 9 },
  { id: "8", label: "十几减 8", match: (q) => q.b === 8 },
  { id: "76", label: "十几减 7、6", match: (q) => q.b === 6 || q.b === 7 },
  { id: "all", label: "全部混合", match: () => true },
];

const DECOMP_KINDS = {
  add: {
    title: "凑十法拆解",
    desc: "进位加法拆开填：8+5 先填 8+▢=10、再算 5−2=3，凑成 1 个十：十位写 1、个位写剩下的 3。一档带推导，二档直接拆数。",
    ranges: DECOMP_ADD_RANGES,
    buildPool: buildDecompAddPool,
  },
  sub: {
    title: "破十法拆解",
    desc: "退位减法拆开填：13−5 先算 10−5、再加回 3。一档带数位拆解，二档两步搞定。",
    ranges: DECOMP_SUB_RANGES,
    buildPool: buildDecompSubPool,
  },
};

/* ----- 题链 ----- */
// 题链 = { top: parts, lines: [{label, parts}], steps: [{blank, expect, hint}] }
// parts 里的元素是字符串或 {blank: id}；top 的空位 id 固定为 "top"，行内空位从 0 起编号。

const B = (id) => ({ blank: id });

function buildMakeTenChain(q, stage) {
  const { a, b, ans } = q;
  const s = 10 - a; // 凑十的差
  const r = b - s; // 拆剩下的（就是答案的个位）
  const top = [String(a), "+", String(b), "=", B("top")];
  /* 末步不落算式：凑成了 1 个十，十位写 1、个位写剩下的数（位值拼出答案） */
  const finalHint = `凑成了 1 个十：十位写 1，个位写剩下的数`;
  if (stage === 1) {
    return {
      top,
      lines: [
        { label: "①", parts: [String(a), "+", B(0), "=", "10"] },
        { label: "②", parts: [String(b), "−", String(s), "=", B(1)] },
      ],
      steps: [
        { blank: 0, expect: s, hint: `第①步：${a} 加几等于 10？` },
        { blank: 1, expect: r, hint: `第②步：把 ${b} 拆开，去掉凑十的 ${s}` },
        { blank: "top", expect: ans, hint: `第③步：${finalHint}` },
      ],
    };
  }
  return {
    top,
    lines: [
      { label: "①", parts: [String(a), "+", String(b), "=", String(a), "+", B(0), "+", B(1)] },
    ],
    steps: [
      { blank: 0, expect: s, hint: `把 ${b} 拆开：先填给 ${a} 凑十的那个数` },
      { blank: 1, expect: r, hint: `再填 ${b} 去掉 ${s} 剩下的` },
      { blank: "top", expect: ans, hint: finalHint },
    ],
  };
}

function buildBreakTenChain(q, stage) {
  const { a, b, ans } = q;
  const o = a % 10; // 个位
  const t = 10 - b; // 十先减完剩的
  const top = [String(a), "−", String(b), "=", B("top")];
  if (stage === 1) {
    return {
      top,
      lines: [
        { label: "①", parts: [String(a), "=", "10", "+", B(0)] },
        { label: "②", parts: ["10", "−", String(b), "=", B(1)] },
        { label: "③", parts: [String(t), "+", String(o), "=", B(2)] },
      ],
      steps: [
        { blank: 0, expect: o, hint: `第①步：把个位的 ${o} 单独拿出来` },
        { blank: 1, expect: t, hint: `第②步：${o} 不够减 ${b}，先用 10 去减` },
        { blank: 2, expect: ans, hint: `第③步：再加回个位的 ${o}` },
        { blank: "top", expect: ans, hint: `第④步：把答案填回原题` },
      ],
    };
  }
  return {
    top,
    lines: [
      { label: "①", parts: ["10", "−", String(b), "=", B(0)] },
      { label: "②", parts: [String(t), "+", String(o), "=", B(1)] },
    ],
    steps: [
      { blank: 0, expect: t, hint: `个位不够减，先用 10 去减` },
      { blank: 1, expect: ans, hint: `再加回个位的 ${o}` },
      { blank: "top", expect: ans, hint: `把答案填回原题` },
    ],
  };
}

/* ----- 轮次 ----- */

function shuffledD(items, rng = Math.random) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function newDecompRound(kind, stage, rangeId, rng = Math.random) {
  const def = DECOMP_KINDS[kind];
  const range = def.ranges.find((r) => r.id === rangeId) || def.ranges[def.ranges.length - 1];
  const pool = def.buildPool().filter(range.match);
  const questions = shuffledD(pool, rng).slice(0, Math.min(DECOMP_QUESTIONS, pool.length));
  return { kind, stage, rangeId: range.id, questions, qIndex: 0, results: [], finished: false, startedAt: Date.now() };
}

function decompPoolCount(kind, rangeId) {
  const def = DECOMP_KINDS[kind];
  const range = def.ranges.find((r) => r.id === rangeId);
  return def.buildPool().filter(range.match).length;
}

/* “发现规律”引子：二档·9 加几连续两轮全对后，结算页提示家长去问孩子
   （9 加几答案个位比加数小 1）——规律让孩子自己说出来，不提前当口诀教。最多提示 3 次。 */
function updateDiscoveryState(cfg, kind, stage, rangeId, perfect) {
  if (kind !== "add" || stage !== 2 || rangeId !== "9") return { show: false };
  const next = { ...cfg };
  next.add9Streak = perfect ? (Number(cfg.add9Streak) || 0) + 1 : 0;
  const show = next.add9Streak >= 2 && (Number(cfg.add9Shown) || 0) < 3;
  if (show) next.add9Shown = (Number(cfg.add9Shown) || 0) + 1;
  return { show, cfg: next };
}

/* ----- 配置（localStorage 记住上次的档位和范围） ----- */

function loadDecompConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(DECOMP_CONFIG_KEY));
    if (saved && typeof saved === "object") return saved;
  } catch (_) { /* 坏数据当没有 */ }
  return {};
}
function saveDecompConfig(cfg) {
  try { localStorage.setItem(DECOMP_CONFIG_KEY, JSON.stringify(cfg)); } catch (_) { /* 私隐模式等存不了就算了 */ }
}

let dConfigDraft = null;

function openDecompConfig(kind) {
  const def = DECOMP_KINDS[kind];
  const saved = loadDecompConfig()[kind] || {};
  const stage = saved.stage === 2 ? 2 : 1;
  const rangeId = def.ranges.some((r) => r.id === saved.rangeId) ? saved.rangeId : def.ranges[0].id;
  dConfigDraft = { type: "decomp", kind, stage, rangeId };
  d$("#d-config-eyebrow").textContent = kind === "add" ? "MAKE-TEN" : "BREAK-TEN";
  d$("#d-config-title").textContent = def.title;
  d$("#d-config-desc").textContent = kind === "add"
    ? "进位加法（如 8+5）拆开填：最后一步凑成了 1 个十——十位写 1、个位写剩下的数。建议先练 9 加几——9 只差 1，最好凑。"
    : "退位减法（如 13−5）拆成一步一步填。建议先练十几减 9，最顺手。";
  renderDConfigBody();
  d$("#d-config").classList.remove("hidden");
}

function openWithin20Config() {
  const saved = loadDecompConfig().within20 || {};
  const kind = ["mix", "add", "sub"].includes(saved.kind) ? saved.kind : "mix";
  const ranges = kind === "sub" ? WITHIN20_SUB_RANGES : WITHIN20_ADD_RANGES;
  const rangeId = kind === "mix" || ranges.some((r) => r.id === saved.rangeId) ? saved.rangeId || "all" : "all";
  dConfigDraft = { type: "within20", kind, rangeId };
  d$("#d-config-eyebrow").textContent = "FLUENT DRILL";
  d$("#d-config-title").textContent = "20以内进位·退位";
  d$("#d-config-desc").textContent = "心算直答自查：先看题说答案，再点「看答案」报对错。凑十法、破十法练熟后来这里检验。";
  renderDConfigBody();
  d$("#d-config").classList.remove("hidden");
}

function dSegGroup(label, options, currentId, onPick) {
  return dEl("div", { class: "d-opt" }, [
    dEl("p", { class: "d-opt-label" }, label),
    dEl("div", { class: "seg" }, options.map((o) => dEl("button", {
      class: o.id === currentId ? "on" : "",
      type: "button",
      onclick: () => onPick(o.id),
    }, [
      dEl("span", {}, o.label),
      o.sub ? dEl("small", {}, o.sub) : null,
    ]))),
  ]);
}

function renderDConfigBody() {
  const draft = dConfigDraft;
  const body = d$("#d-config-body");
  body.replaceChildren();
  if (draft.type === "decomp") {
    const def = DECOMP_KINDS[draft.kind];
    const stages = draft.kind === "add"
      ? [{ id: 1, label: "一档 · 细拆", sub: "先填 8+▢=10，再拆 5" }, { id: 2, label: "二档 · 粗拆", sub: "直接拆成 8+▢+▢" }]
      : [{ id: 1, label: "一档 · 细拆", sub: "先拆 13=10+3" }, { id: 2, label: "二档 · 粗拆", sub: "直接 10−5，再加回 3" }];
    body.append(dSegGroup("档位", stages, draft.stage, (id) => { draft.stage = Number(id); renderDConfigBody(); }));
    body.append(dSegGroup("出题范围", def.ranges.map((r) => ({ id: r.id, label: r.label, sub: `${decompPoolCount(draft.kind, r.id)} 道题` })), draft.rangeId, (id) => { draft.rangeId = id; renderDConfigBody(); }));
    d$("#d-config-start").textContent = `开始练习 · 本轮 ${Math.min(DECOMP_QUESTIONS, decompPoolCount(draft.kind, draft.rangeId))} 题 →`;
    return;
  }
  const kinds = [
    { id: "mix", label: "混合", sub: "加 10 题 + 减 10 题" },
    { id: "add", label: "只练进位加法", sub: "如 8+5" },
    { id: "sub", label: "只练退位减法", sub: "如 13−9" },
  ];
  body.append(dSegGroup("出题", kinds, draft.kind, (id) => { draft.kind = id; draft.rangeId = "all"; renderDConfigBody(); }));
  if (draft.kind !== "mix") {
    const ranges = draft.kind === "add" ? WITHIN20_ADD_RANGES : WITHIN20_SUB_RANGES;
    body.append(dSegGroup("范围", ranges.map((r) => ({ id: r.id, label: r.label })), draft.rangeId, (id) => { draft.rangeId = id; renderDConfigBody(); }));
  }
  d$("#d-config-start").textContent = `开始练习 · 本轮 ${buildWithin20Custom(draft.kind, draft.rangeId, () => 0).length} 题 →`;
}

function hideDConfig() {
  d$("#d-config").classList.add("hidden");
  dConfigDraft = null;
}

function onDConfigStart() {
  const draft = dConfigDraft;
  if (!draft) return;
  d$("#d-config").classList.add("hidden");
  dConfigDraft = null;
  const cfg = loadDecompConfig();
  if (draft.type === "decomp") {
    cfg[draft.kind] = { stage: draft.stage, rangeId: draft.rangeId };
    saveDecompConfig(cfg);
    startDecompRound(draft.kind, draft.stage, draft.rangeId);
  } else {
    cfg.within20 = { kind: draft.kind, rangeId: draft.rangeId };
    saveDecompConfig(cfg);
    startMathMode(within20CustomMode(draft.kind, draft.rangeId));
  }
}

function within20CustomMode(kind, rangeId) {
  const kindLabel = kind === "add" ? "只加" : kind === "sub" ? "只减" : "混合";
  const range = kind === "add" ? WITHIN20_ADD_RANGES.find((r) => r.id === rangeId)
    : kind === "sub" ? WITHIN20_SUB_RANGES.find((r) => r.id === rangeId) : null;
  return {
    id: "within20",
    icon: "20",
    requeue: false,
    title: `20以内进位·退位（${kindLabel}${range && range.id !== "all" ? ` · ${range.label}` : ""}）`,
    desc: "进位加法（如 8+5）和退位减法（如 13-9）心算直答，先说答案再看答案自查。错题不重复出现。",
    small: kind === "mix" && (!rangeId || rangeId === "all") ? "一轮 20 题" : "错题不重现",
    build: (rng) => buildWithin20Custom(kind, rangeId, rng),
  };
}

/* ----- 视图 ----- */

let dState = null;
let dAdvanceTimer = null;

function dShow(view) {
  document.querySelectorAll("#view-math .m-subview").forEach((n) => n.classList.toggle("hidden", n.id !== view));
}

function renderDHome() {
  const box = d$("#d-modes");
  if (!box) return;
  box.replaceChildren();
  for (const [kind, def] of Object.entries(DECOMP_KINDS)) {
    box.append(dEl("button", { class: "m-card", onclick: () => openDecompConfig(kind) }, [
      dEl("span", { class: "m-no" }, kind === "add" ? "凑十" : "破十"),
      dEl("div", {}, [
        dEl("b", {}, def.title),
        dEl("p", {}, def.desc),
        dEl("small", {}, "先选档位和范围 →"),
      ]),
    ]));
  }
}

function startDecompRound(kind, stage, rangeId) {
  if (dState && !dState.finished &&
    !confirm(`「${DECOMP_KINDS[dState.kind].title}」还没做完，重新开始新练习吗？`)) return;
  clearTimeout(dAdvanceTimer);
  dAdvanceTimer = null;
  dState = newDecompRound(kind, stage, rangeId);
  dShow("d-quiz");
  loadDQuestion();
}

function dGoHome() {
  if (dState && !dState.finished && !confirm("这一轮还没做完，确定退出吗？")) return;
  clearTimeout(dAdvanceTimer);
  dAdvanceTimer = null;
  document.querySelectorAll("#view-math .m-subview").forEach((n) => n.classList.add("hidden"));
  d$("#m-home").classList.remove("hidden");
  renderDHome();
}

function dBlankEl(id) {
  return dEl("span", { class: "d-blank", "data-blank": String(id) });
}

function renderDChain() {
  const s = dState;
  d$("#d-eq").replaceChildren(
    ...s.chain.top.map((p) => (typeof p === "string" ? dEl("span", { class: "d-tok" }, p) : dBlankEl(p.blank)))
  );
  const box = d$("#d-lines");
  box.replaceChildren();
  for (const line of s.chain.lines) {
    box.append(dEl("div", { class: "d-line" }, [
      dEl("span", { class: "d-lab" }, line.label),
      ...line.parts.map((p) => (typeof p === "string" ? dEl("span", { class: "d-tok" }, p) : dBlankEl(p.blank))),
    ]));
  }
}

function loadDQuestion() {
  const s = dState;
  s.q = s.questions[s.qIndex];
  s.chain = s.kind === "add" ? buildMakeTenChain(s.q, s.stage) : buildBreakTenChain(s.q, s.stage);
  s.stepIndex = 0;
  s.mistakes = 0;
  s.buffer = "";
  d$("#d-count").textContent = `第 ${s.qIndex + 1} / ${s.questions.length} 题`;
  d$("#d-fill").style.width = `${Math.round((s.qIndex / s.questions.length) * 100)}%`;
  d$("#d-card").classList.remove("vdone");
  renderDChain();
  renderDStep();
}

function dTargetEl(blank) {
  return document.querySelector(`#d-card .d-blank[data-blank="${String(blank)}"]`);
}

function renderDStep() {
  const s = dState;
  const step = s.chain.steps[s.stepIndex];
  s.buffer = "";
  d$("#d-hint").textContent = step.hint;
  const target = dTargetEl(step.blank);
  document.querySelectorAll("#d-card .d-blank").forEach((el) => el.classList.remove("d-target"));
  if (target) target.classList.add("d-target");
  document.querySelectorAll("#d-card .d-line").forEach((line) => {
    const blanks = line.querySelectorAll(".d-blank");
    const allFilled = blanks.length > 0 && [...blanks].every((b) => b.classList.contains("d-filled"));
    line.classList.toggle("d-ok", allFilled);
    line.classList.toggle("d-active", !allFilled && line.contains(target));
  });
  d$("#d-keypad").classList.remove("dim");
}

function dKey(digit) {
  const s = dState;
  if (!s || s.finished || dAdvanceTimer) return;
  const step = s.chain.steps[s.stepIndex];
  if (!step) return;
  if (s.buffer.length >= String(step.expect).length) return;
  s.buffer += String(digit);
  const target = dTargetEl(step.blank);
  if (target) target.textContent = s.buffer;
  if (s.buffer.length === String(step.expect).length) {
    if (Number(s.buffer) === step.expect) {
      if (target) { target.classList.remove("d-target"); target.classList.add("d-filled", "vpop"); }
      dAdvance();
    } else {
      s.mistakes++;
      if (target) {
        target.classList.add("vshake", "d-wrong");
        setTimeout(() => target.classList.remove("vshake", "d-wrong"), 420);
      }
      s.buffer = "";
      setTimeout(() => { if (target) target.textContent = ""; }, 400);
    }
  }
}

function dBackspace() {
  const s = dState;
  if (!s || dAdvanceTimer) return;
  s.buffer = "";
  const step = s.chain.steps[s.stepIndex];
  const target = step && dTargetEl(step.blank);
  if (target) target.textContent = "";
}

function dAdvance() {
  const s = dState;
  s.stepIndex++;
  if (s.stepIndex >= s.chain.steps.length) dQuestionDone();
  else renderDStep();
}

function dQuestionDone() {
  const s = dState;
  s.results.push({ q: s.q, mistakes: s.mistakes });
  document.querySelectorAll("#d-card .d-blank").forEach((el) => el.classList.remove("d-target"));
  document.querySelectorAll("#d-card .d-line").forEach((line) => {
    line.classList.remove("d-active");
    line.classList.add("d-ok");
  });
  d$("#d-keypad").classList.add("dim");
  d$("#d-card").classList.add("vdone");
  d$("#d-hint").textContent = s.mistakes === 0 ? "🎉 一路全对，真棒！" : "做出来了，继续下一题！";
  dAdvanceTimer = setTimeout(() => {
    dAdvanceTimer = null;
    s.qIndex++;
    if (s.qIndex >= s.questions.length) renderDDone();
    else loadDQuestion();
  }, 1200);
}

function renderDDone() {
  const s = dState;
  s.finished = true;
  const total = s.questions.length;
  const perfect = s.results.filter((r) => r.mistakes === 0).length;
  const misses = s.results.reduce((n, r) => n + r.mistakes, 0);
  const def = DECOMP_KINDS[s.kind];
  const rangeLabel = (def.ranges.find((r) => r.id === s.rangeId) || { label: "" }).label;
  const stageLabel = s.stage === 1 ? "一档" : "二档";
  const perfectAll = perfect === total;
  let discovery = false;
  if (s.kind === "add" && s.stage === 2 && s.rangeId === "9") {
    const res = updateDiscoveryState(loadDecompConfig(), s.kind, s.stage, s.rangeId, perfectAll);
    saveDecompConfig(res.cfg);
    discovery = res.show;
  }
  const actions = [
    dEl("button", { class: "secondary", onclick: dGoHome }, "返回数学"),
    dEl("button", { class: "primary", onclick: () => startDecompRound(s.kind, s.stage, s.rangeId) }, "再来一轮"),
  ];
  if (perfectAll && s.stage === 1) {
    actions.push(dEl("button", { class: "primary", onclick: () => startDecompRound(s.kind, 2, s.rangeId) }, "升级二档（撤掉推导）→"));
  }
  const rangeIdx = def.ranges.findIndex((r) => r.id === s.rangeId);
  if (perfectAll && s.stage === 2 && rangeIdx >= 0 && rangeIdx < def.ranges.length - 1) {
    const next = def.ranges[rangeIdx + 1];
    actions.push(dEl("button", { class: "primary", onclick: () => startDecompRound(s.kind, s.stage, next.id) }, `试试「${next.label}」→`));
  }
  if (perfectAll && s.stage === 2 && s.rangeId === "all") {
    actions.push(dEl("button", { class: "primary", onclick: () => startMathMode(within20CustomMode("mix", "all")) }, "去「20以内直答」检验 →"));
  }
  const kids = [
    dEl("div", { class: "seal" }, "🎉"),
    dEl("p", { class: "eyebrow" }, "ROUND COMPLETE"),
    dEl("h2", {}, `「${def.title} · ${stageLabel} · ${rangeLabel}」完成！`),
    dEl("p", {}, `共 ${total} 题，一路全对 ${perfect} 题，总共错 ${misses} 次。`),
    dEl("div", { class: "summary-grid" }, [
      dEl("div", {}, [dEl("b", {}, `${perfect} / ${total}`), dEl("span", {}, "一路全对")]),
      dEl("div", {}, [dEl("b", {}, `${misses}`), dEl("span", {}, "总共错几次")]),
    ]),
    ...(discovery ? [dEl("p", { class: "d-discovery" },
      "💡 给爸爸妈妈：找机会问问孩子——9 加几的答案，个位和加数比一比，有什么规律？让他自己说出来才算数。")] : []),
    dEl("div", { class: "hz-chip-row" }, s.results.map((r) =>
      dEl("span", { class: `chip m-chip${r.mistakes ? " m-chip-miss" : ""}` },
        `${r.q.a} ${r.q.op} ${r.q.b} = ${r.q.ans}${r.mistakes ? ` ✗${r.mistakes}` : " ✓"}`))),
    dEl("div", { class: "hz-summary-actions" }, actions),
  ];
  const box = d$("#d-done");
  box.replaceChildren();
  box.append(dEl("div", { class: "summary" }, kids));
  dShow("d-done");
}

if (typeof document !== "undefined") {
  const pad = d$("#d-keypad");
  for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9, "del", 0]) {
    const key = dEl("button", { class: `vkey${k === "del" ? " del" : ""}`, type: "button" }, k === "del" ? "⌫" : String(k));
    key.addEventListener("click", () => (k === "del" ? dBackspace() : dKey(k)));
    pad.appendChild(key);
  }
  d$("#d-back").addEventListener("click", dGoHome);
  d$("#d-config-close").addEventListener("click", hideDConfig);
  d$("#d-config").addEventListener("click", (e) => { if (e.target.id === "d-config") hideDConfig(); });
  d$("#d-config-start").addEventListener("click", onDConfigStart);
  document.addEventListener("keydown", (e) => {
    if (!document.querySelector("#view-math") || !document.querySelector("#view-math").classList.contains("active")) return;
    if (d$("#d-quiz").classList.contains("hidden")) return;
    if (e.key >= "0" && e.key <= "9") dKey(Number(e.key));
    else if (e.key === "Backspace") dBackspace();
  });
  const within20 = (typeof MATH_MODES !== "undefined" ? MATH_MODES : []).find((m) => m.id === "within20");
  if (within20) within20.setup = openWithin20Config;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DECOMP_QUESTIONS,
    DECOMP_ADD_RANGES,
    DECOMP_SUB_RANGES,
    buildDecompAddPool,
    buildDecompSubPool,
    buildMakeTenChain,
    buildBreakTenChain,
    updateDiscoveryState,
    newDecompRound,
  };
}
