import puppeteer from 'puppeteer-core';

(async () => {
    console.log("Starting Test...");
    const browser = await puppeteer.launch({ 
        headless: true, 
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" 
    });
    const page = await browser.newPage();
    
    // Mirror the page console
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    await page.goto('http://localhost:5173/?test=true&scenario=5overs');
    await page.setViewport({ width: 400, height: 800 }); // Mobile view

    console.log("Waiting for Live Scoring Screen navigation via scenario...");
    try {
        await page.waitForFunction(() => window.location.pathname === '/live-scoring', { timeout: 10000 });
        console.log("Arrived at Live Scoring Screen!");
    } catch (e) {
        console.log("FAILED to navigate to /live-scoring via scenario", e.message);
        const body = await page.evaluate(() => document.body.innerHTML);
        console.log("PAGE BODY ON FAIL:", body.substring(0, 1000));
        await browser.close();
        return;
    }
    await new Promise(r => setTimeout(r, 1000));

    console.log("On Live Scoring Screen (Innings 1)...");
    // 4. Click Autoplay
    await page.waitForSelector('#autoplay-btn');
    await new Promise(r => setTimeout(r, 2000));
    await page.click('#autoplay-btn');

    // Wait for Innings Complete (Page Redirection to /innings-break)
    console.log("Autopilot started. Waiting for Innings Break...");
    let inningsCompleted = false;
    for(let i=0; i<180; i++) {
        const url = page.url();
        const scoreInfo = await page.evaluate(() => {
             const h = document.body.innerText;
             const isWagon = !!document.querySelector('.modal-overlay');
             return { url: window.location.pathname, text: h.substring(0, 200).replace(/\n/g, ' '), isWagon };
        });
        console.log(`[LOOP ${i}] URL: ${scoreInfo.url} | Wagon: ${scoreInfo.isWagon} | Text: ${scoreInfo.text}`);

        if (url.includes('/innings-break')) {
             console.log("Innings 1 Completed!");
             inningsCompleted = true;
             break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    if (!inningsCompleted) {
         console.log("Failed to complete Innings 1 within time.");
         const body = await page.evaluate(() => document.body.innerHTML);
         console.log("BODY ON FAIL INN 1:", body.substring(0, 500));
         await browser.close();
         return;
    }

    // 5. Innings Break Screen
    console.log("On Innings Break Screen...");
    await page.waitForSelector('button');
    const clickedStart2nd = await page.evaluate(() => {
         const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.toUpperCase().includes('START 2ND INNINGS'));
         if (btn) { btn.click(); return true; }
         return false;
    });
    if (clickedStart2nd) console.log("Clicked Start 2nd Innings");
    await new Promise(r => setTimeout(r, 1000));

    // 6. Player Entry Screen (Innings 2)
    console.log("On Player Entry 2 Screen...");
    try {
        await page.waitForSelector('input[placeholder="Name of striker"]', { timeout: 10000 });
        await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
            const setReactValue = (input, value) => {
                 if (!input) return;
                 let nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                 nativeInputValueSetter.call(input, value);
                 input.dispatchEvent(new Event('input', { bubbles: true }));
            };
            if (inputs[0]) setReactValue(inputs[0], 'Warner');
            if (inputs[1]) setReactValue(inputs[1], 'Finch');
            if (inputs[2]) setReactValue(inputs[2], 'Starc');
        });
        await new Promise(r => setTimeout(r, 1000)); // Settle inputs
        const btnState = await page.evaluate(() => {
             const b = document.querySelector('#start-match-btn');
             const err = document.body.innerText;
             return { disabled: b.disabled, text: err.substring(0, 500) };
        });
        console.log(`[INN 2 ENTRY] Button Disabled: ${btnState.disabled} | Layout: ${btnState.text}`);
        await page.click('#start-match-btn');
    } catch (e) {
        console.log("ERROR on Player Entry Innings 2", e.message);
    }
    await new Promise(r => setTimeout(r, 2000));
    console.log("On Live Scoring Screen (Innings 2)... Current URL:", page.url());
    await page.waitForSelector('#autoplay-btn');
    await new Promise(r => setTimeout(r, 2000)); // Wait for react settlement
    await page.click('#autoplay-btn');

    // Wait for Match Redirection to congratulations
    console.log("Autopilot 2 started. Waiting for Congratulations Summary...");
    let matchCompleted = false;
    for(let i=0; i<180; i++) {
        const url = page.url();
        if (url.includes('/congratulations') || url.includes('/match-summary')) {
             console.log("Match Completed Successfully!");
             matchCompleted = true;
             break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    if (!matchCompleted) {
        console.log("Failed to complete Innings 2 inside 180s.");
    } else {
        console.log("SUCCESS: 5-over match tested with Autopilot.");
    }

    await browser.close();
})();
