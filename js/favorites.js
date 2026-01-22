/* favorites.js: 收藏功能模块 */
(function () {
    'use strict';

    console.log('[Favorites] Module loading...');

    // 存储键
    const FAVORITES_KEY = 'njuxk-favorites';

    // 全局变量
    let favoritesPanel = null;

    // 加载收藏夹样式CSS文件
    function loadCSS(href) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = chrome.runtime.getURL(href);
        document.head.appendChild(link);
    }

    // 加载样式文件
    console.log('[Favorites] Loading CSS...');
    loadCSS('css/favorites.css');
    console.log('[Favorites] CSS loaded successfully');

    /* =========================
       核心数据管理功能
    ========================= */

    function getFavorites() {
        try {
            const data = localStorage.getItem(FAVORITES_KEY);
            let favorites = data ? JSON.parse(data) : [];
            console.log('[Favorites] Getting favorites:', favorites);

            // 数据迁移：将旧格式转换为新格式
            let needMigration = false;
            const migratedFavorites = new Map();

            favorites.forEach(fav => {
                if (fav.teacherName && !fav.teachers) {
                    // 旧格式数据
                    needMigration = true;
                    const courseName = fav.courseName;
                    if (migratedFavorites.has(courseName)) {
                        const existing = migratedFavorites.get(courseName);
                        if (!existing.teachers.includes(fav.teacherName)) {
                            existing.teachers.push(fav.teacherName);
                        }
                    } else {
                        migratedFavorites.set(courseName, {
                            courseName,
                            teachers: [fav.teacherName],
                            addedAt: fav.addedAt || new Date().toISOString()
                        });
                    }
                } else if (fav.teachers) {
                    // 新格式数据
                    const courseName = fav.courseName;
                    if (migratedFavorites.has(courseName)) {
                        const existing = migratedFavorites.get(courseName);
                        fav.teachers.forEach(teacher => {
                            if (!existing.teachers.includes(teacher)) {
                                existing.teachers.push(teacher);
                            }
                        });
                    } else {
                        migratedFavorites.set(courseName, {
                            courseName,
                            teachers: [...fav.teachers],
                            addedAt: fav.addedAt || new Date().toISOString(),
                            updatedAt: fav.updatedAt
                        });
                    }
                }
            });

            if (needMigration) {
                favorites = Array.from(migratedFavorites.values());
                // 排序每个课程的教师列表
                favorites.forEach(fav => {
                    if (fav.teachers) {
                        fav.teachers.sort();
                    }
                });
                localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
                console.log('[Favorites] Migrated data to new format:', favorites);
            }

            return favorites;
        } catch (e) {
            console.error('[Favorites] Failed to get favorites:', e);
            return [];
        }
    }

    function saveFavorites(favorites) {
        try {
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
            return true;
        } catch (e) {
            console.error('Failed to save favorites:', e);
            return false;
        }
    }

    function isFavorited(courseName, teacherName) {
        if (!courseName) return false;
        const favorites = getFavorites();
        const courseEntry = favorites.find(f => f.courseName === courseName);
        if (!courseEntry) return false;

        // 如果没有指定教师名，只要课程存在就返回true
        if (!teacherName) return true;

        // 检查教师是否在教师列表中
        return courseEntry.teachers && courseEntry.teachers.includes(teacherName);
    }

    function addToFavorites(courseName, teacherName) {
        if (!courseName || !teacherName) return false;

        const favorites = getFavorites();
        const existingIndex = favorites.findIndex(f => f.courseName === courseName);

        if (existingIndex >= 0) {
            // 课程已存在，添加教师到列表中
            const existing = favorites[existingIndex];
            if (!existing.teachers.includes(teacherName)) {
                existing.teachers.push(teacherName);
                existing.teachers.sort(); // 排序教师列表
                existing.updatedAt = new Date().toISOString();
                saveFavorites(favorites);
                updateFavoritesPanel();
                console.log('Added teacher to existing course favorites:', courseName, teacherName);
                return true;
            }
            return false; // 教师已经在列表中
        } else {
            // 新课程，创建新记录
            favorites.push({
                courseName,
                teachers: [teacherName],
                addedAt: new Date().toISOString()
            });
            saveFavorites(favorites);
            updateFavoritesPanel();
            console.log('Added new course to favorites:', courseName, teacherName);
            return true;
        }
    }

    function removeFromFavorites(courseName, teacherName) {
        const favorites = getFavorites();
        const existingIndex = favorites.findIndex(f => f.courseName === courseName);

        if (existingIndex >= 0) {
            const existing = favorites[existingIndex];
            if (teacherName && existing.teachers.includes(teacherName)) {
                // 移除特定教师
                existing.teachers = existing.teachers.filter(t => t !== teacherName);

                if (existing.teachers.length === 0) {
                    // 没有教师了，删除整个课程
                    favorites.splice(existingIndex, 1);
                } else {
                    existing.updatedAt = new Date().toISOString();
                }

                saveFavorites(favorites);
                updateFavoritesPanel();
                console.log('Removed teacher from favorites:', courseName, teacherName);
                return true;
            } else if (!teacherName) {
                // 移除整个课程
                favorites.splice(existingIndex, 1);
                saveFavorites(favorites);
                updateFavoritesPanel();
                console.log('Removed entire course from favorites:', courseName);
                return true;
            }
        }
        return false;
    }

    function toggleFavorite(courseName, teacherName) {
        if (!courseName || !teacherName) return false;

        const favorited = isFavorited(courseName, teacherName);
        if (favorited) {
            return removeFromFavorites(courseName, teacherName);
        } else {
            return addToFavorites(courseName, teacherName);
        }
    }

    /* =========================
       收藏夹面板UI
    ========================= */

    function createFavoritesPanel() {
        if (favoritesPanel) {
            console.log('[Favorites] Panel already exists, returning existing');
            return favoritesPanel;
        }

        console.log('[Favorites] Creating new favorites panel...');
        favoritesPanel = document.createElement('div');
        favoritesPanel.className = 'njxk-favorites-panel';
        favoritesPanel.innerHTML = `
            <div class="njxk-favorites-header">
                <div class="njxk-favorites-title">
                    <span>★</span> 我的收藏
                </div>
                <button class="njxk-favorites-toggle" type="button">−</button>
            </div>
            <div class="njxk-favorites-content">
                <div class="njxk-favorites-empty">暂无收藏</div>
            </div>
        `;

        console.log('[Favorites] Appending panel to document body...');
        document.body.appendChild(favoritesPanel);
        console.log('[Favorites] Panel added to DOM');

        attachFavoritesPanelHandlers();
        updateFavoritesPanel();

        console.log('[Favorites] Panel created successfully, element:', favoritesPanel);
        return favoritesPanel;
    }

    function attachFavoritesPanelHandlers() {
        if (!favoritesPanel) return;

        const header = favoritesPanel.querySelector('.njxk-favorites-header');
        const toggle = favoritesPanel.querySelector('.njxk-favorites-toggle');
        const content = favoritesPanel.querySelector('.njxk-favorites-content');

        // 拖拽功能
        let isDragging = false;
        let offsetX, offsetY;

        header.addEventListener('mousedown', (e) => {
            if (e.target === toggle) return;
            isDragging = true;

            // 获取面板当前位置
            const rect = favoritesPanel.getBoundingClientRect();

            // 计算鼠标相对于面板的偏移
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;

            // 如果面板使用的是transform，先转换为left/top
            const computedStyle = window.getComputedStyle(favoritesPanel);
            if (computedStyle.transform && computedStyle.transform !== 'none') {
                favoritesPanel.style.left = rect.left + 'px';
                favoritesPanel.style.top = rect.top + 'px';
                favoritesPanel.style.right = 'auto';
                favoritesPanel.style.transform = 'none';
            }

            // 添加拖拽状态类，禁用过渡动画
            favoritesPanel.classList.add('dragging');

            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', stopDrag);
            e.preventDefault();
        });

        function onDrag(e) {
            if (!isDragging) return;

            // 计算新位置
            const x = e.clientX - offsetX;
            const y = e.clientY - offsetY;
            const maxX = window.innerWidth - favoritesPanel.offsetWidth;
            const maxY = window.innerHeight - favoritesPanel.offsetHeight;

            const constrainedX = Math.max(0, Math.min(x, maxX));
            const constrainedY = Math.max(0, Math.min(y, maxY));

            // 直接设置left和top位置
            favoritesPanel.style.left = constrainedX + 'px';
            favoritesPanel.style.top = constrainedY + 'px';
            favoritesPanel.style.right = 'auto';
        }

        function stopDrag() {
            isDragging = false;
            // 移除拖拽状态类
            favoritesPanel.classList.remove('dragging');
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', stopDrag);
        }

        // 展开/收起功能
        toggle.addEventListener('click', () => {
            const isCollapsed = content.classList.contains('collapsed');
            content.classList.toggle('collapsed', !isCollapsed);
            toggle.textContent = isCollapsed ? '−' : '+';
        });
    }

    function updateFavoritesPanel() {
        if (!favoritesPanel) return;

        const content = favoritesPanel.querySelector('.njxk-favorites-content');
        const favorites = getFavorites();

        console.log('Updating favorites panel, count:', favorites.length);

        if (favorites.length === 0) {
            content.innerHTML = '<div class="njxk-favorites-empty">暂无收藏</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'njxk-favorites-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>课程名称</th>
                    <th>教师</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        favorites.forEach((favorite, index) => {
            const teachersText = favorite.teachers ? favorite.teachers.join('、') : (favorite.teacherName || '');
            const row = document.createElement('tr');
            row.innerHTML = `
                <td title="${favorite.courseName}" class="njxk-favorite-course">${favorite.courseName}</td>
                <td title="${teachersText}" class="njxk-favorite-teacher">${teachersText}</td>
                <td>
                    <button class="njxk-favorites-remove" data-course="${favorite.courseName}">×</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        content.innerHTML = '';
        content.appendChild(table);

        // 绑定事件
        content.addEventListener('click', handleFavoritesClick);
    }

    function handleFavoritesClick(e) {
        if (e.target.classList.contains('njxk-favorites-remove')) {
            const courseName = e.target.dataset.course;
            if (courseName) {
                removeFromFavorites(courseName); // 移除整个课程
                // 通知主面板更新收藏按钮状态
                if (window.updateFavoriteButton) {
                    window.updateFavoriteButton();
                }
            }
        }
    }

    /* =========================
       收藏按钮管理
    ========================= */

    function updateFavoriteButton(courseName, teacherName) {
        const panel = document.querySelector('.njxk-panel');
        if (!panel || !courseName) return;

        const favoriteBtn = panel.querySelector('.njxk-favorite');
        if (favoriteBtn) {
            // 检查课程是否被收藏（不需要检查特定教师）
            const favorited = isFavorited(courseName);
            favoriteBtn.textContent = favorited ? '★' : '☆';
            favoriteBtn.classList.toggle('favorited', favorited);
            console.log('Updated favorite button:', courseName, favorited);
        }
    }

    function attachFavoriteButton(panel, courseName, teacherName) {
        console.log('[Favorites] Attaching favorite button to panel:', { panel, courseName, teacherName });
        if (!panel) {
            console.error('[Favorites] No panel provided to attachFavoriteButton');
            return;
        }

        const favoriteBtn = panel.querySelector('.njxk-favorite');
        console.log('[Favorites] Found favorite button:', favoriteBtn);

        if (favoriteBtn && courseName && teacherName) {
            console.log('[Favorites] Setting up favorite button for:', courseName, teacherName);
            // 移除旧的事件监听器（如果有的话）
            const newBtn = favoriteBtn.cloneNode(true);
            favoriteBtn.parentNode.replaceChild(newBtn, favoriteBtn);

            // 添加新的事件监听器
            newBtn.addEventListener('click', () => {
                console.log('[Favorites] Favorite button clicked:', courseName, teacherName);
                toggleFavorite(courseName, teacherName);
                updateFavoriteButton(courseName, teacherName);
            });

            // 更新按钮状态
            updateFavoriteButton(courseName, teacherName);
        } else {
            console.warn('[Favorites] Cannot attach favorite button - missing elements or data:', {
                favoriteBtn: !!favoriteBtn,
                courseName: !!courseName,
                teacherName: !!teacherName
            });
        }
    }

    /* =========================
       初始化和公共API
    ========================= */

    // 页面加载完成后创建收藏夹面板
    function init() {
        console.log('[Favorites] Initializing favorites module...');

        // 延迟创建，确保页面已加载
        setTimeout(() => {
            console.log('[Favorites] Creating favorites panel after delay...');
            createFavoritesPanel();
        }, 1000);
    }

    // 公共API
    console.log('[Favorites] Setting up global API...');
    window.NJUXKFavorites = {
        getFavorites,
        addToFavorites,
        removeFromFavorites,
        isFavorited,
        toggleFavorite,
        updateFavoriteButton,
        attachFavoriteButton,
        createFavoritesPanel,
        updateFavoritesPanel
    };

    // 暴露给全局的更新函数
    window.updateFavoriteButton = updateFavoriteButton;

    // 初始化
    if (document.readyState === 'loading') {
        console.log('[Favorites] Document still loading, waiting for DOMContentLoaded...');
        document.addEventListener('DOMContentLoaded', init);
    } else {
        console.log('[Favorites] Document ready, initializing immediately...');
        init();
    }

    console.log('[Favorites] Module loaded successfully, API available at window.NJUXKFavorites');
})();