/* ---------------- 数学 · 口算速练（离线版） ---------------- */
//   10以内加减法 —— 一轮 126 题（加法 81：加数 2~10、和可超过 10；减法 45；±1 已去掉）。
//   20以内进位·退位 / 100以内不进位·不退位 —— 一轮各 20 题，错题不重现。
//   乘法口诀 2~5 / 6~9 —— 按北京版二上第二、四单元划分，整轮错题强化（同 10 以内）。
// 轮次不落库：刷新即重新随机，轮内进度只留在当前页面。

const MATH_MASTER_STREAK = 3;
const MATH_REQUEUE_MIN = 3;
const MATH_REQUEUE_MAX = 5;

const m$ = (sel) => document.querySelector(sel);
const mEl = (tag, attrs = {}, children = []) => {
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

function mathQ(a, op, b) {
  return { id: `${a}${op}${b}`, a, op, b, ans: op === "+" ? a + b : op === "-" ? a - b : a * b };
}

function buildMathPool() {
  const pool = [];
  for (let a = 2; a <= 10; a++)
    for (let b = 2; b <= 10; b++)
      pool.push(mathQ(a, "+", b));
  for (let a = 2; a <= 10; a++)
    for (let b = 2; b <= a; b++)
      pool.push(mathQ(a, "-", b));
  return pool;
}

function buildWithin20AddPool() {
  const pool = [];
  for (let a = 2; a <= 9; a++)
    for (let b = Math.max(2, 11 - a); b <= 9; b++)
      pool.push(mathQ(a, "+", b));
  return pool;
}

function buildWithin20SubPool() {
  const pool = [];
  for (let b = 2; b <= 9; b++)
    for (let o = 1; o <= Math.min(8, b - 1); o++)
      pool.push(mathQ(10 + o, "-", b));
  return pool;
}

function buildWithin100AddPool() {
  const pool = [];
  for (let ta = 1; ta <= 9; ta++)
    for (let tb = 1; ta + tb <= 9; tb++)
      for (let oa = 0; oa <= 9; oa++)
        for (let ob = 0; oa + ob <= 9; ob++)
          pool.push(mathQ(ta * 10 + oa, "+", tb * 10 + ob));
  return pool;
}

function buildWithin100SubPool() {
  const pool = [];
  for (let a = 10; a <= 99; a++)
    for (let b = 10; b < a; b++)
      if (a % 10 >= b % 10) pool.push(mathQ(a, "-", b));
  return pool;
}

/* 乘法口诀：×1 太简单不练（同 10 以内去掉 ±1 的惯例），其余因数两种顺序都练 */
function buildMult25Pool() {
  const pool = [];
  for (let a = 2; a <= 5; a++)
    for (let b = 2; b <= 5; b++)
      pool.push(mathQ(a, "×", b));
  return pool;
}

function buildMult69Pool() {
  const pool = [];
  for (let a = 2; a <= 9; a++)
    for (let b = 2; b <= 9; b++)
      if (Math.max(a, b) >= 6) pool.push(mathQ(a, "×", b));
  return pool;
}

function shuffledMath(items, rng = Math.random) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sampleMath(pool, n, rng) {
  return shuffledMath(pool, rng).slice(0, n);
}

/* 进位加 / 退位减的细分范围：拆解填空教学用大数在前的子集，直答专项两种顺序都练 */
const WITHIN20_ADD_RANGES = [
  { id: "9", label: "9 加几", match: (q) => q.a === 9 || q.b === 9 },
  { id: "8", label: "8 加几", match: (q) => q.a === 8 || q.b === 8 },
  { id: "76", label: "7、6 加几", match: (q) => q.a <= 7 && q.b <= 7 },
  { id: "all", label: "全部混合", match: () => true },
];
const WITHIN20_SUB_RANGES = [
  { id: "9", label: "十几减 9", match: (q) => q.b === 9 },
  { id: "8", label: "十几减 8", match: (q) => q.b === 8 },
  { id: "76", label: "十几减 7、6", match: (q) => q.b === 6 || q.b === 7 },
  { id: "all", label: "全部混合", match: () => true },
];

/* 「20以内进位·退位」直答的可配置出题：mix 维持原 10+10 混合；add/sub 出该范围的专项一轮 */
function buildWithin20Custom(kind, rangeId, rng = Math.random) {
  if (kind === "add" || kind === "sub") {
    const ranges = kind === "add" ? WITHIN20_ADD_RANGES : WITHIN20_SUB_RANGES;
    const range = ranges.find((r) => r.id === rangeId) || ranges[ranges.length - 1];
    const pool = (kind === "add" ? buildWithin20AddPool() : buildWithin20SubPool()).filter(range.match);
    return sampleMath(pool, Math.min(10, pool.length), rng);
  }
  return shuffledMath([
    ...sampleMath(buildWithin20AddPool(), 10, rng),
    ...sampleMath(buildWithin20SubPool(), 10, rng),
  ], rng);
}

const MATH_MODES = [
  {
    id: "within10",
    icon: "10",
    title: "10以内加减法",
    desc: "126 题随机打乱：加数 2~10、和可以超过 10（如 8+9=17），不含 ±1 的简单题。第一次就对的直接过关；错过的题连对 3 次才过关。",
    small: "一轮 126 题 · 错题强化",
    requeue: true,
    build: (rng) => shuffledMath(buildMathPool(), rng),
  },
  {
    id: "within20",
    icon: "20",
    title: "20以内进位·退位",
    desc: "进位加法（如 8+5）和退位减法（如 13-9）心算直答自查。可选只加、只减，或按 9 加几、十几减 9 分段。错题不重复出现。",
    small: "默认混合 20 题 · 可选范围",
    requeue: false,
    build: (rng) => shuffledMath([
      ...sampleMath(buildWithin20AddPool(), 10, rng),
      ...sampleMath(buildWithin20SubPool(), 10, rng),
    ], rng),
  },
  {
    id: "within100",
    icon: "100",
    title: "100以内不进位·不退位",
    desc: "两位数加减两位数（如 45+32、67-25），个位不进位、不退位。错题不重复出现。",
    small: "一轮 20 题",
    requeue: false,
    build: (rng) => shuffledMath([
      ...sampleMath(buildWithin100AddPool(), 10, rng),
      ...sampleMath(buildWithin100SubPool(), 10, rng),
    ], rng),
  },
  {
    id: "mult25",
    icon: "2~5",
    title: "乘法口诀·2~5",
    desc: "因数 2~5 的表内乘法（如 3×4、5×5），两种顺序都练。第一次就对的直接过关；错过的题连对 3 次才过关。",
    small: "一轮 16 题 · 错题强化",
    requeue: true,
    build: (rng) => shuffledMath(buildMult25Pool(), rng),
  },
  {
    id: "mult69",
    icon: "6~9",
    title: "乘法口诀·6~9",
    desc: "带 6、7、8、9 的表内乘法（如 6×4、8×9），也混着学过的小因数。第一次就对的直接过关；错过的题连对 3 次才过关。",
    small: "一轮 48 题 · 错题强化",
    requeue: true,
    build: (rng) => shuffledMath(buildMult69Pool(), rng),
  },
];

/* ----- round engine ----- */

function newMathRound(mode, rng = Math.random) {
  const questions = mode.build(rng);
  const byId = {};
  const stats = {};
  for (const item of questions) {
    byId[item.id] = item;
    stats[item.id] = { appear: 0, everWrong: false, consec: 0, firstResult: null };
  }
  return {
    mode, questions, byId, stats, rng,
    queue: questions.map((item) => item.id),
    current: null, revealed: false, finished: false,
    mastered: 0, judged: 0, right: 0, firstRight: 0,
    startedAt: Date.now(),
  };
}

function mathDraw(state) {
  const id = state.queue.shift();
  state.current = id ? state.byId[id] : null;
  state.revealed = false;
  if (!state.current) state.finished = true;
  return state.current;
}

function mathJudge(state, isRight) {
  const item = state.current;
  const st = state.stats[item.id];
  state.judged++;
  st.appear++;
  if (st.appear === 1) {
    st.firstResult = isRight ? "right" : "wrong";
    if (isRight) state.firstRight++;
  }
  let retired = false;
  if (isRight) {
    state.right++;
    st.consec++;
    if (!state.mode.requeue || !st.everWrong || st.consec >= MATH_MASTER_STREAK) {
      state.mastered++;
      retired = true;
    }
  } else {
    st.everWrong = true;
    st.consec = 0;
    if (!state.mode.requeue) retired = true;
  }
  if (!retired) {
    const delay = MATH_REQUEUE_MIN + Math.floor(state.rng() * (MATH_REQUEUE_MAX - MATH_REQUEUE_MIN + 1));
    state.queue.splice(Math.min(state.queue.length, delay), 0, item.id);
  }
  return retired;
}

/* ----- 视图 ----- */

let mathState = null;
let mathTimer = null;
let mathPending = false;

function mShow(view) {
  document.querySelectorAll("#view-math .m-subview").forEach((n) => n.classList.toggle("hidden", n.id !== view));
  if (view === "m-home") {
    renderMHome();
    if (typeof renderVHome === "function") renderVHome();
    if (typeof renderDHome === "function") renderDHome();
  }
}

function mathRemaining(s) {
  return s.mode.requeue ? s.questions.length - s.mastered : s.questions.length - s.judged;
}

function renderMHome() {
  const box = m$("#m-modes");
  box.replaceChildren();
  if (mathState && !mathState.finished) {
    box.append(mEl("button", { class: "m-card m-resume", onclick: resumeMathRound }, [
      mEl("span", { class: "m-no" }, "⏳"),
      mEl("div", {}, [
        mEl("b", {}, `继续「${mathState.mode.title}」`),
        mEl("p", {}, `还剩 ${mathRemaining(mathState)} 题没做完，接着练。`),
        mEl("small", {}, "点这里继续 →"),
      ]),
    ]));
  }
  for (const mode of MATH_MODES) {
    /* 带 setup 的模式（如 within20 直答）先弹配置再开练 */
    box.append(mEl("button", { class: "m-card", onclick: () => (mode.setup ? mode.setup() : startMathMode(mode)) }, [
      mEl("span", { class: "m-no" }, mode.icon),
      mEl("div", {}, [
        mEl("b", {}, mode.title),
        mEl("p", {}, mode.desc),
        mEl("small", {}, mode.small),
      ]),
    ]));
  }
}

function startMathMode(mode) {
  if (mathState && !mathState.finished) {
    const s = mathState;
    if (!confirm(`「${s.mode.title}」还剩 ${mathRemaining(s)} 题没做完，放弃它并开始「${mode.title}」吗？`)) return;
  }
  startMathRound(mode);
}

function startMathRound(mode) {
  clearTimeout(mathTimer);
  mathPending = false;
  mathState = newMathRound(mode);
  mShow("m-quiz");
  mathDrawNext();
}

function resumeMathRound() {
  mShow("m-quiz");
  renderMQuestion();
}

function mathGoHome() {
  clearTimeout(mathTimer);
  if (mathPending) {
    mathPending = false;
    mathDrawNext();
  }
  mShow("m-home");
}

function mathDrawNext() {
  if (!mathDraw(mathState)) {
    renderMDone();
    mShow("m-done");
    return;
  }
  renderMQuestion();
}

function renderMQuestion() {
  const s = mathState;
  const q = s.current;
  const st = s.stats[q.id];
  const total = s.questions.length;
  s.revealed = false;
  if (s.mode.requeue) {
    m$("#m-count").textContent = `已过关 ${s.mastered} / ${total}`;
    m$("#m-fill").style.width = `${Math.round((s.mastered / total) * 100)}%`;
  } else {
    m$("#m-count").textContent = `第 ${Math.min(s.judged + 1, total)} / ${total} 题`;
    m$("#m-fill").style.width = `${Math.round((s.judged / total) * 100)}%`;
  }
  m$("#m-card").classList.remove("m-right", "m-wrong");
  const note = m$("#m-note");
  if (s.mode.requeue && st.everWrong) {
    note.textContent = `这题错过啦，再连对 ${MATH_MASTER_STREAK - st.consec} 次就过关`;
    note.classList.remove("hidden");
  } else {
    note.classList.add("hidden");
  }
  const eq = m$("#m-eq");
  eq.replaceChildren(
    mEl("span", { class: "m-eq-text" }, `${q.a} ${q.op} ${q.b} =`),
    mEl("span", { class: "m-ans" }, "?")
  );
  const actions = m$("#m-actions");
  actions.replaceChildren();
  const peek = mEl("button", { class: "reveal" }, "👀 看答案");
  peek.addEventListener("click", revealMAnswer);
  actions.append(peek);
}

function revealMAnswer() {
  const s = mathState;
  if (!s || s.finished || s.revealed) return;
  s.revealed = true;
  const ans = m$("#m-eq .m-ans");
  ans.textContent = s.current.ans;
  ans.classList.add("m-ans-shown");
  const actions = m$("#m-actions");
  actions.replaceChildren();
  const yes = mEl("button", { class: "yes" }, "✓ 我对了");
  yes.addEventListener("click", () => judgeM(true));
  const no = mEl("button", { class: "no" }, "✗ 我错了");
  no.addEventListener("click", () => judgeM(false));
  actions.append(yes, no);
}

function judgeM(isRight) {
  const s = mathState;
  if (!s || s.finished || !s.revealed) return;
  s.revealed = false;
  mathJudge(s, isRight);
  m$("#m-card").classList.add(isRight ? "m-right" : "m-wrong");
  for (const b of m$("#m-actions").querySelectorAll("button")) b.disabled = true;
  mathPending = true;
  mathTimer = setTimeout(() => {
    mathPending = false;
    mathDrawNext();
  }, 450);
}

function renderMDone() {
  const s = mathState;
  const total = s.questions.length;
  const secs = Math.max(1, Math.round((Date.now() - s.startedAt) / 1000));
  const time = secs >= 60 ? `${Math.floor(secs / 60)} 分 ${String(secs % 60).padStart(2, "0")} 秒` : `${secs} 秒`;
  const missed = s.questions.filter((item) => s.stats[item.id].firstResult === "wrong");
  const kids = [];
  if (s.mode.requeue) {
    const firstAcc = Math.round((s.firstRight / total) * 100);
    kids.push(
      mEl("div", { class: "seal" }, "🎉"),
      mEl("p", { class: "eyebrow" }, "ROUND COMPLETE"),
      mEl("h2", {}, "这一轮全部过关！"),
      mEl("p", {}, `${total} 道题都过关啦，用时 ${time}。`),
      mEl("div", { class: "summary-grid" }, [
        mEl("div", {}, [mEl("b", {}, `${firstAcc}%`), mEl("span", {}, "第一次就答对")]),
        mEl("div", {}, [mEl("b", {}, `${s.judged}`), mEl("span", {}, "总共答题次数")]),
      ])
    );
  } else {
    kids.push(
      mEl("div", { class: "seal" }, s.right === total ? "🏆" : "🎉"),
      mEl("p", { class: "eyebrow" }, "ROUND COMPLETE"),
      mEl("h2", {}, "这一轮完成！"),
      mEl("p", {}, `共 ${total} 题，答对 ${s.right} 题，用时 ${time}。`),
      mEl("div", { class: "summary-grid" }, [
        mEl("div", {}, [mEl("b", {}, `${s.right} / ${total}`), mEl("span", {}, "答对题数")]),
        mEl("div", {}, [mEl("b", {}, `${Math.round((s.right / total) * 100)}%`), mEl("span", {}, "正确率")]),
      ])
    );
  }
  if (missed.length) {
    const label = s.mode.requeue ? "第一次做错、后来练会过关的题（给爸爸妈妈看）：" : "做错的题（给爸爸妈妈看）：";
    kids.push(mEl("p", { class: "m-missed-note" }, label));
    kids.push(mEl("div", { class: "hz-chip-row" },
      missed.map((item) => mEl("span", { class: "chip m-chip" }, `${item.a} ${item.op} ${item.b} = ${item.ans}`))));
  } else {
    kids.push(mEl("p", { class: "m-missed-note" },
      s.mode.requeue ? "每一题都是一次就答对，太厉害了！" : "全部答对，一个都没错，太厉害了！"));
  }
  kids.push(mEl("div", { class: "hz-summary-actions" }, [
    mEl("button", { class: "secondary", onclick: mathGoHome }, "完成"),
    mEl("button", { class: "primary", onclick: () => startMathRound(s.mode) }, "再来一轮"),
  ]));
  const box = m$("#m-done");
  box.replaceChildren();
  box.append(mEl("div", { class: "summary" }, kids));
}

if (typeof document !== "undefined") {
  m$("#m-back").addEventListener("click", mathGoHome);
  const navButton = document.querySelector('.nav-button[data-view="math"]');
  if (navButton) navButton.addEventListener("click", () => mShow("m-home"));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MATH_MASTER_STREAK,
    MATH_MODES,
    buildMathPool,
    buildWithin20AddPool,
    buildWithin20SubPool,
    WITHIN20_ADD_RANGES,
    WITHIN20_SUB_RANGES,
    buildWithin20Custom,
    buildWithin100AddPool,
    buildWithin100SubPool,
    buildMult25Pool,
    buildMult69Pool,
    shuffledMath,
    newMathRound,
    mathDraw,
    mathJudge,
  };
}
