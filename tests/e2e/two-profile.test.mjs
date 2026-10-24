import assert from 'node:assert/strict'
import test from 'node:test'

test('two invited profiles can join the island in separate browser contexts', async context => {
  const profiles = [
    { name: 'Talha', email: process.env.TINY_WORLD_TALHA_EMAIL, password: process.env.TINY_WORLD_TALHA_PASSWORD },
    { name: 'Mannu', email: process.env.TINY_WORLD_MANNU_EMAIL, password: process.env.TINY_WORLD_MANNU_PASSWORD },
  ]
  if (profiles.some(profile => !profile.email || !profile.password)) {
    context.skip('Set the two TINY_WORLD profile credential pairs to run the authenticated browser check.')
    return
  }

  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    context.skip('Install the Playwright package and Chromium browser to run this optional check.')
    return
  }

  const baseUrl = process.env.TINY_WORLD_BASE_URL || 'http://127.0.0.1:4173'
  const browser = await chromium.launch({ headless: true })
  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  try {
    const pages = await Promise.all(contexts.map(browserContext => browserContext.newPage()))
    await Promise.all(pages.map(async (page, index) => {
      page.setDefaultTimeout(45_000)
      await page.goto(baseUrl)
      await page.getByRole('button', { name: /enter our world/i }).click()
      await page.getByLabel('Email address').fill(profiles[index].email)
      await page.getByLabel('Password').fill(profiles[index].password)
      await page.getByRole('button', { name: /enter our world/i }).click()
      await page.getByRole('heading', { name: 'Our little island' }).waitFor({ state: 'visible' })
      await page.getByText('Island connected').waitFor({ state: 'visible' })
      await page.locator('.game-host canvas').waitFor({ state: 'visible' })
    }))

    for (const page of pages) {
      assert.equal(await page.getByRole('heading', { name: 'Our little island' }).count(), 1)
      assert.equal(await page.locator('.game-host canvas').count(), 1)
    }
  } finally {
    await Promise.all(contexts.map(browserContext => browserContext.close()))
    await browser.close()
  }
})
