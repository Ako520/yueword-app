/* ---------------- 笔顺练习（HanziWriter，数据离线自带） ---------------- */
// 与桌面版同源逻辑：字卡「✍️ 看笔顺」+ 学汉字首页的查字输入框。
// 数据只有 stroke_data.js 里的课本生字（离线 PWA 不联网），没有的字直接提示。

let strokeWriter = null;
let strokeChar = "";
let strokeSlow = false;
let strokeDataLoading = null;

const sw$ = (sel) => document.querySelector(sel);
const swEl = (tag, attrs = {}, children = []) => {
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

function swToast(message) {
  const node = sw$("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(node.timer);
  node.timer = setTimeout(() => node.classList.remove("show"), 2400);
}

function loadStrokeBundle() {
  if (window.YueWordStrokeData) return Promise.resolve();
  if (strokeDataLoading) return strokeDataLoading;
  strokeDataLoading = new Promise((resolve, reject) => {
    const script = swEl("script", { src: "stroke_data.js" });
    script.onload = () => resolve();
    script.onerror = () => {
      strokeDataLoading = null;
      reject(new Error("笔顺数据加载失败"));
    };
    document.head.appendChild(script);
  });
  return strokeDataLoading;
}

function strokeOptions() {
  return {
    width: 272,
    height: 272,
    padding: 6,
    showCharacter: false,
    showOutline: true,
    strokeColor: "#20241f",
    radicalColor: "#a85e42",
    outlineColor: "#ddd4c2",
    highlightColor: "#a85e42",
    drawingColor: "#536a54",
    strokeAnimationSpeed: strokeSlow ? 0.45 : 1,
    delayBetweenStrokes: strokeSlow ? 1400 : 700,
    charDataLoader: (char, onComplete) => {
      const local = window.YueWordStrokeData && window.YueWordStrokeData[char];
      onComplete(local || null);
    },
    onLoadCharDataError: () => {
      sw$("#stroke-status").textContent = "这个字暂时没有笔顺数据";
    },
  };
}

function strokeAnimate() {
  if (!strokeWriter) return;
  sw$("#stroke-status").textContent = strokeSlow ? "慢速看，一笔一笔写出来…" : "看好了，一笔一笔写出来…";
  strokeWriter.animateCharacter({
    onComplete: () => {
      sw$("#stroke-status").textContent = "写完啦！点「我来写」试试自己写。";
    },
  });
}

function strokeQuiz() {
  if (!strokeWriter) return;
  sw$("#stroke-status").textContent = "按笔顺在格子里写第一笔";
  strokeWriter.quiz({
    leniency: 1.2,
    showHintAfterMisses: 2,
    markStrokeCorrectAfterMisses: 3,
    onCorrectStroke: (data) => {
      sw$("#stroke-status").textContent = data.strokesRemaining > 0
        ? `✓ 第 ${data.strokeNum + 1} 画写对了，继续`
        : "全部写对啦！";
    },
    onComplete: (data) => {
      sw$("#stroke-status").textContent = data.totalMistakes
        ? `🎉 「${strokeChar}」写对啦！错了 ${data.totalMistakes} 次，再来一遍会更熟`
        : `🎉 「${strokeChar}」一次就写对，太棒了！`;
    },
  });
}

function buildStrokeWriter() {
  const target = sw$("#stroke-target");
  target.replaceChildren();
  strokeWriter = HanziWriter.create(target, strokeChar, strokeOptions());
}

function openStrokePlayer(char) {
  const first = String(char || "").trim().charAt(0);
  if (!/^[\u3400-\u9fff\uf900-\ufaff]$/.test(first)) return;
  strokeChar = first;
  loadStrokeBundle()
    .then(() => {
      if (!window.YueWordStrokeData[first]) {
        swToast(`暂无「${first}」的笔顺数据（目前带课本生字）`);
        return;
      }
      const data = window.YueWordStrokeData[first];
      sw$("#stroke-title").textContent = `「${first}」 · ${data.strokes.length} 画`;
      sw$("#stroke-status").textContent = "";
      sw$("#stroke-overlay").classList.remove("hidden");
      buildStrokeWriter();
      setTimeout(strokeAnimate, 250);
    })
    .catch((e) => swToast(e.message));
}

function closeStrokePlayer() {
  if (strokeWriter) strokeWriter.cancelQuiz();
  sw$("#stroke-overlay").classList.add("hidden");
}

function mountStrokeLookup(container) {
  if (!container || container.querySelector("#stroke-lookup-form")) return;
  const form = swEl("form", { id: "stroke-lookup-form", class: "sw-lookup" }, [
    swEl("span", { class: "sw-lookup-label" }, "✍️ 学笔顺"),
    swEl("input", { id: "stroke-input", maxlength: "2", placeholder: "输入一个字，看田字格里一笔一笔写", autocomplete: "off" }),
    swEl("button", { class: "primary", type: "submit" }, "看笔顺"),
  ]);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    openStrokePlayer(sw$("#stroke-input").value);
    sw$("#stroke-input").value = "";
  });
  container.append(form);
}

if (typeof document !== "undefined") {
  sw$("#stroke-close").addEventListener("click", closeStrokePlayer);
  sw$("#stroke-overlay").addEventListener("click", (e) => {
    if (e.target.id === "stroke-overlay") closeStrokePlayer();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sw$("#stroke-overlay").classList.contains("hidden")) closeStrokePlayer();
  });
  sw$("#stroke-play").addEventListener("click", strokeAnimate);
  sw$("#stroke-quiz").addEventListener("click", strokeQuiz);
  sw$("#stroke-slow").addEventListener("click", () => {
    strokeSlow = !strokeSlow;
    sw$("#stroke-slow").textContent = strokeSlow ? "🐇 正常速度" : "🐢 慢速";
    if (strokeWriter) {
      strokeWriter.cancelQuiz();
      buildStrokeWriter();
      setTimeout(strokeAnimate, 250);
    }
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { openStrokePlayer, mountStrokeLookup };
}
