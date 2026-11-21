import asyncio, csv, io, json, os, re, time
from pathlib import Path
from playwright.async_api import async_playwright, expect
ROOT=Path('/tmp/browser/roster-stage2')
BASE='http://localhost:8080'
SLUG='e2e_roster_'+str(int(time.time()))
NAME='E2E名册演练大学 '+SLUG
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
            await superpage.get_by_label('管理员姓名',exact=True).fill('阶段二演练管理员')
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
                    print('CANDIDATE ERROR:',response.request.method,await response.text())
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
            async with page.expect_download() as dl:
                await page.get_by_role('button',name='导出表格',exact=True).click()
            download=await dl.value
            path=await download.path()
            with open(path,encoding='utf-8-sig') as f: exported=list(csv.reader(f))
            assert len(exported)==4 and exported[1:]==[list(v) for v in creds]
            report['checks'].append('评委3/3创建、三套唯一账号、8位混合密码与导出对照表一致')
            await page.get_by_role('button',name='我已保存',exact=True).click()
            await page.get_by_label('全选本页',exact=True).check()
            # Observe native print document without leaking credentials into screenshots or logs.
            context_script="window.print=()=>{window.__printed=true};window.close=()=>{}"
            await admin_context.add_init_script(context_script)
            async with page.expect_popup() as popup_info:
                await page.get_by_role('button',name='打印密码本（已选 3 人）',exact=True).click()
            popup=await popup_info.value
            await popup.wait_for_selector('tbody.slip')
            assert await popup.locator('tbody.slip').count()==3
            assert await popup.locator('tr.url').count()==3
            assert all(BASE+'/school/'+SLUG in v for v in await popup.locator('tr.url').all_inner_texts())
            css=await popup.locator('style').inner_text()
            assert 'break-inside:avoid' in css and 'dashed' in css
            await popup.locator('tbody.slip tr:first-child td:nth-child(4)').evaluate_all("els=>els.forEach(e=>e.textContent='••••••••')")
            await snap(popup,'4_password_slips_redacted')
            await popup.close()
            t=time.perf_counter()
            async with page.expect_download(timeout=60000) as dl:
                await page.get_by_role('button',name='导出密码本 PDF',exact=True).click()
            pdf=await dl.value
            await pdf.save_as(ROOT/'password_book.pdf')
            report['timings_ms']['password_pdf']=round((time.perf_counter()-t)*1000,1)
            report['checks'].append('密码本三条独立裁切条、逐条登录网址、防跨页规则及PDF下载通过')
            # Credentials stay in memory; verify every imported account can authenticate.
            for name,user,pw in creds:
                jc=await browser.new_context(viewport={'width':1280,'height':1800})
                jp=await jc.new_page()
                await login(jp,user,pw)
                await jp.wait_for_url('**/vote',timeout=30000)
                await expect(jp.get_by_text(name,exact=True).first).to_be_visible()
                await jc.close()
            report['checks'].append('三位新导入评委均实际登录成功')
            await page.get_by_role('button',name='关闭',exact=True).click()
            await snap(page,'5_judges_saved')
            report['passed']=True
        except Exception as e:
            report['failure']=type(e).__name__
            if 'page' in locals():
                print('CURRENT PAGE:',page.url)
                print('HEADINGS:',await page.get_by_role('heading').all_inner_texts())
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

asyncio.run(main())
