# 毕业蹭饭图 · 霓虹中国地图

纯前端、零依赖、双击即用的可交互中国地图毕业去向图。34 个省级行政区完整（含港澳台与南海诸岛附图、十段线），省界为真实 GeoJSON 数据。同学去了哪些省份，哪些省就会亮起脉冲光点；点击省份放大并展示同学名单，可直接部署到任意静态托管。

## 功能

- **点击省份**：自动居中放大（大省小省倍数自适应、边界不裁切），其余省份变暗，侧滑卡片按学校分组列出同学
- **脉冲标记**：有人的省份显示光点与人数
- **大区筛选**：底部华北 / 东北 / 华东 / 华中 / 华南 / 西南 / 西北七色图例，点击只高亮对应区域
- **悬停提示**：省份 + 人数气泡
- **数据生成器**：`generator.html` 提供傻瓜式可视化录入（批量粘贴、学校自动补全、草稿自动保存、一键导出）
- **完全离线**：地图数据内联在 `js/map-data.js`，无需联网、无需构建

## 快速开始

1. 下载整个文件夹；
2. 双击打开 **`generator.html`**，按三步填写班级信息和同学名单，导出 `students.js` 保存到 `js/` 目录覆盖（首次使用可先把 `js/students.example.js` 复制为 `js/students.js`）；
3. 双击 **`index.html`** 即可在浏览器中查看。

> 也可以不使用生成器，直接照着 `js/students.example.js` 的格式手写 `js/students.js`。

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

- 省名写简称即可（北京/内蒙古/广西/香港……全称也能识别）；
- 同一省份的同学写在同一个列表里；没有同学的省份不用写；
- `teachers` 留空数组 `[]` 即不显示老师行。

## 部署

纯静态文件，放到任意静态空间即可（GitHub Pages、Netlify、Vercel、对象存储、虚拟主机都行）：

- 保证 `index.html`、`css/`、`js/`（含填写好的 `students.js`）保持相对目录结构一起上传；
- 部署后如更新数据，强刷一次（`Ctrl + F5`）避免浏览器缓存旧文件。

## 重新生成地图数据

正常使用不需要这一步。如需调整省界简化精度：

```bash
node tools/build-map.js
```

源数据为阿里云 DataV 公开的全国省级行政区 GeoJSON（`data/china.json`，墨卡托投影、Douglas–Peucker 简化）。

## 隐私说明

- `js/students.js` 含有真实姓名，已在 `.gitignore` 中排除，不会被 Git 提交；仓库中只保留 `students.example.js` 虚构示例；
- 生成器的录入内容会自动保存在**本机浏览器** localStorage 中（刷新不丢）。在公用电脑上使用后，请在生成器中点「清空全部」，或清除该页面的浏览器站点数据；
- 若已把含真实数据的提交推送到远端，仅删除文件不够，需要清理 Git 历史。

## 浏览器兼容

推荐使用新版 Edge / Chrome / Firefox / Safari（支持 CSS Grid、SVG、File System Access API 的浏览器可直接「保存为 students.js」，其他浏览器会自动改为下载文件）。
