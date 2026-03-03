/************************************************************
 * Ajax-safe Content Script (DOM Adapter Layer)
 * Responsibilities:
 *  - Observe dynamic DOM updates (Ajax)
 *  - Convert course / teacher cells into clickable links
 *  - Extract pure string context and forward to Info Panel
 *  - NO business logic, NO data querying
 ************************************************************/

// 加载通用样式CSS文件
function loadCSS(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = chrome.runtime.getURL(href);
  document.head.appendChild(link);
}

// 加载通用样式
loadCSS('css/common.css');

/* =========================
   Utilities
========================= */

/**
 * Safely create a clickable <a> element
 */
function createLink(text, onClick) {
  const a = document.createElement("a");
  a.textContent = text;
  a.href = "javascript:void(0)";
  a.className = "njxk-clickable-link";
  a.addEventListener("click", onClick);
  return a;
}

/* =========================
   Enhanced notifyInfoPanel
========================= */

/**
 * 发送课程/教师信息到 Info Panel，并直接填充 dataStore.js 查询结果
 * payload: {
 *   courseName: string,
 *   teacherName: string,
 *   clickon: "course" | "teacher"
 * }
 */
async function notifyInfoPanel(payload) {
  if (
    !payload ||
    typeof payload.courseName !== "string" ||
    typeof payload.teacherName !== "string" ||
    !["course", "teacher"].includes(payload.clickon)
  ) {
    console.warn("[notifyInfoPanel] Invalid payload", payload);
    return;
  }

  // 查询 dataStore
  const result = await window.__NJUXK_DATA_CACHE__.queryComments(payload);

  // 直接使用 dataStore.js 的输出格式
  const panelPayload = {
    courseName: payload.courseName,
    teacherName: payload.teacherName,
    allTeachers: payload.allTeachers, // 传递完整教师列表
    clickon: payload.clickon,
    primary: result.primary,
    related: result.related,
    message: typeof result.primary === 'string' ? result.primary : (typeof result.related === 'string' ? result.related : ""),
    // 传递鼠标坐标和元素矩形信息用于面板定位
    mouseX: payload.mouseX,
    mouseY: payload.mouseY,
    rect: payload.rect
  };

  window.postMessage(
    {
      source: "course-plugin",
      type: "OPEN_INFO_PANEL",
      payload: panelPayload
    },
    "*"
  );
}

/* =========================
   Row Enhancement Logic
========================= */

function enhanceRow(row) {
  // 幂等保护：Ajax 多次刷新不会重复处理
  if (row.dataset.enhanced === "true") return;
  row.dataset.enhanced = "true";

  const courseCell = row.querySelector("td.kcmc");
  const teacherCell = row.querySelector("td.jsmc");

  if (!courseCell || !teacherCell) return;

  const courseName = courseCell.textContent.trim();
  const rawTeacherText = teacherCell.textContent.trim();

  /* ---------- Course Cell ---------- */
  if (courseName && !courseCell.querySelector("a")) {
    courseCell.textContent = "";
    // 获取完整的教师列表
    const courseTeachers = rawTeacherText
      .split(/[,，]/)
      .map(t => t.trim())
      .filter(Boolean);

    const courseLink = createLink(courseName, (e) => {
      const rect = e.currentTarget && e.currentTarget.getBoundingClientRect();
      console.log('[content-script] Course click:', { courseName, teacherName: courseTeachers.join('，'), allTeachers: courseTeachers, mouseX: e.clientX, mouseY: e.clientY, rect });
      notifyInfoPanel({
        courseName,
        teacherName: courseTeachers.join('，'), // 传入完整的教师列表字符串
        allTeachers: courseTeachers,  // 保留数组格式
        clickon: "course",
        mouseX: e.clientX,
        mouseY: e.clientY,
        rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null
      });
    });
    courseCell.appendChild(courseLink);
  }

  /* ---------- Teacher Cell ---------- */
  if (rawTeacherText && !teacherCell.querySelector("a")) {
    teacherCell.textContent = "";

    // Split by both English and Chinese commas, and filter empty strings
    const teachers = rawTeacherText
      .split(/[,，]/) // Support both English and Chinese commas
      .map(t => t.trim())
      .filter(Boolean);

    teachers.forEach((teacherName, index) => {
      const teacherLink = createLink(teacherName, (e) => {
        const rect = e.currentTarget && e.currentTarget.getBoundingClientRect();
        console.log('[content-script] Teacher click:', { courseName, teacherName, allTeachers: teachers, mouseX: e.clientX, mouseY: e.clientY, rect });
        notifyInfoPanel({
          courseName,
          teacherName,
          allTeachers: teachers, // 传递完整教师列表，用于收藏功能
          clickedTeacher: teacherName, // 标记具体点击的教师
          clickon: "teacher",
          mouseX: e.clientX,
          mouseY: e.clientY,
          rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null
        });
      });

      teacherCell.appendChild(teacherLink);

      // 还原逗号分隔显示
      if (index < teachers.length - 1) {
        teacherCell.appendChild(document.createTextNode(", "));
      }
    });
  }
}

/* =========================
   JXB Item Enhancement Logic
   (for program-course / 选课方案 page)
========================= */

function enhanceJxbItem(jxbItem) {
  // 幂等保护
  if (jxbItem.dataset.enhanced === "true") return;
  jxbItem.dataset.enhanced = "true";

  const titleSpan = jxbItem.querySelector(".head .jxb-title");
  if (!titleSpan) return;

  const teacherName = titleSpan.textContent.trim();
  if (!teacherName) return;

  // 从上层容器获取课程编号
  const container = jxbItem.closest(".course-jxb-container");
  if (!container) return;
  const courseNumber = container.dataset.coursenumber;

  // 用课程编号反查对应的 course-tr 行，获取课程名称
  let courseName = "";
  if (courseNumber) {
    const courseRow = document.querySelector(
      `tr.course-tr[data-coursenumber="${courseNumber}"] td.kcmc`
    );
    if (courseRow) {
      // 取纯文本（可能已经被 enhanceRow 改成了链接）
      const link = courseRow.querySelector("a");
      courseName = link ? link.textContent.trim() : courseRow.textContent.trim();
    }
  }

  // 将教师名替换为可点击链接
  titleSpan.textContent = "";
  const teacherLink = createLink(teacherName, (e) => {
    const rect = e.currentTarget && e.currentTarget.getBoundingClientRect();
    console.log('[content-script] JXB teacher click:', { courseName, teacherName, mouseX: e.clientX, mouseY: e.clientY });
    notifyInfoPanel({
      courseName,
      teacherName,
      allTeachers: [teacherName],
      clickon: "teacher",
      mouseX: e.clientX,
      mouseY: e.clientY,
      rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null
    });
  });
  titleSpan.appendChild(teacherLink);
}

/* =========================
   Table Scan
========================= */

function enhanceCourseTable() {
  // 原有：处理 course-tr 行（课程名+教师名列）
  const rows = document.querySelectorAll(
    "tr.course-tr:not([data-enhanced])"
  );
  rows.forEach(enhanceRow);

  // 新增：处理教学班卡片（选课方案页面）
  const jxbItems = document.querySelectorAll(
    ".course-jxb-container-tr .jxb-item:not([data-enhanced])"
  );
  jxbItems.forEach(enhanceJxbItem);
}

/* =========================
   MutationObserver (Ajax Safe)
========================= */

const observer = new MutationObserver(() => {
  enhanceCourseTable();
});

// 监听 document.body
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// 首次执行（应对 DOM 已经加载完成的情况）
enhanceCourseTable();
