import json, tempfile, subprocess, urllib.request, urllib.error, time, pathlib, os
with tempfile.TemporaryDirectory(prefix='tetris-api-') as d:
 env=dict(os.environ,TETRIS_SCORES_FILE=d+'/scores.json')
 p=subprocess.Popen(['php','-S','127.0.0.1:8786','-t','backend'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  url='http://127.0.0.1:8786/api.php'
  def call(body=None,origin='https://zerokemf.github.io'):
   req=urllib.request.Request(url,data=None if body is None else json.dumps(body).encode(),headers={'Origin':origin,'Content-Type':'application/json'})
   try:
    with urllib.request.urlopen(req,timeout=3) as r:return r.status,json.load(r)
   except urllib.error.HTTPError as e:return e.code,json.load(e)
  for _ in range(30):
   try: call();break
   except OSError:time.sleep(.1)
  assert call()[1]['scores']==[]
  item=dict(id='abcdef12-1234-1234-1234-123456789abc',name='Willie',mode='solo',score=1234,lines=8)
  assert call(item)[0]==200
  assert len(call(item)[1]['scores'])==1
  assert call(dict(item,name='<script>'))[0]==400
  assert call(dict(item,score=-1))[0]==400
  assert call(item,'https://evil.example')[0]==403
  assert call(dict(item,mode='online'))[0]==400
  assert call()[1]['scores'][0]['name']=='Willie'
  print('PASS API persistence, duplicate prevention, validation, origin, mode separation')
 finally:p.terminate();p.wait()
