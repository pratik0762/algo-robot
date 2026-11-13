import asyncio
import time
import json
import statistics
import urllib.request
import urllib.error
import concurrent.futures

ENDPOINTS = [
    ("Market Status", "http://127.0.0.1:8000/api/market-status"),
    ("Live Stock Ticks", "http://127.0.0.1:8000/api/stocks/live-ticks"),
    ("Trade Signals", "http://127.0.0.1:8000/api/trade-signals"),
    ("NSE Heat Map", "http://127.0.0.1:8000/api/heatmap"),
    ("Chart Data (RELIANCE)", "http://127.0.0.1:8000/api/chart-data/RELIANCE"),
    ("Chart Data (COFORGE)", "http://127.0.0.1:8000/api/chart-data/COFORGE"),
    ("All Companies (50)", "http://127.0.0.1:8000/api/companies"),
    ("Company Detail (RELIANCE)", "http://127.0.0.1:8000/api/companies/RELIANCE"),
    ("All Indices (140+)", "http://127.0.0.1:8000/api/indices"),
    ("FII / DII Flows", "http://127.0.0.1:8000/api/fii-dii"),
    ("Block Deals", "http://127.0.0.1:8000/api/deals"),
    ("52-Week Radar", "http://127.0.0.1:8000/api/52-week"),
    ("Market News", "http://127.0.0.1:8000/api/news"),
    ("Next.js Home (SSR/HTML)", "http://127.0.0.1:3000/"),
    ("Next.js Signals (SSR/HTML)", "http://127.0.0.1:3000/signals"),
    ("Next.js Chart (SSR/HTML)", "http://127.0.0.1:3000/chart")
]

def benchmark_endpoint(name, url, runs=25):
    latencies = []
    payload_size = 0
    status_code = 0
    for _ in range(runs):
        t0 = time.perf_counter()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Benchmarker/1.0"})
            with urllib.request.urlopen(req, timeout=5) as res:
                body = res.read()
                t1 = time.perf_counter()
                latencies.append((t1 - t0) * 1000.0) # in ms
                payload_size = len(body)
                status_code = res.status
        except Exception as e:
            pass

    if not latencies:
        return {"name": name, "url": url, "error": "All requests failed"}
    
    latencies.sort()
    n = len(latencies)
    p50 = latencies[int(n * 0.50)]
    p95 = latencies[min(int(n * 0.95), n - 1)]
    p99 = latencies[min(int(n * 0.99), n - 1)]
    avg = statistics.mean(latencies)

    return {
        "name": name,
        "url": url,
        "status": status_code,
        "payload_bytes": payload_size,
        "p50_ms": round(p50, 2),
        "p95_ms": round(p95, 2),
        "p99_ms": round(p99, 2),
        "avg_ms": round(avg, 2),
        "min_ms": round(latencies[0], 2),
        "max_ms": round(latencies[-1], 2),
        "samples": n
    }

def concurrency_test(url, concurrency, total_requests):
    latencies = []
    errors = 0
    t_start = time.perf_counter()
    
    def fetch_one():
        nonlocal errors
        t0 = time.perf_counter()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ConcurrencyBench/1.0"})
            with urllib.request.urlopen(req, timeout=5) as res:
                _ = res.read()
                t1 = time.perf_counter()
                return (t1 - t0) * 1000.0
        except Exception:
            errors += 1
            return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(fetch_one) for _ in range(total_requests)]
        for f in concurrent.futures.as_completed(futures):
            res = f.result()
            if res is not None:
                latencies.append(res)

    t_total = time.perf_counter() - t_start
    throughput = len(latencies) / t_total if t_total > 0 else 0
    latencies.sort()
    n = len(latencies)
    p50 = latencies[int(n * 0.50)] if n else 0
    p95 = latencies[min(int(n * 0.95), n - 1)] if n else 0

    return {
        "concurrency": concurrency,
        "total_requests": total_requests,
        "successful": n,
        "errors": errors,
        "total_duration_s": round(t_total, 3),
        "throughput_req_sec": round(throughput, 1),
        "p50_ms": round(p50, 2),
        "p95_ms": round(p95, 2)
    }

def main():
    print("=== RUNNING API BASELINE LATENCY AUDIT ===")
    results = []
    for name, url in ENDPOINTS:
        res = benchmark_endpoint(name, url, runs=20)
        results.append(res)
        print(f"[{res.get('status', 'ERR')}] {name:28} | P50: {res.get('p50_ms', 0):6.2f}ms | P95: {res.get('p95_ms', 0):6.2f}ms | Size: {res.get('payload_bytes', 0)/1024:6.1f} KB")

    print("\n=== RUNNING CONCURRENCY / LOAD CAPACITY AUDIT (/api/trade-signals) ===")
    load_results = []
    for c in [10, 25, 50, 100]:
        lr = concurrency_test("http://127.0.0.1:8000/api/trade-signals", concurrency=c, total_requests=c * 3)
        load_results.append(lr)
        print(f"Concurrency: {c:3d} | RPS: {lr['throughput_req_sec']:6.1f} | P50: {lr['p50_ms']:6.2f}ms | P95: {lr['p95_ms']:6.2f}ms | Errors: {lr['errors']}")

    output = {
        "baseline_endpoints": results,
        "concurrency_stress": load_results,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    with open("scratch/audit_baseline_results.json", "w") as f:
        json.dump(output, f, indent=2)
    print("\nSaved baseline results to scratch/audit_baseline_results.json")

if __name__ == "__main__":
    main()

