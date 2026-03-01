<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subconverter 多节点/订阅 URL 生成器</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #f0f4f8; color: #333; margin: 0; padding: 20px; }
    .container { max-width: 900px; margin: auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    h1 { text-align: center; color: #2c3e50; }
    label { display: block; margin: 15px 0 5px; font-weight: bold; }
    input, select, textarea { width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; font-size: 16px; }
    textarea { height: 200px; resize: vertical; }
    button { background: #3498db; color: white; border: none; padding: 14px 24px; border-radius: 6px; cursor: pointer; margin: 10px 0; }
    button:hover { background: #2980b9; }
    #result { margin-top: 20px; padding: 15px; background: #e8f4fd; border: 1px solid #b3d4fc; border-radius: 6px; word-break: break-all; }
    .copy-btn { background: #27ae60; }
    .copy-btn:hover { background: #219653; }
    .jump-btn { background: #e67e22; }
    .jump-btn:hover { background: #d35400; }
    footer { text-align: center; margin-top: 30px; color: #777; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Subconverter 多源转换 URL 生成器 (MetaCubeX 版)</h1>
    <p>每行输入一个源：vless:// 链接 或 本地 YAML 路径（如 C:/path/to/Clash.yaml）。会自动用 | 合并。</p>

    <label for="baseUrl">Subconverter 地址：</label>
    <input type="text" id="baseUrl" value="http://127.0.0.1:25500" placeholder="http://127.0.0.1:25500">

    <label for="target">输出格式：</label>
    <select id="target">
      <option value="clash">Clash</option>
      <option value="clash.meta">Clash Meta (推荐 Reality)</option>
      <option value="singbox">sing-box</option>
      <!-- 加更多你需要的 -->
    </select>

    <label for="sources">源列表（每行一个）：</label>
    <textarea id="sources" placeholder=""></textarea>

    <label for="insert">Insert：</label>
    <select id="insert">
      <option value="false">false（只转换节点）</option>
      <option value="true">true</option>
    </select>

    <button onclick="generateUrl()">生成 URL</button>

    <div id="result">
      <p>生成的 URL 会在这里显示...</p>
    </div>

    <button class="copy-btn" onclick="copyUrl()">复制 URL</button>
    <button class="jump-btn" onclick="openUrl()">直接跳转</button>
  </div>

  <footer>MetaCubeX/subconverter 支持 | 分隔多源，包括本地文件路径 | 确保 subconverter.exe 运行中</footer>

  <script>
    let generatedUrl = '';

    function generateUrl() {
      const base = document.getElementById('baseUrl').value.trim() || 'http://127.0.0.1:25500';
      const target = document.getElementById('target').value;
      const sourcesText = document.getElementById('sources').value.trim();
      const insert = document.getElementById('insert').value;

      // 每行分割，过滤空行，join 用 |
      const sources = sourcesText.split('\n').map(s => s.trim()).filter(s => s);
      if (sources.length === 0) {
        alert('请输入至少一个源');
        return;
      }
      const multiUrl = sources.join('|');
      const encodedMulti = encodeURIComponent(multiUrl);

      generatedUrl = `${base}/sub?target=${target}&url=${encodedMulti}&insert=${insert}`;

      document.getElementById('result').innerHTML = `
        <strong>生成的转换链接（已合并 ${sources.length} 个源）：</strong><br>
        <a href="$$   {generatedUrl}" target="_blank">   $${generatedUrl}</a><br><br>
        点击“直接跳转”即可下载/查看合并后的 YAML 配置。
      `;
    }

    function copyUrl() {
      if (!generatedUrl) return alert('先生成 URL');
      navigator.clipboard.writeText(generatedUrl).then(() => alert('已复制！'));
    }

    function openUrl() {
      if (!generatedUrl) return alert('先生成 URL');
      window.open(generatedUrl, '_blank');
    }
  </script>
</body>
</html>
