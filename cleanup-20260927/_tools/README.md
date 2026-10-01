# 例曲 → 网易云音乐 匹配工具

页面里的 `netease.js`（例曲跳转表 + 外链播放器用的歌曲 ID）由这里的脚本生成。
`data.js` 里新增了例曲之后，按下面的顺序重跑即可。

## 依赖

只需要 Node（>=18）。脚本直接调用网易云音乐的公开搜索接口，无需登录、无需 Cookie。

## 步骤

```bash
# 1) 从 data.js 抽出全部例曲（生成 examples.json）
node -e "
const fs=require('fs');
const DATA=eval('('+fs.readFileSync('../data.js','utf8').replace(/^\s*(const|let|var)\s+DATA\s*=/,'').replace(/;?\s*$/,'')+')');
const out=[];
Object.keys(DATA.genres).forEach(k=>{const g=DATA.genres[k];(g.examples||[]).forEach((e,i)=>out.push({key:k,name:g.name||k,chapter:g.chapter||'',i,text:e}));});
fs.writeFileSync('examples.json', JSON.stringify(out,null,1));
console.log('examples:', out.length);
"

# 2) 主匹配（结果写 /tmp/mg/matches_v2.json，可中断续跑）
node match_v2.js

# 3) 未匹配项的二轮/三轮救援（结果写 /tmp/mg/matches.json）
node rescue.js

# 4) 合并 + 生成项目根目录的 netease.js
node gen_netease.js /tmp/mg/matches.json
```

`gen_netease.js` 的入参就是第 2、3 步产出的 JSON 文件路径；两个文件都跑完后，
取匹配数更多的那个（或按需合并）作为输入。

## 注意

- 网易云搜索接口按 **端点 + IP** 限流：命中 `操作频繁` 时脚本会自动冷却 30s 并换端点重试，
  不要为了提速把并发调到 4 以上。
- 匹配规则：曲名相似度 + 艺术家相似度双重校验（支持「曲名 - 艺术家」与「艺术家 - 曲名」两种写法，
  兼容拼写差异、括号批注、`【youtube链接】` 等），宁缺勿滥——匹配不到的条目页面就不显示按钮。
- `netease.js` 可以整体删除，删掉后详情页不再出现「试听 / 网易云」按钮，其它功能不受影响。
