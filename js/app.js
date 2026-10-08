/* =====================================================================
   蹭饭图交互逻辑
   - 真实省界来自 map-data.js（DataV GeoJSON 投影生成）
   - 动画风格取自元素周期表：hover 发光 / 点击放大 / 其余变暗 / 卡片弹出
   ===================================================================== */
(function () {
	'use strict';

	const D = window.MAP_DATA;
	const NS = 'http://www.w3.org/2000/svg';

	/* students.js 缺失或没填时的兜底默认值，保证页面始终能打开。
	   注意：students.js 用顶层 const 声明（不挂 window），这里只能用 typeof
	   查全局词法绑定，且局部变量不能与全局同名，否则触发 TDZ。 */
	const DEFAULT_SETTINGS = { title: '毕业蹭饭图', subtitle: '点击发光的省份，找同学蹭饭去', teachers: [] };
	const AppSettings = (typeof SETTINGS !== 'undefined' && SETTINGS) || DEFAULT_SETTINGS;
	const AppStudents = (typeof STUDENTS !== 'undefined' && STUDENTS) || {};

	/* ---------- 七大地理分区（霓虹配色，对应周期表的“元素类别”） ---------- */
	const REGIONS = [
		{ key: 'north', name: '华北', color: '#ff4d6d', codes: [110000, 120000, 130000, 140000, 150000] },
		{ key: 'ne',    name: '东北', color: '#ff9f1c', codes: [210000, 220000, 230000] },
		{ key: 'east',  name: '华东', color: '#2ee6a6', codes: [310000, 320000, 330000, 340000, 350000, 360000, 370000, 710000] },
		{ key: 'center',name: '华中', color: '#4d96ff', codes: [410000, 420000, 430000] },
		{ key: 'south', name: '华南', color: '#b455ff', codes: [440000, 450000, 460000, 810000, 820000] },
		{ key: 'sw',    name: '西南', color: '#ffd60a', codes: [500000, 510000, 520000, 530000, 540000] },
		{ key: 'nw',    name: '西北', color: '#00d9ff', codes: [610000, 620000, 630000, 640000, 650000] },
	];
	const regionOf = new Map();
	REGIONS.forEach((r) => r.codes.forEach((c) => regionOf.set(c, r)));

	/* 全称 → 短名（地图标签用） */
	const SHORT = {
		'北京市': '北京', '天津市': '天津', '河北省': '河北', '山西省': '山西', '内蒙古自治区': '内蒙古',
		'辽宁省': '辽宁', '吉林省': '吉林', '黑龙江省': '黑龙江', '上海市': '上海', '江苏省': '江苏',
		'浙江省': '浙江', '安徽省': '安徽', '福建省': '福建', '江西省': '江西', '山东省': '山东',
		'河南省': '河南', '湖北省': '湖北', '湖南省': '湖南', '广东省': '广东', '广西壮族自治区': '广西',
		'海南省': '海南', '重庆市': '重庆', '四川省': '四川', '贵州省': '贵州', '云南省': '云南',
		'西藏自治区': '西藏', '陕西省': '陕西', '甘肃省': '甘肃', '青海省': '青海',
		'宁夏回族自治区': '宁夏', '新疆维吾尔自治区': '新疆', '台湾省': '台湾',
		'香港特别行政区': '香港', '澳门特别行政区': '澳门',
	};

	/* students.js 里允许的省名写法 → adcode */
	const ALIAS = {};
	D.provinces.forEach((p) => {
		const code = p.c;
		ALIAS[p.n] = code;                       // 全称
		ALIAS[SHORT[p.n]] = code;                // 简称
	});
	Object.assign(ALIAS, {
		'内蒙': 150000, '广西壮族': 450000, '宁夏回族': 640000, '新疆维吾尔': 650000,
		'西藏自治区': 540000, '香港特区': 810000, '澳门特区': 820000,
	});

	/* ---------- 归一化学生数据：adcode -> [{name, school}] ---------- */
	const roster = new Map();
	let totalStudents = 0;
	for (const [rawKey, list] of Object.entries(AppStudents)) {
		const key = rawKey.trim();
		const code = ALIAS[key];
		if (code === undefined) {
			console.warn('[蹭饭图] 看不懂的省份名：', rawKey);
			continue;
		}
		if (!Array.isArray(list)) continue;
		if (!roster.has(code)) roster.set(code, []);
		list.forEach((s) => {
			if (s && s.name) {
				roster.get(code).push({ name: String(s.name), school: String(s.school || '').trim() });
				totalStudents++;
			}
		});
	}

	/* ---------- DOM ---------- */
	const svg = document.getElementById('map');
	svg.setAttribute('viewBox', `${D.mainView.x} ${D.mainView.y} ${D.mainView.w} ${D.mainView.h}`);

	const inset = document.getElementById('inset');
	inset.setAttribute('viewBox', `${D.insetView.x} ${D.insetView.y} ${D.insetView.w} ${D.insetView.h}`);

	const geoG = document.getElementById('geo');
	const labelG = document.getElementById('labels');
	const pinG = document.getElementById('pins');
	const overlay = document.getElementById('overlay');
	const card = document.getElementById('card');
	const tooltip = document.getElementById('tooltip');
	const legend = document.getElementById('legend');
	const stage = document.getElementById('stage');

	const NO_LABEL = new Set([810000, 820000]); // 港澳太小，标签挤不下
	/* 直辖市/小省的标签挪到省域外，避免和邻省叠在一起 */
	const LABEL_OFFSET = {
		110000: [-10, -7],  // 北京
		120000: [13, 10],   // 天津
		310000: [13, 9],    // 上海
	};

	/* ---------- 渲染省份 ----------
	   每个省是 g.cell，里面两条同形状的 path：
	   - .halo   光晕副本：挂 filter，放大时和本体同变换。它在 GPU 管线下可能被
	             低分辨率纹理化，但只负责产生柔光（本来就是糊的），填充是均匀色，
	             纹理化也看不出来；
	   - .province 清晰本体：不带任何 filter，也不是任何 filter 元素的后代，
	             矢量按最终分辨率光栅化，放大后边缘永远锐利。
	   千万不要让带 scale 的内容处在 filter 子树里（真实浏览器 GPU 合成会
	   先按未放大尺寸建纹理再拉伸，整片省域雾状发虚）。 */
	const pathOf = new Map();
	const haloOf = new Map();
	const cellOf = new Map();
	const labelOf = new Map();
	for (const p of D.provinces) {
		const region = regionOf.get(p.c);
		const cell = document.createElementNS(NS, 'g');
		cell.classList.add('cell', 'r-' + region.key);
		cell.style.setProperty('--c', region.color);

		const halo = document.createElementNS(NS, 'path');
		halo.setAttribute('d', p.d);
		halo.setAttribute('fill-rule', 'evenodd');
		halo.classList.add('halo');

		const path = document.createElementNS(NS, 'path');
		path.setAttribute('d', p.d);
		path.setAttribute('fill-rule', 'evenodd');
		path.setAttribute('data-code', p.c);
		path.classList.add('province');
		const count = roster.get(p.c)?.length || 0;
		path.setAttribute('data-count', count);
		cell.appendChild(halo);
		cell.appendChild(path);
		geoG.appendChild(cell);
		pathOf.set(p.c, path);
		haloOf.set(p.c, halo);
		cellOf.set(p.c, cell);

		/* 省名标签：小省字号小一档；记录避让偏移（默认不可见，放大后才显示） */
		if (!NO_LABEL.has(p.c)) {
			const bb = path.getBBox();
			const small = bb.width * bb.height < 700;
			const off = LABEL_OFFSET[p.c] || [0, 0];
			const lift = count > 0 && !LABEL_OFFSET[p.c] ? -7.5 : 0;
			const ox = off[0], oy = off[1] + lift;
			const t = document.createElementNS(NS, 'text');
			t.setAttribute('x', p.x + ox);
			t.setAttribute('y', p.y + oy);
			t.dataset.ox = ox;   // 相对省域质心的偏移，放大时要补偿掉
			t.dataset.oy = oy;
			t.setAttribute('text-anchor', 'middle');
			t.setAttribute('dominant-baseline', 'central');
			t.classList.add('province-label', small ? 'label-sm' : 'label-lg');
			t.textContent = SHORT[p.n];
			labelG.appendChild(t);
			labelOf.set(p.c, t);
		}

		/* 有人的省份：脉冲角标（呼应周期表里的电子） */
		if (count > 0) {
			const g = document.createElementNS(NS, 'g');
			g.setAttribute('transform', `translate(${p.x} ${p.y})`);
			g.classList.add('pin', 'r-' + region.key);
			g.style.setProperty('--c', region.color);
			g.innerHTML =
				'<circle class="pin-halo"></circle>' +
				'<circle class="pin-dot" r="3.4"></circle>' +
				`<text class="pin-num" y="0.35" text-anchor="middle" dominant-baseline="central">${count}</text>`;
			pinG.appendChild(g);
		}
	}

	/* 十段线（虚线，不参与点击） */
	const ten = document.getElementById('ten-dash');
	ten.setAttribute('d', D.tenDash);

	/* ---------- 顶部标题 / 统计 ---------- */
	document.getElementById('title').textContent = AppSettings.title;
	document.getElementById('subtitle').textContent = AppSettings.subtitle;

	/* 任课老师一行：学科 + 姓名，没有老师则整块移除 */
	const teachersEl = document.getElementById('teachers');
	if (Array.isArray(AppSettings.teachers) && AppSettings.teachers.length) {
		teachersEl.innerHTML = AppSettings.teachers.map((t) =>
			`<span class="teacher"><i>${t.role}</i>${t.name}</span>`
		).join('<span class="t-sep">·</span>');
	} else {
		teachersEl.remove();
	}
	document.getElementById('stat-num').textContent = totalStudents;
	document.getElementById('stat-prov').textContent = roster.size;

	/* ---------- 大区图例 ---------- */
	REGIONS.forEach((r) => {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'legend-item r-' + r.key;
		b.style.setProperty('--c', r.color);
		b.dataset.region = r.key;
		b.innerHTML = `<i></i>${r.name}`;
		legend.appendChild(b);
	});

	/* =====================================================
	   交互：选中省份 → 放大居中 + 其余变暗 + 卡片弹出
	   ===================================================== */
	let selected = null;

	function selectProvince(code) {
		clearFilter();
		tooltip.classList.remove('show'); // 点击瞬间鼠标可能没动，hover 气泡不会自己消失，主动收掉
		if (selected) closeCard(true);

		const path = pathOf.get(code);
		const data = D.provinces.find((x) => x.c === code);
		selected = path;
		document.body.classList.add('viewing');
		path.classList.add('selected');
		const cell = cellOf.get(code);
		cell.classList.add('glow');
		cell.parentNode.appendChild(cell); // 整组置顶，避免被邻省盖住

		geoG.querySelectorAll('.province').forEach((o) => {
			if (o !== path) o.classList.add('dim');
		});

		/* 放大倍数：按省域四边到质心的距离和屏幕可用空间反算，
		   保证放大后上下左右都不被裁掉（新疆/内蒙古这种大省也完整） */
		const rect = svg.getBoundingClientRect();
		const b = path.getBBox();
		const screenCTM = svg.getScreenCTM();
		const pxPerUnit = screenCTM.a; // 每个 SVG 单位对应多少屏幕像素
		const narrow = window.innerWidth <= 760;

		const aimClientX = rect.left + rect.width * 0.36;
		const aimClientY = rect.top + rect.height * 0.52;

		/* 省域包围盒四边距面积质心的距离（新疆等省质心偏心，必须分别算） */
		const dL = data.x - b.x, dR = b.x + b.width - data.x;
		const dT = data.y - b.y, dB = b.y + b.height - data.y;

		/* 放大后省域允许到达的边界：严格限制在地图舞台内，
		   不冲出舞台盖到顶部标题或底部图例；右侧再给信息卡留位 */
		const cardW = Math.min(360, window.innerWidth * 0.92);
		const room = {
			L: aimClientX - rect.left - 10,
			R: narrow
				? rect.right - aimClientX - 10
				: Math.min(
					rect.right - aimClientX - 10,
					window.innerWidth - aimClientX - cardW - 0.04 * window.innerWidth,
				),
			T: aimClientY - rect.top - 8,          // 不越过地图舞台顶部（标题区）
			B: rect.bottom - aimClientY - (narrow ? 0.3 * window.innerHeight : 84), // 避开底部图例/手机端卡片
		};
		const k = Math.max(1, Math.min(9,
			room.L / (dL * pxPerUnit),
			room.R / (dR * pxPerUnit),
			room.T / (dT * pxPerUnit),
			room.B / (dB * pxPerUnit),
		));

		/* 屏幕中心偏左一点，给右侧信息卡留位置；换成 SVG 坐标。
		   注意 getScreenCTM 的逆矩阵吃的是 client 坐标（相对浏览器视口），
		   必须加上 rect.left/top，不能只传相对 SVG 左上角的偏移 */
		const ctm = screenCTM.inverse();
		const aim = new DOMPoint(
			rect.left + rect.width * 0.36,
			rect.top + rect.height * 0.52,
		).matrixTransform(ctm);
		const tx = (aim.x - data.x * k).toFixed(1);
		const ty = (aim.y - data.y * k).toFixed(1);
		const zoom = `translate(${tx}px, ${ty}px) scale(${k.toFixed(2)})`;
		path.style.transform = zoom;
		haloOf.get(code).style.transform = zoom; // 光晕副本同变换，柔光跟着省走

		/* 省名跟随放大，并把避让角标的偏移补偿掉，使名字落在省域中心 */
		const label = labelOf.get(code);
		if (label) {
			const ox = +label.dataset.ox, oy = +label.dataset.oy;
			const lx = (aim.x - data.x * k - ox * k).toFixed(1);
			const ly = (aim.y - data.y * k - oy * k).toFixed(1);
			label.style.transform = `translate(${lx}px, ${ly}px) scale(${k.toFixed(2)})`;
			label.classList.add('selected-label');
		}

		overlay.classList.add('show');
		renderCard(code);
		card.classList.add('show');
	}

	function closeCard(silent) {
		if (!selected) return;
		const codeClosed = +selected.dataset.code;
		selected.style.transform = '';
		selected.classList.remove('selected');
		haloOf.get(codeClosed).style.transform = '';
		cellOf.get(codeClosed).classList.remove('glow');
		const prevLabel = labelOf.get(+selected.dataset.code);
		if (prevLabel) {
			prevLabel.style.transform = '';
			prevLabel.classList.remove('selected-label');
		}
		document.body.classList.remove('viewing');
		geoG.querySelectorAll('.province.dim').forEach((o) => o.classList.remove('dim'));
		selected = null;
		overlay.classList.remove('show');
		card.classList.remove('show');
	}

	/* ---------- 信息卡内容 ---------- */
	function renderCard(code) {
		const data = D.provinces.find((x) => x.c === code);
		const region = regionOf.get(code);
		const list = roster.get(code) || [];

		/* 按学校分组 */
		const groups = new Map();
		list.forEach((s) => {
			const k = s.school || '其他';
			if (!groups.has(k)) groups.set(k, []);
			groups.get(k).push(s.name);
		});

		card.style.setProperty('--c', region.color);
		let html = `
			<button class="card-close" id="card-close" aria-label="关闭"></button>
			<div class="card-head">
				<span class="card-region" style="color:${region.color}">${region.name}地区</span>
				<h2>${SHORT[data.n] || data.n}</h2>
				<p class="card-count">${list.length ? `${list.length} 位同学在此` : '暂时还空着'}</p>
			</div>`;

		if (list.length) {
			html += '<div class="card-list">';
			for (const [school, names] of groups) {
				html += `<div class="school">
					<div class="school-name">${school}</div>
					<div class="school-names">${names.map((n) => `<span>${n}</span>`).join('')}</div>
				</div>`;
			}
			html += '</div><p class="card-tip">到了记得发定位，同学们排队来蹭饭！</p>';
		} else {
			html += '<div class="card-empty">这片土地还没有本班同学落脚……</div>';
		}
		card.innerHTML = html;
		document.getElementById('card-close').addEventListener('click', () => closeCard());
	}

	/* ---------- hover 提示 ---------- */
	geoG.addEventListener('pointermove', (e) => {
		const path = e.target.closest('.province');
		if (!path || selected) { tooltip.classList.remove('show'); return; }
		const code = +path.dataset.code;
		const n = roster.get(code)?.length || 0;
		tooltip.innerHTML =
			`<b>${SHORT[D.provinces.find((x) => x.c === code).n]}</b>` +
			(n ? `<i>${n} 位同学</i>` : '<i>暂无同学</i>');
		tooltip.classList.add('show');
		tooltip.style.left = e.clientX + 14 + 'px';
		tooltip.style.top = e.clientY + 16 + 'px';
	});
	stage.addEventListener('pointerleave', () => tooltip.classList.remove('show'));

	/* ---------- 点击 / 关闭 ---------- */
	geoG.addEventListener('click', (e) => {
		const path = e.target.closest('.province');
		if (path) selectProvince(+path.dataset.code);
	});
	overlay.addEventListener('click', () => closeCard());
	window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCard(); });
	window.addEventListener('resize', () => closeCard(true));

	/* ---------- 大区筛选 ---------- */
	let activeRegion = null;
	function clearFilter() {
		if (!activeRegion) return;
		document.body.classList.remove('filtering');
		geoG.querySelectorAll('.cell.faded').forEach((o) => o.classList.remove('faded'));
		pinG.querySelectorAll('.pin.faded').forEach((o) => o.classList.remove('faded'));
		legend.querySelectorAll('.legend-item.on').forEach((o) => o.classList.remove('on'));
		activeRegion = null;
	}
	legend.addEventListener('click', (e) => {
		const b = e.target.closest('.legend-item');
		if (!b) return;
		const key = b.dataset.region;
		if (activeRegion === key) { clearFilter(); return; }
		closeCard(true);
		clearFilter();
		activeRegion = key;
		document.body.classList.add('filtering');
		b.classList.add('on');
		geoG.querySelectorAll('.cell').forEach((o) => {
			if (!o.classList.contains('r-' + key)) o.classList.add('faded');
		});
		pinG.querySelectorAll('.pin').forEach((o) => {
			if (!o.classList.contains('r-' + key)) o.classList.add('faded');
		});
	});

	/* =====================================================
	   搜索：按 姓名 / 学校 / 省份 找到同学 → 定位到对应省份，
	   并在弹出的名单卡片里把这个人点亮
	   ===================================================== */
	const searchBox = document.getElementById('search');
	const searchInput = document.getElementById('search-input');
	const searchResults = document.getElementById('search-results');

	const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

	/* 把 roster 摊平成一条条同学记录，方便一次过滤 */
	const searchIndex = [];
	roster.forEach((list, code) => {
		const data = D.provinces.find((x) => x.c === code);
		const prov = data ? (SHORT[data.n] || data.n) : '';
		list.forEach((s) => searchIndex.push({ name: s.name, school: s.school, code, prov }));
	});

	let hits = [];
	let hlIdx = -1;
	let composing = false;

	function renderSearchResults() {
		const q = searchInput.value.trim();
		if (!hits.length) {
			searchResults.innerHTML = q ? '<li class="search-empty">没有找到匹配的同学</li>' : '';
			searchResults.classList.toggle('show', !!q);
			return;
		}
		searchResults.innerHTML = hits.map((it, i) =>
			`<li class="search-item${i === hlIdx ? ' hl' : ''}" data-i="${i}">` +
			`<span class="s-name">${esc(it.name)}</span>` +
			(it.school ? `<span class="s-school">${esc(it.school)}</span>` : '') +
			`<span class="s-prov">${esc(it.prov)}</span></li>`
		).join('');
		searchResults.classList.add('show');
	}

	function runSearch() {
		const q = searchInput.value.trim().toLowerCase();
		hlIdx = -1;
		hits = q
			? searchIndex.filter((it) =>
				it.name.toLowerCase().includes(q) ||
				it.school.toLowerCase().includes(q) ||
				it.prov.toLowerCase().includes(q)
			).slice(0, 12)
			: [];
		renderSearchResults();
	}

	function closeSearch() {
		searchResults.classList.remove('show');
		searchResults.innerHTML = '';
		hits = [];
		hlIdx = -1;
	}

	function pickResult(it) {
		searchInput.blur();
		closeSearch();
		selectProvince(it.code);
		/* 同名同学可能不止一个，优先只点亮同一所学校里的那个 */
		card.querySelectorAll('.school').forEach((blk) => {
			if (it.school && blk.querySelector('.school-name').textContent !== it.school) return;
			blk.querySelectorAll('.school-names span').forEach((sp) => {
				if (sp.textContent === it.name) sp.classList.add('hit');
			});
		});
	}

	searchInput.addEventListener('compositionstart', () => { composing = true; });
	searchInput.addEventListener('compositionend', () => { composing = false; runSearch(); });
	searchInput.addEventListener('input', () => { if (!composing) runSearch(); });
	searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) runSearch(); });
	searchInput.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			e.stopPropagation(); // 别让 Esc 顺手把已打开的省份卡片也关掉
			if (searchResults.classList.contains('show')) closeSearch();
			else searchInput.blur();
			return;
		}
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!hits.length) return;
			const step = e.key === 'ArrowDown' ? 1 : hits.length - 1;
			if (hlIdx < 0) hlIdx = e.key === 'ArrowDown' ? 0 : hits.length - 1;
			else hlIdx = (hlIdx + step) % hits.length;
			renderSearchResults();
			const el = searchResults.querySelector('.search-item.hl');
			if (el) el.scrollIntoView({ block: 'nearest' });
			return;
		}
		if (e.key === 'Enter' && hits.length) {
			e.preventDefault();
			pickResult(hits[hlIdx >= 0 ? hlIdx : 0]);
		}
	});

	/* 用 mousedown 而不是 click：避免输入框先失焦、列表被收起后点空 */
	searchResults.addEventListener('mousedown', (e) => {
		const li = e.target.closest('.search-item');
		if (!li) return;
		e.preventDefault();
		pickResult(hits[+li.dataset.i]);
	});

	document.addEventListener('mousedown', (e) => {
		if (!searchBox.contains(e.target)) closeSearch();
	});
})();
