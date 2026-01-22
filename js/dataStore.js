/************************************************************
 * Data Store Module (Fixed Version)
 * Responsibilities:
 *  - Load multi-year JSON data once
 *  - Normalize and cache data for fast query
 *  - Expose query API for content-script.js
 *  - Optimized fuzzy matching for course names
 ************************************************************/

/* =========================
   Config / Constants
========================= */
const DATA_FILES = [
    "normalized_data/2020.json",
    "normalized_data/2021.json",
    "normalized_data/2023.json",
    "normalized_data/2024.json",
    "normalized_data/2025.json"
];

// 简化的模糊匹配配置
const FUZZY_MATCH_CONFIG = {
    enabled: true,
    debug: false
};

/* =========================
   Cache
========================= */
window.__NJUXK_DATA_CACHE__ ||= {
    allRecords: [],      // flat array
    yearIndex: new Map(), // year => [records]
    courseIndex: new Map(), // courseName -> [records] (for faster lookup)
    ready: null           // Promise<void>
};

/* =========================
   Utilities
========================= */

/**
 * 比较两个数组是否具有相同的元素（不考虑顺序）
 */
function arraysEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    return arr1.every(item => arr2.includes(item));
}

/**
 * 优化的课程名称标准化
 */
function simplifyCourseName(courseName) {
    if (!courseName) return '';
    return String(courseName)
        .toLowerCase()
        .trim()
        // 处理中英文括号
        .replace(/[（）]/g, match => match === '（' ? '(' : ')')
        // 处理书名号《》
        .replace(/[《》]/g, '')
        // 统一连接词："与"和"和"
        .replace(/[与和]/g, '与')
        // 统一数字格式
        .replace(/Ⅰ/g, '1').replace(/Ⅱ/g, '2').replace(/Ⅲ/g, '3')
        .replace(/[１-９]/g, match => String.fromCharCode(match.charCodeAt(0) - 0xfee0))
        // 新增：处理英文字母I, II, III转换为数字
        .replace(/\bI{1,3}\b/g, match => {
            const map = { 'I': '1', 'II': '2', 'III': '3' };
            return map[match] || match;
        })
        // 移除括号内容
        .replace(/\s*\([^)]*\)\s*/g, '')
        .replace(/\s*（[^）]*）\s*/g, '')
        // 移除书名号内容但保留核心内容（更精细的处理）
        .replace(/《([^》]*)》/g, '$1')
        // 移除空格和特殊符号
        .replace(/[\s　]/g, '')
        // 处理课程名称后的数字后缀
        .replace(/(\D)(\d+)$/g, '$1')
        // 移除常见的课程修饰词
        .replace(/(阅读|导读|赏析|研究|概论|入门)$/g, '')
        .trim();
}

/**
 * 创建模糊匹配正则模式
 */
function createFuzzyPattern(name) {
    if (!name || name.length < 2) return null;

    // 将每个字符用.*连接，允许中间插入任意字符
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // 转义特殊字符
    const pattern = escaped.split('').join('.*?'); // 使用非贪婪匹配

    try {
        return new RegExp(pattern, 'i'); // 忽略大小写
    } catch (e) {
        return null;
    }
}

/**
 * 模糊匹配检查（使用正则模式）
 */
function fuzzyRegexMatch(name1, name2) {
    const pattern1 = createFuzzyPattern(name1);
    const pattern2 = createFuzzyPattern(name2);

    if (!pattern1 || !pattern2) return false;

    // 双向匹配：任意一个匹配另一个即可
    const match1 = pattern1.test(name2);
    const match2 = pattern2.test(name1);

    return match1 || match2;
}

/**
 * 优化的课程匹配检查
 */
function isCoursesMatch(courseName1, courseName2) {
    const name1 = String(courseName1).trim();
    const name2 = String(courseName2).trim();

    // 精确匹配
    if (name1 === name2) {
        return { isMatch: true, score: 1.0, type: 'exact' };
    }

    if (!FUZZY_MATCH_CONFIG.enabled) {
        return { isMatch: false, score: 0, type: 'none' };
    }

    // 简化后匹配
    const simple1 = simplifyCourseName(name1);
    const simple2 = simplifyCourseName(name2);

    // 精确匹配简化后的名称
    if (simple1 === simple2) {
        return { isMatch: true, score: 1.0, type: 'normalized' };
    }

    // 包含匹配
    if (simple1.length >= 2 && simple2.length >= 2) {
        const shorter = simple1.length <= simple2.length ? simple1 : simple2;
        const longer = simple1.length > simple2.length ? simple1 : simple2;

        if (longer.includes(shorter)) {
            const ratio = shorter.length / longer.length;
            if (ratio >= 0.6) {
                return { isMatch: true, score: ratio, type: 'contains' };
            }
        }
    }

    // 正则模糊匹配
    if (simple1.length >= 2 && simple2.length >= 2) {
        if (fuzzyRegexMatch(simple1, simple2)) {
            // 计算相似度（基于长度比例）
            const similarity = Math.min(simple1.length, simple2.length) / Math.max(simple1.length, simple2.length);
            if (similarity >= 0.6) {
                return { isMatch: true, score: similarity, type: 'regex-fuzzy' };
            }
        }
    }

    return { isMatch: false, score: 0, type: 'none' };
}

/**
 * Normalize a single raw record
 * Returns null if invalid
 */
function normalizeRecord(raw, year) {
    if (!raw || typeof raw !== "object") return null;

    // Support two possible input shapes:
    // 1) normalized_data format: { courseName: string, teachers: [..], comments: [{text}] }
    // 2) legacy raw format: { "课程名称": "..", "教师": "a,b", "评价_*": "..." }

    let courseName = '';
    let teacherNames = [];
    let comments = [];

    if (raw.courseName && Array.isArray(raw.teachers) && Array.isArray(raw.comments)) {
        // normalized_data shape
        courseName = String(raw.courseName || '').trim();
        // 处理 teachers 数组中可能包含逗号分隔字符串的情况
        teacherNames = raw.teachers
            .flatMap(t => String(t || '').split(/[,，]/).map(name => name.trim()))
            .filter(Boolean);
        comments = raw.comments
            .map(c => (c && (c.text || c.comment)) ? String(c.text || c.comment).trim() : '')
            .filter(Boolean)
            .map(text => ({ text }));
    } else {
        // legacy shape
        courseName = (raw["课程名称"] || "").trim();
        const teacherRaw = raw["教师"] || "";
        teacherNames = teacherRaw
            .split(",")
            .map(t => t.trim())
            .filter(Boolean);

        const collectedComments = Object.keys(raw)
            .filter(key => key.startsWith("评价_"))
            .map(key => raw[key])
            .filter(Boolean)
            .map(text => ({ text: String(text).trim() }))
            .filter(c => c.text);

        comments = collectedComments;
    }

    if (!courseName || teacherNames.length === 0) return null;

    if (!Array.isArray(comments) || comments.length === 0) return null;

    // Produce one record per comment
    return comments.map((c, index) => ({
        courseName,
        teacherNames,
        comment: c.text,
        source_year: year,
        // 简化去重键
        __key: `${year}|${courseName}|${teacherNames.join(",")}|${index}`
    }));
}

/**
 * Load a single JSON file
 */
async function loadDataFile(path) {
    try {
        const res = await fetch(chrome.runtime.getURL(path));
        const json = await res.json();
        return json;
    } catch (e) {
        console.error(`[dataStore] Failed to load ${path}:`, e);
        return [];
    }
}

/* =========================
   Initialization
========================= */
window.__NJUXK_DATA_CACHE__.ready = (async () => {
    const loadStartTime = performance.now();

    for (const file of DATA_FILES) {
        const yearMatch = file.match(/(\d{4})\.json$/);
        if (!yearMatch) continue;
        const year = parseInt(yearMatch[1], 10);

        const rawData = await loadDataFile(file);
        const normalized = rawData
            .map(r => normalizeRecord(r, year))
            .filter(Boolean)
            .flat();

        if (!window.__NJUXK_DATA_CACHE__.yearIndex.has(year)) {
            window.__NJUXK_DATA_CACHE__.yearIndex.set(year, []);
        }
        window.__NJUXK_DATA_CACHE__.yearIndex.get(year).push(...normalized);
        window.__NJUXK_DATA_CACHE__.allRecords.push(...normalized);

        // 构建课程索引以提高查询性能
        for (const record of normalized) {
            const courseName = record.courseName;
            if (!window.__NJUXK_DATA_CACHE__.courseIndex.has(courseName)) {
                window.__NJUXK_DATA_CACHE__.courseIndex.set(courseName, []);
            }
            window.__NJUXK_DATA_CACHE__.courseIndex.get(courseName).push(record);
        }
    }

    const loadTime = performance.now() - loadStartTime;
    const courseCount = window.__NJUXK_DATA_CACHE__.courseIndex.size;
    console.log(`[NJUXK] Data loaded in ${Math.round(loadTime)}ms, ${window.__NJUXK_DATA_CACHE__.allRecords.length} records, ${courseCount} unique courses`);
})();

/* =========================
   Query API
========================= */

/**
 * Query comments with new logic
 */
async function queryComments(payload) {
    await window.__NJUXK_DATA_CACHE__.ready;

    if (
        !payload ||
        typeof payload.courseName !== "string" ||
        typeof payload.teacherName !== "string" ||
        !["course", "teacher"].includes(payload.clickon)
    ) {
        return { primary: [], related: [] };
    }

    const { courseName, teacherName, clickon, allTeachers } = payload;
    const qCourse = courseName.trim();
    const qTeacher = teacherName.trim();
    const qAllTeachers = Array.isArray(allTeachers) ? allTeachers.map(t => String(t).trim()) : [qTeacher];

    const queryStartTime = performance.now();
    const primary = [];
    const related = [];

    if (clickon === "course") {
        // 点击课程：查找所有相似的课程评论
        for (const [dbCourseName, records] of window.__NJUXK_DATA_CACHE__.courseIndex.entries()) {
            const courseMatch = isCoursesMatch(dbCourseName, qCourse);

            if (courseMatch.isMatch) {
                for (const rec of records) {
                    const recTeachers = Array.isArray(rec.teacherNames) ? rec.teacherNames.map(t => String(t).trim()) : [];
                    const recTeachersSet = new Set(recTeachers);
                    const qTeachersSet = new Set(qAllTeachers);

                    // 检查教师列表关系
                    const isEqual = recTeachersSet.size === qTeachersSet.size && [...recTeachersSet].every(t => qTeachersSet.has(t));
                    const isSubset = [...recTeachersSet].every(t => qTeachersSet.has(t));
                    const hasOverlap = [...recTeachersSet].some(t => qTeachersSet.has(t));

                    if (courseMatch.score === 1.0) {
                        // 课程100%匹配的情况
                        if (isEqual) {
                            // 教师列表完全相同 -> primary，无diffinfo
                            primary.push({ ...rec, _matchInfo: courseMatch });
                        } else if (isSubset && recTeachersSet.size > 0) {
                            // 评论教师列表是传入教师列表的子集 -> primary，显示教师diffinfo
                            primary.push({ ...rec, _matchInfo: courseMatch, _teacherDiff: recTeachers });
                        } else {
                            // 其他情况 -> related，显示教师diffinfo（移除hasOverlap限制）
                            related.push({ ...rec, _matchInfo: courseMatch, _teacherDiff: recTeachers, relation: "same-course-different-teachers" });
                        }
                    } else {
                        // 课程非100%匹配：normalized 1.0, contains 0.6+, regex-fuzzy 0.6+
                        const shouldInclude = (courseMatch.type === 'normalized' && courseMatch.score === 1.0) ||
                            (courseMatch.type === 'contains' && courseMatch.score >= 0.6) ||
                            (courseMatch.type === 'regex-fuzzy' && courseMatch.score >= 0.6);

                        if (shouldInclude) {
                            // 满足相似度要求 -> related（移除hasOverlap限制）
                            if (isEqual) {
                                // 教师列表完全相同，只显示课程名称差异
                                related.push({ ...rec, _matchInfo: courseMatch, _courseDiff: rec.courseName, relation: "similar-course-same-teachers" });
                            } else {
                                // 教师列表不同，显示完整教师列表和课程名称
                                related.push({ ...rec, _matchInfo: courseMatch, _courseDiff: rec.courseName, _teacherDiff: recTeachers, relation: "similar-course-different-teachers" });
                            }
                        }
                    }
                }
            }
        }
    } else if (clickon === "teacher") {
        // 点击教师：查找所有包含该教师的评论
        for (const [dbCourseName, records] of window.__NJUXK_DATA_CACHE__.courseIndex.entries()) {
            const courseMatch = isCoursesMatch(dbCourseName, qCourse);

            for (const rec of records) {
                const recTeachers = Array.isArray(rec.teacherNames) ? rec.teacherNames.map(t => String(t).trim()) : [];

                // 只处理包含该教师的评论
                if (recTeachers.includes(qTeacher)) {
                    if (courseMatch.isMatch && courseMatch.score === 1.0) {
                        // 课程相似度100% -> primary，无diffinfo
                        primary.push({ ...rec, _matchInfo: courseMatch });
                    } else {
                        // 其他课程 -> related，显示课程diffinfo
                        related.push({ ...rec, _courseDiff: rec.courseName, relation: "other-course" });
                    }
                }
            }
        }
    }

    const queryTime = performance.now() - queryStartTime;
    if (FUZZY_MATCH_CONFIG.debug) {
        console.log(`[Query] ${Math.round(queryTime)}ms, primary: ${primary.length}, related: ${related.length}`);
    }

    return {
        primary: primary.length ? primary : "未查询到相关评论",
        related: related.length ? related : "未查询到相关评论"
    };
}

/* =========================
   Expose API
========================= */
window.__NJUXK_DATA_CACHE__.queryComments = queryComments;

// 暴露配置和测试函数用于调试
window.__NJUXK_DATA_CACHE__.fuzzyMatchConfig = FUZZY_MATCH_CONFIG;
window.__NJUXK_DATA_CACHE__.testCourseMatch = function (name1, name2) {
    const result = isCoursesMatch(name1, name2);
    console.log(`Course match test:`, {
        name1, name2,
        simplified1: simplifyCourseName(name1),
        simplified2: simplifyCourseName(name2),
        result
    });
    return result;
};

// 新增调试功能
window.__NJUXK_DATA_CACHE__.testQuery = function (courseName, teacherName, clickon, allTeachers) {
    const payload = { courseName, teacherName, clickon, allTeachers };
    console.log('测试查询:', payload);
    return queryComments(payload);
};

window.__NJUXK_DATA_CACHE__.debugCourseNames = function (pattern) {
    const matches = [];
    for (const [courseName] of window.__NJUXK_DATA_CACHE__.courseIndex.entries()) {
        if (courseName.includes(pattern)) {
            matches.push({
                original: courseName,
                simplified: simplifyCourseName(courseName)
            });
        }
    }
    console.log(`包含"${pattern}"的课程:`, matches);
    return matches;
};

window.__NJUXK_DATA_CACHE__.simplifyCourseName = simplifyCourseName;
