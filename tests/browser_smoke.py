"""End-to-end UI/storage checks with deterministic AI fixtures, not a live-model test."""
import json
from pathlib import Path
import tempfile
import threading
import zipfile
from playwright.sync_api import sync_playwright, expect
from test_server import app


def run():
    with tempfile.TemporaryDirectory() as directory:
        server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        server.store = app.Store(directory)
        server.ai = app.AI()
        def fixture(prompt, images, search):
            if '连接测试' in prompt:
                return '{"ok":true}'
            if '简历整理助手' in prompt:
                return json.dumps({'basic': {'name': '测试人'}, 'education': [], 'experiences': [{'type': 'research', 'org': '测试研究院', 'role': '研究助理', 'start': '2025', 'end': '2026', 'bullets': ['整理政策资料并参与报告撰写'], 'tags': []}]})
            if '资深求职顾问' in prompt:
                expid = next(p.split('/')[1] for p in server.store.documents() if p.startswith('experiences/'))
                return json.dumps({'score': 80, 'verdict': '适合研究岗位', 'company': {}, 'role': {}, 'dims': [], 'hardChecks': [], 'strengths': ['有政策研究经历'], 'gaps': [], 'recommend': [{'expId': expid, 'reason': '相关研究经历'}], 'keywords': ['政策研究']})
            if '生成定制版简历表述' in prompt:
                expid = next(p.split('/')[1] for p in server.store.documents() if p.startswith('experiences/'))
                return json.dumps({'notes': '突出相关研究经历', 'summary': {'text': '具备政策研究经验', 'reason': '已有经历'}, 'items': [{'expId': expid, 'bullets': [{'i': 0, 'new': '参与政策资料整理与研究报告撰写', 'changed': True, 'reason': '突出岗位关键词'}]}]})
            if '面试教练' in prompt:
                assert search
                return json.dumps({'intro1': '测试自我介绍', 'intro3': '测试三分钟介绍', 'questions': [{'q': '介绍研究经历', 'type': '经历', 'intent': '验证经验', 'hint': '如实回答'}], 'sources': [], 'competitors': [], 'ask': []})
            raise AssertionError('Unexpected AI prompt')
        server.ai.codex = fixture
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
                page = browser.new_page(timezone_id='Asia/Shanghai')
                page.set_default_timeout(10000)
                errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
                # Documents/exports must work with all external hosts unavailable.
                page.route('https://**/*', lambda route: route.abort())
                url = f'http://127.0.0.1:{server.server_port}'
                page.goto(url, wait_until='load')
                expect(page.locator('h1')).to_have_text('今天的求职台')
                for view, title in [('apps', '投递'), ('companies', '公司库'), ('resumes', '简历与经历'), ('profile', '报名信息'), ('calendar', '日程')]:
                    page.locator(f'#nav [data-v="{view}"]').click()
                    expect(page.locator('h1')).to_have_text(title)
                page.locator('#nav [data-v="profile"]').click()
                page.locator('#b-name').fill('测试人')
                page.locator('#e0-school').fill('测试大学')
                page.locator('[data-act="addEdu"]').click()
                page.locator('#e1-school').fill('第二大学')
                page.locator('[data-act="saveProfile"]').click()
                expect(page.locator('#toast')).to_have_text('报名信息已保存。')
                page.reload(wait_until='load')
                expect(page.locator('#b-name')).to_have_value('测试人')
                expect(page.locator('#e1-school')).to_have_value('第二大学')

                page.locator('#nav [data-v="companies"]').click()
                with page.expect_file_chooser() as chooser:
                    page.locator('[data-act="importCo"]').click()
                chooser.value.set_files({'name': 'companies.csv', 'mimeType': 'text/csv', 'buffer': '公司,批次,备注\r\n测试单位,2027,"含逗号,和换行\n的备注"'.encode()})
                expect(page.locator('#main')).to_contain_text('测试单位')
                page.locator('[data-act="addCo"]').click(); page.locator('#co-name').fill('手动单位')
                page.locator('[data-act="saveCo"]').click()
                expect(page.locator('#main')).to_contain_text('手动单位')

                page.locator('#nav [data-v="resumes"]').click()
                page.locator('#resume-file').set_input_files({'name': 'resume.txt', 'mimeType': 'text/plain', 'buffer': '测试人，测试大学公共管理专业，2025年到2026年在测试研究院担任研究助理，整理政策资料并参与报告撰写。'.encode()})
                expect(page.locator('[data-act="viewResume"]')).to_have_count(1)
                page.locator('[data-act="organize"]').click()
                expect(page.locator('#main')).to_contain_text('测试研究院')

                # Verify the locally hosted document parsers and Word writer.
                page.evaluate('async () => { await Promise.all([loadScript(LIBS.xlsx), loadScript(LIBS.mammoth), loadScript(LIBS.pdf), loadScript(LIBS.docx)]); if (!XLSX || !mammoth || !pdfjsLib || !docx) throw Error("missing parser"); }')
                word_path = str(Path(directory) / 'sample.docx')
                encoded = page.evaluate('async () => { const d = new docx.Document({sections:[{children:[new docx.Paragraph("Document parser sample with enough text to be accepted as a resume.")]}]}); const b = await docx.Packer.toBlob(d); return Array.from(new Uint8Array(await b.arrayBuffer())); }')
                Path(word_path).write_bytes(bytes(encoded))
                page.locator('#resume-file').set_input_files(word_path)
                expect(page.locator('[data-act="viewResume"]')).to_have_count(2)
                pdf_path = str(Path(directory) / 'sample.pdf')
                document = browser.new_page()
                document.set_content('<p>' + 'Policy research assistant: collected policy materials and contributed to research reports during 2025 and 2026. ' * 4 + '</p>')
                document.pdf(path=pdf_path); document.close()
                page.locator('#resume-file').set_input_files(pdf_path)
                expect(page.locator('[data-act="viewResume"]')).to_have_count(3)
                spreadsheet = page.evaluate('() => { const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.json_to_sheet([{公司:"Excel导入单位",批次:"2027"}]), "Sheet1"); return Array.from(new Uint8Array(XLSX.write(w,{type:"array",bookType:"xlsx"}))); }')
                page.locator('#nav [data-v="companies"]').click()
                with page.expect_file_chooser() as chooser:
                    page.locator('[data-act="importCo"]').click()
                chooser.value.set_files({'name':'companies.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':bytes(spreadsheet)})
                expect(page.locator('#main')).to_contain_text('Excel导入单位')

                page.locator('#nav [data-v="apps"]').click()
                page.locator('[data-act="newApp"]').click()
                page.locator('#na-co').fill('测试单位'); page.locator('#na-role').fill('政策研究岗')
                page.locator('#na-jd').fill('负责政策研究、资料整理和报告撰写，公共管理专业优先。')
                page.locator('#na-run').uncheck(); page.locator('[data-act="createApp"]').click()
                page.locator('[data-act="runMatch"]').click()
                expect(page.locator('#main')).to_contain_text('适合研究岗位')
                page.locator('[data-act="appTab"][data-t="tailor"]').first.click()
                page.locator('[data-act="runTailor"]').click()
                expect(page.locator('[data-act="exportDocx"]')).to_be_visible()
                with page.expect_download() as download:
                    page.locator('[data-act="exportDocx"]').click()
                export = Path(directory) / 'export.docx'; download.value.save_as(export)
                with zipfile.ZipFile(export) as archive:
                    assert 'word/document.xml' in archive.namelist()
                page.locator('[data-act="appTab"][data-t="prep"]').click()
                page.locator('[data-act="runDeep"]').click()
                expect(page.locator('#main')).to_contain_text('测试自我介绍')
                page.locator('[data-act="appTab"][data-t="fill"]').click()
                expect(page.locator('#main')).to_contain_text('报名资料速填')
                expect(page.locator('#main')).to_contain_text('测试人')
                # Store a calendar event and inspect the downloaded ICS archive.
                page.locator('[data-act="appTab"][data-t="track"]').click()
                page.locator('[data-act="schedule"]').click()
                page.locator('#sc-start').fill('2027-03-01T10:00')
                with page.expect_download() as download:
                    page.locator('[data-act="scSave"][data-dl="1"]').click()
                calendar = Path(directory) / 'calendar.zip'; download.value.save_as(calendar)
                with zipfile.ZipFile(calendar) as archive:
                    ics = archive.read(archive.namelist()[0]).decode()
                    assert 'BEGIN:VEVENT' in ics and 'DTSTART:20270301T020000Z' in ics
                page.locator('[data-act="localSettings"]').click()
                page.locator('[data-act="testAI"]').click()
                expect(page.locator('#ai-test-result')).to_contain_text('连接成功')
                with page.expect_download() as download:
                    page.locator('[data-act="backupData"]').click()
                backup = Path(directory) / 'backup.json'; download.value.save_as(backup)
                documents = json.loads(backup.read_text())['documents']
                assert documents['profile/main']['basic']['name'] == '测试人'
                assert any(k.startswith('tailored/') for k in documents)
                assert any(k.startswith('analyses/') for k in documents)
                server.store.change('profile/main', {'basic': {'name': '临时修改'}}, 'set')
                page.on('dialog', lambda dialog: dialog.accept())
                with page.expect_file_chooser() as chooser:
                    page.locator('[data-act="restoreData"]').click()
                chooser.value.set_files(str(backup))
                expect(page.locator('#toast')).to_contain_text('已导入')
                assert server.store.documents()['profile/main']['basic']['name'] == '测试人'
                assert not errors, errors
                browser.close()
                print('PASS: six views, profile editing/reload, CSV/XLSX and company creation, TXT/DOCX/PDF upload, AI fixture organize/match/tailor/research, Word export, calendar timezone/download, complete backup/restore, no JS errors.')
                print('AI fixtures validate integration only; a separate live Codex test is required.')
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__':
    run()
