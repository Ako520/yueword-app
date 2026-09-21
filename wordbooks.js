/* 朵朵英语课内置单词本（静态数据，随应用分发，按用户自动播种进各自生词本）。
   数据来源：朵朵大阅读课老师发的词汇表照片。2026-09-21 家长逐行报定终稿顺序：
   两张表都是「图片|单词|图片|单词」四列，按行从左到右通读——
   第一张表 20 词（garden, big, flower, enormous, …, In the night, dog），
   第二张表 9 词（grow, cat, small, little white mouse, family, cook, eat, house, delicious）。
   中文释义与例句为家长陪练参考。version 变更会触发已播种用户补齐释义/例句，并作废旧的书内顺序学进度。 */
(function (root) {
  root.YueWordWordbooks = {
    duoduo: {
      version: 2,
      title: '朵朵单词本',
      badge: '朵朵',
      desc: '朵朵大阅读课词汇 · 绘本《The Enormous Turnip（拔萝卜）》',
      words: [
        { word: 'garden', meaning: '花园', sentence: 'We have a small garden.', sentence_zh: '我们有一个小花园。' },
        { word: 'big', meaning: '大的', sentence: 'The turnip is big.', sentence_zh: '这个萝卜很大。' },
        { word: 'flower', meaning: '花', sentence: 'A flower grows in the garden.', sentence_zh: '花园里开了一朵花。' },
        { word: 'enormous', meaning: '巨大的', sentence: 'What an enormous turnip!', sentence_zh: '好大一个萝卜呀！' },
        { word: 'fruit tree', meaning: '果树', sentence: 'There is a fruit tree in the garden.', sentence_zh: '花园里有一棵果树。' },
        { word: 'In the morning', meaning: '在早上', sentence: 'In the morning, they see the big turnip.', sentence_zh: '在早上，他们看到了大萝卜。' },
        { word: 'vegetables', meaning: '蔬菜', sentence: 'Rabbits love vegetables.', sentence_zh: '兔子喜欢蔬菜。' },
        { word: 'hand', meaning: '手', sentence: 'Wash your hands before you eat.', sentence_zh: '吃东西前要洗手。' },
        { word: 'under', meaning: '在……下面', sentence: 'The ball is under the bed.', sentence_zh: '球在床下面。' },
        { word: 'wonderful', meaning: '极好的；精彩的', sentence: 'You are wonderful!', sentence_zh: '你太棒了！' },
        { word: 'seed', meaning: '种子', sentence: 'I plant a little seed.', sentence_zh: '我种下一粒小种子。' },
        { word: 'pull', meaning: '拉；拔', sentence: 'Pull the rope!', sentence_zh: '拉这根绳子！' },
        { word: 'turnip', meaning: '萝卜', sentence: 'They pull up a big turnip.', sentence_zh: '他们拔出一个大萝卜。' },
        { word: 'Nothing happens!', meaning: '什么也没发生！', sentence: 'He pulls and pulls. Nothing happens!', sentence_zh: '他拔呀拔，什么也没发生。' },
        { word: 'earth', meaning: '泥土；土地', sentence: 'The seed sleeps in the earth.', sentence_zh: '种子在泥土里睡觉。' },
        { word: 'wife', meaning: '妻子', sentence: 'His wife comes to help.', sentence_zh: '他的妻子来帮忙。' },
        { word: 'go to bed', meaning: '上床睡觉', sentence: 'I go to bed at nine.', sentence_zh: '我九点上床睡觉。' },
        { word: 'son & daughter', meaning: '儿子和女儿', sentence: 'Their son and daughter come to help.', sentence_zh: '他们的儿子和女儿来帮忙。' },
        { word: 'In the night', meaning: '在夜里', sentence: 'In the night, the seed grows.', sentence_zh: '在夜里，种子生长了。' },
        { word: 'dog', meaning: '狗', sentence: 'The dog comes to help, too.', sentence_zh: '狗也来帮忙。' },
        { word: 'grow', meaning: '生长；种植', sentence: 'The turnip grows and grows.', sentence_zh: '萝卜越长越大。' },
        { word: 'cat', meaning: '猫', sentence: 'The cat comes to help, too.', sentence_zh: '猫也来帮忙。' },
        { word: 'small', meaning: '小的', sentence: 'The mouse is small.', sentence_zh: '老鼠很小。' },
        { word: 'little white mouse', meaning: '小白鼠', sentence: 'A little white mouse comes to help.', sentence_zh: '一只小白鼠来帮忙。' },
        { word: 'family', meaning: '家庭；家人', sentence: 'My family is happy.', sentence_zh: '我的家庭很幸福。' },
        { word: 'cook', meaning: '做饭；烹饪', sentence: 'We cook soup together.', sentence_zh: '我们一起做汤。' },
        { word: 'eat', meaning: '吃', sentence: 'We eat the turnip soup.', sentence_zh: '我们喝萝卜汤。' },
        { word: 'house', meaning: '房子', sentence: 'The house is warm.', sentence_zh: '房子里很暖和。' },
        { word: 'delicious', meaning: '美味的', sentence: 'The soup is delicious!', sentence_zh: '这个汤真好喝！' }
      ]
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
