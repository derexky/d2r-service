/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import { load } from 'cheerio';

export interface ParsedStatEntry {
  sort_order: number;
  label_zh: string;
  label_en: string | null;
  abbrev: string | null;
  value_min: number | null;
  value_max: number | null;
  is_variable: boolean;
  value_type: string;
  color: string;
}

export interface ParsedItem {
  name_zh: string;
  name_en: string;
  category: string;
  tier: string;
  image_path: string | null;
  base_type_zh: string | null;
  base_type_en: string | null;
  level_req: number | null;
  stats: string;
  stat_entries: ParsedStatEntry[];
}

// ─── 縮寫對照表 ───────────────────────────────────────────────────────────────
const STAT_LOOKUP: Record<string, { abbrev: string; label_en: string }> = {
  // 傷害相關
  '增強傷害': { abbrev: 'ED', label_en: 'Enhanced Damage' },
  '增強防禦': { abbrev: 'ED', label_en: 'Enhanced Defense' },
  '最小傷害值': { abbrev: 'MIN DMG', label_en: 'Minimum Damage' },
  '最大傷害值': { abbrev: 'MAX DMG', label_en: 'Maximum Damage' },
  '對不死系生物傷害': { abbrev: 'DMG Undead', label_en: 'Damage vs Undead' },
  '對惡魔傷害': { abbrev: 'DMG Demon', label_en: 'Damage vs Demons' },
  // 速度相關
  '增加攻擊速度': { abbrev: 'IAS', label_en: 'Increased Attack Speed' },
  '快速再度攻擊': { abbrev: 'IAS', label_en: 'Increased Attack Speed' },
  '提升攻擊速度': { abbrev: 'IAS', label_en: 'Increased Attack Speed' },
  '快速施展速度': { abbrev: 'FCR', label_en: 'Faster Cast Rate' },
  '高速施法速度': { abbrev: 'FCR', label_en: 'Faster Cast Rate' },
  '高速施展': { abbrev: 'FCR', label_en: 'Faster Cast Rate' },
  '施法速度提升': { abbrev: 'FCR', label_en: 'Faster Cast Rate' },
  '增加施法速度': { abbrev: 'FCR', label_en: 'Faster Cast Rate' },
  '更快施法速度': { abbrev: 'FCR', label_en: 'Faster Cast Rate' },
  '快速打擊恢復': { abbrev: 'FHR', label_en: 'Faster Hit Recovery' },
  '擊中後更快恢復': { abbrev: 'FHR', label_en: 'Faster Hit Recovery' },
  '快速再度格擋': { abbrev: 'FBR', label_en: 'Faster Block Rate' },
  '快速格擋': { abbrev: 'FBR', label_en: 'Faster Block Rate' },
  '快速格檔機率': { abbrev: 'FBR', label_en: 'Faster Block Rate' },
  '快速跑步': { abbrev: 'FRW', label_en: 'Faster Run/Walk' },
  '快速跑': { abbrev: 'FRW', label_en: 'Faster Run/Walk' },
  '跑步行走速度': { abbrev: 'FRW', label_en: 'Faster Run/Walk' },
  '增加跑步走路速度': { abbrev: 'FRW', label_en: 'Faster Run/Walk' },
  '增加行走跑步速度': { abbrev: 'FRW', label_en: 'Faster Run/Walk' },
  // 基礎屬性
  '力量': { abbrev: 'STR', label_en: 'Strength' },
  '敏捷': { abbrev: 'DEX', label_en: 'Dexterity' },
  '活力': { abbrev: 'VIT', label_en: 'Vitality' },
  '能量': { abbrev: 'NRG', label_en: 'Energy' },
  '所有能力': { abbrev: 'ALL ATTR', label_en: 'All Attributes' },
  // 生命/法力
  '生命值': { abbrev: 'LIFE', label_en: 'Life' },
  '法力': { abbrev: 'MANA', label_en: 'Mana' },
  '生命再生': { abbrev: 'LIFE REG', label_en: 'Life Regeneration' },
  '法力再生': { abbrev: 'MANA REG', label_en: 'Mana Regeneration' },
  '法力重生': { abbrev: 'MANA REG', label_en: 'Mana Regeneration' },
  '每殺死一名敵人之後取得': { abbrev: 'MO', label_en: 'Mana on Kill' },
  // 防禦
  '防禦': { abbrev: 'DEF', label_en: 'Defense' },
  '對投射物防禦': { abbrev: 'DEF Missile', label_en: 'Defense vs Missile' },
  // 準確率
  '攻擊準確率': { abbrev: 'AR', label_en: 'Attack Rating' },
  '額外的攻擊準確率加成': { abbrev: 'AR%', label_en: 'Attack Rating %' },
  '對不死系生物準確率': { abbrev: 'AR Undead', label_en: 'AR vs Undead' },
  '對惡魔準確率': { abbrev: 'AR Demon', label_en: 'AR vs Demons' },
  // 抵抗
  '火焰抵抗': { abbrev: 'FR', label_en: 'Fire Resistance' },
  '閃電抵抗': { abbrev: 'LR', label_en: 'Lightning Resistance' },
  '冷凍抵抗': { abbrev: 'CR', label_en: 'Cold Resistance' },
  '毒素抵抗': { abbrev: 'PR', label_en: 'Poison Resistance' },
  '全系抵抗': { abbrev: 'ALL RES', label_en: 'All Resistances' },
  // 偷取
  '攻擊時竊取生命': { abbrev: 'LL', label_en: 'Life Leech' },
  '攻擊時竊取法力': { abbrev: 'ML', label_en: 'Mana Leech' },
  // 機率效果
  '造成壓碎性傷害機率': { abbrev: 'CB', label_en: 'Crushing Blow' },
  '撕開傷口機率': { abbrev: 'OW', label_en: 'Open Wounds' },
  '致命重擊機率': { abbrev: 'DS', label_en: 'Deadly Strike' },
  // 其他常見
  '尋找魔法物品': { abbrev: 'MF', label_en: 'Magic Find' },
  '尋找金幣': { abbrev: 'GF', label_en: 'Gold Find' },
  '光環半徑': { abbrev: 'LIGHT', label_en: 'Light Radius' },
  '擊退': { abbrev: 'KB', label_en: 'Knockback' },
  '擊中使目標盲目': { abbrev: 'BLIND', label_en: 'Hit Blinds Target' },
  '減慢目標速度': { abbrev: 'SLOW', label_en: 'Slows Target' },
  '阻止怪物恢復': { abbrev: 'PMH', label_en: 'Prevent Monster Heal' },
  '無限耐久度': { abbrev: 'INDESTR', label_en: 'Indestructible' },
  '插槽': { abbrev: 'SOCK', label_en: 'Sockets' },
  '魔法傷害降低': { abbrev: 'MDR', label_en: 'Magic Damage Reduced' },
  '傷害降低': { abbrev: 'DR', label_en: 'Damage Reduced' },
  '物理傷害降低': { abbrev: 'PDR', label_en: 'Physical Damage Reduced' },
};

// ─── 值提取 ──────────────────────────────────────────────────────────────────
function extractStatValue(raw: string): {
  value_min: number | null;
  value_max: number | null;
  is_percentage: boolean;
  cleanLabel: string;
  override_type?: string;
} {
  // 依角色等級乘N: "+5-495 攻擊準確率 (依角色等級乘5)" → label="依角色等級攻擊準確率", value=5
  const perLevelM = raw.match(/\(依角色等級[決定]*乘?(\d+(?:\.\d+)?)\s*\)\s*$/);
  if (perLevelM && perLevelM.index !== undefined) {
    const multiplier = parseFloat(perLevelM[1]);
    const withoutSuffix = raw.slice(0, perLevelM.index).trim();
    const isPct = /\d\s*%/.test(withoutSuffix);
    // Strip leading computed value prefix like "+5-495 " or "+1-99% "
    const afterLeadingNum = withoutSuffix.replace(/^[+\-]?\s*\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\s*%?\s+/, '').trim();
    // Strip trailing embedded range like " 1-99" or "1-148"
    const baseLabel = afterLeadingNum.replace(/\s*\d+(?:\.\d+)?-\d+(?:\.\d+)?$/, '').trim();
    return {
      value_min: multiplier,
      value_max: multiplier,
      is_percentage: isPct,
      cleanLabel: `依角色等級${baseLabel}`,
      override_type: isPct ? 'per_level_pct' : 'per_level',
    };
  }

  // 技能聚氣: 等級N skill (M聚氣) — 優先解析，支援有/無空格、l→1 typo
  let m = raw.match(/^等級\s*(\d+|[lL])\s*(.+?)\s*\((\d+)\s*聚氣\)$/);
  if (m) {
    const lvl = /[lL]/.test(m[1]) ? 1 : parseInt(m[1]);
    return { value_min: lvl, value_max: parseInt(m[3]), is_percentage: false, cleanLabel: m[2].trim(), override_type: 'skill_charge' };
  }

  // 技能賦予 (aura/skill grant): 等級N-M skill 或 等級N skill（無聚氣）
  m = raw.match(/^等級\s*(\d+)-(\d+)\s+([一-鿿].+)$/);
  if (m) {
    return { value_min: parseInt(m[1]), value_max: parseInt(m[2]), is_percentage: false, cleanLabel: m[3].trim(), override_type: 'skill_grant' };
  }
  m = raw.match(/^等級\s*(\d+)\s+([一-鿿].+)$/);
  if (m) {
    const lvl = parseInt(m[1]);
    return { value_min: lvl, value_max: lvl, is_percentage: false, cleanLabel: m[2].trim(), override_type: 'skill_grant' };
  }

  // 增加 [任意數值格式] 描述 — 優先處理，避免被冒號 pattern 誤截
  // 支援: N-M / N-(M-P) / (N-M)-(P-Q) / (N-M)到(P-Q) / 無空格如增加3-6...
  m = raw.match(/^增加\s*([\d()\-~.\s]+)([一-鿿].+)$/);
  if (m) {
    let numPart = m[1];
    let desc = m[2].trim();
    // 去除 description 開頭的 "到 (N-M)" 格式
    const toM = desc.match(/^到\s*([\d()\-~.\s]+)([一-鿿].+)$/);
    if (toM) { numPart += toM[1]; desc = toM[2].trim(); }
    // 若 desc 內有冒號（如 凍結目標:3秒），截掉冒號後的文字當描述的一部分不影響 label
    // 保留完整描述，只去除前導數字
    const nums = numPart.match(/\d+(?:\.\d+)?/g)?.map(parseFloat) ?? [];
    return {
      value_min: nums.length > 0 ? Math.min(...nums) : null,
      value_max: nums.length > 0 ? Math.max(...nums) : null,
      is_percentage: false,
      cleanLabel: `增加${desc}`,
    };
  }

  // "描述: 數值" 格式 — 等級需求: 5 / 武器基本速度: [-10] / 單手傷害: 6 - 11
  const colonIdx = raw.indexOf(':');
  if (colonIdx !== -1) {
    const cleanLabel = raw.slice(0, colonIdx).trim();
    const valuePart = raw.slice(colonIdx + 1).trim();

    // [±N]（武器速度）
    let vm = valuePart.match(/^\[([+-]?\d+(?:\.\d+)?)\]$/);
    if (vm) return { value_min: parseFloat(vm[1]), value_max: parseFloat(vm[1]), is_percentage: false, cleanLabel };

    // N - M（傷害範圍）
    vm = valuePart.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
    if (vm) return { value_min: parseFloat(vm[1]), value_max: parseFloat(vm[2]), is_percentage: false, cleanLabel };

    // 單一整數
    vm = valuePart.match(/^(\d+(?:\.\d+)?)$/);
    if (vm) { const v = parseFloat(vm[1]); return { value_min: v, value_max: v, is_percentage: false, cleanLabel }; }

    // 複雜格式（如 傷害值: (80-91)-(140-158)），只取標籤
    return { value_min: null, value_max: null, is_percentage: false, cleanLabel };
  }

  // 帶空格範圍（HTML 排版）: +400 - 600 防禦 | -5 - 10% 描述
  m = raw.match(/^([+-]?)(\d+(?:\.\d+)?)\s+-\s+(\d+(?:\.\d+)?)(%?)\s+(.+)$/);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    return {
      value_min: sign * parseFloat(m[2]),
      value_max: sign * parseFloat(m[3]),
      is_percentage: m[4] === '%',
      cleanLabel: m[5].trim(),
    };
  }

  // 範例: +60-70% 增強傷害 | -5-10% 閃電抵抗 | (12-15)-20% ...
  m = raw.match(/^[+-]?(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(%?)\s+(.+)$/);
  if (m) {
    return {
      value_min: parseFloat(m[1]),
      value_max: parseFloat(m[2]),
      is_percentage: m[3] === '%',
      cleanLabel: m[4].trim(),
    };
  }

  // 範例: +60% 增強傷害 | 20% 造成壓碎性傷害機率 | +8 力量 | -33% 目標防禦
  m = raw.match(/^([+-]?)(\d+(?:\.\d+)?)(%?)\s+(.+)$/);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const v = sign * parseFloat(m[2]);
    return {
      value_min: v,
      value_max: v,
      is_percentage: m[3] === '%',
      cleanLabel: m[4].trim(),
    };
  }

  // 無空格格式: N%LABEL 或 N-M%LABEL (e.g. 15%增加攻擊速度, 10-15%法力偷取)
  m = raw.match(/^[+-]?(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(%?)\s*([一-鿿].+)$/);
  if (m) {
    return {
      value_min: parseFloat(m[1]),
      value_max: parseFloat(m[2]),
      is_percentage: m[3] === '%',
      cleanLabel: m[4].trim(),
    };
  }
  m = raw.match(/^[+-]?(\d+(?:\.\d+)?)(%?)\s*([一-鿿].+)$/);
  if (m) {
    const v = parseFloat(m[1]);
    return { value_min: v, value_max: v, is_percentage: m[2] === '%', cleanLabel: m[3].trim() };
  }

  // 反向格式: 描述 +N-M% 或 描述 N% (e.g. 法力重生 20%、所有抗性 +10-20)
  // 帶空格反向 range: 所有抗性 +30 - 50
  m = raw.match(/^(.+?)\s+([+-]?)(\d+(?:\.\d+)?)\s+-\s+(\d+(?:\.\d+)?)(%?)$/);
  if (m && !/[：:]/.test(m[1])) {
    return {
      value_min: parseFloat(m[3]),
      value_max: parseFloat(m[4]),
      is_percentage: m[5] === '%',
      cleanLabel: m[1].trim(),
    };
  }
  m = raw.match(/^(.+?)\s+[+-]?(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(%?)$/);
  if (m) {
    return {
      value_min: parseFloat(m[2]),
      value_max: parseFloat(m[3]),
      is_percentage: m[4] === '%',
      cleanLabel: m[1].trim(),
    };
  }
  m = raw.match(/^(.+?)\s+[+-]?(\d+(?:\.\d+)?)(%?)$/);
  if (m && !/[：:]/.test(m[1])) {
    // 排除 "等級需求: 5" 這類基本屬性
    const v = parseFloat(m[2]);
    return {
      value_min: v,
      value_max: v,
      is_percentage: m[3] === '%',
      cleanLabel: m[1].trim(),
    };
  }

  // 無數值
  return { value_min: null, value_max: null, is_percentage: false, cleanLabel: raw };
}

function deriveValueType(cleanLabel: string, isPercentage: boolean, valueMin: number | null, color: string, overrideType?: string): string {
  if (overrideType) return overrideType;
  if (color === '#FFFFFF') return 'base_info';
  if (valueMin === null) return 'boolean';
  if (cleanLabel.startsWith('增加') && cleanLabel.includes('傷害')) return 'adds_damage';
  if (isPercentage) return 'percentage';
  return 'flat';
}

function lookupStat(cleanLabel: string): { abbrev: string | null; label_en: string | null } {
  for (const [key, val] of Object.entries(STAT_LOOKUP)) {
    if (cleanLabel.includes(key)) return { abbrev: val.abbrev, label_en: val.label_en };
  }
  return { abbrev: null, label_en: null };
}

// ─── parseStats: 依 <br> 分行，追蹤 (變動) ───────────────────────────────────
interface RawLine {
  segments: { text: string; color: string }[];
  is_variable: boolean;
}

function parseStatLines($td: any): RawLine[] {
  const lines: RawLine[] = [];
  let currentSegs: { text: string; color: string }[] = [];

  function finalize() {
    if (currentSegs.length === 0) return;
    const is_variable = currentSegs.some(
      (s) => s.color === '#FF00FF' && s.text.includes('變動'),
    );
    const segs = currentSegs.filter(
      (s) => !(s.color === '#FF00FF' && s.text.includes('變動')),
    );
    if (segs.length > 0) lines.push({ segments: segs, is_variable });
    currentSegs = [];
  }

  function walk(node: any, color: string) {
    if (node.type === 'text') {
      const t = (node.data as string).replace(/\s+/g, ' ').trim();
      if (t && t !== '　') currentSegs.push({ text: t, color });
    } else if (node.type === 'tag') {
      if (node.name === 'br') {
        finalize();
      } else if (node.name === 'p' || node.name === 'div') {
        // 區塊元素視為換行：先 flush 前面的行，走完子節點後再 flush 一次
        finalize();
        for (const child of node.children ?? []) walk(child, color);
        finalize();
      } else {
        let c = color;
        if (node.name === 'font' && node.attribs?.color) c = (node.attribs.color as string).toUpperCase();
        for (const child of node.children ?? []) walk(child, c);
      }
    }
  }

  const el = $td.get(0);
  if (el) for (const child of (el as any).children ?? []) walk(child, '#FFFFFF');
  finalize();
  return lines;
}

function lineToEntry(line: RawLine, index: number): ParsedStatEntry {
  // 合併同色段落，排除紅色（平均傷害顯示）
  const merged: { text: string; color: string }[] = [];
  for (const seg of line.segments) {
    if (seg.color === '#FF0000') continue;
    const last = merged[merged.length - 1];
    if (last && last.color === seg.color) {
      // 若前段結尾是數字、後段開頭是數字，不加空格（修正 "+3" + "0% FCR" → "+30% FCR" 的 HTML 分割問題）
      const sep = /\d$/.test(last.text) && /^\d/.test(seg.text) ? '' : ' ';
      last.text = (last.text + sep + seg.text).trim();
    }
    else merged.push({ ...seg });
  }

  const raw = merged.map((s) => s.text).join(' ').trim();
  const color = merged[0]?.color ?? '#FFFFFF';

  const { value_min, value_max, is_percentage, cleanLabel, override_type } = extractStatValue(raw);
  const value_type = deriveValueType(cleanLabel, is_percentage, value_min, color, override_type);
  const { abbrev, label_en } = lookupStat(cleanLabel);

  return {
    sort_order: index,
    label_zh: normalizeLabel(cleanLabel),
    label_en,
    abbrev,
    value_min,
    value_max,
    is_variable: line.is_variable,
    value_type,
    color,
  };
}

// ─── 輔助函式 (不變) ──────────────────────────────────────────────────────────
function inferMeta(filename: string): { category: string; tier: string } {
  const base = filename.replace(/\.htm$/i, '');
  const tierMap: Record<string, string> = { '1': 'normal', '2': 'exceptional', '3': 'elite' };
  const classItemMap: Record<string, string> = {
    baritem: 'barbarian', amaitem: 'amazon', assitem: 'assassin',
    druitem: 'druid', necitem: 'necromancer', palitem: 'paladin', soritem: 'sorceress',
  };
  if (classItemMap[base.toLowerCase()]) {
    return { category: 'class_specific', tier: 'mixed' };
  }
  const match = base.match(/^([A-Za-z]+)(\d)$/);
  if (match) return { category: match[1].toLowerCase(), tier: tierMap[match[2]] ?? 'normal' };
  return { category: base.toLowerCase(), tier: 'normal' };
}

function normalizeImagePath(src: string): string | null {
  if (!src) return null;
  const match = src.match(/([^/\\]+\.(?:gif|jpg|jpeg|png))/i);
  if (!match) return null;
  return `/assets/img/${match[1].split('?')[0]}`;
}

// ─── 匯出供外部解析器（如 parseRunewords）重用 ────────────────────────────────
export { parseStatLines, lineToEntry };
export type { RawLine };

// ─── 重建 label 字串（供 stats_v2 使用）────────────────────────────────────────
export function buildStatLabel(
  valueMin: number | null | undefined,
  valueMax: number | null | undefined,
  labelZh: string,
  valueType: string,
): string {
  const min = valueMin ?? null;
  const max = valueMax ?? null;

  if (valueType === 'per_level' || valueType === 'per_level_pct') {
    const pct = valueType === 'per_level_pct' ? '%' : '';
    const mult = min === null ? '' : min === max ? `${min}` : `${min}-${max}`;
    return mult ? `${labelZh} (×${mult}${pct})` : labelZh;
  }
  if (valueType === 'skill_charge') return `等級${min} ${labelZh} (${max} 聚氣)`;
  if (valueType === 'skill_grant') {
    return min === max ? `等級${min} ${labelZh}` : `等級${min}-${max} ${labelZh}`;
  }
  if (valueType === 'base_info') {
    if (min === null) return labelZh;
    return min === max ? `${labelZh}: ${min}` : `${labelZh}: ${min} - ${max}`;
  }
  if (valueType === 'boolean' || min === null) return labelZh;
  if (valueType === 'adds_damage') {
    const dmgType = labelZh.startsWith('增加') ? labelZh.slice(2) : labelZh;
    return min === max ? `增加 ${min} ${dmgType}` : `增加 ${min}-${max} ${dmgType}`;
  }
  // percentage / flat
  const sign = min >= 0 ? '+' : '';
  const range = min === max ? `${min}` : `${min}-${max}`;
  const pct = valueType === 'percentage' ? '%' : '';
  return `${sign}${range}${pct} ${labelZh}`;
}

// ─── Label 標準化 ─────────────────────────────────────────────────────────────
// 消除 source HTML 翻譯不一致造成的重複 stat_def
// 職業限制資訊由 item_stats.skill_id 承載，label 不需重複攜帶
function normalizeLabel(label: string): string {
  return label
    // 去除空括號翻譯殘留：" ( )"、" ()"、"( )"
    .replace(/\s*\(\s*\)\s*/g, '')
    // 統一「之後取得」→「後取得」（同義縮短）
    .replace(/之後取得/g, '後取得')
    // 統一「殺死一名敵人後取得」措辭中的「每殺一個」→「每殺死一名」
    .replace(/每殺一個敵人後取得/g, '每殺死一名敵人後取得')
    // 修正明顯錯字：「再每」→「在每」
    .replace(/再每/g, '在每')
    // 統一「于」→「於」（繁體異體字）
    .replace(/于/g, '於')
    // ── 技能樹 spelling variants ──
    .replace(/弓和十字弓技能/g, '弓與十字弓技能')
    .replace(/毒素和白骨技能/g, '毒素與白骨技能')
    .replace(/召喚與控制技能/g, '召喚技能')
    .replace(/\(限德魯依\)/g, '(限德魯伊)')
    // ── 需消歧的技能樹：先換成 canonical，後面通用 strip 就不會動到它 ──
    .replace(/戰鬥技能\s*\(限聖騎士[^)]*\)/g, '聖騎士戰鬥技能')
    .replace(/戰鬥技能\s*\(限野蠻人[^)]*\)/g, '野蠻人戰鬥技能')
    .replace(/召喚技能\s*\(限死靈法師[^)]*\)/g, '死靈召喚技能')
    .replace(/召喚技能\s*\(限德魯[依伊][^)]*\)/g, '德魯依召喚技能')
    // ── 非「技能」結尾的技能樹 label ──
    .replace(/武學藝術\s*\(限刺客[^)]*\)/g, '武學技藝技能')
    .replace(/影子訓練\s*\(限刺客[^)]*\)/g, '暗影修行技能')
    .replace(/攻擊性?靈氣\s*\(限聖騎士[^)]*\)/g, '攻擊靈氣技能')
    .replace(/防禦性?靈氣\s*\(限聖騎士[^)]*\)/g, '防禦靈氣技能')
    // ── 去除前導「+ N-M 」parser 遺留值（如「+ 1-3 標槍和長矛技能 (限亞馬遜)」）──
    .replace(/^\+\s*\d+-\d+\s+(\S+技能)\s*\(限[^)]+\)$/, '$1')
    // 統一 lv / lv. 格式 → 等級（如「機會施展lv5」→「機會施展等級5」）
    .replace(/lv\.?\s*(\d+)/gi, '等級$1')
    // ── 通用：剝掉「(限xxx)」後綴——職業限制由 skill_id 承載
    // 只剝後綴（前面有其他內容）；純 (限xxx) 獨立行保留原字串
    .replace(/^(.+?)\s*\(限[^)]+\)\s*$/, '$1')
    .trim();
}

// ─── 主要匯出 ─────────────────────────────────────────────────────────────────
export function parseItemFile(filepath: string, filename: string): ParsedItem[] {
  const html = fs.readFileSync(filepath, 'utf-8');
  const $ = load(html);
  const { category, tier } = inferMeta(filename);
  const items: ParsedItem[] = [];

  $('table').each((_, table) => {
    const $table = $(table);
    const rows = $table.children('tbody').children('tr').add($table.children('tr') as any);

    rows.each((_, tr) => {
      const $tds = $(tr).children('td');
      if ($tds.length < 2) return;

      const $left = $tds.eq(0);
      const $right = $tds.eq(1);

      let anchor = $left.find('a[name]').first();
      if (!anchor.length) anchor = $right.find('a[name]').first();
      if (!anchor.length) return;

      const name_zh =
        $left.find('b font[color="#808000"]').first().text().trim() ||
        $left.find('font[color="#808000"]').first().text().trim() ||
        anchor.attr('name')?.trim() || '';
      if (!name_zh) return;

      const img = $left.find('img').first();
      const image_path = normalizeImagePath(img.attr('src') ?? '');

      const yellowFont = $left.find('font[color="#FFFF00"]').filter((_, el) => $(el as any).text().trim().length > 0).first();
      const yellowLines = (yellowFont.html() ?? '').split(/<br\s*\/?>/i);
      const name_en = load(yellowLines[0] ?? '')('body').text().trim();
      const base_type_en = load(yellowLines[1] ?? '')('body').text().trim() || null;

      const leftClone = $left.clone();
      leftClone.find('b, font[color="#808000"], font[color="#FFFF00"], img, a').remove();
      const base_type_zh = leftClone.text().replace(/\s+/g, ' ').replace(/　/g, '').trim() || null;

      const rightText = $right.text();
      const levelMatch = rightText.match(/等級需求[：:]\s*(\d+)/) || rightText.match(/須要等級[：:]\s*(\d+)/);
      const level_req = levelMatch ? parseInt(levelMatch[1]) : null;

      const rawLines = parseStatLines($right);
      const stat_entries = rawLines.map((line, i) => lineToEntry(line, i));

      // 舊格式 JSON 維持向下相容
      const legacyStats = rawLines.map((line) => ({
        label: line.segments.map((s) => s.text).join(' ').trim(),
        color: line.segments[0]?.color ?? '#FFFFFF',
      }));

      items.push({
        name_zh, name_en, category, tier, image_path,
        base_type_zh, base_type_en, level_req,
        stats: JSON.stringify(legacyStats),
        stat_entries,
      });
    });
  });

  return items;
}
