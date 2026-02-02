/**
 * ClawdNation Twitter/X Poster
 * Uses Playwright to post tweets via browser automation
 * 
 * Usage:
 *   node post.js "Your tweet text here"
 *   TWEET="text" node post.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIES_PATH = path.join(__dirname, 'cookies.json');
const TWEET = process.argv[2] || process.env.TWEET;

const LOGIN_PHONE = process.env.X_PHONE || '+48455526867';
const LOGIN_PASS = process.env.X_PASS || 'x7VENWdirwUaamq9-FnrNvWNu4NdyXVW';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function login(page) {
  console.log('Logging in to X...');
  await page.goto('https://x.com/i/flow/login', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);

  // Enter phone/email
  const usernameInput = page.getByLabel('Phone, email, or username');
  await usernameInput.waitFor({ timeout: 10000 });
  await usernameInput.fill(LOGIN_PHONE);
  await sleep(500);
  
  // Click Next
  await page.getByRole('button', { name: 'Next' }).click();
  await sleep(2000);

  // Check if there's a username verification step
  const usernameCheck = page.getByLabel('Phone or username');
  try {
    await usernameCheck.waitFor({ timeout: 3000 });
    // Twitter is asking for username verification
    console.log('Username verification requested...');
    // We need the @handle here - try phone
    await usernameCheck.fill(LOGIN_PHONE);
    await page.getByRole('button', { name: 'Next' }).click();
    await sleep(2000);
  } catch (e) {
    // No verification step, continue
  }

  // Enter password
  const passInput = page.getByLabel('Password');
  await passInput.waitFor({ timeout: 10000 });
  await passInput.fill(LOGIN_PASS);
  await sleep(500);

  // Click Log in
  await page.getByRole('button', { name: 'Log in' }).click();
  await sleep(5000);

  // Check if logged in
  const url = page.url();
  if (url.includes('/home') || url === 'https://x.com/') {
    console.log('Logged in successfully!');
    // Save cookies
    const cookies = await page.context().cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log('Cookies saved.');
    return true;
  }

  console.error('Login may have failed. Current URL:', url);
  // Take screenshot for debugging
  await page.screenshot({ path: path.join(__dirname, 'login-debug.png') });
  console.log('Debug screenshot saved.');
  return false;
}

async function postTweet(page, text) {
  console.log('Posting tweet...');
  await page.goto('https://x.com/compose/post', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  // Type in the compose box
  const tweetBox = page.getByRole('textbox').first();
  await tweetBox.waitFor({ timeout: 10000 });
  await tweetBox.click();
  await sleep(500);
  await tweetBox.fill(text);
  await sleep(1000);

  // Click Post button
  const postBtn = page.getByTestId('tweetButton');
  await postBtn.waitFor({ timeout: 5000 });
  await postBtn.click();
  await sleep(3000);

  console.log('Tweet posted!');
  return true;
}

async function main() {
  if (!TWEET) {
    console.error('Usage: node post.js "Your tweet text"');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  // Load cookies if available
  if (fs.existsSync(COOKIES_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
    await context.addCookies(cookies);
    console.log('Loaded saved cookies.');
  }

  const page = await context.newPage();

  try {
    // Check if already logged in
    await page.goto('https://x.com/home', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const url = page.url();
    if (url.includes('/login') || url.includes('/i/flow')) {
      const ok = await login(page);
      if (!ok) {
        console.error('Login failed.');
        process.exit(1);
      }
    } else {
      console.log('Already logged in.');
    }

    await postTweet(page, TWEET);
  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: path.join(__dirname, 'error-debug.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
