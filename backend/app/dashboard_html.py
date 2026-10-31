"""Modern Interactive Backend Control Center & Live Engine Dashboard UI for Algo Robot."""

def get_backend_dashboard_html() -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Algo Robot • FastAPI Backend Control Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;800&family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #07090e;
      --panel: #0d1320;
      --panel-hover: #131b2e;
      --border: rgba(255, 255, 255, 0.08);
      --border-accent: rgba(56, 189, 248, 0.35);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --success: #34d399;
      --warning: #fbbf24;
      --purple: #a855f7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      line-height: 1.5;
      padding-bottom: 60px;
    }
    code, pre { font-family: 'JetBrains Mono', monospace; }
    
    /* Top Navbar */
    .navbar {
      background: rgba(13, 19, 32, 0.85);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 50;
      padding: 16px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: linear-gradient(135deg, #0284c7 0%, #38bdf8 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 1.2rem;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
    }
    .brand-title {
      font-size: 1.15rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .badge-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--success);
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 10px var(--success);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
      100% { opacity: 1; transform: scale(1); }
    }
    .nav-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 10px;
      font-size: 0.82rem;
      font-weight: 700;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid transparent;
    }
    .btn-primary {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: #ffffff;
      border-color: rgba(56, 189, 248, 0.4);
    }
    .btn-primary:hover {
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border-color: var(--border);
      color: var(--text);
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    /* Container */
    .container {
      max-width: 1380px;
      margin: 0 auto;
      padding: 32px 24px;
    }

    /* Hero */
    .hero {
      background: linear-gradient(135deg, rgba(2, 132, 199, 0.15) 0%, rgba(13, 19, 32, 0.95) 50%, rgba(168, 85, 247, 0.1) 100%);
      border: 1px solid var(--border-accent);
      border-radius: 20px;
      padding: 32px;
      margin-bottom: 32px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
    }
    .hero h1 {
      font-size: 1.85rem;
      font-weight: 900;
      letter-spacing: -0.03em;
      margin-bottom: 8px;
    }
    .hero p {
      color: var(--text-muted);
      font-size: 0.92rem;
      max-width: 800px;
    }

    /* Grid */
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      transition: all 0.2s ease;
    }
    .card:hover {
      border-color: rgba(56, 189, 248, 0.3);
      transform: translateY(-2px);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .card-label {
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }
    .card-value {
      font-size: 1.75rem;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: #ffffff;
    }
    .card-subtext {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Section Title */
    .section-title {
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Endpoints Table */
    .table-container {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      margin-bottom: 32px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      text-align: left;
    }
    thead {
      background: rgba(0, 0, 0, 0.4);
      border-bottom: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    th, td {
      padding: 14px 18px;
    }
    tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      transition: background 0.15s ease;
    }
    tr:hover {
      background: rgba(255, 255, 255, 0.02);
    }
    .method-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.68rem;
      font-weight: 800;
      font-family: 'JetBrains Mono', monospace;
    }
    .method-get { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
    .method-ws { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
    .method-post { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }

    /* Interactive Live Console */
    .console-panel {
      background: #050811;
      border: 1px solid var(--border-accent);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .console-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .console-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .console-tab {
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .console-tab.active, .console-tab:hover {
      background: rgba(56, 189, 248, 0.15);
      border-color: var(--primary);
      color: #ffffff;
    }
    .code-box {
      background: #020408;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px;
      max-height: 380px;
      overflow-y: auto;
      font-size: 0.8rem;
      color: #a5b4fc;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>

  <!-- Top Navbar -->
  <header class="navbar">
    <div class="brand">
      <div class="brand-icon">⚡</div>
      <div>
        <div class="brand-title">Algo Robot • FastAPI Backend Engine</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">Uvicorn Host: 127.0.0.1:8000 &bull; Python 3.11 Runtime</div>
      </div>
      <div class="badge-status">
        <span class="pulse"></span>
        API Online
      </div>
    </div>

    <div class="nav-actions">
      <a href="/docs" target="_blank" class="btn btn-primary">
        📘 Interactive Swagger UI (/docs)
      </a>
      <a href="/redoc" target="_blank" class="btn btn-secondary">
        📖 ReDoc API Docs (/redoc)
      </a>
      <a href="http://localhost:3000" target="_blank" class="btn btn-secondary" style="color: #38bdf8;">
        🖥️ Open Frontend Platform
      </a>
    </div>
  </header>

  <main class="container">

    <!-- Hero Card -->
    <section class="hero">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
        <div>
          <div style="display: inline-block; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #38bdf8; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.25); padding: 4px 10px; border-radius: 6px; margin-bottom: 8px;">
            HIGH-FREQUENCY TRADING & NSE FINANCIAL ENGINE
          </div>
          <h1>FastAPI Backend Control Center</h1>
          <p>
            Official server managing real-time WebSocket tick streaming from TradingView (NSEIX:NIFTY1!), 
            50 Nifty constituents balance sheet data, 140+ NSE & BSE indices, live SEBI Regulation 31 institutional holdings, 
            and official NSE corporate disclosures.
          </p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">SERVER TIME (IST)</div>
          <div id="live-clock" style="font-size: 1.25rem; font-weight: 900; color: #ffffff; font-family: 'JetBrains Mono', monospace; margin-top: 2px;">
            --:--:-- IST
          </div>
          <div style="font-size: 0.72rem; color: #34d399; margin-top: 4px;">● Continuous Event Loop Active</div>
        </div>
      </div>
    </section>

    <!-- 4 Live Engine Status Cards -->
    <div class="grid-4">
      <div class="card" style="border-left: 4px solid #38bdf8;">
        <div class="card-header">
          <span class="card-label">GIFT NIFTY STREAMER</span>
          <span class="badge-status" style="color: #38bdf8; background: rgba(56, 189, 248, 0.1); border-color: rgba(56, 189, 248, 0.3);">NSEIX:NIFTY1!</span>
        </div>
        <div class="card-value" id="gift-val">23,092.50</div>
        <div class="card-subtext" id="gift-session">Session 2: 04:35 PM - 02:45 AM IST &bull; Real-Time TV Feed</div>
      </div>

      <div class="card" style="border-left: 4px solid #34d399;">
        <div class="card-header">
          <span class="card-label">EQUITY CASH ENGINE</span>
          <span class="badge-status">NIFTY 50</span>
        </div>
        <div class="card-value">50 Companies</div>
        <div class="card-subtext">Official Financials, Quarterly P&L, Balance Sheets & Filings</div>
      </div>

      <div class="card" style="border-left: 4px solid #a855f7;">
        <div class="card-header">
          <span class="card-label">INSTITUTIONAL CAPITAL</span>
          <span class="badge-status" style="color: #c084fc; background: rgba(168, 85, 247, 0.1); border-color: rgba(168, 85, 247, 0.3);">SEBI REG 31</span>
        </div>
        <div class="card-value">₹95.89 L Cr</div>
        <div class="card-subtext">₹49.5L Cr FII Capital + ₹46.3L Cr DII Capital Deployed</div>
      </div>

      <div class="card" style="border-left: 4px solid #fbbf24;">
        <div class="card-header">
          <span class="card-label">NSE NEWS INTELLIGENCE</span>
          <span class="badge-status" style="color: #fbbf24; background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.3);">71 FILINGS</span>
        </div>
        <div class="card-value" id="news-count">71 Verified</div>
        <div class="card-subtext">Real-Time Market-Moving Announcements with Impact Scores</div>
      </div>
    </div>

    <!-- Interactive Live Console -->
    <div class="console-panel">
      <div class="console-header">
        <div>
          <h3 style="font-size: 1.1rem; font-weight: 800; color: #ffffff;">⚡ Interactive Live API Response Tester</h3>
          <p style="font-size: 0.78rem; color: var(--text-muted);">Click an endpoint to query live response directly from the backend</p>
        </div>
        <div class="console-tabs">
          <button class="console-tab active" onclick="testEndpoint('/api/indices/gift-nifty')">GIFT Nifty</button>
          <button class="console-tab" onclick="testEndpoint('/api/indices/live')">Major Indices</button>
          <button class="console-tab" onclick="testEndpoint('/api/fii-dii')">FII/DII Flows</button>
          <button class="console-tab" onclick="testEndpoint('/api/deals')">Bulk & Block Deals</button>
          <button class="console-tab" onclick="testEndpoint('/api/deals/strategies')">Trader's Playbook</button>
          <button class="console-tab" onclick="testEndpoint('/api/institutional-holdings?limit=2')">Inst. Holdings</button>
          <button class="console-tab" onclick="testEndpoint('/api/news')">NSE News</button>
          <button class="console-tab" onclick="testEndpoint('/api/companies/HDFCBANK')">HDFC Bank Detail</button>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted); margin-bottom: 8px;">
        <span id="endpoint-url">QUERY: /api/indices/gift-nifty</span>
        <span id="endpoint-latency">LATENCY: ...</span>
      </div>
      <pre class="code-box" id="console-output">Loading live response...</pre>
    </div>

    <!-- Endpoints Directory Table -->
    <div class="section-title">
      <span>📡 Registered REST & WebSocket Endpoints</span>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>METHOD</th>
            <th>ENDPOINT ROUTE</th>
            <th>DESCRIPTION</th>
            <th>RESPONSE TYPE</th>
            <th style="text-align: right;">ACTION</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="method-badge method-get">GET</span></td>
            <td><code>/api/indices/gift-nifty</code></td>
            <td>Live tick-by-tick GIFT Nifty data streamed from TradingView</td>
            <td>JSON (Session, LTP, Change)</td>
            <td style="text-align: right;"><a href="/api/indices/gift-nifty" target="_blank" class="btn btn-secondary" style="font-size: 0.72rem; padding: 4px 10px;">Test Live ↗</a></td>
          </tr>
          <tr>
            <td><span class="method-badge method-get">GET</span></td>
            <td><code>/api/fii-dii</code></td>
            <td>Official NSE Cash Market Settlement Feed & Strategic Market Impact Engine</td>
            <td>JSON (Net Values, 6-Day History)</td>
            <td style="text-align: right;"><a href="/api/fii-dii" target="_blank" class="btn btn-secondary" style="font-size: 0.72rem; padding: 4px 10px;">Test Live ↗</a></td>
          </tr>
          <tr>
            <td><span class="method-badge method-get">GET</span></td>
            <td><code>/api/deals</code></td>
            <td>SEBI Bulk & Block Deals (who is trading, volume, execution price, and signals)</td>
            <td>JSON (Deals Array)</td>
            <td style="text-align: right;"><a href="/api/deals" target="_blank" class="btn btn-secondary" style="font-size: 0.72rem; padding: 4px 10px;">Test Live ↗</a></td>
          </tr>
          <tr>
            <td><span class="method-badge method-get">GET</span></td>
            <td><code>/api/deals/strategies</code></td>
            <td>Institutional Trading Playbook: Floor Price, Whale Breakout, and Risk Tactics</td>
            <td>JSON (Playbook Guide)</td>
            <td style="text-align: right;"><a href="/api/deals/strategies" target="_blank" class="btn btn-secondary" style="font-size: 0.72rem; padding: 4px 10px;">Test Live ↗</a></td>
          </tr>
          <tr>
            <td><span class="method-badge method-get">GET</span></td>
            <td><code>/api/institutional-holdings</code></td>
            <td>Company-wise FII & DII holdings and invested capital (₹ Crores) from SEBI Reg 31</td>
            <td>JSON (Constituents Array)</td>
            <td style="text-align: right;"><a href="/api/institutional-holdings?limit=5" target="_blank" class="btn btn-secondary" style="font-size: 0.72rem; padding: 4px 10px;">Test Live ↗</a></td>
          </tr>
          <tr>
            <td><span class="method-badge method-get">GET</span></td>
            <td><code>/api/news</code></td>
            <td>Real-time verified NSE announcements with impact ratings and sentiment</td>
            <td>JSON (Market Moving Feed)</td>
            <td style="text-align: right;"><a href="/api/news" target="_blank" class="btn btn-secondary" style="font-size: 0.72rem; padding: 4px 10px;">Test Live ↗</a></td>
          </tr>
          <tr>
            <td><span class="method-badge method-get">GET</span></td>
            <td><code>/api/indices/live</code></td>
            <td>Top benchmarks (NIFTY 50, SENSEX, BANK NIFTY, INDIA VIX, GIFT NIFTY)</td>
            <td>JSON (Live Prices & Chg)</td>
            <td style="text-align: right;"><a href="/api/indices/live" target="_blank" class="btn btn-secondary" style="font-size: 0.72rem; padding: 4px 10px;">Test Live ↗</a></td>
          </tr>
          <tr>
            <td><span class="method-badge method-get">GET</span></td>
            <td><code>/api/indices</code></td>
            <td>Complete catalogue of all 140+ official NSE and BSE indices</td>
            <td>JSON (140+ Indices)</td>
            <td style="text-align: right;"><a href="/api/indices" target="_blank" class="btn btn-secondary" style="font-size: 0.72rem; padding: 4px 10px;">Test Live ↗</a></td>
          </tr>
          <tr>
            <td><span class="method-badge method-get">GET</span></td>
            <td><code>/api/stocks/live-ticks</code></td>
            <td>Live stock prices, day highs, lows, volumes for all 50 constituents</td>
            <td>JSON (50 Quotes)</td>
            <td style="text-align: right;"><a href="/api/stocks/live-ticks" target="_blank" class="btn btn-secondary" style="font-size: 0.72rem; padding: 4px 10px;">Test Live ↗</a></td>
          </tr>
          <tr>
            <td><span class="method-badge method-get">GET</span></td>
            <td><code>/api/companies/{symbol}</code></td>
            <td>Complete quarterly statements, annual financials, balance sheets & Reg 31 holdings</td>
            <td>JSON (Full Audit Detail)</td>
            <td style="text-align: right;"><a href="/api/companies/RELIANCE" target="_blank" class="btn btn-secondary" style="font-size: 0.72rem; padding: 4px 10px;">Test Live ↗</a></td>
          </tr>
          <tr>
            <td><span class="method-badge method-ws">WS</span></td>
            <td><code>/ws/live-ticks</code></td>
            <td>Sub-millisecond WebSocket broadcasting live ticks on every price change</td>
            <td>WebSocket Stream</td>
            <td style="text-align: right;"><span style="color: var(--text-muted); font-size: 0.75rem;">ws://127.0.0.1:8000</span></td>
          </tr>
        </tbody>
      </table>
    </div>

  </main>

  <script>
    // Live Clock
    function updateClock() {
      const now = new Date();
      document.getElementById('live-clock').innerText = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST';
    }
    setInterval(updateClock, 1000);
    updateClock();

    // Live Endpoint Tester
    async function testEndpoint(endpoint) {
      document.querySelectorAll('.console-tab').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');

      const urlEl = document.getElementById('endpoint-url');
      const latencyEl = document.getElementById('endpoint-latency');
      const outputEl = document.getElementById('console-output');

      urlEl.innerText = 'QUERY: ' + endpoint;
      latencyEl.innerText = 'FETCHING...';
      outputEl.innerText = 'Querying ' + endpoint + ' ...';

      const t0 = performance.now();
      try {
        const res = await fetch(endpoint);
        const data = await res.json();
        const t1 = performance.now();
        latencyEl.innerText = 'LATENCY: ' + (t1 - t0).toFixed(1) + ' ms | STATUS ' + res.status;
        outputEl.innerText = JSON.stringify(data, null, 2);
      } catch (e) {
        latencyEl.innerText = 'ERROR';
        outputEl.innerText = 'Error: ' + e.message;
      }
    }

    // Initial load
    testEndpoint('/api/indices/gift-nifty');
  </script>
</body>
</html>
"""

