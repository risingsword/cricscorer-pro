import puppeteer from 'puppeteer-core';

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true
    });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => {
        console.log('PAGE ERROR:', err.message);
        if (err.stack) console.log('STACK TRACE:', err.stack);
    });
    page.on('dialog', async dialog => {
        console.log('DIALOG TYPE:', dialog.type(), 'MESSAGE:', dialog.message());
        await dialog.accept();
    });

    console.log('Opening page to set localStorage...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    
    await page.evaluate(() => {
        const sessionData = {
            loginType: 'code',
            userCode: 'CQ0J3G7M',
            viewingCode: 'CQ0J3G7M',
            ownerName: 'Test Owner'
        };
        const str = JSON.stringify(sessionData);
        localStorage.setItem('userSession', str);
        localStorage.setItem('cricscorer_login', str);
    });

    console.log('Navigating to History...');
    await page.goto('http://localhost:5173/history', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const clickSettings = async () => {
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const settingsBtn = btns.find(b => b.title === 'Maintenance & Sync Settings');
            if (settingsBtn) {
                settingsBtn.click();
                console.log('Settings button clicked!');
            } else {
                console.log('Settings button NOT found!');
            }
        });
        await new Promise(r => setTimeout(r, 500));
    };

    console.log('--- Testing Force Push ---');
    await clickSettings();
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent.includes('Force Push to Cloud'));
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 15000));

    console.log('--- Testing Force Full Data Recovery ---');
    await clickSettings();
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent.includes('Force Full Data Recovery'));
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 15000));

    console.log('--- Testing Empty Cloud Trash ---');
    await clickSettings();
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent.includes('Empty Cloud Trash'));
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 15000));

    console.log('--- Testing Hard Reset & Fetch Cloud ---');
    await clickSettings();
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent.includes('Hard Reset & Fetch Cloud'));
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 15000));

    console.log('Done!');
    await browser.close();
})();
