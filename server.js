require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const WA_TOKEN = process.env.WA_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// 1. Verifikasi Webhook dari Meta (Hanya dipanggil sekali saat setup)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('Webhook terverifikasi oleh Meta!');
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    }
});

// 2. Menerima Pesan Masuk dari WhatsApp
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;

        // Pastikan ini adalah event pesan dari WhatsApp
        if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            const messageObj = body.entry[0].changes[0].value.messages[0];
            const fromNumber = messageObj.from; // Nomor pengirim
            const messageText = messageObj.text?.body?.trim(); // Isi pesan teks

            // Logika Deteksi Perintah /status
            if (messageText && messageText.toLowerCase() === '/status') {
                console.log(`Menerima perintah /status dari: ${fromNumber}`);
                
                // Beritahu pengguna kalau bot sedang mengambil data
                await sendWhatsAppMessage(fromNumber, "⏳ Memeriksa status executor dari ScriptBlox dan Rscripts...");

                // Ambil data status executor
                const statusMessage = await getExecutorStatus();

                // Kirim hasil akhir status executor
                await sendWhatsAppMessage(fromNumber, statusMessage);
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error('Error saat memproses webhook:', error.message);
        res.sendStatus(200); // Selalu kembalikan 200 ke Meta agar webhook tidak dimatikan otomatis
    }
});

// 3. Fungsi Mengambil Data dari ScriptBlox dan Rscripts API
async function getExecutorStatus() {
    let responseText = "🤖 *STATUS EXECUTOR ROBLOX INTERNASIONAL*\n\n";

    // --- FETCH DARI SCRIPTBLOX ---
    try {
        const sbResponse = await axios.get('https://scriptblox.com/api/executor/list');
        const sbExecutors = sbResponse.data; // Berupa Array langsung berdasarkan dokumentasi terbaru

        if (Array.isArray(sbExecutors) && sbExecutors.length > 0) {
            responseText += "🌐 *[ScriptBlox Data]:*\n";
            // Kita batasi mengambil 5 executor teratas agar pesan tidak terlalu panjang
            sbExecutors.slice(0, 5).forEach(exec => {
                const statusIcon = exec.patched ? "❌ Patched" : "✅ Active";
                responseText += `• *${exec.name}* (${exec.platform || 'Unknown'})\n  Status: ${statusIcon}\n  Version: ${exec.version || '-'}\n\n`;
            });
        }
    } catch (error) {
        console.error("Gagal mengambil data dari ScriptBlox:", error.message);
        responseText += "❌ Gagal memuat data dari ScriptBlox.\n\n";
    }

    // --- FETCH DARI RSCRIPTS (Mengambil contoh executor yang teruji dari skrip tren) ---
    try {
        const rsResponse = await axios.get('https://rscripts.net/api/v2/trending');
        const trendingData = rsResponse.data.success;

        if (Array.isArray(trendingData) && trendingData.length > 0) {
            responseText += "🛡️ *[Rscripts Tested Executors]:*\n";
            
            // Mengumpulkan nama executor unik yang sering muncul di list testedExecutors skrip tren
            let testedList = [];
            trendingData.forEach(item => {
                if (item.script?.testedExecutors) {
                    item.script.testedExecutors.forEach(exec => {
                        if (!testedList.some(e => e.title === exec.title)) {
                            testedList.push({
                                title: exec.title,
                                platforms: exec.platforms ? exec.platforms.join(', ') : 'Android'
                            });
                        }
                    });
                }
            });

            if (testedList.length > 0) {
                // Tampilkan maksimal 5 executor teruji terbaru
                testedList.slice(0, 5).forEach(exec => {
                    responseText += `• *${exec.title}* [${exec.platforms.toUpperCase()}]\n  Status: Teruji Aktif di Skrip Tren Terbaru\n\n`;
                });
            } else {
                responseText += "• Tidak ada data executor terbaru.\n\n";
            }
        }
    } catch (error) {
        console.error("Gagal mengambil data dari Rscripts:", error.message);
        responseText += "❌ Gagal memuat data dari Rscripts.\n";
    }

    responseText += "_____ \n_Update otomatis via API_";
    return responseText;
}

// 4. Fungsi Mengirim Pesan Balasan Menggunakan WhatsApp Cloud API Resmi
async function sendWhatsAppMessage(toNumber, text) {
    const url = `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`;
    
    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toNumber,
        type: "text",
        text: { body: text }
    };

    try {
        await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${WA_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error("Gagal mengirim pesan WhatsApp:", error.response?.data || error.message);
    }
}

// Jalankan Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server Bot WhatsApp berjalan di port ${PORT}`);
});
