import puppeteer from 'puppeteer';

exports.notifierPubSub = (message, context) => {
    const url = message.data
        ? Buffer.from(message.data, 'base64').toString()
        : 'https://communitytennis.aeltc.com/account/signin';

    const username = '';
    const password = '';

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url);
    await page.type('#EmailAddress', username);
    await page.type('#Password', password);
    await page.click('#signin-btn');
    await page.goto('https://communitytennis.aeltc.com/Coaching/Adult')

    console.log('Hello, ${page}!');
}