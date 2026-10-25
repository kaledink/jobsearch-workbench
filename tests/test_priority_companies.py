import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).parents[1]
sys.path.insert(0,str(ROOT/'recruitment'))
import priority as p
import collector as c
from test_recruitment import AT, PAGE, row

class PriorityCompaniesTests(unittest.TestCase):
 def test_exact_user_numbering_and_missing_websites(self):
  self.assertEqual([g['number'] for g in p.REGISTRY],list(range(1,101)))
  self.assertEqual(p.REGISTRY[98]['name'],'中国国新控股有限责任公司')
  self.assertEqual(p.REGISTRY[20]['website'],'https://www.ctg.com.cn/')
  self.assertEqual(p.REGISTRY[53]['website'],'https://www.ctg.cn/')
  self.assertEqual([g['number'] for g in p.REGISTRY if not g['website']],[22,27])
 def test_canonical_and_common_names(self):
  cases={'中国国新控股有限责任公司':99,'中国国新':99,'中国建筑集团有限公司':48,'中国建筑科学研究院有限公司':72,'中国电子信息产业集团有限公司':29,'中国电子科技集团有限公司':8,'中国航空工业集团有限公司':4,'中国航空集团有限公司':41,'中国长安汽车集团有限公司':74,'中国兵器装备集团有限公司':7,'中国旅游集团有限公司':54,'中国南光集团有限公司':96}
  for name,number in cases.items():
   with self.subTest(name=name):self.assertEqual(p.find_group(name)['number'],number)
 def test_subsidiary_is_not_mislabeled_headquarters(self):
  result=p.find_group('华润置地有限公司')
  self.assertEqual(result['number'],53)
  self.assertIn('待核实',result['relationship'])
  self.assertNotIn('总部',result['relationship'])
  self.assertEqual(p.find_group('中国电子科技某研究院')['number'],8)
 def test_unrelated_institutions_and_domains_are_not_proof(self):
  self.assertIsNone(p.find_group('中国石油大学'))
  self.assertIsNone(p.find_group('中国电子学会'))
  self.assertIsNone(p.find_group('中国农业发展银行'))
  self.assertIsNone(p.find_group('招商银行'))
  self.assertIsNone(p.find_group('普通民营企业'))
  self.assertNotIn('priorityNumber',p.annotate_priority({'name':'普通民营企业','priorityNumber':99,'priorityGroup':{'number':99}}))
  value=p.annotate_priority({'name':'无关单位','sourceURL':'https://www.crhc.cn/'},'合作单位中国国新')
  self.assertNotIn('priorityNumber',value)
 def test_affiliation_requires_real_relationship_quote(self):
  base={'name':'新华资产管理有限公司','parentGroup':'中国国新','parentGroupQuote':'中国国新旗下全资企业'}
  self.assertEqual(p.annotate_priority(base,'公告：中国国新旗下全资企业招聘')['priorityNumber'],99)
  self.assertNotIn('priorityNumber',p.annotate_priority(base,'另一个公告'))
  base['parentGroupQuote']='中国国新控股有限责任公司'
  self.assertNotIn('priorityNumber',p.annotate_priority(base,'中国国新控股有限责任公司'))
  base['parentGroupQuote']='友情链接中国国新'
  self.assertNotIn('priorityNumber',p.annotate_priority(base,'友情链接中国国新'))
 def test_rotation_covers_all_without_renumbering(self):
  groups=[]
  for cursor in range(0,100,20):groups.extend(g['number'] for g in p.daily_batch(cursor))
  self.assertEqual(groups,list(range(1,101)))
  batch=p.daily_batch(0,20,[99,1])
  self.assertEqual(len(batch),21);self.assertEqual(batch[0]['number'],99)
 def test_deadline_still_precedes_priority_and_ties_favor_watchlist(self):
  urgent=row(title='今天',deadline='2026-10-23',eligibility='qualified',score=80)
  priority=row(title='远期重点',deadline='2026-11-01',eligibility='qualified',priorityNumber=99,score=99)
  self.assertEqual(c.select_jobs([priority,urgent],AT)[0][0]['title'],'今天')
  tied=row(title='同日普通',deadline='2026-11-01',eligibility='qualified',score=100)
  self.assertEqual(c.select_jobs([tied,priority],AT)[0][0]['title'],'远期重点')
 def test_priority_campus_must_be_supported(self):
  text=PAGE['text'].replace('某单位','中国国新控股有限责任公司')+'这是2027届校园招聘。'
  value=row(name='中国国新控股有限责任公司');value['evidence']['name']=value['name']
  page=dict(PAGE,text=text)
  result=c.validate_job(value,page,{},AT)
  self.assertEqual(result['priorityNumber'],99);self.assertEqual(result['eligibility'],'review')
  value['campusQuote']='2027届校园招聘'
  self.assertEqual(c.validate_job(value,page,{},AT)['eligibility'],'qualified')

if __name__=='__main__':unittest.main()
