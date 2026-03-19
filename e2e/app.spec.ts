import { test, expect } from '@playwright/test'

test.describe('App - Hauptmenü', () => {
  test('App lädt und zeigt das Hauptmenü', async ({ page }) => {
    await page.goto('/')

    // Hauptüberschrift sichtbar
    await expect(page.locator('h1')).toContainText('Darts')

    // Menü-Buttons vorhanden
    await expect(page.getByText('Neues Spiel')).toBeVisible()
    await expect(page.getByText('Statistiken')).toBeVisible()
    await expect(page.getByText('Einstellungen')).toBeVisible()
  })

  test('"Neues Spiel" Navigation funktioniert', async ({ page }) => {
    await page.goto('/')

    await page.getByText('Neues Spiel').click()

    // NewGameStart-Seite zeigt Spielmodi
    await expect(page.getByText('X01')).toBeVisible()
    await expect(page.getByText('Cricket')).toBeVisible()
  })

  test('"Einstellungen" Navigation funktioniert', async ({ page }) => {
    await page.goto('/')

    await page.getByText('Einstellungen').click()

    // Einstellungen-Menü zeigt Optionen
    await expect(page.getByText('Profil bearbeiten')).toBeVisible()
  })

  test('Zurück-Navigation kehrt zum Menü zurück', async ({ page }) => {
    await page.goto('/')

    // Zu "Neues Spiel" navigieren
    await page.getByText('Neues Spiel').click()
    await expect(page.getByText('X01')).toBeVisible()

    // Zurück-Button klicken
    await page.getByText('Zurück').click()

    // Wieder im Hauptmenü
    await expect(page.getByText('Neues Spiel')).toBeVisible()
    await expect(page.getByText('Einstellungen')).toBeVisible()
  })
})
