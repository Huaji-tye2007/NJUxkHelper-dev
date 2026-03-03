# CSS样式文件说明

本目录包含南京大学选课小助手的所有样式文件，已从JavaScript文件中分离出来，便于维护和管理。

## 文件结构

### common.css
- **用途**: 通用样式定义
- **内容**: 可点击链接样式等全局样式
- **引用**: content-script.js

### panel.css  
- **用途**: 信息面板样式
- **内容**: 面板布局、卡片样式、按钮样式等
- **引用**: panel-inject.js
- **主要类名**:
  - `.njxk-panel` - 主面板容器
  - `.njxk-header` - 面板头部
  - `.njxk-tabs` - 选项卡
  - `.njxk-content` - 内容区域
  - `.njxk-card` - 评论卡片

### favorites.css
- **用途**: 收藏功能面板样式  
- **内容**: 收藏夹面板、收藏按钮、表格样式等
- **引用**: favorites.js
- **主要类名**:
  - `.njxk-favorites-panel` - 收藏夹面板
  - `.njxk-favorites-header` - 面板头部
  - `.njxk-favorites-table` - 收藏列表表格
  - `.njxk-favorites-remove` - 删除按钮

## 样式加载方式

```javascript
// 在JavaScript文件中使用以下方式加载CSS
function loadCSS(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = chrome.runtime.getURL(href);
  document.head.appendChild(link);
}

loadCSS('css/panel.css');
```

## 设计规范

- **色彩主题**: 紫色主题 
- **圆角**: 统一使用 6-8px 圆角
- **阴影**: 使用 box-shadow 增强层次感
- **字体**: 优先使用系统字体 system-ui
- **响应式**: 支持不同屏幕尺寸适配