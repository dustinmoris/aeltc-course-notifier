const puppeteer = require('puppeteer');
const {PubSub} = require('@google-cloud/pubsub');

const pubsub = new PubSub();

const today = new Date().toLocaleDateString(
    'en-GB', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    });

async function sendEmail(mailServer, sender, recipients, body) {
    const topic = pubsub.topic('emails');

    const data = {
        domain: mailServer,
        sender: sender,
        recipients: recipients,
        cc: [],
        bcc: [],
        subject: 'Available Tennis Courses (' + today + ')',
        plaintext: body,
        html: ""
    };
    const buff = Buffer.from(JSON.stringify(data), 'utf8');

    try {
        await topic.publish(buff, {
            encoding: 'json-utf8'
        });
        console.log('Email successfully queued.');
    } catch (err) {
        console.error(err);
        return Promise.reject(err);
    }
}

async function run(baseURL, headless, maxTries, excludeLadies, mailServer, sender, recipients) {

    const browser = await puppeteer.launch({
        headless: headless
    });
    const page = await browser.newPage();

    let courses = [];
    let position = 0;
    let remaining = maxTries;
    let loadMore = true;

    while (loadMore && remaining-- > 0) {
        let url = baseURL + '/Coaching/Adult?startPosition=' + position;
        await page.goto(url);
        const results = page.$('#results');
        if (results !== null) {
            const batch = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('#results > div.result'));
                return elements.map(elem => {
                    const link = elem.querySelector('.description > h2 > a');
                    const details = elem.querySelector('.details');
                    return {
                        title: link.innerText,
                        url: link.getAttribute('href'),
                        address: elem.querySelector('.description > .address > p').innerText,
                        date: details.querySelector('ul > li.date').innerText,
                        time: details.querySelector('ul > li.time').innerText,
                        price: details.querySelector('ul > li.price').innerText,
                        available: false
                    };
                });
            });
            courses = courses.concat(batch);
            position += batch.length;
        }
    }

    console.log(courses);
    console.log(courses.length);

    for (const course of courses) {
        if (excludeLadies && course.title.includes('Ladies'))
            continue;

        await page.goto(baseURL + course.url);
        course.available = await page.evaluate(() => {
            const header = document.querySelector('div.detail-panel h3.availibility-header');
            return header !== null && header.innerText === 'Spaces are available';
        });

        console.log(course.title + ' on ' + course.date + ' (' + course.time + '), Availability: ' + course.available);
    }

    const availableCourses = courses.filter(c => c.available );

    console.log(availableCourses);
    console.log(availableCourses.length);

    await browser.close();

    let body = createEmailBody(baseURL, availableCourses);

    await sendEmail(mailServer, sender, recipients, body);
}

function createEmailBody(baseURL, courses) {
    let body = 'Courses available as of ' + today + ':\n\n';
    for (const course of courses) {
        body += '\n---\n' + course.title + '\n';
        body += 'Date: ' + course.date + '\n';
        body += 'Time: ' + course.time + '\n';
        body += 'Price: ' + course.price + '\n';
        body += 'Booking URL: ' + baseURL + course.url + '\n';
    }
    return body;
}

// run(
//     'https://communitytennis.aeltc.com',
//     true,
//     5,
//     true,
//     'mail-server',
//     'sender@example.org',
//     [ 'your-email@example.org' ]);

exports.notifierPubSub = async (message, context) => {
    const msg = message.data
        ? Buffer.from(message.data, 'base64').toString()
        : '';

    if (msg !== '') {
        console.log('Received data: ' + msg);
        const params = JSON.parse(msg);

        await run(
            params.baseURL,
            params.headless,
            params.maxTries,
            params.excludeLadies,
            params.mailServer,
            params.sender,
            params.recipients
        )
    } else {
        await run(
            'https://communitytennis.aeltc.com', // baseURL
            true,                                // headless
            5,                                   // maxTries
            true,                                // excludeLadies
            'mail-server',                       // mailServer
            'sender@example.org',                // sender
            [ 'your-email@example.org' ],);      // recipients
    }
}