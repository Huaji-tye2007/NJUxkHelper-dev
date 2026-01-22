/* panel-inject.js: Chrome extension panel functionality (cleaned version) */
(function () {
    console.log('[Panel] Module loading...');

    // 加载面板样式CSS文件
    function loadCSS(href) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = chrome.runtime.getURL(href);
        document.head.appendChild(link);
    }

    // 加载样式文件
    loadCSS('css/panel.css');

    // Panel script (IIFE)
    (function () {
        let panel = null;
        let cleanupHandlers = null;
        let store = { centerX: null, centerY: null, initScrollY: null, initScrollX: null, courseName: null, teacherName: null, allTeachers: null };

        function createPanel() {
            console.log('[Panel] Creating panel...');
            if (panel) {
                console.log('[Panel] Panel already exists, returning existing');
                return panel;
            }
            panel = document.createElement('div');
            panel.className = 'njxk-panel';
            panel.setAttribute('role', 'dialog');
            panel.innerHTML = `
        <div class="njxk-header">
          <div class="njxk-tabs" role="tablist">
            <button type="button" data-tab="primary" class="njxk-active">评论</button>
            <button type="button" data-tab="related">相关评论</button>
          </div>
          <div class="njxk-header-actions">
            <button type="button" class="njxk-favorite" aria-label="收藏">☆</button>
            <button type="button" class="njxk-close" aria-label="关闭">×</button>
          </div>
        </div>
        <div class="njxk-content">
          <div class="njxk-list" data-type="primary"></div>
          <div class="njxk-list" data-type="related" style="display:none"></div>
        </div>
      `;
            document.body.appendChild(panel);
            console.log('[Panel] Panel HTML created and added to DOM');
            attachLocalHandlers(panel);
            return panel;
        }

        function attachLocalHandlers(panelEl) {
            console.log('[Panel] Attaching local handlers to panel...');
            const tabs = panelEl.querySelectorAll('.njxk-tabs button');
            tabs.forEach(btn => btn.addEventListener('click', (e) => {
                const t = e.currentTarget.getAttribute('data-tab');
                switchTab(t);
            }));

            const favoriteBtn = panelEl.querySelector('.njxk-favorite');
            const closeBtn = panelEl.querySelector('.njxk-close');
            console.log('[Panel] Found buttons:', { favoriteBtn: !!favoriteBtn, closeBtn: !!closeBtn });

            // 使用外部收藏模块处理收藏功能
            console.log('[Panel] Checking for NJUXKFavorites...', !!window.NJUXKFavorites);
            if (favoriteBtn && window.NJUXKFavorites) {
                // 对于点击教师的情况，使用完整的教师列表进行收藏
                const teachersForFavorite = store.allTeachers ? store.allTeachers.join('，') : store.teacherName;
                console.log('[Panel] Attaching favorite functionality with:', store.courseName, teachersForFavorite);
                window.NJUXKFavorites.attachFavoriteButton(panelEl, store.courseName, teachersForFavorite);
            } else {
                console.warn('[Panel] Cannot attach favorite button:', {
                    favoriteBtn: !!favoriteBtn,
                    NJUXKFavorites: !!window.NJUXKFavorites,
                    courseName: store.courseName,
                    teacherName: store.teacherName
                });
            }

            closeBtn.addEventListener('click', closePanel);
            console.log('[Panel] Local handlers attached successfully');
        }

        function switchTab(type) {
            if (!panel) return;
            const tabs = panel.querySelectorAll('.njxk-tabs button');
            const lists = panel.querySelectorAll('.njxk-list');
            tabs.forEach(btn => {
                const active = btn.getAttribute('data-tab') === type;
                btn.classList.toggle('njxk-active', active);
            });
            lists.forEach(list => {
                const visible = list.getAttribute('data-type') === type;
                list.style.display = visible ? 'block' : 'none';
            });
        }

        function renderPayload(payload) {
            createPanel();
            const primaryList = panel.querySelector('.njxk-list[data-type="primary"]');
            const relatedList = panel.querySelector('.njxk-list[data-type="related"]');

            primaryList.innerHTML = '';
            relatedList.innerHTML = '';

            // 渲染主要评论
            if (payload.primary && Array.isArray(payload.primary) && payload.primary.length > 0) {
                payload.primary.forEach(item => {
                    const card = renderCard(item, payload.courseName, payload.teacherName);
                    primaryList.appendChild(card);
                });
            } else {
                const message = typeof payload.primary === 'string' ? payload.primary : '暂无评论数据';
                primaryList.innerHTML = `<div class="njxk-empty">${message}</div>`;
            }

            // 渲染相关评论
            if (payload.related && Array.isArray(payload.related) && payload.related.length > 0) {
                payload.related.forEach(item => {
                    const card = renderCard(item, payload.courseName, payload.teacherName);
                    relatedList.appendChild(card);
                });
            } else {
                const message = typeof payload.related === 'string' ? payload.related : '暂无相关评论';
                relatedList.innerHTML = `<div class="njxk-empty">${message}</div>`;
            }

            // 更新收藏按钮状态
            console.log('[Panel] Checking for favorites module to update button...');
            if (window.NJUXKFavorites && payload.courseName) {
                const teachersForFavorite = payload.allTeachers ? payload.allTeachers.join('，') : payload.teacherName;
                console.log('[Panel] Updating favorite button for:', payload.courseName, teachersForFavorite);
                setTimeout(() => {
                    window.NJUXKFavorites.attachFavoriteButton(panel, payload.courseName, teachersForFavorite);
                }, 100);
            } else {
                console.warn('[Panel] Cannot update favorite button:', {
                    NJUXKFavorites: !!window.NJUXKFavorites,
                    courseName: payload.courseName,
                    teacherName: payload.teacherName
                });
            }
        }

        function renderCard(item, currentCourseName, currentTeacherName) {
            const card = document.createElement('div');
            card.className = 'njxk-card';

            const year = document.createElement('div');
            year.className = 'njxk-card-year';
            year.textContent = item && item.source_year ? `${item.source_year}` : '';

            // 检查是否显示差异信息（基于新的逻辑）
            let diffElement = null;
            const diffInfo = [];

            // 根据新的标记字段显示差异信息
            if (item._courseDiff) {
                // 显示课程差异
                diffInfo.push(`课程: ${item._courseDiff}`);
            }
            if (item._teacherDiff && Array.isArray(item._teacherDiff)) {
                // 显示教师差异
                diffInfo.push(`教师: ${item._teacherDiff.join('、')}`);
            }

            // 如果有差异信息，创建diff元素
            if (diffInfo.length > 0) {
                diffElement = document.createElement('div');
                diffElement.className = 'njxk-card-diff';
                diffElement.textContent = diffInfo.join(' | ');
            }

            const text = document.createElement('div');
            text.className = 'njxk-card-text';
            text.textContent = item && item.comment ? item.comment : '';

            // 添加匹配信息显示
            let matchElement = null;
            if (item && item._matchInfo && item._matchInfo.type !== 'exact') {
                matchElement = document.createElement('div');
                matchElement.className = `njxk-card-match njxk-match-${item._matchInfo.type}`;
                const matchTexts = {
                    'normalized': '规范化匹配',
                    'contains': '包含匹配',
                    'regex-fuzzy': '正则模糊匹配',
                    'similarity': '相似匹配'
                };
                const score = Math.round(item._matchInfo.score * 100);
                matchElement.textContent = `${matchTexts[item._matchInfo.type] || '模糊匹配'} (${score}%)`;
            }

            // 按正确顺序添加元素：year -> diff -> text -> match
            card.appendChild(year);
            if (diffElement) {
                card.appendChild(diffElement);
            }
            card.appendChild(text);
            if (matchElement) {
                card.appendChild(matchElement);
            }

            return card;
        }

        function positionPanel(payload) {
            if (!panel) return;

            const pad = 12;
            const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
            const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
            let left = 0, top = 0;

            if (typeof payload.mouseX === 'number' && typeof payload.mouseY === 'number') {
                left = payload.mouseX + pad;
                top = payload.mouseY - 10;
            } else if (payload.rect) {
                left = (payload.rect.right || payload.rect.left) + pad;
                top = (payload.rect.top || 0);
            } else {
                left = 20; top = 80;
            }

            // 先设置初始位置以获取准确尺寸
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';

            const rect = panel.getBoundingClientRect();
            const panelW = rect.width || 360;
            const panelH = rect.height || (vh * 0.6);

            // 边界检测和调整
            if (left + panelW > vw) {
                if (payload.mouseX) {
                    left = payload.mouseX - panelW - pad;
                } else {
                    left = Math.max(8, vw - panelW - 8);
                }
            }
            if (top + panelH > vh) {
                top = Math.max(8, vh - panelH - 8);
            }

            // 确保不超出左上边界
            left = Math.max(8, left);
            top = Math.max(8, top);

            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
        }

        function closePanel() {
            if (!panel) return;
            if (cleanupHandlers) cleanupHandlers();
            panel.remove();
            panel = null;
            cleanupHandlers = null;
            store = { centerX: null, centerY: null, initScrollY: null, initScrollX: null, courseName: null, teacherName: null, allTeachers: null };
        }

        function attachGlobalCloseHandlers(payload) {
            const panelEl = panel;
            function onDocClick(e) {
                const path = (e.composedPath && e.composedPath()) || (e.path) || [];
                const clickedInside = path.length ? path.includes(panelEl) : panelEl.contains(e.target);
                if (clickedInside) return;
                closePanel();
            }
            function onKey(e) { if (e.key === 'Escape') closePanel(); }
            document.addEventListener('click', onDocClick, true);
            document.addEventListener('keydown', onKey, true);

            const initScrollY = window.scrollY;
            const initScrollX = window.scrollX;
            store.initScrollY = initScrollY;
            store.initScrollX = initScrollX;

            function onScrollResize() {
                if (Math.abs(window.scrollY - initScrollY) > 80 || Math.abs(window.scrollX - initScrollX) > 80) {
                    closePanel();
                    return;
                }
                if (store.centerX != null && store.centerY != null) {
                    const el = document.elementFromPoint(store.centerX, store.centerY);
                    if (!el) {
                        closePanel();
                        return;
                    }
                    try {
                        const txt = (el.textContent || '').trim();
                        if (store.courseName && !txt.includes(store.courseName) && store.teacherName && !txt.includes(store.teacherName)) {
                            closePanel();
                        }
                    } catch (e) { }
                }
            }
            window.addEventListener('scroll', onScrollResize, true);
            window.addEventListener('resize', onScrollResize);

            return function () {
                document.removeEventListener('click', onDocClick, true);
                document.removeEventListener('keydown', onKey, true);
                window.removeEventListener('scroll', onScrollResize, true);
                window.removeEventListener('resize', onScrollResize);
            };
        }

        function onMessage(e) {
            try {
                if (!e.data || e.data.source !== 'course-plugin' || e.data.type !== 'OPEN_INFO_PANEL') return;
                const payload = e.data.payload || {};

                if (!payload) return;
                store.courseName = payload.courseName || null;
                store.teacherName = payload.teacherName || null;
                store.allTeachers = payload.allTeachers || null;

                if (payload.rect) {
                    const cx = (payload.rect.left || 0) + ((payload.rect.width || 0) / 2);
                    const cy = (payload.rect.top || 0) + ((payload.rect.height || 0) / 2);
                    store.centerX = Math.round(cx);
                    store.centerY = Math.round(cy);
                } else if (typeof payload.mouseX === 'number' && typeof payload.mouseY === 'number') {
                    store.centerX = Math.round(payload.mouseX);
                    store.centerY = Math.round(payload.mouseY);
                } else {
                    store.centerX = null;
                    store.centerY = null;
                }

                renderPayload(payload);
                positionPanel(payload);

                if (cleanupHandlers) cleanupHandlers();
                cleanupHandlers = attachGlobalCloseHandlers(payload);
            } catch (err) {
                console.error('njxk panel error', err);
            }
        }

        window.addEventListener('message', onMessage);
        window.__NJXK_PANEL__ = {
            open: (p) => {
                window.postMessage({ source: 'course-plugin', type: 'OPEN_INFO_PANEL', payload: p }, '*');
            }
        };
    })();
})();