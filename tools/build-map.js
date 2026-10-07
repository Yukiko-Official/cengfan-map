/**
 * build-map.js
 * 把真实省界 GeoJSON(DataV areas_v3/100000_full，含十段线) 转成内联 SVG 路径数据
 * 运行: node tools/build-map.js
 * 输出: js/map-data.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data', 'china.json');
const OUT = path.join(__dirname, '..', 'js', 'map-data.js');

const geo = JSON.parse(fs.readFileSync(SRC, 'utf8'));

/* ---------- Web 墨卡托投影（和绝大多数在线地图观感一致） ---------- */
const K = 6378137; // 地球半径，单位会被归一化掉
const project = (lng, lat) => {
	const x = (K * lng * Math.PI) / 180;
	const y = -K * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
	return [x, y];
};

/* ---------- 先求全部坐标的投影包围盒 ---------- */
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
const walkAll = (a) => {
	if (typeof a[0] === 'number') {
		const [x, y] = project(a[0], a[1]);
		minX = Math.min(minX, x); maxX = Math.max(maxX, x);
		minY = Math.min(minY, y); maxY = Math.max(maxY, y);
	} else a.forEach(walkAll);
};
geo.features.forEach((f) => walkAll(f.geometry.coordinates));

/* ---------- 归一化到宽 1000 的画布 ---------- */
const W = 1000;
const PAD = 12;
const scale = (W - PAD * 2) / (maxX - minX);
const H = Math.ceil((maxY - minY) * scale + PAD * 2);
const norm = (x, y) => [PAD + (x - minX) * scale, PAD + (y - minY) * scale];

/* ---------- Douglas-Peucker 折线简化（单位：画布像素） ---------- */
function simplifyRing(pts, eps) {
	if (pts.length <= 3) return pts;
	const keep = new Uint8Array(pts.length);
	keep[0] = 1; keep[pts.length - 1] = 1;
	const stack = [[0, pts.length - 1]];
	while (stack.length) {
		const [s, e] = stack.pop();
		const [x1, y1] = pts[s], [x2, y2] = pts[e];
		const dx = x2 - x1, dy = y2 - y1;
		const den = Math.hypot(dx, dy);
		let dmax = 0, idx = 0;
		for (let i = s + 1; i < e; i++) {
			const [x, y] = pts[i];
			const d = den === 0
				? Math.hypot(x - x1, y - y1)
				: Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / den;
			if (d > dmax) { dmax = d; idx = i; }
		}
		if (dmax > eps && idx) {
			keep[idx] = 1;
			stack.push([s, idx], [idx, e]);
		}
	}
	return pts.filter((_, i) => keep[i]);
}

/* ---------- 投影一个几何，返回 {rings, centroid} ---------- */
function projectGeometry(geom, eps) {
	// Polygon: rings[] ; MultiPolygon: polygons[][][]
	const polygons = geom.type === 'Polygon'
		? [geom.coordinates]
		: geom.coordinates;

	const outPolys = polygons.map((rings) =>
		rings.map((ring) => {
			const pts = ring.map(([lng, lat]) => norm(...project(lng, lat)));
			return simplifyRing(pts, eps);
		})
	);

	// 面积质心：取面积最大的那个多边形（避免飞地导致标签跑飞）
	let best = null, bestArea = -1;
	for (const rings of outPolys) {
		const ring = rings[0];
		let a2 = 0, cx = 0, cy = 0;
		for (let i = 0; i < ring.length - 1; i++) {
			const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
			const cross = x1 * y2 - x2 * y1;
			a2 += cross; cx += (x1 + x2) * cross; cy += (y1 + y2) * cross;
		}
		const area = Math.abs(a2 / 2);
		if (area > bestArea) {
			bestArea = area;
			best = [cx / (3 * a2), cy / (3 * a2)];
		}
	}
	return { polys: outPolys, centroid: best };
}

function ringsToPath(polys) {
	let d = '';
	for (const rings of polys) {
		for (const ring of rings) {
			for (let i = 0; i < ring.length; i++) {
				const [x, y] = ring[i];
				d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2);
			}
			d += 'Z';
		}
	}
	return d;
}

/* 经纬度范围 -> 归一化画布坐标（给主图/南海附图算 viewBox 用） */
function viewFromLngLat(lng0, lat0, lng1, lat1) {
	const [x0, y0] = norm(...project(lng0, lat1)); // 北在上
	const [x1, y1] = norm(...project(lng1, lat0));
	return { x: +x0.toFixed(1), y: +y0.toFixed(1), w: +(x1 - x0).toFixed(1), h: +(y1 - y0).toFixed(1) };
}

/* ---------- 处理全部要素 ---------- */
const EPS = 0.12; // 简化容差，越小越精细、体积越大（放大最高约 9 倍，需保留足够细节）
const provinces = [];
let tenDash = '';

for (const f of geo.features) {
	const { polys, centroid } = projectGeometry(f.geometry, EPS);
	const d = ringsToPath(polys);
	if (String(f.properties.adcode) === '100000_JD') {
		tenDash = d;
		continue;
	}
	provinces.push({
		c: f.properties.adcode,
		n: f.properties.name,
		d,
		x: +centroid[0].toFixed(2),
		y: +centroid[1].toFixed(2),
	});
}

const payload = {
	width: W,
	height: H,
	/* 主图：只保留大陆+海南主体，南海岛礁放右下角附图 */
	mainView: viewFromLngLat(72.5, 16.4, 135.6, 53.9),
	/* 南海诸岛附图范围 */
	insetView: viewFromLngLat(104.0, 0.0, 123.5, 25.5),
	provinces,
	tenDash,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
	OUT,
	'/* 自动生成，请勿手改；数据源: DataV.GeoAtlas 100000_full.json（真实省界，含十段线） */\n'
	+ 'window.MAP_DATA = ' + JSON.stringify(payload) + ';\n',
	'utf8'
);

console.log('features:', provinces.length, '(应为34) + 十段线');
console.log('canvas:', W, 'x', H);
console.log('output size:', (fs.statSync(OUT).size / 1024).toFixed(1), 'KB');
