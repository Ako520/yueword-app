(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.YueWordCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const clone = value => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const nextId = items => Math.max(0, ...items.map(item => Number(item.id) || 0)) + 1;
  const boundedWeight = value => Math.min(30, Math.max(0.05, value));

  function emptyBackup() {
    return { format: 'lexicon-backup', version: 2, profiles: [], words: [], meanings: [], reviews: [], charlist_status: [], wordbook_seeds: [] };
  }

  function validateBackup(data) {
    if (!data || data.format !== 'lexicon-backup' || ![1, 2].includes(Number(data.version))) {
      throw new Error('不是 YueWord 备份文件');
    }
    for (const key of ['profiles', 'words', 'meanings', 'reviews']) {
      if (!Array.isArray(data[key])) throw new Error(`备份缺少 ${key}`);
    }
    if (data.charlist_status !== undefined && !Array.isArray(data.charlist_status)) {
      throw new Error('备份的 charlist_status 格式不对');
    }
    if (data.wordbook_seeds !== undefined && !Array.isArray(data.wordbook_seeds)) {
      throw new Error('备份的 wordbook_seeds 格式不对');
    }
    return true;
  }

  // 统一升级为 v2 结构：kind/pinyin/mkind 补默认值，charlist_status 保证存在
  function normalizeData(source) {
    const data = clone(source);
    data.version = 2;
    data.charlist_status = Array.isArray(data.charlist_status) ? data.charlist_status : [];
    data.wordbook_seeds = Array.isArray(data.wordbook_seeds) ? data.wordbook_seeds : [];
    for (const word of data.words) {
      if (!['en', 'zh'].includes(word.kind)) word.kind = String(word.word || '').match(/[\u4e00-\u9fff]/) ? 'zh' : 'en';
      if (word.pinyin === undefined) word.pinyin = null;
    }
    for (const meaning of data.meanings) {
      if (!['sense', 'phrase', 'sentence'].includes(meaning.mkind)) meaning.mkind = 'sense';
    }
    return data;
  }

  function applyReview(source, wordId, correct, timestamp = now()) {
    const data = clone(source);
    const word = data.words.find(item => Number(item.id) === Number(wordId));
    if (!word) throw new Error('找不到这个单词');
    const oldWeight = Number(word.weight) || 3;
    word.weight = boundedWeight(correct ? oldWeight * 0.5 : oldWeight * 3);
    word.streak = correct ? (Number(word.streak) || 0) + 1 : 0;
    word.correct_count = (Number(word.correct_count) || 0) + (correct ? 1 : 0);
    word.wrong_count = (Number(word.wrong_count) || 0) + (correct ? 0 : 1);
    word.last_reviewed_at = timestamp;
    data.reviews.push({ id: nextId(data.reviews), word_id: word.id, correct: correct ? 1 : 0, reviewed_at: timestamp });
    return data;
  }

  function pickWeighted(words, random = Math.random) {
    if (!words.length) return null;
    const weights = words.map(word => Math.max(0.05, Number(word.weight) || 3));
    let target = random() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let index = 0; index < words.length; index += 1) {
      target -= weights[index];
      if (target <= 0) return words[index];
    }
    return words[words.length - 1];
  }

  function createSequence(words, profileId, options = {}) {
    // preserveOrder：单词本场景按书目顺序（老师词表顺序）学习，不按加入时间重排
    const ordered = options.preserveOrder ? [...words] : [...words].sort((a, b) =>
      String(a.created_at || '').localeCompare(String(b.created_at || '')) || Number(a.id) - Number(b.id));
    return {
      version: 1,
      profileId,
      originalWordIds: ordered.map(word => word.id),
      queue: ordered.map(word => ({ wordId: word.id, phase: 'first' })),
      seenWordIds: [], pendingWordIds: [], masteredWordIds: [], focusWordIds: [],
      presentationCounts: {}, correctAnswers: 0, wrongAnswers: 0,
    };
  }

  function answerSequence(source, correct) {
    const session = clone(source);
    const item = session.queue.shift();
    if (!item) return session;
    const add = (key, id) => { if (!session[key].includes(id)) session[key].push(id); };
    const remove = (key, id) => { session[key] = session[key].filter(value => value !== id); };
    add('seenWordIds', item.wordId);
    const count = (Number(session.presentationCounts[item.wordId]) || 0) + 1;
    session.presentationCounts[item.wordId] = count;
    if (correct) session.correctAnswers += 1;
    else session.wrongAnswers += 1;
    if (count >= 4) {
      remove('pendingWordIds', item.wordId);
      add(correct ? 'masteredWordIds' : 'focusWordIds', item.wordId);
    } else if (!correct) {
      add('pendingWordIds', item.wordId);
      session.queue.splice(Math.min(3, session.queue.length), 0, { wordId: item.wordId, phase: 'retry' });
    } else if (item.phase === 'retry') {
      add('pendingWordIds', item.wordId);
      session.queue.splice(Math.min(7, session.queue.length), 0, { wordId: item.wordId, phase: 'confirm' });
    } else {
      remove('pendingWordIds', item.wordId);
      add('masteredWordIds', item.wordId);
    }
    return session;
  }

  // 把内置单词本播种进某个用户的生词本，并在书目升版后补齐缺失的释义/例句。
  // 每个 (用户, 书) 记一条 seed（带 ver 和当时的词表 words）：ver 不低于书目版本时不动；
  // 旧版本则只补缺失内容——已有词不重建、已有同样文字的释义不重复加。
  // 升版时缺词的判定：词在旧版书里就有（= 用户删掉的）不复活；旧版书里没有（= 这次新增的）要补建。
  // knownWords 用于旧版 seed 记录没存词表时由调用方提供当时的书目词表。
  function seedWordbook(source, profileId, bookId, entries, options = {}) {
    const timestamp = options.timestamp || now();
    const version = Number(options.version) || 1;
    const data = clone(source);
    data.wordbook_seeds = Array.isArray(data.wordbook_seeds) ? data.wordbook_seeds : [];
    const record = data.wordbook_seeds.find(seed => Number(seed.profile_id) === Number(profileId) && seed.book === bookId);
    if (record && Number(record.ver || 1) >= version) return { data, added: 0, seeded: false };
    const topping = Boolean(record);   // 升版补齐：只给已存在的词补例句，不复活用户删掉的词
    const knownWords = options.knownWords && options.knownWords.length ? options.knownWords : (record && Array.isArray(record.words) ? record.words : null);
    const known = knownWords ? new Set(knownWords.map(item => String(item).toLocaleLowerCase())) : null;
    let added = 0;
    for (const entry of entries) {
      const spelling = String(entry.word || '').trim();
      if (!spelling) continue;
      let word = data.words.find(item => Number(item.profile_id) === Number(profileId) && item.kind !== 'zh' && String(item.word).toLocaleLowerCase() === spelling.toLocaleLowerCase());
      if (!word) {
        if (topping && (!known || known.has(spelling.toLocaleLowerCase()))) continue;
        word = { id: nextId(data.words), profile_id: profileId, kind: 'en', word: spelling, weight: 3, streak: 0, correct_count: 0, wrong_count: 0, us_phonetic: null, uk_phonetic: null, created_at: timestamp, last_reviewed_at: null };
        data.words.push(word);
        if (String(entry.meaning || '').trim()) {
          data.meanings.push({ id: nextId(data.meanings), word_id: word.id, text: String(entry.meaning).trim(), source: 'book', mkind: 'sense', position: 0, created_at: timestamp });
        }
        added += 1;
      }
      const sentenceText = [String(entry.sentence || '').trim(), String(entry.sentence_zh || '').trim()].filter(Boolean).join(' ');
      if (sentenceText) {
        const texts = new Set(data.meanings.filter(item => Number(item.word_id) === Number(word.id)).map(item => item.text));
        if (!texts.has(sentenceText)) {
          const position = Math.max(-1, ...data.meanings.filter(item => Number(item.word_id) === Number(word.id)).map(item => Number(item.position) || 0)) + 1;
          data.meanings.push({ id: nextId(data.meanings), word_id: word.id, text: sentenceText, source: 'book', mkind: 'sentence', position, created_at: timestamp });
          added += 1;
        }
      }
    }
    if (record) { record.ver = version; record.words = entries.map(entry => String(entry.word || '').trim()).filter(Boolean); }
    else data.wordbook_seeds.push({ profile_id: Number(profileId) || profileId, book: bookId, seeded_at: timestamp, ver: version, words: entries.map(entry => String(entry.word || '').trim()).filter(Boolean) });
    return { data, added, seeded: true };
  }

  // 听写答案比对前的归一化：忽略大小写和多余空格；句末的 !？。，不强求；
  // & 与 and 等价（son & daughter 拼成 son and daughter 也算对）
  function normalizeDictation(text) {
    return String(text || '').toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[!！?？.。,，]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function mergeBackup(baseSource, incomingSource) {
    validateBackup(incomingSource);
    const data = clone(baseSource);
    validateBackup(data);
    if (!Array.isArray(data.charlist_status)) data.charlist_status = [];
    if (!Array.isArray(data.wordbook_seeds)) data.wordbook_seeds = [];
    const counts = { profiles: 0, words: 0, reviews: 0 };
    const profileMap = new Map();
    const wordMap = new Map();
    for (const profile of incomingSource.profiles) {
      const name = String(profile.name || '').trim();
      if (!name) continue;
      let target = data.profiles.find(item => String(item.name).toLocaleLowerCase() === name.toLocaleLowerCase());
      if (!target) {
        target = { ...clone(profile), id: nextId(data.profiles), name, color: profile.color || '#607d9b', created_at: profile.created_at || now() };
        data.profiles.push(target);
        counts.profiles += 1;
      }
      profileMap.set(Number(profile.id), target.id);
    }
    for (const word of incomingSource.words) {
      const profileId = profileMap.get(Number(word.profile_id));
      if (!profileId || !String(word.word || '').trim()) continue;
      let target = data.words.find(item => Number(item.profile_id) === Number(profileId) && String(item.word).toLocaleLowerCase() === String(word.word).toLocaleLowerCase());
      if (!target) {
        const oldId = Number(word.id);
        const kind = ['en', 'zh'].includes(word.kind) ? word.kind : (String(word.word).match(/[\u4e00-\u9fff]/) ? 'zh' : 'en');
        target = { weight: 3, streak: 0, correct_count: 0, wrong_count: 0, last_reviewed_at: null, ...clone(word), kind, id: nextId(data.words), profile_id: profileId, created_at: word.created_at || now() };
        data.words.push(target);
        for (const meaning of incomingSource.meanings.filter(item => Number(item.word_id) === oldId)) {
          const mkind = ['sense', 'phrase', 'sentence'].includes(meaning.mkind) ? meaning.mkind : 'sense';
          data.meanings.push({ source: 'user', position: 0, ...clone(meaning), mkind, id: nextId(data.meanings), word_id: target.id, created_at: meaning.created_at || now() });
        }
        counts.words += 1;
      } else {
        if (!target.pinyin && word.pinyin) target.pinyin = word.pinyin;
      }
      wordMap.set(Number(word.id), target.id);
    }
    for (const review of incomingSource.reviews) {
      const wordId = wordMap.get(Number(review.word_id));
      if (!wordId) continue;
      const duplicate = data.reviews.some(item => Number(item.word_id) === Number(wordId) && Number(Boolean(item.correct)) === Number(Boolean(review.correct)) && item.reviewed_at === review.reviewed_at);
      if (!duplicate) {
        data.reviews.push({ ...clone(review), id: nextId(data.reviews), word_id: wordId });
        counts.reviews += 1;
      }
    }
    for (const status of incomingSource.charlist_status || []) {
      if (!['known', 'unknown'].includes(status.status)) continue;
      const statusProfile = profileMap.get(Number(status.profile_id));
      if (!statusProfile || !status.book || !status.char) continue;
      const exists = data.charlist_status.some(item => Number(item.profile_id) === Number(statusProfile) && item.book === status.book && item.char === status.char);
      if (!exists) {
        data.charlist_status.push({ ...clone(status), profile_id: statusProfile });
        counts.charlistStatus = (counts.charlistStatus || 0) + 1;
      }
    }
    for (const seed of incomingSource.wordbook_seeds || []) {
      const seedProfile = profileMap.get(Number(seed.profile_id));
      if (!seedProfile || !seed.book || !seed.seeded_at) continue;
      const exists = data.wordbook_seeds.some(item => Number(item.profile_id) === Number(seedProfile) && item.book === seed.book);
      if (!exists) {
        data.wordbook_seeds.push({ ...clone(seed), profile_id: seedProfile });
        counts.wordbookSeeds = (counts.wordbookSeeds || 0) + 1;
      }
    }
    return { data, counts };
  }

  return { emptyBackup, validateBackup, normalizeData, applyReview, pickWeighted, createSequence, answerSequence, seedWordbook, normalizeDictation, mergeBackup, nextId, now, clone };
});
