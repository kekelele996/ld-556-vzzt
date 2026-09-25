import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })

await page.goto('http://127.0.0.1:38406/tree', { waitUntil: 'domcontentloaded' })
await page.evaluate(async () => {
  localStorage.clear(); sessionStorage.clear()
  await indexedDB.deleteDatabase('legacytree-db')
})
await page.reload({ waitUntil: 'networkidle' })
await page.evaluate(async () => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
  const { useFamilyStore } = await import('/src/stores/familyStore.ts')
  const family = useFamilyStore(pinia)
  await family.hydrate()
  await family.addMember({
    id: 'dup-b', name: '林启明', gender: 'MALE',
    birthDate: '1933-01-01', deathDate: '', birthPlace: '上海',
    bio: '旧档', avatar: '', parentId: '', spouseIds: [], childrenIds: [], generation: 2
  })
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)

// 1. 两个林启明节点都应有疑似重复橙点
let dots = await page.locator('.dup-dot').count()
if (dots !== 2) throw new Error('合并前应有 2 个疑似重复标记，实际 ' + dots)

// 2. 从树节点打开抽屉 -> 看到疑似重复提示 -> 点合并
await page.locator('.tree-node', { hasText: '林启明' }).first().click()
await page.getByText('发现 1 份同名资料').waitFor()
await page.locator('.n-drawer').getByRole('button', { name: '合并' }).click()
await page.getByText('合并疑似重复成员').waitFor()

// 3. 取消按钮可关闭且不改动数据
await page.getByRole('button', { name: '取消' }).click()
await page.waitForTimeout(200)
const stillTwo = await page.locator('.dup-dot').count()
if (stillTwo !== 2) throw new Error('取消合并后重复标记应保留，实际 ' + stillTwo)

// 4. 重新打开并真正合并（从抽屉入口）
await page.locator('.n-drawer').getByRole('button', { name: '合并' }).click()
const rows = page.locator('.field-row')
const count = await rows.count()
for (let i = 1; i < count; i++) {
  const btn = rows.nth(i).locator('.n-radio-button').filter({ hasText: '取主档' })
  if (await btn.count()) await btn.click()
}
await page.getByRole('button', { name: '确认合并' }).click()
await page.getByText('已合并到主档').waitFor()
await page.waitForTimeout(600)
dots = await page.locator('.dup-dot').count()
if (dots !== 0) throw new Error('合并后树节点重复标记应消失，实际 ' + dots)

await browser.close()
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log('tree drawer merge E2E passed')
