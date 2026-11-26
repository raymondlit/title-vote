import asyncio, csv, io, json, os, re, time
from pathlib import Path
from playwright.async_api import async_playwright, expect
ROOT=Path('/tmp/browser/admin-stage7')
BASE='http://localhost:8080'
SLUG='e2e_admin7_'+str(int(time.time()))
NAME='E2E管理核算演练大学 '+SLUG
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
            await superpage.get_by_label('管理员姓名',exact=True).fill('阶段七演练管理员')
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
            judges=csv_file('judges.csv', [['姓名','工号','单位','职称','电话']]+[[f'并发评委{i+1:02}',f'E2E{i+1:03}','测试学院','教授',''] for i in range(4)])
            await page.set_input_files('input[type=file]',judges)
            await expect(page.get_by_text('待导入 4 人',exact=True)).to_be_visible()
            await page.get_by_role('button',name='确认导入',exact=True).click()
            await expect(page.get_by_text('已导入 4 位评委，全部成功',exact=True)).to_be_visible(timeout=180000)
            creds=[]
            for tr in await page.locator('div.print-area table tbody tr').all():
                vals=await tr.locator('td').all_inner_texts()
                creds.append((vals[1],vals[2],vals[3]))
            assert len(creds)==4
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
            await page.get_by_label('投票名称',exact=True).fill('阶段七表态交互')
            await page.get_by_role('combobox').nth(0).click()
            await page.get_by_role('option',name='正高级',exact=True).click()
            t=time.perf_counter()
            await page.get_by_role('button',name='创建投票',exact=True).click()
            row=page.locator('li').filter(has=page.get_by_text('阶段七表态交互',exact=True))
            await expect(row.get_by_text('阶段七表态交互',exact=True)).to_be_visible()
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
            ids=[c['id'] for c in candidates]
            await admin_context.route('**/realtime/v1/**',lambda r:r.abort())
            await page.goto(BASE+'/admin/results')
            await page.get_by_role('combobox').first.click()
            await page.get_by_role('option',name='阶段七表态交互',exact=True).click()
            def progress(n):
                return page.get_by_text(re.compile(f'应到评委 4 人 · 已提交 {n} 人 · 未提交 {4-n} 人'))
            await expect(progress(0)).to_be_visible(timeout=45000)
            report['checks'].append('空场次0/4，全部评委列为未提交')
            dashboard=await admin_context.new_page()
            await dashboard.goto(BASE+'/admin')
            await expect(dashboard.get_by_role('heading',name='评审进度看板',exact=True)).to_be_visible()
            metric=dashboard.get_by_text('已提交表决',exact=True).locator('..')
            await expect(metric).to_contain_text('0')
            expected={id:0 for id in ids}
            for i,(jc,jp) in enumerate(judge_pages[:3]):
                picks={ids[i],ids[(i+1)%5]}
                for id in picks: expected[id]+=1
                choices=[{'candidateId':id,'choice':'recommend' if id in picks else 'not_recommend'} for id in ids]
                if i==0:
                    for c in candidates:
                        await jp.get_by_role('row',name=re.compile('^'+c['full_name']+'，')).get_by_role('button',name='推荐' if c['id'] in picks else '不推荐',exact=True).click()
                    await jp.get_by_role('button',name='提交表决',exact=True).click()
                    await jp.get_by_role('alertdialog').get_by_role('button',name='确认提交',exact=True).click()
                    await expect(jp.get_by_role('heading',name='表决确认单',exact=True)).to_be_visible(timeout=60000)
                else:
                    r=await api(jp,'rpc/submit_ballot',{'_session_id':report['session_id'],'_choices':choices})
                    assert r['status']==200
                t=time.perf_counter()
                await expect(progress(i+1)).to_be_visible(timeout=25000)
                report['timings_ms']['live_refresh_'+str(i+1)]=round((time.perf_counter()-t)*1000,1)
                table=page.locator('table').filter(has=page.get_by_role('columnheader',name='推荐票数',exact=True)).first
                for c in candidates:
                    await expect(table.locator('tr').filter(has=page.get_by_text(c['full_name'],exact=True)).locator('td').last).to_have_text(str(expected[c['id']]))
            await expect(metric).to_contain_text('3',timeout=15000)
            await snap(dashboard,'14_dashboard_counts')
            await dashboard.close()
            report['checks'].append('保持首页看板打开，自动更新已提交表决0→3')
            await snap(page,'8_live_counts')
            report['checks'].append('关闭实时连接后连续3次轮询刷新，无需手动刷新；逐对象推荐数与预期一致')
            ballots=(await api(page,'ballots?select=id,judge_id&session_id=eq.'+report['session_id']))['data']
            items=(await api(page,'rpc/get_ballot_items_page',{'_ballot_ids':[b['id'] for b in ballots],'_offset':0}))['data']
            assert len(ballots)==3 and len(items)==15
            counts={id:sum(x['candidate_id']==id and x['choice']=='recommend' for x in items) for id in ids}
            assert counts==expected and sum(counts.values())==6
            summary=(await api(page,'rpc/get_session_summary',{'_session_id':report['session_id']}))['data']
            assert len(summary['ballots'])==3
            assert {c['candidate_id']:c['recommend'] for c in summary['counts']}==counts
            report['checks'].append('3张选票、15条明细、6次推荐：预期、明细、聚合、页面四方一致')
            await page.get_by_role('button',name='查看评委确认单',exact=True).click()
            await expect(page.get_by_role('button',name='打印本人确认单',exact=True)).to_have_count(3,timeout=30000)
            await snap(page,'9_confirmation_sheets')
            async with page.expect_download() as dl:
                await page.get_by_role('button',name='导出 Word',exact=True).click()
            await (await dl.value).save_as(ROOT/'results.doc')
            assert (ROOT/'results.doc').stat().st_size>1000
            async with page.expect_popup() as popup:
                await page.get_by_role('button',name='打印总表',exact=True).click()
            printpage=await popup.value
            await printpage.wait_for_load_state()
            await expect(printpage.get_by_text(re.compile('应到评委 4 人 · 已提交 3 人'))).to_be_visible()
            await snap(printpage,'10_print_summary')
            await printpage.close()
            report['checks'].append('3份评委确认单、Word下载及总表打印窗口与票数一致')
            await expect(page.get_by_role('button',name='结束场次后可归档',exact=True)).to_be_disabled()
            await page.goto(BASE+'/admin/sessions')
            row=page.locator('li').filter(has=page.get_by_text('阶段七表态交互',exact=True))
            await row.get_by_role('button',name='结束投票',exact=True).click()
            await expect(row).to_contain_text('已结束')
            await page.goto(BASE+'/admin/results')
            await page.get_by_role('combobox').first.click()
            await page.get_by_role('option',name='阶段七表态交互',exact=True).click()
            await expect(progress(3)).to_be_visible(timeout=30000)
            await page.get_by_role('button',name='归档本场结果',exact=True).click()
            await expect(page.get_by_text('已归档，可在页面底部「归档记录」随时查看',exact=True)).to_be_visible(timeout=30000)
            archives=(await api(page,'vote_archives?select=id,snapshot&session_id=eq.'+report['session_id']))['data']
            assert len(archives)==1
            snapshot=archives[0]['snapshot']
            assert snapshot['submitted']==3 and snapshot['judgeCount']==4 and len(snapshot['sheets'])==3
            assert {r['name']:r['recommend'] for r in snapshot['summary']}=={c['full_name']:expected[c['id']] for c in candidates}
            assert all(len(s['rows'])==5 for s in snapshot['sheets'])
            async with page.expect_popup() as popup:
                await page.get_by_role('button',name='查看/打印',exact=True).click()
            archivepage=await popup.value
            await archivepage.wait_for_load_state()
            await expect(archivepage.get_by_text(re.compile('归档投票结果（应到评委 4 人 · 已提交 3 人）'))).to_be_visible()
            await snap(archivepage,'11_archive_print')
            await archivepage.close()
            report['checks'].append('结束前禁用结果存档；结束后完整保存总表及3份确认单，存档可打印')
            await page.goto(BASE+'/admin/sessions')
            row=page.locator('li').filter(has=page.get_by_text('阶段七表态交互',exact=True))
            await row.get_by_role('button',name='删除',exact=True).click()
            dialog=page.get_by_role('dialog')
            await expect(dialog.get_by_text(re.compile('请改用「归档」'))).to_be_visible()
            await page.keyboard.press('Escape')
            await row.get_by_role('button',name='归档',exact=True).click()
            await page.get_by_role('alertdialog').get_by_role('button',name='归档',exact=True).click()
            await expect(row).to_have_count(0)
            hidden=(await api(judge_pages[3][1],'vote_sessions?select=id&id=eq.'+report['session_id']))['data']
            assert hidden==[]
            await page.get_by_role('tab',name=re.compile('归档区')).click()
            await expect(row.get_by_role('button',name='取回',exact=True)).to_be_visible()
            await snap(page,'12_archived_session')
            before=(await api(page,'rpc/get_ballot_items_page',{'_ballot_ids':[b['id'] for b in ballots],'_offset':0}))['data']
            assert before==items
            await row.get_by_role('button',name='取回',exact=True).click()
            await page.get_by_role('alertdialog').get_by_role('button',name='取回',exact=True).click()
            await page.get_by_role('tab',name=re.compile('当前场次')).click()
            await expect(row).to_contain_text('已结束')
            visible=(await api(judge_pages[3][1],'vote_sessions?select=id&id=eq.'+report['session_id']))['data']
            assert len(visible)==1
            after=(await api(page,'rpc/get_ballot_items_page',{'_ballot_ids':[b['id'] for b in ballots],'_offset':0}))['data']
            assert after==items
            await page.goto(BASE+'/admin/results')
            await page.get_by_role('combobox').first.click()
            await page.get_by_role('option',name='阶段七表态交互',exact=True).click()
            await expect(progress(3)).to_be_visible(timeout=30000)
            assert (await api(page,'vote_archives?select=snapshot&session_id=eq.'+report['session_id']))['data'][0]['snapshot']==snapshot
            await snap(page,'13_restored_results')
            report['checks'].append('删除提示密码及归档替代；场次归档对评委隐藏，取回后状态与全部选票/存档不变')
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
