import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

await page.goto('http://127.0.0.1:38406/tree', { waitUntil: 'domcontentloaded' })
await page.evaluate(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await indexedDB.deleteDatabase('legacytree-db')
})
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('img', { name: '交互式家谱树' }).waitFor()
await page.getByPlaceholder('搜索成员').fill('林建国')
await page.getByPlaceholder('搜索成员').press('Enter')
await page.getByText('查看详情').waitFor()

await page.goto('http://127.0.0.1:38406/stories', { waitUntil: 'networkidle' })
await page.getByText('家族故事').waitFor()
await page.getByPlaceholder('故事标题').fill('端到端验证故事')
await page.getByPlaceholder('故事正文').fill('Playwright 写入的验证内容')
await page.getByRole('button', { name: '保存故事' }).click()
await page.getByText('端到端验证故事').waitFor()

await page.goto('http://127.0.0.1:38406/photos', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: '上传示例照片' }).click()
await page.getByRole('button', { name: '新上传的待修复照片' }).first().waitFor()
await page.getByRole('button', { name: '修复' }).first().click()
await page.waitForTimeout(500)

await page.goto('http://127.0.0.1:38406/legacy', { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: '数字资产、纪念品与信件交接' }).waitFor()
await page.getByPlaceholder('规划内容').fill('验证数字资产交接清单')
await page.getByRole('button', { name: '保存草稿' }).click()
await page.getByText('验证数字资产交接清单').waitFor()

// 疑似重复与合并：模拟旧家谱导入后留下的重复档案（同名，日期/籍贯不同，故事照片分散）
await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('legacytree-db')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const put = (store, record) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(record)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  await put('family', { id: 'm-father-dup', name: '林建国', gender: 'MALE', birthDate: '1963-11-02', deathDate: '', birthPlace: '浙江宁波', bio: '旧家谱导入的重复记录。', avatar: '', parentId: '', spouseIds: [], childrenIds: ['m-child'], generation: 2 })
  await put('stories', { id: 's-dup', authorId: 'm-father-dup', memberId: 'm-father-dup', title: '重复档案上的故事', content: '导入旧家谱时挂在重复档案下。', mediaUrls: [], category: 'MEMORY', date: '1990-01-01', isPublic: true })
  await put('photos', { id: 'p-dup', uploaderId: 'm-father-dup', memberId: 'm-father-dup', imageUrl: '', caption: '重复档案照片', year: 1988, location: '宁波', people: ['m-father-dup'], isRestored: false, restoredUrl: '' })
  await put('legacyPlans', { id: 'l-dup', memberId: 'm-father-dup', type: 'LETTER', content: '重复档案的受益人记录', beneficiaries: ['m-father-dup'], status: 'draft', createdAt: new Date().toISOString() })
})
await page.goto('http://127.0.0.1:38406/members/m-father', { waitUntil: 'networkidle' })
await page.getByText('发现疑似重复档案').waitFor()
await page.getByRole('button', { name: '合并重复档案' }).click()
await page.getByText('第一步：选定主档（合并后保留的档案）').waitFor()
const confirmMerge = page.getByRole('button', { name: '确认合并' })
if (!(await confirmMerge.isDisabled())) throw new Error('冲突未选择时确认合并应为禁用')
// 切换主档后之前的选择应作废，避免写错方向
const primaryGroup = page.locator('.merge-modal .n-radio-group').first()
await primaryGroup.getByText('浙江宁波').click()
if (!(await confirmMerge.isDisabled())) throw new Error('切换主档后应重新选择冲突字段')
await primaryGroup.getByText('上海').click()
await page.getByText('保留主档：1964-02-12').click()
await page.getByText('采用另一份：浙江宁波').click()
await page.getByText('保留主档：整理家谱资料并负责数字化迁移。').click()
if (await confirmMerge.isDisabled()) throw new Error('冲突全部选择后确认合并应可用')
await confirmMerge.click()
await page.getByText('合并完成，关系与资料已指向主档').waitFor()
await page.locator('.profile-hero').getByText('浙江宁波').waitFor()
await page.getByText('重复档案上的故事').waitFor()
await page.getByText('重复档案照片').waitFor()
await page.getByText('重复档案的受益人记录').waitFor()
if (await page.getByText('发现疑似重复档案').count()) throw new Error('合并后疑似重复提示应消失')
// 重新打开仍然有效
await page.reload({ waitUntil: 'networkidle' })
await page.locator('.profile-hero').getByText('浙江宁波').waitFor()
await page.getByText('重复档案上的故事').waitFor()
await page.getByText('重复档案的受益人记录').waitFor()
if (await page.getByText('发现疑似重复档案').count()) throw new Error('刷新后疑似重复提示不应再出现')
// 旧编号不再残留
const residual = await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('legacytree-db')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const chunks = []
  for (const name of ['family', 'stories', 'photos', 'legacyPlans']) {
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction(name, 'readonly').objectStore(name).getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    chunks.push(JSON.stringify(rows))
  }
  return chunks.join('\n').includes('m-father-dup')
})
if (residual) throw new Error('合并后不应残留旧编号 m-father-dup')
// 家谱树只保留一个林建国节点
await page.goto('http://127.0.0.1:38406/tree', { waitUntil: 'networkidle' })
await page.getByRole('img', { name: '交互式家谱树' }).waitFor()
const nameCount = await page.locator('.tree-node text').filter({ hasText: '林建国' }).count()
if (nameCount !== 1) throw new Error(`家谱树应只剩一个林建国节点，实际 ${nameCount} 个`)

await page.goto('http://127.0.0.1:38406/settings', { waitUntil: 'networkidle' })
await page.getByPlaceholder('设置或修改加密密码').fill('legacy-tree-test')
await page.getByRole('button', { name: '保存密码' }).click()
await page.getByText('密钥已在本次会话解锁').waitFor()
await page.getByText('深色').click()

await browser.close()

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log('Playwright smoke passed')
