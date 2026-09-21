# YueWord 离线版

这是不依赖 FastAPI 和 Apple 开发者签名的独立 PWA。安装后数据保存在设备浏览器中，可在电脑关机、断网时继续使用。

## 电脑预览

在仓库根目录运行：

```bash
python3 -m http.server 4173 --directory offline
```

打开 `http://localhost:4173/`。localhost 可以注册 Service Worker，适合验证离线缓存。

## 正式安装到 iPad

1. 将 `offline/` 原样发布到任意 HTTPS 静态网站。
2. 在 iPad Safari 中打开该网址一次，等待“离线功能已准备好”。
3. 在“数据”页导入从原生 YueWord 导出的 `.lexicon` 文件。
4. 点 Safari 的分享按钮，再点“添加到主屏幕”。
5. 从主屏幕打开 YueWord。之后断网也可用，不受 7 天签名限制。

## 数据注意事项

- Safari 网站数据被手动清除时，本地单词也会被删除，因此建议定期导出备份。
- PWA 数据与电脑网页版、SwiftUI 原生 App 不自动同步；通过导入、导出文件转移。
- 导入采用合并模式，同名用户和同名单词不会重复创建。
