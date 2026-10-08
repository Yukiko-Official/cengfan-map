# 毕业蹭饭图 · 霓虹中国地图

唔……做这个东西的初衷其实挺简单的。毕业之后大家就散了，想知道谁去了哪儿，翻群聊太累了，干脆画在图上算了。

纯前端、零依赖，双击就能用。34 个省级行政区一个都不少（含港澳台和南海诸岛附图、十段线），省界是真实的 GeoJSON 数据。有同学去的省份会亮起脉冲光点——点开看看是谁，以后去到那座城市，就有饭可以蹭了。

整个文件夹都是静态文件，丢到任意静态托管上就能分享给别人看。

## 它能做什么

- **点击省份**：自动居中放大（大省小省倍数自适应，边界不会被裁掉），其余省份暗下去，侧滑卡片按学校分组列出同学
- **搜索定位**：顶上有个搜索框，输姓名、学校、省份都能找。回车就直接带你去那个省，还会在名单里把这个人单独点亮
- **脉冲标记**：有同学的省份显示光点，旁边标着人数
- **大区筛选**：底部华北 / 东北 / 华东 / 华中 / 华南 / 西南 / 西北七色图例，点一下只高亮对应区域
- **悬停提示**：鼠标放上去有省份 + 人数的气泡
- **数据生成器**：`generator.html` 是个傻瓜式录入页，能批量粘贴名单、自动补全学校、草稿自动保存、一键导出
- **完全离线**：地图数据内联在 `js/map-data.js` 里，不用联网，也不用构建

## 怎么开始

1. 把整个文件夹下载下来；
2. 双击 **`generator.html`**，按三步填好班级信息和同学名单，导出的 `students.js` 保存到 `js/` 目录覆盖掉（第一次用的话，可以先把 `js/students.example.js` 复制一份改名成 `students.js`）；
3. 双击 **`index.html`**，就能在浏览器里看到了。

> 不用生成器也完全可以，照着 `js/students.example.js` 的格式，自己手写一个 `students.js` 是一样的。

## 目录结构

```
cengfan/
├── index.html            # 地图页面（入口）
├── generator.html        # 数据生成器（可视化填写并导出 students.js）
├── css/
│   └── style.css         # 全部样式与动画
├── js/
│   ├── app.js            # 地图渲染与交互逻辑
│   ├── map-data.js       # 内联省界数据（由 tools/build-map.js 生成）
│   ├── students.js       # ★ 班级数据（已 gitignore，不入库）
│   └── students.example.js  # 数据格式模板
├── data/
│   └── china.json        # 省界源数据（DataV GeoJSON）
└── tools/
    └── build-map.js      # GeoJSON → map-data.js 的生成脚本
```

## students.js 数据格式

```js
const SETTINGS = {
	title: 'XX中学 2024届 高三（X）班',
	subtitle: '毕业去向蹭饭图 · 点击发光的省份，找同学蹭饭去',
	teachers: [
		{ role: '班主任·英语', name: '张老师' },
	],
};

const STUDENTS = {
	陕西: [
		{ name: '王小明', school: '西安交通大学' },
		{ name: '李小红', school: '西北工业大学' },
	],
	北京: [
		{ name: '赵小刚', school: '清华大学' },
	],
};
```

- 省名写简称就行（北京 / 内蒙古 / 广西 / 香港……全称也能认出来）；
- 同一个省的同学写在同一个列表里，没有同学的省份不用写；
- `teachers` 留空数组 `[]` 就不显示老师那一行。

## 部署

都是纯静态文件，放到任意静态空间就行（GitHub Pages、Netlify、Vercel、对象存储、虚拟主机都可以）：

- 保证 `index.html`、`css/`、`js/`（连同填好的 `students.js`）保持相对目录结构一起传上去；
- 部署之后如果更新了数据，记得强刷一次（`Ctrl + F5`），不然浏览器会咬着旧文件不放。

## 重新生成地图数据

正常使用不需要这一步。想调整省界简化精度的话：

```bash
node tools/build-map.js
```

源数据是阿里云 DataV 公开的全国省级行政区 GeoJSON（`data/china.json`，墨卡托投影、Douglas–Peucker 简化）。

## 浏览器兼容

推荐用新版 Edge / Chrome / Firefox / Safari（支持 CSS Grid、SVG、File System Access API 的浏览器可以直接「保存为 students.js」，其他浏览器会自动改成下载文件）。
