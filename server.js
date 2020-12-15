'use strict'

const Telegram                = require('./Telegram');
const { StreamCamera, Codec } = require("pi-camera-connect");
const Jimp                    = require('jimp');

var streamCamera, fontW, fontB;

const telegramBotToken = 'paste token here';
const botAdmins = ['add', ' nicknames', 'here'];
const botWatermark = 'link to bot for example';
const minIntervalBetweenRequests = 5000; // ms

var lastReqTime = {};

async function captureFrame() {
    // init camera stream on first use
    if (!streamCamera) {
        streamCamera = new StreamCamera({
            codec: Codec.MJPEG,
            fps: 5,
            width: 640,
            height: 480,
            bitRate: 1000000
        });
    
        await streamCamera.startCapture();
    }

    let image = await streamCamera.takeImage().catch(e => { return null; });

    return image;
}

async function start() {
    let telegram = new Telegram({
        // Create bot with @BotFather and paste bot token here
        token: telegramBotToken,
        // Username of bot admin (or admins) for bot control
        // without @ symbol
        admin: botAdmins,
        // Bot description that shows when you send /start or /help to your bot
        info: "Бот интернет-камеры.",
        // text that wiil be sent if bot haven't this command
        unknownCmd: "Неизвестная команда. Используйте /help для просмотра списка команд."
    });

    telegram.bot.on('message', (msg) => {
        let data = telegram.parseData(msg);

        processTelegramData(data);
    });
}

async function processTelegramData(data) {
    if (data.cmd) {
        switch (data.cmd.cmd) {
            case 'start':
            case 'help':
                telegram.sendDescription(data.chatId); 

                break
            case 'photo':
                let timeNow = new Date();

                if (lastReqTime[data.chatId]) {
                    if (timeNow - lastReqTime[data.chatId] < minIntervalBetweenRequests) {
                        let waitTime = Math.floor((minIntervalBetweenRequests - (timeNow - lastReqTime[data.chatId])) / 1000);

                        if (!waitTime) {
                            waitTime = 1;
                        }

                        telegram.sendMessage(data.chatId, `Подождите ещё ${waitTime} с`, { reply_markup: { remove_keyboard: true }}); 

                        return;
                    }
                }

                lastReqTime[data.chatId] = timeNow;

                console.log(`# Sending requested photo`);

                let image = await captureFrame();

                if (!image) {
                    telegram.sendMessage(data.chatId, `Не удалось сделать фото. Обратитесь к администратору.`, { reply_markup: { remove_keyboard: true }}); 

                    return;
                }

                let start = new Date();

                let jimage = await Jimp.read(image);

                if (!fontW) {
                    fontW = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
                }

                if (!fontB) {
                    fontB = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
                }

                // black shadow and white foreground
                await jimage.print(fontB, 11, 11, `${timeNow.toLocaleString()}`);
                await jimage.print(fontB, 11, 31, botWatermark);
                await jimage.print(fontW, 10, 10, `${timeNow.toLocaleString()}`);
                await jimage.print(fontW, 10, 30, botWatermark);

                let processedFrame = await jimage.getBufferAsync(Jimp.MIME_JPEG);

                let end = new Date();

                console.log(`# Frame processed in ${end - start} ms`);

                telegram.bot.sendPhoto(data.chatId, processedFrame);

                break;
            default:
                telegram.sendUnknownCmd(data.chatId);
        }
    }
};

start();