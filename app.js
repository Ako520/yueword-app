(() => {
  const Core = window.YueWordCore;
  const Wordbooks = window.YueWordWordbooks || {};
  const STORAGE_KEY = 'yueword-offline-data-v1';
  const PROFILE_KEY = 'yueword-offline-profile-v1';
  const $ = selector => document.querySelector(selector);
  const colors = ['#536a54', '#a85e42', '#55718a', '#80648b', '#a17e3f'];
  let data = loadData();
  let profileId = Number(localStorage.getItem(PROFILE_KEY)) || data.profiles[0]?.id || null;
  let mode = null;
  let bookScope = null;
  let openBookKey = null;
  let currentWord = null;
  let sequence = null;
  let undo = null;
  let state = 'idle';
  let reviewed = 0;
  let correctCount = 0;
  let speechTimer = null;

  function defaultData() {
    const backup = Core.emptyBackup();
    backup.profiles.push({ id: 1, name: '圆圆', color: colors[0], created_at: Core.now() });
    backup.profiles.push({ id: 2, name: '奇奇', color: colors[1], created_at: Core.now() });
    return backup;
  }

  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      Core.validateBackup(parsed);
      return Core.normalizeData(parsed);
    } catch (_) { return defaultData(); }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (profileId) localStorage.setItem(PROFILE_KEY, String(profileId));
    if (window.YueWordCloud?.configured()) YueWordCloud.queuePush(() => data);
  }

  /* ---------------- 云同步编排 ---------------- */

  async function bootCloud() {
    YueWordCloud.merge = (base, incoming) => Core.mergeBackup(base, incoming).data;
    YueWordCloud.onMerged = (merged) => { data = Core.normalizeData(merged); seedWordbooks(); save(); };
    YueWordCloud.setStatus('正在连接云端…');
    try {
      const remote = await YueWordCloud.fetchData();
      if (remote === null) return;                     // 离线/口令错，状态条已说明
      if (remote.data === null) {                      // 云端还是空的：首次上云，把本机数据推上去
        const result = await YueWordCloud.pushData(data);
        YueWordCloud.setStatus(result.ok ? '✓ 已把本机数据存入云端' : '云同步失败：' + result.error);
        return;
      }
      if (remote.rev === YueWordCloud.localRev()) { YueWordCloud.setStatus('✓ 已是最新'); return; }
      const merged = Core.normalizeData(Core.mergeBackup(remote.data, data).data);
      data = merged;
      seedWordbooks();
      YueWordCloud.setRev(remote.rev);                 // 让随后的自动推送带着正确版本号
      save();
      updateProfile();
      renderBook();
      YueWordCloud.setStatus('✓ 已从云端同步');
    } catch (error) {
      YueWordCloud.setStatus('同步出错：' + error.message + '（本机数据不受影响）');
    }
  }

  const currentProfile = () => data.profiles.find(profile => Number(profile.id) === Number(profileId));
  const words = () => data.words.filter(word => Number(word.profile_id) === Number(profileId));
  const enWords = () => words().filter(word => word.kind !== 'zh');
  const zhWords = () => words().filter(word => word.kind === 'zh');
  const meanings = wordId => data.meanings.filter(item => Number(item.word_id) === Number(wordId)).sort((a, b) => Number(a.position) - Number(b.position));
  const charStatus = (book, char) => (data.charlist_status || []).find(item => Number(item.profile_id) === Number(profileId) && item.book === book && item.char === char);
  // 顺序巩固的存档键：主生词本一份，每本内置单词本各一份（断点续学互不干扰）
  const sequenceKey = (bookKey = null) => `yueword-offline-sequence-${profileId}${bookKey ? `-book-${bookKey}` : ''}`;

  function loadSequence(bookKey = null) {
    try {
      const saved = JSON.parse(localStorage.getItem(sequenceKey(bookKey)));
      if (!saved || saved.version !== 1 || Number(saved.profileId) !== Number(profileId)) return null;
      if (bookKey ? (saved.book !== bookKey || saved.bookVer !== (Wordbooks[bookKey]?.version || 1)) : saved.book) return null;   // 主序列与书序列不混用；书目升版后从新顺序重学
      if (!saved.queue || !saved.queue.length) return null;             // 已学完的存档作废，下次从头开始
      return saved;
    } catch (_) { return null; }
  }

  /* ---------------- 内置单词本 ---------------- */

  const wordbookKeys = () => Object.keys(Wordbooks);
  const bookWordSet = key => new Set((Wordbooks[key]?.words || []).map(item => String(item.word).toLocaleLowerCase()));
  const bookWordsOf = key => enWords().filter(word => bookWordSet(key).has(String(word.word).toLocaleLowerCase()));
  // 按老师词表顺序返回 [词条, 生词本里的词]，生词本没有的（已删除）word 为 undefined
  const bookRows = key => {
    const pool = enWords();
    return (Wordbooks[key]?.words || []).map(entry => [entry, pool.find(word => String(word.word).toLocaleLowerCase() === String(entry.word).toLocaleLowerCase())]);
  };

  // 把还没播种过（或书目已升版）的内置单词本补进各个用户：新词加进来，老词补缺失的例句；
  // 用户删掉的词不会被复活。旧部署的 seed 记录没存当时的词表，用部署版词表兜底，
  // 好让升版时能区分"用户新删的词"（跳过）和"书目这次新增的词"（补建）。
  const LEGACY_BOOK_WORDS = {
    duoduo: ['grow', 'small', 'family', 'eat', 'delicious', 'cat', 'little white mouse', 'cook', 'house', 'garden', 'flower', 'fruit tree', 'vegetables', 'under', 'seed', 'turnip', 'earth', 'go to bed', 'In the night', 'big', 'enormous', 'In the morning', 'hand', 'wonderful', 'pull', 'Nothing happens!', 'wife', 'son & daughter', 'dog']
  };
  function seedWordbooks() {
    for (const profile of data.profiles) {
      for (const key of wordbookKeys()) {
        const book = Wordbooks[key];
        const record = (data.wordbook_seeds || []).find(seed => Number(seed.profile_id) === Number(profile.id) && seed.book === key);
        const knownWords = record && Array.isArray(record.words) && record.words.length ? record.words : LEGACY_BOOK_WORDS[key];
        data = Core.seedWordbook(data, profile.id, key, book.words, { version: book.version || 1, knownWords }).data;
      }
    }
  }

  function sequenceButtonLabel(key) {
    const saved = loadSequence(key);
    return saved ? `继续顺序学：已看 ${saved.seenWordIds.length}/${saved.originalWordIds.length}` : '📖 顺序学一遍';
  }

  function renderWordbooks() {
    const section = $('#wordbook-section');
    if (!section) return;
    section.classList.toggle('hidden', !wordbookKeys().length);
    const grid = $('#wordbook-grid');
    grid.replaceChildren();
    for (const key of wordbookKeys()) {
      const book = Wordbooks[key];
      const card = document.createElement('div');
      card.className = 'hz-book-card';
      card.onclick = () => showBookDetail(key);
      const titleEl = document.createElement('b');
      titleEl.textContent = `📕 ${book.title}`;
      const desc = document.createElement('p');
      desc.textContent = book.desc || '';
      const meta = document.createElement('small');
      meta.textContent = `已加入 ${bookWordsOf(key).length}/${book.words.length} 词 · 点开看完整词表`;
      const actions = document.createElement('div');
      actions.className = 'word-tools';
      const seq = document.createElement('button');
      seq.className = 'primary';
      seq.textContent = sequenceButtonLabel(key);
      seq.onclick = event => { event.stopPropagation(); startBookSequence(key); };
      const smart = document.createElement('button');
      smart.className = 'secondary';
      smart.textContent = '✦ 只练本书';
      smart.onclick = event => { event.stopPropagation(); startBookPractice(key); };
      actions.append(seq, smart);
      card.append(titleEl, desc, meta, actions);
      grid.append(card);
    }
  }

  /* 词表浏览：按老师词表顺序一屏看完，可发音、可把删掉的词加回来 */
  function showBookDetail(key) {
    openBookKey = key;
    renderBook();
  }

  function renderWordbookDetail(key) {
    const box = $('#wordbook-detail');
    if (!box) return;
    const book = Wordbooks[key];
    const rows = bookRows(key);
    box.replaceChildren();
    const head = document.createElement('div');
    head.className = 'page-head';
    const joined = rows.filter(([, word]) => word).length;
    head.innerHTML = `<div><p class="eyebrow">WORD BOOK</p><h1></h1><p></p></div><div class="count-stamp">${joined}<br><small>/ ${rows.length}</small></div>`;
    head.querySelector('h1').textContent = book.title;
    head.querySelector('div p:last-child').textContent = `${book.desc || ''} · 按老师词表顺序排列`;
    box.append(head);
    const tools = document.createElement('div');
    tools.className = 'hz-tools';
    const back = document.createElement('button');
    back.className = 'text-button'; back.textContent = '‹ 返回生词本';
    back.onclick = () => showBookDetail(null);
    const seq = document.createElement('button');
    seq.className = 'primary'; seq.textContent = sequenceButtonLabel(key);
    seq.onclick = () => startBookSequence(key);
    const smart = document.createElement('button');
    smart.className = 'secondary'; smart.textContent = '✦ 只练本书';
    smart.onclick = () => startBookPractice(key);
    const dict = document.createElement('button');
    dict.className = 'secondary'; dict.textContent = '✎ 听写测试';
    dict.onclick = () => openDictation(key);
    tools.append(back, seq, smart, dict);
    box.append(tools);
    const list = document.createElement('div');
    list.className = 'word-list';
    rows.forEach(([entry, word], index) => {
      const card = document.createElement('article');
      card.className = 'word-card';
      if (!word) card.style.opacity = '.45';
      const title = document.createElement('div');
      title.innerHTML = `<div class="word-title"><span class="hz-key">${index + 1}</span><h2></h2><button class="mini-speak" aria-label="播放美音">◖))</button></div><div class="word-meta"></div>`;
      title.querySelector('h2').textContent = entry.word;
      title.querySelector('button').onclick = () => speak(entry.word);
      const meta = title.querySelector('.word-meta');
      if (word) meta.textContent = `连对 ${word.streak || 0} · 对/错 ${word.correct_count || 0}/${word.wrong_count || 0}`;
      else {
        const restore = document.createElement('button');
        restore.className = 'icon-button'; restore.textContent = '加回生词本';
        restore.onclick = () => addBookWordBack(entry);
        meta.append('已从生词本删除 · ', restore);
      }
      const copy = document.createElement('div');
      copy.className = 'word-meaning';
      const fallback = [entry.meaning, [entry.sentence, entry.sentence_zh].filter(Boolean).join(' ')].filter(Boolean).join('\n');
      copy.textContent = (word ? meanings(word.id).map(item => item.text).join('\n') : '') || fallback || '暂无释义';
      card.append(title, copy);
      list.append(card);
    });
    box.append(list);
  }

  function addBookWordBack(entry) {
    const spelling = String(entry.word).trim();
    if (!spelling || enWords().some(word => String(word.word).toLocaleLowerCase() === spelling.toLocaleLowerCase())) { renderBook(); return; }
    const id = Core.nextId(data.words);
    data.words.push({ id, profile_id: profileId, kind: 'en', word: spelling, weight: 3, streak: 0, correct_count: 0, wrong_count: 0, us_phonetic: null, uk_phonetic: null, created_at: Core.now(), last_reviewed_at: null });
    if (String(entry.meaning || '').trim()) {
      data.meanings.push({ id: Core.nextId(data.meanings), word_id: id, text: String(entry.meaning).trim(), source: 'book', mkind: 'sense', position: 0, created_at: Core.now() });
    }
    save(); renderBook(); toast('已加回生词本');
  }

  function startBookPractice(key) {
    if (!bookWordsOf(key).length) { toast('这本书的词还没有加入生词本'); return; }
    switchView('study');            // openModes() 会把 bookScope 清回 null
    bookScope = key;
    startStudy('smart');
  }

  function startBookSequence(key) {
    if (!bookRows(key).some(([, word]) => word)) { toast('这本书的词还没有加入生词本'); return; }
    switchView('study');            // openModes() 会把 bookScope 清回 null
    bookScope = key;
    startStudy('sequence');
  }

  /* ---------------- 听写测试 ---------------- */
  let dictation = null;

  // 听写范围是书里还在生词本中的词（已删除的不测，先加回来再说）
  function openDictation(key) {
    const pool = bookRows(key).filter(([, word]) => word).map(([entry, word]) => ({ entry, word }));
    if (!pool.length) { toast('这本书的词还没有加入生词本'); return; }
    dictation = { bookKey: key, pool, selected: pool.map(() => true) };
    $('#dict-select').classList.remove('hidden');
    $('#dict-run').classList.add('hidden');
    $('#dict-summary').classList.add('hidden');
    renderDictSelect();
    $('#dictation-overlay').classList.remove('hidden');
  }

  function renderDictSelect() {
    const box = $('#dict-words');
    box.replaceChildren();
    dictation.pool.forEach(({ entry }, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'dict-chip' + (dictation.selected[index] ? ' on' : '');
      chip.textContent = entry.word;
      chip.setAttribute('aria-pressed', dictation.selected[index] ? 'true' : 'false');
      chip.onclick = () => { dictation.selected[index] = !dictation.selected[index]; chip.classList.toggle('on', dictation.selected[index]); chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); updateDictCount(); };
      box.append(chip);
    });
    updateDictCount();
  }

  function updateDictCount() {
    const count = dictation.selected.filter(Boolean).length;
    $('#dict-count').textContent = `已选 ${count} 词`;
    $('#dict-start').disabled = !count;
  }

  function startDictation(items) {
    const pool = items || dictation.pool.filter((_, index) => dictation.selected[index]);
    const queue = [...pool].sort(() => Math.random() - 0.5);   // 打乱顺序，避免孩子靠背位置过关
    dictation = { ...dictation, queue, index: 0, correct: 0, wrong: [] };
    $('#dict-select').classList.add('hidden');
    $('#dict-summary').classList.add('hidden');
    $('#dict-run').classList.remove('hidden');
    showDictCard();
  }

  function showDictCard() {
    const item = dictation.queue[dictation.index];
    $('#dict-progress').textContent = `第 ${dictation.index + 1}/${dictation.queue.length} 词 · 已对 ${dictation.correct}`;
    $('#dict-hint').textContent = item.entry.meaning || '—';
    const input = $('#dict-input');
    input.value = '';
    input.disabled = false;
    input.focus();
    const feedback = $('#dict-feedback');
    feedback.classList.add('hidden');
    feedback.classList.remove('ok', 'no');
    $('#dict-submit').classList.remove('hidden');
    $('#dict-next').classList.add('hidden');
    speak(item.entry.word);
  }

  function submitDictation() {
    const item = dictation.queue[dictation.index];
    const ok = Core.normalizeDictation($('#dict-input').value) === Core.normalizeDictation(item.entry.word);
    if (ok) dictation.correct += 1;
    else dictation.wrong.push(item);
    data = Core.applyReview(data, item.word.id, ok);   // 听写成绩同样计入学习记录
    save();
    const feedback = $('#dict-feedback');
    feedback.textContent = ok ? '✓ 对了！' : `✗ 正确拼写：${item.entry.word}`;
    feedback.classList.toggle('ok', ok);
    feedback.classList.toggle('no', !ok);
    feedback.classList.remove('hidden');
    $('#dict-input').disabled = true;
    $('#dict-submit').classList.add('hidden');
    const next = $('#dict-next');
    next.textContent = dictation.index + 1 >= dictation.queue.length ? '看结果 →' : '下一个 →';
    next.classList.remove('hidden');
    next.focus();
  }

  function nextDictation() {
    dictation.index += 1;
    if (dictation.index >= dictation.queue.length) finishDictation();
    else showDictCard();
  }

  function finishDictation() {
    $('#dict-run').classList.add('hidden');
    $('#dict-summary').classList.remove('hidden');
    $('#dict-score').textContent = `对了 ${dictation.correct} / ${dictation.queue.length} 个`;
    const list = $('#dict-wrong-list');
    list.replaceChildren();
    dictation.wrong.forEach(({ entry }) => {
      const chip = document.createElement('span');
      chip.className = 'dict-chip on';
      chip.textContent = `${entry.word}（${entry.meaning || '—'}）`;
      list.append(chip);
    });
    if (!dictation.wrong.length) list.append(Object.assign(document.createElement('span'), { className: 'dict-note', textContent: '全部听写正确，太棒了！' }));
    $('#dict-redo-wrong').classList.toggle('hidden', !dictation.wrong.length);
  }

  function closeDictation() {
    dictation = null;
    $('#dictation-overlay').classList.add('hidden');
    renderBook();     // 刷新连对/对错统计显示
  }


  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(node.timer);
    node.timer = setTimeout(() => node.classList.remove('show'), 2400);
  }

  function updateProfile() {
    const profile = currentProfile();
    $('#profile-button span').textContent = profile?.name || '选择用户';
    $('#profile-button i').style.background = profile?.color || '#536a54';
  }

  function switchView(name) {
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
    document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.view === name));
    if (name === 'book') renderBook();
    if (name === 'study') openModes();
    if (name === 'hanzi') openHanzi();
  }

  function renderBook() {
    renderWordbooks();
    const detailOpen = openBookKey && Wordbooks[openBookKey];
    $('#book-home')?.classList.toggle('hidden', Boolean(detailOpen));
    $('#wordbook-detail')?.classList.toggle('hidden', !detailOpen);
    if (detailOpen) { renderWordbookDetail(openBookKey); return; }
    const list = $('#word-list');
    const items = enWords().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);
    const bookSets = wordbookKeys().map(key => [Wordbooks[key].badge || Wordbooks[key].title, bookWordSet(key)]);
    const badgeFor = word => { for (const [badge, set] of bookSets) if (set.has(String(word.word).toLocaleLowerCase())) return badge; return null; };
    $('#book-count').innerHTML = `${items.length}<br><small>WORDS</small>`;
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '生词本还是空的。把今天遇到的第一个生词加进来吧。';
      list.append(empty);
      return;
    }
    for (const word of items) {
      const card = document.createElement('article');
      card.className = 'word-card';
      const title = document.createElement('div');
      title.innerHTML = `<div class="word-title"><h2></h2><button class="mini-speak" aria-label="播放美音">◖))</button></div><div class="word-meta">连对 ${word.streak || 0} · 对/错 ${word.correct_count || 0}/${word.wrong_count || 0}</div>`;
      const heading = title.querySelector('h2');
      heading.textContent = word.word;
      const badge = badgeFor(word);
      if (badge) heading.insertAdjacentElement('afterend', Object.assign(document.createElement('span'), { className: 'chip', textContent: badge }));
      title.querySelector('button').onclick = () => speak(word.word);
      const copy = document.createElement('div');
      copy.className = 'word-meaning';
      copy.textContent = meanings(word.id).map(item => item.text).join('\n') || '暂无释义';
      const tools = document.createElement('div');
      tools.className = 'word-tools';
      const edit = document.createElement('button');
      edit.className = 'icon-button'; edit.textContent = '编辑';
      edit.onclick = () => editWord(word);
      const remove = document.createElement('button');
      remove.className = 'icon-button danger'; remove.textContent = '删除';
      remove.onclick = () => deleteWord(word);
      tools.append(edit, remove); card.append(title, copy, tools); list.append(card);
    }
  }

  function editWord(word) {
    const newWord = prompt('修改英文单词', word.word)?.trim();
    if (!newWord) return;
    const oldMeaning = meanings(word.id).map(item => item.text).join('\n');
    const newMeaning = prompt('修改释义（多行会分别保存）', oldMeaning);
    if (newMeaning === null) return;
    word.word = newWord;
    data.meanings = data.meanings.filter(item => Number(item.word_id) !== Number(word.id));
    newMeaning.split('\n').map(item => item.trim()).filter(Boolean).forEach((text, position) => data.meanings.push({ id: Core.nextId(data.meanings), word_id: word.id, text, source: 'user', position, created_at: Core.now() }));
    save(); renderBook(); toast('已保存修改');
  }

  function deleteWord(word) {
    if (!confirm(`确认删除“${word.word}”？`)) return;
    data.words = data.words.filter(item => Number(item.id) !== Number(word.id));
    data.meanings = data.meanings.filter(item => Number(item.word_id) !== Number(word.id));
    data.reviews = data.reviews.filter(item => Number(item.word_id) !== Number(word.id));
    localStorage.removeItem(sequenceKey());
    save(); renderBook();
  }

  function openProfiles(required = false) {
    $('#profile-overlay').classList.remove('hidden');
    $('#close-profiles').classList.toggle('hidden', required);
    const list = $('#profile-list'); list.replaceChildren();
    for (const profile of data.profiles) {
      const button = document.createElement('button');
      const enCount = data.words.filter(word => Number(word.profile_id) === Number(profile.id) && word.kind !== 'zh').length;
      const zhCount = data.words.filter(word => Number(word.profile_id) === Number(profile.id) && word.kind === 'zh').length;
      button.className = `profile-choice${profile.id === profileId ? ' active' : ''}`;
      button.innerHTML = `<span class="avatar"></span><span><b></b><small>${enCount} 个单词${zhCount ? ' · ' + zhCount + ' 个生字' : ''}</small></span>`;
      button.querySelector('.avatar').style.background = profile.color;
      button.querySelector('.avatar').textContent = profile.name.slice(0, 1);
      button.querySelector('b').textContent = profile.name;
      button.onclick = () => { profileId = profile.id; save(); updateProfile(); $('#profile-overlay').classList.add('hidden'); switchView('book'); };
      list.append(button);
    }
    setTimeout(() => $('#profile-input').focus(), 50);
  }

  function speak(text) {
    clearTimeout(speechTimer);
    if (!text || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US'; utterance.rate = .82;
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find(voice => voice.lang === 'en-US' && /Samantha|Ava|Aaron|Nicky/i.test(voice.name)) || voices.find(voice => voice.lang === 'en-US') || null;
    speechSynthesis.speak(utterance);
  }

  function speakZh(text) {
    if (!text || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN'; utterance.rate = .85;
    const voice = speechSynthesis.getVoices().find(item => item.lang && item.lang.startsWith('zh'));
    if (voice) utterance.voice = voice;
    speechSynthesis.speak(utterance);
  }

  function openModes() {
    clearTimeout(speechTimer); mode = null; bookScope = null; state = 'idle'; currentWord = null; undo = null;
    $('#mode-picker').classList.remove('hidden'); $('#study-session').classList.add('hidden'); $('#study-summary').classList.add('hidden');
    $('#sequence-resume').textContent = loadSequence()?.queue?.length ? `继续：已看 ${loadSequence().seenWordIds.length} / ${loadSequence().originalWordIds.length}` : '从第一个开始';
  }

  function saveSequence() { if (sequence) localStorage.setItem(sequenceKey(sequence.book || null), JSON.stringify(sequence)); }

  function startStudy(selectedMode) {
    if (!enWords().length) { toast('请先添加几个单词'); switchView('book'); return; }
    mode = selectedMode; reviewed = 0; correctCount = 0; undo = null;
    if (mode === 'sequence') {
      const saved = loadSequence(bookScope);
      if (saved) sequence = saved;
      else {
        // 书内顺序学：按老师词表顺序出词；主生词本：按加入先后
        const pool = bookScope ? bookRows(bookScope).map(([, word]) => word).filter(Boolean) : enWords();
        sequence = Core.createSequence(pool, profileId, bookScope ? { preserveOrder: true } : undefined);
        if (bookScope) { sequence.book = bookScope; sequence.bookVer = Wordbooks[bookScope].version || 1; }
      }
    }
    $('#mode-picker').classList.remove('hidden'); $('#study-summary').classList.add('hidden'); $('#study-session').classList.remove('hidden');
    nextCard();
  }

  function nextCard() {
    if (mode === 'sequence') {
      if (!sequence.queue.length) { showSummary(); return; }
      currentWord = words().find(word => Number(word.id) === Number(sequence.queue[0].wordId));
      if (!currentWord) { sequence.queue.shift(); saveSequence(); nextCard(); return; }
    } else currentWord = Core.pickWeighted(bookScope ? bookWordsOf(bookScope) : words());
    renderCard();
  }

  function renderCard() {
    state = 'question';
    const item = mode === 'sequence' ? sequence.queue[0] : { phase: 'first' };
    $('#study-word').textContent = currentWord.word;
    const meaningBox = $('#study-meanings'); meaningBox.replaceChildren(); meaningBox.classList.add('hidden');
    const list = meanings(currentWord.id);
    for (const meaning of list) { const p = document.createElement('p'); p.textContent = meaning.text; meaningBox.append(p); }
    if (!list.length) { const p = document.createElement('p'); p.textContent = '暂无释义'; meaningBox.append(p); }
    $('#phase-label').textContent = item.phase === 'retry' ? '再次练习' : item.phase === 'confirm' ? '间隔确认' : '';
    $('#phase-label').classList.toggle('hidden', item.phase === 'first');
    renderQuestionActions(); updateProgress();
    clearTimeout(speechTimer); speechTimer = setTimeout(() => speak(currentWord?.word), 1000);
  }

  function button(label, className, handler) { const node = document.createElement('button'); node.textContent = label; node.className = className; node.onclick = handler; return node; }
  function renderQuestionActions() { const actions = $('#study-actions'); actions.replaceChildren(button('✗ 不会', 'no', () => grade(false)), button('查看释义', 'reveal', reveal), button('✓ 会', 'yes', () => grade(true))); }
  function reveal() { if (state !== 'question') return; state = 'peek'; $('#study-meanings').classList.remove('hidden'); const actions = $('#study-actions'); actions.replaceChildren(button('✗ 不会', 'no', () => grade(false)), button('✓ 会', 'yes', () => grade(true))); }

  function grade(correct) {
    if (!currentWord || !['question', 'peek'].includes(state)) return;
    undo = { data: Core.clone(data), sequence: sequence ? Core.clone(sequence) : null, wordId: currentWord.id, mode, reviewed, correctCount };
    data = Core.applyReview(data, currentWord.id, correct);
    reviewed += 1; if (correct) correctCount += 1; save(); $('#undo-button').disabled = false;
    if (correct) finishAnswer(true);
    else { state = 'answer'; $('#study-meanings').classList.remove('hidden'); const actions = $('#study-actions'); actions.replaceChildren(button('下一个', 'next', () => finishAnswer(false))); }
  }

  function finishAnswer(correct) {
    if (mode === 'sequence') { sequence = Core.answerSequence(sequence, correct); saveSequence(); }
    nextCard();
  }

  function undoLast() {
    if (!undo) return;
    data = undo.data; sequence = undo.sequence; mode = undo.mode; reviewed = undo.reviewed; correctCount = undo.correctCount;
    currentWord = words().find(word => Number(word.id) === Number(undo.wordId));
    undo = null; save(); if (sequence) saveSequence(); $('#undo-button').disabled = true; renderCard(); toast('已回到上一个词');
  }

  function updateProgress() {
    const rate = reviewed ? Math.round(correctCount / reviewed * 100) : 0;
    $('#study-progress').textContent = `已练习 ${reviewed} 次 · 会 ${correctCount} 次 · ${rate}%`;
    const scopeLabel = bookScope ? `${Wordbooks[bookScope]?.title || ''} · ` : '';
    if (mode === 'sequence') $('#sequence-meter').textContent = `${scopeLabel}新词 ${sequence.seenWordIds.length}/${sequence.originalWordIds.length} · 待巩固 ${sequence.pendingWordIds.length}`;
    else if (bookScope) $('#sequence-meter').textContent = `${Wordbooks[bookScope]?.title || ''} · 智能复习`;
    else $('#sequence-meter').textContent = '智能复习';
  }

  function showSummary() {
    state = 'complete'; $('#study-session').classList.add('hidden'); $('#study-summary').classList.remove('hidden');
    $('#summary-text').textContent = `${bookScope ? `${Wordbooks[bookScope]?.title || ''} · ` : ''}${sequence.originalWordIds.length} 个单词 · 实际练习 ${sequence.correctAnswers + sequence.wrongAnswers} 次`;
    $('#summary-mastered').textContent = sequence.masteredWordIds.length; $('#summary-focus').textContent = sequence.focusWordIds.length;
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `YueWord-${new Date().toISOString().slice(0, 10)}.lexicon`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000); toast('备份已导出');
  }

  async function importBackup(file) {
    try {
      const incoming = JSON.parse(await file.text());
      const result = Core.mergeBackup(data, incoming); data = result.data;
      if (!currentProfile()) profileId = data.profiles[0]?.id || null;
      save(); updateProfile(); renderBook(); toast(`导入完成：${result.counts.profiles} 个用户，${result.counts.words} 个单词`);
    } catch (error) { alert(`导入失败：${error.message}`); }
  }

  document.querySelectorAll('[data-view]').forEach(buttonNode => buttonNode.addEventListener('click', () => switchView(buttonNode.dataset.view)));
  $('#profile-button').onclick = () => openProfiles(false);
  $('#close-profiles').onclick = () => { if (currentProfile()) $('#profile-overlay').classList.add('hidden'); };
  $('#profile-form').onsubmit = event => {
    event.preventDefault(); const name = $('#profile-input').value.trim(); if (!name) return;
    if (data.profiles.some(profile => profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { toast('这个名字已经存在'); return; }
    const profile = { id: Core.nextId(data.profiles), name, color: colors[data.profiles.length % colors.length], created_at: Core.now() };
    data.profiles.push(profile); seedWordbooks(); profileId = profile.id; $('#profile-input').value = ''; save(); updateProfile(); $('#profile-overlay').classList.add('hidden'); renderBook();
  };
  $('#add-form').onsubmit = event => {
    event.preventDefault(); const spelling = $('#word-input').value.trim(); const meaning = $('#meaning-input').value.trim(); if (!spelling) return;
    if (words().some(word => word.kind !== 'zh' && word.word.toLocaleLowerCase() === spelling.toLocaleLowerCase())) { toast('这个单词已经在生词本里'); return; }
    const id = Core.nextId(data.words); data.words.push({ id, profile_id: profileId, word: spelling, weight: 3, streak: 0, correct_count: 0, wrong_count: 0, us_phonetic: null, uk_phonetic: null, created_at: Core.now(), last_reviewed_at: null });
    if (meaning) data.meanings.push({ id: Core.nextId(data.meanings), word_id: id, text: meaning, source: 'user', position: 0, created_at: Core.now() });
    $('#word-input').value = ''; $('#meaning-input').value = ''; localStorage.removeItem(sequenceKey()); save(); renderBook(); toast('已加入生词本');
  };
  $('#start-sequence').onclick = () => startStudy('sequence'); $('#start-smart').onclick = () => startStudy('smart'); $('#exit-study').onclick = openModes;
  $('#speak-button').onclick = () => speak(currentWord?.word); $('#undo-button').onclick = undoLast; $('#summary-done').onclick = openModes;
  $('#dict-close').onclick = closeDictation; $('#dict-stop').onclick = closeDictation; $('#dict-close-end').onclick = closeDictation;
  $('#dict-all').onclick = () => { dictation.selected = dictation.pool.map(() => true); renderDictSelect(); };
  $('#dict-none').onclick = () => { dictation.selected = dictation.pool.map(() => false); renderDictSelect(); };
  $('#dict-start').onclick = () => startDictation();
  $('#dict-submit').onclick = submitDictation;
  $('#dict-next').onclick = nextDictation;
  $('#dict-speak').onclick = () => dictation?.queue?.[dictation.index] && speak(dictation.queue[dictation.index].entry.word);
  $('#dict-speak-zh').onclick = () => dictation?.queue?.[dictation.index] && speakZh(dictation.queue[dictation.index].entry.meaning || '');
  $('#dict-redo-wrong').onclick = () => startDictation(dictation.wrong);
  $('#dict-input').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!$('#dict-submit').classList.contains('hidden')) submitDictation();
    else nextDictation();
  });
  $('#export-button').onclick = exportBackup; $('#import-input').onchange = event => { const file = event.target.files?.[0]; if (file) importBackup(file); event.target.value = ''; };

  /* ---------------- 学汉字 ---------------- */
  const Charlists = window.YueWordCharlists || { books: {} };
  const hanziScreens = ['home', 'book', 'screen', 'mybook', 'quiz'];
  const hz = { screen: null, quiz: null, quizReviewed: 0, quizCorrect: 0 };
  const GRADE_NUMBERS = { yi: 1, er: 2, san: 3, si: 4, wu: 5, liu: 6 };
  const bookRank = key => (GRADE_NUMBERS[key.replace(/(shang|xia)$/, '')] || 9) * 2 + (key.endsWith('xia') ? 1 : 0);
  const bookKeys = () => Object.keys(Charlists).sort((a, b) => bookRank(a) - bookRank(b));

  function flattenEntries(book) {
    const out = [];
    for (const unit of Charlists[book]?.units || []) for (const lesson of unit.lessons) for (const entry of lesson.entries) {
      out.push({ ...entry, book, unit_no: unit.unit_no, unit_title: unit.unit_title, lesson: lesson.lesson, status: charStatus(book, entry.char)?.status || null });
    }
    return out;
  }

  function findCharEntry(char) {
    for (const key of bookKeys()) {
      const found = flattenEntries(key).find(entry => entry.char === char);
      if (found) return found;
    }
    return null;
  }

  function openHanzi() {
    hanziShow('home');
  }

  function hanziShow(name) {
    for (const screen of hanziScreens) $(`#hanzi-${screen}`)?.classList.toggle('hidden', screen !== name);
    closeCharDetail();
    if (name === 'home') renderHanziHome();
    if (name === 'book') renderHanziBook();
    if (name === 'mybook') renderHanziMybook();
    if (name === 'quiz') startHanziQuiz();
  }

  function renderHanziHome() {
    const box = $('#hanzi-home'); box.replaceChildren();
    const head = document.createElement('div');
    head.className = 'page-head';
    head.innerHTML = '<div><p class="eyebrow">LEARN HANZI</p><h1>学汉字</h1><p>先测查一遍，不认识的字自动进入生字本。</p></div>';
    box.append(head);
    // 生字本钉在最顶上，位置固定不随书目变化
    const pinned = document.createElement('div');
    pinned.className = 'hz-book-grid';
    const mybook = document.createElement('button');
    mybook.className = 'hz-book-card alt';
    mybook.innerHTML = `<b>📌 我的生字本</b><p>不会的字都在这里：能单独测验、能手动删除，每个字都记着对错次数。</p><small>生字本 ${zhWords().length} 字</small>`;
    mybook.onclick = () => hanziShow('mybook');
    pinned.append(mybook);
    const grid = document.createElement('div');
    grid.className = 'hz-book-grid';
    for (const key of bookKeys()) {
      const book = Charlists[key];
      const entries = flattenEntries(key);
      const checked = entries.filter(entry => entry.status).length;
      const unknown = entries.filter(entry => entry.status === 'unknown').length;
      const pct = entries.length ? Math.round(checked / entries.length * 100) : 0;
      const card = document.createElement('button');
      card.className = 'hz-book-card';
      card.innerHTML = `<b>📗 ${book.title}</b><p>按课本单元测查：认识的跳过，不会的进生字本。</p><small>已测 ${checked}/${entries.length} · 不会 ${unknown}</small><span class="hz-bar"><span style="width:${pct}%"></span></span>`;
      card.onclick = () => { hz.book = key; hanziShow('book'); };
      grid.append(card);
    }
    const more = document.createElement('div');
    more.className = 'hz-book-grid';
    const quiz = document.createElement('button');
    quiz.className = 'hz-book-card alt';
    quiz.innerHTML = '<b>🎯 汉字测验</b><p>只考生字本里的字：看字选拼音、看拼音选字。</p><small>随时开始 →</small>';
    quiz.onclick = () => hanziShow('quiz');
    more.append(quiz);
    box.append(pinned, grid, more);
    if (typeof mountStrokeLookup === 'function') mountStrokeLookup(box);
  }

  function renderHanziBook() {
    const box = $('#hanzi-book'); box.replaceChildren();
    const entries = flattenEntries(hz.book);
    const checked = entries.filter(entry => entry.status).length;
    const unknown = entries.filter(entry => entry.status === 'unknown').length;
    const head = document.createElement('div');
    head.className = 'page-head';
    const title = Charlists[hz.book]?.title || hz.book;
    head.innerHTML = `<div><p class="eyebrow">TEXTBOOK</p><h1>${title}</h1><p>共 ${entries.length} 字 · 已测 ${checked} · 不会 ${unknown}。点字看认字卡。</p></div>`;
    box.append(head);
    const tools = document.createElement('div');
    tools.className = 'hz-tools';
    const uncheckedLeft = entries.length - checked;
    const checkBtn = document.createElement('button');
    checkBtn.className = 'primary';
    checkBtn.textContent = uncheckedLeft > 0 ? (checked ? `继续测查（剩 ${uncheckedLeft} 字）` : '开始测查') : '重新测查';
    checkBtn.onclick = () => {
      if (uncheckedLeft === 0) {
        if (!confirm('本册已测完。重新测查会清空本册测查记录（生字本不受影响），确定吗？')) return;
        data.charlist_status = (data.charlist_status || []).filter(item => !(Number(item.profile_id) === Number(profileId) && item.book === hz.book));
        save(); renderHanziBook(); startScreen(); return;
      }
      startScreen();
    };
    const back = document.createElement('button');
    back.className = 'text-button'; back.textContent = '‹ 选择课本';
    back.onclick = () => hanziShow('home');
    tools.append(back, checkBtn);
    box.append(tools);
    for (const unit of Charlists[hz.book].units) {
      const unitBox = document.createElement('section');
      unitBox.className = 'hz-unit';
      const unitTitle = document.createElement('h2');
      unitTitle.textContent = unit.unit_title; unitBox.append(unitTitle);
      for (const lesson of unit.lessons) {
        const lessonTitle = document.createElement('h3');
        lessonTitle.textContent = lesson.lesson; unitBox.append(lessonTitle);
        const grid = document.createElement('div');
        grid.className = 'hz-tile-grid';
        for (const entry of lesson.entries) {
          const tile = document.createElement('button');
          tile.className = `hz-tile${entry.status === 'known' ? ' known' : entry.status === 'unknown' ? ' unknown' : ''}`;
          tile.textContent = entry.char;
          tile.onclick = () => showCharDetail(entry);
          grid.append(tile);
        }
        unitBox.append(grid);
      }
      box.append(unitBox);
    }
  }

  function showCharDetail(entry) {
    const overlay = $('#char-overlay');
    $('#cd-char').textContent = entry.char;
    $('#cd-pinyin').textContent = entry.pinyin;
    $('#cd-sense').textContent = entry.sense || '';
    const phrases = $('#cd-phrases'); phrases.replaceChildren();
    for (const phrase of String(entry.phrases || '').split(',').filter(Boolean)) {
      const chip = document.createElement('span');
      chip.className = 'chip'; chip.textContent = phrase; phrases.append(chip);
    }
    const sentence = $('#cd-sentence'); sentence.replaceChildren();
    for (const ch of entry.sentence || '') {
      sentence.append(ch === entry.char ? Object.assign(document.createElement('mark'), { textContent: ch }) : document.createTextNode(ch));
    }
    $('#cd-speak').onclick = () => speakZh(entry.char);
    $('#cd-strokes').onclick = () => { if (typeof openStrokePlayer === 'function') openStrokePlayer(entry.char); };
    const addBtn = $('#cd-add');
    const inBook = zhWords().some(word => word.word === entry.char);
    addBtn.disabled = inBook || entry.status === 'unknown';
    addBtn.textContent = inBook || entry.status === 'unknown' ? '✓ 已在生字本' : '加入生字本';
    addBtn.onclick = () => { ensureCharWord(entry); addBtn.disabled = true; addBtn.textContent = '✓ 已加入生字本'; save(); toast('已加入生字本'); };
    overlay.classList.remove('hidden');
  }

  function closeCharDetail() { $('#char-overlay')?.classList.add('hidden'); }

  function ensureCharWord(entry) {
    let word = zhWords().find(item => item.word === entry.char);
    if (word) return word;
    const id = Core.nextId(data.words);
    word = { id, profile_id: profileId, word: entry.char, kind: 'zh', pinyin: entry.pinyin, weight: 3, streak: 0, correct_count: 0, wrong_count: 0, us_phonetic: null, uk_phonetic: null, created_at: Core.now(), last_reviewed_at: null };
    data.words.push(word);
    let position = 0;
    const push = (text, mkind) => { if (text) data.meanings.push({ id: Core.nextId(data.meanings), word_id: id, text, source: 'user', mkind, position: position++, created_at: Core.now() }); };
    push(entry.sense, 'sense');
    for (const phrase of String(entry.phrases || '').split(',')) push(phrase.trim(), 'phrase');
    push(entry.sentence, 'sentence');
    return word;
  }

  function setCharStatus(book, char, known) {
    const existing = charStatus(book, char);
    if (existing) existing.status = known ? 'known' : 'unknown';
    else data.charlist_status.push({ profile_id: profileId, book, char, status: known ? 'known' : 'unknown', checked_at: Core.now() });
    if (!known) {
      const entry = flattenEntries(book).find(item => item.char === char);
      if (entry) ensureCharWord(entry);
    }
    save();
  }

  /* 测查 */
  function startScreen() {
    const entries = flattenEntries(hz.book);
    let index = entries.findIndex(entry => !entry.status);
    if (index < 0) index = 0;
    hz.screen = { entries, index, known: 0, unknown: 0, awaitingContinue: false, busy: false };
    hanziShow('screen');
    renderScreen();
  }

  function renderScreen() {
    const s = hz.screen;
    s.awaitingContinue = false;
    if (hz.speechTimer) clearTimeout(hz.speechTimer);
    const box = $('#hanzi-screen');
    if (s.index >= s.entries.length) {
      box.replaceChildren();
      const summary = document.createElement('div');
      summary.className = 'summary';
      summary.innerHTML = `<div class="seal">✓</div><p class="eyebrow">SCREEN DONE</p><h2>测查完成</h2><p>本轮测查 ${s.known + s.unknown} 字：认识 ${s.known}，不会 ${s.unknown}。</p><div class="summary-grid"><div><b>${s.known}</b><span>已经认识</span></div><div><b>${s.unknown}</b><span>不会·已进生字本</span></div></div>`;
      const done = document.createElement('button');
      done.className = 'primary'; done.textContent = '返回课本';
      done.onclick = () => hanziShow('book');
      const quiz = document.createElement('button');
      quiz.className = 'secondary'; quiz.textContent = '去汉字测验';
      quiz.onclick = () => hanziShow('quiz');
      const actions = document.createElement('div');
      actions.className = 'hz-summary-actions';
      actions.append(done, quiz);
      summary.append(actions);
      box.append(summary);
      return;
    }
    const entry = s.entries[s.index];
    const doneCount = s.known + s.unknown;
    const total = s.total || (s.total = s.entries.filter(e => !e.status).length || s.entries.length);
    box.replaceChildren();
    const head = document.createElement('div');
    head.className = 'study-head';
    const back = document.createElement('button');
    back.className = 'text-button'; back.textContent = '‹ 退出测查';
    back.onclick = () => hanziShow('book');
    const undoBtn = document.createElement('button');
    undoBtn.className = 'text-button hz-undo'; undoBtn.textContent = '↶ 上一个';
    undoBtn.disabled = s.index <= 0;
    undoBtn.onclick = undoScreen;
    const meter = document.createElement('div');
    meter.textContent = `${doneCount} / ${s.total} · 认识 ${s.known} · 不会 ${s.unknown}`;
    head.append(back, undoBtn, meter);
    const title = document.createElement('div');
    title.className = 'page-head';
    title.innerHTML = '<div><p class="eyebrow">SCREENING</p><h1>这个字认识吗？</h1><p>让孩子自己读，家长来判断。</p></div>';
    const bar = document.createElement('span');
    bar.className = 'hz-bar page-bar';
    bar.innerHTML = `<span style="width:${s.total ? Math.round(doneCount / s.total * 100) : 0}%"></span>`;
    const card = document.createElement('div');
    card.className = 'hz-screen-card'; card.textContent = entry.char;
    const actions = document.createElement('div');
    actions.className = 'hz-screen-actions';
    const no = document.createElement('button');
    no.className = 'hz-no'; no.textContent = '✗ 不认识';
    no.onclick = () => answerScreen(false);
    const yes = document.createElement('button');
    yes.className = 'hz-yes'; yes.textContent = '✓ 认识';
    yes.onclick = () => answerScreen(true);
    actions.append(no, yes);
    const feedback = document.createElement('div');
    feedback.id = 'screen-feedback';
    box.append(head, title, bar, card, actions, feedback);
  }

  function answerScreen(known) {
    const s = hz.screen;
    if (!s || s.busy) return;
    const entry = s.entries[s.index];
    s.busy = true;
    setCharStatus(hz.book, entry.char, known);
    entry.status = known ? 'known' : 'unknown';
    if (known) s.known += 1; else s.unknown += 1;
    s.busy = false;
    if (known) { s.index += 1; renderScreen(); }
    else { s.awaitingContinue = true; showScreenFeedback(entry); }
  }

  function undoScreen() {
    const s = hz.screen;
    if (!s || s.busy) return;
    const revertCurrent = s.awaitingContinue;
    const entry = revertCurrent ? s.entries[s.index] : s.entries[s.index - 1];
    if (!entry || !entry.status) return;
    data.charlist_status = (data.charlist_status || []).filter(item =>
      !(Number(item.profile_id) === Number(profileId) && item.book === hz.book && item.char === entry.char));
    if (entry.status === 'known') s.known = Math.max(0, s.known - 1); else s.unknown = Math.max(0, s.unknown - 1);
    entry.status = null;
    if (!revertCurrent) s.index -= 1;
    save();
    renderScreen();
    toast('已撤销，重新判断一下');
  }

  function showScreenFeedback(entry) {
    const s = hz.screen;
    const meter = $('#hanzi-screen .study-head div');
    if (meter) meter.textContent = `${s.known + s.unknown} / ${s.total} · 认识 ${s.known} · 不会 ${s.unknown}`;
    const undoBtn = $('#hanzi-screen .hz-undo');
    if (undoBtn) undoBtn.disabled = false;
    clearTimeout(hz.speechTimer);
    hz.speechTimer = setTimeout(() => speakZh(entry.char), 1000);
    const fb = $('#screen-feedback'); fb.replaceChildren();
    const card = document.createElement('div');
    card.className = 'hz-feedback-card';
    const row = document.createElement('div');
    row.className = 'hz-fb-row';
    const big = document.createElement('b'); big.textContent = entry.char;
    const py = document.createElement('span'); py.textContent = entry.pinyin;
    const sp = document.createElement('button'); sp.className = 'hz-speak-big'; sp.textContent = '🔊 读一读'; sp.onclick = () => speakZh(entry.char);
    row.append(big, py, sp);
    card.append(row);
    if (entry.sense) { const p = document.createElement('p'); p.className = 'hz-fb-sense'; p.textContent = `${entry.char}：${entry.sense}`; card.append(p); }
    const chips = document.createElement('div');
    chips.className = 'hz-chip-row';
    for (const phrase of String(entry.phrases || '').split(',').filter(Boolean)) {
      const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = phrase; chips.append(chip);
    }
    if (chips.childElementCount) card.append(chips);
    const sentence = document.createElement('p');
    sentence.className = 'hz-fb-sentence'; sentence.replaceChildren();
    for (const ch of entry.sentence || '') {
      sentence.append(ch === entry.char ? Object.assign(document.createElement('mark'), { textContent: ch }) : document.createTextNode(ch));
    }
    if (entry.sentence) card.append(sentence);
    const note = document.createElement('p');
    note.className = 'hz-added'; note.textContent = '✓ 已加入生字本，之后会安排复习';
    const next = document.createElement('button');
    next.className = 'primary'; next.textContent = '继续 →';
    next.onclick = () => { s.index += 1; renderScreen(); };
    card.append(note, next);
    fb.append(card);
  }

  /* 生字本 */
  function renderHanziMybook() {
    const box = $('#hanzi-mybook'); box.replaceChildren();
    const head = document.createElement('div');
    head.className = 'page-head';
    head.innerHTML = '<div><p class="eyebrow">CHAR BOOK</p><h1>我的生字本</h1><p>测查不会的字自动进来，也可以手动添加。</p></div>';
    const back = document.createElement('button');
    back.className = 'text-button'; back.textContent = '‹ 返回';
    back.onclick = () => hanziShow('home');
    const form = document.createElement('form');
    form.className = 'add-card hz-add-form';
    const label = document.createElement('label');
    label.innerHTML = '<span>生字</span><input id="hz-char-input" maxlength="1" autocomplete="off" placeholder="例如 明" required>';
    const submit = document.createElement('button');
    submit.className = 'primary'; submit.type = 'submit'; submit.textContent = '加入生字本';
    form.append(label, submit);
    form.onsubmit = event => {
      event.preventDefault();
      const input = $('#hz-char-input');
      const char = input.value.trim();
      if (!char) return;
      if (zhWords().some(word => word.word === char)) { toast('这个字已经在生字本里'); return; }
      const entry = findCharEntry(char);
      if (entry) ensureCharWord(entry);
      else {
        const pinyin = prompt(`"${char}"不在课本字表里，请输入拼音（可留空）`, '')?.trim() || null;
        data.words.push({ id: Core.nextId(data.words), profile_id: profileId, word: char, kind: 'zh', pinyin, weight: 3, streak: 0, correct_count: 0, wrong_count: 0, us_phonetic: null, uk_phonetic: null, created_at: Core.now(), last_reviewed_at: null });
      }
      save(); input.value = '';
      renderHanziMybook(); toast('已加入生字本');
    };
    box.append(head, back, form);
    const list = document.createElement('div');
    list.className = 'word-list';
    const chars = zhWords().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);
    if (!chars.length) {
      const empty = document.createElement('div');
      empty.className = 'empty'; empty.textContent = '生字本还是空的。去课本测查，或在上面手动添加。';
      list.append(empty);
    }
    const kindLabel = { sense: '释义', phrase: '组词', sentence: '例句' };
    for (const word of chars) {
      const card = document.createElement('article');
      card.className = 'word-card hz-char-card';
      const head2 = document.createElement('div');
      head2.className = 'hz-char-head';
      const big = document.createElement('b'); big.textContent = word.word;
      const info = document.createElement('div');
      info.className = 'hz-char-info';
      const py = document.createElement('span');
      py.className = 'hz-char-pinyin'; py.textContent = word.pinyin || '（未注音）';
      const sp = document.createElement('button'); sp.className = 'mini-speak'; sp.textContent = '🔊'; sp.onclick = () => speakZh(word.word);
      const pyRow = document.createElement('div'); pyRow.className = 'hz-fb-row';
      pyRow.append(py, sp);
      const meta = document.createElement('div');
      meta.className = 'word-meta'; meta.textContent = `连对 ${word.streak || 0} · 对/错 ${word.correct_count || 0}/${word.wrong_count || 0}`;
      info.append(pyRow, meta);
      const del = document.createElement('button');
      del.className = 'icon-button danger'; del.textContent = '删除';
      del.onclick = () => {
        if (!confirm(`把"${word.word}"从生字本删掉？`)) return;
        data.words = data.words.filter(item => Number(item.id) !== Number(word.id));
        data.meanings = data.meanings.filter(item => Number(item.word_id) !== Number(word.id));
        data.reviews = data.reviews.filter(item => Number(item.word_id) !== Number(word.id));
        save(); renderHanziMybook();
      };
      head2.append(big, info, del);
      card.append(head2);
      const copy = document.createElement('div');
      copy.className = 'word-meaning';
      const lines = meanings(word.id).map(item => `${kindLabel[item.mkind] || '释义'} · ${item.text}`);
      copy.textContent = lines.join('\n') || '暂无释义，点编辑补充';
      const tools = document.createElement('div');
      tools.className = 'word-tools';
      const edit = document.createElement('button');
      edit.className = 'icon-button'; edit.textContent = '编辑';
      edit.onclick = () => editWord(word);
      tools.append(edit, del);
      card.append(copy, tools);
      list.append(card);
    }
    box.append(list);
  }

  /* 汉字测验 */
  function startHanziQuiz() {
    hz.quizReviewed = 0; hz.quizCorrect = 0;
    const box = $('#hanzi-quiz');
    box.replaceChildren();
    const head = document.createElement('div');
    head.className = 'study-head';
    const back = document.createElement('button');
    back.className = 'text-button'; back.textContent = '‹ 返回';
    back.onclick = () => hanziShow('home');
    const meter = document.createElement('div');
    meter.id = 'hz-quiz-meter';
    head.append(back, meter);
    box.append(head);
    const card = document.createElement('div');
    card.id = 'hz-quiz-card';
    box.append(card);
    updateHanziQuizMeter();
    renderHanziQuiz();
  }

  function updateHanziQuizMeter() {
    const meter = $('#hz-quiz-meter');
    if (!meter) return;
    const rate = hz.quizReviewed ? Math.round(hz.quizCorrect / hz.quizReviewed * 100) : 0;
    meter.textContent = `已练 ${hz.quizReviewed} 次 · 对 ${hz.quizCorrect} 次 · ${rate}%`;
  }

  function pinyinPool() {
    const pool = new Map();
    for (const key of Object.keys(Charlists)) {
      for (const entry of flattenEntries(key)) pool.set(entry.char, entry.pinyin);
    }
    for (const word of zhWords()) if (word.pinyin) pool.set(word.word, word.pinyin);
    return [...pool.entries()];
  }

  function renderHanziQuiz() {
    const card = $('#hz-quiz-card');
    card.replaceChildren();
    const chars = zhWords();
    if (!chars.length) {
      const empty = document.createElement('div');
      empty.className = 'empty'; empty.textContent = '生字本里还没有字。先去课本测查，把不认识的字收集起来吧。';
      card.append(empty);
      return;
    }
    const word = Core.pickWeighted(chars);
    if (!word.pinyin) {
      const empty = document.createElement('div');
      empty.className = 'empty'; empty.textContent = `"${word.word}"还没有注音，去生字本编辑补上拼音。`;
      card.append(empty);
      return;
    }
    const mode = Math.random() < .5 ? 'to_pinyin' : 'to_char';
    const answer = mode === 'to_pinyin' ? word.pinyin : word.word;
    const pool = pinyinPool();
    let distractors;
    if (mode === 'to_pinyin') {
      const candidates = pool.map(([, pinyin]) => pinyin).filter(pinyin => pinyin !== answer);
      distractors = [...new Set(candidates)].sort(() => Math.random() - .5).slice(0, 3);
    } else {
      const candidates = pool.filter(([char, pinyin]) => char !== answer && pinyin !== word.pinyin).map(([char]) => char);
      distractors = candidates.sort(() => Math.random() - .5).slice(0, 3);
    }
    const options = [...distractors, answer].sort(() => Math.random() - .5);
    hz.quiz = { word, mode, answer };
    const prompt = document.createElement('div');
    prompt.className = `hz-prompt${mode === 'to_pinyin' ? ' char' : ' pinyin'}`;
    prompt.textContent = mode === 'to_pinyin' ? word.word : word.pinyin;
    const hint = document.createElement('p');
    hint.className = 'hz-quiz-hint'; hint.textContent = mode === 'to_pinyin' ? '这个字怎么读？选正确的拼音。' : '这个读音是哪个字？';
    const grid = document.createElement('div');
    grid.className = 'hz-options';
    options.forEach((option, index) => {
      const btn = document.createElement('button');
      btn.className = `hz-option${mode === 'to_char' ? ' char' : ''}`;
      const key = document.createElement('span');
      key.className = 'hz-key'; key.textContent = index + 1;
      btn.append(key, document.createTextNode(option));
      btn.onclick = () => answerHanziQuiz(option, btn);
      grid.append(btn);
    });
    const feedback = document.createElement('div');
    feedback.id = 'hz-quiz-feedback';
    card.append(prompt, hint, grid, feedback);
  }

  function answerHanziQuiz(chosen, btn) {
    const quiz = hz.quiz;
    if (!quiz || hz.quizBusy) return;
    hz.quizBusy = true;
    const correct = chosen === quiz.answer;
    const buttons = [...document.querySelectorAll('.hz-option')];
    buttons.forEach(node => { node.disabled = true; });
    data = Core.applyReview(data, quiz.word.id, correct);
    save();
    hz.quizReviewed += 1;
    if (correct) hz.quizCorrect += 1;
    updateHanziQuizMeter();
    const answerBtn = buttons.find(node => node.textContent.slice(1) === quiz.answer);
    if (correct) {
      btn.classList.add('correct');
      speakZh(quiz.word.word);
      setTimeout(() => { hz.quizBusy = false; renderHanziQuiz(); }, 750);
    } else {
      btn.classList.add('wrong');
      if (answerBtn) answerBtn.classList.add('correct');
      const fb = $('#hz-quiz-feedback'); fb.replaceChildren();
      const row = document.createElement('div');
      row.className = 'hz-feedback-row';
      const big = document.createElement('b'); big.textContent = quiz.word.word;
      const py = document.createElement('span'); py.textContent = quiz.word.pinyin;
      const sp = document.createElement('button'); sp.className = 'mini-speak'; sp.textContent = '🔊'; sp.onclick = () => speakZh(quiz.word.word);
      const next = document.createElement('button');
      next.className = 'primary'; next.textContent = '下一个';
      next.onclick = () => { hz.quizBusy = false; renderHanziQuiz(); };
      row.append(big, py, sp, next);
      fb.append(row);
    }
  }

  document.addEventListener('keydown', event => {
    if (!$('#view-hanzi')?.classList.contains('active')) return;
    if (!$('#char-overlay')?.classList.contains('hidden')) { if (event.key === 'Escape') closeCharDetail(); return; }
    if ($('#hanzi-quiz')?.classList.contains('hidden') || hz.quizBusy) return;
    if (['1', '2', '3', '4'].includes(event.key)) {
      const buttons = [...document.querySelectorAll('.hz-option')].filter(node => !node.disabled);
      const target = buttons[Number(event.key) - 1];
      if (target) target.click();
    }
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(() => { $('#install-state').textContent = '离线功能已准备好'; }).catch(() => { $('#install-state').textContent = '请通过 HTTPS 打开，才能安装离线版'; });
  else $('#install-state').textContent = '当前浏览器不支持离线安装';
  seedWordbooks(); updateProfile(); renderBook(); save();
  if (window.YueWordCloud) {
    YueWordCloud.onConnect = bootCloud;   // 无条件绑定：首次连接也要能触发同步
    if (YueWordCloud.configured()) bootCloud();
  }
  if (!currentProfile()) openProfiles(true);
})();
