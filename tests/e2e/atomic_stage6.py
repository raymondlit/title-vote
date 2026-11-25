import asyncio, csv, io, json, os, re, time
from pathlib import Path
from playwright.async_api import async_playwright, expect
ROOT=Path('/tmp/browser/vote-stage6')
BASE='http://localhost:8080'
SLUG='e2e_atomic_'+str(int(time.time()))
NAME='E2E原子提交演练大学 '+SLUG
report={'school_slug':SLUG,'timings_ms':{},'checks':[],'http_errors':[],'page_errors':[], 'phase':'flow'}

def csv_file(name, rows):
    path=ROOT/name
    with path.open('w',encoding='utf-8-sig',newline='') as f: csv.writer(f).writerows(rows)
    return str(path)

async def login(page, username,password):
    await page.goto(BASE+'/school/'+SLUG)
    await page.wait_for_function("()=>{const f=document.querySelector('form');return f && Object.keys(f).some(k=>k.startsWith('__reactProps') && typeof f[k].onSubmit==='function')}")
    await page.locator('#account').fill(username)
    await page.locator('#password').fill(password)
    await page.locator('button[type=submit]').click()

async def snap(page,name):
    await page.wait_for_timeout(300)
    await page.screenshot(path=str(ROOT/(name+'.png')))

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        from lovable_playwright_defaults import signed_in_context
        context=await signed_in_context(browser)
        superpage=await context.new_page()
        await superpage.goto(BASE)
        await superpage.goto(BASE+'/super')
        await expect(superpage.get_by_role('heading',name='高校与管理员',exact=True)).to_be_visible()
        await superpage.get_by_label('学校名称',exact=True).fill(NAME)
        await superpage.get_by_label('标识（登录页地址，可留空自动生成）').fill(SLUG)
        await superpage.get_by_role('button',name='添加',exact=True).click()
        await expect(superpage.get_by_text('高校已添加',exact=True)).to_be_visible()
        judge_pages=[]
        admin_context=None
        try:
            await superpage.reload()
            await expect(superpage.get_by_role('heading',name='高校与管理员',exact=True)).to_be_visible()
            await superpage.get_by_role('button',name=re.compile(r'^管理员（')).click()
            await superpage.locator('select').first.select_option(label=NAME)
            await superpage.get_by_label('管理员姓名',exact=True).fill('阶段六演练管理员')
            await superpage.get_by_role('button',name='生成账号',exact=True).click()
            cred=superpage.locator('p').filter(has_text='请立即复制保存，仅显示一次')
            await expect(cred).to_be_visible(timeout=30000)
            text=await cred.inner_text()
            username=re.search('管理员「([^」]+)」',text).group(1)
            password=await cred.locator('span').inner_text()
            admin_context=await browser.new_context(viewport={'width':1280,'height':1800})
            page=await admin_context.new_page()
            async def record_candidate_error(response):
                if response.status>=400 and '/rpc/get_session_summary' in response.url:
                    report.setdefault('summary_errors',[]).append({'phase':report['phase'],'message':(await response.json()).get('message'),'page':page.url})
                if response.status>=400 and '/rest/v1/candidates' in response.url:
                    report['checks'].append('参评人请求异常')
            page.on('response',record_candidate_error)
            page.on('pageerror',lambda e: report['page_errors'].append(str(e)))
            page.on('response',lambda r: report['http_errors'].append({'path':r.url.split(BASE)[-1].split('?')[0],'status':r.status,'phase':report['phase']}) if r.status>=400 and r.url.startswith(BASE) else None)
            await login(page,username,password)
            await page.wait_for_url(re.compile(r'.*/admin(?:/.*)?$'),timeout=30000)
            await page.goto(BASE+'/admin/candidates')
            await expect(page.get_by_role('heading',name='评审对象',exact=True)).to_be_visible()
            async with page.expect_download() as dl:
                await page.get_by_role('button',name='下载名单模板 XLSX',exact=True).click()
            template=await dl.value
            await template.save_as(ROOT/'candidate_template.xlsx')
            report['checks'].append('参评人XLSX模板下载成功')
            candidates=csv_file('candidates.csv',[
                ['姓名','单位','现职称','评审类别','学科小组'],
                ['张候选','计算机学院','副教授','正高级','计算机科学'],
                ['李候选','计算机学院','副教授','正高级','计算机科学'],
                ['王候选','机械学院','副教授','正高级','机械工程'],
                ['赵候选','机械学院','副教授','正高级','机械工程'],
                ['孙候选','机械学院','副教授','正高级','机械工程']])
            t=time.perf_counter()
            await page.set_input_files('input[type=file]',candidates)
            await expect(page.get_by_text('待导入 5 人',exact=True)).to_be_visible()
            report['timings_ms']['candidate_parse']=round((time.perf_counter()-t)*1000,1)
            await snap(page,'1_candidate_preview')
            t=time.perf_counter()
            await page.get_by_role('button',name='确认导入',exact=True).click()
            await expect(page.get_by_text('已导入 5 位评审对象并自动分组',exact=True)).to_be_visible(timeout=30000)
            await expect(page.get_by_role('heading',name='评审对象（共 5 人）',exact=True)).to_be_visible()
            report['timings_ms']['candidate_import']=round((time.perf_counter()-t)*1000,1)
            await page.goto(BASE+'/admin/judges')
            await expect(page.get_by_role('heading',name='评委管理',exact=True)).to_be_visible()
            async with page.expect_download() as dl:
                await page.get_by_role('button',name='下载名单模板 CSV',exact=True).click()
            await (await dl.value).save_as(ROOT/'judge_template.csv')
            judges=csv_file('judges.csv', [['姓名','工号','单位','职称','电话']]+[[f'并发评委{i+1:02}',f'E2E{i+1:03}','测试学院','教授',''] for i in range(13)])
            await page.set_input_files('input[type=file]',judges)
            await expect(page.get_by_text('待导入 13 人',exact=True)).to_be_visible()
            await page.get_by_role('button',name='确认导入',exact=True).click()
            await expect(page.get_by_text('已导入 13 位评委，全部成功',exact=True)).to_be_visible(timeout=180000)
            creds=[]
            for tr in await page.locator('div.print-area table tbody tr').all():
                vals=await tr.locator('td').all_inner_texts()
                creds.append((vals[1],vals[2],vals[3]))
            assert len(creds)==13
            await page.get_by_role('button',name='我已保存',exact=True).click()
            await page.goto(BASE+'/admin/rules')
            await expect(page.get_by_role('heading',name='投票规则',exact=True)).to_be_visible()
            await page.locator('select').nth(0).select_option(label='正高级')
            inputs=page.locator('input[inputmode=numeric]')
            await inputs.nth(0).fill('5')
            await inputs.nth(1).fill('1.5')
            t=time.perf_counter()
            await page.get_by_role('button',name='保存规则',exact=True).click()
            await page.wait_for_timeout(1200)
            report['decimal_probe']=await page.locator('[data-sonner-toast]').all_inner_texts()
            assert any('参评总数须为正整数' in s for s in report['decimal_probe'])
            await snap(page,'6_decimal_rule')
            await inputs.nth(1).fill('2')
            t=time.perf_counter()
            await page.get_by_role('button',name='保存规则',exact=True).click()
            await expect(page.get_by_text('规则已保存',exact=True)).to_be_visible(timeout=30000)
            await expect(page.get_by_text('参评 5 人 · 最多推荐 2 人',exact=True)).to_be_visible()
            report['timings_ms']['save_rule']=round((time.perf_counter()-t)*1000,1)
            await page.reload()
            await expect(page.get_by_text('参评 5 人 · 最多推荐 2 人',exact=True)).to_be_visible()
            await page.goto(BASE+'/admin/sessions')
            await expect(page.get_by_role('heading',name='投票场次',exact=True)).to_be_visible()
            await page.get_by_label('投票名称',exact=True).fill('阶段六表态交互')
            await page.get_by_role('combobox').nth(0).click()
            await page.get_by_role('option',name='正高级',exact=True).click()
            t=time.perf_counter()
            await page.get_by_role('button',name='创建投票',exact=True).click()
            row=page.locator('li').filter(has=page.get_by_text('阶段六表态交互',exact=True))
            await expect(row.get_by_text('阶段六表态交互',exact=True)).to_be_visible()
            await expect(row).to_contain_text('未开始')
            report['timings_ms']['create_session']=round((time.perf_counter()-t)*1000,1)
            await row.get_by_role('button',name='预览名单',exact=True).click()
            await expect(page.get_by_role('dialog')).to_be_visible()
            await expect(page.get_by_role('dialog').get_by_text('孙候选',exact=True)).to_be_visible()
            await snap(page,'7_preview')
            preview=await page.get_by_role('dialog').inner_text()
            assert all(n in preview for n in ['张候选','李候选','王候选','赵候选','孙候选','计算机科学','机械工程'])
            await page.keyboard.press('Escape')
            await row.get_by_role('button',name='开启投票',exact=True).click()
            await expect(row.get_by_role('button',name='结束投票',exact=True)).to_be_visible()
            async def make_judge(i,credential):
                name,user,pw=credential
                jc=await browser.new_context(viewport={'width':1280,'height':1800} if i%2==0 else {'width':820,'height':1180},has_touch=i%2==1)
                jp=await jc.new_page()
                judge_pages.append((jc,jp))
                jp.on('pageerror',lambda e: report['page_errors'].append(str(e)))
                await login(jp,user,pw)
                await jp.wait_for_url(re.compile(r'.*/vote/[a-f0-9-]+$'),timeout=45000)
                await expect(jp.get_by_role('row',name='孙候选，未表态',exact=True)).to_be_visible(timeout=30000)
                return jc,jp
            # Logins are paced: this stage measures submissions, not auth rate limiting.
            for i,c in enumerate(creds): await make_judge(i,c)
            report['session_id']=judge_pages[0][1].url.rsplit('/',1)[-1]
            async def api(jp,path,body=None):
                return await jp.evaluate('''async ([path,body])=>{
                  const k=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));
                  if(!k) throw new Error('No session');
                  const session=JSON.parse(localStorage.getItem(k));
                  const r=await fetch('/api/public/sb/rest/v1/'+path,{method:body===null?'GET':'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_UQxRquWpBxMn6S-MqvNMsA_ctSy7hFB',Authorization:'Bearer '+session.access_token},...(body===null?{}:{body:JSON.stringify(body)})});
                  return {status:r.status,data:await r.json()};
                }''',[path,body])
            candidates=(await api(page,'candidates?select=id,full_name&order=full_name'))['data']
            assert len(candidates)==5
            ids=[c['id'] for c in candidates]
            valid=[{'candidateId':id,'choice':'recommend' if i<2 else 'not_recommend'} for i,id in enumerate(ids)]
            probe=judge_pages[12][1]
            async def reject(label,choices):
                result=await api(probe,'rpc/submit_ballot',{'_session_id':report['session_id'],'_choices':choices})
                assert result['status']>=400,label
                assert result['data']['code']=='P0001', (label,result['data']['code'])
                ballots=await api(probe,'ballots?select=id&session_id=eq.'+report['session_id'])
                assert ballots['data']==[],label+' left a ballot'
                report['checks'].append(label+'：拒绝且无选票残留')
            await reject('超荐3人',[dict(c,choice='recommend' if i<3 else 'not_recommend') for i,c in enumerate(valid)])
            await reject('少荐1人',[dict(c,choice='recommend' if i<1 else 'not_recommend') for i,c in enumerate(valid)])
            await reject('遗漏对象',valid[:-1])
            await reject('重复对象',valid+[valid[-1]])
            await reject('禁止弃权',valid[:-1]+[dict(valid[-1],choice='abstain')])
            await reject('名单外对象',valid[:-1]+[{'candidateId':'00000000-0000-4000-8000-000000000001','choice':'not_recommend'}])
            await reject('无效选项',valid[:-1]+[dict(valid[-1],choice='invalid')])
            # Force a post-header item uniqueness failure: UUID strings differing only
            # in case identify the same candidate. The entire transaction must roll back.
            upper=ids[0].upper()
            assert upper!=ids[0]
            collision=[valid[0],{'candidateId':upper,'choice':'recommend'}]+[{'candidateId':id,'choice':'not_recommend'} for id in ids[1:4]]
            result=await api(probe,'rpc/submit_ballot',{'_session_id':report['session_id'],'_choices':collision})
            assert result['status']>=400
            assert (await api(probe,'ballots?select=id&session_id=eq.'+report['session_id']))['data']==[]
            report['checks'].append('同一UUID大小写碰撞：写入失败整票回滚，无半张选票')
            # Twenty concurrent writes from the same account, half with another valid
            # ballot. Exactly one may commit; the losing content may never overwrite it.
            twin=judge_pages[11][1]
            alternate=[{'candidateId':id,'choice':'recommend' if i in (2,3) else 'not_recommend'} for i,id in enumerate(ids)]
            started=time.perf_counter()
            results=await asyncio.gather(*[api(twin,'rpc/submit_ballot',{'_session_id':report['session_id'],'_choices':valid if i%2==0 else alternate}) for i in range(20)])
            winners=[i for i,r in enumerate(results) if r['status']==200]
            assert len(winners)==1
            winning=valid if winners[0]%2==0 else alternate
            assert all(r['data'].get('code')=='P0001' for r in results if r['status']!=200)
            report['same_account']={'attempts':20,'committed':1,'duration_ms':round((time.perf_counter()-started)*1000,1)}
            winning_id=results[winners[0]]['data']['ballotId']
            stored=(await api(twin,'ballot_items?select=candidate_id,choice&ballot_id=eq.'+winning_id))['data']
            assert {c['candidate_id']:c['choice'] for c in stored}=={c['candidateId']:c['choice'] for c in winning}
            await twin.reload()
            await expect(twin.get_by_role('heading',name='表决确认单',exact=True)).to_be_visible(timeout=45000)
            await snap(twin,'8_same_account_confirmation')
            report['checks'].append('同账号20路相同/不同合法选票并发：仅1票落库，不覆盖，页面回读一致')
            # Exercise the actual authenticated server function protocol through UI.
            # Replay the browser-generated request using route.fetch (not a hand-built
            # server-function URL). Drop the response only after all replicas return.
            duplicate={'requests':0,'accepted':0,'dropped':False}
            async def duplicate_response(route):
                req=route.request
                if req.method=='POST' and 'expectedUserId' in (req.post_data or '') and 'choices' in (req.post_data or '') and not duplicate['dropped']:
                    duplicate['dropped']=True
                    try:
                        replies=await asyncio.gather(*[route.fetch(headers={**req.headers,'accept':'application/json'},timeout=90000) for _ in range(2)])
                        duplicate['requests']=len(replies)
                        for r in replies:
                            text=await r.text()
                            report.setdefault('duplicate_responses',[]).append({'status':r.status,'accepted':'accepted' in text,'retry':'retry' in text,'rejected':'rejected' in text})
                            if r.status==200 and 'accepted' in text: duplicate['accepted']+=1
                    except Exception as e:
                        report['duplicate_exception']=type(e).__name__
                    await route.abort('failed')
                    return
                await route.continue_()
            await judge_pages[0][1].route('**/*',duplicate_response)
            expected={}
            for i,(jc,jp) in enumerate(judge_pages[:2]):
                recommended={candidates[i%5]['full_name'],candidates[(i+1)%5]['full_name']}
                expected[i]=recommended
                for c in candidates:
                    button=jp.get_by_role('row',name=re.compile('^'+c['full_name']+'，')).get_by_role('button',name='推荐' if c['full_name'] in recommended else '不推荐',exact=True)
                    await (button.tap() if i%2 else button.click())
                await jp.get_by_role('button',name='提交表决',exact=True).click()
                await expect(jp.get_by_role('alertdialog')).to_be_visible()
            async def send(i,jp):
                t=time.perf_counter()
                await jp.get_by_role('alertdialog').get_by_role('button',name='确认提交',exact=True).click()
                try:
                    await expect(jp.get_by_role('heading',name='表决确认单',exact=True)).to_be_visible(timeout=120000)
                except Exception:
                    report.setdefault('submit_failure',[]).append({'judge':i,'state':await jp.get_by_role('region',name='选票提交状态').all_inner_texts()})
                    raise
                elapsed=round((time.perf_counter()-t)*1000,1)
                try:
                    for c in candidates:
                        await expect(jp.locator('div.print-area table tr').filter(has=jp.get_by_text(c['full_name'],exact=True)).locator('td').last).to_have_text('推荐' if c['full_name'] in expected[i] else '不推荐',timeout=45000)
                except Exception:
                    report.setdefault('confirmation_failure',[]).append({'judge':i,'tables':await jp.locator('div.print-area table').all_inner_texts()})
                    await snap(jp,'failure_confirmation_'+str(i))
                    raise
                return elapsed
            # Nine additional accounts hit the same-origin atomic RPC simultaneously.
            t_rpc=time.perf_counter()
            rpc_results=await asyncio.gather(*[api(jp,'rpc/submit_ballot',{'_session_id':report['session_id'],'_choices':valid}) for jc,jp in judge_pages[2:11]])
            assert all(r['status']==200 for r in rpc_results)
            report['concurrent_rpc']={'judges':9,'success':9,'elapsed_ms':round((time.perf_counter()-t_rpc)*1000,1)}
            started=time.perf_counter()
            durations=await asyncio.gather(*[send(i,jp) for i,(jc,jp) in enumerate(judge_pages[:2])])
            report['concurrent_ui']={'judges':2,'success':2,'elapsed_ms':round((time.perf_counter()-started)*1000,1),'confirmation_ms':durations}
            report['server_function_duplicate']=duplicate
            assert duplicate['accepted']>=1 and duplicate['dropped'],duplicate
            await snap(judge_pages[0][1],'9_retry_confirmation')
            await snap(judge_pages[1][1],'10_ipad_confirmation')
            report['checks'].append('2位评委电脑/iPad页面提交并逐项回读；9位评委并发原子接口提交；重复请求及响应丢失后恢复')
            # Compare independent item aggregation, RPC totals and rendered admin UI.
            ballots=(await api(page,'ballots?select=id,judge_id&session_id=eq.'+report['session_id']))['data']
            assert len(ballots)==12 and len({b['judge_id'] for b in ballots})==12
            items=(await api(page,'ballot_items?select=ballot_id,candidate_id,choice&ballot_id=in.('+','.join(b['id'] for b in ballots)+')'))['data']
            assert len(items)==60
            counts={id:sum(x['candidate_id']==id and x['choice']=='recommend' for x in items) for id in ids}
            assert sum(counts.values())==24
            for b in ballots: assert sum(x['ballot_id']==b['id'] for x in items)==5
            summary=(await api(page,'rpc/get_session_summary',{'_session_id':report['session_id']}))['data']
            assert len(summary['ballots'])==12
            assert {c['candidate_id']:c['recommend'] for c in summary['counts']}==counts
            await page.goto(BASE+'/admin/results')
            await page.get_by_role('combobox').first.click()
            await page.get_by_role('option',name='阶段六表态交互',exact=True).click()
            await expect(page.get_by_text(re.compile('应到评委 13 人 · 已提交 12 人 · 未提交 1 人'))).to_be_visible(timeout=45000)
            table=page.locator('table').filter(has=page.get_by_role('columnheader',name='推荐票数',exact=True)).first
            for c in candidates:
                await expect(table.locator('tr').filter(has=page.get_by_text(c['full_name'],exact=True)).locator('td').last).to_have_text(str(counts[c['id']]))
            await snap(page,'11_admin_counts')
            report['stored']={'ballots':12,'items':60,'recommendations':24}
            report['checks'].append('12张独立完整选票/60条明细/24次推荐：明细、汇总、管理员页面三方一致')
            await page.goto(BASE+'/admin/sessions')
            row=page.locator('li').filter(has=page.get_by_text('阶段六表态交互',exact=True))
            await row.get_by_role('button',name='结束投票',exact=True).click()
            await expect(row).to_contain_text('已结束')
            await reject('结束场次迟到选票',valid)
            await probe.reload()
            await expect(probe.get_by_text(re.compile('已结束')).first).to_be_visible(timeout=30000)
            report['checks'].append('未提交评委在结束后无法补写选票，页面显示已结束')
            denied=await api(probe,'rpc/get_ballot_items_page',{'_ballot_ids':[winning_id],'_offset':0})
            assert denied['status']==200 and denied['data']==[]
            report['checks'].append('未提交评委读取其他评委明细返回空，隔离未放宽')
            assert not report['page_errors']
            assert not any(e['status']==504 for e in report['http_errors'])
            report['passed']=True
        except Exception as e:
            report['failure']=type(e).__name__
            print('FAILED:',type(e).__name__)
            raise
        finally:
            report['phase']='cleanup'
            for jc,jp in judge_pages: await jc.close()
            if admin_context: await admin_context.close()
            await superpage.reload()
            await superpage.get_by_role('button',name=re.compile(r'^高校（')).click()
            await superpage.locator('select').first.select_option('100')
            schoolrow=superpage.locator('div.hairline-t').filter(has=superpage.get_by_text(NAME,exact=True))
            await expect(schoolrow).to_have_count(1)
            await schoolrow.get_by_role('button',name='删除',exact=True).click()
            await superpage.get_by_role('button',name='确认删除',exact=True).click()
            await superpage.wait_for_function("()=>document.body.innerText.includes('该校仍有评审数据') || document.body.innerText.includes('高校已删除')")
            if '高校已删除' not in await superpage.locator('body').inner_text():
                await superpage.get_by_role('button',name='一并永久删除',exact=True).click()
            await expect(superpage.get_by_text('高校已删除',exact=True)).to_be_visible(timeout=60000)
            await expect(superpage.get_by_text(NAME,exact=True)).to_have_count(0)
            report['cleanup_ui']=True
            (ROOT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
            print(json.dumps(report,ensure_ascii=False,indent=2))
            await browser.close()

ROOT.mkdir(parents=True,exist_ok=True)
asyncio.run(main())
