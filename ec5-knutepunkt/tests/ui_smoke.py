# Røyktest av UI med Playwright. Kjør: python3 -m http.server 8080 & python3 tests/ui_smoke.py
# Krever: pip install playwright && playwright install chromium
from playwright.sync_api import sync_playwright
import json, os
os.makedirs('tests/out', exist_ok=True)
with sync_playwright() as p:
    try:
        b = p.chromium.launch()
    except Exception as e:
        print("NO BROWSER", e); raise SystemExit(0)
    pg = b.new_page(viewport={'width':1400,'height':1000})
    errs=[]
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    import os; pg.goto(os.environ.get('URL','http://localhost:8080/'), wait_until='networkidle')
    print('errors:', errs)
    print('util:', pg.inner_text('[data-testid=utilization]'))
    for s in range(1,6):
        pg.click(f'[data-testid=step-{s}]'); pg.wait_for_timeout(100)
        pg.screenshot(path=f'tests/out/step{s}.png', full_page=True)
    print('result api:', json.dumps(pg.evaluate('window.knutepunkt.getResult()'))[:300])
    # agent interaction: change screw and thickness
    r = pg.evaluate("window.knutepunkt.setState({fastener:{d:10,d1:6.4,presetId:'custom'}, pattern:{n1:3}})")
    print('after set:', r['util'], r['worst'])
    pg.click('[data-testid=preview-report]'); pg.wait_for_timeout(300)
    pg.screenshot(path='tests/out/report.png', full_page=True)
    pg.pdf(path='tests/out/report.pdf', format='A4', print_background=True)
    print('errors:', errs)
    b.close()
