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
  localStorage.clear()
  sessionStorage.clear()
  await indexedDB.deleteDatabase('legacytree-db')
})
await page.reload({ waitUntil: 'networkidle' })

// 通过 store 在 DB 中构造“导入旧家谱后”的重复场景：
// B 与现有成员 m-ancestor（林启明）同名，但出生日期/籍贯不同，
// 且挂着独立的故事、照片人物、遗产受益人。
await page.evaluate(async () => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
  const { useFamilyStore } = await import('/src/stores/familyStore.ts')
  const { useStoryStore } = await import('/src/stores/storyStore.ts')
  const { usePhotoStore } = await import('/src/stores/photoStore.ts')
  const { useLegacyStore } = await import('/src/stores/legacyStore.ts')
  const family = useFamilyStore(pinia)
  const stories = useStoryStore(pinia)
  const photos = usePhotoStore(pinia)
  const legacy = useLegacyStore(pinia)
  await Promise.all([family.hydrate(), stories.hydrate(), photos.hydrate(), legacy.hydrate()])

  await family.addMember({
    id: 'dup-b', name: '林启明', gender: 'MALE',
    birthDate: '1933-01-01', deathDate: '', birthPlace: '上海',
    bio: '旧家谱导入的第二份资料', avatar: '',
    parentId: '', spouseIds: [], childrenIds: [], generation: 2
  })
  await stories.saveStory({ id: 'dup-story', authorId: 'dup-b', memberId: 'dup-b', title: '旧档专属故事', content: '只挂在副档', mediaUrls: [], category: 'MEMORY', date: '1950-01-01', isPublic: true })
  await photos.savePhoto({ id: 'dup-photo', uploaderId: 'dup-b', memberId: 'dup-b', imageUrl: '', caption: '旧档照片', year: 1951, location: '上海', people: ['dup-b', 'm-father'], isRestored: false, restoredUrl: '' })
  await legacy.savePlan({ id: 'dup-plan', memberId: 'dup-b', type: 'WILL', content: '旧档遗嘱', beneficiaries: ['dup-b', 'm-child'], status: 'draft', createdAt: new Date().toISOString() })
})

// 1. 成员详情应标出疑似重复
await page.goto('http://127.0.0.1:38406/members/m-ancestor', { waitUntil: 'networkidle' })
await page.getByText('疑似重复').first().waitFor({ timeout: 5000 })
await page.getByText('旧档专属故事', { exact: false }).waitFor({ state: 'detached' }).catch(() => {})

// 2. 打开合并弹窗
await page.getByRole('button', { name: '合并资料' }).click()
await page.getByText('合并疑似重复成员').waitFor()
// 冲突字段（籍贯：浙江宁波 vs 上海）需要手选；确认按钮初始禁用
const confirmBtn = page.getByRole('button', { name: '确认合并' })
const disabledBefore = await confirmBtn.isDisabled()
if (!disabledBefore) throw new Error('存在未解决冲突时确认按钮应当禁用')
// 籍贯冲突选择“取另一份”（上海），出生日期只有副档有 -> 自动补齐
const rows = page.locator('.field-row')
const count = await rows.count()
for (let i = 1; i < count; i++) {
  const btn = rows.nth(i).locator('.n-radio-button').filter({ hasText: '取另一份' })
  if (await btn.count()) await btn.click()
}
await page.waitForTimeout(200)
const disabledAfter = await confirmBtn.isDisabled()
if (disabledAfter) throw new Error('冲突解决后确认按钮应当可点')
await confirmBtn.click()
await page.getByText('已合并到主档').waitFor({ timeout: 5000 })

// 3. URL 仍在主档，副档故事/照片/遗产已归并显示
await page.waitForURL(/members\/m-ancestor/, { timeout: 5000 })
await page.getByText('旧档专属故事').waitFor({ timeout: 5000 })
await page.getByText('旧档遗嘱').waitFor({ timeout: 5000 })

// 4. 校验内存与持久化：旧编号不再残留
const checks = await page.evaluate(async () => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
  const { useFamilyStore } = await import('/src/stores/familyStore.ts')
  const { useStoryStore } = await import('/src/stores/storyStore.ts')
  const { usePhotoStore } = await import('/src/stores/photoStore.ts')
  const { useLegacyStore } = await import('/src/stores/legacyStore.ts')
  const family = useFamilyStore(pinia)
  const stories = useStoryStore(pinia)
  const photos = usePhotoStore(pinia)
  const legacy = useLegacyStore(pinia)
  const blob = JSON.stringify({ family: family.members, stories: stories.stories, photos: photos.photos, plans: legacy.plans })
  const main = family.getById('m-ancestor')
  return {
    oldIdGone: !family.getById('dup-b'),
    noResidual: !blob.includes('dup-b'),
    duplicateCleared: family.duplicateGroups.length === 0,
    birthDateFilled: main.birthDate === '1933-01-01',
    birthPlaceChosen: main.birthPlace === '上海',
    storyMember: stories.stories.find((s) => s.id === 'dup-story').memberId,
    storyAuthor: stories.stories.find((s) => s.id === 'dup-story').authorId,
    photoPeople: photos.photos.find((p) => p.id === 'dup-photo').people,
    photoMember: photos.photos.find((p) => p.id === 'dup-photo').memberId,
    planBeneficiaries: legacy.plans.find((p) => p.id === 'dup-plan').beneficiaries
  }
})
console.log(JSON.stringify(checks, null, 2))
assertChecks(checks)

// 5. 重新打开页面（模拟重新打开应用），合并结果仍然有效
await page.reload({ waitUntil: 'networkidle' })
await page.getByText('林启明').first().waitFor()
const persisted = await page.evaluate(async () => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
  const { useFamilyStore } = await import('/src/stores/familyStore.ts')
  const { useStoryStore } = await import('/src/stores/storyStore.ts')
  const family = useFamilyStore(pinia)
  const stories = useStoryStore(pinia)
  await Promise.all([family.hydrate(), stories.hydrate()])
  return {
    oldIdGone: !family.getById('dup-b'),
    groups: family.duplicateGroups.length,
    birthPlace: family.getById('m-ancestor').birthPlace,
    storyOnMain: stories.byMember('m-ancestor').some((s) => s.id === 'dup-story'),
    storyOnOld: stories.byMember('dup-b').length
  }
})
console.log('after reload:', JSON.stringify(persisted))
assertChecks({
  oldIdGone: persisted.oldIdGone,
  noResidual: persisted.groups === 0,
  duplicateCleared: persisted.groups === 0,
  birthPlaceChosen: persisted.birthPlace === '上海',
  storyMember: persisted.storyOnMain ? 'm-ancestor' : 'WRONG',
  storyAuthor: 'x',
  photoPeople: [],
  photoMember: 'x',
  planBeneficiaries: []
}, true)
if (persisted.storyOnOld !== 0) throw new Error('旧编号故事仍残留')

function assertChecks(c, reload = false) {
  const failures = []
  if (!c.oldIdGone) failures.push('旧成员仍存在')
  if (!c.noResidual) failures.push('旧编号残留')
  if (!c.duplicateCleared) failures.push('重复标记未清除')
  if (!c.birthDateFilled && !reload) failures.push('出生日期未从副档补齐')
  if (!c.birthPlaceChosen) failures.push('籍贯未按选择写入上海')
  if (c.storyMember !== 'm-ancestor') failures.push('故事 memberId 未指向主档')
  if (!reload && c.storyAuthor !== 'm-ancestor') failures.push('故事 authorId 未指向主档')
  if (!reload && JSON.stringify(c.photoPeople) !== JSON.stringify(['m-ancestor', 'm-father'])) failures.push('照片 people 未正确重写: ' + JSON.stringify(c.photoPeople))
  if (!reload && c.photoMember !== 'm-ancestor') failures.push('照片 memberId 未指向主档')
  if (!reload && JSON.stringify(c.planBeneficiaries) !== JSON.stringify(['m-ancestor', 'm-child'])) failures.push('受益人未正确重写: ' + JSON.stringify(c.planBeneficiaries))
  if (failures.length) throw new Error(failures.join('; '))
}

// 6. 家谱树节点不再有疑似重复标记（合并后只有一个林启明）
await page.goto('http://127.0.0.1:38406/tree', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const dupDots = await page.locator('.dup-dot').count()
if (dupDots !== 0) throw new Error('合并后树节点不应再有疑似重复标记，实际 ' + dupDots)

await browser.close()
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('E2E merge flow passed')
