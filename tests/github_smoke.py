"""GitHub Pages integration test with mocked GitHub/Models APIs, no remote writes."""
import base64
import json
from pathlib import Path
import tempfile
import threading
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright, expect
from test_server import app


def run():
    files = {}; serial = 0; public = True; conflict = False; puts = []
    def respond(route, status, value):
        route.fulfill(status=status, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps(value))
    def github(route):
        nonlocal serial, conflict
        request = route.request
        assert request.headers.get('authorization') == 'Bearer TEST_TOKEN_NOT_REAL'
        path = unquote(urlparse(request.url).path)
        if path == '/repos/kaledink/private-data':
            respond(route, 200, {'private': not public, 'permissions': {'push': True}}); return
        prefix = '/repos/kaledink/private-data/contents/'
        assert path.startswith(prefix), path
        name = path[len(prefix):]
        if request.method == 'GET':
            if name not in files: respond(route, 404, {'message':'Not Found'})
            else: respond(route, 200, {'sha': files[name]['sha'], 'encoding':'base64', 'content':files[name]['content']})
        elif request.method == 'PUT':
            body = request.post_data_json
            if conflict and name == 'workbench/state.json':
                conflict = False
                existing = json.loads(base64.b64decode(files[name]['content']))
                existing['documents']['companies/concurrent'] = {'name':'另一个设备保存的单位'}
                serial += 1
                files[name] = {'sha':str(serial), 'content':base64.b64encode(json.dumps(existing).encode()).decode()}
                respond(route, 409, {'message':'conflict'}); return
            if name in files:
                assert body['sha'] == files[name]['sha']
            serial += 1; files[name] = {'sha':str(serial), 'content':body['content']}; puts.append(name)
            assert 'TEST_TOKEN_NOT_REAL' not in base64.b64decode(body['content']).decode(errors='ignore')
            respond(route, 200, {'content':{'sha':str(serial)}})
        else: raise AssertionError(request.method)

    with tempfile.TemporaryDirectory() as directory:
        server = app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        server.store = app.Store(directory); server.ai = app.AI()
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
                context=browser.new_context(); page=context.new_page();page.set_default_timeout(10000)
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                context.route('https://fonts.googleapis.com/**',lambda r:r.abort())
                context.route('https://api.github.com/**',github)
                context.route('https://models.github.ai/**',lambda r:respond(r,200,{'choices':[{'message':{'content':'{"ok":true}'}}]}))
                url=f'http://127.0.0.1:{server.server_port}/?github=1'
                def login():
                    page.locator('#gh-owner').fill('kaledink');page.locator('#gh-repo').fill('private-data');page.locator('#gh-token').fill('TEST_TOKEN_NOT_REAL')
                    page.locator('#github-login button').click()
                page.goto(url,wait_until='load');login()
                expect(page.locator('#gh-error')).to_contain_text('必须为 Private')
                assert not puts
                public=False;login();expect(page.locator('h1')).to_have_text('今天的求职台')
                expect(page.locator('#nav button')).to_have_count(7)
                page.locator('#nav [data-v="profile"]').click();page.locator('#b-name').fill('仅存在私人仓库的名字')
                page.locator('[data-act="saveProfile"]').click();expect(page.locator('#toast')).to_contain_text('已保存');expect(page.locator('.head .pill.warn')).to_have_count(0)
                conflict=True
                page.locator('#b-phone').fill('10000000000');page.locator('[data-act="saveProfile"]').click()
                expect(page.locator('#toast')).to_contain_text('已保存');expect(page.locator('.head .pill.warn')).to_have_count(0)
                page.locator('#nav [data-v="companies"]').click();expect(page.locator('#main')).to_contain_text('另一个设备保存的单位')
                page.locator('#nav [data-v="files"]').click()
                image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1kAAAAASUVORK5CYII=')
                with page.expect_file_chooser() as chooser:page.locator('[data-act="uploadFiles"]').click()
                chooser.value.set_files({'name':'私人图片.png','mimeType':'image/png','buffer':image})
                expect(page.locator('[data-act="previewFile"]')).to_have_count(1)
                page.locator('[data-act="previewFile"]').click();expect(page.locator('#modal img')).to_be_visible()
                page.locator('#modal [data-act="closeModal"]').click()
                with page.expect_download() as download:page.locator('[data-act="downloadFile"]').click()
                original=Path(directory)/'image.png';download.value.save_as(original);assert original.read_bytes()==image
                page.locator('[data-act="localSettings"]').click();expect(page.locator('#modal')).to_contain_text('GitHub Models')
                page.locator('[data-act="testAI"]').click();expect(page.locator('#ai-test-result')).to_contain_text('连接成功')
                with page.expect_download() as download:page.locator('[data-act="backupData"]').click()
                backup=Path(directory)/'backup.json';download.value.save_as(backup);data=json.loads(backup.read_text())
                assert data['documents']['profile/main']['basic']['name']=='仅存在私人仓库的名字'
                assert base64.b64decode(data['files'][0]['data'])==image
                assert 'TEST_TOKEN_NOT_REAL' not in page.evaluate('JSON.stringify(localStorage)')
                page.reload(wait_until='load');expect(page.locator('#github-login')).to_be_visible();expect(page.locator('#gh-token')).to_have_value('')
                login();page.locator('#nav [data-v="profile"]').click();expect(page.locator('#b-name')).to_have_value('仅存在私人仓库的名字')
                page.locator('#nav [data-v="files"]').click();expect(page.locator('[data-act="downloadFile"]')).to_have_count(1)
                assert not errors,errors
                browser.close()
                print('PASS: refuses public storage; private state saves/reloads; concurrent write rebases; image upload/preview/download; full backup includes binary; AI fixture connection; token absent from storage/commits; login required after reload.')
                print('GitHub/Models APIs were mocked. This does not verify deployment or live API access.')
        finally:server.shutdown();server.server_close();thread.join()


if __name__=='__main__':run()
