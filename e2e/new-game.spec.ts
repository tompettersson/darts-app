import { test, expect } from '@playwright/test'

test.describe('Neues Spiel - Spielmodus-Auswahl', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByText('Neues Spiel').click()
  })

  test('NewGameStart zeigt alle Spielmodi-Kategorien', async ({ page }) => {
    await expect(page.getByText('Zufallsspiel')).toBeVisible()
    await expect(page.getByText('X01')).toBeVisible()
    await expect(page.getByText('Cricket')).toBeVisible()
    await expect(page.getByText('Trainingspiele')).toBeVisible()
    await expect(page.getByText('Rund ums Board')).toBeVisible()
  })

  test('X01 Auswahl öffnet Preset-Auswahl', async ({ page }) => {
    await page.getByRole('button', { name: 'X01 auswählen' }).click()

    // X01 Preset-Seite zeigt Punktzahlen
    await expect(page.getByText('501')).toBeVisible()
  })

  test('Cricket Auswahl öffnet Cricket-Setup', async ({ page }) => {
    await page.getByRole('button', { name: 'Cricket auswählen' }).click()

    // Cricket-Setup zeigt Varianten
    await expect(page.getByText('Short')).toBeVisible()
  })
})
