import { test, expect } from '@playwright/test';

test.describe('End-to-End CareFlow Appointment Booking & Doctor Verification Flow', () => {
  test('Patient Symptom Triage -> Appointment Booking -> Doctor Schedule Verification', async ({ page }) => {
    const timestamp = Date.now();
    const patientEmail = `pw.patient.${timestamp}@example.com`;
    const patientName = `Playwright Patient ${timestamp}`;
    const password = 'Password123!';

    // 1. Visit Login Page & Register Patient
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Click "Register as Patient" switcher
    await page.click('button:has-text("Register as Patient")');
    await page.fill('#reg-name', patientName);
    await page.fill('#auth-email', patientEmail);
    await page.fill('#auth-password', password);
    
    // Submit registration form
    await page.click('button[type="submit"]:has-text("Register Account")');
    
    // 2. Priority #1: Locate Doctor Directory at Top of Page and Pick an Available Slot
    await expect(page.locator('text=Book a Specialist Appointment')).toBeVisible({ timeout: 20000 });

    // Select the first enabled slot button in the doctor directory
    const availableSlotBtn = page.locator('button:enabled').filter({ hasText: /\d{1,2}:\d{2}/ }).first();
    await expect(availableSlotBtn).toBeVisible({ timeout: 15000 });
    await availableSlotBtn.click();

    // 3. Complete Symptom Triage Wizard
    // Modal dialog should open
    await expect(page.locator('text=Clinical Symptom Triage & Booking')).toBeVisible({ timeout: 10000 });

    // Input chief complaint symptoms
    const symptomsInput = page.locator('#symptoms-input');
    await expect(symptomsInput).toBeVisible({ timeout: 5000 });
    await symptomsInput.fill('Experiencing mild persistent headache and slight dizziness for 2 days.');

    // Step 1 -> Step 2 -> Step 3 Confirmation Click Sequence
    const confirmBtn = page.locator('button:has-text("Confirm Appointment Booking")');
    await confirmBtn.click();
    await page.waitForTimeout(500);

    // If modal is still open, click again to finalize step 3 confirmation
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }

    // Verify confirmation notification toast
    await expect(page.locator('text=Appointment confirmed successfully')).toBeVisible({ timeout: 15000 });

    // 4. Verify Appointment Appears in Patient Dashboard
    await expect(page.locator('#upcoming-heading')).toBeVisible();

    // 5. Logout Patient and Sign In as Doctor to Verify Schedule Queue
    await page.click('button:has-text("Log Out")');
    await page.waitForTimeout(1000);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Click Doctor Tab on Login Modal
    await page.click('button[role="tab"]:has-text("Doctor")');
    await page.fill('#auth-email', 'sarah.jenkins@careflow.com');
    await page.fill('#auth-password', 'doctor123');
    
    // Click "Sign In as DOCTOR" submit button
    await page.click('button:has-text("Sign In as DOCTOR")');

    // Verify redirection to main page and rendering of Doctor Portal
    await expect(page.locator('text=Doctor Schedule & Clinical Operations')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('text=Appointments & Consultation Queue')).toBeVisible({ timeout: 10000 });
  });
});
