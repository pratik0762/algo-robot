import asyncio
import json
import websockets
import time

async def test_websocket():
    uri = "ws://127.0.0.1:8000/ws/live-ticks"
    print("Connecting to WebSocket:", uri)
    async with websockets.connect(uri) as ws:
        t0 = time.perf_counter()
        raw = await ws.recv()
        t1 = time.perf_counter()
        data = json.loads(raw)
        print(f"Received SNAPSHOT in {(t1 - t0)*1000:.2f}ms! Type: {data.get('type')}, Stocks count: {len(data.get('stocks', []))}")
        assert data.get("type") == "SNAPSHOT", "Expected SNAPSHOT message"
        print("WebSocket Snapshot Verification PASSED!")

if __name__ == "__main__":
    asyncio.run(test_websocket())
