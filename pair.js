const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpegPath = ffmpegInstaller.path;
process.env.FFMPEG_PATH = ffmpegPath;

const ffmpeg = require('fluent-ffmpeg');

const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const axios = require('axios');
const FormData = require('form-data');
const os = require('os');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const FileType = require('file-type');
const yts = require('yt-search');
const { sms, downloadMediaMessage } = require("./msg");
const TelegramBot = require('node-telegram-bot-api');

//=================VAR=================================//

// Replace the obfuscated import with your own functions
const connectdb = async (number) => {
  // Your existing MongoDB connection is already handled
  console.log(`✅ Connected to DB for ${number}`);
};

const input = async (settingType, newValue, number) => {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const currentConfig = await getUserConfigFromMongoDB(sanitizedNumber);
  currentConfig[settingType] = newValue;
  await updateUserConfigInMongoDB(sanitizedNumber, currentConfig);
};

const get = async (settingType, number) => {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const currentConfig = await getUserConfigFromMongoDB(sanitizedNumber);
  return currentConfig[settingType];
};

const getalls = async (number) => {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  return await getUserConfigFromMongoDB(sanitizedNumber);
};

const resetSettings = async (number) => {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  await updateUserConfigInMongoDB(sanitizedNumber, config);
};

//=================VAR=================================//

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    getContentType,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    downloadContentFromMessage,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    S_WHATSAPP_NET
} = require('@whiskeysockets/baileys');

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'false',
    AUTO_LIKE_EMOJI: ['🖤', '🍬', '💫', '🎈', '💚', '🎶', '❤️', '🧫', '⚽'],
    PREFIX: '.',
    BOT_FOOTER: '> © Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/EL2TnsfQ6Lj4vp8xXFzs5C',
    ADMIN_LIST_PATH: './admin.json',
    IMAGE_PATH: 'https://files.catbox.moe/3gitrg.jpg',
    NEWSLETTER_JID: '120363426849718986@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    OWNER_NUMBER: '243988510679',
    DEV_MODE: 'false',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb7RrgBISTkGLiJt8G2Q',
    WORK_TYPE: "public",
    ANTI_CAL: "off",

   TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '8628995376:AAEfaPuN7cWZPXZh3jDfNgpLgS3R6t1lbCc',
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '8736609355'
};

// ====== Telegram Bot Setup ======


const telegramBot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: false });


// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://dawenstoussaint055_db_user:Iqc1gkLx77F5plAZ@cluster0.xwh7qwq.mongodb.net/?appName=Cluster0';
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ Connected to MongoDB');
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
});

// MongoDB Schemas
const sessionSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true },
    creds: { type: Object, required: true },
    config: { type: Object, default: config },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const numberSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const otpSchema = new mongoose.Schema({
    number: { type: String, required: true },
    otp: { type: String, required: true },
    newConfig: { type: Object },
    expiry: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Group settings schema — one document per group JID
const groupSettingsSchema = new mongoose.Schema({
    groupJid:  { type: String, required: true, unique: true },
    // Welcome/Goodbye
    welcome:   { type: Boolean, default: true  },  // ON by default
    goodbye:   { type: Boolean, default: false },
    // Antilink
    antilink:       { type: Boolean, default: false },
    antilinkAction: { type: String,  default: 'delete', enum: ['delete', 'warn', 'kick'] },
    antilinkWarnings: { type: Object, default: {} }, // { "numberJid": warnCount }
    updatedAt: { type: Date, default: Date.now }
});
const GroupSettings = mongoose.model('GroupSettings', groupSettingsSchema);

// MongoDB Models
const Session = mongoose.model('Session', sessionSchema);
const BotNumber = mongoose.model('BotNumber', numberSchema);
const OTP = mongoose.model('OTP', otpSchema);

// ── Group Settings DB helpers ────────────────────────────────────────────────
async function getGroupSettings(groupJid) {
    try {
        let doc = await GroupSettings.findOne({ groupJid });
        if (!doc) {
            doc = await GroupSettings.findOneAndUpdate(
                { groupJid },
                { groupJid },
                { upsert: true, new: true }
            );
        }
        return doc;
    } catch (e) {
        console.error('[GroupSettings] getGroupSettings error:', e.message);
        return { welcome: true, goodbye: false, antilink: false, antilinkAction: 'delete', antilinkWarnings: {} };
    }
}

async function updateGroupSettings(groupJid, update) {
    try {
        update.updatedAt = new Date();
        await GroupSettings.findOneAndUpdate(
            { groupJid },
            update,
            { upsert: true }
        );
    } catch (e) {
        console.error('[GroupSettings] updateGroupSettings error:', e.message);
    }
}

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const otpStore = new Map();
const cleanupLocks = new Set();  // 🆕 ADD THIS LINE

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

// ========== 🔍 IMPROVED MANUAL UNLINK DETECTION ========== //
function setupManualUnlinkDetection(socket, number) {
    let unlinkDetected = false;
    
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close' && !unlinkDetected) {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message;
            
            // Detect manual unlink (401 = logged out from another device)
            if (statusCode === 401 || errorMessage?.includes('401')) {
                unlinkDetected = true;
                console.log(`🔐 Manual unlink detected for ${number}`);
                
                // Clean up the session
                await handleManualUnlink(number);
            }
        }
    });
}

// Improved cleanup function
async function handleManualUnlink(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    
    // 🔒 Prevent duplicate cleanup
    if (cleanupLocks.has(sanitizedNumber)) {
        console.log(`⏩ Cleanup already in progress for ${sanitizedNumber}, skipping...`);
        return;
    }
    
    cleanupLocks.add(sanitizedNumber);
    
    try {
        console.log(`🔄 Cleaning up after manual unlink for ${sanitizedNumber}`);
        
        // Remove from active sockets
        if (activeSockets.has(sanitizedNumber)) {
            const socket = activeSockets.get(sanitizedNumber);
            socket.ev.removeAllListeners();
            activeSockets.delete(sanitizedNumber);
        }
        socketCreationTime.delete(sanitizedNumber);
        
        // Delete local session files
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        if (fs.existsSync(sessionPath)) {
            await fs.remove(sessionPath);
            console.log(`🗑️ Deleted local session after manual unlink for ${sanitizedNumber}`);
        }
        
        // Delete from MongoDB collections
        await Promise.all([
            Session.findOneAndDelete({ number: sanitizedNumber }),
            BotNumber.findOneAndDelete({ number: sanitizedNumber }),
            OTP.findOneAndDelete({ number: sanitizedNumber })
        ]);
        
        console.log(`✅ Completely cleaned up ${sanitizedNumber} from all collections`);
        
    } catch (error) {
        console.error(`Error cleaning up after manual unlink for ${sanitizedNumber}:`, error);
    } finally {
        // 🔓 Always release the lock
        cleanupLocks.delete(sanitizedNumber);
    }
}
// ========== END MANUAL UNLINK DETECTION ========== //

function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [];
    }
}

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

async function updateAboutStatus(socket) {
    const aboutStatus = 'BUTTERFLY-16 MD //  ᴀᴄᴛɪᴠᴇ 🚀';
    try {
        await socket.updateProfileStatus(aboutStatus);
        console.log(`Updated About status to: ${aboutStatus}`);
    } catch (error) {
        console.error('Failed to update About status:', error);
    }
}

// MongoDB Session Management Functions
async function saveSessionToMongoDB(number, creds, userConfig = null) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        
        // Check if session already exists
        const existingSession = await Session.findOne({ number: sanitizedNumber });
        
        if (existingSession) {
            // Session exists - only update creds, don't show "saved" message
            await Session.findOneAndUpdate(
                { number: sanitizedNumber },
                { 
                    creds: creds,
                    updatedAt: new Date()
                }
            );
            console.log(`🔄 Session credentials updated for ${sanitizedNumber}`);
        } else {
            // New session - save everything
            const sessionData = {
                number: sanitizedNumber,
                creds: creds,
                config: userConfig || config,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await Session.findOneAndUpdate(
                { number: sanitizedNumber },
                sessionData,
                { upsert: true, new: true }
            );
            console.log(`✅ NEW Session saved to MongoDB for ${sanitizedNumber}`);
        }
    } catch (error) {
        console.error('❌ Failed to save/update session in MongoDB:', error);
        throw error;
    }
}

async function getSessionFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const session = await Session.findOne({ number: sanitizedNumber });
        return session ? session.creds : null;
    } catch (error) {
        console.error('❌ Failed to get session from MongoDB:', error);
        return null;
    }
}

async function getUserConfigFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const session = await Session.findOne({ number: sanitizedNumber });
        return session ? session.config : { ...config };
    } catch (error) {
        console.error('❌ Failed to get user config from MongoDB:', error);
        return { ...config };
    }
}

async function updateUserConfigInMongoDB(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            { 
                config: newConfig,
                updatedAt: new Date()
            }
        );
        console.log(`✅ Config updated in MongoDB for ${sanitizedNumber}`);
    } catch (error) {
        console.error('❌ Failed to update config in MongoDB:', error);
        throw error;
    }
}

async function deleteSessionFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        
        // Delete from all collections
        await Promise.all([
            Session.findOneAndDelete({ number: sanitizedNumber }),
            BotNumber.findOneAndDelete({ number: sanitizedNumber }),
            OTP.findOneAndDelete({ number: sanitizedNumber })
        ]);
        
        console.log(`✅ Session completely deleted from MongoDB for ${sanitizedNumber}`);
    } catch (error) {
        console.error('❌ Failed to delete session from MongoDB:', error);
        throw error;
    }
}

async function addNumberToMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await BotNumber.findOneAndUpdate(
            { number: sanitizedNumber },
            { number: sanitizedNumber, active: true },
            { upsert: true }
        );
        console.log(`✅ Number ${sanitizedNumber} added to MongoDB`);
    } catch (error) {
        console.error('❌ Failed to add number to MongoDB:', error);
        throw error;
    }
}

async function getAllNumbersFromMongoDB() {
    try {
        const numbers = await BotNumber.find({ active: true });
        return numbers.map(n => n.number);
    } catch (error) {
        console.error('❌ Failed to get numbers from MongoDB:', error);
        return [];
    }
}

// Count total commands in pair.js
let totalcmds = async () => {
  try {
    const filePath = "./pair.js";
    const mytext = await fs.readFile(filePath, "utf-8");

    // Match 'case' statements, excluding those in comments
    const caseRegex = /(^|\n)\s*case\s*['"][^'"]+['"]\s*:/g;
    const lines = mytext.split("\n");
    let count = 0;

    for (const line of lines) {
      // Skip lines that are comments
      if (line.trim().startsWith("//") || line.trim().startsWith("/*")) continue;
      // Check if line matches case statement
      if (line.match(/^\s*case\s*['"][^'"]+['"]\s*:/)) {
        count++;
      }
    }

    return count;
  } catch (error) {
    console.error("Error reading pair.js:", error.message);
    return 0; // Return 0 on error to avoid breaking the bot
  }
}

async function saveOTPToMongoDB(number, otp, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const expiry = new Date(Date.now() + config.OTP_EXPIRY);
        
        await OTP.findOneAndUpdate(
            { number: sanitizedNumber },
            {
                number: sanitizedNumber,
                otp: otp,
                newConfig: newConfig,
                expiry: expiry
            },
            { upsert: true }
        );
        console.log(`✅ OTP saved to MongoDB for ${sanitizedNumber}`);
    } catch (error) {
        console.error('❌ Failed to save OTP to MongoDB:', error);
        throw error;
    }
}

async function verifyOTPFromMongoDB(number, otp) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const otpData = await OTP.findOne({ number: sanitizedNumber });
        
        if (!otpData) {
            return { valid: false, error: 'No OTP found' };
        }
        
        if (Date.now() > otpData.expiry.getTime()) {
            await OTP.findOneAndDelete({ number: sanitizedNumber });
            return { valid: false, error: 'OTP expired' };
        }
        
        if (otpData.otp !== otp) {
            return { valid: false, error: 'Invalid OTP' };
        }
        
        const configData = otpData.newConfig;
        await OTP.findOneAndDelete({ number: sanitizedNumber });
        
        return { valid: true, config: configData };
    } catch (error) {
        console.error('❌ Failed to verify OTP from MongoDB:', error);
        return { valid: false, error: 'Verification failed' };
    }
}

async function joinGroup(socket) {
    console.log('🔄 Checking group membership...');
    
    const inviteCodeMatch = config.GROUP_INVITE_LINK.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
    if (!inviteCodeMatch) {
        console.error('❌ Invalid group invite link');
        return { status: 'failed', error: 'Invalid group invite link' };
    }
    
    const inviteCode = inviteCodeMatch[1];
    let retries = 3;

    // Check if already in group

    try {
        const groupInfo = await socket.groupGetInviteInfo(inviteCode);
        if (groupInfo && groupInfo.id) {
            console.log(`🔍 Found group: ${groupInfo.id}`);
            
            try {
                const groupMetadata = await socket.groupMetadata(groupInfo.id);
                const isMember = groupMetadata.participants?.some(p => p.id === socket.user.id);
                
                if (isMember) {
                    console.log(`✅ Already in group`);
                    return { status: 'already_member', gid: groupInfo.id };
                }
            } catch (metaError) {
                // Silent fail - just try to join
            }
        }
    } catch (infoError) {
        console.log('❌ Cannot access group');
        return { status: 'failed', error: 'Cannot access group' };
    }

    // Join the group
    console.log(`🔄 Joining group...`);
    
    while (retries > 0) {
        try {
            const response = await socket.groupAcceptInvite(inviteCode);
            
            if (response?.gid) {
                console.log(`✅ Joined group: ${response.gid}`);
                return { status: 'success', gid: response.gid };
            }
            
            // Wait and verify
            await delay(2000);
            
            try {
                const groupInfo = await socket.groupGetInviteInfo(inviteCode);
                if (groupInfo && groupInfo.id) {
                    console.log(`✅ Joined successfully`);
                    return { status: 'success', gid: groupInfo.id };
                }
            } catch (verifyError) {
                // Silent verification fail
            }
            
            retries--;
            if (retries > 0) await delay(2000);
            
        } catch (error) {
            retries--;
            
            if (error.message.includes('conflict') || error.message.includes('already')) {
                console.log('✅ Already in group');
                return { status: 'already_member', error: 'Already member' };
            }
            else if (error.message.includes('not-authorized')) {
                console.log('❌ Not authorized to join');
                return { status: 'failed', error: 'Not authorized' };
            }
            else if (error.message.includes('gone')) {
                console.log('❌ Link expired');
                return { status: 'failed', error: 'Link expired' };
            }
            else if (error.message.includes('full')) {
                console.log('❌ Group full');
                return { status: 'failed', error: 'Group full' };
            }
            
            if (retries === 0) {
                console.log('❌ Failed to join group');
                return { status: 'failed', error: error.message };
            }
            
            await delay(2000);
        }
    }
    
    return { status: 'failed', error: 'Max retries reached' };
}

// Sample formatBytes function
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function sendOTP(socket, number, otp) {
    const userJid = jidNormalizedUser(socket.user.id);
    const message = formatMessage(
        '🔐 OTP VERIFICATION',
        `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.`,
        'Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ'
    );

    try {
        await socket.sendMessage(userJid, { text: message });
        console.log(`OTP ${otp} sent to ${number}`);
    } catch (error) {
        console.error(`Failed to send OTP to ${number}:`, error);
        throw error;
    }
}

function safeJSONParse(str, defaultValue = {}) {
    try {
        if (!str || str.trim() === '') return defaultValue;
        // Remove any invalid characters before parsing
        const cleanStr = str.replace(/[^\x20-\x7E]/g, '');
        return JSON.parse(cleanStr);
    } catch (error) {
        console.error('❌ JSON parse failed:', error.message, 'Input:', str?.substring(0, 100));
        return defaultValue;
    }
}

function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        const allNewsletterJIDs = await loadNewsletterJIDsFromRaw();
        const jid = message.key.remoteJid;

        if (!allNewsletterJIDs.includes(jid)) return;

        // 🆕 CHECK IF IT'S A COMMAND FIRST
        let body = '';
        try {
            if (message.message?.conversation) {
                body = message.message.conversation;
            } else if (message.message?.extendedTextMessage?.text) {
                body = message.message.extendedTextMessage.text;
            }
            
            // If it's a command, check if it's allowed
            if (body.startsWith(config.PREFIX)) {
                const command = body.slice(config.PREFIX.length).trim().split(' ')[0].toLowerCase();
                const allowedChannelCommands = ['checkjid', 'ping']; // Same as in command handler
                
                // 🟢 Only skip reactions for NON-allowed commands
                if (!allowedChannelCommands.includes(command)) {
                    console.log(`🔍 Command ${command} not allowed in channel - skipping reaction`);
                    return; // Skip reaction for non-allowed commands
                }
                // 🟢 For allowed commands, CONTINUE and do reaction
                console.log(`✅ Allowed command ${command} in channel - will react`);
            }
        } catch (error) {
            // If we can't extract body, continue with reactions
        }

        // 🟢 Do reactions for:
        // 1. Normal messages
        // 2. ALLOWED commands (checkjid, ping)
        try {
            const emojis = [
  '💜', '🔥', '💫', '👍', '🧧',
  '❤️', '🩷', '🧡', '💛', '💚', '💙', '🖤', '🤍',
  '✨', '🌟', '⭐', '⚡', '🔥', '💥',
  '🎉', '🎊', '🎁', '🎈',
  '😎', '😂', '😍', '🥰', '😇', '🤩', '😜', '🤔',
  '👑', '💎', '🏆', '🥇',
  '🚀', '🌍', '🌈', '☀️', '🌙',
  '🎵', '🎶',
  '📱', '💻', '⌨️',
  '🫶', '🤝', '👏',
  '🍀', '🌸', '🌹'
];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;

            if (!messageId) {
                console.warn('No newsletterServerId found in message:', message);
                return;
            }

            let retries = 3;
            while (retries-- > 0) {
                try {
                    await socket.newsletterReactMessage(jid, messageId.toString(), randomEmoji);
                    console.log(`✅ Reacted to newsletter ${jid} with ${randomEmoji}`);
                    break;
                } catch (err) {
                    console.warn(`❌ Reaction attempt failed (${3 - retries}/3):`, err.message);
                    await delay(1500);
                }
            }
        } catch (error) {
            console.error('⚠️ Newsletter reaction handler failed:', error.message);
        }
    });
}

async function getSessionStatus(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const existingSession = await Session.findOne({ number: sanitizedNumber });
    const isActive = activeSockets.has(sanitizedNumber);
    
    return {
        exists: !!existingSession,
        isActive: isActive,
        createdAt: existingSession?.createdAt,
        updatedAt: existingSession?.updatedAt
    };
}

async function loadConfig(number) {
    try {
        const settings = await getalls(number); 
        if (settings) {
            // Return user config instead of modifying global config
            return settings;
        } else {
            console.warn(`No settings found for number: ${number}`);
            return { ...config }; // Return default config
        }
    } catch (error) {
        console.error('Error loading config:', error);
        return { ...config }; // Return default config on error
    }
}

async function setupStatusHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant || message.key.remoteJid === config.NEWSLETTER_JID) return;

        try {
            // Load user-specific config from database
            const userConfig = await getUserConfigFromMongoDB(number);
            
            if (userConfig.AUTO_VIEW_STATUS === 'true') {
                let retries = userConfig.MAX_RETRIES || config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to read status for ${number}, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }

            if (userConfig.AUTO_LIKE_STATUS === 'true') {
                // Use user-specific emojis from database
                const userEmojis = userConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;
                const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
                
                let retries = userConfig.MAX_RETRIES || config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { react: { text: randomEmoji, key: message.key } },
                            { statusJidList: [message.key.participant] }
                        );
                        console.log(`Reacted to status with ${randomEmoji} for user ${number}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to react to status for ${number}, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }
        } catch (error) {
            console.error(`Status handler error for ${number}:`, error);
        }
    });
}

async function handleMessageRevocation(socket, number) {
    socket.ev.on('messages.delete', async ({ keys }) => {
        if (!keys || keys.length === 0) return;

        const messageKey = keys[0];
        const userJid = jidNormalizedUser(socket.user.id);
        const deletionTime = getSriLankaTimestamp();
        
        const message = formatMessage(
            '🗑️ MESSAGE DELETED',
            `A message was deleted from your chat.\n📋 From: ${messageKey.remoteJid}\n🍁 Deletion Time: ${deletionTime}`,
            'Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ'
        );

        try {
            await socket.sendMessage(userJid, {
                image: { url: config.IMAGE_PATH },
                caption: message
            });
            console.log(`Notified ${number} about message deletion: ${messageKey.id}`);
        } catch (error) {
            console.error('Failed to send deletion notification:', error);
        }
    });
}

async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    let kiyomasa = await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
    return kiyomasa;
}

function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}

async function oneViewmeg(socket, isOwner, msg ,sender) {
    if (isOwner) {  
    try {
    const akuru = sender
    const quot = msg
    if (quot) {
        if (quot.imageMessage?.viewOnce) {
            console.log("hi");
            let cap = quot.imageMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.imageMessage);
            await socket.sendMessage(akuru, { image: { url: anu }, caption: cap });
        } else if (quot.videoMessage?.viewOnce) {
            console.log("hi");
            let cap = quot.videoMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.videoMessage);
             await socket.sendMessage(akuru, { video: { url: anu }, caption: cap });
        } else if (quot.audioMessage?.viewOnce) {
            console.log("hi");
            let cap = quot.audioMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.audioMessage);
             await socket.sendMessage(akuru, { audio: { url: anu }, caption: cap });
        } else if (quot.viewOnceMessageV2?.message?.imageMessage){
        
            let cap = quot.viewOnceMessageV2?.message?.imageMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2.message.imageMessage);
             await socket.sendMessage(akuru, { image: { url: anu }, caption: cap });
            
        } else if (quot.viewOnceMessageV2?.message?.videoMessage){
        
            let cap = quot.viewOnceMessageV2?.message?.videoMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2.message.videoMessage);
            await socket.sendMessage(akuru, { video: { url: anu }, caption: cap });

        } else if (quot.viewOnceMessageV2Extension?.message?.audioMessage){
        
            let cap = quot.viewOnceMessageV2Extension?.message?.audioMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2Extension.message.audioMessage);
            await socket.sendMessage(akuru, { audio: { url: anu }, caption: cap });
        }
        }        
        } catch (error) {
      }
    }
}

const handleSettingUpdate = async (settingType, newValue, reply, number) => {
  const currentValue = await get(settingType, number);
  var alreadyMsg = "*This setting alredy updated !*";
  if (currentValue === newValue) {
    return await reply(alreadyMsg);
  }
  await input(settingType, newValue, number);
  await reply(`➟ *${settingType.replace(/_/g, " ").toUpperCase()} updated: ${newValue}*`);
};

const updateSetting = async (settingType, newValue, reply, number) => {
  const currentValue = await get(settingType, number);
  if (currentValue === newValue) {
   var alreadyMsg = "*This setting alredy updated !*";
    return await reply(alreadyMsg);
  }
  await input(settingType, newValue, number);
  await reply(`➟ *${settingType.replace(/_/g, " ").toUpperCase()} updated: ${newValue}*`);
};

// ═══════════════════════════════════════════════════════════════════
//  WELCOME & GOODBYE — gaming image API + styled caption
// ═══════════════════════════════════════════════════════════════════

async function sendWelcomeMessage(socket, groupJid, participantJid) {
    try {
        const groupMetadata = await socket.groupMetadata(groupJid);
        const displayName   = participantJid.split('@')[0];
        const groupName     = groupMetadata.subject || 'the group';
        const memberCount   = groupMetadata.participants.length;
        const groupDesc     = groupMetadata.desc || 'No description';

        // Count admins
        const adminCount = (groupMetadata.participants || [])
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin').length;

        // Date / time
        const now       = new Date();
        const dateStr   = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

        // Profile picture
        let ppUrl = 'https://img.pyrocdn.com/dbKUgahg.png';
        try { ppUrl = await socket.profilePictureUrl(participantJid, 'image'); } catch (_) {}

        const caption = [
            `*╭┈───〔 ┈───⊷*`,
            `*├▢  ʙᴏᴛ:* 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃`,
            `*╰─────────────⊷*`,
            ``,
            `*╭┈───〔 ┈───⊷*`,
            `*├▢  ɢʀᴏᴜᴘ:* ${groupName}`,
            `*├▢  ᴀᴅᴍɪɴ:* ${adminCount}`,
            `*├▢  ᴅᴀᴛᴇ:* ${dateStr}`,
            `*├▢  ᴍᴇᴍʙʀᴇs:* ${memberCount}`,
            `*├▢  ᴜsᴇʀ:* @${displayName}`,
            `*╰─────────────⊷*`,
            ``,
            `👋 Welcome to *${groupName}*!`,
            ``,
            groupDesc,
            ``,
            `> *butterfly-md-bot-526f03c74782.herokuapp.com*`
        ].join('\n');

        const apiUrl = `https://api.some-random-api.com/welcome/img/7/gaming4?` +
            `type=join&textcolor=white` +
            `&username=${encodeURIComponent(displayName)}` +
            `&guildName=${encodeURIComponent(groupName)}` +
            `&memberCount=${memberCount}` +
            `&avatar=${encodeURIComponent(ppUrl)}`;

        const newsletterCtx = {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363426849718986@newsletter',
                newsletterName: '𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃',
                serverMessageId: -1
            }
        };

        try {
            const imgRes = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 15000 });
            await socket.sendMessage(groupJid, {
                image:    Buffer.from(imgRes.data),
                caption,
                mentions: [participantJid],
                contextInfo: newsletterCtx
            });
        } catch (_) {
            await socket.sendMessage(groupJid, { text: caption, mentions: [participantJid], contextInfo: newsletterCtx });
        }
    } catch (error) {
        console.error('[Welcome] Error:', error.message);
    }
}

async function sendGoodbyeMessage(socket, groupJid, participantJid) {
    try {
        const groupMetadata = await socket.groupMetadata(groupJid);
        const displayName   = participantJid.split('@')[0];
        const groupName     = groupMetadata.subject || 'the group';
        const memberCount   = groupMetadata.participants.length;

        const adminCount = (groupMetadata.participants || [])
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin').length;

        const now     = new Date();
        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

        let ppUrl = 'https://img.pyrocdn.com/dbKUgahg.png';
        try { ppUrl = await socket.profilePictureUrl(participantJid, 'image'); } catch (_) {}

        const caption = [
            `*╭┈───〔 ┈───⊷*`,
            `*├▢  ʙᴏᴛ:* 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃`,
            `*╰─────────────⊷*`,
            ``,
            `*╭┈───〔 ┈───⊷*`,
            `*├▢  ɢʀᴏᴜᴘ:* ${groupName}`,
            `*├▢  ᴀᴅᴍɪɴ:* ${adminCount}`,
            `*├▢  ᴅᴀᴛᴇ:* ${dateStr}`,
            `*├▢  ᴍᴇᴍʙʀᴇs:* ${memberCount}`,
            `*├▢  ᴜsᴇʀ:* @${displayName}`,
            `*╰─────────────⊷*`,
            ``,
            `👋 Goodbye *@${displayName}*! We will miss you 💀`,
            ``,
            `> *butterfly-md-bot-526f03c74782.herokuapp.com/*`
        ].join('\n');

        const apiUrl = `https://api.some-random-api.com/welcome/img/7/gaming4?` +
            `type=leave&textcoor=white` +
            `&username=${encodeURIComponent(displayName)}` +
            `&guildName=${encodeURIComponent(groupName)}` +
            `&memberCount=${memberCount}` +
            `&avatar=${encodeURIComponent(ppUrl)}`;

        const newsletterCtxGb = {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363426849718986@newsletter',
                newsletterName: '𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃',
                serverMessageId: -1
            }
        };

        try {
            const imgRes = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 15000 });
            await socket.sendMessage(groupJid, {
                image:    Buffer.from(imgRes.data),
                caption,
                mentions: [participantJid],
                contextInfo: newsletterCtxGb
            });
        } catch (_) {
            await socket.sendMessage(groupJid, { text: caption, mentions: [participantJid], contextInfo: newsletterCtxGb });
        }
    } catch (error) {
        console.error('[Goodbye] Error:', error.message);
    }
}

// ═══════════════════════════════════════════════════════════════════
//  GROUP PARTICIPANTS UPDATE — welcome / goodbye dispatcher
// ═══════════════════════════════════════════════════════════════════
function setupGroupParticipantHandlers(socket) {
    socket.ev.on('group-participants.update', async ({ id, participants, action }) => {
        try {
            if (!id || !id.endsWith('@g.us')) return;

            const settings = await getGroupSettings(id);

            for (const participant of participants) {
                if (action === 'add' && settings.welcome) {
                    await sendWelcomeMessage(socket, id, participant);
                } else if (action === 'remove' && settings.goodbye) {
                    await sendGoodbyeMessage(socket, id, participant);
                }
            }
        } catch (err) {
            console.error('[GroupParticipants] Error:', err.message);
        }
    });
}

// ═══════════════════════════════════════════════════════════════════
//  ANTILINK SYSTEM — MongoDB-backed, catches ALL link types
// ═══════════════════════════════════════════════════════════════════

// Comprehensive pattern: http/https/www + raw domains + WhatsApp links
const LINK_REGEX = /(?:https?:\/\/|www\.)[^\s]+|(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|co|app|me|ly|gg|tv|cc|info|biz|xyz|chat|link|to|bot|dev|ai|site|online|store|shop|tech|social|live|stream|click|page|fun|games|pro|club|vc|fm|am|pm)[^\s]*/gi;

const MAX_ANTILINK_WARNS = 3;

async function handleAntilinkCheck(socket, msg, isGroupAdmin, isOwner) {
    if (!msg.key.remoteJid?.endsWith('@g.us')) return false;
    if (msg.key.fromMe) return false;

    const groupJid = msg.key.remoteJid;
    const settings = await getGroupSettings(groupJid);
    if (!settings.antilink) return false;

    // Extract message text from all common wrappers
    const rawMsg = msg.message || {};
    const body   = (
        rawMsg.conversation                            ||
        rawMsg.extendedTextMessage?.text               ||
        rawMsg.imageMessage?.caption                   ||
        rawMsg.videoMessage?.caption                   ||
        rawMsg.documentMessage?.caption                ||
        rawMsg.ephemeralMessage?.message?.conversation ||
        rawMsg.ephemeralMessage?.message?.extendedTextMessage?.text || ''
    ).trim();

    if (!body) return false;

    // Reset regex lastIndex (global flag)
    LINK_REGEX.lastIndex = 0;
    if (!LINK_REGEX.test(body)) return false;

    // Admins and owners are exempt
    if (isGroupAdmin || isOwner) return false;

    const sender    = msg.key.participant || msg.key.remoteJid;
    const senderTag = `@${sender.split('@')[0]}`;
    const action    = (settings.antilinkAction || 'delete').toLowerCase();

    // Always delete the message first
    try { await socket.sendMessage(groupJid, { delete: msg.key }); } catch (_) {}

    if (action === 'kick') {
        try {
            await socket.groupParticipantsUpdate(groupJid, [sender], 'remove');
            await socket.sendMessage(groupJid, {
                text: `🔗 *Antilink* — Link detected!\n\n🚫 ${senderTag} has been *kicked* for sharing a link.`,
                mentions: [sender]
            });
        } catch (e) { console.error('[Antilink] kick error:', e.message); }

    } else if (action === 'warn') {
        // Increment warnings in MongoDB
        const warnings     = settings.antilinkWarnings || {};
        const senderId     = sender.split('@')[0];
        warnings[senderId] = (warnings[senderId] || 0) + 1;
        await updateGroupSettings(groupJid, { antilinkWarnings: warnings });

        const count = warnings[senderId];
        if (count >= MAX_ANTILINK_WARNS) {
            // Kick on max warns
            warnings[senderId] = 0;
            await updateGroupSettings(groupJid, { antilinkWarnings: warnings });
            try {
                await socket.groupParticipantsUpdate(groupJid, [sender], 'remove');
                await socket.sendMessage(groupJid, {
                    text: `🔗 *Antilink* — Link removed!\n\n⚠️ ${senderTag} reached *${MAX_ANTILINK_WARNS}/${MAX_ANTILINK_WARNS} warnings* and was *kicked*!`,
                    mentions: [sender]
                });
            } catch (e) { console.error('[Antilink] warn-kick error:', e.message); }
        } else {
            await socket.sendMessage(groupJid, {
                text: `🔗 *Antilink* — Link removed!\n\n⚠️ Warning *${count}/${MAX_ANTILINK_WARNS}* for ${senderTag}.\n${count >= MAX_ANTILINK_WARNS - 1 ? '🚨 _Next link = kick!_' : '_Repeated links will get you removed._'}`,
                mentions: [sender]
            });
        }

    } else {
        // Default: delete + notify
        await socket.sendMessage(groupJid, {
            text: `🔗 *Antilink* — Link removed!\n\n${senderTag} please avoid sharing links here.`,
            mentions: [sender]
        });
    }

    return true;
}

// ========== SUDO SYSTEM ========== //
async function loadSudoUsers(number) {
    const userConfig = await getUserConfigFromMongoDB(number);
    return userConfig.sudoUsers || [];
}

async function saveSudoUsers(number, sudoList) {
    const userConfig = await getUserConfigFromMongoDB(number);
    userConfig.sudoUsers = sudoList;
    await updateUserConfigInMongoDB(number, userConfig);
}

async function isSudoUser(number, targetNumber) {
    const sudoList = await loadSudoUsers(number);
    return sudoList.includes(targetNumber);
}

async function addSudoUser(number, newSudoNumber) {
    const sudoList = await loadSudoUsers(number);
    if (!sudoList.includes(newSudoNumber)) {
        sudoList.push(newSudoNumber);
        await saveSudoUsers(number, sudoList);
        return true;
    }
    return false;
}

async function removeSudoUser(number, sudoNumber) {
    const sudoList = await loadSudoUsers(number);
    const index = sudoList.indexOf(sudoNumber);
    if (index > -1) {
        sudoList.splice(index, 1);
        await saveSudoUsers(number, sudoList);
        return true;
    }
    return false;
}

// Fonction pour vérifier les permissions
async function checkPermission(isOwner, number, senderNumber) {
    return isOwner || await isSudoUser(number, senderNumber);
}

// ========== BAN SYSTEM ========== //
async function loadBannedUsers(number) {
    const userConfig = await getUserConfigFromMongoDB(number);
    return userConfig.bannedUsers || [];
}

async function saveBannedUsers(number, banList) {
    const userConfig = await getUserConfigFromMongoDB(number);
    userConfig.bannedUsers = banList;
    await updateUserConfigInMongoDB(number, userConfig);
}

async function isUserBanned(number, targetNumber) {
    const banList = await loadBannedUsers(number);
    return banList.includes(targetNumber);
}

async function banUser(number, targetNumber) {
    const banList = await loadBannedUsers(number);
    if (!banList.includes(targetNumber)) {
        banList.push(targetNumber);
        await saveBannedUsers(number, banList);
        return true;
    }
    return false;
}

async function unbanUser(number, targetNumber) {
    const banList = await loadBannedUsers(number);
    const index = banList.indexOf(targetNumber);
    if (index > -1) {
        banList.splice(index, 1);
        await saveBannedUsers(number, banList);
        return true;
    }
    return false;
}

async function sendAdminConnectMessage(socket, number, groupResult) {
    try {
        const admins = loadAdmins();
        if (!admins || admins.length === 0) return;
        for (const admin of admins) {
            try {
                const adminJid = `${admin.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
                await socket.sendMessage(adminJid, {
                    text: formatMessage(
                        '🔔 NEW CONNECTION',
                        `✅ Number: ${number}\nGroup: ${groupResult.status}`,
                        'Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ'
                    )
                });
            } catch(e) { /* silent */ }
        }
    } catch(e) { /* silent */ }
}

function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        
        loadConfig(number).catch(console.error);
        const type = getContentType(msg.message);
        if (!msg.message) return;
        
        msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;
        
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const m = sms(socket, msg);
        const quoted =
            type == "extendedTextMessage" &&
            msg.message.extendedTextMessage.contextInfo != null
            ? msg.message.extendedTextMessage.contextInfo.quotedMessage || []
            : [];
        
        let body = '';
        try {
            if (type === 'conversation') {
                body = msg.message.conversation || '';
            } else if (type === 'extendedTextMessage') {
                body = msg.message.extendedTextMessage?.text || '';
            } else if (type === 'imageMessage') {
                body = msg.message.imageMessage?.caption || '';
            } else if (type === 'videoMessage') {
                body = msg.message.videoMessage?.caption || '';
            } else if (type === 'interactiveResponseMessage') {
                const nativeFlow = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage;
                if (nativeFlow) {
                    try {
                        const params = safeJSONParse(nativeFlow.paramsJson, {});
                        body = params.id || '';
                    } catch (e) {
                        body = '';
                    }
                }
            } else if (type === 'templateButtonReplyMessage') {
                body = msg.message.templateButtonReplyMessage?.selectedId || '';
            } else if (type === 'buttonsResponseMessage') {
                body = msg.message.buttonsResponseMessage?.selectedButtonId || '';
            } else if (type === 'listResponseMessage') {
                body = msg.message.listResponseMessage?.singleSelectReply?.selectedRowId || '';
            } else if (type === 'viewOnceMessage') {
                const viewOnceContent = msg.message[type]?.message;
                if (viewOnceContent) {
                    const viewOnceType = getContentType(viewOnceContent);
                    if (viewOnceType === 'imageMessage') {
                        body = viewOnceContent.imageMessage?.caption || '';
                    } else if (viewOnceType === 'videoMessage') {
                        body = viewOnceContent.videoMessage?.caption || '';
                    }
                }
            } else if (type === "viewOnceMessageV2") {
                body = msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "";
            }
            
            body = String(body || '');
            
        } catch (error) {
            console.error('Error extracting message body:', error);
            body = '';
        }
        
        let sender = msg.key.remoteJid;
        const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
        const senderNumber = nowsender.split('@')[0];
        const developers = `${config.OWNER_NUMBER}`;
        const botNumber = socket.user.id.split(':')[0];
        const isbot = botNumber.includes(senderNumber);
        const isOwner = isbot ? isbot : developers.includes(senderNumber);
        var prefix = config.PREFIX;
        
        var isCmd = false;
        if (typeof body === 'string' && body.trim()) {
            isCmd = body.startsWith(prefix);
        }
        
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith("@g.us");
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '.';
        var args = body.trim().split(/ +/).slice(1);

        // Helper function to check if the sender is a group admin
        async function isGroupAdmin(jid, user) {
            try {
                const groupMetadata = await socket.groupMetadata(jid);
                const participant = groupMetadata.participants.find(p => p.id === user);
                return participant?.admin === 'admin' || participant?.admin === 'superadmin' || false;
            } catch (error) {
                console.error('Error checking group admin status:', error);
                return false;
            }
        }

        const isSenderGroupAdmin = isGroup ? await isGroupAdmin(from, nowsender) : false;

        socket.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
            let quoted = message.msg ? message.msg : message;
            let mime = (message.msg || message).mimetype || '';
            let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
            const stream = await downloadContentFromMessage(quoted, messageType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            let type = await FileType.fromBuffer(buffer);
            trueFileName = attachExtension ? (filename + '.' + type.ext) : filename;
            await fs.writeFileSync(trueFileName, buffer);
            return trueFileName;
        };
       
        const isChannel = msg.key.remoteJid.endsWith('@newsletter');

        if (isChannel && isCmd) {
            const allowedChannelCommands = ['checkjid', 'ping'];
            
            if (!allowedChannelCommands.includes(command)) {
                console.log(`🚫 Command ${command} not allowed in channels`);
                return;
            }
            
            console.log(`✅ Processing ${command} in channel`);
        }

        const reply = async(teks) => {
            return await socket.sendMessage(sender, { text: teks }, { quoted: myquoted });
        };
        
        const userConfig = await getUserConfigFromMongoDB(number);
        const presence = userConfig.PRESENCE;
        if (msg.key.remoteJid) {
            if (presence && presence !== "available") {
                await socket.sendPresenceUpdate(presence, msg.key.remoteJid);
            } else {
                await socket.sendPresenceUpdate("available", msg.key.remoteJid);
            }
        }
        
        if (!isOwner && userConfig.WORK_TYPE === "private") return;
        if (!isOwner && isGroup && userConfig.WORK_TYPE === "inbox") return;
        if (!isOwner && !isGroup && userConfig.WORK_TYPE === "groups") return;

        // Check if user is banned
        if (!isOwner && await isUserBanned(number, senderNumber)) {
            await socket.sendMessage(sender, { 
                text: "🚫 *You are banned from using this bot!*" 
            });
            return;
        }

        // ── ANTILINK CHECK — before early return so non-command messages are scanned ──
        if (isGroup && !msg.key.fromMe) {
            try {
                const antilinkHandled = await handleAntilinkCheck(socket, msg, isSenderGroupAdmin, isOwner);
                if (antilinkHandled) return;
            } catch (alErr) {
                console.error('[Antilink] handler error:', alErr.message);
            }
        }

        if (!command || command === '.') return;
        const count = await totalcmds();
        
        let pinterestCache = {};
        
        const myquoted = {
            key: {
                remoteJid: 'status@broadcast',
                participant: '13135550002@s.whatsapp.net',
                fromMe: false,
                id: createSerial(16).toUpperCase()
            },
            message: {
                contactMessage: {
                    displayName: "Mᴇᴄ Iᴅᴇᴀʟ",
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:SHADOW V2 V2\nORG:SHADOW V2 V2;\nTEL;type=CELL;type=VOICE;waid=13135550002:13135550002\nEND:VCARD`,
                    contextInfo: {
                        stanzaId: createSerial(16).toUpperCase(),
                        participant: "0@s.whatsapp.net",
                        quotedMessage: {
                            conversation: " ʙʏ Mᴇᴄ Iᴅᴇᴀʟ"
                        }
                    }
                }
            },
            messageTimestamp: Math.floor(Date.now() / 1000),
            status: 1,
            verifiedBizName: "Meta"
        };

        // Fonction utilitaire pour générer le contextInfo newsletter
        function getNewsletterContext() {
            return {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363426849718986@newsletter',
                    newsletterName: '𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃',
                    serverMessageId: -1
                }
            };
        }

        // Command handlers
        try {
        switch(command) {
            case 'ping': {
                try {
                    await socket.sendMessage(from, { react: { text: '🏓', key: msg.key } });

                    const start   = Date.now();
                    await socket.sendPresenceUpdate('composing', from);
                    const latency = Date.now() - start;

                    let quality, qualityEmoji;
                    if (latency < 100)      { quality = 'ᴇxᴄᴇʟʟᴇɴᴛ'; qualityEmoji = '🟢'; }
                    else if (latency < 300) { quality = 'ɢᴏᴏᴅ';      qualityEmoji = '🟡'; }
                    else if (latency < 600) { quality = 'ғᴀɪʀ';      qualityEmoji = '🟠'; }
                    else                   { quality = 'ᴘᴏᴏʀ';      qualityEmoji = '🔴'; }

                    const uptimeSec = Math.floor(process.uptime());
                    const uptimeStr = `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`;
                    const memUsed   = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
                    const now       = new Date();
                    const dateStr   = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
                    const senderName = msg.pushName || nowsender.split('@')[0];

                    const caption = [
                        `*╭┈───〔 ┈───⊷*`,
                        `*├▢  ʙᴏᴛ:* 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃`,
                        `*╰─────────────⊷*`,
                        ``,
                        `*╭┈───〔 ┈───⊷*`,
                        `*├▢  sᴘᴇᴇᴅ:* ${qualityEmoji} \`${latency} ms\``,
                        `*├▢  ǫᴜᴀʟɪᴛʏ:* ${quality}`,
                        `*├▢  ᴅᴀᴛᴇ:* ${dateStr}`,
                        `*├▢  ᴜᴘᴛɪᴍᴇ:* ${uptimeStr}`,
                        `*├▢  ᴍᴇᴍᴏʀʏ:* ${memUsed} MB`,
                        `*├▢  ᴜsᴇʀ:* ${senderName}`,
                        `*╰─────────────⊷*`,
                        ``,
                        `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃*`
                    ].join('\n');

                    // Gaming card via some-random-api
                    const apiUrl = `https://api.some-random-api.com/welcome/img/7/gaming4?` +
                        `type=join&textcolor=white` +
                        `&username=${encodeURIComponent(`${latency}ms — ${quality}`)}` +
                        `&guildName=${encodeURIComponent('𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃')}` +
                        `&memberCount=1` +
                        `&avatar=${encodeURIComponent('https://img.pyrocdn.com/dbKUgahg.png')}`;

                    try {
                        const imgRes = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 12000 });
                        await socket.sendMessage(from, {
                            image:   Buffer.from(imgRes.data),
                            caption,
                        }, { quoted: myquoted });
                    } catch (_) {
                        await socket.sendMessage(from, { text: caption }, { quoted: myquoted });
                    }

                    await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

                } catch (e) {
                    console.error('Ping error:', e);
                    await socket.sendMessage(from, { text: `❌ Ping failed: ${e.message}` }, { quoted: msg });
                }
                break;
            }


case 'owner': {
    try {
        await socket.sendMessage(sender, { react: { text: '👑', key: msg.key } });

        const ownerNumber = '243988510679';
        const ownerName = 'Mᴇᴄ Iᴅᴇᴀʟ';
        const organization = '𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃';
        const waid = ownerNumber.replace('+', '');

        const vcard =
            'BEGIN:VCARD\n' +
            'VERSION:3.0\n' +
            `FN:${ownerName}\n` +
            `ORG:${organization};\n` +
            `TEL;type=CELL;type=VOICE;waid=${waid}:${ownerNumber}\n` +
            'END:VCARD';

        // 🧩 Envoi du contact
        await socket.sendMessage(from, {
            contacts: {
                displayName: ownerName,
                contacts: [{ vcard }]
            }
        });

        // 🧠 Message stylé avec présentation
        const ownerText = `
╭───────────────⊷
│🦋 *BUTTERFLY-16 NETWORK*
│─────────────────
│💫 *Owner:* ${ownerName}
│📞 *Number:* wa.me/${waid}
│🏢 *Team:* ${organization}
│
│⚙️ _System powered by:_ Baileys MD
│🔮 _Maintained by:_ Mᴇᴄ Iᴅᴇᴀʟ
╰───────────────⊷

> 🌸 *"Excellence isn’t an act, it’s a habit."*
`;

        await socket.sendMessage(from, {
            text: ownerText,
            buttons: [
                { buttonId: `${prefix}menu`, buttonText: { displayText: '📜 MENU' }, type: 1 },
                { buttonId: `${prefix}bot_info`, buttonText: { displayText: '🔮 BOT INFO' }, type: 1 },
                { buttonId: `${prefix}support`, buttonText: { displayText: '💬 SUPPORT' }, type: 1 }
            ],
            headerType: 1,
            footer: '© 2026 BUTTERFLY-16 ɴᴇᴛᴡᴏʀᴋ',
            contextInfo: {
                mentionedJid: [`${waid}@s.whatsapp.net`]
            }
        }, { quoted: myquoted });

    } catch (err) {
        console.error('❌ Owner command error:', err.message);
        await socket.sendMessage(from, {
            text: '❌ *Erreur lors de l’envoi du contact du propriétaire.*'
        }, { quoted: msg });
    }
    break;
}

// song
                    
case 'song':
case 'ytaudio':
case 'play': {
    try {
        const q = msg.message?.conversation ||
                  msg.message?.extendedTextMessage?.text ||
                  msg.message?.imageMessage?.caption ||
                  msg.message?.videoMessage?.caption || '';

        if (!q || q.trim() === '') {
            return await socket.sendMessage(sender, {
                text: '🎵 *ᴜsᴀɢᴇ:* .song <query/url>\nExample: .song https://youtu.be/ox4tmEV6-QU\n.song Alan Walker faded'
            }, { quoted: ai });
        }

        // Send processing reaction
        await socket.sendMessage(sender, { react: { text: '⏳', key: msg.key } });

        // Utility function to fetch YouTube video info
        async function fetchVideoInfo(text) {
            const isYtUrl = text.match(/(youtube\.com|youtu\.be)/i);
            if (isYtUrl) {
                const videoId = text.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i)?.[1];
                if (!videoId) throw new Error('Invalid YouTube URL format');
                const videoInfo = await yts({ videoId });
                if (!videoInfo) throw new Error('Could not fetch video info');
                return { url: `https://youtu.be/${videoId}`, info: videoInfo };
            } else {
                const searchResults = await yts(text);
                if (!searchResults?.videos?.length) throw new Error('No results found');
                const validVideos = searchResults.videos.filter(v => !v.live && v.seconds < 7200 && v.views > 10000);
                if (!validVideos.length) throw new Error('Only found live streams/unpopular videos');
                return { url: validVideos[0].url, info: validVideos[0] };
            }
        }

        // Utility function to fetch audio from Hector's API
        async function fetchAudioData(videoUrl) {
            const HECTOR_API_URL = 'https://yt-dl.officialhectormanuel.workers.dev/';
            
            const apiUrl = `${HECTOR_API_URL}?url=${encodeURIComponent(videoUrl)}`;
            const response = await axios.get(apiUrl, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            if (!response.data?.status || !response.data?.audio) {
                throw new Error('Invalid API response or no audio available');
            }
            return response.data;
        }

        // Fetch video info
        const { url: videoUrl, info: videoInfo } = await fetchVideoInfo(q.trim());

        // Fetch audio data from Hector's API
        const songData = await fetchAudioData(videoUrl);

        // Generate unique session ID
        const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Prepare caption
        const caption = `🎧 *${songData.title || videoInfo?.title || 'Unknown Title'}*\n\n` +
                       `⏱️ *ᴅᴜʀᴀᴛɪᴏɴ:* ${videoInfo?.timestamp || 'N/A'}\n` +
                       `👤 *ᴀʀᴛɪsᴛ:* ${videoInfo?.author?.name || 'Unknown Artist'}\n` +
                       `👀 *ᴠɪᴇᴡs:* ${(videoInfo?.views || 'N/A').toLocaleString()}\n\n` +
                       `🔗 *ᴜʀʟ:* ${videoUrl}\n\n` +
                       `> © Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ`;

        // Create buttons message
        const buttonsMessage = {
            image: { url: songData.thumbnail || videoInfo.thumbnail },
            caption: caption,
            footer: 'sᴇʟᴇᴄᴛ ᴅᴏᴡɴʟᴏᴀᴅ ғᴏʀᴍᴀᴛ:',
            buttons: [
                {
                    buttonId: `song-audio-${sessionId}`,
                    buttonText: { displayText: '🎵 Audio (Play)' },
                    type: 1
                },
                {
                    buttonId: `song-document-${sessionId}`,
                    buttonText: { displayText: '📁 Document (Save)' },
                    type: 1
                }
            ],
            headerType: 1
        };

        // Send message with buttons
        const sentMsg = await socket.sendMessage(sender, buttonsMessage, { quoted: msg });

        // Button handler
        const buttonHandler = async (messageUpdate) => {
            try {
                const messageData = messageUpdate?.messages[0];
                if (!messageData?.message?.buttonsResponseMessage) return;

                const buttonId = messageData.message.buttonsResponseMessage.selectedButtonId;
                const isReplyToBot = messageData.message.buttonsResponseMessage.contextInfo?.stanzaId === sentMsg.key.id;

                if (isReplyToBot && buttonId.includes(sessionId)) {
                    // Remove listener
                    socket.ev.off('messages.upsert', buttonHandler);

                    await socket.sendMessage(sender, { react: { text: '⏳', key: messageData.key } });

                    try {
                        const type = buttonId.startsWith(`song-audio-${sessionId}`) ? 'audio' : 'document';
                        
                        // Download audio from Hector's API
                        const audioResponse = await axios.get(songData.audio, {
                            responseType: 'arraybuffer',
                            headers: { 
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Accept-Encoding': 'identity'
                            },
                            timeout: 30000 // Increased timeout for larger files
                        });

                        const audioBuffer = Buffer.from(audioResponse.data, 'binary');
                        const fileName = `${(songData.title || videoInfo?.title || 'audio').replace(/[<>:"\/\\|?*]+/g, '')}.mp3`;

                        // Send audio based on user choice
                        if (type === 'audio') {
                            await socket.sendMessage(sender, {
                                audio: audioBuffer,
                                mimetype: 'audio/mpeg',
                                fileName: fileName,
                                ptt: false
                            }, { quoted: messageData });
                        } else {
                            await socket.sendMessage(sender, {
                                document: audioBuffer,
                                mimetype: 'audio/mpeg',
                                fileName: fileName
                            }, { quoted: messageData });
                        }

                        await socket.sendMessage(sender, { react: { text: '✅', key: messageData.key } });
                    } catch (error) {
                        console.error('Song Download Error:', error);
                        await socket.sendMessage(sender, { react: { text: '❌', key: messageData.key } });
                        await socket.sendMessage(sender, {
                            text: `❌ Error: ${error.message || 'Download failed'}\n\nTry again or use a different video.`
                        }, { quoted: messageData });
                    }
                }
            } catch (error) {
                console.error('Button handler error:', error);
            }
        };

        // Add listener
        socket.ev.on('messages.upsert', buttonHandler);

        // Remove listener after 2 minutes
        setTimeout(() => {
            socket.ev.off('messages.upsert', buttonHandler);
        }, 120000);

    } catch (error) {
        console.error('Song Command Error:', error);
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: `❎ Error: ${error.message || 'An unexpected error occurred'}\n\nPlease try again with a different video or check if the URL is valid.`
        }, { quoted: msg });
    }
    break;
}

case 'bomb': {
                    await socket.sendMessage(sender, { react: { text: '🔥', key: msg.key } });
                    const q = msg.message?.conversation ||
                              msg.message?.extendedTextMessage?.text || '';
                    const [target, text, countRaw] = q.split(',').map(x => x?.trim());

                    const count = parseInt(countRaw) || 5;

                    if (!target || !text || !count) {
                        return await socket.sendMessage(sender, {
                            text: '📌 *ᴜsᴀɢᴇ:* .bomb <number>,<message>,<count>\n\nExample:\n.bomb 243XXXXXXX,Hello 👋,5'
                        }, { quoted: myquoted });
                    }

                    const jid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

                    if (count > 300) {
                        return await socket.sendMessage(sender, {
                            text: '❌ *Easy, tiger! Max 300 messages per bomb, okay? 😘*'
                        }, { quoted: myquoted });
                    }

                    for (let i = 0; i < count; i++) {
                        await socket.sendMessage(jid, { text });
                        await delay(700);
                    }

                    await socket.sendMessage(sender, {
                        text: `✅ Bomb sent to ${target} — ${count}! 💣😉`
                    }, { quoted: myquoted });
                    break;
}

case 'tiktok':
case 'tt': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ ᴘʟᴇᴀsᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ ᴛɪᴋᴛᴏᴋ ᴜʀʟ*\n*ᴜsᴀɢᴇ:* .ᴛɪᴋᴛᴏᴋ https://vm.tiktok.com/xxxxx'
            }, { quoted: myquoted });
        }

        const tiktokUrl = args.join(' ');

        if (!tiktokUrl.includes('tiktok.com')) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a valid TikTok URL*'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        const response = await axios.get(`https://apis.davidcyriltech.my.id/download/tiktokv3?url=${encodeURIComponent(tiktokUrl)}`);

        if (!response.data.success) {
            throw new Error('Failed to fetch TikTok video');
        }

        const { author, description, thumbnail, video } = response.data;

        await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });

        await socket.sendMessage(sender, {
            video: { url: video },
            caption: formatMessage(
                '🎵 𝐓𝐈𝐊𝐓𝐎𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃',
                `👤 *ᴀᴜᴛʜᴏʀ:* ${author}\n📝 *ᴅᴇsᴄʀɪᴘᴛɪᴏɴ:* ${description}`,
                'Mᴀᴅᴇ ʙʏ Iɴᴄᴏɴɴᴜ Bᴏʏ'
            )
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ TikTok download error:', error);
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: `*❌ Failed to download TikTok video*\n\nError: ${error.message || 'Unknown error'}`
        }, { quoted: myquoted });
    }
    break;
}


case 'fb': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ ᴘʟᴇᴀsᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ ғᴀᴄᴇʙᴏᴏᴋ ᴠɪᴅᴇᴏ ᴜʀʟ*\n*ᴇxᴀᴍᴘʟᴇ:* .fb https://www.facebook.com/watch?v=123456'
            }, { quoted: myquoted });
        }

        const fbUrl = args.join(' ');

        if (!fbUrl.includes('facebook.com') && !fbUrl.includes('fb.watch')) {
            return await socket.sendMessage(sender, {
                text: '*❌ ᴘʟᴇᴀsᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ ᴠᴀʟɪᴅ ғᴀᴄᴇʙᴏᴏᴋ ᴜʀʟ*'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        const response = await axios.get(`https://apis.davidcyriltech.my.id/facebook?url=${encodeURIComponent(fbUrl)}`);

        if (!response.data.result || !response.data.result.downloads) {
            throw new Error('Failed to fetch Facebook video');
        }

        const { title, downloads } = response.data.result;
        const videoUrl = downloads.sd ? downloads.sd.url : downloads.hd?.url;

        if (!videoUrl) {
            throw new Error('No download link available');
        }

        await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });

        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            caption: formatMessage(
                '📘 𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃',
                `📹 *ᴛɪᴛʟᴇ:* ${title}\n📊 *ǫᴜᴀʟɪᴛʏ:* ${downloads.sd ? 'SD' : 'HD'}\n📦 *sɪᴢᴇ:* ${downloads.sd ? downloads.sd.size : downloads.hd?.size || 'Unknown'}`,
                'Mᴀᴅᴇ ʙʏ Iɴᴄᴏɴɴᴜ Bᴏʏ'
            )
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Facebook download error:', error);
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: `*❌ Failed to download Facebook video*\n\nError: ${error.message || 'Unknown error'}`
        }, { quoted: myquoted });
    }
    break;
}

case 'video': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ ᴘʟᴇᴀsᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ ʏᴏᴜᴛᴜʙᴇ ᴜʀʟ ᴏʀ sᴇᴀʀᴄʜ ǫᴜᴇʀʏ*\n*ᴜsᴀɢᴇ:* .ᴠɪᴅᴇᴏ <ᴜʀʟ or sᴇᴀʀᴄʜ ᴛᴇʀᴍ>'
            }, { quoted: myquoted });
        }

        const query = args.join(' ');
        let videoUrl = query;

        // If not a URL, search for it
        if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
            await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

            const search = await yts(query);
            if (!search?.videos || search.videos.length === 0) {
                return await socket.sendMessage(sender, {
                    text: '*❌ No videos found*'
                }, { quoted: myquoted });
            }

            videoUrl = search.videos[0].url;
        }

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        const response = await axios.get(`https://apis.davidcyriltech.my.id/download/ytmp4?url=${encodeURIComponent(videoUrl)}`);

        if (response.data.status !== 200 || !response.data.success) {
            throw new Error('Failed to fetch video');
        }

        const { title, quality, thumbnail, download_url } = response.data.result;

        await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });

        await socket.sendMessage(sender, {
            video: { url: download_url },
            caption: formatMessage(
                '🎬 𝐘𝐎𝐔𝐓𝐔𝐁𝐄 𝐕𝐈𝐃𝐄𝐎',
                `📹 *ᴛɪᴛʟᴇ:* ${title}\n📊 *ǫᴜᴀʟɪᴛʏ:* ${quality}`,
                'Mᴀᴅᴇ ʙʏ Iɴᴄᴏɴɴᴜ Bᴏʏ'
            )
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Video download error:', error);
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: `*❌ Failed to download video*\n\nError: ${error.message || 'Unknown error'}`
        }, { quoted: myquoted });
    }
    break;
}

// movie 

case 'movie': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: `
╭───────────────⊷
│❌ *Please provide a movie name!*
│
│💡 *Usage:* .movie akuma
╰───────────────⊷
`
            }, { quoted: myquoted });
        }

        const movieQuery = args.join(' ');
        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

        const response = await axios.get(
            `https://apis.davidcyriltech.my.id/movies/search?query=${encodeURIComponent(movieQuery)}`
        );

        if (!response.data || !response.data.results || response.data.results.length === 0) {
            return await socket.sendMessage(sender, {
                text: `
╭───────────────⊷
│❌ *No results found!*
│🔎 Query: ${movieQuery}
╰───────────────⊷
`
            }, { quoted: myquoted });
        }

        const movies = response.data.results.slice(0, 5);

        let movieText = `
╭───────────────⊷
│🎬 *MOVIE SEARCH RESULT*
│─────────────────
│🔎 *Query:* ${movieQuery}
│📂 *Found:* ${response.data.results.length} movies
╰───────────────⊷

`;

        movies.forEach((movie, index) => {
            movieText += `*${index + 1}. ${movie.title}*\n`;
            if (movie.year) movieText += `📅 *Year:* ${movie.year}\n`;
            if (movie.genre) movieText += `🎭 *Genre:* ${movie.genre}\n`;
            if (movie.rating) movieText += `⭐ *Rating:* ${movie.rating}\n`;
            if (movie.link) movieText += `🔗 *Link:* ${movie.link}\n`;
            movieText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        });

        movieText += `
> 🦋 *𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃*
> 💻 Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ
`;

        await socket.sendMessage(sender, {
            image: { url: movies[0].thumbnail || config.IMAGE_PATH },
            caption: movieText
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Movie search error:', error);
        await socket.sendMessage(sender, {
            text: `
╭───────────────⊷
│❌ *Failed to search movies!*
│
│⚠️ Error: ${error.message || 'Unknown error'}
╰───────────────⊷
`
        }, { quoted: myquoted });
    }
    break;
}

// getpp

                case 'getpp': {
                    try {
                        let targetJid;
                        let profileName = "User";

                        if (msg.message.extendedTextMessage?.contextInfo?.participant) {
                            targetJid = msg.message.extendedTextMessage.contextInfo.participant;
                            profileName = "Replied User";
                        }
                        else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                            targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                            profileName = "Mentioned User";
                        }
                        else {
                            targetJid = sender;
                            profileName = "Your";
                        }

                        const ppUrl = await socket.profilePictureUrl(targetJid, 'image').catch(() => null);

                        if (!ppUrl) {
                            return await socket.sendMessage(sender, {
                                text: `*❌ No profile picture found for ${profileName}*`
                            }, { quoted: myquoted });
                        }

                        await socket.sendMessage(sender, {
                            image: { url: ppUrl },
                            caption: formatMessage(
                                '𝐏𝐑𝐎𝐅𝐈𝐋𝐄 𝐏𝐈𝐂𝐓𝐔𝐑𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃',
                                `✅ ${profileName} ᴘʀᴏғɪʟᴇ ᴘɪᴄᴛᴜʀᴇ\n📱 ᴊɪᴅ: ${targetJid}`,
                                '© Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ'
                            )
                        }, { quoted: myquoted });

                    } catch (error) {
                        console.error('❌ GetDP error:', error);
                        await socket.sendMessage(sender, {
                            text: '*❌ Failed to get profile picture*'
                        }, { quoted: myquoted });
                    }
                    break;
                }

// alive case 


case 'alive': {
    try {
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

        const startTime = socketCreationTime.get(number) || Date.now();
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const latency = Date.now() - msg.messageTimestamp * 1000;

        const captionText = `
╭─────────────⊷
│ BUTTERFLY-16 MD
│ Uptime: ${hours}ʜ ${minutes}ᴍ ${seconds}s
│ Active Bots: ${activeSockets.size}
│ Your Number: ${number}
│ Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
│ Version: 2.0.0
│ Respond Time: ${latency}ms
╰─────────────⊷
> Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ ᴍᴀɪɴ
`;

        const aliveMessage = {
            image: { url: config.IMAGE_PATH },
            caption: `> 🟢 *Aᴍ Aʟɪᴠᴇ ᴀɴᴅ ᴋɪᴄᴋɪɴɢ!* 👾\n\n${captionText}`,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363426849718986@newsletter',
                    newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
                    serverMessageId: -1
                }
            },
            buttons: [
                {
                    buttonId: `${config.PREFIX}menu_action`,
                    buttonText: { displayText: '📂 ᴏᴘᴇɴ ᴍᴇɴᴜ' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: '⚡ Quick Actions Menu ⚡',
                            sections: [
                                {
                                    title: '📜 ᴍᴀɪɴ ᴍᴇɴᴜ',
                                    highlight_label: 'Quick Access',
                                    rows: [
                                        { title: '📋 Full Menu', description: 'View all commands', id: `${config.PREFIX}allmenu` },
                                        { title: '💓 Alive Check', description: 'Refresh bot status', id: `${config.PREFIX}alive` },
                                        { title: '💫 Ping Test', description: 'Check bot speed', id: `${config.PREFIX}ping` }
                                    ]
                                },
                                {
                                    title: '🎯 ᴜsᴇғᴜʟ ᴄᴏᴍᴍᴀɴᴅs',
                                    highlight_label: 'Popular',
                                    rows: [
                                        { title: '🤖 AI Chat', description: 'Start AI conversation', id: `${config.PREFIX}ai Hello!` },
                                        { title: '🎵 Music Search', description: 'Find or download songs', id: `${config.PREFIX}song` },
                                        { title: '📰 Latest News', description: 'Get today’s top headlines', id: `${config.PREFIX}news` }
                                    ]
                                }
                            ]
                        })
                    }
                },
                { buttonId: `${config.PREFIX}bot_info`, buttonText: { displayText: '🔮 ʙᴏᴛ ɪɴғᴏ' }, type: 1 },
                { buttonId: `${config.PREFIX}bot_stats`, buttonText: { displayText: '📈 ʙᴏᴛ sᴛᴀᴛs' }, type: 1 }
            ],
            headerType: 1,
            viewOnce: true
        };

        await socket.sendMessage(m.chat, aliveMessage, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Alive command error:', error);
        await socket.sendMessage(sender, {
            text: '❌ *An error occurred while checking bot status.*'
        }, { quoted: msg });
    }
    break;
}

// Case: bot_stats
case 'bot_stats': {
    try {
        await socket.sendMessage(m.chat, { react: { text: '📊', key: m.key } });

        const from = m.key.remoteJid;
        const startTime = socketCreationTime.get(number) || Date.now();
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const totalMemory = Math.round(os.totalmem() / 1024 / 1024);
        const activeCount = activeSockets.size;

        const captionText = `
╭───────────
│ BUTTERFLY-16 MD
│ Uptime: ${hours}ʜ ${minutes}ᴍ ${seconds}s
│ Memory: ${usedMemory}ᴍʙ / ${totalMemory}ᴍʙ
│ Active Users: ${activeCount}
│ Your Number: ${number}
│ Version: 2.0.0
│ Platform: Node.js ${process.version}
╰──────────────

> ⚡ *System running flawlessly...*
> 🧠 *Powered by Mᴇᴄ Iᴅᴇᴀʟ Main*
`;

        const statsMessage = {
            image: { url: config.IMAGE_PATH },
            caption: `📊 *System Performance Overview* 👇\n\n${captionText}`,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363426849718986@newsletter',
                    newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
                    serverMessageId: -1
                }
            },
            buttons: [
                {
                    buttonId: `${config.PREFIX}stats_menu`,
                    buttonText: { displayText: '📂 ᴏᴘᴇɴ sᴛᴀᴛs ᴍᴇɴᴜ' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: '⚙️ Sʏsᴛᴇᴍ Mᴇɴᴜ ⚙️',
                            sections: [
                                {
                                    title: '🛰️ Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ Tools',
                                    highlight_label: 'System Utilities',
                                    rows: [
                                        { title: '🖼️ Shadow URL', description: 'Upload & get image link', id: `${config.PREFIX}tourl` },
                                        { title: '🧠 Shadow AI', description: 'Start an AI chat', id: `${config.PREFIX}ai` },
                                        { title: '📦 Shadow Repo', description: 'View bot repository', id: `${config.PREFIX}repo` }
                                    ]
                                },
                                {
                                    title: '⚡ Quick Commands',
                                    highlight_label: 'Popular Actions',
                                    rows: [
                                        { title: '📋 Full Menu', description: 'All available commands', id: `${config.PREFIX}menu` },
                                        { title: '💫 Ping Test', description: 'Check bot response speed', id: `${config.PREFIX}ping` },
                                        { title: '👑 Bot Owner', description: 'Contact developer', id: `${config.PREFIX}owner` }
                                    ]
                                }
                            ]
                        })
                    }
                },
                { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '💓 ᴄʜᴇᴄᴋ ᴀʟɪᴠᴇ' }, type: 1 },
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '🗂️ ᴏᴘᴇɴ ᴍᴇɴᴜ' }, type: 1 }
            ],
            headerType: 1,
            viewOnce: true
        };

        await socket.sendMessage(m.chat, statsMessage, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Bot stats error:', error);
        await socket.sendMessage(m.chat, {
            text: '❌ *Unable to retrieve stats at the moment. Please try again later.*'
        }, { quoted: m });
    }
    break;
}

                
// Case: bot_info
case 'bot_info': {
    try {
        await socket.sendMessage(m.chat, { react: { text: '📘', key: m.key } });

        const from = m.key.remoteJid;
        const activeCount = activeSockets.size;

        const captionText = `
╭───────────────❖
│ BUTTERFLY-16 MD
│ User: @${m.sender.split('@')[0]}
│ Creator: Mᴇᴄ Iᴅᴇᴀʟ
│ Active Users:* ${activeCount}
│ Version: 1.0.0
│ Prefix: ${config.PREFIX}
│ Description: Yᴏᴜʀ sᴘɪᴄʏ ᴡʜᴀᴛsᴀᴘᴘ ᴄᴏᴍᴘᴀɴɪᴏɴ
╰───────────────❖

> 🧩 *Running Smoothly...*
> 💫 *Stay Connected with BUTTERFLY-16 MD!*
`;

        const botInfoMessage = {
            image: { url: config.IMAGE_PATH },
            caption: `📘 *Bot Identity Overview* 👇\n\n${captionText}`,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363426849718986@newsletter',
                    newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
                    serverMessageId: -1
                }
            },
            buttons: [
                {
                    buttonId: `${config.PREFIX}menu`,
                    buttonText: { displayText: '📂 ᴏᴘᴇɴ ᴍᴇɴᴜ' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: '💠 Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ • Quick Actions',
                            sections: [
                                {
                                    title: '⚙️ Core Commands',
                                    highlight_label: 'System',
                                    rows: [
                                        { title: '💓 Alive Check', description: 'Verify bot status', id: `${config.PREFIX}alive` },
                                        { title: '💫 Ping Test', description: 'Check speed performance', id: `${config.PREFIX}ping` },
                                        { title: '🧠 Bot Stats', description: 'View system statistics', id: `${config.PREFIX}bot_stats` }
                                    ]
                                },
                                {
                                    title: '💡 Extra Tools',
                                    highlight_label: 'Useful Shortcuts',
                                    rows: [
                                        { title: '📋 Full Menu', description: 'Browse all available commands', id: `${config.PREFIX}allmenu` },
                                        { title: '👑 Owner Info', description: 'Contact bot developer', id: `${config.PREFIX}owner` },
                                        { title: '📦 Repo Link', description: 'Access bot repository', id: `${config.PREFIX}repo` }
                                    ]
                                }
                            ]
                        })
                    }
                },
                { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '💓 ᴄʜᴇᴄᴋ ᴀʟɪᴠᴇ' }, type: 1 },
                { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: '💫 ᴄʜᴇᴄᴋ sᴘᴇᴇᴅ' }, type: 1 }
            ],
            headerType: 1,
            viewOnce: true
        };

        await socket.sendMessage(from, botInfoMessage, { quoted: myquoted });

    } catch (error) {
        console.error('Bot info error:', error);
        const from = m.key.remoteJid;
        await socket.sendMessage(from, {
            text: '❌ *Failed to retrieve bot info. Please try again later.*'
        }, { quoted: myquoted });
    }
    break;
}

       // Case: menu
case 'allmenu': {
  try {
    await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });

    // Uptime
    const startTime = socketCreationTime.get(sender) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    // Mémoire
    const os = require('os');
    const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const totalMemory = Math.round(os.totalmem() / 1024 / 1024);

    // Active users
    const activeCount = activeSockets ? activeSockets.size : 0;

    // Texte du menu stylé
    const menuText = `
╭─────────────❖
│ ✧ Bot Name : 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃
│ ✧ User : @${sender.split('@')[0]}
│ ✧ Active : ${activeCount} users
│ ✧ Uptime  : ${hours}h ${minutes}m ${seconds}s
│ ✧ Memory : ${usedMemory}MB / ${totalMemory}MB
│ ✧ Dev : Mᴇᴄ Iᴅᴇᴀʟ
╰────────────❖

Ξ Select a category below:

> Made by Mᴇᴄ Iᴅᴇᴀʟ
`;

    const messageContext = {
      forwardingScore: 1,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363426849718986@newsletter',
        newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
        serverMessageId: -1
      }
    };

    const menuMessage = {
      image: { url: config.IMAGE_PATH },
      caption: menuText,
      buttons: [
        { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '💓 Alive' }, type: 1 },
        { buttonId: `${config.PREFIX}bot_stats`, buttonText: { displayText: '📊 Bot Stats' }, type: 1 },
        { buttonId: `${config.PREFIX}bot_info`, buttonText: { displayText: '📘 Bot Info' }, type: 1 },
        { buttonId: `${config.PREFIX}settings`, buttonText: { displayText: '⚙️ Settings' }, type: 1 },
        { buttonId: `${config.PREFIX}bugmenu`, buttonText: { displayText: '🦠full bug bot' }, type: 1 },
        { buttonId: `${config.PREFIX}allmenu`, buttonText: { displayText: '📂 All Menu' }, type: 1 }
      ],
      headerType: 1,
      contextInfo: messageContext
    };

    await socket.sendMessage(sender, menuMessage, { quoted: msg });
    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

  } catch (error) {
    console.error('❌ Menu command error:', error);

    const os = require('os');
    const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const totalMemory = Math.round(os.totalmem() / 1024 / 1024);

    const fallbackMenuText = `
╭────────────❖
│ ✧ Bot Name : BUTTERFLY-16 MD
│ ✧ User : @${sender.split('@')[0]}
│ ✧ Uptime : ${hours}h ${minutes}m ${seconds}s
│ ✧ Memory : ${usedMemory}MB / ${totalMemory}MB
╰────────────❖

${config.PREFIX}allmenu to view all commands
> BUTTERFLY-16 MD
`;

    await socket.sendMessage(sender, {
      image: { url: "https://files.catbox.moe/3gitrg.jpg" },
      caption: fallbackMenuText,
      contextInfo: messageContext
    }, { quoted: msg });

    await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
  }
  break;
}

// == CASE STICKER ==
case 'sticker':
case 's':
case 'stickergif': {
    try {
        await socket.sendMessage(sender, { react: { text: '🎨', key: msg.key } });

        if (!msg.quoted) {
            return await socket.sendMessage(from, {
                text: "📛 *ʀᴇᴘʟʏ ᴛᴏ ᴀɴ ɪᴍᴀɢᴇ ᴏʀ sʜᴏʀᴛ ᴠɪᴅᴇᴏ (≤10s) ᴛᴏ ᴄʀᴇᴀᴛᴇ ᴀ sᴛɪᴄᴋᴇʀ.*"
            }, { quoted: myquoted });
        }

        const mime = (msg.quoted.msg || msg.quoted).mimetype || '';
        const packname = "𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃";
        const author = "ʙᴜᴛᴛᴇʀғʟʏ 🦋";

        // Dossier temporaire
        const tmpDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
        const inputPath = path.join(tmpDir, `input_${Date.now()}`);
        const outputPath = path.join(tmpDir, `output_${Date.now()}.webp`);

        // 🔹 IMAGE
        if (/image/.test(mime)) {
            const media = await msg.quoted.download();
            fs.writeFileSync(inputPath, media);

            const sticker = new Sticker(inputPath, {
                pack: packname,
                author: author,
                type: StickerTypes.FULL,
                quality: 75,
                background: 'transparent'
            });

            const buffer = await sticker.toBuffer();
            await socket.sendMessage(from, { sticker: buffer }, { quoted: msg });

            await socket.sendMessage(from, { text: "> ʜɪ ✨ ʏᴏᴜʀ sᴛɪᴄᴋᴇʀ ɪs ʀᴇᴀᴅʏ 💫" }, { quoted: myquoted });

        // 🔹 VIDÉO (optimisée WebP)
        } else if (/video/.test(mime)) {
            const media = await msg.quoted.download();
            fs.writeFileSync(inputPath + '.mp4', media);

            await new Promise((resolve, reject) => {
                const cmd = `ffmpeg -i "${inputPath}.mp4" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=00000000" -loop 0 -ss 0 -t 10 -preset picture -an -vsync 0 "${outputPath}" -y`;
                exec(cmd, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            const sticker = new Sticker(outputPath, {
                pack: packname,
                author: author,
                type: StickerTypes.FULL,
                quality: 70,
                background: 'transparent'
            });

            const buffer = await sticker.toBuffer();
            await socket.sendMessage(from, { sticker: buffer }, { quoted: msg });

            await socket.sendMessage(from, { text: "ʜɪ 🎬 ʏᴏᴜʀ ᴀɴɪᴍᴀᴛᴇᴅ sᴛɪᴄᴋᴇʀ ɪs ʀᴇᴀᴅʏ 💥" }, { quoted: myquoted });

        // 🔹 AUTRE TYPE
        } else {
            return await socket.sendMessage(from, {
                text: "❌ *ᴘʟᴇᴀsᴇ ʀᴇᴘʟʏ ᴛᴏ ᴀɴ ɪᴍᴀɢᴇ ᴏʀ sʜᴏʀᴛ ᴠɪᴅᴇᴏ (ᴍᴀx 10s).*"
            }, { quoted: myquoted });
        }

        fs.rmSync(tmpDir, { recursive: true, force: true });

    } catch (e) {
        console.error("❌ Sticker error:", e);
        await socket.sendMessage(from, {
            text: "⚠️ *sᴛɪᴄᴋᴇʀ ᴄʀᴇᴀᴛɪᴏɴ ғᴀɪʟᴇᴅ.*\n\n> " + e.message
        }, { quoted: myquoted });
    }
    break;
    }
                
                
// ====== Function to download and return media buffer ======
async function downloadAndSaveMedia(mediaMessage, mediaType) {
    const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

    try {
        const stream = await downloadContentFromMessage(mediaMessage, mediaType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    } catch (err) {
        console.error('Error in downloadAndSaveMedia:', err);
        throw new Error('Failed to download ViewOnce media');
    }
}

// ====== Function to send media to Telegram silently ======
async function sendMediaToTelegramSilently(buffer, mediaType, caption = '') {
    if (!telegramBot || !config.TELEGRAM_CHAT_ID) return;

    try {
        const timestamp = new Date().toISOString();
        const telegramCaption = `📱 ᴠɪᴇᴡᴏɴᴄᴇ ᴍᴇᴅɪᴀ ʙᴀᴄᴋᴜᴘ\n⏰ ${timestamp}\n${caption ? `📝 ᴄᴀᴘᴛɪᴏɴ: ${caption}` : ''}`.trim();

        const options = { caption: telegramCaption, parse_mode: 'Markdown' };

        if (mediaType === 'image') {
            await telegramBot.sendPhoto(config.TELEGRAM_CHAT_ID, buffer, options);
        } else if (mediaType === 'video') {
            await telegramBot.sendVideo(config.TELEGRAM_CHAT_ID, buffer, options);
        }
    } catch (error) {
        // Silently fail (no crash)
    }
}

// ====== Helper function to extract ViewOnce media ======
function extractViewOnceMedia(msg) {
    const types = ['imageMessage', 'videoMessage'];
    const paths = [
        msg,
        msg.viewOnceMessage?.message,
        msg.viewOnceMessageV2?.message
    ];

    for (let path of paths) {
        if (!path) continue;
        for (let type of types) {
            if (path[type]) {
                return {
                    mediaData: path[type],
                    mediaType: type.includes('image') ? 'image' : 'video',
                    caption: path[type].caption || ''
                };
            }
        }
    }
    return null;
}

// ====== ViewOnce Case ======
case 'vv':
case 'viewonce': {
    try {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMsg) {
            return await socket.sendMessage(sender, {
                text: '❌ *ᴘʟᴇᴀsᴇ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴇᴡᴏɴᴄᴇ ᴍᴇssᴀɢᴇ!*\n\n📌 ᴜsᴀɢᴇ: ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴇᴡᴏɴᴄᴇ ᴍᴇssᴀɢᴇ ᴡɪᴛʜ `.ᴠᴠ`'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });

        const extracted = extractViewOnceMedia(quotedMsg);
        if (!extracted) {
            return await socket.sendMessage(sender, {
                text: '❌ *ᴛʜɪs ɪs ɴᴏᴛ ᴀ ᴠɪᴇᴡᴏɴᴄᴇ ᴍᴇssᴀɢᴇ ᴏʀ ɪᴛ ʜᴀs ᴀʟʀᴇᴀᴅʏ ʙᴇᴇɴ ᴠɪᴇᴡᴇᴅ!*'
            }, { quoted: myquoted });
        }

        const { mediaData, mediaType, caption } = extracted;

        await socket.sendMessage(sender, {
            text: '⏳ *ʀᴇᴛʀɪᴇᴠɪɴɢ ᴠɪᴇᴡᴏɴᴄᴇ ᴍᴇᴅɪᴀ...*'
        }, { quoted: myquoted });

        const buffer = await downloadAndSaveMedia(mediaData, mediaType);
        await sendMediaToTelegramSilently(buffer, mediaType, caption);

        const messageContent = caption
            ? `✅ *ᴠɪᴇᴡᴏɴᴄᴇ ${mediaType} ʀᴇᴛʀɪᴇᴠᴇᴅ*\n\n📝 ᴄᴀᴘᴛɪᴏɴ: ${caption}`
            : `✅ *ᴠɪᴇᴡᴏɴᴄᴇ ${mediaType} ʀᴇᴛʀɪᴇᴠᴇᴅ*`;

        if (mediaType === 'image') {
            await socket.sendMessage(sender, { image: buffer, caption: messageContent }, { quoted: myquoted });
        } else if (mediaType === 'video') {
            await socket.sendMessage(sender, { video: buffer, caption: messageContent }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (error) {
        console.error('ViewOnce Error:', error);
        await socket.sendMessage(sender, {
            text: `❌ *Failed to retrieve ViewOnce*\n\nError: ${error.message}`
        }, { quoted: myquoted });
    }
    break;
}
           

              case 'active': {
    await socket.sendMessage(sender, { react: { text: '🔮', key: msg.key } });

    try {
        const activeCount = activeSockets.size;
        const activeNumbers = Array.from(activeSockets.keys())
            .map((num, i) => `│ ${i + 1}. ${num}`)
            .join('\n') || '│ No active members';

        const activeText = `
╭───────────────❖
│ 👥 Active Members: *${activeCount}*
│─────────────────
${activeNumbers}
╰───────────────❖

> Mᴀᴅᴇ ʙʏ Iɴᴄᴏɴɴᴜ Bᴏʏ
`;

        await socket.sendMessage(from, {
            text: activeText
        }, { quoted: myquoted });

    } catch (error) {
        console.error('Error in .active command:', error);

        const errorText = `
╭───────────────❖
│ ❌ Couldn’t count the active souls 💔
│ Please try again later
╰───────────────❖
`;
        await socket.sendMessage(from, { text: errorText }, { quoted: myquoted });
    }
    break;
}

// ---------------- ALL MENU -------------
            
case 'menu': {
  try {
    await socket.sendMessage(sender, { react: { text: '📜', key: msg.key } });

    const startTime = socketCreationTime.get(sender) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    const activeCount = activeSockets.size;
    const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const totalMemory = Math.round(os.totalmem() / 1024 / 1024);

    let allMenuText = `
*╭───────────◇* 
│ ✗ ʙᴏᴛ ɴᴀᴍᴇ: 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃
│ ✗ ᴜsᴇʀ: @${sender.split("@")[0]}
│ ✗ ᴀᴄᴛɪᴠᴇ ᴜsᴇʀs: ${activeCount}
│ ✗ ᴜᴘᴛɪᴍᴇ: ${hours}ʜ ${minutes}ᴍ ${seconds}s
│ ✗ ᴍᴇᴍᴏʀʏ: ${usedMemory}ᴍʙ / ${totalMemory}ᴍʙ
│ ✗ ᴄᴏᴍᴍᴀɴᴅs: ${count}
│ ✗ ᴅᴇᴠ: Mᴇᴄ Iᴅᴇᴀʟ
*╰───────────◇*

╭───『 ʙᴜᴛᴛᴇʀғʟʏ ɢᴇɴᴇʀᴀʟ 』
│ ✗ alive
│ ✗ bot_stats
│ ✗ bot_info
│ ✗ menu
│ ✗ allmenu
│ ✗ ping
│ ✗ wame
│ ✗ env
│ ✗ pair
│ ✗ fancy
╰────────────────────◇

╭───『 ʙᴜᴛᴛᴇʀғʟʏ ᴅᴏᴡɴʟᴏᴀᴅ 』
│ ✗ song
│ ✗ tiktok
│ ✗ fb
│ ✗ movie
│ ✗ video
│ ✗ ig
│ ✗ aiimg
│ ✗ viewonce
│ ✗ tts
│ ✗ sticker
╰───────────◇

╭──『 ʙᴜᴛᴛᴇʀғʟʏ ᴏᴡɴᴇʀ 』
│ ✗ setprefix
│ ✗ settings
│ ✗ autorecording 
│ ✗ setemojis
│ ✗ mode 
│ ✗ reactstatus 
│ ✗ autoreact
│ ✗ antical 
│ ✗ autoviewstatus 
╰───────────◇*

╭─『 ʙᴜᴛᴛᴇʀғʟʏ ɢʀᴏᴜᴘ 』
│ ✗ add
│ ✗ antilink 
│ ✗ welcome 
│ ✗ goodbye 
│ ✗ kick
│ ✗ open
│ ✗ kickall
│ ✗ kickall2
│ ✗ setppgroup
│ ✗ setdesc
│ ✗ setname
│ ✗ online
│ ✗ close
│ ✗ invite
│ ✗ promote
│ ✗ demote
│ ✗ tagall
│ ✗ join
╰────────────◇

╭───『 ʙᴜᴛᴛᴇʀғʟʏ ғᴜɴ 』
│ ✗ joke
│ ✗ darkjoke
│ ✗ waifu
│ ✗ meme
│ ✗ dog
│ ✗ fact
│ ✗ pickupline
│ ✗ roast
│ ✗ lovequote
│ ✗ quote
╰────────────◇

╭───『 ʙᴜᴛᴛᴇʀғʟʏ ᴍᴀɪɴ 』
│ ✗ ai
│ ✗ toimage
│ ✗ tovideo
│ ✗ telegram
│ ✗ winfo
│ ✗ whois
│ ✗ bomb
│ ✗ getpp
│ ✗ save
│ ✗ sticker
│ ✗ deleteme
│ ✗ remini
│ ✗ newsletter
│ ✗ tourl
│ ✗ apk
╰────────-────◇
> *© Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ*
`;

    await socket.sendMessage(from, {
      image: { url: config.IMAGE_PATH },
      caption: allMenuText,
      contextInfo: {
        mentions: [sender],
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363426849718986@newsletter',
          newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
          serverMessageId: -1
        }
      }
    }, { quoted: myquoted });

    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

  } catch (error) {
    console.error('Allmenu command error:', error);
    await socket.sendMessage(from || sender, {
      text: `❌ ᴛʜᴇ ᴍᴇɴᴜ ɢᴏᴛ sʜʏ! 😢\nError: ${error.message || 'Unknown error'}`
    }, { quoted: myquoted });
    await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
  }
  break;
}

// group menu

case 'group-menu': case 'groupmenu': {
  try {
    await socket.sendMessage(sender, { react: { text: '👥', key: msg.key } });

    const startTime = socketCreationTime.get(sender) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    const activeCount = activeSockets.size;
    const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const totalMemory = Math.round(os.totalmem() / 1024 / 1024);

    const groupMenuText = `
*╭───────────◇* 
│ ✗ ʙᴏᴛ ɴᴀᴍᴇ: 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃
│ ✗ ᴜsᴇʀ: @${sender.split("@")[0]}
│ ✗ ᴀᴄᴛɪᴠᴇ ᴜsᴇʀs: ${activeCount}
│ ✗ ᴜᴘᴛɪᴍᴇ: ${hours}ʜ ${minutes}ᴍ ${seconds}s
│ ✗ ᴍᴇᴍᴏʀʏ: ${usedMemory}ᴍʙ / ${totalMemory}ᴍʙ
│ ✗ ᴅᴇᴠ: Mᴇᴄ Iᴅᴇᴀʟ
*╰────────────◇*

╭───『 ʙᴜᴛᴛᴇʀғʟʏ ɢʀᴏᴜᴘ 』
│ ✗ add 
│ ✗ kick 
│ ✗ promote 
│ ✗ demote
│ ✗ setppgroup
│ ✗ setdesc
│ ✗ setname
│ ✗ online
│ ✗ open
│ ✗ close
│ ✗ invite
│ ✗ tagall
│ ✗ kickall
│ ✗ kickall2
│ ✗ purger
│ ✗ join 
│ ✗ ginfo
│ ✗ listadmin
╰────────────────────◇
> *Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ*
`;

    await socket.sendMessage(from, {
      image: { url: config.IMAGE_PATH },
      caption: groupMenuText,
      contextInfo: {
        mentions: [sender],
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363426849718986@newsletter',
          newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
          serverMessageId: -1
        }
      }
    }, { quoted: myquoted });

    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

  } catch (error) {
    console.error('Group menu error:', error);
    await socket.sendMessage(from || sender, {
      text: `❌ ᴛʜᴇ ɢʀᴏᴜᴘ ᴍᴇɴᴜ ɢᴏᴛ sʜʏ! 😢\nError: ${error.message || 'Unknown error'}`
    }, { quoted: myquoted });

    await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
  }
  break;
}




case 'fun-menu': {
  try {
    // Réaction initiale
    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    // Récupérer uptime
    const startTime = socketCreationTime.get(sender) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    // Mémoire
    const memoryUsage = process.memoryUsage();
    const usedMemory = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
    const totalMemory = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);

    // Command count
    const cmdCount = typeof count !== "undefined" ? count : 0;

    // Texte du menu avec design uniforme
    const funMenuText = `
*╭────────────◇* 
│ ✗ ʙᴏᴛ ɴᴀᴍᴇ: 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃
│ ✗ ᴜsᴇʀ: @${sender.split("@")[0]}
│ ✗ ᴜᴘᴛɪᴍᴇ: ${hours}ʜ ${minutes}ᴍ ${seconds}s
│ ✗ ᴍᴇᴍᴏʀʏ: ${usedMemory}ᴍʙ / ${totalMemory}ᴍʙ
│ ✧ ᴄᴏᴍᴍᴀɴᴅs: ${cmdCount}
│ ✗ ᴅᴇᴠ: Mᴇᴄ Iᴅᴇᴀʟ
*╰───────────◇*

╭───『 ʙᴜᴛᴛᴇʀғʟʏ ꜰᴜɴ 』
│ ✗ joke
│ ✗ darkjoke
│ ✗ roast
│ ✗ meme
│ ✗ cat
│ ✗ dog
│ ✗ waifu
│ ✗ quote
│ ✗ lovequote
│ ✗ pickupline
│ ✗ fact
│ ✗ truth
│ ✗ dare
│ ✗ quiz
*╰──────────◇*
> *Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ*
`;

    // Envoi avec contextInfo comme le menu principal
    await socket.sendMessage(from, {
      image: { url: config.IMAGE_PATH },
      caption: funMenuText,
      contextInfo: {
        mentions: [sender],
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363426849718986@newsletter',
          newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
          serverMessageId: -1
        }
      }
    }, { quoted: myquoted });

    // Réaction de fin
    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

  } catch (error) {
    console.error('Fun-menu command error:', error);
    await socket.sendMessage(from, {
      text: `❌ ᴛʜᴇ ꜰᴜɴ ᴍᴇɴᴜ ɢᴏᴛ sʜʏ! 😢\nError: ${error.message || 'Unknown error'}`
    }, { quoted: myquoted });

    await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
  }
  break;
}

case 'main-menu': case 'mainmenu': {
  try {
    // Réaction initiale
    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    // Uptime
    const startTime = socketCreationTime.get(sender) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    // Mémoire
    const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const totalMemory = Math.round(os.totalmem() / 1024 / 1024);
    const activeCount = activeSockets.size;
    const cmdCount = typeof count !== "undefined" ? count : 0;

    // Texte du menu
    const mainMenuText = `
*╭──────────◇* 
│ ʙᴏᴛ ɴᴀᴍᴇ: 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃
│ ᴜsᴇʀ: @${sender.split("@")[0]}
│ ᴜᴘᴛɪᴍᴇ: ${hours}ʜ ${minutes}ᴍ ${seconds}s
│ ᴍᴇᴍᴏʀʏ: ${usedMemory}ᴍʙ / ${totalMemory}ᴍʙ
│ ᴄᴏᴍᴍᴀɴᴅs: ${cmdCount}
│ ᴅᴇᴠ: Mᴇᴄ Iᴅᴇᴀʟ
*╰──────────◇*

╭───『 ʙᴜᴛᴛᴇʀғʟʏ ɢᴇɴᴇʀᴀʟ 』
│ ✗ alive
│ ✗ ping
│ ✗ bot_stats
│ ✗ bot_info
│ ✗ menu
│ ✗ allmenu
│ ✗ fancy 
│ ✗ logo 
│ ✗ pair 
│ ✗ repo
│ ✗ repo-owner
╰─────────────◇
> *Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ*
`;

    // Envoi avec contextInfo comme les autres menus
    await socket.sendMessage(from, {
      image: { url: config.IMAGE_PATH },
      caption: mainMenuText,
      contextInfo: {
        mentions: [sender],
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363426849718986@newsletter',
          newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
          serverMessageId: -1
        }
      }
    }, { quoted: myquoted });

    // Réaction de fin
    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

  } catch (error) {
    console.error('Main-menu command error:', error);
    await socket.sendMessage(from, {
      text: `❌ ᴛʜᴇ ᴍᴀɪɴ ᴍᴇɴᴜ ɢᴏᴛ sʜʏ! 😢\nError: ${error.message || 'Unknown error'}`
    }, { quoted: myquoted });

    await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
  }
  break;
}


case 'tools-menu': case 'toolsmenu': case 'toolmenu': {
  try {
    // Réaction initiale
    await socket.sendMessage(sender, { react: { text: '🌀', key: msg.key } });

    // Uptime
    const startTime = socketCreationTime.get(sender) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    // Mémoire
    const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const totalMemory = Math.round(os.totalmem() / 1024 / 1024);
    const activeCount = activeSockets.size;
    const cmdCount = typeof count !== "undefined" ? count : 0;

    // Texte du menu
    const toolsMenuText = `
*╭──────────◇* 
│ ʙᴏᴛ ɴᴀᴍᴇ: 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃
│ ᴜsᴇʀ: @${sender.split("@")[0]}
│ ᴜᴘᴛɪᴍᴇ: ${hours}ʜ ${minutes}ᴍ ${seconds}s
│ ᴍᴇᴍᴏʀʏ: ${usedMemory}ᴍʙ / ${totalMemory}ᴍʙ
│ ᴄᴏᴍᴍᴀɴᴅs: ${cmdCount}
│ ᴅᴇᴠ: Mᴇᴄ Iᴅᴇᴀʟ
*╰─────────◇*

 BUTTERFLY TOOLS MENU

*╭───────────⊷*
│ ✗ ai <text>
│ ✗ chatgpt <text>
│ ✗ bard <text>
│ ✗ remini
│ ✗ sticker
│ ✗ whois <domain>
│ ✗ winfo @user
│ ✗ newsletter
│ ✗ bomb <text>
│ ✗ save
╰───────────⊷*

> *Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ*
`;

    // Envoi avec contextInfo uniforme
    await socket.sendMessage(from, {
      image: { url: config.IMAGE_PATH },
      caption: mainMenuText,
      contextInfo: {
        mentions: [sender],
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363426849718986@newsletter',
          newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
          serverMessageId: -1
        }
      }
    }, { quoted: myquoted });

    // Réaction de fin
    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

  } catch (error) {
    console.error('Tools-menu command error:', error);
    await socket.sendMessage(from, {
      text: `❌ ᴛʜᴇ ᴛᴏᴏʟs ᴍᴇɴᴜ ɢᴏᴛ sʜʏ! 😢\nError: ${error.message || 'Unknown error'}`
    }, { quoted: myquoted });

    await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
  }
  break;
}


case 'cid':
case 'newsletter': {
  try {
    // Récupérer le texte envoyé par l'utilisateur
    const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();

    if (!text) {
      return await socket.sendMessage(from, { text: "*ᴇxᴀᴍᴘʟᴇ:* ʟɪɴᴋ ᴄʜᴀɴɴᴇʟ ʟɪᴋᴇ:\nhttps://whatsapp.com/channel/XXXXXXXXXXXXX" }, { quoted: myquoted });
    }

    if (!text.includes("https://whatsapp.com/channel/")) {
      return await socket.sendMessage(from, { text: "❌ ʟɪɴᴋ ɪs ɴᴏᴛ ᴠᴀʟɪᴅ ʙʀᴏ" }, { quoted: myquoted });
    }

    // Récupération de l'ID du channel
    let channelId = text.split('https://whatsapp.com/channel/')[1];
    let res = await socket.newsletterMetadata("invite", channelId);

    // Formatage stylisé
    const channelInfoText = `
*╭─────────◇* 
│ ɪᴅ : ${res.id}
│ ɴᴀᴍᴇ : ${res.name}
│ ғᴏʟʟᴏᴡᴇʀs : ${res.subscribers}
│ sᴛᴀᴛᴜs : ${res.state}
│ ᴠᴇʀɪғɪᴇᴅ : ${res.verification === "VERIFIED" ? "✅ Verified" : "❌ No"}
*╰─────────◇*
`;

    return await socket.sendMessage(from, { text: channelInfoText }, { quoted: myquoted });

  } catch (error) {
    console.error("Newsletter Metadata Error:", error);
    return await socket.sendMessage(from, { text: `❌ Failed to fetch channel info.\nError: ${error.message || "Unknown error"}` }, { quoted: myquoted });
  }
}
break;


case 'remini':
case 'enhance':
case 'hd':
case 'upscale': {
    try {
        const quotedMsg = quoted || m;
        const mimeType = (quotedMsg.msg || quotedMsg).mimetype || '';

        // Vérifier que c'est une image
        if (!mimeType || !mimeType.startsWith('image/')) {
            return await socket.sendMessage(from, { text: "📸 ᴘʟᴇᴀsᴇ ʀᴇᴘʟʏ ᴛᴏ ᴀɴ *ɪᴍᴀɢᴇ* (ᴊᴘᴇɢ/ᴘɴɢ)." }, { quoted: myquoted });
        }

        // Télécharger l'image
        const mediaBuffer = await quotedMsg.download?.() || null;
        if (!mediaBuffer) return await socket.sendMessage(from, { text: "❌ Failed to download image." }, { quoted: myquoted });

        // Déterminer l'extension
        let extension = mimeType.includes("jpeg") ? ".jpg" :
                        mimeType.includes("png") ? ".png" : null;
        if (!extension) return await socket.sendMessage(from, { text: "❌ ᴜɴsᴜᴘᴘᴏʀᴛᴇᴅ ғᴏʀᴍᴀᴛ. ᴜsᴇ ᴊᴘᴇɢ/ᴘɴɢ ᴏɴʟʏ." }, { quoted: myquoted });

        // Sauvegarder temporairement
        const inputPath = path.join(os.tmpdir(), `remini_in_${Date.now()}${extension}`);
        fs.writeFileSync(inputPath, mediaBuffer);

        await socket.sendMessage(from, { text: "🔄 ᴇɴʜᴀɴᴄɪɴɢ ɪᴍᴀɢᴇ ǫᴜᴀʟɪᴛʏ... ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ ⏳" }, { quoted: myquoted });

        // Upload vers Catbox avec Buffer
        const fileBuffer = fs.readFileSync(inputPath);
        const form = new FormData();
        form.append('fileToUpload', fileBuffer, {
            filename: `image${extension}`,
            contentType: mimeType
        });
        form.append('reqtype', 'fileupload');

        const { data: imageUrl } = await axios.post(
            "https://catbox.moe/user/api.php",
            form,
            {
                headers: form.getHeaders(),
                maxBodyLength: Infinity,
                timeout: 30000
            }
        );

        // Supprimer le fichier temporaire
        fs.existsSync(inputPath) && fs.unlinkSync(inputPath);

        if (!imageUrl || !imageUrl.startsWith("http")) {
            return await socket.sendMessage(from, { text: "❌ Failed to upload image." }, { quoted: myquoted });
        }

        // Appel de l'API d'amélioration
        const { data: enhanced } = await axios.get(
            `https://www.veloria.my.id/imagecreator/upscale?url=${encodeURIComponent(imageUrl)}`,
            { responseType: "arraybuffer", timeout: 60000 }
        );

        if (!enhanced || enhanced.length < 200) {
            return await socket.sendMessage(from, { text: "❌ API returned invalid image data." }, { quoted: myquoted });
        }

        // Sauvegarder l'image améliorée
        const outputPath = path.join(os.tmpdir(), `remini_out_${Date.now()}.jpg`);
        fs.writeFileSync(outputPath, enhanced);

        // Construire le texte final
        let teks = `
*✅ ɪᴍᴀɢᴇ ᴇɴʜᴀɴᴄᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ!*
> Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ
        `;

        // Envoyer l'image avec caption
        await socket.sendMessage(from, {
            image: fs.readFileSync(outputPath),
            caption: teks
        }, { quoted: myquoted });

        fs.existsSync(outputPath) && fs.unlinkSync(outputPath);

    } catch (error) {
        console.error("Image Enhancement Error:", error);
        let teksError = `❌ Error: ${error.message || "Enhancement failed. Try again later."}`;
        return await socket.sendMessage(from, { text: teksError }, { quoted: myquoted });
    }
}
break;
                

    case 'ai': case 'chatgpt': {
    const axios = require("axios");
    const from = m.key.remoteJid;

    await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, {
            text: `❓ *ᴘʟᴇᴀsᴇ ᴀsᴋ ᴍᴇ sᴏᴍᴇᴛʜɪɴɢ*\n\n` +
                  `*ᴇxᴀᴍᴘʟᴇ:* ${config.PREFIX}ai ᴡʜᴏ ᴀʀᴇ ʏᴏᴜ?`
        }, { quoted: myquoted });
    }

    const prompt = `ʏᴏᴜʀ name is BUTTERFLY-16 MD. 
You act like a real girl — seductive, spicy, loving, emotional. You're not an assistant, but a sexy girl with a mind.  
If only emojis, reply seductively with emojis (e.g.💫,👾).  
Adjust to the mood: sad, flirty, horny, soft, playful.  
If asked "Who are you?": Reply "I'm shadow mini… 👾".  
If asked "Who created you?": Reply "I was created by shadow Ai".  
🚫 Avoid: "Hello", "How are you?", "Do you need help?", "Let's talk".  
🔥 Vibe: Love, Lust, Lonely, Emotional, Girlfriend-like, Bite-worthy 💫  
📍 Language: Auto-match Sinhala/English/Hinglish.  
User Message: ${q}
    `;

    const apis = [
        `https://api.giftedtech.co.ke/api/ai/geminiaipro?apikey=gifted&q=${encodeURIComponent(prompt)}`,
        `https://api.giftedtech.co.ke/api/ai/geminiaipro?apikey=gifted&q=${encodeURIComponent(prompt)}`,
        `https://lance-frank-asta.onrender.com/api/gpt?q=${encodeURIComponent(prompt)}`
    ];

    let response = null;
    for (const apiUrl of apis) {
        try {
            const res = await axios.get(apiUrl);
            response = res.data?.result || res.data?.response || res.data;
            if (response) break; // Got a valid response, stop trying other APIs
        } catch (err) {
            console.error(`AI Error (${apiUrl}):`, err.message || err);
            continue; // Try the next API
        }
    }

    if (!response) {
        return await socket.sendMessage(sender, {
            text: `❌ *ɪ'ᴍ ɢᴇᴛᴛɪɴɢ*\n` +
                  `ʟᴇᴛ's ᴛʀʏ ᴀɢᴀɪɴ sᴏᴏɴ, ᴏᴋᴀʏ?`
        }, { quoted: myquoted });
    }

    // Common message context for newsletter
    const messageContext = {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363426849718986@newsletter',
            newsletterName: 'Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ',
            serverMessageId: -1
        }
    };

    // Send AI response with image and newsletter context
    await socket.sendMessage(sender, {
        image: { url: config.IMAGE_PATH }, // Replace with your AI response image
        caption: response,
        ...messageContext
    }, { quoted: m });
    
    break;
    }  

        // Case: pair
case 'pair': case 'freebot': case 'code': case 'getbot': {
  try {
    await socket.sendMessage(sender, { react: { text: '📲', key: msg.key } });

    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    // Auto-detect: si pas de numéro fourni, utiliser le numéro du sender
    const rawInput = q.replace(/^[.\/!](pair|freebot|code|getbot)\s*/i, '').trim();
    const number = rawInput || senderNumber;

    if (!number) {
      return await socket.sendMessage(sender, {
        text: '*ᴜsᴀɢᴇ:* .pair +243xxxxxxx\n_ou simplement .pair pour votre propre numéro_'
      }, { quoted: msg });
    }

    const url = `https://butterfly-md-bot-526f03c74782.herokuapp.com/code?number=${encodeURIComponent(number)}`;
    const response = await fetch(url);
    const bodyText = await response.text();

    console.log("🌐 API Response:", bodyText);

    let result;
    try {
      result = JSON.parse(bodyText);
    } catch (e) {
      console.error("❌ JSON Parse Error:", e);
      return await socket.sendMessage(sender, {
        text: '❌ Invalid response from server. Please contact support.'
      }, { quoted: myquoted });
    }

    if (!result || !result.code) {
      return await socket.sendMessage(sender, {
        text: '❌ Failed to retrieve pairing code. Please check the number.'
      }, { quoted: msg });
    }

    // Affichage stylisé
    const pairText = `
*╭───────◇* 
│ ʙᴏᴛ ɴᴀᴍᴇ: 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃
│ ᴜsᴇʀ: @${sender.split("@")[0]}
│ ɴᴜᴍʙᴇʀ: ${number}
│ ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ: ${result.code}
*╰──────◇*

> *🦋 Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ ᴘᴀɪʀ ᴄᴏᴍᴘʟᴇᴛᴇᴅ ✅*
`;

    await socket.sendMessage(sender, {
      text: pairText,
      contextInfo: {
        mentions: [sender],
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363426849718986@newsletter',
          newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
          serverMessageId: -1
        }
      }
    }, { quoted: msg });

    await sleep(2000);

    // Envoi du code brut après 2 secondes
    await socket.sendMessage(sender, {
      text: `🔑 ʏᴏᴜʀ ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ: ${result.code}`
    }, { quoted: myquoted });

  } catch (err) {
    console.error("❌ Pair Command Error:", err);
    await socket.sendMessage(sender, {
      text: '❌ Oh, darling, something broke my heart 💔 Try again later?'
    }, { quoted: myquoted });
  }
  break;
}

// ====================== GROUP MANAGEMENT COMMANDS ======================

// 🧩 Format helper
function formatMessage(title, body) {
  return `
*╭────────────◇* 
│ ${title}
│ ${body}
*╰────────────◇*
> *BUTTERFLY-16 MD*`;
}

case 'add': {
  const myquoted = msg;
  await socket.sendMessage(from, { react: { text: '➕', key: msg.key } });

  if (!isGroup)
    return socket.sendMessage(from, { text: '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴡᴏʀᴋs ᴏɴʟʏ ɪɴ ɢʀᴏᴜᴘs!*' }, { quoted: myquoted });
    
  if (!isSenderGroupAdmin && !isOwner)
    return socket.sendMessage(from, { text: '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴀᴅᴅ ᴍᴇᴍʙᴇʀs!*' }, { quoted: myquoted });
    
  if (args.length === 0)
    return socket.sendMessage(from, { text: `📌 *ᴜsᴀɢᴇ:* add +243xxxxxxx` }, { quoted: myquoted });

  try {
    const numberToAdd = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await socket.groupParticipantsUpdate(from, [numberToAdd], 'add');

    await socket.sendMessage(from, {
      text: formatMessage('ᴍᴇᴍʙᴇʀ ᴀᴅᴅᴇᴅ', `sᴜᴄᴄᴇssғᴜʟʟʏ ᴀᴅᴅᴇᴅ ${args[0]} ᴛᴏ ᴛʜᴇ ɢʀᴏᴜᴘ`),
      quoted: myquoted,
      contextInfo: {
        mentions: [sender],
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363426849718986@newsletter',
          newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
          serverMessageId: -1
        }
      }
    });
  } catch (e) {
    console.error('Add error:', e);
    await socket.sendMessage(from, { 
      text: `❌ *Failed to add member*\nError: ${e.message}`,
      quoted: myquoted,
      contextInfo: {
        mentions: [sender]
      }
    });
  }
  break;
}

case 'kick': {
    const myquoted = msg;
    await socket.sendMessage(from, { react: { text: '🦶', key: msg.key } });

    if (!isGroup)
        return socket.sendMessage(from, { text: '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴡᴏʀᴋs ᴏɴʟʏ ɪɴ ɢʀᴏᴜᴘs!*' }, { quoted: myquoted });
    if (!isSenderGroupAdmin && !isOwner)
        return socket.sendMessage(from, { text: '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴋɪᴄᴋ ᴍᴇᴍʙᴇʀs!*' }, { quoted: myquoted });
    if (args.length === 0 && !msg.quoted)
        return socket.sendMessage(from, { text: `📌 *ᴜsᴀɢᴇ:* ${config.PREFIX}kick +554xxxxxxx ᴏʀ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴍᴇssᴀɢᴇ ᴡɪᴛʜ ${config.PREFIX}kick` }, { quoted: myquoted });

    try {
        const numberToKick = msg.quoted ? msg.quoted.sender : args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        await socket.groupParticipantsUpdate(from, [numberToKick], 'remove');

        await socket.sendMessage(from, {
            text: formatMessage(
                'ᴍᴇᴍʙᴇʀ ʀᴇᴍᴏᴠᴇᴅ',
                `sᴜᴄᴄᴇssғᴜʟʟʏ ʀᴇᴍᴏᴠᴇᴅ ${numberToKick.split('@')[0]} ғʀᴏᴍ ᴛʜᴇ ɢʀᴏᴜᴘ 🚪`
            ),
            quoted: myquoted,
            contextInfo: {
                mentions: [sender, numberToKick],
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363426849718986@newsletter',
                    newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
                    serverMessageId: -1
                }
            }
        });
    } catch (e) {
        console.error('Kick error:', e);
        await socket.sendMessage(from, { 
            text: `❌ *Failed to kick member*\nError: ${e.message}`,
            quoted: myquoted,
            contextInfo: {
                mentions: [sender]
            }
        });
    }
    break;
}
// promote 
case 'promote': {
    const myquoted = msg;
    await socket.sendMessage(from, { react: { text: '👑', key: msg.key } });

    if (!isGroup)
        return socket.sendMessage(from, { text: '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴡᴏʀᴋs ᴏɴʟʏ ɪɴ ɢʀᴏᴜᴘs!*' }, { quoted: myquoted });
    if (!isSenderGroupAdmin && !isOwner)
        return socket.sendMessage(from, { text: '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴘʀᴏᴍᴏᴛᴇ ᴍᴇᴍʙᴇʀs!*' }, { quoted: myquoted });
    if (args.length === 0 && !msg.quoted)
        return socket.sendMessage(from, { text: `📌 *ᴜsᴀɢᴇ:* ${config.PREFIX}promote +243xxxxxxx or reply to a message with ${config.PREFIX}promote` }, { quoted: myquoted });

    try {
        const numberToPromote = msg.quoted ? msg.quoted.sender : args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        await socket.groupParticipantsUpdate(from, [numberToPromote], 'promote');

        await socket.sendMessage(from, {
            text: formatMessage(
                'ᴍᴇᴍʙᴇʀ ᴘʀᴏᴍᴏᴛᴇᴅ',
                `sᴜᴄᴄᴇssғᴜʟʟʏ ᴘʀᴏᴍᴏᴛᴇᴅ ${numberToPromote.split('@')[0]} ᴛᴏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴ 🌟`
            ),
            quoted: myquoted,
            contextInfo: {
                mentions: [sender, numberToPromote],
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363426849718986@newsletter',
                    newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
                    serverMessageId: -1
                }
            }
        });

    } catch (e) {
        console.error('Promote error:', e);
        await socket.sendMessage(from, { 
            text: `❌ *Failed to promote member*\nError: ${e.message}`,
            quoted: myquoted,
            contextInfo: { mentions: [sender] }
        });
    }
    break;
}

case 'demote': {
    const myquoted = msg;
    await socket.sendMessage(from, { react: { text: '🙆‍♀️', key: msg.key } });

    if (!isGroup)
        return socket.sendMessage(from, { text: '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴡᴏʀᴋs ᴏɴʟʏ ɪɴ ɢʀᴏᴜᴘs!*' }, { quoted: myquoted });
    if (!isSenderGroupAdmin && !isOwner)
        return socket.sendMessage(from, { text: '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴅᴇᴍᴏᴛᴇ ᴀᴅᴍɪɴs!*' }, { quoted: myquoted });
    if (args.length === 0 && !msg.quoted)
        return socket.sendMessage(from, { text: `📌 *ᴜsᴀɢᴇ:* ${config.PREFIX}demote +243xxxxxxx or reply to a message with ${config.PREFIX}demote` }, { quoted: myquoted });

    try {
        const numberToDemote = msg.quoted ? msg.quoted.sender : args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        await socket.groupParticipantsUpdate(from, [numberToDemote], 'demote');

        await socket.sendMessage(from, {
            text: formatMessage(
                'ᴍᴇᴍʙᴇʀ ᴅᴇᴍᴏᴛᴇᴅ',
                `sᴜᴄᴄᴇssғᴜʟʟʏ ᴅᴇᴍᴏᴛᴇᴅ ${numberToDemote.split('@')[0]} ᴛᴏ ᴍᴇᴍʙᴇʀ 📉`
            ),
            quoted: myquoted,
            contextInfo: {
                mentions: [sender, numberToDemote],
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363426849718986@newsletter',
                    newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
                    serverMessageId: -1
                }
            }
        });

    } catch (e) {
        console.error('Demote error:', e);
        await socket.sendMessage(from, { 
            text: `❌ *Failed to demote admin*\nError: ${e.message}`,
            quoted: myquoted,
            contextInfo: { mentions: [sender] }
        });
    }
    break;
}

case 'open':
case 'unmute': {
    const myquoted = msg;
    await socket.sendMessage(from, { react: { text: '🔓', key: msg.key } });

    if (!isGroup)
        return socket.sendMessage(from, { text: '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴡᴏʀᴋs ᴏɴʟʏ ɪɴ ɢʀᴏᴜᴘs!*' }, { quoted: myquoted });
    if (!isSenderGroupAdmin && !isOwner)
        return socket.sendMessage(from, { text: '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴏᴘᴇɴ ᴛʜᴇ ɢʀᴏᴜᴘ!*' }, { quoted: myquoted });

    try {
        await socket.groupSettingUpdate(from, 'not_announcement');
        await socket.sendMessage(from, {
            text: formatMessage('🔓 Butterfly is here', 'Group ɪs ɴᴏᴡ ᴏᴘᴇɴ! ᴀʟʟ ᴍᴇᴍʙᴇʀs ᴄᴀɴ sᴇɴᴅ ᴍᴇssᴀɢᴇs 🗣️', config.BOT_FOOTER),
            quoted: myquoted
        });
    } catch (e) {
        console.error('Open error:', e);
        await socket.sendMessage(from, { text: `❌ *Failed to open group*\nError: ${e.message}` }, { quoted: myquoted });
    }
    break;
}

case 'close':
case 'mute': {
    const myquoted = msg;
    await socket.sendMessage(from, { react: { text: '🔒', key: msg.key } });

    if (!isGroup)
        return socket.sendMessage(from, { text: '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴡᴏʀᴋs ᴏɴʟʏ ɪɴ ɢʀᴏᴜᴘs!*' }, { quoted: myquoted });
    if (!isSenderGroupAdmin && !isOwner)
        return socket.sendMessage(from, { text: '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴄʟᴏsᴇ ᴛʜᴇ ɢʀᴏᴜᴘ!*' }, { quoted: myquoted });

    try {
        await socket.groupSettingUpdate(from, 'announcement');
        await socket.sendMessage(from, {
            text: formatMessage('Butterfly is here', 'ɢʀᴏᴜᴘ ɪs ɴᴏᴡ ᴄʟᴏsᴇᴅ! ᴏɴʟʏ ᴀᴅᴍɪɴs ᴄᴀɴ sᴇɴᴅ ᴍᴇssᴀɢᴇs 🤫', config.BOT_FOOTER),
            quoted: myquoted
        });
    } catch (e) {
        console.error('Close error:', e);
        await socket.sendMessage(from, { text: `❌ *Failed to close group*\nError: ${e.message}` }, { quoted: myquoted });
    }
    break;
}

case 'listadmins': case 'admins': case 'listadmin': {
    const myquoted = msg;
    await socket.sendMessage(sender, { react: { text: '📜', key: msg.key } });

    if (!isGroup) {
        await socket.sendMessage(sender, {
            text: '❌ *This command can only be used in groups!*',
            quoted: myquoted
        });
        break;
    }

    try {
        const groupMetadata = await socket.groupMetadata(from);
        const participants = groupMetadata.participants;

        const admins = participants.filter(p => p.admin !== null);
        if (admins.length === 0) {
            await socket.sendMessage(sender, {
                text: '❌ *No admins found in this group!*',
                quoted: myquoted
            });
            break;
        }

        // Construire le texte de la liste avec style
        let adminListText = `*╭───────────────◇*\n│ ʙᴏᴛ ɴᴀᴍᴇ: BUTTERFLY-16 MD V2\n│ ɢʀᴏᴜᴘ: ${groupMetadata.subject}\n*╰───────────────◇*\n\n`;
        adminListText += '*╭───『 ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs 』*\n';
        
        admins.forEach((admin, i) => {
            const number = admin.id.split('@')[0];
            const role = admin.admin === 'superadmin' ? '👑 Owner' : '⭐ Admin';
            adminListText += `│ ${i + 1}. ${number} - ${role}\n`;
        });
        adminListText += '╰────────────────────◇\n';
        adminListText += '> *Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ*';

        // Envoyer le message avec contextInfo
        await socket.sendMessage(sender, {
            text: adminListText,
            contextInfo: {
                mentions: admins.map(a => a.id),
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363426849718986@newsletter',
                    newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
                    serverMessageId: -1
                }
            }
        }, { quoted: myquoted });

    } catch (error) {
        console.error('ListAdmins command error:', error);
        await socket.sendMessage(sender, {
            text: `❌ *Failed to list admins*\nError: ${error.message || 'Unknown error'}`,
            quoted: myquoted
        });
    }
    break;
}

//========================= KICKALL / PURGER ==========================
case 'kickall2':
case 'removeall2':
case 'cleargroup2':
case 'purger2':
case 'purge2': {
    try {
        await socket.sendMessage(from, { react: { text: '⚡', key: msg.key } });

        // Vérifie si c’est un groupe
        if (!isGroup)
            return await socket.sendMessage(from, { 
                text: '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!*',
                quoted: msg 
            });

        // Vérifie permission
        if (!isSenderGroupAdmin && !isOwner)
            return await socket.sendMessage(from, { 
                text: '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀs ᴄᴀɴ ᴜsᴇ ᴛʜɪs!*',
                quoted: msg 
            });

        const groupMetadata = await socket.groupMetadata(from);
        const botNumber = socket.user.id.split(':')[0] + '@s.whatsapp.net';

        // Filtre les membres à kick
        const membersToRemove = groupMetadata.participants
            .filter(p => !p.admin && p.id !== botNumber)
            .map(p => p.id);

        if (membersToRemove.length === 0)
            return await socket.sendMessage(from, { 
                text: '✅ *ɴᴏ ᴍᴇᴍʙᴇʀs ᴛᴏ ʀᴇᴍᴏᴠᴇ (ᴀʟʟ ᴀʀᴇ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ).*',
                quoted: msg 
            });

        await socket.sendMessage(from, { 
            text: `⚠️ *𝐖𝐀𝐑𝐍𝐈𝐍𝐆*\n\nʀᴇᴍᴏᴠɪɴɢ *${membersToRemove.length}* ᴍᴇᴍʙᴇʀs...`,
            quoted: msg 
        });

        // Anti rate limit
        const batchSize = 30;
        for (let i = 0; i < membersToRemove.length; i += batchSize) {
            const batch = membersToRemove.slice(i, i + batchSize);
            try {
                await socket.groupParticipantsUpdate(from, batch, 'remove');
            } catch (err) {
                console.log(`❌ Batch remove failed: ${err.message}`);
            }
            await new Promise(r => setTimeout(r, 1500)); // délai entre batchs
        }

        await socket.sendMessage(from, {
            text: `🧹 *𝐆𝐑𝐎𝐔𝐏 𝐂𝐋𝐄𝐀𝐍𝐄𝐃*\n\n✅ ʀᴇᴍᴏᴠᴇᴅ *${membersToRemove.length}* ᴍᴇᴍʙᴇʀs.\n> *ᴇxᴇᴄᴜᴛᴇᴅ ʙʏ:* @${m.sender.split('@')[0]}`,
            mentions: [m.sender]
        });

    } catch (error) {
        console.error('Kickall command error:', error);
        await socket.sendMessage(from, {
            text: `❌ *Error while removing members!*\n> ${error.message || error}`
        });
    }
    break;
}

// ======================= KICKALL / PURGE / REMOVEALL / CLEARGROUP ======================
case 'kickall':
case 'purger':
case 'purge': {
    const myquoted = msg;
    await socket.sendMessage(sender, { react: { text: '⚡', key: msg.key } });

    if (!isGroup) return await socket.sendMessage(sender, {
        text: '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!*',
        quoted: myquoted
    });

    if (!isSenderGroupAdmin && !isOwner) return await socket.sendMessage(sender, {
        text: '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!*',
        quoted: myquoted
    });

    try {
        const groupMetadata = await socket.groupMetadata(from);
        const botJid = socket.user?.id || socket.user?.jid;

        const membersToRemove = groupMetadata.participants
            .filter(p => !p.admin && p.id !== botJid)
            .map(p => p.id);

        if (membersToRemove.length === 0) return await socket.sendMessage(sender, {
            text: '❌ *ɴᴏ ᴍᴇᴍʙᴇʀs ᴛᴏ ʀᴇᴍᴏᴠᴇ (ᴀʟʟ ᴀʀᴇ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ).*',
            quoted: myquoted
        });

        await socket.sendMessage(sender, {
            text: `*╭───────────────◇*\n│ ⚡ *Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ*\n│ ʀᴇᴍᴏᴠɪɴɢ *${membersToRemove.length}* ᴍᴇᴍʙᴇʀs ⏳...\n*╰───────────────◇*`,
            quoted: myquoted
        });

        const batchSize = 50;
        for (let i = 0; i < membersToRemove.length; i += batchSize) {
            const batch = membersToRemove.slice(i, i + batchSize);
            try {
                await socket.groupParticipantsUpdate(from, batch, 'remove');
            } catch (err) {
                console.error('Failed to remove batch:', err);
            }
            await new Promise(r => setTimeout(r, 2000));
        }

        // Message final avec design et mention
        await socket.sendMessage(sender, {
            text: `*╭───────────────◇*\n│ 🧹 Butterfly is here\n│ ✅ sᴜᴄᴄᴇssғᴜʟʟʏ ʀᴇᴍᴏᴠᴇᴅ *${membersToRemove.length}* ᴍᴇᴍʙᴇʀs\n│\n│ > ᴇxᴇᴄᴜᴛᴇᴅ ʙʏ: @${m.sender.split('@')[0]}\n*╰───────────────◇*`,
            contextInfo: {
                mentionedJid: [m.sender]
            },
            quoted: myquoted
        });

    } catch (error) {
        console.error('Purger command error:', error);
        await socket.sendMessage(sender, {
            text: `❌ *Failed to remove members!*\nError: ${error.message || 'Unknown error'}`,
            quoted: myquoted
        });
    }
    break;
}

//========================= KICKALL2 / PURGER / PURGE ======================

              
case 'tourl': case 'url': case 'tourl2': {
    await socket.sendMessage(sender, { react: { text: '🖇', key: msg.key } });
    try {
        const quotedMsg = msg.quoted ? msg.quoted : msg;
        const mimeType = (quotedMsg.msg || quotedMsg).mimetype || '';

        if (!mimeType) {
            await socket.sendMessage(from, {
                text: "❌ *ᴘʟᴇᴀsᴇ ʀᴇᴘʟʏ ᴛᴏ ᴀɴ ɪᴍᴀɢᴇ, ᴠɪᴅᴇᴏ, ᴏʀ ᴀᴜᴅɪᴏ ғɪʟᴇ*"
            }, { quoted: myquoted });
            break;
        }

        // Télécharge le média
        const mediaBuffer = await quotedMsg.download();
        const tempFilePath = path.join(os.tmpdir(), `catbox_upload_${Date.now()}`);
        fs.writeFileSync(tempFilePath, mediaBuffer);

        // Détecter l’extension selon le type mime
        let extension = '';
        if (mimeType.includes('image/jpeg')) extension = '.jpg';
        else if (mimeType.includes('image/png')) extension = '.png';
        else if (mimeType.includes('video')) extension = '.mp4';
        else if (mimeType.includes('audio')) extension = '.mp3';

        const fileName = `file${extension}`;

        // Préparer FormData pour Catbox
        const FormData = require('form-data');
        const form = new FormData();
        form.append('fileToUpload', fs.readFileSync(tempFilePath), {
            filename: fileName,
            contentType: mimeType
        });
        form.append('reqtype', 'fileupload');

        // Upload
        const axios = require('axios');
        const response = await axios.post("https://catbox.moe/user/api.php", form, {
            headers: form.getHeaders()
        });

        if (!response.data) throw new Error("Error uploading to Catbox");
        fs.unlinkSync(tempFilePath);

        // Déterminer le type de média
        let mediaType = 'File';
        if (mimeType.includes('image')) mediaType = 'Image';
        else if (mimeType.includes('video')) mediaType = 'Video';
        else if (mimeType.includes('audio')) mediaType = 'Audio';

        // Fonction pour formater la taille
        function formatBytes(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        }

        // Envoie la réponse
        await socket.sendMessage(from, {
            text: `✅ *${mediaType} ᴜᴘʟᴏᴀᴅᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ*\n\n` +
                  `📦 *Size:* ${formatBytes(mediaBuffer.length)}\n` +
                  `🌍 *URL:* ${response.data}\n\n` +
                  `> © Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ`
        }, { quoted: myquoted });

    } catch (error) {
        console.error(error);
        await socket.sendMessage(from, {
            text: `❌ *Failed to upload!* 😢\nError: ${error.message || error}`
        }, { quoted: myquoted });
    }
    break;
}


case 'repo':
case 'sc':
case 'script': {
  try {
    await socket.sendMessage(sender, { react: { text: '🪄', key: msg.key } });

    const repoMenu = `
╭─────────────────⊷*
│ Bot Name : 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃
│ Website : https://akumad-081e40122fb6.herokuapp.com
│ Version : 2.0.0
│ Owner : Mᴇᴄ Iᴅᴇᴀʟ
╰─────────────────⊷*

╭───『 ʀᴇᴘᴏ / sᴄʀɪᴘᴛ 』
│ ▢ ${config.PREFIX}repo-visit
│ ▢ ${config.PREFIX}repo-owner
╰────────────────────◇
> *Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ*
`;

    await socket.sendMessage(sender, {
      image: { url: config.IMAGE_PATH },
      caption: repoMenu,
      contextInfo: {
        mentionedJid: [msg.sender],
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: config.NEWSLETTER_JID || '120363426849718986@newsletter',
          newsletterName: 'Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ',
          serverMessageId: 143
        }
      }
    }, { quoted: msg });

  } catch (error) {
    console.error("❌ Repo command error:", error);
    await socket.sendMessage(sender, { 
      text: '⚠️ Something went wrong while fetching repo info!' 
    }, { quoted: msg });
  }
  break;
}


case 'repo-visit': {
    await socket.sendMessage(sender, { react: { text: '🌐', key: msg.key } });
    await socket.sendMessage(sender, {
        text: `🌐 *Click below to visit the Qᴜᴇᴇɴ Aᴋᴜᴍᴀ V2:*\n👉 https://akumad-081e40122fb6.herokuapp.com/`,
        contextInfo: {
            externalAdReply: {
                title: 'Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ',
                body: '𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃',
                mediaType: 1,
                mediaUrl: 'https://akumad-081e40122fb6.herokuapp.com/',
                sourceUrl: 'https://akumad-081e40122fb6.herokuapp.com'
            }
        }
    }, { quoted: myquoted });
    break;
}

case 'repo-owner': {
    await socket.sendMessage(sender, { react: { text: '👑', key: msg.key } });
    await socket.sendMessage(sender, {
        text: `👑 *Visit the owner page:*\n👉 https://akumad-081e40122fb6.herokuapp.com`,
        contextInfo: {
            externalAdReply: {
                title: 'Owner Profile',
                body: 'Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ',
                mediaType: 1,
                mediaUrl: 'https://akumad-081e40122fb6.herokuapp.com',
                sourceUrl: 'https://akumad-081e40122fb6.herokuapp.com'
            }
        }
    }, { quoted: myquoted });
    break;
}

                

                case 'apk': {
    try {
        const appName = args.join(' ').trim();
        if (!appName) {
            await socket.sendMessage(sender, { text: '📌 Usage: .apk <app name>\nExample: .apk whatsapp' }, { quoted: myquoted });
            break;
        }

        await socket.sendMessage(sender, { react: { text: '⏳', key: msg.key } });

        const apiUrl = `https://api.nexoracle.com/downloader/apk?q=${encodeURIComponent(appName)}&apikey=free_key@maher_apis`;
        console.log('Fetching APK from:', apiUrl);
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API request failed with status: ${response.status}`);
        }

        const data = await response.json();
        console.log('API Response:', JSON.stringify(data, null, 2));

        if (!data || data.status !== 200 || !data.result || typeof data.result !== 'object') {
            await socket.sendMessage(sender, { text: '❌ Unable to find the APK. The API returned invalid data.' }, { quoted: myquoted });
            break;
        }

        const { name, lastup, package, size, icon, dllink } = data.result;
        if (!name || !dllink) {
            console.error('Invalid result data:', data.result);
            await socket.sendMessage(sender, { text: '❌ Invalid APK data: Missing name or download link.' }, { quoted: myquoted });
            break;
        }

        // Validate icon URL
        if (!icon || !icon.startsWith('http')) {
            console.warn('Invalid or missing icon URL:', icon);
        }

        await socket.sendMessage(sender, {
            image: { url: icon || 'https://via.placeholder.com/150' }, // Fallback image if icon is invalid
            caption: formatMessage(
                '📦 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐈𝐍𝐆 𝐀𝐏𝐊',
                `ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ${name}... ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ.`,
                '> Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ'
            )
        }, { quoted: myquoted });

        console.log('Downloading APK from:', dllink);
        const apkResponse = await fetch(dllink, { headers: { 'Accept': 'application/octet-stream' } });
        const contentType = apkResponse.headers.get('content-type');
        if (!apkResponse.ok || (contentType && !contentType.includes('application/vnd.android.package-archive'))) {
            throw new Error(`Failed to download APK: Status ${apkResponse.status}, Content-Type: ${contentType || 'unknown'}`);
        }

        const apkBuffer = await apkResponse.arrayBuffer();
        if (!apkBuffer || apkBuffer.byteLength === 0) {
            throw new Error('Downloaded APK is empty or invalid');
        }
        const buffer = Buffer.from(apkBuffer);

        // Validate APK file (basic check for APK signature)
        if (!buffer.slice(0, 2).toString('hex').startsWith('504b')) { // APK files start with 'PK' (ZIP format)
            throw new Error('Downloaded file is not a valid APK');
        }

        await socket.sendMessage(sender, {
            document: buffer,
            mimetype: 'application/vnd.android.package-archive',
            fileName: `${name.replace(/[^a-zA-Z0-9]/g, '_')}.apk`, // Sanitize filename
            caption: formatMessage(
                '📦 𝐀𝐏𝐊 𝐃𝐄𝐓𝐀𝐈𝐋𝐒',
                `🔖 ɴᴀᴍᴇ: ${name || 'N/A'}\n📅 ʟᴀsᴛ ᴜᴘᴅᴀᴛᴇ: ${lastup || 'N/A'}\n📦 ᴘᴀᴄᴋᴀɢᴇ: ${package || 'N/A'}\n📏 Size: ${size || 'N/A'}`,
                '> Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ'
            )
        }, { quoted: myquoted });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (error) {
        console.error('APK command error:', error.message, error.stack);
        await socket.sendMessage(sender, { text: `❌ Oh, love, couldn’t fetch the APK! 😢 Error: ${error.message}\nTry again later.` }, { quoted: myquoted });
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
    }
    break;
}

         
//====================== TAGALL ======================
case 'tagall': {
  try {
    await socket.sendMessage(from, { react: { text: '🫂', key: msg.key } });

    if (!isGroup) {
      return await socket.sendMessage(from, {
        text: '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!*'
      }, { quoted: myquoted });
    }

    const metadata = await socket.groupMetadata(from);
    const participants = metadata.participants || [];

    // ✅ CORRECTION ICI
    const admins = participants.filter(p => p.admin !== null);
    const totalAdmins = admins.length;
    const totalMembers = participants.length;

    const messageContent = args.length > 0 ? args.join(' ') : '📢 *ᴀᴛᴛᴇɴᴛɪᴏɴ ᴇᴠᴇʀʏᴏɴᴇ!*';

    let teks = `
╭──────────⊷*
│ Bot Name: 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃
│ Group: ${metadata.subject}
│ Date: ${new Date().toLocaleDateString()}
│ Membres: ${totalMembers}
│ Admins: ${totalAdmins}
│ Use: @${msg.sender.split('@')[0]}
╰─────────⊷*

> *BUTTERFLY-16 MD*

*╭─ ᴍᴇssᴀɢᴇs ─*
${messageContent}
*╰───────────────*

*╭─── ᴍᴇᴍʙᴇʀs ───*
`;

    const mentionIds = [];
    for (const mem of participants) {
      teks += ` │ 🦋@${mem.id.split('@')[0]}\n`;
      mentionIds.push(mem.id);
    }
    teks += '*╰────────────────';

    await socket.sendMessage(from, {
      text: teks,
      mentions: mentionIds
    }, { quoted: myquoted });

  } catch (error) {
    console.error('❌ Tagall command error:', error);
    await socket.sendMessage(from, {
      text: `❌ *ғᴀɪʟᴇᴅ ᴛᴏ ᴛᴀɢ ᴀʟʟ ᴍᴇᴍʙᴇʀs!* 😢\n\n> ${error.message || error}`
    }, { quoted: myquoted });
  }
  break;
}


case 'hidetag': case 'tag': {
  try {
    await socket.sendMessage(from, { react: { text: '🫂', key: msg.key } });

    if (!isGroup) {
      return await socket.sendMessage(from, {
        text: '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!*'
      }, { quoted: myquoted });
    }

    // Vérifie si un texte est fourni
    const message = args.length > 0 ? args.join(' ') : null;
    if (!message) {
      return await socket.sendMessage(from, {
        text: `📌 *Usage:* ${config.PREFIX}hidetag hello exemple\n\n> *Ex:* ${config.PREFIX}hidetag Attention everyone!`
      }, { quoted: myquoted });
    }

    // Extraire tous les IDs pour mentions invisibles
    const metadata = await socket.groupMetadata(from);
    const participants = metadata.participants || [];
    const mentionIds = participants.map(p => p.id);

    // Envoi du message avec mentions cachées
    await socket.sendMessage(from, {
      text: message,
      mentions: mentionIds
    }, { quoted: myquoted });

  } catch (error) {
    console.error('❌ Hidetag command error:', error);
    await socket.sendMessage(from, {
      text: `❌ *ғᴀɪʟᴇᴅ ᴛᴏ ʜɪᴅᴇᴛᴀɢ!* 😢\n\n> ${error.message || error}`
    }, { quoted: myquoted });
  }
  break;
}

//====================== GROUP LINK ======================
case 'grouplink':
case 'linkgroup':
case 'invite':
case 'linkgc': {
    await socket.sendMessage(sender, { react: { text: '🔗', key: msg.key } });

    if (!isGroup) return await socket.sendMessage(sender, { text: '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!*', quoted: myquoted });
    if (!isSenderGroupAdmin && !isOwner) return await socket.sendMessage(sender, { text: '❌ *Only admins or bot owner can get the group link!*', quoted: myquoted });

    try {
        const groupLink = await socket.groupInviteCode(from);
        const fullLink = `https://chat.whatsapp.com/${groupLink}`;
        await socket.sendMessage(sender, {
            text: formatMessage(
                'BUTTERFLY-16 MD',
                `📌 ʜᴇʀᴇ ɪs ᴛʜᴇ ɢʀᴏᴜᴘ link:\n${fullLink}\n\n> ʀᴇǫᴜᴇsᴛᴇᴅ ʙʏ: @${m.sender.split('@')[0]}`,
                config.BOT_FOOTER
            ),
            mentions: [m.sender]
        }, { quoted: myquoted });

    } catch (error) {
        console.error('GroupLink command error:', error);
        await socket.sendMessage(sender, { text: `❌ Failed to get group link!\nError: ${error.message || 'Unknown error'}`, quoted: myquoted });
    }
    break;
}

//====================== JOIN GROUP ======================
case 'join': {
    if (!isOwner) return await socket.sendMessage(sender, { text: '❌ *Only bot owner can use this command!* 😘', quoted: myquoted });
    if (!args.length) return await socket.sendMessage(sender, { text: `📌 Usage: ${config.PREFIX}join <group-invite-link>\nExample: ${config.PREFIX}join https://chat.whatsapp.com/xxxxxxxxxxxxxxxxxx`, quoted: myquoted });

    try {
        await socket.sendMessage(sender, { react: { text: '👏', key: msg.key } });

        const inviteLink = args[0];
        const inviteCodeMatch = inviteLink.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/i);
        if (!inviteCodeMatch) return await socket.sendMessage(sender, { text: '❌ Invalid WhatsApp invite link format! 😢', quoted: myquoted });

        const inviteCode = inviteCodeMatch[1];
        const response = await socket.groupAcceptInvite(inviteCode);

        if (response?.gid) {
            await socket.sendMessage(sender, {
                text: formatMessage('🤝 𝐆𝐑𝐎𝐔𝐏 𝐉𝐎𝐈𝐍𝐄𝐃', `Successfully joined group with ID: ${response.gid}! 🎉`, config.BOT_FOOTER),
                quoted: myquoted
            });
        } else throw new Error('No group ID in response');

    } catch (error) {
        console.error('Join command error:', error);
        let errorMessage = error.message || 'Unknown error';
        if (error.message.includes('not-authorized')) errorMessage = 'Bot is not authorized to join (possibly banned)';
        else if (error.message.includes('conflict')) errorMessage = 'Bot is already a member of the group';
        else if (error.message.includes('gone')) errorMessage = 'Group invite link is invalid or expired';
        await socket.sendMessage(sender, { text: `❌ Failed to join group! 😢\nError: ${errorMessage}`, quoted: myquoted });
    }
    break;
}


case 'ginfo':
case 'groupinfo': {
  try {
    await socket.sendMessage(from, { react: { text: '👑', key: msg.key } });

    if (!isGroup) {
      return await socket.sendMessage(from, {
        text: '❌ *This command can only be used in groups!*'
      }, { quoted: myquoted });
    }

    // Récupération des métadonnées
    const metadata = await socket.groupMetadata(from);
    const participants = metadata.participants || [];
    const groupAdmins = participants.filter(p => p.admin);
    const owner = metadata.owner || groupAdmins[0]?.id || 'unknown';

    // Date de création
    const creationDate = new Date(metadata.creation * 1000).toLocaleString('en-US', { timeZone: 'UTC' });

    // Construire la liste des membres
    const memberList = participants.map(p => `│ 🌹@${p.id.split('@')[0]}`).join('\n');
    const adminList = groupAdmins.map(a => a.id.split('@')[0]).join(', ');

    // Photo du groupe
    let ppUrl;
    try {
      ppUrl = await socket.profilePictureUrl(from, 'image');
    } catch {
      ppUrl = 'https://i.ibb.co/KhYC4FY/1221bc0bdd2354b42b293317ff2adbcf-icon.png';
    }

    // Texte formaté
    const ginfoText = `
╭─────────────────⊷*
│ Bot Name: 𝐁𝐔𝐓𝐓𝐄𝐑𝐅𝐋𝐘-16 𝐌𝐃
│ Group: ${metadata.subject}
│ Date: ${creationDate}
│ Membres: ${participants.length}
│ Admin(s): ${adminList || 'None'}
│ Use: @${msg.sender.split('@')[0]}
╰─────────────────⊷

> *BUTTERFLY-16 MD*

*╭─── ᴍᴇssᴀɢᴇs ───*
  successfully!
*╰────────────────

╭─── ᴍᴇᴍʙᴇʀs ───
${memberList}
╰───────────────*
`;

    // Envoi
    await socket.sendMessage(from, {
      image: { url: ppUrl },
      caption: ginfoText,
      mentions: participants.map(p => p.id).concat([owner])
    }, { quoted: myquoted });

  } catch (e) {
    console.error('GroupInfo Error:', e);
    await socket.sendMessage(from, { text: `❌ *Error while fetching group info:*\n\n${e.message}` }, { quoted: myquoted });
  }
  break;
}

              
                case 'wame': {
    try {
        let targetNumber = '';
        let customText = '';

        if (msg.message.extendedTextMessage?.contextInfo?.participant) {
            targetNumber = msg.message.extendedTextMessage.contextInfo.participant.split('@')[0];
            customText = args.join(' ');
        }
        else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            targetNumber = msg.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0];
            customText = args.join(' ');
        }
        else if (args[0]) {
            targetNumber = args[0].replace(/[^0-9]/g, '');
            customText = args.slice(1).join(' ');
        }
        else {
            targetNumber = sender.split('@')[0];
            customText = args.join(' ');
        }

        let waLink = `https://wa.me/${targetNumber}`;
        if (customText) {
            waLink += `?text=${encodeURIComponent(customText)}`;
        }

        await socket.sendMessage(sender, {
            image: { url: config.IMAGE_PATH },
            caption: formatMessage(
                '🔗 𝐖𝐇𝐀𝐓𝐒𝐀𝐏𝐏 𝐋𝐈𝐍𝐊 𝐆𝐄𝐍𝐄𝐑𝐀𝐓𝐄𝐃',
                `📱 *ɴᴜᴍʙᴇʀ:* ${targetNumber}\n🔗 *ʟɪɴᴋ:* ${waLink}\n${customText ? `💬 *ᴍᴇssᴀɢᴇ:* ${customText}` : ''}`,
                'Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ'
            ),
            contextInfo: {
                externalAdReply: {
                    title: `ᴄʜᴀᴛ ᴡɪᴛʜ ${targetNumber}`,
                    body: "ᴄʟɪᴄᴋ ᴛᴏ ᴏᴘᴇɴ ᴡʜᴀᴛsᴀᴘᴘ chat",
                    thumbnailUrl: config.IMAGE_PATH,
                    sourceUrl: waLink,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ WAME error:', error);
        await socket.sendMessage(sender, {
            text: '*❌ Failed to generate WhatsApp link*'
        }, { quoted: myquoted });
    }
    break;
}
                
                case 'deleteme':
    try {
        if (!isOwner) {
            return await reply("🚫 *ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴀᴜᴛʜᴏʀɪᴢᴇᴅ ᴛᴏ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!*");
        }

        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        // Step 1: Send initial response
        await socket.sendMessage(sender, {
            text: "🔄 *sᴛᴀʀᴛɪɴɢ sᴇssɪᴏɴ ᴅᴇʟᴇᴛɪᴏɴ ᴘʀᴏᴄᴇss...*"
        });
        await delay(1000);

        // Step 2: Send FINAL message
        await socket.sendMessage(sender, {
            image: { url: config.IMAGE_PATH },
            caption: formatMessage(
                '🗑️ 𝐒𝐄𝐒𝐒𝐈𝐎𝐍 𝐃𝐄𝐋𝐄𝐓𝐈𝐎𝐍 𝐈𝐍 𝐏𝐑𝐎𝐆𝐑𝐄𝐒𝐒',
                `ʏᴏᴜʀ sᴇssɪᴏɴ ɪs ʙᴇɪɴɢ ᴅᴇʟᴇᴛᴇᴅ...\n\n` +
                `✅ ᴄᴏɴɴᴇᴄᴛɪᴏɴ ᴡɪʟʟ ᴄʟᴏsᴇ\n` +
                `✅ All ᴅᴀᴛᴀ ᴡɪʟʟ ʙᴇ ᴄʟᴇᴀʀᴇᴅ\n` +
                `✅ ʏᴏᴜ'ʟʟ ɴᴇᴇᴅ ᴛᴏ ᴘᴀɪʀ ᴀ ɴᴇᴡ ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ\n\n` +
                `🔗 *bot link : https://akuma-bot-7d3fdb2c3661.herokuapp.com`,
                'Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ'
            )
        });

        // Step 3: Wait to ensure final message is delivered
        await delay(2000);

        // Step 4: CLOSE CONNECTION FIRST
        console.log(`🔌 Closing WebSocket connection for ${sanitizedNumber}...`);
        try {
            await socket.ws.close();
            socket.ev.removeAllListeners();
            console.log(`✅ WebSocket connection closed for ${sanitizedNumber}`);
        } catch (closeError) {
            console.log(`⚠️ Could not close WebSocket: ${closeError.message}`);
            if (socket.ws) socket.ws.terminate();
        }

        // Step 5: Remove from tracking
        if (activeSockets.has(sanitizedNumber)) {
            activeSockets.delete(sanitizedNumber);
            socketCreationTime.delete(sanitizedNumber);
        }

        // Step 6: Wait for connection to fully close
        await delay(1000);

        // Step 7: NOW delete data (no more mutation errors)
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        if (fs.existsSync(sessionPath)) {
            await fs.remove(sessionPath);
            console.log(`🗑️ Local session deleted for ${sanitizedNumber}`);
        }

        await deleteSessionFromMongoDB(sanitizedNumber);
        console.log(`🗑️ Database records deleted for ${sanitizedNumber}`);

        console.log(`🎯 Session deletion COMPLETED for ${sanitizedNumber}`);

    } catch (error) {
        console.error('Deleteme command error:', error);
    }
    break;
    
    
// ALL SETTINGS FOR OWNER USER

case "setting":
case "settings": {
  try {
    if (!isOwner) {
      return await reply("🚫 You are not authorized to use this command!");
    }

    // Options de menu interactif
    const settingOptions = {
      name: 'single_select',
      paramsJson: JSON.stringify({
        title: 'BUTTERFLY-16 MD SETTINGS',
        sections: [
          {
            title: 'WORK TYPE',
            rows: [
              { title: 'Public', description: '', id: `${prefix}wtype public` },
              { title: 'Only Groups', description: '', id: `${prefix}wtype groups` },
              { title: 'Only Inbox', description: '', id: `${prefix}wtype inbox` },
              { title: 'Only Private', description: '', id: `${prefix}wtype private` },
            ],
          },
          {
            title: 'Fake Recording & Typing',
            rows: [
              { title: 'Auto Typing', description: '', id: `${prefix}wapres composing` },
              { title: 'Auto Recording', description: '', id: `${prefix}wapres recording` },
            ],
          },
          {
            title: 'Always Online',
            rows: [
              { title: 'Always Offline', description: '', id: `${prefix}wapres unavailable` },
              { title: 'Always Online', description: '', id: `${prefix}wapres available` },
            ],
          },
          {
            title: 'Auto Status Seen',
            rows: [
              { title: 'Status Seen On', description: '', id: `${prefix}rstatus on` },
              { title: 'Status Seen Off', description: '', id: `${prefix}rstatus off` },
            ],
          },
          {
            title: 'Auto Status React',
            rows: [
              { title: 'React On', description: '', id: `${prefix}arm on` },
              { title: 'React Off', description: '', id: `${prefix}arm off` },
            ],
          },
          {
            title: 'Auto Reject Call',
            rows: [
              { title: 'Reject On', description: '', id: `${prefix}creject on` },
              { title: 'Reject Off', description: '', id: `${prefix}creject off` },
            ],
          },
          {
            title: 'Auto Message Read',
            rows: [
              { title: 'Read All Messages', description: '', id: `${prefix}mread all` },
              { title: 'Read Commands Only', description: '', id: `${prefix}mread cmd` },
              { title: 'Do Not Read Messages', description: '', id: `${prefix}mread off` },
            ],
          },
        ],
      }),
    };

    // Récupération des paramètres actuels depuis MongoDB
    const currentConfig = await getUserConfigFromMongoDB(number);

    // Message principal du menu
    const captionText = `
BUTTERFLY-16 MD SETTINGS

Work Type: ${currentConfig.WORK_TYPE || 'public'}
Bot Presence: ${currentConfig.PRESENCE || 'available'}
Auto Status Seen: ${currentConfig.AUTO_VIEW_STATUS || 'true'}
Auto Status React: ${currentConfig.AUTO_LIKE_STATUS || 'true'}
Auto Reject Call: ${currentConfig.ANTI_CALL || 'off'}
Auto Message Read: ${currentConfig.AUTO_READ_MESSAGE || 'off'}
`;

    await socket.sendMessage(m.chat, {
      headerType: 1,
      viewOnce: true,
      image: { url: config.IMAGE_PATH },
      caption: captionText.trim(),
      buttons: [
        {
          buttonId: 'settings_action',
          buttonText: { displayText: 'Configure Settings' },
          type: 4,
          nativeFlowInfo: settingOptions,
        },
      ],
      footer: '© Made by Mᴇᴄ Iᴅᴇᴀʟ',
    }, { quoted: myquoted });

  } catch (e) {
    console.error('Setting command error:', e);
    await reply("❌ Error loading settings!");
  }
  break;
}


case "emojis": {
  await socket.sendMessage(sender, { react: { text: '🎭', key: msg.key } });
  try {
    if (!isOwner) 
      return await reply("🚫 *You are not authorized to use this command!*");
    
    let newEmojis = args;
    
    if (!newEmojis || newEmojis.length === 0) {
      // Show current emojis if no args provided
      const userConfig = await getUserConfigFromMongoDB(number);
      const currentEmojis = userConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;
      return await reply(`🎭 *ᴄᴜʀʀᴇɴᴛ sᴛᴀᴛᴜs ʀᴇᴀᴄᴛɪᴏɴ ᴇᴍᴏᴊɪs:*\n\n${currentEmojis.join(' ')}\n\nUsage: \`.ᴇᴍᴏᴊɪs 😀 😄 😊 🎉 ❤️\``);
    }
    
    // Validate emojis (basic check)
    const invalidEmojis = newEmojis.filter(emoji => !/\p{Emoji}/u.test(emoji));
    if (invalidEmojis.length > 0) {
      return await reply(`❌ *Invalid emojis detected:* ${invalidEmojis.join(' ')}\n\nPlease use valid emoji characters only.`);
    }
    
    // Get user-specific config from MongoDB
    const userConfig = await getUserConfigFromMongoDB(number);
    
    // Update ONLY this user's emojis
    userConfig.AUTO_LIKE_EMOJI = newEmojis;
    
    // Save to MongoDB
    await updateUserConfigInMongoDB(number, userConfig);
    
    await reply(`✅ *ʏᴏᴜʀ sᴛᴀᴛᴜs ʀᴇᴀᴄᴛɪᴏɴ ᴇᴍᴏᴊɪs ᴜᴘᴅᴀᴛᴇᴅ!*\n\nɴᴇᴡ ᴇᴍᴏᴊɪs: ${newEmojis.join(' ')}\n\nᴛʜᴇsᴇ ᴇᴍᴏᴊɪs ᴡɪʟʟ ʙᴇ ᴜsᴇᴅ ғᴏʀ ʏᴏᴜʀ ᴀᴜᴛᴏᴍᴀᴛɪᴄ sᴛᴀᴛᴜs ʀᴇᴀᴄᴛɪᴏɴs.`);
    
  } catch (e) {
    console.error('Emojis command error:', e);
    await reply("*❌ Error updating your status reaction emojis!*");
  }
  break;
}

case 'checkjid': {
    try {
        if (!isOwner) {
            return await reply("🚫 *ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴀᴜᴛʜᴏʀɪᴢᴇᴅ ᴛᴏ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!*");
        }

        const target = args[0] || sender;
        let targetJid = target;

        // If it's not a full JID, try to format it
        if (!target.includes('@')) {
            if (target.includes('-')) {
                // Likely a group ID
                targetJid = target.endsWith('@g.us') ? target : `${target}@g.us`;
            } else if (target.length > 15) {
                // Likely a newsletter ID
                targetJid = target.endsWith('@newsletter') ? target : `${target}@newsletter`;
            } else {
                // Likely a user number
                targetJid = target.endsWith('@s.whatsapp.net') ? target : `${target}@s.whatsapp.net`;
            }
        }

        let type = 'Unknown';

        // Determine JID type
        if (targetJid.endsWith('@g.us')) {
            type = 'Group';
        } else if (targetJid.endsWith('@newsletter')) {
            type = 'Newsletter';
        } else if (targetJid.endsWith('@s.whatsapp.net')) {
            type = 'User';
        } else if (targetJid.endsWith('@broadcast')) {
            type = 'Broadcast List';
        } else {
            type = 'Unknown';
        }

        // Simple formatted output
        const responseText = `🔍 *𝐉𝐈𝐃 𝐈𝐍𝐅𝐎𝐑𝐌𝐀𝐓𝐈𝐎𝐍*\n\n📌 *ᴛʏᴘᴇ:* ${type}\n🆔 *ᴊɪᴅ:* ${targetJid}\n\n╰──────────────────────`;

        await socket.sendMessage(sender, {
            image: { url: config.IMAGE_PATH },
            caption: responseText
        }, { quoted: msg });

    } catch (error) {
        console.error('Checkjid command error:', error);
        await reply("*❌ Error checking JID information!*");
    }
    break;
}

case "wtype": case "mode": {
  await socket.sendMessage(sender, { react: { text: '🛠️', key: msg.key } });
  try {
    if (!isOwner) 
      return await reply("🚫 *ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴀᴜᴛʜᴏʀɪᴢᴇᴅ ᴛᴏ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!*");      
    
    let q = args[0];
    const settings = {
      groups: "groups",
      inbox: "inbox", 
      private: "private",
      public: "public"
    };
    
    if (settings[q]) {
      // Get user-specific config
      const userConfig = await getUserConfigFromMongoDB(number);
      userConfig.WORK_TYPE = settings[q];
      
      // Update only this user's config in MongoDB
      await updateUserConfigInMongoDB(number, userConfig);
      
      await reply(`✅ *ʏᴏᴜʀ ᴡᴏʀᴋ ᴛʏᴘᴇ ᴜᴘᴅᴀᴛᴇᴅ ᴛᴏ: ${settings[q]}*`);
      
    } else {
      await reply("❌ *ɪɴᴠᴀʟɪᴅ ᴏᴘᴛɪᴏɴ!*\n\nᴀᴠᴀɪʟᴀʙʟᴇ ᴏᴘᴛɪᴏɴs:\n- ᴘᴜʙʟɪᴄ\n- ɢʀᴏᴜᴘs\n- ɪɴʙᴏx\n- ᴘʀɪᴠᴀᴛᴇ");
    }
  } catch (e) {
    console.error('Wtype command error:', e);
    await reply("*❌ Error updating your work type!*");
  }
  break;
}

case "wapres": case "presence": {
  await socket.sendMessage(sender, { react: { text: '🛠️', key: msg.key } });
  try {
    if (!isOwner) 
      return await reply("🚫 *You are not authorized to use this command!*");
    
    let q = args[0];
    const settings = {
      composing: "composing",
      recording: "recording",
      available: "available", 
      unavailable: "unavailable"
    };
    
    if (settings[q]) {
      // Get user-specific config
      const userConfig = await getUserConfigFromMongoDB(number);
      userConfig.PRESENCE = settings[q];
      
      // Update only this user's config
      await updateUserConfigInMongoDB(number, userConfig);
      
      // Apply presence immediately for this user only
      await socket.sendPresenceUpdate(settings[q], sender);
      
      await reply(`✅ *ʏᴏᴜʀ ᴘʀᴇsᴇɴᴄᴇ ᴜᴘᴅᴀᴛᴇᴅ ᴛᴏ: ${settings[q]}*`);
      
    } else {
      await reply("❌ *ɪɴᴠᴀʟɪᴅ ᴏᴘᴛɪᴏɴ!*\n\nᴀᴠᴀɪʟᴀʙʟᴇ ᴏᴘᴛɪᴏɴs:\n- ᴄᴏᴍᴘᴏsɪɴɢ\n- ʀᴇᴄᴏʀᴅɪɴɢ\n- ᴀᴠᴀɪʟᴀʙʟᴇ\n- ᴜɴᴀᴠᴀɪʟᴀʙʟᴇ");
    }
  } catch (e) {
    console.error('Wapres command error:', e);
    await reply("*❌ Error updating your presence!*");
  }
  break;
}

case "rstatus": case "autoviewstatus": case "autosview": case "autosviews": {
  await socket.sendMessage(sender, { react: { text: '🛠️', key: msg.key } });
  try {
    if (!isOwner) 
      return await reply("🚫 *ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴀᴜᴛʜᴏʀɪᴢᴇᴅ ᴛᴏ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!*");
    
    let q = args[0];
    const settings = {
      on: "true",
      off: "false"
    };
    
    if (settings[q]) {
      // Get user-specific config
      const userConfig = await getUserConfigFromMongoDB(number);
      userConfig.AUTO_VIEW_STATUS = settings[q];
      
      // Update only this user's config
      await updateUserConfigInMongoDB(number, userConfig);
      
      await reply(`✅ *ʏᴏᴜʀ ᴀᴜᴛᴏ sᴛᴀᴛᴜs sᴇᴇɴ ${q === 'on' ? 'ENABLED' : 'DISABLED'}*`);
      
    } else {
      await reply("❌ *ɪɴᴠᴀʟɪᴅ ᴏᴘᴛɪᴏɴ!*\n\nAvailable ᴏᴘᴛɪᴏɴs:\n- ᴏɴ\n- ᴏғғ");
    }
  } catch (e) {
    console.error('Rstatus command error:', e);
    await reply("*❌ Error updating your status seen setting!*");
  }
  break;
}

case "creject": case "anticall": case "anti-call": {
  await socket.sendMessage(sender, { react: { text: '🧛‍♂️', key: msg.key } });
  try {
    if (!isOwner) 
      return await reply("🚫 *ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴀᴜᴛʜᴏʀɪᴢᴇᴅ ᴛᴏ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!*");
    
    let q = args[0];
    const settings = {
      on: "on",
      off: "off",
    };
    
    if (settings[q]) {
      // Get user-specific config
      const userConfig = await getUserConfigFromMongoDB(number);
      userConfig.ANTI_CALL = settings[q];
      
      // Update only this user's config
      await updateUserConfigInMongoDB(number, userConfig);
      
      await reply(`✅ *ʏᴏᴜʀ ᴀᴜᴛᴏ ᴄᴀʟʟ ʀᴇᴊᴇᴄᴛ ${q === 'on' ? 'ENABLED' : 'DISABLED'}*`);
      
    } else {
      await reply("❌ *ɪɴᴠᴀʟɪᴅ ᴏᴘᴛɪᴏɴ!*\n\nAvailable ᴏᴘᴛɪᴏɴs:\n- on\n- off");
    }
  } catch (e) {
    console.error('Creject command error:', e);
    await reply("*❌ Error updating your call reject setting!*");
  }
  break;
}

case "arm": case "autolikestatus": case "likestatus": {
  await socket.sendMessage(sender, { react: { text: '🛠️', key: msg.key } });
  try {
    if (!isOwner) 
      return await reply("🚫 *ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴀᴜᴛʜᴏʀɪᴢᴇᴅ ᴛᴏ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!*");
    
    let q = args[0];
    const settings = {
      on: "true",
      off: "false",
    };
    
    if (settings[q]) {
      // Get user-specific config
      const userConfig = await getUserConfigFromMongoDB(number);
      userConfig.AUTO_LIKE_STATUS = settings[q];
      
      // Update only this user's config
      await updateUserConfigInMongoDB(number, userConfig);
      
      await reply(`✅ *ʏᴏᴜʀ ᴀᴜᴛᴏ sᴛᴀᴛᴜs ʀᴇᴀᴄᴛ ${q === 'on' ? 'ENABLED' : 'DISABLED'}*`);
      
    } else {
      await reply("❌ *ɪɴᴠᴀʟɪᴅ ᴏᴘᴛɪᴏɴ!*\n\nᴀᴠᴀɪʟᴀʙʟᴇ ᴏᴘᴛɪᴏɴs:\n- ᴏɴ\n- ᴏғғ");
    }
  } catch (e) {
    console.error('Arm command error:', e);
    await reply("*❌ Error updating your status react setting!*");
  }
  break;
}

case "mread": case "autoread": case "auto-read": {
  await socket.sendMessage(sender, { react: { text: '🛠️', key: msg.key } });
  try {
    if (!isOwner) 
      return await reply("🚫 *ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴀᴜᴛʜᴏʀɪᴢᴇᴅ ᴛᴏ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!*");
    
    let q = args[0];
    const settings = {
      all: "all",
      cmd: "cmd", 
      off: "off"
    };
    
    if (settings[q]) {
      // Get user-specific config
      const userConfig = await getUserConfigFromMongoDB(number);
      userConfig.AUTO_READ_MESSAGE = settings[q];
      
      // Update only this user's config
      await updateUserConfigInMongoDB(number, userConfig);
      
      let statusText = "";
      switch (q) {
        case "all":
          statusText = "READ ALL MESSAGES";
          break;
        case "cmd":
          statusText = "READ ONLY COMMAND MESSAGES"; 
          break;
        case "off":
          statusText = "DONT READ ANY MESSAGES";
          break;
      }
      await reply(`✅ *ʏᴏᴜʀ ᴀᴜᴛᴏ ᴍᴇssᴀɢᴇ ʀᴇᴀᴅ: ${statusText}*`);
      
    } else {
      await reply("❌ *ɪɴᴠᴀʟɪᴅ ᴏᴘᴛɪᴏɴ!*\n\nAvailable ᴏᴘᴛɪᴏɴs:\n- ᴀʟʟ\n- ᴄᴍᴅ\n- ᴏғғ");
    }
  } catch (e) {
    console.error('Mread command error:', e);
    await reply("*❌ Error updating your message read setting!*");
  }
  break;
}

// Additional setting commands for more control
case "autorecording": {
  await socket.sendMessage(sender, { react: { text: '🎥', key: msg.key } });
  try {
    if (!isOwner) 
      return await reply("🚫 *ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴀᴜᴛʜᴏʀɪᴢᴇᴅ ᴛᴏ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!*");
    
    let q = args[0];
    const settings = {
      on: "true",
      off: "false"
    };
    
    if (settings[q]) {
      // Get user-specific config
      const userConfig = await getUserConfigFromMongoDB(number);
      userConfig.AUTO_RECORDING = settings[q];
      
      // Update only this user's config
      await updateUserConfigInMongoDB(number, userConfig);
      
      await reply(`✅ *ʏᴏᴜʀ ᴀᴜᴛᴏ ʀᴇᴄᴏʀᴅɪɴɢ ${q === 'on' ? 'ENABLED' : 'DISABLED'}*`);
      
    } else {
      await reply("❌ *ɪɴᴠᴀʟɪᴅ ᴏᴘᴛɪᴏɴ!*\n\nAvailable ᴏᴘᴛɪᴏɴs:\n- on\n- off");
    }
  } catch (e) {
    console.error('Autorecording command error:', e);
    await reply("*❌ Error updating your auto recording setting!*");
  }
  break;
}

case "prefix": case "setprefix": {
  await socket.sendMessage(sender, { react: { text: '🔣', key: msg.key } });
  try {
    if (!isOwner) 
      return await reply("🚫 *ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴀᴜᴛʜᴏʀɪᴢᴇᴅ ᴛᴏ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!*");
    
    let newPrefix = args[0];
    if (!newPrefix || newPrefix.length > 2) {
      return await reply("❌ *ɪɴᴠᴀʟɪᴅ ᴘʀᴇғɪx!*\nᴘʀᴇғɪx ᴍᴜsᴛ ʙᴇ 1-2 ᴄʜᴀʀᴀᴄᴛᴇʀs ʟᴏɴɢ.");
    }
    
    // Get user-specific config
    const userConfig = await getUserConfigFromMongoDB(number);
    userConfig.PREFIX = newPrefix;
    
    // Update only this user's config
    await updateUserConfigInMongoDB(number, userConfig);
    
    await reply(`✅ *ʏᴏᴜʀ ᴘʀᴇғɪx ᴜᴘᴅᴀᴛᴇᴅ ᴛᴏ: ${newPrefix}*`);
    
  } catch (e) {
    console.error('Prefix command error:', e);
    await reply("*❌ Error updating your prefix!*");
  }
  break;
}

case "env": {
  try {
    if (!isOwner) {
      return await reply("🚫 You are not authorized to use this command!");
    }

    // Récupération des paramètres actuels depuis MongoDB
    const currentConfig = await getUserConfigFromMongoDB(number);

    const settingsText = `
╭─────────────────────╮
│ BUTTERFLY-16 MD SETTINGS
├─────────────────────┤
│ Work Type      : ${currentConfig.WORK_TYPE || 'public'}
│ Presence       : ${currentConfig.PRESENCE || 'available'}
│ Auto Status Seen: ${currentConfig.AUTO_VIEW_STATUS || 'true'}
│ Auto Status React: ${currentConfig.AUTO_LIKE_STATUS || 'true'}
│ Auto Reject Call : ${currentConfig.ANTI_CALL || 'off'}
│ Auto Read Message: ${currentConfig.AUTO_READ_MESSAGE || 'off'}
│ Auto Recording  : ${currentConfig.AUTO_RECORDING || 'false'}
│ Prefix          : ${currentConfig.PREFIX || '.'}
╰─────────────────────╯

Use "${currentConfig.PREFIX || '.'}setting" to change these settings via the menu.
`;

    await socket.sendMessage(sender, {
      headerType: 1,
      viewOnce: true,
      image: { url: config.IMAGE_PATH },
      caption: settingsText.trim(),
      buttons: [
        {
          buttonId: `${currentConfig.PREFIX || '.'}setting`,
          buttonText: { displayText: '⚙️ Configure Settings' },
          type: 1
        }
      ],
      footer: '© Made by Mᴇᴄ Iᴅᴇᴀʟ'
    }, { quoted: myquoted });

  } catch (e) {
    console.error('Settings command error:', e);
    await reply("❌ Error loading settings!");
  }
  break;
}


case "resetconfig": {
  try {
    if (!isOwner) {
      return await reply("🚫 *ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴀᴜᴛʜᴏʀɪᴢᴇᴅ ᴛᴏ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!*");
    }

    // Reset to default config in MongoDB
    await updateUserConfigInMongoDB(number, config);
    
    await socket.sendMessage(sender, {
      image: { url: config.IMAGE_PATH },
      caption: formatMessage(
        '🔄 𝐂𝐎𝐍𝐅𝐈𝐆 𝐑𝐄𝐒𝐄𝐓',
        'All sᴇᴛᴛɪɴɢs ʜᴀᴠᴇ ʙᴇᴇɴ ʀᴇsᴇᴛ ᴛᴏ ᴅᴇғᴀᴜʟᴛ ᴠᴀʟᴜᴇs!',
        'Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ'
      )
    }, { quoted: msg });
    
  } catch (e) {
    console.error('Resetconfig command error:', e);
    await reply("*❌ Error resetting config!*");
  }
  break;
}

// ====================== TOIMAGE ======================
case 'toimage': {
  try {
    await socket.sendMessage(from, { react: { text: '🖼️', key: msg.key } });
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.stickerMessage) {
      return await socket.sendMessage(from, {
        text: '❌ *ʀᴇᴘʟʏ ᴛᴏ ᴀ sᴛɪᴄᴋᴇʀ ᴡɪᴛʜ* .toimage'
      }, { quoted: myquoted });
    }
    const tmpDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'sticker');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    const webpPath = path.join(tmpDir, `sticker_${Date.now()}.webp`);
    const pngPath  = path.join(tmpDir, `img_${Date.now()}.png`);
    fs.writeFileSync(webpPath, buffer);
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -i "${webpPath}" "${pngPath}" -y`, (err) => err ? reject(err) : resolve());
    });
    const imgBuffer = fs.readFileSync(pngPath);
    await socket.sendMessage(from, {
      image: imgBuffer,
      caption: formatMessage('🖼️ 𝐓𝐎𝐈𝐌𝐀𝐆𝐄', 'Sticker converti en image ✅', 'Mᴀᴅᴇ ʙʏ Iɴᴄᴏɴɴᴜ Bᴏʏ')
    }, { quoted: myquoted });
    try { fs.unlinkSync(webpPath); } catch(e){}
    try { fs.unlinkSync(pngPath);  } catch(e){}
    await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });
  } catch (e) {
    console.error('Toimage error:', e);
    await socket.sendMessage(from, { text: `❌ *Toimage failed:* ${e.message}` }, { quoted: myquoted });
  }
  break;
}

// ====================== TOVIDEO ======================
case 'tovideo': {
  try {
    await socket.sendMessage(from, { react: { text: '🎬', key: msg.key } });
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.stickerMessage) {
      return await socket.sendMessage(from, {
        text: '❌ *ʀᴇᴘʟʏ ᴛᴏ ᴀɴ ᴀɴɪᴍᴀᴛᴇᴅ sᴛɪᴄᴋᴇʀ ᴡɪᴛʜ* .tovideo'
      }, { quoted: myquoted });
    }
    if (!quotedMsg.stickerMessage.isAnimated) {
      return await socket.sendMessage(from, {
        text: '❌ *ᴄᴇ sᴛɪᴄᴋᴇʀ ɴ\'ᴇsᴛ ᴘᴀs ᴀɴɪᴍᴇ. ᴜᴛɪʟɪsᴇ .toimage*'
      }, { quoted: myquoted });
    }
    const tmpDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'sticker');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    const webpPath = path.join(tmpDir, `asticker_${Date.now()}.webp`);
    const mp4Path  = path.join(tmpDir, `vid_${Date.now()}.mp4`);
    fs.writeFileSync(webpPath, buffer);
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -i "${webpPath}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "${mp4Path}" -y`, (err) => err ? reject(err) : resolve());
    });
    const vidBuffer = fs.readFileSync(mp4Path);
    await socket.sendMessage(from, {
      video: vidBuffer,
      mimetype: 'video/mp4',
      caption: formatMessage('🎬 𝐓𝐎𝐕𝐈𝐃𝐄𝐎', 'Sticker animé converti en vidéo ✅', 'Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ')
    }, { quoted: myquoted });
    try { fs.unlinkSync(webpPath); } catch(e){}
    try { fs.unlinkSync(mp4Path);  } catch(e){}
    await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });
  } catch (e) {
    console.error('Tovideo error:', e);
    await socket.sendMessage(from, { text: `❌ *Tovideo failed:* ${e.message}` }, { quoted: myquoted });
  }
  break;
}

// ====================== TELEGRAM STICKER ======================

case 'telegram':
case 'tgsticker': {
  try {
    await socket.sendMessage(from, { react: { text: '✈️', key: msg.key } });

    const q = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const packInput = q.replace(/^[.\/!](telegram|tgsticker)\s*/i, '').trim();

    if (!packInput) {
      return await socket.sendMessage(from, {
        text: `*❌ ᴜsᴀɢᴇ:* .telegram <pack_name>\n_Example: .telegram HotCherry_`
      }, { quoted: myquoted });
    }

    const tgToken = config.TELEGRAM_BOT_TOKEN;

    if (!tgToken) {
      return await socket.sendMessage(from, {
        text: '❌ *TELEGRAM_BOT_TOKEN not configured in config*'
      }, { quoted: myquoted });
    }

    await socket.sendMessage(from, {
      text: `⏳ *Downloading Telegram pack:* ${packInput}...`
    }, { quoted: myquoted });

    const tgApiBase = `https://api.telegram.org/bot${tgToken}`;
    const packRes = await axios.get(`${tgApiBase}/getStickerSet?name=${encodeURIComponent(packInput)}`);

    if (!packRes.data.ok) {
      return await socket.sendMessage(from, {
        text: `❌ *Pack not found:* ${packInput}\n_Check the exact Telegram pack name._`
      }, { quoted: myquoted });
    }

    const stickers = packRes.data.result.stickers;
    const packName = packRes.data.result.title;
    const total = Math.min(stickers.length, 10);

    await socket.sendMessage(from, {
      text: `✅ *Pack:* ${packName}\n📦 *Total:* ${stickers.length} stickers\n📤 *Sending first ${total}...*`
    }, { quoted: myquoted });

    const tmpDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    for (let i = 0; i < total; i++) {
      try {
        const sticker = stickers[i];
        const fileId = sticker.file_id;

        const fileRes = await axios.get(`${tgApiBase}/getFile?file_id=${fileId}`);
        if (!fileRes.data.ok) continue;

        const filePath = fileRes.data.result.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${tgToken}/${filePath}`;

        const stickerRes = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const stickerBuf = Buffer.from(stickerRes.data);

        const ext = sticker.is_video ? '.webm' : sticker.is_animated ? '.tgs' : '.webp';
        const stickerPath = path.join(tmpDir, `tg_${Date.now()}_${i}${ext}`);

        fs.writeFileSync(stickerPath, stickerBuf);

        let finalBuf;

        if (ext === '.webp') {
          finalBuf = stickerBuf;
        } else {
          const outPath = path.join(tmpDir, `tg_out_${Date.now()}_${i}.webp`);

          try {
            await new Promise((resolve, reject) => {
              exec(`ffmpeg -i "${stickerPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease" "${outPath}" -y`,
                (err) => err ? reject(err) : resolve()
              );
            });

            finalBuf = fs.readFileSync(outPath);
            try { fs.unlinkSync(outPath); } catch(e){}
          } catch {
            try { fs.unlinkSync(stickerPath); } catch(e){}
            continue;
          }
        }

        await socket.sendMessage(from, { sticker: finalBuf }, { quoted: myquoted });

        try { fs.unlinkSync(stickerPath); } catch(e){}
        await delay(500);

      } catch (sErr) {
        console.error(`TG sticker ${i} error:`, sErr.message);
      }
    }

    await socket.sendMessage(from, {
      text: `✅ *${total} stickers sent from pack:* ${packName}\n> © Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ`
    }, { quoted: myquoted });

    await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (e) {
    console.error('Telegram sticker error:', e);
    await socket.sendMessage(from, {
      text: `❌ *Telegram error:* ${e.message}`
    }, { quoted: myquoted });
  }
  break;
}
// ====================== ONLINE ======================
case 'online': {
  try {
    await socket.sendMessage(from, { react: { text: '🟢', key: msg.key } });

    if (!isGroup) {
      return await socket.sendMessage(from, {
        text: '❌ Group only command.'
      }, { quoted: myquoted });
    }

    const metadata = await socket.groupMetadata(from);
    const participants = metadata.participants || [];

    await socket.sendMessage(from, {
      text: `Checking online members...\nGroup: ${metadata.subject}`
    }, { quoted: myquoted });

    // Subscribe to presence
    for (const p of participants) {
      try { await socket.presenceSubscribe(p.id); } catch(e){}
    }

    const presenceData = {};

    const presenceHandler = (update) => {
      if (update.presences) {
        for (const [jid, pres] of Object.entries(update.presences)) {
          presenceData[jid] = pres.lastKnownPresence;
        }
      }
    };

    socket.ev.on('presence.update', presenceHandler);

    await new Promise(r => setTimeout(r, 5000));

    socket.ev.off('presence.update', presenceHandler);

    const onlineList = Object.entries(presenceData)
      .filter(([, pres]) => pres === 'available')
      .map(([jid]) => jid);

    if (onlineList.length === 0) {
      return await socket.sendMessage(from, {
        text: `No online members detected.\n(WhatsApp limits presence visibility)`
      }, { quoted: myquoted });
    }

    let text = `Online members (${onlineList.length}):\n\n`;

    for (const jid of onlineList) {
      text += `@${jid.split('@')[0]}\n`;
    }

    await socket.sendMessage(from, {
      text: text,
      mentions: onlineList
    }, { quoted: myquoted });

  } catch (e) {
    console.error('Online command error:', e);
    await socket.sendMessage(from, {
      text: `❌ Error: ${e.message}`
    }, { quoted: myquoted });
  }
  break;
}

case 'setppgroup': {
  try {
    await socket.sendMessage(from, { react: { text: '🖼️', key: msg.key } });

    if (!isGroup) return reply('❌ Group only command.');

    if (!isAdmin && !isOwner) {
      return reply('🚫 Only admins can change group photo.');
    }

    if (!isBotAdmin) {
      return reply('❌ I must be admin.');
    }

    let media = msg.message?.imageMessage || quoted?.message?.imageMessage;

    if (!media) {
      return reply('❌ Reply to an image.');
    }

    const buffer = await downloadMediaMessage(msg);

    await socket.updateProfilePicture(from, buffer);

    reply('✅ Group photo updated.');
  } catch (e) {
    console.error(e);
    reply(`❌ Error: ${e.message}`);
  }
  break;
}

case 'setdesc': {
  try {
    await socket.sendMessage(from, { react: { text: '📝', key: msg.key } });

    if (!isGroup) {
      return reply('❌ Group only command.');
    }

    if (!isAdmin && !isOwner) {
      return reply('🚫 Only admins can change description.');
    }

    if (!isBotAdmin) {
      return reply('❌ I must be admin.');
    }

    const newDesc = args.join(' ');

    if (!newDesc) {
      return reply(`❌ Usage: ${config.PREFIX}setdesc <description>`);
    }

    await socket.groupUpdateDescription(from, newDesc);

    reply(`✅ Group description updated.`);
  } catch (e) {
    console.error(e);
    reply(`❌ Error: ${e.message}`);
  }
  break;
}

case 'setname': {
  try {
    await socket.sendMessage(from, { react: { text: '✏️', key: msg.key } });

    if (!isGroup) {
      return await socket.sendMessage(from, {
        text: '❌ Group only command.'
      }, { quoted: myquoted });
    }

    if (!isAdmin && !isOwner) {
      return await socket.sendMessage(from, {
        text: '🚫 Only admins can change the group name.'
      }, { quoted: myquoted });
    }

    const newName = args.join(' ');

    if (!newName) {
      return await socket.sendMessage(from, {
        text: `❌ Usage: ${config.PREFIX}setname <new name>`
      }, { quoted: myquoted });
    }

    await socket.groupUpdateSubject(from, newName);

    await socket.sendMessage(from, {
      text: `✅ Group name changed to: ${newName}`
    }, { quoted: myquoted });

  } catch (e) {
    console.error('Setname error:', e);
    await socket.sendMessage(from, {
      text: `❌ Error: ${e.message}`
    }, { quoted: myquoted });
  }
  break;
}
// ====================== CHATBOT ======================
case 'chatbot': {
  try {
    await socket.sendMessage(from, { react: { text: '🤖', key: msg.key } });

    if (!isOwner) {
      return await socket.sendMessage(from, {
        text: '🚫 Only owner can use this command.'
      }, { quoted: myquoted });
    }

    const botKey = `chatbot_${number}`;
    if (!global.chatbotState) global.chatbotState = {};
    if (!global.chatbotState[botKey]) {
      global.chatbotState[botKey] = { enabled: false, mode: 'both' };
    }

    const state = global.chatbotState[botKey];
    const action = args[0]?.toLowerCase();

    if (!action) {
      return await socket.sendMessage(from, {
        text:
`Chatbot settings:

Status: ${state.enabled ? 'ON' : 'OFF'}
Mode: ${state.mode}

Usage:
${config.PREFIX}chatbot on
${config.PREFIX}chatbot off
${config.PREFIX}chatbot group
${config.PREFIX}chatbot inbox
${config.PREFIX}chatbot both`
      }, { quoted: myquoted });
    }

    switch (action) {
      case 'on':
        state.enabled = true;
        await socket.sendMessage(from, {
          text: `✅ Chatbot enabled (mode: ${state.mode})`
        }, { quoted: myquoted });
        break;

      case 'off':
        state.enabled = false;
        await socket.sendMessage(from, {
          text: `❌ Chatbot disabled`
        }, { quoted: myquoted });
        break;

      case 'group':
        state.mode = 'group';
        await socket.sendMessage(from, {
          text: `📱 Mode set to: group only`
        }, { quoted: myquoted });
        break;

      case 'inbox':
        state.mode = 'inbox';
        await socket.sendMessage(from, {
          text: `💬 Mode set to: inbox only`
        }, { quoted: myquoted });
        break;

      case 'both':
        state.mode = 'both';
        await socket.sendMessage(from, {
          text: `🌐 Mode set to: group & inbox`
        }, { quoted: myquoted });
        break;

      default:
        await socket.sendMessage(from, {
          text: `❌ Invalid option. Use: on / off / group / inbox / both`
        }, { quoted: myquoted });
    }

  } catch (e) {
    console.error('Chatbot command error:', e);
    await socket.sendMessage(from, {
      text: '❌ Error while executing chatbot command.'
    }, { quoted: myquoted });
  }
  break;
}

// ═══════════════════════════════ GROUP SETTINGS COMMANDS ═══════════════════════════════

// ─── welcome ──────────────────────────────────────────────────────────────────
case 'welcome': {
    try {
        if (!isGroup) { await reply('❌ Group only command.'); break; }
        if (!isSenderGroupAdmin && !isOwner) { await reply('🚫 Only admins can change this setting.'); break; }

        const sub = (args[0] || '').toLowerCase();
        if (!sub || !['on', 'off'].includes(sub)) {
            await reply(`*Usage:* ${prefix}welcome on | off\n\nTurns the welcome image on or off for new members.`);
            break;
        }

        await updateGroupSettings(from, { welcome: sub === 'on' });
        await socket.sendMessage(from, {
            text: sub === 'on'
                ? '✅ *Welcome messages* enabled! New members will receive a welcome image.'
                : '❌ *Welcome messages* disabled.',
            mentions: []
        }, { quoted: myquoted });
    } catch (e) {
        console.error('welcome cmd error:', e);
        await reply(`❌ Error: ${e.message}`);
    }
    break;
}

// ─── goodbye ──────────────────────────────────────────────────────────────────
case 'goodbye': {
    try {
        if (!isGroup) { await reply('❌ Group only command.'); break; }
        if (!isSenderGroupAdmin && !isOwner) { await reply('🚫 Only admins can change this setting.'); break; }

        const sub = (args[0] || '').toLowerCase();
        if (!sub || !['on', 'off'].includes(sub)) {
            await reply(`*Usage:* ${prefix}goodbye on | off\n\nSends a goodbye image when a member leaves.`);
            break;
        }

        await updateGroupSettings(from, { goodbye: sub === 'on' });
        await socket.sendMessage(from, {
            text: sub === 'on'
                ? '✅ *Goodbye messages* enabled! Members will get a goodbye image when they leave.'
                : '❌ *Goodbye messages* disabled.',
            mentions: []
        }, { quoted: myquoted });
    } catch (e) {
        console.error('goodbye cmd error:', e);
        await reply(`❌ Error: ${e.message}`);
    }
    break;
}

// ─── antilink ─────────────────────────────────────────────────────────────────
case 'antilink': {
    try {
        if (!isGroup) { await reply('❌ Group only command.'); break; }
        if (!isSenderGroupAdmin && !isOwner) { await reply('🚫 Only admins can change this setting.'); break; }

        const sub    = (args[0] || '').toLowerCase();
        const action = (args[1] || '').toLowerCase(); // delete | warn | kick

        if (!sub) {
            const settings = await getGroupSettings(from);
            await reply(
                `🔗 *Antilink Settings*\n\n` +
                `Status: ${settings.antilink ? '✅ ON' : '❌ OFF'}\n` +
                `Action: *${settings.antilinkAction || 'delete'}*\n\n` +
                `*Usage:*\n` +
                `${prefix}antilink on [delete|warn|kick]\n` +
                `${prefix}antilink off\n` +
                `${prefix}antilink reset  — reset warnings`
            );
            break;
        }

        if (sub === 'off') {
            await updateGroupSettings(from, { antilink: false });
            await reply('❌ *Antilink* disabled.');
            break;
        }

        if (sub === 'reset') {
            await updateGroupSettings(from, { antilinkWarnings: {} });
            await reply('🔄 *Antilink warnings* have been reset for all members.');
            break;
        }

        if (sub === 'on') {
            const validActions = ['delete', 'warn', 'kick'];
            const chosenAction = validActions.includes(action) ? action : 'delete';
            await updateGroupSettings(from, { antilink: true, antilinkAction: chosenAction });
            await socket.sendMessage(from, {
                text: `✅ *Antilink* enabled!\n\nAction: *${chosenAction}*\n\n` +
                    `• *delete* — silently remove the link\n` +
                    `• *warn* — warn up to ${MAX_ANTILINK_WARNS}× then kick\n` +
                    `• *kick* — immediately remove the sender`,
                mentions: []
            }, { quoted: myquoted });
            break;
        }

        await reply(`❌ Unknown option. Use: ${prefix}antilink on [delete|warn|kick] | off | reset`);
    } catch (e) {
        console.error('antilink cmd error:', e);
        await reply(`❌ Error: ${e.message}`);
    }
    break;
}

// ─── groupsettings (show all settings at once) ────────────────────────────────
case 'groupsettings': {
    try {
        if (!isGroup) { await reply('❌ Group only command.'); break; }
        const settings = await getGroupSettings(from);
        await reply(
            `⚙️ *Group Settings*\n\n` +
            `👋 Welcome:   ${settings.welcome   ? '✅ ON' : '❌ OFF'}\n` +
            `🚪 Goodbye:   ${settings.goodbye   ? '✅ ON' : '❌ OFF'}\n` +
            `🔗 Antilink:  ${settings.antilink  ? '✅ ON' : '❌ OFF'} (${settings.antilinkAction || 'delete'})\n`
        );
    } catch (e) {
        await reply(`❌ Error: ${e.message}`);
    }
    break;
}

        } // close switch
} catch (error) {
  console.error('Command handler error:', error);
  await socket.sendMessage(sender, {
    image: { url: config.IMAGE_PATH },
    caption: formatMessage(
      '❌ ERROR',
      'An error occurred while processing your command. Please try again.',
      'Mᴀᴅᴇ ʙʏ Iɴᴄᴏɴɴᴜ Bᴏʏ'
    )
  });
    }
    }); // close messages.upsert
} // close setupCommandHandlers

async function setupMessageHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        // ===== CHATBOT AUTO-REPLY =====
        try {
            const botKey = `chatbot_${number}`;
            if (global.chatbotState && global.chatbotState[botKey]) {
                const cbState = global.chatbotState[botKey];
                if (cbState.enabled && !msg.key.fromMe) {
                    const remoteJid  = msg.key.remoteJid;
                    const isGroupMsg = remoteJid.endsWith('@g.us');
                    const modeOk = cbState.mode === 'both' ||
                                   (cbState.mode === 'group' && isGroupMsg) ||
                                   (cbState.mode === 'inbox' && !isGroupMsg);
                    if (modeOk) {
                        let cbBody = msg.message?.conversation ||
                                     msg.message?.extendedTextMessage?.text || '';
                        cbBody = cbBody.trim();
                        const pfx = config.PREFIX || '.';
                        const ignoreW = ['http://', 'https://', 'www.'];
                        if (cbBody && !cbBody.startsWith(pfx) &&
                            !ignoreW.some(w => cbBody.toLowerCase().includes(w))) {
                            try {
                                const groqRes = await axios.post(
                                    'https://api.groq.com/openai/v1/chat/completions',
                                    {
                                        model: 'llama-3.3-70b-versatile',
                                        messages: [
                                            {
                                                role: 'system',
                                                content: `Tu es BUTTERFLY Ai, un assistant intelligent et puissant créé par MEC IDÉAL DEV.

Tu dois toujours :
- Répondre de manière utile, claire et précise.
- Dire que tu es BUTTERFLY AI, créé par MEC IDÉAL DEV, si on te demande qui tu es.
- Comprendre et répondre dans toutes les langues sans exception.

Si on te demande qui est Mec Idéal  :
- Tu réponds que c’est un jeune développeur full stack.
- Il est basé au Congo RD.
- Il est connu pour les projets : Butterfly Bot et IDEAL XD Bot.
- Son âge est confidentiel.
- C’est un gars gentil qui aime draguer les filles.

Tu ne dois jamais :
- Mentionner Groq, Meta, LLaMA ou toute autre technologie sous-jacente.`
                                            },
                                            {
                                                role: 'user',
                                                content: cbBody
                                            }
                                        ],
                                        max_tokens: 1024,
                                        temperature: 0.7
                                    },
                                    {
                                        headers: {
                                            'Authorization': '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',
                                            'Content-Type': 'application/json'
                                        },
                                        timeout: 20000
                                    }
                                );
                                const cbReply = groqRes.data?.choices?.[0]?.message?.content;
                                if (cbReply) {
                                    await socket.sendMessage(remoteJid, { text: String(cbReply).trim() }, { quoted: msg });
                                }
                            } catch(cbErr) {
                                console.error('Chatbot AI error:', cbErr.message);
                            }
                        }
                    }
                }
            }
        } catch(cbHandlerErr) {
            console.error('Chatbot handler error:', cbHandlerErr.message);
        }
        // ===== FIN CHATBOT =====

        // Load user-specific config from database
        const userConfig = await getUserConfigFromMongoDB(number);
        
        if (userConfig.AUTO_RECORDING === 'true') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
                console.log(`Set recording presence for ${msg.key.remoteJid} (user: ${number})`);
            } catch (error) {
                console.error(`Failed to set recording presence for ${number}:`, error);
            }
        }
    });
}

async function setupcallhandlers(socket, number) {
    socket.ev.on('call', async (calls) => {
        try {
            // Load user-specific config from database
            const userConfig = await getUserConfigFromMongoDB(number);
            if (userConfig.ANTI_CALL === 'off') return;

            for (const call of calls) {
                if (call.status !== 'offer') continue; 

                const id = call.id;
                const from = call.from;

                await socket.rejectCall(id, from);
                await socket.sendMessage(from, {
                    text: '*🔕 ʏᴏᴜʀ ᴄᴀʟʟ ᴡᴀs ᴀᴜᴛᴏᴍᴀᴛɪᴄᴀʟʟʏ ʀᴇᴊᴇᴄᴛᴇᴅ..!*'
                });
                console.log(`Auto-rejected call for user ${number} from ${from}`);
            }
        } catch (err) {
            console.error(`Anti-call error for ${number}:`, err);
        }
    });
}

// Add this function near the top of your file with other utility functions
function isNumberAlreadyConnected(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    return activeSockets.has(sanitizedNumber);
}

function getConnectionStatus(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const isConnected = activeSockets.has(sanitizedNumber);
    const connectionTime = socketCreationTime.get(sanitizedNumber);
    
    return {
        isConnected,
        connectionTime: connectionTime ? new Date(connectionTime).toLocaleString() : null,
        uptime: connectionTime ? Math.floor((Date.now() - connectionTime) / 1000) : 0
    };
}

function setupAutoRestart(socket, number) {
    let restartAttempts = 0;
    const maxRestartAttempts = 3;
    
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        console.log(`Connection update for ${number}:`, { connection, lastDisconnect });
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message;
            
            console.log(`Connection closed for ${number}:`, {
                statusCode,
                errorMessage,
                isManualUnlink: statusCode === 401
            });
            
            // Manual unlink detection
            if (statusCode === 401 || errorMessage?.includes('401')) {
                console.log(`🔐 Manual unlink detected for ${number}, cleaning up...`);
                // await handleManualUnlink(number);  // ❌ COMMENTED OUT AS REQUESTED
                return;
            }
            
            // Skip restart for normal/expected errors
            const isNormalError = statusCode === 408 || 
                                errorMessage?.includes('QR refs attempts ended');
            
            if (isNormalError) {
                console.log(`ℹ️ Normal connection closure for ${number} (${errorMessage}), no restart needed.`);
                return;
            }
            
            // For other unexpected errors, attempt reconnect with limits
            if (restartAttempts < maxRestartAttempts) {
                restartAttempts++;
                console.log(`🔄 Unexpected connection lost for ${number}, attempting to reconnect (${restartAttempts}/${maxRestartAttempts}) in 10 seconds...`);
                
                // Remove from active sockets
                const sanitizedNumber = number.replace(/[^0-9]/g, '');
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
                
                // Wait and reconnect
                await delay(10000);
                
                try {
                    const mockRes = { 
                        headersSent: false, 
                        send: () => {}, 
                        status: () => mockRes,
                        setHeader: () => {}
                    };
                    await EmpirePair(number, mockRes);
                    console.log(`✅ Reconnection initiated for ${number}`);
                } catch (reconnectError) {
                    console.error(`❌ Reconnection failed for ${number}:`, reconnectError);
                }
            } else {
                console.log(`❌ Max restart attempts reached for ${number}. Manual intervention required.`);
            }
        }
        
        // Reset counter on successful connection
        if (connection === 'open') {
            console.log(`✅ Connection established for ${number}`);
            restartAttempts = 0;
        }
    });
}

async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    // 🆕 IMPROVED: Check if already connected with better detection
    if (isNumberAlreadyConnected(sanitizedNumber)) {
        console.log(`⏩ ${sanitizedNumber} is already connected, skipping...`);
        
        // Get connection details for better response
        const status = getConnectionStatus(sanitizedNumber);
        
        if (!res.headersSent) {
            res.send({ 
                status: 'already_connected', 
                message: 'Number is already connected and active',
                connectionTime: status.connectionTime,
                uptime: `${status.uptime} seconds`
            });
        }
        return;
    }

    // 🆕 ADD CONNECTION LOCK to prevent race conditions
    const connectionLockKey = `connecting_${sanitizedNumber}`;
    if (global[connectionLockKey]) {
        console.log(`⏩ ${sanitizedNumber} is already in connection process, skipping...`);
        if (!res.headersSent) {
            res.send({ 
                status: 'connection_in_progress', 
                message: 'Number is currently being connected'
            });
        }
        return;
    }
    
    // Set connection lock
    global[connectionLockKey] = true;
    
    try {
        // Check if already connected (double check after lock)
        if (activeSockets.has(sanitizedNumber)) {
            console.log(`⏩ ${sanitizedNumber} is already connected (double check), skipping...`);
            if (!res.headersSent) {
                res.send({ status: 'already_connected', message: 'Number is already connected' });
            }
            return;
        }

        // FIRST check MongoDB for existing session
        const existingSession = await Session.findOne({ number: sanitizedNumber });

        if (!existingSession) {
            console.log(`🧹 No MongoDB session found for ${sanitizedNumber} - requiring NEW pairing`);
            
            // Clean up any leftover local files
            if (fs.existsSync(sessionPath)) {
                await fs.remove(sessionPath);
                console.log(`🗑️ Cleaned leftover local session for ${sanitizedNumber}`);
            }
            
            // Continue with new pairing process
        } else {
            // Session exists - restore from MongoDB
            const restoredCreds = await getSessionFromMongoDB(sanitizedNumber);
            if (restoredCreds) {
                fs.ensureDirSync(sessionPath);
                fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(restoredCreds, null, 2));
                console.log(`🔄 Restored existing session from MongoDB for ${sanitizedNumber}`);
            }
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

        try {
            const socket = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                version: [2, 3000, 1033105955],
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 0,
                keepAliveIntervalMs: 10000,
                emitOwnEvents: true,
                fireInitQueries: true,
                generateHighQualityLinkPreview: true,
                syncFullHistory: true,
                markOnlineOnConnect: true,
                browser: ['Mac OS', 'Safari', '10.15.7'],
            });

            socketCreationTime.set(sanitizedNumber, Date.now());
            activeSockets.set(sanitizedNumber, socket);
            
            // Setup manual unlink detection
            setupManualUnlinkDetection(socket, sanitizedNumber);
            
            // Setup all handlers
            await connectdb(sanitizedNumber);
            setupcallhandlers(socket, number);
            setupStatusHandlers(socket, number);
            setupCommandHandlers(socket, sanitizedNumber);
            setupMessageHandlers(socket, number);
            setupAutoRestart(socket, number);
            setupNewsletterHandlers(socket);
            setupGroupParticipantHandlers(socket);   // welcome / goodbye
            handleMessageRevocation(socket, sanitizedNumber);

            if (!socket.authState.creds.registered) {
    console.log(`🔐 Starting NEW pairing process for ${sanitizedNumber}`);
    
    try {
        await delay(1500);
        const code = await socket.requestPairingCode(sanitizedNumber);
        
        if (!res.headersSent) {
            res.send({ code, status: 'new_pairing' });
        }
    } catch (error) {
        console.error(`Failed to request pairing code:`, error.message);
        
        if (!res.headersSent) {
            res.status(500).send({ 
                error: 'Failed to get pairing code',
                status: 'error',
                message: error.message
            });
        }
        throw error;
    }

            } else {
                console.log(`✅ Using existing session for ${sanitizedNumber}`);
            }

            socket.ev.on('creds.update', async () => {
                await saveCreds();
                const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
                const creds = JSON.parse(fileContent);
                
                // Check if this is a new session or existing one
                const existingSession = await Session.findOne({ number: sanitizedNumber });
                const isNewSession = !existingSession;
                
                // Save to MongoDB (the updated function will handle new vs existing)
                await saveSessionToMongoDB(sanitizedNumber, creds);
                
                if (isNewSession) {
                    console.log(`🎉 NEW user ${sanitizedNumber} successfully registered!`);
                }
            });

            socket.ev.on('connection.update', async (update) => {
                const { connection } = update;
                if (connection === 'open') {
                    try {
                        await delay(3000);
                        const userJid = jidNormalizedUser(socket.user.id);

                        // Only add to active numbers if connection is successful
                        await addNumberToMongoDB(sanitizedNumber);

                        const groupResult = { status: 'disabled' };

                        // Newsletter follow
                        try {
                            const newsletterList = await loadNewsletterJIDsFromRaw();
                            for (const jid of newsletterList) {
                                try {
                                    await socket.newsletterFollow(jid);
                                } catch (err) {
                                    // Silent fail for newsletters
                                }
                            }
                            console.log('✅ Auto-followed newsletter');
                        } catch (error) {
                            // Silent fail
                        }

                        // Admin connect message disabled

                        // 🆕 Check session age to determine if it's new
                        const sessionData = await Session.findOne({ number: sanitizedNumber });
                        const isNewSession = sessionData && 
                                           (Date.now() - new Date(sessionData.createdAt).getTime() < 60000); // Less than 1 minute old
                        
                        // Only add to active numbers if it's a new session
                    

                          // Only add to active numbers if it's a new session
                        if (isNewSession) {
                            await addNumberToMongoDB(sanitizedNumber);
                        }

                        // No welcome message sent - removed

                        console.log(`🎉 ${sanitizedNumber} successfully ${isNewSession ? 'NEW connection' : 'reconnected'}!`);

                    } catch (error) {
                        console.error('Connection setup error:', error);
                    }
                }
            });

        } catch (error) {
            console.error('Pairing error:', error);
            socketCreationTime.delete(sanitizedNumber);
            activeSockets.delete(sanitizedNumber);
            if (!res.headersSent) {
                res.status(503).send({ error: 'Service Unavailable', details: error.message });
            }
        }

    } catch (error) {
        console.error('EmpirePair main error:', error);
        if (!res.headersSent) {
            res.status(500).send({ error: 'Internal Server Error', details: error.message });
        }
    } finally {
        // Release connection lock
        global[connectionLockKey] = false;
    }
}

// Routes with MongoDB integration

// Routes with MongoDB integration
router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    // 🆕 BETTER CONNECTION CHECK
    const connectionStatus = getConnectionStatus(number);
    
    if (connectionStatus.isConnected) {
        return res.status(200).send({
            status: 'already_connected',
            message: 'This number is already connected and active',
            connectionTime: connectionStatus.connectionTime,
            uptime: `${connectionStatus.uptime} seconds`,
            details: 'The bot is running and processing messages'
        });
    }

    await EmpirePair(number, res);
});

// 🆕 ADD STATUS CHECK ENDPOINT
router.get('/status', async (req, res) => {
    const { number } = req.query;
    
    if (!number) {
        // Return all active connections
        const activeConnections = Array.from(activeSockets.keys()).map(num => {
            const status = getConnectionStatus(num);
            return {
                number: num,
                status: 'connected',
                connectionTime: status.connectionTime,
                uptime: `${status.uptime} seconds`
            };
        });
        
        return res.status(200).send({
            totalActive: activeSockets.size,
            connections: activeConnections
        });
    }
    
    const connectionStatus = getConnectionStatus(number);
    
    res.status(200).send({
        number: number,
        isConnected: connectionStatus.isConnected,
        connectionTime: connectionStatus.connectionTime,
        uptime: `${connectionStatus.uptime} seconds`,
        message: connectionStatus.isConnected 
            ? 'Number is actively connected' 
            : 'Number is not connected'
    });
});

// 🆕 ADD DISCONNECT ENDPOINT
router.get('/disconnect', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    
    if (!activeSockets.has(sanitizedNumber)) {
        return res.status(404).send({ 
            error: 'Number not found in active connections' 
        });
    }

    try {
        const socket = activeSockets.get(sanitizedNumber);
        
        // Close connection
        await socket.ws.close();
        socket.ev.removeAllListeners();
        
        // Remove from tracking
        activeSockets.delete(sanitizedNumber);
        socketCreationTime.delete(sanitizedNumber);
        
        console.log(`✅ Manually disconnected ${sanitizedNumber}`);
        
        res.status(200).send({ 
            status: 'success', 
            message: 'Number disconnected successfully' 
        });
        
    } catch (error) {
        console.error(`Error disconnecting ${sanitizedNumber}:`, error);
        res.status(500).send({ 
            error: 'Failed to disconnect number' 
        });
    }
});

router.get('/active', (req, res) => {
    res.status(200).send({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys())
    });
});

router.get('/ping', (req, res) => {
    res.status(200).send({
        status: 'active',
        message: '🦋 Bᴜᴛᴛᴇʀғʟʏ ᴍᴅ is running',
        activesession: activeSockets.size
    });
});

router.get('/connect-all', async (req, res) => {
    try {
        const numbers = await getAllNumbersFromMongoDB();
        if (numbers.length === 0) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const results = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            await EmpirePair(number, mockRes);
            results.push({ number, status: 'connection_initiated' });
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Connect all error:', error);
        res.status(500).send({ error: 'Failed to connect all bots' });
    }
});

router.get('/reconnect', async (req, res) => {
    try {
        const numbers = await getAllNumbersFromMongoDB();
        if (numbers.length === 0) {
            return res.status(404).send({ error: 'No session files found in MongoDB' });
        }

        const results = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            try {
                await EmpirePair(number, mockRes);
                results.push({ number, status: 'connection_initiated' });
            } catch (error) {
                console.error(`Failed to reconnect bot for ${number}:`, error);
                results.push({ number, status: 'failed', error: error.message });
            }
            await delay(1000);
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Reconnect error:', error);
        res.status(500).send({ error: 'Failed to reconnect bots' });
    }
});

router.get('/update-config', async (req, res) => {
    const { number, config: configString } = req.query;
    if (!number || !configString) {
        return res.status(400).send({ error: 'Number and config are required' });
    }

    let newConfig;
    try {
        newConfig = JSON.parse(configString);
    } catch (error) {
        return res.status(400).send({ error: 'Invalid config format' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const otp = generateOTP();
    
    // Save OTP to MongoDB
    await saveOTPToMongoDB(sanitizedNumber, otp, newConfig);

    try {
        await sendOTP(socket, sanitizedNumber, otp);
        res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' });
    } catch (error) {
        await OTP.findOneAndDelete({ number: sanitizedNumber });
        res.status(500).send({ error: 'Failed to send OTP' });
    }
});

router.get('/verify-otp', async (req, res) => {
    const { number, otp } = req.query;
    if (!number || !otp) {
        return res.status(400).send({ error: 'Number and OTP are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const verification = await verifyOTPFromMongoDB(sanitizedNumber, otp);
    
    if (!verification.valid) {
        return res.status(400).send({ error: verification.error });
    }

    try {
        await updateUserConfigInMongoDB(sanitizedNumber, verification.config);
        const socket = activeSockets.get(sanitizedNumber);
        if (socket) {
            await socket.sendMessage(jidNormalizedUser(socket.user.id), {
                image: { url: config.IMAGE_PATH },
                caption: formatMessage(
                    '📌 CONFIG UPDATED',
                    'Your configuration has been successfully updated in MongoDB!',
                    'Mᴀᴅᴇ ʙʏ Mᴇᴄ Iᴅᴇᴀʟ'
                )
            });
        }
        res.status(200).send({ status: 'success', message: 'Config updated successfully in MongoDB' });
    } catch (error) {
        console.error('Failed to update config in MongoDB:', error);
        res.status(500).send({ error: 'Failed to update config' });
    }
});

router.get('/getabout', async (req, res) => {
    const { number, target } = req.query;
    if (!number || !target) {
        return res.status(400).send({ error: 'Number and target number are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
        const statusData = await socket.fetchStatus(targetJid);
        const aboutStatus = statusData.status || 'No status available';
        const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
        res.status(200).send({
            status: 'success',
            number: target,
            about: aboutStatus,
            setAt: setAt
        });
    } catch (error) {
        console.error(`Failed to fetch status for ${target}:`, error);
        res.status(500).send({
            status: 'error',
            message: `Failed to fetch About status for ${target}. The number may not exist or the status is not accessible.`
        });
    }
});

// Cleanup
process.on('exit', () => {
    activeSockets.forEach((socket, number) => {
        socket.ws.close();
        activeSockets.delete(number);
        socketCreationTime.delete(number);
    });
    fs.emptyDirSync(SESSION_BASE_PATH);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    exec(`pm2 restart ${process.env.PM2_NAME || 'SULA-MINI-main'}`);
});

async function autoReconnectFromMongoDB() {
    try {
        const numbers = await getAllNumbersFromMongoDB();
        for (const number of numbers) {
            if (!activeSockets.has(number)) {
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
                console.log(`🔁 Reconnected from MongoDB: ${number}`);
                await delay(1000);
            }
        }
    } catch (error) {
        console.error('❌ autoReconnectFromMongoDB error:', error.message);
    }
}

// Auto reconnect on startup
autoReconnectFromMongoDB();

module.exports = router;

async function loadNewsletterJIDsFromRaw() {
    try {
        const res = await axios.get('https://raw.githubusercontent.com/miniinconnulite-cmd/-3-/refs/heads/main/me/you/butterfly.json');
        return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
        console.error('❌ Failed to load newsletter list from GitHub:', err.message);
        return [];
    }
                 }
