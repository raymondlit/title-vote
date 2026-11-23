import asyncio, csv, io, json, os, re, time
from pathlib import Path
from playwright.async_api import async_playwright, expect
ROOT=Path('/tmp/browser/vote-stage4')
BASE='http://localhost:8080'
SLUG='e2e_vote_'+str(int(time.time()))
NAME='E2E投票演练大学 '+SLUG
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
    minted=json.loads(Path.home().joinpath('.cache/lovable-auth/session.json').read_text())
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        context=await browser.new_context(viewport={'width':1280,'height':1800})
        superpage=await context.new_page()
        await superpage.goto(BASE)
        await superpage.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
        await superpage.goto(BASE+'/super')
        await expect(superpage.get_by_role('heading',name='高校与管理员',exact=True)).to_be_visible()
        await superpage.get_by_label('学校名称',exact=True).fill(NAME)
        await superpage.get_by_label('标识（登录页地址，可留空自动生成）').fill(SLUG)
        await superpage.get_by_role('button',name='添加',exact=True).click()
        await expect(superpage.get_by_text('高校已添加',exact=True)).to_be_visible()
        created=True
        try:
            await superpage.reload()
            await expect(superpage.get_by_role('heading',name='高校与管理员',exact=True)).to_be_visible()
            await superpage.get_by_role('button',name=re.compile(r'^管理员（')).click()
            await superpage.locator('select').first.select_option(label=NAME)
            await superpage.get_by_label('管理员姓名',exact=True).fill('阶段四演练管理员')
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
            await page.get_by_label('按参评类型筛选').select_option(label='正高级')
            await expect(page.get_by_role('button',name='置顶',exact=True)).to_have_count(5)
            row=page.locator('div.hairline-t').filter(has=page.get_by_text('孙候选',exact=True))
            await row.get_by_role('button',name='置顶',exact=True).click()
            await expect(page.get_by_text('顺序已更新',exact=True)).to_be_visible()
            await page.reload()
            await page.get_by_label('按参评类型筛选').select_option(label='正高级')
            await expect(page.get_by_label('孙候选的序号')).to_have_value('1')
            rows=page.locator('div.hairline-t').filter(has=page.get_by_role('button',name='置顶',exact=True))
            assert await rows.count()==5
            groups=[await r.inner_text() for r in await rows.all()]
            assert sum('计算机科学' in s for s in groups)==2 and sum('机械工程' in s for s in groups)==3
            report['checks'].append('参评人5/5、正高级类别、2+3分组、置顶并刷新持久化通过')
            await snap(page,'2_candidates_saved')
            await page.goto(BASE+'/admin/judges')
            await expect(page.get_by_role('heading',name='评委管理',exact=True)).to_be_visible()
            async with page.expect_download() as dl:
                await page.get_by_role('button',name='下载名单模板 CSV',exact=True).click()
            await (await dl.value).save_as(ROOT/'judge_template.csv')
            judges=csv_file('judges.csv',[['姓名','工号','单位','职称','电话'],['评委A','E2E001','计算机学院','教授',''],['评委B','E2E002','机械学院','教授',''],['评委C','E2E003','机械学院','教授','']])
            t=time.perf_counter()
            await page.set_input_files('input[type=file]',judges)
            await expect(page.get_by_text('待导入 3 人',exact=True)).to_be_visible()
            report['timings_ms']['judge_parse']=round((time.perf_counter()-t)*1000,1)
            await snap(page,'3_judge_preview')
            t=time.perf_counter()
            await page.get_by_role('button',name='确认导入',exact=True).click()
            await expect(page.get_by_text('已导入 3 位评委，全部成功',exact=True)).to_be_visible(timeout=60000)
            await expect(page.get_by_role('heading',name='评委名单（3）',exact=True)).to_be_visible()
            report['timings_ms']['judge_import']=round((time.perf_counter()-t)*1000,1)
            account_table=page.locator('div.print-area table')
            creds=[]
            for tr in await account_table.locator('tbody tr').all():
                vals=await tr.locator('td').all_inner_texts()
                pw=vals[3]
                assert len(pw)==8 and pw.isalnum() and sum(c.isdigit() for c in pw)>=2 and sum(c.isalpha() for c in pw)>=2
                creds.append((vals[1],vals[2],pw))
            assert len(creds)==3 and len({v[1] for v in creds})==3
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
            await page.get_by_label('投票名称',exact=True).fill('阶段四全学科评审')
            await page.get_by_role('combobox').nth(0).click()
            await page.get_by_role('option',name='正高级',exact=True).click()
            t=time.perf_counter()
            await page.get_by_role('button',name='创建投票',exact=True).click()
            row=page.locator('li').filter(has=page.get_by_text('阶段四全学科评审',exact=True))
            await expect(row.get_by_text('阶段四全学科评审',exact=True)).to_be_visible()
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
            judge_pages=[]
            for i,(name,user,pw) in enumerate(creds):
                jc=await browser.new_context(viewport={'width':1280,'height':1800} if i==0 else {'width':820,'height':1180},has_touch=i>0,is_mobile=i>0)
                jp=await jc.new_page()
                jp.on('pageerror',lambda e: report['page_errors'].append(str(e)))
                t=time.perf_counter()
                await login(jp,user,pw)
                await jp.wait_for_url(re.compile(r'.*/vote/[a-f0-9-]+$'),timeout=30000)
                await expect(jp.get_by_role('row',name='孙候选，未表态',exact=True)).to_be_visible(timeout=30000)
                report['timings_ms']['judge_login_'+str(i+1)]=round((time.perf_counter()-t)*1000,1)
                judge_pages.append((jc,jp))
            # Judge must never gain admin-only totals access after query tuning.
            probe=await judge_pages[0][1].evaluate("""async ()=>{
                const k=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));
                if(!k) throw new Error('Missing test session');
                const session=JSON.parse(localStorage.getItem(k));
                const response=await fetch('/api/public/sb/rest/v1/rpc/get_session_summary',{
                    method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_UQxRquWpBxMn6S-MqvNMsA_ctSy7hFB',Authorization:'Bearer '+session.access_token},
                    body:JSON.stringify({_session_id:location.pathname.split('/').pop()})});
                return response.status;
            }""")
            assert probe==403
            report['checks'].append('评委请求管理员计票接口仍被403拒绝（预期权限测试）')
            async def choose(jp,name,label):
                r=jp.get_by_role('row',name=re.compile('^'+name+'，'))
                await r.get_by_role('button',name=label,exact=True).click()
            async def submit(jp):
                await jp.get_by_role('button',name='提交表决',exact=True).click()
                await expect(jp.get_by_role('alertdialog')).to_be_visible()
                await jp.get_by_role('alertdialog').get_by_role('button',name='确认提交',exact=True).click()
            async def confirmation(jp,recommended):
                await expect(jp.get_by_role('heading',name='表决确认单',exact=True)).to_be_visible(timeout=45000)
                table=jp.locator('div.print-area table')
                await expect(table.locator('tbody tr')).to_have_count(5)
                for n in ['张候选','李候选','王候选','赵候选','孙候选']:
                    await expect(table.locator('tr').filter(has=jp.get_by_text(n,exact=True)).locator('td').last).to_have_text('推荐' if n in recommended else '不推荐')
                assert await jp.get_by_role('button',name='提交表决',exact=True).count()==0
            pc,pp=judge_pages[2]
            await pp.evaluate("""()=>{window.__originalDraftWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('vote-draft:'))throw new DOMException('Full','QuotaExceededError');return window.__originalDraftWrite.call(this,k,v)}}""")
            await choose(pp,'孙候选','推荐')
            await pc.set_offline(True)
            await expect(pp.get_by_text(re.compile('网络已断开 ·'))).to_be_visible()
            await expect(pp.get_by_text(re.compile('本机保存失败；'))).to_be_visible()
            await expect(pp.get_by_text('网络已断开 · 选择仅保留在当前页面',exact=True)).to_be_visible()
            report['checks'].append('存储写入失败明确提示不刷新、不关闭，选择仅在当前页面保留')
            await snap(pp,'storage_failure_probe')
            await pp.evaluate('()=>{Storage.prototype.setItem=window.__originalDraftWrite}')
            await pp.get_by_role('button',name='重试保存',exact=True).click()
            await expect(pp.get_by_text(re.compile('未提交的选择已自动保存'))).to_be_visible()
            await pc.set_offline(False)
            await choose(pp,'孙候选','推荐')
            jc,jp=judge_pages[0]
            await jp.get_by_role('button',name='提交表决',exact=True).click()
            await expect(jp.get_by_role('alertdialog')).to_contain_text('还差 2 人')
            await jp.get_by_role('button',name='继续投票',exact=True).click()
            await choose(jp,'孙候选','推荐')
            await choose(jp,'张候选','推荐')
            await choose(jp,'李候选','推荐')
            await expect(jp.get_by_role('alertdialog')).to_contain_text('超出名额')
            await jp.get_by_role('button',name='继续投票（保留选择，稍后调整）',exact=True).click()
            await jp.get_by_role('button',name='提交表决',exact=True).click()
            await expect(jp.get_by_role('alertdialog')).to_contain_text('已超出 1 人')
            await jp.get_by_role('button',name='继续投票',exact=True).click()
            await choose(jp,'李候选','不推荐')
            await jp.get_by_role('button',name='提交表决',exact=True).click()
            await expect(jp.get_by_role('alertdialog')).to_contain_text('还有 2 人未表态')
            await jp.get_by_role('button',name='继续投票',exact=True).click()
            report['checks'].append('少荐、超荐、未逐一表态均阻止提交；允许返回调整而不丢选择')
            await snap(jp,'8_rules_desktop')
            await jp.reload()
            await expect(jp.get_by_role('row',name='孙候选，推荐',exact=True)).to_be_visible(timeout=30000)
            await expect(jp.get_by_role('row',name='张候选，推荐',exact=True)).to_be_visible()
            await expect(jp.get_by_role('row',name='李候选，不推荐',exact=True)).to_be_visible()
            report['checks'].append('电脑刷新后恢复3项未提交选择')
            await jc.set_offline(True)
            await expect(jp.get_by_text('网络已断开 · 选择仍保存在本机',exact=True)).to_be_visible()
            await choose(jp,'王候选','不推荐')
            await choose(jp,'赵候选','不推荐')
            await snap(jp,'9_offline_desktop')
            await submit(jp)
            await expect(jp.get_by_role('region',name='选票提交状态')).to_contain_text('尚未计入结果')
            await expect(jp.get_by_role('button',name='已确认，等待服务器确认',exact=True)).to_be_disabled()
            await snap(jp,'10_offline_confirmed')
            await page.goto(BASE+'/admin/results')
            await page.get_by_role('combobox').first.click()
            await page.get_by_role('option',name='阶段四全学科评审',exact=True).click()
            await expect(page.get_by_text(re.compile('应到评委 3 人 · 已提交 0 人 · 未提交 3 人'))).to_be_visible(timeout=30000)
            report['checks'].append('断网仍可表态，确认选票持久锁定且管理员计票仍为0')
            t=time.perf_counter()
            await jc.set_offline(False)
            await confirmation(jp,{'孙候选','张候选'})
            report['timings_ms']['offline_reconnect_confirm']=round((time.perf_counter()-t)*1000,1)
            await snap(jp,'11_desktop_confirmation')
            await jp.reload()
            await confirmation(jp,{'孙候选','张候选'})
            report['checks'].append('恢复网络自动提交、刷新回读一致且不可修改')
            jc,jp=judge_pages[1]
            assert not await jp.evaluate('document.documentElement.scrollWidth>innerWidth')
            await choose(jp,'王候选','推荐')
            await jc.set_offline(True)
            await expect(jp.get_by_text('网络已断开 · 选择仍保存在本机',exact=True)).to_be_visible()
            await choose(jp,'赵候选','推荐')
            await choose(jp,'孙候选','不推荐')
            await choose(jp,'张候选','不推荐')
            await choose(jp,'李候选','不推荐')
            await jc.set_offline(False)
            await jp.reload()
            await expect(jp.get_by_role('row',name='赵候选，推荐',exact=True)).to_be_visible(timeout=30000)
            await expect(jp.get_by_role('row',name='王候选，推荐',exact=True)).to_be_visible()
            await expect(jp.get_by_text('表态完成 5/5',exact=True)).to_be_visible()
            await snap(jp,'12_ipad_portrait')
            await jp.set_viewport_size({'width':1180,'height':820})
            assert not await jp.evaluate('document.documentElement.scrollWidth>innerWidth')
            await snap(jp,'13_ipad_landscape')
            await jp.get_by_role('button',name='提交表决',exact=True).click()
            await snap(jp,'14_ipad_confirmation_dialog')
            await jp.get_by_role('button',name='返回修改',exact=True).click()
            t=time.perf_counter()
            await submit(jp)
            await confirmation(jp,{'王候选','赵候选'})
            report['timings_ms']['ipad_submit']=round((time.perf_counter()-t)*1000,1)
            report['checks'].append('iPad触控、竖横屏无横向溢出、断网未提交选择刷新恢复及正常提交通过')
            await snap(jp,'15_ipad_confirmation')
            jc,jp=judge_pages[2]
            for n in ['孙候选','李候选']: await choose(jp,n,'推荐')
            for n in ['张候选','王候选','赵候选']: await choose(jp,n,'不推荐')
            lost={'count':0,'posts':0}
            async def drop_response(route):
                req=route.request
                if req.method=='POST' and 'choices' in (req.post_data or '') and 'expectedUserId' in (req.post_data or ''):
                    lost['posts']+=1
                    if lost['count']==0:
                        response=await route.fetch()
                        assert response.status==200
                        lost['count']+=1
                        await route.abort('failed')
                        return
                await route.continue_()
            await jp.route('**/*',drop_response)
            t=time.perf_counter()
            await submit(jp)
            await confirmation(jp,{'孙候选','李候选'})
            assert lost['count']==1 and lost['posts']>=2
            report['timings_ms']['lost_response_reconcile']=round((time.perf_counter()-t)*1000,1)
            report['lost_response']=lost
            report['checks'].append('真实写入后故意丢弃成功响应，自动核对重试后同一选票回读一致')
            await page.reload()
            await page.get_by_role('combobox').first.click()
            await page.get_by_role('option',name='阶段四全学科评审',exact=True).click()
            await expect(page.get_by_text(re.compile('应到评委 3 人 · 已提交 3 人 · 未提交 0 人'))).to_be_visible(timeout=30000)
            summary=page.locator('table').filter(has=page.get_by_role('columnheader',name='推荐票数',exact=True)).first
            for n,expected in {'孙候选':2,'张候选':1,'李候选':1,'王候选':1,'赵候选':1}.items():
                await expect(summary.locator('tr').filter(has=page.get_by_text(n,exact=True)).locator('td').last).to_have_text(str(expected))
            await snap(page,'16_admin_results')
            await page.get_by_role('button',name='打印版式设置与预览',exact=True).click()
            await expect(page.get_by_role('combobox',name='选择预览评委')).to_be_visible(timeout=30000)
            await snap(page,'17_admin_sheets')
            report['checks'].append('管理员3/3选票、推荐票总计6票与每人票数准确，确认单按需读取成功')
            report['flow_http_errors']=list(report['http_errors'])
            (ROOT/'flow_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
            assert not report['flow_http_errors']
            report['passed']=True
        except Exception as e:
            report['failure']=type(e).__name__
            if 'page' in locals():
                print('CURRENT PAGE:',page.url)
                print('HEADINGS:',await page.get_by_role('heading').all_inner_texts())
                print('NOTICES:',await page.locator('[data-sonner-toast]').all_inner_texts())
                if '/admin/judges' not in page.url:
                    await snap(page,'failure')
            print('FAILED STEP:',type(e).__name__)
            raise
        finally:
            report['phase']='cleanup'
            for jc,jp in judge_pages: await jc.close()
            await admin_context.close()
            # Destructive cleanup is scoped only to the unique school created above.
            await superpage.reload()
            await superpage.get_by_role('button',name=re.compile(r'^高校（')).click()
            await superpage.locator('select').first.select_option('100')
            schoolrow=superpage.locator('div.hairline-t').filter(has=superpage.get_by_text(NAME,exact=True))
            await expect(schoolrow).to_have_count(1)
            await schoolrow.get_by_role('button',name='删除',exact=True).click()
            await superpage.get_by_role('button',name='确认删除',exact=True).click()
            await superpage.wait_for_function("()=>document.body.innerText.includes('该校仍有评审数据') || document.body.innerText.includes('高校已删除')")
            if '高校已删除' not in await superpage.locator('body').inner_text():
                await expect(superpage.get_by_role('button',name='一并永久删除',exact=True)).to_be_visible(timeout=30000)
                await superpage.get_by_role('button',name='一并永久删除',exact=True).click()
            await expect(superpage.get_by_text('高校已删除',exact=True)).to_be_visible(timeout=60000)
            await expect(superpage.get_by_text(NAME,exact=True)).to_have_count(0)
            report['cleanup_ui']=True
            (ROOT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
            print(json.dumps(report,ensure_ascii=False,indent=2))
            await browser.close()

ROOT.mkdir(parents=True,exist_ok=True)
asyncio.run(main())
