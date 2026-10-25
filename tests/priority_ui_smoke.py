"""Numbering and visual emphasis must work even for old unannotated company records."""
from datetime import datetime, timezone
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect
from test_server import app


def run():
 with tempfile.TemporaryDirectory() as directory:
  server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);server.store=app.Store(directory);server.ai=app.AI()
  for ident,name,deadline,score in [('normal','普通单位','2026-10-25',80),('crhc','中国国新控股有限责任公司','2026-10-27',90),('cabr','中国建筑科学研究院有限公司','2026-10-27',80),('sub','中国电子科技某研究院','2026-10-28',90),('university','中国电子学会','2026-10-29',80)]:
   server.store.change('companies/'+ident,{'name':name,'deadline':deadline,'category':'国企央企','source':'手动','fit':{'score':score}},'set')
  worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
  try:
   with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('https://**/*',lambda r:r.abort());page.clock.set_fixed_time(datetime(2026,10,25,1,tzinfo=timezone.utc))
    page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='load');page.locator('#nav [data-v="companies"]').click()
    expect(page.locator('tr.priority-company')).to_have_count(3)
    expect(page.locator('tbody tr').nth(0)).to_contain_text('普通单位')
    expect(page.locator('tbody tr').nth(1)).to_contain_text('重点央企 #99')
    expect(page.locator('tbody tr').nth(2)).to_contain_text('重点央企 #72')
    expect(page.locator('tbody tr').nth(3)).to_contain_text('重点央企 #8')
    expect(page.locator('tbody tr').nth(3)).to_contain_text('疑似成员单位，待核实')
    page.locator('[data-act="cfPriority"]').click();expect(page.locator('tbody tr')).to_have_count(3)
    page.locator('[data-act="priorityCompanies"]').click();expect(page.locator('#modal .li')).to_have_count(100)
    expect(page.locator('#modal .li').nth(21)).to_contain_text('#22');expect(page.locator('#modal .li').nth(21)).to_contain_text('官网入口待核实')
    expect(page.locator('#modal .li').nth(26)).to_contain_text('#27')
    expect(page.locator('#modal .li').nth(98)).to_contain_text('中国国新控股有限责任公司')
    assert page.evaluate('priorityGroupOf({name:"中国船舶集团有限公司"}).number')==5
    assert page.evaluate('priorityGroupOf({name:"华润置地有限公司"}).number')==53
    assert page.evaluate('priorityGroupOf({name:"中国电子科技集团有限公司"}).number')==8
    assert page.evaluate('priorityGroupOf({name:"中国电子信息产业集团有限公司"}).number')==29
    assert not errors,errors
    b.close();print('PASS: all 100 original numbers, prominent badges, priority-only filtering, old records auto-match, subsidiaries marked unverified, deadline priority retained, unrelated organizations not tagged.')
  finally:server.shutdown();server.server_close();worker.join()

if __name__=='__main__':run()
