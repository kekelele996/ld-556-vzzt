import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push('PAGEERROR: ' + error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push('CONSOLE: ' + message.text())
})

await page.goto('http://127.0.0.1:38406/tree', { waitUntil: 'domcontentloaded' })
await page.evaluate(async () => {
  localStorage.clear(); sessionStorage.clear()
  await indexedDB.deleteDatabase('legacytree-db')
})
await page.reload({ waitUntil: 'networkidle' })

await page.evaluate(async () => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
  const { useFamilyStore } = await import('/src/stores/familyStore.ts')
  const { useStoryStore } = await import('/src/stores/storyStore.ts')
  const family = useFamilyStore(pinia)
  const stories = useStoryStore(pinia)
  await Promise.all([family.hydrate(), stories.hydrate()])
  await family.addMember({
    id: 'dup-b', name: '林启明', gender: 'MALE',
    birthDate: '1933-01-01', deathDate: '', birthPlace: '上海',
    bio: '旧档', avatar: '', parentId: '', spouseIds: [], childrenIds: [], generation: 2
  })
  await stories.saveStory({ id: 's-b', authorId: 'dup-b', memberId: 'dup-b', title: '副档故事', content: '', mediaUrls: [], category: 'MEMORY', date: '1950-01-01', isPublic: true })
})

await page.goto('http://127.0.0.1:38406/members/dup-b', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: '合并资料' }).click()
await page.getByText('合并疑似重复成员').waitFor()

// 在弹窗里把主档切换为 dup-b（旧档作为保留主档）
await page.locator('.n-radio').filter({ hasText: 'dup-b' }).locator('input').check({ force: true })
await page.waitForTimeout(200)
if (!(await page.locator('.n-radio').filter({ hasText: 'dup-b' }).locator('input').isChecked())) {
  throw new Error('dup-b 主档单选项未选中')
}
// 主档说明（保留 + 编号 dup-b）出现在单选项中
await page.locator('.n-radio').filter({ hasText: '保留' }).filter({ hasText: '编号 dup-b' }).waitFor()

// 解决所有冲突：全部取主档（即旧档值）
const rows = page.locator('.field-row')
const count = await rows.count()
for (let i = 1; i < count; i++) {
  const btn = rows.nth(i).locator('.n-radio-button').filter({ hasText: '取主档' })
  if (await btn.count()) await btn.click()
}
await page.getByRole('button', { name: '确认合并' }).click()
await page.getByText('已合并到主档').waitFor({ timeout: 5000 })
await page.waitForURL(/members\/dup-b/, { timeout: 5000 })

const result = await page.evaluate(async () => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
  const { useFamilyStore } = await import('/src/stores/familyStore.ts')
  const { useStoryStore } = await import('/src/stores/storyStore.ts')
  const family = useFamilyStore(pinia)
  const stories = useStoryStore(pinia)
  const main = family.getById('dup-b')
  const old = family.getById('m-ancestor')
  return {
    primaryKept: !!main,
    otherRemoved: !old,
    // 旧档主档保留自己的上海；m-ancestor 的宁波被放弃
    birthPlace: main?.birthPlace,
    // m-ancestor 上的关系（配偶 m-grandma / 子女 m-father）应并到 dup-b
    spouses: main?.spouseIds,
    children: main?.childrenIds,
    generation: main?.generation,
    // m-ancestor 的故事 s-1 改挂 dup-b
    storyMoved: stories.stories.find((s) => s.id === 's-1')?.memberId,
    blob: JSON.stringify(family.members)
  }
})
console.log(JSON.stringify(result, null, 2))
if (!result.primaryKept) throw new Error('选定的主档 dup-b 应保留')
if (!result.otherRemoved) throw new Error('副档 m-ancestor 应删除')
if (result.birthPlace !== '上海') throw new Error('冲突字段应取主档（上海）')
if (!result.spouses.includes('m-grandma')) throw new Error('副档配偶应并入主档')
if (!result.children.includes('m-father')) throw new Error('副档子女应并入主档')
if (result.generation !== 1) throw new Error('世代应取较小值')
if (result.storyMoved !== 'dup-b') throw new Error('副档故事应改指向主档')
if (result.blob.includes('m-ancestor')) throw new Error('旧编号 m-ancestor 残留')

await browser.close()
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log('switch-primary E2E passed')
