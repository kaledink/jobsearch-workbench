import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, ProxyHandler, build_opener

spec = importlib.util.spec_from_file_location('workbench_server', Path(__file__).parents[1] / 'jobsearch-workbench/server.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class WorkbenchTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        self.server.store = app.Store(self.directory.name)
        self.server.ai = app.AI()
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.client = build_opener(ProxyHandler({}))
        self.url = 'http://127.0.0.1:' + str(self.server.server_port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.directory.cleanup()

    def request(self, path, body=None, headers=None):
        data = None if body is None else json.dumps(body).encode()
        h = {'Content-Type': 'application/json', **(headers or {})}
        request = Request(self.url + path, data=data, headers=h)
        try:
            with self.client.open(request, timeout=5) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def write(self, path, data, operation='set'):
        return self.request('/api/document', {'path': path, 'data': data, 'operation': operation})

    def test_crud_and_restart_persistence(self):
        self.assertEqual(self.write('applications/a', {'company': '测试单位', 'status': '待投递'})[0], 200)
        self.assertEqual(self.write('applications/a', {'status': '已投递'}, 'update')[0], 200)
        restored = app.Store(self.directory.name).documents()
        self.assertEqual(restored['applications/a'], {'company': '测试单位', 'status': '已投递'})
        self.assertEqual(self.write('applications/a', {}, 'delete')[0], 200)
        self.assertEqual(self.request('/api/state')[1]['documents'], {})
        self.assertEqual(self.write('applications/missing', {'status': '已投递'}, 'update')[0], 404)

    def test_backup_restore_merge_and_atomic_validation(self):
        self.write('profile/main', {'basic': {'name': '测试人'}})
        backup = self.request('/api/backup')[1]
        self.write('companies/keep', {'name': '保留单位'})
        self.write('profile/main', {'basic': {'name': '已修改'}})
        self.assertEqual(self.request('/api/restore', backup)[0], 200)
        self.assertEqual(self.server.store.documents()['profile/main']['basic']['name'], '测试人')
        self.assertIn('companies/keep', self.server.store.documents())
        self.assertGreaterEqual(len(list((Path(self.directory.name) / 'backups').glob('*.json'))), 2)
        before = self.server.store.documents()
        invalid = {'format': 'jobsearch-workbench-v1', 'documents': {'profile/main': {'basic': {'name': '错误'}}, '../secret': {}}}
        self.assertEqual(self.request('/api/restore', invalid)[0], 400)
        self.assertEqual(self.server.store.documents(), before)

    def test_reject_cross_origin_and_invalid_data(self):
        self.assertEqual(self.request('/api/document', {'path': 'profile/main', 'data': {}, 'operation': 'set'}, {'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.request('/api/state', headers={'Host': 'evil.example'})[0], 403)
        self.assertEqual(self.write('profile/main', [1])[0], 400)
        self.assertEqual(self.write('unknown/id', {})[0], 400)
        self.assertEqual(self.server.store.documents(), {})

    def test_ai_json_validation_and_error_status(self):
        with patch.object(self.server.ai, 'codex', return_value='{"ok":true}'):
            self.assertEqual(self.request('/api/ai', {'prompt': '连接测试'})[1], {'ok': True})
        with patch.object(self.server.ai, 'codex', return_value='not json'):
            self.assertEqual(self.request('/api/ai', {'prompt': '连接测试'})[0], 502)
        self.assertEqual(self.server.ai.status()['lastResult'], 'error')
        self.assertEqual(self.server.store.documents(), {})

    def test_ai_busy_and_image_validation(self):
        self.server.ai.gate.acquire()
        try:
            self.assertEqual(self.request('/api/ai', {'prompt': 'test'})[0], 409)
        finally:
            self.server.ai.gate.release()
        self.assertEqual(self.request('/api/ai', {'prompt': 'test', 'images': ['data:image/png;base64,!!!']})[0], 400)
        self.assertEqual(self.request('/api/ai', {'prompt': ''})[0], 400)

    def test_html_utf8_and_no_filesystem_exposure(self):
        with self.client.open(self.url, timeout=5) as response:
            self.assertIn('charset=utf-8', response.headers['Content-Type'])
            self.assertIn('求职工作台', response.read().decode())
        self.assertEqual(self.request('/server.py')[0], 404)
        self.assertEqual(self.request('/../.workbench/workbench.sqlite3')[0], 404)


if __name__ == '__main__':
    unittest.main()
