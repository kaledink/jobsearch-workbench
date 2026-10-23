import importlib.util
import json
import io
from pathlib import Path
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from urllib.error import HTTPError

spec=importlib.util.spec_from_file_location('collector',Path(__file__).parents[1]/'recruitment/collector.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
AT=datetime(2026,10,23,9,tzinfo=c.TZ)
TEXT='某单位在北京招聘政策研究岗。政治学相关专业，博士学历，面向2027届。报名截止2026年10月25日17:00。'
PAGE={'url':'https://example.gov.cn/job.html','text':TEXT,'sha256':'source-hash','unreadAttachments':False}

def row(**changes):
 value={'name':'某单位','title':'政策研究岗','city':'北京','batch':'2027校招','category':c.CATEGORIES[0],'deadline':'2026-10-25','deadlineTime':'17:00','score':90,'evidence':{'name':'某单位','role':'政策研究岗','city':'北京','deadline':'2026年10月25日17:00'},'requirements':[{'kind':'major','quote':'政治学相关专业','result':'met'},{'kind':'education','quote':'博士学历','result':'met'},{'kind':'cohort','quote':'面向2027届','result':'met'}]}
 value.update(changes);return value

class RecruitmentTests(unittest.TestCase):
 def test_urgency_precedes_score_and_undated_is_last(self):
  low=row(title='紧急岗位',deadline='2026-10-23',score=76,eligibility='qualified')
  high=row(title='远期岗位',deadline='2026-11-01',score=100,eligibility='qualified')
  rolling=row(title='长期岗位',deadline='',score=100,eligibility='qualified')
  result,_=c.select_jobs([high,rolling,low],AT)
  self.assertEqual([r['title'] for r in result],['紧急岗位','远期岗位','长期岗位'])
 def test_exact_time_expired_and_same_day_open(self):
  expired=row(title='已结束',deadline='2026-10-23',deadlineTime='08:59',eligibility='qualified')
  open_job=row(title='今日可报',deadline='2026-10-23',deadlineTime='10:00',eligibility='qualified')
  result,_=c.select_jobs([expired,open_job],AT)
  self.assertEqual(len(result),1);self.assertEqual(result[0]['title'],'今日可报')
 def test_valid_quotes_and_hard_checks(self):
  result=c.validate_job(row(),PAGE,{},AT)
  self.assertEqual(result['eligibility'],'qualified')
  bad=row();bad['requirements'][0]['result']='unmet'
  self.assertIsNone(c.validate_job(bad,PAGE,{},AT))
 def test_unsupported_dates_or_fabricated_evidence_rejected(self):
  self.assertIsNone(c.validate_job(row(deadline='2026-10-26'),PAGE,{},AT))
  bad=row();bad['evidence']['role']='网页没有的岗位'
  self.assertIsNone(c.validate_job(bad,PAGE,{},AT))
 def test_unknown_cohort_and_unread_attachment_are_review(self):
  uncertain=row();uncertain['requirements'][2]['result']='unknown'
  self.assertEqual(c.validate_job(uncertain,PAGE,{},AT)['eligibility'],'review')
  self.assertEqual(c.validate_job(row(),dict(PAGE,unreadAttachments=True),{},AT)['eligibility'],'review')
 def test_unknown_deadline_never_treated_as_urgent(self):
  value=row(deadline='',deadlineTime='',deadlineText='未注明')
  self.assertEqual(c.validate_job(value,PAGE,{},AT)['eligibility'],'review')
  value['deadlineText']='长期招聘'
  self.assertEqual(c.validate_job(value,PAGE,{},AT)['eligibility'],'qualified')
 def test_qualified_and_review_limits_and_dedup(self):
  rows=[row(title=str(i),eligibility='qualified') for i in range(20)]
  rows+=rows[:5]+[row(title='核实'+str(i),eligibility='review') for i in range(12)]
  qualified,review=c.select_jobs(rows,AT)
  self.assertEqual(len(qualified),10);self.assertEqual(len(review),10)
 def test_merge_preserves_personal_data_and_is_idempotent(self):
  key='companies/'+c.company_id('某单位','2027校招')
  docs={'profile/main':{'private':'keep'},'applications/a':{'role':'keep'},'attachments/a':{'path':'keep'},key:{'name':'某单位','batch':'2027校招','source':'手动','starred':True,'myNote':'保留备注'}}
  job=c.validate_job(row(),PAGE,{},AT)
  report={'status':'ok','summary':'test'}
  merged=c.merge_jobs(docs,[job],[],report,AT)
  for k in ['profile/main','applications/a','attachments/a']:self.assertEqual(merged[k],docs[k])
  self.assertTrue(merged[key]['starred']);self.assertEqual(merged[key]['myNote'],'保留备注')
  twice=c.merge_jobs(merged,[job],[],report,AT)
  self.assertEqual(len(twice[key]['vacancies']),1)
 def test_failed_run_preserves_last_success(self):
  docs={'meta/status':{'lastDaily':'previous','lastSuccessfulDay':'2026-10-22'}}
  merged=c.merge_jobs(docs,[],[],{'status':'failed','summary':'unavailable'},AT)
  self.assertEqual(merged['meta/status']['lastDaily'],'previous')
  self.assertEqual(merged['meta/status']['lastRunStatus'],'failed')
 def test_no_contacts_name_birth_or_party_in_model_summary(self):
  profile={'basic':{'name':'DO_NOT_SEND','birth':'DO_NOT_SEND','politics':'DO_NOT_SEND','email':'DO_NOT_SEND','gradDate':'2027-06'},'education':[]}
  self.assertNotIn('DO_NOT_SEND',json.dumps(c.candidate_summary(profile,[])))
 def test_party_and_age_not_guessed(self):
  self.assertEqual(c.local_requirement({'kind':'party','result':'met','quote':'中共党员'},{},AT),'unknown')
  self.assertEqual(c.local_requirement({'kind':'age','result':'met','quote':'35岁以下','maxAge':35},{'basic':{'birth':'1990-01-01'}},AT),'unknown')
 def test_js_compatible_company_key(self):
  self.assertEqual(c.company_id('a',''),'clyjy0g2ez')
 def test_model_rejects_non_json_transport_and_truncated_results(self):
  with patch.object(c,'urlopen',return_value=io.BytesIO(b'not-json')):
   with self.assertRaisesRegex(c.ModelResponseError,'non-json-transport'):c.model_extract(dict(PAGE),{},'test-only-token')
  response={'choices':[{'finish_reason':'length','message':{'content':'private text must never reach diagnostic logs'}}]}
  with patch.object(c,'urlopen',return_value=io.BytesIO(json.dumps(response).encode())):
   with self.assertRaisesRegex(c.ModelResponseError,'truncated-structured-reply'):c.model_extract(dict(PAGE),{},'test-only-token')
 def test_conflict_retry_merges_latest_profile(self):
  class Client(c.GitHub):
   def __init__(self):self.count=0;self.saved=None
   def read_state(self):return {'format':'jobsearch-workbench-v1','documents':{'profile/main':{'version':self.count}}},str(self.count)
   def call(self,path,body=None):
    self.count+=1
    if self.count==1:raise HTTPError('https://api.github.com',409,'conflict',{},None)
    import base64
    self.saved=json.loads(base64.b64decode(body['content']))
  client=Client()
  with patch.object(c.time,'sleep'):client.update([],[],{'status':'ok','summary':'ok'})
  self.assertEqual(client.saved['documents']['profile/main']['version'],1)

if __name__=='__main__':unittest.main()
