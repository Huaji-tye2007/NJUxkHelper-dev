// NJU选课助手 - Popup页面脚本
document.addEventListener('DOMContentLoaded', function () {
    // GitHub仓库链接 - 请根据实际仓库地址修改
    const REPO_URL = 'https://github.com/tye2007/NJUxkHelper-dev';
    const ISSUES_URL = 'https://github.com/tye2007/NJUxkHelper-dev/issues';
    const README_URL = 'https://github.com/tye2007/NJUxkHelper-dev/blob/main/README.md';

    // 获取链接元素
    const aboutLink = document.getElementById('about-link');
    const feedbackLink = document.getElementById('feedback-link');
    const helpLink = document.getElementById('help-link');

    // 添加点击事件监听器
    aboutLink.addEventListener('click', function (e) {
        e.preventDefault();
        chrome.tabs.create({ url: REPO_URL });
        window.close();
    });

    feedbackLink.addEventListener('click', function (e) {
        e.preventDefault();
        chrome.tabs.create({ url: ISSUES_URL });
        window.close();
    });

    helpLink.addEventListener('click', function (e) {
        e.preventDefault();
        chrome.tabs.create({ url: README_URL });
        window.close();
    });

    // 显示当前扩展版本信息
    const manifest = chrome.runtime.getManifest();
    console.log(`NJU选课助手 v${manifest.version} popup已加载`);
});