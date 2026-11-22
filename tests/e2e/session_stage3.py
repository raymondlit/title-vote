import asyncio, csv, io, json, os, re, time
from pathlib import Path
from playwright.async_api import async_playwright, expect
ROOT=Path('/tmp/browser/session-stage3')
BASE='http://localhost:8080'
SLUG='e2e_sessions_'+str(int(time.time()))
NAME='E2E场次演练大学 '+SLUG
report={'school_slug':SLUG,'timings_ms':{},'checks':[],'http_errors':[],'page_errors':[]}

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
            await superpage.get_by_label('管理员姓名',exact=True).fill('阶段三演练管理员')
            await superpage.get_by_role('button',name='生成账号',exact=True).click()
            cred=superpage.locator('p').filter(has_text='请立即复制保存，仅显示一次')
            await expect(cred).to_be_visible(timeout=30000)
            text=await cred.inner_text()
            username=re.search('管理员「([^」]+)」',text).group(1)
            password=await cred.locator('span').inner_text()
            admin_context=await browser.new_context(viewport={'width':1280,'height':1800})
            page=await admin_context.new_page()
            async def record_candidate_error(response):
                if response.status>=400 and '/rest/v1/candidates' in response.url:
                    report['checks'].append('参评人请求异常')
            page.on('response',record_candidate_error)
            page.on('pageerror',lambda e: report['page_errors'].append(str(e)))
            page.on('response',lambda r: report['http_errors'].append({'path':r.url.split(BASE)[-1].split('?')[0],'status':r.status}) if r.status>=400 and r.url.startswith(BASE) else None)
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
            await page.get_by_label('投票名称',exact=True).fill('阶段三全学科评审')
            await page.get_by_role('combobox').nth(0).click()
            await page.get_by_role('option',name='正高级',exact=True).click()
            t=time.perf_counter()
            await page.get_by_role('button',name='创建投票',exact=True).click()
            row=page.locator('li').filter(has=page.get_by_text('阶段三全学科评审',exact=True))
            await expect(row.get_by_text('阶段三全学科评审',exact=True)).to_be_visible()
            await expect(row).to_contain_text('未开始')
            report['timings_ms']['create_session']=round((time.perf_counter()-t)*1000,1)
            await row.get_by_role('button',name='预览名单',exact=True).click()
            await expect(page.get_by_role('dialog')).to_be_visible()
            await expect(page.get_by_role('dialog').get_by_text('孙候选',exact=True)).to_be_visible()
            await snap(page,'7_preview')
            preview=await page.get_by_role('dialog').inner_text()
            assert all(n in preview for n in ['张候选','李候选','王候选','赵候选','孙候选','计算机科学','机械工程'])
            await page.keyboard.press('Escape')
            judge_pages=[]
            for name,user,pw in creds:
                jc=await browser.new_context(viewport={'width':1280,'height':1800})
                jp=await jc.new_page()
                await login(jp,user,pw)
                await jp.wait_for_url('**/vote',timeout=30000)
                await expect(jp.get_by_text('暂无进行中的投票。',exact=True)).to_be_visible()
                judge_pages.append((jc,jp))
            report['checks'].append('草稿场次对3位评委隐藏')
            t=time.perf_counter()
            await row.get_by_role('button',name='开启投票',exact=True).click()
            await expect(row.get_by_role('button',name='结束投票',exact=True)).to_be_visible()
            report['timings_ms']['open_session']=round((time.perf_counter()-t)*1000,1)
            for i,(jc,jp) in enumerate(judge_pages):
                t=time.perf_counter()
                await jp.reload()
                await jp.wait_for_url(re.compile(r'.*/vote/[a-f0-9-]+$'),timeout=30000)
                await expect(jp.get_by_role('heading',name='阶段三全学科评审',exact=True)).to_be_visible(timeout=30000)
                await expect(jp.get_by_text(re.compile('本场参评 5 人，推荐名额 2 人'))).to_be_visible()
                for n in ['张候选','李候选','王候选','赵候选','孙候选']:
                    await expect(jp.get_by_role('row',name=n+'，未表态',exact=True)).to_be_visible()
                report['timings_ms']['judge_open_'+str(i+1)]=round((time.perf_counter()-t)*1000,1)
            await snap(judge_pages[0][1],'8_judge_open')
            report['checks'].append('3位评委自动直达、5位候选人两组和2人名额正确')
            await page.set_viewport_size({'width':485,'height':1475})
            await snap(page,'9_admin_mobile')
            report['mobile_overflow']=await page.evaluate('document.documentElement.scrollWidth>innerWidth')
            await page.set_viewport_size({'width':1280,'height':1800})
            t=time.perf_counter()
            await row.get_by_role('button',name='结束投票',exact=True).click()
            await expect(row).to_contain_text('已结束')
            report['timings_ms']['close_session']=round((time.perf_counter()-t)*1000,1)
            for jc,jp in judge_pages:
                await jp.reload()
                await expect(jp.get_by_text('该场投票已结束，您未提交表决。',exact=True)).to_be_visible(timeout=30000)
                await jc.close()
            report['checks'].append('结束后3位未提交评委不能继续投票')
            await snap(page,'10_closed')
            await row.get_by_role('button',name='归档',exact=True).click()
            await page.get_by_role('alertdialog').get_by_role('button',name='归档',exact=True).click()
            await expect(row).to_have_count(0)
            await page.get_by_role('tab',name='归档区 1',exact=True).click()
            await expect(row).to_contain_text('已结束')
            await row.get_by_role('button',name='取回',exact=True).click()
            await page.get_by_role('alertdialog').get_by_role('button',name='取回',exact=True).click()
            await page.get_by_role('tab',name='当前场次 1',exact=True).click()
            await expect(row).to_contain_text('已结束')
            report['checks'].append('归档隐藏与取回原场次通过')
            await page.get_by_role('button',name='加载评审对象',exact=True).click()
            await expect(page.get_by_text('已按学科分组生成 2 个投票场次',exact=True)).to_be_visible()
            await expect(page.locator('li').filter(has=page.get_by_role('button',name='开启投票',exact=True))).to_have_count(2)
            await page.get_by_role('button',name='加载评审对象',exact=True).click()
            await expect(page.get_by_text('各学科小组的投票场次已存在',exact=True)).to_be_visible()
            await expect(page.locator('li').filter(has=page.get_by_role('button',name='开启投票',exact=True))).to_have_count(2)
            report['checks'].append('按两学科生成草稿场次、重复加载不重复建场')
            report['passed']=True
        except Exception as e:
            report['failure']=type(e).__name__
            if 'page' in locals():
                print('CURRENT PAGE:',page.url)
                print('HEADINGS:',await page.get_by_role('heading').all_inner_texts())
                print('NOTICES:',await page.locator('[data-sonner-toast]').all_inner_texts())
                if '/admin/judges' not in page.url:
                    await snap(page,'failure')
            print('FAILED STEP:',type(e).__name__,str(e).split('Call log:')[0])
            raise
        finally:
            # Destructive cleanup is scoped only to the unique school created above.
            await superpage.reload()
            await superpage.get_by_role('button',name=re.compile(r'^高校（')).click()
            await superpage.locator('select').first.select_option('100')
            schoolrow=superpage.locator('div.hairline-t').filter(has=superpage.get_by_text(NAME,exact=True))
            await expect(schoolrow).to_have_count(1)
            await schoolrow.get_by_role('button',name='删除',exact=True).click()
            await superpage.get_by_role('button',name='确认删除',exact=True).click()
            await superpage.wait_for_function("()=>document.body.innerText.includes('该校仍有评审数据') || document.body.innerText.includes('高校已删除')")
            if await superpage.get_by_role('button',name='一并永久删除',exact=True).count():
                await superpage.get_by_role('button',name='一并永久删除',exact=True).click()
            await expect(superpage.get_by_text('高校已删除',exact=True)).to_be_visible(timeout=60000)
            await expect(superpage.get_by_text(NAME,exact=True)).to_have_count(0)
            report['cleanup_ui']=True
            (ROOT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
            print(json.dumps(report,ensure_ascii=False,indent=2))
            await browser.close()

ROOT.mkdir(parents=True,exist_ok=True)
asyncio.run(main())
