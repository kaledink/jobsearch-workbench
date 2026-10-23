"""Deadline-first company UI, including timezone and multi-vacancy regression checks."""
from datetime import datetime, timezone
import json
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect
from test_server import app


def run():
 with tempfile.TemporaryDirectory() as directory:
  server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);server.store=app.Store(directory);server.ai=app.AI()
  def company(name,deadline,score=90,**extra):
   return {'name':name,'deadline':deadline,'fit':{'score':score,'reason':'匹配'},'source':'每日招聘','category':'政府机关/事业单位','url':'https://example.gov.cn/jobs','eligibility':'qualified',**extra}
  def vacancy(ident,deadline,clock,eligibility='qualified'):
   return {'id':ident,'title':ident,'city':'北京','deadline':deadline,'deadlineTime':clock,'eligibility':eligibility,'sourceURL':'https://example.gov.cn/jobs','score':80}
  values=[company('今天单位','2026-10-23',76,deadlineTime='10:00'),company('远期单位','2026-10-28',100),company('长期单位','',100),company('已过时刻单位','2026-10-23',deadlineTime='08:00'),company('待核实单位','2026-10-23',eligibility='review'),company('多岗位单位','2026-11-30',vacancies=[vacancy('较晚的匹配岗位','2026-10-23','09:30'),vacancy('更早但待核实','2026-10-23','09:15','review')])]
  for i,value in enumerate(values):server.store.change('companies/'+str(i),value,'set')
  server.store.change('meta/status',{'lastDaily':'2026-10-22T09:00:00+08:00','lastAttempt':'2026-10-23T09:00:00+08:00','lastRunStatus':'failed','dailySummary':'本次未完成，保留已有数据。'},'set')
  worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(timezone_id='America/Los_Angeles');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('https://**/*',lambda route:route.abort())
    page.clock.set_fixed_time(datetime(2026,10,23,1,0,tzinfo=timezone.utc))
    page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='load')
    page.locator('#nav [data-v="companies"]').click();expect(page.locator('tbody tr')).to_have_count(5)
    names=page.locator('tbody tr td:first-child .t1 a').all_text_contents()
    assert names==['多岗位单位','今天单位','远期单位','长期单位','待核实单位'],names
    assert page.evaluate('today()')=='2026-10-23'
    assert page.evaluate('daysLeft("2026-10-23")')==0
    assert page.evaluate('new Date().getDate()')==22
    expect(page.locator('tbody tr').first).to_contain_text('今天截止')
    page.locator('[data-act="companyJobs"]').click();expect(page.locator('#modal')).to_contain_text('更早但待核实')
    expect(page.locator('#modal')).to_contain_text('查看官方公告')
    page.locator('#modal [data-act="closeModal"]').click()
    page.locator('[data-act="cfEligibility"][data-e="review"]').click()
    expect(page.locator('tbody tr')).to_have_count(2)
    page.locator('#nav [data-v="dash"]').click();expect(page.locator('#main')).to_contain_text('未完成')
    expect(page.locator('#main')).to_contain_text('2026-10-22T09:00:00+08:00')
    assert not errors,errors
    browser.close();print('PASS: urgency before score, exact expired time hidden, unknown deadlines last, review separated, earliest qualified vacancy used, Shanghai dates independent of browser timezone, failure does not erase last success.')
  finally:server.shutdown();server.server_close();worker.join()

if __name__=='__main__':run()
